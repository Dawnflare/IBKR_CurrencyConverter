import type { ErrorCode } from '../core/types';
export interface Region { root: HTMLElement; statusMount: HTMLElement; statusBefore?: HTMLElement; kind: 'marketValue' | 'cash'; }
export interface SiteView { context: Element; regions: Region[]; }
export interface Candidate {
  row: HTMLElement; cell: HTMLElement; mount: HTMLElement;
  currency: string | null; text: string; kind: Region['kind'];
  overlay?: { amount: HTMLElement; currency: HTMLElement | null };
}
export interface ReadResult { candidates: Candidate[]; code: ErrorCode | null; }
export interface SiteAdapter {
  name: string;
  verified: boolean;
  available: boolean;
  discover: (document: Document, location: Location) => SiteView | null;
  read: (region: Region, rows: Set<Element> | null) => ReadResult;
  rowFor: (element: Element) => Element | null;
}
