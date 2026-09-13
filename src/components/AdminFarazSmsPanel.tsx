import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as apiClient from '../services/apiClient';

type StatusData = { configured?: boolean; reachable?: boolean; latencyMs?: number | null; sender?: string; message?: string };
type BalanceData = { amount?: number | string | null };
type ProfileData = { displayName?: string | null; mobile?: string | null };
type SendData = { providerId?: string | null; status?: string; message?: string | null };
type HistoryItem = {
  id: number;
  mobile: string;
  status: string;
  providerId?: string | null;
  messageType?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  createdAt: string;
};
type HistoryResponse = {
  items: HistoryItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

const PAGE_SIZE = 20;

const statusLabel: Record<string, string> = {
  sent: 'ارسال‌شده',
  delivered: 'تحویل‌شده',
  failed: 'ناموفق',
  pending: 'در انتظار',
  queued: 'در صف',
  processing: 'در حال ارسال',
};

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
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPagination, setHistoryPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 });
  const [phoneFilter, setPhoneFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [messageTypeFilter, setMessageTypeFilter] = useState('');

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

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const params = new URLSearchParams({ page: String(historyPage), limit: String(PAGE_SIZE) });
      if (phoneFilter.trim()) params.set('phone', phoneFilter.trim());
      if (statusFilter) params.set('status', statusFilter);
      if (messageTypeFilter.trim()) params.set('messageType', messageTypeFilter.trim());

      const response = await apiClient.get<HistoryResponse>(`/farazsms-admin/history?${params.toString()}`);
      if (!response.success) throw new Error(response.message || 'دریافت تاریخچه پیامک ناموفق بود.');
      setHistory(response.data?.items || []);
      setHistoryPagination(response.data?.pagination || { page: historyPage, limit: PAGE_SIZE, total: 0, totalPages: 1 });
    } catch (e) {
      setHistory([]);
      setHistoryError(e instanceof Error ? e.message : 'خطا در دریافت تاریخچه پیامک.');
    } finally {
      setHistoryLoading(false);
    }
  }, [historyPage, messageTypeFilter, phoneFilter, statusFilter]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadHistory(); }, [loadHistory]);

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
      void loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ارسال پیامک ناموفق بود.');
    } finally {
      setSending(false);
    }
  };

  const pageButtons = useMemo(() => {
    const totalPages = historyPagination.totalPages;
    const start = Math.max(1, Math.min(historyPage - 2, totalPages - 4));
    const end = Math.min(totalPages, start + 4);
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }, [historyPage, historyPagination.totalPages]);

  const applyFilters = () => {
    setHistoryPage(1);
  };

  const formatDate = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">مدیریت فراز اس‌ام‌اس</h2>
          <p className="mt-1 text-sm text-gray-500">وضعیت اتصال، اعتبار، اطلاعات حساب، ارسال و تاریخچه پیامک‌ها</p>
        </div>
        <button type="button" onClick={() => { void load(); void loadHistory(); }} disabled={loading || historyLoading} className="rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-50">
          {loading || historyLoading ? 'در حال بررسی…' : 'به‌روزرسانی'}
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

      <div className="rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-bold">تاریخچه پیامک‌ها</h3>
            <p className="mt-1 text-xs text-gray-500">رهگیری ارسال‌ها، وضعیت گیرنده، شناسه Provider و خطاها</p>
          </div>
          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">{historyPagination.total.toLocaleString('fa-IR')} رکورد</span>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
          <input value={phoneFilter} onChange={e => setPhoneFilter(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') applyFilters(); }} inputMode="tel" dir="ltr" placeholder="فیلتر شماره گیرنده" className="rounded-xl border border-[var(--card-border-color)] bg-transparent px-4 py-2.5 outline-none focus:ring-2 focus:ring-cyan-500/30" />
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setHistoryPage(1); }} className="rounded-xl border border-[var(--card-border-color)] bg-[var(--card-bg)] px-4 py-2.5 outline-none focus:ring-2 focus:ring-cyan-500/30">
            <option value="">همه وضعیت‌ها</option>
            <option value="sent">ارسال‌شده</option>
            <option value="delivered">تحویل‌شده</option>
            <option value="failed">ناموفق</option>
            <option value="pending">در انتظار</option>
            <option value="queued">در صف</option>
          </select>
          <input value={messageTypeFilter} onChange={e => setMessageTypeFilter(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') applyFilters(); }} placeholder="نوع پیام" className="rounded-xl border border-[var(--card-border-color)] bg-transparent px-4 py-2.5 outline-none focus:ring-2 focus:ring-cyan-500/30" />
          <button type="button" onClick={applyFilters} disabled={historyLoading} className="rounded-xl bg-cyan-600 px-4 py-2.5 font-semibold text-white disabled:opacity-50">اعمال فیلتر</button>
        </div>

        {historyError && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{historyError}</div>}

        <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--card-border-color)]">
          <table className="min-w-[900px] w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 dark:bg-gray-800/70 dark:text-gray-300">
              <tr>
                <th className="px-4 py-3 text-right font-semibold">تاریخ</th>
                <th className="px-4 py-3 text-right font-semibold">گیرنده</th>
                <th className="px-4 py-3 text-right font-semibold">نوع پیام</th>
                <th className="px-4 py-3 text-right font-semibold">وضعیت</th>
                <th className="px-4 py-3 text-right font-semibold">Provider ID</th>
                <th className="px-4 py-3 text-right font-semibold">خطا</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {historyLoading ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-500">در حال دریافت تاریخچه…</td></tr>
              ) : history.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-500">رکوردی برای نمایش وجود ندارد.</td></tr>
              ) : history.map(item => (
                <tr key={item.id} className="hover:bg-gray-50/70 dark:hover:bg-gray-800/40">
                  <td className="whitespace-nowrap px-4 py-3">{formatDate(item.createdAt)}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-medium" dir="ltr">{item.mobile}</td>
                  <td className="px-4 py-3">{item.messageType || '—'}</td>
                  <td className="px-4 py-3"><span className="inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold dark:bg-gray-800">{statusLabel[item.status] || item.status || '—'}</span></td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs" dir="ltr">{item.providerId || '—'}</td>
                  <td className="max-w-[320px] px-4 py-3 text-xs text-red-600 dark:text-red-400">{item.errorMessage || item.errorCode || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-gray-500">صفحه {historyPagination.page.toLocaleString('fa-IR')} از {historyPagination.totalPages.toLocaleString('fa-IR')}</div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setHistoryPage(page => Math.max(1, page - 1))} disabled={historyPage <= 1 || historyLoading} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40">قبلی</button>
            {pageButtons.map(page => <button key={page} type="button" onClick={() => setHistoryPage(page)} disabled={historyLoading} className={`rounded-lg border px-3 py-2 text-sm ${page === historyPage ? 'bg-cyan-600 text-white' : ''}`}>{page.toLocaleString('fa-IR')}</button>)}
            <button type="button" onClick={() => setHistoryPage(page => Math.min(historyPagination.totalPages, page + 1))} disabled={historyPage >= historyPagination.totalPages || historyLoading} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40">بعدی</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminFarazSmsPanel;
