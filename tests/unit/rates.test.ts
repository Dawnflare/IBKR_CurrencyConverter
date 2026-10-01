import { describe, expect, it } from 'vitest';
import { freshness, manualRecord, parseCurrencyAPI, parseECB, rateDetails, restoreExternal, validTimestamp } from '../../src/core/rates';
import { DAY, HOUR, MINUTE, type RateRecord } from '../../src/core/types';
const now = Date.parse('2026-09-30T12:00:00Z');
const ecb = (date = '2026-09-30', rate = 1350) => ({ base: 'USD', quote: 'KRW', date, rate });
const currency = (time = '2026-09-30T12:00:00Z') => ({ meta: { last_updated_at: time }, data: { KRW: { code: 'KRW', value: 1350 } } });
describe('provider normalization', () => {
  it('retains the ECB source date separately from fetch time', () => {
    const record = parseECB(ecb(), now);
    expect(record).toMatchObject({ source: 'ecb', sourceDate: '2026-09-30', sourceTime: null, fetchedAt: now, precision: 'date' });
    expect(rateDetails(record, 'daily', now)).toContain('Rate date: 2026-09-30');
    expect(rateDetails(record, 'daily', now)).not.toContain('2026-09-30T00:00');
  });
  it('normalizes the fixed USD-base currencyapi contract', () => {
    expect(parseCurrencyAPI(currency(), now)).toMatchObject({ source: 'currencyapi', base: 'USD', quote: 'KRW', rate: 1350, sourceTime: now, fetchedAt: now });
  });
  it.each([{ ...ecb(), base: 'KRW', quote: 'USD' }, { ...ecb(), rate: 0 }, { ...ecb(), rate: Infinity }, { ...ecb(), date: '2026-02-30' }, { ...ecb(), date: null }, { ...ecb(), providers: ['other'] }, { ...ecb(), providers: ['ecb', 'other'] }])('rejects invalid ECB pair/date/provider/rate', value => expect(() => parseECB(value, now)).toThrow());
  it.each([{ meta: {}, data: {} }, { ...currency(), data: { KRW: { code: 'USD', value: 1350 } } }, { ...currency(), data: { KRW: { code: 'KRW', value: '1350' } } }, { ...currency(), meta: { last_updated_at: '2026-09-30T12:00:00Z', base_currency: 'KRW' } }])('rejects invalid keyed responses', value => expect(() => parseCurrencyAPI(value, now)).toThrow());
  it.each(['not-a-time', '2026-09-30', '2026-02-30T12:00:00Z', '2026-09-30T24:00:00Z', '2026-09-30T12:00:00'])('rejects invalid timestamp %s', time => expect(() => validTimestamp(time, now)).toThrow());
  it('rejects future dates/times but permits five minutes of clock skew', () => {
    expect(() => parseECB(ecb('2026-10-01'), now)).toThrow('RATE_CLOCK_ERROR');
    expect(() => parseCurrencyAPI(currency('2026-09-30T12:05:01Z'), now)).toThrow('RATE_CLOCK_ERROR');
    expect(parseCurrencyAPI(currency('2026-09-30T12:05:00Z'), now).sourceTime).toBe(now + 5 * MINUTE);
  });
  it('validates and reconstructs only external caches', () => {
    const record = parseECB(ecb(), now);
    expect(restoreExternal({ ...record, extra: 'discarded' }, now)).toEqual(record);
    expect(restoreExternal({ ...record, schemaVersion: 2 }, now)).toBeNull();
    expect(restoreExternal({ ...record, fetchedAt: now + DAY }, now)).toBeNull();
    expect(restoreExternal(manualRecord(1350, now), now)).toBeNull();
  });
});
describe('freshness policy', () => {
  it.each([[4, true, null], [5, true, 'older reference'], [7, true, 'older reference'], [8, false, 'FX date expired']])('ECB calendar-day boundary %s', (days, usable, warning) => {
    expect(freshness(parseECB(ecb(), now), 'daily', now + (days as number) * DAY)).toEqual({ usable, warning });
  });
  it('does not count weekends as a connection failure or refresh as new quote time', () => {
    const sunday = Date.parse('2026-10-04T23:59:59Z');
    const friday = parseECB(ecb('2026-10-02'), sunday);
    expect(freshness(friday, 'daily', sunday)).toEqual({ usable: true, warning: null });
    expect(friday.sourceDate).toBe('2026-10-02');
  });
  it('checks intraday thresholds exactly', () => {
    const r = parseCurrencyAPI(currency(), now);
    expect(freshness(r, 'minute', now + 15 * MINUTE).warning).toBeNull();
    expect(freshness(r, 'minute', now + 15 * MINUTE + 1).warning).toBe('stale FX');
    expect(freshness(r, 'hourly', now + 2 * HOUR).warning).toBeNull();
    expect(freshness(r, 'hourly', now + 2 * HOUR + 1).warning).toBe('stale FX');
    expect(freshness(r, 'hourly', now + DAY).usable).toBe(true);
    expect(freshness(r, 'hourly', now + DAY + 1).usable).toBe(false);
    expect(freshness(r, 'daily', now + 5 * DAY).warning).toBe('stale FX · daily');
  });
  it('checks manual confirmation boundaries without inventing market time', () => {
    const r = manualRecord(1350, now);
    expect(r.sourceTime).toBeNull();
    expect(freshness(r, 'daily', now + DAY).warning).toBeNull();
    expect(freshness(r, 'daily', now + DAY + 1).warning).toContain('24 hours');
    expect(freshness(r, 'daily', now + 7 * DAY).usable).toBe(true);
    expect(freshness(r, 'daily', now + 7 * DAY + 1).usable).toBe(false);
  });
  it('labels unknown broker age and hides expired timestamped broker rates', () => {
    const r: RateRecord = { ...manualRecord(1350, now), source: 'broker', quality: 'broker', enteredAt: null, observedAt: now, precision: 'unknown' };
    expect(freshness(r, 'hourly', now).warning).toBe('FX time unavailable');
    const stamped = { ...r, precision: 'timestamp' as const, sourceTime: now };
    expect(freshness(stamped, 'hourly', now + 16 * MINUTE).warning).toBe('older broker rate');
    expect(freshness(stamped, 'hourly', now + DAY + 1).usable).toBe(false);
  });
});
