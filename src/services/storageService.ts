// src/services/storageService.ts
// Deprecated compatibility shim: the application is backend-first.
const PREFIX = '[DEPRECATED][storageService]';
function warn(method: string): void {
  if (typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV) console.warn(`${PREFIX} ${method}() called.`);
}
export function getItem(_key: string): string | null { warn('getItem'); return null; }
export function setItem(_key: string, _value: string): void { warn('setItem'); }
export function removeItem(_key: string): void { warn('removeItem'); }
export function getItemRaw(_key: string): string | null { warn('getItemRaw'); return null; }
export function setItemRaw(_key: string, _value: string): void { warn('setItemRaw'); }
export function removeItemRaw(_key: string): void { warn('removeItemRaw'); }
export function getJSON<T>(_key: string, defaultValue: T | null = null): T | null { warn('getJSON'); return defaultValue; }
export function setJSON<T>(_key: string, _value: T): void { warn('setJSON'); }
export function getJSONRaw<T>(_key: string, defaultValue: T | null = null): T | null { warn('getJSONRaw'); return defaultValue; }
export function setJSONRaw<T>(_key: string, _value: T): void { warn('setJSONRaw'); }
export async function syncToServer(_endpoint: string, _data: Record<string, unknown>): Promise<boolean> { warn('syncToServer'); return false; }
export async function fetchFromServer<T>(_endpoint: string): Promise<T | null> { warn('fetchFromServer'); return null; }
export async function forceSync(): Promise<void> { warn('forceSync'); }
export const saveToStorage = async (_key: string, _value: unknown): Promise<void> => { warn('saveToStorage'); };
export const loadFromStorage = async <T>(_key: string, defaultValue: T): Promise<T> => { warn('loadFromStorage'); return defaultValue; };
export const loadFromStorageSync = <T>(_key: string, defaultValue: T): T => { warn('loadFromStorageSync'); return defaultValue; };
export const removeFromStorage = async (_key: string): Promise<void> => { warn('removeFromStorage'); };
export function clearAll(): void { warn('clearAll'); }
export async function init(): Promise<void> { warn('init'); }
const storageService = { getItem, setItem, removeItem, getItemRaw, setItemRaw, removeItemRaw, getJSON, setJSON, getJSONRaw, setJSONRaw, syncToServer, fetchFromServer, forceSync, saveToStorage, loadFromStorage, loadFromStorageSync, removeFromStorage, clearAll, init };
export default storageService;
