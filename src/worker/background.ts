import { DEFAULT_SETTINGS, isObject, LensError, type Settings } from '../core/types';
import { restoreSettings, settingsInput } from '../core/settings';
import { exactKeys, generation, senderRole, type PopupState } from '../core/messages';
import { HOSTS } from './providers';
import { RateService } from './rate-service';

declare const __FIXTURE_ORIGIN__: string | null;
let settings: Settings = { ...DEFAULT_SETTINGS };
let revision = 0;
const ready = (async () => {
  await Promise.all([
    chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
    chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
  ]);
  settings = restoreSettings((await chrome.storage.local.get('settings')).settings);
})();
const service = new RateService({
  load: async () => { await ready; return (await chrome.storage.local.get('rates')).rates; },
  save: async rates => { await ready; await chrome.storage.local.set({ rates }); },
  permission: async source => chrome.permissions.contains({ origins: [HOSTS[source]] }),
  key: async () => {
    await ready;
    const session = (await chrome.storage.session.get('providerKey')).providerKey;
    if (typeof session === 'string') return session;
    const local = (await chrome.storage.local.get('providerKey')).providerKey;
    return typeof local === 'string' ? local : null;
  },
});
// Serialize configuration mutations; reads wait for earlier mutations.
let mutations: Promise<unknown> = Promise.resolve();
function mutate<T>(action: () => Promise<T>): Promise<T> {
  const result = mutations.catch(() => {}).then(action);
  mutations = result;
  return result;
}
async function broadcast(): Promise<void> {
  // Tab IDs are transient routing handles only. No URLs/titles are inspected or stored.
  const tabs = await chrome.tabs.query({});
  await Promise.allSettled(tabs.filter(t => t.id !== undefined).map(t => chrome.tabs.sendMessage(t.id!, { type: 'settingsChanged', revision })));
}
async function changed(): Promise<void> {
  revision++;
  await service.settingsChanged();
  await chrome.storage.local.set({ settings });
  await broadcast();
}
async function popupState(): Promise<PopupState> {
  const [session, local, ecb, currencyapi] = await Promise.all([
    chrome.storage.session.get('providerKey'), chrome.storage.local.get('providerKey'),
    chrome.permissions.contains({ origins: [HOSTS.ecb] }), chrome.permissions.contains({ origins: [HOSTS.currencyapi] }),
  ]);
  return { settings: { ...settings }, keyPresent: typeof session.providerKey === 'string' || typeof local.providerKey === 'string', remembered: typeof local.providerKey === 'string', permissions: { ecb, currencyapi }, brokerAvailable: false, lastRate: await service.get({ ...settings }, { cacheOnly: true, consumer: 'popup' }) };
}
async function handle(value: unknown, sender: chrome.runtime.MessageSender): Promise<unknown> {
  const role = senderRole(sender, chrome.runtime.id, __FIXTURE_ORIGIN__);
  if (!role || !isObject(value) || typeof value.type !== 'string') throw new LensError('INVALID_MESSAGE');
  await ready;
  await mutations.catch(() => {});
  if (value.type === 'getSettings' && exactKeys(value, ['type'])) return { settings: { ...settings }, revision };
  if (role === 'content') {
    if ((value.type === 'rate' || value.type === 'release') && exactKeys(value, ['type', 'generation']) && generation(value.generation)) {
      const consumer = `${sender.tab!.id}:${sender.documentId ?? 'document'}:${value.generation}`;
      if (value.type === 'release') { service.release(consumer); return null; }
      return service.get({ ...settings }, { consumer });
    }
    throw new LensError('INVALID_MESSAGE');
  }
  if (value.type === 'getState' && exactKeys(value, ['type'])) return popupState();
  if (value.type === 'refresh' && exactKeys(value, ['type'])) return service.get({ ...settings }, { force: true, consumer: 'popup' });
  if (value.type === 'setEnabled' && exactKeys(value, ['type', 'enabled']) && typeof value.enabled === 'boolean') {
    const enabled = value.enabled;
    return mutate(async () => { settings = { ...settings, enabled }; await changed(); return popupState(); });
  }
  if (value.type === 'saveSettings' && exactKeys(value, ['type', 'settings'])) {
    const input = settingsInput(value.settings);
    return mutate(async () => {
      if (input.ecbEnabled && !await chrome.permissions.contains({ origins: [HOSTS.ecb] }) || input.currencyapiEnabled && !await chrome.permissions.contains({ origins: [HOSTS.currencyapi] })) throw new LensError('RATE_PERMISSION_REQUIRED');
      settings = { ...input, schemaVersion: 4, setupComplete: true, manualEnteredAt: input.mode === 'manual' ? Date.now() : settings.manualEnteredAt };
      await changed(); return popupState();
    });
  }
  if (value.type === 'setConsent' && exactKeys(value, ['type', 'source', 'enabled']) && (value.source === 'ecb' || value.source === 'currencyapi') && typeof value.enabled === 'boolean') {
    const source = value.source; const enabled = value.enabled;
    return mutate(async () => {
      if (enabled && !await chrome.permissions.contains({ origins: [HOSTS[source]] })) throw new LensError('RATE_PERMISSION_REQUIRED');
      settings = { ...settings, [source === 'ecb' ? 'ecbEnabled' : 'currencyapiEnabled']: enabled };
      await changed(); return popupState();
    });
  }
  if (value.type === 'setKey' && exactKeys(value, ['type', 'key', 'remember']) && typeof value.key === 'string' && /^[\x21-\x7e]{1,512}$/.test(value.key) && typeof value.remember === 'boolean') {
    const key = value.key; const remember = value.remember;
    return mutate(async () => {
      await service.credentialsChanged();
      await Promise.all([chrome.storage.session.remove('providerKey'), chrome.storage.local.remove('providerKey')]);
      await (remember ? chrome.storage.local : chrome.storage.session).set({ providerKey: key });
      await changed(); return popupState();
    });
  }
  if (value.type === 'deleteKey' && exactKeys(value, ['type'])) return mutate(async () => {
    await service.credentialsChanged();
    await Promise.all([chrome.storage.session.remove('providerKey'), chrome.storage.local.remove('providerKey')]);
    await changed(); return popupState();
  });
  if (value.type === 'reset' && exactKeys(value, ['type'])) return mutate(async () => {
    settings = { ...DEFAULT_SETTINGS }; revision++;
    await service.reset();
    await Promise.all([chrome.storage.local.clear(), chrome.storage.session.clear()]);
    await broadcast(); return popupState();
  });
  throw new LensError('INVALID_MESSAGE');
}
chrome.runtime.onMessage.addListener((message: unknown, sender, respond) => {
  void handle(message, sender).then(data => respond({ ok: true, data }), error => respond({ ok: false, code: error instanceof LensError ? error.code : 'STORAGE_ERROR' }));
  return true;
});
chrome.permissions.onRemoved.addListener(removed => {
  if (!removed.origins?.length) return;
  void mutate(async () => {
    await ready;
    const [ecb, currencyapi] = await Promise.all([chrome.permissions.contains({ origins: [HOSTS.ecb] }), chrome.permissions.contains({ origins: [HOSTS.currencyapi] })]);
    settings = { ...settings, ecbEnabled: settings.ecbEnabled && ecb, currencyapiEnabled: settings.currencyapiEnabled && currencyapi };
    await changed();
  }).catch(() => {});
});
