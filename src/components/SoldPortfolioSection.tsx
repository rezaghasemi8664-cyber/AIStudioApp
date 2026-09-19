import React, { useEffect, useMemo, useState } from 'react';
import type { PortfolioApiItem, SoldTrade } from '../services/portfolioService';
import { deleteSoldTrade, getSoldTrades, recordSale } from '../services/portfolioService';
import { TrashIcon } from './Icons';

interface Props {
  lots: PortfolioApiItem[];
  isOnline: boolean;
  onChanged?: () => void | Promise<void>;
}

function toGregorian(jy: number, jm: number, jd: number) {
  const breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
  const div = (a: number, b: number) => Math.trunc(a / b);
  const mod = (a: number, b: number) => a - Math.trunc(a / b) * b;
  const jalCal = (year: number) => {
    const gy = year + 621;
    let leapJ = -14;
    let jp = breaks[0];
    let jump = 0;
    for (let i = 1; i < breaks.length; i += 1) {
      const jm = breaks[i];
      jump = jm - jp;
      if (year < jm) break;
      leapJ += div(jump, 33) * 8 + div(mod(jump, 33) + 3, 4);
      jp = jm;
    }
    const n = year - jp;
    leapJ += div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
    if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
    const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
    return { gy, march: 20 + leapJ - leapG };
  };
  const g2d = (gy: number, gm: number, gd: number) => {
    let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
    d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
    return d;
  };
  const d2g = (jdn: number) => {
    let j = 4 * jdn + 139361631;
    j += div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
    const i = div(mod(j, 1461), 4) * 5 + 308;
    const gd = div(mod(i, 153), 5) + 1;
    const gm = mod(div(i, 153), 12) + 1;
    const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
    return { gy, gm, gd };
  };
  const r = jalCal(jy);
  const jdn = g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
  const g = d2g(jdn);
  return new Date(g.gy, g.gm - 1, g.gd);
}

function parseJalali(value: string) {
  const m = String(value || '').match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!m) return null;
  return toGregorian(Number(m[1]), Number(m[2]), Number(m[3]));
}

function holdingDays(buyDate: string, sellDate: string) {
  const a = parseJalali(buyDate);
  const b = parseJalali(sellDate);
  if (!a || !b) return null;
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000));
}

const formatNumber = (value: number) => Number(value || 0).toLocaleString('fa-IR');

export default function SoldPortfolioSection({ lots, isOnline, onChanged }: Props) {
  const [trades, setTrades] = useState<SoldTrade[]>([]);
  const [summary, setSummary] = useState({ tradeCount: 0, proceeds: 0, costBasis: 0, realizedPnl: 0 });
  const [symbol, setSymbol] = useState('');
  const [soldQuantity, setSoldQuantity] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [sellDate, setSellDate] = useState('');
  const [allocations, setAllocations] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const result = await getSoldTrades();
      setTrades(result.trades || []);
      setSummary({ tradeCount: result.trades?.length || 0, proceeds: Number(result.proceeds || 0), costBasis: Number(result.costBasis || 0), realizedPnl: Number(result.realizedPnl || 0) });
    } catch (e: any) {
      setError(e?.response?.data?.message || 'دریافت معاملات فروخته‌شده ناموفق بود.');
    }
  };

  useEffect(() => { load(); }, []);

  const symbols = useMemo(() => Array.from(new Set(lots.map(lot => lot.symbol))).sort(), [lots]);
  const symbolLots = useMemo(() => lots.filter(lot => lot.symbol === symbol), [lots, symbol]);
  const allocatedQuantity = Object.values(allocations).reduce((sum, value) => sum + Number(value || 0), 0);
  const requestedQuantity = Number(soldQuantity || 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOnline) return setError('برای ثبت فروش باید آنلاین باشید.');
    setError('');
    if (!symbol || requestedQuantity <= 0 || Number(sellPrice) <= 0 || !sellDate) return setError('نماد، تعداد، قیمت فروش و تاریخ فروش الزامی است.');
    if (Math.abs(allocatedQuantity - requestedQuantity) > 0.000001) return setError('تعداد تخصیص‌یافته به Lotها باید دقیقاً برابر تعداد فروش باشد.');
    setLoading(true);
    try {
      await recordSale({
        symbol,
        name: symbolLots[0]?.name || symbol,
        soldQuantity: requestedQuantity,
        sellPrice: Number(sellPrice),
        sellDate,
        allocations: Object.entries(allocations).filter(([, quantity]) => Number(quantity) > 0).map(([lotId, quantity]) => ({ lotId, quantity: Number(quantity) })),
      });
      setSoldQuantity(''); setSellPrice(''); setAllocations({});
      await load();
      await onChanged?.();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'ثبت فروش ناموفق بود.');
    } finally { setLoading(false); }
  };

  const removeTrade = async (id: string) => {
    if (!isOnline || !window.confirm('آیا از حذف این معامله فروش و بازگردانی Lotهای آن اطمینان دارید؟')) return;
    try {
      await deleteSoldTrade(id);
      await load();
      await onChanged?.();
    } catch (e: any) { setError(e?.response?.data?.message || 'حذف معامله فروش ناموفق بود.'); }
  };

  const realizedPercent = summary.costBasis > 0 ? (summary.realizedPnl / summary.costBasis) * 100 : 0;
  const symbolPerformance = useMemo(() => {
    const grouped = new Map<string, { costBasis: number; realizedPnl: number; trades: number }>();
    trades.forEach(trade => {
      const current = grouped.get(trade.symbol) || { costBasis: 0, realizedPnl: 0, trades: 0 };
      current.costBasis += Number(trade.costBasis || 0);
      current.realizedPnl += Number(trade.realizedPnl || 0);
      current.trades += 1;
      grouped.set(trade.symbol, current);
    });
    return Array.from(grouped.entries()).map(([symbol, item]) => ({
      symbol, ...item, percent: item.costBasis > 0 ? (item.realizedPnl / item.costBasis) * 100 : 0
    })).sort((a, b) => b.realizedPnl - a.realizedPnl);
  }, [trades]);

  return <section className="sold-portfolio-workstation mt-10 p-5 rounded-xl shadow-md bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700">
    <div className="mb-5">
      <h3 className="text-xl font-bold text-cyan-600 dark:text-cyan-400">سهام فروخته‌شده و معاملات بسته‌شده</h3>
      <p className="text-sm text-gray-500 mt-1">هر فروش می‌تواند از چند Lot خرید با قیمت و تاریخ متفاوت تشکیل شود. تخصیص فروش به‌صورت دستی انجام می‌شود.</p>
    </div>

    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
      <div className="sold-summary-card p-3 rounded-lg bg-white dark:bg-gray-900/30"><p className="text-xs text-gray-500">تعداد معاملات بسته‌شده</p><strong>{formatNumber(summary.tradeCount)}</strong></div>
      <div className="p-3 rounded-lg bg-white dark:bg-gray-900/30"><p className="text-xs text-gray-500">مبلغ فروش</p><strong>{formatNumber(summary.proceeds)} ریال</strong></div>
      <div className="p-3 rounded-lg bg-white dark:bg-gray-900/30"><p className="text-xs text-gray-500">بهای تمام‌شده فروش</p><strong>{formatNumber(summary.costBasis)} ریال</strong></div>
      <div className="p-3 rounded-lg bg-white dark:bg-gray-900/30"><p className="text-xs text-gray-500">سود/زیان تحقق‌یافته</p><strong className={summary.realizedPnl >= 0 ? 'text-green-600' : 'text-red-600'}>{formatNumber(summary.realizedPnl)} ریال</strong></div>
      <div className="p-3 rounded-lg bg-white dark:bg-gray-900/30"><p className="text-xs text-gray-500">بازده تحقق‌یافته</p><strong className={realizedPercent >= 0 ? 'text-green-600' : 'text-red-600'}>{realizedPercent.toFixed(2)}%</strong></div>
    </div>

    <form onSubmit={submit} className="sold-trade-form space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <select value={symbol} onChange={e => { setSymbol(e.target.value); setAllocations({}); }} className="border rounded px-3 py-2" disabled={!isOnline}>
          <option value="">انتخاب نماد فروش</option>
          {symbols.map(item => <option key={item} value={item}>{item}</option>)}
        </select>
        <input type="number" min="1" step="1" value={soldQuantity} onChange={e => setSoldQuantity(e.target.value)} placeholder="تعداد فروخته‌شده" className="border rounded px-3 py-2" disabled={!isOnline} />
        <input type="number" min="0" step="any" value={sellPrice} onChange={e => setSellPrice(e.target.value)} placeholder="قیمت فروش (ریال)" className="border rounded px-3 py-2" disabled={!isOnline} />
        <input value={sellDate} onChange={e => setSellDate(e.target.value)} placeholder="تاریخ فروش ۱۴۰۵/۰۶/۲۶" inputMode="numeric" dir="ltr" className="border rounded px-3 py-2" disabled={!isOnline} />
      </div>

      {symbolLots.length > 0 && <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="min-w-full text-sm">
          <thead><tr className="bg-gray-100 dark:bg-gray-700/50"><th className="p-3 text-right">Lot</th><th className="p-3 text-right">تاریخ خرید</th><th className="p-3 text-right">قیمت خرید</th><th className="p-3 text-right">موجودی</th><th className="p-3 text-right">تخصیص فروش</th></tr></thead>
          <tbody>{symbolLots.map(lot => <tr key={lot.id} className="border-t border-gray-200 dark:border-gray-700">
            <td className="p-3 font-mono">{lot.id}</td><td className="p-3 font-mono">{lot.entryDate}</td><td className="p-3">{formatNumber(lot.entryPrice)}</td><td className="p-3">{formatNumber(lot.quantity)}</td>
            <td className="p-3"><input type="number" min="0" max={lot.quantity} step="1" value={allocations[lot.id] ?? ''} onChange={e => setAllocations(prev => ({ ...prev, [lot.id]: Math.min(lot.quantity, Math.max(0, Number(e.target.value || 0))) }))} className="border rounded px-2 py-1 w-32" disabled={!isOnline} /></td>
          </tr>)}</tbody>
        </table>
        <div className="p-3 text-sm bg-white/60 dark:bg-gray-900/20">تخصیص فعلی: <strong>{formatNumber(allocatedQuantity)}</strong> از <strong>{formatNumber(requestedQuantity)}</strong> سهم</div>
      </div>}

      <button type="submit" disabled={loading || !isOnline || !symbolLots.length} className="px-5 py-2 rounded-lg bg-cyan-600 text-white font-bold disabled:opacity-50">{loading ? 'در حال ثبت...' : 'ثبت فروش و بستن معامله'}</button>
    </form>

    {error && <div className="mt-4 p-3 rounded bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300">{error}</div>}

    {symbolPerformance.length > 0 && <div className="mt-8 overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
      <h4 className="font-bold p-4">عملکرد معاملات بسته‌شده به تفکیک نماد</h4>
      <table className="min-w-full text-sm"><thead><tr className="bg-gray-100 dark:bg-gray-700/50"><th className="p-3 text-right">نماد</th><th className="p-3 text-right">تعداد معاملات</th><th className="p-3 text-right">بهای تمام‌شده</th><th className="p-3 text-right">سود/زیان تحقق‌یافته</th><th className="p-3 text-right">بازده</th></tr></thead><tbody>{symbolPerformance.map(item => <tr key={item.symbol} className="border-t border-gray-200 dark:border-gray-700"><td className="p-3 font-bold text-cyan-600">{item.symbol}</td><td className="p-3">{formatNumber(item.trades)}</td><td className="p-3">{formatNumber(item.costBasis)} ریال</td><td className={`p-3 font-bold ${item.realizedPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatNumber(item.realizedPnl)} ریال</td><td className={`p-3 font-bold ${item.percent >= 0 ? 'text-green-600' : 'text-red-600'}`}>{item.percent.toFixed(2)}%</td></tr>)}</tbody></table>
    </div>}

    <div className="mt-8 space-y-3">
      <h4 className="font-bold">تاریخچه فروش‌ها</h4>
      {!trades.length && <p className="text-sm text-gray-500">هنوز معامله فروخته‌شده‌ای ثبت نشده است.</p>}
      {trades.map(trade => <div key={trade.id} className="p-4 rounded-lg bg-white dark:bg-gray-900/30 border border-gray-200 dark:border-gray-700">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><strong className="text-cyan-600">{trade.symbol}</strong> · {formatNumber(trade.soldQuantity)} سهم · فروش {formatNumber(trade.sellPrice)} ریال · {trade.sellDate}</div>
          <button type="button" onClick={() => removeTrade(trade.id)} className="p-2 text-red-500" title="حذف و بازگردانی Lot"><TrashIcon /></button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-sm">
          <div>مبلغ فروش: <strong>{formatNumber(trade.proceeds)}</strong></div>
          <div>بهای تمام‌شده: <strong>{formatNumber(trade.costBasis)}</strong></div>
          <div>سود/زیان تحقق‌یافته: <strong className={trade.realizedPnl >= 0 ? 'text-green-600' : 'text-red-600'}>{formatNumber(trade.realizedPnl)}</strong></div>
          <div>بازده: <strong className={trade.realizedPnlPercent >= 0 ? 'text-green-600' : 'text-red-600'}>{trade.realizedPnlPercent.toFixed(2)}%</strong></div>
        </div>
        <div className="mt-3 text-xs text-gray-500 space-y-1">{trade.allocations.map(a => <div key={`${trade.id}-${a.lotId}`}>Lot {a.lotId}: {formatNumber(a.quantity)} سهم از {a.buyPrice.toLocaleString('fa-IR')} ریال · مدت نگهداری: {a.holdingDays ?? holdingDays(a.buyDate, trade.sellDate) ?? '—'} روز</div>)}</div>
      </div>)}
    </div>
  </section>;
}
