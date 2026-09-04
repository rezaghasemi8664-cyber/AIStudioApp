import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { PortfolioItem, AnalysisResult, PortfolioAlertType, StoredUser, PortfolioOptimizationResult } from '../types';
import * as analysisUsageService from '../services/analysisUsageService';
import * as portfolioService from '../services/portfolioService';
import { analyzeStock, getPortfolioOptimization } from '../services/gapgptService';
import { useNotification } from './NotificationSystem';
import { PlusIcon, TrashIcon, SparklesIcon, ChevronDownIcon, CheckCircleIcon, XCircleIcon, XMarkIcon } from './Icons';

interface AnalyzedPortfolioItem extends PortfolioItem {
  name?: string;
  analysis?: AnalysisResult;
  analysisLoading?: boolean;
  analysisError?: string;
}

const formatNumber = (num: number) => Number(num || 0).toLocaleString('fa-IR');
const todayJalali = () => new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).replace(/-/g, '/');

function normalizeJalaliDate(value: string) {
  return value.replace(/[^0-9۰-۹/]/g, '').replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/\/+/g, '/').replace(/^\/+|\/+$/g, '');
}

function normalizeAnalysis(raw: AnalysisResult, symbol: string): AnalysisResult {
  const recommendationRaw = String(raw?.recommendation || '').toUpperCase();
  const recommendation = recommendationRaw.includes('BUY') || recommendationRaw.includes('خرید') ? 'BUY' : recommendationRaw.includes('SELL') || recommendationRaw.includes('فروش') ? 'SELL' : 'HOLD';
  return { ...raw, symbol, recommendation, currentPrice: Number(raw?.currentPrice || raw?.closingPrice || 0) };
}

const PnLDisplay: React.FC<{ value: number; isPercent?: boolean }> = ({ value, isPercent = false }) => {
  if (!Number.isFinite(value)) return null;
  const color = value > 0 ? 'text-[var(--color-positive)]' : value < 0 ? 'text-[var(--color-negative)]' : 'text-gray-500 dark:text-gray-400';
  const sign = value > 0 ? '+' : '';
  return <span className={`font-mono font-bold ${color}`}>{isPercent ? `${sign}${value.toFixed(2)}%` : `${sign}${formatNumber(Math.round(value))}`}</span>;
};

interface CardProps {
  item: AnalyzedPortfolioItem;
  onRemove: (id: string) => void;
  onEdit: (item: AnalyzedPortfolioItem) => void;
  onAnalyze: (id: string) => void;
  isOnline: boolean;
}

const PortfolioItemCard: React.FC<CardProps> = ({ item, onRemove, onEdit, onAnalyze, isOnline }) => {
  const [open, setOpen] = useState(false);
  const hasAnalysis = !!item.analysis && Number(item.analysis.currentPrice) > 0;
  const costBasis = item.entryPrice * item.quantity;
  const currentValue = hasAnalysis ? item.analysis!.currentPrice * item.quantity : 0;
  const pnl = currentValue - costBasis;
  const pnlPercent = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
  const RecommendationIcon = item.analysis?.recommendation === 'BUY' ? CheckCircleIcon : item.analysis?.recommendation === 'SELL' ? XCircleIcon : null;
  const recommendationColor = item.analysis?.recommendation === 'BUY' ? 'text-[var(--color-positive)]' : item.analysis?.recommendation === 'SELL' ? 'text-[var(--color-negative)]' : 'text-yellow-500';

  return (
    <div className="rounded-lg shadow-md" style={{ backgroundColor: 'var(--portfolio-item-card-bg)', color: 'var(--portfolio-item-card-color)', borderWidth: 'var(--portfolio-item-card-border-width)', borderStyle: 'var(--portfolio-item-card-border-style)', borderColor: 'var(--portfolio-item-card-border-color)' }}>
      <div className="p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {RecommendationIcon && <RecommendationIcon className="flex-shrink-0" />}
          <div className="min-w-0">
            <h3 className="text-xl font-bold text-cyan-600 dark:text-cyan-400">{item.symbol}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{item.name || item.symbol}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{formatNumber(item.quantity)} سهم × {formatNumber(item.entryPrice)} ریال</p>
          </div>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          {hasAnalysis && <div className="text-right hidden md:block"><PnLDisplay value={pnl} /><br /><PnLDisplay value={pnlPercent} isPercent /></div>}
          <button onClick={() => onAnalyze(item.id)} disabled={item.analysisLoading || !isOnline} className="p-2 text-yellow-500 hover:bg-yellow-100 dark:hover:bg-yellow-900/30 rounded-full disabled:opacity-50" title="تحلیل سهم" aria-label="تحلیل سهم">
            {item.analysisLoading ? <div className="w-5 h-5 border-2 border-t-transparent border-yellow-500 rounded-full animate-spin" /> : <SparklesIcon />}
          </button>
          <button onClick={() => onEdit(item)} className="px-2 py-1 text-xs font-semibold text-cyan-600 hover:bg-cyan-50 dark:hover:bg-cyan-900/30 rounded" title="ویرایش سهم">ویرایش</button>
          <button onClick={() => onRemove(item.id)} className="p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-full" title="حذف سهم"><TrashIcon /></button>
          <button onClick={() => setOpen(v => !v)} className="p-2 text-gray-500" title="جزئیات"><ChevronDownIcon className={open ? 'rotate-180 transition-transform' : 'transition-transform'} /></button>
        </div>
      </div>

      {open && <div className="border-t p-4 space-y-4" style={{ borderColor: 'var(--portfolio-item-card-border-color)' }}>
        {item.analysisError && <p className="text-sm text-center font-semibold text-[var(--color-negative)]">{item.analysisError}</p>}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-center">
          <div><p className="text-xs text-gray-500">تاریخ خرید</p><p className="font-semibold font-mono">{item.entryDate}</p></div>
          <div><p className="text-xs text-gray-500">قیمت ورود (ریال)</p><p className="font-semibold">{formatNumber(item.entryPrice)}</p></div>
          <div><p className="text-xs text-gray-500">قیمت فعلی</p><p className="font-semibold">{hasAnalysis ? formatNumber(item.analysis!.currentPrice) : '—'}</p></div>
          <div><p className="text-xs text-gray-500">ارزش کل</p><p className="font-semibold">{hasAnalysis ? formatNumber(currentValue) : '—'}</p></div>
          <div><p className="text-xs text-gray-500">سود/زیان</p>{hasAnalysis ? <><PnLDisplay value={pnl} /><br /><PnLDisplay value={pnlPercent} isPercent /></> : <span>—</span>}</div>
        </div>
        {hasAnalysis && <div className="text-sm space-y-2 pt-3 border-t" style={{ borderColor: 'var(--portfolio-item-card-border-color)' }}>
          <p className={`font-bold text-lg ${recommendationColor}`}>توصیه: {item.analysis!.recommendation === 'BUY' ? 'خرید / افزایش' : item.analysis!.recommendation === 'SELL' ? 'فروش / خروج' : 'نگهداری'}</p>
          <p className="leading-7">{item.analysis!.summary}</p>
          {item.analysis!.exitPrice && <p><strong>توصیه خروج:</strong> {item.analysis!.exitPrice}</p>}
        </div>}
        {!hasAnalysis && !item.analysisError && !item.analysisLoading && <p className="text-center text-gray-500">برای مشاهده تحلیل، روی آیکون هوش مصنوعی کلیک کنید.</p>}
      </div>}
    </div>
  );
};

interface PortfolioProps { onAlertChange: (alertType: PortfolioAlertType) => void; currentUser: StoredUser; isOnline: boolean; }

type EditState = { id: string; symbol: string; name: string; entryPrice: string; quantity: string; entryDate: string } | null;

const Portfolio: React.FC<PortfolioProps> = ({ onAlertChange, currentUser, isOnline }) => {
  const { addNotification } = useNotification();
  const [portfolio, setPortfolio] = useState<AnalyzedPortfolioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newSymbol, setNewSymbol] = useState('');
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newQuantity, setNewQuantity] = useState('');
  const [newDate, setNewDate] = useState(todayJalali());
  const [editState, setEditState] = useState<EditState>(null);
  const [optimizationResult, setOptimizationResult] = useState<PortfolioOptimizationResult | null>(null);
  const [optimizationLoading, setOptimizationLoading] = useState(false);
  const [optimizationError, setOptimizationError] = useState<string | null>(null);
  const portfolioRef = useRef(portfolio);
  portfolioRef.current = portfolio;

  const loadPortfolio = useCallback(async () => {
    setLoading(true);
    try {
      const items = await portfolioService.getPortfolio();
      setPortfolio(items as AnalyzedPortfolioItem[]);
    } catch (error: any) {
      console.error('[Portfolio] load failed:', error);
      addNotification(error?.response?.data?.message || 'دریافت سبد سهام از سرور ناموفق بود.', 'error');
    } finally { setLoading(false); }
  }, [addNotification]);

  useEffect(() => { loadPortfolio(); }, [loadPortfolio]);

  useEffect(() => {
    const hasSell = portfolio.some(item => item.analysis?.recommendation === 'SELL');
    const hasBuy = portfolio.some(item => item.analysis?.recommendation === 'BUY');
    onAlertChange(hasSell ? 'sell' : hasBuy ? 'buy' : 'none');
  }, [portfolio, onAlertChange]);

  const resetAddForm = () => { setNewSymbol(''); setNewName(''); setNewPrice(''); setNewQuantity(''); setNewDate(todayJalali()); };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOnline) return addNotification('برای افزودن سهم باید آنلاین باشید.', 'error');
    const symbol = newSymbol.trim().toUpperCase();
    const name = newName.trim() || symbol;
    const price = Number(newPrice);
    const quantity = Number(newQuantity);
    const entryDate = normalizeJalaliDate(newDate);
    if (!symbol || !name || !Number.isFinite(price) || price <= 0 || !Number.isFinite(quantity) || quantity <= 0 || !/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(entryDate)) return addNotification('نماد، نام، قیمت، تعداد و تاریخ خرید معتبر الزامی است.', 'error');
    try {
      const created = await portfolioService.addPortfolioItem({ symbol, name, entryPrice: price, quantity, entryDate });
      setPortfolio(prev => [...prev, created as AnalyzedPortfolioItem]);
      resetAddForm();
      addNotification(`سهم ${symbol} در دیتابیس ذخیره شد.`, 'info');
    } catch (error: any) { addNotification(error?.response?.data?.message || 'ذخیره سهم ناموفق بود.', 'error'); }
  };

  const handleRemoveItem = async (id: string) => {
    if (!isOnline) return addNotification('برای حذف سهم باید آنلاین باشید.', 'error');
    if (!window.confirm('آیا از حذف این سهم از سبد اطمینان دارید؟')) return;
    try {
      await portfolioService.deletePortfolioItem(id);
      setPortfolio(prev => prev.filter(item => item.id !== id));
      addNotification('سهم از سبد و دیتابیس حذف شد.', 'info');
    } catch (error: any) { addNotification(error?.response?.data?.message || 'حذف سهم ناموفق بود.', 'error'); }
  };

  const startEdit = (item: AnalyzedPortfolioItem) => setEditState({ id: item.id, symbol: item.symbol, name: item.name || item.symbol, entryPrice: String(item.entryPrice), quantity: String(item.quantity), entryDate: item.entryDate });

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editState) return;
    const symbol = editState.symbol.trim().toUpperCase();
    const name = editState.name.trim() || symbol;
    const entryPrice = Number(editState.entryPrice);
    const quantity = Number(editState.quantity);
    const entryDate = normalizeJalaliDate(editState.entryDate);
    if (!symbol || !name || !Number.isFinite(entryPrice) || entryPrice <= 0 || !Number.isFinite(quantity) || quantity <= 0 || !/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(entryDate)) return addNotification('اطلاعات ویرایش‌شده معتبر نیست.', 'error');
    try {
      const updated = await portfolioService.updatePortfolioItem(editState.id, { symbol, name, entryPrice, quantity, entryDate });
      setPortfolio(prev => prev.map(item => item.id === editState.id ? { ...(updated as AnalyzedPortfolioItem), analysis: undefined, analysisError: undefined } : item));
      setEditState(null);
      addNotification(`اطلاعات ${symbol} در دیتابیس به‌روزرسانی شد.`, 'info');
    } catch (error: any) { addNotification(error?.response?.data?.message || 'ویرایش سهم ناموفق بود.', 'error'); }
  };

  const handleAnalyzeItem = useCallback(async (id: string) => {
    const item = portfolioRef.current.find(x => x.id === id);
    if (!item || item.analysisLoading) return;
    if (!isOnline) return addNotification('برای تحلیل سهم باید آنلاین باشید.', 'error');
    try {
      analysisUsageService.beginAnalysis(currentUser);
      setPortfolio(prev => prev.map(x => x.id === id ? { ...x, analysisLoading: true, analysisError: undefined } : x));
      const settingsKey = `user_settings_${currentUser.id}`;
      let settings: any = {};
      try { const raw = localStorage.getItem(settingsKey); settings = raw ? JSON.parse(raw) : {}; } catch (_) {}
      const result = await analyzeStock(item.symbol, settings.chartDays || 30, settings.chartWeeks || 24, 'portfolio');
      const analysis = normalizeAnalysis(result, item.symbol);
      setPortfolio(prev => prev.map(x => x.id === id ? { ...x, analysis, analysisLoading: false } : x));
      addNotification(`تحلیل سهم ${item.symbol} با موفقیت انجام شد.`, 'info');
    } catch (error: any) {
      setPortfolio(prev => prev.map(x => x.id === id ? { ...x, analysisLoading: false, analysisError: error?.message || 'خطا در تحلیل سهم' } : x));
      addNotification(error?.message || 'تحلیل سهم ناموفق بود.', 'error');
    }
  }, [addNotification, currentUser, isOnline]);

  const handleOptimizePortfolio = async () => {
    if (!isOnline) return addNotification('برای تحلیل و بهینه‌سازی باید آنلاین باشید.', 'error');
    if (portfolio.length === 0) return addNotification('سبد سهام خالی است.', 'error');
    const missing = portfolio.filter(item => !item.analysis);
    if (missing.length) return addNotification(`ابتدا تحلیل سهم‌های زیر را اجرا کنید: ${missing.map(x => x.symbol).join('، ')}`, 'error');
    setOptimizationLoading(true); setOptimizationError(null); setOptimizationResult(null);
    try {
      const result: any = await getPortfolioOptimization(portfolio, portfolio.map(x => x.analysis));
      const suggestions = Array.isArray(result?.suggestions) ? result.suggestions : Array.isArray(result?.recommendations) ? result.recommendations : [];
      setOptimizationResult({ summary: result?.summary || 'تحلیل تکمیل شد.', suggestions: suggestions.map((s: any) => ({ symbol: s.symbol, action: ['HOLD','INCREASE','DECREASE','SELL'].includes(s.action) ? s.action : 'HOLD', reason: s.reason || '' })) });
    } catch (error: any) { setOptimizationError(error?.message || 'خطا در بهینه‌سازی سبد.'); }
    finally { setOptimizationLoading(false); }
  };

  const pieData = useMemo(() => portfolio.filter(x => x.analysis).map(x => ({ name: x.symbol, value: x.analysis!.currentPrice * x.quantity })), [portfolio]);
  const COLORS = ['#06b6d4', '#14b8a6', '#8b5cf6', '#ec4899', '#f59e0b', '#6366f1'];

  return (
    <div className="max-w-5xl mx-auto">
      <h2 className="text-2xl font-bold text-cyan-600 dark:text-cyan-400 mb-2">مدیریت سبد سهام</h2>
      <p className="text-gray-600 dark:text-gray-400 mb-6">اطلاعات سبد برای هر کاربر به‌صورت جداگانه در دیتابیس ذخیره می‌شود.</p>

      {pieData.length > 0 && <div className="p-4 rounded-lg shadow-md mb-8 bg-gray-50 dark:bg-gray-800/50">
        <h3 className="text-lg font-semibold mb-2 text-center">ترکیب سبد دارایی</h3>
        <ResponsiveContainer width="100%" height={250}><PieChart><Pie data={pieData} cx="50%" cy="50%" outerRadius={80} dataKey="value">{pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip formatter={(v: number) => `${formatNumber(v)} ریال`} /><Legend /></PieChart></ResponsiveContainer>
      </div>}

      <div className="p-4 rounded-lg shadow-md mb-8" style={{ backgroundColor: 'var(--portfolio-add-form-bg)', color: 'var(--portfolio-add-form-color)', borderWidth: 'var(--portfolio-add-form-border-width)', borderStyle: 'var(--portfolio-add-form-border-style)', borderColor: 'var(--portfolio-add-form-border-color)' }}>
        <h3 className="text-lg font-semibold mb-3">افزودن سهم جدید</h3>
        <form onSubmit={handleAddItem}>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
            <input value={newSymbol} onChange={e => setNewSymbol(e.target.value.toUpperCase())} placeholder="نماد سهم" required className="border rounded px-3 py-2" />
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="نام سهم" required className="border rounded px-3 py-2" />
            <input type="number" min="0" step="any" value={newPrice} onChange={e => setNewPrice(e.target.value)} placeholder="قیمت ورود (ریال)" required className="border rounded px-3 py-2" />
            <input type="number" min="1" step="1" value={newQuantity} onChange={e => setNewQuantity(e.target.value)} placeholder="تعداد سهم" required className="border rounded px-3 py-2" />
            <input value={newDate} onChange={e => setNewDate(normalizeJalaliDate(e.target.value))} placeholder="تاریخ خرید (۱۴۰۵/۰۶/۰۹)" inputMode="numeric" required className="border rounded px-3 py-2" dir="ltr" />
            <button type="submit" disabled={!isOnline} className="font-bold rounded flex items-center justify-center gap-2 disabled:opacity-50" style={{ backgroundColor: 'var(--btn-primary-bg)', color: 'var(--btn-primary-color)' }}><PlusIcon /> افزودن</button>
          </div>
        </form>
        <p className="text-xs text-gray-500 mt-2">تاریخ خرید به‌صورت شمسی وارد و همان مقدار در دیتابیس ذخیره می‌شود.</p>
      </div>

      {loading ? <div className="text-center py-10">در حال دریافت سبد از دیتابیس...</div> : <div className="space-y-4">
        {portfolio.length ? portfolio.map(item => <PortfolioItemCard key={item.id} item={item} onRemove={handleRemoveItem} onEdit={startEdit} onAnalyze={handleAnalyzeItem} isOnline={isOnline} />) : <div className="text-center py-10 bg-gray-100 dark:bg-gray-800/50 rounded-lg">سبد سهام شما خالی است.</div>}
      </div>}

      {portfolio.length > 0 && <div className="mt-8 text-center"><button onClick={handleOptimizePortfolio} disabled={optimizationLoading || !isOnline} className="px-6 py-3 bg-indigo-600 text-white font-bold rounded-lg shadow-lg disabled:opacity-50 inline-flex items-center gap-2">{optimizationLoading ? <div className="w-5 h-5 border-2 border-t-transparent border-white rounded-full animate-spin" /> : <SparklesIcon />} تحلیل و بهینه‌سازی کل سبد</button></div>}

      {optimizationError && <div className="mt-4 p-3 rounded bg-red-50 text-red-700 text-center">{optimizationError}</div>}

      {editState && <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setEditState(null)}>
        <form onSubmit={saveEdit} onClick={e => e.stopPropagation()} className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-xl p-6 space-y-4">
          <div className="flex justify-between items-center"><h3 className="font-bold text-lg">ویرایش سهم</h3><button type="button" onClick={() => setEditState(null)}><XMarkIcon className="h-5 w-5" /></button></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input value={editState.symbol} onChange={e => setEditState({ ...editState, symbol: e.target.value.toUpperCase() })} placeholder="نماد" required className="border rounded px-3 py-2" />
            <input value={editState.name} onChange={e => setEditState({ ...editState, name: e.target.value })} placeholder="نام سهم" required className="border rounded px-3 py-2" />
            <input type="number" min="0" step="any" value={editState.entryPrice} onChange={e => setEditState({ ...editState, entryPrice: e.target.value })} placeholder="قیمت ورود (ریال)" required className="border rounded px-3 py-2" />
            <input type="number" min="1" step="1" value={editState.quantity} onChange={e => setEditState({ ...editState, quantity: e.target.value })} placeholder="تعداد" required className="border rounded px-3 py-2" />
            <input value={editState.entryDate} onChange={e => setEditState({ ...editState, entryDate: normalizeJalaliDate(e.target.value) })} placeholder="تاریخ خرید شمسی" required className="border rounded px-3 py-2" dir="ltr" />
          </div>
          <button type="submit" className="w-full py-2 rounded font-bold bg-cyan-600 text-white">ذخیره تغییرات در دیتابیس</button>
        </form>
      </div>}

      {optimizationResult && <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setOptimizationResult(null)}>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl p-6 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          <div className="flex justify-between items-center mb-5"><h3 className="font-bold text-lg">تحلیل و بهینه‌سازی سبد</h3><button onClick={() => setOptimizationResult(null)}><XMarkIcon className="h-5 w-5" /></button></div>
          <p className="leading-7 mb-5 whitespace-pre-wrap">{optimizationResult.summary}</p>
          <div className="space-y-3">{(optimizationResult.suggestions ?? []).map(s => <div key={`${s.symbol}-${s.action}`} className="p-3 border-r-4 border-cyan-500 rounded bg-gray-50 dark:bg-gray-700/40"><div className="flex justify-between"><span className="font-bold text-cyan-600">{s.symbol}</span><span className="font-semibold">{s.action === 'INCREASE' ? 'افزایش' : s.action === 'DECREASE' ? 'کاهش' : s.action === 'SELL' ? 'فروش کامل' : 'نگهداری'}</span></div><p className="text-sm mt-1">{s.reason}</p></div>)}</div>
        </div>
      </div>}
    </div>
  );
};

export default Portfolio;
