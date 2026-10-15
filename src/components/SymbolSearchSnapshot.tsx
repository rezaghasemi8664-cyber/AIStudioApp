import React, { useState } from 'react';
import api from '../api/apiClient';

type SnapshotSymbol = {
  symbol: string; name?: string | null; industryName?: string | null;
  lastPrice?: number | null; lastChange?: number | null; lastChangePercent?: number | null;
  closingPrice?: number | null; closingChange?: number | null; closingChangePercent?: number | null;
  allowedMax?: number | null; allowedMin?: number | null; pe?: number | null; eps?: number | null;
  tradeCount?: number | null; tradeVolume?: number | null;
  realBuyVolume?: number | null; realSellVolume?: number | null;
  instBuyVolume?: number | null; instSellVolume?: number | null;
  realBuyCount?: number | null; realSellCount?: number | null;
  instBuyCount?: number | null; instSellCount?: number | null;
};
type SearchResponse = {
  success: boolean; data: SnapshotSymbol;
  snapshot: { updatedAt: string; date: string; symbolCount: number; source: string };
};
function formatNumber(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return Number(value).toLocaleString('fa-IR', { maximumFractionDigits: digits });
}
function formatDate(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('fa-IR-u-ca-persian', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}
function formatSignedNumber(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  const number = Number(value);
  const sign = number > 0 ? '+' : number < 0 ? '−' : '';
  return sign + formatNumber(Math.abs(number), digits);
}
function changeColor(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value)) || Number(value) === 0) {
    return 'text-slate-500 dark:text-slate-400';
  }
  return Number(value) > 0
    ? 'text-emerald-600 dark:text-emerald-400'
    : 'text-rose-600 dark:text-rose-400';
}
function Metric({ label, value, note, noteColor }: { label: string; value: string; note?: string; noteColor?: string }) {
  return <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
    <div className="text-[11px] font-semibold leading-5 text-slate-500 dark:text-slate-400">{label}</div>
    <div className="mt-1 break-words text-[15px] font-extrabold leading-7 text-slate-900 dark:text-slate-100">{value}</div>
    {note ? <div className={`mt-1 text-[11px] font-bold ${noteColor || 'text-slate-500 dark:text-slate-400'}`}>{note}</div> : null}
  </div>;
}
export default function SymbolSearchSnapshot() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function search(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const symbol = query.trim();
    if (!symbol) { setError('ابتدا نماد را وارد کنید.'); setResult(null); return; }
    setLoading(true); setError(''); setResult(null);
    try {
      const response = await api.get('/market/all-symbols/search', { params: { symbol } });
      setResult(response.data as SearchResponse);
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || 'دریافت اطلاعات نماد از اسنپ‌شات دیتابیس ناموفق بود.');
    } finally { setLoading(false); }
  }
  const item = result?.data;
  const groups = [
    { title: 'اطلاعات پایه و قیمت', metrics: [
      { label: 'نام نماد', value: item?.name || '—' },
      { label: 'گروه صنعت', value: item?.industryName || '—' },
      { label: 'آخرین قیمت', value: formatNumber(item?.lastPrice), note: 'تغییر: ' + formatSignedNumber(item?.lastChange) + ' (' + formatSignedNumber(item?.lastChangePercent, 2) + '٪)', noteColor: changeColor(item?.lastChange ?? item?.lastChangePercent) },
      { label: 'قیمت پایانی', value: formatNumber(item?.closingPrice), note: 'تغییر: ' + formatSignedNumber(item?.closingChange) + ' (' + formatSignedNumber(item?.closingChangePercent, 2) + '٪)', noteColor: changeColor(item?.closingChange ?? item?.closingChangePercent) },
      { label: 'آستانه مجاز بالا', value: formatNumber(item?.allowedMax) },
      { label: 'آستانه مجاز پایین', value: formatNumber(item?.allowedMin) },
      { label: 'P/E', value: formatNumber(item?.pe, 2) },
      { label: 'EPS', value: formatNumber(item?.eps, 2) },
      { label: 'تعداد معاملات', value: formatNumber(item?.tradeCount) },
      { label: 'حجم معاملات', value: formatNumber(item?.tradeVolume) }
    ]},
    { title: 'حجم خرید و فروش', metrics: [
      { label: 'حجم خرید حقیقی', value: formatNumber(item?.realBuyVolume) },
      { label: 'حجم فروش حقیقی', value: formatNumber(item?.realSellVolume) },
      { label: 'حجم خرید حقوقی', value: formatNumber(item?.instBuyVolume) },
      { label: 'حجم فروش حقوقی', value: formatNumber(item?.instSellVolume) }
    ]},
    { title: 'تعداد خریدار و فروشنده', metrics: [
      { label: 'تعداد خریدار حقیقی', value: formatNumber(item?.realBuyCount) },
      { label: 'تعداد فروشنده حقیقی', value: formatNumber(item?.realSellCount) },
      { label: 'تعداد خریدار حقوقی', value: formatNumber(item?.instBuyCount) },
      { label: 'تعداد فروشنده حقوقی', value: formatNumber(item?.instSellCount) }
    ]}
  ];
  return <section dir="rtl" className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-950">
    <div>
      <h2 className="text-lg font-extrabold text-slate-900 dark:text-slate-100">جستجوی نماد از اسنپ‌شات AllSymbols</h2>
      <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">اطلاعات فقط از آخرین اسنپ‌شات ذخیره‌شده در دیتابیس خوانده می‌شود؛ جستجو درخواست مستقیمی به BRS ارسال نمی‌کند.</p>
    </div>
    <form onSubmit={search} className="flex flex-col gap-2 sm:flex-row">
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="نماد را وارد کنید؛ مثال: فولاد" aria-label="نماد مورد جستجو"
        className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-900 dark:text-white" />
      <button type="submit" disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-extrabold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
        {loading ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> در حال جستجو...</> : 'جستجو'}
      </button>
    </form>
    {error ? <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold leading-6 text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300">{error}</div> : null}
    {item && result?.snapshot ? <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
        <span>{item.symbol} — {item.name || 'نام نماد ثبت نشده'}</span><span>آخرین به‌روزرسانی: {formatDate(result.snapshot.updatedAt)}</span>
      </div>
      {groups.map((group) => <div key={group.title} className="space-y-3">
        <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">{group.title}</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {group.metrics.map((metric) => <Metric key={metric.label} {...metric} />)}
        </div>
      </div>)}
      <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">تاریخ اسنپ‌شات: {result.snapshot.date} · تعداد نمادهای ذخیره‌شده: {formatNumber(result.snapshot.symbolCount)}</p>
    </div> : null}
  </section>;
}
