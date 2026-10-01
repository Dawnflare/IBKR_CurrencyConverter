import { describe, expect, it, vi } from 'vitest';
import { RateService, type RateState } from '../../src/worker/rate-service';
import { DAY, DEFAULT_SETTINGS, HOUR, MINUTE, type Settings } from '../../src/core/types';
const start = Date.parse('2026-09-30T12:00:00Z');
const settings: Settings = { ...DEFAULT_SETTINGS, setupComplete: true, enabled: true, mode: 'ecb', ecbEnabled: true, currencyapiEnabled: true };
const opts = { consumer: 'fixture-tab' };
function harness() {
  let now = start; let permission = true; let stored: RateState | undefined; let status = 200;
  const fetcher = vi.fn(async (url: string | URL | Request) => new Response(JSON.stringify(String(url).includes('currencyapi') ? { meta: { last_updated_at: new Date(now).toISOString() }, data: { KRW: { code: 'KRW', value: 1350 } } } : { base: 'USD', quote: 'KRW', date: new Date(now).toISOString().slice(0, 10), rate: 1350 }), { status, headers: { 'content-type': 'application/json', 'Retry-After': '7200' } }));
  const deps = { now: () => now, load: async () => stored, save: async (value: RateState) => { stored = structuredClone(value); }, permission: async () => permission, key: async () => 'SYNTHETIC_NOT_A_REAL_KEY', fetcher };
  return { service: new RateService(deps), restart: () => new RateService(deps), fetcher, advance: (ms: number) => { now += ms; }, permission: (p: boolean) => { permission = p; }, status: (s: number) => { status = s; }, stored: () => stored };
}
describe('shared scheduling and cache', () => {
  it('makes no request before setup, permission, or in manual/disabled modes', async () => {
    const h = harness();
    expect((await h.service.get(DEFAULT_SETTINGS, opts)).code).toBe('SETUP_REQUIRED');
    expect((await h.service.get({ ...settings, enabled: false }, opts)).code).toBe('DISABLED');
    expect((await h.service.get({ ...settings, ecbEnabled: false }, opts)).code).toBe('RATE_PERMISSION_REQUIRED');
    h.permission(false); expect((await h.service.get(settings, opts)).code).toBe('RATE_PERMISSION_REQUIRED');
    expect((await h.service.get({ ...settings, mode: 'manual', manualRate: 1350, manualEnteredAt: start }, opts)).connection).toBe('manual');
    expect(h.fetcher).not.toHaveBeenCalled();
  });
  it('deduplicates concurrent tabs and survives worker restart', async () => {
    const h = harness();
    const results = await Promise.all([h.service.get(settings, opts), h.service.get(settings, { consumer: 'second-tab' })]);
    expect(h.fetcher).toHaveBeenCalledTimes(1); expect(results[0]?.rate).toEqual(results[1]?.rate);
    await h.restart().get(settings, opts); expect(h.fetcher).toHaveBeenCalledTimes(1);
    h.advance(HOUR); await h.service.get(settings, opts); expect(h.fetcher).toHaveBeenCalledTimes(2);
  });
  it('does not fetch when reading popup state', async () => {
    const h = harness(); await h.service.get(settings, { ...opts, cacheOnly: true }); expect(h.fetcher).not.toHaveBeenCalled();
  });
  it('preserves valid cache and source time on failure and respects Retry-After', async () => {
    const h = harness(); const original = await h.service.get(settings, opts);
    h.advance(HOUR); h.status(429); const failed = await h.service.get(settings, opts);
    expect(failed.rate).toEqual(original.rate); expect(failed.code).toBe('PROVIDER_RATE_LIMITED');
    expect(failed.nextAttemptAt).toBe(start + 3 * HOUR);
    await h.restart().get(settings, { ...opts, force: true }); expect(h.fetcher).toHaveBeenCalledTimes(2);
    h.advance(2 * HOUR); h.status(200); await h.service.get(settings, opts); expect(h.fetcher).toHaveBeenCalledTimes(3);
  });
  it('stops auth retries until settings/key changes or explicit testing', async () => {
    const h = harness(); h.status(401); const keyed = { ...settings, mode: 'currencyapi' as const, cadence: 'minute' as const };
    await h.service.get(keyed, opts); h.advance(DAY); await h.restart().get(keyed, opts);
    expect(h.fetcher).toHaveBeenCalledTimes(1);
    h.status(200); await h.service.get(keyed, { ...opts, force: true }); expect(h.fetcher).toHaveBeenCalledTimes(2);
  });
  it('honors global refresh cooldown and daily successful-request minimum', async () => {
    const h = harness();
    await h.service.get(settings, { ...opts, force: true });
    expect((await h.service.get({ ...settings, mode: 'currencyapi' }, { ...opts, force: true })).code).toBe('REFRESH_COOLDOWN');
    h.advance(MINUTE);
    await h.service.get({ ...settings, mode: 'currencyapi' }, { ...opts, force: true });
    h.advance(2 * MINUTE);
    expect((await h.service.get({ ...settings, mode: 'currencyapi' }, { ...opts, force: true })).code).toBe('REFRESH_COOLDOWN');
    expect(h.fetcher).toHaveBeenCalledTimes(2);
  });
  it('keeps currencyapi errors within the selected source', async () => {
    const h = harness(); h.status(500);
    const result = await h.service.get({ ...settings, mode: 'currencyapi' }, opts);
    expect(result.rate).toBeNull(); expect(h.fetcher).toHaveBeenCalledTimes(1);
    expect(String(h.fetcher.mock.calls[0]?.[0])).toContain('api.currencyapi.com');
  });
  it('uses only consented ECB in Auto when broker evidence is absent', async () => {
    const h = harness();
    expect((await h.service.get({ ...settings, mode: 'auto', ecbEnabled: false }, opts)).code).toBe('RATE_PERMISSION_REQUIRED');
    expect((await h.service.get({ ...settings, mode: 'auto' }, opts)).rate?.source).toBe('ecb');
  });
  it('rejects a late response after a source/settings change', async () => {
    const h = harness();
    let finish!: (response: Response) => void;
    h.fetcher.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = h.service.get(settings, opts);
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    h.service.cancel();
    finish(new Response(JSON.stringify({ base: 'USD', quote: 'KRW', date: '2026-09-30', rate: 9999 }), { headers: { 'content-type': 'application/json' } }));
    expect((await pending).code).toBe('REQUEST_CANCELLED'); expect(h.stored()?.cache.ecb).toBeUndefined();
  });
  it('retains an in-flight lease across worker restart and clears caches on reset', async () => {
    const h = harness();
    let finish!: (response: Response) => void;
    h.fetcher.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = h.service.get(settings, opts);
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    await h.restart().get(settings, opts); expect(h.fetcher).toHaveBeenCalledTimes(1);
    h.service.cancel(); finish(new Response('{}', { headers: { 'content-type': 'application/json' } })); await pending;
    await h.service.reset(); expect(h.stored()).toEqual({ schemaVersion: 1, cache: {}, retry: {}, manualRefreshAt: null });
  });
  it('rechecks permissions even for a valid cache', async () => {
    const h = harness(); await h.service.get(settings, opts); h.permission(false);
    expect((await h.service.get(settings, opts)).rate).toBeNull();
  });
  it('does not automatically retry an unknown quota window', async () => {
    const h = harness();
    h.fetcher.mockImplementationOnce(async () => new Response('{}', { status: 429, headers: { 'content-type': 'application/json' } }));
    const result = await h.service.get(settings, opts);
    expect(result.nextAttemptAt).toBeNull();
    h.advance(2 * DAY); await h.restart().get(settings, opts);
    expect(h.fetcher).toHaveBeenCalledTimes(1);
    await h.service.get(settings, { ...opts, force: true }); expect(h.fetcher).toHaveBeenCalledTimes(2);
  });
});
