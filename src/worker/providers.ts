import { isObject, LensError, type ExternalSource, type RateRecord } from '../core/types';
import { parseCurrencyAPI, parseECB } from '../core/rates';

export const HOSTS = { ecb: 'https://api.frankfurter.dev/*', currencyapi: 'https://api.currencyapi.com/*' } as const;
export const ENDPOINTS = {
  ecb: 'https://api.frankfurter.dev/v2/rate/USD/KRW?providers=ecb',
  currencyapi: 'https://api.currencyapi.com/v3/latest?base_currency=USD&currencies=KRW',
} as const;
export const MAX_RESPONSE_BYTES = 16_384;
export function retryAfter(header: string | null, now: number): number {
  if (!header) return 0;
  if (/^\d+$/.test(header)) return Math.min(Number(header) * 1000, Number.MAX_SAFE_INTEGER - now);
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, date - now) : 0;
}
async function boundedJSON(response: Response): Promise<unknown> {
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) throw new LensError('PROVIDER_INVALID_RESPONSE');
  if (Number(response.headers.get('content-length')) > MAX_RESPONSE_BYTES) throw new LensError('PROVIDER_RESPONSE_TOO_LARGE');
  if (!response.body) throw new LensError('PROVIDER_INVALID_RESPONSE');
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let text = ''; let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_RESPONSE_BYTES) throw new LensError('PROVIDER_RESPONSE_TOO_LARGE');
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (error instanceof LensError) throw error;
    throw new LensError('PROVIDER_INVALID_RESPONSE');
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
export async function fetchRate(source: ExternalSource, key: string | null, signal: AbortSignal, fetcher: typeof fetch = fetch, now = Date.now): Promise<RateRecord> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener('abort', cancel, { once: true });
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 10_000);
  if (signal.aborted) controller.abort();
  try {
    if (source === 'currencyapi' && !key) throw new LensError('KEY_REQUIRED');
    const response = await fetcher(ENDPOINTS[source], {
      method: 'GET', headers: source === 'currencyapi' ? { Accept: 'application/json', apikey: key! } : { Accept: 'application/json' },
      credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', cache: 'no-store', signal: controller.signal,
    });
    if (response.url && response.url !== ENDPOINTS[source]) throw new LensError('PROVIDER_INVALID_RESPONSE');
    if (response.status === 401 || response.status === 403) throw new LensError('PROVIDER_AUTH_FAILED');
    if (response.status === 429) {
      let delay = retryAfter(response.headers.get('Retry-After'), now());
      try {
        const payload = await boundedJSON(response);
        if (source === 'currencyapi' && isObject(payload) && isObject(payload.quota) && typeof payload.quota.resets_at === 'string') delay = Math.max(delay, retryAfter(payload.quota.resets_at, now()));
      } catch { /* Unknown quota window requires an explicit test; no error strings escape. */ }
      throw new LensError('PROVIDER_RATE_LIMITED', delay);
    }
    if (!response.ok) throw new LensError('PROVIDER_NETWORK_ERROR', retryAfter(response.headers.get('Retry-After'), now()));
    const data = await boundedJSON(response);
    return source === 'ecb' ? parseECB(data, now()) : parseCurrencyAPI(data, now());
  } catch (error) {
    if (timedOut) throw new LensError('PROVIDER_TIMEOUT');
    if (signal.aborted) throw new LensError('REQUEST_CANCELLED');
    if (error instanceof LensError) throw error;
    throw new LensError('PROVIDER_NETWORK_ERROR');
  } finally { clearTimeout(timeout); signal.removeEventListener('abort', cancel); }
}
