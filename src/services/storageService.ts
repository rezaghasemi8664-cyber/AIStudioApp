// src/services/storageService.ts
// ---------------------------------------------------------------
// DEPRECATED SHIM (Final)
// ?????? ????: Backend-First + Cookie-Based Auth + No Client Storage
// ??? ???? ??? ???? ??????? ???? ?? import??? ????? ??? ????? ???.
// ???? ?? ???? ??????? ????.
// ---------------------------------------------------------------

const PREFIX = '[DEPRECATED][storageService]';

function warn(method: string): void {
  // ?? production ?????? ??????? ?? ??? ????? ????? ????
  if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
    // eslint-disable-next-line no-console
    console.warn(`${PREFIX} ${method}() called. Migrate to backend service APIs.`);
  }
}

// ---------------------------------------------------------------
// Primitive APIs (No-Op / Null)
// ---------------------------------------------------------------

/** @deprecated */
export function getItem(_key: string): string | null {
  warn('getItem');
  return null;
}

/** @deprecated */
export function setItem(_key: string, _value: string): void {
  warn('setItem');
}

/** @deprecated */
export function removeItem(_key: string): void {
  warn('removeItem');
}

/** @deprecated */
export function getItemRaw(_key: string): string | null {
  warn('getItemRaw');
  return null;
}

/** @deprecated */
export function setItemRaw(_key: string, _value: string): void {
  warn('setItemRaw');
}

/** @deprecated */
export function removeItemRaw(_key: string): void {
  warn('removeItemRaw');
}

// ---------------------------------------------------------------
// JSON Helpers (Default-Only)
// ---------------------------------------------------------------

/** @deprecated */
export function getJSON<T>(_key: string, defaultValue: T | null = null): T | null {
  warn('getJSON');
  return defaultValue;
}

/** @deprecated */
export function setJSON<T>(_key: string, _value: T): void {
  warn('setJSON');
}

/** @deprecated */
export function getJSONRaw<T>(_key: string, defaultValue: T | null = null): T | null {
  warn('getJSONRaw');
  return defaultValue;
}

/** @deprecated */
export function setJSONRaw<T>(_key: string, _value: T): void {
  warn('setJSONRaw');
}

// ---------------------------------------------------------------
// Legacy Sync APIs (Disabled)
// ---------------------------------------------------------------

/** @deprecated */
export async function syncToServer(
  _endpoint: string,
  _data: Record<string, unknown>
): Promise<boolean> {
  warn('syncToServer');
  return false;
}

/** @deprecated */
export async function fetchFromServer<T>(_endpoint: string): Promise<T | null> {
  warn('fetchFromServer');
  return null;
}

/** @deprecated */
export async function forceSync(): Promise<void> {
  warn('forceSync');
  return;
}

// ---------------------------------------------------------------
// Backward-Compatible Legacy Methods
// ---------------------------------------------------------------

/** @deprecated */
export const saveToStorage = async (_key: string, _value: unknown): Promise<void> => {
  warn('saveToStorage');
};

/** @deprecated */
export const loadFromStorage = async <T>(_key: string, defaultValue: T): Promise<T> => {
  warn('loadFromStorage');
  return defaultValue;
};

/** @deprecated */
export const loadFromStorageSync = <T>(_key: string, defaultValue: T): T => {
  warn('loadFromStorageSync');
  return defaultValue;
};

/** @deprecated */
export const removeFromStorage = async (_key: string): Promise<void> => {
  warn('removeFromStorage');
};

// ---------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------

/** @deprecated */
export function clearAll(): void {
  warn('clearAll');
}

// ---------------------------------------------------------------
// Default Export (for legacy import styles)
// ---------------------------------------------------------------

const storageService = {
  getItem,
  setItem,
  removeItem,
  getItemRaw,
  setItemRaw,
  removeItemRaw,
  getJSON,
  setJSON,
  getJSONRaw,
  setJSONRaw,
  syncToServer,
  fetchFromServer,
  forceSync,
  saveToStorage,
  loadFromStorage,
  loadFromStorageSync,
  removeFromStorage,
  clearAll,
};

export default storageService;
