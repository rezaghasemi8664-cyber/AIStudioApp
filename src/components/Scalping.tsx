import React, { useCallback, useEffect, useState } from 'react';
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

type MarketResolution = {
  known: boolean;
  open: boolean;
};

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

const formatRelativeTime = (value?: string | number | null) => {
  if (!value) {
    return 'نامشخص';
  }

  const timestamp =
    typeof value === 'number' ? value : new Date(value).getTime();

  if (!timestamp || Number.isNaN(timestamp)) {
    return 'نامشخص';
  }

  const now = Date.now();
  const diffInSeconds = Math.floor((now - timestamp) / 1000);
  const rtf = new Intl.RelativeTimeFormat('fa-IR', { numeric: 'auto' });

  if (diffInSeconds < 60) {
    return rtf.format(-diffInSeconds, 'second');
  }

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    return rtf.format(-diffInMinutes, 'minute');
  }

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return rtf.format(-diffInHours, 'hour');
  }

  const diffInDays = Math.floor(diffInHours / 24);
  return rtf.format(-diffInDays, 'day');
};

const formatPrice = (value?: number | null) => {
  const price = Number(value || 0);
  if (!Number.isFinite(price) || price <= 0) {
    return 'نامشخص';
  }

  return new Intl.NumberFormat('fa-IR').format(price);
};

const formatScore = (value?: number | null) => {
  const score = Number(value || 0);
  if (!Number.isFinite(score)) {
    return '0';
  }

  return score.toFixed(1);
};

const getObjectValue = <T,>(value: unknown): T | undefined => {
  if (value && typeof value === 'object') {
    return value as T;
  }

  return undefined;
};

const resolveLastUpdated = (
  statusResult: ScalpingStatus | null | undefined,
  signalsResult: unknown
): string | null => {
  const rawSignals = getObjectValue<Record<string, unknown>>(signalsResult);
  const signalLastUpdate = rawSignals?.lastUpdate;
  const signalLastUpdated = rawSignals?.lastUpdated;

  if (typeof signalLastUpdate === 'string' && signalLastUpdate.trim()) {
    return signalLastUpdate;
  }

  if (typeof signalLastUpdated === 'string' && signalLastUpdated.trim()) {
    return signalLastUpdated;
  }

  if (typeof statusResult?.lastUpdate === 'string' && statusResult.lastUpdate.trim()) {
    return statusResult.lastUpdate;
  }

  const rawStatus = getObjectValue<Record<string, unknown>>(statusResult);
  const statusLastUpdated = rawStatus?.lastUpdated;
  if (typeof statusLastUpdated === 'string' && statusLastUpdated.trim()) {
    return statusLastUpdated;
  }

  const statusCheckedAt = rawStatus?.statusCheckedAt;
  if (typeof statusCheckedAt === 'string' && statusCheckedAt.trim()) {
    return statusCheckedAt;
  }

  const marketStatus = getObjectValue<Record<string, unknown>>(rawStatus?.marketStatus);
  const marketCheckedAt = marketStatus?.checkedAt;
  if (typeof marketCheckedAt === 'string' && marketCheckedAt.trim()) {
    return marketCheckedAt;
  }

  return null;
};

const resolveMarketState = (status: ScalpingStatus): MarketResolution => {
  const marketStatus = getObjectValue<Record<string, unknown>>(status.marketStatus);

  if (!marketStatus) {
    return { known: false, open: false };
  }

  if (typeof marketStatus.available === 'boolean' && typeof marketStatus.isOpen === 'boolean') {
    return {
      known: marketStatus.available,
      open: marketStatus.isOpen
    };
  }

  if (typeof marketStatus.known === 'boolean' && typeof marketStatus.open === 'boolean') {
    return {
      known: marketStatus.known,
      open: marketStatus.open
    };
  }

  if (typeof marketStatus.open === 'boolean') {
    return {
      known: true,
      open: marketStatus.open
    };
  }

  if (typeof marketStatus.isOpen === 'boolean') {
    return {
      known: true,
      open: marketStatus.isOpen
    };
  }

  if (typeof marketStatus.status === 'string') {
    const normalizedStatus = marketStatus.status.trim().toLowerCase();

    if (['open', 'opened', 'running', 'active'].includes(normalizedStatus)) {
      return { known: true, open: true };
    }

    if (['closed', 'close', 'inactive', 'halted'].includes(normalizedStatus)) {
      return { known: true, open: false };
    }

    if (['unknown', 'unavailable', 'undefined'].includes(normalizedStatus)) {
      return { known: false, open: false };
    }
  }

  return { known: false, open: false };
};

const OpportunityCard: React.FC<{ opportunity: ScalpingOpportunity }> = ({ opportunity }) => (
  <div
    data-style-id="scalping-card"
    data-style-name="کارت نوسان‌گیری"
    className="rounded-lg shadow-md p-4 flex flex-col gap-3"
    style={{
      backgroundColor: 'var(--scalping-card-bg)',
      color: 'var(--scalping-card-color)',
      fontFamily: 'var(--scalping-card-font-family)',
      fontSize: 'var(--scalping-card-font-size)',
      borderWidth: 'var(--scalping-card-border-width)',
      borderStyle: 'var(--scalping-card-border-style)',
      borderColor: 'var(--scalping-card-border-color)'
    }}
  >
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-xl font-bold text-cyan-600 dark:text-cyan-400">
        {opportunity.symbol}
      </h3>
      <span className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
        <ArrowTrendingUpIcon />
        <span>فرصت فعال</span>
      </span>
    </div>

    <p className="text-sm text-gray-600 dark:text-gray-400 leading-6">
      <strong className="font-semibold">دلیل:</strong> {opportunity.reason || 'بدون توضیح'}
    </p>

    <div className="grid grid-cols-2 gap-3 text-xs pt-2 border-t border-gray-100 dark:border-gray-700">
      <div>
        <p className="text-gray-500 dark:text-gray-400">قیمت</p>
        <p className="font-semibold text-blue-600 dark:text-blue-400" dir="ltr">
          {formatPrice(opportunity.price)}
        </p>
      </div>
      <div>
        <p className="text-gray-500 dark:text-gray-400">امتیاز</p>
        <p className="font-semibold text-amber-600 dark:text-amber-400" dir="ltr">
          {formatScore(opportunity.score)}
        </p>
      </div>
    </div>
  </div>
);

const ScalpingTable: React.FC<{ opportunities: ScalpingOpportunity[] }> = ({ opportunities }) => (
  <div
    className="overflow-x-auto rounded-lg shadow-md border border-[var(--card-border-color)]"
    style={{ backgroundColor: 'var(--card-bg)' }}
  >
    <table className="min-w-full text-sm text-right">
      <thead
        className="uppercase text-xs"
        style={{
          backgroundColor: 'var(--table-header-bg)',
          color: 'var(--table-header-color)'
        }}
      >
        <tr>
          <th scope="col" className="px-6 py-3">نماد</th>
          <th scope="col" className="px-6 py-3">دلیل</th>
          <th scope="col" className="px-6 py-3">قیمت</th>
          <th scope="col" className="px-6 py-3">امتیاز</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[var(--table-border-color)]">
        {opportunities.map((op) => (
          <tr
            key={op.id ?? `${op.symbol}-${op.createdAt ?? op.updatedAt ?? 'row'}`}
            className="hover:bg-[var(--table-row-hover-bg)] transition-colors"
          >
            <td className="px-6 py-4 font-bold text-cyan-600 dark:text-cyan-400">
              {op.symbol}
            </td>
            <td className="px-6 py-4 text-[var(--card-color)]">{op.reason}</td>
            <td className="px-6 py-4 text-green-600 dark:text-green-400 font-mono" dir="ltr">
              {formatPrice(op.price)}
            </td>
            <td className="px-6 py-4 text-amber-600 dark:text-amber-400 font-mono" dir="ltr">
              {formatScore(op.score)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const Scalping: React.FC<ScalpingProps> = ({ isOnline }) => {
  const [opportunities, setOpportunities] = useState<ScalpingOpportunity[]>([]);
  const [status, setStatus] = useState<ScalpingStatus>(() => createDefaultStatus());
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isLoading, setIsLoading] = useState(true);

  const loadScalpingData = useCallback(async () => {
    if (!isOnline) {
      setOpportunities([]);
      setStatus(createDefaultStatus());
      setLastUpdated(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      const [statusResult, signalsResult] = await Promise.all([
        scalpingService.getScalpingStatus(),
        scalpingService.getScalpingSignals()
      ]);

      const nextSignals =
        signalsResult && Array.isArray(signalsResult.signals)
          ? signalsResult.signals
          : [];

      const nextStatus = statusResult ?? createDefaultStatus();

      setStatus(nextStatus);
      setOpportunities(nextSignals);
      setLastUpdated(resolveLastUpdated(nextStatus, signalsResult));
    } catch (error) {
      console.error('Error loading scalping data:', error);
      setOpportunities([]);
      setStatus(createDefaultStatus());
      setLastUpdated(null);
    } finally {
      setIsLoading(false);
    }
  }, [isOnline]);

  useEffect(() => {
    loadScalpingData();

    const intervalId = window.setInterval(() => {
      loadScalpingData();
    }, 60 * 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [loadScalpingData]);

  const { known: marketKnown, open: marketOpen } = resolveMarketState(status);

  const renderContent = () => {
    if (!isOnline) {
      return (
        <div
          data-style-id="scalping-placeholder"
          data-style-name="کادر پیام نوسان‌گیری"
          className="text-center py-10 bg-gray-100 dark:bg-gray-800/50 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600"
        >
          <p className="text-gray-500 dark:text-gray-500">برای مشاهده فرصت‌ها باید آنلاین باشید.</p>
        </div>
      );
    }

    if (isLoading) {
      return (
        <div
          data-style-id="scalping-placeholder"
          data-style-name="کادر پیام نوسان‌گیری"
          className="text-center py-10 bg-gray-100 dark:bg-gray-800/50 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600"
        >
          <p className="text-gray-500 dark:text-gray-500">در حال دریافت آخرین وضعیت نوسان‌گیری...</p>
        </div>
      );
    }

    if (marketKnown && !marketOpen) {
      return (
        <div
          data-style-id="scalping-placeholder"
          data-style-name="کادر پیام نوسان‌گیری"
          className="text-center py-10 bg-gray-100 dark:bg-gray-800/50 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 flex flex-col items-center justify-center gap-4"
        >
          <ClockIcon />
          <p className="text-gray-500 dark:text-gray-500 font-semibold">
            بازار بسته است و امکان نوسان‌گیری وجود ندارد
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            {lastUpdated
              ? `آخرین بررسی: ${formatRelativeTime(lastUpdated)}`
              : 'وضعیت بازار مستقیماً از سرویس بک‌اند دریافت می‌شود.'}
          </p>
        </div>
      );
    }

    if (!marketKnown) {
      return (
        <div
          data-style-id="scalping-placeholder"
          data-style-name="کادر پیام نوسان‌گیری"
          className="text-center py-10 bg-gray-100 dark:bg-gray-800/50 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 flex flex-col items-center justify-center gap-2"
        >
          <p className="text-gray-500 dark:text-gray-500">
            وضعیت بازار فعلاً قابل تأیید نیست.
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            {lastUpdated
              ? `آخرین بررسی سیستم: ${formatRelativeTime(lastUpdated)}`
              : 'زمان آخرین بررسی هنوز ثبت نشده است.'}
          </p>
        </div>
      );
    }

    if (opportunities.length > 0) {
      return viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-in">
          {opportunities.map((op) => (
            <OpportunityCard
              key={op.id ?? `${op.symbol}-${op.createdAt ?? op.updatedAt ?? 'card'}`}
              opportunity={op}
            />
          ))}
        </div>
      ) : (
        <div className="animate-fade-in">
          <ScalpingTable opportunities={opportunities} />
        </div>
      );
    }

    return (
      <div
        data-style-id="scalping-placeholder"
        data-style-name="کادر پیام نوسان‌گیری"
        className="text-center py-10 bg-gray-100 dark:bg-gray-800/50 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600"
      >
        <p className="text-gray-500 dark:text-gray-500">
          {lastUpdated
            ? 'در آخرین اسکن، فرصت مناسبی برای نوسان‌گیری یافت نشد.'
            : 'هنوز داده‌ای از آخرین اسکن ثبت نشده است.'}
        </p>
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4"
        data-style-id="scalping-header"
        data-style-name="هدر نوسان‌گیری"
      >
        <div>
          <h2 className="text-2xl font-bold text-cyan-600 dark:text-cyan-400 flex items-center gap-2">
            <ChartBarIcon />
            فرصت‌های نوسان‌گیری
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            این بخش بر اساس وضعیت بازار و خروجی canonical بک‌اند به‌روزرسانی می‌شود.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-end sm:items-center gap-3">
          <div className="flex items-center bg-gray-200 dark:bg-gray-700 rounded-lg p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === 'grid'
                  ? 'bg-white dark:bg-gray-600 shadow text-cyan-600 dark:text-cyan-400'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
              title="نمای کارتی"
              type="button"
            >
              <Squares2X2Icon className="w-5 h-5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === 'list'
                  ? 'bg-white dark:bg-gray-600 shadow text-cyan-600 dark:text-cyan-400'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
              title="نمای جدولی"
              type="button"
            >
              <ListBulletIcon className="w-5 h-5" />
            </button>
          </div>

          <div
            data-style-id="scalping-last-updated"
            data-style-name="متن آخرین بروزرسانی"
            className="text-sm text-gray-500 dark:text-gray-400 text-left sm:text-right"
          >
            {lastUpdated ? (
              <>
                <span>آخرین به‌روزرسانی:</span>
                <span className="font-semibold font-mono mx-1">
                  {formatRelativeTime(lastUpdated)}
                </span>
              </>
            ) : (
              <span>هنوز زمان به‌روزرسانی ثبت نشده است</span>
            )}
          </div>
        </div>
      </div>

      {renderContent()}
    </div>
  );
};

export default Scalping;
