import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as apiConfigService from '../services/apiConfigService';
import { API_BASE_URL } from '../api/config';
import { getLatestSummaryEnvelope } from '../services/marketSummaryService';
import type { MarketIndexData } from '../types';
import type { MarketSummaryData } from '../services/marketSummaryService';
import { ArrowTrendingUpIcon, ArrowTrendingDownIcon } from './Icons';

interface MarketIndexProps {
    isOnline: boolean;
}

interface CacheEntry {
    data: MarketIndexData;
    timestamp: number;
}

const CACHE_KEY_LIVE = 'ronia_market_index_cache';
const CACHE_KEY_FINAL = 'ronia_market_index_final_daily';
const CACHE_TTL_LIVE = 2 * 60 * 1000;
const CACHE_TTL_FINAL = 10 * 60 * 1000;

const formatNumberEn = (num: number, options?: Intl.NumberFormatOptions) =>
    new Intl.NumberFormat('en-US', options).format(num);

const toSafeNumber = (value: unknown, fallback = 0): number => {
    const num = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(num) ? num : fallback;
};

const isFiniteNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);

const pickFirstNumber = (
    obj: Record<string, unknown> | null | undefined,
    keys: string[],
    fallback = 0
): number => {
    if (!obj || typeof obj !== 'object') return fallback;

    for (const key of keys) {
        const val = obj[key];
        const num = typeof val === 'number' ? val : Number(val);
        if (Number.isFinite(num)) return num;
    }

    return fallback;
};

const toRecord = (value: unknown): Record<string, unknown> | null => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
};

function isValidMarketIndexData(data: unknown): data is MarketIndexData {
    if (!data || typeof data !== 'object') return false;
    const d = data as Partial<MarketIndexData>;

    return (
        isFiniteNumber(d.value) &&
        isFiniteNumber(d.changeValue) &&
        isFiniteNumber(d.changePercent) &&
        isFiniteNumber(d.equalWeightedValue) &&
        isFiniteNumber(d.equalWeightedChangeValue) &&
        isFiniteNumber(d.equalWeightedChangePercent) &&
        typeof d.isMarketOpen === 'boolean'
    );
}

function normalizeLegacyOrModernMarketData(payload: unknown): MarketIndexData | null {
    if (!payload || typeof payload !== 'object') return null;

    const root = payload as Record<string, unknown>;
    const rawData =
        toRecord(root.data) ||
        toRecord(root.result) ||
        root;

    if (!rawData || typeof rawData !== 'object') return null;

    const value = pickFirstNumber(rawData, [
        'index',
        'overallIndex',
        'value',
        'marketIndex',
        'totalIndex'
    ], NaN);

    if (!Number.isFinite(value)) {
        console.error('[MarketIndex] Missing/invalid index value in payload:', rawData);
        return null;
    }

    const changeValue = pickFirstNumber(rawData, [
        'changeValue',
        'change',
        'overallChangeValue',
        'overallChange',
        'indexChange',
        'index_change',
        'delta',
        'index_change_value'
    ], NaN);

    const changePercent = pickFirstNumber(rawData, [
        'changePercent',
        'overallChangePercent',
        'indexChangePercent',
        'index_change_percent',
        'percent',
        'percentChange'
    ], NaN);

    const equalWeightedValue = pickFirstNumber(rawData, [
        'equalWeightedValue',
        'equalIndex',
        'indexEqualWeight',
        'index_equalWeight',
        'index_equal_weight',
        'equal_weighted_value'
    ], NaN);

    const equalWeightedChangeValue = pickFirstNumber(rawData, [
        'equalWeightedChangeValue',
        'equalWeightedChange',
        'equalChange',
        'indexEqualWeightChange',
        'index_equalWeight_change',
        'index_equal_weight_change',
        'equal_weighted_change'
    ], NaN);

    const equalWeightedChangePercent = pickFirstNumber(rawData, [
        'equalWeightedChangePercent',
        'equalChangePercent',
        'indexEqualWeightChangePercent',
        'index_equalWeight_change_percent',
        'index_equal_weight_change_percent',
        'equal_weighted_change_percent'
    ], NaN);

    const isMarketOpen =
        typeof rawData.isMarketOpen === 'boolean'
            ? rawData.isMarketOpen
            : typeof rawData.marketOpen === 'boolean'
            ? rawData.marketOpen
            : true;

    return {
        value: toSafeNumber(value),
        changeValue: toSafeNumber(changeValue),
        changePercent: toSafeNumber(changePercent),
        equalWeightedValue: toSafeNumber(equalWeightedValue),
        equalWeightedChangeValue: toSafeNumber(equalWeightedChangeValue),
        equalWeightedChangePercent: toSafeNumber(equalWeightedChangePercent),
        isMarketOpen
    };
}

function normalizeMarketIndexFromSummary(summary: MarketSummaryData): MarketIndexData | null {
    const rawData = toRecord(summary.rawJson);
    const marketStatus = (summary.marketStatus ?? '').toString().trim().toLowerCase();

    const value = toSafeNumber(summary.overallIndex);
    if (!Number.isFinite(value)) return null;

    const changeValue = pickFirstNumber(rawData, [
        'changeValue',
        'change',
        'overallChangeValue',
        'indexChangeValue',
        'index_change_value',
        'deltaValue'
    ], Number.NaN);

    const changePercent = pickFirstNumber(rawData, [
        'changePercent',
        'overallChangePercent',
        'indexChangePercent',
        'index_change_percent',
        'percent',
        'percentChange'
    ], Number.NaN);

    const equalWeightedValue =
        rawData
            ? pickFirstNumber(rawData, [
                  'equalWeightedValue',
                  'equalIndex',
                  'indexEqualWeight',
                  'index_equalWeight',
                  'index_equal_weight'
              ], Number.NaN)
            : Number.NaN;

    const equalWeightedChangeValue =
        rawData
            ? pickFirstNumber(rawData, [
                  'equalWeightedChangeValue',
                  'equalWeightedChange',
                  'equalChange',
                  'indexEqualWeightChange',
                  'index_equalWeight_change',
                  'index_equal_weight_change'
              ], Number.NaN)
            : Number.NaN;

    const equalWeightedChangePercent =
        rawData
            ? pickFirstNumber(rawData, [
                  'equalWeightedChangePercent',
                  'equalChangePercent',
                  'indexEqualWeightChangePercent',
                  'index_equalWeight_change_percent',
                  'index_equal_weight_change_percent'
              ], Number.NaN)
            : Number.NaN;

    const isMarketOpen =
        marketStatus.includes('open') ||
        marketStatus.includes('باز') ||
        (rawData?.isMarketOpen === true) || 
          (rawData?.marketOpen === true) || 
          false; // اگر هیچکدام نبود پیش‌فرض false
    return {
        value: toSafeNumber(value),
        changeValue: toSafeNumber(changeValue, 0),
        changePercent: toSafeNumber(changePercent, 0),
        equalWeightedValue: toSafeNumber(equalWeightedValue, 0),
        equalWeightedChangeValue: toSafeNumber(equalWeightedChangeValue, 0),
        equalWeightedChangePercent: toSafeNumber(equalWeightedChangePercent, 0),
        isMarketOpen
    };
}

function getCachedByKey(key: string): CacheEntry | null {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;

        const parsed = JSON.parse(raw) as Partial<CacheEntry> | unknown;

        if (!parsed || typeof parsed !== 'object') return null;

        const obj = parsed as Partial<CacheEntry>;
        if (!isFiniteNumber(obj.timestamp)) return null;

        const data = isValidMarketIndexData(obj.data)
            ? obj.data
            : normalizeLegacyOrModernMarketData((obj as Record<string, unknown>).data);

        if (!data || !isValidMarketIndexData(data)) return null;

        return {
            data,
            timestamp: obj.timestamp
        };
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
        const envelope = await getLatestSummaryEnvelope();
        if (envelope?.summary) {
            const fromSummary = normalizeMarketIndexFromSummary(envelope.summary);
            if (fromSummary) return fromSummary;
        }
    } catch (err) {
        console.warn('[MarketIndex] marketSummaryService failed, fallback to legacy endpoints:', err);
    }

    const endpoints = [
        `${API_BASE_URL}/market/index`,
        `${API_BASE_URL}/market/summary`,
        `${API_BASE_URL}/market-summary/latest`
    ];

    for (const url of endpoints) {
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: { Accept: 'application/json' },
                credentials: 'include'
            });

            if (!response.ok) {
                let errBody = '';
                try {
                    errBody = await response.text();
                } catch {
                    // ignore
                }
                console.error(`[MarketIndex] HTTP ${response.status} on ${url}`, errBody);
                continue;
            }

            const result = await response.json();
            const normalized = normalizeLegacyOrModernMarketData(result);

            if (normalized) return normalized;

            console.error('[MarketIndex] Invalid payload shape from', url, result);
        } catch (err) {
            console.error('[MarketIndex] Fetch failed on', url, err);
        }
    }

    return null;
}

interface IndexDisplayProps {
    name: string;
    value: number;
    changeValue: number;
    changePercent: number;
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
            <h4 className="text-xs text-gray-500 dark:text-gray-400 font-semibold mb-1 truncate">
                {name}
            </h4>
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

const MarketIndex: React.FC<MarketIndexProps> = ({ isOnline }) => {
    const [data, setData] = useState<MarketIndexData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isMarketInScheduledTime, setIsMarketInScheduledTime] = useState(false);

    const isFetchingRef = useRef(false);

    const checkMarketTime = useCallback(() => {
        const schedule = apiConfigService.getMarketIndexSchedule();

        // اگر زمان‌بندی غیرفعال باشد، نباید بازار را بسته فرض کنیم
        if (!schedule.isEnabled) return true;

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
        } catch (err) {
            console.error('[MarketIndex] loadData failed:', err);
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
        const intervalId = window.setInterval(() => loadData(), CACHE_TTL_LIVE);

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
                        changeValue={toSafeNumber(data.changeValue)}
                        changePercent={toSafeNumber(data.changePercent)}
                        showIcon={false}
                    />

                    <div className="border-l h-12 border-[var(--color-border)]"></div>

                    <IndexDisplay
                        name="شاخص هم وزن"
                        value={toSafeNumber(data.equalWeightedValue)}
                        changeValue={toSafeNumber(data.equalWeightedChangeValue)}
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
                changeValue={toSafeNumber(data.changeValue)}
                changePercent={toSafeNumber(data.changePercent)}
            />
            <div className="border-l h-10 border-[var(--color-border)]"></div>
            <IndexDisplay
                name="شاخص کل (هم وزن)"
                value={toSafeNumber(data.equalWeightedValue)}
                changeValue={toSafeNumber(data.equalWeightedChangeValue)}
                changePercent={toSafeNumber(data.equalWeightedChangePercent)}
            />
        </div>
    );
};

export default MarketIndex;
