// src/services/guestSettingsService.ts
import api from '../api/apiClient';

const DEFAULT_GUEST_VALIDITY_DAYS = 3;
const MIN_DAYS = 1;
const MAX_DAYS = 30;

interface SettingsResponse {
  success?: boolean;
  data?: {
    guest_user_validity_days?: number;
    [key: string]: unknown;
  };
}

interface SettingByKeyResponse {
  success?: boolean;
  data?: {
    key?: string;
    value?: number | string | boolean | null;
  };
}

const normalizeDays = (input: unknown): number => {
  const num = Number(input);
  if (!Number.isFinite(num)) return DEFAULT_GUEST_VALIDITY_DAYS;
  return Math.min(MAX_DAYS, Math.max(MIN_DAYS, Math.floor(num)));
};

export const getGuestValidityDays = async (): Promise<number> => {
  try {
    const { data } = await api.get<SettingsResponse>('/settings');
    const raw = data?.data?.guest_user_validity_days;
    if (raw !== undefined && raw !== null) return normalizeDays(raw);
  } catch {
    // ignore and fallback
  }

  try {
    const { data } = await api.get<SettingByKeyResponse>('/settings/guest_user_validity_days');
    return normalizeDays(data?.data?.value);
  } catch {
    return DEFAULT_GUEST_VALIDITY_DAYS;
  }
};

export const setGuestValidityDays = async (days: number): Promise<void> => {
  const normalized = normalizeDays(days);

  try {
    await api.put('/settings', {
      guest_user_validity_days: normalized,
    });
  } catch {
    // optional fallback for backends that support key-based update route
    await api.put('/settings/guest_user_validity_days', {
      value: normalized,
    });
  }
};

