import { describe, expect, it } from 'vitest';
import { senderRole, exactKeys, generation } from '../../src/core/messages';
import { restoreSettings, settingsInput } from '../../src/core/settings';
import { DEFAULT_SETTINGS } from '../../src/core/types';
import { adapter } from '../../src/site/production';
const id = 'syntheticextensionid';
describe('trust boundaries', () => {
  it('accepts only the exact owned popup as a privileged sender', () => {
    expect(senderRole({ id, url: `chrome-extension://${id}/popup.html` }, id)).toBe('popup');
    for (const url of [`chrome-extension://${id}/popup.html?x=1`, `chrome-extension://${id}/other.html`, 'https://portal.interactivebrokers.com/popup.html', 'https://evil.invalid']) expect(senderRole({ id, url }, id)).toBeNull();
  });
  it('limits content senders to the approved top-frame origin', () => {
    const sender = { id, url: 'https://portal.interactivebrokers.com/any', frameId: 0, tab: { id: 7 } };
    expect(senderRole(sender, id)).toBe('content');
    expect(senderRole({ ...sender, frameId: 1 }, id)).toBeNull();
    expect(senderRole({ ...sender, id: 'other' }, id)).toBeNull();
    expect(senderRole({ ...sender, url: 'https://portal.interactivebrokers.com.evil.invalid/' }, id)).toBeNull();
    expect(senderRole({ ...sender, url: 'http://127.0.0.1:4173/' }, id)).toBeNull();
    expect(senderRole({ ...sender, url: 'http://127.0.0.1:4173/' }, id, 'http://127.0.0.1:4173')).toBe('content');
  });
  it('rejects additional message fields and unsafe generations', () => {
    expect(exactKeys({ type: 'rate', amount: 1 }, ['type'])).toBe(false);
    expect(generation(Infinity)).toBe(false); expect(generation(-1)).toBe(false); expect(generation(1)).toBe(true);
  });
  it('validates settings with exact keys and primitive enums', () => {
    const { schemaVersion: _schema, setupComplete: _setup, manualEnteredAt: _entered, ...input } = DEFAULT_SETTINGS;
    expect(settingsInput(input)).toEqual(input);
    for (const change of [{ mode: ['auto'] }, { enabled: 'true' }, { avgPrice: 'true' }, { dailyPnl: null }, { unrealizedPnl: 1 }, { manualRate: 0 }, { mode: 'manual', manualRate: null }, { key: 'unexpected' }]) expect(() => settingsInput({ ...input, ...change })).toThrow();
    expect(restoreSettings({ ...DEFAULT_SETTINGS, schemaVersion: 3 })).toEqual(DEFAULT_SETTINGS);
  });
  it.each(['manual', 'ecb'] as const)('migrates old %s settings without resetting source, consent or rate time', mode => {
    const { avgPrice: _avg, dailyPnl: _daily, unrealizedPnl: _unrealized, ...old } = DEFAULT_SETTINGS;
    const saved = { ...old, schemaVersion: 1, setupComplete: true, enabled: true, mode, manualRate: 1350, manualEnteredAt: 123456789, ecbEnabled: true, marketValue: false, cash: false };
    expect(restoreSettings(saved)).toEqual({ ...saved, schemaVersion: 2, avgPrice: true, dailyPnl: true, unrealizedPnl: true });
  });
  it('keeps disabled new fields across restoration and rejects malformed current settings', () => {
    const settings = { ...DEFAULT_SETTINGS, setupComplete: true, avgPrice: false, dailyPnl: false, unrealizedPnl: false };
    expect(restoreSettings(settings)).toEqual(settings);
    expect(restoreSettings({ ...settings, avgPrice: undefined })).toEqual(DEFAULT_SETTINGS);
  });
  it('checks the captured route before reading any DOM', () => {
    expect(adapter.available).toBe(true); expect(adapter.verified).toBe(true);
    expect(adapter.discover(null as unknown as Document, { origin: 'https://unrelated.invalid' } as Location)).toBeNull();
    expect(adapter.discover(null as unknown as Document, { origin: 'https://portal.interactivebrokers.com', pathname: '/portal/', hash: '#/orders' } as Location)).toBeNull();
  });
});
