import { adapter } from '../site/production';
import { send } from '../core/messages';
import type { RateResult, Settings } from '../core/types';
import { LensEngine } from './engine';
const engine = new LensEngine(adapter, {
  rate: generation => send<RateResult>({ type: 'rate', generation }),
  release: generation => { void send({ type: 'release', generation }).catch(() => {}); },
});
let sequence = 0;
async function configure(): Promise<void> {
  const current = ++sequence;
  try { const state = await send<{ settings: Settings }>({ type: 'getSettings' }); if (sequence === current) engine.configure(state.settings); } catch { /* Unsupported/unavailable worker leaves native page intact. */ }
}
chrome.runtime.onMessage.addListener((message: unknown, sender, respond) => {
  if (sender.id !== chrome.runtime.id || !message || typeof message !== 'object') return;
  const type = (message as { type?: string }).type;
  if (type === 'settingsChanged') { respond(null); void configure(); }
  if (type === 'viewStatus') respond(engine.status());
});
void configure();
