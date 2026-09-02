import React, { useState } from 'react';
import type { StoredUser, StockComparisonResult } from '../types';
import * as analysisUsageService from '../services/analysisUsageService';
import * as storageService from '../services/storageService';
import { useNotification } from './NotificationSystem';
import { SparklesIcon, ClipboardDocumentIcon } from './Icons';
import { compareStocksWithMarketData, type ComparisonMarketSnapshot } from '../services/stockComparisonDataService';

interface StockComparisonProps {
    currentUser: StoredUser;
    isOnline: boolean;
}

const PERSIAN_LABELS: Record<string, string> = {
    recommendation: 'توصیه', summary: 'خلاصه', technicalAnalysis: 'تحلیل تکنیکال', technical_analysis: 'تحلیل تکنیکال',
    fundamentalAnalysis: 'تحلیل بنیادی', fundamental_analysis: 'تحلیل بنیادی', comparison_summary: 'خلاصه مقایسه',
    comparisonSummary: 'خلاصه مقایسه', final_recommendation: 'توصیه نهایی', finalRecommendation: 'توصیه نهایی',
    winner: 'گزینه برتر', reason: 'دلیل', scores: 'امتیازها', details: 'جزئیات', riskLevel: 'سطح ریسک',
    confidence: 'اطمینان', currentPrice: 'قیمت فعلی', targetPrice: 'قیمت هدف', entryPrice: 'قیمت ورود', stopLoss: 'حد ضرر',
};

const toReadablePersianText = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) return value.map((item) => toReadablePersianText(item)).filter(Boolean).join('\n');
    if (typeof value === 'object') {
        return Object.entries(value as Record<string, unknown>).map(([key, item]) => {
            const label = PERSIAN_LABELS[key] || key;
            const text = toReadablePersianText(item);
            return text ? `${label}: ${text}` : '';
        }).filter(Boolean).join('\n');
    }
    return String(value);
};

const formatNumber = (value: number | null | undefined, digits = 2): string => {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
    return Number(value).toLocaleString('fa-IR', { maximumFractionDigits: digits });
};

const getFundamentalValue = (analysis: any, key: string): number | null => {
    const value = analysis?.fundamental?.[key] ?? analysis?.fundamentals?.[key] ?? analysis?.metrics?.[key] ?? analysis?.[key];
    const number = Number(value);
    return value === null || value === undefined || value === '' || !Number.isFinite(number) ? null : number;
};

const AnalysisCard: React.FC<{ title: string, content: unknown }> = ({ title, content }) => {
    const text = toReadablePersianText(content);
    return (
        <div dir="rtl" style={{ direction: 'rtl', textAlign: 'right' }}>
            <h4 className="text-lg font-semibold mb-2 border-b-2 border-cyan-500 pb-1">{title}</h4>
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap" dir="rtl" style={{ direction: 'rtl', textAlign: 'right', unicodeBidi: 'plaintext' }}>
                {text || 'اطلاعاتی در این بخش از سرویس مقایسه دریافت نشد.'}
            </p>
        </div>
    );
};

const FundamentalTable: React.FC<{
    symbol1: string;
    symbol2: string;
    snapshot1: ComparisonMarketSnapshot | undefined;
    snapshot2: ComparisonMarketSnapshot | undefined;
    result: StockComparisonResult;
}> = ({ symbol1, symbol2, snapshot1, snapshot2, result }) => {
    const analysis1: any = result.symbol1_analysis || {};
    const analysis2: any = result.symbol2_analysis || {};
    const eps1 = snapshot1?.eps ?? getFundamentalValue(analysis1, 'eps');
    const eps2 = snapshot2?.eps ?? getFundamentalValue(analysis2, 'eps');
    const pe1 = snapshot1?.pe ?? getFundamentalValue(analysis1, 'pe');
    const pe2 = snapshot2?.pe ?? getFundamentalValue(analysis2, 'pe');
    const price1 = snapshot1?.currentPrice ?? null;
    const price2 = snapshot2?.currentPrice ?? null;
    const marketCap1 = snapshot1?.marketCap ?? getFundamentalValue(analysis1, 'marketCap');
    const marketCap2 = snapshot2?.marketCap ?? getFundamentalValue(analysis2, 'marketCap');

    const winnerFor = (kind: 'higher' | 'lower', a: number | null, b: number | null) => {
        if (a === null || b === null || a === b) return '—';
        const firstWins = kind === 'higher' ? a > b : a < b;
        return firstWins ? symbol1 : symbol2;
    };

    const rows = [
        { label: 'قیمت پایانی', a: formatNumber(price1, 0), b: formatNumber(price2, 0), result: 'مبنای محاسبه ارزش‌گذاری' },
        { label: 'EPS', a: formatNumber(eps1, 2), b: formatNumber(eps2, 2), result: winnerFor('higher', eps1, eps2) === '—' ? 'قابل مقایسه نیست' : `EPS بالاتر: ${winnerFor('higher', eps1, eps2)}` },
        { label: 'P/E', a: formatNumber(pe1, 2), b: formatNumber(pe2, 2), result: winnerFor('lower', pe1, pe2) === '—' ? 'قابل مقایسه نیست' : `P/E پایین‌تر: ${winnerFor('lower', pe1, pe2)}` },
        { label: 'ارزش بازار', a: formatNumber(marketCap1, 0), b: formatNumber(marketCap2, 0), result: 'صرفاً شاخص اندازه شرکت' },
        { label: 'تغییر قیمت', a: snapshot1?.priceChangePercent == null ? '—' : `${formatNumber(snapshot1.priceChangePercent, 2)}٪`, b: snapshot2?.priceChangePercent == null ? '—' : `${formatNumber(snapshot2.priceChangePercent, 2)}٪`, result: 'وضعیت روز بازار' },
    ];

    return (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-gray-800 shadow-sm" dir="rtl">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80">
                <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">تحلیل بنیادی و مقایسه عددی</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">ارقام P/E و EPS مستقیماً از اسنپ‌شات داده بازار دریافت شده‌اند و توسط هوش مصنوعی تولید نشده‌اند.</p>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                    <thead>
                        <tr className="bg-slate-100 dark:bg-slate-700/80 text-slate-700 dark:text-slate-200">
                            <th className="px-4 py-3 text-right border-b border-l dark:border-slate-600">معیار</th>
                            <th className="px-4 py-3 text-center border-b border-l dark:border-slate-600">{symbol1}</th>
                            <th className="px-4 py-3 text-center border-b border-l dark:border-slate-600">{symbol2}</th>
                            <th className="px-4 py-3 text-right border-b dark:border-slate-600">نتیجه / تفسیر</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, index) => (
                            <tr key={row.label} className={index % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-slate-50/70 dark:bg-gray-800/60'}>
                                <td className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-200 border-b border-l dark:border-slate-700">{row.label}</td>
                                <td className="px-4 py-3 text-center font-medium text-slate-900 dark:text-white border-b border-l dark:border-slate-700">{row.a}</td>
                                <td className="px-4 py-3 text-center font-medium text-slate-900 dark:text-white border-b border-l dark:border-slate-700">{row.b}</td>
                                <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300 border-b dark:border-slate-700">{row.result}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const normalizeComparisonResult = (raw: any, symbol1: string, symbol2: string): StockComparisonResult => {
    const source = raw?.data && typeof raw.data === 'object' ? raw.data : raw;
    if (source?.symbol1_analysis || source?.symbol2_analysis) {
        const a1 = source.symbol1_analysis || {};
        const a2 = source.symbol2_analysis || {};
        return {
            symbol1_analysis: { ...a1, recommendation: a1.recommendation || 'نگهداری', summary: a1.summary || '', technicalAnalysis: a1.technicalAnalysis || a1.technical_analysis || '', fundamentalAnalysis: a1.fundamentalAnalysis || a1.fundamental_analysis || '' },
            symbol2_analysis: { ...a2, recommendation: a2.recommendation || 'نگهداری', summary: a2.summary || '', technicalAnalysis: a2.technicalAnalysis || a2.technical_analysis || '', fundamentalAnalysis: a2.fundamentalAnalysis || a2.fundamental_analysis || '' },
            comparison_summary: source.comparison_summary || source.comparisonSummary || '',
            final_recommendation: source.final_recommendation || source.finalRecommendation || '',
        } as StockComparisonResult;
    }

    const winner = String(source?.winner || '').trim();
    const reason = String(source?.reason || '').trim();
    const details = typeof source?.details === 'string' ? source.details : source?.details ? toReadablePersianText(source.details) : '';
    const scores = source?.scores && typeof source.scores === 'object' ? source.scores : {};
    const buildAnalysis = (symbol: string) => {
        const isWinner = Boolean(winner && symbol === winner);
        const score = scores[symbol];
        const scoreText = score !== undefined && score !== null ? `امتیاز مقایسه: ${toReadablePersianText(score)}` : '';
        return {
            recommendation: isWinner ? 'خرید' : 'نگهداری',
            summary: isWinner ? `${symbol} به عنوان گزینه برتر مقایسه انتخاب شده است. ${reason}`.trim() : `${symbol} در این مقایسه به عنوان گزینه برتر انتخاب نشده است. ${reason}`.trim(),
            technicalAnalysis: scoreText || 'تحلیل تکنیکال تفصیلی در پاسخ فعلی سرویس ارائه نشده است.',
            fundamentalAnalysis: details || 'تحلیل بنیادی تفصیلی در پاسخ فعلی سرویس ارائه نشده است.',
        };
    };
    return {
        symbol1_analysis: buildAnalysis(symbol1), symbol2_analysis: buildAnalysis(symbol2),
        comparison_summary: details || reason || `نتیجه مقایسه برای ${symbol1} و ${symbol2} دریافت شد.`,
        final_recommendation: winner ? `برنده مقایسه: ${winner}${reason ? ` — ${reason}` : ''}` : 'سرویس مقایسه برنده مشخصی اعلام نکرده است.',
    } as StockComparisonResult;
};

const StockComparison: React.FC<StockComparisonProps> = ({ currentUser, isOnline }) => {
    const [symbol1, setSymbol1] = useState('');
    const [symbol2, setSymbol2] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<StockComparisonResult | null>(null);
    const [snapshots, setSnapshots] = useState<Record<string, ComparisonMarketSnapshot>>({});
    const [error, setError] = useState<string | null>(null);
    const { addNotification } = useNotification();

    const handleCompare = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true); setError(null); setResult(null); setSnapshots({});
        try {
            analysisUsageService.beginAnalysis(currentUser);
            const settingsKey = `user_settings_${currentUser.id}`;
            const settingsJson = storageService.getItem(settingsKey);
            const settings = settingsJson ? JSON.parse(settingsJson) : { chartDays: 30, chartWeeks: 24 };
            const response = await compareStocksWithMarketData(symbol1, symbol2, { dailyCount: settings.chartDays, weeklyCount: settings.chartWeeks });
            setSnapshots(response.snapshots);
            setResult(normalizeComparisonResult(response.result, symbol1, symbol2));
        } catch (err: any) {
            const message = err?.message || 'یک خطای ناشناخته در هنگام مقایسه رخ داد.';
            setError(message); addNotification(message, 'error');
        } finally { setLoading(false); }
    };

    return (
        <div className="max-w-6xl mx-auto" dir="rtl" style={{ direction: 'rtl' }}>
            <h2 className="text-2xl font-bold text-cyan-600 dark:text-cyan-400 mb-4 flex items-center gap-2">مقایسه سهام <ClipboardDocumentIcon /></h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6 text-right">دو نماد سهم را وارد کنید تا از نظر تکنیکال، بنیادی، ارزش‌گذاری و ریسک با یکدیگر مقایسه شوند.</p>

            <div data-style-id="analysis-form-card" className="p-6 rounded-lg shadow-md mb-8" style={{ backgroundColor: 'var(--analysis-form-card-bg)' }}>
                <form onSubmit={handleCompare} className="flex flex-col sm:flex-row items-center gap-4" dir="rtl">
                    <input type="text" value={symbol1} onChange={(e) => setSymbol1(e.target.value.toUpperCase())} placeholder="نماد اول (مثلا: خودرو)" required dir="rtl" className="flex-grow w-full border rounded-md px-4 py-3 text-lg focus:outline-none focus:ring-2" style={{ backgroundColor: 'var(--input-bg)', color: 'var(--input-color)', borderColor: 'var(--input-border)', '--tw-ring-color': 'var(--input-focus-ring)' } as React.CSSProperties} />
                    <span className="font-bold text-gray-500 whitespace-nowrap">در مقابل</span>
                    <input type="text" value={symbol2} onChange={(e) => setSymbol2(e.target.value.toUpperCase())} placeholder="نماد دوم (مثلا: خساپا)" required dir="rtl" className="flex-grow w-full border rounded-md px-4 py-3 text-lg focus:outline-none focus:ring-2" style={{ backgroundColor: 'var(--input-bg)', color: 'var(--input-color)', borderColor: 'var(--input-border)', '--tw-ring-color': 'var(--input-focus-ring)' } as React.CSSProperties} />
                    <button type="submit" disabled={loading || !symbol1.trim() || !symbol2.trim() || !isOnline} data-style-id="analysis-button" className="w-full sm:w-auto flex items-center justify-center gap-2 font-bold py-3 px-8 rounded-md hover:animate-subtle-bounce disabled:bg-gray-500 text-lg" style={{ backgroundColor: 'var(--analysis-button-bg)', color: 'var(--analysis-button-color)' }}>
                        {loading ? <div className="w-5 h-5 border-2 border-t-transparent border-white rounded-full animate-spin"></div> : <SparklesIcon />}
                        <span>مقایسه کن</span>
                    </button>
                </form>
            </div>

            {error && <div dir="rtl" className="mt-6 bg-red-100 border border-red-400 text-red-700 dark:bg-red-900/50 dark:border-red-700 dark:text-red-300 px-4 py-3 rounded-md text-right">{error}</div>}

            {result && (
                <div className="space-y-8 animate-fade-in" dir="rtl" style={{ direction: 'rtl', textAlign: 'right' }}>
                    <div className="p-6 rounded-xl shadow-md bg-indigo-50 dark:bg-indigo-900/40 border border-indigo-200 dark:border-indigo-800 border-r-4 border-r-indigo-500">
                        <h3 className="text-xl font-bold mb-2 text-indigo-800 dark:text-indigo-300">جمع‌بندی و توصیه نهایی</h3>
                        <p className="text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-wrap" dir="rtl" style={{ direction: 'rtl', textAlign: 'right', unicodeBidi: 'plaintext' }}>{toReadablePersianText(result.final_recommendation) || 'توصیه نهایی دریافت نشد.'}</p>
                    </div>

                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-gray-800 shadow-sm">
                        <div className="px-5 py-4 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700">
                            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">خلاصه مقایسه</h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm border-collapse">
                                <thead><tr className="bg-slate-100 dark:bg-slate-700/80 text-slate-700 dark:text-slate-200">
                                    <th className="px-4 py-3 text-right border-b border-l dark:border-slate-600">بخش</th>
                                    <th className="px-4 py-3 text-right border-b border-l dark:border-slate-600">{symbol1}</th>
                                    <th className="px-4 py-3 text-right border-b border-l dark:border-slate-600">{symbol2}</th>
                                    <th className="px-4 py-3 text-right border-b dark:border-slate-600">نتیجه</th>
                                </tr></thead>
                                <tbody>
                                    <tr className="bg-white dark:bg-gray-800"><td className="px-4 py-4 font-semibold border-b border-l dark:border-slate-700">خلاصه</td><td className="px-4 py-4 leading-7 border-b border-l dark:border-slate-700 whitespace-pre-wrap">{toReadablePersianText(result.symbol1_analysis?.summary) || '—'}</td><td className="px-4 py-4 leading-7 border-b border-l dark:border-slate-700 whitespace-pre-wrap">{toReadablePersianText(result.symbol2_analysis?.summary) || '—'}</td><td className="px-4 py-4 leading-7 border-b dark:border-slate-700 whitespace-pre-wrap">{toReadablePersianText(result.comparison_summary) || '—'}</td></tr>
                                    <tr className="bg-slate-50/70 dark:bg-gray-800/60"><td className="px-4 py-4 font-semibold border-b border-l dark:border-slate-700">تکنیکال</td><td className="px-4 py-4 leading-7 border-b border-l dark:border-slate-700 whitespace-pre-wrap">{toReadablePersianText(result.symbol1_analysis?.technicalAnalysis) || '—'}</td><td className="px-4 py-4 leading-7 border-b border-l dark:border-slate-700 whitespace-pre-wrap">{toReadablePersianText(result.symbol2_analysis?.technicalAnalysis) || '—'}</td><td className="px-4 py-4 leading-7 border-b dark:border-slate-700">بر اساس داده و تحلیل تکنیکال سرویس</td></tr>
                                    <tr className="bg-white dark:bg-gray-800"><td className="px-4 py-4 font-semibold border-b border-l dark:border-slate-700">بنیادی</td><td className="px-4 py-4 leading-7 border-b border-l dark:border-slate-700 whitespace-pre-wrap">{toReadablePersianText(result.symbol1_analysis?.fundamentalAnalysis) || '—'}</td><td className="px-4 py-4 leading-7 border-b border-l dark:border-slate-700 whitespace-pre-wrap">{toReadablePersianText(result.symbol2_analysis?.fundamentalAnalysis) || '—'}</td><td className="px-4 py-4 leading-7 border-b dark:border-slate-700">مقایسه عددی در جدول بنیادی زیر</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <FundamentalTable symbol1={symbol1} symbol2={symbol2} snapshot1={snapshots[symbol1.toUpperCase()]} snapshot2={snapshots[symbol2.toUpperCase()]} result={result} />

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div className="p-6 rounded-xl shadow-md space-y-4 bg-white dark:bg-gray-800 border border-slate-200 dark:border-slate-700" dir="rtl">
                            <h3 className="text-2xl font-bold text-cyan-700 dark:text-cyan-400">{toReadablePersianText(result.symbol1_analysis?.recommendation) || 'نگهداری'}: {symbol1}</h3>
                            <AnalysisCard title="خلاصه" content={result.symbol1_analysis?.summary} />
                            <AnalysisCard title="تحلیل تکنیکال" content={result.symbol1_analysis?.technicalAnalysis} />
                            <AnalysisCard title="تحلیل بنیادی" content={result.symbol1_analysis?.fundamentalAnalysis} />
                        </div>
                        <div className="p-6 rounded-xl shadow-md space-y-4 bg-white dark:bg-gray-800 border border-slate-200 dark:border-slate-700" dir="rtl">
                            <h3 className="text-2xl font-bold text-cyan-700 dark:text-cyan-400">{toReadablePersianText(result.symbol2_analysis?.recommendation) || 'نگهداری'}: {symbol2}</h3>
                            <AnalysisCard title="خلاصه" content={result.symbol2_analysis?.summary} />
                            <AnalysisCard title="تحلیل تکنیکال" content={result.symbol2_analysis?.technicalAnalysis} />
                            <AnalysisCard title="تحلیل بنیادی" content={result.symbol2_analysis?.fundamentalAnalysis} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StockComparison;
