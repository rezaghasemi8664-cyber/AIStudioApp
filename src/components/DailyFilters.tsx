import React, { useEffect, useMemo, useState } from 'react';
import { getDailyFilters, DailyFilterRow } from '../services/dailyFiltersService';

type SortKey = 'change' | 'buyPower' | 'volume' | 'value' | 'pe' | 'symbol';
type Preset = { id: string; label: string; positiveOnly: boolean; minChange: string; minBuyPower: string; minVolumeRatio: string; maxPe: string; search: string };

const PRESET_KEY = 'ronia_professional_screener_presets_v1';
const fmt = (v: number | null | undefined, digits = 0) => v === null || v === undefined || !Number.isFinite(v) ? '—' : new Intl.NumberFormat('fa-IR', { maximumFractionDigits: digits }).format(v);
const pct = (v: number | null | undefined) => v === null || v === undefined || !Number.isFinite(v) ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(2)}٪`;
const tone = (v: number | null | undefined) => v === null || v === undefined ? 'text-slate-400' : v > 0 ? 'text-emerald-400' : v < 0 ? 'text-rose-400' : 'text-slate-400';

const ProfessionalScreener: React.FC = () => {
  const [filters, setFilters] = useState<{ id: string; label: string; count: number; updatedAt: string | null; rows: DailyFilterRow[] }[]>([]);
  const [active, setActive] = useState('high-buy-power');
  const [marketOpen, setMarketOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [positiveOnly, setPositiveOnly] = useState(false);
  const [minChange, setMinChange] = useState('');
  const [minBuyPower, setMinBuyPower] = useState('');
  const [minVolumeRatio, setMinVolumeRatio] = useState('');
  const [maxPe, setMaxPe] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('change');
  const [sortDesc, setSortDesc] = useState(true);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetName, setPresetName] = useState('');

  const load = async (force = false) => {
    try {
      if (force) setRefreshing(true); else setLoading(true);
      setError('');
      const result = await getDailyFilters(force);
      setFilters(result.filters || []);
      setMarketOpen(Boolean(result.marketStatus?.isOpen));
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'خطا در دریافت داده‌های غربالگر');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load();
    try {
      const raw = localStorage.getItem(PRESET_KEY);
      if (raw) setPresets(JSON.parse(raw));
    } catch { setPresets([]); }
    const id = window.setInterval(() => void load(), 300_000);
    return () => window.clearInterval(id);
  }, []);

  const sourceRows = useMemo(() => {
    const selected = filters.find((item) => item.id === active) || filters[0];
    return selected?.rows || [];
  }, [filters, active]);

  const rows = useMemo(() => {
    const minChangeValue = minChange === '' ? null : Number(minChange);
    const minBuyPowerValue = minBuyPower === '' ? null : Number(minBuyPower);
    const minVolumeRatioValue = minVolumeRatio === '' ? null : Number(minVolumeRatio);
    const maxPeValue = maxPe === '' ? null : Number(maxPe);
    const query = search.trim().toLocaleLowerCase('fa-IR');
    return sourceRows
      .filter((row) => !query || `${row.symbol} ${row.name || ''}`.toLocaleLowerCase('fa-IR').includes(query))
      .filter((row) => !positiveOnly || row.lastChangePercent > 0)
      .filter((row) => minChangeValue === null || row.lastChangePercent >= minChangeValue)
      .filter((row) => minBuyPowerValue === null || row.buyPower >= minBuyPowerValue)
      .filter((row) => minVolumeRatioValue === null || (row.volumeRatio1m || 0) >= minVolumeRatioValue)
      .filter((row) => maxPeValue === null || (row.pe > 0 && row.pe <= maxPeValue))
      .sort((a, b) => {
        const av = sortKey === 'symbol' ? a.symbol : Number(a[sortKey === 'change' ? 'lastChangePercent' : sortKey] || 0);
        const bv = sortKey === 'symbol' ? b.symbol : Number(b[sortKey === 'change' ? 'lastChangePercent' : sortKey] || 0);
        const result = sortKey === 'symbol' ? String(av).localeCompare(String(bv), 'fa') : av - bv;
        return sortDesc ? -result : result;
      });
  }, [sourceRows, search, positiveOnly, minChange, minBuyPower, minVolumeRatio, maxPe, sortKey, sortDesc]);

  const reset = () => { setSearch(''); setPositiveOnly(false); setMinChange(''); setMinBuyPower(''); setMinVolumeRatio(''); setMaxPe(''); };
  const savePreset = () => {
    const label = presetName.trim();
    if (!label) return;
    const next = [...presets.filter((item) => item.label !== label), { id: `${Date.now()}`, label, positiveOnly, minChange, minBuyPower, minVolumeRatio, maxPe, search }];
    setPresets(next); localStorage.setItem(PRESET_KEY, JSON.stringify(next)); setPresetName('');
  };
  const applyPreset = (preset: Preset) => { setPositiveOnly(preset.positiveOnly); setMinChange(preset.minChange); setMinBuyPower(preset.minBuyPower); setMinVolumeRatio(preset.minVolumeRatio); setMaxPe(preset.maxPe); setSearch(preset.search); };
  const removePreset = (id: string) => { const next = presets.filter((item) => item.id !== id); setPresets(next); localStorage.setItem(PRESET_KEY, JSON.stringify(next)); };
  const selected = filters.find((item) => item.id === active) || filters[0];

  return <section dir="rtl" className="space-y-5">
    <header className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div><div className="flex flex-wrap items-center gap-3"><h1 className="text-xl font-black text-[var(--color-text-primary)]">غربالگر حرفه‌ای</h1><span className={`rounded-full px-3 py-1 text-xs font-bold ${marketOpen ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-500/10 text-slate-400'}`}>{marketOpen ? 'بازار باز' : 'بازار بسته'}</span><span className="rounded-full bg-sky-500/10 px-3 py-1 text-xs font-bold text-sky-300">داده واقعی</span></div><p className="mt-1 text-xs text-slate-500">غربال نمادها با معیارهای قطعی بازار؛ بدون AI و بدون تولید داده مصنوعی</p></div>
        <button onClick={() => void load(true)} disabled={refreshing} className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-bold text-slate-200 hover:bg-white/[0.08] disabled:opacity-50">{refreshing ? 'در حال بروزرسانی…' : 'بروزرسانی داده'}</button>
      </div>
    </header>

    <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
      <article className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 lg:col-span-3">
        <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="font-black text-[var(--color-text-primary)]">معیارهای غربال</h2><p className="text-xs text-slate-500">ترکیب چند معیار برای رسیدن به فهرست دقیق‌تر</p></div><button onClick={reset} className="text-xs font-bold text-sky-300">پاک‌سازی فیلترها</button></div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <label className="text-xs text-slate-500">جستجوی نماد/نام<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="مثلاً فملی" className="mt-1 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-200 outline-none" /></label>
          <label className="text-xs text-slate-500">حداقل درصد تغییر<input value={minChange} onChange={(e) => setMinChange(e.target.value)} type="number" step="0.1" placeholder="مثلاً ۲" className="mt-1 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-200 outline-none" /></label>
          <label className="text-xs text-slate-500">حداقل قدرت خرید<input value={minBuyPower} onChange={(e) => setMinBuyPower(e.target.value)} type="number" step="0.1" placeholder="مثلاً ۱.۵" className="mt-1 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-200 outline-none" /></label>
          <label className="text-xs text-slate-500">حداقل نسبت حجم به ماه<input value={minVolumeRatio} onChange={(e) => setMinVolumeRatio(e.target.value)} type="number" step="0.1" placeholder="مثلاً ۲" className="mt-1 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-200 outline-none" /></label>
          <label className="text-xs text-slate-500">حداکثر P/E<input value={maxPe} onChange={(e) => setMaxPe(e.target.value)} type="number" step="0.1" placeholder="مثلاً ۱۲" className="mt-1 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-200 outline-none" /></label>
          <label className="flex items-end"><span className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm font-bold text-slate-300"><input type="checkbox" checked={positiveOnly} onChange={(e) => setPositiveOnly(e.target.checked)} className="h-4 w-4 accent-emerald-500" /> فقط نمادهای مثبت</span></label>
        </div>
      </article>
      <article className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4"><h2 className="font-black text-[var(--color-text-primary)]">مرتب‌سازی</h2><div className="mt-3 space-y-2"><select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} className="w-full rounded-xl border border-white/10 bg-[var(--color-surface)] px-3 py-2 text-sm text-slate-200"><option value="change">درصد تغییر</option><option value="buyPower">قدرت خرید</option><option value="volume">حجم</option><option value="value">ارزش</option><option value="pe">P/E</option><option value="symbol">نام نماد</option></select><button onClick={() => setSortDesc((v) => !v)} className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-bold text-slate-300">{sortDesc ? 'نزولی ↓' : 'صعودی ↑'}</button></div></article>
    </div>

    <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><h2 className="font-black text-[var(--color-text-primary)]">منبع اولیه غربال</h2><p className="text-xs text-slate-500">فیلترهای واقعی بازار موجود در سرویس فعلی</p></div><div className="flex flex-wrap gap-2">{filters.map((item) => <button key={item.id} onClick={() => setActive(item.id)} className={`rounded-xl px-3 py-2 text-xs font-bold ${active === item.id ? 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-400/30' : 'border border-white/10 bg-white/[0.03] text-slate-400'}`}>{item.label} <span className="mr-1 opacity-70">{fmt(item.count)}</span></button>)}</div></div>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><div className="rounded-2xl bg-white/[0.03] p-3"><div className="text-xs text-slate-500">نتیجه غربال</div><div className="mt-1 text-xl font-black text-slate-200">{fmt(rows.length)}</div></div><div className="rounded-2xl bg-white/[0.03] p-3"><div className="text-xs text-slate-500">مثبت</div><div className="mt-1 text-xl font-black text-emerald-400">{fmt(rows.filter((r) => r.lastChangePercent > 0).length)}</div></div><div className="rounded-2xl bg-white/[0.03] p-3"><div className="text-xs text-slate-500">میانگین قدرت خرید</div><div className="mt-1 text-xl font-black text-sky-300">{rows.length ? fmt(rows.reduce((s, r) => s + (r.buyPower || 0), 0) / rows.length, 2) : '—'}</div></div><div className="rounded-2xl bg-white/[0.03] p-3"><div className="text-xs text-slate-500">آخرین بروزرسانی</div><div className="mt-1 text-sm font-black text-slate-200">{selected?.updatedAt ? new Date(selected.updatedAt).toLocaleTimeString('fa-IR') : '—'}</div></div></div>
      {loading ? <div className="py-16 text-center text-sm text-slate-500">در حال دریافت داده بازار…</div> : error ? <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-8 text-center text-sm text-rose-300">{error}<button onClick={() => void load(true)} className="mr-3 rounded-xl bg-white/10 px-3 py-2">تلاش مجدد</button></div> : !rows.length ? <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-10 text-center text-sm text-slate-500">با معیارهای فعلی نمادی پیدا نشد.</div> : <div className="overflow-x-auto rounded-2xl border border-white/5"><table className="min-w-[1150px] w-full text-xs text-right"><thead className="bg-white/[0.03] text-slate-500"><tr>{['#','نماد','قدرت خرید','آخرین','پایانی','تغییر','حجم','ارزش','حجم/ماه','P/E','خرید حقیقی','فروش حقیقی'].map((h) => <th key={h} className="px-3 py-3 font-bold">{h}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={r.symbol} className="border-t border-white/5 hover:bg-white/[0.025]"><td className="px-3 py-3 text-slate-500">{fmt(i + 1)}</td><td className="px-3 py-3 font-black text-slate-200">{r.symbol}</td><td className="px-3 py-3 font-bold text-sky-300">{fmt(r.buyPower, 2)}</td><td className="px-3 py-3 tabular-nums text-slate-300">{fmt(r.lastPrice)}</td><td className="px-3 py-3 tabular-nums text-slate-300">{fmt(r.closingPrice)}</td><td className={`px-3 py-3 font-black ${tone(r.lastChangePercent)}`}>{pct(r.lastChangePercent)}</td><td className="px-3 py-3 tabular-nums text-slate-300">{fmt(r.volume)}</td><td className="px-3 py-3 tabular-nums text-slate-300">{fmt(r.value)}</td><td className="px-3 py-3 font-bold text-violet-300">{r.volumeRatio1m ? `${fmt(r.volumeRatio1m, 2)}×` : '—'}</td><td className="px-3 py-3">{r.pe ? fmt(r.pe, 2) : '—'}</td><td className="px-3 py-3 text-emerald-300">{fmt(r.realBuyVolume)}</td><td className="px-3 py-3 text-rose-300">{fmt(r.realSellVolume)}</td></tr>)}</tbody></table></div>}
    </div>

    <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-black text-[var(--color-text-primary)]">فیلترهای ذخیره‌شده</h2><p className="text-xs text-slate-500">در مرورگر شما ذخیره می‌شوند و وابسته به AI نیستند.</p></div><div className="flex gap-2"><input value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="نام فیلتر جدید" className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-200" /><button onClick={savePreset} disabled={!presetName.trim()} className="rounded-xl bg-sky-500/15 px-4 py-2 text-xs font-bold text-sky-300 disabled:opacity-40">ذخیره</button></div></div>{presets.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{presets.map((preset) => <div key={preset.id} className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03]"><button onClick={() => applyPreset(preset)} className="px-3 py-2 text-xs font-bold text-slate-300">{preset.label}</button><button onClick={() => removePreset(preset.id)} className="px-2 py-2 text-xs text-rose-300">×</button></div>)}</div>}</div>
    </section>;
};

export default ProfessionalScreener;
