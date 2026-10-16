import React, { useCallback, useEffect, useState } from 'react';
import { valuableSymbolsService, type ValuableSymbol } from '../services/valuableSymbolsService';
import { getSocket } from '../services/socketService';

let cachedValuableSymbols: Awaited<ReturnType<typeof valuableSymbolsService.getSignals>> | null = null;

const price = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 2 }).format(value)
    : '—';

const dateTime = (value: string | null) => {
  if (!value) return 'هنوز ارزیابی نشده';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'زمان نامشخص'
    : new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Tehran' }).format(date);
};

const ValuableSymbolCard: React.FC<{ item: ValuableSymbol; index: number }> = ({ item, index }) => (
  <article className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
    <div className="mb-3 flex items-start justify-between gap-3">
      <div>
        <div className="text-xs text-[var(--color-text-secondary)]">رتبه {new Intl.NumberFormat('fa-IR').format(index + 1)}</div>
        <h3 className="mt-1 text-lg font-bold text-[var(--color-accent)]">{item.symbol}</h3>
        <p className="text-xs text-[var(--color-text-secondary)]">{item.name}{item.sector ? ` · ${item.sector}` : ''}</p>
      </div>
      <div className="rounded-lg bg-amber-500/10 px-3 py-2 text-center">
        <div className="text-[10px] text-amber-600">امتیاز ترکیبی</div>
        <div className="font-mono font-bold text-amber-500">{new Intl.NumberFormat('fa-IR').format(item.score)}</div>
      </div>
    </div>
    <div className="grid grid-cols-2 gap-2">
      <div className="rounded-lg bg-gray-500/5 p-2"><div className="text-[10px] text-[var(--color-text-secondary)]">قیمت فعلی</div><strong className="font-mono text-sm">{price(item.currentPrice)}</strong></div>
      <div className="rounded-lg bg-cyan-500/10 p-2"><div className="text-[10px] text-cyan-600">قیمت ورود مرجع</div><strong className="font-mono text-sm">{price(item.entryPrice)}</strong></div>
      <div className="rounded-lg bg-emerald-500/10 p-2"><div className="text-[10px] text-emerald-600">هدف قیمتی</div><strong className="font-mono text-sm">{price(item.targetPrice)}</strong></div>
      <div className="rounded-lg bg-red-500/10 p-2"><div className="text-[10px] text-red-600">حد ضرر</div><strong className="font-mono text-sm">{price(item.stopLoss)}</strong></div>
    </div>
    <p className="mt-3 rounded-lg bg-gray-500/5 p-2 text-[10px] leading-5 text-[var(--color-text-secondary)]">
      {item.marketStatus === 'OPEN' ? 'قیمت ثبت‌شده در ساعات بازار' : 'آخرین قیمت ثبت‌شده؛ بازار بسته است'} · زمان ثبت قیمت: {dateTime(item.marketUpdatedAt || null)}
      {typeof item.marketDataAgeMinutes === 'number' ? ` · سن داده: ${new Intl.NumberFormat('fa-IR').format(item.marketDataAgeMinutes < 60 ? item.marketDataAgeMinutes : Math.floor(item.marketDataAgeMinutes / 60))} ${item.marketDataAgeMinutes < 60 ? 'دقیقه' : 'ساعت'}` : ''}
    </p>
    <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[var(--color-border)] pt-3 text-xs">
      <div><span className="text-[var(--color-text-secondary)]">RSI 14: </span><strong>{price(item.rsi14)}</strong></div>
      <div><span className="text-[var(--color-text-secondary)]">SMA 20: </span><strong>{price(item.sma20)}</strong></div>
    </div>
    <p className="mt-3 text-[10px] text-[var(--color-text-secondary)]">
      بررسی بنیادی: داده کدال {item.fundamental?.reportTitle ? `· ${item.fundamental.reportTitle}` : ''}
    </p>
  </article>
);

const ValuableSymbols: React.FC<{ isOnline: boolean }> = ({ isOnline }) => {
  const [items, setItems] = useState<ValuableSymbol[]>(() => cachedValuableSymbols?.signals ?? []);
  const [lastEvaluatedAt, setLastEvaluatedAt] = useState<string | null>(() => cachedValuableSymbols?.lastEvaluatedAt ?? null);
  const [stale, setStale] = useState(() => cachedValuableSymbols?.stale ?? false);
  const [marketStatus, setMarketStatus] = useState<'OPEN' | 'CLOSED'>(() => cachedValuableSymbols?.marketStatus ?? 'CLOSED');
  const [loading, setLoading] = useState(() => !cachedValuableSymbols);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!isOnline) {
      setLoading(false);
      setError('برای دریافت اطلاعات، اتصال اینترنت برنامه لازم است.');
      return;
    }
    try {
      if (!cachedValuableSymbols) setLoading(true);
      const response = await valuableSymbolsService.getSignals();
      cachedValuableSymbols = response;
      setItems(response.signals);
      setLastEvaluatedAt(response.lastEvaluatedAt);
      setStale(response.stale);
      setMarketStatus(response.marketStatus);
      setError('');
    } catch (e) {
      console.error('[ValuableSymbols] Failed to load:', e);
      setError('دریافت فهرست نمادهای ارزنده ناموفق بود. لطفاً بعداً دوباره تلاش کنید.');
    } finally {
      setLoading(false);
    }
  }, [isOnline]);

  useEffect(() => {
    void load();
    const socket = getSocket();
    const refresh = () => { void load(); };
    socket?.on('valuable-symbols:updated', refresh);
    socket?.on('connect', refresh);
    const timer = window.setInterval(() => {
      if (!socket?.connected) refresh();
    }, 60000);
    return () => {
      window.clearInterval(timer);
      socket?.off('valuable-symbols:updated', refresh);
      socket?.off('connect', refresh);
    };
  }, [load]);

  return (
    <section className="space-y-4" dir="rtl">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-bold text-[var(--color-text-primary)]">نمادهای ارزنده</h3>
          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">موتور مستقل با داده بازار مشترک و گزارش‌های واقعی کدال؛ حداکثر ۲۰ نماد</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
          <span>{marketStatus === 'OPEN' ? 'بازار باز است' : 'بازار بسته است'} · {stale ? 'نتیجه ارزیابی قدیمی' : 'آخرین ارزیابی'}: {dateTime(lastEvaluatedAt)}</span>
        </div>
      </div>
      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-6 text-[var(--color-text-secondary)]">
        این فهرست غربالگری داده‌محور است، نه تضمین بازده. قیمت ورود، هدف و حد ضرر مقادیر محاسباتی هستند؛ پیش از معامله تازگی داده و شرایط بازار را بررسی کنید.
      </div>
      {loading && items.length === 0 ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{[1,2,3].map(n => <div key={n} className="h-48 animate-pulse rounded-xl bg-gray-500/10" />)}</div>
      ) : error && items.length === 0 ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center text-sm text-[var(--color-text-secondary)]">{error}</div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--color-border)] p-10 text-center">
          <p className="font-semibold text-[var(--color-text-primary)]">در حال حاضر نماد واجد شرایطی پیدا نشد.</p>
          <p className="mt-2 text-xs text-[var(--color-text-secondary)]">در نبود داده تکنیکال یا بنیادی معتبر، نماد ساختگی نمایش داده نمی‌شود.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{items.slice(0,20).map((item,index) => <ValuableSymbolCard key={item.symbol} item={item} index={index} />)}</div>
      )}
    </section>
  );
};

export default ValuableSymbols;
