import React, { useState, useEffect, useCallback, useRef } from 'react';
import './MarketIndex.dashboard.css';
import * as apiConfigService from '../services/apiConfigService';
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
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), MARKET_INDEX_REQUEST_TIMEOUT_MS);
        let result: any;
        try {
            result = await apiConfigService.apiFetch('/market/index', { method: 'GET', cache: 'no-store', signal: controller.signal });
        } finally {
            window.clearTimeout(timeoutId);
        }
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
    const direction = isPositive ? 'positive' : isNegative ? 'negative' : 'neutral';
    const Icon = isPositive ? ArrowTrendingUpIcon : ArrowTrendingDownIcon;
    return <article className={`market-index-visual-card market-index-${direction}`}>
        <div className="market-index-card-glow" aria-hidden="true" />
        <div className="market-index-card-top">
            <span className="market-index-card-symbol" aria-hidden="true">{name.includes('هم‌وزن') ? 'EW' : 'TSE'}</span>
            <span className="market-index-card-label">{name}</span>
        </div>
        <div className="market-index-card-value" dir="ltr">{hasValue ? formatIndexValue(value) : 'داده در دسترس نیست'}</div>
        <div className="market-index-card-change" dir="ltr">
            {showIcon && <Icon className="market-index-change-icon" />}
            <span>{safeChangeValue === null ? 'داده در دسترس نیست' : formatSignedNumber(safeChangeValue)}</span>
            <span className="market-index-change-percent">{safeChangePercent === null ? '—' : formatPercent(safeChangePercent)}</span>
        </div>
        <div className="market-index-card-footer">
            <span>تغییر نسبت به مقدار مبنا</span>
            <span className="market-index-card-status">{isPositive ? 'رشد' : isNegative ? 'افت' : 'بدون تغییر'}</span>
        </div>
    </article>;
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
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Tehran', weekday: 'short', hour: '2-digit', minute: '2-digit',
            hour12: false, hourCycle: 'h23',
        }).formatToParts(now);
        const get = (type: string) => parts.find(part => part.type === type)?.value ?? '';
        const weekdayMap: Record<string, number> = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 };
        const currentDay = weekdayMap[get('weekday')];
        if (!schedule.days.includes(currentDay)) return false;
        const currentTime = `${get("hour")}:${get("minute")}`;
        return !(currentTime < schedule.startTime || currentTime >= schedule.endTime);
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
    const showAsClosed = !isMarketInScheduledTime || data.isMarketOpen === false;
    return <section dir="rtl" data-style-id={showAsClosed ? 'market-index-closed' : 'market-index-open'} data-style-name={showAsClosed ? 'شاخص بازار بسته' : 'شاخص بازار باز'} data-style-props="bg,border,positive,negative" className="market-index-widget market-index-visual-dashboard w-full min-w-0 max-w-none overflow-hidden rounded-2xl" style={{ width: "100%", maxWidth: "none" }}>
        <header className="market-index-visual-header">
            <div className="market-index-header-art" aria-hidden="true"><span /><span /><span /><span /></div>
            <div className="market-index-visual-title">
                <div className="market-index-eyebrow">RONIYA · MARKET OVERVIEW</div>
                <h2>شاخص‌های بازار</h2>
                <p>{dataMeta?.status === 'CACHED' ? 'آخرین داده معتبر ذخیره‌شده' : dataMeta?.status === 'LIVE' ? 'داده واقعی بازار' : 'وضعیت داده مشخص نیست'}</p>
            </div>
            <div className={`market-index-market-status ${showAsClosed ? 'is-closed' : 'is-open'}`}>
                <span className="market-index-status-orbit" aria-hidden="true"><span /></span>
                <div><strong>{showAsClosed ? 'بازار بسته' : 'بازار باز'}</strong><small>{showAsClosed ? 'اطلاعات آخرین وضعیت در دسترس' : 'در حال معامله'}</small></div>
            </div>
        </header>
        <div className="market-index-visual-body">
            <div className="market-index-cards-grid">
                <IndexDisplay name="شاخص کل" value={data.value} changeValue={data.changeValue} changePercent={data.changePercent} showIcon={!showAsClosed} />
                <IndexDisplay name="شاخص هم‌وزن" value={data.equalWeightedValue} changeValue={data.equalWeightedChangeValue} changePercent={data.equalWeightedChangePercent} showIcon={!showAsClosed} />
            </div>
            <footer className="market-index-visual-footer">
                <span className="market-index-footer-dot" />
                <span>مقادیر و تغییرات بر اساس داده‌های فعلی بازار</span>
                <span className="market-index-footer-live">{dataMeta?.status === 'LIVE' ? 'LIVE' : 'CACHE'}</span>
            </footer>
        </div>
    </section>;
};
export default MarketIndex;
