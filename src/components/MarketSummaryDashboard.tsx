import React, { useEffect, useMemo, useState } from 'react';
import { getLatestSummary } from '../services/marketSummaryService';

export interface MarketSummaryDashboardProps {
  intelligence?: any;
  content?: string | null;
  loading?: boolean;
}

const n = (v: any) => v === null || v === undefined || v === '' ? '—' : typeof v === 'number' ? new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 2 }).format(v) : String(v);
const pct = (v: any) => v === null || v === undefined || v === '' ? '—' : `${n(v)}٪`;
const stateFa = (v: any) => ({ bullish: 'صعودی', bullish_cautious: 'صعودی محتاطانه', neutral: 'خنثی', bearish_cautious: 'نزولی محتاطانه', bearish: 'نزولی', low: 'کم', medium: 'متوسط', high: 'زیاد' } as any)[v] ?? v ?? '—';
const safeArray = (v: any) => Array.isArray(v) ? v : [];

const Metric = ({ title, value, sub }: { title: string; value: any; sub?: any }) => (
  <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
    <div className="text-xs text-slate-400 mb-2">{title}</div>
    <div className="text-xl font-bold text-white">{value}</div>
    {sub !== undefined && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
  </div>
);

const Bar = ({ label, value }: { label: string; value: number }) => (
  <div className="space-y-1">
    <div className="flex justify-between text-xs"><span className="text-slate-400">{label}</span><span className="text-slate-200">{n(value)}</span></div>
    <div className="h-2 rounded-full bg-white/10 overflow-hidden"><div className="h-full rounded-full bg-current text-sky-400" style={{ width: `${Math.max(0, Math.min(100, Number(value) || 0))}%` }} /></div>
  </div>
);

const Section = ({ number, title, children }: { number: number; title: string; children: React.ReactNode }) => (
  <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
    <div className="flex items-center gap-3 mb-4">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-500/15 text-xs font-bold text-sky-300">{number}</span>
      <h3 className="font-bold text-white">{title}</h3>
    </div>
    {children}
  </section>
);

export default function MarketSummaryDashboard({ intelligence: suppliedIntelligence, content, loading }: MarketSummaryDashboardProps) {
  const [fetchedIntelligence, setFetchedIntelligence] = useState<any>(null);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (suppliedIntelligence || loading) return;
    let active = true;
    setFetching(true);
    getLatestSummary().then((summary: any) => {
      if (active) setFetchedIntelligence(summary?.marketIntelligence ?? null);
    }).catch(() => {
      if (active) setFetchedIntelligence(null);
    }).finally(() => {
      if (active) setFetching(false);
    });
    return () => { active = false; };
  }, [suppliedIntelligence, loading]);

  const intelligence = suppliedIntelligence ?? fetchedIntelligence;

  if (loading || fetching) return <div dir="rtl" className="rounded-3xl border border-white/10 bg-slate-950/50 p-8 text-center text-slate-400">در حال آماده‌سازی تحلیل جامع بازار…</div>;
  if (!intelligence) return <div dir="rtl" className="rounded-3xl border border-white/10 bg-slate-950/50 p-8"><div className="text-lg font-bold text-white mb-2">خلاصه بازار</div><div className="whitespace-pre-wrap leading-8 text-slate-300">{content || 'تحلیل بازار در دسترس نیست.'}</div></div>;

  const r = intelligence.regime || {};
  const c = r.components || {};
  const b = intelligence.breadth || {};
  const l = intelligence.liquidity || {};
  const f = intelligence.moneyFlow || {};
  const m = intelligence.momentum || {};
  const risk = intelligence.risk || {};
  const idx = intelligence.indexes || {};
  const action = intelligence.action || {};
  const sectors = intelligence.sectors || {};
  const dataQuality = intelligence.dataQuality || intelligence.data_quality || {};
  const leaders = intelligence.leaders || {};
  const divergences = safeArray(intelligence.divergences);
  const scenarios = safeArray(intelligence.scenarios);

  const breadthTotal = Number(b.total ?? b.positive ?? 0) + Number(b.negative ?? 0) + Number(b.neutral ?? 0);
  const positivePct = b.positivePercent ?? (breadthTotal ? Number(b.positive) / breadthTotal * 100 : null);
  const negativePct = b.negativePercent ?? (breadthTotal ? Number(b.negative) / breadthTotal * 100 : null);
  const neutralPct = b.neutralPercent ?? (breadthTotal ? Number(b.neutral) / breadthTotal * 100 : null);

  const qualityLabel = dataQuality.label || dataQuality.interpretation || dataQuality.status || (b.coveragePercent != null ? `پوشش ${n(b.coveragePercent)}٪` : 'اطلاعات کیفیت داده در دسترس نیست');
  const confirmations = safeArray(action.confirmation || intelligence.confirmation);
  const invalidations = safeArray(action.invalidation || intelligence.invalidation);

  return <div dir="rtl" className="space-y-4 text-right">
    <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 p-5 shadow-xl">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
        <div><div className="text-xs text-slate-400 mb-2">۱. رژیم و وضعیت کلی بازار</div><div className="text-2xl font-black text-white">{r.label || stateFa(r.state) || 'نامشخص'}</div><p className="mt-2 max-w-3xl text-sm leading-7 text-slate-300">{intelligence.headline || 'تحلیل جامع بازار بر اساس داده‌های موجود.'}</p></div>
        <div className="shrink-0 text-center"><div className="text-5xl font-black text-white">{n(r.score ?? intelligence.score)}</div><div className="text-xs text-slate-500 mt-1">۲. امتیاز بازار از ۱۰۰</div></div>
      </div>
    </section>

    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Metric title="۳. شاخص کل" value={n(idx.overall?.value)} sub={pct(idx.overall?.changePercent)} />
      <Metric title="۴. شاخص هم‌وزن" value={n(idx.equalWeight?.value)} sub={pct(idx.equalWeight?.changePercent)} />
      <Metric title="۶. نسبت مثبت/منفی" value={b.advanceDeclineRatio == null ? '—' : `${n(b.advanceDeclineRatio)}x`} sub={`Breadth Score: ${n(b.score)}`} />
      <Metric title="۱۰. ریسک بازار" value={risk.label || stateFa(risk.state)} sub={risk.volatility != null ? `نوسان: ${n(risk.volatility)}` : undefined} />
    </div>

    <Section number={5} title="پهنای بازار — مثبت / منفی / خنثی">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Metric title="نمادهای مثبت" value={n(b.positive)} sub={pct(positivePct)} />
        <Metric title="نمادهای منفی" value={n(b.negative)} sub={pct(negativePct)} />
        <Metric title="نمادهای خنثی" value={n(b.neutral)} sub={pct(neutralPct)} />
        <Metric title="بدون داده" value={n(b.unknown)} sub={b.coveragePercent != null ? `پوشش: ${pct(b.coveragePercent)}` : undefined} />
      </div>
      <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/10 flex">
        <div className="h-full bg-emerald-400/80" style={{ width: `${Math.max(0, Math.min(100, Number(positivePct) || 0))}%` }} />
        <div className="h-full bg-rose-400/80" style={{ width: `${Math.max(0, Math.min(100, Number(negativePct) || 0))}%` }} />
        <div className="h-full bg-slate-400/60" style={{ width: `${Math.max(0, Math.min(100, Number(neutralPct) || 0))}%` }} />
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-400"><span>مجموع طبقه‌بندی‌شده: {n(b.classifiedTotal ?? breadthTotal)}</span><span>تفسیر: {b.interpretation || '—'}</span></div>
    </Section>

    <div className="grid lg:grid-cols-2 gap-4">
      <Section number={7} title="ارزش، حجم و تعداد معاملات">
        <div className="grid grid-cols-2 gap-3"><Metric title="ارزش معاملات" value={l.value == null ? '—' : n(l.value)} sub={pct(l.valueVsPreviousPct)} /><Metric title="حجم معاملات" value={l.volume == null ? '—' : n(l.volume)} sub={pct(l.volumeVsPreviousPct)} /><Metric title="تعداد معاملات" value={n(intelligence.tradeCount ?? intelligence.totalTrades)} /><Metric title="نقدشوندگی" value={l.label || l.interpretation || '—'} /></div>
      </Section>
      <Section number={8} title="جریان پول حقیقی">
        <div className="grid grid-cols-2 gap-3"><Metric title="جریان خالص" value={f.net == null ? '—' : n(f.net)} sub={f.interpretation} /><Metric title="شدت جریان" value={f.intensity == null ? '—' : n(f.intensity)} /><Metric title="وضعیت" value={f.label || stateFa(f.state)} /><Metric title="کیفیت" value={f.quality || '—'} /></div>
      </Section>
    </div>

    <div className="grid lg:grid-cols-2 gap-4">
      <Section number={9} title="مومنتوم کوتاه‌مدت و میان‌مدت">
        <div className="grid grid-cols-2 gap-3"><Metric title="۵ روزه" value={pct(m.fiveDayChangePct)} sub={stateFa(m.state)} /><Metric title="۲۰ روزه" value={pct(m.twentyDayChangePct)} /><Metric title="قدرت" value={n(m.score)} /><Metric title="تفسیر" value={m.interpretation || '—'} /></div>
      </Section>
      <Section number={11} title="ریسک و نوسان">
        <div className="grid grid-cols-2 gap-3"><Metric title="سطح ریسک" value={risk.label || stateFa(risk.state)} /><Metric title="نوسان" value={n(risk.volatility)} /><Metric title="روند ریسک" value={risk.trend || '—'} /><Metric title="هشدار" value={risk.warning || '—'} /></div>
      </Section>
    </div>

    <Section number={12} title="چرخش صنایع و رهبری بازار">
      {sectors.available === false ? <div className="text-sm text-slate-500">داده صنایع در این snapshot موجود نیست.</div> : <div className="grid md:grid-cols-2 gap-5"><div><div className="text-xs text-slate-500 mb-2">قوی‌ترین صنایع</div>{safeArray(sectors.leaders).map((x:any,i:number)=><div key={i} className="flex justify-between border-b border-white/5 py-2 text-sm"><span className="text-slate-300">{x.name || x.title || '—'}</span><span className="text-slate-200">{pct(x.changePercent)}</span></div>)}</div><div><div className="text-xs text-slate-500 mb-2">ضعیف‌ترین صنایع</div>{safeArray(sectors.laggards).map((x:any,i:number)=><div key={i} className="flex justify-between border-b border-white/5 py-2 text-sm"><span className="text-slate-300">{x.name || x.title || '—'}</span><span className="text-slate-200">{pct(x.changePercent)}</span></div>)}</div></div>}
    </Section>

    <div className="grid lg:grid-cols-2 gap-4">
      <Section number={13} title="لیدرها، واگرایی‌ها و هشدارها">
        {safeArray(leaders.top || leaders.gainers || leaders.items).length ? <div className="space-y-2 mb-4">{safeArray(leaders.top || leaders.gainers || leaders.items).slice(0,6).map((x:any,i:number)=><div key={i} className="flex justify-between rounded-xl bg-white/[0.025] p-2 text-sm"><span className="text-slate-300">{x.name || x.symbol || '—'}</span><span className="text-slate-200">{pct(x.changePercent)}</span></div>)}</div> : null}
        {divergences.length ? <div className="space-y-2">{divergences.map((x:any,i:number)=><div key={i} className="rounded-xl bg-amber-500/10 border border-amber-400/10 p-3 text-sm leading-6 text-slate-300">{x.text || x.message || String(x)}</div>)}</div> : <div className="text-sm text-slate-500">واگرایی معناداری شناسایی نشد.</div>}
      </Section>
      <Section number={14} title="سناریوها، Bias و شروط تصمیم">
        <div className="space-y-3">{scenarios.slice(0,4).map((x:any,i:number)=><div key={i}><div className="flex justify-between text-sm"><b className="text-slate-200">{x.title || `سناریو ${i+1}`}</b><span className="text-slate-500">{x.probability ?? '—'}</span></div><p className="text-xs leading-6 text-slate-400 mt-1">{x.text || x.description || '—'}</p></div>)}</div>
        <div className="mt-4 grid grid-cols-2 gap-3"><Metric title="سوگیری معاملاتی" value={action.bias || '—'} /><Metric title="ریسک تصمیم" value={action.risk || '—'} /></div>
        {confirmations.length ? <div className="mt-4"><div className="text-xs text-slate-500 mb-2">شروط تأیید</div><ul className="list-disc pr-5 text-slate-300 space-y-1 text-sm">{confirmations.map((x:any,i:number)=><li key={i}>{String(x)}</li>)}</ul></div> : null}
        {invalidations.length ? <div className="mt-4"><div className="text-xs text-slate-500 mb-2">شروط ابطال</div><ul className="list-disc pr-5 text-slate-300 space-y-1 text-sm">{invalidations.map((x:any,i:number)=><li key={i}>{String(x)}</li>)}</ul></div> : null}
      </Section>
    </div>

    <Section number={14} title="کیفیت داده و محدودیت تحلیل">
      <div className="grid md:grid-cols-3 gap-3"><Metric title="وضعیت کیفیت" value={qualityLabel} /><Metric title="پوشش Breadth" value={b.coveragePercent == null ? '—' : pct(b.coveragePercent)} /><Metric title="منبع" value={dataQuality.source || intelligence.source || '—'} /></div>
      {dataQuality.warnings?.length ? <ul className="mt-3 list-disc pr-5 text-sm text-amber-200/80 space-y-1">{safeArray(dataQuality.warnings).map((x:any,i:number)=><li key={i}>{String(x)}</li>)}</ul> : null}
    </Section>

    {content ? <details className="rounded-2xl border border-white/10 bg-white/[0.025] p-5"><summary className="cursor-pointer font-bold text-white">مشاهده گزارش متنی کامل ۱۴بخشی</summary><div className="mt-4 whitespace-pre-wrap leading-8 text-sm text-slate-300">{content}</div></details> : null}
  </div>;
}
