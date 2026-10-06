import type { Candidate, Region, SiteAdapter } from './adapter';
import type { ErrorCode, FieldKind } from '../core/types';
const normalized = (element: Element): string => (element.textContent ?? '').trim().replace(/\s+/g, ' ');
const direct = <T extends Element>(element: Element, name: string): T[] => [...element.children].filter(child => child.tagName === name && !child.hasAttribute('data-usd-lens')) as T[];
const holdingsColumns = [
  ['marketValue', 'Market Value'], ['lastPrice', 'Last'], ['costBasis', 'Cost Basis'], ['avgPrice', 'Avg Price'],
  ['dailyPnl', 'Daily P&L'], ['unrealizedPnl', 'Unrealized P&L'],
] as const;
const headerTitle = (header: Element): string => normalized(header.querySelector('._thc') ?? header).toLowerCase();
const visible = (element: Element): boolean => element.getClientRects().length > 0 && getComputedStyle(element).visibility === 'visible';
const nativeChildren = (element: Element): Element[] => [...element.children].filter(child => !child.hasAttribute('data-usd-lens'));
/** Explicit currency labels in known monetary cells only; never symbols or account totals. */
function rowCurrency(row: HTMLTableRowElement, headers: HTMLTableCellElement[]): string | null {
  const labels = new Set<string>();
  for (const [index, header] of headers.entries()) {
    const title = headerTitle(header);
    const cell = row.cells[index]!;
    if (!visible(header) || !visible(cell)) continue;
    if (title === 'currency') { labels.add(normalized(cell)); continue; }
    if (!['cost basis', 'market value', 'avg price', 'daily p&l', 'unrealized p&l'].includes(title)) continue;
    const wrapper = title === 'market value' ? direct<HTMLElement>(cell, 'SPAN')[0] : cell;
    if (!wrapper) continue;
    for (const label of direct<HTMLElement>(wrapper, 'DIV').filter(node => node.matches('.fs8.fg70'))) labels.add(normalized(label));
  }
  const label = [...labels][0];
  return labels.size === 1 && label && /^(KRW|USD)$/.test(label) ? label : null;
}
/** Evidence: local capture, 2026-09-30. See docs/discovery.md. No account/instrument IDs are read. */
export const adapter: SiteAdapter = {
  name: 'IBKR Positions', verified: true, available: true,
  discover(document, location) {
    if (location.origin !== 'https://portal.interactivebrokers.com' || location.pathname !== '/portal/' || location.hash !== '#/dashboard/positions') return null;
    const contexts = document.querySelectorAll<HTMLElement>('.ptf-models');
    if (contexts.length !== 1) return null;
    const context = contexts[0]!;
    const positions = context.querySelectorAll<HTMLElement>('.ptf-positions');
    if (positions.length !== 1 || ![...positions[0]!.querySelectorAll('h3')].some(h => normalized(h) === 'Your Holdings')) return null;
    const holdings = positions[0]!.querySelectorAll<HTMLTableElement>('table._tb[role="grid"]');
    const cashHeadings = [...context.querySelectorAll('h3')].filter(h => normalized(h) === 'Cash Holdings');
    if (holdings.length !== 1 || cashHeadings.length !== 1) return null;
    const cashColumn = cashHeadings[0]!.closest('.ib-col');
    const cash = cashColumn?.querySelectorAll<HTMLTableElement>('table._tb[role="grid"]');
    if (!cash || cash.length !== 1 || cash[0] === holdings[0] || !cashColumn?.closest('.ib-row.cb')) return null;
    const regions: Region[] = [];
    for (const [root, kind] of [[holdings[0]!, 'holdings'], [cash[0]!, 'cash']] as const) {
      const wrapper = root.parentElement;
      // The captured holdings grid uses a separate tbody for each position.
      if (!wrapper?.classList.contains('_tbw') || !wrapper.parentElement || root.tHead?.rows.length !== 1 || root.tBodies.length === 0) return null;
      regions.push({ root, kind, statusMount: wrapper.parentElement, statusBefore: wrapper });
    }
    return { context, regions };
  },
  rowFor: element => element.closest('tbody > tr'),
  read(region, dirtyRows, enabled) {
    const table = region.root as HTMLTableElement;
    const headers = [...(table.tHead?.rows[0]?.cells ?? [])];
    if (headers.some(header => header.colSpan !== 1 || header.rowSpan !== 1)) return { candidates: [], code: 'UNSUPPORTED_VIEW' };
    const definitions = region.kind === 'holdings' ? holdingsColumns : [['cash', 'Amount']] as const;
    const columns: Array<{ kind: FieldKind; index: number }> = [];
    let code: ErrorCode | null = null;
    for (const [kind, title] of definitions) {
      if (!enabled.has(kind)) continue;
      const matches = headers.filter(h => headerTitle(h) === title.toLowerCase() && visible(h));
      const header = matches[0];
      // Hidden or removed columns are a normal display preference, independent of popup toggles.
      if (!header) continue;
      if (matches.length !== 1) { code ??= 'UNSUPPORTED_VIEW'; continue; }
      const index = headers.indexOf(header);
      // In this complete native table, DOM order associates headers with cells. IBKR can
      // retain logical aria-colindex values after a column is removed or reordered.
      columns.push({ kind, index });
    }
    if (!columns.length) return { candidates: [], code };
    const currencyHeaders = headers.filter(h => headerTitle(h) === 'currency');
    const currencyColumn = currencyHeaders.length === 1 ? headers.indexOf(currencyHeaders[0]!) : -1;
    if (region.kind === 'cash' && currencyColumn < 0) return { candidates: [], code: 'CURRENCY_AMBIGUOUS' };
    const rows = dirtyRows ? [...dirtyRows] : [...table.tBodies].flatMap(body => [...body.rows]);
    const candidates: Candidate[] = [];
    for (const row of rows) {
      if (!(row instanceof HTMLTableRowElement) || row.parentElement?.tagName !== 'TBODY' || row.parentElement.parentElement !== table || row.cells.length !== headers.length || [...row.cells].some(c => c.colSpan !== 1 || c.rowSpan !== 1)) continue;
      for (const { kind, index } of columns) {
        const cell = row.cells[index]!;
        if (cell.querySelector('button,input,select,textarea,a,[contenteditable="true"]')) continue;
        const spans = direct<HTMLElement>(cell, 'SPAN');
        if (spans.length !== 1) continue;
        if (kind === 'cash') {
          const label = normalized(row.cells[currencyColumn]!);
          const currency = label === 'KRW' ? 'KRW' : /^USD(?:\s*\(base currency\))?$/.test(label) ? 'USD' : null;
          if (spans[0]!.children.length) continue;
          candidates.push({ row, cell, mount: cell, kind, currency, text: spans[0]!.textContent ?? '', overlay: { amount: spans[0]!, currency: null } });
          continue;
        }
        if (kind === 'lastPrice') {
          const amount = spans[0]!;
          // Last uses plain/nested spans, including an optional previous-close marker.
          if (nativeChildren(cell).length !== 1 || [...amount.querySelectorAll('*')].some(node => node.tagName !== 'SPAN')) continue;
          const text = (amount.textContent ?? '').trim();
          const previousClose = /^C\s*\d/.test(text);
          candidates.push({ row, cell, mount: cell, kind, currency: rowCurrency(row, headers),
            text: previousClose ? text.slice(1).trim() : text,
            note: previousClose ? 'Last: previous market close (C).' : 'Last price as displayed by IBKR.',
            overlay: { amount, currency: null } });
          continue;
        }
        let amount: HTMLElement;
        let currencyElement: HTMLElement;
        if (kind === 'marketValue') {
          const blocks = direct<HTMLElement>(spans[0]!, 'DIV');
          if (blocks.length !== 2 || !blocks[1]!.matches('.fs8.fg70')) continue;
          const amounts = direct<HTMLElement>(blocks[0]!, 'SPAN');
          if (amounts.length !== 1 || amounts[0]!.children.length) continue;
          amount = amounts[0]!; currencyElement = blocks[1]!;
        } else {
          // Captured Cost Basis, Avg Price and P&L: amount span + sibling currency div.
          const children = [...cell.children].filter(child => !child.hasAttribute('data-usd-lens'));
          const currencies = direct<HTMLElement>(cell, 'DIV');
          if (children.length !== 2 || spans[0]!.children.length || currencies.length !== 1 || !currencies[0]!.matches('.fs8.fg70')) continue;
          amount = spans[0]!; currencyElement = currencies[0]!;
        }
        const label = normalized(currencyElement);
        candidates.push({ row, cell, mount: cell, kind, currency: /^(KRW|USD)$/.test(label) ? label : null, text: amount.textContent ?? '',
          note: kind === 'costBasis' ? 'Cost Basis uses the displayed amount. M means million (×1,000,000); abbreviated values may be rounded by IBKR.' : '',
          overlay: { amount, currency: currencyElement } });
      }
    }
    return { candidates, code };
  },
};
