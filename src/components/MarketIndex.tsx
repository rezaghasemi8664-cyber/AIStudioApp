import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as apiConfigService from '../services/apiConfigService';
import { API_BASE_URL } from '../api/config';
import type { MarketIndexData } from '../types';
import { ArrowTrendingUpIcon, ArrowTrendingDownIcon } from './Icons';

interface MarketIndexProps { isOnline: boolean; }
interface CacheEntry { data: MarketIndexData; timestamp: number; meta?: { status: 'LIVE' | 'CACHED' | 'UNAVAILABLE'; source?: string; fetchedAt?: string; stale?: boolean }; }

const CACHE_KEY_LIVE = 'ronia_market_index_cache_v2';
const CACHE_KEY_FINAL = 'ronia_market_index_final_daily_v2';
const CACHE_TTL_LIVE = 2 * 60 * 1000;
const CACHE_TTL_FINAL = 10 * 60 * 1000;
const MARKET_INDEX_REQUEST_TIMEOUT_MS = 3000;


const toFiniteNumber = (value: unknown, fallback: number | null = null): number | null => {
    if (value === null || value === undefined || value === '') return fallback;
    const normalized = typeof value === 'string' ? value.replace(/,/g, '').replace(/٬/g, '').trim() : value;
    const number = Number(normalized);
    return Number.isFinite(number) ? number : fallback;
};
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const formatIndexValue = (value: unknown): string => { const number = toFiniteNumber(value); return number === null || number <= 0 ? 'داده در دسترس نیست' : new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 2 }).format(number); };
const formatSignedNumber = (value: unknown): string => { const number = toFiniteNumber(value); if (number === null) return 'داده در دسترس نیست'; const absolute = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 2 }).format(Math.abs(number)); return number > 0 ? `+${absolute}` : number < 0 ? `−${absolute}` : '۰'; };
const formatPercent = (value: unknown): string => { const number = toFiniteNumber(value); if (number === null) return 'داده در دسترس نیست'; const formatted = new Intl.NumberFormat('fa-IR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(number)); return number > 0 ? `+${formatted}٪` : number < 0 ? `−${formatted}٪` : '۰٫۰۰٪'; };

const pickFirstNumber = (obj: Record<string, unknown> | null | undefined, keys: string[], fallback: number | null = null): number | null => {
    if (!obj || typeof obj !== 'object') return fallback;
    for (const key of keys) { const value = toFiniteNumber(obj[key]); if (value !== null) return value; }
    return fallback;
};
const toRecord = (value: unknown): Record<string, unknown> | null => !value || typeof value !== 'object' || Array.isArray(value) ? null : value as Record<string, unknown>;

function normalizeLegacyOrModernMarketData(payload: unknown): MarketIndexData | null {
    if (!payload || typeof payload !== 'object') return null;
    const root = payload as Record<string, unknown>;
    const rawData = toRecord(root.data) || toRecord(root.result) || root;
    if (!rawData) return null;
    const value = pickFirstNumber(rawData, ['index', 'overallIndex', 'value', 'marketIndex', 'totalIndex', 'indexValue', 'index_value']);
    if (value === null || value <= 0) { console.error('[MarketIndex] Missing/invalid index value:', rawData); return null; }
    const changeValue = pickFirstNumber(rawData, ['changeValue', 'change', 'overallChangeValue', 'overallChange', 'indexChange', 'index_change', 'delta', 'index_change_value']);
    const changePercent = pickFirstNumber(rawData, ['changePercent', 'overallChangePercent', 'indexChangePercent', 'index_change_percent', 'percent', 'percentChange']);
    const resolvedChangePercent = changePercent ?? (changeValue !== null && value - changeValue !== 0 ? (changeValue / (value - changeValue)) * 100 : null);
    const equalWeightedValue = pickFirstNumber(rawData, ['equalWeightedValue', 'equalWeightValue', 'equalIndex', 'equalWeightedIndex', 'equalWeightIndex', 'indexEqualWeight', 'index_equalWeight', 'index_equal_weight', 'equal_weighted_value', 'equal_weighted_index', 'equal_index', 'index2', 'valueEqualWeight']);
    const equalWeightedChangeValue = pickFirstNumber(rawData, ['equalWeightedChangeValue', 'equalWeightChangeValue', 'equalWeightedChange', 'equalChange', 'equalWeightedIndexChange', 'indexEqualWeightChange', 'index_equalWeight_change', 'index_equal_weight_change', 'equal_weighted_change', 'equal_weighted_change_value']);
    const equalWeightedChangePercent = pickFirstNumber(rawData, ['equalWeightedChangePercent', 'equalWeightChangePercent', 'equalChangePercent', 'equalWeightedIndexChangePercent', 'indexEqualWeightChangePercent', 'index_equalWeight_change_percent', 'index_equal_weight_change_percent', 'equal_weighted_change_percent', 'equal_weighted_percent']);
    const resolvedEqualChangePercent = equalWeightedChangePercent ?? (equalWeightedValue !== null && equalWeightedChangeValue !== null && equalWeightedValue - equalWeightedChangeValue !== 0 ? (equalWeightedChangeValue / (equalWeightedValue - equalWeightedChangeValue)) * 100 : null);
    const isMarketOpen = typeof rawData.isMarketOpen === 'boolean' ? rawData.isMarketOpen : typeof rawData.marketOpen === 'boolean' ? rawData.marketOpen : null;
    return { value, changeValue, changePercent: resolvedChangePercent, equalWeightedValue, equalWeightedChangeValue, equalWeightedChangePercent: resolvedEqualChangePercent, isMarketOpen };
}

function getCachedByKey(key: string): CacheEntry | null {
    try { const raw = localStorage.getItem(key); if (!raw) return null; const parsed = JSON.parse(raw); if (!parsed || typeof parsed !== 'object') return null; const timestamp = toFiniteNumber(parsed.timestamp); if (timestamp === null) return null; const data = normalizeLegacyOrModernMarketData(parsed.data); if (!data) return null; return { data, timestamp, meta: parsed.meta }; } catch { return null; }
}
function isCacheValid(cache: CacheEntry, ttl: number): boolean { return Date.now() - cache.timestamp < ttl; }
function setCachedData(data: MarketIndexData, key: string, meta?: CacheEntry['meta']): void { try { localStorage.setItem(key, JSON.stringify({ data, meta, timestamp: Date.now() })); localStorage.setItem(`${key}_updated`, String(Date.now())); } catch {} }

async function fetchMarketIndexFromAPI(): Promise<{ data: MarketIndexData; meta?: CacheEntry['meta'] } | null> {
    try {
        const url = `${API_BASE_URL}/market/index`;
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), MARKET_INDEX_REQUEST_TIMEOUT_MS);
        const response = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' }, credentials: 'include', cache: 'no-store', signal: controller.signal });
        window.clearTimeout(timeoutId);
        if (!response.ok) return null;
        const result = await response.json();
        const normalized = normalizeLegacyOrModernMarketData(result);
        const meta = result?.meta;
        return normalized && meta?.status !== 'UNAVAILABLE' ? { data: normalized, meta } : null;
    } catch { return null; }
}

interface IndexDisplayProps { name: string; value: number | null; changeValue: number | null; changePercent: number | null; showIcon?: boolean; }
const IndexDisplay: React.FC<IndexDisplayProps> = ({ name, value, changeValue, changePercent, showIcon = true }) => {
    const hasValue = isFiniteNumber(value) && value > 0;
    const safeChangeValue = toFiniteNumber(changeValue);
    const safeChangePercent = toFiniteNumber(changePercent);
    const isPositive = safeChangeValue !== null && safeChangeValue > 0;
    const isNegative = safeChangeValue !== null && safeChangeValue < 0;
    const valueColor = hasValue ? 'text-[var(--color-text-primary)]' : 'text-slate-500';
    const changeColor = isPositive ? 'text-[var(--color-positive)]' : isNegative ? 'text-[var(--color-negative)]' : 'text-slate-400';
    const Icon = isPositive ? ArrowTrendingUpIcon : ArrowTrendingDownIcon;
    return <div className="min-w-0 flex-1 px-2 sm:px-3">
        <div className="mb-2 text-[13px] font-bold leading-6 text-slate-300 whitespace-nowrap overflow-hidden text-ellipsis">{name}</div>
        {hasValue ? <div className={`${valueColor} whitespace-nowrap text-[16px] sm:text-[22px] lg:text-[24px] font-black leading-tight tracking-tight tabular-nums`} dir="ltr">{formatIndexValue(value)}</div> : <div className="text-[12px] sm:text-[13px] font-semibold leading-5 text-slate-500 whitespace-nowrap">داده در دسترس نیست</div>}
        <div className={`mt-2 flex min-w-0 flex-nowrap items-center gap-1 ${changeColor} text-[10px] sm:text-[13px] font-bold tabular-nums whitespace-nowrap`} dir="ltr">{showIcon && <Icon className="h-4 w-4 shrink-0" />}<span>{safeChangeValue === null ? 'داده در دسترس نیست' : formatSignedNumber(safeChangeValue)}</span><span className="opacity-80">({safeChangePercent === null ? '—' : formatPercent(safeChangePercent)})</span></div>
    </div>;
};

const MarketIndex: React.FC<MarketIndexProps> = ({ isOnline }) => {
    const [data, setData] = useState<MarketIndexData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [dataMeta, setDataMeta] = useState<CacheEntry['meta']>();
    const [isMarketInScheduledTime, setIsMarketInScheduledTime] = useState(false);
    const isFetchingRef = useRef(false);

    const checkMarketTime = useCallback(() => {
        const schedule = apiConfigService.getMarketIndexSchedule();
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

        if (cache) {
            setData(cache.data);
            setDataMeta(cache.meta ? { ...cache.meta, status: 'CACHED', stale: !isCacheValid(cache, cacheTTL) } : { status: 'CACHED', stale: !isCacheValid(cache, cacheTTL) });
            setIsLoading(false);
            if (isCacheValid(cache, cacheTTL) || !isOnline) return;
        }

        if (!isOnline) {
            if (!cache) setError('عدم دسترسی به اینترنت');
            setIsLoading(false);
            return;
        }

        if (isFetchingRef.current) return;
        isFetchingRef.current = true;
        try {
            const freshData = await fetchMarketIndexFromAPI();
            if (freshData) {
                setData(freshData.data);
                setDataMeta(freshData.meta);
                setCachedData(freshData.data, cacheKey, freshData.meta);
                setError(null);
            } else if (!cache) setError('خطا در دریافت داده‌های بازار');
        } finally {
            isFetchingRef.current = false;
            setIsLoading(false);
        }
    }, [isOnline, checkMarketTime]);

    useEffect(() => {
        loadData();
        const handleStorageChange = (event: StorageEvent) => {
            if ([CACHE_KEY_LIVE, `${CACHE_KEY_LIVE}_updated`, CACHE_KEY_FINAL, `${CACHE_KEY_FINAL}_updated`].includes(event.key || '')) loadData();
        };
        window.addEventListener('storage', handleStorageChange);
        const intervalId = window.setInterval(() => loadData(), CACHE_TTL_LIVE);
        return () => { window.removeEventListener('storage', handleStorageChange); clearInterval(intervalId); };
    }, [loadData]);

    if (!isOnline && !data) return <div dir="rtl" className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-center text-[13px] font-medium text-slate-300">عدم دسترسی به اینترنت</div>;
    if (error && !data) return <div dir="rtl" className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-center text-[13px] font-medium text-red-300">{error}</div>;
    if (isLoading && !data) return <div dir="rtl" className="w-full min-w-[300px] rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 animate-pulse"><div className="grid grid-cols-2 gap-4"><div className="space-y-3"><div className="h-3 w-20 rounded bg-white/10" /><div className="h-7 w-32 rounded bg-white/10" /><div className="h-3 w-24 rounded bg-white/10" /></div><div className="space-y-3"><div className="h-3 w-24 rounded bg-white/10" /><div className="h-7 w-32 rounded bg-white/10" /><div className="h-3 w-24 rounded bg-white/10" /></div></div></div>;
    if (!data) return <div dir="rtl" className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-center text-[13px] text-slate-400">داده‌ای برای نمایش شاخص موجود نیست.</div>;
    const showAsClosed = data.isMarketOpen === false || (data.isMarketOpen === null && !isMarketInScheduledTime);
    return <div dir="rtl" data-style-id={showAsClosed ? 'market-index-closed' : 'market-index-open'} data-style-name={showAsClosed ? 'شاخص بازار بسته' : 'شاخص بازار باز'} data-style-props="bg,border,positive,negative" className="market-index-widget market-index-workstation w-full min-w-0 max-w-[460px] overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg shadow-black/10">
        <div className="market-index-header flex items-center justify-between gap-2 border-b border-[var(--color-border)] px-2.5 py-2.5 sm:gap-3 sm:px-4 sm:py-3"><div className="min-w-0 flex-1"><div className="text-[13px] sm:text-[14px] font-bold text-[var(--color-text-primary)] whitespace-nowrap">شاخص‌های بازار</div><div className="mt-0.5 hidden text-[11px] font-medium text-slate-400 sm:block">{dataMeta?.status === 'CACHED' ? 'آخرین داده معتبر ذخیره‌شده' : dataMeta?.status === 'LIVE' ? 'داده واقعی بازار' : 'وضعیت داده مشخص نیست'}</div></div><span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold leading-5 sm:gap-2 sm:px-3 sm:py-1 sm:text-[12px] ${showAsClosed ? 'border-red-500/20 bg-red-500/10 text-red-400' : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'}`}><span className={`h-1.5 w-1.5 rounded-full sm:h-2 sm:w-2 ${showAsClosed ? 'bg-red-400' : 'bg-emerald-400'}`} />{showAsClosed ? 'بازار بسته' : 'بازار باز'}</span></div>
        <div className="market-index-values relative grid w-full grid-cols-2 items-stretch gap-0 px-1.5 py-4 sm:px-2"><div aria-hidden="true" className="pointer-events-none absolute right-1/2 top-4 bottom-4 w-px translate-x-1/2 bg-[var(--color-border)]" /><div className="market-index-column min-w-0 w-full px-0 sm:pl-5"><IndexDisplay name="شاخص کل" value={data.value} changeValue={data.changeValue} changePercent={data.changePercent} showIcon={!showAsClosed} /></div><div className="market-index-column min-w-0 w-full px-0 sm:pr-5"><IndexDisplay name="شاخص هم‌وزن" value={data.equalWeightedValue} changeValue={data.equalWeightedChangeValue} changePercent={data.equalWeightedChangePercent} showIcon={!showAsClosed} /></div></div>
    </div>;
};
export default MarketIndex;
