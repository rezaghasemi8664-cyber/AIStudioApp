import React, { useEffect, useMemo, useState } from 'react';
import { getDailyFilters } from '../services/dailyFiltersService';
import type { DailyFilterRow } from '../services/dailyFiltersService';

type SortKey = 'change' | 'buyPower' | 'volume' | 'value' | 'pe' | 'symbol';
type Preset = {
  id: string;
  label: string;
  positiveOnly: boolean;
  minChange: string;
  minBuyPower: string;
  minVolumeRatio: string;
  maxPe: string;
  search: string;
};
type FilterView = {
  id: string;
  label: string;
  count: number;
  updatedAt: string | null;
  rows: DailyFilterRow[];
};

const PRESET_KEY = 'ronia_professional_screener_presets_v1';

const FILTER_CARD_PALETTE = [
  { idle: 'border-blue-200 bg-blue-50 text-blue-950 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/70 dark:text-blue-100 dark:hover:bg-blue-900/80', active: 'ring-2 ring-blue-500 bg-blue-100 text-blue-950 dark:bg-blue-900 dark:text-white' },
  { idle: 'border-emerald-200 bg-emerald-50 text-emerald-950 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-100 dark:hover:bg-emerald-900/80', active: 'ring-2 ring-emerald-500 bg-emerald-100 text-emerald-950 dark:bg-emerald-900 dark:text-white' },
  { idle: 'border-violet-200 bg-violet-50 text-violet-950 hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/70 dark:text-violet-100 dark:hover:bg-violet-900/80', active: 'ring-2 ring-violet-500 bg-violet-100 text-violet-950 dark:bg-violet-900 dark:text-white' },
  { idle: 'border-amber-200 bg-amber-50 text-amber-950 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/70 dark:text-amber-100 dark:hover:bg-amber-900/80', active: 'ring-2 ring-amber-500 bg-amber-100 text-amber-950 dark:bg-amber-900 dark:text-white' },
  { idle: 'border-rose-200 bg-rose-50 text-rose-950 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/70 dark:text-rose-100 dark:hover:bg-rose-900/80', active: 'ring-2 ring-rose-500 bg-rose-100 text-rose-950 dark:bg-rose-900 dark:text-white' },
  { idle: 'border-cyan-200 bg-cyan-50 text-cyan-950 hover:bg-cyan-100 dark:border-cyan-800 dark:bg-cyan-950/70 dark:text-cyan-100 dark:hover:bg-cyan-900/80', active: 'ring-2 ring-cyan-500 bg-cyan-100 text-cyan-950 dark:bg-cyan-900 dark:text-white' },
  { idle: 'border-indigo-200 bg-indigo-50 text-indigo-950 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/70 dark:text-indigo-100 dark:hover:bg-indigo-900/80', active: 'ring-2 ring-indigo-500 bg-indigo-100 text-indigo-950 dark:bg-indigo-900 dark:text-white' },
  { idle: 'border-teal-200 bg-teal-50 text-teal-950 hover:bg-teal-100 dark:border-teal-800 dark:bg-teal-950/70 dark:text-teal-100 dark:hover:bg-teal-900/80', active: 'ring-2 ring-teal-500 bg-teal-100 text-teal-950 dark:bg-teal-900 dark:text-white' },
  { idle: 'border-orange-200 bg-orange-50 text-orange-950 hover:bg-orange-100 dark:border-orange-800 dark:bg-orange-950/70 dark:text-orange-100 dark:hover:bg-orange-900/80', active: 'ring-2 ring-orange-500 bg-orange-100 text-orange-950 dark:bg-orange-900 dark:text-white' },
  { idle: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-950 hover:bg-fuchsia-100 dark:border-fuchsia-800 dark:bg-fuchsia-950/70 dark:text-fuchsia-100 dark:hover:bg-fuchsia-900/80', active: 'ring-2 ring-fuchsia-500 bg-fuchsia-100 text-fuchsia-950 dark:bg-fuchsia-900 dark:text-white' },
  { idle: 'border-lime-200 bg-lime-50 text-lime-950 hover:bg-lime-100 dark:border-lime-800 dark:bg-lime-950/70 dark:text-lime-100 dark:hover:bg-lime-900/80', active: 'ring-2 ring-lime-500 bg-lime-100 text-lime-950 dark:bg-lime-900 dark:text-white' },
  { idle: 'border-sky-200 bg-sky-50 text-sky-950 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/70 dark:text-sky-100 dark:hover:bg-sky-900/80', active: 'ring-2 ring-sky-500 bg-sky-100 text-sky-950 dark:bg-sky-900 dark:text-white' },
  { idle: 'border-pink-200 bg-pink-50 text-pink-950 hover:bg-pink-100 dark:border-pink-800 dark:bg-pink-950/70 dark:text-pink-100 dark:hover:bg-pink-900/80', active: 'ring-2 ring-pink-500 bg-pink-100 text-pink-950 dark:bg-pink-900 dark:text-white' },
  { idle: 'border-purple-200 bg-purple-50 text-purple-950 hover:bg-purple-100 dark:border-purple-800 dark:bg-purple-950/70 dark:text-purple-100 dark:hover:bg-purple-900/80', active: 'ring-2 ring-purple-500 bg-purple-100 text-purple-950 dark:bg-purple-900 dark:text-white' },
  { idle: 'border-red-200 bg-red-50 text-red-950 hover:bg-red-100 dark:border-red-800 dark:bg-red-950/70 dark:text-red-100 dark:hover:bg-red-900/80', active: 'ring-2 ring-red-500 bg-red-100 text-red-950 dark:bg-red-900 dark:text-white' },
  { idle: 'border-yellow-200 bg-yellow-50 text-yellow-950 hover:bg-yellow-100 dark:border-yellow-800 dark:bg-yellow-950/70 dark:text-yellow-100 dark:hover:bg-yellow-900/80', active: 'ring-2 ring-yellow-500 bg-yellow-100 text-yellow-950 dark:bg-yellow-900 dark:text-white' },
  { idle: 'border-green-200 bg-green-50 text-green-950 hover:bg-green-100 dark:border-green-800 dark:bg-green-950/70 dark:text-green-100 dark:hover:bg-green-900/80', active: 'ring-2 ring-green-500 bg-green-100 text-green-950 dark:bg-green-900 dark:text-white' },
  { idle: 'border-slate-200 bg-slate-50 text-slate-950 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700', active: 'ring-2 ring-slate-500 bg-slate-100 text-slate-950 dark:bg-slate-700 dark:text-white' },
  { idle: 'border-stone-200 bg-stone-50 text-stone-950 hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:hover:bg-stone-700', active: 'ring-2 ring-stone-500 bg-stone-100 text-stone-950 dark:bg-stone-700 dark:text-white' },
  { idle: 'border-zinc-200 bg-zinc-50 text-zinc-950 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700', active: 'ring-2 ring-zinc-500 bg-zinc-100 text-zinc-950 dark:bg-zinc-700 dark:text-white' },
  { idle: 'border-neutral-200 bg-neutral-50 text-neutral-950 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700', active: 'ring-2 ring-neutral-500 bg-neutral-100 text-neutral-950 dark:bg-neutral-700 dark:text-white' }
];

const fmt = (value: number | null | undefined, digits = 0) =>
  value === null || value === undefined || !Number.isFinite(value)
    ? '—'
    : new Intl.NumberFormat('fa-IR', { maximumFractionDigits: digits }).format(value);

const pct = (value: number | null | undefined) =>
  value === null || value === undefined || !Number.isFinite(value)
    ? '—'
    : `${value > 0 ? '+' : ''}${value.toFixed(2)}٪`;

const tone = (value: number | null | undefined) =>
  value === null || value === undefined
    ? 'text-slate-400'
    : value > 0
      ? 'text-emerald-400'
      : value < 0
        ? 'text-rose-400'
        : 'text-slate-400';

const sortValue = (row: DailyFilterRow, key: SortKey): number | string => {
  switch (key) {
    case 'change': return row.lastChangePercent;
    case 'buyPower': return row.buyPower;
    case 'volume': return row.volume;
    case 'value': return row.value;
    case 'pe': return row.pe;
    case 'symbol': return row.symbol;
    default: return 0;
  }
};

const ProfessionalScreener: React.FC = () => {
  const [filters, setFilters] = useState<FilterView[]>([]);
  const [active, setActive] = useState('high-buy-power');
  const [marketOpen, setMarketOpen] = useState(false);
  const [dataStatus, setDataStatus] = useState<'LIVE' | 'CACHED' | 'UNAVAILABLE'>('UNAVAILABLE');
  const [dataSource, setDataSource] = useState<string | undefined>();
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
      if (force) setRefreshing(true);
      else setLoading(true);
      setError('');
      const result = await getDailyFilters(force);
      setFilters(result.filters || []);
      setMarketOpen(Boolean(result.marketStatus?.isOpen));
      setDataStatus(result.meta?.status || 'UNAVAILABLE');
      setDataSource(result.meta?.source);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'خطا در دریافت داده‌های غربالگر';
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load();
    try {
      const raw = localStorage.getItem(PRESET_KEY);
      if (raw) setPresets(JSON.parse(raw) as Preset[]);
    } catch {
      setPresets([]);
    }
    const timer = window.setInterval(() => void load(), 300_000);
    return () => window.clearInterval(timer);
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
      .filter((row) => minChangeValue === null || (Number.isFinite(minChangeValue) && row.lastChangePercent >= minChangeValue))
      .filter((row) => minBuyPowerValue === null || (Number.isFinite(minBuyPowerValue) && row.buyPower >= minBuyPowerValue))
      .filter((row) => minVolumeRatioValue === null || (Number.isFinite(minVolumeRatioValue) && (row.volumeRatio1m || 0) >= minVolumeRatioValue))
      .filter((row) => maxPeValue === null || (Number.isFinite(maxPeValue) && row.pe > 0 && row.pe <= maxPeValue))
      .sort((a, b) => {
        const av = sortValue(a, sortKey);
        const bv = sortValue(b, sortKey);
        const comparison = typeof av === 'string' && typeof bv === 'string'
          ? av.localeCompare(bv, 'fa')
          : Number(av) - Number(bv);
        return sortDesc ? -comparison : comparison;
      });
  }, [sourceRows, search, positiveOnly, minChange, minBuyPower, minVolumeRatio, maxPe, sortKey, sortDesc]);

  const reset = () => {
    setSearch('');
    setPositiveOnly(false);
    setMinChange('');
    setMinBuyPower('');
    setMinVolumeRatio('');
    setMaxPe('');
  };

  const savePreset = () => {
    const label = presetName.trim();
    if (!label) return;
    const next: Preset[] = [
      ...presets.filter((item) => item.label !== label),
      { id: `${Date.now()}`, label, positiveOnly, minChange, minBuyPower, minVolumeRatio, maxPe, search },
    ];
    setPresets(next);
    localStorage.setItem(PRESET_KEY, JSON.stringify(next));
    setPresetName('');
  };

  const applyPreset = (preset: Preset) => {
    setPositiveOnly(preset.positiveOnly);
    setMinChange(preset.minChange);
    setMinBuyPower(preset.minBuyPower);
    setMinVolumeRatio(preset.minVolumeRatio);
    setMaxPe(preset.maxPe);
    setSearch(preset.search);
  };

  const removePreset = (id: string) => {
    const next = presets.filter((item) => item.id !== id);
    setPresets(next);
    localStorage.setItem(PRESET_KEY, JSON.stringify(next));
  };

  const selected = filters.find((item) => item.id === active) || filters[0];

  return (
    <section dir="rtl" className="page-shell professional-screener-page space-y-5">
      <header className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl font-black text-[var(--color-text-primary)]">غربالگر حرفه‌ای</h1>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${marketOpen ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-500/10 text-slate-400'}`}>
                {marketOpen ? 'بازار باز' : 'بازار بسته'}
              </span>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${dataStatus === 'LIVE' ? 'bg-emerald-500/10 text-emerald-300' : dataStatus === 'CACHED' ? 'bg-amber-500/10 text-amber-300' : 'bg-rose-500/10 text-rose-300'}`}>{dataStatus === 'LIVE' ? 'داده زنده' : dataStatus === 'CACHED' ? 'داده ذخیره‌شده' : 'داده در دسترس نیست'}</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">غربال نمادها با معیارهای قطعی بازار؛ بدون AI و بدون تولید داده مصنوعی{dataSource ? ` · منبع: ${dataSource}` : ''}</p>
          </div>
          <button onClick={() => void load(true)} disabled={refreshing} className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-bold text-slate-200 hover:bg-white/[0.08] disabled:opacity-50">
            {refreshing ? 'در حال بروزرسانی…' : 'بروزرسانی داده'}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <article className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 lg:col-span-3">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div><h2 className="font-black text-[var(--color-text-primary)]">معیارهای غربال</h2><p className="text-xs text-slate-500">ترکیب چند معیار برای رسیدن به فهرست دقیق‌تر</p></div>
            <button onClick={reset} className="text-xs font-bold text-sky-300">پاک‌سازی فیلترها</button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <label className="text-xs text-slate-500">جستجوی نماد/نام<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="مثلاً فملی" className="mt-1 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-200 outline-none" /></label>
            <label className="text-xs text-slate-500">حداقل درصد تغییر<input value={minChange} onChange={(e) => setMinChange(e.target.value)} type="number" step="0.1" placeholder="مثلاً ۲" className="mt-1 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-200 outline-none" /></label>
            <label className="text-xs text-slate-500">حداقل قدرت خرید<input value={minBuyPower} onChange={(e) => setMinBuyPower(e.target.value)} type="number" step="0.1" placeholder="مثلاً ۱.۵" className="mt-1 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-200 outline-none" /></label>
            <label className="text-xs text-slate-500">حداقل نسبت حجم به ماه<input value={minVolumeRatio} onChange={(e) => setMinVolumeRatio(e.target.value)} type="number" step="0.1" placeholder="مثلاً ۲" className="mt-1 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-200 outline-none" /></label>
            <label className="text-xs text-slate-500">حداکثر P/E<input value={maxPe} onChange={(e) => setMaxPe(e.target.value)} type="number" step="0.1" placeholder="مثلاً ۱۲" className="mt-1 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-200 outline-none" /></label>
            <label className="flex items-end"><span className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm font-bold text-slate-300"><input type="checkbox" checked={positiveOnly} onChange={(e) => setPositiveOnly(e.target.checked)} className="h-4 w-4 accent-emerald-500" /> فقط نمادهای مثبت</span></label>
          </div>
        </article>

        <article className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h2 className="font-black text-[var(--color-text-primary)]">مرتب‌سازی</h2>
          <div className="mt-3 space-y-2">
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} className="w-full rounded-xl border border-white/10 bg-[var(--color-surface)] px-3 py-2 text-sm text-slate-200">
              <option value="change">درصد تغییر</option><option value="buyPower">قدرت خرید</option><option value="volume">حجم</option><option value="value">ارزش</option><option value="pe">P/E</option><option value="symbol">نام نماد</option>
            </select>
            <button onClick={() => setSortDesc((value) => !value)} className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-bold text-slate-300">{sortDesc ? 'نزولی ↓' : 'صعودی ↑'}</button>
          </div>
        </article>
      </div>

      <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div><h2 className="font-black text-[var(--color-text-primary)]">منبع اولیه غربال</h2><p className="text-xs text-slate-500">فیلترهای واقعی بازار موجود در سرویس فعلی</p></div>
          <div className="flex flex-wrap gap-2">{filters.map((item, index) => { const palette = FILTER_CARD_PALETTE[index % FILTER_CARD_PALETTE.length]; const isActive = active === item.id; return <button key={item.id} onClick={() => setActive(item.id)} aria-pressed={isActive} className={`rounded-xl border px-3 py-2 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950 ${isActive ? palette.active : palette.idle}`}>{item.label} <span className="mr-1 inline-flex min-w-6 items-center justify-center rounded-full bg-black/5 px-1.5 py-0.5 font-black dark:bg-white/10">{fmt(item.count)}</span></button>; })}</div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl bg-white/[0.03] p-3"><div className="text-xs text-slate-500">نتیجه غربال</div><div className="mt-1 text-xl font-black text-slate-200">{fmt(rows.length)}</div></div>
          <div className="rounded-2xl bg-white/[0.03] p-3"><div className="text-xs text-slate-500">مثبت</div><div className="mt-1 text-xl font-black text-emerald-400">{fmt(rows.filter((row) => row.lastChangePercent > 0).length)}</div></div>
          <div className="rounded-2xl bg-white/[0.03] p-3"><div className="text-xs text-slate-500">میانگین قدرت خرید</div><div className="mt-1 text-xl font-black text-sky-300">{rows.length ? fmt(rows.reduce((sum, row) => sum + (row.buyPower || 0), 0) / rows.length, 2) : '—'}</div></div>
          <div className="rounded-2xl bg-white/[0.03] p-3"><div className="text-xs text-slate-500">آخرین بروزرسانی</div><div className="mt-1 text-sm font-black text-slate-200">{selected?.updatedAt ? new Date(selected.updatedAt).toLocaleTimeString('fa-IR') : '—'}</div></div>
        </div>

        {loading ? <div className="py-16 text-center text-sm text-slate-500">در حال دریافت داده بازار…</div> : error ? <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-8 text-center text-sm text-rose-300">{error}<button onClick={() => void load(true)} className="mr-3 rounded-xl bg-white/10 px-3 py-2">تلاش مجدد</button></div> : dataStatus === 'UNAVAILABLE' ? <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-10 text-center text-sm text-rose-300">داده واقعی غربالگر در حال حاضر از منبع بازار در دسترس نیست؛ هیچ مقدار ساختگی نمایش داده نمی‌شود.</div> : !rows.length ? <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-10 text-center text-sm text-slate-500">با معیارهای فعلی نمادی پیدا نشد.</div> : (
          <div className="overflow-x-auto rounded-2xl border border-white/5">
            <table className="min-w-[1150px] w-full text-xs text-right">
              <thead className="bg-white/[0.03] text-slate-500"><tr>{['#','نماد','قدرت خرید','آخرین','پایانی','تغییر','حجم','ارزش','حجم ماه','P/E','خرید حقیقی','فروش حقیقی'].map((heading) => <th key={heading} className="px-3 py-3 font-bold">{heading}</th>)}</tr></thead>
              <tbody>{rows.map((row, index) => <tr key={row.symbol} className="border-t border-white/5 hover:bg-white/[0.025]">
                <td className="px-3 py-3 text-slate-500">{fmt(index + 1)}</td>
                <td className="px-3 py-3 font-black text-slate-200">{row.symbol}</td>
                <td className="px-3 py-3 font-bold text-sky-300">{fmt(row.buyPower, 2)}</td>
                <td className="px-3 py-3 tabular-nums text-slate-300">{fmt(row.lastPrice)}</td>
                <td className="px-3 py-3 tabular-nums text-slate-300">{fmt(row.closingPrice)}</td>
                <td className={`px-3 py-3 font-black ${tone(row.lastChangePercent)}`}>{pct(row.lastChangePercent)}</td>
                <td className="px-3 py-3 tabular-nums text-slate-300">{fmt(row.volume)}</td>
                <td className="px-3 py-3 tabular-nums text-slate-300">{fmt(row.value)}</td>
                <td className="px-3 py-3 font-bold text-violet-300">{row.volumeAvg1m ? fmt(row.volumeAvg1m) : '—'}</td>
                <td className="px-3 py-3">{row.pe ? fmt(row.pe, 2) : '—'}</td>
                <td className="px-3 py-3 text-emerald-300">{fmt(row.realBuyVolume)}</td>
                <td className="px-3 py-3 text-rose-300">{fmt(row.realSellVolume)}</td>
              </tr>)}</tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="font-black text-[var(--color-text-primary)]">فیلترهای ذخیره‌شده</h2><p className="text-xs text-slate-500">در مرورگر شما ذخیره می‌شوند و وابسته به AI نیستند.</p></div>
          <div className="flex gap-2"><input value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="نام فیلتر جدید" className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-200" /><button onClick={savePreset} disabled={!presetName.trim()} className="rounded-xl bg-sky-500/15 px-4 py-2 text-xs font-bold text-sky-300 disabled:opacity-40">ذخیره</button></div>
        </div>
        {presets.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{presets.map((preset) => <div key={preset.id} className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03]"><button onClick={() => applyPreset(preset)} className="px-3 py-2 text-xs font-bold text-slate-300">{preset.label}</button><button onClick={() => removePreset(preset.id)} className="px-2 py-2 text-xs text-rose-300" aria-label={`حذف ${preset.label}`}>×</button></div>)}</div>}
      </div>
    </section>
  );
};

export default ProfessionalScreener;
