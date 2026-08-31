import React, { useState } from 'react';
import type { StoredUser, StockComparisonResult } from '../types';
import * as analysisUsageService from '../services/analysisUsageService';
import * as storageService from '../services/storageService';
import * as gapgptService from '../services/gapgptService';
import { useNotification } from './NotificationSystem';
import { SparklesIcon, ClipboardDocumentIcon } from './Icons';

interface StockComparisonProps {
    currentUser: StoredUser;
    isOnline: boolean;
}

const PERSIAN_LABELS: Record<string, string> = {
    recommendation: 'توصیه',
    summary: 'خلاصه',
    technicalAnalysis: 'تحلیل تکنیکال',
    technical_analysis: 'تحلیل تکنیکال',
    fundamentalAnalysis: 'تحلیل بنیادی',
    fundamental_analysis: 'تحلیل بنیادی',
    comparison_summary: 'خلاصه مقایسه',
    comparisonSummary: 'خلاصه مقایسه',
    final_recommendation: 'توصیه نهایی',
    finalRecommendation: 'توصیه نهایی',
    winner: 'گزینه برتر',
    reason: 'دلیل',
    scores: 'امتیازها',
    details: 'جزئیات',
    riskLevel: 'سطح ریسک',
    confidence: 'اطمینان',
    currentPrice: 'قیمت فعلی',
    targetPrice: 'قیمت هدف',
    entryPrice: 'قیمت ورود',
    stopLoss: 'حد ضرر',
};

const toReadablePersianText = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) {
        return value.map((item) => toReadablePersianText(item)).filter(Boolean).join('\n');
    }
    if (typeof value === 'object') {
        return Object.entries(value as Record<string, unknown>)
            .map(([key, item]) => {
                const label = PERSIAN_LABELS[key] || key;
                const text = toReadablePersianText(item);
                return text ? `${label}: ${text}` : '';
            })
            .filter(Boolean)
            .join('\n');
    }
    return String(value);
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

const normalizeComparisonResult = (raw: any, symbol1: string, symbol2: string): StockComparisonResult => {
    const source = raw?.data && typeof raw.data === 'object' ? raw.data : raw;

    if (source?.symbol1_analysis || source?.symbol2_analysis) {
        const a1 = source.symbol1_analysis || {};
        const a2 = source.symbol2_analysis || {};
        return {
            symbol1_analysis: {
                ...a1,
                recommendation: a1.recommendation || 'نگهداری',
                summary: a1.summary || '',
                technicalAnalysis: a1.technicalAnalysis || a1.technical_analysis || '',
                fundamentalAnalysis: a1.fundamentalAnalysis || a1.fundamental_analysis || '',
            },
            symbol2_analysis: {
                ...a2,
                recommendation: a2.recommendation || 'نگهداری',
                summary: a2.summary || '',
                technicalAnalysis: a2.technicalAnalysis || a2.technical_analysis || '',
                fundamentalAnalysis: a2.fundamentalAnalysis || a2.fundamental_analysis || '',
            },
            comparison_summary: source.comparison_summary || source.comparisonSummary || '',
            final_recommendation: source.final_recommendation || source.finalRecommendation || '',
        } as StockComparisonResult;
    }

    const winner = String(source?.winner || '').trim();
    const reason = String(source?.reason || '').trim();
    const details = typeof source?.details === 'string'
        ? source.details
        : source?.details
            ? toReadablePersianText(source.details)
            : '';
    const scores = source?.scores && typeof source.scores === 'object' ? source.scores : {};
    const winnerLabel = winner || 'مشخص نشده';
    const comparisonSummary = details || reason || `نتیجه مقایسه برای ${symbol1} و ${symbol2} دریافت شد.`;

    const buildAnalysis = (symbol: string) => {
        const isWinner = Boolean(winner && symbol === winner);
        const score = scores[symbol];
        const scoreText = score !== undefined && score !== null ? `امتیاز مقایسه: ${toReadablePersianText(score)}` : '';
        return {
            recommendation: isWinner ? 'خرید' : 'نگهداری',
            summary: isWinner
                ? `${symbol} به عنوان گزینه برتر مقایسه انتخاب شده است. ${reason}`.trim()
                : `${symbol} در این مقایسه به عنوان گزینه برتر انتخاب نشده است. ${reason}`.trim(),
            technicalAnalysis: scoreText || 'تحلیل تکنیکال تفصیلی در پاسخ فعلی سرویس ارائه نشده است.',
            fundamentalAnalysis: details || 'تحلیل بنیادی تفصیلی در پاسخ فعلی سرویس ارائه نشده است.',
        };
    };

    return {
        symbol1_analysis: buildAnalysis(symbol1),
        symbol2_analysis: buildAnalysis(symbol2),
        comparison_summary: comparisonSummary,
        final_recommendation: winner
            ? `برنده مقایسه: ${winnerLabel}${reason ? ` — ${reason}` : ''}`
            : 'سرویس مقایسه برنده مشخصی اعلام نکرده است.',
    } as StockComparisonResult;
};

const StockComparison: React.FC<StockComparisonProps> = ({ currentUser, isOnline }) => {
    const [symbol1, setSymbol1] = useState('');
    const [symbol2, setSymbol2] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<StockComparisonResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const { addNotification } = useNotification();

    const handleCompare = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setResult(null);

        try {
            analysisUsageService.beginAnalysis(currentUser);

            const settingsKey = `user_settings_${currentUser.id}`;
            const settingsJson = storageService.getItem(settingsKey);
            const settings = settingsJson ? JSON.parse(settingsJson) : { chartDays: 30, chartWeeks: 24 };

            const comparisonResult = await gapgptService.compareStocks(
                symbol1,
                symbol2,
                { dailyCount: settings.chartDays, weeklyCount: settings.chartWeeks }
            );

            setResult(normalizeComparisonResult(comparisonResult, symbol1, symbol2));
        } catch (err: any) {
            const message = err?.message || 'یک خطای ناشناخته در هنگام مقایسه رخ داد.';
            setError(message);
            addNotification(message, 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-6xl mx-auto" dir="rtl" style={{ direction: 'rtl' }}>
            <h2 className="text-2xl font-bold text-cyan-600 dark:text-cyan-400 mb-4 flex items-center gap-2">مقایسه سهام <ClipboardDocumentIcon /></h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6 text-right">دو نماد سهم را وارد کنید تا هوش مصنوعی آن‌ها را از جنبه‌های مختلف با یکدیگر مقایسه کرده و بهترین گزینه را پیشنهاد دهد.</p>

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
                    <div className="p-6 rounded-lg shadow-md bg-indigo-50 dark:bg-indigo-900/40 border-r-4 border-indigo-500 border-l-0">
                        <h3 className="text-xl font-bold mb-2 text-indigo-800 dark:text-indigo-300">جمع‌بندی و توصیه نهایی</h3>
                        <p className="text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-wrap" dir="rtl" style={{ direction: 'rtl', textAlign: 'right', unicodeBidi: 'plaintext' }}>{toReadablePersianText(result.final_recommendation) || 'توصیه نهایی دریافت نشد.'}</p>
                    </div>
                    <div className="p-6 rounded-lg shadow-md bg-gray-50 dark:bg-gray-800/50">
                        <h3 className="text-xl font-bold mb-2 text-gray-800 dark:text-gray-200">خلاصه مقایسه</h3>
                        <p className="text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap" dir="rtl" style={{ direction: 'rtl', textAlign: 'right', unicodeBidi: 'plaintext' }}>{toReadablePersianText(result.comparison_summary) || 'خلاصه مقایسه دریافت نشد.'}</p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div className="p-6 rounded-lg shadow-md space-y-4 bg-white dark:bg-gray-800" dir="rtl">
                            <h3 className="text-2xl font-bold text-cyan-700 dark:text-cyan-400">{toReadablePersianText(result.symbol1_analysis?.recommendation) || 'نگهداری'}: {symbol1}</h3>
                            <AnalysisCard title="خلاصه" content={result.symbol1_analysis?.summary} />
                            <AnalysisCard title="تحلیل تکنیکال" content={result.symbol1_analysis?.technicalAnalysis} />
                            <AnalysisCard title="تحلیل بنیادی" content={result.symbol1_analysis?.fundamentalAnalysis} />
                        </div>
                        <div className="p-6 rounded-lg shadow-md space-y-4 bg-white dark:bg-gray-800" dir="rtl">
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
