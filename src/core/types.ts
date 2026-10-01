export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
export const DISCLAIMER = 'Display estimate only. Not an executable FX quote or IBKR account valuation.';
export const ERROR_CODES = [
  'UNSUPPORTED_VIEW', 'MARKET_VALUE_COLUMN_MISSING', 'CURRENCY_AMBIGUOUS',
  'AMOUNT_ABBREVIATED', 'AMOUNT_INVALID', 'AMOUNT_UNSAFE', 'RATE_UNAVAILABLE',
  'RATE_STALE', 'RATE_EXPIRED', 'RATE_PERMISSION_REQUIRED', 'RATE_CLOCK_ERROR',
  'PROVIDER_AUTH_FAILED', 'PROVIDER_RATE_LIMITED', 'PROVIDER_NETWORK_ERROR',
  'PROVIDER_TIMEOUT', 'PROVIDER_INVALID_RESPONSE', 'PROVIDER_RESPONSE_TOO_LARGE',
  'REFRESH_COOLDOWN', 'SETUP_REQUIRED', 'KEY_REQUIRED', 'REQUEST_CANCELLED',
  'INVALID_MESSAGE', 'STORAGE_ERROR', 'DISABLED',
] as const;
export type ErrorCode = typeof ERROR_CODES[number];
export type Mode = 'auto' | 'ecb' | 'currencyapi' | 'manual';
export type ExternalSource = 'ecb' | 'currencyapi';
export type Cadence = 'minute' | 'hourly' | 'daily';
export const FIELD_KEYS = ['marketValue', 'avgPrice', 'dailyPnl', 'unrealizedPnl', 'cash'] as const;
export type FieldKind = typeof FIELD_KEYS[number];
export interface Settings {
  schemaVersion: 2;
  setupComplete: boolean;
  enabled: boolean;
  mode: Mode;
  placement: 'underneath' | 'inline';
  format: 'full' | 'compact';
  marketValue: boolean;
  avgPrice: boolean;
  dailyPnl: boolean;
  unrealizedPnl: boolean;
  cash: boolean;
  ecbEnabled: boolean;
  currencyapiEnabled: boolean;
  cadence: Cadence;
  manualRate: number | null;
  manualEnteredAt: number | null;
}
export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: 2, setupComplete: false, enabled: false, mode: 'auto',
  placement: 'underneath', format: 'full', marketValue: true, avgPrice: true, dailyPnl: true, unrealizedPnl: true, cash: true,
  ecbEnabled: false, currencyapiEnabled: false, cadence: 'daily',
  manualRate: null, manualEnteredAt: null,
};
export interface RateRecord {
  schemaVersion: 1;
  source: ExternalSource | 'manual' | 'broker';
  base: 'USD'; quote: 'KRW'; rate: number;
  precision: 'date' | 'timestamp' | 'entry' | 'unknown';
  sourceDate: string | null;
  sourceTime: number | null;
  fetchedAt: number | null;
  observedAt: number | null;
  enteredAt: number | null;
  quality: 'reference' | 'provider' | 'manual' | 'broker';
}
export interface RateResult {
  rate: RateRecord | null;
  code: ErrorCode | null;
  connection: 'ok' | 'cached' | 'error' | 'manual';
  nextAttemptAt: number | null;
}
export class LensError extends Error {
  constructor(public readonly code: ErrorCode, public readonly retryAfter = 0) { super(code); }
}
export const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
export const isRate = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 1e-9 && v <= 1e9;
export const isTime = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
