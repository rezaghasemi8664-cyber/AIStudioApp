import { io, Socket } from 'socket.io-client';
import { API_BASE } from '../api/config';
import { invalidateCachedGet } from './apiClient';
let socket: Socket | null = null;
export type GlobalSettingsUpdatedPayload = { category?: string; key?: string; value?: unknown; data?: unknown; updatedBy?: string | number; updatedAt?: string | Date; };
type GlobalSettingsHandler = (payload: GlobalSettingsUpdatedPayload) => void;
type CommoditySnapshotHandler = (payload: any) => void;
const GLOBAL_SETTINGS_EVENTS = ['global-settings:updated', 'global-settings:bulk-updated'] as const;
const commoditySnapshotHandlers = new Set<CommoditySnapshotHandler>();
const allSymbolsSnapshotHandlers = new Set<CommoditySnapshotHandler>();

function attachCommoditySnapshotHandlers(target: Socket): void {
  commoditySnapshotHandlers.forEach(handler => target.on('commodity:snapshot:updated', handler));
  allSymbolsSnapshotHandlers.forEach(handler => target.on('all-symbols-snapshot:updated', handler));
}

export const initializeSocket = (token = ''): Socket => {
  if (socket?.connected) return socket;
  if (socket && !socket.connected) { socket.connect(); return socket; }
  socket = io(API_BASE, { extraHeaders: token ? { Authorization: `Bearer ${token}` } : {}, transports: ['websocket'] });
  attachCommoditySnapshotHandlers(socket);
  socket.on('options-market:updated', () => invalidateCachedGet('/brs/options'));
  socket.on('connect', () => {
    invalidateCachedGet('/brs/options');
    // A reconnect may have missed one or more server snapshot events.
    invalidateCachedGet('/market/commodity');
    commoditySnapshotHandlers.forEach(handler => handler({ reason: 'socket:connected' }));
    allSymbolsSnapshotHandlers.forEach(handler => handler({ reason: 'socket:connected' }));
  });
  return socket;
};
export const getSocket = (): Socket | null => socket;
export const onGlobalSettingsUpdated = (handler: GlobalSettingsHandler): (() => void) => { if (!socket) { console.warn('[socketService] Socket is not initialized.'); return () => {}; } GLOBAL_SETTINGS_EVENTS.forEach(eventName => socket?.on(eventName, handler)); return () => GLOBAL_SETTINGS_EVENTS.forEach(eventName => socket?.off(eventName, handler)); };
export const offGlobalSettingsUpdated = (handler: GlobalSettingsHandler): void => { if (!socket) return; GLOBAL_SETTINGS_EVENTS.forEach(eventName => socket?.off(eventName, handler)); };
export const disconnectSocket = () => {
  if (!socket) return;
  GLOBAL_SETTINGS_EVENTS.forEach(eventName => socket?.removeAllListeners(eventName));
  commoditySnapshotHandlers.forEach(handler => socket?.off('commodity:snapshot:updated', handler));
  allSymbolsSnapshotHandlers.forEach(handler => socket?.off('all-symbols-snapshot:updated', handler));
  socket.disconnect();
  socket = null;
};

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

export const onCommoditySnapshotUpdated = (handler: CommoditySnapshotHandler): (() => void) => {
  commoditySnapshotHandlers.add(handler);
  // Keep the subscription even when App has not initialized Socket.IO yet.
  if (socket) socket.on('commodity:snapshot:updated', handler);
  return () => {
    commoditySnapshotHandlers.delete(handler);
    socket?.off('commodity:snapshot:updated', handler);
  };
};

export const onAllSymbolsSnapshotUpdated = (handler: CommoditySnapshotHandler): (() => void) => {
  allSymbolsSnapshotHandlers.add(handler);
  // Preserve subscriptions created before the application initializes Socket.IO.
  if (socket) socket.on('all-symbols-snapshot:updated', handler);
  return () => {
    allSymbolsSnapshotHandlers.delete(handler);
    socket?.off('all-symbols-snapshot:updated', handler);
  };
};
