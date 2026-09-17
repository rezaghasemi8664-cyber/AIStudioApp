import React, { useCallback, useEffect, useState } from 'react';
import { getSmartScore, type SmartScoreResult } from '../services/smartScoreService';

interface Props { symbol: string; isOnline: boolean; }

const statusText: Record<SmartScoreResult['status'], string> = { Bullish: 'مثبت', Neutral: 'خنثی', Bearish: 'منفی' };
const statusClass: Record<SmartScoreResult['status'], string> = { Bullish: 'text-emerald-600', Neutral: 'text-amber-600', Bearish: 'text-red-600' };
const scoreClass = (score: number) => score >= 67 ? 'text-emerald-600' : score <= 33 ? 'text-red-600' : 'text-amber-600';

const SmartScore: React.FC<Props> = ({ symbol, isOnline }) => {
  const [result, setResult] = useState<SmartScoreResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!symbol || !isOnline) return;
    setLoading(true); setError('');
    try { setResult(await getSmartScore(symbol)); }
    catch (err: any) { setResult(null); setError(err?.response?.data?.message || err?.message || 'دریافت امتیاز ناموفق بود.'); }
    finally { setLoading(false); }
  }, [symbol, isOnline]);

  useEffect(() => { void load(); }, [load]);

  if (!symbol) return <div className="rounded-2xl border border-dashed border-[var(--color-border)] p-8 text-center text-gray-500">ابتدا یک نماد را انتخاب کنید.</div>;
  if (!isOnline) return <div className="rounded-2xl border border-dashed border-[var(--color-border)] p-8 text-center text-gray-500">برای دریافت Smart Score باید آنلاین باشید.</div>;
  if (loading) return <div className="rounded-2xl border border-[var(--color-border)] p-8 text-center text-gray-500">در حال محاسبه امتیاز داده‌محور…</div>;
  if (error) return <div className="rounded-2xl border border-red-200 bg-red-50 dark:bg-red-950/20 p-4 text-sm text-red-700 dark:text-red-300">{error}</div>;
  if (!result) return null;

  return <div dir="rtl" className="space-y-4">
    <div className="rounded-2xl border border-[var(--color-border)] bg-white/80 dark:bg-gray-900/60 p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div><h3 className="text-lg font-black">Smart Score — {symbol}</h3><p className="text-xs text-gray-500 mt-1">امتیاز کاملاً داده‌محور و قابل ممیزی؛ بدون هوش مصنوعی</p></div>
        <div className="flex items-center gap-4"><div className={`text-5xl font-black ${scoreClass(result.score)}`}>{result.score}</div><div><div className={`font-black ${statusClass[result.status]}`}>{statusText[result.status]}</div><div className="text-[11px] text-gray-500">از ۱۰۰</div></div></div>
      </div>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
      {result.components.map((item) => <div key={item.label} className="rounded-2xl border border-[var(--color-border)] bg-white/80 dark:bg-gray-900/60 p-4"><div className="flex justify-between gap-3"><span className="font-bold text-sm">{item.label}</span><span className={`font-black ${scoreClass(item.score)}`}>{item.score}</span></div><div className="mt-3 h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden"><div className="h-full rounded-full bg-cyan-500" style={{ width: `${Math.max(0, Math.min(100, item.score))}%` }} /></div><p className="mt-2 text-xs text-gray-500 leading-5">{item.details}</p></div>)}
    </div>
    <div className="text-[11px] text-gray-400">منبع: {result.source} · زمان محاسبه: {new Date(result.calculatedAt).toLocaleString('fa-IR')}</div>
  </div>;
};

export default SmartScore;
