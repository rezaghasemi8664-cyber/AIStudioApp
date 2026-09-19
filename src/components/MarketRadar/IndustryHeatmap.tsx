import React, { useMemo, useState } from 'react';
import type { MarketRadarSector } from '../../types/marketRadar';

type SortKey = 'change' | 'symbols' | 'value' | 'name';

const fa = (value: number | null | undefined, maximumFractionDigits = 0): string =>
  value === null || value === undefined || !Number.isFinite(value)
    ? '—'
    : new Intl.NumberFormat('fa-IR', { maximumFractionDigits }).format(value);

const signedPercent = (value: number | null | undefined): string => {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${fa(Math.abs(value), 2)}٪`;
};

const heatClass = (changePercent: number): string => {
  if (changePercent >= 4) return 'border-emerald-400/40 bg-emerald-500/25 text-emerald-100';
  if (changePercent >= 2) return 'border-emerald-400/25 bg-emerald-500/15 text-emerald-200';
  if (changePercent > 0) return 'border-emerald-400/15 bg-emerald-500/10 text-emerald-300';
  if (changePercent <= -4) return 'border-rose-400/40 bg-rose-500/25 text-rose-100';
  if (changePercent <= -2) return 'border-rose-400/25 bg-rose-500/15 text-rose-200';
  if (changePercent < 0) return 'border-rose-400/15 bg-rose-500/10 text-rose-300';
  return 'border-slate-400/15 bg-slate-500/10 text-slate-300';
};

const IndustryHeatmap: React.FC<{ rows: MarketRadarSector[] }> = ({ rows }) => {
  const [sortKey, setSortKey] = useState<SortKey>('change');

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name, 'fa');
      if (sortKey === 'symbols') return (b.symbols || 0) - (a.symbols || 0);
      if (sortKey === 'value') return (b.value || 0) - (a.value || 0);
      return (b.changePercent || 0) - (a.changePercent || 0);
    });
  }, [rows, sortKey]);

  const maxSymbols = sortedRows.reduce((max, row) => Math.max(max, row.symbols || 0), 0);

  if (!rows.length) {
    return <div className="rounded-2xl border border-white/5 bg-white/[0.02] py-10 text-center text-sm text-slate-500">داده کافی برای نقشه صنایع در دسترس نیست.</div>;
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-emerald-400" />رشد</span>
          <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-slate-400" />خنثی</span>
          <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-rose-400" />افت</span>
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <span>مرتب‌سازی:</span>
          <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)} className="rounded-xl border border-white/10 bg-[var(--color-surface)] px-3 py-2 text-xs font-bold text-slate-200 outline-none focus:border-sky-400/40">
            <option value="change">درصد تغییر</option>
            <option value="symbols">تعداد نماد</option>
            <option value="value">ارزش معاملات</option>
            <option value="name">نام صنعت</option>
          </select>
        </label>
      </div>

      <div className="mb-3 text-[11px] text-slate-500">اندازه کارت متناسب با تعداد نمادهای صنعت است؛ رنگ بر اساس درصد تغییر واقعی بازار محاسبه می‌شود.</div>

      <div className="flex flex-wrap gap-2">
        {sortedRows.map((row) => {
          const ratio = maxSymbols > 0 ? Math.max(0.75, Math.min(2.5, (row.symbols || 0) / maxSymbols * 2.5)) : 1;
          const change = Number.isFinite(row.changePercent) ? row.changePercent : 0;
          return (
            <div
              key={row.name}
              style={{ flexGrow: ratio, flexBasis: `${Math.max(150, Math.round(ratio * 120))}px` }}
              className={`group min-h-[112px] rounded-2xl border p-3 transition hover:-translate-y-0.5 hover:shadow-lg ${heatClass(change)}`}
            >
              <div className="flex h-full flex-col justify-between gap-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="line-clamp-2 text-sm font-black leading-5">{row.name}</span>
                  <span className="shrink-0 rounded-lg bg-black/10 px-2 py-1 text-xs font-black tabular-nums">{signedPercent(row.changePercent)}</span>
                </div>
                <div className="flex items-end justify-between gap-2">
                  <div><div className="text-[10px] opacity-60">تعداد نماد</div><div className="mt-0.5 text-sm font-black tabular-nums">{fa(row.symbols)}</div></div>
                  <div className="text-left"><div className="text-[10px] opacity-60">ارزش معاملات</div><div className="mt-0.5 text-xs font-bold tabular-nums">{fa(row.value)}</div></div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default IndustryHeatmap;
