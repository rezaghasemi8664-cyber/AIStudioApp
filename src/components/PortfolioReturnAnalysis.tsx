import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getPortfolioHistory, type PortfolioHistoryPoint } from '../services/portfolioHistoryService';
import JalaliDatePicker from './JalaliDatePicker';
import { JalaliDate, jalaliToGregorian } from '../utils/jalaliDate';
import { formatPortfolioDate, formatPortfolioNumber, formatPortfolioPercent, normalizePortfolioDate } from '../utils/portfolioDate';

interface Props { isOnline: boolean; }

const money = (value: number | null) => formatPortfolioNumber(value, 0);
const pct = (value: number | null) => formatPortfolioPercent(value, 2);

const toJalali = (iso: string | null): JalaliDate | null => {
  if (!iso) return null;
  const d = new Date(iso + 'T12:00:00Z');
  const raw = new Intl.DateTimeFormat('en-US-u-ca-persian', { year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(d);
  const get = (type: string) => Number(raw.find(x => x.type === type)?.value || 0);
  return { year: get('year'), month: get('month'), day: get('day') };
};

const PortfolioReturnAnalysis: React.FC<Props> = ({ isOnline }) => {
  const [points, setPoints] = useState<PortfolioHistoryPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState<JalaliDate | null>(null);
  const [toDate, setToDate] = useState<JalaliDate | null>(null);
  const [appliedFromDate, setAppliedFromDate] = useState<JalaliDate | null>(null);
  const [appliedToDate, setAppliedToDate] = useState<JalaliDate | null>(null);

  const load = useCallback(async () => {
    if (!isOnline) { setError('برای دریافت بازدهی تاریخی سبد باید آنلاین باشید.'); return; }
    setLoading(true); setError(null);
    try {
      const history = await getPortfolioHistory();
      setPoints(history);
      if (history.length) {
        const first = toJalali(normalizePortfolioDate(history[0].date));
        const last = toJalali(normalizePortfolioDate(history[history.length - 1].date));
        setFromDate(prev => prev ?? first);
        setToDate(prev => prev ?? last);
        setAppliedFromDate(prev => prev ?? first);
        setAppliedToDate(prev => prev ?? last);
      }
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'دریافت بازدهی تاریخی سبد ناموفق بود.');
    } finally { setLoading(false); }
  }, [isOnline]);

  useEffect(() => { load(); }, [load]);

  const rangePoints = useMemo(() => {
    if (!points.length) return [];
    const fromIso = appliedFromDate ? jalaliToGregorian(appliedFromDate)?.toISOString().slice(0, 10) : null;
    const toIso = appliedToDate ? jalaliToGregorian(appliedToDate)?.toISOString().slice(0, 10) : null;
    if (fromIso && toIso && fromIso > toIso) return [];
    return points.filter(point => {
      const date = normalizePortfolioDate(point.date);
      return !!date && (!fromIso || date >= fromIso) && (!toIso || date <= toIso);
    });
  }, [points, appliedFromDate, appliedToDate]);

  const stats = useMemo(() => {
    if (!rangePoints.length) return { totalPnl: null, totalReturn: null, totalCapitalChange: null, marketPnl: null, avgDailyReturn: null, positiveDays: 0, negativeDays: 0 };
    const first = rangePoints[0];
    const last = rangePoints[rangePoints.length - 1];
    const marketPnl = rangePoints.reduce((sum, point) => sum + point.marketPnl, 0);
    const capitalChange = rangePoints.reduce((sum, point) => sum + point.capitalChange, 0);
    const dailyReturns = rangePoints.map(point => point.dailyReturnPercent).filter((value): value is number => value != null);
    return {
      totalPnl: last.pnl,
      totalReturn: last.cost > 0 ? (last.pnl / last.cost) * 100 : null,
      totalCapitalChange: capitalChange,
      marketPnl,
      avgDailyReturn: dailyReturns.length ? dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length : null,
      positiveDays: rangePoints.filter(point => point.marketPnl > 0).length,
      negativeDays: rangePoints.filter(point => point.marketPnl < 0).length,
      firstDate: first.date,
      lastDate: last.date,
    };
  }, [rangePoints]);

  const invalidDraftRange = !!(fromDate && toDate && jalaliToGregorian(fromDate) && jalaliToGregorian(toDate) && jalaliToGregorian(fromDate)!.getTime() > jalaliToGregorian(toDate)!.getTime());

  return <div dir="rtl" className="page-shell portfolio-return-analysis-page space-y-5">
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div><h2 className="text-2xl font-black">بازدهی واقعی سرمایه‌گذاری</h2><p className="text-sm text-gray-500 dark:text-gray-400 mt-1">تفکیک تغییر سرمایه از سود و زیان ناشی از حرکت قیمت بر اساس داده واقعی</p></div>
      <button type="button" onClick={load} disabled={loading || !isOnline} className="rounded-xl bg-cyan-600 text-white px-4 py-2 font-bold disabled:opacity-50">{loading ? 'در حال محاسبه...' : 'بروزرسانی'}</button>
    </div>
    {error && <div className="rounded-xl border border-red-300 bg-red-50 dark:bg-red-950/20 p-4 text-red-700 dark:text-red-300">{error}</div>}
    {!loading && !error && !points.length && <div className="rounded-2xl border border-[var(--color-border)] p-6 text-center text-gray-500">داده تاریخی معتبر برای سبد موجود نیست.</div>}
    {points.length > 0 && <>
      <div className="rounded-2xl border border-[var(--color-border)] bg-white/80 dark:bg-gray-900/60 p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <div><h3 className="font-black">بازه محاسبه</h3><p className="text-xs text-gray-500 mt-1">از تاریخ و تا تاریخ را با تقویم شمسی انتخاب کنید؛ تمام اطلاعات این بخش بر اساس بازه انتخاب‌شده نمایش داده می‌شوند.</p></div>
          <button type="button" onClick={() => {
            const first = toJalali(normalizePortfolioDate(points[0].date));
            const last = toJalali(normalizePortfolioDate(points[points.length - 1].date));
            setFromDate(first);
            setToDate(last);
            setAppliedFromDate(first);
            setAppliedToDate(last);
          }} className="text-xs rounded-lg border px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800">کل بازه</button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div><label className="block text-xs text-gray-500 mb-1">از تاریخ</label><JalaliDatePicker value={fromDate} onChange={setFromDate} placeholder="انتخاب از تاریخ" /></div>
          <div><label className="block text-xs text-gray-500 mb-1">تا تاریخ</label><JalaliDatePicker value={toDate} onChange={setToDate} placeholder="انتخاب تا تاریخ" /></div>
        </div>
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <button
            type="button"
            disabled={!fromDate || !toDate || invalidDraftRange}
            onClick={() => {
              setAppliedFromDate(fromDate);
              setAppliedToDate(toDate);
            }}
            className="rounded-xl bg-cyan-600 text-white px-4 py-2 text-sm font-bold disabled:opacity-50"
          >
            اعمال بازه
          </button>
          <span className="text-xs text-gray-500">پس از زدن «اعمال بازه»، تمام اطلاعات این تب با همین بازه محاسبه می‌شود.</span>
        </div>
        {invalidDraftRange && <p className="mt-2 text-xs text-red-600">تاریخ شروع بازه نمی‌تواند بعد از تاریخ پایان باشد.</p>}
        {!invalidDraftRange && !rangePoints.length && <p className="mt-2 text-xs text-amber-600">برای بازه اعمال‌شده داده تاریخی موجود نیست.</p>}
      </div>
      {rangePoints.length > 0 && <>
        <div className="mb-3 rounded-xl bg-cyan-50 dark:bg-cyan-950/20 border border-cyan-200 dark:border-cyan-900 px-4 py-3">
          <p className="text-xs text-gray-500">بازه اعمال‌شده</p>
          <p className="mt-1 font-black">{formatPortfolioDate(stats.firstDate)} تا {formatPortfolioDate(stats.lastDate)}</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[['سود/زیان تجمعی', money(stats.totalPnl)], ['بازدهی بر مبنای بهای تمام‌شده', pct(stats.totalReturn)], ['تغییر سرمایه ثبت‌شده', money(stats.totalCapitalChange)], ['P/L ناشی از حرکت بازار', money(stats.marketPnl)]].map(([label, value]) => <div key={label} className="rounded-2xl border border-[var(--color-border)] bg-white/80 dark:bg-gray-900/60 p-4"><p className="text-xs text-gray-500">{label}</p><p className="mt-2 text-xl font-black font-mono">{value}</p></div>)}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[['میانگین بازدهی روزانه', pct(stats.avgDailyReturn)], ['روزهای مثبت بازار', formatPortfolioNumber(stats.positiveDays, 0)], ['روزهای منفی بازار', formatPortfolioNumber(stats.negativeDays, 0)], ['بازه محاسبه', formatPortfolioDate(stats.firstDate) + ' تا ' + formatPortfolioDate(stats.lastDate)]].map(([label, value]) => <div key={label} className="rounded-2xl border border-[var(--color-border)] bg-white/70 dark:bg-gray-900/50 p-4"><p className="text-xs text-gray-500">{label}</p><p className="mt-2 text-lg font-black font-mono">{value}</p></div>)}
        </div>
        <div className="rounded-2xl border border-[var(--color-border)] bg-white/80 dark:bg-gray-900/60 overflow-x-auto">
          <div className="p-4 border-b border-[var(--color-border)]"><h3 className="font-black">تفکیک روزانه سرمایه و عملکرد بازار</h3><p className="text-xs text-gray-500 mt-1">«تغییر سرمایه» از ورود موقعیت‌های موجود بر اساس تاریخ ورود محاسبه شده و «P/L بازار» تغییر ارزش پس از تعدیل تغییر سرمایه است.</p></div>
          <table className="w-full text-sm"><thead><tr className="text-right text-gray-500"><th className="p-3">تاریخ</th><th className="p-3">ارزش سبد</th><th className="p-3">بهای تمام‌شده</th><th className="p-3">تغییر سرمایه</th><th className="p-3">P/L بازار</th><th className="p-3">بازدهی روز</th></tr></thead><tbody>{rangePoints.slice(-60).map(point => <tr key={formatPortfolioDate(point.date)} className="border-t border-[var(--color-border)]"><td className="p-3 font-mono">{formatPortfolioDate(point.date)}</td><td className="p-3 font-mono">{money(point.value)}</td><td className="p-3 font-mono">{money(point.cost)}</td><td className="p-3 font-mono">{money(point.capitalChange)}</td><td className={'p-3 font-mono ' + (point.marketPnl >= 0 ? 'text-emerald-600' : 'text-red-600')}>{money(point.marketPnl)}</td><td className={'p-3 font-mono ' + (point.dailyReturnPercent == null || point.dailyReturnPercent >= 0 ? 'text-emerald-600' : 'text-red-600')}>{pct(point.dailyReturnPercent)}</td></tr>)}</tbody></table>
        </div>
      </>}
    </>}
  </div>;
};

export default PortfolioReturnAnalysis;
