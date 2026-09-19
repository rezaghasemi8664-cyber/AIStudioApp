import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getCodalReports, CodalReportsResult } from '../services/codalIntelligenceService';

interface Props { isOnline: boolean; }

const labels: Record<string, string> = {
  'capital-increase': 'افزایش سرمایه',
  dividend: 'تقسیم سود',
  'financial-statement': 'صورت مالی',
  contract: 'قرارداد',
};

const CodalPeriodAnalysis: React.FC<Props> = ({ isOnline }) => {
  const [result, setResult] = useState<CodalReportsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!isOnline) { setError('اتصال آنلاین در دسترس نیست.'); return; }
    setLoading(true); setError('');
    try { setResult(await getCodalReports({ limit: 200 })); }
    catch (e: any) { setError(e?.response?.data?.message || e?.message || 'دریافت داده‌های کدال ناموفق بود.'); }
    finally { setLoading(false); }
  }, [isOnline]);

  useEffect(() => { void load(); }, [load]);

  const trend = result?.summary.periodicTrend;
  const sensitive = result?.summary.sensitiveEvents;
  const recentPeriods = useMemo(() => (trend?.periods || []).slice(-6), [trend]);
  const max = Math.max(...recentPeriods.map(item => item.reports), 1);

  return (
    <section dir="rtl" className="page-shell codal-period-analysis-page space-y-5">
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--color-border)] bg-white/80 dark:bg-gray-900/60 p-4">
        <div><h2 className="font-black text-lg">تحلیل دوره‌ای کدال</h2><p className="text-xs text-gray-500 mt-1">مقایسه بر اساس تاریخ انتشار واقعی اطلاعیه‌های دریافتی</p></div>
        <button type="button" onClick={() => void load()} disabled={loading} className="rounded-xl bg-cyan-600 text-white px-4 py-2 font-bold disabled:opacity-50">{loading ? 'در حال دریافت…' : 'بروزرسانی'}</button>
      </div>
      {error && <div className="rounded-2xl border border-red-300 bg-red-50 dark:bg-red-950/20 p-4 text-red-700 dark:text-red-300">{error}</div>}
      {result && trend && sensitive && <>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {sensitive.categories.map(category => <div key={category} className="rounded-2xl border border-[var(--color-border)] bg-white/80 dark:bg-gray-900/60 p-4"><div className="text-xs text-gray-500">{labels[category] || category}</div><div className="text-2xl font-black mt-1">{sensitive.counts[category] || 0}</div><div className="text-xs text-gray-500 mt-1">در بازه فعلی</div></div>)}
        </div>
        <div className="rounded-2xl border border-[var(--color-border)] bg-white/80 dark:bg-gray-900/60 p-4">
          <div className="flex flex-wrap justify-between gap-3 mb-4"><div className="font-black">مقایسه دوره‌های انتشار</div><div className="text-sm text-gray-500">{trend.previousPeriod || '—'} ← {trend.latestPeriod || '—'}</div></div>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-[var(--color-border)] p-4"><div className="text-xs text-gray-500">دوره اخیر</div><div className="text-2xl font-black mt-1">{trend.latestReports}</div><div className="text-sm mt-1">{trend.latestPeriod || '—'}</div></div>
            <div className="rounded-xl border border-[var(--color-border)] p-4"><div className="text-xs text-gray-500">دوره قبل</div><div className="text-2xl font-black mt-1">{trend.previousReports ?? '—'}</div><div className="text-sm mt-1">{trend.previousPeriod || '—'}</div></div>
          </div>
          {trend.changePercent != null && <div className="mt-4 rounded-xl border border-[var(--color-border)] p-4"><span className="text-sm text-gray-500">تغییر تعداد اطلاعیه‌ها:</span> <b>{trend.changePercent.toFixed(2)}٪</b></div>}
        </div>
        <div className="rounded-2xl border border-[var(--color-border)] bg-white/80 dark:bg-gray-900/60 p-4"><div className="font-black mb-4">روند شش دوره اخیر</div><div className="flex items-end gap-3 h-40">{recentPeriods.map(point => <div key={point.period} className="flex-1 h-full flex flex-col justify-end items-center gap-1"><div className="text-xs">{point.reports}</div><div className="w-full max-w-12 rounded-t-lg bg-cyan-600/80" style={{ height: `${Math.max((point.reports / max) * 80, 6)}%` }} /><div className="text-[10px] text-gray-500 whitespace-nowrap">{point.period}</div></div>)}</div></div>
        <div className="rounded-2xl border border-[var(--color-border)] bg-white/80 dark:bg-gray-900/60 p-4"><div className="font-black mb-3">آخرین رویداد حساس هر دسته</div><div className="grid md:grid-cols-2 gap-3">{sensitive.categories.map(category => { const item = sensitive.latest[category]; return <div key={category} className="rounded-xl border border-[var(--color-border)] p-3"><div className="text-sm font-bold">{labels[category] || category}</div><div className="text-sm mt-2">{item?.title || 'اطلاعیه‌ای در این دسته موجود نیست.'}</div><div className="text-xs text-gray-500 mt-1">{item?.publishDate || '—'} {item?.symbol ? `• ${item.symbol}` : ''}</div></div>; })}</div></div>
      </>}
    </section>
  );
};

export default CodalPeriodAnalysis;
