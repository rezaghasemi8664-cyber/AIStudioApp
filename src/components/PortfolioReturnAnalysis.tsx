import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getPortfolioHistory, type PortfolioHistoryPoint } from '../services/portfolioHistoryService';

interface Props { isOnline: boolean; }

const money = (value: number | null) => value == null ? '—' : Math.round(value).toLocaleString('fa-IR');
const pct = (value: number | null) => value == null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;

const PortfolioReturnAnalysis: React.FC<Props> = ({ isOnline }) => {
  const [points, setPoints] = useState<PortfolioHistoryPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isOnline) { setError('برای دریافت بازدهی تاریخی سبد باید آنلاین باشید.'); return; }
    setLoading(true); setError(null);
    try { setPoints(await getPortfolioHistory()); }
    catch (e: any) { setError(e?.response?.data?.message || e?.message || 'دریافت بازدهی تاریخی سبد ناموفق بود.'); }
    finally { setLoading(false); }
  }, [isOnline]);

  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    if (!points.length) return { totalPnl: null, totalReturn: null, totalCapitalChange: null, marketPnl: null, avgDailyReturn: null, positiveDays: 0, negativeDays: 0 };
    const first = points[0];
    const last = points[points.length - 1];
    const marketPnl = points.reduce((sum, point) => sum + point.marketPnl, 0);
    const capitalChange = points.reduce((sum, point) => sum + point.capitalChange, 0);
    const dailyReturns = points.map(point => point.dailyReturnPercent).filter((value): value is number => value != null);
    return {
      totalPnl: last.pnl,
      totalReturn: last.cost > 0 ? (last.pnl / last.cost) * 100 : null,
      totalCapitalChange: capitalChange,
      marketPnl,
      avgDailyReturn: dailyReturns.length ? dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length : null,
      positiveDays: points.filter(point => point.marketPnl > 0).length,
      negativeDays: points.filter(point => point.marketPnl < 0).length,
      firstDate: first.date,
      lastDate: last.date,
    };
  }, [points]);

  return <div dir="rtl" className="space-y-5">
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div><h2 className="text-2xl font-black">بازدهی واقعی سرمایه‌گذاری</h2><p className="text-sm text-gray-500 dark:text-gray-400 mt-1">تفکیک تغییر سرمایه از سود و زیان ناشی از حرکت قیمت بر اساس داده واقعی</p></div>
      <button type="button" onClick={load} disabled={loading || !isOnline} className="rounded-xl bg-cyan-600 text-white px-4 py-2 font-bold disabled:opacity-50">{loading ? 'در حال محاسبه...' : 'بروزرسانی'}</button>
    </div>
    {error && <div className="rounded-xl border border-red-300 bg-red-50 dark:bg-red-950/20 p-4 text-red-700 dark:text-red-300">{error}</div>}
    {!loading && !error && !points.length && <div className="rounded-2xl border border-[var(--color-border)] p-6 text-center text-gray-500">داده تاریخی معتبر برای سبد موجود نیست.</div>}
    {points.length > 0 && <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[['سود/زیان تجمعی', money(stats.totalPnl)], ['بازدهی بر مبنای بهای تمام‌شده', pct(stats.totalReturn)], ['تغییر سرمایه ثبت‌شده', money(stats.totalCapitalChange)], ['P/L ناشی از حرکت بازار', money(stats.marketPnl)]].map(([label, value]) => <div key={label} className="rounded-2xl border border-[var(--color-border)] bg-white/80 dark:bg-gray-900/60 p-4"><p className="text-xs text-gray-500">{label}</p><p className="mt-2 text-xl font-black font-mono">{value}</p></div>)}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[['میانگین بازدهی روزانه', pct(stats.avgDailyReturn)], ['روزهای مثبت بازار', String(stats.positiveDays)], ['روزهای منفی بازار', String(stats.negativeDays)], ['بازه محاسبه', `${stats.firstDate} تا ${stats.lastDate}`]].map(([label, value]) => <div key={label} className="rounded-2xl border border-[var(--color-border)] bg-white/70 dark:bg-gray-900/50 p-4"><p className="text-xs text-gray-500">{label}</p><p className="mt-2 text-lg font-black font-mono">{value}</p></div>)}
      </div>
      <div className="rounded-2xl border border-[var(--color-border)] bg-white/80 dark:bg-gray-900/60 overflow-x-auto">
        <div className="p-4 border-b border-[var(--color-border)]"><h3 className="font-black">تفکیک روزانه سرمایه و عملکرد بازار</h3><p className="text-xs text-gray-500 mt-1">«تغییر سرمایه» از ورود موقعیت‌های موجود بر اساس تاریخ ورود محاسبه شده و «P/L بازار» تغییر ارزش پس از تعدیل تغییر سرمایه است.</p></div>
        <table className="w-full text-sm"><thead><tr className="text-right text-gray-500"><th className="p-3">تاریخ</th><th className="p-3">ارزش سبد</th><th className="p-3">بهای تمام‌شده</th><th className="p-3">تغییر سرمایه</th><th className="p-3">P/L بازار</th><th className="p-3">بازدهی روز</th></tr></thead><tbody>{points.slice(-60).map(point => <tr key={point.date} className="border-t border-[var(--color-border)]"><td className="p-3 font-mono">{point.date}</td><td className="p-3 font-mono">{money(point.value)}</td><td className="p-3 font-mono">{money(point.cost)}</td><td className="p-3 font-mono">{money(point.capitalChange)}</td><td className={`p-3 font-mono ${point.marketPnl >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{money(point.marketPnl)}</td><td className={`p-3 font-mono ${point.dailyReturnPercent == null || point.dailyReturnPercent >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{pct(point.dailyReturnPercent)}</td></tr>)}</tbody></table>
      </div>
    </>}
  </div>;
};

export default PortfolioReturnAnalysis;
