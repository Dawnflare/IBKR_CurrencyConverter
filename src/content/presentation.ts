import { DISCLAIMER, type RateResult, type Settings } from '../core/types';
import { freshness, rateDetails, sourceLabel } from '../core/rates';
import { convert, formatUSD } from '../core/numbers';
export const OWNED = 'data-usd-lens';
export interface Annotation { host: HTMLElement; label: HTMLSpanElement; last: string; }
export function createAnnotation(mount: HTMLElement): Annotation {
  const host = document.createElement('span');
  host.setAttribute(OWNED, 'estimate');
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = ':host{display:block;user-select:none;color:inherit;font:inherit}span{font:500 max(11px,.85em)/1.45 system-ui,sans-serif;opacity:.86;white-space:nowrap;user-select:none}span:focus-visible{outline:2px solid currentColor;outline-offset:3px;border-radius:2px}';
  const label = document.createElement('span');
  label.tabIndex = 0; label.setAttribute('role', 'note');
  shadow.append(style, label); mount.append(host);
  return { host, label, last: '' };
}
export function updateAnnotation(annotation: Annotation, amount: number, settings: Settings, result: RateResult | null, now: number, note = ''): void {
  const rate = result?.rate;
  const age = rate ? freshness(rate, settings.cadence, now) : null;
  let text = 'USD unavailable';
  let details = `${result?.code ?? 'RATE_UNAVAILABLE'}\n${DISCLAIMER}`;
  if (rate) {
    details = rateDetails(rate, settings.cadence, now);
    if (age?.usable) {
      const value = convert(amount, rate.rate);
      text = formatUSD(value, settings.format);
      details = `${formatUSD(value)}\n${details}`;
      if (age.warning) text += ` · ${age.warning}`;
      if (result?.connection === 'error') text += ' · cached FX';
    }
  }
  if (result?.code && !['RATE_STALE', 'RATE_EXPIRED'].includes(result.code)) details += `\nConnection: ${result.code}`;
  if (note) details += `\n${note}`;
  const fingerprint = `${text}|${details}|${settings.placement}`;
  if (annotation.last === fingerprint) return;
  annotation.last = fingerprint;
  annotation.host.style.display = settings.placement === 'inline' ? 'inline-block' : 'block';
  annotation.label.textContent = text;
  annotation.label.title = details;
  annotation.label.setAttribute('aria-label', `${text}. ${details}`);
}
export interface RegionStatus { host: HTMLElement; summary: HTMLElement; details: HTMLElement; }
export function createRegionStatus(mount: HTMLElement, before?: HTMLElement): RegionStatus {
  const host = document.createElement('div'); host.setAttribute(OWNED, 'status');
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = ':host{display:block;color:inherit;font:12px/1.5 system-ui,sans-serif;margin:8px 0}summary{cursor:pointer}pre{white-space:pre-wrap;font:inherit;max-width:72ch;margin:8px 0;padding:12px;border:1px solid currentColor;border-radius:8px}';
  const details = document.createElement('details');
  const summary = document.createElement('summary');
  const pre = document.createElement('pre');
  details.append(summary, pre); shadow.append(style, details); mount.insertBefore(host, before ?? null);
  return { host, summary, details: pre };
}
export function updateRegionStatus(status: RegionStatus, settings: Settings, result: RateResult | null, notice: boolean): void {
  const rate = result?.rate;
  const age = rate ? freshness(rate, settings.cadence, Date.now()) : null;
  const summary = rate && age?.usable ? `USD estimates · ${sourceLabel(rate, settings.cadence)}${rate.sourceDate ? ` · Rate date: ${rate.sourceDate}` : ''}${age.warning ? ` · ${age.warning}` : ''}` : `USD estimates unavailable · ${result?.code ?? 'RATE_UNAVAILABLE'}`;
  const details = `${rate ? rateDetails(rate, settings.cadence, Date.now()) : DISCLAIMER}${settings.mode === 'auto' ? '\nAuto fallback: verified IBKR page rate unavailable; ECB reference is used only when enabled.' : ''}${notice ? '\nFX source changed. All supported fields use the same selected rate.' : ''}${result?.code ? `\nStatus: ${result.code}` : ''}`;
  if (status.summary.textContent !== summary) status.summary.textContent = summary;
  if (status.details.textContent !== details) status.details.textContent = details;
}
