import { test, expect, chromium, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { readFile, mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
let context: BrowserContext;
let worker: Worker;
let popup: Page;
let page: Page;
let extensionId: string;
let profile: string;
const extensionPath = resolve('dist/test');
const fixtureURL = 'http://127.0.0.1:4173/positions.html?extension=1#/positions';
const manualInput = { enabled: true, mode: 'manual', placement: 'underneath', format: 'full', marketValue: true, lastPrice: false, costBasis: false, avgPrice: false, dailyPnl: false, unrealizedPnl: false, cash: true, ecbEnabled: false, currencyapiEnabled: false, cadence: 'daily', manualRate: 1350 };
async function message<T = unknown>(value: unknown): Promise<T> {
  const reply = await popup.evaluate(async value => chrome.runtime.sendMessage(value), value) as { ok: boolean; data: T; code?: string };
  expect(reply.ok, reply.code).toBe(true); return reply.data;
}
async function configure(change: Record<string, unknown> = {}): Promise<void> {
  await message({ type: 'saveSettings', settings: { ...manualInput, ...change } });
  await page.bringToFront();
}
type DOMNode = { nodeValue: string; children?: DOMNode[]; shadowRoots?: DOMNode[] };
async function rendered(selector: string): Promise<string> {
  const session = await context.newCDPSession(page);
  try {
    const { root } = await session.send('DOM.getDocument', { depth: -1, pierce: true });
    const { nodeId } = await session.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    if (!nodeId) return '';
    const { node } = await session.send('DOM.describeNode', { nodeId, depth: -1, pierce: true });
    const text = (n: DOMNode): string => n.nodeValue + [...(n.children ?? []), ...(n.shadowRoots ?? [])].map(text).join('');
    return text(node);
  } finally { await session.detach(); }
}
async function contentEval(expression: string): Promise<unknown> {
  const session = await context.newCDPSession(page);
  const worlds: Array<{ id: number; name: string; origin: string }> = [];
  session.on('Runtime.executionContextCreated', event => worlds.push(event.context));
  await session.send('Runtime.enable');
  const world = worlds.find(w => w.name === extensionId || w.origin === `chrome-extension://${extensionId}`);
  expect(world, JSON.stringify(worlds)).toBeTruthy();
  const result = await session.send('Runtime.evaluate', { expression, contextId: world!.id, awaitPromise: true, returnByValue: true });
  await session.detach(); return result.result.value;
}
async function launch(): Promise<void> {
  context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true, viewport: { width: 1440, height: 1100 }, args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`] });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin === 'http://127.0.0.1:4173' || url.protocol === 'chrome-extension:' ? route.continue() : route.abort();
  });
  worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  extensionId = new URL(worker.url()).host;
}
test.beforeAll(async () => {
  profile = await mkdtemp(resolve(tmpdir(), 'usd-lens-fixture-'));
  await launch();
  await mkdir('output/playwright', { recursive: true });
});
test.afterAll(async () => {
  await context?.close();
  if (dirname(resolve(profile)) !== resolve(tmpdir()) || !basename(profile).startsWith('usd-lens-fixture-')) throw new Error('Unsafe test cleanup');
  await rm(profile, { recursive: true, force: true });
});
test.beforeEach(async () => {
  popup = await context.newPage(); await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.locator('#viewStatus')).not.toHaveText('Checking view…');
  await message({ type: 'reset' });
  // Tests replace worker fetch and permission checking only in this isolated process.
  // Production bundles contain no mock switch. Unmocked external requests are blocked.
  await worker.evaluate(() => {
    const scope = globalThis as unknown as { originalPermission?: typeof chrome.permissions.contains; requests: unknown[] };
    scope.originalPermission ??= chrome.permissions.contains.bind(chrome.permissions);
    chrome.permissions.contains = scope.originalPermission;
    scope.requests = [];
    globalThis.fetch = async () => { throw new Error('Fixture network disabled'); };
  });
  page = await context.newPage(); await page.goto(fixtureURL); await page.bringToFront();
});
test.afterEach(async () => { await page?.close(); await popup?.close(); });

test('production manifest and bundle enforce the discovery gate', async () => {
  const manifest = JSON.parse(await readFile('dist/production/manifest.json', 'utf8'));
  expect(manifest.permissions).toEqual(['storage']);
  expect(manifest.host_permissions).toBeUndefined();
  expect(manifest.content_scripts[0]).toMatchObject({ matches: ['https://portal.interactivebrokers.com/*'], world: 'ISOLATED', all_frames: false, run_at: 'document_idle' });
  expect(manifest.optional_host_permissions).toEqual(['https://api.frankfurter.dev/*', 'https://api.currencyapi.com/*']);
  expect(manifest.action.default_icon).toEqual(manifest.icons);
  for (const size of [16, 24, 32, 48, 128]) {
    expect(manifest.icons[size]).toBe(`icons/icon-${size}.png`);
    const png = await readFile(resolve('dist/production', manifest.icons[size]));
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(png.readUInt32BE(16)).toBe(size); expect(png.readUInt32BE(20)).toBe(size);
  }
  const content = await readFile('dist/production/content.js', 'utf8');
  expect(content).toContain('/dashboard/positions');
  expect(content).not.toMatch(/data-synthetic|data-fixture|127\.0\.0\.1|localhost/);
  const background = await readFile('dist/production/background.js', 'utf8');
  expect(background).not.toMatch(/127\.0\.0\.1|localhost|fetch\(["']https?:\/\/[^"\s]*interactivebrokers/);
});

test('popup has a stable intrinsic width when its initial viewport is narrow', async () => {
  await popup.setViewportSize({ width: 180, height: 600 });
  await popup.reload();
  await expect.poll(() => popup.locator('html').evaluate(el => el.getBoundingClientRect().width)).toBe(390);
  await expect.poll(() => popup.locator('body').evaluate(el => el.getBoundingClientRect().width)).toBe(390);
  await expect(popup.locator('#version')).toHaveText(`v${await worker.evaluate(() => chrome.runtime.getManifest().version)}`);
  await expect(popup.locator('body')).not.toContainText(/validation pending/i);
  await expect.poll(() => popup.locator('img.mark').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBe(128);
});

test('the actual toolbar popup autosizes and reports active fixture fields', async () => {
  await configure();
  await expect(page.locator('[data-usd-lens=estimate]')).toHaveCount(5);
  try {
    await popup.evaluate(async () => chrome.action.openPopup());
    await expect.poll(() => popup.evaluate(() => {
      const view = chrome.extension.getViews({ type: 'popup' })[0];
      if (!view) return null;
      return {
        width: view.document.body.getBoundingClientRect().width,
        fits: view.document.documentElement.scrollWidth <= view.innerWidth,
        counts: view.document.getElementById('counts')?.textContent,
      };
    })).toEqual({ width: 390, fits: true, counts: '5/5 fields' });
  } finally {
    await popup.evaluate(() => chrome.extension.getViews({ type: 'popup' }).forEach(view => view.close()));
  }
});
test('first-run popup, golden values, native copy and DOM export remain intact', async () => {
  const nativeBefore = await page.locator('[data-fixture-region]').allTextContents();
  await configure();
  await expect.poll(() => rendered('#equity-a')).toContain('≈ US$200,000.00');
  expect(await rendered('#equity-b')).toContain('≈ US$100,000.00');
  expect(await rendered('#krw-cash')).toContain('≈ −US$50,000.00');
  expect(await rendered('#small-position')).toContain('≈ US$1.00');
  expect(await rendered('#zero-position')).toContain('≈ US$0.00');
  await expect(page.locator('#usd-position [data-usd-lens], #abbreviated [data-usd-lens], [data-total] [data-usd-lens]')).toHaveCount(0);
  expect(await page.locator('[data-fixture-region]').allTextContents()).toEqual(nativeBefore);
  const copied = await page.locator('#equity-a [headers=mv]').evaluate(cell => { const range = document.createRange(); range.selectNodeContents(cell); const selection = getSelection()!; selection.removeAllRanges(); selection.addRange(range); const text = selection.toString(); selection.removeAllRanges(); return text; });
  expect(copied).toBe('270,000,000.00 KRW');
  await configure({ manualRate: 1500 });
  await expect.poll(() => rendered('#equity-a')).toContain('≈ US$180,000.00');
  await expect(page.locator('#equity-a [data-native-amount]')).toHaveText('270,000,000.00 KRW');
});
test('native updates, accounting parentheses, row reuse and detachment are handled', async () => {
  await configure(); await expect(page.locator('[data-usd-lens=estimate]')).toHaveCount(5);
  await page.locator('#changeValue').click();
  await expect.poll(() => rendered('#equity-a')).toContain('≈ US$300,000.00');
  await page.locator('#krw-cash [data-native-amount]').evaluate(node => { node.textContent = '(67,500,000.00)'; });
  await expect.poll(() => rendered('#krw-cash')).toContain('≈ −US$50,000.00');
  await page.locator('#recycle').click(); await expect(page.locator('#equity-a [data-usd-lens]')).toHaveCount(0);
  await page.locator('#equity-b').evaluate(row => row.remove());
  await expect(page.locator('[data-usd-lens=estimate]')).toHaveCount(3);
});
test('sorting, column reorder/hide, malformed values and field toggles stay scoped', async () => {
  await configure(); await expect(page.locator('[data-usd-lens=estimate]')).toHaveCount(5);
  await page.locator('#reorder').click(); await page.locator('#sortRows').click();
  await expect.poll(() => rendered('#equity-a')).toContain('≈ US$200,000.00');
  await page.locator('#mv').evaluate(node => { (node as HTMLElement).hidden = true; });
  await expect(page.locator('[data-fixture-region=holdings] [data-usd-lens=estimate]')).toHaveCount(0);
  await page.locator('#mv').evaluate(node => { (node as HTMLElement).hidden = false; });
  await expect(page.locator('[data-usd-lens=estimate]')).toHaveCount(5);
  await page.locator('#equity-a [data-native-amount]').evaluate(node => { node.textContent = '1.350,00 KRW'; });
  await expect(page.locator('#equity-a [data-usd-lens]')).toHaveCount(0);
  await configure({ marketValue: false }); await expect(page.locator('[data-usd-lens=estimate]')).toHaveCount(1);
  await configure({ cash: false }); await expect(page.locator('[data-usd-lens=estimate]')).toHaveCount(3);
});
test('navigation, structural replacement and the popup off switch remove owned nodes', async () => {
  await configure(); await expect(page.locator('[data-usd-lens=estimate]')).toHaveCount(5);
  await page.locator('#navigate').click(); await expect(page.locator('[data-usd-lens]')).toHaveCount(0);
  await page.locator('#navigate').click(); await expect(page.locator('[data-usd-lens=estimate]')).toHaveCount(5);
  await page.locator('#remount').click(); await expect(page.locator('[data-usd-lens=estimate]')).toHaveCount(5);
  await popup.reload(); await expect(popup.locator('#enabled')).toBeChecked();
  await popup.locator('#enabled').uncheck();
  await page.bringToFront(); await expect(page.locator('[data-usd-lens]')).toHaveCount(0);
  await popup.locator('#enabled').check(); await page.bringToFront();
  await expect(page.locator('[data-usd-lens=estimate]')).toHaveCount(5);
});
test('popup Manual setup, compact placement and reset work through the UI', async () => {
  await popup.bringToFront();
  await popup.locator('#mode').selectOption('manual'); await popup.locator('#manualRate').fill('1350');
  await popup.locator('#enabled').check(); await popup.locator('.preferences summary').click();
  await popup.locator('#format').selectOption('compact'); await popup.locator('#placement').selectOption('inline');
  await popup.locator('#save').click(); await expect(popup.locator('#feedback')).toContainText('Settings saved');
  await page.bringToFront(); await expect.poll(() => rendered('#equity-a')).toContain('≈ US$200k');
  await popup.locator('#reset').click(); await page.bringToFront(); await expect(page.locator('[data-usd-lens]')).toHaveCount(0);
  expect(await worker.evaluate(async () => chrome.storage.local.get())).toEqual({});
});
test('credentials never reach content messages or content-accessible storage', async () => {
  await message({ type: 'setKey', key: 'SYNTHETIC_NOT_A_REAL_KEY', remember: false });
  const local = await worker.evaluate(async () => chrome.storage.local.get());
  expect(local).not.toHaveProperty('providerKey');
  const session = await worker.evaluate(async () => chrome.storage.session.get('providerKey'));
  expect(session).toEqual({ providerKey: 'SYNTHETIC_NOT_A_REAL_KEY' });
  const sanitized = await contentEval('chrome.runtime.sendMessage({type:"getSettings"})');
  expect(JSON.stringify(sanitized)).not.toContain('SYNTHETIC_NOT_A_REAL_KEY');
  expect(await contentEval('chrome.runtime.sendMessage({type:"getState"})')).toEqual({ ok: false, code: 'INVALID_MESSAGE' });
  expect(await contentEval('chrome.runtime.sendMessage({type:"saveSettings",settings:{}})')).toEqual({ ok: false, code: 'INVALID_MESSAGE' });
  expect(await contentEval('chrome.runtime.sendMessage({type:"rate",generation:1,url:"https://unapproved.invalid",amount:123})')).toEqual({ ok: false, code: 'INVALID_MESSAGE' });
  expect(await contentEval('(async()=>{try{await chrome.storage.local.get();return "readable"}catch{return "denied"}})()')).toBe('denied');
  expect(await contentEval('(async()=>{try{await chrome.storage.session.get();return "readable"}catch{return "denied"}})()')).toBe('denied');
  await message({ type: 'setKey', key: 'SYNTHETIC_REMEMBERED_KEY', remember: true });
  expect(await worker.evaluate(async () => chrome.storage.session.get('providerKey'))).toEqual({});
  await message({ type: 'deleteKey' });
  expect(await worker.evaluate(async () => chrome.storage.local.get('providerKey'))).toEqual({});
  expect(await worker.evaluate(async () => chrome.storage.session.get('providerKey'))).toEqual({});
});
test('mocked external FX is fixed, cached across tabs and idle after tabs close', async () => {
  await worker.evaluate(() => {
    chrome.permissions.contains = async () => true;
    globalThis.fetch = async (url, init) => {
      (globalThis as unknown as { requests: unknown[] }).requests.push({ url: String(url), credentials: init?.credentials, referrerPolicy: init?.referrerPolicy, headers: init?.headers });
      return new Response(JSON.stringify({ date: new Date().toISOString().slice(0, 10), base: 'USD', quote: 'KRW', rate: 1350 }), { headers: { 'content-type': 'application/json' } });
    };
  });
  await configure({ mode: 'auto', ecbEnabled: true }); await expect.poll(() => rendered('#equity-a')).toContain('≈ US$200,000.00');
  const second = await context.newPage(); await second.goto(fixtureURL);
  await expect(second.locator('[data-usd-lens=estimate]')).toHaveCount(5);
  const requests = await worker.evaluate(() => (globalThis as unknown as { requests: unknown[] }).requests);
  expect(requests).toHaveLength(1);
  expect(requests[0]).toEqual({ url: 'https://api.frankfurter.dev/v2/rate/USD/KRW?providers=ecb', credentials: 'omit', referrerPolicy: 'no-referrer', headers: { Accept: 'application/json' } });
  await second.close();
  await message({ type: 'setEnabled', enabled: false }); await page.bringToFront(); await expect(page.locator('[data-usd-lens]')).toHaveCount(0);
  expect(await worker.evaluate(() => (globalThis as unknown as { requests: unknown[] }).requests.length)).toBe(1);
});
test('200 rows update within one second without duplicates or full-table rewrites', async () => {
  await configure(); await expect(page.locator('[data-usd-lens=estimate]')).toHaveCount(5);
  const start = performance.now(); await page.locator('#largeFixture').click();
  await expect(page.locator('[data-fixture-region=holdings] [data-usd-lens=estimate]')).toHaveCount(200, { timeout: 1000 });
  const initial = performance.now() - start;
  const before = await page.locator('[data-usd-lens=estimate]').count();
  const dom = await context.newCDPSession(page);
  await dom.send('DOM.getDocument', { depth: -1, pierce: true });
  let inserted = 0;
  dom.on('DOM.childNodeInserted', () => { inserted++; });
  const updateStart = performance.now();
  await page.locator('#synthetic-0 [data-native-amount]').evaluate(node => { node.textContent = '270,000,000.00 KRW'; });
  await expect.poll(() => rendered('#synthetic-0'), { timeout: 1000, intervals: [50, 100] }).toContain('≈ US$200,000.00');
  const update = performance.now() - updateStart;
  await dom.detach(); expect(inserted).toBeLessThan(10);
  expect(initial).toBeLessThan(1000); expect(update).toBeLessThan(1000);
  expect(await page.locator('[data-usd-lens=estimate]').count()).toBe(before);
  for (let i = 0; i < 4; i++) { await page.locator('#remount').click(); await expect(page.locator('[data-fixture-region=holdings] [data-usd-lens=estimate]')).toHaveCount(200); }
  const metrics = { initial200RowsMs: Math.round(initial), singleCellUpdateMs: Math.round(update), insertedNodesForSingleUpdate: inserted, browser: context.browser()?.version(), platform: process.platform, architecture: process.arch };
  console.log('Fixture timing:', JSON.stringify(metrics));
  await test.info().attach('performance', { body: JSON.stringify(metrics, null, 2), contentType: 'application/json' });
});
test('layout at desktop widths, browser zoom levels, and dark theme', async () => {
  await configure(); await expect(page.locator('[data-usd-lens=estimate]')).toHaveCount(5);
  for (const [width, zoom, dark] of [[1280, 1, false], [1440, 1.25, true], [1920, 1.5, false]] as const) {
    await page.setViewportSize({ width, height: 1150 });
    await page.bringToFront();
    await worker.evaluate(async zoom => { const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); if (tab?.id !== undefined) await chrome.tabs.setZoom(tab.id, zoom); }, zoom);
    await page.evaluate(dark => document.documentElement.classList.toggle('dark', dark), dark);
    await expect.poll(() => rendered('#equity-a')).toContain('≈ US$200,000.00');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    // Chromium's fullPage helper clips at non-default browser zoom. Capture physical bounds explicitly.
    const bounds = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight }));
    const screenshotSession = await context.newCDPSession(page);
    const screenshot = await screenshotSession.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: bounds.width * zoom, height: bounds.height * zoom, scale: 1 } });
    await screenshotSession.detach();
    await writeFile(`output/playwright/demo-${width}-${zoom * 100}-${dark ? 'dark' : 'light'}.png`, Buffer.from(screenshot.data, 'base64'));
  }
  await popup.bringToFront(); await popup.reload(); await popup.setViewportSize({ width: 410, height: 1100 });
  await popup.screenshot({ path: 'output/playwright/popup.png', fullPage: true });
});
test('a framework removing an active mount stops annotations until a new context', async () => {
  await configure(); await expect(page.locator('[data-usd-lens=estimate]')).toHaveCount(5);
  await page.locator('#equity-a [data-usd-lens]').evaluate(node => node.remove());
  await expect(page.locator('[data-usd-lens]')).toHaveCount(0);
  await page.locator('#changeValue').click(); await expect(page.locator('[data-usd-lens]')).toHaveCount(0);
  await page.locator('#remount').click(); await expect(page.locator('[data-usd-lens=estimate]')).toHaveCount(5);
});
test('visibility pauses work and expired manual data never returns as a number', async () => {
  await configure(); await expect(page.locator('[data-usd-lens=estimate]')).toHaveCount(5);
  await contentEval('Object.defineProperty(document,"hidden",{configurable:true,value:true});document.dispatchEvent(new Event("visibilitychange"));');
  await expect(page.locator('[data-usd-lens]')).toHaveCount(0);
  await contentEval('Date.now=(()=>{const future=Date.now()+8*86400000;return ()=>future})();Object.defineProperty(document,"hidden",{configurable:true,value:false});document.dispatchEvent(new Event("visibilitychange"));');
  await expect(page.locator('[data-usd-lens=estimate]')).toHaveCount(5);
  await expect.poll(() => rendered('#equity-a')).toContain('USD unavailable');
  expect(await rendered('#equity-a')).not.toContain('≈ US$');
});
test('permission decline and revocation preserve manual operation and clear external annotations', async () => {
  await popup.locator('.connections summary').click();
  await popup.evaluate(() => { chrome.permissions.request = async () => false; });
  await popup.locator('#ecbAccess').click(); await expect(popup.locator('#feedback')).toContainText('Permission declined');
  await worker.evaluate(() => {
    chrome.permissions.contains = async () => true;
    globalThis.fetch = async () => new Response(JSON.stringify({ date: new Date().toISOString().slice(0, 10), base: 'USD', quote: 'KRW', rate: 1350 }), { headers: { 'content-type': 'application/json' } });
  });
  await popup.evaluate(() => { chrome.permissions.request = async () => true; });
  await popup.locator('#ecbAccess').click(); await expect(popup.locator('#feedback')).toContainText('External source enabled');
  await configure({ mode: 'ecb', ecbEnabled: true }); await expect.poll(() => rendered('#equity-a')).toContain('≈ US$200,000.00');
  await worker.evaluate(() => { chrome.permissions.contains = async () => false; });
  await popup.evaluate(() => { chrome.permissions.remove = async () => true; });
  await popup.locator('#ecbAccess').click(); await page.bringToFront();
  await expect.poll(() => rendered('#equity-a')).toContain('USD unavailable');
  await configure(); await expect.poll(() => rendered('#equity-a')).toContain('≈ US$200,000.00');
});
test('a browser restart preserves external cache and migrates older column settings', async () => {
  await worker.evaluate(() => {
    chrome.permissions.contains = async () => true;
    globalThis.fetch = async () => new Response(JSON.stringify({ date: new Date().toISOString().slice(0, 10), base: 'USD', quote: 'KRW', rate: 1350 }), { headers: { 'content-type': 'application/json' } });
  });
  await configure({ mode: 'ecb', ecbEnabled: true }); await expect.poll(() => rendered('#equity-a')).toContain('≈ US$200,000.00');
  const before = await worker.evaluate(async () => (await chrome.storage.local.get('rates')).rates);
  const legacy = await worker.evaluate(async () => {
    const current = (await chrome.storage.local.get('settings')).settings as Record<string, unknown>;
    const { costBasis: _cost, lastPrice: _last, avgPrice: _avg, dailyPnl: _daily, unrealizedPnl: _unrealized, ...settings } = current;
    const previous = { ...settings, schemaVersion: 1 };
    await chrome.storage.local.set({ settings: previous });
    return previous;
  });
  await context.close();
  await launch();
  popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  page = await context.newPage();
  // Restore a test-only permission grant; no fetch mock is needed for a cached read.
  await worker.evaluate(() => { chrome.permissions.contains = async () => true; globalThis.fetch = async () => { throw new Error('Must use persisted cache'); }; });
  const response = await message<{ settings: unknown; lastRate: { rate: { rate: number } } }>({ type: 'getState' });
  expect(response.lastRate.rate.rate).toBe(1350);
  expect(response.settings).toEqual({ ...legacy, schemaVersion: 4, costBasis: true, lastPrice: true, avgPrice: true, dailyPnl: true, unrealizedPnl: true });
  expect(await worker.evaluate(async () => (await chrome.storage.local.get('rates')).rates)).toEqual(before);
});
