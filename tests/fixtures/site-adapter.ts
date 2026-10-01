import type { SiteAdapter, Region, ReadResult, Candidate } from '../../src/site/adapter';

/** Synthetic contract only. This file is never included in the production build. */
export const adapter: SiteAdapter = {
  name: 'Synthetic fixture · not an IBKR selector', verified: false, available: true,
  discover(document, location) {
    if (location.hash !== '#/positions') return null;
    const context = document.querySelector<HTMLElement>('[data-synthetic-positions]');
    if (!context) return null;
    const regions: Region[] = [];
    for (const [name, kind] of [['holdings', 'holdings'], ['cash', 'cash']] as const) {
      const root = context.querySelector<HTMLElement>(`[data-fixture-region="${name}"]`);
      const statusMount = context.querySelector<HTMLElement>(`[data-fixture-status="${name}"]`);
      if (root && statusMount) regions.push({ root, statusMount, kind });
    }
    return regions.length === 2 ? { context, regions } : null;
  },
  rowFor: element => element.closest('tbody tr'),
  read(region, dirtyRows, enabled): ReadResult {
    const kind = region.kind === 'holdings' ? 'marketValue' : 'cash';
    if (!enabled.has(kind)) return { candidates: [], code: null };
    const targetHeader = region.kind === 'holdings' ? 'market value' : 'amount';
    const headers = [...region.root.querySelectorAll<HTMLTableCellElement>('thead th')].filter(h => h.textContent?.trim().toLowerCase().replace(/\s+/g, ' ') === targetHeader);
    const header = headers[0];
    if (headers.length !== 1 || !header?.id || header.hidden || header.getClientRects().length === 0) return { candidates: [], code: 'MARKET_VALUE_COLUMN_MISSING' };
    const rows = dirtyRows ? [...dirtyRows].filter(r => r.parentElement?.tagName === 'TBODY') : [...region.root.querySelectorAll('tbody tr')];
    const candidates: Candidate[] = [];
    for (const row of rows) {
      if (!(row instanceof HTMLElement) || row.hasAttribute('data-total')) continue;
      const cells = [...row.querySelectorAll<HTMLTableCellElement>('td')].filter(c => c.headers.split(/\s+/).includes(header.id));
      const cell = cells[0];
      if (cells.length !== 1 || !cell) continue;
      const amount = cell.querySelector<HTMLElement>('[data-native-amount]');
      const mount = cell.querySelector<HTMLElement>('[data-estimate-slot]');
      if (!amount || !mount) continue;
      const currency = region.kind === 'holdings' ? cell.dataset.currency ?? null : row.querySelector<HTMLElement>('[data-currency-code]')?.dataset.currencyCode ?? null;
      candidates.push({ row, cell, mount, currency, text: amount.textContent ?? '', kind });
    }
    return { candidates, code: null };
  },
};
