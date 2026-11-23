import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './MarketIndicesDashboard.motion.css';
import { getMarketRadarSnapshot, getMarketRadarSymbols, readMarketRadarCache, writeMarketRadarCache } from '../services/marketRadarService';
import { getSocket } from '../services/socketService';
import type { MarketRadarSnapshot, MarketRadarSymbol } from '../types/marketRadar';
import IndustryHeatmap from './MarketRadar/IndustryHeatmap';
import MarketRadarHistoryChart from './MarketRadar/MarketRadarHistory';

const fa = (value: number | null | undefined, digits = 0) => value == null || !Number.isFinite(value) ? '—' : new Intl.NumberFormat('fa-IR', { maximumFractionDigits: digits }).format(value);
const pct = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? '—' : `${value > 0 ? '+' : value < 0 ? '−' : ''}${fa(Math.abs(value), 2)}٪`;
const tone = (value: number | null | undefined) => value == null ? 'text-slate-500' : value > 0 ? 'text-emerald-500 dark:text-emerald-300' : value < 0 ? 'text-rose-500 dark:text-rose-300' : 'text-slate-500';
const card = 'market-indices-motion-card rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-5';
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
  <article className={`${card} mi-metric-card`}>
    <div className="mi-metric-label text-sm font-bold text-slate-500">{label}</div>
    <div className="mi-metric-value mt-2 break-words text-xl sm:text-2xl font-black tabular-nums text-[var(--color-text-primary)]">
      <span key={value} className="mi-value-transition">{value}</span>
    </div>
    {sub && <div className="mi-metric-sub mt-1 text-xs text-slate-500">{sub}</div>}
    {change !== undefined && <div className={`mi-metric-change mt-2 text-sm font-black ${tone(change)}`}>{pct(change)}</div>}
  </article>
);

const MarketIndicesDashboard: React.FC = () => {
  const [data, setData] = useState<MarketRadarSnapshot | null>(() => readMarketRadarCache()?.snapshot ?? null);
  const [loading, setLoading] = useState(() => !readMarketRadarCache());
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(() => { const cached = readMarketRadarCache(); return cached ? !cached.fresh : false; });
  const [industrySymbols, setIndustrySymbols] = useState<MarketRadarSymbol[]>([]);
  const [industrySymbolsLoading, setIndustrySymbolsLoading] = useState(true);
  const [industrySymbolsAvailable, setIndustrySymbolsAvailable] = useState(false);
  const previousRef = useRef<MarketRadarSnapshot | null>(null);
  const dataRef = useRef<MarketRadarSnapshot | null>(readMarketRadarCache()?.snapshot ?? null);
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

  const refreshIndustrySymbols = useCallback(async () => {
    try {
      const snapshotSymbols = await getMarketRadarSymbols();
      setIndustrySymbols(snapshotSymbols);
      setIndustrySymbolsAvailable(true);
    } catch (err) {
      console.error('[MarketIndicesDashboard] industry symbol snapshot refresh failed:', err);
    } finally {
      setIndustrySymbolsLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const refreshIfActive = () => {
      if (active) {
        void refresh();
        void refreshIndustrySymbols();
      }
    };
    void refresh();
    void refreshIndustrySymbols();
    const socket = getSocket();
    socket?.on('market-indices:updated', refreshIfActive);
    socket?.on('market-snapshot:updated', refreshIfActive);
    socket?.on('connect', refreshIfActive);
    const timer = window.setInterval(() => {
      if (active && !socket?.connected) { void refresh(); void refreshIndustrySymbols(); }
    }, 120_000);
    return () => {
      active = false;
      window.clearInterval(timer);
      socket?.off('market-indices:updated', refreshIfActive);
      socket?.off('market-snapshot:updated', refreshIfActive);
      socket?.off('connect', refreshIfActive);
    };
  }, [refresh, refreshIndustrySymbols]);

  const score = useMemo(() => calculateScore(data), [data]);
  const marketStrength = useMemo(() => calculateMarketStrength(data), [data]);
  const alerts = useMemo(() => buildAlerts(data, previous), [data, previous]);
  const breadth = data?.breadth ?? null;
  const mainIndex = data?.indices.find(item => /کل/.test(item.name) && !/هم.?وزن/.test(item.name));
  const equalIndex = data?.indices.find(item => /هم.?وزن/.test(item.name));
  const priceIndex = data?.indices.find(item => /شاخص قیمت|price index/i.test(item.name));
  const freeFloatIndex = data?.indices.find(item => /آزاد\s*شناور|free.?float/i.test(item.name));
  const lastUpdated = breadth?.generatedAt ? new Intl.DateTimeFormat('fa-IR', { timeZone: 'Asia/Tehran', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(breadth.generatedAt)) : 'زمان ثبت در منبع نامشخص';
  const marketLabel = breadth?.available && breadth.total > 0 ? breadth.positive > breadth.negative ? 'مثبت' : breadth.negative > breadth.positive ? 'منفی' : 'متعادل' : 'نامشخص';

  if (loading && !data) return <section dir="rtl" className={`${card} animate-pulse text-slate-500`}>در حال دریافت داده‌های معتبر بازار…</section>;
  if (error && !data) return <section dir="rtl" className={`${card} text-center`}><p className="text-rose-500">{error}</p></section>;

  return <section dir="rtl" className="page-shell market-indices-motion mi-reference-dashboard">
    <div className="mi-status-strip"><span className={data?.marketOpen ? "mi-status-open" : "mi-status-closed"}>{data?.marketOpen ? "بازار باز" : "بازار بسته"}</span><span>{stale ? "داده ذخیره‌شده / قدیمی" : "داده دریافت‌شده از منبع رونیا"}</span><span>آخرین دریافت: {lastUpdated}</span></div>
    <div className="mi-summary-strip">
      <article className="mi-hero-card mi-hero-index"><div className="mi-hero-top"><span>شاخص کل بورس</span><span>▥</span></div><strong>{fa(mainIndex?.value, 2)}</strong><div className="mi-hero-change">{pct(mainIndex?.changePercent)} {mainIndex?.changePercent != null && mainIndex.changePercent >= 0 ? "▲" : "▼"}</div><svg className="mi-mini-chart" viewBox="0 0 120 34" aria-hidden="true"><path d="M2 29 L14 25 L24 28 L36 17 L47 21 L58 13 L68 17 L80 8 L91 14 L102 5 L118 2" /></svg></article>
      <article className="mi-hero-card mi-hero-volume"><div className="mi-hero-top"><span>حجم معاملات</span><span>◔</span></div><strong>{data?.totalVolume == null ? "—" : fa(data.totalVolume)}</strong><div className="mi-hero-change">حجم کل معاملات بازار</div><svg className="mi-mini-chart" viewBox="0 0 120 34" aria-hidden="true"><path d="M2 30 L12 22 L22 27 L32 15 L42 19 L52 8 L62 24 L72 18 L82 25 L92 12 L102 16 L118 3" /></svg></article>
      <article className="mi-hero-card mi-hero-value"><div className="mi-hero-top"><span>ارزش معاملات</span><span>▤</span></div><strong>{data?.totalValue == null ? "—" : fa(data.totalValue)}</strong><div className="mi-hero-change">طبق واحد ثبت‌شده در منبع</div><svg className="mi-mini-chart" viewBox="0 0 120 34" aria-hidden="true"><path d="M2 28 L12 25 L22 14 L32 20 L42 11 L52 18 L62 5 L72 12 L82 7 L92 17 L102 9 L118 2" /></svg></article>
      <article className="mi-hero-card mi-hero-positive"><div className="mi-hero-top"><span>تعداد نمادهای مثبت</span><span>⚖</span></div><strong>{breadth ? fa(breadth.positive) : "—"}</strong><div className="mi-hero-change">{pct(breadth?.positivePercent)} <span>▲</span></div><svg className="mi-mini-chart" viewBox="0 0 120 34" aria-hidden="true"><path d="M2 7 L12 12 L22 8 L32 18 L42 15 L52 22 L62 16 L72 25 L82 19 L92 29 L102 23 L118 31" /></svg></article>
      <article className="mi-hero-card mi-hero-negative"><div className="mi-hero-top"><span>تعداد نمادهای منفی</span><span>⚖</span></div><strong>{breadth ? fa(breadth.negative) : "—"}</strong><div className="mi-hero-change">{pct(breadth?.negativePercent == null ? null : -breadth.negativePercent)} <span>▼</span></div><svg className="mi-mini-chart" viewBox="0 0 120 34" aria-hidden="true"><path d="M2 4 L12 12 L22 8 L32 15 L42 11 L52 19 L62 14 L72 22 L82 18 L92 28 L102 24 L118 32" /></svg></article>
    </div>
    <div className="mi-dashboard-main">
      <article className="mi-index-list"><h2>شاخص‌های اصلی</h2>
        {[mainIndex,equalIndex,priceIndex,freeFloatIndex].filter(Boolean).map((item,index)=><div className={"mi-index-row " + (index===0 ? "mi-index-row-primary" : "")} key={item!.name}>
          <div className="mi-index-row-title">{item!.name}</div><strong>{fa(item!.value,2)}</strong><span className={tone(item!.changePercent)}>{pct(item!.changePercent)} {item!.changePercent!=null&&item!.changePercent>=0?"▲":"▼"}</span>
          <svg viewBox="0 0 100 25" className={"mi-index-spark " + (item!.changePercent!=null&&item!.changePercent<0?"is-negative":"")} aria-hidden="true"><path d={index%2?"M1 20 L12 12 L22 17 L34 7 L44 13 L56 5 L67 15 L78 8 L99 3":"M1 21 L12 16 L23 19 L34 10 L45 14 L56 6 L67 11 L78 5 L99 2"} /></svg>
        </div>)}
        <div className="mi-index-foot"><span>تعداد معاملات</span><b>{data?.totalTrades==null?"—":fa(data.totalTrades)}</b><span>صف خرید / فروش</span><b>{breadth?.queues?.available?fa(breadth.queues.buy)+" / "+fa(breadth.queues.sell):"—"}</b></div>
      </article>
      <article className="mi-market-score"><h2>وضعیت کلی بازار</h2><p className="mi-score-caption">{score.detail}</p>
        <svg className="mi-score-gauge" viewBox="0 0 220 150" role="img" aria-label={"امتیاز بازار " + (score.value==null?"نامشخص":score.value) + " از 100"}><path d="M20 130 A90 90 0 0 1 200 130" pathLength="100" className="mi-gauge-track"/><path d="M20 130 A90 90 0 0 1 200 130" pathLength="100" strokeDasharray={(score.value??0)+" 100"} className="mi-gauge-value"/><text x="110" y="105" textAnchor="middle" className="mi-gauge-symbol">♉</text></svg>
        <strong className={"mi-score-number "+(score.value==null?"":score.value>=60?"is-positive":score.value<=40?"is-negative":"is-neutral")}>{score.value==null?"—":fa(score.value)+"٪"}</strong><span className="mi-score-label">{score.value==null?"داده ناکافی":score.label}</span>
        <div className="mi-score-legend"><span className="is-positive">● {breadth?fa(breadth.positivePercent,1)+"٪":"—"} نماد مثبت</span><span className="is-negative">● {breadth?fa(breadth.negativePercent,1)+"٪":"—"} نماد منفی</span></div><small>امتیاز توصیفی؛ پیش‌بینی قطعی نیست.</small>
      </article>
      <article className="mi-history-main"><MarketRadarHistoryChart /></article>
    </div>
    <div className="mi-bottom-grid">
      <article className="mi-movers-panel"><h2>بیشترین و کمترین تأثیر</h2><div className="mi-movers-columns">
        <div className="mi-movers-positive"><h3>بیشترین رشد</h3>{(breadth?.topGainers??[]).slice(0,3).map((item,i)=><div className="mi-mover" key={item.symbol+"-"+i}><b>{item.symbol}</b><strong>{pct(item.changePercent)}</strong></div>)}</div>
        <div className="mi-movers-negative"><h3>بیشترین افت</h3>{(breadth?.topLosers??[]).slice(0,3).map((item,i)=><div className="mi-mover" key={item.symbol+"-"+i}><b>{item.symbol}</b><strong>{pct(item.changePercent)}</strong></div>)}</div>
      </div></article>
      <article className="mi-flow-card"><h2>ورود و خروج پول حقیقی</h2><div className={"mi-flow-net "+tone(breadth?.realFlow?.netRealMoneyFlow)}>{breadth?.realFlow?.moneyFlowAvailable&&breadth.realFlow.netRealMoneyFlow!=null?(breadth.realFlow.netRealMoneyFlow>=0?"+":"−")+fa(Math.abs(breadth.realFlow.netRealMoneyFlow))+" ریال":"داده معتبر پول حقیقی موجود نیست"}</div>
        {breadth?.realFlow?.moneyFlowAvailable&&breadth.realFlow.totalRealBuyValue!=null&&breadth.realFlow.totalRealSellValue!=null?<div className="mi-flow-bars">
          <div className="mi-flow-bar-row"><span>خرید حقیقی</span><b>{fa(breadth.realFlow.totalRealBuyValue)}</b><div className="mi-flow-track"><i className="mi-flow-buy" style={{width:(breadth.realFlow.totalRealBuyValue/(breadth.realFlow.totalRealBuyValue+breadth.realFlow.totalRealSellValue||1)*100)+"%"}}/></div></div>
          <div className="mi-flow-bar-row"><span>فروش حقیقی</span><b>{fa(breadth.realFlow.totalRealSellValue)}</b><div className="mi-flow-track"><i className="mi-flow-sell" style={{width:(breadth.realFlow.totalRealSellValue/(breadth.realFlow.totalRealBuyValue+breadth.realFlow.totalRealSellValue||1)*100)+"%"}}/></div></div>
        </div>:<p className="mi-no-data">اطلاعات ارزش خرید و فروش حقیقی در این Snapshot موجود نیست.</p>}
      </article>
      <article className="mi-heatmap-panel"><h2>نقشه حرارتی صنایع</h2><IndustryHeatmap rows={breadth?.sectors.rows??[]} symbols={industrySymbols} symbolsLoading={industrySymbolsLoading} symbolsAvailable={industrySymbolsAvailable}/></article>
    </div>
    <footer className="mi-news-ticker"><strong>آخرین وضعیت بازار</strong><span>{alerts[0]?.detail??(mainIndex?.changePercent!=null?"تغییر شاخص کل: "+pct(mainIndex.changePercent):"داده تحلیلی بازار در دسترس نیست")}</span><span className="mi-ticker-divider"/><span>خالص پول حقیقی: {breadth?.realFlow?.moneyFlowAvailable&&breadth.realFlow.netRealMoneyFlow!=null?fa(breadth.realFlow.netRealMoneyFlow)+" ریال":"—"}</span><span>قدرت حرکت: {marketStrength.label}</span></footer>
  </section>;
};

export default MarketIndicesDashboard;
