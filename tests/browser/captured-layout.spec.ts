import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
let context: BrowserContext;
let page: Page;
let popup: Page;
const url = 'https://portal.interactivebrokers.com/portal/#/dashboard/positions';
const manual = { enabled: true, mode: 'manual', placement: 'underneath', format: 'full', marketValue: true, cash: true, ecbEnabled: false, currencyapiEnabled: false, cadence: 'daily', manualRate: 1350 };
async function setup(changes: Record<string, unknown> = {}): Promise<void> {
  const response = await popup.evaluate(async settings => chrome.runtime.sendMessage({ type: 'saveSettings', settings }), { ...manual, ...changes });
  expect(response.ok).toBe(true); await page.bringToFront();
}
async function visibleText(selector: string): Promise<string> {
  const cdp = await context.newCDPSession(page);
  try {
    const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    if (!nodeId) return '';
    const { node } = await cdp.send('DOM.describeNode', { nodeId, depth: -1, pierce: true });
    type Node = { nodeValue: string; children?: Node[]; shadowRoots?: Node[] };
    const content = (n: Node): string => n.nodeValue + [...(n.children ?? []), ...(n.shadowRoots ?? [])].map(content).join('');
    return content(node);
  } finally { await cdp.detach(); }
}
test.beforeAll(async () => {
  const extension = resolve('dist/production');
  context = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true, viewport: { width: 1920, height: 1000 }, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  const html = await readFile('tests/fixtures/captured-positions.html', 'utf8');
  // Every portal document is fulfilled from fictional local HTML. No brokerage request is sent.
  await context.route('**/*', route => {
    const request = route.request(); const target = new URL(request.url());
    if (target.protocol === 'chrome-extension:') return route.continue();
    if (target.origin === 'https://portal.interactivebrokers.com' && request.isNavigationRequest() && request.resourceType() === 'document') return route.fulfill({ contentType: 'text/html', body: html });
    return route.abort();
  });
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  popup = await context.newPage(); await popup.goto(`chrome-extension://${id}/popup.html`);
  await mkdir('output/playwright', { recursive: true });
});
test.beforeEach(async () => {
  await popup.evaluate(async () => chrome.runtime.sendMessage({ type: 'reset' }));
  page = await context.newPage(); await page.goto(url);
});
test.afterEach(async () => { await page.close(); });
test.afterAll(async () => { await context.close(); });
test('production selectors annotate captured structure without changing row sizes or native text', async () => {
  await expect(page.locator('.ptf-positions table > tbody')).toHaveCount(3);
  const native = await page.locator('tbody').allTextContents();
  const heights = await page.locator('tbody tr').evaluateAll(rows => rows.map(row => row.getBoundingClientRect().height));
  await setup();
  await expect.poll(() => visibleText('#captured-a')).toContain('≈ US$200,000.00');
  await expect.poll(() => visibleText('#captured-cash')).toContain('≈ −US$50,000.00');
  await expect(page.locator('[data-usd-lens=estimate]:visible')).toHaveCount(3);
  await expect(page.locator('#captured-usd [data-usd-lens], .cash-total [data-usd-lens]')).toHaveCount(0);
  expect(await page.locator('tbody').allTextContents()).toEqual(native);
  expect(await page.locator('tbody tr').evaluateAll(rows => rows.map(row => row.getBoundingClientRect().height))).toEqual(heights);
  const positions = await page.locator('[data-usd-lens=estimate]').evaluateAll(hosts => hosts.map(host => {
    const rect = host.getBoundingClientRect(); const cell = host.closest('td')!.getBoundingClientRect();
    return rect.left >= cell.left && rect.right <= cell.right && rect.top >= cell.top && rect.bottom <= cell.bottom;
  })); expect(positions.every(Boolean)).toBe(true);
  const copy = await page.locator('#captured-a .market').evaluate(cell => { const range = document.createRange(); range.selectNodeContents(cell); const s = getSelection()!; s.removeAllRanges(); s.addRange(range); const text = s.toString(); s.removeAllRanges(); return text; });
  expect(copy).not.toContain('US$');
  await page.screenshot({ path: 'output/playwright/captured-layout.png', fullPage: true });
});

test('separate holding bodies support updates, replacement, removal and regrouping', async () => {
  await setup();
  await expect(page.locator('[data-usd-lens=estimate]:visible')).toHaveCount(3);
  await page.locator('#captured-b .market > span:not([data-usd-lens]) > div:first-child > span').evaluate(node => { node.textContent = '405,000,000.00'; });
  await expect.poll(() => visibleText('#captured-b')).toContain('≈ US$300,000.00');
  await page.locator('#captured-b').evaluate(row => {
    const body = row.parentElement!; const table = body.parentElement as HTMLTableElement;
    table.insertBefore(body, table.tBodies[0]!);
  });
  await expect(page.locator('[data-usd-lens=estimate]:visible')).toHaveCount(3);
  await page.locator('#captured-b').evaluate(row => {
    const body = row.parentElement!; const replacement = body.cloneNode(true) as HTMLElement;
    replacement.querySelectorAll('[data-usd-lens]').forEach(node => node.remove());
    body.replaceWith(replacement);
  });
  await expect.poll(() => visibleText('#captured-b')).toContain('≈ US$300,000.00');
  await page.locator('#captured-a').evaluate(row => row.parentElement!.remove());
  await expect(page.locator('[data-usd-lens=estimate]:visible')).toHaveCount(2);
  await page.locator('#captured-b').evaluate(row => {
    const previousBody = row.parentElement!;
    document.getElementById('captured-usd')!.parentElement!.append(row);
    previousBody.remove();
  });
  await expect(page.locator('.ptf-positions table > tbody')).toHaveCount(1);
  await expect.poll(() => visibleText('#captured-b')).toContain('≈ US$300,000.00');
  await expect(page.locator('[data-usd-lens=estimate]:visible')).toHaveCount(2);
});
test('production mapping follows header changes and excludes ambiguous or abbreviated cells', async () => {
  await setup(); await expect(page.locator('[data-usd-lens=estimate]:visible')).toHaveCount(3);
  await page.locator('.ptf-positions table').evaluate(table => {
    for (const row of (table as HTMLTableElement).rows) { const cell = row.cells[6]!; row.insertBefore(cell, row.cells[3]!); }
    [...(table as HTMLTableElement).tHead!.rows[0]!.cells].forEach((cell, index) => cell.setAttribute('aria-colindex', String(index + 1)));
  });
  await expect.poll(() => visibleText('#captured-a')).toContain('≈ US$200,000.00');
  await page.locator('#captured-a .market > span:not([data-usd-lens]) > div:first-child > span').evaluate(node => { node.textContent = '270M'; });
  await expect(page.locator('#captured-a [data-usd-lens]')).toHaveCount(0);
  await page.locator('#captured-b .market > span:not([data-usd-lens]) > .fs8').evaluate(node => { node.textContent = 'KRW / USD'; });
  await expect(page.locator('#captured-b [data-usd-lens]')).toHaveCount(0);
  await page.locator('#captured-cash td:first-child').evaluate(node => { node.textContent = 'USD'; });
  await expect(page.locator('[data-usd-lens=estimate]')).toHaveCount(0);
});
test('unsupported routes/layouts are untouched and constrained space hides estimates', async () => {
  await page.goto('https://portal.interactivebrokers.com/portal/#/orders'); await setup();
  await expect(page.locator('[data-usd-lens]')).toHaveCount(0);
  await page.goto(url); await expect(page.locator('[data-usd-lens=estimate]:visible')).toHaveCount(3);
  await page.locator('.market').evaluateAll(nodes => nodes.forEach(node => { (node as HTMLElement).style.width = '45px'; (node as HTMLElement).style.maxWidth = '45px'; }));
  await expect(page.locator('.ptf-positions [data-usd-lens=estimate]:visible')).toHaveCount(0);
  await expect.poll(() => visibleText('.ptf-positions')).toContain('UNSUPPORTED_VIEW');
  await page.locator('h3').first().evaluate(node => { node.textContent = 'Unrecognized view'; });
  await expect(page.locator('[data-usd-lens]')).toHaveCount(0);
});
test('production overlays track scroll/resize and preserve native controls', async () => {
  await setup(); await expect(page.locator('[data-usd-lens=estimate]:visible')).toHaveCount(3);
  await page.locator('#native-control').evaluate(button => button.addEventListener('click', () => { button.textContent = 'Native handler preserved'; }));
  await page.locator('#native-control').click(); await expect(page.locator('#native-control')).toHaveText('Native handler preserved');
  await page.evaluate(() => { document.body.style.minHeight = '1800px'; window.scrollTo(0, 160); });
  await expect(page.locator('#captured-a [data-usd-lens=estimate]:visible')).toHaveCount(1);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.locator('#captured-cash [data-usd-lens=estimate]:visible')).toHaveCount(1);
  const bounds = await page.locator('#captured-cash [data-usd-lens]').evaluate(host => { const h = host.getBoundingClientRect(); const c = host.closest('td')!.getBoundingClientRect(); return h.left >= c.left && h.right <= c.right && h.top >= c.top && h.bottom <= c.bottom; });
  expect(bounds).toBe(true);
});
test('production overlays respect covering UI and target desktop zoom levels', async () => {
  await setup(); await expect(page.locator('[data-usd-lens=estimate]:visible')).toHaveCount(3);
  await page.locator('#captured-a .market').evaluate(cell => {
    const rect = cell.getBoundingClientRect(); const cover = document.createElement('div'); cover.id = 'fixture-native-overlay';
    Object.assign(cover.style, { position: 'fixed', zIndex: '100', left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, background: 'gray' });
    document.body.append(cover); window.dispatchEvent(new Event('resize'));
  });
  await expect(page.locator('#captured-a [data-usd-lens=estimate]:visible')).toHaveCount(0);
  await page.locator('#fixture-native-overlay').evaluate(node => { node.remove(); window.dispatchEvent(new Event('resize')); });
  await expect(page.locator('#captured-a [data-usd-lens=estimate]:visible')).toHaveCount(1);
  for (const [width, zoom] of [[1280, 1], [1440, 1.25], [1920, 1.5]] as const) {
    await page.setViewportSize({ width, height: 1100 }); await page.bringToFront();
    await popup.evaluate(async zoom => { const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); if (tab?.id !== undefined) await chrome.tabs.setZoom(tab.id, zoom); }, zoom);
    await expect(page.locator('[data-usd-lens=estimate]:visible')).toHaveCount(3);
    // Chrome resolves setZoom before delivering the resize event and the layout frame.
    await expect.poll(() => page.locator('[data-usd-lens=estimate]').evaluateAll(hosts => hosts.length === 3 && hosts.every(host => {
      const a = host.getBoundingClientRect(); const c = host.closest('td')!.getBoundingClientRect();
      return getComputedStyle(host).visibility === 'visible' && a.left >= c.left && a.right <= c.right && a.top >= c.top && a.bottom <= c.bottom;
    }))).toBe(true);
  }
});
