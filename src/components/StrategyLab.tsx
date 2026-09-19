import React, { useMemo, useState } from 'react';
import { appApiFetch } from '../services/apiConfigService';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

interface StrategyLabProps { isOnline: boolean; }
interface BacktestResult {
  symbol: string;
  strategy: { name: string; shortPeriod: number; longPeriod: number; feePercent: number };
  initialCapital: number; finalValue: number; returnPercent: number; buyHoldReturnPercent: number;
  excessReturnPercent: number; maxDrawdown: number; tradeCount: number; closedTradeCount: number;
  winRate: number | null; profitFactor: number | null; grossProfit: number; grossLoss: number; totalFees: number;
  annualizedReturnPercent: number; annualizedVolatilityPercent: number; sharpeRatio: number | null;
  openQuantity: number; cash: number;
  trades: Array<{ date: string; side: string; price: number; quantity: number; value: number; fee: number; reason: string }>;
  equityCurve: Array<{ date: string; close: number; shortSma: number | null; longSma: number | null; equity: number }>;
}
const numberFa = (value: number | null | undefined, digits = 0) =>
  value == null || !Number.isFinite(Number(value)) ? '—' : Number(value).toLocaleString('fa-IR', { maximumFractionDigits: digits });
const percentFa = (value: number | null | undefined) =>
  value == null || !Number.isFinite(Number(value)) ? '—' : `${numberFa(value, 2)}٪`;

const StrategyLab: React.FC<StrategyLabProps> = ({ isOnline }) => {
  const [symbol, setSymbol] = useState('');
  const [capital, setCapital] = useState('100000000');
  const [shortPeriod, setShortPeriod] = useState('10');
  const [longPeriod, setLongPeriod] = useState('30');
  const [feePercent, setFeePercent] = useState('0.1');
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const equityPreview = useMemo(() => (result?.equityCurve || []).slice(-60), [result]);

  const run = async (event: React.FormEvent) => {
    event.preventDefault(); setLoading(true); setError(null);
    try {
      const response = await appApiFetch<any>('/strategy/backtest', {
        method: 'POST',
        body: JSON.stringify({
          strategy: 'sma-crossover', symbol: symbol.trim().toUpperCase(),
          initialCapital: Number(capital), shortPeriod: Number(shortPeriod),
          longPeriod: Number(longPeriod), feePercent: Number(feePercent) / 100, historyCount: 180,
        }),
      });
      const data = response?.data?.data ?? response?.data ?? response;
      if (!data?.deterministic && response?.deterministic !== true) throw new Error('پاسخ بک‌تست قطعی معتبر نیست.');
      setResult(data as BacktestResult);
    } catch (e: any) { setError(e?.message || 'اجرای بک‌تست ناموفق بود.'); setResult(null); }
    finally { setLoading(false); }
  };

  return (
    <div className="max-w-6xl mx-auto" dir="rtl">
      <div className="mb-6">
        <h2 className="text-2xl font-black text-cyan-600 dark:text-cyan-400">آزمایشگاه استراتژی و بک‌تست</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">اجرای آزمایش تاریخی کاملاً قطعی روی داده واقعی؛ بدون هوش مصنوعی و بدون داده ساختگی.</p>
      </div>
      <form onSubmit={run} className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/60 p-5 mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
        <label className="lg:col-span-2 text-sm font-semibold">نماد
          <input required value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} placeholder="مثلاً فملی" className="mt-1 w-full rounded-lg border px-3 py-2 bg-transparent" />
        </label>
        <label className="text-sm font-semibold">سرمایه اولیه
          <input type="number" min="100000" value={capital} onChange={e => setCapital(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 bg-transparent" />
        </label>
        <label className="text-sm font-semibold">میانگین کوتاه
          <input type="number" min="2" max="100" value={shortPeriod} onChange={e => setShortPeriod(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 bg-transparent" />
        </label>
        <label className="text-sm font-semibold">میانگین بلند
          <input type="number" min="3" max="250" value={longPeriod} onChange={e => setLongPeriod(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 bg-transparent" />
        </label>
        <label className="text-sm font-semibold">کارمزد هر معامله ٪
          <input type="number" min="0" max="10" step="0.01" value={feePercent} onChange={e => setFeePercent(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 bg-transparent" />
        </label>
        <div className="lg:col-span-6 flex items-center gap-3">
          <button disabled={!isOnline || loading || !symbol.trim()} className="px-5 py-2.5 rounded-lg bg-cyan-600 text-white font-bold disabled:opacity-50">{loading ? 'در حال محاسبه...' : 'اجرای بک‌تست'}</button>
          <span className="text-xs text-slate-500">استراتژی این گام: تقاطع میانگین متحرک ساده</span>
        </div>
      </form>
      {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-red-700 dark:text-red-300">{error}</div>}
      {result && <>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          {[
            ['ارزش نهایی', numberFa(result.finalValue)], ['بازده استراتژی', percentFa(result.returnPercent)],
            ['بازده خرید و نگهداری', percentFa(result.buyHoldReturnPercent)], ['حداکثر افت سرمایه', percentFa(result.maxDrawdown)],
          ].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-4"><div className="text-xs text-slate-500">{label}</div><div className="text-xl font-black mt-1">{value}</div></div>)}
        </div>
                <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-5 mb-5 bg-white/70 dark:bg-slate-900/50">
          <div className="font-bold mb-3">آمار عملکرد استراتژی</div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
            <div><span className="text-slate-500">نرخ برد</span><div className="font-black mt-1">{percentFa(result.winRate)}</div></div>
            <div><span className="text-slate-500">Profit Factor</span><div className="font-black mt-1">{numberFa(result.profitFactor, 2)}</div></div>
            <div><span className="text-slate-500">بازده سالانه‌شده</span><div className="font-black mt-1">{percentFa(result.annualizedReturnPercent)}</div></div>
            <div><span className="text-slate-500">نوسان سالانه‌شده</span><div className="font-black mt-1">{percentFa(result.annualizedVolatilityPercent)}</div></div>
            <div><span className="text-slate-500">Sharpe</span><div className="font-black mt-1">{numberFa(result.sharpeRatio, 2)}</div></div>
          </div>
          <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
            <div>سود ناخالص: <b>{numberFa(result.grossProfit)}</b></div>
            <div>زیان ناخالص: <b>{numberFa(result.grossLoss)}</b></div>
            <div>مجموع کارمزد: <b>{numberFa(result.totalFees)}</b></div>
          </div>
          <p className="text-xs text-slate-500 mt-4">شاخص‌های عملکرد فقط از معاملات و تاریخچه واقعی همین اجرای بک‌تست محاسبه شده‌اند و پیش‌بینی آینده نیستند.</p>
        </div>
<div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-5 mb-5 bg-white/70 dark:bg-slate-900/50">
          <div className="font-bold mb-1">خلاصه آزمایش</div>
          <div className="text-sm text-slate-500 mb-4">مقایسه بازده استراتژی با خرید و نگهداری روی همان تاریخچه واقعی. این خروجی صرفاً نتیجه محاسبات تاریخی است و تضمین عملکرد آینده نیست.</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
            <div>تعداد معاملات: <b>{numberFa(result.tradeCount)}</b></div><div>معاملات بسته‌شده: <b>{numberFa(result.closedTradeCount)}</b></div>
            <div>بازده مازاد: <b>{percentFa(result.excessReturnPercent)}</b></div><div>وجه نقد پایان: <b>{numberFa(result.cash)}</b></div>
          </div>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-5">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-5 bg-white/70 dark:bg-slate-900/50">
            <div className="font-bold mb-1">نمودار ارزش سرمایه</div>
            <div className="text-xs text-slate-500 mb-3">مسیر سرمایه بر اساس معاملات واقعی شبیه‌سازی‌شده و قیمت‌های تاریخی؛ خط پایه برابر سرمایه اولیه است.</div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={result.equityCurve}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={28} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(value) => numberFa(Number(value), 0)} />
                  <Tooltip formatter={(value: number) => numberFa(Number(value), 0)} labelFormatter={(label) => String(label)} />
                  <Line type="monotone" dataKey="equity" name="ارزش سرمایه" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-5 bg-white/70 dark:bg-slate-900/50">
            <div className="font-bold mb-1">قیمت و میانگین‌های متحرک</div>
            <div className="text-xs text-slate-500 mb-3">تقاطع‌ها مستقیماً از قیمت پایانی تاریخچه و میانگین‌های ساده انتخاب‌شده محاسبه شده‌اند.</div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={result.equityCurve}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={28} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(value) => numberFa(Number(value), 0)} />
                  <Tooltip formatter={(value: number) => numberFa(Number(value), 2)} labelFormatter={(label) => String(label)} />
                  <Line type="monotone" dataKey="close" name="قیمت پایانی" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="shortSma" name="میانگین کوتاه" strokeWidth={1.5} dot={false} />
                  <Line type="monotone" dataKey="longSma" name="میانگین بلند" strokeWidth={1.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-5 mb-5 bg-white/70 dark:bg-slate-900/50">
          <div className="font-bold mb-3">مسیر ارزش سبد در بک‌تست</div>
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-slate-100 dark:bg-slate-800"><th className="p-2">تاریخ</th><th className="p-2">قیمت پایانی</th><th className="p-2">میانگین کوتاه</th><th className="p-2">میانگین بلند</th><th className="p-2">ارزش سبد</th></tr></thead><tbody>{equityPreview.map(point => <tr key={point.date} className="border-t border-slate-100 dark:border-slate-800"><td className="p-2">{point.date}</td><td className="p-2">{numberFa(point.close)}</td><td className="p-2">{numberFa(point.shortSma, 2)}</td><td className="p-2">{numberFa(point.longSma, 2)}</td><td className="p-2 font-bold">{numberFa(point.equity)}</td></tr>)}</tbody></table></div>
        </div>
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-5 bg-white/70 dark:bg-slate-900/50">
          <div className="font-bold mb-3">معاملات اجراشده</div>
          {result.trades.length ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-slate-100 dark:bg-slate-800"><th className="p-2">تاریخ</th><th className="p-2">عملیات</th><th className="p-2">قیمت</th><th className="p-2">تعداد</th><th className="p-2">ارزش</th><th className="p-2">کارمزد</th><th className="p-2">دلیل</th></tr></thead><tbody>{result.trades.map((trade, i) => <tr key={trade.date + '-' + i} className="border-t border-slate-100 dark:border-slate-800"><td className="p-2">{trade.date}</td><td className="p-2 font-bold">{trade.side}</td><td className="p-2">{numberFa(trade.price)}</td><td className="p-2">{numberFa(trade.quantity)}</td><td className="p-2">{numberFa(trade.value)}</td><td className="p-2">{numberFa(trade.fee)}</td><td className="p-2">{trade.reason}</td></tr>)}</tbody></table></div> : <div className="text-sm text-slate-500">در این بازه سیگنال معاملاتی ایجاد نشد.</div>}
        </div>
      </>}
    </div>
  );
};

export default StrategyLab;
