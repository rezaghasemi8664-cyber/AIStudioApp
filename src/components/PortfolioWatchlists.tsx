import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PlusIcon, TrashIcon, XMarkIcon } from './Icons';
import { useNotification } from './NotificationSystem';
import * as watchlistService from '../services/watchlistService';
import type { StoredUser } from '../services/authService';

interface PortfolioWatchlistsProps { currentUser: StoredUser; isOnline: boolean; }

const formatNumber = (value: number | null | undefined) => value == null || !Number.isFinite(Number(value)) ? '—' : Number(value).toLocaleString('fa-IR');
const formatPercent = (value: number | null | undefined) => {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const n = Number(value);
  const localized = n.toLocaleString('fa-IR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n > 0 ? '+' : ''}${localized}٪`;
};
const percentClass = (value: number | null | undefined) => value == null || !Number.isFinite(Number(value)) ? 'text-gray-500 dark:text-gray-400' : Number(value) > 0 ? 'text-[var(--color-positive)]' : Number(value) < 0 ? 'text-[var(--color-negative)]' : 'text-gray-500 dark:text-gray-400';
const makeLocalId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const TEHRAN_TIME_ZONE = 'Asia/Tehran';
const QUOTE_REFRESH_MS = 120_000;
const DATA_STATUS_LABEL: Record<'LIVE' | 'CACHED' | 'UNAVAILABLE', string> = { LIVE: 'داده زنده', CACHED: 'داده ذخیره‌شده', UNAVAILABLE: 'داده در دسترس نیست' };
const CLOSED_CHECK_MS = 60_000;
const TRADING_WEEKDAYS = new Set(['Sat', 'Sun', 'Mon', 'Tue', 'Wed']);
const getTehranTimeParts = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TEHRAN_TIME_ZONE, weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const get = (type: string) => parts.find(part => part.type === type)?.value || '';
  return { weekday: get('weekday'), hour: Number(get('hour')), minute: Number(get('minute')), second: Number(get('second')) };
};
const isTehranTradingSession = (date = new Date()) => {
  const { weekday, hour, minute } = getTehranTimeParts(date);
  const minutes = hour * 60 + minute;
  return TRADING_WEEKDAYS.has(weekday) && minutes >= 9 * 60 && minutes <= 12 * 60 + 30;
};

const PortfolioWatchlists: React.FC<PortfolioWatchlistsProps> = ({ currentUser, isOnline }) => {
  const { addNotification } = useNotification();
  const [watchlists, setWatchlists] = useState<watchlistService.Watchlist[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [quotes, setQuotes] = useState<Record<string, watchlistService.WatchlistQuote>>({});
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([]);
  const [marketOpen, setMarketOpen] = useState(() => isTehranTradingSession());
  const [searchTerm, setSearchTerm] = useState('');
  const [changeFilter, setChangeFilter] = useState<'all' | 'positive' | 'negative' | 'neutral'>('all');
  const [sortBy, setSortBy] = useState<'default' | 'changeDesc' | 'changeAsc' | 'volumeDesc' | 'volumeAsc' | 'priceDesc' | 'priceAsc'>('default');

  const [showNewWatchlist, setShowNewWatchlist] = useState(false);
  const [newWatchlistName, setNewWatchlistName] = useState('');
  const [showManage, setShowManage] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState('');
  const [showAddSymbol, setShowAddSymbol] = useState(false);
  const [symbolInput, setSymbolInput] = useState('');
  const [validatedSymbol, setValidatedSymbol] = useState<watchlistService.WatchlistSymbol | null>(null);
  const [validatingSymbol, setValidatingSymbol] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const activeWatchlist = useMemo(() => watchlists.find(item => item.id === activeId) || watchlists[0] || null, [watchlists, activeId]);

  const dataStatus = useMemo<'LIVE' | 'CACHED' | 'UNAVAILABLE'>(() => {
    const rows = (activeWatchlist?.symbols || []).map(item => quotes[item.symbol]).filter(Boolean) as watchlistService.WatchlistQuote[];
    if (rows.some(item => item.dataStatus === 'LIVE')) return 'LIVE';
    if (rows.some(item => item.dataStatus === 'CACHED')) return 'CACHED';
    return 'UNAVAILABLE';
  }, [activeWatchlist, quotes]);

  const watchlistSummary = useMemo(() => {
    const rows = (activeWatchlist?.symbols || []).map(item => { const quote = quotes[item.symbol]; return { symbol: quote?.symbol || item.symbol, name: quote?.name || item.name, change: Number(quote?.lastChangePercent), volume: Number(quote?.volume), updatedAt: quote?.updatedAt ? new Date(quote.updatedAt).getTime() : NaN }; });
    const validRows = rows.filter(row => Number.isFinite(row.change));
    const averageChange = validRows.length ? validRows.reduce((sum, row) => sum + row.change, 0) / validRows.length : null;
    const positive = validRows.filter(row => row.change > 0).length;
    const negative = validRows.filter(row => row.change < 0).length;
    const neutral = validRows.filter(row => row.change === 0).length;
    const maxGain = validRows.length ? validRows.reduce((best, row) => row.change > best.change ? row : best) : null;
    const maxLoss = validRows.length ? validRows.reduce((worst, row) => row.change < worst.change ? row : worst) : null;
    const volumeRows = rows.filter(row => Number.isFinite(row.volume));
    const maxVolume = volumeRows.length ? volumeRows.reduce((best, row) => row.volume > best.volume ? row : best) : null;
    const updatedRows = rows.filter(row => Number.isFinite(row.updatedAt));
    const lastUpdated = updatedRows.length ? Math.max(...updatedRows.map(row => row.updatedAt)) : null;
    return { total: rows.length, quoted: validRows.length, positive, negative, neutral, averageChange, maxGain, maxLoss, maxVolume, lastUpdated };
  }, [activeWatchlist, quotes]);

  const filteredSymbols = useMemo(() => {
    if (!activeWatchlist) return [];
    const query = searchTerm.trim().toLocaleLowerCase('fa-IR');
    const rows = activeWatchlist.symbols.map((item, index) => ({ item, index, quote: quotes[item.symbol] }));
    const filtered = rows.filter(row => {
      const symbol = (row.quote?.symbol || row.item.symbol).toLocaleLowerCase('fa-IR');
      const name = (row.quote?.name || row.item.name).toLocaleLowerCase('fa-IR');
      const change = Number(row.quote?.lastChangePercent);
      const matchesSearch = !query || symbol.includes(query) || name.includes(query);
      const matchesChange = changeFilter === 'all' || (changeFilter === 'positive' && Number.isFinite(change) && change > 0) || (changeFilter === 'negative' && Number.isFinite(change) && change < 0) || (changeFilter === 'neutral' && Number.isFinite(change) && change === 0);
      return matchesSearch && matchesChange;
    });
    if (sortBy === 'default') return filtered;
    return [...filtered].sort((a, b) => {
      const av = sortBy.startsWith('change') ? Number(a.quote?.lastChangePercent) : sortBy.startsWith('volume') ? Number(a.quote?.volume) : Number(a.quote?.lastPrice);
      const bv = sortBy.startsWith('change') ? Number(b.quote?.lastChangePercent) : sortBy.startsWith('volume') ? Number(b.quote?.volume) : Number(b.quote?.lastPrice);
      const aValid = Number.isFinite(av); const bValid = Number.isFinite(bv);
      if (!aValid && !bValid) return a.index - b.index;
      if (!aValid) return 1;
      if (!bValid) return -1;
      const descending = sortBy.endsWith('Desc');
      return descending ? bv - av : av - bv;
    });
  }, [activeWatchlist, quotes, searchTerm, changeFilter, sortBy]);

  useEffect(() => { const updateMarketState = () => setMarketOpen(isTehranTradingSession()); const timer = window.setInterval(updateMarketState, CLOSED_CHECK_MS); updateMarketState(); return () => window.clearInterval(timer); }, []);
  useEffect(() => { setSelectedSymbols([]); setEditMode(false); setSearchTerm(''); setChangeFilter('all'); setSortBy('default'); }, [activeId]);

  const loadWatchlists = useCallback(async () => {
    setLoading(true);
    try {
      const items = await watchlistService.getWatchlists(); setWatchlists(items);
      const cached: Record<string, watchlistService.WatchlistQuote> = {};
      items.forEach(list => list.symbols.forEach(item => { if (item.quote) cached[item.symbol] = { ...item.quote, symbol: item.symbol, name: item.name }; }));
      setQuotes(cached); setActiveId(previous => items.some(item => item.id === previous) ? previous : items[0]?.id || null);
    } catch (error: any) { addNotification(error?.response?.data?.message || 'دریافت دیده‌بان‌ها ناموفق بود.', 'error'); } finally { setLoading(false); }
  }, [addNotification]);
  useEffect(() => { loadWatchlists(); }, [loadWatchlists]);

  const refreshQuotes = useCallback(async () => {
    if (!activeWatchlist || activeWatchlist.symbols.length === 0 || !isOnline) return;
    const tradingSession = isTehranTradingSession();
    const symbolsToFetch = tradingSession ? activeWatchlist.symbols : activeWatchlist.symbols.filter(item => !quotes[item.symbol]);
    if (!symbolsToFetch.length) return;
    setQuoteLoading(true);
    try {
      const results = await Promise.allSettled(symbolsToFetch.map(item => watchlistService.getQuote(item.symbol)));
      const fresh: watchlistService.WatchlistQuote[] = []; results.forEach(result => { if (result.status === 'fulfilled') fresh.push(result.value); });
      if (fresh.length) { setQuotes(previous => { const next = { ...previous }; fresh.forEach(quote => { next[quote.symbol] = quote; }); return next; }); const updated = await watchlistService.saveQuotes(activeWatchlist.id, fresh); setWatchlists(previous => previous.map(item => item.id === updated.id ? updated : item)); }
    } finally { setQuoteLoading(false); }
  }, [activeWatchlist, isOnline, quotes]);
  useEffect(() => { let timer: number | undefined; let disposed = false; const schedule = () => { if (disposed) return; if (isTehranTradingSession()) { void refreshQuotes(); timer = window.setTimeout(schedule, QUOTE_REFRESH_MS); } else timer = window.setTimeout(schedule, CLOSED_CHECK_MS); }; schedule(); return () => { disposed = true; if (timer !== undefined) window.clearTimeout(timer); }; }, [refreshQuotes]);

  const createWatchlist = async (e: React.FormEvent) => { e.preventDefault(); const name = newWatchlistName.trim(); if (!name) return addNotification('نام دیده‌بان را وارد کنید.', 'error'); if (!isOnline) return addNotification('برای ایجاد دیده‌بان باید آنلاین باشید.', 'error'); setSaving(true); try { const created = await watchlistService.createWatchlist(name); setWatchlists(previous => [...previous, created]); setActiveId(created.id); setNewWatchlistName(''); setShowNewWatchlist(false); addNotification(`دیده‌بان «${created.name}» ایجاد شد.`, 'info'); } catch (error: any) { addNotification(error?.response?.data?.message || 'ایجاد دیده‌بان ناموفق بود.', 'error'); } finally { setSaving(false); } };
  const saveRename = async (id: string) => { const name = renameName.trim(); if (!name) return addNotification('نام جدید دیده‌بان را وارد کنید.', 'error'); if (!isOnline) return addNotification('برای ویرایش دیده‌بان باید آنلاین باشید.', 'error'); setSaving(true); try { const updated = await watchlistService.renameWatchlist(id, name); setWatchlists(previous => previous.map(item => item.id === id ? updated : item)); setRenameId(null); setRenameName(''); addNotification('نام دیده‌بان با موفقیت ویرایش شد.', 'info'); } catch (error: any) { addNotification(error?.response?.data?.message || 'ویرایش نام دیده‌بان ناموفق بود.', 'error'); } finally { setSaving(false); } };
  const deleteWatchlist = async (id: string) => { const target = watchlists.find(item => item.id === id); if (!target || !window.confirm(`آیا از حذف کامل دیده‌بان «${target.name}» اطمینان دارید؟`)) return; if (!isOnline) return addNotification('برای حذف دیده‌بان باید آنلاین باشید.', 'error'); setSaving(true); try { await watchlistService.deleteWatchlist(id); const remaining = watchlists.filter(item => item.id !== id); setWatchlists(remaining); setActiveId(previous => previous === id ? remaining[0]?.id || null : previous); setShowManage(false); addNotification('دیده‌بان حذف شد.', 'info'); } catch (error: any) { addNotification(error?.response?.data?.message || 'حذف دیده‌بان ناموفق بود.', 'error'); } finally { setSaving(false); } };
  const validateSymbol = async () => { const symbol = symbolInput.trim().toUpperCase(); if (!symbol) return addNotification('نام نماد را وارد کنید.', 'error'); if (!isOnline) return addNotification('برای بررسی نماد باید آنلاین باشید.', 'error'); setValidatingSymbol(true); setValidatedSymbol(null); try { const result = await watchlistService.validateSymbol(symbol); if (!result) return addNotification(`نماد «${symbol}» در بازار پیدا نشد.`, 'error'); if (activeWatchlist?.symbols.some(item => item.symbol === result.symbol)) return addNotification(`نماد «${result.symbol}» قبلاً در این دیده‌بان وجود دارد.`, 'error'); setValidatedSymbol(result); addNotification(`بررسی نماد «${result.symbol}» با موفقیت انجام شد. نماد معتبر است و می‌توانید آن را در دیده‌بان ذخیره کنید.`, 'info'); } catch (error: any) { addNotification(error?.response?.data?.message || `بررسی نماد «${symbol}» ناموفق بود.`, 'error'); } finally { setValidatingSymbol(false); } };
  const saveSymbol = async () => { if (!activeWatchlist || !validatedSymbol) return; if (!isOnline) return addNotification('برای ذخیره نماد باید آنلاین باشید.', 'error'); setSaving(true); try { const updated = await watchlistService.addSymbolToWatchlist(activeWatchlist.id, validatedSymbol.symbol, validatedSymbol.name); let finalWatchlist = updated; try { const latestQuote = await watchlistService.getQuote(validatedSymbol.symbol); finalWatchlist = await watchlistService.saveQuotes(updated.id, [latestQuote]); setQuotes(previous => ({ ...previous, [latestQuote.symbol]: latestQuote })); } catch (quoteError) { console.warn('[WATCHLIST] initial quote fetch failed:', quoteError); } setWatchlists(previous => previous.map(item => item.id === finalWatchlist.id ? finalWatchlist : item)); setSymbolInput(''); setValidatedSymbol(null); setShowAddSymbol(false); addNotification(`نماد «${updated.symbols[updated.symbols.length - 1]?.symbol || validatedSymbol.symbol}» در دیده‌بان ذخیره شد.`, 'info'); } catch (error: any) { addNotification(error?.response?.data?.message || 'ذخیره نماد در دیده‌بان ناموفق بود.', 'error'); } finally { setSaving(false); } };
  const removeSelected = async () => { if (!activeWatchlist || selectedSymbols.length === 0) return; if (!window.confirm(`آیا از حذف ${selectedSymbols.length.toLocaleString('fa-IR')} نماد انتخاب‌شده اطمینان دارید؟`)) return; if (!isOnline) return addNotification('برای حذف نماد باید آنلاین باشید.', 'error'); setSaving(true); try { const updated = await watchlistService.removeSymbolsFromWatchlist(activeWatchlist.id, selectedSymbols); setWatchlists(previous => previous.map(item => item.id === updated.id ? updated : item)); setSelectedSymbols([]); setEditMode(false); addNotification('نمادهای انتخاب‌شده از دیده‌بان حذف شدند.', 'info'); } catch (error: any) { addNotification(error?.response?.data?.message || 'حذف نمادها ناموفق بود.', 'error'); } finally { setSaving(false); } };
  const toggleSymbol = (symbol: string) => setSelectedSymbols(previous => previous.includes(symbol) ? previous.filter(item => item !== symbol) : [...previous, symbol]);

  if (loading) return <div className="py-12 text-center text-gray-500">در حال دریافت دیده‌بان‌های شما...</div>;

  return <div dir="rtl" className="page-shell portfolio-watchlists-page space-y-5">
    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3"><div><h2 className="text-2xl font-bold text-cyan-600 dark:text-cyan-400">دیده‌بان</h2><p className="text-sm text-gray-500 dark:text-gray-400 mt-1">دیده‌بان‌ها و نمادهای شما فقط برای حساب کاربری خودتان ذخیره و نمایش داده می‌شوند.</p></div><div className="flex flex-wrap gap-2"><button onClick={() => setShowNewWatchlist(true)} disabled={!isOnline} className="px-4 py-2 rounded-lg font-bold inline-flex items-center gap-2 disabled:opacity-50" style={{ backgroundColor: 'var(--btn-primary-bg)', color: 'var(--btn-primary-color)' }}><PlusIcon /> ایجاد دیده‌بان جدید</button>{watchlists.length > 0 && <button onClick={() => setShowManage(true)} className="px-4 py-2 rounded-lg border border-[var(--color-border)] text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-800">ویرایش دیده‌بان‌ها</button>}</div></div>
    {watchlists.length === 0 ? <div className="rounded-2xl border border-dashed border-[var(--color-border)] p-10 text-center bg-[var(--color-surface)]"><div className="text-lg font-bold mb-2">هنوز دیده‌بانی ایجاد نشده است</div><p className="text-sm text-gray-500 mb-5">برای ساخت اولین دیده‌بان روی «ایجاد دیده‌بان جدید» بزنید.</p><button onClick={() => setShowNewWatchlist(true)} disabled={!isOnline} className="px-5 py-2.5 rounded-lg bg-cyan-600 text-white font-bold disabled:opacity-50">ایجاد اولین دیده‌بان</button></div> : <>
      <div className="flex items-center gap-2 overflow-x-auto border-b border-[var(--color-border)] pb-1">{watchlists.map(item => <button key={item.id} onClick={() => setActiveId(item.id)} className={`shrink-0 px-4 py-2.5 rounded-t-lg font-semibold transition ${activeWatchlist?.id === item.id ? 'bg-cyan-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>{item.name}<span className="mr-2 text-xs opacity-80">({item.symbols.length.toLocaleString('fa-IR')})</span></button>)}</div>
      {activeWatchlist && <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm overflow-hidden">
        <div className="p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 border-b border-[var(--color-border)]"><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-xl font-bold">{activeWatchlist.name}</h3><span className={`watchlist-data-badge watchlist-data-${dataStatus}`}>{DATA_STATUS_LABEL[dataStatus]}</span></div><p className="text-xs text-gray-500 mt-1">اطلاعات بازار در زمان باز بودن بازار، هر ۲ دقیقه از منبع واقعی دریافت می‌شود؛ خارج از بازار فقط داده ذخیره‌شده نمایش داده می‌شود.</p></div><div className="flex flex-wrap gap-2"><span className={`px-3 py-2 rounded-lg text-sm font-bold ${marketOpen ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'}`}>{marketOpen ? 'بازار باز' : 'بازار بسته'}</span><button onClick={() => { setShowAddSymbol(true); setValidatedSymbol(null); }} disabled={!isOnline} className="px-4 py-2 rounded-lg bg-cyan-600 text-white font-bold inline-flex items-center gap-2 disabled:opacity-50"><PlusIcon /> افزودن نماد به دیده‌بان</button>{activeWatchlist.symbols.length > 0 && <button onClick={() => { setEditMode(value => !value); setSelectedSymbols([]); }} className={`px-4 py-2 rounded-lg border font-semibold ${editMode ? 'border-cyan-500 text-cyan-600 bg-cyan-50 dark:bg-cyan-900/20' : 'border-[var(--color-border)]'}`}>ویرایش نمادها</button>}{editMode && <button onClick={removeSelected} disabled={saving || selectedSymbols.length === 0} className="px-4 py-2 rounded-lg bg-red-600 text-white font-bold disabled:opacity-40 inline-flex items-center gap-2"><TrashIcon /> حذف انتخاب‌شده‌ها</button>}</div></div>
        <div className="p-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 border-b border-[var(--color-border)]"><div className="rounded-xl border border-[var(--color-border)] p-3"><div className="text-xs text-gray-500">کل نمادها</div><div className="text-xl font-bold mt-1">{watchlistSummary.total.toLocaleString('fa-IR')}</div></div><div className="rounded-xl border border-[var(--color-border)] p-3"><div className="text-xs text-gray-500">داده معتبر</div><div className="text-xl font-bold mt-1">{watchlistSummary.quoted.toLocaleString('fa-IR')}</div></div><div className="rounded-xl border border-[var(--color-border)] p-3"><div className="text-xs text-gray-500">مثبت / منفی</div><div className="text-sm font-bold mt-2"><span className="text-[var(--color-positive)]">{watchlistSummary.positive.toLocaleString('fa-IR')}</span> / <span className="text-[var(--color-negative)]">{watchlistSummary.negative.toLocaleString('fa-IR')}</span></div></div><div className="rounded-xl border border-[var(--color-border)] p-3"><div className="text-xs text-gray-500">خنثی</div><div className="text-xl font-bold mt-1">{watchlistSummary.neutral.toLocaleString('fa-IR')}</div></div><div className="rounded-xl border border-[var(--color-border)] p-3"><div className="text-xs text-gray-500">میانگین تغییر</div><div className={`text-xl font-bold mt-1 ${percentClass(watchlistSummary.averageChange)}`}>{formatPercent(watchlistSummary.averageChange)}</div></div><div className="rounded-xl border border-[var(--color-border)] p-3"><div className="text-xs text-gray-500">بیشترین رشد</div><div className={`text-sm font-bold mt-2 ${percentClass(watchlistSummary.maxGain?.change)}`}>{watchlistSummary.maxGain?.symbol || '—'} {formatPercent(watchlistSummary.maxGain?.change)}</div></div><div className="rounded-xl border border-[var(--color-border)] p-3"><div className="text-xs text-gray-500">بیشترین افت</div><div className={`text-sm font-bold mt-2 ${percentClass(watchlistSummary.maxLoss?.change)}`}>{watchlistSummary.maxLoss?.symbol || '—'} {formatPercent(watchlistSummary.maxLoss?.change)}</div></div></div>
        <div className="px-4 py-3 border-b border-[var(--color-border)] bg-gray-50/70 dark:bg-gray-800/30 flex flex-col lg:flex-row gap-3"><input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="جستجوی نماد یا نام شرکت…" className="flex-1 min-w-0 border border-[var(--color-border)] rounded-lg px-3 py-2 bg-transparent text-sm"/><select value={changeFilter} onChange={e => setChangeFilter(e.target.value as typeof changeFilter)} className="border border-[var(--color-border)] rounded-lg px-3 py-2 bg-[var(--color-surface)] text-sm"><option value="all">همه نمادها</option><option value="positive">فقط مثبت‌ها</option><option value="negative">فقط منفی‌ها</option><option value="neutral">فقط خنثی‌ها</option></select><select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)} className="border border-[var(--color-border)] rounded-lg px-3 py-2 bg-[var(--color-surface)] text-sm"><option value="default">ترتیب اصلی</option><option value="changeDesc">بیشترین رشد</option><option value="changeAsc">بیشترین افت</option><option value="volumeDesc">بیشترین حجم</option><option value="volumeAsc">کمترین حجم</option><option value="priceDesc">بیشترین قیمت</option><option value="priceAsc">کمترین قیمت</option></select></div>
        {activeWatchlist.symbols.length === 0 ? <div className="p-10 text-center text-gray-500">این دیده‌بان هنوز نمادی ندارد.</div> : filteredSymbols.length === 0 ? <div className="p-10 text-center text-gray-500">با فیلترهای فعلی نمادی پیدا نشد.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm text-right"><thead className="bg-gray-50 dark:bg-gray-800/70 border-b border-[var(--color-border)]"><tr>{editMode && <th className="px-3 py-3 w-12 text-center">انتخاب</th>}<th className="px-4 py-3 font-bold">ردیف</th><th className="px-4 py-3 font-bold">نام نماد</th><th className="px-4 py-3 font-bold">حجم معامله</th><th className="px-4 py-3 font-bold">قیمت لحظه‌ای</th><th className="px-4 py-3 font-bold">درصد تغییر</th><th className="px-4 py-3 font-bold">قیمت پایانی</th><th className="px-4 py-3 font-bold">درصد تغییر</th></tr></thead><tbody className="divide-y divide-[var(--color-border)]">{filteredSymbols.map((row, displayIndex) => { const item = row.item; const quote = row.quote; return <tr key={item.symbol} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">{editMode && <td className="px-3 py-3 text-center"><input type="checkbox" checked={selectedSymbols.includes(item.symbol)} onChange={() => toggleSymbol(item.symbol)} className="h-4 w-4 accent-cyan-600"/></td>}<td className="px-4 py-3 text-gray-500">{(displayIndex + 1).toLocaleString('fa-IR')}</td><td className="px-4 py-3"><div className="font-bold text-cyan-600 dark:text-cyan-400">{quote?.symbol || item.symbol}</div><div className="text-xs text-gray-500 mt-0.5">{quote?.name || item.name}</div></td><td className="px-4 py-3 font-mono">{formatNumber(quote?.volume)}</td><td className="px-4 py-3 font-mono font-semibold">{formatNumber(quote?.lastPrice)}</td><td className={`px-4 py-3 font-mono font-bold ${percentClass(quote?.lastChangePercent)}`}>{formatPercent(quote?.lastChangePercent)}</td><td className="px-4 py-3 font-mono font-semibold">{formatNumber(quote?.closePrice)}</td><td className={`px-4 py-3 font-mono font-bold ${percentClass(quote?.closeChangePercent)}`}>{formatPercent(quote?.closeChangePercent)}</td></tr>;})}</tbody></table></div>}
        <div className="px-4 py-3 text-xs text-gray-500 border-t border-[var(--color-border)] flex items-center justify-between gap-3"><span>{filteredSymbols.length.toLocaleString('fa-IR')} از {activeWatchlist.symbols.length.toLocaleString('fa-IR')} نماد نمایش داده می‌شود</span><span>{watchlistSummary.maxVolume ? `بیشترین حجم: ${watchlistSummary.maxVolume.symbol} (${formatNumber(watchlistSummary.maxVolume.volume)})` : ''} {watchlistSummary.lastUpdated ? ` | آخرین داده: ${new Date(watchlistSummary.lastUpdated).toLocaleTimeString('fa-IR')}` : ''} {quoteLoading ? ' | در حال دریافت آخرین اطلاعات بازار…' : ''} {dataStatus === 'UNAVAILABLE' && activeWatchlist.symbols.length > 0 ? ' | داده واقعی برای این دیده‌بان در دسترس نیست؛ مقدار ساختگی نمایش داده نمی‌شود.' : ''}</span></div>
      </div>}
    </>}
    {showNewWatchlist && <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowNewWatchlist(false)}><form onSubmit={createWatchlist} onClick={e => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-800 shadow-2xl p-6 space-y-4"><div className="flex items-center justify-between"><h3 className="text-lg font-bold">ایجاد دیده‌بان جدید</h3><button type="button" onClick={() => setShowNewWatchlist(false)}><XMarkIcon className="w-5 h-5"/></button></div><input autoFocus value={newWatchlistName} onChange={e => setNewWatchlistName(e.target.value)} placeholder="مثلاً دیده‌بان بانکی" className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 bg-transparent" maxLength={80}/><button type="submit" disabled={saving || !isOnline} className="w-full py-2.5 rounded-lg bg-cyan-600 text-white font-bold disabled:opacity-50">{saving ? 'در حال ذخیره…' : 'ذخیره دیده‌بان'}</button></form></div>}
    {showAddSymbol && activeWatchlist && <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowAddSymbol(false)}><div onClick={e => e.stopPropagation()} className="w-full max-w-lg rounded-2xl bg-white dark:bg-gray-800 shadow-2xl p-6 space-y-4"><div className="flex items-center justify-between"><div><h3 className="text-lg font-bold">افزودن نماد به دیده‌بان</h3><p className="text-xs text-gray-500 mt-1">دیده‌بان: {activeWatchlist.name}</p></div><button onClick={() => setShowAddSymbol(false)}><XMarkIcon className="w-5 h-5"/></button></div><div className="flex gap-2"><input autoFocus value={symbolInput} onChange={e => { setSymbolInput(e.target.value.toUpperCase()); setValidatedSymbol(null); }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); validateSymbol(); } }} placeholder="نام نماد، مثلاً فولاد" className="flex-1 border border-[var(--color-border)] rounded-lg px-3 py-2 bg-transparent"/><button onClick={validateSymbol} disabled={validatingSymbol || !isOnline} className="px-4 py-2 rounded-lg bg-cyan-600 text-white font-bold disabled:opacity-50">{validatingSymbol ? 'در حال بررسی…' : 'بررسی نماد'}</button></div>{validatedSymbol && <div className="rounded-xl border border-green-300 bg-green-50 dark:bg-green-900/20 p-4"><div className="text-sm text-green-700 dark:text-green-300 font-semibold">نماد معتبر و موجود در بازار</div><div className="mt-2 flex items-center justify-between"><span className="font-bold text-cyan-600">{validatedSymbol.symbol}</span><span className="text-sm">{validatedSymbol.name}</span></div></div>}<button onClick={saveSymbol} disabled={saving || !validatedSymbol || !isOnline} className="w-full py-2.5 rounded-lg bg-cyan-600 text-white font-bold disabled:opacity-40">{saving ? 'در حال ذخیره…' : 'ذخیره در دیده‌بان'}</button></div></div>}
    {showManage && <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowManage(false)}><div onClick={e => e.stopPropagation()} className="w-full max-w-xl rounded-2xl bg-white dark:bg-gray-800 shadow-2xl p-6 space-y-4"><div className="flex items-center justify-between"><h3 className="text-lg font-bold">ویرایش دیده‌بان‌ها</h3><button onClick={() => setShowManage(false)}><XMarkIcon className="w-5 h-5"/></button></div><div className="space-y-2 max-h-[60vh] overflow-y-auto">{watchlists.map(item => <div key={item.id} className="p-3 rounded-xl border border-[var(--color-border)] flex items-center gap-2">{renameId === item.id ? <><input autoFocus value={renameName} onChange={e => setRenameName(e.target.value)} className="flex-1 border border-[var(--color-border)] rounded-lg px-3 py-2 bg-transparent"/><button onClick={() => saveRename(item.id)} disabled={saving} className="px-3 py-2 rounded-lg bg-cyan-600 text-white text-sm font-bold">ذخیره</button><button onClick={() => setRenameId(null)} className="px-3 py-2 rounded-lg border text-sm">انصراف</button></> : <><button onClick={() => { setActiveId(item.id); setShowManage(false); }} className="flex-1 text-right font-bold hover:text-cyan-600">{item.name}<span className="mr-2 text-xs text-gray-500">{item.symbols.length.toLocaleString('fa-IR')} نماد</span></button><button onClick={() => { setRenameId(item.id); setRenameName(item.name); }} className="px-3 py-2 rounded-lg border text-sm font-semibold">ویرایش نام</button><button onClick={() => deleteWatchlist(item.id)} disabled={saving} className="p-2 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"><TrashIcon/></button></>}</div>)}</div></div></div>}
  </div>;
};

export default PortfolioWatchlists;
