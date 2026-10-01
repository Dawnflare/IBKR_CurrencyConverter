import { afterEach, describe, expect, it, vi } from 'vitest';
import { ENDPOINTS, fetchRate, MAX_RESPONSE_BYTES, retryAfter } from '../../src/worker/providers';
import { HOUR } from '../../src/core/types';
const now = Date.parse('2026-09-30T12:00:00Z');
const payload = { base: 'USD', quote: 'KRW', date: '2026-09-30', rate: 1350 };
const response = (body: unknown = payload, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const signal = () => new AbortController().signal;
afterEach(() => vi.useRealTimers());
describe('fixed provider transport', () => {
  it('omits credentials/referrer and sends no portfolio data', async () => {
    const fetcher = vi.fn(async () => response());
    await fetchRate('ecb', null, signal(), fetcher, () => now);
    expect(fetcher).toHaveBeenCalledWith(ENDPOINTS.ecb, expect.objectContaining({ credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', cache: 'no-store', headers: { Accept: 'application/json' } }));
    expect(JSON.stringify(fetcher.mock.calls)).not.toMatch(/amount|account|position|symbol/);
  });
  it('sends a synthetic credential only in the provider header', async () => {
    const fetcher = vi.fn(async () => response({ meta: { last_updated_at: '2026-09-30T12:00:00Z' }, data: { KRW: { code: 'KRW', value: 1350 } } }));
    await fetchRate('currencyapi', 'SYNTHETIC_NOT_A_REAL_KEY', signal(), fetcher, () => now);
    expect(fetcher).toHaveBeenCalledWith(ENDPOINTS.currencyapi, expect.objectContaining({ headers: { Accept: 'application/json', apikey: 'SYNTHETIC_NOT_A_REAL_KEY' } }));
    expect(ENDPOINTS.currencyapi).not.toContain('apikey');
  });
  it.each([[401, 'PROVIDER_AUTH_FAILED'], [403, 'PROVIDER_AUTH_FAILED'], [429, 'PROVIDER_RATE_LIMITED'], [500, 'PROVIDER_NETWORK_ERROR']])('sanitizes HTTP %s', async (status, code) => {
    await expect(fetchRate('ecb', null, signal(), async () => response({ secret: 'do not echo' }, status as number), () => now)).rejects.toThrow(code as string);
  });
  it('rejects malformed JSON, non-JSON content, redirects and oversized bodies', async () => {
    await expect(fetchRate('ecb', null, signal(), async () => new Response('{', { headers: { 'content-type': 'application/json' } }))).rejects.toThrow('PROVIDER_INVALID_RESPONSE');
    await expect(fetchRate('ecb', null, signal(), async () => new Response('<html>'))).rejects.toThrow('PROVIDER_INVALID_RESPONSE');
    const redirected = response(); Object.defineProperty(redirected, 'url', { value: 'https://unapproved.invalid/' });
    await expect(fetchRate('ecb', null, signal(), async () => redirected)).rejects.toThrow('PROVIDER_INVALID_RESPONSE');
    await expect(fetchRate('ecb', null, signal(), async () => response('x'.repeat(MAX_RESPONSE_BYTES)))).rejects.toThrow('PROVIDER_RESPONSE_TOO_LARGE');
    await expect(fetchRate('ecb', null, signal(), async () => response(payload, 200, { 'content-length': '999999' }))).rejects.toThrow('PROVIDER_RESPONSE_TOO_LARGE');
  });
  it('bounds requests to ten seconds', async () => {
    vi.useFakeTimers();
    const pending = fetchRate('ecb', null, signal(), async (_url, init) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))));
    const rejection = expect(pending).rejects.toThrow('PROVIDER_TIMEOUT');
    await vi.advanceTimersByTimeAsync(10_000); await rejection;
  });
  it('honors Retry-After seconds and HTTP dates', () => {
    expect(retryAfter('7200', now)).toBe(2 * HOUR);
    expect(retryAfter(new Date(now + HOUR).toUTCString(), now)).toBe(HOUR);
    expect(retryAfter('bad', now)).toBe(0);
  });
  it('honors a provider quota reset without returning provider error text', async () => {
    await expect(fetchRate('currencyapi', 'SYNTHETIC_NOT_A_REAL_KEY', signal(), async () => response({ quota: { resets_at: new Date(now + 2 * HOUR).toISOString() }, message: 'DO_NOT_RETURN_THIS' }, 429), () => now)).rejects.toMatchObject({ code: 'PROVIDER_RATE_LIMITED', retryAfter: 2 * HOUR });
  });
});
