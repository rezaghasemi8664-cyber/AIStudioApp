import React, { useEffect, useMemo, useState } from 'react';
import { getMarketRadarHistory } from '../../services/marketRadarService';
import type { MarketRadarHistory as HistoryData, MarketRadarHistoryRange, MarketRadarHistoryPoint } from '../../types/marketRadar';

const ranges: Array<{ value: MarketRadarHistoryRange; label: string }> = [
  { value: '1d', label: '۱ روز' }, { value: '1w', label: '۱ هفته' }, { value: '1m', label: '۱ ماه' },
  { value: '3m', label: '۳ ماه' }, { value: '6m', label: '۶ ماه' }, { value: '1y', label: '۱ سال' },
];

type Metric = 'index' | 'value' | 'volume';
const metrics: Array<{ value: Metric; label: string; key: keyof MarketRadarHistoryPoint; format: 'number' | 'compact' }> = [
  { value: 'index', label: 'شاخص کل', key: 'index', format: 'number' },
  { value: 'value', label: 'ارزش معاملات', key: 'totalValue', format: 'compact' },
  { value: 'volume', label: 'حجم معاملات', key: 'totalVolume', format: 'compact' },
];

const fa = (value: number | null | undefined, digits = 0) => value === null || value === undefined || !Number.isFinite(value) ? '—' : new Intl.NumberFormat('fa-IR', { maximumFractionDigits: digits }).format(value);
const compactFa = (value: number | null | undefined) => value === null || value === undefined || !Number.isFinite(value) ? '—' : new Intl.NumberFormat('fa-IR', { notation: 'compact', maximumFractionDigits: 2 }).format(value);
const dateFa = (value: string) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('fa-IR', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date); };

type ChartLineProps = { values: Array<number | null>; secondaryValues?: Array<number | null>; width?: number; height?: number; padding?: number; onHover?: (index: number, x: number, y: number) => void };
function ChartLine({ values, secondaryValues, width = 760, height = 270, padding = 32, onHover }: ChartLineProps) {
  const all = [...values, ...(secondaryValues ?? [])];
  const valid = all.map((value, index) => ({ value, index })).filter((item): item is { value: number; index: number } => valueIsValid(item.value));
  if (!valid.length) return null;
  const min = Math.min(...valid.map((item) => item.value));
  const max = Math.max(...valid.map((item) => item.value));
  const span = max - min || Math.max(Math.abs(max) * 0.01, 1);
  const toPoint = (value: number, index: number) => ({ x: padding + (index / Math.max(values.length - 1, 1)) * (width - padding * 2), y: height - padding - ((value - min) / span) * (height - padding * 2) });
  const buildPoints = (series: Array<number | null>) => series.map((value, index) => valueIsValid(value) ? `${toPoint(value as number, index).x},${toPoint(value as number, index).y}` : null).filter(Boolean).join(' ');
  return <>
    <polyline points={buildPoints(values)} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    {secondaryValues && <polyline points={buildPoints(secondaryValues)} fill="none" stroke="currentColor" strokeOpacity="0.45" strokeWidth="3" strokeDasharray="7 5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
    {values.map((value, index) => valueIsValid(value) ? (() => { const point = toPoint(value as number, index); return <circle key={`p-${index}`} cx={point.x} cy={point.y} r="5" fill="currentColor" stroke="var(--color-surface)" strokeWidth="2" className="cursor-pointer" onMouseEnter={() => onHover?.(index, point.x, point.y)} onFocus={() => onHover?.(index, point.x, point.y)} tabIndex={0} aria-label={`نقطه ${index + 1}`} />; })() : null)}
  </>;
}

function valueIsValid(value: number | null | undefined): value is number { return value !== null && value !== undefined && Number.isFinite(value); }

const MarketRadarHistory: React.FC = () => {
  const [range, setRange] = useState<MarketRadarHistoryRange>('1d');
  const [metric, setMetric] = useState<Metric>('index');
  const [compareIndex, setCompareIndex] = useState(true);
  const [data, setData] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [hovered, setHovered] = useState<{ index: number; x: number; y: number } | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true); setError(false); setHovered(null);
    getMarketRadarHistory(range).then((result) => { if (active) setData(result); }).catch((err) => { console.error('[MarketRadarHistory] load failed:', err); if (active) { setData(null); setError(true); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [range]);

  const selectedMetric = metrics.find((item) => item.value === metric) ?? metrics[0];
  const values = useMemo(() => data?.points.map((point) => point[selectedMetric.key] as number | null) ?? [], [data, selectedMetric.key]);
  const equalValues = useMemo(() => data?.points.map((point) => point.equalWeightedIndex) ?? [], [data]);
  const last = data?.points[data.points.length - 1];
  const firstValid = values.find(valueIsValid);
  const lastValue = last?.[selectedMetric.key] as number | null | undefined;
  const hoveredPoint = hovered && data?.points[hovered.index];
  const hoveredValue = hoveredPoint ? hoveredPoint[selectedMetric.key] as number | null : null;
  const hoveredEqual = hoveredPoint?.equalWeightedIndex ?? null;
  const valueLabel = (value: number | null | undefined) => selectedMetric.format === 'compact' ? compactFa(value) : fa(value, 2);
  const rangeChange = valueIsValid(firstValid) && valueIsValid(lastValue) && firstValid !== 0 ? ((lastValue - firstValid) / Math.abs(firstValid)) * 100 : null;
  const rangeChangeLabel = rangeChange === null ? '—' : `${rangeChange >= 0 ? '+' : ''}${fa(rangeChange, 2)}٪`;

  return <article dir="rtl" className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div><h2 className="font-black text-[var(--color-text-primary)]">روند تاریخی بازار</h2><p className="mt-1 text-xs text-slate-500">داده روزانه واقعی از MarketSummary؛ بدون تولید یا برآورد داده</p></div>
      <div className="flex flex-wrap gap-2">{ranges.map((item) => <button key={item.value} onClick={() => setRange(item.value)} className={`rounded-xl px-3 py-2 text-xs font-bold transition ${range === item.value ? 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-400/30' : 'border border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/[0.06]'}`}>{item.label}</button>)}</div>
    </div>

    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/5 pt-4">
      <span className="ml-1 text-xs font-bold text-slate-500">متریک:</span>
      {metrics.map((item) => <button key={item.value} onClick={() => { setMetric(item.value); setHovered(null); }} className={`rounded-xl px-3 py-2 text-xs font-bold transition ${metric === item.value ? 'bg-violet-500/15 text-violet-300 ring-1 ring-violet-400/30' : 'border border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/[0.06]'}`}>{item.label}</button>)}
      {metric === 'index' && <label className="mr-2 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-bold text-slate-400"><input type="checkbox" checked={compareIndex} onChange={(event) => setCompareIndex(event.target.checked)} className="h-4 w-4 accent-violet-500" /> مقایسه با شاخص هم‌وزن</label>}
    </div>

    {loading ? <div className="mt-5 h-72 animate-pulse rounded-2xl bg-white/[0.03]" /> : error ? <div className="mt-5 rounded-2xl border border-rose-500/20 bg-rose-500/5 p-8 text-center text-sm text-rose-300">دریافت تاریخچه انجام نشد.</div> : !data?.available || !data.points.length ? <div className="mt-5 rounded-2xl border border-white/5 bg-white/[0.02] p-10 text-center text-sm text-slate-500">داده تاریخی موجود نیست.</div> : <>
      <div className="mt-5 overflow-x-auto rounded-2xl border border-white/5 bg-black/5 p-2">
        <div className="relative min-w-[680px]">
          <svg viewBox="0 0 760 270" className="h-72 w-full text-sky-400" role="img" aria-label={`نمودار تاریخی ${selectedMetric.label}`} onMouseLeave={() => setHovered(null)}>
            <ChartLine values={values} secondaryValues={metric === 'index' && compareIndex ? equalValues : undefined} onHover={(index, x, y) => setHovered({ index, x, y })} />
            {hovered && hoveredPoint && <g pointerEvents="none">
              <line x1={hovered.x} x2={hovered.x} y1="25" y2="245" stroke="currentColor" strokeOpacity="0.2" strokeDasharray="4 4" />
              <circle cx={hovered.x} cy={hovered.y} r="7" fill="currentColor" />
              <rect x={Math.min(Math.max(hovered.x - 112, 8), 544)} y={Math.max(hovered.y - 88, 8)} width="224" height={metric === 'index' && compareIndex ? 76 : 58} rx="12" fill="var(--color-surface)" stroke="currentColor" strokeOpacity="0.25" />
              <text x={Math.min(Math.max(hovered.x, 120), 640)} y={Math.max(hovered.y - 61, 25)} textAnchor="middle" className="fill-[var(--color-text-primary)] text-[11px] font-bold">{dateFa(hoveredPoint.timestamp)}</text>
              <text x={Math.min(Math.max(hovered.x, 120), 640)} y={Math.max(hovered.y - 41, 45)} textAnchor="middle" className="fill-sky-300 text-[11px] font-black">شاخص کل: {valueLabel(hoveredValue)}</text>
              {metric === 'index' && compareIndex && <text x={Math.min(Math.max(hovered.x, 120), 640)} y={Math.max(hovered.y - 21, 65)} textAnchor="middle" className="fill-violet-300 text-[11px] font-black">هم‌وزن: {fa(hoveredEqual, 2)}</text>}
            </g>}
          </svg>
          {metric === 'index' && compareIndex && <div className="flex justify-center gap-5 pb-2 text-[11px] font-bold text-slate-500"><span className="inline-flex items-center gap-2"><i className="h-2 w-6 rounded-full bg-sky-400" /> شاخص کل</span><span className="inline-flex items-center gap-2"><i className="h-0.5 w-6 border-t-2 border-dashed border-violet-400" /> شاخص هم‌وزن</span></div>}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <div className="rounded-2xl bg-white/[0.03] p-3"><div className="text-xs text-slate-500">متریک انتخاب‌شده</div><div className="mt-1 font-black text-slate-200">{selectedMetric.label}</div></div>
        <div className="rounded-2xl bg-white/[0.03] p-3"><div className="text-xs text-slate-500">آخرین مقدار</div><div className="mt-1 font-black tabular-nums text-slate-200">{valueLabel(lastValue)}</div></div>
        <div className="rounded-2xl bg-white/[0.03] p-3"><div className="text-xs text-slate-500">تغییر بازه</div><div className={`mt-1 font-black tabular-nums ${rangeChange === null ? 'text-slate-200' : rangeChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{rangeChangeLabel}</div></div>
        <div className="rounded-2xl bg-white/[0.03] p-3"><div className="text-xs text-slate-500">آخرین تاریخ</div><div className="mt-1 font-black text-slate-200">{last ? dateFa(last.timestamp) : '—'}</div></div>
        <div className="rounded-2xl bg-white/[0.03] p-3"><div className="text-xs text-slate-500">تعداد نقاط</div><div className="mt-1 font-black tabular-nums text-slate-200">{fa(data.points.length)}</div></div>
      </div>
    </>}
  </article>;
};

export default MarketRadarHistory;
