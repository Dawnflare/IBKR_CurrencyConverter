import type { Candidate } from '../site/adapter';
import type { Annotation } from './presentation';
function textBounds(element: HTMLElement): DOMRect {
  const range = document.createRange(); range.selectNodeContents(element); return range.getBoundingClientRect();
}
/** Fit entirely inside unused cell space. Does not change native styles or row dimensions. */
export function positionOverlay(candidate: Candidate, annotation: Annotation, preference: 'underneath' | 'inline'): boolean {
  if (!candidate.overlay) return true;
  const { host } = annotation;
  host.style.position = 'fixed'; host.style.zIndex = '1'; host.style.width = 'max-content';
  host.style.maxWidth = 'none'; host.style.margin = '0'; host.style.visibility = 'hidden';
  const cell = candidate.cell.getBoundingClientRect();
  const amount = textBounds(candidate.overlay.amount);
  const style = getComputedStyle(candidate.cell);
  const left = cell.left + parseFloat(style.paddingLeft || '0');
  const right = cell.right - parseFloat(style.paddingRight || '0');
  const measured = host.getBoundingClientRect();
  const width = Math.ceil(measured.width), height = Math.ceil(measured.height);
  if (!width || !height || cell.bottom <= 0 || cell.top >= innerHeight || cell.left < 0 || cell.right > innerWidth) return false;
  const spaces: Array<{ left: number; right: number; top: number }> = [];
  if (candidate.overlay.currency) {
    const currency = textBounds(candidate.overlay.currency);
    spaces.push({ left, right: currency.left - 8, top: currency.top });
  } else {
    spaces.push({ left, right, top: amount.bottom + 2 });
  }
  const inline = [
    { left: amount.right + 10, right, top: amount.top + Math.max(0, (amount.height - height) / 2) },
    { left, right: amount.left - 10, top: amount.top + Math.max(0, (amount.height - height) / 2) },
  ];
  const options = preference === 'inline' ? [...inline, ...spaces] : [...spaces, ...inline];
  const space = options.find(s => s.right - s.left >= width && s.top >= cell.top + 1 && s.top + height <= cell.bottom - 2 && s.top >= 0 && s.top + height <= innerHeight);
  if (!space) return false;
  const x = candidate.kind === 'marketValue' ? space.right - width : space.left;
  // Respect scroll clipping, sticky headers, and native overlays in front of the cell.
  const points = [[x + 1, space.top + 1], [x + width - 1, space.top + 1], [x + 1, space.top + height - 1], [x + width - 1, space.top + height - 1]];
  if (points.some(([px, py]) => !candidate.cell.contains(document.elementFromPoint(px!, py!)))) return false;
  host.style.left = `${x}px`; host.style.top = `${space.top}px`;
  // A transformed ancestor can change fixed-position coordinates. Fail closed in that layout.
  const actual = host.getBoundingClientRect();
  if (Math.abs(actual.left - x) > 1 || Math.abs(actual.top - space.top) > 1) return false;
  host.style.visibility = 'visible';
  return true;
}
