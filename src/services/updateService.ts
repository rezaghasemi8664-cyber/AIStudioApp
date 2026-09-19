// src/services/updateService.ts
import type { UpdateHistoryItem } from '../types';
import { safeApi } from './apiResult';

const BASE = '/updates';

const normalizeHistory = (input: unknown): UpdateHistoryItem[] => {
  if (!Array.isArray(input)) return [];

  const list = input
    .map((item, index) => {
      const raw = item as Partial<UpdateHistoryItem>;

      const id =
        typeof raw.id === 'string' && raw.id.trim()
          ? raw.id
          : `update_${index}`;

      const fileName =
        typeof raw.fileName === 'string' && raw.fileName.trim()
          ? raw.fileName.trim()
          : 'فایل به‌روزرسانی';

      const size = Number(raw.size);
      const date = Number(raw.date);
      const versionNumber = Number(raw.versionNumber);

      return {
        id,
        fileName,
        size: Number.isFinite(size) ? size : 0,
        date: Number.isFinite(date) ? date : Date.now(),
        versionNumber: Number.isFinite(versionNumber) ? versionNumber : index + 1,
        isActive: Boolean(raw.isActive),
      } satisfies UpdateHistoryItem;
    })
    .sort((a, b) => b.versionNumber - a.versionNumber);

  if (list.length > 0 && !list.some((v) => v.isActive)) {
    list[0].isActive = true;
  }

  return list;
};

const ensureHasInitial = (history: UpdateHistoryItem[]): UpdateHistoryItem[] => {
  if (history.length > 0) return history;
  return [
    {
      id: 'initial_version_0',
      fileName: 'نسخه اولیه',
      size: 0,
      date: Date.now(),
      versionNumber: 1,
      isActive: true,
    },
  ];
};

export const getUpdateHistory = async (): Promise<UpdateHistoryItem[]> => {
  const res = await safeApi<unknown>(`${BASE}/history`, { method: 'GET' });

  if (!res.ok) {
    return ensureHasInitial([]);
  }

  const normalized = normalizeHistory(res.data);
  return ensureHasInitial(normalized);
};

export const addUpdate = async (file: File): Promise<UpdateHistoryItem[]> => {
  const form = new FormData();
  form.append('file', file);

  const uploadRes = await safeApi<{ success: true } | unknown>(`${BASE}/upload`, {
    method: 'POST',
    body: form,
  });

  if (!uploadRes.ok) {
    throw new Error(uploadRes.error || 'آپلود فایل به‌روزرسانی ناموفق بود.');
  }

  return getUpdateHistory();
};

export const deleteVersion = async (id: string): Promise<UpdateHistoryItem[]> => {
  const res = await safeApi<{ success: true } | unknown>(`${BASE}/history/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });

  if (!res.ok) {
    throw new Error((typeof res.error === 'string' ? res.error : undefined) || 'حذف نسخه ناموفق بود.');
  }

  return getUpdateHistory();
};

export const setActiveVersion = async (id: string): Promise<UpdateHistoryItem[]> => {
  const res = await safeApi<{ success: true } | unknown>(`${BASE}/history/${encodeURIComponent(id)}/activate`, {
    method: 'PUT',
  });

  if (!res.ok) {
    throw new Error((typeof res.error === 'string' ? res.error : undefined) || 'فعال‌سازی نسخه ناموفق بود.');
  }

  return getUpdateHistory();
};
