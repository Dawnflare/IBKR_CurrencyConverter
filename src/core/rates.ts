import { DAY, HOUR, MINUTE, DISCLAIMER, isObject, isRate, isTime, LensError, type Cadence, type RateRecord } from './types';

export function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value;
}
export function validTimestamp(value: unknown, now: number): number {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value) || !validDate(value.slice(0, 10))) throw new LensError('PROVIDER_INVALID_RESPONSE');
  if (Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59 || Number(value.slice(17, 19)) > 59) throw new LensError('PROVIDER_INVALID_RESPONSE');
  const time = Date.parse(value);
  if (!isTime(time)) throw new LensError('PROVIDER_INVALID_RESPONSE');
  if (time > now + 5 * MINUTE) throw new LensError('RATE_CLOCK_ERROR');
  return time;
}
const baseRecord = (rate: number): Pick<RateRecord, 'schemaVersion' | 'base' | 'quote' | 'rate' | 'sourceDate' | 'sourceTime' | 'fetchedAt' | 'observedAt' | 'enteredAt'> => ({
  schemaVersion: 1, base: 'USD', quote: 'KRW', rate, sourceDate: null, sourceTime: null, fetchedAt: null, observedAt: null, enteredAt: null,
});
export function parseECB(payload: unknown, now: number): RateRecord {
  if (!isObject(payload) || payload.base !== 'USD' || payload.quote !== 'KRW' || !isRate(payload.rate) || !validDate(payload.date)) throw new LensError('PROVIDER_INVALID_RESPONSE');
  if ('providers' in payload && (!Array.isArray(payload.providers) || payload.providers.length !== 1 || payload.providers[0] !== 'ecb')) throw new LensError('PROVIDER_INVALID_RESPONSE');
  if ('provider' in payload && payload.provider !== 'ecb') throw new LensError('PROVIDER_INVALID_RESPONSE');
  if (payload.date > new Date(now).toISOString().slice(0, 10)) throw new LensError('RATE_CLOCK_ERROR');
  return { ...baseRecord(payload.rate), source: 'ecb', precision: 'date', sourceDate: payload.date, fetchedAt: now, quality: 'reference' };
}
export function parseCurrencyAPI(payload: unknown, now: number): RateRecord {
  if (!isObject(payload) || !isObject(payload.meta) || !isObject(payload.data) || !isObject(payload.data.KRW)) throw new LensError('PROVIDER_INVALID_RESPONSE');
  const krw = payload.data.KRW;
  if (krw.code !== 'KRW' || !isRate(krw.value) || ('base_currency' in payload.meta && payload.meta.base_currency !== 'USD')) throw new LensError('PROVIDER_INVALID_RESPONSE');
  if (['base', 'base_currency'].some(key => key in payload && payload[key] !== 'USD') || 'quote' in payload && payload.quote !== 'KRW') throw new LensError('PROVIDER_INVALID_RESPONSE');
  return { ...baseRecord(krw.value), source: 'currencyapi', precision: 'timestamp', sourceTime: validTimestamp(payload.meta.last_updated_at, now), fetchedAt: now, quality: 'provider' };
}
export function manualRecord(rate: number, enteredAt: number): RateRecord {
  if (!isRate(rate) || !isTime(enteredAt)) throw new LensError('RATE_UNAVAILABLE');
  return { ...baseRecord(rate), source: 'manual', precision: 'entry', enteredAt, quality: 'manual' };
}
export function restoreExternal(value: unknown, now: number): RateRecord | null {
  if (!isObject(value) || value.schemaVersion !== 1 || value.base !== 'USD' || value.quote !== 'KRW' || !isRate(value.rate) || !isTime(value.fetchedAt) || value.fetchedAt > now + 5 * MINUTE) return null;
  try {
    if (value.source === 'ecb' && value.precision === 'date' && value.quality === 'reference') return { ...parseECB({ base: 'USD', quote: 'KRW', rate: value.rate, date: value.sourceDate }, now), fetchedAt: value.fetchedAt };
    if (value.source === 'currencyapi' && value.precision === 'timestamp' && value.quality === 'provider' && isTime(value.sourceTime)) return { ...parseCurrencyAPI({ meta: { last_updated_at: new Date(value.sourceTime).toISOString() }, data: { KRW: { code: 'KRW', value: value.rate } } }, now), fetchedAt: value.fetchedAt };
  } catch { /* Invalid persisted records are discarded. */ }
  return null;
}
export interface Freshness { usable: boolean; warning: string | null; }
/** Date-only age is the difference between UTC calendar dates, not quote timestamps. */
export function freshness(record: RateRecord, cadence: Cadence, now: number): Freshness {
  const unavailable = (warning: string): Freshness => ({ usable: false, warning });
  const ageOf = (time: number | null): number | null => isTime(time) && time <= now + 5 * MINUTE ? Math.max(0, now - time) : null;
  if (!isRate(record.rate)) return unavailable('Rate unavailable');
  if (record.source === 'manual') {
    const age = ageOf(record.enteredAt);
    if (age === null) return unavailable('Clock or entry time error');
    return age > 7 * DAY ? unavailable('Reconfirm manual rate') : { usable: true, warning: age > DAY ? 'Manual rate entered over 24 hours ago' : null };
  }
  if (record.source === 'ecb' || (record.source === 'currencyapi' && cadence === 'daily')) {
    const date = record.source === 'ecb' ? record.sourceDate : isTime(record.sourceTime) ? new Date(record.sourceTime).toISOString().slice(0, 10) : null;
    if (!validDate(date) || (record.source === 'currencyapi' && ageOf(record.sourceTime) === null)) return unavailable('Clock or source date error');
    const days = (Date.parse(`${new Date(now).toISOString().slice(0, 10)}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / DAY;
    if (days < 0) return unavailable('Clock or source date error');
    return days > 7 ? unavailable('FX date expired') : { usable: true, warning: days > 4 ? (record.source === 'ecb' ? 'older reference' : 'stale FX · daily') : null };
  }
  if (record.source === 'broker' && record.precision === 'unknown') return { usable: true, warning: 'FX time unavailable' };
  const age = ageOf(record.sourceTime);
  if (age === null) return unavailable('Clock or source time error');
  const threshold = record.source === 'broker' || cadence === 'minute' ? 15 * MINUTE : 2 * HOUR;
  return age > DAY ? unavailable('FX timestamp expired') : { usable: true, warning: age > threshold ? record.source === 'broker' ? 'older broker rate' : 'stale FX' : null };
}
export function sourceLabel(record: RateRecord, cadence: Cadence): string {
  return record.source === 'ecb' ? 'ECB daily reference via Frankfurter' : record.source === 'currencyapi' ? `currencyapi · ${cadence === 'minute' ? 'minute-level plan' : `${cadence} plan`}` : record.source === 'manual' ? 'Manual' : 'IBKR page rate';
}
export function rateDetails(record: RateRecord, cadence: Cadence, now: number): string {
  const lines = [`${sourceLabel(record, cadence)} · 1 USD = ${record.rate.toLocaleString('en-US', { maximumFractionDigits: 9 })} KRW`];
  if (record.sourceDate) lines.push(`Rate date: ${record.sourceDate}`);
  if (record.sourceTime !== null) lines.push(`FX data as of: ${new Date(record.sourceTime).toISOString()}`);
  if (record.fetchedAt !== null) lines.push(`Last successful fetch: ${new Date(record.fetchedAt).toISOString()} (${Math.max(0, Math.floor((now - record.fetchedAt) / MINUTE))} min ago)`);
  if (record.observedAt !== null) lines.push(`Page observed: ${new Date(record.observedAt).toISOString()}`);
  if (record.enteredAt !== null) lines.push(`Entered: ${new Date(record.enteredAt).toISOString()}`);
  const state = freshness(record, cadence, now);
  if (state.warning) lines.push(state.warning);
  lines.push(DISCLAIMER, 'An FX timestamp does not establish the freshness of the native position valuation.');
  return lines.join('\n');
}
