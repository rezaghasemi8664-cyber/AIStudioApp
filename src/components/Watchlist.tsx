import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addSymbolToWatchlist,
  createWatchlist,
  deleteWatchlist,
  getQuote,
  getWatchlists,
  removeSymbolsFromWatchlist,
  renameWatchlist,
  saveQuotes,
  validateSymbol,
  type Watchlist,
  type WatchlistQuote,
} from '../services/watchlistService';

type SortKey = 'symbol' | 'price' | 'change' | 'volume';

const fmt = (value: number | null | undefined, digits = 0) =>
  value == null || !Number.isFinite(value)
    ? '—'
    : new Intl.NumberFormat('fa-IR', { maximumFractionDigits: digits }).format(value);

const pct = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value) ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(2)}٪`;

const tone = (value: number | null | undefined) =>
  value == null ? 'text-slate-400' : value > 0 ? 'text-emerald-400' : value < 0 ? 'text-rose-400' : 'text-slate-400';

const Watchlist: React.FC = () => {
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [activeId, setActiveId] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>('change');
  const [sortDesc, setSortDesc] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  const active = watchlists.find((item) => item.id === activeId) || watchlists[0] || null;

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await getWatchlists();
      setWatchlists(data);
      setActiveId((current) => data.some((item) => item.id === current) ? current : data[0]?.id || '');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'خطا در دریافت دیده‌بان‌ها');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const refreshQuotes = useCallback(async () => {
    if (!active?.symbols.length) return;
    try {
      setRefreshing(true);
      setError('');
      const quotes: WatchlistQuote[] = [];
      for (const item of active.symbols) {
        try { quotes.push(await getQuote(item.symbol)); } catch { /* keep last known quote */ }
      }
      const updated = await saveQuotes(active.id, quotes);
      setWatchlists((items) => items.map((item) => item.id === updated.id ? updated : item));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'خطا در بروزرسانی قیمت‌ها');
    } finally {
      setRefreshing(false);
    }
  }, [active]);

  useEffect(() => {
    if (!active) return;
    void refreshQuotes();
    const timer = window.setInterval(() => void refreshQuotes(), 120_000);
    return () => window.clearInterval(timer);
  }, [activeId]);

  const rows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('fa-IR');
    return [...(active?.symbols || [])]
      .filter((item) => !query || `${item.symbol} ${item.name}`.toLocaleLowerCase('fa-IR').includes(query))
      .sort((a, b) => {
        const av = sortKey === 'symbol' ? a.symbol : sortKey === 'price' ? (a.quote?.lastPrice ?? Number.NEGATIVE_INFINITY) : sortKey === 'change' ? (a.quote?.lastChangePercent ?? Number.NEGATIVE_INFINITY) : (a.quote?.volume ?? Number.NEGATIVE_INFINITY);
        const bv = sortKey === 'symbol' ? b.symbol : sortKey === 'price' ? (b.quote?.lastPrice ?? Number.NEGATIVE_INFINITY) : sortKey === 'change' ? (b.quote?.lastChangePercent ?? Number.NEGATIVE_INFINITY) : (b.quote?.volume ?? Number.NEGATIVE_INFINITY);
        const comparison = typeof av === 'string' && typeof bv === 'string' ? av.localeCompare(bv, 'fa') : Number(av) - Number(bv);
        return sortDesc ? -comparison : comparison;
      });
  }, [active, search, sortKey, sortDesc]);

  const addSymbol = async () => {
    if (!active || !search.trim()) return;
    try {
      setAdding(true);
      setError('');
      const symbol = await validateSymbol(search.trim());
      if (!symbol) throw new Error('نماد موردنظر در بازار پیدا نشد.');
      const updated = await addSymbolToWatchlist(active.id, symbol.symbol, symbol.name);
      setWatchlists((items) => items.map((item) => item.id === updated.id ? updated : item));
      setSearch('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'خطا در افزودن نماد');
    } finally {
      setAdding(false);
    }
  };

  const createNew = async () => {
    const name = window.prompt('نام دیده‌بان جدید را وارد کنید:')?.trim();
    if (!name) return;
    try {
      const created = await createWatchlist(name);
      setWatchlists((items) => [...items, created]);
      setActiveId(created.id);
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'خطا در ایجاد دیده‌بان'); }
  };

  const renameActive = async () => {
    if (!active) return;
    const name = window.prompt('نام جدید دیده‌بان:', active.name)?.trim();
    if (!name || name === active.name) return;
    try {
      const updated = await renameWatchlist(active.id, name);
      setWatchlists((items) => items.map((item) => item.id === updated.id ? updated : item));
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'خطا در تغییر نام دیده‌بان'); }
  };

  const deleteActive = async () => {
    if (!active || !window.confirm(`دیده‌بان «${active.name}» حذف شود؟`)) return;
    try {
      await deleteWatchlist(active.id);
      const next = watchlists.filter((item) => item.id !== active.id);
      setWatchlists(next);
      setActiveId(next[0]?.id || '');
      setSelected([]);
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'خطا در حذف دیده‌بان'); }
  };

  const removeSelected = async () => {
    if (!active || !selected.length) return;
    try {
      const updated = await removeSymbolsFromWatchlist(active.id, selected);
      setWatchlists((items) => items.map((item) => item.id === updated.id ? updated : item));
      setSelected([]);
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'خطا در حذف نمادها'); }
  };

  const toggleSelected = (symbol: string) => setSelected((items) => items.includes(symbol) ? items.filter((item) => item !== symbol) : [...items, symbol]);

  return (
    <section dir="rtl" className="space-y-5">
      <header className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div><h1 className="text-xl font-black text-[var(--color-text-primary)]">دیده‌بان حرفه‌ای</h1><p className="mt-1 text-xs text-slate-500">مدیریت چند لیست شخصی و دریافت قیمت‌های واقعی بازار؛ بدون AI</p></div>
          <div className="flex flex-wrap gap-2"><button onClick={createNew} className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-bold text-white">دیده‌بان جدید</button><button onClick={() => void refreshQuotes()} disabled={refreshing || !active} className="rounded-xl border border-white/10 px-4 py-2 text-sm font-bold text-slate-200 disabled:opacity-50">{refreshing ? 'در حال بروزرسانی…' : 'بروزرسانی قیمت‌ها'}</button></div>
        </div>
      </header>

      {error && <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[240px_1fr]">
        <aside className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
          <div className="mb-2 text-xs font-bold text-slate-500">دیده‌بان‌ها</div>
          <div className="space-y-2">{watchlists.map((item) => <button key={item.id} onClick={() => { setActiveId(item.id); setSelected([]); }} className={`w-full rounded-xl px-3 py-3 text-right text-sm font-bold ${active?.id === item.id ? 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-400/30' : 'bg-white/[0.03] text-slate-400'}`}>{item.name}<span className="mr-2 text-xs opacity-60">{fmt(item.symbols.length)}</span></button>)}</div>
          {active && <div className="mt-4 flex gap-2"><button onClick={() => void renameActive()} className="flex-1 rounded-lg border border-white/10 px-2 py-2 text-xs text-slate-400">تغییر نام</button><button onClick={() => void deleteActive()} className="flex-1 rounded-lg border border-rose-500/20 px-2 py-2 text-xs text-rose-300">حذف</button></div>}
        </aside>

        <article className="overflow-hidden rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="border-b border-white/10 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><h2 className="font-black text-[var(--color-text-primary)]">{active?.name || 'دیده‌بان'}</h2><p className="text-xs text-slate-500">{fmt(active?.symbols.length || 0)} نماد · داده آخرین بروزرسانی در هر ردیف</p></div><div className="flex flex-wrap gap-2"><input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void addSymbol(); }} placeholder="نماد برای افزودن یا جستجو" className="w-56 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-200 outline-none" /><button onClick={() => void addSymbol()} disabled={adding || !active} className="rounded-xl bg-emerald-500/15 px-3 py-2 text-xs font-bold text-emerald-300 disabled:opacity-50">{adding ? 'در حال بررسی…' : '+ افزودن نماد'}</button></div></div>
            {selected.length > 0 && <div className="mt-3 flex items-center justify-between rounded-xl bg-rose-500/10 px-3 py-2"><span className="text-xs text-rose-300">{fmt(selected.length)} نماد انتخاب شده</span><button onClick={() => void removeSelected()} className="text-xs font-bold text-rose-300">حذف انتخاب‌شده‌ها</button></div>}
          </div>

          {loading ? <div className="p-10 text-center text-sm text-slate-500">در حال دریافت دیده‌بان…</div> : !active ? <div className="p-10 text-center text-sm text-slate-500">هنوز دیده‌بانی ایجاد نشده است.</div> : active.symbols.length === 0 ? <div className="p-10 text-center text-sm text-slate-500">این دیده‌بان خالی است. یک نماد واقعی بازار اضافه کنید.</div> : <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead><tr className="border-b border-white/10 text-xs text-slate-500"><th className="px-3 py-3 text-right">انتخاب</th><th className="px-3 py-3 text-right">نماد</th><th className="px-3 py-3 text-left">آخرین قیمت</th><th className="px-3 py-3 text-left">تغییر</th><th className="px-3 py-3 text-left">حجم</th><th className="px-3 py-3 text-left">آخرین بروزرسانی</th></tr></thead><tbody>{rows.map((item) => <tr key={item.symbol} className="border-b border-white/5 hover:bg-white/[0.02]"><td className="px-3 py-3"><input type="checkbox" checked={selected.includes(item.symbol)} onChange={() => toggleSelected(item.symbol)} /></td><td className="px-3 py-3"><div className="font-black text-slate-200">{item.symbol}</div><div className="text-xs text-slate-500">{item.name}</div></td><td className="px-3 py-3 text-left font-bold text-slate-200">{fmt(item.quote?.lastPrice)}</td><td className={`px-3 py-3 text-left font-bold ${tone(item.quote?.lastChangePercent)}`}>{pct(item.quote?.lastChangePercent)}</td><td className="px-3 py-3 text-left text-slate-300">{fmt(item.quote?.volume)}</td><td className="px-3 py-3 text-left text-xs text-slate-500">{item.quote?.updatedAt ? new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit' }).format(new Date(item.quote.updatedAt)) : '—'}</td></tr>)}</tbody></table></div>}
        </article>
      </div>

      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3"><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-bold text-slate-500">مرتب‌سازی:</span><select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} className="rounded-lg border border-white/10 bg-[var(--color-surface)] px-3 py-2 text-xs text-slate-300"><option value="change">درصد تغییر</option><option value="price">قیمت</option><option value="volume">حجم</option><option value="symbol">نماد</option></select><button onClick={() => setSortDesc((value) => !value)} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-400">{sortDesc ? 'نزولی ↓' : 'صعودی ↑'}</button></div></div>
    </section>
  );
};

export default Watchlist;
