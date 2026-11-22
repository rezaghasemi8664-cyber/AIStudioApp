import React, { useCallback, useEffect, useState } from 'react';
import * as apiClient from '../services/apiClient';

type TokenStatus = { configured: boolean; updatedAt?: string | null };
type TestResult = { connected: boolean; counts: { gold: number; currency: number; crypto: number } };

const NerkhApiSettingsPanel: React.FC = () => {
  const [status, setStatus] = useState<TokenStatus | null>(null);
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const response = await apiClient.get<TokenStatus>('/nerkh/admin/token-status');
    if (response.success && response.data) setStatus(response.data);
    else setError(response.message || 'دریافت وضعیت توکن Nerkh ناموفق بود.');
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!token.trim()) { setError('توکن جدید را وارد کنید.'); return; }
    setSaving(true); setError(''); setMessage('');
    const response = await apiClient.put<{ configured: boolean }>('/nerkh/admin/token', { token: token.trim() });
    setSaving(false);
    if (!response.success) { setError(response.message || 'ذخیره توکن ناموفق بود.'); return; }
    setToken('');
    setMessage('توکن به‌صورت رمزنگاری‌شده ذخیره شد. برای تأیید، آزمون اتصال را اجرا کنید.');
    await load();
  };

  const test = async () => {
    setTesting(true); setError(''); setMessage('');
    const response = await apiClient.post<TestResult>('/nerkh/admin/test-connection', {});
    setTesting(false);
    if (!response.success || !response.data?.connected) { setError(response.message || 'آزمون اتصال ناموفق بود.'); return; }
    const c = response.data.counts;
    setMessage('اتصال موفق است؛ طلا: ' + c.gold + '، ارز: ' + c.currency + '، رمزارز: ' + c.crypto);
  };

  return <section dir="rtl" className="rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-5 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="text-lg font-bold">تنظیم سرویس Nerkh</h3><p className="mt-1 text-sm text-gray-500">توکن فقط در سرور رمزنگاری و نگهداری می‌شود؛ مقدار ذخیره‌شده هرگز به مرورگر بازگردانده نمی‌شود.</p></div>
      <span className={'rounded-full px-3 py-1 text-xs ' + (status?.configured ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700')}>{loading ? 'در حال بررسی…' : status?.configured ? 'توکن ثبت شده' : 'توکن ثبت نشده'}</span>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3">
      <input type="password" autoComplete="new-password" value={token} onChange={e => setToken(e.target.value)} placeholder={status?.configured ? 'برای جایگزینی، توکن جدید را وارد کنید' : 'توکن Nerkh'} className="min-w-0 rounded-xl border border-[var(--card-border-color)] bg-transparent px-4 py-3 text-sm" dir="ltr" />
      <button onClick={() => void save()} disabled={saving || !token.trim()} className="rounded-xl bg-cyan-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'در حال ذخیره…' : 'ذخیره / جایگزینی توکن'}</button>
    </div>
    <div className="flex flex-wrap items-center gap-3">
      <button onClick={() => void test()} disabled={testing || !status?.configured} className="rounded-xl border px-4 py-2.5 text-sm font-semibold disabled:opacity-50">{testing ? 'در حال آزمایش اتصال…' : 'آزمون اتصال به Nerkh'}</button>
      <button onClick={() => void load()} disabled={loading} className="rounded-xl border px-4 py-2.5 text-sm disabled:opacity-50">بروزرسانی وضعیت</button>
      {status?.updatedAt && <span className="text-xs text-gray-500">آخرین تغییر: {new Date(status.updatedAt).toLocaleString('fa-IR')}</span>}
    </div>
    {message && <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950/20 dark:text-green-300">{message}</div>}
    {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/20 dark:text-red-300">{error}</div>}
    <p className="text-xs text-gray-500">نشانی API در کد سرور تعریف شده است و نیازی به افزودن توکن یا آدرس Nerkh به فایل‌های ENV نیست. کلید رمزنگاری فعلی PASSWORD_VAULT_KEY یا JWT_SECRET باید روی سرور حفظ شود.</p>
  </section>;
};

export default NerkhApiSettingsPanel;
