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
  if (changePercent >= 4) return 'border-emerald-700 bg-emerald-700 text-emerald-100';
  if (changePercent >= 2) return 'border-emerald-600 bg-emerald-600 text-emerald-100';
  if (changePercent > 0) return 'border-emerald-500 bg-emerald-500 text-emerald-100';
  if (changePercent <= -4) return 'border-rose-700 bg-rose-700 text-rose-100';
  if (changePercent <= -2) return 'border-rose-600 bg-rose-600 text-rose-100';
  if (changePercent < 0) return 'border-rose-500 bg-rose-500 text-rose-100';
  return 'border-slate-500 bg-slate-500 text-slate-100';
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
      <div className="mb-4 flex flex-col gap-3 text-xs text-slate-700 dark:text-slate-300 sm:flex-row sm:items-center sm:justify-between">
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

      <div className="mb-3 text-[11px] font-semibold text-slate-700 dark:text-slate-300">اندازه کارت متناسب با تعداد نمادهای صنعت است؛ رنگ بر اساس درصد تغییر واقعی بازار محاسبه می‌شود.</div>

      <div className="flex flex-wrap gap-2">
        {sortedRows.map((row) => {
          const ratio = maxSymbols > 0 ? Math.max(0.75, Math.min(2.5, (row.symbols || 0) / maxSymbols * 2.5)) : 1;
          const change = Number.isFinite(row.changePercent) ? row.changePercent : 0;
          return (
            <div
              key={row.name}
              style={{
                flexGrow: ratio,
                flexBasis: `${Math.max(150, Math.round(ratio * 120))}px`,
                backgroundColor: change >= 4 ? 'rgba(5, 150, 105, 0.88)' : change >= 2 ? 'rgba(16, 185, 129, 0.82)' : change > 0 ? 'rgba(52, 211, 153, 0.72)' : change <= -4 ? 'rgba(190, 24, 93, 0.88)' : change <= -2 ? 'rgba(225, 29, 72, 0.82)' : change < 0 ? 'rgba(244, 63, 94, 0.72)' : 'rgba(100, 116, 139, 0.78)',
                borderColor: change > 0 ? 'rgba(16, 185, 129, 0.95)' : change < 0 ? 'rgba(244, 63, 94, 0.95)' : 'rgba(100, 116, 139, 0.95)',
              }}
              className={`group min-h-[136px] rounded-2xl border p-3 transition hover:-translate-y-0.5 hover:shadow-lg ${heatClass(change)}`}
            >
              <div className="flex h-full flex-col justify-between gap-3">
                <div className="flex items-start justify-between gap-2">
                  <span className={`min-w-0 whitespace-normal break-words text-base font-black leading-6 ${change > 0 ? "text-emerald-50" : change < 0 ? "text-rose-50" : "text-white"}`}>{row.name}</span>
                  <span className="shrink-0 rounded-lg bg-black/10 px-2.5 py-1.5 text-sm font-black tabular-nums text-white">{signedPercent(row.changePercent)}</span>
                </div>
                <div className="mt-auto border-t border-white/15 pt-2">
                  <div className="flex flex-col items-start gap-1 whitespace-nowrap text-sm font-black text-white">
                    <div className="flex items-center gap-2 -translate-y-1">
                      <span className="text-lg leading-none tabular-nums">{fa(row.symbols)}</span>
                      <span>مجموع نماد</span>
                    </div>
                    <div className="leading-5">ارزش معاملات</div>
                    <div className="tabular-nums text-base leading-5">{fa(row.value)}</div>
                  </div>
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
