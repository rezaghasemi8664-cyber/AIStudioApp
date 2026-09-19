import React, { useEffect, useMemo, useState } from 'react';
import { getPortfolioHistory, type PortfolioHistoryPoint } from '../services/portfolioHistoryService';

interface Props { isOnline: boolean; }
type Range = 30 | 90 | 180 | 365;

const money = (value: number | null) => value == null ? '—' : Math.round(value).toLocaleString('fa-IR');
const pct = (value: number | null) => value == null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;

const PortfolioHistoryAccuracy: React.FC<Props> = ({ isOnline }) => {
  const [points, setPoints] = useState<PortfolioHistoryPoint[]>([]);
  const [range, setRange] = useState<Range>(30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!isOnline) { setError('برای دریافت تاریخچه سرمایه باید آنلاین باشید.'); return; }
    setLoading(true); setError(null);
    try { setPoints(await getPortfolioHistory()); }
    catch (e: any) { setPoints([]); setError(e?.response?.data?.message || e?.message || 'دریافت تاریخچه سرمایه ناموفق بود.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [isOnline]);

  const visible = useMemo(() => points.slice(-range), [points, range]);
  const stats = useMemo(() => {
    if (!visible.length) return { startValue: null, endValue: null, startCost: null, endCost: null, returnPercent: null, maxValue: null };
    const first = visible[0];
    const last = visible[visible.length - 1];
    return {
      startValue: first.value,
      endValue: last.value,
      startCost: first.cost,
      endCost: last.cost,
      returnPercent: first.value > 0 ? ((last.value / first.value) - 1) * 100 : null,
      maxValue: Math.max(...visible.map(point => point.value)),
    };
  }, [visible]);

  const chart = useMemo(() => {
    if (!visible.length) return null;
    const values = visible.map(point => point.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const width = 760;
    const height = 220;
    const pad = 24;
    const polyline = visible.map((point, index) => {
      const x = pad + (index * (width - pad * 2)) / Math.max(1, visible.length - 1);
      const y = height - pad - ((point.value - min) / span) * (height - pad * 2);
      return `${x},${y}`;
    }).join(' ');
    return { polyline, min, max };
  }, [visible]);

  return <div dir="rtl" className="page-shell portfolio-history-accuracy-page space-y-5">
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div><h2 className="text-xl font-black">تاریخچه دقیق سرمایه‌گذاری</h2><p className="text-sm text-gray-500 dark:text-gray-400 mt-1">فقط از تاریخ ورود هر سهم به بعد در ارزش و بهای سبد محاسبه می‌شود.</p></div>
      <button type="button" onClick={load} disabled={loading || !isOnline} className="rounded-xl bg-cyan-600 text-white px-4 py-2 font-bold disabled:opacity-50">{loading ? 'در حال بروزرسانی...' : 'بروزرسانی'}</button>
    </div>
    {error && <div className="rounded-xl border border-red-300 bg-red-50 dark:bg-red-950/20 p-4 text-red-700 dark:text-red-300">{error}</div>}
    <div className="flex gap-2 flex-wrap">{([30, 90, 180, 365] as Range[]).map(value => <button key={value} type="button" onClick={() => setRange(value)} className={`rounded-lg px-3 py-2 text-sm font-bold ${range === value ? 'bg-cyan-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}>{value === 30 ? '۱ ماه' : value === 90 ? '۳ ماه' : value === 180 ? '۶ ماه' : '۱ سال'}</button>)}</div>
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {[['ارزش شروع', money(stats.startValue)], ['ارزش پایان', money(stats.endValue)], ['سرمایه شروع', money(stats.startCost)], ['سرمایه پایان', money(stats.endCost)], ['تغییر ارزش', pct(stats.returnPercent)]].map(([label, value]) => <div key={label} className="rounded-2xl border border-[var(--color-border)] bg-white/80 dark:bg-gray-900/60 p-4"><p className="text-xs text-gray-500">{label}</p><p className="mt-2 text-lg font-black font-mono">{value}</p></div>)}
    </div>
    {chart ? <div className="rounded-2xl border border-[var(--color-border)] bg-white/80 dark:bg-gray-900/60 p-4"><div className="flex justify-between text-xs text-gray-500 mb-2"><span>حداقل: {money(chart.min)}</span><span>حداکثر: {money(chart.max)}</span></div><div className="overflow-x-auto"><svg viewBox="0 0 760 220" className="w-full min-w-[620px] h-56" role="img" aria-label="نمودار ارزش تاریخی سبد"><polyline fill="none" stroke="currentColor" strokeWidth="3" points={chart.polyline} /></svg></div></div> : <div className="rounded-2xl border border-dashed border-[var(--color-border)] p-8 text-center text-gray-500">برای این بازه داده تاریخی معتبر در دسترس نیست.</div>}
    {visible.length > 0 && <div className="rounded-2xl border border-[var(--color-border)] overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50 dark:bg-gray-800"><tr><th className="p-3 text-right">تاریخ</th><th className="p-3 text-right">ارزش سبد</th><th className="p-3 text-right">بهای تمام‌شده فعال</th><th className="p-3 text-right">سود/زیان</th><th className="p-3 text-right">بازدهی</th></tr></thead><tbody>{[...visible].reverse().slice(0, 30).map(point => <tr key={point.date} className="border-t border-[var(--color-border)]"><td className="p-3 font-mono">{point.date}</td><td className="p-3 font-mono">{money(point.value)}</td><td className="p-3 font-mono">{money(point.cost)}</td><td className="p-3 font-mono">{money(point.pnl)}</td><td className="p-3 font-mono">{pct(point.returnPercent)}</td></tr>)}</tbody></table></div></div>}
  </div>;
};

export default PortfolioHistoryAccuracy;
