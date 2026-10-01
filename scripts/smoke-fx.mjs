// Explicit public-network smoke test. Never opens an IBKR page or uses a real profile/key.
import { chromium } from '@playwright/test';
import { cp, mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
const temporary = await mkdtemp(resolve(tmpdir(), 'usd-lens-fx-'));
let context;
try {
  await cp(resolve('dist/production'), temporary, { recursive: true });
  const manifest = JSON.parse(await readFile(resolve(temporary, 'manifest.json'), 'utf8'));
  // Test-only permission grant, in a disposable copy. Production remains optional.
  manifest.name += ' — isolated public FX smoke';
  manifest.host_permissions = ['https://api.frankfurter.dev/*'];
  manifest.optional_host_permissions = ['https://api.currencyapi.com/*'];
  await writeFile(resolve(temporary, 'manifest.json'), JSON.stringify(manifest));
  context = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${temporary}`, `--load-extension=${temporary}`] });
  const endpoint = 'https://api.frankfurter.dev/v2/rate/USD/KRW?providers=ecb';
  await context.route('**/*', route => route.request().url().startsWith('chrome-extension:') || route.request().url() === endpoint ? route.continue() : route.abort());
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const page = await context.newPage();
  await page.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);
  const saved = await page.evaluate(async () => chrome.runtime.sendMessage({ type: 'saveSettings', settings: { enabled: false, mode: 'ecb', placement: 'underneath', format: 'full', marketValue: true, cash: true, ecbEnabled: true, currencyapiEnabled: false, cadence: 'daily', manualRate: null } }));
  if (!saved.ok) throw new Error(saved.code);
  const reply = await page.evaluate(async () => chrome.runtime.sendMessage({ type: 'refresh' }));
  if (!reply.ok || reply.data?.connection !== 'ok' || reply.data?.rate?.source !== 'ecb') throw new Error(reply.code ?? reply.data?.code ?? 'SMOKE_FAILED');
  const report = { testedAt: new Date().toISOString(), browser: context.browser()?.version(), context: 'Production worker in disposable Chromium; ECB host permission pregranted in test-only manifest copy', endpoint, result: reply.data };
  await mkdir(resolve('output/playwright'), { recursive: true });
  await writeFile(resolve('output/playwright/fx-smoke.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await context?.close();
  const resolved = resolve(temporary);
  if (dirname(resolved) !== resolve(tmpdir()) || !basename(resolved).startsWith('usd-lens-fx-')) throw new Error('Unsafe temporary cleanup path');
  await rm(resolved, { recursive: true, force: true });
}
