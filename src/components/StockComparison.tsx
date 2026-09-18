import React, { useMemo, useState } from 'react';
import type { StoredUser } from '../types';
import * as analysisUsageService from '../services/analysisUsageService';
import * as storageService from '../services/storageService';
import { useNotification } from './NotificationSystem';
import { ClipboardDocumentIcon } from './Icons';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { compareDeterministicStocks, type DeterministicComparisonResult, type DeterministicComparisonRow } from '../services/stockComparisonDataService';

interface StockComparisonProps { currentUser: StoredUser; isOnline: boolean; }

const formatNumber = (value: number | null | undefined, digits = 2): string => {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
    return Number(value).toLocaleString('fa-IR', { maximumFractionDigits: digits });
};

type SortKey = 'totalScore' | 'technicalScore' | 'fundamentalScore' | 'priceChangePercent' | 'netMoneyFlow' | 'pe';
const sortOptions: Array<{ value: SortKey; label: string }> = [
    { value: 'totalScore', label: 'امتیاز کل' },
    { value: 'technicalScore', label: 'امتیاز تکنیکال' },
    { value: 'fundamentalScore', label: 'امتیاز بنیادی' },
    { value: 'priceChangePercent', label: 'تغییر روزانه' },
    { value: 'netMoneyFlow', label: 'جریان پول' },
    { value: 'pe', label: 'P/E' },
];

const sortableValue = (row: DeterministicComparisonRow, key: SortKey): number => {
    const value = row[key];
    return value == null || !Number.isFinite(Number(value)) ? Number.NEGATIVE_INFINITY : Number(value);
};

const StockComparison: React.FC<StockComparisonProps> = ({ currentUser, isOnline }) => {
    const [symbol1, setSymbol1] = useState('');
    const [symbol2, setSymbol2] = useState('');
    const [extraSymbols, setExtraSymbols] = useState<string[]>([]);
    const [deterministicResult, setDeterministicResult] = useState<DeterministicComparisonResult | null>(null);
    const [sortKey, setSortKey] = useState<SortKey>('totalScore');
    const [sortDescending, setSortDescending] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { addNotification } = useNotification();

    const handleCompare = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true); setError(null); setDeterministicResult(null);
        try {
            analysisUsageService.beginAnalysis(currentUser);
            const settingsKey = `user_settings_${currentUser.id}`;
            const settingsJson = storageService.getItem(settingsKey);
            const settings = settingsJson ? JSON.parse(settingsJson) : { chartDays: 30, chartWeeks: 24 };
            const symbols = [symbol1, symbol2, ...extraSymbols].map((item) => item.trim().toUpperCase()).filter(Boolean);
            const response = await compareDeterministicStocks(symbols, { dailyCount: settings.chartDays, weeklyCount: settings.chartWeeks });
            setDeterministicResult(response.result);
        } catch (err: any) {
            const message = err?.message || 'یک خطای ناشناخته در هنگام مقایسه رخ داد.';
            setError(message); addNotification(message, 'error');
        } finally { setLoading(false); }
    };

    const sortedRows = useMemo(() => {
        if (!deterministicResult) return [];
        return [...deterministicResult.rows].sort((a, b) => {
            const diff = sortableValue(a, sortKey) - sortableValue(b, sortKey);
            if (diff !== 0) return sortDescending ? -diff : diff;
            return a.symbol.localeCompare(b.symbol, 'fa');
        });
    }, [deterministicResult, sortKey, sortDescending]);

    const rankBySymbol = useMemo(() => {
        const map = new Map<string, number>();
        sortedRows.forEach((row, index) => map.set(row.symbol, index + 1));
        return map;
    }, [sortedRows]);

    const performancePeriods = [
        { key: '1w', label: '۱ هفته', points: 5 },
        { key: '1m', label: '۱ ماه', points: 22 },
        { key: '3m', label: '۳ ماه', points: 66 },
    ] as const;

    const periodPerformance = useMemo(() => {
        return sortedRows.map((row) => ({
            symbol: row.symbol,
            periods: performancePeriods.map((period) => {
                if (row.history.length < 2) return { key: period.key, label: period.label, value: null as number | null };
                const end = row.history[row.history.length - 1]?.close;
                const startIndex = Math.max(0, row.history.length - 1 - period.points);
                const start = row.history[startIndex]?.close;
                return { key: period.key, label: period.label, value: end && start ? ((end / start) - 1) * 100 : null };
            }),
        }));
    }, [sortedRows]);

    const riskMetrics = useMemo(() => {
        return sortedRows.map((row) => {
            const closes = row.history.map((point) => Number(point.close)).filter((value) => Number.isFinite(value) && value > 0);
            const returns: number[] = [];
            for (let index = 1; index < closes.length; index += 1) {
                returns.push((closes[index] / closes[index - 1]) - 1);
            }
            const mean = returns.length ? returns.reduce((sum, value) => sum + value, 0) / returns.length : null;
            const variance = returns.length > 1 && mean !== null
                ? returns.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / (returns.length - 1)
                : null;
            const volatility = variance !== null ? Math.sqrt(variance) * Math.sqrt(252) * 100 : null;
            let peak = -Infinity;
            let maxDrawdown = 0;
            closes.forEach((close) => {
                peak = Math.max(peak, close);
                if (peak > 0) maxDrawdown = Math.min(maxDrawdown, ((close / peak) - 1) * 100);
            });
            return { symbol: row.symbol, volatility, maxDrawdown, observations: returns.length };
        });
    }, [sortedRows]);

    const riskAdjustedMetrics = useMemo(() => {
        return sortedRows.map((row) => {
            const closes = row.history.map((point) => Number(point.close)).filter((value) => Number.isFinite(value) && value > 0);
            const returns: number[] = [];
            for (let index = 1; index < closes.length; index += 1) {
                returns.push((closes[index] / closes[index - 1]) - 1);
            }
            if (returns.length < 2) return { symbol: row.symbol, annualReturn: null as number | null, sharpe: null as number | null, downside: null as number | null };
            const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
            const variance = returns.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / (returns.length - 1);
            const stdDev = Math.sqrt(variance);
            const annualReturn = mean * 252 * 100;
            const sharpe = stdDev > 0 ? (mean / stdDev) * Math.sqrt(252) : null;
            const negativeReturns = returns.filter((value) => value < 0);
            const downside = negativeReturns.length
                ? Math.sqrt(negativeReturns.reduce((sum, value) => sum + (value ** 2), 0) / negativeReturns.length) * Math.sqrt(252) * 100
                : 0;
            return { symbol: row.symbol, annualReturn, sharpe, downside };
        });
    }, [sortedRows]);

    const valuationAnalysis = useMemo(() => {
        const validPe = sortedRows.map(row => Number(row.pe)).filter(value => Number.isFinite(value) && value > 0);
        const sortedPe = [...validPe].sort((a, b) => a - b);
        const medianPe = sortedPe.length
            ? (sortedPe.length % 2 === 1
                ? sortedPe[Math.floor(sortedPe.length / 2)]
                : (sortedPe[sortedPe.length / 2 - 1] + sortedPe[sortedPe.length / 2]) / 2)
            : null;
        const rows = sortedRows.map(row => {
            const eps = Number(row.eps);
            const pe = Number(row.pe);
            const earningsYield = Number.isFinite(pe) && pe > 0 ? (1 / pe) * 100 : null;
            const peDistance = medianPe !== null && Number.isFinite(pe) && pe > 0 ? ((pe / medianPe) - 1) * 100 : null;
            const fundamentalScore = Number(row.fundamentalScore);
            return {
                symbol: row.symbol,
                eps: Number.isFinite(eps) ? eps : null,
                pe: Number.isFinite(pe) && pe > 0 ? pe : null,
                earningsYield,
                peDistance,
                fundamentalScore: Number.isFinite(fundamentalScore) ? fundamentalScore : null,
            };
        });
        return { medianPe, validPeCount: validPe.length, rows };
    }, [sortedRows]);

    const liquidityMetrics = useMemo(() => {
        return sortedRows.map((row) => {
            const tradedValue = Number(row.tradedValue);
            const marketCap = Number(row.marketCap);
            const netMoneyFlow = Number(row.netMoneyFlow);
            const liquidityRatio = Number.isFinite(tradedValue) && tradedValue > 0 && Number.isFinite(marketCap) && marketCap > 0
                ? (tradedValue / marketCap) * 100
                : null;
            const moneyFlowIntensity = Number.isFinite(netMoneyFlow) && Number.isFinite(tradedValue) && tradedValue > 0
                ? (netMoneyFlow / tradedValue) * 100
                : null;
            return { symbol: row.symbol, tradedVolume: row.tradedVolume, tradedValue: row.tradedValue, liquidityRatio, moneyFlowIntensity };
        });
    }, [sortedRows]);

    const moneyFlowMetrics = useMemo(() => {
        return sortedRows.map((row) => {
            const net = Number(row.netMoneyFlow);
            const real = Number(row.realMoneyFlow);
            const legal = Number(row.legalMoneyFlow);
            const tradedValue = Number(row.tradedValue);
            const hasNet = Number.isFinite(net);
            const hasReal = Number.isFinite(real);
            const hasLegal = Number.isFinite(legal);
            const hasTradedValue = Number.isFinite(tradedValue) && tradedValue > 0;
            const netIntensity = hasNet && hasTradedValue ? (net / tradedValue) * 100 : null;
            const realShare = hasReal && hasNet && Math.abs(net) > 0 ? (real / Math.abs(net)) * 100 : null;
            const legalShare = hasLegal && hasNet && Math.abs(net) > 0 ? (legal / Math.abs(net)) * 100 : null;
            const pressure = hasNet
                ? net > 0 ? 'ورود پول' : net < 0 ? 'خروج پول' : 'خنثی'
                : 'داده ناکافی';
            const direction = hasNet
                ? net > 0 ? 'مثبت' : net < 0 ? 'منفی' : 'خنثی'
                : 'نامشخص';
            return {
                symbol: row.symbol,
                net,
                real,
                legal,
                netIntensity,
                realShare,
                legalShare,
                pressure,
                direction,
                tradedValue: hasTradedValue ? tradedValue : null,
            };
        });
    }, [sortedRows]);


    const comparisonStatistics = useMemo(() => {
        const numeric = (values: Array<number | null | undefined>) => values.map(Number).filter(Number.isFinite);
        const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
        const median = (values: number[]) => {
            if (!values.length) return null;
            const sorted = [...values].sort((a, b) => a - b);
            const middle = Math.floor(sorted.length / 2);
            return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
        };
        const stdDev = (values: number[]) => {
            if (values.length < 2) return null;
            const mean = average(values);
            if (mean === null) return null;
            return Math.sqrt(values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / (values.length - 1));
        };
        const totalScores = numeric(sortedRows.map(row => row.totalScore));
        const technicalScores = numeric(sortedRows.map(row => row.technicalScore));
        const fundamentalScores = numeric(sortedRows.map(row => row.fundamentalScore));
        const dailyChanges = numeric(sortedRows.map(row => row.priceChangePercent));
        const netFlows = numeric(sortedRows.map(row => row.netMoneyFlow));
        const totalsMedian = median(totalScores);
        const dailyMedian = median(dailyChanges);
        const flowMedian = median(netFlows);
        const rows = sortedRows.map(row => {
            const total = Number(row.totalScore);
            const daily = Number(row.priceChangePercent);
            const flow = Number(row.netMoneyFlow);
            return {
                symbol: row.symbol,
                totalVsMedian: Number.isFinite(total) && totalsMedian !== null ? total - totalsMedian : null,
                dailyVsMedian: Number.isFinite(daily) && dailyMedian !== null ? daily - dailyMedian : null,
                flowVsMedian: Number.isFinite(flow) && flowMedian !== null ? flow - flowMedian : null,
            };
        });
        return {
            count: sortedRows.length,
            avgTotal: average(totalScores),
            medianTotal: totalsMedian,
            totalStdDev: stdDev(totalScores),
            totalRange: totalScores.length ? Math.max(...totalScores) - Math.min(...totalScores) : null,
            avgTechnical: average(technicalScores),
            avgFundamental: average(fundamentalScores),
            avgDailyChange: average(dailyChanges),
            medianDailyChange: dailyMedian,
            dailyStdDev: stdDev(dailyChanges),
            positiveDailyCount: dailyChanges.filter(value => value > 0).length,
            negativeDailyCount: dailyChanges.filter(value => value < 0).length,
            avgNetFlow: average(netFlows),
            medianNetFlow: flowMedian,
            positiveFlowCount: netFlows.filter(value => value > 0).length,
            negativeFlowCount: netFlows.filter(value => value < 0).length,
            rows,
        };
    }, [sortedRows]);

    const historicalChartData = useMemo(() => {
        const dates = Array.from(new Set(sortedRows.flatMap(row => row.history.map(point => point.date)))).sort();
        return dates.map(date => {
            const item: Record<string, string | number | null> = { date };
            sortedRows.forEach((row, index) => {
                const point = row.history.find(entry => entry.date === date);
                const base = row.history[0]?.close ?? null;
                item[`series${index}`] = point && base && base !== 0 ? (point.close / base) * 100 : null;
            });
            return item;
        });
    }, [sortedRows]);

    return (
        <div className="max-w-6xl mx-auto" dir="rtl" style={{ direction: 'rtl' }}>
            <h2 className="text-2xl font-bold text-cyan-600 dark:text-cyan-400 mb-4 flex items-center gap-2">مقایسه سهام <ClipboardDocumentIcon /></h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6 text-right">۲ تا ۵ نماد را وارد کنید تا شاخص‌های تکنیکال، بنیادی، جریان پول، ارزش‌گذاری و ریسک به‌صورت قطعی و بدون وابستگی به هوش مصنوعی مقایسه شوند.</p>

            <div data-style-id="analysis-form-card" className="p-6 rounded-lg shadow-md mb-8" style={{ backgroundColor: 'var(--analysis-form-card-bg)' }}>
                <form onSubmit={handleCompare} className="flex flex-col sm:flex-row items-center gap-4" dir="rtl">
                    <input type="text" value={symbol1} onChange={(e) => setSymbol1(e.target.value.toUpperCase())} placeholder="نماد اول (مثلا: خودرو)" required dir="rtl" className="flex-grow w-full border rounded-md px-4 py-3 text-lg focus:outline-none focus:ring-2" style={{ backgroundColor: 'var(--input-bg)', color: 'var(--input-color)', borderColor: 'var(--input-border)', '--tw-ring-color': 'var(--input-focus-ring)' } as React.CSSProperties} />
                    <span className="font-bold text-gray-500 whitespace-nowrap">در مقابل</span>
                    <input type="text" value={symbol2} onChange={(e) => setSymbol2(e.target.value.toUpperCase())} placeholder="نماد دوم" required dir="rtl" className="flex-grow w-full border rounded-md px-4 py-3 text-lg focus:outline-none focus:ring-2" style={{ backgroundColor: 'var(--input-bg)', color: 'var(--input-color)', borderColor: 'var(--input-border)', '--tw-ring-color': 'var(--input-focus-ring)' } as React.CSSProperties} />
                    {extraSymbols.map((symbol, index) => <input key={index} type="text" value={symbol} onChange={(e) => setExtraSymbols(items => items.map((item, i) => i === index ? e.target.value.toUpperCase() : item))} placeholder={`نماد ${index + 3}`} dir="rtl" className="flex-grow w-full border rounded-md px-4 py-3 text-lg focus:outline-none focus:ring-2" style={{ backgroundColor: 'var(--input-bg)', color: 'var(--input-color)', borderColor: 'var(--input-border)', '--tw-ring-color': 'var(--input-focus-ring)' } as React.CSSProperties} />)}
                    {extraSymbols.length < 3 && <button type="button" onClick={() => setExtraSymbols(items => [...items, ''])} className="px-4 py-3 rounded-md border border-cyan-500 text-cyan-600 dark:text-cyan-300 whitespace-nowrap">+ افزودن نماد</button>}
                    <button type="submit" disabled={loading || !symbol1.trim() || !symbol2.trim() || !isOnline} data-style-id="analysis-button" className="w-full sm:w-auto flex items-center justify-center gap-2 font-bold py-3 px-8 rounded-md hover:animate-subtle-bounce disabled:bg-gray-500 text-lg" style={{ backgroundColor: 'var(--analysis-button-bg)', color: 'var(--analysis-button-color)' }}>
                        {loading ? <div className="w-5 h-5 border-2 border-t-transparent border-white rounded-full animate-spin"></div> : <ClipboardDocumentIcon />}
                        <span>مقایسه کن</span>
                    </button>
                </form>
            </div>

            {error && <div dir="rtl" className="mt-6 bg-red-100 border border-red-400 text-red-700 dark:bg-red-900/50 dark:border-red-700 dark:text-red-300 px-4 py-3 rounded-md text-right">{error}</div>}

            {deterministicResult && deterministicResult.rows.length >= 2 && (
                <div className="mb-8 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden" dir="rtl">
                    <div className="px-5 py-4 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700">
                        <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">مقایسه حرفه‌ای چندنمادی</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">موتور قطعی مقایسه؛ بدون وابستگی به Gemini</p>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-5">
                        {[
                            ['تعداد نمادها', deterministicResult.rows.length],
                            ['بیشترین امتیاز تکنیکال', deterministicResult.metrics.highestTechnicalScore || '—'],
                            ['قوی‌ترین جریان پول', deterministicResult.metrics.strongestMoneyFlow || '—'],
                            ['کمترین P/E', deterministicResult.metrics.lowestPE || '—']
                        ].map(([label, value]) => <div key={String(label)} className="rounded-lg border border-slate-200 dark:border-slate-700 p-3"><div className="text-xs text-slate-500">{label}</div><div className="font-bold mt-1">{value}</div></div>)}
                    </div>

                    <div className="mx-5 mb-5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/30 p-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div>
                                <div className="font-bold text-slate-800 dark:text-slate-100">مرتب‌سازی و رتبه‌بندی</div>
                                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">رتبه کارت‌ها و جدول بر اساس شاخص انتخابی محاسبه می‌شود؛ کاملاً قطعی و بدون AI.</div>
                            </div>
                            <div className="flex flex-col sm:flex-row gap-2">
                                <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} className="rounded-lg border px-3 py-2 bg-white dark:bg-gray-800 border-slate-300 dark:border-slate-600">
                                    {sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
                                <button type="button" onClick={() => setSortDescending(value => !value)} className="rounded-lg border border-cyan-500 px-4 py-2 text-cyan-700 dark:text-cyan-300 font-bold">
                                    {sortDescending ? 'نزولی ↓' : 'صعودی ↑'}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="px-5 pb-5">
                        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/30 p-4">
                            <div className="font-bold text-slate-800 dark:text-slate-100 mb-1">جمع‌بندی آماری مقایسه</div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                                این بخش فقط خلاصه آماری داده‌های موجود را ارائه می‌کند؛ میانگین، میانه، پراکندگی و تعداد مشاهدات از داده‌های واقعی همین مقایسه محاسبه شده‌اند و به‌معنای توصیه سرمایه‌گذاری نیستند.
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                                <div className="rounded-lg bg-white dark:bg-gray-800 border border-slate-200 dark:border-slate-700 p-2"><div className="text-xs text-slate-500">میانگین امتیاز کل</div><div className="font-bold mt-1">{comparisonStatistics.avgTotal == null ? '—' : formatNumber(comparisonStatistics.avgTotal, 1)}</div></div>
                                <div className="rounded-lg bg-white dark:bg-gray-800 border border-slate-200 dark:border-slate-700 p-2"><div className="text-xs text-slate-500">میانه امتیاز کل</div><div className="font-bold mt-1">{comparisonStatistics.medianTotal == null ? '—' : formatNumber(comparisonStatistics.medianTotal, 1)}</div></div>
                                <div className="rounded-lg bg-white dark:bg-gray-800 border border-slate-200 dark:border-slate-700 p-2"><div className="text-xs text-slate-500">پراکندگی امتیاز کل</div><div className="font-bold mt-1">{comparisonStatistics.totalStdDev == null ? '—' : formatNumber(comparisonStatistics.totalStdDev, 2)}</div></div>
                                <div className="rounded-lg bg-white dark:bg-gray-800 border border-slate-200 dark:border-slate-700 p-2"><div className="text-xs text-slate-500">دامنه امتیاز کل</div><div className="font-bold mt-1">{comparisonStatistics.totalRange == null ? '—' : formatNumber(comparisonStatistics.totalRange, 1)}</div></div>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                                <div className="rounded-lg bg-white dark:bg-gray-800 border border-slate-200 dark:border-slate-700 p-2"><div className="text-xs text-slate-500">میانگین تغییر روزانه</div><div className="font-bold mt-1">{comparisonStatistics.avgDailyChange == null ? '—' : String(formatNumber(comparisonStatistics.avgDailyChange, 2)) + '٪'}</div></div>
                                <div className="rounded-lg bg-white dark:bg-gray-800 border border-slate-200 dark:border-slate-700 p-2"><div className="text-xs text-slate-500">میانه تغییر روزانه</div><div className="font-bold mt-1">{comparisonStatistics.medianDailyChange == null ? '—' : String(formatNumber(comparisonStatistics.medianDailyChange, 2)) + '٪'}</div></div>
                                <div className="rounded-lg bg-white dark:bg-gray-800 border border-slate-200 dark:border-slate-700 p-2"><div className="text-xs text-slate-500">نمادهای مثبت روزانه</div><div className="font-bold mt-1">{formatNumber(comparisonStatistics.positiveDailyCount, 0)}</div></div>
                                <div className="rounded-lg bg-white dark:bg-gray-800 border border-slate-200 dark:border-slate-700 p-2"><div className="text-xs text-slate-500">نمادهای منفی روزانه</div><div className="font-bold mt-1">{formatNumber(comparisonStatistics.negativeDailyCount, 0)}</div></div>
                            </div>
                            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                                <table className="w-full text-sm">
                                    <thead><tr className="bg-slate-100 dark:bg-slate-700/80">
                                        <th className="px-3 py-3 text-center">رتبه</th><th className="px-3 py-3 text-center">نماد</th><th className="px-3 py-3 text-center whitespace-nowrap">فاصله امتیاز کل از میانه</th><th className="px-3 py-3 text-center whitespace-nowrap">فاصله تغییر روزانه از میانه</th><th className="px-3 py-3 text-center whitespace-nowrap">فاصله جریان پول از میانه</th>
                                    </tr></thead>
                                    <tbody>{comparisonStatistics.rows.map((item, index) => <tr key={item.symbol} className="border-t border-slate-100 dark:border-slate-700">
                                        <td className="px-3 py-3 text-center font-bold">{rankBySymbol.get(item.symbol) ?? index + 1}</td>
                                        <td className="px-3 py-3 text-center font-bold text-cyan-700 dark:text-cyan-300">{item.symbol}</td>
                                        <td className="px-3 py-3 text-center font-bold">{item.totalVsMedian == null ? '—' : formatNumber(item.totalVsMedian, 1)}</td>
                                        <td className="px-3 py-3 text-center">{item.dailyVsMedian == null ? '—' : String(formatNumber(item.dailyVsMedian, 2)) + '٪'}</td>
                                        <td className="px-3 py-3 text-center">{item.flowVsMedian == null ? '—' : formatNumber(item.flowVsMedian, 0)}</td>
                                    </tr>)}</tbody>
                                </table>
                            </div>
                            <div className="text-xs text-slate-500 mt-2">
                                فاصله‌ها نسبت به میانه گروه هستند؛ مثبت یا منفی بودن آن‌ها فقط اختلاف آماری با مرکز توزیع را نشان می‌دهد و به‌تنهایی معیار تصمیم‌گیری نیست.
                            </div>
                        </div>
                    </div>

                    <div className="px-5 pb-5">
                        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/30 p-4">
                            <div className="flex items-center justify-between gap-3 mb-4">
                                <div>
                                    <div className="font-bold text-slate-800 dark:text-slate-100">مقایسه روند تاریخی قیمت</div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">تغییرات قیمت پایانی تعدیل‌شده در داده‌های واقعی هر نماد، بدون داده ساختگی.</div>
                                </div>
                            </div>
                            <div className="h-72 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={historicalChartData}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="date" type="category" allowDuplicatedCategory={false} />
                                        <YAxis domain={['auto', 'auto']} />
                                        <Tooltip formatter={(value) => formatNumber(Number(value), 0)} />
                                        {sortedRows.map((row) => <Line key={row.symbol} type="monotone" dataKey={`series${sortedRows.indexOf(row)}`} name={row.symbol} dot={false} strokeWidth={2} connectNulls />)}
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="text-xs text-slate-500 mt-2">مقیاس نمودار به‌صورت شاخصی است؛ نقطه شروع هر نماد = ۱۰۰.</div>
                        </div>
                    </div>

                    <div className="px-5 pb-5">
                        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/30 p-4">
                            <div className="font-bold text-slate-800 dark:text-slate-100 mb-3">بازدهی دوره‌ای واقعی</div>
                            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                                <table className="w-full text-sm"><thead><tr className="bg-slate-100 dark:bg-slate-700/80">
                                    <th className="px-3 py-3 text-center">رتبه</th><th className="px-3 py-3 text-center">نماد</th>
                                    {performancePeriods.map(period => <th key={period.key} className="px-3 py-3 text-center whitespace-nowrap">{period.label}</th>)}
                                </tr></thead><tbody>{periodPerformance.map((item, index) => <tr key={item.symbol} className="border-t border-slate-100 dark:border-slate-700">
                                    <td className="px-3 py-3 text-center font-bold">{index + 1}</td><td className="px-3 py-3 text-center font-bold text-cyan-700 dark:text-cyan-300">{item.symbol}</td>
                                    {item.periods.map(period => <td key={period.key} className="px-3 py-3 text-center font-bold">{period.value == null ? '—' : String(formatNumber(period.value, 2)) + '٪'}</td>)}
                                </tr>)}</tbody></table>
                            </div>
                            <div className="text-xs text-slate-500 mt-2">بازدهی از قیمت پایانی تاریخچه واقعی محاسبه شده و شامل سود نقدی یا هزینه معامله نیست.</div>
                        </div>
                    </div>

                    <div className="px-5 pb-5">
                        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/30 p-4">
                            <div className="font-bold text-slate-800 dark:text-slate-100 mb-1">مقایسه ریسک و نوسان</div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 mb-3">نوسان سالانه‌شده از بازده روزانه و بیشترین افت از سقف تاریخی، فقط بر اساس تاریخچه واقعی هر نماد.</div>
                            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                                <table className="w-full text-sm"><thead><tr className="bg-slate-100 dark:bg-slate-700/80">
                                    <th className="px-3 py-3 text-center">رتبه</th><th className="px-3 py-3 text-center">نماد</th><th className="px-3 py-3 text-center whitespace-nowrap">نوسان سالانه</th><th className="px-3 py-3 text-center whitespace-nowrap">بیشترین افت</th><th className="px-3 py-3 text-center">تعداد مشاهدات</th>
                                </tr></thead><tbody>{riskMetrics.map((item, index) => <tr key={item.symbol} className="border-t border-slate-100 dark:border-slate-700">
                                    <td className="px-3 py-3 text-center font-bold">{index + 1}</td><td className="px-3 py-3 text-center font-bold text-cyan-700 dark:text-cyan-300">{item.symbol}</td><td className="px-3 py-3 text-center font-bold">{item.volatility == null ? '—' : String(formatNumber(item.volatility, 2)) + '٪'}</td><td className="px-3 py-3 text-center font-bold">{item.maxDrawdown === 0 ? '۰٪' : String(formatNumber(item.maxDrawdown, 2)) + '٪'}</td><td className="px-3 py-3 text-center">{formatNumber(item.observations, 0)}</td>
                                </tr>)}</tbody></table>
                            </div>
                            <div className="text-xs text-slate-500 mt-2">نوسان با انحراف معیار نمونه بازده روزانه و ضریب √۲۵۲ محاسبه شده است؛ افت بیشینه از سقف تجمعی تاریخچه محاسبه می‌شود.</div>
                        </div>
                    </div>

                    <div className="px-5 pb-5">
                        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/30 p-4">
                            <div className="font-bold text-slate-800 dark:text-slate-100 mb-1">بازدهی تعدیل‌شده با ریسک</div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 mb-3">مقایسه بازده سالانه‌شده، نسبت شارپ و نوسان نزولی از تاریخچه واقعی؛ بدون نرخ بهره فرضی و بدون AI.</div>
                            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                                <table className="w-full text-sm"><thead><tr className="bg-slate-100 dark:bg-slate-700/80">
                                    <th className="px-3 py-3 text-center">رتبه</th><th className="px-3 py-3 text-center">نماد</th><th className="px-3 py-3 text-center whitespace-nowrap">بازده سالانه‌شده</th><th className="px-3 py-3 text-center whitespace-nowrap">نسبت شارپ</th><th className="px-3 py-3 text-center whitespace-nowrap">نوسان نزولی</th>
                                </tr></thead><tbody>{riskAdjustedMetrics.map((item,index)=><tr key={item.symbol} className="border-t border-slate-100 dark:border-slate-700">
                                    <td className="px-3 py-3 text-center font-bold">{index+1}</td><td className="px-3 py-3 text-center font-bold text-cyan-700 dark:text-cyan-300">{item.symbol}</td><td className="px-3 py-3 text-center font-bold">{item.annualReturn == null ? '—' : String(formatNumber(item.annualReturn,2)) + '٪'}</td><td className="px-3 py-3 text-center font-bold">{item.sharpe == null ? '—' : formatNumber(item.sharpe,2)}</td><td className="px-3 py-3 text-center font-bold">{item.downside == null ? '—' : String(formatNumber(item.downside,2)) + '٪'}</td>
                                </tr>)}</tbody></table>
                            </div>
                            <div className="text-xs text-slate-500 mt-2">نسبت شارپ در این مقایسه با نرخ بدون ریسک صفر محاسبه شده است و صرفاً یک معیار آماری مقایسه‌ای است.</div>
                        </div>
                    </div>

                    <div className="px-5 pb-5">
                        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/30 p-4">
                            <div className="font-bold text-slate-800 dark:text-slate-100 mb-1">مقایسه نقدشوندگی و کیفیت معاملات</div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 mb-3">حجم و ارزش معاملات واقعی، گردش ارزش معاملات نسبت به ارزش بازار و شدت جریان پول خالص؛ بدون داده ساختگی و بدون AI.</div>
                            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                                <table className="w-full text-sm"><thead><tr className="bg-slate-100 dark:bg-slate-700/80">
                                    <th className="px-3 py-3 text-center">رتبه</th><th className="px-3 py-3 text-center">نماد</th><th className="px-3 py-3 text-center whitespace-nowrap">حجم معاملات</th><th className="px-3 py-3 text-center whitespace-nowrap">ارزش معاملات</th><th className="px-3 py-3 text-center whitespace-nowrap">نسبت ارزش معاملات به ارزش بازار</th><th className="px-3 py-3 text-center whitespace-nowrap">شدت جریان پول خالص</th>
                                </tr></thead><tbody>{liquidityMetrics.map((item,index)=><tr key={item.symbol} className="border-t border-slate-100 dark:border-slate-700">
                                    <td className="px-3 py-3 text-center font-bold">{index+1}</td><td className="px-3 py-3 text-center font-bold text-cyan-700 dark:text-cyan-300">{item.symbol}</td><td className="px-3 py-3 text-center">{formatNumber(Number(item.tradedVolume),0)}</td><td className="px-3 py-3 text-center">{formatNumber(Number(item.tradedValue),0)}</td><td className="px-3 py-3 text-center font-bold">{item.liquidityRatio == null ? '—' : String(formatNumber(item.liquidityRatio,3)) + '٪'}</td><td className="px-3 py-3 text-center font-bold">{item.moneyFlowIntensity == null ? '—' : String(formatNumber(item.moneyFlowIntensity,2)) + '٪'}</td>
                                </tr>)}</tbody></table>
                            </div>
                            <div className="text-xs text-slate-500 mt-2">نسبت نقدشوندگی = ارزش معاملات ÷ ارزش بازار؛ شدت جریان پول = جریان پول خالص ÷ ارزش معاملات. این دو شاخص صرفاً از داده‌های همان روز/نمونه مقایسه محاسبه شده‌اند.</div>
                        </div>
                    </div>

                    <div className="px-5 pb-5">
                        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/30 p-4">
                            <div className="font-bold text-slate-800 dark:text-slate-100 mb-1">مقایسه جریان پول</div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                                جریان پول حقیقی، حقوقی و خالص هر نماد از داده واقعی همان روز مقایسه می‌شود. شدت جریان پول، فشار ورود/خروج را نسبت به ارزش معاملات نشان می‌دهد؛ هیچ روند تاریخی ساختگی ایجاد نمی‌شود.
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                                <div className="rounded-lg bg-white dark:bg-gray-800 border border-slate-200 dark:border-slate-700 p-2">
                                    <div className="text-xs text-slate-500">قوی‌ترین ورود/خروج خالص</div>
                                    <div className="font-bold mt-1">{deterministicResult.metrics.strongestMoneyFlow || '—'}</div>
                                </div>
                                <div className="rounded-lg bg-white dark:bg-gray-800 border border-slate-200 dark:border-slate-700 p-2">
                                    <div className="text-xs text-slate-500">نمادهای با ورود پول</div>
                                    <div className="font-bold mt-1">{formatNumber(moneyFlowMetrics.filter(item => item.pressure === 'ورود پول').length, 0)}</div>
                                </div>
                                <div className="rounded-lg bg-white dark:bg-gray-800 border border-slate-200 dark:border-slate-700 p-2">
                                    <div className="text-xs text-slate-500">نمادهای با خروج پول</div>
                                    <div className="font-bold mt-1">{formatNumber(moneyFlowMetrics.filter(item => item.pressure === 'خروج پول').length, 0)}</div>
                                </div>
                                <div className="rounded-lg bg-white dark:bg-gray-800 border border-slate-200 dark:border-slate-700 p-2">
                                    <div className="text-xs text-slate-500">مبنای شدت</div>
                                    <div className="font-bold mt-1">جریان خالص ÷ ارزش معاملات</div>
                                </div>
                            </div>
                            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                                <table className="w-full text-sm">
                                    <thead><tr className="bg-slate-100 dark:bg-slate-700/80">
                                        <th className="px-3 py-3 text-center">رتبه</th>
                                        <th className="px-3 py-3 text-center">نماد</th>
                                        <th className="px-3 py-3 text-center whitespace-nowrap">جریان پول خالص</th>
                                        <th className="px-3 py-3 text-center whitespace-nowrap">جریان پول حقیقی</th>
                                        <th className="px-3 py-3 text-center whitespace-nowrap">جریان پول حقوقی</th>
                                        <th className="px-3 py-3 text-center whitespace-nowrap">شدت جریان پول</th>
                                        <th className="px-3 py-3 text-center whitespace-nowrap">سهم حقیقی از جریان</th>
                                        <th className="px-3 py-3 text-center whitespace-nowrap">فشار بازار</th>
                                    </tr></thead>
                                    <tbody>{moneyFlowMetrics.map((item, index) => <tr key={item.symbol} className="border-t border-slate-100 dark:border-slate-700">
                                        <td className="px-3 py-3 text-center font-bold">{rankBySymbol.get(item.symbol) ?? index + 1}</td>
                                        <td className="px-3 py-3 text-center font-bold text-cyan-700 dark:text-cyan-300">{item.symbol}</td>
                                        <td className="px-3 py-3 text-center font-bold">{formatNumber(item.net, 0)}</td>
                                        <td className="px-3 py-3 text-center">{formatNumber(item.real, 0)}</td>
                                        <td className="px-3 py-3 text-center">{formatNumber(item.legal, 0)}</td>
                                        <td className="px-3 py-3 text-center font-bold">{item.netIntensity == null ? '—' : String(formatNumber(item.netIntensity, 2)) + '٪'}</td>
                                        <td className="px-3 py-3 text-center">{item.realShare == null ? '—' : String(formatNumber(item.realShare, 1)) + '٪'}</td>
                                        <td className="px-3 py-3 text-center font-bold">{item.pressure}</td>
                                    </tr>)}</tbody>
                                </table>
                            </div>
                            <div className="text-xs text-slate-500 mt-2">
                                «فشار بازار» فقط از علامت جریان پول خالص همان روز استخراج شده است. در صورت نبود داده معتبر، مقدار به‌صورت «داده ناکافی» نمایش داده می‌شود.
                            </div>
                        </div>
                    </div>

                    <div className="px-5 pb-5">
                        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/30 p-4">
                            <div className="font-bold text-slate-800 dark:text-slate-100 mb-1">مقایسه ارزش‌گذاری و داده‌های بنیادی</div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 mb-3">EPS، P/E، بازده سود، فاصله P/E از میانه گروه و امتیاز بنیادی از داده‌های واقعی مقایسه می‌شوند. EPS به‌تنهایی معیار رتبه‌بندی بین شرکت‌ها نیست، چون تعداد سهام شرکت‌ها متفاوت است.</div>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
                                <div className="rounded-lg bg-white dark:bg-gray-800 border border-slate-200 dark:border-slate-700 p-2">
                                    <div className="text-xs text-slate-500">میانه P/E معتبر گروه</div>
                                    <div className="font-bold mt-1">{valuationAnalysis.medianPe == null ? '—' : formatNumber(valuationAnalysis.medianPe, 2)}</div>
                                </div>
                                <div className="rounded-lg bg-white dark:bg-gray-800 border border-slate-200 dark:border-slate-700 p-2">
                                    <div className="text-xs text-slate-500">تعداد P/E معتبر</div>
                                    <div className="font-bold mt-1">{formatNumber(valuationAnalysis.validPeCount, 0)}</div>
                                </div>
                                <div className="rounded-lg bg-white dark:bg-gray-800 border border-slate-200 dark:border-slate-700 p-2">
                                    <div className="text-xs text-slate-500">مبنای مقایسه</div>
                                    <div className="font-bold mt-1">P/E و بازده سود</div>
                                </div>
                            </div>

                            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                                <table className="w-full text-sm"><thead><tr className="bg-slate-100 dark:bg-slate-700/80">
                                    <th className="px-3 py-3 text-center">رتبه</th><th className="px-3 py-3 text-center">نماد</th><th className="px-3 py-3 text-center">EPS</th><th className="px-3 py-3 text-center">P/E</th><th className="px-3 py-3 text-center whitespace-nowrap">بازده سود</th><th className="px-3 py-3 text-center whitespace-nowrap">فاصله P/E از میانه گروه</th><th className="px-3 py-3 text-center whitespace-nowrap">امتیاز بنیادی</th>
                                </tr></thead><tbody>{valuationAnalysis.rows.map((item) => <tr key={item.symbol} className="border-t border-slate-100 dark:border-slate-700">
                                    <td className="px-3 py-3 text-center font-bold">{rankBySymbol.get(item.symbol) ?? '—'}</td><td className="px-3 py-3 text-center font-bold text-cyan-700 dark:text-cyan-300">{item.symbol}</td><td className="px-3 py-3 text-center">{formatNumber(item.eps, 2)}</td><td className="px-3 py-3 text-center">{formatNumber(item.pe, 2)}</td><td className="px-3 py-3 text-center font-bold">{item.earningsYield == null ? '—' : String(formatNumber(item.earningsYield, 2)) + '٪'}</td><td className="px-3 py-3 text-center font-bold">{item.peDistance == null ? '—' : String(formatNumber(item.peDistance, 2)) + '٪'}</td><td className="px-3 py-3 text-center font-bold">{formatNumber(item.fundamentalScore, 0)}</td>
                                </tr>)}</tbody></table>
                            </div>
                            <div className="text-xs text-slate-500 mt-2">فاصله مثبت یعنی P/E نماد بالاتر از میانه P/E نمادهای دارای P/E معتبر است؛ P/E منفی یا نامعتبر از این محاسبه کنار گذاشته می‌شود.</div>
                        </div>
                    </div>

                    <div className="px-5 pb-5">
                        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/30 p-4">
                            <div className="font-bold text-slate-800 dark:text-slate-100 mb-1">کیفیت و سازگاری داده‌های مقایسه</div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                                امتیاز کیفیت برای هر نماد از پوشش فیلدهای قابل‌مقایسه و پوشش تاریخچه واقعی محاسبه شده است. این امتیاز معیار کیفیت داده است، نه امتیاز سرمایه‌گذاری.
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                                <div className="rounded-lg bg-white dark:bg-gray-800 border border-slate-200 dark:border-slate-700 p-2">
                                    <div className="text-xs text-slate-500">میانگین کیفیت داده</div>
                                    <div className="font-bold mt-1">{deterministicResult.metrics.averageDataQuality == null ? '—' : String(formatNumber(Number(deterministicResult.metrics.averageDataQuality), 0)) + '٪'}</div>
                                </div>
                                <div className="rounded-lg bg-white dark:bg-gray-800 border border-slate-200 dark:border-slate-700 p-2">
                                    <div className="text-xs text-slate-500">سازگاری بین نمادها</div>
                                    <div className="font-bold mt-1">{deterministicResult.metrics.comparisonConsistency == null ? '—' : String(formatNumber(Number(deterministicResult.metrics.comparisonConsistency), 0)) + '٪'}</div>
                                </div>
                                <div className="rounded-lg bg-white dark:bg-gray-800 border border-slate-200 dark:border-slate-700 p-2">
                                    <div className="text-xs text-slate-500">نمادهای قابل‌مقایسه</div>
                                    <div className="font-bold mt-1">{formatNumber(deterministicResult.rows.filter(row => row.comparisonQuality?.deterministicReady !== false).length, 0)}</div>
                                </div>
                                <div className="rounded-lg bg-white dark:bg-gray-800 border border-slate-200 dark:border-slate-700 p-2">
                                    <div className="text-xs text-slate-500">فیلدهای ارزیابی</div>
                                    <div className="font-bold mt-1">۹ فیلد + تاریخچه</div>
                                </div>
                            </div>
                            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                                <table className="w-full text-sm">
                                    <thead><tr className="bg-slate-100 dark:bg-slate-700/80">
                                        <th className="px-3 py-3 text-center">رتبه</th>
                                        <th className="px-3 py-3 text-center">نماد</th>
                                        <th className="px-3 py-3 text-center">امتیاز کیفیت</th>
                                        <th className="px-3 py-3 text-center">سطح کیفیت</th>
                                        <th className="px-3 py-3 text-center">پوشش فیلدها</th>
                                        <th className="px-3 py-3 text-center">پوشش تاریخچه</th>
                                        <th className="px-3 py-3 text-center">فیلدهای معتبر</th>
                                        <th className="px-3 py-3 text-center">تعداد نقاط تاریخچه</th>
                                    </tr></thead>
                                    <tbody>{sortedRows.map((row, index) => {
                                        const quality = row.comparisonQuality;
                                        return <tr key={row.symbol} className="border-t border-slate-100 dark:border-slate-700">
                                            <td className="px-3 py-3 text-center font-bold">{rankBySymbol.get(row.symbol) ?? index + 1}</td>
                                            <td className="px-3 py-3 text-center font-bold text-cyan-700 dark:text-cyan-300">{row.symbol}</td>
                                            <td className="px-3 py-3 text-center font-black">{quality ? String(formatNumber(quality.score, 0)) + '٪' : '—'}</td>
                                            <td className="px-3 py-3 text-center font-bold">{quality?.level || '—'}</td>
                                            <td className="px-3 py-3 text-center">{quality ? String(formatNumber(quality.fieldCoverage, 0)) + '٪' : '—'}</td>
                                            <td className="px-3 py-3 text-center">{quality ? String(formatNumber(quality.historyCoverage, 0)) + '٪' : '—'}</td>
                                            <td className="px-3 py-3 text-center">{quality ? quality.availableFields + ' از ' + quality.totalFields : '—'}</td>
                                            <td className="px-3 py-3 text-center">{quality ? formatNumber(quality.historyPoints, 0) : '—'}</td>
                                        </tr>;
                                    })}</tbody>
                                </table>
                            </div>
                            <div className="text-xs text-slate-500 mt-2">
                                وزن کیفیت فیلدهای مقایسه‌ای ۴۵٪ و وزن پوشش تاریخچه ۵۵٪ است؛ امتیاز به‌صورت قطعی محاسبه می‌شود و جایگزین تحلیل بنیادی یا تکنیکال نیست.
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 px-5 pb-5">
                        {sortedRows.map((row) => (
                            <div key={row.symbol} className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-slate-50/70 dark:bg-slate-900/30">
                                <div className="flex items-center justify-between gap-3 mb-4">
                                    <div><div className="text-xs text-slate-500">رتبه {rankBySymbol.get(row.symbol) ?? '—'}</div><div className="text-xl font-black text-cyan-700 dark:text-cyan-300">{row.symbol}</div></div>
                                    <div className="text-left"><div className="text-xs text-slate-500">امتیاز کل</div><div className="text-2xl font-black">{formatNumber(row.totalScore, 0)}</div></div>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                    {[
                                        ['تکنیکال', formatNumber(row.technicalScore, 0)], ['بنیادی', formatNumber(row.fundamentalScore, 0)], ['P/E', formatNumber(row.pe, 2)], ['جریان پول', formatNumber(row.netMoneyFlow, 0)],
                                        ['ریسک', row.riskLevel || '—'], ['توصیه', row.recommendation || '—'], ['کیفیت داده', typeof row.dataQuality === 'object' ? (row.dataQuality?.score ?? row.dataQuality?.quality ?? '—') : (row.dataQuality || '—')], ['روند', row.trend || '—'],
                                    ].map(([label, value]) => <div key={String(label)} className="rounded-lg bg-white dark:bg-gray-800 border border-slate-200 dark:border-slate-700 p-2"><div className="text-xs text-slate-500">{label}</div><div className="font-bold mt-1">{value}</div></div>)}
                                </div>
                                <div className="mt-3 text-xs text-slate-500">تغییر روزانه: <span className="font-semibold text-slate-700 dark:text-slate-200">{row.priceChangePercent == null ? '—' : String(formatNumber(row.priceChangePercent, 2)) + '٪'}</span></div>
                            </div>
                        ))}
                    </div>

                    <div className="px-5 pb-5">
                        <div className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-3">مقایسه کامل داده‌ها</div>
                        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                            <table className="w-full text-sm"><thead><tr className="bg-slate-100 dark:bg-slate-700/80">
                                {['رتبه','نماد','قیمت فعلی','قیمت پایانی','تغییر روزانه','EPS','P/E','ارزش بازار','حجم معاملات','ارزش معاملات','امتیاز تکنیکال','امتیاز بنیادی','جریان پول','جریان پول حقیقی','جریان پول حقوقی','ریسک','روند'].map(h => <th key={h} className="px-3 py-3 whitespace-nowrap text-center">{h}</th>)}
                            </tr></thead><tbody>{sortedRows.map((row) => <tr key={row.symbol} className="border-t border-slate-100 dark:border-slate-700">
                                <td className="px-3 py-3 text-center font-bold">{rankBySymbol.get(row.symbol) ?? '—'}</td><td className="px-3 py-3 text-center font-bold text-cyan-700 dark:text-cyan-300">{row.symbol}</td><td className="px-3 py-3 text-center">{formatNumber(row.currentPrice, 0)}</td><td className="px-3 py-3 text-center">{formatNumber(row.closingPrice, 0)}</td><td className="px-3 py-3 text-center">{row.priceChangePercent == null ? '—' : String(formatNumber(row.priceChangePercent, 2)) + '٪'}</td><td className="px-3 py-3 text-center">{formatNumber(row.eps, 2)}</td><td className="px-3 py-3 text-center">{formatNumber(row.pe, 2)}</td><td className="px-3 py-3 text-center">{formatNumber(row.marketCap, 0)}</td><td className="px-3 py-3 text-center">{formatNumber(row.tradedVolume, 0)}</td><td className="px-3 py-3 text-center">{formatNumber(row.tradedValue, 0)}</td><td className="px-3 py-3 text-center">{formatNumber(row.technicalScore, 0)}</td><td className="px-3 py-3 text-center">{formatNumber(row.fundamentalScore, 0)}</td><td className="px-3 py-3 text-center">{formatNumber(row.netMoneyFlow, 0)}</td><td className="px-3 py-3 text-center">{formatNumber(row.realMoneyFlow, 0)}</td><td className="px-3 py-3 text-center">{formatNumber(row.legalMoneyFlow, 0)}</td><td className="px-3 py-3 text-center">{row.riskLevel || '—'}</td><td className="px-3 py-3 text-center">{row.trend || '—'}</td>
                            </tr>)}</tbody></table>
                        </div>
                    </div>

                    {deterministicResult.failed.length > 0 && <div className="mx-5 mb-5 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4">
                        <div className="font-bold text-amber-800 dark:text-amber-300 mb-2">نمادهای بدون داده معتبر</div>
                        <div className="space-y-1 text-sm text-amber-700 dark:text-amber-200">{deterministicResult.failed.map((item) => <div key={String(item.symbol)}>{String(item.symbol)}: {String(item.message || 'داده معتبر در دسترس نیست.')}</div>)}</div>
                    </div>}
                </div>
            )}
        </div>
    );
};

export default StockComparison;
