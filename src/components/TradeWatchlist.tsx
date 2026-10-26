import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../api/apiClient';
import { getSocket } from '../services/socketService';

type ListType = 'scalping' | 'valuable';
type WatchItem = {
  id: string; listType: ListType; symbol: string; name: string; entryDate: string; quantity: number;
  entryPrice: number; targetPrice: number | null; stopLoss: number | null; currentPrice: number | null;
  pnl: number | null; pnlPercent: number | null; targetAlertEnabled: boolean; stopLossAlertEnabled: boolean;
  targetAlertTriggered: boolean; stopLossAlertTriggered: boolean; quoteAvailable: boolean;
};
const labels: Record<ListType, string> = { scalping: 'سبد نوسان‌گیری', valuable: 'سبد ارزنده‌ها' };
const money = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? '—' : new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 2 }).format(value);
const jalaliToday = () => new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).replace(/-/g, '/').replace(/\s/g, '');
const errorMessage = (e: any) => e?.response?.data?.message || e?.message || 'خطا در ارتباط با سرور';

const TradeWatchlist: React.FC<{ listType: ListType; isOnline: boolean }> = ({ listType, isOnline }) => {
  const [items, setItems] = useState<WatchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [symbol, setSymbol] = useState('');
  const [name, setName] = useState('');
  const [entryDate, setEntryDate] = useState(jalaliToday);
  const [quantity, setQuantity] = useState('');
  const [entryPrice, setEntryPrice] = useState('');
  const [targetPrice, setTargetPrice] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [targetAlertEnabled, setTargetAlertEnabled] = useState(true);
  const [stopLossAlertEnabled, setStopLossAlertEnabled] = useState(true);

  const load = useCallback(async () => {
    if (!isOnline) { setLoading(false); setError('برای دریافت سبد به اتصال سرور نیاز است.'); return; }
    try {
      const response = await api.get(`/trade-watchlists/${listType}`, { params: { _ts: Date.now() } });
      const payload = response?.data?.data ?? response?.data;
      setItems(Array.isArray(payload?.items) ? payload.items : []);
      setError('');
    } catch (e) { setError(errorMessage(e)); }
    finally { setLoading(false); }
  }, [isOnline, listType]);

  useEffect(() => {
    void load();
    const socket = getSocket();
    socket?.on('all-symbols-snapshot:updated', load);
    socket?.on('connect', load);
    return () => {
      socket?.off('all-symbols-snapshot:updated', load);
      socket?.off('connect', load);
    };
  }, [load]);

  const totals = useMemo(() => items.reduce((acc, item) => {
    acc.invested += item.entryPrice * item.quantity;
    if (item.currentPrice !== null) {
      acc.current += item.currentPrice * item.quantity;
      acc.pnl += (item.currentPrice - item.entryPrice) * item.quantity;
      acc.quoted += 1;
    }
    return acc;
  }, { invested: 0, current: 0, pnl: 0, quoted: 0 }), [items]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true); setError(''); setNotice('');
    try {
      await api.post(`/trade-watchlists/${listType}`, {
        symbol: symbol.trim().toUpperCase(), name: name.trim() || symbol.trim().toUpperCase(), entryDate,
        quantity, entryPrice, targetPrice, stopLoss, targetAlertEnabled, stopLossAlertEnabled,
      });
      setSymbol(''); setName(''); setQuantity(''); setEntryPrice(''); setTargetPrice(''); setStopLoss('');
      setEntryDate(jalaliToday()); setTargetAlertEnabled(true); setStopLossAlertEnabled(true);
      setNotice('نماد با موفقیت در سبد ذخیره شد.');
      await load();
    } catch (e) { setError(errorMessage(e)); }
    finally { setSaving(false); }
  };

  const remove = async (item: WatchItem) => {
    if (!window.confirm(`نماد ${item.symbol} از ${labels[listType]} حذف شود؟`)) return;
    try {
      await api.delete(`/trade-watchlists/${listType}/${encodeURIComponent(item.id)}`);
      setItems(current => current.filter(row => row.id !== item.id));
      setNotice(`نماد ${item.symbol} حذف شد.`); setError('');
    } catch (e) { setError(errorMessage(e)); }
  };

  return (
    <section className="space-y-5" dir="rtl">
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="mb-1 text-lg font-bold">{labels[listType]}</h2>
        <p className="mb-4 text-xs text-[var(--color-text-secondary)]">قیمت فعلی فقط از اسنپ‌شات مرکزی AllSymbols در دیتابیس خوانده می‌شود؛ با ذخیره اسنپ‌شات، این سبد از طریق وب‌سوکت خودکار به‌روز می‌شود.</p>
        <form onSubmit={save} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm">نماد
            <input required value={symbol} onChange={e => setSymbol(e.target.value)} placeholder="مثلاً خودرو" className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-transparent p-2" />
          </label>
          <label className="text-sm">نام سهم (اختیاری)
            <input value={name} onChange={e => setName(e.target.value)} placeholder="نام شرکت" className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-transparent p-2" />
          </label>
          <label className="text-sm">تاریخ ورود شمسی
            <input required value={entryDate} onChange={e => setEntryDate(e.target.value)} placeholder="۱۴۰۵/۰۸/۰۳" pattern="[۰-۹0-9]{4}/[۰-۹0-9]{1,2}/[۰-۹0-9]{1,2}" className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-transparent p-2" />
          </label>
          <label className="text-sm">تعداد سهم خریداری‌شده
            <input required type="number" min="0.000001" step="any" value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="تعداد" className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-transparent p-2" />
          </label>
          <label className="text-sm">قیمت ورود
            <input required type="number" min="0.01" step="any" value={entryPrice} onChange={e => setEntryPrice(e.target.value)} placeholder="ریال" className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-transparent p-2" />
          </label>
          <label className="text-sm">هدف قیمتی (اختیاری)
            <input type="number" min="0.01" step="any" value={targetPrice} onChange={e => setTargetPrice(e.target.value)} placeholder="ریال" className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-transparent p-2" />
          </label>
          <label className="text-sm">حد ضرر (اختیاری)
            <input type="number" min="0.01" step="any" value={stopLoss} onChange={e => setStopLoss(e.target.value)} placeholder="ریال" className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-transparent p-2" />
          </label>
          <div className="flex flex-col justify-center gap-2 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={targetAlertEnabled} onChange={e => setTargetAlertEnabled(e.target.checked)} /> هشدار هدف قیمتی</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={stopLossAlertEnabled} onChange={e => setStopLossAlertEnabled(e.target.checked)} /> هشدار حد ضرر</label>
          </div>
          <div className="flex items-end"><button disabled={saving} type="submit" className="w-full rounded-lg bg-cyan-600 px-4 py-2 font-bold text-white disabled:opacity-50">{saving ? 'در حال ذخیره…' : 'ذخیره در سبد'}</button></div>
        </form>
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-500/10 p-2 text-sm text-red-600">{error}</p>}
        {notice && <p role="status" className="mt-3 rounded-lg bg-emerald-500/10 p-2 text-sm text-emerald-600">{notice}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3"><div className="text-xs text-[var(--color-text-secondary)]">تعداد نمادها</div><strong>{money(items.length)}</strong></div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3"><div className="text-xs text-[var(--color-text-secondary)]">ارزش خرید</div><strong>{money(totals.invested)}</strong></div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3"><div className="text-xs text-[var(--color-text-secondary)]">ارزش فعلی قیمت‌های موجود</div><strong>{money(totals.current)}</strong></div>
        <div className={`rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 ${totals.pnl >= 0 ? 'text-emerald-600' : 'text-red-600'}`}><div className="text-xs">سود/زیان کل برآوردی</div><strong>{money(totals.pnl)}</strong></div>
      </div>
      {loading ? <p className="py-8 text-center text-sm text-[var(--color-text-secondary)]">در حال دریافت سبد…</p> : items.length === 0 ? <div className="rounded-xl border border-dashed border-[var(--color-border)] p-8 text-center text-sm text-[var(--color-text-secondary)]">هنوز نمادی در این سبد ثبت نشده است.</div> : (
        <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
          <table className="min-w-[1100px] w-full text-sm">
            <thead className="bg-[var(--color-surface)]"><tr>{['نماد','تاریخ ورود','تعداد','قیمت ورود','هدف قیمتی','حد ضرر','قیمت فعلی','سود/زیان مبلغی','سود/زیان درصدی','هشدارها','عملیات'].map(title => <th key={title} className="whitespace-nowrap p-3 text-right">{title}</th>)}</tr></thead>
            <tbody>{items.map(item => <tr key={item.id} className="border-t border-[var(--color-border)]">
              <td className="p-3 font-bold">{item.symbol}<div className="text-xs font-normal text-[var(--color-text-secondary)]">{item.name}</div></td>
              <td className="whitespace-nowrap p-3">{item.entryDate}</td><td className="p-3">{money(item.quantity)}</td><td className="p-3">{money(item.entryPrice)}</td>
              <td className="p-3">{money(item.targetPrice)}</td><td className="p-3">{money(item.stopLoss)}</td><td className="p-3">{money(item.currentPrice)}</td>
              <td className={`p-3 font-bold ${(item.pnl ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{money(item.pnl)}</td>
              <td className={`p-3 font-bold ${(item.pnlPercent ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{item.pnlPercent == null ? '—' : `${money(item.pnlPercent)}٪`}</td>
              <td className="p-3"><div className="flex flex-col gap-1 text-xs"><span className={item.targetAlertEnabled ? 'text-emerald-600' : 'text-gray-400'}>{item.targetAlertEnabled ? 'هدف فعال' : 'هدف غیرفعال'}{item.targetAlertTriggered ? ' · صادر شد' : ''}</span><span className={item.stopLossAlertEnabled ? 'text-red-600' : 'text-gray-400'}>{item.stopLossAlertEnabled ? 'حد ضرر فعال' : 'حد ضرر غیرفعال'}{item.stopLossAlertTriggered ? ' · صادر شد' : ''}</span></div></td>
              <td className="p-3"><button type="button" onClick={() => void remove(item)} className="whitespace-nowrap rounded-md border border-red-500/30 px-3 py-1 text-red-600 hover:bg-red-500/10">حذف</button></td>
            </tr>)}</tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-[var(--color-text-secondary)]">{items.length > 0 && items.every(item => !item.quoteAvailable) ? 'قیمت قابل استفاده در اسنپ‌شات مرکزی موجود نیست؛ هیچ درخواست مستقیم به BRS ارسال نمی‌شود.' : 'قیمت‌ها از آخرین اسنپ‌شات ذخیره‌شده خوانده می‌شوند؛ سود و زیان تحقق‌نیافته است و کارمزد معاملات را شامل نمی‌شود.'}</p>
    </section>
  );
};
export default TradeWatchlist;
