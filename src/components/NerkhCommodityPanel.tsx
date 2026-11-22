import React, { useCallback, useEffect, useState } from 'react';
import { getCached, invalidateCachedGet } from '../services/apiClient';

type Item = { symbol: string; current: number; change24hPercent: number | null; min24h: number | null; max24h: number | null; update: string | null };
type Snapshot = { fetchedAt: string; groups: { gold: Item[]; currency: Item[]; crypto: Item[] } };
type Tab = 'gold' | 'coins' | 'silver' | 'currency';

const labels: Record<string, string> = {
  GOLD18K:'طلای ۱۸ عیار', GOLD24K:'طلای ۲۴ عیار', MESGHAL:'مثقال طلا', MAZANEH:'مظنه طلا',
  OUNCE:'انس جهانی طلا', MILLI_GOLD18K:'طلای ۱۸ عیار (میلی)', GOLD18K_STOCK:'طلای ۱۸ عیار بورسی',
  GOLD_FUTURES:'قرارداد آتی طلا', TALASEA_GOLD_18K:'طلای ۱۸ عیار طلاسی', TECHNOGOLD_GOLD_18K:'طلای ۱۸ عیار تکنوگلد',
  SEKE_EMAMI:'سکه امامی', SEKE_BAHAR:'سکه بهار آزادی', SEKE_NIM:'نیم‌سکه', SEKE_ROB:'ربع‌سکه',
  SEKE_1G:'سکه یک گرمی', SEKE_PRS100:'گواهی سکه ۱۰۰', SEKE_PRS200:'گواهی سکه ۲۰۰',
  SEKE_PRS400:'گواهی سکه ۴۰۰', SEKE_PRS500:'گواهی سکه ۵۰۰', SEKE_PRS700:'گواهی سکه ۷۰۰',
  OUNCE_SILVER:'انس جهانی نقره', OUNCE_PLATINUM:'انس جهانی پلاتین',
  USD:'دلار آمریکا', EUR:'یورو', GBP:'پوند انگلیس', AED:'درهم امارات', TRY:'لیر ترکیه',
  CAD:'دلار کانادا', CHF:'فرانک سوئیس', CNY:'یوآن چین', QAR:'ریال قطر'
};
const number = (v: number) => new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 2 }).format(v);
// Recover absolute 24-hour movement from current price and percentage change.
const absoluteChange = (current: number, percent: number | null): number | null => {
  if (percent == null || !Number.isFinite(current) || !Number.isFinite(percent) || percent <= -100) return null;
  return current * percent / (100 + percent);
};
const signedNumber = (value: number | null) => value == null
  ? '—'
  : (value > 0 ? '+' : '') + number(value);

const NerkhCommodityPanel: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('gold');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response: any = await getCached('/nerkh/prices', 300000);
      const data = response?.data?.data ?? response?.data ?? null;
      if (response?.success && data?.groups) { setSnapshot(data); setError(''); }
      else if (!data) setError(response?.message || 'قیمت‌های Nerkh آماده نیست؛ توکن را در پنل مدیریت ثبت کنید.');
    } catch { setError('دریافت قیمت‌های Nerkh ناموفق بود.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!open) return;
    void load();
    const timer = window.setInterval(() => { invalidateCachedGet('/nerkh/prices'); void load(); }, 300000);
    return () => window.clearInterval(timer);
  }, [open, load]);

  const usd = snapshot?.groups.currency.find(x => x.symbol === 'USD')?.current || 0;
  const gold = snapshot?.groups.gold || [];
  const items = tab === 'currency' ? snapshot?.groups.currency || []
    : tab === 'coins' ? gold.filter(x => x.symbol.startsWith('SEKE_'))
    : tab === 'silver' ? gold.filter(x => x.symbol === 'OUNCE_SILVER' || x.symbol === 'OUNCE_PLATINUM')
    : gold.filter(x => !x.symbol.startsWith('SEKE_') && x.symbol !== 'OUNCE_SILVER' && x.symbol !== 'OUNCE_PLATINUM');

  return <section className="space-y-4" dir="rtl">
    <button type="button" onClick={() => setOpen(v => !v)} className="w-full rounded-xl border border-amber-300/70 bg-amber-50/60 px-4 py-4 text-right dark:border-amber-800/60 dark:bg-amber-950/20">
      <div className="flex items-center justify-between gap-3"><div><div className="font-bold">طلا، سکه، نقره و ارز</div><div className="mt-1 text-xs text-gray-500">قیمت‌های لحظه‌ای Nerkh · بروزرسانی هر ۵ دقیقه</div></div><span className="text-sm font-semibold text-amber-700">{open ? 'بستن −' : 'مشاهده قیمت‌ها ←'}</span></div>
    </button>
    {open && <div className="space-y-4 rounded-xl border border-gray-200 p-4 dark:border-gray-700">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-bold">قیمت‌های طلا، سکه، نقره و ارز</h2><p className="mt-1 text-xs text-gray-500">قیمت داخلی به ریال و انس جهانی به دلار و معادل ریالی نمایش داده می‌شود.</p></div><button onClick={() => { invalidateCachedGet('/nerkh/prices'); void load(); }} className="rounded-lg border px-3 py-2 text-xs">بروزرسانی</button></div>
      <div className="flex flex-wrap gap-2">{([{key:'gold',label:'طلا'},{key:'coins',label:'سکه'},{key:'silver',label:'نقره'},{key:'currency',label:'ارزها'}] as const).map(x => <button key={x.key} onClick={() => setTab(x.key)} className={'rounded-lg px-4 py-2 text-sm font-semibold ' + (tab === x.key ? 'bg-cyan-600 text-white' : 'border')}>{x.label}</button>)}</div>
      {loading && !snapshot && <div className="py-8 text-center text-gray-500">در حال دریافت قیمت‌ها…</div>}
      {error && !snapshot && <div className="rounded-lg border border-amber-300 p-3 text-sm text-amber-700">{error}</div>}
      {snapshot && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{items.map(item => {
        const ounce = ['OUNCE','OUNCE_SILVER','OUNCE_PLATINUM'].includes(item.symbol);
        const current = ounce && usd ? item.current * usd : item.current;
        const min = item.min24h == null ? null : ounce && usd ? item.min24h * usd : item.min24h;
        const max = item.max24h == null ? null : ounce && usd ? item.max24h * usd : item.max24h;
        const changeRial = absoluteChange(current, item.change24hPercent);
        const changePositive = changeRial == null ? null : changeRial >= 0;
        const changeColor = changePositive == null ? 'text-gray-500' : changePositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
        const percentColor = item.change24hPercent == null ? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300' : item.change24hPercent >= 0 ? 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400' : 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400';
        return <article key={item.symbol} className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
          <div className="flex items-start justify-between gap-2"><div><div className="font-semibold">{labels[item.symbol] || item.symbol}</div><div className="mt-1 text-xs text-gray-500" dir="ltr">{item.symbol}</div></div><span className={'rounded-md px-2 py-1 text-xs ' + percentColor}>{item.change24hPercent == null ? '—' : (item.change24hPercent > 0 ? '+' : '') + number(item.change24hPercent) + '%'}</span></div>
          <div className="mt-4 text-xl font-bold" dir="ltr">{number(current)} <span className="text-xs font-normal text-gray-500">ریال</span></div>
          <div className={'mt-2 flex items-center justify-between gap-2 text-sm ' + changeColor}><span className="text-xs text-gray-500">مقدار تغییر ۲۴ ساعته</span><b dir="ltr">{signedNumber(changeRial)} <span className="text-[10px] font-normal">ریال</span></b></div>
          {ounce && <div className="mt-1 text-xs text-gray-500" dir="ltr">{number(item.current)} USD / oz · معادل ریالی با نرخ دلار Nerkh</div>}
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-500"><div>کمینه ۲۴ساعت: <b>{min == null ? '—' : number(min)}</b></div><div>بیشینه ۲۴ساعت: <b>{max == null ? '—' : number(max)}</b></div></div>
          <div className="mt-3 border-t border-gray-100 pt-2 text-[11px] text-gray-500 dark:border-gray-700">آخرین بروزرسانی: {item.update || '—'}</div>
        </article>;
      })}</div>}
      {snapshot && <div className="text-left text-[11px] text-gray-500">زمان دریافت: {new Date(snapshot.fetchedAt).toLocaleString('fa-IR')}</div>}
      {!loading && snapshot && items.length === 0 && <div className="py-6 text-center text-gray-500">برای این گروه داده‌ای موجود نیست.</div>}
    </div>}
  </section>;
};
export default NerkhCommodityPanel;
