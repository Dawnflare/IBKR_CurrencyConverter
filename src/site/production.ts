import type { Candidate, Region, SiteAdapter } from './adapter';
const normalized = (element: Element): string => (element.textContent ?? '').trim().replace(/\s+/g, ' ');
const direct = <T extends Element>(element: Element, name: string): T[] => [...element.children].filter(child => child.tagName === name && !child.hasAttribute('data-usd-lens')) as T[];
/** Evidence: local capture, 2026-09-30. See docs/discovery.md. No account/instrument IDs are read. */
export const adapter: SiteAdapter = {
  name: 'IBKR Positions · captured DOM, live validation pending', verified: true, available: true,
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
    for (const [root, kind] of [[holdings[0]!, 'marketValue'], [cash[0]!, 'cash']] as const) {
      const wrapper = root.parentElement;
      // The captured holdings grid uses a separate tbody for each position.
      if (!wrapper?.classList.contains('_tbw') || !wrapper.parentElement || root.tHead?.rows.length !== 1 || root.tBodies.length === 0) return null;
      regions.push({ root, kind, statusMount: wrapper.parentElement, statusBefore: wrapper });
    }
    return { context, regions };
  },
  rowFor: element => element.closest('tbody > tr'),
  read(region, dirtyRows) {
    const table = region.root as HTMLTableElement;
    const headers = [...(table.tHead?.rows[0]?.cells ?? [])];
    const title = region.kind === 'marketValue' ? 'Market Value' : 'Amount';
    const matches = headers.filter(h => normalized(h.querySelector('._thc') ?? h) === title);
    const header = matches[0];
    if (matches.length !== 1 || !header || header.getClientRects().length === 0 || getComputedStyle(header).visibility !== 'visible') return { candidates: [], code: 'MARKET_VALUE_COLUMN_MISSING' };
    const column = headers.indexOf(header);
    // aria-colindex validates the observed physical cell mapping; the target index is never fixed.
    if (header.getAttribute('aria-colindex') !== String(column + 1)) return { candidates: [], code: 'UNSUPPORTED_VIEW' };
    const currencyHeaders = headers.filter(h => normalized(h.querySelector('._thc') ?? h) === 'Currency');
    const currencyColumn = currencyHeaders.length === 1 ? headers.indexOf(currencyHeaders[0]!) : -1;
    if (region.kind === 'cash' && currencyColumn < 0) return { candidates: [], code: 'CURRENCY_AMBIGUOUS' };
    const rows = dirtyRows ? [...dirtyRows] : [...table.tBodies].flatMap(body => [...body.rows]);
    const candidates: Candidate[] = [];
    for (const row of rows) {
      if (!(row instanceof HTMLTableRowElement) || row.parentElement?.tagName !== 'TBODY' || row.parentElement.parentElement !== table || row.cells.length !== headers.length || [...row.cells].some(c => c.colSpan !== 1 || c.rowSpan !== 1)) continue;
      const cell = row.cells[column]!;
      if (cell.querySelector('button,input,select,textarea,a,[contenteditable="true"]')) continue;
      const spans = direct<HTMLElement>(cell, 'SPAN');
      if (spans.length !== 1) continue;
      if (region.kind === 'marketValue') {
        const wrapper = spans[0]!;
        const blocks = direct<HTMLElement>(wrapper, 'DIV');
        if (blocks.length !== 2 || !blocks[1]!.matches('.fs8.fg70')) continue;
        const amounts = direct<HTMLElement>(blocks[0]!, 'SPAN');
        if (amounts.length !== 1 || amounts[0]!.children.length) continue;
        const currencyText = normalized(blocks[1]!);
        candidates.push({ row, cell, mount: cell, kind: region.kind, currency: /^(KRW|USD)$/.test(currencyText) ? currencyText : null, text: amounts[0]!.textContent ?? '', overlay: { amount: amounts[0]!, currency: blocks[1]! } });
      } else {
        const currencyCell = row.cells[currencyColumn]!;
        const label = normalized(currencyCell);
        // Currency is the exact text of this cash row, excluding flag SVG markup.
        const currency = label === 'KRW' ? 'KRW' : /^USD(?:\s*\(base currency\))?$/.test(label) ? 'USD' : null;
        if (spans[0]!.children.length) continue;
        candidates.push({ row, cell, mount: cell, kind: region.kind, currency, text: spans[0]!.textContent ?? '', overlay: { amount: spans[0]!, currency: null } });
      }
    }
    return { candidates, code: null };
  },
};
