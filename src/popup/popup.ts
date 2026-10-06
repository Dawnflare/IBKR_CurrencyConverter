import { send, type PopupState, type ViewStatus } from '../core/messages';
import { freshness, rateDetails, sourceLabel } from '../core/rates';
import { FIELD_KEYS, LensError, type ErrorCode, type RateResult } from '../core/types';
import type { SettingsInput } from '../core/settings';
import { HOSTS } from '../worker/providers';
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const input = (id: string) => $<HTMLInputElement>(id);
const select = (id: string) => $<HTMLSelectElement>(id);
$('version').textContent = `v${chrome.runtime.getManifest().version}`;
let state: PopupState;
const explanations: Partial<Record<ErrorCode, string>> = {
  RATE_PERMISSION_REQUIRED: 'Enable the selected external source and grant its permission, or choose Manual.',
  KEY_REQUIRED: 'Enter your provider key directly in External sources & provider key.',
  RATE_EXPIRED: 'The source data is too old. Refresh FX or reconfirm a manual rate.',
  RATE_CLOCK_ERROR: 'Check the computer clock and the provider’s source date/time.',
  PROVIDER_AUTH_FAILED: 'Provider access was rejected. Check or replace the key, then explicitly test again.',
  PROVIDER_RATE_LIMITED: 'Provider quota or rate limit reached. An eligible cached rate can remain visible.',
  PROVIDER_NETWORK_ERROR: 'The provider could not be reached. Eligible cached data is retained.',
  PROVIDER_TIMEOUT: 'The provider did not finish within 10 seconds. Retry timing is preserved.',
  PROVIDER_INVALID_RESPONSE: 'The provider response could not be validated. The last valid cache is preserved.',
  REFRESH_COOLDOWN: 'Refresh is cooling down. Wait for the next allowed attempt.',
  SETUP_REQUIRED: 'Save your source settings to complete setup.',
};
function report(error: unknown): void {
  const code = error instanceof LensError ? error.code : 'RATE_UNAVAILABLE';
  $('feedback').textContent = `${code}: ${explanations[code] ?? 'Review settings and try again.'}`;
}
function modeUI(): void {
  const mode = select('mode').value;
  $('manualSection').hidden = mode !== 'manual'; $('cadenceSection').hidden = mode !== 'currencyapi';
  $('modeHelp').textContent = mode === 'auto' ? 'Auto uses a verified page rate when available. Otherwise, it uses the ECB daily reference only after you enable it. A daily reference is not a live feed.' : mode === 'ecb' ? 'A daily reference estimate attributed to ECB via Frankfurter. Source date and download time remain separate.' : mode === 'currencyapi' ? 'Uses only your configured provider and eligible cache. A provider failure does not switch to a daily source.' : 'Use your entered rate exclusively. Manual mode makes no FX network requests.';
}
function render(next: PopupState): void {
  state = next;
  const s = state.settings;
  for (const name of ['enabled', ...FIELD_KEYS] as const) input(name).checked = s[name];
  if (!s.setupComplete) input('enabled').checked = true;
  select('mode').value = s.mode; select('placement').value = s.placement; select('format').value = s.format; select('cadence').value = s.cadence;
  input('manualRate').value = s.manualRate?.toString() ?? '';
  input('remember').checked = state.remembered;
  $('keyStatus').textContent = state.keyPresent ? `Key saved · ${state.remembered ? 'remembered on this device' : 'this browser session only'}` : 'No key saved';
  $('ecbPermission').textContent = s.ecbEnabled && state.permissions.ecb ? 'Enabled · daily reference' : 'Not enabled';
  $('currencyPermission').textContent = s.currencyapiEnabled && state.permissions.currencyapi ? 'Enabled' : 'Not enabled';
  $('ecbAccess').textContent = state.permissions.ecb && s.ecbEnabled ? 'Revoke access' : 'Enable ECB';
  $('currencyAccess').textContent = state.permissions.currencyapi && s.currencyapiEnabled ? 'Revoke access' : 'Enable provider';
  renderRate(state.lastRate);
  modeUI();
}
function renderRate(result: RateResult): void {
  const rate = result.rate;
  const age = rate ? freshness(rate, state.settings.cadence, Date.now()) : null;
  $('rateSummary').textContent = rate ? `${sourceLabel(rate, state.settings.cadence)}${age?.warning ? ` · ${age.warning}` : ''}` : 'Rate unavailable';
  $('rateDetails').textContent = rate ? rateDetails(rate, state.settings.cadence, Date.now()) : '';
}
async function viewStatus(): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined) throw new Error();
    const status = await chrome.tabs.sendMessage(tab.id, { type: 'viewStatus' }) as ViewStatus;
    $('viewStatus').textContent = status.supported ? status.adapter.startsWith('Synthetic') ? 'Supported synthetic view' : 'Positions' : status.code ?? 'UNSUPPORTED_VIEW';
    $('counts').textContent = `${status.annotated}/${status.eligible} fields`;
  } catch { $('viewStatus').textContent = 'UNSUPPORTED_VIEW'; $('counts').textContent = '0 fields'; }
}
async function act(action: () => Promise<void>): Promise<void> { try { await action(); await viewStatus(); } catch (error) { report(error); } }
select('mode').addEventListener('change', modeUI);
input('enabled').addEventListener('change', () => {
  if (state.settings.setupComplete) void act(async () => { render(await send<PopupState>({ type: 'setEnabled', enabled: input('enabled').checked })); $('feedback').textContent = state.settings.enabled ? 'Estimates enabled.' : 'Estimates disabled and removed.'; });
});
$('settingsForm').addEventListener('submit', event => {
  event.preventDefault();
  void act(async () => {
    const settings: SettingsInput = {
      enabled: input('enabled').checked, mode: select('mode').value as SettingsInput['mode'],
      placement: select('placement').value as SettingsInput['placement'], format: select('format').value as SettingsInput['format'],
      marketValue: input('marketValue').checked, lastPrice: input('lastPrice').checked, costBasis: input('costBasis').checked, cash: input('cash').checked,
      avgPrice: input('avgPrice').checked, dailyPnl: input('dailyPnl').checked, unrealizedPnl: input('unrealizedPnl').checked,
      ecbEnabled: state.settings.ecbEnabled, currencyapiEnabled: state.settings.currencyapiEnabled,
      cadence: select('cadence').value as SettingsInput['cadence'], manualRate: input('manualRate').value ? Number(input('manualRate').value) : null,
    };
    render(await send<PopupState>({ type: 'saveSettings', settings })); $('feedback').textContent = 'Settings saved. Manual mode confirms the entered rate now.';
  });
});
for (const [id, source] of [['ecbAccess', 'ecb'], ['currencyAccess', 'currencyapi']] as const) {
  $(id).addEventListener('click', () => {
    // Invoke permission request synchronously from the click to preserve the user gesture.
    const revoke = state.permissions[source] && (source === 'ecb' ? state.settings.ecbEnabled : state.settings.currencyapiEnabled);
    const permission = revoke ? chrome.permissions.remove({ origins: [HOSTS[source]] }) : chrome.permissions.request({ origins: [HOSTS[source]] });
    void act(async () => {
      const granted = await permission;
      if (!revoke && !granted) { $('feedback').textContent = 'Permission declined. Manual mode remains available.'; return; }
      render(await send<PopupState>({ type: 'setConsent', source, enabled: !revoke }));
      $('feedback').textContent = revoke ? 'External source disabled and permission revoked.' : 'External source enabled. Select the source and save settings.';
    });
  });
}
$('keyForm').addEventListener('submit', event => {
  event.preventDefault();
  const key = input('apiKey').value; input('apiKey').value = '';
  void act(async () => { render(await send<PopupState>({ type: 'setKey', key, remember: input('remember').checked })); $('feedback').textContent = 'Provider key saved.'; });
});
$('deleteKey').addEventListener('click', () => { input('apiKey').value = ''; void act(async () => { render(await send<PopupState>({ type: 'deleteKey' })); $('feedback').textContent = 'Provider key and provider cache deleted.'; }); });
$('refresh').addEventListener('click', () => void act(async () => {
  const button = $<HTMLButtonElement>('refresh'); button.disabled = true;
  try {
    const result = await send<RateResult>({ type: 'refresh' });
    renderRate(result);
    $('feedback').textContent = result.code ? `${result.code}: ${explanations[result.code] ?? 'Review the rate details.'}${result.nextAttemptAt ? `\nNext allowed attempt: ${new Date(result.nextAttemptAt).toLocaleString()}` : ''}` : 'Rate checked. Refresh affects FX only.';
  } finally { button.disabled = false; }
}));
$('reset').addEventListener('click', () => void act(async () => {
  input('apiKey').value = ''; render(await send<PopupState>({ type: 'reset' }));
  $('rateSummary').textContent = 'Choose a source to get started.'; $('rateDetails').textContent = '';
  $('feedback').textContent = 'Preferences, rates, cache, and provider key cleared. Browser-granted permissions can be revoked above.';
}));
void act(async () => { render(await send<PopupState>({ type: 'getState' })); });
// Saving config and annotating the active tab complete asynchronously.
// Refresh counts while this popup is visible; closing it stops this timer.
setInterval(() => { if (!document.hidden) void viewStatus(); }, 1000);
