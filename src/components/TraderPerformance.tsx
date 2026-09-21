import { useEffect, useState } from 'react';
import { appApiFetch } from '../services/apiConfigService';

type Stats = {
  totalEntries:number; closedTrades:number; openTrades:number; totalPnl:number;
  winCount:number; lossCount:number; winRate:number|null; profitFactor:number|null;
  averagePnl:number|null; averageReturnPercent:number|null; returnStdDevPercent:number|null;
  bestTrade:number|null; worstTrade:number|null;
};
type Group = Stats & { symbol?:string; setup?:string };
const n=(v:number|null|undefined,d=0)=>v==null||!Number.isFinite(v)?'—':v.toLocaleString('fa-IR',{maximumFractionDigits:d});

export default function TraderPerformance(){
  const [stats,setStats]=useState<Stats|null>(null);
  const [bySymbol,setBySymbol]=useState<Group[]>([]);
  const [bySetup,setBySetup]=useState<Group[]>([]);
  const [error,setError]=useState('');
  useEffect(()=>{
    void (async()=>{
      try{
        const [a,b,c]=await Promise.all([
          appApiFetch<any>('/trader-performance'),
          appApiFetch<any>('/trader-performance/by-symbol'),
          appApiFetch<any>('/trader-performance/by-setup')
        ]);
        setStats(a?.data?.data??a?.data??null);
        setBySymbol(aList(b));
        setBySetup(aList(c));
      }catch(e:any){setError(e?.message||'خطا در دریافت آمار عملکرد');}
    })();
  },[]);
  return <div dir="rtl" className="page-shell space-y-5">
    <header><h2 className="text-2xl font-black text-cyan-600 dark:text-cyan-400">تحلیل عملکرد معامله‌گر</h2>
      <p className="text-sm text-slate-500 mt-2">محاسبات توصیفی بر اساس معاملات واقعی ثبت‌شده در دفترچه معاملات شما؛ بدون AI و بدون داده ساختگی.</p>
    </header>
    {error&&<div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}
    {stats&&<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <K title="کل رکوردها" value={n(stats.totalEntries)}/><K title="معاملات بسته" value={n(stats.closedTrades)}/>
      <K title="معاملات باز" value={n(stats.openTrades)}/><K title="سود/زیان کل" value={n(stats.totalPnl)}/>
      <K title="نرخ برد" value={stats.winRate==null?'—':n(stats.winRate,2)+'٪'}/><K title="Profit Factor" value={n(stats.profitFactor,2)}/>
      <K title="میانگین معامله" value={n(stats.averagePnl)}/><K title="انحراف بازده" value={stats.returnStdDevPercent==null?'—':n(stats.returnStdDevPercent,2)+'٪'}/>
    </div>}
    {stats&&<section className="rounded-2xl border p-5"><h3 className="font-bold mb-3">دامنه نتایج</h3>
      <div className="grid md:grid-cols-4 gap-3 text-sm"><span>تعداد برد: {n(stats.winCount)}</span><span>تعداد باخت: {n(stats.lossCount)}</span><span>بهترین معامله: {n(stats.bestTrade)}</span><span>بدترین معامله: {n(stats.worstTrade)}</span></div>
    </section>}
    <GroupTable title="تفکیک بر اساس نماد" rows={bySymbol} first="symbol" empty="داده‌ای برای تفکیک نماد وجود ندارد."/>
    <GroupTable title="تفکیک بر اساس ستاپ" rows={bySetup} first="setup" empty="داده‌ای برای تفکیک ستاپ وجود ندارد."/>
  </div>;
}
function aList(x:any):Group[]{const v=x?.data?.data??x?.data??[];return Array.isArray(v)?v:[];}
function K({title,value}:{title:string;value:string}){return <div className="rounded-2xl border p-4"><div className="text-xs text-slate-500">{title}</div><div className="text-xl font-bold mt-1">{value}</div></div>;}
function GroupTable({title,rows,first,empty}:{title:string;rows:Group[];first:'symbol'|'setup';empty:string}){
 return <section className="rounded-2xl border p-5 overflow-x-auto"><h3 className="font-bold mb-3">{title}</h3>
  <table className="w-full text-sm"><thead><tr><th>{first==='symbol'?'نماد':'ستاپ'}</th><th>بسته</th><th>برد</th><th>نرخ برد</th><th>سود/زیان</th><th>میانگین</th></tr></thead>
  <tbody>{rows.map((x,i)=><tr className="border-t" key={String(x[first]??i)}><td className="p-2 font-bold">{x[first]}</td><td>{n(x.closedTrades)}</td><td>{n(x.winCount)}</td><td>{x.winRate==null?'—':n(x.winRate,2)+'٪'}</td><td>{n(x.totalPnl)}</td><td>{n(x.averagePnl)}</td></tr>)}</tbody></table>
  {!rows.length&&<div className="py-6 text-center text-slate-500">{empty}</div>}</section>;
}