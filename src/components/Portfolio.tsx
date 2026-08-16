import React, { useState, useCallback, useEffect, useRef } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { PortfolioItem, AnalysisResult, PortfolioAlertType, StoredUser, PortfolioOptimizationResult } from '../types';
import * as analysisUsageService from '../services/analysisUsageService';
import * as storageService from '../services/storageService';
import { useNotification } from './NotificationSystem';
import { PlusIcon, TrashIcon, SparklesIcon, ChevronDownIcon, CheckCircleIcon, XCircleIcon, XMarkIcon } from './Icons';

interface AnalyzedPortfolioItem extends PortfolioItem {
    analysis?: AnalysisResult;
    analysisLoading?: boolean;
    analysisError?: string;
}

const formatNumber = (num: number) => num.toLocaleString('fa-IR');

const PnLDisplay: React.FC<{ value: number, isPercent?: boolean }> = ({ value, isPercent = false }) => {
    if (isNaN(value)) return null;
    const isProfit = value > 0;
    const isLoss = value < 0;
    const color = isProfit ? 'text-[var(--color-positive)]' : isLoss ? 'text-[var(--color-negative)]' : 'text-gray-500 dark:text-gray-400';
    const sign = isProfit ? '+' : '';
    const formattedValue = isPercent ? `${sign}${value.toFixed(2)}%` : `${sign}${formatNumber(Math.round(value))}`;

    return <span className={`font-mono font-bold ${color}`}>{formattedValue}</span>;
};


const PortfolioItemCard: React.FC<{ 
    item: AnalyzedPortfolioItem; 
    onRemove: (id: string) => void;
    onAnalyze: (id: string) => void;
    isOnline: boolean;
}> = ({ item, onRemove, onAnalyze, isOnline }) => {
    const [isOpen, setIsOpen] = useState(false);

    const recommendationColor = item.analysis?.recommendation === 'BUY' ? 'text-[var(--color-positive)]' 
        : item.analysis?.recommendation === 'SELL' ? 'text-[var(--color-negative)]' 
        : 'text-yellow-500 dark:text-yellow-400';
    
    const RecommendationIcon = item.analysis?.recommendation === 'BUY' ? CheckCircleIcon 
        : item.analysis?.recommendation === 'SELL' ? XCircleIcon 
        : null;

    const hasAnalysis = item.analysis && item.analysis.currentPrice;
    const costBasis = item.entryPrice * item.quantity;
    const currentValue = hasAnalysis ? item.analysis.currentPrice * item.quantity : 0;
    const pnl = currentValue - costBasis;
    const pnlPercent = costBasis > 0 ? (pnl / costBasis) * 100 : 0;

    return (
        <div
          data-style-id="portfolio-item-card"
          data-style-name="کارت سهم سبد"
          className="rounded-lg shadow-md"
          style={{
              backgroundColor: 'var(--portfolio-item-card-bg)',
              color: 'var(--portfolio-item-card-color)',
              fontFamily: 'var(--portfolio-item-card-font-family)',
              fontSize: `var(--portfolio-item-card-font-size)`,
              borderWidth: 'var(--portfolio-item-card-border-width)',
              borderStyle: 'var(--portfolio-item-card-border-style)',
              borderColor: 'var(--portfolio-item-card-border-color)'
          }}
        >
            <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4 flex-grow">
                     {item.analysis && RecommendationIcon && <RecommendationIcon className="flex-shrink-0" />}
                    <div>
                        <h3 className="text-xl font-bold text-cyan-600 dark:text-cyan-400">{item.symbol}</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                           {formatNumber(item.quantity)} سهم × {formatNumber(item.entryPrice)} تومان
                        </p>
                    </div>
                </div>
                 <div className="flex items-center gap-2">
                    {hasAnalysis && (
                        <div className="text-right hidden sm:block">
                            <PnLDisplay value={pnl} />
                            <PnLDisplay value={pnlPercent} isPercent={true} />
                        </div>
                    )}
                   <button
                        onClick={(e) => { e.stopPropagation(); onAnalyze(item.id); }}
                        disabled={item.analysisLoading || !isOnline}
                        className="p-2 text-gray-500 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        aria-label="تحلیل مجدد"
                    >
                        {item.analysisLoading ? <div className="w-5 h-5 border-2 border-t-transparent border-cyan-500 dark:border-cyan-400 rounded-full animate-spin"></div> : <SparklesIcon />}
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onRemove(item.id); }}
                        className="p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-full transition-colors"
                        aria-label="حذف سهم"
                    >
                        <TrashIcon />
                    </button>
                    <button onClick={() => setIsOpen(!isOpen)} className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
                        <ChevronDownIcon className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                </div>
            </div>

            {isOpen && (
                <div className="border-t p-4 animate-fade-in space-y-4" style={{ borderColor: 'var(--portfolio-item-card-border-color)' }}>
                    {item.analysisError && <p className="text-sm text-center font-semibold text-[var(--color-negative)]">{item.analysisError}</p>}
                    {hasAnalysis ? (
                        <>
                             <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                                 <div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">تاریخ ورود</p>
                                    <p className="font-semibold font-mono">{new Date(item.entryDate).toLocaleDateString('fa-IR')}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">قیمت فعلی</p>
                                    <p className="font-semibold">{formatNumber(item.analysis.currentPrice)}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">ارزش کل</p>
                                    <p className="font-semibold">{formatNumber(currentValue)}</p>
                                </div>
                                <div className="sm:hidden">
                                     <p className="text-xs text-gray-500 dark:text-gray-400">سود/زیان</p>
                                     <PnLDisplay value={pnl} />
                                 </div>
                                 <div className="sm:hidden">
                                     <p className="text-xs text-gray-500 dark:text-gray-400">درصد</p>
                                     <PnLDisplay value={pnlPercent} isPercent={true}/>
                                 </div>
                            </div>

                            <div className="text-sm space-y-3 pt-4 border-t" style={{ borderColor: 'var(--portfolio-item-card-border-color)' }}>
                               <p className={`font-semibold text-lg ${recommendationColor}`}>
                                    توصیه: {item.analysis.recommendation === 'BUY' ? 'خرید/افزایش' : item.analysis.recommendation === 'SELL' ? 'فروش/خروج' : 'نگهداری'}
                                </p>
                                <p>
                                    {item.analysis.summary}
                                </p>
                                <p><strong className="font-bold">توصیه خروج:</strong> {item.analysis.exitPrice}</p>
                            </div>
                        </>
                    ) : (
                         !item.analysisLoading && !item.analysisError && (
                            <p className="text-center text-gray-500 dark:text-gray-500">برای مشاهده تحلیل و سود و زیان، روی دکمه تحلیل کلیک کنید.</p>
                        )
                    )}
                </div>
            )}
        </div>
    );
};

interface PortfolioProps {
    onAlertChange: (alertType: PortfolioAlertType) => void;
    currentUser: StoredUser;
    isOnline: boolean;
}

const Portfolio: React.FC<PortfolioProps> = ({ onAlertChange, currentUser, isOnline }) => {
    const { addNotification } = useNotification();
    const portfolioKey = `portfolio_${currentUser.id}`;

    const [portfolio, setPortfolio] = useState<AnalyzedPortfolioItem[]>(() => {
        try {
            const saved = storageService.getItem(portfolioKey);
            if (saved) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed)) {
                    // More robust filtering to prevent crashes from malformed data
                    return parsed.filter(item => {
                        const isItemValid = 
                            item &&
                            typeof item === 'object' &&
                            typeof item.id === 'string' &&
                            typeof item.symbol === 'string' &&
                            typeof item.entryPrice === 'number' && !isNaN(item.entryPrice) &&
                            typeof item.quantity === 'number' && !isNaN(item.quantity) &&
                            typeof item.entryDate === 'string' && !isNaN(new Date(item.entryDate).getTime());

                        if (!isItemValid) {
                            console.warn('Filtering out invalid portfolio item from storage:', item);
                        }
                        return isItemValid;
                    });
                }
            }
            return [];
        } catch (error) {
            console.error("Error parsing portfolio from storage. Data will be reset.", error);
            storageService.removeItem(portfolioKey); // Clear corrupted data
            return [];
        }
    });

    const [newSymbol, setNewSymbol] = useState('');
    const [newPrice, setNewPrice] = useState('');
    const [newQuantity, setNewQuantity] = useState('');
    const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0]);
    
    // New states for optimization
    const [optimizationResult, setOptimizationResult] = useState<PortfolioOptimizationResult | null>(null);
    const [optimizationLoading, setOptimizationLoading] = useState(false);
    const [optimizationError, setOptimizationError] = useState<string | null>(null);


    const portfolioRef = useRef(portfolio);
    portfolioRef.current = portfolio;

     useEffect(() => {
        const calculateAlert = () => {
            const hasSell = portfolio.some(item => item.analysis?.recommendation === 'SELL');
            if (hasSell) return 'sell';
            const hasBuy = portfolio.some(item => item.analysis?.recommendation === 'BUY');
            if (hasBuy) return 'buy';
            return 'none';
        };
        onAlertChange(calculateAlert());
    }, [portfolio, onAlertChange]);

    useEffect(() => {
        // Don't store analysis results, only the portfolio items themselves
        const itemsToSave = portfolio.map(({analysis, analysisLoading, analysisError, ...rest}) => rest);
        storageService.setItem(portfolioKey, JSON.stringify(itemsToSave));
    }, [portfolio, portfolioKey]);

    const handleAddItem = (e: React.FormEvent) => {
        e.preventDefault();
        if(!isOnline) {
            addNotification('برای افزودن سهم باید آنلاین باشید.', 'error');
            return;
        }
        const newItem: AnalyzedPortfolioItem = {
            id: Date.now().toString(),
            symbol: newSymbol.toUpperCase(),
            entryPrice: parseFloat(newPrice),
            quantity: parseInt(newQuantity, 10),
            entryDate: newDate,
        };
        setPortfolio(prev => [...prev, newItem]);
        setNewSymbol('');
        setNewPrice('');
        setNewQuantity('');
        setNewDate(new Date().toISOString().split('T')[0]);
    };
    
    const handleRemoveItem = (id: string) => {
        setPortfolio(prev => prev.filter(item => item.id !== id));
    };

    const handleAnalyzeItem = useCallback(async (id: string) => {
        const itemToAnalyze = portfolioRef.current.find(item => item.id === id);
        if (!itemToAnalyze || itemToAnalyze.analysisLoading) return;

        try {
            // This function now checks eligibility and records the usage attempt immediately.
            analysisUsageService.beginAnalysis(currentUser);
            
            setPortfolio(prev => prev.map(item => item.id === id ? { ...item, analysisLoading: true, analysisError: undefined } : item));
            
            const settingsKey = `user_settings_${currentUser.id}`;
            const settingsJson = storageService.getItem(settingsKey);
            const settings = settingsJson ? JSON.parse(settingsJson) : {};
            const dailyCount = settings.chartDays || 30;
            const weeklyCount = settings.chartWeeks || 24;
            
            const analysis = await analyzeStock(itemToAnalyze.symbol, dailyCount, weeklyCount, 'portfolio');
            
            setPortfolio(prev => prev.map(item => item.id === id ? { ...item, analysis, analysisLoading: false } : item));
            addNotification(`تحلیل سهم ${itemToAnalyze.symbol} با موفقیت انجام شد`, 'info');

        } catch (err: any) {
            setPortfolio(prev => prev.map(item => item.id === id ? { ...item, analysisLoading: false, analysisError: err.message } : item));
        }
    }, [addNotification, currentUser]);

    const handleOptimizePortfolio = async () => {
        setOptimizationLoading(true);
        setOptimizationError(null);
        setOptimizationResult(null);

        const itemsToAnalyze = portfolio.filter(item => !item.analysis);
        if(itemsToAnalyze.length > 0) {
            addNotification(`ابتدا باید تمام سهم‌های سبد (${itemsToAnalyze.map(i=>i.symbol).join(', ')}) را تحلیل کنید.`, 'error');
            setOptimizationLoading(false);
            return;
        }
        
        try {
            const analyses = portfolio.map(item => item.analysis);
            const result = await getPortfolioOptimization(portfolio, analyses);
            setOptimizationResult(result);
        } catch (err: any) {
            setOptimizationError(err.message || "خطا در بهینه‌سازی سبد.");
        } finally {
            setOptimizationLoading(false);
        }
    };
    
    // --- Chart Data ---
    const COLORS = ['#06b6d4', '#14b8a6', '#8b5cf6', '#ec4899', '#f59e0b', '#6366f1'];
    const pieData = portfolio.filter(p => p.analysis).map(p => ({
        name: p.symbol,
        value: p.analysis!.currentPrice * p.quantity
    }));

    const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, index }: any) => {
        const RADIAN = Math.PI / 180;
        const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
        const x = cx + radius * Math.cos(-midAngle * RADIAN);
        const y = cy + radius * Math.sin(-midAngle * RADIAN);
      
        return (
          <text x={x} y={y} fill="white" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" className="font-bold text-sm">
            {`${(percent * 100).toFixed(0)}%`}
          </text>
        );
    };


    return (
        <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold text-cyan-600 dark:text-cyan-400 mb-4">مدیریت سبد سهام</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">سهام خود را اضافه کنید تا وضعیت آن‌ها به طور مداوم توسط هوش مصنوعی بررسی شود و سیگنال‌های خروج یا خرید مجدد را دریافت کنید.</p>

            {pieData.length > 0 && (
                <div data-style-id="portfolio-pie-chart-card" data-style-name="کارت نمودار سبد" className="p-4 rounded-lg shadow-md mb-8 bg-gray-50 dark:bg-gray-800/50">
                    <h3 className="text-lg font-semibold mb-2 text-center">ترکیب سبد دارایی</h3>
                     <ResponsiveContainer width="100%" height={250}>
                        <PieChart>
                            <Pie
                                data={pieData}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                label={renderCustomizedLabel}
                                outerRadius={80}
                                fill="#8884d8"
                                dataKey="value"
                            >
                                {pieData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip formatter={(value: number) => `${formatNumber(value)} تومان`} />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            )}
            
            <div 
              data-style-id="portfolio-add-form"
              data-style-name="فرم افزودن سهم به سبد"
              className="p-4 rounded-lg shadow-md mb-8"
              style={{
                  backgroundColor: 'var(--portfolio-add-form-bg)',
                  color: 'var(--portfolio-add-form-color)',
                  fontFamily: 'var(--portfolio-add-form-font-family)',
                  fontSize: `var(--portfolio-add-form-font-size)`,
                  borderWidth: `var(--portfolio-add-form-border-width)`,
                  borderStyle: `var(--portfolio-add-form-border-style)`,
                  borderColor: `var(--portfolio-add-form-border-color)`,
              }}
            >
                <h3 className="text-lg font-semibold mb-3">افزودن سهم جدید</h3>
                <form onSubmit={handleAddItem}>
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                        <input type="text" value={newSymbol} onChange={e => setNewSymbol(e.target.value.toUpperCase())} placeholder="نماد سهم" required className="md:col-span-1 border rounded px-3 py-2 focus:outline-none focus:ring-2" style={{ backgroundColor: 'var(--input-bg)', color: 'var(--input-color)', borderColor: 'var(--input-border)', '--tw-ring-color': 'var(--input-focus-ring)' } as React.CSSProperties} />
                        <input type="number" value={newPrice} onChange={e => setNewPrice(e.target.value)} placeholder="قیمت ورود" required className="border rounded px-3 py-2 focus:outline-none focus:ring-2" style={{ backgroundColor: 'var(--input-bg)', color: 'var(--input-color)', borderColor: 'var(--input-border)', '--tw-ring-color': 'var(--input-focus-ring)' } as React.CSSProperties} />
                        <input type="number" value={newQuantity} onChange={e => setNewQuantity(e.target.value)} placeholder="تعداد سهام" required className="border rounded px-3 py-2 focus:outline-none focus:ring-2" style={{ backgroundColor: 'var(--input-bg)', color: 'var(--input-color)', borderColor: 'var(--input-border)', '--tw-ring-color': 'var(--input-focus-ring)' } as React.CSSProperties} />
                        <input
                            type="date"
                            value={newDate}
                            onChange={e => setNewDate(e.target.value)}
                            required
                            className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2"
                            style={{ backgroundColor: 'var(--input-bg)', color: 'var(--input-color)', borderColor: 'var(--input-border)', '--tw-ring-color': 'var(--input-focus-ring)' } as React.CSSProperties}
                        />
                        <button 
                          type="submit"
                          disabled={!newSymbol.trim() || !newPrice.trim() || !newQuantity.trim() || !isOnline}
                          className="font-bold rounded flex items-center justify-center gap-2 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                          style={{
                              backgroundColor: 'var(--btn-primary-bg)',
                              color: 'var(--btn-primary-color)',
                              fontFamily: 'inherit',
                              fontSize: 'inherit'
                          }}
                        >
                            <PlusIcon /> افزودن
                        </button>
                    </div>
                </form>
            </div>

            {portfolio.length > 0 && (
                <div data-style-id="portfolio-optimize-button-container" data-style-name="دکمه بهینه‌سازی سبد" className="mb-8 text-center">
                    <button onClick={handleOptimizePortfolio} disabled={optimizationLoading || !isOnline} className="px-6 py-3 bg-indigo-600 text-white font-bold rounded-lg shadow-lg hover:bg-indigo-700 transition transform hover:scale-105 disabled:bg-gray-500 flex items-center gap-2 mx-auto">
                        {optimizationLoading ? <div className="w-5 h-5 border-2 border-t-transparent border-white rounded-full animate-spin"></div> : <SparklesIcon />}
                        تحلیل و بهینه‌سازی کل سبد
                    </button>
                </div>
            )}
            
            {optimizationResult && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setOptimizationResult(null)}>
                    <div data-style-id="portfolio-optimization-modal" data-style-name="پنجره بهینه‌سازی سبد" className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                            <h3 className="font-semibold text-lg text-gray-800 dark:text-white">تحلیل و بهینه‌سازی سبد</h3>
                            <button onClick={() => setOptimizationResult(null)} className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600">
                                <XMarkIcon className="h-5 w-5 text-gray-600 dark:text-gray-300" />
                            </button>
                        </div>
                        <div className="p-6 max-h-[70vh] overflow-y-auto space-y-4">
                            <div>
                                <h4 className="font-bold mb-2">خلاصه وضعیت سبد</h4>
                                <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">{optimizationResult.summary}</p>
                            </div>
                            <div className="space-y-3">
                                <h4 className="font-bold border-t border-gray-200 dark:border-gray-700 pt-4">پیشنهادات</h4>
                                {optimizationResult.suggestions.map(s => {
                                    const actionClasses = {
                                        'INCREASE': 'border-green-500 bg-green-50 dark:bg-green-900/30',
                                        'HOLD': 'border-blue-500 bg-blue-50 dark:bg-blue-900/30',
                                        'DECREASE': 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/30',
                                        'SELL': 'border-red-500 bg-red-50 dark:bg-red-900/30',
                                    };
                                    const actionText = {
                                        'INCREASE': 'افزایش', 'HOLD': 'نگهداری', 'DECREASE': 'کاهش', 'SELL': 'فروش کامل',
                                    };
                                    const actionStyleIds: Record<string, string> = {
                                        'INCREASE': 'portfolio-suggestion-increase',
                                        'HOLD': 'portfolio-suggestion-hold',
                                        'DECREASE': 'portfolio-suggestion-decrease',
                                        'SELL': 'portfolio-suggestion-sell',
                                    };
                                    const actionStyleNames: Record<string, string> = {
                                        'INCREASE': 'پیشنهاد: افزایش',
                                        'HOLD': 'پیشنهاد: نگهداری',
                                        'DECREASE': 'پیشنهاد: کاهش',
                                        'SELL': 'پیشنهاد: فروش',
                                    };
                                    return (
                                    <div key={s.symbol} data-style-id={actionStyleIds[s.action]} data-style-name={actionStyleNames[s.action]} className={`p-3 border-r-4 rounded ${actionClasses[s.action]}`}>
                                        <div className="flex justify-between items-center">
                                            <span className="font-bold text-cyan-700 dark:text-cyan-400">{s.symbol}</span>
                                            <span className="font-semibold text-sm">{actionText[s.action]}</span>
                                        </div>
                                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{s.reason}</p>
                                    </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}


            <div className="space-y-4">
                {portfolio.length > 0 ? (
                    portfolio.map(item => (
                        <PortfolioItemCard key={item.id} item={item} onRemove={handleRemoveItem} onAnalyze={handleAnalyzeItem} isOnline={isOnline} />
                    ))
                ) : (
                    <div data-style-id="portfolio-placeholder" data-style-name="کادر پیام سبد" className="text-center py-10 bg-gray-100 dark:bg-gray-800/50 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600">
                        <p className="text-gray-500 dark:text-gray-500">سبد سهام شما خالی است. سهم‌های خود را اضافه کنید.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Portfolio;