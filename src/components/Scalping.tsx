import React, { useCallback, useEffect, useRef, useState } from 'react';
import { scalpingService } from '../services/scalpingService';
import apiClient from '../api/apiClient';
import { getSocket } from '../services/socketService';
import ValuableSymbols from './ValuableSymbols';
import TradeWatchlist from './TradeWatchlist';
import {
  ChartBarIcon,
  ArrowTrendingUpIcon,
  ClockIcon,
  ListBulletIcon,
  Squares2X2Icon
} from './Icons';
import type { ScalpingOpportunity } from '../types';

let cachedScalpingOpportunities: { items: ScalpingOpportunity[]; refreshedAt: number; evaluatedAt: string | null; marketStatus: { isOpen: boolean; available: boolean } } | null = null;

const formatTehranDateTime = (value?: string | null) => {
  if (!value) return 'هنوز ارزیابی ثبت نشده';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'نامشخص';
  return new Intl.DateTimeFormat('fa-IR', { timeZone: 'Asia/Tehran', dateStyle: 'medium', timeStyle: 'short', hour12: false }).format(date);
};

interface ScalpingProps {
  isOnline: boolean;
}

const formatRelativeTime = (value?: string | number | null) => {
  if (!value) return 'نامشخص';
  const timestamp = typeof value === 'number' ? value : new Date(value).getTime();
  if (isNaN(timestamp) || timestamp <= 0) return 'نامشخص';

  const diffInSeconds = Math.floor((Date.now() - timestamp) / 1000);
  const rtf = new Intl.RelativeTimeFormat('fa-IR', { numeric: 'auto' });

  if (diffInSeconds < 60) return 'لحظاتی پیش';
  if (diffInSeconds < 3600) return rtf.format(-Math.floor(diffInSeconds / 60), 'minute');
  if (diffInSeconds < 86400) return rtf.format(-Math.floor(diffInSeconds / 3600), 'hour');
  return rtf.format(-Math.floor(diffInSeconds / 86400), 'day');
};

const formatPrice = (value?: number | null) =>
  value && value > 0 ? new Intl.NumberFormat('fa-IR').format(value) : '---';

const formatScore = (value?: number | null) =>
  typeof value === 'number' && Number.isFinite(value)
    ? new Intl.NumberFormat('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value)
    : new Intl.NumberFormat('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(0);

const OpportunityCard: React.FC<{
  opportunity: ScalpingOpportunity;
  onSave: (opportunity: ScalpingOpportunity, quantity: string, tradeIntent: 'BUY' | 'WATCH') => void;
  saving: boolean;
}> = ({ opportunity, onSave, saving }) => {
  const [quantity, setQuantity] = useState('');
  const [tradeIntent, setTradeIntent] = useState<'BUY' | 'WATCH'>('WATCH');
  const entryPrice = opportunity.entryPrice ?? opportunity.price;
  const exitPrice = opportunity.exitPrice ?? opportunity.targetPrice;
  const stopLossPrice = opportunity.stopLossPrice;
  const currentPrice = opportunity.currentPrice ?? opportunity.price;
  const signalType = opportunity.signalType ?? opportunity.signal ?? opportunity.type;
  const isSellSignal = signalType === 'SELL';
  const isConditionalBreakout = opportunity.strategyName === 'technical-breakout-atr-v1';
  const isSupportRebound = opportunity.strategyName === 'technical-support-rebound-atr-v1';
  const isResistanceRejection = opportunity.strategyName === 'technical-resistance-rejection-exit-atr-v1';

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold text-[var(--color-accent)]">{opportunity.symbol}</h3>
        <div className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${signalType === 'SELL' ? 'text-red-500 bg-red-500/10' : 'text-green-500 bg-green-500/10'}`}>
          <ArrowTrendingUpIcon className="w-3 h-3" />
          <span>{isConditionalBreakout ? (isSellSignal ? 'در انتظار شکست حمایت' : 'در انتظار شکست مقاومت') : isSupportRebound ? 'بازگشت از حمایت' : isResistanceRejection ? 'رد مقاومت؛ بررسی خروج' : (isSellSignal ? 'پیشنهاد فروش سهم' : 'سیگنال خرید')}</span>
        </div>
      </div>

      <p className="text-sm text-[var(--color-text-secondary)] mb-4 line-clamp-2 min-h-[40px]">
        <span className="font-bold ml-1">دلیل:</span>
        {opportunity.reason || 'تأیید بر اساس فاکتورهای هفت‌گانه'}
      </p>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="rounded-lg bg-cyan-500/10 border border-cyan-500/20 p-2">
          <span className="block text-[10px] text-cyan-600 dark:text-cyan-400">{isSellSignal ? 'قیمت مرجع فروش / خروج' : 'نقطه ورود'}</span>
          <span className="block text-sm font-mono font-bold">{formatPrice(entryPrice)}</span>
        </div>
        <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-2">
          <span className="block text-[10px] text-emerald-600 dark:text-emerald-400">{isSellSignal ? 'هدف قیمتی نزولی' : 'هدف قیمتی / خروج'}</span>
          <span className="block text-sm font-mono font-bold">{formatPrice(exitPrice)}</span>
        </div>
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-2">
          <span className="block text-[10px] text-red-600 dark:text-red-400">{isSellSignal ? 'سطح ابطال سناریوی نزولی' : 'حد ضرر'}</span>
          <span className="block text-sm font-mono font-bold">{formatPrice(stopLossPrice)}</span>
        </div>
        <div className="rounded-lg bg-gray-500/10 border border-gray-500/20 p-2">
          <span className="block text-[10px] text-gray-500">قیمت فعلی</span>
          <span className="block text-sm font-mono font-bold">{formatPrice(currentPrice)}</span>
        </div>
      </div>

      {(isConditionalBreakout || isSupportRebound || isResistanceRejection) && (
        <p className={`text-xs text-[var(--color-text-secondary)] border rounded-lg p-2 mb-3 ${isSellSignal ? 'bg-red-500/5 border-red-500/15' : 'bg-amber-500/5 border-amber-500/20'}`}>
          {isSupportRebound
            ? 'سناریوی بازگشت از حمایت بر اساس کندل صعودی و نسبت سود به ریسک بررسی شده است؛ حمایت ممکن است بشکند و حد ضرر باید رعایت شود.'
            : isResistanceRejection
              ? 'این سطح مرجع بررسی کاهش ریسک یا خروج از سهم موجود پس از رد مقاومت است؛ سیگنال فروش استقراضی نیست.'
              : isSellSignal
                ? 'این قیمت، شرط فعال‌شدن سناریوی شکست حمایت است؛ تا زمانی که قیمت به سطح ورود نرسیده، سیگنال به‌معنای اقدام فوری نیست.'
                : 'این قیمت، شرط فعال‌شدن سناریوی شکست مقاومت است؛ تا زمانی که قیمت به سطح ورود نرسیده، سیگنال خرید فوری نیست. قیمت ورود ممکن است از قیمت فعلی بالاتر باشد.'}
        </p>
      )}

      {isSellSignal && (
        <p className="text-xs text-[var(--color-text-secondary)] bg-red-500/5 border border-red-500/15 rounded-lg p-2 mb-3">
          این سیگنال نشان‌دهنده چشم‌انداز نزولی قیمت سهم و بررسی فروش یا خروج از سهم موجود است؛ به‌معنای فروش استقراضی یا توصیه معامله اختیار معامله نیست.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 pt-3 border-t border-[var(--color-border)]">
        <div className="flex flex-col">
          <span className="text-[10px] text-gray-400">امتیاز تحلیل</span>
          <span className="text-sm font-mono font-bold text-amber-500">{formatScore(opportunity.score)}</span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[10px] text-gray-400">اعتبار سیگنال</span>
          <span className="text-sm font-mono font-bold text-cyan-500">{formatScore(opportunity.confidence)}</span>
        </div>
      </div>
      <div className="mt-3 rounded-lg border border-[var(--color-border)] p-3">
        <div className="mb-2 text-xs font-bold text-[var(--color-text-primary)]">احتمال‌های برآوردشده از تاریخچه واقعی</div>
        {opportunity.historicalProbabilities?.status === 'CALIBRATED' ? (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div><span className="block text-[10px] text-[var(--color-text-secondary)]">رسیدن به ورود</span><strong className="text-sm">{formatScore(opportunity.historicalProbabilities.entryHitProbability)}٪</strong></div>
              <div><span className="block text-[10px] text-[var(--color-text-secondary)]">تأیید برگشت</span><strong className="text-sm">{formatScore(opportunity.historicalProbabilities.reversalAfterEntryProbability)}٪</strong></div>
              <div><span className="block text-[10px] text-[var(--color-text-secondary)]">هدف قبل از حد ضرر</span><strong className="text-sm">{formatScore(opportunity.historicalProbabilities.targetBeforeStopProbability)}٪</strong></div>
            </div>
            <p className="mt-2 text-[10px] text-[var(--color-text-secondary)]">بر پایه {new Intl.NumberFormat('fa-IR').format(opportunity.historicalProbabilities.samples)} نمونه تاریخی و افق {new Intl.NumberFormat('fa-IR').format(opportunity.historicalProbabilities.lookaheadSessions || 5)} جلسه؛ تضمین عملکرد آینده نیست.</p>
          </>
        ) : (
          <p className="text-xs text-amber-600">داده تاریخی کافی برای محاسبه احتمال معتبر نیست؛ درصدی نمایش داده نمی‌شود.</p>
        )}
      </div>
      <label className="mt-4 block text-sm text-[var(--color-text-secondary)]">تعداد واقعی سهام خریداری‌شده
        <input type="number" min="1" step="1" required value={quantity} onChange={event => setQuantity(event.target.value)} placeholder="تعداد سهم را وارد کنید" className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-transparent p-2" />
      </label>
      <label className="mt-3 block text-sm text-[var(--color-text-secondary)]">وضعیت در سبد
        <select value={tradeIntent} onChange={event => setTradeIntent(event.target.value as 'BUY' | 'WATCH')} className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-transparent p-2">
          <option value="BUY">خرید</option><option value="WATCH">پایش</option>
        </select>
      </label>
      <button type="button" onClick={() => onSave(opportunity, quantity, tradeIntent)} disabled={saving || isSellSignal || !(Number(quantity) > 0 && Number.isInteger(Number(quantity)) && Number(entryPrice) > Number(stopLossPrice) && Number(exitPrice) > Number(entryPrice))}
        title={isSellSignal ? 'سیگنال فروش برای ایجاد موقعیت خرید در این سبد مناسب نیست.' : undefined}
        className="mt-4 w-full rounded-lg bg-cyan-600 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50">
        {saving ? 'در حال ذخیره…' : 'ذخیره در سبد نوسان‌گیری'}
      </button>
      {isSellSignal && <p className="mt-2 text-[10px] text-amber-600">این سیگنال فروش است؛ برای جلوگیری از تنظیم اشتباه هشدار موقعیت خرید، در سبد جدید ذخیره نمی‌شود.</p>}
    </div>
  );
};

const Scalping: React.FC<ScalpingProps> = ({ isOnline }) => {
  const [activeSubTab, setActiveSubTab] = useState<'scalping' | 'valuable' | 'scalpingWatchlist' | 'valuableWatchlist'>('scalping');
  const [opportunities, setOpportunities] = useState<ScalpingOpportunity[]>(() => cachedScalpingOpportunities?.items ?? []);
  const [lastRefreshed, setLastRefreshed] = useState<number>(() => cachedScalpingOpportunities?.refreshedAt ?? Date.now());
  const [lastEvaluatedAt, setLastEvaluatedAt] = useState<string | null>(() => cachedScalpingOpportunities?.evaluatedAt ?? null);
  const [marketStatus, setMarketStatus] = useState<{ isOpen: boolean; available: boolean }>(() => cachedScalpingOpportunities?.marketStatus ?? { isOpen: false, available: false });
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [savingSymbol, setSavingSymbol] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState('');
  const [saveError, setSaveError] = useState('');
  const saveToScalpingWatchlist = async (opportunity: ScalpingOpportunity, quantityInput: string, tradeIntent: 'BUY' | 'WATCH') => {
    const symbol = String(opportunity.symbol || '').trim().toUpperCase();
    const entryPrice = Number(opportunity.entryPrice ?? opportunity.price);
    const targetPrice = Number(opportunity.exitPrice ?? opportunity.targetPrice);
    const stopLoss = Number(opportunity.stopLossPrice);
    const quantity = Number(quantityInput);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      setSaveError('تعداد واقعی سهام را به‌صورت عدد صحیح بزرگ‌تر از صفر وارد کنید.'); setSaveNotice(''); return;
    }
    if (!symbol || !Number.isFinite(entryPrice) || !Number.isFinite(targetPrice) || !Number.isFinite(stopLoss) ||
        !(stopLoss > 0 && entryPrice > stopLoss && targetPrice > entryPrice)) {
      setSaveError('سطوح ورود، حد ضرر و خروج این سیگنال برای ذخیره در سبد خرید معتبر نیستند.');
      setSaveNotice('');
      return;
    }
    setSavingSymbol(symbol); setSaveError(''); setSaveNotice('');
    try {
      const dateParts = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
      const date = Object.fromEntries(dateParts.map(part => [part.type, part.value]));
      await apiClient.post('/trade-watchlists/scalping', {
        symbol, name: symbol, entryDate: `${date.year}/${date.month}/${date.day}`,
        quantity, entryPrice, targetPrice, stopLoss, tradeIntent,
        targetAlertEnabled: true, stopLossAlertEnabled: true,
      });
      setSaveNotice(`نماد ${symbol} با وضعیت ${tradeIntent === 'BUY' ? 'خرید' : 'پایش'} در سبد نوسان‌گیری ذخیره شد؛ هشدارهای قیمتی فعال هستند.`);
    } catch (error: any) {
      setSaveError(error?.response?.data?.message || error?.message || 'ذخیره نماد در سبد نوسان‌گیری ناموفق بود.');
    } finally { setSavingSymbol(null); }
  };
  const [isLoading, setIsLoading] = useState(() => !cachedScalpingOpportunities);
  const requestIdRef = useRef(0);

  const loadData = useCallback(async () => {
    const currentId = ++requestIdRef.current;
    if (!isOnline) {
      setIsLoading(false);
      return;
    }

    if (!cachedScalpingOpportunities) setIsLoading(true);
    try {
      // فقط یک درخواست برای دریافت snapshot مرکزی نوسان‌گیری.
      // تولید و به‌روزرسانی داده‌ها توسط Central Market Worker انجام می‌شود.
      const [signalsRes, statusRes] = await Promise.all([scalpingService.getScalpingSignals(), scalpingService.getScalpingStatus()]);

      if (currentId !== requestIdRef.current) return;

      const evaluatedAt = signalsRes.lastUpdate;
      const evaluatedTimestamp = evaluatedAt ? new Date(evaluatedAt).getTime() : 0;
      const refreshedAt = evaluatedTimestamp > 0 ? evaluatedTimestamp : Date.now();
      const items = Array.isArray(signalsRes.signals) ? signalsRes.signals : [];
      const nextMarketStatus = statusRes.marketStatus;
      cachedScalpingOpportunities = { items, refreshedAt, evaluatedAt, marketStatus: nextMarketStatus };
      setOpportunities(items);
      setLastRefreshed(refreshedAt);
      setLastEvaluatedAt(evaluatedAt);
      setMarketStatus(nextMarketStatus);
    } catch (error) {
      console.error('[Scalping] Error fetching shared signals:', error);
    } finally {
      if (currentId === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [isOnline]);

  useEffect(() => {
    loadData();

    // Refresh immediately after the worker commits a new set of opportunities.
    const socket = getSocket();
    socket?.on('scalping-opportunities:updated', loadData);
    socket?.on('connect', loadData);
    // Polling remains as a fallback when Socket.IO is disconnected.
    const timer = window.setInterval(() => {
      if (!socket?.connected) loadData();
    }, 30000);
    const marketStatusTimer = window.setInterval(() => {
      void scalpingService.getScalpingStatus().then(status => setMarketStatus(status.marketStatus));
    }, 60000);
    return () => {
      window.clearInterval(timer);
      window.clearInterval(marketStatusTimer);
      socket?.off('scalping-opportunities:updated', loadData);
      socket?.off('connect', loadData);
    };
  }, [loadData]);

  const renderContent = () => {
    if (!isOnline) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-gray-400 opacity-60">
          <p>شما در حالت آفلاین هستید. برای دریافت سیگنال‌ها متصل شوید.</p>
        </div>
      );
    }

    if (isLoading && opportunities.length === 0) {
      return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-pulse">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-40 bg-gray-200 dark:bg-gray-800 rounded-xl" />
          ))}
        </div>
      );
    }

    if (opportunities.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-16 bg-[var(--color-surface)] border border-dashed border-[var(--color-border)] rounded-2xl">
          <ClockIcon className="w-12 h-12 text-gray-300 mb-4" />
          <h3 className="text-lg font-bold text-[var(--color-text-primary)]">در حال حاضر فرصت نوسان‌گیری فعالی یافت نشد</h3>
          <p className="text-sm text-[var(--color-text-secondary)] mt-2">
            این بخش به‌صورت خودکار با داده‌های مرکزی رونیـا همگام می‌شود.
          </p>
        </div>
      );
    }

    return (
      <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4' : 'flex flex-col gap-2'}>
        {opportunities.map(op => (
          <OpportunityCard key={op.id || op.symbol} opportunity={op} onSave={saveToScalpingWatchlist} saving={savingSymbol === op.symbol} />
        ))}
      </div>
    );
  };

  return (
    <div className="page-shell scalping-page space-y-5" dir="rtl">
      <div className="flex flex-wrap gap-2 border-b border-[var(--color-border)] pb-3">
        <button type="button" onClick={() => setActiveSubTab('scalping')} className={activeSubTab === 'scalping' ? 'rounded-lg px-4 py-2 text-sm font-semibold bg-cyan-500 text-white' : 'rounded-lg px-4 py-2 text-sm font-semibold border border-[var(--color-border)] text-[var(--color-text-secondary)]'}>نوسان‌گیری</button>
        <button type="button" onClick={() => setActiveSubTab('valuable')} className={activeSubTab === 'valuable' ? 'rounded-lg px-4 py-2 text-sm font-semibold bg-cyan-500 text-white' : 'rounded-lg px-4 py-2 text-sm font-semibold border border-[var(--color-border)] text-[var(--color-text-secondary)]'}>نمادهای ارزنده</button>
        <button type="button" onClick={() => setActiveSubTab('scalpingWatchlist')} className={activeSubTab === 'scalpingWatchlist' ? 'rounded-lg px-4 py-2 text-sm font-semibold bg-cyan-500 text-white' : 'rounded-lg px-4 py-2 text-sm font-semibold border border-[var(--color-border)] text-[var(--color-text-secondary)]'}>سبد نوسان‌گیری</button>
        <button type="button" onClick={() => setActiveSubTab('valuableWatchlist')} className={activeSubTab === 'valuableWatchlist' ? 'rounded-lg px-4 py-2 text-sm font-semibold bg-cyan-500 text-white' : 'rounded-lg px-4 py-2 text-sm font-semibold border border-[var(--color-border)] text-[var(--color-text-secondary)]'}>سبد ارزنده‌ها</button>
      </div>
      {activeSubTab === 'valuable' ? <ValuableSymbols isOnline={isOnline} /> : activeSubTab === 'scalpingWatchlist' ? <TradeWatchlist listType="scalping" isOnline={isOnline} /> : activeSubTab === 'valuableWatchlist' ? <TradeWatchlist listType="valuable" isOnline={isOnline} /> : <>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-cyan-500/10 rounded-lg">
            <ChartBarIcon className="w-6 h-6 text-cyan-500" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-[var(--color-text-primary)]">فرصت‌های نوسان‌گیری</h2>
            <div className="flex items-center gap-2 mt-1 text-xs text-[var(--color-text-secondary)]">
              <span>همگام‌سازی خودکار: {formatRelativeTime(lastRefreshed)}</span>
              <span className="w-1 h-1 bg-gray-400 rounded-full" />
              <span className="text-green-500">داده مرکزی فعال</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-[var(--color-surface)] p-1 rounded-lg border border-[var(--color-border)]">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-2 rounded-md transition-all ${viewMode === 'grid' ? 'bg-cyan-500 text-white shadow-sm' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
          >
            <Squares2X2Icon className="w-5 h-5" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-2 rounded-md transition-all ${viewMode === 'list' ? 'bg-cyan-500 text-white shadow-sm' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
          >
            <ListBulletIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="text-sm text-[var(--color-text-secondary)]">وضعیت بازار بورس (ساعت تهران)</div>
          <div className={`mt-2 font-bold ${marketStatus.available ? (marketStatus.isOpen ? 'text-emerald-600' : 'text-amber-600') : 'text-gray-500'}`}>{marketStatus.available ? (marketStatus.isOpen ? 'بازار باز است' : 'بازار بسته است') : 'وضعیت بازار نامشخص'}</div>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="text-sm text-[var(--color-text-secondary)]">آخرین ارزیابی و ذخیره موفق در دیتابیس (ساعت تهران)</div>
          <div className="mt-2 text-sm font-bold tabular-nums">{formatTehranDateTime(lastEvaluatedAt)}</div>
        </div>
      </div>

      {(saveNotice || saveError) && <div role="status" className={`rounded-lg border p-3 text-sm ${saveError ? 'border-red-500/30 bg-red-500/5 text-red-600' : 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700'}`}>{saveError || saveNotice}</div>}
      <div className="relative min-h-[300px]">
        {renderContent()}
      </div>

      <div className="text-[10px] text-gray-400 text-center pt-4">
        * سیگنال‌ها توسط موتور مرکزی رونیـا تولید و در پایگاه داده مشترک به‌روزرسانی می‌شوند.
      </div>
      </>}
    </div>
  );
};

export default Scalping;
