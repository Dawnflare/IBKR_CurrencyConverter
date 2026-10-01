import { ERROR_CODES, isObject, LensError, type ErrorCode, type RateResult, type Settings } from './types';
export type Reply<T> = { ok: true; data: T } | { ok: false; code: ErrorCode };
export interface ViewStatus { supported: boolean; eligible: number; annotated: number; code: ErrorCode | null; adapter: string; }
export interface PopupState {
  settings: Settings;
  keyPresent: boolean;
  remembered: boolean;
  permissions: { ecb: boolean; currencyapi: boolean };
  brokerAvailable: false;
  lastRate: RateResult;
}
export type RateReply = Reply<RateResult>;
export function exactKeys(object: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(object).length === keys.length && keys.every(k => Object.hasOwn(object, k));
}
export function generation(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value < 1e12; }
export function senderRole(sender: { id?: string | undefined; url?: string | undefined; frameId?: number | undefined; tab?: { id?: number | undefined } | undefined }, runtimeId: string, fixtureOrigin: string | null = null): 'popup' | 'content' | null {
  if (sender.id !== runtimeId || !sender.url) return null;
  if (sender.url === `chrome-extension://${runtimeId}/popup.html`) return 'popup';
  try {
    const url = new URL(sender.url);
    if (sender.frameId === 0 && typeof sender.tab?.id === 'number' && (url.origin === 'https://portal.interactivebrokers.com' || (fixtureOrigin !== null && url.origin === fixtureOrigin))) return 'content';
  } catch { /* Untrusted sender. */ }
  return null;
}
export async function send<T>(message: unknown): Promise<T> {
  let reply: Reply<T>;
  try { reply = await chrome.runtime.sendMessage(message) as Reply<T>; } catch { throw new LensError('RATE_UNAVAILABLE'); }
  if (!isObject(reply) || typeof reply.ok !== 'boolean') throw new LensError('INVALID_MESSAGE');
  if (!reply.ok) throw new LensError(ERROR_CODES.includes(reply.code) ? reply.code : 'INVALID_MESSAGE');
  return reply.data;
}
