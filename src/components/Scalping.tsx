import React, { useCallback, useEffect, useRef, useState } from 'react';
import { scalpingService } from '../services/scalpingService';
import {
  ChartBarIcon,
  ArrowTrendingUpIcon,
  ClockIcon,
  ListBulletIcon,
  Squares2X2Icon
} from './Icons';
import type { ScalpingOpportunity } from '../types';

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
  typeof value === 'number' ? value.toFixed(1) : '0.0';

const OpportunityCard: React.FC<{ opportunity: ScalpingOpportunity }> = ({ opportunity }) => {
  const entryPrice = opportunity.entryPrice ?? opportunity.price;
  const exitPrice = opportunity.exitPrice ?? opportunity.targetPrice;
  const stopLossPrice = opportunity.stopLossPrice;
  const currentPrice = opportunity.currentPrice ?? opportunity.price;
  const signalType = opportunity.signalType ?? opportunity.signal ?? opportunity.type;

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold text-[var(--color-accent)]">{opportunity.symbol}</h3>
        <div className="flex items-center gap-1 text-xs font-medium text-green-500 bg-green-500/10 px-2 py-1 rounded-full">
          <ArrowTrendingUpIcon className="w-3 h-3" />
          <span>{signalType === 'SELL' ? 'سیگنال فروش' : 'فرصت فعال'}</span>
        </div>
      </div>

      <p className="text-sm text-[var(--color-text-secondary)] mb-4 line-clamp-2 min-h-[40px]">
        <span className="font-bold ml-1">دلیل:</span>
        {opportunity.reason || 'تأیید بر اساس فاکتورهای هفت‌گانه'}
      </p>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="rounded-lg bg-cyan-500/10 border border-cyan-500/20 p-2">
          <span className="block text-[10px] text-cyan-600 dark:text-cyan-400">نقطه ورود</span>
          <span className="block text-sm font-mono font-bold">{formatPrice(entryPrice)}</span>
        </div>
        <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-2">
          <span className="block text-[10px] text-emerald-600 dark:text-emerald-400">نقطه خروج / هدف</span>
          <span className="block text-sm font-mono font-bold">{formatPrice(exitPrice)}</span>
        </div>
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-2">
          <span className="block text-[10px] text-red-600 dark:text-red-400">حد ضرر</span>
          <span className="block text-sm font-mono font-bold">{formatPrice(stopLossPrice)}</span>
        </div>
        <div className="rounded-lg bg-gray-500/10 border border-gray-500/20 p-2">
          <span className="block text-[10px] text-gray-500">قیمت فعلی</span>
          <span className="block text-sm font-mono font-bold">{formatPrice(currentPrice)}</span>
        </div>
      </div>

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
    </div>
  );
};

const Scalping: React.FC<ScalpingProps> = ({ isOnline }) => {
  const [opportunities, setOpportunities] = useState<ScalpingOpportunity[]>([]);
  const [lastRefreshed, setLastRefreshed] = useState<number>(Date.now());
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isLoading, setIsLoading] = useState(true);
  const requestIdRef = useRef(0);

  const loadData = useCallback(async () => {
    const currentId = ++requestIdRef.current;
    if (!isOnline) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      // فقط یک درخواست برای دریافت snapshot مرکزی نوسان‌گیری.
      // تولید و به‌روزرسانی داده‌ها توسط Central Market Worker انجام می‌شود.
      const signalsRes = await scalpingService.getScalpingSignals();

      if (currentId !== requestIdRef.current) return;

      setOpportunities(Array.isArray(signalsRes.signals) ? signalsRes.signals : []);
      setLastRefreshed(Date.now());
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

    // همگام‌سازی خودکار با snapshot مرکزی؛ بدون دکمه شروع/توقف/به‌روزرسانی.
    const timer = setInterval(loadData, 30000);
    return () => clearInterval(timer);
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
          <OpportunityCard key={op.id || op.symbol} opportunity={op} />
        ))}
      </div>
    );
  };

  return (
    <div className="page-shell scalping-page space-y-5" dir="rtl">
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

      <div className="relative min-h-[300px]">
        {renderContent()}
      </div>

      <div className="text-[10px] text-gray-400 text-center pt-4">
        * سیگنال‌ها توسط موتور مرکزی رونیـا تولید و در پایگاه داده مشترک به‌روزرسانی می‌شوند.
      </div>
    </div>
  );
};

export default Scalping;
