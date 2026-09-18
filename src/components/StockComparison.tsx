import React, { useState } from 'react';
import type { StoredUser } from '../types';
import * as analysisUsageService from '../services/analysisUsageService';
import * as storageService from '../services/storageService';
import { useNotification } from './NotificationSystem';
import { ClipboardDocumentIcon } from './Icons';
import { compareDeterministicStocks, type DeterministicComparisonResult } from '../services/stockComparisonDataService';

interface StockComparisonProps {
    currentUser: StoredUser;
    isOnline: boolean;
}

const formatNumber = (value: number | null | undefined, digits = 2): string => {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
    return Number(value).toLocaleString('fa-IR', { maximumFractionDigits: digits });
};

const StockComparison: React.FC<StockComparisonProps> = ({ currentUser, isOnline }) => {
    const [symbol1, setSymbol1] = useState('');
    const [symbol2, setSymbol2] = useState('');
    const [extraSymbols, setExtraSymbols] = useState<string[]>([]);
    const [deterministicResult, setDeterministicResult] = useState<DeterministicComparisonResult | null>(null);
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
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 px-5 pb-5">
                        {deterministicResult.rows.map((row) => (
                            <div key={row.symbol} className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-slate-50/70 dark:bg-slate-900/30">
                                <div className="flex items-center justify-between gap-3 mb-4">
                                    <div>
                                        <div className="text-xs text-slate-500">نماد</div>
                                        <div className="text-xl font-black text-cyan-700 dark:text-cyan-300">{row.symbol}</div>
                                    </div>
                                    <div className="text-left">
                                        <div className="text-xs text-slate-500">امتیاز کل</div>
                                        <div className="text-2xl font-black">{formatNumber(row.totalScore, 0)}</div>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                    {[
                                        ['تکنیکال', formatNumber(row.technicalScore, 0)],
                                        ['بنیادی', formatNumber(row.fundamentalScore, 0)],
                                        ['P/E', formatNumber(row.pe, 2)],
                                        ['جریان پول', formatNumber(row.netMoneyFlow, 0)],
                                        ['ریسک', row.riskLevel || '—'],
                                        ['روند', row.trend || '—'],
                                    ].map(([label, value]) => (
                                        <div key={String(label)} className="rounded-lg bg-white dark:bg-gray-800 border border-slate-200 dark:border-slate-700 p-2">
                                            <div className="text-xs text-slate-500">{label}</div>
                                            <div className="font-bold mt-1">{value}</div>
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-3 text-xs text-slate-500">
                                    تغییر روزانه: <span className="font-semibold text-slate-700 dark:text-slate-200">{row.priceChangePercent == null ? '—' : String(formatNumber(row.priceChangePercent, 2)) + '٪'}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="px-5 pb-5">
                        <div className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-3">مقایسه کامل داده‌ها</div>
                        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                            <table className="w-full text-sm"><thead><tr className="bg-slate-100 dark:bg-slate-700/80">
                                {['رتبه','نماد','قیمت فعلی','قیمت پایانی','تغییر روزانه','EPS','P/E','ارزش بازار','حجم معاملات','ارزش معاملات','امتیاز تکنیکال','امتیاز بنیادی','جریان پول','جریان پول حقیقی','جریان پول حقوقی','ریسک','روند'].map(h => <th key={h} className="px-3 py-3 whitespace-nowrap text-center">{h}</th>)}
                            </tr></thead><tbody>
                                {deterministicResult.rows.map((row, index) => <tr key={row.symbol} className="border-t border-slate-100 dark:border-slate-700">
                                    <td className="px-3 py-3 text-center font-bold">{deterministicResult.ranking.find(item => item.symbol === row.symbol)?.rank ?? index + 1}</td>
                                    <td className="px-3 py-3 text-center font-bold text-cyan-700 dark:text-cyan-300">{row.symbol}</td>
                                    <td className="px-3 py-3 text-center">{formatNumber(row.currentPrice, 0)}</td>
                                    <td className="px-3 py-3 text-center">{formatNumber(row.closingPrice, 0)}</td>
                                    <td className="px-3 py-3 text-center">{row.priceChangePercent == null ? '—' : String(formatNumber(row.priceChangePercent, 2)) + '٪'}</td>
                                    <td className="px-3 py-3 text-center">{formatNumber(row.eps, 2)}</td>
                                    <td className="px-3 py-3 text-center">{formatNumber(row.pe, 2)}</td>
                                    <td className="px-3 py-3 text-center">{formatNumber(row.marketCap, 0)}</td>
                                    <td className="px-3 py-3 text-center">{formatNumber(row.tradedVolume, 0)}</td>
                                    <td className="px-3 py-3 text-center">{formatNumber(row.tradedValue, 0)}</td>
                                    <td className="px-3 py-3 text-center">{formatNumber(row.technicalScore, 0)}</td>
                                    <td className="px-3 py-3 text-center">{formatNumber(row.fundamentalScore, 0)}</td>
                                    <td className="px-3 py-3 text-center">{formatNumber(row.netMoneyFlow, 0)}</td>
                                    <td className="px-3 py-3 text-center">{formatNumber(row.realMoneyFlow, 0)}</td>
                                    <td className="px-3 py-3 text-center">{formatNumber(row.legalMoneyFlow, 0)}</td>
                                    <td className="px-3 py-3 text-center">{row.riskLevel || '—'}</td>
                                    <td className="px-3 py-3 text-center">{row.trend || '—'}</td>
                                </tr>)}
                            </tbody></table>
                        </div>
                    </div>
                    {deterministicResult.failed.length > 0 && (
                        <div className="mx-5 mb-5 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4">
                            <div className="font-bold text-amber-800 dark:text-amber-300 mb-2">نمادهای بدون داده معتبر</div>
                            <div className="space-y-1 text-sm text-amber-700 dark:text-amber-200">
                                {deterministicResult.failed.map((item) => <div key={String(item.symbol)}>{String(item.symbol)}: {String(item.message || 'داده معتبر در دسترس نیست.')}</div>)}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default StockComparison;
