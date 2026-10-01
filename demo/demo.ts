import { LensEngine } from '../src/content/engine';
import { adapter } from '../tests/fixtures/site-adapter';
import { DEFAULT_SETTINGS, type Settings } from '../src/core/types';
import { manualRecord } from '../src/core/rates';
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const extensionMode = new URLSearchParams(location.search).has('extension');
if (!location.hash) location.hash = '/positions';
let settings: Settings = { ...DEFAULT_SETTINGS, setupComplete: true, enabled: true, mode: 'manual', manualRate: 1350, manualEnteredAt: Date.now() };
const engine = extensionMode ? null : new LensEngine(adapter, { rate: async () => ({ rate: manualRecord(settings.manualRate!, settings.manualEnteredAt!), code: null, connection: 'manual', nextAttemptAt: null }), release: () => {} });
function configure(): void {
  settings = { ...settings, enabled: $<HTMLInputElement>('demoEnabled').checked, manualRate: Number($<HTMLSelectElement>('demoRate').value), format: $<HTMLSelectElement>('demoFormat').value as 'full' | 'compact', manualEnteredAt: Date.now() };
  engine?.configure(settings);
}
if (extensionMode) {
  for (const id of ['demoRate', 'demoFormat', 'demoEnabled']) ($<HTMLInputElement>(id)).disabled = true;
  $('demoState').textContent = 'Controlled by test extension popup';
} else { configure(); for (const id of ['demoRate', 'demoFormat', 'demoEnabled']) $(id).addEventListener('change', configure); }
$('theme').addEventListener('click', () => document.documentElement.classList.toggle('dark'));
$('changeValue').addEventListener('click', () => { const node = document.querySelector('#equity-a [data-native-amount]'); if (node) node.textContent = '405,000,000.00 KRW'; });
$('recycle').addEventListener('click', () => { const cell = document.querySelector<HTMLElement>('#equity-a [data-currency]'); if (cell) { cell.dataset.currency = 'USD'; cell.querySelector('[data-native-amount]')!.textContent = '500.00 USD'; } });
$('sortRows').addEventListener('click', () => {
  const body = document.querySelector('[data-fixture-region=holdings] tbody')!;
  const rows = [...body.querySelectorAll('tr')];
  rows.sort((a, b) => Number(b.querySelector('[headers=mv]')?.textContent?.replace(/[^0-9.]/g, '')) - Number(a.querySelector('[headers=mv]')?.textContent?.replace(/[^0-9.]/g, '')));
  body.append(...rows);
});
$('reorder').addEventListener('click', () => { for (const row of document.querySelectorAll('[data-fixture-region=holdings] tr')) { const cell = [...row.children].find(c => c.id === 'mv' || c.getAttribute('headers') === 'mv'); if (cell) row.insertBefore(cell, row.children[1] ?? null); } });
$('largeFixture').addEventListener('click', () => {
  const body = document.querySelector('[data-fixture-region=holdings] tbody')!;
  const template = $('equity-b'); const fragment = document.createDocumentFragment();
  for (let i = 0; i < 200; i++) {
    const row = template.cloneNode(true) as HTMLElement; row.id = `synthetic-${i}`;
    row.querySelectorAll('[data-usd-lens]').forEach(n => n.remove());
    row.querySelector('[headers=symbol]')!.textContent = `Fictional equity ${i + 1}`;
    fragment.append(row);
  }
  body.replaceChildren(fragment);
});
$('navigate').addEventListener('click', () => { location.hash = location.hash === '#/positions' ? '/unrelated' : '/positions'; });
$('remount').addEventListener('click', () => {
  const view = document.querySelector('[data-synthetic-positions]')!;
  const clone = view.cloneNode(true) as HTMLElement; clone.querySelectorAll('[data-usd-lens]').forEach(n => n.remove()); view.replaceWith(clone);
});
