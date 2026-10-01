import type { Candidate, Region, SiteAdapter } from './adapter';
import type { ErrorCode, FieldKind } from '../core/types';
const normalized = (element: Element): string => (element.textContent ?? '').trim().replace(/\s+/g, ' ');
const direct = <T extends Element>(element: Element, name: string): T[] => [...element.children].filter(child => child.tagName === name && !child.hasAttribute('data-usd-lens')) as T[];
const holdingsColumns = [
  ['marketValue', 'Market Value'], ['avgPrice', 'Avg Price'],
  ['dailyPnl', 'Daily P&L'], ['unrealizedPnl', 'Unrealized P&L'],
] as const;
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
    const definitions = region.kind === 'holdings' ? holdingsColumns : [['cash', 'Amount']] as const;
    const columns: Array<{ kind: FieldKind; index: number }> = [];
    let code: ErrorCode | null = null;
    for (const [kind, title] of definitions) {
      if (!enabled.has(kind)) continue;
      const matches = headers.filter(h => normalized(h.querySelector('._thc') ?? h).toLowerCase() === title.toLowerCase());
      const header = matches[0];
      if (matches.length !== 1 || !header || header.getClientRects().length === 0 || getComputedStyle(header).visibility !== 'visible') {
        code ??= kind === 'marketValue' ? 'MARKET_VALUE_COLUMN_MISSING' : 'UNSUPPORTED_VIEW'; continue;
      }
      const index = headers.indexOf(header);
      // Every target follows its current header; an unavailable column does not block the others.
      if (header.getAttribute('aria-colindex') !== String(index + 1)) { code ??= 'UNSUPPORTED_VIEW'; continue; }
      columns.push({ kind, index });
    }
    if (!columns.length) return { candidates: [], code };
    const currencyHeaders = headers.filter(h => normalized(h.querySelector('._thc') ?? h).toLowerCase() === 'currency');
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
        let amount: HTMLElement;
        let currencyElement: HTMLElement;
        if (kind === 'marketValue') {
          const blocks = direct<HTMLElement>(spans[0]!, 'DIV');
          if (blocks.length !== 2 || !blocks[1]!.matches('.fs8.fg70')) continue;
          const amounts = direct<HTMLElement>(blocks[0]!, 'SPAN');
          if (amounts.length !== 1 || amounts[0]!.children.length) continue;
          amount = amounts[0]!; currencyElement = blocks[1]!;
        } else {
          // Captured Avg Price and P&L cells: direct amount span + sibling currency div.
          const children = [...cell.children].filter(child => !child.hasAttribute('data-usd-lens'));
          const currencies = direct<HTMLElement>(cell, 'DIV');
          if (children.length !== 2 || spans[0]!.children.length || currencies.length !== 1 || !currencies[0]!.matches('.fs8.fg70')) continue;
          amount = spans[0]!; currencyElement = currencies[0]!;
        }
        const label = normalized(currencyElement);
        candidates.push({ row, cell, mount: cell, kind, currency: /^(KRW|USD)$/.test(label) ? label : null, text: amount.textContent ?? '', overlay: { amount, currency: currencyElement } });
      }
    }
    return { candidates, code };
  },
};
