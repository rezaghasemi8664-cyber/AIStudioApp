import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getMarketRadarSnapshot, readMarketRadarCache, writeMarketRadarCache } from '../services/marketRadarService';
import { getSocket } from '../services/socketService';
import type { MarketRadarSnapshot, MarketRadarSector } from '../types/marketRadar';
import IndustryHeatmap from './MarketRadar/IndustryHeatmap';
import MarketRadarHistoryChart from './MarketRadar/MarketRadarHistory';

const fa = (value: number | null | undefined, digits = 0) => value == null || !Number.isFinite(value) ? '—' : new Intl.NumberFormat('fa-IR', { maximumFractionDigits: digits }).format(value);
const pct = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? '—' : `${value > 0 ? '+' : value < 0 ? '−' : ''}${fa(Math.abs(value), 2)}٪`;
const tone = (value: number | null | undefined) => value == null ? 'text-slate-500' : value > 0 ? 'text-emerald-500 dark:text-emerald-300' : value < 0 ? 'text-rose-500 dark:text-rose-300' : 'text-slate-500';
const card = 'rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-5';
const isSnapshotStale = (snapshot: MarketRadarSnapshot | null) => {
  const raw = snapshot?.breadth?.generatedAt;
  if (!raw) return true;
  const time = new Date(raw).getTime();
  return !Number.isFinite(time) || Date.now() - time > 150_000;
};


type Score = { value: number | null; coverage: number; label: string; detail: string };
function calculateScore(data: MarketRadarSnapshot | null): Score {
  if (!data) return { value: null, coverage: 0, label: 'داده ناکافی', detail: 'داده بازار در دسترس نیست' };
  const components: Array<{ score: number; weight: number }> = [];
  const breadth = data.breadth;
  if (breadth?.available && breadth.total > 0) {
    const directional = breadth.positive + breadth.negative;
    if (directional > 0) components.push({ score: Math.max(0, Math.min(100, 50 + ((breadth.positive - breadth.negative) / directional) * 50)), weight: 35 });
  }
  const main = data.indices.find(item => /کل/.test(item.name) && !/هم.?وزن/.test(item.name));
  const equal = data.indices.find(item => /هم.?وزن/.test(item.name));
  if (main?.changePercent != null && Number.isFinite(main.changePercent)) {
    const equalScore = equal?.changePercent != null && Number.isFinite(equal.changePercent)
      ? Math.max(0, Math.min(100, 50 + (equal.changePercent * 12))) : null;
    const mainScore = Math.max(0, Math.min(100, 50 + (main.changePercent * 12)));
    components.push({ score: equalScore == null ? mainScore : (mainScore * 0.6 + equalScore * 0.4), weight: 30 });
  }
  if (breadth?.sectors.available && breadth.sectors.rows.length) {
    const sectors = breadth.sectors.rows.filter(row => Number.isFinite(row.changePercent));
    if (sectors.length) {
      const average = sectors.reduce((sum, row) => sum + row.changePercent, 0) / sectors.length;
      components.push({ score: Math.max(0, Math.min(100, 50 + average * 10)), weight: 15 });
    }
  }
  const flow = breadth?.realFlow;
  if (flow?.moneyFlowAvailable && flow.totalRealBuyValue != null && flow.totalRealSellValue != null) {
    const grossFlow = flow.totalRealBuyValue + flow.totalRealSellValue;
    if (grossFlow > 0) {
      components.push({ score: Math.max(0, Math.min(100, 50 + ((flow.totalRealBuyValue - flow.totalRealSellValue) / grossFlow) * 50)), weight: 20 });
    }
  }
  const weight = components.reduce((sum, item) => sum + item.weight, 0);
  if (!weight) return { value: null, coverage: 0, label: 'داده ناکافی', detail: 'معیار معتبر کافی برای امتیازدهی وجود ندارد' };
  const value = Math.round(components.reduce((sum, item) => sum + item.score * item.weight, 0) / weight);
  return { value, coverage: Math.round(weight), label: value >= 60 ? 'تمایل مثبت' : value <= 40 ? 'تمایل منفی' : 'متعادل', detail: 'امتیاز توصیفی فرمولی؛ پیش‌بینی قطعی نیست' };
}

function buildAlerts(data: MarketRadarSnapshot | null, previous: MarketRadarSnapshot | null) {
  const alerts: Array<{ title: string; detail: string; kind: 'warning' | 'info' }> = [];
  if (!data) return alerts;
  const main = data.indices.find(item => /کل/.test(item.name) && !/هم.?وزن/.test(item.name));
  const equal = data.indices.find(item => /هم.?وزن/.test(item.name));
  if (main?.changePercent != null && equal?.changePercent != null && main.changePercent > 0 && equal.changePercent < 0) {
    alerts.push({ title: 'واگرایی شاخص‌ها', detail: 'شاخص کل مثبت و شاخص هم‌وزن منفی است؛ رشد بازار ممکن است فراگیر نباشد.', kind: 'warning' });
  } else if (main?.changePercent != null && equal?.changePercent != null && main.changePercent < 0 && equal.changePercent > 0) {
    alerts.push({ title: 'واگرایی شاخص‌ها', detail: 'شاخص کل منفی و شاخص هم‌وزن مثبت است؛ رفتار سهام بزرگ با بدنه بازار هم‌جهت نیست.', kind: 'info' });
  }
  const breadth = data.breadth;
  if (breadth?.available && breadth.total > 0) {
    if (breadth.negativePercent >= 70) alerts.push({ title: 'غلبه نمادهای منفی', detail: `${fa(breadth.negativePercent, 1)}٪ از نمادهای طبقه‌بندی‌شده منفی‌اند.`, kind: 'warning' });
    if (breadth.positivePercent >= 70) alerts.push({ title: 'گستردگی مثبت بازار', detail: `${fa(breadth.positivePercent, 1)}٪ از نمادهای طبقه‌بندی‌شده مثبت‌اند.`, kind: 'info' });
  }
  if (breadth?.realFlow?.moneyFlowAvailable && breadth.realFlow.netRealMoneyFlow != null) {
    if (breadth.realFlow.netRealMoneyFlow < 0) alerts.push({ title: 'خروج خالص پول حقیقی', detail: `خالص ارزش خرید و فروش حقیقی ${fa(Math.abs(breadth.realFlow.netRealMoneyFlow))} ریال منفی است.`, kind: 'warning' });
    else if (breadth.realFlow.netRealMoneyFlow > 0) alerts.push({ title: 'ورود خالص پول حقیقی', detail: `خالص ارزش خرید و فروش حقیقی ${fa(breadth.realFlow.netRealMoneyFlow)} ریال مثبت است.`, kind: 'info' });
  }
  if (breadth?.abnormalVolume?.available && breadth.abnormalVolume.count > 0) {
    alerts.push({ title: 'افزایش غیرعادی حجم', detail: `${fa(breadth.abnormalVolume.count)} نماد حجم معاملاتی حداقل ${fa(breadth.abnormalVolume.multiplier)} برابر میانگین ماهانه دارند.`, kind: 'info' });
  }
  if (breadth?.queues?.available && breadth.queues.sell > breadth.queues.buy && breadth.queues.sell > 0) {
    alerts.push({ title: 'غلبه صف‌های فروش', detail: `تعداد صف فروش (${fa(breadth.queues.sell)}) از صف خرید (${fa(breadth.queues.buy)}) بیشتر است.`, kind: 'warning' });
  }
  if (previous?.breadth?.total && breadth?.total) {
    const delta = breadth.positivePercent - previous.breadth.positivePercent;
    if (Math.abs(delta) >= 15) alerts.push({ title: 'تغییر محسوس پهنای بازار', detail: `سهم نمادهای مثبت نسبت به دریافت قبلی ${delta > 0 ? 'افزایش' : 'کاهش'} ${fa(Math.abs(delta), 1)} واحد درصد داشته است.`, kind: delta > 0 ? 'info' : 'warning' });
  }
  return alerts;
}


function calculateMarketStrength(data: MarketRadarSnapshot | null): { label: string; detail: string } {
  const breadth = data?.breadth;
  if (!breadth?.available || breadth.total <= 0) {
    return { label: 'داده ناکافی', detail: 'برای سنجش قدرت حرکت، پهنای معتبر بازار لازم است.' };
  }
  const spread = Math.abs(breadth.positivePercent - breadth.negativePercent);
  if (spread >= 35) return { label: 'قوی', detail: 'فاصله نمادهای مثبت و منفی زیاد است؛ این معیار فقط گستردگی حرکت را توصیف می‌کند.' };
  if (spread >= 15) return { label: 'متوسط', detail: 'برتری نسبی نمادهای مثبت یا منفی متوسط است.' };
  return { label: 'ضعیف', detail: 'برتری نمادهای مثبت و منفی محدود است یا بازار متعادل‌تر است.' };
}

const Metric: React.FC<{ label: string; value: string; sub?: string; change?: number | null }> = ({ label, value, sub, change }) => (
  <article className={card}><div className="text-sm font-bold text-slate-500">{label}</div><div className="mt-2 break-words text-xl sm:text-2xl font-black tabular-nums text-[var(--color-text-primary)]">{value}</div>{sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}{change !== undefined && <div className={`mt-2 text-sm font-black ${tone(change)}`}>{pct(change)}</div>}</article>
);

const MarketIndicesDashboard: React.FC = () => {
  const [data, setData] = useState<MarketRadarSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [selectedSector, setSelectedSector] = useState<MarketRadarSector | null>(null);
  const previousRef = useRef<MarketRadarSnapshot | null>(null);
  const dataRef = useRef<MarketRadarSnapshot | null>(null);
  const [previous, setPrevious] = useState<MarketRadarSnapshot | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const cached = readMarketRadarCache();
      if (!dataRef.current && cached) { dataRef.current = cached.snapshot; setData(cached.snapshot); setStale(!cached.fresh); }
      const snapshot = await getMarketRadarSnapshot();
      if (previousRef.current && previousRef.current.fetchedAt !== snapshot.fetchedAt) {
        setPrevious(previousRef.current);
      }
      previousRef.current = snapshot;
      dataRef.current = snapshot;
      setData(snapshot);
      setStale(isSnapshotStale(snapshot));
      writeMarketRadarCache(snapshot);
    } catch (err) {
      console.error('[MarketIndicesDashboard] refresh failed:', err);
      const cached = readMarketRadarCache();
      if (cached) { dataRef.current = cached.snapshot; setData(cached.snapshot); setStale(true); }
      else if (!dataRef.current) setError('داده معتبر بازار در دسترس نیست. لطفاً بعداً دوباره تلاش کنید.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    let active = true;
    const refreshIfActive = () => { if (active) void refresh(); };
    void refresh();
    const socket = getSocket();
    socket?.on('market-indices:updated', refreshIfActive);
    socket?.on('connect', refreshIfActive);
    const timer = window.setInterval(() => {
      if (active && !socket?.connected) void refresh();
    }, 120_000);
    return () => {
      active = false;
      window.clearInterval(timer);
      socket?.off('market-indices:updated', refreshIfActive);
      socket?.off('connect', refreshIfActive);
    };
  }, [refresh]);

  const score = useMemo(() => calculateScore(data), [data]);
  const marketStrength = useMemo(() => calculateMarketStrength(data), [data]);
  const alerts = useMemo(() => buildAlerts(data, previous), [data, previous]);
  const breadth = data?.breadth ?? null;
  const mainIndex = data?.indices.find(item => /کل/.test(item.name) && !/هم.?وزن/.test(item.name));
  const equalIndex = data?.indices.find(item => /هم.?وزن/.test(item.name));
  const priceIndex = data?.indices.find(item => /شاخص قیمت|price index/i.test(item.name));
  const freeFloatIndex = data?.indices.find(item => /آزاد\s*شناور|free.?float/i.test(item.name));
  const lastUpdated = breadth?.generatedAt ? new Intl.DateTimeFormat('fa-IR', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(breadth.generatedAt)) : 'زمان منبع نامشخص';
  const marketLabel = breadth?.available && breadth.total > 0 ? breadth.positive > breadth.negative ? 'مثبت' : breadth.negative > breadth.positive ? 'منفی' : 'متعادل' : 'نامشخص';

  if (loading && !data) return <section dir="rtl" className={`${card} animate-pulse text-slate-500`}>در حال دریافت داده‌های معتبر بازار…</section>;
  if (error && !data) return <section dir="rtl" className={`${card} text-center`}><p className="text-rose-500">{error}</p><p className="mt-2 text-xs text-slate-500">سامانه به‌صورت خودکار دوباره دیتابیس را بررسی می‌کند؛ درخواست مستقیم به BRS انجام نمی‌شود.</p></section>;

  return <section dir="rtl" className="page-shell space-y-5">
    <header className={`${card} flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between`}>
      <div><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-black text-[var(--color-text-primary)]">شاخص‌های بازار</h1><span className={`rounded-full px-3 py-1 text-xs font-bold ${data?.marketOpen ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-500/10 text-slate-500'}`}>{data?.marketOpen ? 'بازار باز' : 'بازار بسته / خارج از جلسه'}</span><span className={`rounded-full px-3 py-1 text-xs font-bold ${stale ? 'bg-amber-500/10 text-amber-500' : 'bg-sky-500/10 text-sky-500'}`}>{stale ? 'داده ذخیره‌شده یا قدیمی' : 'داده خوانده‌شده از دیتابیس مشترک'}</span></div><p className="mt-2 text-xs text-slate-500">زمان ثبت داده در منبع: {lastUpdated} · خواندن خودکار از دیتابیس هر دو دقیقه · بدون درخواست مستقیم BRS یا اجرای تحلیل سمت سرور</p></div>
    </header>

    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="شاخص کل بورس" value={fa(mainIndex?.value, 2)} change={mainIndex?.changePercent ?? null} sub={mainIndex ? `تغییر: ${fa(mainIndex.changeValue, 2)}` : 'داده معتبر موجود نیست'} />
      <Metric label="شاخص کل هم‌وزن" value={fa(equalIndex?.value, 2)} change={equalIndex?.changePercent ?? null} sub={equalIndex ? `تغییر: ${fa(equalIndex.changeValue, 2)}` : 'داده معتبر موجود نیست'} />
      <Metric label="شاخص قیمت" value={priceIndex?.value == null ? 'در دسترس نیست' : fa(priceIndex.value, 2)} change={priceIndex?.changePercent ?? null} sub={priceIndex ? `تغییر: ${fa(priceIndex.changeValue, 2)}` : 'در پاسخ معتبر منبع موجود نیست'} />
      <Metric label="شاخص آزاد شناور" value={freeFloatIndex?.value == null ? 'در دسترس نیست' : fa(freeFloatIndex.value, 2)} change={freeFloatIndex?.changePercent ?? null} sub={freeFloatIndex ? `تغییر: ${fa(freeFloatIndex.changeValue, 2)}` : 'در پاسخ معتبر منبع موجود نیست'} />
      <Metric label="ارزش کل معاملات" value={data?.totalValue == null ? '—' : fa(data.totalValue)} sub="واحد طبق منبع داده" />
      <Metric label="حجم کل معاملات" value={data?.totalVolume == null ? '—' : fa(data.totalVolume)} />
      <Metric label="تعداد معاملات" value={data?.totalTrades == null ? '—' : fa(data.totalTrades)} />
      <Metric label="ارزش معاملات نسبت به میانگین تاریخی" value={breadth?.marketValueVsAverage?.available && breadth.marketValueVsAverage.changePercent != null ? pct(breadth.marketValueVsAverage.changePercent) : 'در دسترس نیست'} sub={breadth?.marketValueVsAverage?.available ? `میانگین ${fa(breadth.marketValueVsAverage.sampleDays)} روز معاملاتی قبل` : 'به سابقه روزانه معتبر نیاز دارد'} />
      <Metric label="نمادهای مثبت / منفی / خنثی" value={breadth ? `${fa(breadth.positive)} / ${fa(breadth.negative)} / ${fa(breadth.neutral)}` : '—'} sub={breadth ? `پوشش داده: ${fa(breadth.coveragePercent, 1)}٪` : 'آمار در دسترس نیست'} />
      <Metric label="صف خرید" value={breadth?.queues?.available ? fa(breadth.queues.buy) : 'در دسترس نیست'} sub={breadth?.queues?.available ? `از ${fa(breadth.queues.classifiedSymbols)} نماد دارای داده معتبر سفارش` : 'داده کافی برای تشخیص صف وجود ندارد'} />
      <Metric label="صف فروش" value={breadth?.queues?.available ? fa(breadth.queues.sell) : 'در دسترس نیست'} sub={breadth?.queues?.available ? `از ${fa(breadth.queues.classifiedSymbols)} نماد دارای داده معتبر سفارش` : 'داده کافی برای تشخیص صف وجود ندارد'} />
    </div>

    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <article className={`${card} xl:col-span-2`}>
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-black text-[var(--color-text-primary)]">وضعیت کلی بازار رونیا</h2><p className="mt-1 text-xs text-slate-500">{score.detail}</p></div><span className={`rounded-full px-3 py-1 text-sm font-black ${score.value == null ? 'bg-slate-500/10 text-slate-500' : score.value >= 60 ? 'bg-emerald-500/10 text-emerald-500' : score.value <= 40 ? 'bg-rose-500/10 text-rose-500' : 'bg-amber-500/10 text-amber-500'}`}>{score.label}</span></div>
        <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center"><div className="flex h-28 w-28 shrink-0 flex-col items-center justify-center rounded-full border-8 border-sky-500/30"><strong className="text-3xl font-black tabular-nums text-[var(--color-text-primary)]">{score.value == null ? '—' : fa(score.value)}</strong><span className="text-xs text-slate-500">از ۱۰۰</span></div><div className="flex-1"><div className="h-3 overflow-hidden rounded-full bg-slate-500/15"><div className={`h-full rounded-full ${score.value == null ? 'bg-slate-400' : score.value >= 60 ? 'bg-emerald-500' : score.value <= 40 ? 'bg-rose-500' : 'bg-amber-500'}`} style={{ width: `${score.value ?? 0}%` }} /></div><div className="mt-2 flex justify-between text-xs text-slate-500"><span>تمایل منفی</span><span>متعادل</span><span>تمایل مثبت</span></div><p className="mt-3 text-sm text-slate-500">پوشش معیارهای معتبر: {fa(score.coverage)}٪ · وضعیت بر اساس قواعد شفاف و داده‌های موجود محاسبه می‌شود.</p><div className="mt-4 rounded-2xl border border-[var(--color-border)] p-3"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-bold text-[var(--color-text-primary)]">قدرت حرکت بازار</span><span className={`rounded-full px-3 py-1 text-xs font-black ${marketStrength.label === 'قوی' ? 'bg-sky-500/10 text-sky-500' : marketStrength.label === 'متوسط' ? 'bg-amber-500/10 text-amber-500' : 'bg-slate-500/10 text-slate-500'}`}>{marketStrength.label}</span></div><p className="mt-2 text-xs leading-5 text-slate-500">{marketStrength.detail}</p></div></div></div>
      </article>
      <article className={card}><h2 className="text-lg font-black text-[var(--color-text-primary)]">قدرت و گستردگی بازار</h2><div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-emerald-500/10 p-3"><div className="text-sm font-bold text-emerald-600">مثبت</div><div className="mt-1 text-2xl font-black text-emerald-500">{fa(breadth?.positive)}</div><div className="text-xs text-slate-500">{pct(breadth?.positivePercent)}</div></div><div className="rounded-2xl bg-rose-500/10 p-3"><div className="text-sm font-bold text-rose-600">منفی</div><div className="mt-1 text-2xl font-black text-rose-500">{fa(breadth?.negative)}</div><div className="text-xs text-slate-500">{pct(breadth?.negativePercent == null ? null : -breadth.negativePercent)}</div></div></div><div className="mt-4 text-sm text-slate-500">وضعیت پهنا: <b className={tone(breadth ? breadth.positive - breadth.negative : null)}>{marketLabel}</b></div><div className="mt-3 text-xs text-slate-500">نسبت صعود به نزول: {breadth?.advanceDeclineRatio == null ? '—' : fa(breadth.advanceDeclineRatio, 2)} · خالص حجم حقیقی: {breadth?.realFlow?.available && breadth.realFlow.netRealBuyVolume != null ? fa(breadth.realFlow.netRealBuyVolume) + ' سهم' : 'در دسترس نیست'} <span className="block mt-1">خالص ارزش پول و سرانه فقط در صورت وجود مقادیر واقعی BRS محاسبه می‌شوند. حجم غیرعادی با خط مبنای میانگین ماهانه و صف‌ها فقط با قیمت‌های مجاز و دفتر سفارش معتبر تشخیص داده می‌شوند.</span></div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-[var(--color-border)] p-3"><div className="text-xs font-bold text-slate-500">نسبت حجم خرید حقیقی به فروش حقیقی</div><div className="mt-2 text-xl font-black text-[var(--color-text-primary)]">{breadth?.realFlow?.available && breadth.realFlow.totalRealSellVolume != null && breadth.realFlow.totalRealSellVolume > 0 && breadth.realFlow.totalRealBuyVolume != null ? fa(breadth.realFlow.totalRealBuyVolume / breadth.realFlow.totalRealSellVolume, 2) : '—'}</div><p className="mt-1 text-xs text-slate-500">نسبت حجم است؛ برای سرانه واقعی، ارزش معاملات حقیقی بر تعداد خریداران و فروشندگان حقیقی تقسیم می‌شود.</p></div>
        <div className="rounded-2xl border border-[var(--color-border)] p-3"><div className="text-xs font-bold text-slate-500">خالص ورود / خروج پول حقیقی</div><div className={`mt-2 text-xl font-black ${tone(breadth?.realFlow?.netRealMoneyFlow)}`}>{breadth?.realFlow?.moneyFlowAvailable && breadth.realFlow.netRealMoneyFlow != null ? fa(breadth.realFlow.netRealMoneyFlow) + ' ریال' : 'در دسترس نیست'}</div><p className="mt-1 text-xs text-slate-500">{breadth?.realFlow?.moneyFlowAvailable ? `بر پایه داده ارزش خرید و فروش حقیقی از ${fa(breadth.realFlow.moneyFlowRows ?? 0)} نماد` : 'ارزش خرید و فروش حقیقی در Snapshot فعلی کامل نیست.'}</p></div>
        <div className="rounded-2xl border border-[var(--color-border)] p-3"><div className="text-xs font-bold text-slate-500">نمادهای دارای حجم غیرعادی</div><div className="mt-2 text-xl font-black text-[var(--color-text-primary)]">{breadth?.abnormalVolume?.available ? fa(breadth.abnormalVolume.count) : 'در دسترس نیست'}</div><p className="mt-1 text-xs text-slate-500">{breadth?.abnormalVolume?.available ? `حجم امروز حداقل ${fa(breadth.abnormalVolume.multiplier)} برابر میانگین ماهانه BRS؛ فقط نمادهای دارای خط مبنای معتبر` : 'میانگین ماهانه معتبر برای تشخیص در دسترس نیست.'}</p></div>
        <div className="rounded-2xl border border-[var(--color-border)] p-3 sm:col-span-2"><div className="text-xs font-bold text-slate-500">مقایسه خرید و فروش حقیقی و حقوقی</div><div className="mt-3 grid grid-cols-2 gap-3"><div><div className="text-xs font-bold text-sky-500">حقیقی</div><div className="mt-1 text-sm text-[var(--color-text-primary)]">خرید: {breadth?.realFlow?.moneyFlowAvailable && breadth.realFlow.totalRealBuyValue != null ? fa(breadth.realFlow.totalRealBuyValue) + ' ریال' : 'در دسترس نیست'}</div><div className="mt-1 text-sm text-[var(--color-text-primary)]">فروش: {breadth?.realFlow?.moneyFlowAvailable && breadth.realFlow.totalRealSellValue != null ? fa(breadth.realFlow.totalRealSellValue) + ' ریال' : 'در دسترس نیست'}</div><div className={`mt-1 text-sm font-black ${tone(breadth?.realFlow?.netRealMoneyFlow)}`}>خالص: {breadth?.realFlow?.moneyFlowAvailable && breadth.realFlow.netRealMoneyFlow != null ? fa(breadth.realFlow.netRealMoneyFlow) + ' ریال' : 'در دسترس نیست'}</div></div><div><div className="text-xs font-bold text-violet-500">حقوقی</div><div className="mt-1 text-sm text-[var(--color-text-primary)]">خرید: {breadth?.realFlow?.legalFlowAvailable && breadth.realFlow.totalLegalBuyValue != null ? fa(breadth.realFlow.totalLegalBuyValue) + ' ریال' : 'در دسترس نیست'}</div><div className="mt-1 text-sm text-[var(--color-text-primary)]">فروش: {breadth?.realFlow?.legalFlowAvailable && breadth.realFlow.totalLegalSellValue != null ? fa(breadth.realFlow.totalLegalSellValue) + ' ریال' : 'در دسترس نیست'}</div><div className={`mt-1 text-sm font-black ${tone(breadth?.realFlow?.netLegalMoneyFlow)}`}>خالص: {breadth?.realFlow?.legalFlowAvailable && breadth.realFlow.netLegalMoneyFlow != null ? fa(breadth.realFlow.netLegalMoneyFlow) + ' ریال' : 'در دسترس نیست'}</div></div></div><p className="mt-2 text-xs text-slate-500">مقادیر حقوقی فقط از فیلدهای واقعی BRS محاسبه می‌شوند.</p></div>
        <div className="rounded-2xl border border-[var(--color-border)] p-3"><div className="text-xs font-bold text-slate-500">سرانه خرید / فروش حقیقی</div><div className="mt-2 text-xl font-black text-[var(--color-text-primary)]">{breadth?.realFlow?.perCapitaRatio != null ? fa(breadth.realFlow.perCapitaRatio, 2) + ' برابر' : 'در دسترس نیست'}</div><p className="mt-1 text-xs text-slate-500">{breadth?.realFlow?.perCapitaRatio != null ? `سرانه خرید ${fa(breadth.realFlow.averageRealBuyPerBuyer)} ریال؛ سرانه فروش ${fa(breadth.realFlow.averageRealSellPerSeller)} ریال` : 'به داده ارزش و تعداد خریداران/فروشندگان حقیقی نیاز دارد.'}</p></div>
        <div className="rounded-2xl border border-[var(--color-border)] p-3"><div className="text-xs font-bold text-slate-500">مشارکت نمادها در حرکت بازار</div><div className="mt-2 text-xl font-black text-[var(--color-text-primary)]">{breadth?.available && breadth.total > 0 ? fa(breadth.positivePercent, 1) + '٪ مثبت' : '—'}</div><p className="mt-1 text-xs text-slate-500">از {breadth?.available ? fa(breadth.total) : '—'} نماد طبقه‌بندی‌شده؛ پوشش داده {breadth?.available ? fa(breadth.coveragePercent, 1) + '٪' : '—'}.</p></div>
      </div></article>
    </div>

    <article className={card}><div className="mb-4"><h2 className="text-lg font-black text-[var(--color-text-primary)]">هشدارهای تحلیلی</h2><p className="mt-1 text-xs text-slate-500">هشدارها بر اساس قواعد و داده‌های همین دریافت ساخته می‌شوند؛ سیگنال خرید یا فروش نیستند.</p></div>{alerts.length ? <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{alerts.map((alert, index) => <div key={`${alert.title}-${index}`} className={`rounded-2xl border p-4 ${alert.kind === 'warning' ? 'border-amber-500/20 bg-amber-500/5' : 'border-sky-500/20 bg-sky-500/5'}`}><div className={`font-black ${alert.kind === 'warning' ? 'text-amber-500' : 'text-sky-500'}`}>{alert.title}</div><p className="mt-2 text-sm leading-6 text-[var(--color-text-primary)]">{alert.detail}</p></div>)}</div> : <p className="rounded-2xl bg-slate-500/5 p-4 text-sm text-slate-500">در داده‌های فعلی هشدار فعالی شناسایی نشد؛ این به معنی نبود ریسک نیست.</p>}</article>

    <article className={card}><div className="mb-4"><h2 className="text-lg font-black text-[var(--color-text-primary)]">نقشه حرارتی صنایع</h2><p className="mt-1 text-xs text-slate-500">رنگ نشان‌دهنده تغییر گزارش‌شده صنعت است؛ اطلاعات صف و نمادهای تشکیل‌دهنده فقط در صورت وجود در منبع نمایش داده می‌شوند.</p></div><IndustryHeatmap rows={breadth?.sectors.rows ?? []} /><div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">{(breadth?.sectors.rows ?? []).map(sector => <button key={sector.name} onClick={() => setSelectedSector(sector)} className={`rounded-xl border px-3 py-3 text-right transition ${selectedSector?.name === sector.name ? 'border-sky-500 bg-sky-500/10' : 'border-[var(--color-border)] hover:bg-slate-500/5'}`}><span className="font-black text-[var(--color-text-primary)]">{sector.name}</span><span className={`mr-3 font-black ${tone(sector.changePercent)}`}>{pct(sector.changePercent)}</span></button>)}</div>{selectedSector && <div className="mt-4 rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4"><div className="flex items-center justify-between gap-2"><h3 className="font-black text-[var(--color-text-primary)]">{selectedSector.name}</h3><button onClick={() => setSelectedSector(null)} className="rounded-lg px-3 py-1 text-sm text-slate-500 hover:bg-slate-500/10">بستن</button></div><div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4"><Metric label="تعداد نمادهای صنعت" value={fa(selectedSector.symbols)} /><Metric label="مثبت" value={fa(selectedSector.positive)} /><Metric label="منفی" value={fa(selectedSector.negative)} /><Metric label="ارزش معاملات صنعت" value={fa(selectedSector.value)} /><Metric label="خالص پول حقیقی صنعت" value={selectedSector.realMoneyFlow == null ? 'در دسترس نیست' : fa(selectedSector.realMoneyFlow) + ' ریال'} /></div><p className="mt-3 text-xs text-slate-500">فهرست نمادهای عضو هر صنعت در قرارداد API فعلی ارائه نشده است؛ ازاین‌رو فقط آمار واقعی صنعت نمایش داده می‌شود.</p></div>}</article>

    <MarketRadarHistoryChart />
  </section>;
};

export default MarketIndicesDashboard;
