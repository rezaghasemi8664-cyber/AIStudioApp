import { io, Socket } from 'socket.io-client';
import { API_BASE } from '../api/config';
import { invalidateCachedGet } from './apiClient';
let socket: Socket | null = null;
export type GlobalSettingsUpdatedPayload = { category?: string; key?: string; value?: unknown; data?: unknown; updatedBy?: string | number; updatedAt?: string | Date; };
type GlobalSettingsHandler = (payload: GlobalSettingsUpdatedPayload) => void;
const GLOBAL_SETTINGS_EVENTS = ['global-settings:updated', 'global-settings:bulk-updated'] as const;
export const initializeSocket = (token = ''): Socket => { if (socket?.connected) return socket; if (socket && !socket.connected) { socket.connect(); return socket; } socket = io(API_BASE, { extraHeaders: token ? { Authorization: `Bearer ${token}` } : {}, transports: ['websocket'] }); socket.on('options-market:updated', () => invalidateCachedGet('/brs/options')); socket.on('connect', () => invalidateCachedGet('/brs/options')); return socket; };
export const getSocket = (): Socket | null => socket;
export const onGlobalSettingsUpdated = (handler: GlobalSettingsHandler): (() => void) => { if (!socket) { console.warn('[socketService] Socket is not initialized.'); return () => {}; } GLOBAL_SETTINGS_EVENTS.forEach(eventName => socket?.on(eventName, handler)); return () => GLOBAL_SETTINGS_EVENTS.forEach(eventName => socket?.off(eventName, handler)); };
export const offGlobalSettingsUpdated = (handler: GlobalSettingsHandler): void => { if (!socket) return; GLOBAL_SETTINGS_EVENTS.forEach(eventName => socket?.off(eventName, handler)); };
export const disconnectSocket = () => { if (!socket) return; GLOBAL_SETTINGS_EVENTS.forEach(eventName => socket?.removeAllListeners(eventName)); socket.disconnect(); socket = null; };

export const onMarketSummaryUpdated = (handler: (payload: any) => void): (() => void) => {
  if (!socket) { console.warn('[socketService] Socket is not initialized.'); return () => {}; }
  socket.on('market-summary:updated', handler);
  return () => socket?.off('market-summary:updated', handler);
};

export const onCodalSnapshotUpdated = (handler: (payload: { snapshotId?: string | null; fetchedAt?: string | null; announcementCount?: number; pageCount?: number; updatedAt?: string; reason?: string }) => void): (() => void) => {
  if (!socket) { console.warn('[socketService] Socket is not initialized.'); return () => {}; }
  socket.on('codal-snapshot:updated', handler);
  return () => socket?.off('codal-snapshot:updated', handler);
};
