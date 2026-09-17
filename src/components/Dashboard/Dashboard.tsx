import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getDashboardData } from '../../services/dashboardService';
import type { DashboardData, DashboardMover } from '../../types/dashboard';

interface DashboardProps {
  isOnline?: boolean;
  onNavigate?: (target: string) => void;
}

const formatNumber = (value: number | null | undefined): string =>
  value === null || value === undefined || !Number.isFinite(value)
    ? '—'
    : new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 2 }).format(value);

const formatPercent = (value: number): string => {
  const text = new Intl.NumberFormat('fa-IR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(value));
  return value > 0 ? `+${text}٪` : value < 0 ? `−${text}٪` : '۰٫۰۰٪';
};

const MoverList: React.FC<{ title: string; items: DashboardMover[] }> = ({ title, items }) => (
  <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
    <div className="mb-4 flex items-center justify-between">
      <h3 className="font-bold text-[var(--color-text-primary)]">{title}</h3>
      <span className="text-xs text-slate-500">۱۰ نماد</span>
    </div>
    {items.length === 0 ? (
      <div className="rounded-xl bg-black/5 px-3 py-6 text-center text-sm text-slate-500 dark:bg-white/5">داده‌ای در دسترس نیست</div>
    ) : (
      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={`${item.symbol}-${index}`} className="flex items-center justify-between rounded-xl px-3 py-2 hover:bg-black/5 dark:hover:bg-white/5">
            <div className="min-w-0">
              <div className="font-bold text-sm text-[var(--color-text-primary)]">{item.symbol}</div>
              {item.name && <div className="truncate text-xs text-slate-500">{item.name}</div>}
            </div>
            <div className="text-left">
              <div className="text-sm font-bold tabular-nums text-[var(--color-text-primary)]">{formatNumber(item.price)}</div>
              <div className={`text-xs font-bold tabular-nums ${item.changePercent >= 0 ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'}`} dir="ltr">
                {formatPercent(item.changePercent)}
              </div>
            </div>
          </div>
        ))}
      </div>
    )}
  </section>
);

const Dashboard: React.FC<DashboardProps> = ({ isOnline = true, onNavigate }) => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isOnline) {
      setError('اتصال به سرور در دسترس نیست.');
      setLoading(false);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      setData(await getDashboardData());
    } catch (err) {
      console.error('[Dashboard]', err);
      setError('دریافت اطلاعات داشبورد انجام نشد.');
    } finally {
      setLoading(false);
    }
  }, [isOnline]);

  useEffect(() => { void load(); }, [load]);

  const marketStatus = useMemo(() => data?.market?.indices[0]?.isMarketOpen ? 'بازار باز است' : 'بازار بسته است', [data]);

  if (loading && !data) {
    return <div dir="rtl" className="space-y-4 animate-pulse"><div className="h-32 rounded-2xl bg-slate-200/40 dark:bg-white/5" /><div className="grid gap-4 md:grid-cols-3"><div className="h-28 rounded-2xl bg-slate-200/40 dark:bg-white/5" /><div className="h-28 rounded-2xl bg-slate-200/40 dark:bg-white/5" /><div className="h-28 rounded-2xl bg-slate-200/40 dark:bg-white/5" /></div></div>;
  }

  return (
    <div dir="rtl" className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black text-[var(--color-text-primary)]">داشبورد بازار</h1>
          <p className="mt-1 text-sm text-slate-500">نمای کلی بازار، شاخص‌ها و وضعیت معاملات</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-bold text-slate-500 dark:bg-white/5">{marketStatus}</span>
          <button type="button" onClick={() => void load()} className="rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm font-bold text-[var(--color-text-primary)] hover:bg-black/5 dark:hover:bg-white/5">به‌روزرسانی</button>
        </div>
      </header>

      {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-500">{error}</div>}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {(data?.market?.indices ?? []).map((index) => (
          <div key={index.name} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
            <div className="text-sm font-bold text-slate-500">{index.name}</div>
            <div className="mt-3 text-2xl font-black tabular-nums text-[var(--color-text-primary)]">{formatNumber(index.value)}</div>
            <div className={`mt-2 text-sm font-bold ${index.changeValue >= 0 ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'}`}>
              {formatNumber(index.changeValue)} ({formatPercent(index.changePercent)})
            </div>
          </div>
        ))}
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm"><div className="text-sm font-bold text-slate-500">ارزش معاملات</div><div className="mt-3 text-2xl font-black text-[var(--color-text-primary)]">{formatNumber(data?.market?.totalValue)}</div></div>
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm"><div className="text-sm font-bold text-slate-500">حجم معاملات</div><div className="mt-3 text-2xl font-black text-[var(--color-text-primary)]">{formatNumber(data?.market?.totalVolume)}</div></div>
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm"><div className="text-sm font-bold text-slate-500">تعداد معاملات</div><div className="mt-3 text-2xl font-black text-[var(--color-text-primary)]">{formatNumber(data?.market?.totalTrades)}</div></div>
        <button type="button" onClick={() => onNavigate?.('analysis')} className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-5 text-right hover:bg-cyan-500/15"><div className="text-sm font-bold text-cyan-600 dark:text-cyan-400">دسترسی سریع</div><div className="mt-3 text-lg font-black text-[var(--color-text-primary)]">تحلیل نماد ←</div></button>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <MoverList title="بیشترین رشد" items={data?.gainers ?? []} />
        <MoverList title="بیشترین افت" items={data?.losers ?? []} />
      </div>
    </div>
  );
};

export default Dashboard;
