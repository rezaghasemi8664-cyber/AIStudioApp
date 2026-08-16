import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as apiConfigService from '../services/apiConfigService';
import { API_BASE_URL } from '../api/config';
import type { MarketIndexData } from '../types';
import { ArrowTrendingUpIcon, ArrowTrendingDownIcon } from './Icons';

interface MarketIndexProps {
    isOnline: boolean;
}

interface CacheEntry {
    data: MarketIndexData;
    timestamp: number;
}

// فقط برای متن فارسی عمومی (در صورت نیاز)
const formatNumberFa = (num: number, options?: Intl.NumberFormatOptions) =>
    new Intl.NumberFormat('fa-IR', options).format(num);

// برای نمایش اعداد تغییر و درصد با ارقام انگلیسی
const formatNumberEn = (num: number, options?: Intl.NumberFormatOptions) =>
    new Intl.NumberFormat('en-US', options).format(num);

// تبدیل ایمن به عدد (مقاوم در برابر null/undefined/string/NaN)
const toSafeNumber = (value: unknown, fallback = 0): number => {
    const num = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(num) ? num : fallback;
};

interface IndexDisplayProps {
    name: string;
    value: number;
    changeValue: number;
    changePercent: number; // 1.25 یعنی 1.25%
    showIcon?: boolean;
}

const IndexDisplay: React.FC<IndexDisplayProps> = ({
    name,
    value,
    changeValue,
    changePercent,
    showIcon = true
}) => {
    const safeValue = toSafeNumber(value);
    const safeChangeValue = toSafeNumber(changeValue);
    const safeChangePercent = toSafeNumber(changePercent);

    const isPositive = safeChangeValue >= 0;
    const colorClass = isPositive ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]';
    const Icon = isPositive ? ArrowTrendingUpIcon : ArrowTrendingDownIcon;

    return (
        <div className="flex-1 min-w-0">
            <h4 className="text-xs text-gray-500 dark:text-gray-400 font-semibold mb-1 truncate">{name}</h4>
            <div className={`flex items-center gap-2 font-mono ${colorClass}`}>
                {showIcon && <Icon className="h-5 w-5 flex-shrink-0" />}
                <div className="flex flex-col items-start min-w-0">
                    <span className="font-bold text-base text-[var(--color-text-primary)] truncate">
                        {safeValue.toLocaleString('en-US')}
                    </span>
                    <div className="flex items-center gap-2 text-xs">
                        <span className="whitespace-nowrap">
                            {formatNumberEn(safeChangeValue, {
                                signDisplay: 'always',
                                maximumFractionDigits: 2
                            })}
                        </span>
                        <span className="whitespace-nowrap">
                            {formatNumberEn(safeChangePercent / 100, {
                                style: 'percent',
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                                signDisplay: 'always'
                            })}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};

const CACHE_KEY_LIVE = 'ronia_market_index_cache';
const CACHE_KEY_FINAL = 'ronia_market_index_final_daily';
const CACHE_TTL_LIVE = 2 * 60 * 1000;
const CACHE_TTL_FINAL = 10 * 60 * 1000;

function getCachedByKey(key: string): CacheEntry | null {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function isCacheValid(cache: CacheEntry, ttl: number): boolean {
    return Date.now() - cache.timestamp < ttl;
}

function setCachedData(data: MarketIndexData, key: string): void {
    try {
        localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
        localStorage.setItem(`${key}_updated`, String(Date.now()));
    } catch {
        // ignore
    }
}

async function fetchMarketIndexFromAPI(): Promise<MarketIndexData | null> {
    try {
        const response = await fetch(`${API_BASE_URL}/market/index`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
        });

        if (!response.ok) return null;

        const result = await response.json();
        const rawData = result.data || result;

        if (!rawData || typeof rawData.index !== 'number') return null;

        const marketData: MarketIndexData = {
            value: toSafeNumber(rawData.index),
            change: toSafeNumber(rawData.indexChange ?? rawData.index_change),
            changePercent: toSafeNumber(rawData.changePercent ?? rawData.indexChangePercent ?? rawData.index_change_percent),
            equalWeightedValue: toSafeNumber(rawData.indexEqualWeight ?? rawData.index_equalWeight),
            equalWeightedChange: toSafeNumber(rawData.indexEqualWeightChange ?? rawData.index_equalWeight_change),
            equalWeightedChangePercent: toSafeNumber(
                rawData.equalWeightedChangePercent ?? rawData.indexEqualWeightChangePercent ?? rawData.index_equalWeight_change_percent
            ),
            isMarketOpen: rawData.isMarketOpen ?? true,
            lastUpdate:
                rawData.lastUpdate ||
                (rawData.date && rawData.time ? `${rawData.date} ${rawData.time}` : new Date().toISOString()),
            timestamp: Date.now()
        };

        return marketData;
    } catch {
        return null;
    }
}

const MarketIndex: React.FC<MarketIndexProps> = ({ isOnline }) => {
    const [data, setData] = useState<MarketIndexData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isMarketInScheduledTime, setIsMarketInScheduledTime] = useState(false);

    const isFetchingRef = useRef(false);

    const checkMarketTime = useCallback(() => {
        const schedule = apiConfigService.getMarketIndexSchedule();
        if (!schedule.isEnabled) return false;

        const now = new Date();
        const currentDay = now.getDay();
        if (!schedule.days.includes(currentDay)) return false;

        const currentTime = now.toTimeString().slice(0, 5);
        return !(currentTime < schedule.startTime || currentTime > schedule.endTime);
    }, []);

    const loadData = useCallback(async () => {
        const isLiveTime = checkMarketTime();
        setIsMarketInScheduledTime(isLiveTime);
        setError(null);

        const cacheKey = isLiveTime ? CACHE_KEY_LIVE : CACHE_KEY_FINAL;
        const cacheTTL = isLiveTime ? CACHE_TTL_LIVE : CACHE_TTL_FINAL;
        const cache = getCachedByKey(cacheKey);

        if (cache && isCacheValid(cache, cacheTTL)) {
            setData(cache.data);
            setIsLoading(false);
            return;
        }

        if (!isOnline) {
            if (cache) setData(cache.data);
            else setError('عدم دسترسی به اینترنت');
            setIsLoading(false);
            return;
        }

        if (isFetchingRef.current) return;
        isFetchingRef.current = true;
        setIsLoading(true);

        try {
            const freshData = await fetchMarketIndexFromAPI();

            if (freshData) {
                const normalized = { ...freshData, isMarketOpen: isLiveTime };
                setData(normalized);
                setCachedData(normalized, cacheKey);
            } else if (cache) {
                setData(cache.data);
            } else {
                setError('خطا در دریافت داده‌های بازار');
            }
        } catch {
            if (cache) setData(cache.data);
            else setError('خطا در دریافت داده‌های بازار');
        } finally {
            isFetchingRef.current = false;
            setIsLoading(false);
        }
    }, [isOnline, checkMarketTime]);

    useEffect(() => {
        loadData();

        const handleStorageChange = (event: StorageEvent) => {
            if (
                event.key === CACHE_KEY_LIVE ||
                event.key === `${CACHE_KEY_LIVE}_updated` ||
                event.key === CACHE_KEY_FINAL ||
                event.key === `${CACHE_KEY_FINAL}_updated`
            ) {
                loadData();
            }
        };

        window.addEventListener('storage', handleStorageChange);
        const intervalId = setInterval(() => loadData(), CACHE_TTL_LIVE);

        return () => {
            window.removeEventListener('storage', handleStorageChange);
            clearInterval(intervalId);
        };
    }, [loadData]);

    if (!isOnline && !data) {
        return (
            <div className="bg-gray-200 dark:bg-gray-800/50 p-2 rounded-lg text-xs text-gray-700 dark:text-gray-300">
                عدم دسترسی به اینترنت
            </div>
        );
    }

    if (error && !data) {
        return (
            <div className="bg-red-100 dark:bg-red-900/30 p-2 rounded-lg text-xs text-red-700 dark:text-red-300">
                {error}
            </div>
        );
    }

    if (isLoading && !data) {
        return (
            <div className="bg-gray-200 dark:bg-gray-800/50 p-3 rounded-lg flex items-center gap-4 animate-pulse w-full max-w-sm">
                <div className="flex-1 space-y-2">
                    <div className="h-3 w-16 bg-gray-300 dark:bg-gray-700 rounded"></div>
                    <div className="h-5 w-24 bg-gray-300 dark:bg-gray-700 rounded"></div>
                </div>
                <div className="border-l h-8 border-gray-300 dark:border-gray-600"></div>
                <div className="flex-1 space-y-2">
                    <div className="h-3 w-20 bg-gray-300 dark:bg-gray-700 rounded"></div>
                    <div className="h-5 w-20 bg-gray-300 dark:bg-gray-700 rounded"></div>
                </div>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="bg-gray-200 dark:bg-gray-800/50 p-2 rounded-lg text-xs text-gray-500">
                داده‌ای موجود نیست
            </div>
        );
    }

    const showAsClosed = !isMarketInScheduledTime || !data.isMarketOpen;

    if (showAsClosed) {
        return (
            <div
                data-style-id="market-index-closed"
                data-style-name="شاخص (بازار بسته)"
                data-style-props="bg,border,text,accent"
                className="bg-[var(--color-surface)] border border-[var(--color-border)] p-3 rounded-lg w-full max-w-sm"
            >
                <div className="flex items-start justify-between gap-4">
                    <IndexDisplay
                        name="شاخص کل"
                        value={toSafeNumber(data.value)}
                        changeValue={toSafeNumber(data.change)}
                        changePercent={toSafeNumber(data.changePercent)} // اصلاح اصلی
                        showIcon={false}
                    />

                    <div className="border-l h-12 border-[var(--color-border)]"></div>

                    <IndexDisplay
                        name="شاخص هم وزن"
                        value={toSafeNumber(data.equalWeightedValue)}
                        changeValue={toSafeNumber(data.equalWeightedChange)}
                        changePercent={toSafeNumber(data.equalWeightedChangePercent)}
                        showIcon={false}
                    />
                </div>
                <p className="text-xs text-center text-gray-400 mt-2">(بازار تعطیل است)</p>
            </div>
        );
    }

    return (
        <div
            data-style-id="market-index-open"
            data-style-name="شاخص (بازار باز)"
            data-style-props="bg,border,positive,negative"
            className="bg-[var(--color-surface)] border border-[var(--color-border)] p-3 rounded-lg flex items-center gap-4 w-full max-w-sm"
        >
            <IndexDisplay
                name="شاخص کل"
                value={toSafeNumber(data.value)}
                changeValue={toSafeNumber(data.change)}
                changePercent={toSafeNumber(data.changePercent)}
            />
            <div className="border-l h-10 border-[var(--color-border)]"></div>
            <IndexDisplay
                name="شاخص کل (هم وزن)"
                value={toSafeNumber(data.equalWeightedValue)}
                changeValue={toSafeNumber(data.equalWeightedChange)}
                changePercent={toSafeNumber(data.equalWeightedChangePercent)}
            />
        </div>
    );
};

export default MarketIndex;
