import React, { useCallback, useEffect, useState } from 'react';
import * as referralService from '../services/adminReferralService';

const card = 'rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-5';
const input = 'w-full rounded-xl border border-[var(--card-border-color)] bg-transparent px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-cyan-500/30';
const fmt = (value: number) => Number(value || 0).toLocaleString('fa-IR');
const dateTimeFmt = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
    dateStyle: 'short', timeStyle: 'short', hour12: false, timeZone: 'Asia/Tehran',
  }).format(date);
};
const userName = (user: referralService.AdminReferralUser) =>
  user.name || [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || '—';

const AdminReferralInvitesPanel: React.FC = () => {
  const [filters, setFilters] = useState({ inviterId: '', inviteeId: '', name: '', registeredFrom: '', registeredTo: '' });
  const [applied, setApplied] = useState(filters);
  const [data, setData] = useState<referralService.AdminReferralResult | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (targetPage = page, targetFilters = applied) => {
    setLoading(true);
    setError(null);
    try {
      const result = await referralService.getAdminReferrals({ ...targetFilters, page: targetPage, limit: 25 });
      setData(result);
      setPage(result.pagination.page);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'دریافت اطلاعات کد دعوت ناموفق بود.');
    } finally {
      setLoading(false);
    }
  }, [page, applied]);

  useEffect(() => { void load(1, applied); }, [applied]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyFilters = () => {
    if (filters.registeredFrom && filters.registeredTo && filters.registeredFrom > filters.registeredTo) {
      setError('تاریخ شروع ثبت‌نام نباید بعد از تاریخ پایان باشد.');
      return;
    }
    setPage(1);
    setApplied({ ...filters });
  };
  const clearFilters = () => {
    const empty = { inviterId: '', inviteeId: '', name: '', registeredFrom: '', registeredTo: '' };
    setFilters(empty);
    setPage(1);
    setApplied(empty);
  };

  const identity = (user: referralService.AdminReferralUser) => (
    <div className="min-w-[220px] space-y-1">
      <div className="font-semibold">{userName(user)}</div>
      <div className="text-xs text-gray-500">شناسه: <span className="font-mono">{fmt(user.id)}</span> · @{user.username || '—'}</div>
      <div className="text-xs text-gray-500 break-all" dir="ltr">{user.email || '—'}</div>
      <div className="text-xs text-gray-500" dir="ltr">{user.mobile || user.phone || '—'}</div>
    </div>
  );

  return <section className={card} dir="rtl">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h3 className="text-lg font-bold">کد دعوت</h3>
        <p className="mt-1 text-sm text-gray-500">کاربرانی که با کد دعوت کاربر دیگری ثبت‌نام کرده‌اند؛ تاریخ ثبت‌نام بر اساس زمان ایجاد حساب دعوت‌شده نمایش داده می‌شود.</p>
      </div>
      <button onClick={() => void load(page)} disabled={loading} className="rounded-xl border px-4 py-2 text-sm disabled:opacity-50">بروزرسانی</button>
    </div>

    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-[var(--card-border-color)] p-3"><div className="text-xs text-gray-500">ثبت‌نام‌های دعوت‌شده</div><div className="mt-1 text-2xl font-bold">{fmt(data?.summary.total || 0)}</div></div>
      <div className="rounded-xl border border-[var(--card-border-color)] p-3"><div className="text-xs text-gray-500">دعوت‌کنندگان یکتا</div><div className="mt-1 text-2xl font-bold">{fmt(data?.summary.uniqueInviters || 0)}</div></div>
      <div className="rounded-xl border border-[var(--card-border-color)] p-3"><div className="text-xs text-gray-500">کاربران دعوت‌شده یکتا</div><div className="mt-1 text-2xl font-bold">{fmt(data?.summary.uniqueInvitees || 0)}</div></div>
    </div>

    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
      <input className={input} value={filters.name} onChange={e => setFilters(f => ({ ...f, name: e.target.value }))} placeholder="نام یا نام کاربری دعوت‌کننده/شده"/>
      <input className={input} type="number" min="1" value={filters.inviterId} onChange={e => setFilters(f => ({ ...f, inviterId: e.target.value }))} placeholder="شناسه دعوت‌کننده"/>
      <input className={input} type="number" min="1" value={filters.inviteeId} onChange={e => setFilters(f => ({ ...f, inviteeId: e.target.value }))} placeholder="شناسه دعوت‌شده"/>
      <label className="space-y-1"><span className="text-xs text-gray-500">ثبت‌نام از تاریخ</span><input className={input} type="date" value={filters.registeredFrom} onChange={e => setFilters(f => ({ ...f, registeredFrom: e.target.value }))}/></label>
      <label className="space-y-1"><span className="text-xs text-gray-500">ثبت‌نام تا تاریخ</span><input className={input} type="date" value={filters.registeredTo} onChange={e => setFilters(f => ({ ...f, registeredTo: e.target.value }))}/></label>
    </div>
    <div className="mt-3 flex flex-wrap gap-2">
      <button onClick={applyFilters} disabled={loading} className="rounded-xl bg-cyan-600 px-5 py-2.5 font-semibold text-white disabled:opacity-50">اعمال فیلتر</button>
      <button onClick={clearFilters} disabled={loading} className="rounded-xl border px-5 py-2.5 disabled:opacity-50">پاک کردن فیلترها</button>
    </div>

    {error && <div className="mt-3 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[1250px] text-sm">
        <thead><tr className="border-b">
          <th className="p-3 text-right">دعوت‌کننده</th>
          <th className="p-3 text-right">دعوت‌شده</th>
          <th className="p-3 text-right">کد دعوت</th>
          <th className="p-3 text-right">تاریخ و زمان ثبت‌نام</th>
        </tr></thead>
        <tbody>
          {(data?.items || []).map(row => <tr key={row.id} className="border-b last:border-0 align-top hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
            <td className="p-3">{identity(row.inviter)}</td>
            <td className="p-3">{identity(row.invitee)}</td>
            <td className="p-3 font-mono" dir="ltr">{row.referralCode || '—'}</td>
            <td className="p-3 whitespace-nowrap">{dateTimeFmt(row.invitee.createdAt)}</td>
          </tr>)}
          {!loading && !(data?.items.length) && <tr><td colSpan={4} className="p-8 text-center text-gray-500">ثبت‌نام دعوت‌شده‌ای برای این فیلترها پیدا نشد.</td></tr>}
          {loading && <tr><td colSpan={4} className="p-8 text-center text-gray-500">در حال دریافت اطلاعات کد دعوت…</td></tr>}
        </tbody>
      </table>
    </div>
    <div className="mt-4 flex items-center justify-between gap-3">
      <span className="text-xs text-gray-500">صفحه {fmt(page)} از {fmt(data?.pagination.totalPages || 0)} · مجموع نتایج: {fmt(data?.pagination.total || 0)}</span>
      <div className="flex gap-2">
        <button disabled={loading || page <= 1} onClick={() => void load(page - 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">قبلی</button>
        <button disabled={loading || page >= (data?.pagination.totalPages || 0)} onClick={() => void load(page + 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">بعدی</button>
      </div>
    </div>
  </section>;
};

export default AdminReferralInvitesPanel;
