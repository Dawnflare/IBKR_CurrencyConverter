import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
let context: BrowserContext;
let page: Page;
let popup: Page;
const url = 'https://portal.interactivebrokers.com/portal/#/dashboard/positions';
const manual = { enabled: true, mode: 'manual', placement: 'underneath', format: 'full', marketValue: true, lastPrice: false, costBasis: false, avgPrice: false, dailyPnl: false, unrealizedPnl: false, cash: true, ecbEnabled: false, currencyapiEnabled: false, cadence: 'daily', manualRate: 1350 };
const allColumns = { avgPrice: true, dailyPnl: true, unrealizedPnl: true };
async function setup(changes: Record<string, unknown> = {}): Promise<void> {
  const response = await popup.evaluate(async settings => chrome.runtime.sendMessage({ type: 'saveSettings', settings }), { ...manual, ...changes });
  expect(response.ok).toBe(true); await page.bringToFront();
}
async function visibleText(selector: string, includeTitles = false): Promise<string> {
  const cdp = await context.newCDPSession(page);
  try {
    const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    if (!nodeId) return '';
    const { node } = await cdp.send('DOM.describeNode', { nodeId, depth: -1, pierce: true });
    type Node = { nodeValue: string; children?: Node[]; shadowRoots?: Node[]; attributes?: string[] };
    const content = (n: Node): string => n.nodeValue + (includeTitles && n.attributes?.includes('title') ? n.attributes[n.attributes.indexOf('title') + 1] : '') + [...(n.children ?? []), ...(n.shadowRoots ?? [])].map(content).join('');
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

test('all four KRW holding columns use the same rate without changing native values or geometry', async () => {
  const original = await page.locator('tbody').allTextContents();
  const heights = await page.locator('tbody tr').evaluateAll(rows => rows.map(row => row.getBoundingClientRect().height));
  await setup(allColumns);
  await expect(page.locator('[data-usd-lens=estimate]:visible')).toHaveCount(9);
  for (const [selector, estimate] of [
    ['#captured-a .market', '≈ US$200,000.00'], ['#captured-a .avg-price', '≈ US$1,000.00'],
    ['#captured-a .daily-pnl', '≈ US$2,000.00'], ['#captured-a .unrealized-pnl', '≈ US$10,000.00'],
    ['#captured-b .avg-price', '≈ US$200.00'], ['#captured-b .unrealized-pnl', '≈ −US$5,000.00'],
  ]) await expect.poll(() => visibleText(selector!)).toContain(estimate!);
  await expect(page.locator('#captured-usd [data-usd-lens], .cash-total [data-usd-lens], td.cost-basis [data-usd-lens]')).toHaveCount(0);
  expect(await page.locator('tbody').allTextContents()).toEqual(original);
  expect(await page.locator('tbody tr').evaluateAll(rows => rows.map(row => row.getBoundingClientRect().height))).toEqual(heights);
  const copied = await page.locator('#captured-a').evaluate(row => {
    const range = document.createRange(); range.selectNodeContents(row); const selection = getSelection()!;
    selection.removeAllRanges(); selection.addRange(range); const text = selection.toString(); selection.removeAllRanges(); return text;
  });
  expect(copied).not.toContain('US$');
  const colorsMatch = await page.locator('.daily-pnl, .unrealized-pnl').evaluateAll(cells => cells.every(cell => {
    const estimate = cell.querySelector('[data-usd-lens]'); const amount = cell.querySelector('span:not([data-usd-lens])');
    return !estimate || getComputedStyle(estimate).color === getComputedStyle(amount!).color;
  }));
  expect(colorsMatch).toBe(true);
  await page.screenshot({ path: 'output/playwright/all-columns.png', fullPage: true });
  await setup({ ...allColumns, manualRate: 1500 });
  await expect.poll(() => visibleText('#captured-a .avg-price')).toContain('≈ US$900.00');
  await expect.poll(() => visibleText('#captured-b .unrealized-pnl')).toContain('≈ −US$4,500.00');
});

test('added columns update independently, keep signs, and exclude ambiguous or abbreviated input', async () => {
  await setup(allColumns); await expect(page.locator('[data-usd-lens=estimate]:visible')).toHaveCount(9);
  await page.locator('#captured-b .daily-pnl > span:not([data-usd-lens])').evaluate(node => { node.textContent = '(1,350,000.00)'; node.setAttribute('class', '_nneg'); });
  await expect.poll(() => visibleText('#captured-b .daily-pnl')).toContain('≈ −US$1,000.00');
  await expect(page.locator('[data-usd-lens=estimate]:visible')).toHaveCount(9);
  await page.locator('#captured-a .avg-price > span:not([data-usd-lens])').evaluate(node => { node.textContent = '1.35M'; });
  await expect(page.locator('#captured-a .avg-price [data-usd-lens]')).toHaveCount(0);
  await page.locator('#captured-a .daily-pnl > .fs8').evaluate(node => { node.textContent = 'KRW / USD'; });
  await expect(page.locator('#captured-a .daily-pnl [data-usd-lens]')).toHaveCount(0);
  await page.locator('#captured-b .unrealized-pnl > .fs8').evaluate(node => { node.textContent = 'USD'; });
  await expect(page.locator('#captured-b .unrealized-pnl [data-usd-lens]')).toHaveCount(0);
  await expect(page.locator('[data-usd-lens=estimate]:visible')).toHaveCount(6);
  await page.locator('#captured-b .avg-price > span:not([data-usd-lens])').evaluate(node => { node.textContent = '0.00'; });
  await expect.poll(() => visibleText('#captured-b .avg-price')).toContain('≈ US$0.00');
});

test('new column header mapping and popup toggles are independent of Market Value', async () => {
  await setup({ ...allColumns, marketValue: false, cash: false });
  await expect(page.locator('[data-usd-lens=estimate]:visible')).toHaveCount(6);
  await page.locator('.ptf-positions table').evaluate(table => {
    const grid = table as HTMLTableElement;
    const avg = [...grid.tHead!.rows[0]!.cells].findIndex(header => header.textContent?.trim() === 'Avg Price');
    for (const row of grid.rows) row.insertBefore(row.cells[avg]!, row.cells[3]!);
    [...grid.tHead!.rows[0]!.cells].forEach((cell, index) => cell.setAttribute('aria-colindex', String(index + 1)));
  });
  await expect.poll(() => visibleText('#captured-a .avg-price')).toContain('≈ US$1,000.00');
  await page.locator('.ptf-positions table').evaluate(table => {
    table.querySelectorAll('.market').forEach(cell => cell.remove());
    [...(table as HTMLTableElement).tHead!.rows[0]!.cells].forEach((cell, index) => cell.setAttribute('aria-colindex', String(index + 1)));
  });
  await expect(page.locator('[data-usd-lens=estimate]:visible')).toHaveCount(6);
  await page.locator('th.daily-pnl').evaluate(header => { (header as HTMLElement).style.visibility = 'hidden'; });
  await expect.poll(() => page.locator('[data-usd-lens=estimate]').evaluateAll(hosts => hosts.map(host => `${host.closest('tr')!.id}/${host.parentElement!.className}/${getComputedStyle(host).visibility}`).sort())).toEqual([
    'captured-a/avg-price/visible', 'captured-a/unrealized-pnl/visible', 'captured-b/avg-price/visible', 'captured-b/unrealized-pnl/visible',
  ]);
  await popup.reload(); await popup.locator('.preferences summary').click();
  await expect(popup.locator('#avgPrice')).toBeChecked();
  await popup.locator('#avgPrice').uncheck(); await popup.locator('#save').click(); await page.bringToFront();
  await expect(page.locator('[data-usd-lens=estimate]:visible')).toHaveCount(2);
  await expect(page.locator('.unrealized-pnl [data-usd-lens=estimate]:visible')).toHaveCount(2);
  await popup.reload(); await expect(popup.locator('#avgPrice')).not.toBeChecked();
  await expect(popup.locator('#unrealizedPnl')).toBeChecked();
});

test('removing Avg Price preserves P&L with unchanged accessibility column indexes', async () => {
  await setup({ ...allColumns, avgPrice: false });
  await expect(page.locator('[data-usd-lens=estimate]:visible')).toHaveCount(7);
  await page.locator('.ptf-positions .avg-price').evaluateAll(cells => cells.forEach(cell => cell.remove()));
  await page.locator('#captured-a .daily-pnl > span:not([data-usd-lens])').evaluate(amount => { amount.textContent = '4,050,000.00'; });
  await expect.poll(() => visibleText('#captured-a .daily-pnl')).toContain('≈ US$3,000.00');
  await expect(page.locator('[data-usd-lens=estimate]:visible')).toHaveCount(7);
  await expect.poll(() => visibleText('#captured-b .unrealized-pnl')).toContain('≈ −US$5,000.00');
});

test('Last converts row currency and previous-close markers without changing native text or geometry', async () => {
  await page.locator('.ptf-positions .avg-price').evaluateAll(cells => cells.forEach(cell => cell.remove()));
  await page.locator('#captured-a .last-price > span').evaluate(amount => { amount.innerHTML = '<span>C</span><span>1350000</span>'; });
  await page.locator('#captured-usd .last-price > span').evaluate(amount => { amount.textContent = 'C50'; });
  const native = await page.locator('tbody').allTextContents();
  const heights = await page.locator('tbody tr').evaluateAll(rows => rows.map(row => row.getBoundingClientRect().height));
  await setup({ ...allColumns, avgPrice: false, lastPrice: true });
  await expect(page.locator('[data-usd-lens=estimate]:visible')).toHaveCount(9);
  await expect.poll(() => visibleText('#captured-a .last-price', true)).toContain('Last: previous market close (C).');
  await expect.poll(() => visibleText('#captured-a .last-price')).toContain('≈ US$1,000.00');
  await expect.poll(() => visibleText('#captured-b .last-price')).toContain('≈ US$1,000.00');
  await expect(page.locator('#captured-usd [data-usd-lens]')).toHaveCount(0);
  expect(await page.locator('tbody').allTextContents()).toEqual(native);
  expect(await page.locator('tbody tr').evaluateAll(rows => rows.map(row => row.getBoundingClientRect().height))).toEqual(heights);
  await page.screenshot({ path: 'output/playwright/last-price-no-avg.png', fullPage: true });
  await setup({ ...allColumns, avgPrice: false, lastPrice: true, manualRate: 1500 });
  await expect.poll(() => visibleText('#captured-a .last-price')).toContain('≈ US$900.00');
  await page.locator('#captured-a .last-price > span:not([data-usd-lens])').evaluate(amount => { amount.textContent = '2700000'; });
  await expect.poll(() => visibleText('#captured-a .last-price')).toContain('≈ US$1,800.00');
  await expect.poll(() => visibleText('#captured-a .last-price', true)).not.toContain('previous market close');
});

test('Last uses remaining row currency labels even when their conversions are disabled', async () => {
  await page.locator('.ptf-positions').evaluate(region => {
    region.querySelectorAll('.market,.avg-price,.daily-pnl,.unrealized-pnl').forEach(cell => cell.remove());
    // An unrelated currency in an instrument name must not be used as currency evidence.
    region.querySelector('#captured-a .instrument')!.textContent = 'Fictional USD label';
  });
  await setup({ marketValue: false, lastPrice: true, cash: false });
  await expect.poll(() => visibleText('#captured-a .last-price')).toContain('≈ US$1,000.00');
  await expect(page.locator('[data-usd-lens=estimate]:visible')).toHaveCount(2);
  await page.locator('#captured-a .cost-basis .fs8').evaluate(currency => { currency.textContent = 'USD'; });
  await expect(page.locator('#captured-a .last-price [data-usd-lens]')).toHaveCount(0);
  await page.locator('#captured-usd .cost-basis .fs8').evaluate(currency => { currency.textContent = 'KRW'; });
  await expect.poll(() => visibleText('#captured-usd .last-price')).toContain('≈ US$0.04');
  await page.locator('.ptf-positions .cost-basis').evaluateAll(cells => cells.forEach(cell => cell.remove()));
  await expect(page.locator('[data-usd-lens=estimate]')).toHaveCount(0);
});

test('Last skips conflicting currency and malformed prices without affecting other fields', async () => {
  await setup({ ...allColumns, lastPrice: true });
  await expect(page.locator('[data-usd-lens=estimate]:visible')).toHaveCount(11);
  await page.locator('#captured-a .cost-basis .fs8').evaluate(currency => { currency.textContent = 'USD'; });
  await expect(page.locator('#captured-a .last-price [data-usd-lens]')).toHaveCount(0);
  await expect(page.locator('[data-usd-lens=estimate]:visible')).toHaveCount(10);
  await page.locator('#captured-a .cost-basis .fs8').evaluate(currency => { currency.textContent = 'KRW'; });
  await expect(page.locator('#captured-a .last-price [data-usd-lens]:visible')).toHaveCount(1);
  for (const [index, value] of ['C1.35M', 'CC1350000', 'C', '1350000C', '—'].entries()) {
    await page.locator('#captured-a .last-price > span:not([data-usd-lens])').evaluate((amount, value) => { amount.textContent = value; }, value);
    // A separate valid price changes too, ensuring this observer batch has completed.
    await page.locator('#captured-b .last-price > span:not([data-usd-lens])').evaluate((amount, index) => { amount.textContent = String(1350 * (index + 1)); }, index);
    await expect.poll(() => visibleText('#captured-b .last-price')).toContain(`≈ US$${index + 1}.00`);
    await expect(page.locator('#captured-a .last-price [data-usd-lens]')).toHaveCount(0);
    await expect(page.locator('[data-usd-lens=estimate]:visible')).toHaveCount(10);
  }
  await page.locator('#captured-a .last-price > span:not([data-usd-lens])').evaluate(amount => { amount.textContent = 'C 1,350,000.00'; });
  await expect.poll(() => visibleText('#captured-a .last-price')).toContain('≈ US$1,000.00');
  await page.locator('#captured-a .daily-pnl > span:not([data-usd-lens])').evaluate(amount => { amount.textContent = 'C1350000'; });
  await expect(page.locator('#captured-a .daily-pnl [data-usd-lens]')).toHaveCount(0);
});

test('Last and P&L follow reorder, hide, restore, and absent accessibility indexes', async () => {
  await setup({ ...allColumns, lastPrice: true });
  await expect(page.locator('[data-usd-lens=estimate]:visible')).toHaveCount(11);
  await page.locator('.ptf-positions table').evaluate(element => {
    const table = element as HTMLTableElement;
    for (const row of table.rows) row.insertBefore(row.querySelector('.last-price')!, row.cells[2]!);
    table.querySelectorAll('.avg-price').forEach(cell => { (cell as HTMLElement).hidden = true; });
    table.querySelectorAll('[aria-colindex]').forEach(header => header.removeAttribute('aria-colindex'));
    table.querySelector('#captured-a .daily-pnl > span')!.textContent = '4,050,000.00';
  });
  await expect.poll(() => visibleText('#captured-a .daily-pnl')).toContain('≈ US$3,000.00');
  await expect(page.locator('[data-usd-lens=estimate]:visible')).toHaveCount(9);
  await page.locator('.last-price').evaluateAll(cells => cells.forEach(cell => { (cell as HTMLElement).style.display = 'none'; }));
  await expect(page.locator('.last-price [data-usd-lens]')).toHaveCount(0);
  await expect(page.locator('.daily-pnl [data-usd-lens]:visible,.unrealized-pnl [data-usd-lens]:visible')).toHaveCount(4);
  await page.locator('.ptf-positions table').evaluate(table => {
    table.querySelectorAll('.last-price').forEach(cell => { (cell as HTMLElement).style.display = ''; });
    table.querySelectorAll('.avg-price').forEach(cell => { (cell as HTMLElement).hidden = false; });
  });
  await expect(page.locator('[data-usd-lens=estimate]:visible')).toHaveCount(11);
  await popup.reload(); await popup.locator('.preferences summary').click();
  await expect(popup.locator('#lastPrice')).toBeChecked();
  await popup.locator('#lastPrice').uncheck(); await popup.locator('#save').click(); await page.bringToFront();
  await expect(page.locator('.last-price [data-usd-lens]')).toHaveCount(0);
  await expect(page.locator('[data-usd-lens=estimate]:visible')).toHaveCount(9);
  await popup.reload(); await expect(popup.locator('#lastPrice')).not.toBeChecked();
  await expect(popup.locator('#dailyPnl')).toBeChecked();
});

test('Cost Basis expands millions and shares the FX rate without changing native text or layout', async () => {
  await page.locator('.ptf-positions .avg-price').evaluateAll(cells => cells.forEach(cell => cell.remove()));
  await page.locator('#captured-b .cost-basis > span').evaluate(amount => { amount.textContent = '34.5M'; });
  const native = await page.locator('tbody').allTextContents();
  const heights = await page.locator('tbody tr').evaluateAll(rows => rows.map(row => row.getBoundingClientRect().height));
  await setup({ ...allColumns, avgPrice: false, lastPrice: true, costBasis: true });
  await expect(page.locator('[data-usd-lens=estimate]:visible')).toHaveCount(11);
  await expect.poll(() => visibleText('#captured-a .cost-basis')).toContain('≈ US$185,185.19');
  await expect.poll(() => visibleText('#captured-b .cost-basis')).toContain('≈ US$25,555.56');
  await expect.poll(() => visibleText('#captured-a .cost-basis', true)).toContain('M means million (×1,000,000)');
  await expect(page.locator('#captured-usd [data-usd-lens]')).toHaveCount(0);
  expect(await page.locator('tbody').allTextContents()).toEqual(native);
  expect(await page.locator('tbody tr').evaluateAll(rows => rows.map(row => row.getBoundingClientRect().height))).toEqual(heights);
  const copy = await page.locator('#captured-a .cost-basis').evaluate(cell => {
    const range = document.createRange(); range.selectNodeContents(cell); const selection = getSelection()!;
    selection.removeAllRanges(); selection.addRange(range); const text = selection.toString(); selection.removeAllRanges(); return text;
  });
  expect(copy).toContain('250M'); expect(copy).not.toContain('US$');
  await page.screenshot({ path: 'output/playwright/cost-basis-millions.png', fullPage: true });
  await setup({ ...allColumns, avgPrice: false, lastPrice: true, costBasis: true, manualRate: 1500 });
  await expect.poll(() => visibleText('#captured-a .cost-basis')).toContain('≈ US$166,666.67');
  await expect.poll(() => visibleText('#captured-b .cost-basis')).toContain('≈ US$23,000.00');
  await expect.poll(() => visibleText('#captured-a .last-price')).toContain('≈ US$900.00');
});

test('Cost Basis handles signs, full amounts, invalid input and exact-cell currency changes', async () => {
  await setup({ marketValue: false, cash: false, costBasis: true });
  await expect(page.locator('[data-usd-lens=estimate]:visible')).toHaveCount(2);
  for (const [value, estimate] of [
    ['(2.7M)', '≈ −US$2,000.00'], ['+1,350.00', '≈ US$1.00'], ['−0M', '≈ US$0.00'],
  ]) {
    await page.locator('#captured-a .cost-basis > span:not([data-usd-lens])').evaluate((amount, text) => { amount.textContent = text!; }, value);
    await expect.poll(() => visibleText('#captured-a .cost-basis')).toContain(estimate!);
  }
  for (const [index, value] of ['2.7MM', 'C2.7M', '2.7B', '1,000,001M', '—'].entries()) {
    await page.locator('#captured-a .cost-basis > span:not([data-usd-lens])').evaluate((amount, text) => { amount.textContent = text; }, value);
    await page.locator('#captured-b .cost-basis > span:not([data-usd-lens])').evaluate((amount, index) => { amount.textContent = String(1350 * (index + 1)); }, index);
    await expect.poll(() => visibleText('#captured-b .cost-basis')).toContain(`≈ US$${index + 1}.00`);
    await expect(page.locator('#captured-a .cost-basis [data-usd-lens]')).toHaveCount(0);
  }
  await page.locator('#captured-a .cost-basis > span:not([data-usd-lens])').evaluate(amount => { amount.textContent = '2.7M'; });
  await expect.poll(() => visibleText('#captured-a .cost-basis')).toContain('≈ US$2,000.00');
  await page.locator('#captured-a .cost-basis .fs8').evaluate(currency => { currency.textContent = 'USD'; });
  await expect(page.locator('#captured-a .cost-basis [data-usd-lens]')).toHaveCount(0);
  await page.locator('#captured-b .cost-basis .fs8').evaluate(currency => { currency.textContent = 'KRW / USD'; });
  await expect(page.locator('[data-usd-lens=estimate]')).toHaveCount(0);
});

test('Cost Basis follows column changes and has an independent saved popup toggle', async () => {
  await setup({ ...allColumns, costBasis: true, lastPrice: true });
  await expect(page.locator('[data-usd-lens=estimate]:visible')).toHaveCount(13);
  await page.locator('.ptf-positions table').evaluate(element => {
    const table = element as HTMLTableElement;
    for (const row of table.rows) row.insertBefore(row.querySelector('.cost-basis')!, row.cells[3]!);
    table.querySelectorAll('.avg-price').forEach(cell => cell.remove());
    table.querySelector('#captured-a .cost-basis > span')!.textContent = '270M';
  });
  await expect.poll(() => visibleText('#captured-a .cost-basis')).toContain('≈ US$200,000.00');
  await expect(page.locator('[data-usd-lens=estimate]:visible')).toHaveCount(11);
  await page.locator('.cost-basis').evaluateAll(cells => cells.forEach(cell => { (cell as HTMLElement).hidden = true; }));
  await expect(page.locator('.cost-basis [data-usd-lens]')).toHaveCount(0);
  await expect(page.locator('[data-usd-lens=estimate]:visible')).toHaveCount(9);
  await page.locator('.cost-basis').evaluateAll(cells => cells.forEach(cell => { (cell as HTMLElement).hidden = false; }));
  await expect(page.locator('[data-usd-lens=estimate]:visible')).toHaveCount(11);
  await popup.reload(); await popup.locator('.preferences summary').click();
  await expect(popup.locator('#costBasis')).toBeChecked();
  await popup.locator('#costBasis').uncheck(); await popup.locator('#save').click(); await page.bringToFront();
  await expect(page.locator('.cost-basis [data-usd-lens]')).toHaveCount(0);
  await expect(page.locator('[data-usd-lens=estimate]:visible')).toHaveCount(9);
  await popup.reload(); await expect(popup.locator('#costBasis')).not.toBeChecked();
  await expect(popup.locator('#lastPrice')).toBeChecked();
  await expect(popup.locator('#dailyPnl')).toBeChecked();
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

test('all added columns fit safely at desktop zoom levels in both themes', async () => {
  await setup(allColumns);
  for (const [width, zoom] of [[1280, 1], [1440, 1.25], [1920, 1.5]] as const) {
    await page.setViewportSize({ width, height: 1100 }); await page.bringToFront();
    await popup.evaluate(async zoom => { const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); if (tab?.id !== undefined) await chrome.tabs.setZoom(tab.id, zoom); }, zoom);
    for (const light of [false, true]) {
      await page.evaluate(light => document.body.classList.toggle('light', light), light);
      await expect.poll(() => page.locator('[data-usd-lens=estimate]').evaluateAll(hosts => hosts.length === 9 && hosts.every(host => {
        const a = host.getBoundingClientRect(); const c = host.closest('td')!.getBoundingClientRect();
        return getComputedStyle(host).visibility === 'visible' && a.left >= c.left && a.right <= c.right && a.top >= c.top && a.bottom <= c.bottom;
      }))).toBe(true);
    }
  }
});
