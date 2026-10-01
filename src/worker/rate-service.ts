import { freshness, manualRecord, restoreExternal } from '../core/rates';
import { DAY, HOUR, MINUTE, ERROR_CODES, isObject, isTime, LensError, type ExternalSource, type ErrorCode, type RateRecord, type RateResult, type Settings } from '../core/types';
import { fetchRate } from './providers';

interface Retry { failures: number; nextAt: number; blocked: boolean; code: ErrorCode | null; }
export interface RateState {
  schemaVersion: 1;
  cache: Partial<Record<ExternalSource, RateRecord>>;
  retry: Partial<Record<ExternalSource, Retry>>;
  manualRefreshAt: number | null;
}
export interface RateDependencies {
  load: () => Promise<unknown>;
  save: (state: RateState) => Promise<void>;
  permission: (source: ExternalSource) => Promise<boolean>;
  key: () => Promise<string | null>;
  fetcher?: typeof fetch;
  now?: () => number;
}
const blank = (): RateState => ({ schemaVersion: 1, cache: {}, retry: {}, manualRefreshAt: null });
export function requestInterval(source: ExternalSource, settings: Settings): number {
  return source === 'ecb' ? HOUR : settings.cadence === 'minute' ? 5 * MINUTE : settings.cadence === 'hourly' ? HOUR : DAY;
}
interface Flight { promise: Promise<RateResult>; controller: AbortController; consumers: Set<string>; }
export class RateService {
  private state = blank();
  private readonly flights = new Map<ExternalSource, Flight>();
  private epoch = 0;
  private readonly ready: Promise<void>;
  private readonly now: () => number;
  private writes: Promise<void> = Promise.resolve();
  constructor(private readonly deps: RateDependencies) {
    this.now = deps.now ?? Date.now;
    this.ready = this.load();
  }
  private async load(): Promise<void> {
    const value = await this.deps.load();
    if (!isObject(value) || value.schemaVersion !== 1) return;
    for (const source of ['ecb', 'currencyapi'] as const) {
      const cached = isObject(value.cache) ? restoreExternal(value.cache[source], this.now()) : null;
      if (cached?.source === source) this.state.cache[source] = cached;
      const retry = isObject(value.retry) ? value.retry[source] : null;
      if (isObject(retry) && isTime(retry.nextAt) && typeof retry.failures === 'number' && Number.isInteger(retry.failures) && retry.failures >= 0 && typeof retry.blocked === 'boolean' && (retry.code === null || ERROR_CODES.includes(retry.code as ErrorCode))) this.state.retry[source] = { failures: Math.min(100, retry.failures), nextAt: retry.nextAt, blocked: retry.blocked, code: retry.code as ErrorCode | null };
    }
    this.state.manualRefreshAt = isTime(value.manualRefreshAt) && value.manualRefreshAt <= this.now() + 5 * MINUTE ? value.manualRefreshAt : null;
  }
  private persist(): Promise<void> {
    const snapshot = structuredClone(this.state);
    const write = this.writes.catch(() => {}).then(() => this.deps.save(snapshot));
    this.writes = write;
    return write;
  }
  cancel(): void {
    this.epoch++;
    for (const flight of this.flights.values()) flight.controller.abort();
    this.flights.clear();
  }
  release(consumer: string): void {
    for (const flight of this.flights.values()) {
      flight.consumers.delete(consumer);
      if (!flight.consumers.size) flight.controller.abort();
    }
  }
  async reset(): Promise<void> { this.cancel(); await this.ready; this.state = blank(); await this.persist(); }
  async credentialsChanged(): Promise<void> {
    this.cancel(); await this.ready;
    delete this.state.retry.currencyapi; delete this.state.cache.currencyapi;
    await this.persist();
  }
  async settingsChanged(): Promise<void> {
    this.cancel(); await this.ready;
    for (const source of ['ecb', 'currencyapi'] as const) {
      if (this.state.retry[source]?.blocked) delete this.state.retry[source];
    }
    await this.persist();
  }
  private result(source: ExternalSource, settings: Settings, code: ErrorCode | null = null, connection: RateResult['connection'] = 'cached', nextAt: number | null = null): RateResult {
    const rate = this.state.cache[source] ?? null;
    const stale = rate ? freshness(rate, settings.cadence, this.now()) : null;
    return { rate, code: code ?? (stale && !stale.usable ? 'RATE_EXPIRED' : stale?.warning ? 'RATE_STALE' : rate ? null : 'RATE_UNAVAILABLE'), connection, nextAttemptAt: nextAt };
  }
  async get(settings: Settings, options: { force?: boolean; cacheOnly?: boolean; consumer: string }): Promise<RateResult> {
    await this.ready;
    const empty = (code: ErrorCode): RateResult => ({ rate: null, code, connection: 'error', nextAttemptAt: null });
    if (!settings.setupComplete) return empty('SETUP_REQUIRED');
    if (!settings.enabled && !options.force) return empty('DISABLED');
    if (settings.mode === 'manual') {
      if (settings.manualRate === null || settings.manualEnteredAt === null) return empty('RATE_UNAVAILABLE');
      const rate = manualRecord(settings.manualRate, settings.manualEnteredAt);
      const age = freshness(rate, settings.cadence, this.now());
      return { rate, code: !age.usable ? 'RATE_EXPIRED' : age.warning ? 'RATE_STALE' : null, connection: 'manual', nextAttemptAt: null };
    }
    // Broker DOM rate adapter is unavailable until discovery verifies one. Never infer it.
    const source: ExternalSource = settings.mode === 'currencyapi' ? 'currencyapi' : 'ecb';
    const epoch = this.epoch;
    if (!(source === 'ecb' ? settings.ecbEnabled : settings.currencyapiEnabled) || !await this.deps.permission(source)) return empty('RATE_PERMISSION_REQUIRED');
    const key = source === 'currencyapi' ? await this.deps.key() : null;
    if (epoch !== this.epoch) return empty('REQUEST_CANCELLED');
    if (source === 'currencyapi' && !key) return empty('KEY_REQUIRED');
    if (options.cacheOnly) return this.result(source, settings, this.state.retry[source]?.code ?? null);
    const active = this.flights.get(source);
    if (active) { active.consumers.add(options.consumer); return active.promise; }
    const now = this.now();
    const cached = this.state.cache[source];
    const retry = this.state.retry[source];
    const interval = requestInterval(source, settings);
    if (options.force) {
      if (this.state.manualRefreshAt !== null && now - this.state.manualRefreshAt < MINUTE) return this.result(source, settings, 'REFRESH_COOLDOWN', 'cached', this.state.manualRefreshAt + MINUTE);
      if (source === 'currencyapi' && settings.cadence === 'daily' && cached?.fetchedAt !== null && cached?.fetchedAt !== undefined && now < cached.fetchedAt + HOUR) return this.result(source, settings, 'REFRESH_COOLDOWN', 'cached', cached.fetchedAt + HOUR);
    }
    if (retry?.blocked && !options.force) return this.result(source, settings, retry.code, 'error');
    if (retry && !retry.blocked && retry.nextAt > now && (!options.force || retry.code !== null)) return this.result(source, settings, retry.code, retry.code ? 'error' : 'cached', retry.nextAt);
    if (!options.force && cached?.fetchedAt !== null && cached?.fetchedAt !== undefined && now < cached.fetchedAt + interval) return this.result(source, settings, null, 'cached', cached.fetchedAt + interval);
    const controller = new AbortController();
    const flight: Flight = { controller, consumers: new Set([options.consumer]), promise: Promise.resolve(empty('REQUEST_CANCELLED')) };
    this.flights.set(source, flight);
    flight.promise = this.perform(source, settings, key, Boolean(options.force), epoch, controller).finally(() => {
      if (this.flights.get(source) === flight) this.flights.delete(source);
    });
    return flight.promise;
  }
  private async perform(source: ExternalSource, settings: Settings, key: string | null, force: boolean, epoch: number, controller: AbortController): Promise<RateResult> {
    const started = this.now();
    const previous = this.state.retry[source];
    const interval = requestInterval(source, settings);
    if (force) this.state.manualRefreshAt = started;
    // Durable request lease prevents a worker restart from starting the request again.
    this.state.retry[source] = { failures: previous?.failures ?? 0, nextAt: started + interval, blocked: false, code: null };
    try {
      await this.persist();
      if (epoch !== this.epoch || controller.signal.aborted) throw new LensError('REQUEST_CANCELLED');
      const rate = await fetchRate(source, key, controller.signal, this.deps.fetcher, this.now);
      if (epoch !== this.epoch || controller.signal.aborted) throw new LensError('REQUEST_CANCELLED');
      this.state.cache[source] = rate;
      delete this.state.retry[source];
      await this.persist();
      return epoch === this.epoch ? this.result(source, settings, null, 'ok', this.now() + interval) : { rate: null, code: 'REQUEST_CANCELLED', connection: 'error', nextAttemptAt: null };
    } catch (error) {
      const failure = error instanceof LensError ? error : new LensError('STORAGE_ERROR');
      if (epoch !== this.epoch) return { rate: null, code: 'REQUEST_CANCELLED', connection: 'error', nextAttemptAt: null };
      if (failure.code === 'REQUEST_CANCELLED') {
        // A local cancellation did not fail the provider. Keep a short restart guard.
        this.state.retry[source] = { failures: previous?.failures ?? 0, nextAt: Math.max(started + MINUTE, previous?.nextAt ?? 0), blocked: false, code: null };
      } else {
        const failures = (previous?.failures ?? 0) + 1;
        const backoff = failures === 1 ? MINUTE : failures === 2 ? 5 * MINUTE : 15 * MINUTE;
        this.state.retry[source] = { failures, nextAt: this.now() + Math.max(interval, backoff, failure.retryAfter), blocked: failure.code === 'PROVIDER_AUTH_FAILED' || failure.code === 'PROVIDER_RATE_LIMITED' && failure.retryAfter === 0, code: failure.code };
      }
      await this.persist();
      return this.result(source, settings, failure.code, 'error', this.state.retry[source]?.blocked ? null : this.state.retry[source]?.nextAt ?? null);
    }
  }
}
