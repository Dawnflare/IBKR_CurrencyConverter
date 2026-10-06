import { isRate, LensError } from './types';

const MAX_AMOUNT = 1e12;
/** English decimal grammar only. Input must already be scoped to the amount itself. */
export function parseAmount(text: string, options: { allowMillions?: boolean } = {}): number {
  let value = text.replace(/[\u00a0\u202f]/g, ' ').trim().replace(/\u2212/g, '-');
  const labels = value.match(/KRW|₩/g) ?? [];
  if (labels.length > 1) throw new LensError('AMOUNT_INVALID');
  value = value.replace(/^(?:KRW|₩)\s*/, '').replace(/\s*(?:KRW|₩)$/, '').trim();
  const parentheses = value.startsWith('(') && value.endsWith(')');
  if (parentheses) value = value.slice(1, -1).trim().replace(/^(?:KRW|₩)\s*/, '').replace(/\s*(?:KRW|₩)$/, '').trim();
  const multiplier = options.allowMillions && /[mM]$/.test(value) ? 1e6 : 1;
  if (multiplier !== 1) value = value.slice(0, -1).trim();
  if (multiplier === 1 && /^[+-]?[\d,.]+\s*[kKmMbBtT]$/.test(value)) throw new LensError('AMOUNT_ABBREVIATED');
  if (parentheses && /^[+-]/.test(value)) throw new LensError('AMOUNT_INVALID');
  if (!/^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,8})?$/.test(value)) throw new LensError('AMOUNT_INVALID');
  const amount = Number(value.replaceAll(',', '')) * multiplier * (parentheses ? -1 : 1);
  if (!Number.isFinite(amount) || Math.abs(amount) > MAX_AMOUNT) throw new LensError('AMOUNT_UNSAFE');
  return amount === 0 ? 0 : amount;
}
export function convert(amount: number, rate: number): number {
  if (!Number.isFinite(amount) || Math.abs(amount) > MAX_AMOUNT || !isRate(rate)) throw new LensError('AMOUNT_UNSAFE');
  const result = amount / rate;
  if (!Number.isFinite(result) || Math.abs(result) > MAX_AMOUNT) throw new LensError('AMOUNT_UNSAFE');
  return result === 0 ? 0 : result;
}
const full = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
export function formatUSD(value: number, style: 'full' | 'compact' = 'full'): string {
  if (!Number.isFinite(value) || Math.abs(value) > MAX_AMOUNT) throw new LensError('AMOUNT_UNSAFE');
  let magnitude = Math.abs(value);
  let suffix = '';
  if (style === 'compact') {
    const scale = magnitude >= 999_995_000 ? 1e9 : magnitude >= 999_995 ? 1e6 : magnitude >= 999.995 ? 1e3 : 1;
    suffix = scale === 1e9 ? 'B' : scale === 1e6 ? 'M' : scale === 1e3 ? 'k' : '';
    magnitude /= scale;
  }
  const digits = suffix ? compact.format(magnitude) : full.format(magnitude);
  const sign = value < 0 && Number(digits.replaceAll(',', '')) !== 0 ? '−' : '';
  return `≈ ${sign}US$${digits}${suffix}`;
}
