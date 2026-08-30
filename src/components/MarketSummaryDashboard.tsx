import React from 'react';

export interface MarketSummaryDashboardProps { intelligence?: any; content?: string | null; loading?: boolean; }

const n=(v:any)=>v===null||v===undefined?'—':typeof v==='number'?new Intl.NumberFormat('fa-IR',{maximumFractionDigits:2}).format(v):String(v);
const pct=(v:any)=>v===null||v===undefined?'—':`${n(v)}٪`;
const stateFa=(v:any)=>({bullish:'صعودی',bullish_cautious:'صعودی محتاطانه',neutral:'خنثی',bearish_cautious:'نزولی محتاطانه',bearish:'نزولی',low:'کم',medium:'متوسط',high:'زیاد'})[v]??v??'—';

const Metric=({title,value,sub}:{title:string;value:any;sub?:any})=><div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><div className="text-xs text-slate-400 mb-2">{title}</div><div className="text-xl font-bold text-white">{value}</div>{sub!==undefined&&<div className="mt-1 text-xs text-slate-500">{sub}</div>}</div>;
const Bar=({label,value}:{label:string;value:number})=><div className="space-y-1"><div className="flex justify-between text-xs"><span className="text-slate-400">{label}</span><span className="text-slate-200">{n(value)}</span></div><div className="h-2 rounded-full bg-white/10 overflow-hidden"><div className="h-full rounded-full bg-current text-sky-400" style={{width:`${Math.max(0,Math.min(100,value))}%`}} /></div></div>;

export default function MarketSummaryDashboard({intelligence,content,loading}:MarketSummaryDashboardProps){
 if(loading)return <div className="rounded-3xl border border-white/10 bg-slate-950/50 p-8 text-center text-slate-400">در حال آماده‌سازی تحلیل جامع بازار…</div>;
 if(!intelligence)return <div className="rounded-3xl border border-white/10 bg-slate-950/50 p-8"><div className="text-lg font-bold text-white mb-2">خلاصه بازار</div><div className="whitespace-pre-wrap leading-8 text-slate-300">{content||'تحلیل بازار در دسترس نیست.'}</div></div>;
 const r=intelligence.regime||{}, c=r.components||{}, b=intelligence.breadth||{}, l=intelligence.liquidity||{}, f=intelligence.moneyFlow||{}, m=intelligence.momentum||{}, risk=intelligence.risk||{}, idx=intelligence.indexes||{};
 return <div dir="rtl" className="space-y-4 text-right">
   <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 p-5 shadow-xl">
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
      <div><div className="text-xs text-slate-400 mb-2">رژیم فعلی بازار</div><div className="text-2xl font-black text-white">{r.label||'نامشخص'}</div><p className="mt-2 max-w-3xl text-sm leading-7 text-slate-300">{intelligence.headline}</p></div>
      <div className="shrink-0 text-center"><div className="text-5xl font-black text-white">{n(r.score)}</div><div className="text-xs text-slate-500 mt-1">امتیاز بازار از ۱۰۰</div></div>
    </div>
   </section>
   <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
    <Metric title="شاخص کل" value={n(idx.overall?.value)} sub={pct(idx.overall?.changePercent)}/><Metric title="شاخص هم‌وزن" value={n(idx.equalWeight?.value)} sub={pct(idx.equalWeight?.changePercent)}/><Metric title="عرض بازار" value={b.interpretation||'—'} sub={`${n(b.positive)} مثبت / ${n(b.negative)} منفی`}/><Metric title="ریسک بازار" value={risk.label||stateFa(risk.state)} sub={risk.volatility!=null?`نوسان: ${n(risk.volatility)}`:undefined}/>
   </section>
   <section className="grid lg:grid-cols-2 gap-4">
    <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 space-y-4"><h3 className="font-bold text-white">ترکیب امتیاز بازار</h3><Bar label="روند" value={c.trend??50}/><Bar label="عرض بازار" value={c.breadth??50}/><Bar label="نقدشوندگی" value={c.liquidity??50}/><Bar label="جریان پول" value={c.moneyFlow??50}/><Bar label="مومنتوم" value={c.momentum??50}/></div>
    <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5"><h3 className="font-bold text-white mb-4">نقدینگی و جریان پول</h3><div className="grid grid-cols-2 gap-3"><Metric title="ارزش معاملات" value={l.value==null?'—':n(l.value)} sub={pct(l.valueVsPreviousPct)}/><Metric title="حجم معاملات" value={l.volume==null?'—':n(l.volume)} sub={pct(l.volumeVsPreviousPct)}/><Metric title="جریان خالص پول حقیقی" value={f.net==null?'—':n(f.net)} sub={f.interpretation}/><Metric title="مومنتوم ۵ روزه" value={pct(m.fiveDayChangePct)} sub={stateFa(m.state)}/></div></div>
   </section>
   <section className="grid lg:grid-cols-3 gap-4">
    <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5"><h3 className="font-bold text-white mb-3">هشدارها و واگرایی‌ها</h3>{intelligence.divergences?.length?<div className="space-y-2">{intelligence.divergences.map((x:any,i:number)=><div key={i} className="rounded-xl bg-amber-500/10 border border-amber-400/10 p-3 text-sm leading-6 text-slate-300">{x.text}</div>)}</div>:<div className="text-sm text-slate-500">واگرایی معناداری شناسایی نشد.</div>}</div>
    <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5"><h3 className="font-bold text-white mb-3">سناریوهای بازار</h3><div className="space-y-3">{(intelligence.scenarios||[]).map((x:any,i:number)=><div key={i}><div className="flex justify-between text-sm"><b className="text-slate-200">{x.title}</b><span className="text-slate-500">{x.probability}</span></div><p className="text-xs leading-6 text-slate-400 mt-1">{x.text}</p></div>)}</div></div>
    <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5"><h3 className="font-bold text-white mb-3">جمع‌بندی معاملاتی</h3><div className="space-y-3 text-sm"><div className="flex justify-between"><span className="text-slate-500">سوگیری</span><b className="text-white">{intelligence.action?.bias||'—'}</b></div><div className="flex justify-between"><span className="text-slate-500">ریسک</span><b className="text-white">{intelligence.action?.risk||'—'}</b></div><div><div className="text-slate-500 mb-1">مناسب برای</div><div className="text-slate-200 leading-6">{intelligence.action?.suitableFor||'—'}</div></div>{intelligence.action?.confirmation?.length?<div><div className="text-slate-500 mb-1">شرایط تأیید</div><ul className="list-disc pr-5 text-slate-300 space-y-1">{intelligence.action.confirmation.map((x:string,i:number)=><li key={i}>{x}</li>)}</ul></div>:null}</div></div>
   </section>
   {intelligence.sectors?.available&&<section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5"><h3 className="font-bold text-white mb-4">رهبری و ضعف صنایع</h3><div className="grid md:grid-cols-2 gap-4"><div><div className="text-xs text-slate-500 mb-2">قوی‌ترین‌ها</div>{(intelligence.sectors.leaders||[]).map((x:any,i:number)=><div key={i} className="flex justify-between border-b border-white/5 py-2 text-sm"><span className="text-slate-300">{x.name}</span><span className="text-slate-200">{pct(x.changePercent)}</span></div>)}</div><div><div className="text-xs text-slate-500 mb-2">ضعیف‌ترین‌ها</div>{(intelligence.sectors.laggards||[]).map((x:any,i:number)=><div key={i} className="flex justify-between border-b border-white/5 py-2 text-sm"><span className="text-slate-300">{x.name}</span><span className="text-slate-200">{pct(x.changePercent)}</span></div>)}</div></div></section>}
 </div>;
}
