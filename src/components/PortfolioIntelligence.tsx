import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../api/apiClient';
import * as portfolioService from '../services/portfolioService';

interface Props { isOnline: boolean; }
interface Holding { id: string; symbol: string; name?: string; quantity: number; entryPrice: number; currentPrice: number | null; changePercent: number | null; value: number | null; cost: number; pnl: number | null; pnlPercent: number | null; }

const num = (value: unknown): number | null => { const n = Number(value); return Number.isFinite(n) ? n : null; };
const money = (value: number | null) => value == null ? '—' : Math.round(value).toLocaleString('fa-IR');
const pct = (value: number | null) => value == null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

async function quote(symbol: string): Promise<{ price: number | null; change: number | null }> {
  const response = await api.get(`/brs/symbol/${encodeURIComponent(symbol)}`);
  const raw = response?.data?.data ?? response?.data ?? {};
  const price = num(raw.lastPrice ?? raw.last_price ?? raw.currentPrice ?? raw.closePrice ?? raw.closingPrice);
  const change = num(raw.lastChangePercent ?? raw.last_change_percent ?? raw.changePercent ?? raw.percentChange);
  return { price, change };
}

const PortfolioIntelligence: React.FC<Props> = ({ isOnline }) => {
  const [items, setItems] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isOnline) { setError('برای دریافت ارزش لحظه‌ای سبد باید آنلاین باشید.'); setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const portfolio = await portfolioService.getPortfolio();
      const next = await Promise.all(portfolio.map(async item => {
        try {
          const q = await quote(item.symbol);
          const cost = item.entryPrice * item.quantity;
          const value = q.price == null ? null : q.price * item.quantity;
          const pnl = value == null ? null : value - cost;
          const pnlPercent = pnl == null || cost <= 0 ? null : (pnl / cost) * 100;
          return { id: item.id, symbol: item.symbol, name: item.name, quantity: item.quantity, entryPrice: item.entryPrice, currentPrice: q.price, changePercent: q.change, value, cost, pnl, pnlPercent };
        } catch (_) {
          return { id: item.id, symbol: item.symbol, name: item.name, quantity: item.quantity, entryPrice: item.entryPrice, currentPrice: null, changePercent: null, value: null, cost: item.entryPrice * item.quantity, pnl: null, pnlPercent: null };
        }
      }));
      setItems(next); setUpdatedAt(new Date().toISOString());
    } catch (e: any) { setError(e?.response?.data?.message || e?.message || 'دریافت اطلاعات سبد ناموفق بود.'); }
    finally { setLoading(false); }
  }, [isOnline]);

  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    const valued = items.filter(x => x.value != null) as Array<Holding & { value: number }>;
    const totalValue = valued.reduce((s, x) => s + x.value, 0);
    const totalCost = items.reduce((s, x) => s + x.cost, 0);
    const pnl = valued.reduce((s, x) => s + (x.pnl || 0), 0);
    const pnlPercent = totalCost > 0 ? (pnl / totalCost) * 100 : null;
    const positive = items.filter(x => (x.pnl || 0) > 0).length;
    const negative = items.filter(x => (x.pnl || 0) < 0).length;
    const neutral = items.length - positive - negative;
    const sorted = [...valued].sort((a, b) => b.value - a.value);
    const top = sorted[0];
    const concentration = totalValue > 0 && top ? (top.value / totalValue) * 100 : null;
    const top3Value = sorted.slice(0, 3).reduce((s, x) => s + x.value, 0);
    const top3Concentration = totalValue > 0 ? (top3Value / totalValue) * 100 : null;
    const weights = totalValue > 0 ? sorted.map(x => x.value / totalValue) : [];
    const hhi = weights.reduce((s, weight) => s + weight * weight, 0);
    const diversification = weights.length ? clamp((1 - hhi) * 100, 0, 100) : null;
    const valuedChanges = valued.filter(x => x.changePercent != null);
    const weightedDailyChange = totalValue > 0 ? valuedChanges.reduce((s, x) => s + x.value * (x.changePercent as number), 0) / totalValue : null;
    const gainValue = valued.reduce((s, x) => s + Math.max(x.pnl || 0, 0), 0);
    const lossValue = valued.reduce((s, x) => s + Math.min(x.pnl || 0, 0), 0);
    const gainShare = totalValue > 0 ? (gainValue / totalValue) * 100 : null;
    const lossShare = totalValue > 0 ? (Math.abs(lossValue) / totalValue) * 100 : null;
    return { totalValue, totalCost, pnl, pnlPercent, positive, negative, neutral, concentration, top3Concentration, diversification, weightedDailyChange, gainShare, lossShare, topSymbol: top?.symbol || null };
  }, [items]);

  return <div dir="rtl" className="space-y-5">
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div><h2 className="text-2xl font-black">هوشمندی سبد سهام</h2><p className="text-sm text-gray-500 dark:text-gray-400 mt-1">ارزش‌گذاری، عملکرد، توزیع سرمایه و سنجش تمرکز ریسک بر اساس داده واقعی بازار</p></div>
      <button type="button" onClick={load} disabled={loading || !isOnline} className="rounded-xl bg-cyan-600 text-white px-4 py-2 font-bold disabled:opacity-50">{loading ? 'در حال بروزرسانی...' : 'بروزرسانی'}</button>
    </div>
    {error && <div className="rounded-xl border border-red-300 bg-red-50 dark:bg-red-950/20 p-4 text-red-700 dark:text-red-300">{error}</div>}
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {[['ارزش فعلی سبد', money(stats.totalValue)], ['بهای تمام‌شده', money(stats.totalCost)], ['سود/زیان کل', money(stats.pnl)], ['بازدهی کل', pct(stats.pnlPercent)]].map(([label, value]) => <div key={label} className="rounded-2xl border border-[var(--color-border)] bg-white/80 dark:bg-gray-900/60 p-4"><p className="text-xs text-gray-500">{label}</p><p className="mt-2 text-xl font-black font-mono">{value}</p></div>)}
    </div>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {[['سهم‌های سودده', String(stats.positive)], ['سهم‌های زیان‌ده', String(stats.negative)], ['بدون تغییر', String(stats.neutral)], ['تغییر روزانه وزنی', pct(stats.weightedDailyChange)]].map(([label, value]) => <div key={label} className="rounded-2xl border border-[var(--color-border)] bg-white/70 dark:bg-gray-900/50 p-4"><p className="text-xs text-gray-500">{label}</p><p className="mt-2 text-lg font-black font-mono">{value}</p></div>)}
    </div>
    <div className="rounded-2xl border border-[var(--color-border)] bg-white/80 dark:bg-gray-900/60 p-4 space-y-4">
      <div><h3 className="font-black text-lg">توزیع سرمایه و ریسک تمرکز</h3><p className="text-xs text-gray-500 mt-1">محاسبات فقط از ارزش واقعی موقعیت‌های دارای قیمت بازار استفاده می‌کنند.</p></div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[['تمرکز بزرگ‌ترین سهم', stats.concentration == null ? '—' : `${stats.concentration.toFixed(1)}%`, stats.topSymbol || ''], ['تمرکز سه سهم اول', stats.top3Concentration == null ? '—' : `${stats.top3Concentration.toFixed(1)}%`, 'Top 3'], ['تنوع نسبی سبد', stats.diversification == null ? '—' : `${stats.diversification.toFixed(1)}%`, 'بر مبنای HHI']].map(([label, value, hint]) => <div key={label} className="rounded-xl border border-[var(--color-border)] p-4"><p className="text-xs text-gray-500">{label}</p><p className="mt-2 text-xl font-black font-mono">{value}</p>{hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}</div>)}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-xl border border-[var(--color-border)] p-4"><div className="flex justify-between text-sm mb-2"><span>ارزش موقعیت‌های دارای سود</span><b>{stats.gainShare == null ? '—' : `${stats.gainShare.toFixed(1)}%`}</b></div><div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden"><div className="h-full bg-[var(--color-positive)]" style={{ width: `${Math.min(100, stats.gainShare || 0)}%` }} /></div></div>
        <div className="rounded-xl border border-[var(--color-border)] p-4"><div className="flex justify-between text-sm mb-2"><span>ارزش موقعیت‌های دارای زیان</span><b>{stats.lossShare == null ? '—' : `${stats.lossShare.toFixed(1)}%`}</b></div><div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden"><div className="h-full bg-[var(--color-negative)]" style={{ width: `${Math.min(100, stats.lossShare || 0)}%` }} /></div></div>
      </div>
    </div>
    <div className="rounded-2xl border border-[var(--color-border)] overflow-hidden bg-white/80 dark:bg-gray-900/60">
      <div className="px-4 py-3 border-b border-[var(--color-border)] font-black">ترکیب و عملکرد سبد</div>
      {items.length === 0 && !loading ? <div className="p-8 text-center text-gray-500">سبد سهام خالی است.</div> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-gray-50 dark:bg-gray-800/70"><th className="p-3 text-right">نماد</th><th className="p-3 text-right">تعداد</th><th className="p-3 text-right">قیمت ورود</th><th className="p-3 text-right">قیمت فعلی</th><th className="p-3 text-right">ارزش</th><th className="p-3 text-right">سود/زیان</th><th className="p-3 text-right">بازدهی</th><th className="p-3 text-right">وزن</th></tr></thead><tbody>{items.map(item => { const weight = stats.totalValue > 0 && item.value != null ? (item.value / stats.totalValue) * 100 : null; return <tr key={item.id} className="border-t border-[var(--color-border)]"><td className="p-3 font-black">{item.symbol}<div className="text-xs text-gray-500 font-normal">{item.name}</div></td><td className="p-3 font-mono">{item.quantity.toLocaleString('fa-IR')}</td><td className="p-3 font-mono">{money(item.entryPrice)}</td><td className="p-3 font-mono">{money(item.currentPrice)}</td><td className="p-3 font-mono">{money(item.value)}</td><td className={`p-3 font-mono font-bold ${item.pnl == null ? '' : item.pnl > 0 ? 'text-[var(--color-positive)]' : item.pnl < 0 ? 'text-[var(--color-negative)]' : ''}`}>{money(item.pnl)}</td><td className={`p-3 font-mono font-bold ${item.pnlPercent == null ? '' : item.pnlPercent > 0 ? 'text-[var(--color-positive)]' : item.pnlPercent < 0 ? 'text-[var(--color-negative)]' : ''}`}>{pct(item.pnlPercent)}</td><td className="p-3 font-mono">{weight == null ? '—' : `${weight.toFixed(1)}%`}</td></tr>; })}</tbody></table></div>}
      {updatedAt && <div className="px-4 py-3 text-xs text-gray-500 border-t border-[var(--color-border)]">آخرین بروزرسانی: {new Date(updatedAt).toLocaleString('fa-IR')}</div>}
    </div>
  </div>;
};

export default PortfolioIntelligence;
