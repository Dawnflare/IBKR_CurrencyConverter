import { DEFAULT_SETTINGS, FIELD_KEYS, isObject, isRate, isTime, LensError, type Settings } from './types';
export type SettingsInput = Omit<Settings, 'schemaVersion' | 'manualEnteredAt' | 'setupComplete'>;
const inputKeys = ['enabled', 'mode', 'placement', 'format', ...FIELD_KEYS, 'ecbEnabled', 'currencyapiEnabled', 'cadence', 'manualRate'];
export function settingsInput(value: unknown): SettingsInput {
  if (!isObject(value) || Object.keys(value).length !== inputKeys.length || Object.keys(value).some(k => !inputKeys.includes(k))) throw new LensError('INVALID_MESSAGE');
  if (!['enabled', ...FIELD_KEYS, 'ecbEnabled', 'currencyapiEnabled'].every(k => typeof value[k] === 'boolean') ||
      typeof value.mode !== 'string' || !['auto', 'ecb', 'currencyapi', 'manual'].includes(value.mode) ||
      typeof value.placement !== 'string' || !['underneath', 'inline'].includes(value.placement) || typeof value.format !== 'string' || !['full', 'compact'].includes(value.format) ||
      typeof value.cadence !== 'string' || !['minute', 'hourly', 'daily'].includes(value.cadence) || (value.manualRate !== null && !isRate(value.manualRate))) throw new LensError('INVALID_MESSAGE');
  if (value.mode === 'manual' && !isRate(value.manualRate)) throw new LensError('RATE_UNAVAILABLE');
  return value as unknown as SettingsInput;
}
export function restoreSettings(value: unknown): Settings {
  if (!isObject(value) || ![1, 2].includes(value.schemaVersion as number) || typeof value.setupComplete !== 'boolean') return { ...DEFAULT_SETTINGS };
  try {
    // v0.1.3 adds three fields. Preserve existing source, consent, toggles and entry time.
    const migrated = value.schemaVersion === 1 ? { ...value, avgPrice: true, dailyPnl: true, unrealizedPnl: true } : value;
    const input = Object.fromEntries(inputKeys.map(k => [k, migrated[k]]));
    return { ...settingsInput(input), schemaVersion: 2, setupComplete: value.setupComplete, manualEnteredAt: isTime(value.manualEnteredAt) ? value.manualEnteredAt : null };
  } catch { return { ...DEFAULT_SETTINGS }; }
}
