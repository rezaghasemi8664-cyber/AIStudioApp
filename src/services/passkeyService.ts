import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { get, post, put, del } from './apiClient';

export interface PasskeyDevice {
  id: number;
  deviceName: string | null;
  deviceType: string | null;
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}
export interface PasskeyState {
  enabled: boolean;
  devices: PasskeyDevice[];
}

function unwrap<T>(response: any, fallback: string): T {
  if (!response?.success) throw new Error(response?.message || fallback);
  return response.data as T;
}

function getDeviceName(): string {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  if (/iPhone/i.test(ua)) return 'آیفون';
  if (/iPad/i.test(ua)) return 'آیپد';
  if (/Android/i.test(ua)) return 'گوشی اندرویدی';
  if (/Windows/i.test(ua)) return 'رایانه ویندوزی';
  if (/Macintosh|Mac OS/i.test(ua)) return 'رایانه مک';
  return 'دستگاه مرورگر';
}

export const passkeyService = {
  async getState(): Promise<PasskeyState> {
    return unwrap<PasskeyState>(await get('/auth/passkey/devices'), 'دریافت وضعیت ورود بیومتریک ناموفق بود.');
  },

  async registerCurrentDevice(currentPassword: string, identifier: string): Promise<PasskeyState> {
    const start = unwrap<{ challengeId: string; options: any }>(
      await post('/auth/passkey/registration/options', { currentPassword, identifier }),
      'شروع ثبت دستگاه ناموفق بود.',
    );
    const response = await startRegistration({ optionsJSON: start.options });
    return unwrap<PasskeyState>(
      await post('/auth/passkey/registration/verify', {
        challengeId: start.challengeId,
        response,
        deviceName: getDeviceName(),
      }),
      'ثبت دستگاه ناموفق بود.',
    );
  },

  async setEnabled(enabled: boolean): Promise<PasskeyState> {
    const response = enabled
      ? await put('/auth/passkey/enable', {})
      : await put('/auth/passkey/disable', {});
    return unwrap<PasskeyState>(response, 'ذخیره تنظیم ورود بیومتریک ناموفق بود.');
  },

  async removeDevice(id: number): Promise<PasskeyState> {
    return unwrap<PasskeyState>(await del('/auth/passkey/devices/' + id), 'حذف دستگاه ناموفق بود.');
  },

  async removeAllDevices(): Promise<PasskeyState> {
    return unwrap<PasskeyState>(await del('/auth/passkey/devices'), 'حذف دستگاه‌ها ناموفق بود.');
  },

  async authenticate(identifier?: string): Promise<any> {
    const normalizedIdentifier = String(identifier || '').trim();
    const start = unwrap<{ challengeId: string; options: any }>(
      await post('/auth/passkey/authentication/options', normalizedIdentifier ? { identifier: normalizedIdentifier } : {}),
      'ورود بیومتریک برای این حساب فعال نیست.',
    );
    const response = await startAuthentication({ optionsJSON: start.options });
    return unwrap<any>(
      await post('/auth/passkey/authentication/verify', { challengeId: start.challengeId, response }),
      'تأیید ورود بیومتریک ناموفق بود.',
    );
  },
};
