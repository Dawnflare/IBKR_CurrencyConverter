import { parseAmount } from '../core/numbers';
import { DEFAULT_SETTINGS, MINUTE, LensError, type ErrorCode, type RateResult, type Settings } from '../core/types';
import type { ViewStatus } from '../core/messages';
import type { Candidate, Region, SiteAdapter, SiteView } from '../site/adapter';
import { createAnnotation, createRegionStatus, OWNED, updateAnnotation, updateRegionStatus, type Annotation, type RegionStatus } from './presentation';
import { positionOverlay } from './overlay';

interface Field { candidate: Candidate; amount: number; annotation: Annotation; }
export interface EngineBridge {
  rate: (generation: number) => Promise<RateResult>;
  release: (generation: number) => void;
}
export class LensEngine {
  private settings: Settings = { ...DEFAULT_SETTINGS };
  private view: SiteView | null = null;
  private fields = new Map<HTMLElement, Field>();
  private statuses: Array<RegionStatus & { region: Region }> = [];
  private observers: MutationObserver[] = [];
  private resizeObserver: ResizeObserver | null = null;
  private dirty = new Map<Region, Set<Element> | null>();
  private diagnostics = new Map<HTMLElement, ErrorCode>();
  private generation = 0;
  private result: RateResult | null = null;
  private pending = false;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private freshnessTimer: ReturnType<typeof setInterval> | null = null;
  private debounce: ReturnType<typeof setTimeout> | null = null;
  private rateTimer: ReturnType<typeof setTimeout> | null = null;
  private sourceChanged = false;
  private regionCode: ErrorCode | null = null;
  private blockedContext: WeakRef<Element> | null = null;
  private layoutFrame: number | null = null;
  private layout = () => {
    if (!this.view || document.hidden || this.layoutFrame !== null) return;
    // Hide immediately while scrolling to avoid a stale floating position.
    for (const field of this.fields.values()) if (field.candidate.overlay) field.annotation.host.style.visibility = 'hidden';
    this.layoutFrame = requestAnimationFrame(() => { this.layoutFrame = null; this.render(); if (!this.result) void this.requestRate(); });
  };
  private visibility = () => { this.teardown(); this.start(); };
  private navigation = () => this.checkView();
  constructor(private readonly adapter: SiteAdapter, private readonly bridge: EngineBridge) {
    document.addEventListener('visibilitychange', this.visibility);
    window.addEventListener('hashchange', this.navigation);
    window.addEventListener('popstate', this.navigation);
    document.addEventListener('scroll', this.layout, { capture: true, passive: true });
    window.addEventListener('resize', this.layout);
    window.addEventListener('pagehide', () => this.teardown());
    window.addEventListener('pageshow', () => this.start());
  }
  configure(settings: Settings): void {
    this.sourceChanged = this.settings.setupComplete && this.settings.mode !== settings.mode;
    this.teardown(); this.settings = settings; this.start();
  }
  status(): ViewStatus {
    return { supported: this.view !== null, eligible: this.fields.size,
      annotated: [...this.fields.values()].filter(f => f.annotation.host.style.visibility !== 'hidden' && f.annotation.label.textContent?.startsWith('≈')).length,
      code: !this.settings.setupComplete ? 'SETUP_REQUIRED' : !this.settings.enabled ? 'DISABLED' : !this.view ? 'UNSUPPORTED_VIEW' : this.regionCode ?? this.diagnostics.values().next().value ?? this.result?.code ?? null,
      adapter: this.adapter.name };
  }
  private start(): void {
    if (!this.settings.enabled || !this.settings.setupComplete || document.hidden || !this.adapter.available) return;
    if (!this.watchdog) this.watchdog = setInterval(() => this.checkView(), 1000);
    this.checkView();
  }
  private sameView(next: SiteView | null): boolean {
    return Boolean(next && this.view && next.context === this.view.context && next.regions.length === this.view.regions.length && next.regions.every((r, i) => r.root === this.view!.regions[i]?.root && r.statusMount === this.view!.regions[i]?.statusMount));
  }
  private checkView(): void {
    if (!this.settings.enabled || document.hidden || !this.adapter.available) return;
    const next = this.adapter.discover(document, window.location);
    if (this.blockedContext && next?.context === this.blockedContext.deref()) return;
    this.blockedContext = null;
    if (this.sameView(next)) {
      if (this.statuses.some(status => !status.host.isConnected)) { this.blockedContext = new WeakRef(next!.context); this.clearView(); }
      return;
    }
    this.clearView();
    if (!next) return;
    this.view = next;
    this.resizeObserver = new ResizeObserver(this.layout);
    for (const region of next.regions) {
      this.resizeObserver.observe(region.root);
      this.statuses.push({ ...createRegionStatus(region.statusMount, region.statusBefore), region });
      const observer = new MutationObserver(records => this.mutations(region, records));
      observer.observe(region.root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'headers', 'id', 'aria-colindex', 'data-currency', 'data-currency-code'] });
      this.observers.push(observer); this.dirty.set(region, null);
    }
    this.flush();
    this.freshnessTimer = setInterval(() => this.render(), MINUTE);
  }
  private mutations(region: Region, records: MutationRecord[]): void {
    for (const record of records) {
      const element = record.target.nodeType === Node.ELEMENT_NODE ? record.target as Element : record.target.parentElement;
      if (!element || element.closest(`[${OWNED}]`)) continue;
      if (record.type === 'childList' && [...record.addedNodes, ...record.removedNodes].every(node => node instanceof Element && node.hasAttribute(OWNED))) {
        if ([...record.removedNodes].some(node => [...this.fields.values()].some(field => field.annotation.host === node))) {
          // A framework removed an active mount. Stop this context instead of fighting it.
          this.blockedContext = this.view ? new WeakRef(this.view.context) : null; this.clearView(); return;
        }
        continue;
      }
      if (this.dirty.get(region) === null) continue;
      const row = this.adapter.rowFor(element);
      if (!row || record.type === 'childList' && (element === region.root || element.tagName === 'TBODY')) this.dirty.set(region, null);
      else {
        const rows = this.dirty.get(region) ?? new Set<Element>(); rows.add(row); this.dirty.set(region, rows);
      }
    }
    if (this.dirty.size && !this.debounce) this.debounce = setTimeout(() => { this.debounce = null; this.flush(); }, 150);
  }
  private flush(): void {
    if (!this.view || document.hidden) return;
    const hadFields = this.fields.size > 0;
    this.regionCode = null;
    for (const [region, rows] of this.dirty) {
      const read = this.adapter.read(region, rows);
      this.regionCode ??= read.code;
      const seen = new Set<HTMLElement>();
      for (const candidate of read.candidates) {
        seen.add(candidate.cell); this.diagnostics.delete(candidate.cell);
        if (!this.settings[candidate.kind] || candidate.currency !== 'KRW' || !candidate.cell.isConnected || candidate.cell.getClientRects().length === 0 || getComputedStyle(candidate.cell).visibility === 'hidden') {
          this.remove(candidate.cell);
          if (candidate.currency === null) this.diagnostics.set(candidate.cell, 'CURRENCY_AMBIGUOUS');
          continue;
        }
        try {
          const amount = parseAmount(candidate.text);
          const previous = this.fields.get(candidate.cell);
          if (previous && (previous.candidate.mount !== candidate.mount || !previous.annotation.host.isConnected)) this.remove(candidate.cell);
          const annotation = this.fields.get(candidate.cell)?.annotation ?? createAnnotation(candidate.mount);
          this.fields.set(candidate.cell, { candidate, amount, annotation });
        } catch (error) { this.remove(candidate.cell); this.diagnostics.set(candidate.cell, error instanceof LensError ? error.code : 'AMOUNT_INVALID'); }
      }
      for (const [cell, field] of this.fields) if (!cell.isConnected || field.candidate.kind === region.kind && (!rows || rows.has(field.candidate.row)) && !seen.has(cell)) this.remove(cell);
      for (const cell of this.diagnostics.keys()) if (!cell.isConnected || region.root.contains(cell) && !seen.has(cell) && (!rows || rows.has(this.adapter.rowFor(cell)!))) this.diagnostics.delete(cell);
    }
    this.dirty.clear(); this.render();
    if (this.fields.size && !hadFields) void this.requestRate();
    else if (!this.fields.size) { this.bridge.release(this.generation); if (this.rateTimer) clearTimeout(this.rateTimer); this.rateTimer = null; }
  }
  private render(): void {
    for (const field of this.fields.values()) {
      try {
        updateAnnotation(field.annotation, field.amount, this.settings, this.result, Date.now());
        if (!positionOverlay(field.candidate, field.annotation, this.settings.placement)) this.diagnostics.set(field.candidate.cell, 'UNSUPPORTED_VIEW');
        else if (this.diagnostics.get(field.candidate.cell) === 'UNSUPPORTED_VIEW') this.diagnostics.delete(field.candidate.cell);
      }
      catch { this.remove(field.candidate.cell); this.diagnostics.set(field.candidate.cell, 'AMOUNT_UNSAFE'); }
    }
    for (const status of this.statuses) {
      const fields = [...this.fields.values()].filter(field => field.candidate.kind === status.region.kind);
      const unavailable = fields.length > 0 && fields.every(field => field.annotation.host.style.visibility === 'hidden');
      updateRegionStatus(status, this.settings, unavailable ? { rate: null, code: 'UNSUPPORTED_VIEW', connection: 'error', nextAttemptAt: null } : this.result, this.sourceChanged);
    }
  }
  private async requestRate(): Promise<void> {
    if (this.pending || !this.view || ![...this.fields.values()].some(f => f.annotation.host.style.visibility !== 'hidden') || document.hidden) return;
    const generation = this.generation; this.pending = true;
    try {
      const result = await this.bridge.rate(generation);
      if (generation !== this.generation || document.hidden || !this.view) return;
      this.result = result; this.render();
      if (this.rateTimer) clearTimeout(this.rateTimer);
      if (result.nextAttemptAt !== null) this.rateTimer = setTimeout(() => { this.rateTimer = null; void this.requestRate(); }, Math.min(2_147_000_000, Math.max(1000, result.nextAttemptAt - Date.now())));
    } catch { if (generation === this.generation) { this.result = { rate: null, code: 'RATE_UNAVAILABLE', connection: 'error', nextAttemptAt: null }; this.render(); } }
    finally { if (generation === this.generation) this.pending = false; }
  }
  private remove(cell: HTMLElement): void { this.fields.get(cell)?.annotation.host.remove(); this.fields.delete(cell); }
  private clearView(): void {
    this.bridge.release(this.generation); this.generation++; this.pending = false;
    for (const observer of this.observers) observer.disconnect(); this.observers = [];
    this.resizeObserver?.disconnect(); this.resizeObserver = null;
    for (const field of this.fields.values()) field.annotation.host.remove(); this.fields.clear();
    for (const status of this.statuses) status.host.remove(); this.statuses = [];
    this.view = null; this.result = null; this.dirty.clear(); this.diagnostics.clear(); this.regionCode = null;
    if (this.layoutFrame !== null) cancelAnimationFrame(this.layoutFrame); this.layoutFrame = null;
    if (this.debounce) clearTimeout(this.debounce); this.debounce = null;
    if (this.rateTimer) clearTimeout(this.rateTimer); this.rateTimer = null;
    if (this.freshnessTimer) clearInterval(this.freshnessTimer); this.freshnessTimer = null;
  }
  private teardown(): void { this.clearView(); this.blockedContext = null; if (this.watchdog) clearInterval(this.watchdog); this.watchdog = null; }
}
