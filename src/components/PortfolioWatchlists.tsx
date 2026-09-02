import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PlusIcon, TrashIcon, XMarkIcon } from './Icons';
import { useNotification } from './NotificationSystem';
import * as watchlistService from '../services/watchlistService';
import type { StoredUser } from '../services/authService';

interface PortfolioWatchlistsProps {
  currentUser: StoredUser;
  isOnline: boolean;
}

const formatNumber = (value: number | null | undefined) =>
  value == null || !Number.isFinite(Number(value)) ? '—' : Number(value).toLocaleString('fa-IR');

const formatPercent = (value: number | null | undefined) => {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const n = Number(value);
  return `${n > 0 ? '+' : ''}${n.toFixed(2)}٪`;
};

const percentClass = (value: number | null | undefined) =>
  value == null || !Number.isFinite(Number(value))
    ? 'text-gray-500 dark:text-gray-400'
    : Number(value) > 0
      ? 'text-[var(--color-positive)]'
      : Number(value) < 0
        ? 'text-[var(--color-negative)]'
        : 'text-gray-500 dark:text-gray-400';

const makeLocalId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// برنامه معاملات بورس تهران: شنبه تا چهارشنبه، ۰۹:۰۰ تا ۱۲:۳۰.
// زمان با timezone صریح تهران محاسبه می‌شود تا timezone دستگاه کاربر اثری نداشته باشد.
const TEHRAN_TIME_ZONE = 'Asia/Tehran';
const QUOTE_REFRESH_MS = 120_000;
const CLOSED_CHECK_MS = 60_000;
const TRADING_WEEKDAYS = new Set(['Sat', 'Sun', 'Mon', 'Tue', 'Wed']);

const getTehranTimeParts = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TEHRAN_TIME_ZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const get = (type: string) => parts.find(part => part.type === type)?.value || '';
  return {
    weekday: get('weekday'),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    second: Number(get('second')),
  };
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

  const activeWatchlist = useMemo(
    () => watchlists.find(item => item.id === activeId) || watchlists[0] || null,
    [watchlists, activeId],
  );

  const loadWatchlists = useCallback(async () => {
    setLoading(true);
    try {
      const items = await watchlistService.getWatchlists();
      setWatchlists(items);
      setActiveId(previous => items.some(item => item.id === previous) ? previous : items[0]?.id || null);
    } catch (error: any) {
      addNotification(error?.response?.data?.message || 'دریافت دیده‌بان‌ها ناموفق بود.', 'error');
    } finally {
      setLoading(false);
    }
  }, [addNotification]);

  useEffect(() => { loadWatchlists(); }, [loadWatchlists]);

  const refreshQuotes = useCallback(async () => {
    // خارج از جلسه معاملات هیچ درخواست قیمت ارسال نمی‌شود.
    if (!isTehranTradingSession() || !activeWatchlist || activeWatchlist.symbols.length === 0 || !isOnline) {
      return;
    }

    setQuoteLoading(true);
    try {
      const results = await Promise.allSettled(activeWatchlist.symbols.map(item => watchlistService.getQuote(item.symbol)));
      const next: Record<string, watchlistService.WatchlistQuote> = {};
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') next[activeWatchlist.symbols[index].symbol] = result.value;
      });
      setQuotes(next);
    } finally {
      setQuoteLoading(false);
    }
  }, [activeWatchlist, isOnline]);

  useEffect(() => {
    let timer: number | undefined;
    let disposed = false;

    const schedule = () => {
      if (disposed) return;

      const marketOpen = isTehranTradingSession();
      if (marketOpen) {
        void refreshQuotes();
        timer = window.setTimeout(schedule, QUOTE_REFRESH_MS);
      } else {
        // در روزها/ساعات تعطیل فقط وضعیت زمان بررسی می‌شود؛ هیچ API بازار فراخوانی نمی‌شود.
        // این بررسی کوتاه کمک می‌کند شروع جلسه بعدی بدون refresh صفحه تشخیص داده شود.
        timer = window.setTimeout(schedule, CLOSED_CHECK_MS);
      }
    };

    schedule();
    return () => {
      disposed = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [refreshQuotes]);

  useEffect(() => {
    setSelectedSymbols([]);
    setEditMode(false);
  }, [activeId]);

  const createWatchlist = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newWatchlistName.trim();
    if (!name) return addNotification('نام دیده‌بان را وارد کنید.', 'error');
    if (!isOnline) return addNotification('برای ایجاد دیده‌بان باید آنلاین باشید.', 'error');
    setSaving(true);
    try {
      const created = await watchlistService.createWatchlist(name);
      setWatchlists(previous => [...previous, created]);
      setActiveId(created.id);
      setNewWatchlistName('');
      setShowNewWatchlist(false);
      addNotification(`دیده‌بان «${created.name}» ایجاد شد.`, 'info');
    } catch (error: any) {
      addNotification(error?.response?.data?.message || 'ایجاد دیده‌بان ناموفق بود.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const saveRename = async (id: string) => {
    const name = renameName.trim();
    if (!name) return addNotification('نام جدید دیده‌بان را وارد کنید.', 'error');
    if (!isOnline) return addNotification('برای ویرایش دیده‌بان باید آنلاین باشید.', 'error');
    setSaving(true);
    try {
      const updated = await watchlistService.renameWatchlist(id, name);
      setWatchlists(previous => previous.map(item => item.id === id ? updated : item));
      setRenameId(null);
      setRenameName('');
      addNotification('نام دیده‌بان با موفقیت ویرایش شد.', 'info');
    } catch (error: any) {
      addNotification(error?.response?.data?.message || 'ویرایش نام دیده‌بان ناموفق بود.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const deleteWatchlist = async (id: string) => {
    const target = watchlists.find(item => item.id === id);
    if (!target || !window.confirm(`آیا از حذف کامل دیده‌بان «${target.name}» اطمینان دارید؟`)) return;
    if (!isOnline) return addNotification('برای حذف دیده‌بان باید آنلاین باشید.', 'error');
    setSaving(true);
    try {
      await watchlistService.deleteWatchlist(id);
      const remaining = watchlists.filter(item => item.id !== id);
      setWatchlists(remaining);
      setActiveId(previous => previous === id ? remaining[0]?.id || null : previous);
      setShowManage(false);
      addNotification('دیده‌بان حذف شد.', 'info');
    } catch (error: any) {
      addNotification(error?.response?.data?.message || 'حذف دیده‌بان ناموفق بود.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const validateSymbol = async () => {
    const symbol = symbolInput.trim().toUpperCase();
    if (!symbol) return addNotification('نام نماد را وارد کنید.', 'error');
    if (!isOnline) return addNotification('برای بررسی نماد باید آنلاین باشید.', 'error');
    setValidatingSymbol(true);
    setValidatedSymbol(null);
    try {
      const result = await watchlistService.validateSymbol(symbol);
      if (!result) {
        addNotification(`نماد «${symbol}» در بازار پیدا نشد.`, 'error');
        return;
      }
      if (activeWatchlist?.symbols.some(item => item.symbol === result.symbol)) {
        addNotification(`نماد «${result.symbol}» قبلاً در این دیده‌بان وجود دارد.`, 'error');
        return;
      }
      setValidatedSymbol(result);
      addNotification(`نماد «${result.symbol}» با بازار مطابقت دارد.`, 'info');
    } catch (error: any) {
      addNotification(error?.response?.data?.message || `بررسی نماد «${symbol}» ناموفق بود.`, 'error');
    } finally {
      setValidatingSymbol(false);
    }
  };

  const saveSymbol = async () => {
    if (!activeWatchlist || !validatedSymbol) return;
    if (!isOnline) return addNotification('برای ذخیره نماد باید آنلاین باشید.', 'error');
    setSaving(true);
    try {
      const updated = await watchlistService.addSymbolToWatchlist(activeWatchlist.id, validatedSymbol.symbol, validatedSymbol.name);
      setWatchlists(previous => previous.map(item => item.id === updated.id ? updated : item));
      setSymbolInput('');
      setValidatedSymbol(null);
      setShowAddSymbol(false);
      addNotification(`نماد «${updated.symbols[updated.symbols.length - 1]?.symbol || validatedSymbol.symbol}» در دیده‌بان ذخیره شد.`, 'info');
    } catch (error: any) {
      addNotification(error?.response?.data?.message || 'ذخیره نماد در دیده‌بان ناموفق بود.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const removeSelected = async () => {
    if (!activeWatchlist || selectedSymbols.length === 0) return;
    if (!window.confirm(`آیا از حذف ${selectedSymbols.length.toLocaleString('fa-IR')} نماد انتخاب‌شده اطمینان دارید؟`)) return;
    if (!isOnline) return addNotification('برای حذف نماد باید آنلاین باشید.', 'error');
    setSaving(true);
    try {
      const updated = await watchlistService.removeSymbolsFromWatchlist(activeWatchlist.id, selectedSymbols);
      setWatchlists(previous => previous.map(item => item.id === updated.id ? updated : item));
      setSelectedSymbols([]);
      setEditMode(false);
      addNotification('نمادهای انتخاب‌شده از دیده‌بان حذف شدند.', 'info');
    } catch (error: any) {
      addNotification(error?.response?.data?.message || 'حذف نمادها ناموفق بود.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleSymbol = (symbol: string) => {
    setSelectedSymbols(previous => previous.includes(symbol) ? previous.filter(item => item !== symbol) : [...previous, symbol]);
  };

  if (loading) return <div className="py-12 text-center text-gray-500">در حال دریافت دیده‌بان‌های شما...</div>;

  return (
    <div dir="rtl" className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-cyan-600 dark:text-cyan-400">دیده‌بان</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">دیده‌بان‌ها و نمادهای شما فقط برای حساب کاربری خودتان ذخیره و نمایش داده می‌شوند.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowNewWatchlist(true)} disabled={!isOnline} className="px-4 py-2 rounded-lg font-bold inline-flex items-center gap-2 disabled:opacity-50" style={{ backgroundColor: 'var(--btn-primary-bg)', color: 'var(--btn-primary-color)' }}><PlusIcon /> ایجاد دیده‌بان جدید</button>
          {watchlists.length > 0 && <button onClick={() => setShowManage(true)} className="px-4 py-2 rounded-lg border border-[var(--color-border)] text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-800">ویرایش دیده‌بان‌ها</button>}
        </div>
      </div>

      {watchlists.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] p-10 text-center bg-[var(--color-surface)]">
          <div className="text-lg font-bold mb-2">هنوز دیده‌بانی ایجاد نشده است</div>
          <p className="text-sm text-gray-500 mb-5">برای ساخت اولین دیده‌بان روی «ایجاد دیده‌بان جدید» بزنید.</p>
          <button onClick={() => setShowNewWatchlist(true)} disabled={!isOnline} className="px-5 py-2.5 rounded-lg bg-cyan-600 text-white font-bold disabled:opacity-50">ایجاد اولین دیده‌بان</button>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 overflow-x-auto border-b border-[var(--color-border)] pb-1">
            {watchlists.map(item => (
              <button key={item.id} onClick={() => setActiveId(item.id)} className={`shrink-0 px-4 py-2.5 rounded-t-lg font-semibold transition ${activeWatchlist?.id === item.id ? 'bg-cyan-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
                {item.name}<span className="mr-2 text-xs opacity-80">({item.symbols.length.toLocaleString('fa-IR')})</span>
              </button>
            ))}
          </div>

          {activeWatchlist && (
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm overflow-hidden">
              <div className="p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 border-b border-[var(--color-border)]">
                <div>
                  <h3 className="text-xl font-bold">{activeWatchlist.name}</h3>
                  <p className="text-xs text-gray-500 mt-1">به‌روزرسانی خودکار فقط در ساعات معاملات (۹:۰۰ تا ۱۲:۳۰) و هر ۲ دقیقه</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => { setShowAddSymbol(true); setValidatedSymbol(null); }} disabled={!isOnline} className="px-4 py-2 rounded-lg bg-cyan-600 text-white font-bold inline-flex items-center gap-2 disabled:opacity-50"><PlusIcon /> افزودن نماد به دیده‌بان</button>
                  {activeWatchlist.symbols.length > 0 && <button onClick={() => { setEditMode(value => !value); setSelectedSymbols([]); }} className={`px-4 py-2 rounded-lg border font-semibold ${editMode ? 'border-cyan-500 text-cyan-600 bg-cyan-50 dark:bg-cyan-900/20' : 'border-[var(--color-border)]'}`}>ویرایش نمادها</button>}
                  {editMode && <button onClick={removeSelected} disabled={saving || selectedSymbols.length === 0} className="px-4 py-2 rounded-lg bg-red-600 text-white font-bold disabled:opacity-40 inline-flex items-center gap-2"><TrashIcon /> حذف انتخاب‌شده‌ها</button>}
                  <button onClick={refreshQuotes} disabled={quoteLoading || !isOnline || !isTehranTradingSession()} className="px-4 py-2 rounded-lg border border-[var(--color-border)] text-sm font-semibold disabled:opacity-50">{quoteLoading ? 'در حال بروزرسانی…' : 'بروزرسانی اطلاعات'}</button>
                </div>
              </div>

              {activeWatchlist.symbols.length === 0 ? (
                <div className="p-10 text-center text-gray-500">این دیده‌بان هنوز نمادی ندارد.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-sm text-right">
                    <thead className="bg-gray-50 dark:bg-gray-800/70 border-b border-[var(--color-border)]">
                      <tr>
                        {editMode && <th className="px-3 py-3 w-12 text-center">انتخاب</th>}
                        <th className="px-4 py-3 font-bold">ردیف</th>
                        <th className="px-4 py-3 font-bold">نام نماد</th>
                        <th className="px-4 py-3 font-bold">حجم معامله</th>
                        <th className="px-4 py-3 font-bold">قیمت لحظه‌ای</th>
                        <th className="px-4 py-3 font-bold">درصد تغییر</th>
                        <th className="px-4 py-3 font-bold">قیمت پایانی</th>
                        <th className="px-4 py-3 font-bold">درصد تغییر</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-border)]">
                      {activeWatchlist.symbols.map((item, index) => {
                        const quote = quotes[item.symbol];
                        return (
                          <tr key={item.symbol} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                            {editMode && <td className="px-3 py-3 text-center"><input type="checkbox" checked={selectedSymbols.includes(item.symbol)} onChange={() => toggleSymbol(item.symbol)} className="h-4 w-4 accent-cyan-600" /></td>}
                            <td className="px-4 py-3 text-gray-500">{(index + 1).toLocaleString('fa-IR')}</td>
                            <td className="px-4 py-3"><div className="font-bold text-cyan-600 dark:text-cyan-400">{quote?.symbol || item.symbol}</div><div className="text-xs text-gray-500 mt-0.5">{quote?.name || item.name}</div></td>
                            <td className="px-4 py-3 font-mono">{formatNumber(quote?.volume)}</td>
                            <td className="px-4 py-3 font-mono font-semibold">{formatNumber(quote?.lastPrice)}</td>
                            <td className={`px-4 py-3 font-mono font-bold ${percentClass(quote?.lastChangePercent)}`}>{formatPercent(quote?.lastChangePercent)}</td>
                            <td className="px-4 py-3 font-mono font-semibold">{formatNumber(quote?.closePrice)}</td>
                            <td className={`px-4 py-3 font-mono font-bold ${percentClass(quote?.closeChangePercent)}`}>{formatPercent(quote?.closeChangePercent)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="px-4 py-3 text-xs text-gray-500 border-t border-[var(--color-border)] flex items-center justify-between gap-3">
                <span>{activeWatchlist.symbols.length.toLocaleString('fa-IR')} نماد در این دیده‌بان</span>
                <span>{quoteLoading ? 'در حال دریافت آخرین اطلاعات بازار…' : 'آخرین بروزرسانی: در ساعات معاملات هر ۲ دقیقه؛ خارج از ساعات معاملات بدون درخواست بازار.'}</span>
              </div>
            </div>
          )}
        </>
      )}

      {showNewWatchlist && <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowNewWatchlist(false)}>
        <form onSubmit={createWatchlist} onClick={e => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-800 shadow-2xl p-6 space-y-4">
          <div className="flex items-center justify-between"><h3 className="text-lg font-bold">ایجاد دیده‌بان جدید</h3><button type="button" onClick={() => setShowNewWatchlist(false)}><XMarkIcon className="w-5 h-5" /></button></div>
          <input autoFocus value={newWatchlistName} onChange={e => setNewWatchlistName(e.target.value)} placeholder="مثلاً دیده‌بان بانکی" className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 bg-transparent" maxLength={80} />
          <button type="submit" disabled={saving || !isOnline} className="w-full py-2.5 rounded-lg bg-cyan-600 text-white font-bold disabled:opacity-50">{saving ? 'در حال ذخیره…' : 'ذخیره دیده‌بان'}</button>
        </form>
      </div>}

      {showAddSymbol && activeWatchlist && <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowAddSymbol(false)}>
        <div onClick={e => e.stopPropagation()} className="w-full max-w-lg rounded-2xl bg-white dark:bg-gray-800 shadow-2xl p-6 space-y-4">
          <div className="flex items-center justify-between"><div><h3 className="text-lg font-bold">افزودن نماد به دیده‌بان</h3><p className="text-xs text-gray-500 mt-1">دیده‌بان: {activeWatchlist.name}</p></div><button onClick={() => setShowAddSymbol(false)}><XMarkIcon className="w-5 h-5" /></button></div>
          <div className="flex gap-2">
            <input autoFocus value={symbolInput} onChange={e => { setSymbolInput(e.target.value.toUpperCase()); setValidatedSymbol(null); }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); validateSymbol(); } }} placeholder="نام نماد، مثلاً فولاد" className="flex-1 border border-[var(--color-border)] rounded-lg px-3 py-2 bg-transparent" />
            <button onClick={validateSymbol} disabled={validatingSymbol || !isOnline} className="px-4 py-2 rounded-lg bg-cyan-600 text-white font-bold disabled:opacity-50">{validatingSymbol ? 'در حال بررسی…' : 'بررسی نماد'}</button>
          </div>
          {validatedSymbol && <div className="rounded-xl border border-green-300 bg-green-50 dark:bg-green-900/20 p-4">
            <div className="text-sm text-green-700 dark:text-green-300 font-semibold">نماد معتبر و موجود در بازار</div>
            <div className="mt-2 flex items-center justify-between"><span className="font-bold text-cyan-600">{validatedSymbol.symbol}</span><span className="text-sm">{validatedSymbol.name}</span></div>
          </div>}
          <button onClick={saveSymbol} disabled={saving || !validatedSymbol || !isOnline} className="w-full py-2.5 rounded-lg bg-cyan-600 text-white font-bold disabled:opacity-40">{saving ? 'در حال ذخیره…' : 'ذخیره در دیده‌بان'}</button>
        </div>
      </div>}

      {showManage && <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowManage(false)}>
        <div onClick={e => e.stopPropagation()} className="w-full max-w-xl rounded-2xl bg-white dark:bg-gray-800 shadow-2xl p-6 space-y-4">
          <div className="flex items-center justify-between"><h3 className="text-lg font-bold">ویرایش دیده‌بان‌ها</h3><button onClick={() => setShowManage(false)}><XMarkIcon className="w-5 h-5" /></button></div>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {watchlists.map(item => (
              <div key={item.id} className="p-3 rounded-xl border border-[var(--color-border)] flex items-center gap-2">
                {renameId === item.id ? (
                  <>
                    <input autoFocus value={renameName} onChange={e => setRenameName(e.target.value)} className="flex-1 border border-[var(--color-border)] rounded-lg px-3 py-2 bg-transparent" />
                    <button onClick={() => saveRename(item.id)} disabled={saving} className="px-3 py-2 rounded-lg bg-cyan-600 text-white text-sm font-bold">ذخیره</button>
                    <button onClick={() => setRenameId(null)} className="px-3 py-2 rounded-lg border text-sm">انصراف</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => { setActiveId(item.id); setShowManage(false); }} className="flex-1 text-right font-bold hover:text-cyan-600">{item.name}<span className="mr-2 text-xs text-gray-500">{item.symbols.length.toLocaleString('fa-IR')} نماد</span></button>
                    <button onClick={() => { setRenameId(item.id); setRenameName(item.name); }} className="px-3 py-2 rounded-lg border text-sm font-semibold">ویرایش نام</button>
                    <button onClick={() => deleteWatchlist(item.id)} disabled={saving} className="p-2 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"><TrashIcon /></button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>}
    </div>
  );
};

export default PortfolioWatchlists;
