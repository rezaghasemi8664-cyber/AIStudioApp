import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { scalpingService, type ScalpingStatus } from '../services/scalpingService';
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

// ایجاد وضعیت پیش‌فرض برای جلوگیری از خطاهای undefined در اولین رندر
const createDefaultStatus = (): ScalpingStatus => ({
  isRunning: false,
  lastRunId: null,
  lastStatus: null,
  lastUpdate: null,
  todayTrades: 0,
  activePositions: 0,
  todayPnL: 0,
  marketStatus: {
    isOpen: false,
    available: false
  }
});

// فرمت‌دهی زمان به صورت محلی و خوانا
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
  (value && value > 0) ? new Intl.NumberFormat('fa-IR').format(value) : '---';

const formatScore = (value?: number | null) => 
  typeof value === 'number' ? value.toFixed(1) : '0.0';

/**
 * کامپوننت نمایش کارت یک فرصت نوسان‌گیری
 */
const OpportunityCard: React.FC<{ opportunity: ScalpingOpportunity }> = ({ opportunity }) => (
  <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-lg font-bold text-[var(--color-accent)]">{opportunity.symbol}</h3>
      <div className="flex items-center gap-1 text-xs font-medium text-green-500 bg-green-500/10 px-2 py-1 rounded-full">
        <ArrowTrendingUpIcon className="w-3 h-3" />
        <span>فرصت فعال</span>
      </div>
    </div>

    <p className="text-sm text-[var(--color-text-secondary)] mb-4 line-clamp-2 min-h-[40px]">
      <span className="font-bold ml-1">دلیل:</span>
      {opportunity.reason || 'تأیید بر اساس فاکتورهای هفت‌گانه'}
    </p>

    <div className="grid grid-cols-2 gap-2 pt-3 border-t border-[var(--color-border)]">
      <div className="flex flex-col">
        <span className="text-[10px] text-gray-400">آخرین قیمت</span>
        <span className="text-sm font-mono font-bold">{formatPrice(opportunity.price)}</span>
      </div>
      <div className="flex flex-col items-end">
        <span className="text-[10px] text-gray-400">امتیاز تحلیل</span>
        <span className="text-sm font-mono font-bold text-amber-500">{formatScore(opportunity.score)}</span>
      </div>
    </div>
  </div>
);

const Scalping: React.FC<ScalpingProps> = ({ isOnline }) => {
  const [opportunities, setOpportunities] = useState<ScalpingOpportunity[]>([]);
  const [status, setStatus] = useState<ScalpingStatus>(createDefaultStatus());
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<number>(Date.now());

  const requestIdRef = useRef(0);

  const loadData = useCallback(async () => {
    const currentId = ++requestIdRef.current;
    if (!isOnline) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      // دریافت همزمان وضعیت و سیگنال‌ها برای سرعت بیشتر
      const [statusRes, signalsRes] = await Promise.all([
        scalpingService.getScalpingStatus(),
        scalpingService.getScalpingSignals()
      ]);

      if (currentId !== requestIdRef.current) return;

      // توجه: scalpingService خود دارای لایه نرمال‌سازی است
      if (statusRes) setStatus(statusRes);
      
      // استخراج لیست سیگنال‌ها با اولویت فیلد signals طبق اینترفیس سرویس
      const rawSignals = (signalsRes as any)?.signals || (signalsRes as any)?.data || [];
      setOpportunities(Array.isArray(rawSignals) ? rawSignals : []);
      
      setLastRefreshed(Date.now());
    } catch (error) {
      console.error('[Scalping] Error fetching data:', error);
    } finally {
      if (currentId === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [isOnline]);

  useEffect(() => {
    loadData();
    const timer = setInterval(loadData, 60000); // به‌روزرسانی خودکار هر یک دقیقه
    return () => clearInterval(timer);
  }, [loadData]);

  // تعیین وضعیت بازار: اولویت با فیلد صریح isOpen است
  const isMarketOpen = status.marketStatus?.isOpen || status.isRunning;

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

    if (!isMarketOpen && opportunities.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-16 bg-[var(--color-surface)] border border-dashed border-[var(--color-border)] rounded-2xl">
          <ClockIcon className="w-12 h-12 text-gray-300 mb-4" />
          <h3 className="text-lg font-bold text-[var(--color-text-primary)]">بازار بسته است</h3>
          <p className="text-sm text-[var(--color-text-secondary)] mt-2">سیگنال‌های نوسان‌گیری فقط در زمان فعالیت بازار ارائه می‌شوند.</p>
        </div>
      );
    }

    if (opportunities.length === 0) {
      return (
        <div className="text-center py-12">
          <p className="text-[var(--color-text-secondary)]">در حال حاضر فرصت نوسان‌گیری فعالی یافت نشد.</p>
        </div>
      );
    }

    return (
      <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4' : 'flex flex-col gap-2'}>
        {opportunities.map((op) => (
          <OpportunityCard key={op.id || op.symbol} opportunity={op} />
        ))}
      </div>
    );
  };

  return (
    <div className="w-full space-y-6">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-cyan-500/10 rounded-lg">
            <ChartBarIcon className="w-6 h-6 text-cyan-500" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-[var(--color-text-primary)]">فرصت‌های نوسان‌گیری</h2>
            <div className="flex items-center gap-2 mt-1 text-xs text-[var(--color-text-secondary)]">
              <span>بروزرسانی: {formatRelativeTime(lastRefreshed)}</span>
              <span className="w-1 h-1 bg-gray-400 rounded-full" />
              <span className={isMarketOpen ? 'text-green-500' : 'text-amber-500'}>
                {isMarketOpen ? 'بازار باز' : 'بازار بسته'}
              </span>
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

      {/* Main Content */}
      <div className="relative min-h-[300px]">
        {renderContent()}
      </div>

      {/* Footer Info */}
      <div className="text-[10px] text-gray-400 text-center pt-4">
        * تحلیل‌ها بر اساس الگوریتم اختصاصی و فاکتورهای هفت‌گانه رونیـا انجام می‌شود.
      </div>
    </div>
  );
};

export default Scalping;
