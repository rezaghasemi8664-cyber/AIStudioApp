import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getMarketRadarSnapshot, readMarketRadarCache, writeMarketRadarCache } from '../../services/marketRadarService';
import type { MarketRadarMover, MarketRadarSnapshot, MarketRadarSector } from '../../types/marketRadar';

const fa = (value: number | null | undefined, maximumFractionDigits = 0): string => value === null || value === undefined || !Number.isFinite(value) ? '—' : new Intl.NumberFormat('fa-IR', { maximumFractionDigits }).format(value);
const signedPercent = (value: number | null | undefined): string => { if (value === null || value === undefined || !Number.isFinite(value)) return '—'; const sign = value > 0 ? '+' : value < 0 ? '−' : ''; return `${sign}${fa(Math.abs(value), 2)}٪`; };
const tone = (value: number | null | undefined): string => value === null || value === undefined ? 'text-slate-400' : value > 0 ? 'text-emerald-400' : value < 0 ? 'text-rose-400' : 'text-slate-300';
const moverRows = (rows: MarketRadarMover[], empty: string): React.ReactNode => rows.length ? rows.map((row) => <div key={row.symbol} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-white/5 py-3 last:border-b-0"><span className="truncate font-bold text-slate-200">{row.symbol}</span><span className="text-xs text-slate-500">{fa(row.volume)}</span><span className={`text-sm font-black ${tone(row.changePercent)}`}>{signedPercent(row.changePercent)}</span></div>) : <div className="py-6 text-center text-sm text-slate-500">{empty}</div>;
const SectorRows: React.FC<{ rows: MarketRadarSector[] }> = ({ rows }) => <div className="space-y-2">{rows.length ? rows.map((row) => <div key={row.name} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 rounded-xl bg-white/[0.025] px-3 py-2"><span className="truncate text-sm text-slate-300">{row.name}</span><span className="text-xs text-slate-500">{fa(row.symbols)} نماد</span><span className={`text-sm font-bold ${tone(row.changePercent)}`}>{signedPercent(row.changePercent)}</span></div>) : <div className="py-5 text-center text-sm text-slate-500">داده صنعت در دسترس نیست</div>}</div>;

const MarketRadar: React.FC = () => {
  const [data, setData] = useState<MarketRadarSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const cached = readMarketRadarCache();
      if (!manual && cached) {
        setData(cached.snapshot);
        setStale(!cached.fresh);
        if (cached.fresh) { setLoading(false); return; }
      }
      const fresh = await getMarketRadarSnapshot();
      setData(fresh); setStale(false); writeMarketRadarCache(fresh);
    } catch (err) {
      console.error('[MarketRadar] load failed:', err);
      const cached = readMarketRadarCache();
      if (!data && cached) { setData(cached.snapshot); setStale(true); }
      if (data || cached) setStale(true); else setError('دریافت داده بازار انجام نشد.');
    } finally { setLoading(false); setRefreshing(false); }
  }, [data]);

  useEffect(() => { void load(); const id = window.setInterval(() => void load(), 120_000); return () => window.clearInterval(id); }, [load]);

  const breadthTone = useMemo(() => { if (!data?.breadth) return 'داده نامشخص'; if (data.breadth.positive > data.breadth.negative) return 'مثبت'; if (data.breadth.negative > data.breadth.positive) return 'منفی'; return 'متعادل'; }, [data]);
  const lastUpdated = data?.fetchedAt ? new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(data.fetchedAt)) : '—';

  if (loading && !data) return <div dir="rtl" className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-slate-400 animate-pulse">در حال دریافت رادار بازار…</div>;
  if (error && !data) return <div dir="rtl" className="rounded-3xl border border-rose-500/20 bg-rose-500/10 p-6 text-center text-rose-300">{error}<button onClick={() => void load(true)} className="mr-3 rounded-xl bg-white/10 px-4 py-2 text-sm font-bold text-white">تلاش مجدد</button></div>;
  if (!data) return null;
  const breadth = data.breadth;

  return <section dir="rtl" className="space-y-5">
    <header className="flex flex-col gap-3 rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:flex-row sm:items-center sm:justify-between">
      <div><div className="flex flex-wrap items-center gap-3"><h1 className="text-xl font-black text-[var(--color-text-primary)]">رادار بازار</h1><span className={`rounded-full px-3 py-1 text-xs font-bold ${data.marketOpen ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-500/10 text-slate-400'}`}>{data.marketOpen ? 'بازار باز' : 'بازار بسته'}</span><span className={`rounded-full px-3 py-1 text-xs font-bold ${stale ? 'bg-amber-500/10 text-amber-300' : 'bg-sky-500/10 text-sky-300'}`}>{stale ? 'داده ذخیره‌شده' : 'به‌روز'}</span></div><p className="mt-1 text-xs text-slate-500">آخرین دریافت: {lastUpdated} · داده‌های واقعی و محاسبات قطعی؛ بدون وابستگی به هوش مصنوعی</p></div>
      <button onClick={() => void load(true)} disabled={refreshing} className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-bold text-slate-200 transition hover:bg-white/[0.08] disabled:opacity-50">{refreshing ? 'در حال بروزرسانی…' : 'بروزرسانی'}</button>
    </header>

    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{data.indices.map((index) => <article key={index.name} className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"><div className="text-sm font-bold text-slate-400">{index.name}</div><div className="mt-2 text-2xl font-black tabular-nums text-[var(--color-text-primary)]">{fa(index.value, 2)}</div><div className={`mt-2 text-sm font-bold ${tone(index.changeValue)}`}>{signedPercent(index.changePercent)} <span className="mr-1 text-xs text-slate-500">({fa(index.changeValue, 2)})</span></div></article>)}</div>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">{[['ارزش معاملات', data.totalValue], ['حجم معاملات', data.totalVolume], ['تعداد معاملات', data.totalTrades]].map(([label, value]) => <article key={String(label)} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4"><div className="text-xs text-slate-500">{label}</div><div className="mt-2 text-xl font-black tabular-nums text-[var(--color-text-primary)]">{fa(value as number | null)}</div></article>)}</div>

    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3"><article className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 lg:col-span-2"><div className="mb-5 flex items-center justify-between gap-3"><div><h2 className="font-black text-[var(--color-text-primary)]">عرض بازار</h2><p className="mt-1 text-xs text-slate-500">مثبت، منفی و خنثی بر اساس نمادهای معامله‌شده</p></div><span className="rounded-full border border-white/10 px-3 py-1 text-xs font-bold text-slate-300">{breadthTone}</span></div>{breadth ? <><div className="grid grid-cols-3 gap-3"><div className="rounded-2xl bg-emerald-500/10 p-4"><div className="text-xs text-emerald-300">مثبت</div><div className="mt-2 text-2xl font-black text-emerald-300">{fa(breadth.positive)}</div><div className="mt-1 text-xs text-slate-500">{fa(breadth.positivePercent, 1)}٪</div></div><div className="rounded-2xl bg-rose-500/10 p-4"><div className="text-xs text-rose-300">منفی</div><div className="mt-2 text-2xl font-black text-rose-300">{fa(breadth.negative)}</div><div className="mt-1 text-xs text-slate-500">{fa(breadth.negativePercent, 1)}٪</div></div><div className="rounded-2xl bg-slate-500/10 p-4"><div className="text-xs text-slate-300">خنثی</div><div className="mt-2 text-2xl font-black text-slate-200">{fa(breadth.neutral)}</div><div className="mt-1 text-xs text-slate-500">{fa(breadth.neutralPercent, 1)}٪</div></div></div><div className="mt-5 flex h-3 overflow-hidden rounded-full bg-white/5"><div className="bg-emerald-400" style={{ width: `${breadth.positivePercent}%` }} /><div className="bg-slate-500" style={{ width: `${breadth.neutralPercent}%` }} /><div className="bg-rose-400" style={{ width: `${breadth.negativePercent}%` }} /></div><div className="mt-3 flex flex-wrap justify-between gap-2 text-xs text-slate-500"><span>مجموع: <b className="text-slate-300">{fa(breadth.total)}</b></span><span>نسبت مثبت/منفی: <b className="text-slate-300">{breadth.advanceDeclineRatio === null ? '—' : `${fa(breadth.advanceDeclineRatio, 2)}x`}</b></span><span>پوشش داده: <b className="text-slate-300">{fa(breadth.coveragePercent, 1)}٪</b></span></div></> : <div className="py-10 text-center text-sm text-slate-500">عرض بازار در این لحظه در دسترس نیست.</div>}</article><article className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"><h2 className="font-black text-[var(--color-text-primary)]">صنایع برتر</h2><p className="mt-1 mb-4 text-xs text-slate-500">بر اساس میانگین تغییر نمادهای معامله‌شده</p><SectorRows rows={breadth?.sectors.leaders ?? []} /></article></div>
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3"><article className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"><h2 className="font-black text-[var(--color-text-primary)]">بیشترین رشد</h2><div className="mt-3">{moverRows(breadth?.topGainers ?? [], 'داده‌ای موجود نیست')}</div></article><article className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"><h2 className="font-black text-[var(--color-text-primary)]">بیشترین افت</h2><div className="mt-3">{moverRows(breadth?.topLosers ?? [], 'داده‌ای موجود نیست')}</div></article><article className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"><h2 className="font-black text-[var(--color-text-primary)]">بیشترین حجم</h2><div className="mt-3">{moverRows(breadth?.topVolumes ?? [], 'داده‌ای موجود نیست')}</div></article></div>
    <article className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"><div className="mb-4"><h2 className="font-black text-[var(--color-text-primary)]">قدرت صنایع</h2><p className="mt-1 text-xs text-slate-500">نمای خلاصه برای مقایسه قدرت و ضعف گروه‌ها</p></div><SectorRows rows={breadth?.sectors.rows ?? []} /></article>
  </section>;
};
export default MarketRadar;
