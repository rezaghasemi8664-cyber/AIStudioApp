import React, { useState } from 'react';
import type { StoredUser, StockComparisonResult } from '../types';
import * as analysisUsageService from '../services/analysisUsageService';
import * as storageService from '../services/storageService';
import { useNotification } from './NotificationSystem';
import { SparklesIcon, ClipboardDocumentIcon } from './Icons';

interface StockComparisonProps {
    currentUser: StoredUser;
    isOnline: boolean;
}

const AnalysisCard: React.FC<{ title: string, content: string }> = ({ title, content }) => (
    <div>
        <h4 className="text-lg font-semibold mb-2 border-b-2 border-cyan-500 pb-1">{title}</h4>
        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">{content}</p>
    </div>
);

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
            // A comparison costs two analysis credits
            analysisUsageService.beginAnalysis(currentUser);
            analysisUsageService.beginAnalysis(currentUser);

            const settingsKey = `user_settings_${currentUser.id}`;
            const settingsJson = storageService.getItem(settingsKey);
            const settings = settingsJson ? JSON.parse(settingsJson) : { chartDays: 30, chartWeeks: 24 };
            
            const comparisonResult = await geminiService.compareStocks(symbol1, symbol2, { dailyCount: settings.chartDays, weeklyCount: settings.chartWeeks });
            setResult(comparisonResult);

        } catch (err: any) {
            setError(err.message || 'یک خطای ناشناخته در هنگام مقایسه رخ داد.');
            addNotification(err.message, 'error');
        } finally {
            setLoading(false);
        }
    };


    return (
        <div className="max-w-6xl mx-auto">
            <h2 className="text-2xl font-bold text-cyan-600 dark:text-cyan-400 mb-4 flex items-center gap-2"><ClipboardDocumentIcon /> مقایسه سهام</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">دو نماد سهم را وارد کنید تا هوش مصنوعی آن‌ها را از جنبه‌های مختلف با یکدیگر مقایسه کرده و بهترین گزینه را پیشنهاد دهد.</p>

            <div 
                data-style-id="analysis-form-card"
                className="p-6 rounded-lg shadow-md mb-8"
                style={{ backgroundColor: 'var(--analysis-form-card-bg)' }}
            >
                <form onSubmit={handleCompare} className="flex flex-col sm:flex-row items-center gap-4">
                    <input
                        type="text"
                        value={symbol1}
                        onChange={(e) => setSymbol1(e.target.value.toUpperCase())}
                        placeholder="نماد اول (مثلا: خودرو)"
                        required
                        className="flex-grow w-full border rounded-md px-4 py-3 text-lg focus:outline-none focus:ring-2"
                        style={{ backgroundColor: 'var(--input-bg)', color: 'var(--input-color)', borderColor: 'var(--input-border)', '--tw-ring-color': 'var(--input-focus-ring)' } as React.CSSProperties}
                    />
                     <span className="font-bold text-gray-500">در مقابل</span>
                    <input
                        type="text"
                        value={symbol2}
                        onChange={(e) => setSymbol2(e.target.value.toUpperCase())}
                        placeholder="نماد دوم (مثلا: خساپا)"
                        required
                        className="flex-grow w-full border rounded-md px-4 py-3 text-lg focus:outline-none focus:ring-2"
                        style={{ backgroundColor: 'var(--input-bg)', color: 'var(--input-color)', borderColor: 'var(--input-border)', '--tw-ring-color': 'var(--input-focus-ring)' } as React.CSSProperties}
                    />
                    <button
                        type="submit"
                        disabled={loading || !symbol1.trim() || !symbol2.trim() || !isOnline}
                        data-style-id="analysis-button"
                        className="w-full sm:w-auto flex items-center justify-center gap-2 font-bold py-3 px-8 rounded-md hover:animate-subtle-bounce disabled:bg-gray-500 text-lg"
                        style={{ backgroundColor: 'var(--analysis-button-bg)', color: 'var(--analysis-button-color)' }}
                    >
                         {loading ? <div className="w-5 h-5 border-2 border-t-transparent border-white rounded-full animate-spin"></div> : <SparklesIcon />}
                         <span>مقایسه کن</span>
                    </button>
                </form>
            </div>
            
            {error && <div className="mt-6 bg-red-100 border border-red-400 text-red-700 dark:bg-red-900/50 dark:border-red-700 dark:text-red-300 px-4 py-3 rounded-md">{error}</div>}

            {result && (
                <div className="space-y-8 animate-fade-in">
                    {/* Final Recommendation */}
                    <div className="p-6 rounded-lg shadow-md bg-indigo-50 dark:bg-indigo-900/40 border-l-4 border-indigo-500">
                        <h3 className="text-xl font-bold mb-2 text-indigo-800 dark:text-indigo-300">جمع‌بندی و توصیه نهایی</h3>
                        <p className="text-gray-800 dark:text-gray-200 leading-relaxed">{result.final_recommendation}</p>
                    </div>
                    <div className="p-6 rounded-lg shadow-md bg-gray-50 dark:bg-gray-800/50">
                        <h3 className="text-xl font-bold mb-2 text-gray-800 dark:text-gray-200">خلاصه مقایسه</h3>
                        <p className="text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">{result.comparison_summary}</p>
                    </div>

                    {/* Side-by-side comparison */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* Symbol 1 */}
                        <div className="p-6 rounded-lg shadow-md space-y-4 bg-white dark:bg-gray-800">
                            <h3 className="text-2xl font-bold text-cyan-700 dark:text-cyan-400">{result.symbol1_analysis.recommendation}: {symbol1}</h3>
                             <AnalysisCard title="خلاصه" content={result.symbol1_analysis.summary} />
                             <AnalysisCard title="تحلیل تکنیکال" content={result.symbol1_analysis.technicalAnalysis} />
                             <AnalysisCard title="تحلیل بنیادی" content={result.symbol1_analysis.fundamentalAnalysis} />
                        </div>
                        {/* Symbol 2 */}
                        <div className="p-6 rounded-lg shadow-md space-y-4 bg-white dark:bg-gray-800">
                             <h3 className="text-2xl font-bold text-cyan-700 dark:text-cyan-400">{result.symbol2_analysis.recommendation}: {symbol2}</h3>
                             <AnalysisCard title="خلاصه" content={result.symbol2_analysis.summary} />
                             <AnalysisCard title="تحلیل تکنیکال" content={result.symbol2_analysis.technicalAnalysis} />
                             <AnalysisCard title="تحلیل بنیادی" content={result.symbol2_analysis.fundamentalAnalysis} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StockComparison;