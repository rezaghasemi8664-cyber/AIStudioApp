import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getCached, invalidateCachedGet } from '../services/apiClient';
import { onAllSymbolsSnapshotUpdated } from '../services/socketService';

type FundSymbol = {
  symbol: string;
  name?: string | null;
  lastPrice?: number | null;
  lastChange?: number | null;
  lastChangePercent?: number | null;
  closingPrice?: number | null;
  closingChange?: number | null;
  closingChangePercent?: number | null;
  allowedMin?: number | null;
  allowedMax?: number | null;
  tradeCount?: number | null;
  realBuyVolume?: number | null;
  realSellVolume?: number | null;
  legalBuyVolume?: number | null;
  legalSellVolume?: number | null;
  instBuyVolume?: number | null;
  instSellVolume?: number | null;
  realBuyCount?: number | null;
  realSellCount?: number | null;
  legalBuyCount?: number | null;
  legalSellCount?: number | null;
  instBuyCount?: number | null;
  instSellCount?: number | null;
};
type AllSymbolsSnapshot = {
  status: string;
  symbols: FundSymbol[];
  snapshotUpdatedAt?: string | null;
  snapshotDate?: string | null;
  symbolCount?: number;
};
const ENDPOINT = '/market/all-symbols';

const number = (value?: number | null) => value == null || !Number.isFinite(Number(value))
  ? '—'
  : new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 2 }).format(Number(value));
const changeText = (value?: number | null) => value == null
  ? '—'
  : (value > 0 ? '+' : '') + number(value);
const changeColor = (value?: number | null) => value == null || value === 0
  ? 'text-gray-500'
  : value > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
const isGoldOrSilverFund = (row: FundSymbol) => {
  const label = String(row.name || '').replace(/[يى]/g, 'ی').replace(/ك/g, 'ک');
  return /صندوق/.test(label) && /(طلا|نقره)/.test(label);
};

const GoldSilverFundsCard: React.FC = () => {
  const [snapshot, setSnapshot] = useState<AllSymbolsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const sequence = useRef(0);

  const load = useCallback(async () => {
    const current = ++sequence.current;
    try {
      const response: any = await getCached(ENDPOINT, 300000);
      const data = response?.data?.data ?? response?.data ?? null;
      if (current !== sequence.current) return;
      if (response?.success && Array.isArray(data?.symbols)) {
        setSnapshot(data);
        setError('');
      } else if (!data) {
        setError('اسنپ‌شات نمادهای بازار هنوز در دسترس نیست.');
      }
    } catch {
      if (current === sequence.current) setError('دریافت اطلاعات صندوق‌ها با خطا مواجه شد.');
    } finally {
      if (current === sequence.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAllSymbolsSnapshotUpdated(() => {
      // A new verified AllSymbols snapshot has been committed; reload from its central cache.
      invalidateCachedGet(ENDPOINT);
      void load();
    });
    void load();
    return () => {
      sequence.current += 1;
      unsubscribe();
    };
  }, [load]);

  const funds = (snapshot?.symbols || [])
    .filter(isGoldOrSilverFund)
    .sort((a, b) => String(a.name || a.symbol).localeCompare(String(b.name || b.symbol), 'fa'));

  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-gray-50 px-4 py-3 dark:bg-gray-800">
        <div>
          <h2 className="font-bold">صندوقهای طلا و نقره</h2>
          <p className="mt-1 text-xs text-gray-500">اطلاعات معاملاتی از آخرین اسنپ‌شات All Symbols</p>
        </div>
        <div className="text-xs text-gray-500">
          {snapshot?.snapshotUpdatedAt ? 'آخرین به‌روزرسانی: ' + new Date(snapshot.snapshotUpdatedAt).toLocaleString('fa-IR') : ''}
          {snapshot && <span className="mr-2">· {number(funds.length)} صندوق</span>}
        </div>
      </div>
      {loading && !snapshot && <div className="p-5 text-center text-sm text-gray-500">در حال دریافت اطلاعات صندوق‌ها…</div>}
      {error && !snapshot && <div className="p-5 text-center text-sm text-amber-600">{error}</div>}
      {snapshot && funds.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-[1900px] w-full border-collapse text-xs">
            <thead className="bg-gray-50 text-gray-600 dark:bg-gray-800/70 dark:text-gray-300">
              <tr>
                <th rowSpan={2} className="sticky right-0 z-10 bg-gray-50 px-3 py-3 text-center dark:bg-gray-800">نماد</th>
                <th rowSpan={2} className="px-3 py-3 text-center">نام صندوق</th>
                <th colSpan={3} className="px-3 py-2 text-center">قیمت لحظه‌ای</th>
                <th colSpan={3} className="px-3 py-2 text-center">قیمت پایانی</th>
                <th rowSpan={2} className="px-3 py-3 text-center">آستانه مجاز پایین</th>
                <th rowSpan={2} className="px-3 py-3 text-center">آستانه مجاز بالا</th>
                <th rowSpan={2} className="px-3 py-3 text-center">تعداد معاملات</th>
                <th colSpan={2} className="px-3 py-2 text-center">حجم خرید</th>
                <th colSpan={2} className="px-3 py-2 text-center">حجم فروش</th>
                <th colSpan={2} className="px-3 py-2 text-center">تعداد خریدار</th>
                <th colSpan={2} className="px-3 py-2 text-center">تعداد فروشنده</th>
              </tr>
              <tr>
                {['قیمت (ریال)','مقدار تغییر','درصد تغییر','قیمت (ریال)','مقدار تغییر','درصد تغییر',
                  'حقیقی','حقوقی','حقیقی','حقوقی','حقیقی','حقوقی','حقیقی','حقوقی'].map((label, index) =>
                  <th key={index} className="border-t border-gray-200 px-3 py-2 text-center font-medium dark:border-gray-700">{label}</th>)}
              </tr>
            </thead>
            <tbody>
              {funds.map(row => (
                <tr key={row.symbol} className="border-t border-gray-100 hover:bg-gray-50/70 dark:border-gray-700 dark:hover:bg-gray-800/40">
                  <td className="sticky right-0 bg-white px-3 py-3 text-center font-bold dark:bg-gray-900" dir="ltr">{row.symbol}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-center">{row.name || '—'}</td>
                  <td className={'px-3 py-3 text-center font-semibold ' + changeColor(row.lastChange)}>{number(row.lastPrice)}</td>
                  <td className={'px-3 py-3 text-center ' + changeColor(row.lastChange)}>{changeText(row.lastChange)}</td>
                  <td className={'px-3 py-3 text-center ' + changeColor(row.lastChangePercent)}>{row.lastChangePercent == null ? '—' : changeText(row.lastChangePercent) + '%'}</td>
                  <td className={'px-3 py-3 text-center font-semibold ' + changeColor(row.closingChange)}>{number(row.closingPrice)}</td>
                  <td className={'px-3 py-3 text-center ' + changeColor(row.closingChange)}>{changeText(row.closingChange)}</td>
                  <td className={'px-3 py-3 text-center ' + changeColor(row.closingChangePercent)}>{row.closingChangePercent == null ? '—' : changeText(row.closingChangePercent) + '%'}</td>
                  <td className="px-3 py-3 text-center">{number(row.allowedMin)}</td>
                  <td className="px-3 py-3 text-center">{number(row.allowedMax)}</td>
                  <td className="px-3 py-3 text-center">{number(row.tradeCount)}</td>
                  <td className="px-3 py-3 text-center">{number(row.realBuyVolume)}</td>
                  <td className="px-3 py-3 text-center">{number(row.legalBuyVolume ?? row.instBuyVolume)}</td>
                  <td className="px-3 py-3 text-center">{number(row.realSellVolume)}</td>
                  <td className="px-3 py-3 text-center">{number(row.legalSellVolume ?? row.instSellVolume)}</td>
                  <td className="px-3 py-3 text-center">{number(row.realBuyCount)}</td>
                  <td className="px-3 py-3 text-center">{number(row.legalBuyCount ?? row.instBuyCount)}</td>
                  <td className="px-3 py-3 text-center">{number(row.realSellCount)}</td>
                  <td className="px-3 py-3 text-center">{number(row.legalSellCount ?? row.instSellCount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {snapshot && funds.length === 0 && <div className="p-5 text-center text-sm text-gray-500">در اسنپ‌شات فعلی صندوقی با نام طلا یا نقره پیدا نشد.</div>}
    </section>
  );
};

export default GoldSilverFundsCard;
