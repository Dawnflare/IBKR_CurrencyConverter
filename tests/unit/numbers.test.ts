import { describe, expect, it } from 'vitest';
import { convert, formatUSD, parseAmount } from '../../src/core/numbers';
describe('strict English amount grammar', () => {
  it.each([
    ['270,000,000.00 KRW', 270000000], ['135000000', 135000000], ['−67,500,000.00', -67500000],
    ['(67,500,000.00)', -67500000], ['(67,500,000.00 KRW)', -67500000], ['KRW (1,350.00)', -1350],
    ['\u00a0+1,350.00\u00a0', 1350], ['₩0.00', 0], ['-0.00', 0], ['123.456789', 123.456789],
  ])('%s → %s', (text, expected) => expect(parseAmount(text as string)).toBe(expected));
  it.each(['', '-', '—', 'loading', 'NaN', 'Infinity', '1e5', '1,00.00', '12,34,567', '1.350,00', '1 350', '50%', '1 2', '1 USD', 'KRW 1 KRW', '(-1)', '(+1)', '1.', '.5', '1,234,', '1/2', '1.123456789'])('rejects %s', text => expect(() => parseAmount(text)).toThrow('AMOUNT_INVALID'));
  it.each(['270M', '398M KRW', '1.5B', '112M', '(2k)'])('rejects missing precision in %s', text => expect(() => parseAmount(text)).toThrow('AMOUNT_ABBREVIATED'));
  it('bounds input and converted magnitude', () => {
    expect(() => parseAmount('1000000000001')).toThrow('AMOUNT_UNSAFE');
    for (const bad of [0, -1, Infinity, NaN, 1e-12]) expect(() => convert(1350, bad)).toThrow();
    expect(() => convert(1e12, 1e-9)).toThrow('AMOUNT_UNSAFE');
  });
});
describe('conversion and display', () => {
  it.each([[270000000, '≈ US$200,000.00'], [135000000, '≈ US$100,000.00'], [-67500000, '≈ −US$50,000.00'], [1350, '≈ US$1.00'], [0, '≈ US$0.00']])('golden amount %s', (amount, display) => expect(formatUSD(convert(amount as number, 1350))).toBe(display));
  it('recalculates with a changed rate and rounds only at display', () => {
    expect(formatUSD(convert(270000000, 1500))).toBe('≈ US$180,000.00');
    expect(convert(1, 3)).toBe(1 / 3);
    expect(formatUSD(1.005)).toBe('≈ US$1.01');
    expect(formatUSD(-1.005)).toBe('≈ −US$1.01');
    expect(formatUSD(-0.004)).toBe('≈ US$0.00');
    expect(formatUSD(1e12 - 0.01)).toBe('≈ US$999,999,999,999.99');
  });
  it.each([[200000, '≈ US$200k'], [-50000, '≈ −US$50k'], [1350000, '≈ US$1.35M'], [2e9, '≈ US$2B'], [999995, '≈ US$1M'], [-0.001, '≈ US$0.00']])('compact %s', (value, expected) => expect(formatUSD(value as number, 'compact')).toBe(expected));
});

describe('Cost Basis millions', () => {
  it.each([
    ['416M', 416000000], ['34.5M', 34500000], ['0.125M', 125000], ['1,234.5M', 1234500000],
    ['+2M', 2000000], ['−2M', -2000000], ['(2.5M)', -2500000], ['-0M', 0],
    ['\u00a0416 M\u202f', 416000000], ['416m', 416000000], ['KRW 416M', 416000000],
    ['(2.5M KRW)', -2500000], ['1,350.00', 1350], ['1,000,000M', 1e12],
  ])('expands %s to %s', (text, expected) => expect(parseAmount(text as string, { allowMillions: true })).toBe(expected));
  it.each(['M', '416MM', '4,16M', '4e2M', '4.16.0M', 'C416M', '(-2M)', '416M USD', '416M extra'])('rejects malformed %s', text => {
    expect(() => parseAmount(text, { allowMillions: true })).toThrow('AMOUNT_INVALID');
  });
  it('bounds the expanded amount and keeps other abbreviations unsupported', () => {
    expect(() => parseAmount('1,000,001M', { allowMillions: true })).toThrow('AMOUNT_UNSAFE');
    expect(() => parseAmount('-1,000,001M', { allowMillions: true })).toThrow('AMOUNT_UNSAFE');
    for (const text of ['1K', '1B', '1T']) expect(() => parseAmount(text, { allowMillions: true })).toThrow('AMOUNT_ABBREVIATED');
    expect(() => parseAmount('416M')).toThrow('AMOUNT_ABBREVIATED');
  });
});
