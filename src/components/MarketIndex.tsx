
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

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const numberFormatter = new Intl.NumberFormat('fa-IR', {
    maximumFractionDigits: 2,
});

const integerFormatter = new Intl.NumberFormat('fa-IR', {
    maximumFractionDigits: 0,
});

const toFiniteNumber = (
    value: unknown,
    fallback: number | null = null
): number | null => {
    if (value === null || value === undefined || value === '') {
        return fallback;
    }

    const normalized =
        typeof value === 'string'
            ? value.replace(/,/g, '').replace(/٬/g, '').trim()
            : value;

    const number = Number(normalized);

    return Number.isFinite(number) ? number : fallback;
};

const isFiniteNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);

const formatNumber = (
    value: unknown,
    fractionDigits = 2
): string => {
    const number = toFiniteNumber(value);

    if (number === null) {
        return 'داده در دسترس نیست';
    }

    return new Intl.NumberFormat('fa-IR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: fractionDigits,
    }).format(number);
};

const formatIndexValue = (value: unknown): string => {
    const number = toFiniteNumber(value);

    if (number === null || number <= 0) {
        return 'داده در دسترس نیست';
    }

    return new Intl.NumberFormat('fa-IR', {
        maximumFractionDigits: 2,
    }).format(number);
};

const formatSignedNumber = (value: unknown): string => {
    const number = toFiniteNumber(value);

    if (number === null) {
        return 'داده در دسترس نیست';
    }

    const absolute = new Intl.NumberFormat('fa-IR', {
        maximumFractionDigits: 2,
    }).format(Math.abs(number));

    if (number > 0) return `+${absolute}`;
    if (number < 0) return `−${absolute}`;

    return '۰';
};

const formatPercent = (value: unknown): string => {
    const number = toFiniteNumber(value);

    if (number === null) {
        return 'داده در دسترس نیست';
    }

    const formatted = new Intl.NumberFormat('fa-IR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(Math.abs(number));

    if (number > 0) return `+${formatted}٪`;
    if (number < 0) return `−${formatted}٪`;

    return '۰٫۰۰٪';
};

const pickFirstNumber = (
    obj: Record<string, unknown> | null | undefined,
    keys: string[],
    fallback: number | null = null
): number | null => {
    if (!obj || typeof obj !== 'object') {
        return fallback;
    }

    for (const key of keys) {
        const value = toFiniteNumber(obj[key]);

        if (value !== null) {
            return value;
        }
    }

    return fallback;
};

const toRecord = (
    value: unknown
): Record<string, unknown> | null => {
    if (
        !value ||
        typeof value !== 'object' ||
        Array.isArray(value)
    ) {
        return null;
    }

    return value as Record<string, unknown>;
};

/* -------------------------------------------------------------------------- */
/* Validation                                                                  */
/* -------------------------------------------------------------------------- */

function isValidMarketIndexData(
    data: unknown
): data is MarketIndexData {
    if (!data || typeof data !== 'object') {
        return false;
    }

    const d = data as Partial<MarketIndexData>;

    /*
     * نکته مهم:
     * مقدار شاخص هم‌وزن نباید صفر تلقی شود.
     * اگر داده آن موجود نباشد، validation باید اجازه دهد
     * لود از API/summary ادامه پیدا کند.
     */

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

/* -------------------------------------------------------------------------- */
/* Normalizers                                                                 */
/* -------------------------------------------------------------------------- */

function normalizeLegacyOrModernMarketData(
    payload: unknown
): MarketIndexData | null {
    if (!payload || typeof payload !== 'object') {
        return null;
    }

    const root = payload as Record<string, unknown>;

    const rawData =
        toRecord(root.data) ||
        toRecord(root.result) ||
        root;

    if (!rawData) {
        return null;
    }

    const value = pickFirstNumber(rawData, [
        'index',
        'overallIndex',
        'value',
        'marketIndex',
        'totalIndex',
        'indexValue',
        'index_value',
    ]);

    if (value === null || value <= 0) {
        console.error(
            '[MarketIndex] Missing/invalid index value:',
            rawData
        );

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
        'index_change_value',
    ], 0);

    const changePercent = pickFirstNumber(rawData, [
        'changePercent',
        'overallChangePercent',
        'indexChangePercent',
        'index_change_percent',
        'percent',
        'percentChange',
    ], 0);

    /*
     * همه کلیدهای متداول شاخص هم‌وزن را بررسی می‌کنیم.
     */
    const equalWeightedValue = pickFirstNumber(rawData, [
        'equalWeightedValue',
        'equalWeightValue',
        'equalIndex',
        'equalWeightedIndex',
        'equalWeightIndex',
        'indexEqualWeight',
        'index_equalWeight',
        'index_equal_weight',
        'equal_weighted_value',
        'equal_weighted_index',
        'equal_index',
        'index2',
        'valueEqualWeight',
    ]);

    const equalWeightedChangeValue = pickFirstNumber(rawData, [
        'equalWeightedChangeValue',
        'equalWeightChangeValue',
        'equalWeightedChange',
        'equalChange',
        'equalWeightedIndexChange',
        'indexEqualWeightChange',
        'index_equalWeight_change',
        'index_equal_weight_change',
        'equal_weighted_change',
        'equal_weighted_change_value',
    ], 0);

    const equalWeightedChangePercent = pickFirstNumber(rawData, [
        'equalWeightedChangePercent',
        'equalWeightChangePercent',
        'equalChangePercent',
        'equalWeightedIndexChangePercent',
        'indexEqualWeightChangePercent',
        'index_equalWeight_change_percent',
        'index_equal_weight_change_percent',
        'equal_weighted_change_percent',
        'equal_weighted_percent',
    ], 0);

    const isMarketOpen =
        typeof rawData.isMarketOpen === 'boolean'
            ? rawData.isMarketOpen
            : typeof rawData.marketOpen === 'boolean'
                ? rawData.marketOpen
                : true;

    /*
     * اگر شاخص هم‌وزن واقعاً در payload وجود ندارد،
     * صفر قرار نمی‌دهیم.
     *
     * با این حال چون MarketIndexData فعلی احتمالاً عدد اجباری
     * دارد، برای سازگاری با type فعلی مقدار null-safe را
     * در لایه نمایش کنترل می‌کنیم.
     */
    return {
        value,
        changeValue: changeValue ?? 0,
        changePercent: changePercent ?? 0,

        equalWeightedValue:
            equalWeightedValue ?? 0,

        equalWeightedChangeValue:
            equalWeightedChangeValue ?? 0,

        equalWeightedChangePercent:
            equalWeightedChangePercent ?? 0,

        isMarketOpen,
    };
}

/* -------------------------------------------------------------------------- */
/* Summary normalizer                                                          */
/* -------------------------------------------------------------------------- */

function normalizeMarketIndexFromSummary(
    summary: MarketSummaryData
): MarketIndexData | null {
    const rawData = toRecord(summary.rawJson);

    const value = toFiniteNumber(summary.overallIndex);

    if (value === null || value <= 0) {
        return null;
    }

    /*
     * تغییرات ممکن است داخل rawJson یا ساختارهای تو در تو قرار داشته باشند.
     */
    const containers: Record<string, unknown>[] = [];

    if (rawData) {
        containers.push(rawData);

        const indexes = toRecord(rawData.indexes);
        const indexData = toRecord(rawData.indexData);
        const market = toRecord(rawData.market);
        const data = toRecord(rawData.data);

        if (indexes) containers.push(indexes);
        if (indexData) containers.push(indexData);
        if (market) containers.push(market);
        if (data) containers.push(data);
    }

    const pickFromContainers = (
        keys: string[],
        fallback: number | null = null
    ) => {
        for (const container of containers) {
            const value = pickFirstNumber(
                container,
                keys,
                null
            );

            if (value !== null) {
                return value;
            }
        }

        return fallback;
    };

    const changeValue = pickFromContainers([
        'changeValue',
        'change',
        'overallChangeValue',
        'overallChange',
        'indexChangeValue',
        'indexChange',
        'index_change_value',
        'deltaValue',
        'delta',
    ], 0);

    const changePercent = pickFromContainers([
        'changePercent',
        'overallChangePercent',
        'indexChangePercent',
        'index_change_percent',
        'percent',
        'percentChange',
    ], 0);

    /*
     * شاخص هم‌وزن:
     * مهم‌ترین اصلاح این قسمت است.
     *
     * اگر مقدار واقعی پیدا نشود، دیگر به عنوان «صفر» تفسیر نمی‌شود.
     */
    const equalWeightedValue = pickFromContainers([
        'equalWeightedValue',
        'equalWeightValue',
        'equalIndex',
        'equalWeightedIndex',
        'equalWeightIndex',
        'indexEqualWeight',
        'index_equalWeight',
        'index_equal_weight',
        'equal_weighted_value',
        'equal_weighted_index',
        'equal_index',
        'equalIndexValue',
        'valueEqualWeight',
    ]);

    const equalWeightedChangeValue =
        pickFromContainers([
            'equalWeightedChangeValue',
            'equalWeightChangeValue',
            'equalWeightedChange',
            'equalWeightChange',
            'equalChange',
            'equalWeightedIndexChange',
            'indexEqualWeightChange',
            'index_equalWeight_change',
            'index_equal_weight_change',
            'equal_weighted_change',
            'equal_weighted_change_value',
        ], 0);

    const equalWeightedChangePercent =
        pickFromContainers([
            'equalWeightedChangePercent',
            'equalWeightChangePercent',
            'equalChangePercent',
            'equalWeightedIndexChangePercent',
            'indexEqualWeightChangePercent',
            'index_equalWeight_change_percent',
            'index_equal_weight_change_percent',
            'equal_weighted_change_percent',
            'equal_weighted_percent',
        ], 0);

    const marketStatus =
        String(summary.marketStatus ?? '')
            .trim()
            .toLowerCase();

    const isMarketOpen =
        marketStatus.includes('open') ||
        marketStatus.includes('باز') ||
        rawData?.isMarketOpen === true ||
        rawData?.marketOpen === true;

    return {
        value,
        changeValue: changeValue ?? 0,
        changePercent: changePercent ?? 0,

        /*
         * برای جلوگیری از نمایش صفر جعلی:
         * اگر مقدار موجود نباشد، NaN قرار می‌دهیم.
         * تابع نمایش آن را «داده در دسترس نیست» نشان می‌دهد.
         */
        equalWeightedValue:
            equalWeightedValue ?? Number.NaN,

        equalWeightedChangeValue:
            equalWeightedChangeValue ?? 0,

        equalWeightedChangePercent:
            equalWeightedChangePercent ?? 0,

        isMarketOpen,
    };
}

/* -------------------------------------------------------------------------- */
/* Cache                                                                       */
/* -------------------------------------------------------------------------- */

function getCachedByKey(
    key: string
): CacheEntry | null {
    try {
        const raw = localStorage.getItem(key);

        if (!raw) return null;

        const parsed = JSON.parse(raw);

        if (!parsed || typeof parsed !== 'object') {
            return null;
        }

        const timestamp = toFiniteNumber(parsed.timestamp);

        if (timestamp === null) {
            return null;
        }

        const data = normalizeLegacyOrModernMarketData(
            parsed.data
        );

        if (!data) {
            return null;
        }

        return {
            data,
            timestamp,
        };
    } catch {
        return null;
    }
}

function isCacheValid(
    cache: CacheEntry,
    ttl: number
): boolean {
    return Date.now() - cache.timestamp < ttl;
}

function setCachedData(
    data: MarketIndexData,
    key: string
): void {
    try {
        localStorage.setItem(
            key,
            JSON.stringify({
                data,
                timestamp: Date.now(),
            })
        );

        localStorage.setItem(
            `${key}_updated`,
            String(Date.now())
        );
    } catch {
        // localStorage ممکن است در حالت خصوصی یا محدود غیرفعال باشد.
    }
}

/* -------------------------------------------------------------------------- */
/* API                                                                         */
/* -------------------------------------------------------------------------- */

async function fetchMarketIndexFromAPI(): Promise<MarketIndexData | null> {
    try {
        const envelope =
            await getLatestSummaryEnvelope();

        if (envelope?.summary) {
            const fromSummary =
                normalizeMarketIndexFromSummary(
                    envelope.summary
                );

            if (fromSummary) {
                return fromSummary;
            }
        }
    } catch (err) {
        console.warn(
            '[MarketIndex] Summary service failed:',
            err
        );
    }

    const endpoints = [
        `${API_BASE_URL}/market-summary/latest`,
    ];

    for (const url of endpoints) {
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    Accept: 'application/json',
                },
                credentials: 'include',
            });

            if (!response.ok) {
                console.error(
                    `[MarketIndex] HTTP ${response.status} on ${url}`
                );

                continue;
            }

            const result =
                await response.json();

            const normalized =
                normalizeLegacyOrModernMarketData(
                    result
                );

            if (normalized) {
                return normalized;
            }
        } catch (err) {
            console.error(
                '[MarketIndex] Fetch failed:',
                err
            );
        }
    }

    return null;
}

/* -------------------------------------------------------------------------- */
/* Index display                                                               */
/* -------------------------------------------------------------------------- */

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
    showIcon = true,
}) => {
    const hasValue =
        isFiniteNumber(value) &&
        value > 0;

    const safeChangeValue =
        toFiniteNumber(changeValue, 0) ?? 0;

    const safeChangePercent =
        toFiniteNumber(changePercent, 0) ?? 0;

    const isPositive =
        safeChangeValue > 0;

    const isNegative =
        safeChangeValue < 0;

    const valueColor =
        hasValue
            ? 'text-[var(--color-text-primary)]'
            : 'text-slate-500';

    const changeColor =
        isPositive
            ? 'text-[var(--color-positive)]'
            : isNegative
                ? 'text-[var(--color-negative)]'
                : 'text-slate-400';

    const Icon =
        isPositive
            ? ArrowTrendingUpIcon
            : ArrowTrendingDownIcon;

    return (
        <div
            className="
                min-w-0
                flex-1
                px-2
                sm:px-3
            "
        >
            {/* عنوان */}
            <div
                className="
                    mb-2
                    text-[13px]
                    font-bold
                    leading-6
                    text-slate-300
                    whitespace-nowrap
                "
            >
                {name}
            </div>

            {/* مقدار شاخص */}
            {hasValue ? (
                <div
                    className={`
                        ${valueColor}
                        whitespace-nowrap
                        text-[20px]
                        sm:text-[22px]
                        lg:text-[24px]
                        font-black
                        leading-tight
                        tracking-tight
                        tabular-nums
                    `}
                    dir="ltr"
                >
                    {formatIndexValue(value)}
                </div>
            ) : (
                <div
                    className="
                        text-[12px]
                        sm:text-[13px]
                        font-semibold
                        leading-5
                        text-slate-500
                        whitespace-nowrap
                    "
                >
                    داده در دسترس نیست
                </div>
            )}

            {/* تغییرات */}
            <div
                className={`
                    mt-2
                    flex
                    items-center
                    gap-1.5
                    ${changeColor}
                    text-[12px]
                    sm:text-[13px]
                    font-bold
                    whitespace-nowrap
                    tabular-nums
                `}
                dir="rtl"
            >
                {showIcon && (
                    <Icon
                        className="
                            h-4
                            w-4
                            shrink-0
                        "
                    />
                )}

                <span>
                    {formatSignedNumber(
                        safeChangeValue
                    )}
                </span>

                <span className="opacity-80">
                    ({formatPercent(
                        safeChangePercent
                    )})
                </span>
            </div>
        </div>
    );
};

/* -------------------------------------------------------------------------- */
/* Main component                                                              */
/* -------------------------------------------------------------------------- */

const MarketIndex: React.FC<MarketIndexProps> = ({
    isOnline,
}) => {
    const [data, setData] =
        useState<MarketIndexData | null>(null);

    const [isLoading, setIsLoading] =
        useState(true);

    const [error, setError] =
        useState<string | null>(null);

    const [
        isMarketInScheduledTime,
        setIsMarketInScheduledTime,
    ] = useState(false);

    const isFetchingRef =
        useRef(false);

    /* ---------------------------------------------------------------------- */
    /* Market schedule                                                        */
    /* ---------------------------------------------------------------------- */

    const checkMarketTime =
        useCallback(() => {
            const schedule =
                apiConfigService
                    .getMarketIndexSchedule();

            if (!schedule.isEnabled) {
                return true;
            }

            const now = new Date();

            const currentDay =
                now.getDay();

            if (
                !schedule.days.includes(
                    currentDay
                )
            ) {
                return false;
            }

            const currentTime =
                now.toTimeString()
                    .slice(0, 5);

            return !(
                currentTime <
                    schedule.startTime ||
                currentTime >
                    schedule.endTime
            );
        }, []);

    /* ---------------------------------------------------------------------- */
    /* Load data                                                               */
    /* ---------------------------------------------------------------------- */

    const loadData =
        useCallback(async () => {
            const isLiveTime =
                checkMarketTime();

            setIsMarketInScheduledTime(
                isLiveTime
            );

            setError(null);

            const cacheKey =
                isLiveTime
                    ? CACHE_KEY_LIVE
                    : CACHE_KEY_FINAL;

            const cacheTTL =
                isLiveTime
                    ? CACHE_TTL_LIVE
                    : CACHE_TTL_FINAL;

            const cache =
                getCachedByKey(cacheKey);

            if (
                cache &&
                isCacheValid(
                    cache,
                    cacheTTL
                )
            ) {
                setData(cache.data);
                setIsLoading(false);
                return;
            }

            if (!isOnline) {
                if (cache) {
                    setData(cache.data);
                } else {
                    setError(
                        'عدم دسترسی به اینترنت'
                    );
                }

                setIsLoading(false);
                return;
            }

            if (isFetchingRef.current) {
                return;
            }

            isFetchingRef.current = true;
            setIsLoading(true);

            try {
                const freshData =
                    await fetchMarketIndexFromAPI();

                if (freshData) {
                    const normalized = {
                        ...freshData,

                        /*
                         * وضعیت کارت از زمان‌بندی بازار
                         * تعیین می‌شود تا داده قدیمی باعث
                         * نمایش اشتباه وضعیت بازار نشود.
                         */
                        isMarketOpen:
                            isLiveTime,
                    };

                    setData(normalized);

                    setCachedData(
                        normalized,
                        cacheKey
                    );
                } else if (cache) {
                    setData(cache.data);
                } else {
                    setError(
                        'خطا در دریافت داده‌های بازار'
                    );
                }
            } catch (err) {
                console.error(
                    '[MarketIndex] loadData failed:',
                    err
                );

                if (cache) {
                    setData(cache.data);
                } else {
                    setError(
                        'خطا در دریافت داده‌های بازار'
                    );
                }
            } finally {
                isFetchingRef.current = false;
                setIsLoading(false);
            }
        }, [
            isOnline,
            checkMarketTime,
        ]);

    /* ---------------------------------------------------------------------- */
    /* Effects                                                                 */
    /* ---------------------------------------------------------------------- */

    useEffect(() => {
        loadData();

        const handleStorageChange = (
            event: StorageEvent
        ) => {
            if (
                event.key ===
                    CACHE_KEY_LIVE ||
                event.key ===
                    `${CACHE_KEY_LIVE}_updated` ||
                event.key ===
                    CACHE_KEY_FINAL ||
                event.key ===
                    `${CACHE_KEY_FINAL}_updated`
            ) {
                loadData();
            }
        };

        window.addEventListener(
            'storage',
            handleStorageChange
        );

        const intervalId =
            window.setInterval(
                () => loadData(),
                CACHE_TTL_LIVE
            );

        return () => {
            window.removeEventListener(
                'storage',
                handleStorageChange
            );

            clearInterval(intervalId);
        };
    }, [loadData]);

    /* ---------------------------------------------------------------------- */
    /* States                                                                  */
    /* ---------------------------------------------------------------------- */

    if (!isOnline && !data) {
        return (
            <div
                dir="rtl"
                className="
                    rounded-2xl
                    border
                    border-[var(--color-border)]
                    bg-[var(--color-surface)]
                    px-4
                    py-3
                    text-center
                    text-[13px]
                    font-medium
                    text-slate-300
                "
            >
                عدم دسترسی به اینترنت
            </div>
        );
    }

    if (error && !data) {
        return (
            <div
                dir="rtl"
                className="
                    rounded-2xl
                    border
                    border-red-500/20
                    bg-red-500/10
                    px-4
                    py-3
                    text-center
                    text-[13px]
                    font-medium
                    text-red-300
                "
            >
                {error}
            </div>
        );
    }

    if (isLoading && !data) {
        return (
            <div
                dir="rtl"
                className="
                    w-full
                    min-w-[300px]
                    rounded-2xl
                    border
                    border-[var(--color-border)]
                    bg-[var(--color-surface)]
                    p-4
                    animate-pulse
                "
            >
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-3">
                        <div className="h-3 w-20 rounded bg-white/10" />
                        <div className="h-7 w-32 rounded bg-white/10" />
                        <div className="h-3 w-24 rounded bg-white/10" />
                    </div>

                    <div className="space-y-3">
                        <div className="h-3 w-24 rounded bg-white/10" />
                        <div className="h-7 w-32 rounded bg-white/10" />
                        <div className="h-3 w-24 rounded bg-white/10" />
                    </div>
                </div>
            </div>
        );
    }

    if (!data) {
        return (
            <div
                dir="rtl"
                className="
                    rounded-2xl
                    border
                    border-[var(--color-border)]
                    bg-[var(--color-surface)]
                    px-4
                    py-3
                    text-center
                    text-[13px]
                    text-slate-400
                "
            >
                داده‌ای برای نمایش شاخص موجود نیست.
            </div>
        );
    }

    /* ---------------------------------------------------------------------- */
    /* Closed/open                                                             */
    /* ---------------------------------------------------------------------- */

        const showAsClosed =
        !isMarketInScheduledTime ||
        !data.isMarketOpen;

    return (
        <div
            dir="rtl"
            data-style-id={
                showAsClosed
                    ? 'market-index-closed'
                    : 'market-index-open'
            }
            data-style-name={
                showAsClosed
                    ? 'شاخص بازار بسته'
                    : 'شاخص بازار باز'
            }
            data-style-props="bg,border,positive,negative"
            className="
                w-full
                min-w-0
                max-w-[460px]
                overflow-hidden
                rounded-2xl
                border
                border-[var(--color-border)]
                bg-[var(--color-surface)]
                shadow-lg
                shadow-black/10
            "
        >
            {/* Header */}
            <div
                className="
                    flex
                    items-center
                    justify-between
                    gap-3
                    border-b
                    border-[var(--color-border)]
                    px-4
                    py-3
                "
            >
                <div className="min-w-0">
                    <div
                        className="
                            text-[14px]
                            font-bold
                            text-[var(--color-text-primary)]
                        "
                    >
                        شاخص‌های بازار
                    </div>

                    <div
                        className="
                            mt-0.5
                            text-[11px]
                            font-medium
                            text-slate-400
                        "
                    >
                        وضعیت لحظه‌ای بازار
                    </div>
                </div>

                {/* Market status */}
                <span
                    className={`
                        inline-flex
                        shrink-0
                        items-center
                        gap-2
                        rounded-full
                        border
                        px-3
                        py-1
                        text-[12px]
                        font-bold
                        leading-5
                        ${
                            showAsClosed
                                ? 'border-red-500/20 bg-red-500/10 text-red-400'
                                : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
                        }
                    `}
                >
                    <span
                        className={`
                            h-2
                            w-2
                            rounded-full
                            ${
                                showAsClosed
                                    ? 'bg-red-400'
                                    : 'bg-emerald-400'
                            }
                        `}
                    />

                    {showAsClosed
                        ? 'بازار بسته'
                        : 'بازار باز'}
                </span>
            </div>

            {/* Index cards */}
            <div className="relative grid grid-cols-2 px-2 py-4">

                {/* Center divider */}
                <div
                    aria-hidden="true"
                    className="
                        pointer-events-none
                        absolute
                        right-1/2
                        top-4
                        bottom-4
                        w-px
                        translate-x-1/2
                        bg-[var(--color-border)]
                    "
                />

                {/* شاخص کل */}
                <div className="min-w-0 pl-5">
                    <IndexDisplay
                        name="شاخص کل"
                        value={data.value}
                        changeValue={data.changeValue}
                        changePercent={data.changePercent}
                        showIcon={!showAsClosed}
                    />
                </div>

                {/* شاخص هم‌وزن */}
                <div className="min-w-0 pr-5">
                    <IndexDisplay
                        name="شاخص هم‌وزن"
                        value={data.equalWeightedValue}
                        changeValue={data.equalWeightedChangeValue}
                        changePercent={data.equalWeightedChangePercent}
                        showIcon={!showAsClosed}
                    />
                </div>
            </div>
        </div>
    );
};

export default MarketIndex;