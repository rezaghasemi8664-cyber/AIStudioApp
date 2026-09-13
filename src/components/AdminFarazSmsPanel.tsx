import React, { useCallback, useEffect, useState } from 'react';
import * as apiClient from '../services/apiClient';

type StatusData = { configured?: boolean; reachable?: boolean; latencyMs?: number | null; sender?: string; message?: string };
type BalanceData = { amount?: number | string | null };
type ProfileData = { displayName?: string | null; mobile?: string | null };
type SendData = { providerId?: string | null; status?: string; message?: string | null };

const AdminFarazSmsPanel: React.FC = () => {
  const [status, setStatus] = useState<StatusData | null>(null);
  const [balance, setBalance] = useState<BalanceData | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [recipient, setRecipient] = useState('');
  const [text, setText] = useState('پیام تستی Roniya Analyzer');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statusResponse, balanceResponse, profileResponse] = await Promise.all([
        apiClient.get<StatusData>('/farazsms-admin/status'),
        apiClient.get<BalanceData>('/farazsms-admin/account/balance'),
        apiClient.get<ProfileData>('/farazsms-admin/account/profile'),
      ]);
      if (!statusResponse.success) throw new Error(statusResponse.message || 'دریافت وضعیت فراز اس‌ام‌اس ناموفق بود.');
      setStatus(statusResponse.data || null);
      setBalance(balanceResponse.success ? balanceResponse.data || null : null);
      setProfile(profileResponse.success ? profileResponse.data || null : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطا در دریافت اطلاعات فراز اس‌ام‌اس.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const sendTest = async () => {
    setSendResult(null);
    setError(null);
    const normalized = recipient.trim().replace(/[\s-]/g, '');
    if (!/^09\d{9}$/.test(normalized) && !/^989\d{9}$/.test(normalized) && !/^\+989\d{9}$/.test(normalized)) {
      setError('شماره گیرنده معتبر وارد کنید.');
      return;
    }
    if (!text.trim()) {
      setError('متن پیامک را وارد کنید.');
      return;
    }
    if (!window.confirm('آیا از ارسال پیامک تستی واقعی اطمینان دارید؟ این ارسال ممکن است هزینه داشته باشد.')) return;

    setSending(true);
    try {
      const response = await apiClient.post<SendData>('/farazsms-admin/send-simple', {
        recipients: [normalized],
        text: text.trim(),
      });
      if (!response.success) throw new Error(response.message || 'ارسال پیامک ناموفق بود.');
      const id = response.data?.providerId ? ` شناسه ارسال: ${response.data.providerId}` : '';
      setSendResult(`پیامک با موفقیت به سرویس فراز اس‌ام‌اس تحویل شد.${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ارسال پیامک ناموفق بود.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">مدیریت فراز اس‌ام‌اس</h2>
          <p className="mt-1 text-sm text-gray-500">وضعیت اتصال، اعتبار، اطلاعات حساب و ارسال تستی پیامک</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-50">
          {loading ? 'در حال بررسی…' : 'به‌روزرسانی'}
        </button>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      {sendResult && <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">{sendResult}</div>}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-5">
          <div className="text-sm text-gray-500">وضعیت اتصال</div>
          <div className="mt-2 text-xl font-bold">{status?.reachable ? 'متصل' : status?.configured === false ? 'کلید API تنظیم نشده' : 'بررسی ناموفق'}</div>
          <div className="mt-2 text-xs text-gray-500">{status?.latencyMs == null ? '—' : `زمان پاسخ: ${status.latencyMs} میلی‌ثانیه`}</div>
        </div>
        <div className="rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-5">
          <div className="text-sm text-gray-500">اعتبار حساب</div>
          <div className="mt-2 text-2xl font-bold">{balance?.amount == null ? '—' : Number(balance.amount).toLocaleString('fa-IR')}</div>
          <div className="mt-2 text-xs text-gray-500">موجودی اعلام‌شده توسط سرویس</div>
        </div>
        <div className="rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-5">
          <div className="text-sm text-gray-500">خط ارسال</div>
          <div className="mt-2 text-xl font-bold">{status?.sender || '—'}</div>
          <div className="mt-2 text-xs text-gray-500">شماره خط پیکربندی‌شده</div>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-5">
        <h3 className="font-bold">اطلاعات حساب</h3>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-800/60"><span className="text-sm text-gray-500">نام نمایشی:</span> {profile?.displayName || '—'}</div>
          <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-800/60"><span className="text-sm text-gray-500">شماره موبایل:</span> {profile?.mobile || '—'}</div>
        </div>
      </div>

      <div className="rounded-2xl border border-amber-200 bg-[var(--card-bg)] p-5 dark:border-amber-900/60">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-bold">ارسال پیامک تستی</h3>
            <p className="mt-1 text-xs text-gray-500">ارسال واقعی است و از اعتبار حساب فراز اس‌ام‌اس مصرف می‌کند.</p>
          </div>
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">عملیات حساس</span>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="block"><span className="mb-2 block text-sm font-semibold">شماره گیرنده</span><input value={recipient} onChange={e=>setRecipient(e.target.value)} inputMode="tel" dir="ltr" placeholder="09123456789" className="w-full rounded-xl border border-[var(--card-border-color)] bg-transparent px-4 py-3 outline-none focus:ring-2 focus:ring-cyan-500/30" /></label>
          <label className="block"><span className="mb-2 block text-sm font-semibold">متن پیام</span><textarea value={text} onChange={e=>setText(e.target.value)} rows={3} className="w-full rounded-xl border border-[var(--card-border-color)] bg-transparent px-4 py-3 outline-none focus:ring-2 focus:ring-cyan-500/30" /></label>
        </div>
        <div className="mt-4 flex justify-end"><button type="button" onClick={() => void sendTest()} disabled={sending || !status?.configured} className="rounded-xl bg-cyan-600 px-5 py-2.5 font-semibold text-white disabled:opacity-50">{sending ? 'در حال ارسال…' : 'ارسال پیامک تستی'}</button></div>
      </div>
    </div>
  );
};

export default AdminFarazSmsPanel;
