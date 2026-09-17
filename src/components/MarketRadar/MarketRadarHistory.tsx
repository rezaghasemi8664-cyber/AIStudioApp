import React, { useEffect, useMemo, useState } from 'react';
import { getMarketRadarHistory } from '../../services/marketRadarService';
import type { MarketRadarHistory as HistoryData, MarketRadarHistoryRange } from '../../types/marketRadar';

const ranges: Array<{ value: MarketRadarHistoryRange; label: string }> = [
  { value: '1d', label: '۱ روز' },
  { value: '1w', label: '۱ هفته' },
  { value: '1m', label: '۱ ماه' },
  { value: '3m', label: '۳ ماه' },
  { value: '6m', label: '۶ ماه' },
  { value: '1y', label: '۱ سال' },
];

const fa = (value: number | null | undefined, digits = 0) => value === null || value === undefined || !Number.isFinite(value) ? '—' : new Intl.NumberFormat('fa-IR', { maximumFractionDigits: digits }).format(value);

function ChartLine({ values, width = 760, height = 230, padding = 22 }: { values: Array<number | null>; width?: number; height?: number; padding?: number }) {
  const valid = values.map((value, index) => ({ value, index })).filter((item): item is { value: number; index: number } => item.value !== null && Number.isFinite(item.value));
  if (valid.length < 1) return null;
  const min = Math.min(...valid.map((item) => item.value));
  const max = Math.max(...valid.map((item) => item.value));
  const span = max - min || 1;
  const points = valid.map(({ value, index }) => {
    const x = padding + (index / Math.max(values.length - 1, 1)) * (width - padding * 2);
    const y = height - padding - ((value - min) / span) * (height - padding * 2);
    return `${x},${y}`;
  }).join(' ');
  return <polyline points={points} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />;
}

const MarketRadarHistory: React.FC = () => {
  const [range, setRange] = useState<MarketRadarHistoryRange>('1d');
  const [data, setData] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    getMarketRadarHistory(range).then((result) => {
      if (active) setData(result);
    }).catch((err) => {
      console.error('[MarketRadarHistory] load failed:', err);
      if (active) { setData(null); setError(true); }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [range]);

  const indexValues = useMemo(() => data?.points.map((point) => point.index) ?? [], [data]);
  const equalValues = useMemo(() => data?.points.map((point) => point.equalWeightedIndex) ?? [], [data]);
  const last = data?.points[data.points.length - 1];

  return <article dir="rtl" className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div><h2 className="font-black text-[var(--color-text-primary)]">روند تاریخی بازار</h2><p className="mt-1 text-xs text-slate-500">داده روزانه واقعی از MarketSummary؛ بدون تولید یا برآورد داده</p></div>
      <div className="flex flex-wrap gap-2">{ranges.map((item) => <button key={item.value} onClick={() => setRange(item.value)} className={`rounded-xl px-3 py-2 text-xs font-bold transition ${range === item.value ? 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-400/30' : 'border border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/[0.06]'}`}>{item.label}</button>)}</div>
    </div>

    {loading ? <div className="mt-5 h-64 animate-pulse rounded-2xl bg-white/[0.03]" /> : error ? <div className="mt-5 rounded-2xl border border-rose-500/20 bg-rose-500/5 p-8 text-center text-sm text-rose-300">دریافت تاریخچه انجام نشد.</div> : !data?.available || !data.points.length ? <div className="mt-5 rounded-2xl border border-white/5 bg-white/[0.02] p-10 text-center text-sm text-slate-500">داده تاریخی موجود نیست.</div> : <>
      <div className="mt-5 overflow-x-auto rounded-2xl border border-white/5 bg-black/5 p-2">
        <svg viewBox="0 0 760 230" className="h-64 min-w-[680px] w-full text-sky-400" role="img" aria-label="نمودار تاریخی شاخص بازار">
          <ChartLine values={indexValues} />
          {equalValues.some((value) => value !== null) && <g className="text-violet-400"><ChartLine values={equalValues} /></g>}
        </svg>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-2xl bg-white/[0.03] p-3"><div className="text-xs text-slate-500">آخرین شاخص کل</div><div className="mt-1 font-black tabular-nums text-slate-200">{fa(last?.index, 2)}</div></div>
        <div className="rounded-2xl bg-white/[0.03] p-3"><div className="text-xs text-slate-500">آخرین هم‌وزن</div><div className="mt-1 font-black tabular-nums text-slate-200">{fa(last?.equalWeightedIndex, 2)}</div></div>
        <div className="rounded-2xl bg-white/[0.03] p-3"><div className="text-xs text-slate-500">ارزش معاملات</div><div className="mt-1 font-black tabular-nums text-slate-200">{fa(last?.totalValue)}</div></div>
        <div className="rounded-2xl bg-white/[0.03] p-3"><div className="text-xs text-slate-500">تعداد نقاط</div><div className="mt-1 font-black tabular-nums text-slate-200">{fa(data.points.length)}</div></div>
      </div>
    </>}
  </article>;
};

export default MarketRadarHistory;
