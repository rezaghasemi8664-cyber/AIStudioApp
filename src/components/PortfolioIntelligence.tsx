import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../api/apiClient';
import * as portfolioService from '../services/portfolioService';
import { getMarketRadarHistory } from '../services/marketRadarService';
import { getPortfolioHistory, getPortfolioRealizedPerformance } from '../services/portfolioHistoryService';

interface Props { isOnline: boolean; }
interface HistoryPoint { date: string; value: number; cost: number; pnl: number; returnPercent: number; drawdownPercent?: number; peakValue?: number; }
interface BenchmarkPoint { timestamp: string; index: number; }
interface Holding { id: string; symbol: string; name?: string; quantity: number; entryPrice: number; currentPrice: number | null; changePercent: number | null; value: number | null; cost: number; pnl: number | null; pnlPercent: number | null; }

const num = (value: unknown): number | null => { const n = Number(value); return Number.isFinite(n) ? n : null; };
const money = (value: number | null) => value == null ? '—' : Math.round(value).toLocaleString('fa-IR');
const pct = (value: number | null) => value == null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

async function quote(symbol: string): Promise<{ price: number | null; change: number | null }> {
  const response = await api.get(`/brs/symbol/${encodeURIComponent(symbol)}`);
  const raw = response?.data?.data ?? response?.data ?? {};
  return { price: num(raw.lastPrice ?? raw.last_price ?? raw.currentPrice ?? raw.closePrice ?? raw.closingPrice), change: num(raw.lastChangePercent ?? raw.last_change_percent ?? raw.changePercent ?? raw.percentChange) };
}

const PortfolioIntelligence: React.FC<Props> = ({ isOnline }) => {
  const [items, setItems] = useState<Holding[]>([]);
  const [historyPoints, setHistoryPoints] = useState<HistoryPoint[]>([]);
  const [benchmarkPoints, setBenchmarkPoints] = useState<BenchmarkPoint[]>([]);
  const [realized, setRealized] = useState({ tradeCount: 0, proceeds: 0, costBasis: 0, realizedPnl: 0, realizedPnlPercent: 0 });
  const [range, setRange] = useState<30 | 90 | 180 | 365>(30);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [benchmarkLoading, setBenchmarkLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [benchmarkError, setBenchmarkError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isOnline) { setError('برای دریافت ارزش لحظه‌ای سبد باید آنلاین باشید.'); setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const portfolio = await portfolioService.getPortfolio();
      const next = await Promise.all(portfolio.map(async item => {
        try {
          const q = await quote(item.symbol); const cost = item.entryPrice * item.quantity; const value = q.price == null ? null : q.price * item.quantity; const pnl = value == null ? null : value - cost; const pnlPercent = pnl == null || cost <= 0 ? null : (pnl / cost) * 100;
          return { id: item.id, symbol: item.symbol, name: item.name, quantity: item.quantity, entryPrice: item.entryPrice, currentPrice: q.price, changePercent: q.change, value, cost, pnl, pnlPercent };
        } catch (_) { return { id: item.id, symbol: item.symbol, name: item.name, quantity: item.quantity, entryPrice: item.entryPrice, currentPrice: null, changePercent: null, value: null, cost: item.entryPrice * item.quantity, pnl: null, pnlPercent: null }; }
      }));
      setItems(next); setUpdatedAt(new Date().toISOString());
    } catch (e: any) { setError(e?.response?.data?.message || e?.message || 'دریافت اطلاعات سبد ناموفق بود.'); }
    finally { setLoading(false); }
  }, [isOnline]);

  const loadHistory = useCallback(async () => {
    if (!isOnline) { setHistoryError('برای دریافت سابقه سبد باید آنلاین باشید.'); return; }
    setHistoryLoading(true); setHistoryError(null);
    try {
      const accurateHistory = await getPortfolioHistory();
      let peak = 0;
      const points: HistoryPoint[] = accurateHistory.map(point => {
        peak = Math.max(peak, point.value);
        const drawdownPercent = peak > 0 ? ((point.value - peak) / peak) * 100 : 0;
        return {
          date: point.date,
          value: point.value,
          cost: point.cost,
          pnl: point.pnl,
          returnPercent: point.returnPercent,
          drawdownPercent,
          peakValue: peak,
        };
      });
      setHistoryPoints(points.slice(-range));
    } catch (e: any) { setHistoryError(e?.response?.data?.message || e?.message || 'دریافت سابقه عملکرد سبد ناموفق بود.'); }
    finally { setHistoryLoading(false); }
  }, [isOnline, range]);

  const loadBenchmark = useCallback(async () => {
    if (!isOnline) { setBenchmarkError('برای مقایسه با شاخص بازار باید آنلاین باشید.'); return; }
    setBenchmarkLoading(true); setBenchmarkError(null);
    try {
      const rangeKey = range === 30 ? '1m' : range === 90 ? '3m' : range === 180 ? '6m' : '1y';
      const result = await getMarketRadarHistory(rangeKey);
      const points = (result.points || []).filter(point => point.index != null).map(point => ({ timestamp: point.timestamp, index: point.index as number })).filter(point => Number.isFinite(point.index));
      setBenchmarkPoints(points);
      if (!points.length) setBenchmarkError('تاریخچه شاخص کل برای این بازه در دسترس نیست.');
    } catch (e: any) { setBenchmarkPoints([]); setBenchmarkError(e?.message || 'دریافت تاریخچه شاخص کل ناموفق بود.'); }
    finally { setBenchmarkLoading(false); }
  }, [isOnline, range]);

  const loadRealized = useCallback(async () => {
    if (!isOnline) return;
    try { setRealized(await getPortfolioRealizedPerformance()); } catch (_) { setRealized({ tradeCount: 0, proceeds: 0, costBasis: 0, realizedPnl: 0, realizedPnlPercent: 0 }); }
  }, [isOnline]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadRealized(); }, [loadRealized]);
  useEffect(() => { loadHistory(); loadBenchmark(); }, [loadHistory, loadBenchmark]);

  const stats = useMemo(() => {
    const valued = items.filter(x => x.value != null) as Array<Holding & { value: number }>;
    const totalValue = valued.reduce((s, x) => s + x.value, 0); const totalCost = items.reduce((s, x) => s + x.cost, 0); const pnl = valued.reduce((s, x) => s + (x.pnl || 0), 0); const pnlPercent = totalCost > 0 ? (pnl / totalCost) * 100 : null;
    const positive = items.filter(x => (x.pnl || 0) > 0).length; const negative = items.filter(x => (x.pnl || 0) < 0).length; const neutral = items.length - positive - negative;
    const sorted = [...valued].sort((a, b) => b.value - a.value); const top = sorted[0]; const concentration = totalValue > 0 && top ? (top.value / totalValue) * 100 : null; const top3Value = sorted.slice(0, 3).reduce((s, x) => s + x.value, 0); const top3Concentration = totalValue > 0 ? (top3Value / totalValue) * 100 : null;
    const weights = totalValue > 0 ? sorted.map(x => x.value / totalValue) : []; const hhi = weights.reduce((s, weight) => s + weight * weight, 0); const diversification = weights.length ? clamp((1 - hhi) * 100, 0, 100) : null;
    const valuedChanges = valued.filter(x => x.changePercent != null); const weightedDailyChange = totalValue > 0 ? valuedChanges.reduce((s, x) => s + x.value * (x.changePercent as number), 0) / totalValue : null;
    const gainValue = valued.reduce((s, x) => s + Math.max(x.pnl || 0, 0), 0); const lossValue = valued.reduce((s, x) => s + Math.min(x.pnl || 0, 0), 0); const gainShare = totalValue > 0 ? (gainValue / totalValue) * 100 : null; const lossShare = totalValue > 0 ? (Math.abs(lossValue) / totalValue) * 100 : null;
    const drawdowns = historyPoints.map(x => x.drawdownPercent ?? 0); const maxDrawdown = drawdowns.length ? Math.min(...drawdowns) : null; const currentDrawdown = drawdowns.length ? drawdowns[drawdowns.length - 1] : null; const recoveryPeak = historyPoints.length ? historyPoints[historyPoints.length - 1].peakValue ?? null : null;
    const positiveDays = historyPoints.filter(x => x.pnl > 0).length; const negativeDays = historyPoints.filter(x => x.pnl < 0).length; const winRate = historyPoints.length ? (positiveDays / historyPoints.length) * 100 : null;
    const portfolioReturn = historyPoints.length > 1 && historyPoints[0].value > 0 ? ((historyPoints[historyPoints.length - 1].value / historyPoints[0].value) - 1) * 100 : null;
    const benchmarkReturn = benchmarkPoints.length > 1 && benchmarkPoints[0].index > 0 ? ((benchmarkPoints[benchmarkPoints.length - 1].index / benchmarkPoints[0].index) - 1) * 100 : null;
    const benchmarkAlpha = portfolioReturn != null && benchmarkReturn != null ? portfolioReturn - benchmarkReturn : null;
    const combinedPnl = pnl + realized.realizedPnl;
    const combinedCost = totalCost + realized.costBasis;
    const combinedReturn = combinedCost > 0 ? (combinedPnl / combinedCost) * 100 : null;
    return { totalValue, totalCost, pnl, pnlPercent, positive, negative, neutral, concentration, top3Concentration, diversification, weightedDailyChange, gainShare, lossShare, topSymbol: top?.symbol || null, maxDrawdown, currentDrawdown, recoveryPeak, positiveDays, negativeDays, winRate, portfolioReturn, benchmarkReturn, benchmarkAlpha, combinedPnl, combinedCost, combinedReturn };
  }, [items, historyPoints, benchmarkPoints]);

  const attribution = useMemo(() => {
    const valued = items.filter(x => x.value != null && x.pnl != null) as Array<Holding & { value: number; pnl: number }>;
    const totalAbs = valued.reduce((s, x) => s + Math.abs(x.pnl), 0);
    return [...valued].sort((a, b) => b.pnl - a.pnl).map(item => ({ ...item, contributionPercent: totalAbs > 0 ? (Math.abs(item.pnl) / totalAbs) * 100 : 0 }));
  }, [items]);

  const chart = useMemo(() => {
    if (!historyPoints.length) return null;
    const values = historyPoints.map(p => p.value); const min = Math.min(...values); const max = Math.max(...values); const span = max - min || 1; const width = 760; const height = 220; const pad = 24;
    const points = historyPoints.map((p, i) => `${pad + (i * (width - pad * 2)) / Math.max(1, historyPoints.length - 1)},${height - pad - ((p.value - min) / span) * (height - pad * 2)}`).join(' ');
    return { points, first: historyPoints[0], last: historyPoints[historyPoints.length - 1], min, max };
  }, [historyPoints]);

  return <div dir="rtl" className="space-y-5">
    <div className="flex items-center justify-between gap-3 flex-wrap"><div><h2 className="text-2xl font-black">هوشمندی سبد سهام</h2><p className="text-sm text-gray-500 dark:text-gray-400 mt-1">ارزش‌گذاری، عملکرد، توزیع سرمایه، ریسک افت و مقایسه با شاخص بازار بر اساس داده واقعی</p></div><button type="button" onClick={() => { load(); loadHistory(); loadBenchmark(); loadRealized(); }} disabled={loading || historyLoading || benchmarkLoading || !isOnline} className="rounded-xl bg-cyan-600 text-white px-4 py-2 font-bold disabled:opacity-50">{loading || historyLoading || benchmarkLoading ? 'در حال بروزرسانی...' : 'بروزرسانی'}</button></div>
    {error && <div className="rounded-xl border border-red-300 bg-red-50 dark:bg-red-950/20 p-4 text-red-700 dark:text-red-300">{error}</div>}
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[['ارزش فعلی سبد', money(stats.totalValue)], ['بهای تمام‌شده', money(stats.totalCost)], ['سود/زیان کل', money(stats.pnl)], ['بازدهی کل', pct(stats.pnlPercent)]].map(([label, value]) => <div key={label} className="rounded-2xl border border-[var(--color-border)] bg-white/80 dark:bg-gray-900/60 p-4"><p className="text-xs text-gray-500">{label}</p><p className="mt-2 text-xl font-black font-mono">{value}</p></div>)}</div>
    {realized.tradeCount > 0 && <div className="rounded-2xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/20 p-4 space-y-3"><div><h3 className="font-black text-lg">عملکرد تحقق‌یافته معاملات بسته‌شده</h3><p className="text-xs text-gray-500 mt-1">این ارقام متعلق به فروش‌های ثبت‌شده هستند و در ارزش فعلی دارایی‌های سبد دوباره محاسبه نمی‌شوند.</p></div><div className="grid grid-cols-2 md:grid-cols-4 gap-3"><div><p className="text-xs text-gray-500">تعداد معاملات فروش</p><p className="mt-1 text-lg font-black font-mono">{realized.tradeCount.toLocaleString('fa-IR')}</p></div><div><p className="text-xs text-gray-500">بهای تمام‌شده فروش‌ها</p><p className="mt-1 text-lg font-black font-mono">{money(realized.costBasis)}</p></div><div><p className="text-xs text-gray-500">دریافتی فروش</p><p className="mt-1 text-lg font-black font-mono">{money(realized.proceeds)}</p></div><div><p className="text-xs text-gray-500">سود/زیان تحقق‌یافته</p><p className={`mt-1 text-lg font-black font-mono ${realized.realizedPnl > 0 ? 'text-[var(--color-positive)]' : realized.realizedPnl < 0 ? 'text-[var(--color-negative)]' : ''}`}>{money(realized.realizedPnl)}</p><p className="text-xs text-gray-500 mt-1">بازده: {pct(realized.realizedPnlPercent)}</p></div></div><div className="grid grid-cols-2 md:grid-cols-3 gap-3 border-t border-amber-200/70 dark:border-amber-900/40 pt-3"><div className="rounded-xl border border-[var(--color-border)] p-3"><p className="text-xs text-gray-500">سود/زیان تجمیعی</p><p className="mt-1 text-lg font-black font-mono">{money(stats.combinedPnl)}</p></div><div className="rounded-xl border border-[var(--color-border)] p-3"><p className="text-xs text-gray-500">بهای تمام‌شده تجمیعی</p><p className="mt-1 text-lg font-black font-mono">{money(stats.combinedCost)}</p></div><div className="rounded-xl border border-[var(--color-border)] p-3"><p className="text-xs text-gray-500">بازده تجمیعی</p><p className="mt-1 text-lg font-black font-mono">{pct(stats.combinedReturn)}</p></div></div></div>}
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[['سهم‌های سودده', String(stats.positive)], ['سهم‌های زیان‌ده', String(stats.negative)], ['بدون تغییر', String(stats.neutral)], ['تغییر روزانه وزنی', pct(stats.weightedDailyChange)]].map(([label, value]) => <div key={label} className="rounded-2xl border border-[var(--color-border)] bg-white/70 dark:bg-gray-900/50 p-4"><p className="text-xs text-gray-500">{label}</p><p className="mt-2 text-lg font-black font-mono">{value}</p></div>)}</div>
    <div className="rounded-2xl border border-[var(--color-border)] bg-white/80 dark:bg-gray-900/60 p-4 space-y-4"><div><h3 className="font-black text-lg">مقایسه عملکرد سبد با شاخص کل</h3><p className="text-xs text-gray-500 mt-1">بازدهی سبد و شاخص کل در همان بازه تاریخی مقایسه می‌شوند؛ هیچ داده یا امتیاز مصنوعی استفاده نمی‌شود.</p></div>{benchmarkError && <div className="text-sm text-amber-700 dark:text-amber-300">{benchmarkError}</div>}<div className="grid grid-cols-1 md:grid-cols-3 gap-3"><div className="rounded-xl border border-[var(--color-border)] p-4"><p className="text-xs text-gray-500">بازدهی سبد</p><p className="mt-2 text-xl font-black font-mono">{pct(stats.portfolioReturn)}</p></div><div className="rounded-xl border border-[var(--color-border)] p-4"><p className="text-xs text-gray-500">بازدهی شاخص کل</p><p className="mt-2 text-xl font-black font-mono">{pct(stats.benchmarkReturn)}</p></div><div className="rounded-xl border border-[var(--color-border)] p-4"><p className="text-xs text-gray-500">اختلاف بازدهی</p><p className="mt-2 text-xl font-black font-mono">{pct(stats.benchmarkAlpha)}</p></div></div><p className="text-xs text-gray-500">اختلاف بازدهی = بازدهی سبد منهای بازدهی شاخص کل و صرفاً یک معیار توصیفی عملکرد تاریخی است.</p></div>
    <div className="rounded-2xl border border-[var(--color-border)] bg-white/80 dark:bg-gray-900/60 p-4 space-y-4"><div><h3 className="font-black text-lg">عملکرد تاریخی سبد</h3><p className="text-xs text-gray-500 mt-1">ارزش تاریخی با قیمت پایانی واقعی هر نماد، تعداد ثبت‌شده و تاریخ ورود واقعی هر موقعیت محاسبه می‌شود.</p></div><div className="flex flex-wrap gap-2">{([[30, '۱ ماه'], [90, '۳ ماه'], [180, '۶ ماه'], [365, '۱ سال']] as const).map(([days, label]) => <button key={days} type="button" onClick={() => setRange(days)} className={`rounded-lg px-3 py-2 text-sm font-bold ${range === days ? 'bg-cyan-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}>{label}</button>)}</div>{historyError && <div className="text-sm text-red-600 dark:text-red-400">{historyError}</div>}{historyLoading ? <div className="h-56 flex items-center justify-center text-gray-500">در حال دریافت سابقه...</div> : !chart ? <div className="h-56 flex items-center justify-center text-gray-500">برای این سبد سابقه قیمت کافی در دسترس نیست.</div> : <div className="space-y-3"><svg viewBox="0 0 760 220" className="w-full h-56" role="img" aria-label="نمودار ارزش تاریخی سبد"><polyline fill="none" stroke="currentColor" strokeWidth="3" points={chart.points} /></svg><div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm"><div><span className="text-gray-500">ابتدای دوره</span><div className="font-black font-mono">{money(chart.first.value)}</div></div><div><span className="text-gray-500">انتهای دوره</span><div className="font-black font-mono">{money(chart.last.value)}</div></div><div><span className="text-gray-500">کمینه</span><div className="font-black font-mono">{money(chart.min)}</div></div><div><span className="text-gray-500">بیشینه</span><div className="font-black font-mono">{money(chart.max)}</div></div></div></div>}</div>
    <div className="rounded-2xl border border-[var(--color-border)] bg-white/80 dark:bg-gray-900/60 p-4 space-y-4"><div><h3 className="font-black text-lg">ریسک افت سبد (Drawdown)</h3><p className="text-xs text-gray-500 mt-1">افت از سقف تاریخی ارزش سبد در بازه انتخاب‌شده، فقط با داده واقعی محاسبه می‌شود.</p></div><div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[['حداکثر افت', pct(stats.maxDrawdown)], ['افت فعلی از سقف', pct(stats.currentDrawdown)], ['سقف محاسباتی', money(stats.recoveryPeak)], ['نرخ روزهای مثبت', pct(stats.winRate)]].map(([label, value]) => <div key={label} className="rounded-xl border border-[var(--color-border)] p-4"><p className="text-xs text-gray-500">{label}</p><p className="mt-2 text-lg font-black font-mono">{value}</p></div>)}</div><div className="grid grid-cols-2 gap-3 text-sm"><div className="rounded-xl border border-[var(--color-border)] p-3">روزهای مثبت: <b>{stats.positiveDays.toLocaleString('fa-IR')}</b></div><div className="rounded-xl border border-[var(--color-border)] p-3">روزهای منفی: <b>{stats.negativeDays.toLocaleString('fa-IR')}</b></div></div></div>
    <div className="rounded-2xl border border-[var(--color-border)] bg-white/80 dark:bg-gray-900/60 p-4 space-y-4"><div><h3 className="font-black text-lg">سهم هر نماد در سود و زیان</h3><p className="text-xs text-gray-500 mt-1">Attribution بر اساس سود/زیان تحقق‌نیافته فعلی هر موقعیت و بدون مدل هوش مصنوعی محاسبه می‌شود.</p></div>{!attribution.length ? <div className="p-6 text-center text-gray-500">داده کافی برای محاسبه سهم سود و زیان در دسترس نیست.</div> : <div className="space-y-3">{attribution.map(item => <div key={item.id} className="rounded-xl border border-[var(--color-border)] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><span className="font-black">{item.symbol}</span><span className="text-xs text-gray-500 mr-2">{item.name}</span></div><div className={`font-black font-mono ${item.pnl > 0 ? 'text-[var(--color-positive)]' : item.pnl < 0 ? 'text-[var(--color-negative)]' : ''}`}>{money(item.pnl)}</div></div><div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3 text-sm"><div><span className="text-gray-500">بازدهی</span><div className="font-bold font-mono">{pct(item.pnlPercent)}</div></div><div><span className="text-gray-500">وزن سرمایه</span><div className="font-bold font-mono">{stats.totalValue > 0 ? `${((item.value / stats.totalValue) * 100).toFixed(1)}%` : '—'}</div></div><div><span className="text-gray-500">سهم از P/L مطلق</span><div className="font-bold font-mono">{item.contributionPercent.toFixed(1)}%</div></div></div><div className="mt-3 h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden"><div className={`h-full ${item.pnl >= 0 ? 'bg-[var(--color-positive)]' : 'bg-[var(--color-negative)]'}`} style={{ width: `${Math.min(100, item.contributionPercent)}%` }} /></div></div>)}</div>}</div>
    <div className="rounded-2xl border border-[var(--color-border)] bg-white/80 dark:bg-gray-900/60 p-4 space-y-4"><div><h3 className="font-black text-lg">توزیع سرمایه و ریسک تمرکز</h3><p className="text-xs text-gray-500 mt-1">محاسبات فقط از ارزش واقعی موقعیت‌های دارای قیمت بازار استفاده می‌کنند.</p></div><div className="grid grid-cols-1 md:grid-cols-3 gap-3">{[['تمرکز بزرگ‌ترین سهم', stats.concentration == null ? '—' : `${stats.concentration.toFixed(1)}%`, stats.topSymbol || ''], ['تمرکز سه سهم اول', stats.top3Concentration == null ? '—' : `${stats.top3Concentration.toFixed(1)}%`, 'Top 3'], ['تنوع نسبی سبد', stats.diversification == null ? '—' : `${stats.diversification.toFixed(1)}%`, 'بر مبنای HHI']].map(([label, value, hint]) => <div key={label} className="rounded-xl border border-[var(--color-border)] p-4"><p className="text-xs text-gray-500">{label}</p><p className="mt-2 text-xl font-black font-mono">{value}</p>{hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}</div>)}</div><div className="grid grid-cols-1 md:grid-cols-2 gap-3"><div className="rounded-xl border border-[var(--color-border)] p-4"><div className="flex justify-between text-sm mb-2"><span>ارزش موقعیت‌های دارای سود</span><b>{stats.gainShare == null ? '—' : `${stats.gainShare.toFixed(1)}%`}</b></div><div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden"><div className="h-full bg-[var(--color-positive)]" style={{ width: `${Math.min(100, stats.gainShare || 0)}%` }} /></div></div><div className="rounded-xl border border-[var(--color-border)] p-4"><div className="flex justify-between text-sm mb-2"><span>ارزش موقعیت‌های دارای زیان</span><b>{stats.lossShare == null ? '—' : `${stats.lossShare.toFixed(1)}%`}</b></div><div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden"><div className="h-full bg-[var(--color-negative)]" style={{ width: `${Math.min(100, stats.lossShare || 0)}%` }} /></div></div></div></div>
    <div className="rounded-2xl border border-[var(--color-border)] overflow-hidden bg-white/80 dark:bg-gray-900/60"><div className="px-4 py-3 border-b border-[var(--color-border)] font-black">ترکیب و عملکرد سبد</div>{items.length === 0 && !loading ? <div className="p-8 text-center text-gray-500">سبد سهام خالی است.</div> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-gray-50 dark:bg-gray-800/70"><th className="p-3 text-right">نماد</th><th className="p-3 text-right">تعداد</th><th className="p-3 text-right">قیمت ورود</th><th className="p-3 text-right">قیمت فعلی</th><th className="p-3 text-right">ارزش</th><th className="p-3 text-right">سود/زیان</th><th className="p-3 text-right">بازدهی</th><th className="p-3 text-right">وزن</th></tr></thead><tbody>{items.map(item => { const weight = stats.totalValue > 0 && item.value != null ? (item.value / stats.totalValue) * 100 : null; return <tr key={item.id} className="border-t border-[var(--color-border)]"><td className="p-3 font-black">{item.symbol}<div className="text-xs text-gray-500 font-normal">{item.name}</div></td><td className="p-3 font-mono">{item.quantity.toLocaleString('fa-IR')}</td><td className="p-3 font-mono">{money(item.entryPrice)}</td><td className="p-3 font-mono">{money(item.currentPrice)}</td><td className="p-3 font-mono">{money(item.value)}</td><td className={`p-3 font-mono font-bold ${item.pnl == null ? '' : item.pnl > 0 ? 'text-[var(--color-positive)]' : item.pnl < 0 ? 'text-[var(--color-negative)]' : ''}`}>{money(item.pnl)}</td><td className={`p-3 font-mono font-bold ${item.pnlPercent == null ? '' : item.pnlPercent > 0 ? 'text-[var(--color-positive)]' : item.pnlPercent < 0 ? 'text-[var(--color-negative)]' : ''}`}>{pct(item.pnlPercent)}</td><td className="p-3 font-mono">{weight == null ? '—' : `${weight.toFixed(1)}%`}</td></tr>; })}</tbody></table></div>}{updatedAt && <div className="px-4 py-3 text-xs text-gray-500 border-t border-[var(--color-border)]">آخرین بروزرسانی: {new Date(updatedAt).toLocaleString('fa-IR')}</div>}</div>
  </div>;
};

export default PortfolioIntelligence;
