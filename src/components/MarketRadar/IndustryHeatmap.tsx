import React, { useMemo, useState } from 'react';
import type { MarketRadarSector, MarketRadarSymbol } from '../../types/marketRadar';

type SortKey = 'change' | 'symbols' | 'value' | 'name';
const fa = (v: number | null | undefined, digits = 0) => v == null || !Number.isFinite(v) ? '—' : new Intl.NumberFormat('fa-IR', { maximumFractionDigits: digits }).format(v);
const signedPercent = (v: number | null | undefined) => v == null || !Number.isFinite(v) ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${fa(Math.abs(v), 2)}٪`;
const normalizeIndustry = (v: string | null | undefined) => String(v ?? '').replace(/[\u200c\u200f\u0640\s()[\]،,._-]/g, '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').trim();
const heatClass = (v: number) => v >= 4 ? 'border-emerald-700 bg-emerald-700 text-emerald-100' : v >= 2 ? 'border-emerald-600 bg-emerald-600 text-emerald-100' : v > 0 ? 'border-emerald-500 bg-emerald-500 text-emerald-100' : v <= -4 ? 'border-rose-700 bg-rose-700 text-rose-100' : v <= -2 ? 'border-rose-600 bg-rose-600 text-rose-100' : v < 0 ? 'border-rose-500 bg-rose-500 text-rose-100' : 'border-slate-500 bg-slate-500 text-slate-100';
const changeTone = (v: number | null) => v == null || !Number.isFinite(v) || v === 0 ? 'text-slate-500' : v > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';

const IndustryHeatmap: React.FC<{ rows: MarketRadarSector[]; symbols: MarketRadarSymbol[]; symbolsLoading: boolean; symbolsAvailable: boolean }> = ({ rows, symbols, symbolsLoading, symbolsAvailable }) => {
  const [sortKey, setSortKey] = useState<SortKey>('change');
  const [selectedSector, setSelectedSector] = useState<MarketRadarSector | null>(null);
  const counts = useMemo(() => {
    const result = new Map<string, number>();
    for (const symbol of symbols) {
      const key = normalizeIndustry(symbol.sector);
      if (key) result.set(key, (result.get(key) ?? 0) + 1);
    }
    return result;
  }, [symbols]);
  const countFor = (row: MarketRadarSector) => symbolsAvailable ? counts.get(normalizeIndustry(row.name)) ?? 0 : row.symbols || 0;
  const sortedRows = useMemo(() => [...rows].sort((a,b) => {
    if (sortKey === 'name') return a.name.localeCompare(b.name, 'fa');
    if (sortKey === 'symbols') return countFor(b) - countFor(a);
    if (sortKey === 'value') return (b.value || 0) - (a.value || 0);
    return (b.changePercent || 0) - (a.changePercent || 0);
  }), [rows, sortKey, counts, symbolsAvailable]);
  const maxSymbols = sortedRows.reduce((max,row) => Math.max(max,countFor(row)),0);
  const selectedSymbols = useMemo(() => selectedSector ? symbols.filter(s => normalizeIndustry(s.sector) === normalizeIndustry(selectedSector.name)).sort((a,b)=>a.symbol.localeCompare(b.symbol,'fa')) : [], [symbols,selectedSector]);

  if (!rows.length) return <div className="rounded-2xl border border-white/5 bg-white/[0.02] py-10 text-center text-sm text-slate-500">داده کافی برای نقشه صنایع در دسترس نیست.</div>;

  return <div>
    <div className="mb-4 flex flex-col gap-3 text-xs text-slate-700 dark:text-slate-300 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-3"><span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-emerald-400" />رشد</span><span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-slate-400" />خنثی</span><span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-rose-400" />افت</span></div>
      <label className="flex items-center gap-2 text-xs text-slate-400"><span>مرتب‌سازی:</span><select value={sortKey} onChange={e=>setSortKey(e.target.value as SortKey)} className="rounded-xl border border-white/10 bg-[var(--color-surface)] px-3 py-2 text-xs font-bold text-slate-200 outline-none focus:border-sky-400/40"><option value="change">درصد تغییر</option><option value="symbols">تعداد نماد</option><option value="value">ارزش معاملات</option><option value="name">نام صنعت</option></select></label>
    </div>
    <div className="mb-3 text-[11px] font-semibold text-slate-700 dark:text-slate-300">اندازه کارت متناسب با تعداد کل نمادهای صنعت است؛ رنگ بر اساس درصد تغییر صنعت محاسبه می‌شود.</div>
    <div className="flex flex-wrap gap-2">
      {sortedRows.map(row => {
        const count = countFor(row), ratio = maxSymbols > 0 ? Math.max(0.75,Math.min(2.5,count/maxSymbols*2.5)) : 1;
        const change = Number.isFinite(row.changePercent) ? row.changePercent : 0;
        return <button type="button" key={row.name} onClick={()=>setSelectedSector(row)} aria-label={`نمایش نمادهای صنعت ${row.name}`} style={{flexGrow:ratio,flexBasis:`${Math.max(150,Math.round(ratio*120))}px`,backgroundColor:change>=4?'rgba(5,150,105,.88)':change>=2?'rgba(16,185,129,.82)':change>0?'rgba(52,211,153,.72)':change<=-4?'rgba(190,24,93,.88)':change<=-2?'rgba(225,29,72,.82)':change<0?'rgba(244,63,94,.72)':'rgba(100,116,139,.78)',borderColor:change>0?'rgba(16,185,129,.95)':change<0?'rgba(244,63,94,.95)':'rgba(100,116,139,.95)'}} className={`group min-h-[136px] rounded-2xl border p-3 text-right transition hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 ${heatClass(change)}`}>
          <div className="flex h-full flex-col justify-between gap-3"><div className="flex items-start justify-between gap-2"><span className="min-w-0 whitespace-normal break-words text-base font-black leading-6">{row.name}</span><span className="shrink-0 rounded-lg bg-black/10 px-2.5 py-1.5 text-sm font-black tabular-nums text-white">{signedPercent(row.changePercent)}</span></div><div className="mt-auto border-t border-white/15 pt-2"><div className="flex items-center gap-2 text-sm font-black text-white"><span className="text-lg tabular-nums">{symbolsAvailable ? fa(count) : symbolsLoading ? '…' : fa(count)}</span><span>تعداد کل نماد</span></div><div className="mt-1 text-xs font-bold">ارزش معاملات</div><div className="tabular-nums text-base font-black">{fa(row.value)}</div></div></div>
        </button>;
      })}
    </div>
    {selectedSector && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={`نمادهای صنعت ${selectedSector.name}`}>
      <section className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] p-4 sm:p-5"><div><h3 className="text-lg font-black text-[var(--color-text-primary)] sm:text-xl">{selectedSector.name}</h3><p className="mt-1 text-xs text-slate-500">نمادهای اسنپ‌شات AllSymbols ذخیره‌شده در دیتابیس</p><p className="mt-1 text-sm font-bold text-[var(--color-text-primary)]">تعداد کل نمادها: {symbolsAvailable ? fa(counts.get(normalizeIndustry(selectedSector.name)) ?? 0) : '—'}</p></div><button type="button" onClick={()=>setSelectedSector(null)} aria-label="بستن کارت صنعت" className="shrink-0 rounded-full border border-[var(--color-border)] p-2 text-xl leading-none text-slate-500 transition hover:bg-slate-500/10 hover:text-[var(--color-text-primary)]">×</button></header>
        <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-5">
          {symbolsLoading && !symbolsAvailable ? <p className="py-10 text-center text-sm text-slate-500">در حال خواندن اسنپ‌شات نمادها از دیتابیس…</p> : selectedSymbols.length===0 ? <p className="py-10 text-center text-sm text-slate-500">نمادی با این صنعت در اسنپ‌شات فعلی پیدا نشد.</p> : <>
            <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[760px] text-right text-sm"><thead className="sticky top-0 bg-[var(--color-surface)] text-xs text-slate-500"><tr><th className="p-3">نماد</th><th className="p-3">قیمت لحظه‌ای</th><th className="p-3">قیمت پایانی</th><th className="p-3">تغییر لحظه‌ای</th><th className="p-3">تغییر پایانی</th></tr></thead><tbody>{selectedSymbols.map(symbol=><tr key={symbol.symbol} className="border-t border-[var(--color-border)]"><td className="p-3 font-black text-[var(--color-text-primary)]">{symbol.symbol}</td><td className="p-3 tabular-nums text-[var(--color-text-primary)]">{fa(symbol.lastPrice,2)}</td><td className="p-3 tabular-nums text-[var(--color-text-primary)]">{fa(symbol.closePrice,2)}</td><td className={`p-3 font-bold tabular-nums ${changeTone(symbol.lastChangePercent)}`}>{signedPercent(symbol.lastChangePercent)}</td><td className={`p-3 font-bold tabular-nums ${changeTone(symbol.closeChangePercent)}`}>{signedPercent(symbol.closeChangePercent)}</td></tr>)}</tbody></table></div>
            <div className="grid grid-cols-1 gap-3 md:hidden">{selectedSymbols.map(symbol=><article key={symbol.symbol} className="rounded-xl border border-[var(--color-border)] p-3"><div className="mb-3 flex items-center justify-between gap-2"><strong className="text-base font-black text-[var(--color-text-primary)]">{symbol.symbol}</strong><span className={`text-sm font-black ${changeTone(symbol.lastChangePercent)}`}>لحظه‌ای: {signedPercent(symbol.lastChangePercent)}</span></div><div className="grid grid-cols-2 gap-3 text-sm"><div><div className="text-xs text-slate-500">قیمت لحظه‌ای</div><div className="mt-1 font-bold tabular-nums text-[var(--color-text-primary)]">{fa(symbol.lastPrice,2)}</div></div><div><div className="text-xs text-slate-500">قیمت پایانی</div><div className="mt-1 font-bold tabular-nums text-[var(--color-text-primary)]">{fa(symbol.closePrice,2)}</div></div><div className="col-span-2"><div className="text-xs text-slate-500">درصد تغییر قیمت پایانی</div><div className={`mt-1 font-bold ${changeTone(symbol.closeChangePercent)}`}>{signedPercent(symbol.closeChangePercent)}</div></div></div></article>)}</div>
          </>}
        </div>
        <footer className="border-t border-[var(--color-border)] px-4 py-3 text-xs text-slate-500">با ذخیره اسنپ‌شات جدید بازار، اطلاعات این کارت به‌صورت خودکار به‌روزرسانی می‌شود.</footer>
      </section>
    </div>}
  </div>;
};
export default IndustryHeatmap;
