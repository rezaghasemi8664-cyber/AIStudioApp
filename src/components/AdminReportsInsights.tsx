import React, { useCallback, useEffect, useState } from 'react';
import * as reportsService from '../services/adminReportsService';

const card='rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-5 shadow-sm';
const fmt=(v:number)=>Number(v||0).toLocaleString('fa-IR');
const growthText=(v:number)=>v>0?`+${v.toLocaleString('fa-IR',{maximumFractionDigits:1})}٪`:v<0?`${v.toLocaleString('fa-IR',{maximumFractionDigits:1})}٪`:'۰٪';

const GrowthCard:React.FC<{title:string;value:number;growth:number}>=({title,value,growth})=><div className="rounded-xl border border-[var(--card-border-color)] p-4"><div className="text-xs text-gray-500">{title}</div><div className="mt-2 flex items-end justify-between gap-2"><b className="text-2xl">{fmt(value)}</b><span className={`text-xs font-bold ${growth>0?'text-emerald-600':growth<0?'text-red-600':'text-gray-500'}`}>{growthText(growth)}</span></div><div className="mt-2 text-[11px] text-gray-500">در مقایسه با بازه مشابه قبل</div></div>;

const AdminReportsInsights:React.FC<{days:7|30}>=({days})=>{
 const [data,setData]=useState<reportsService.AdminReportsInsights|null>(null);
 const [loading,setLoading]=useState(true); const [error,setError]=useState<string|null>(null);
 const load=useCallback(async()=>{setLoading(true);setError(null);try{setData(await reportsService.getInsights(days));}catch(e){setError(e instanceof Error?e.message:'دریافت بینش گزارش مدیریتی ناموفق بود.');}finally{setLoading(false);}},[days]);
 useEffect(()=>{void load();},[load]);
 if(loading&&!data)return <div className={card} dir="rtl"><div className="h-24 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800"/></div>;
 if(error&&!data)return <div className={card} dir="rtl"><div className="text-sm text-red-600">{error}</div><button onClick={()=>void load()} className="mt-3 rounded-lg border px-3 py-1.5 text-sm">تلاش مجدد</button></div>;
 if(!data)return null;
 return <div className={card} dir="rtl">
  <div className="flex flex-wrap items-center justify-between gap-3"><div><h4 className="font-bold">بینش و عملکرد دوره</h4><p className="mt-1 text-xs text-gray-500">رشد واقعی نسبت به {days===7?'۷':'۳۰'} روز قبل و برترین فعالیت‌ها</p></div><button disabled={loading} onClick={()=>void load()} className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50">بروزرسانی</button></div>
  <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3"><GrowthCard title="کاربران جدید" value={data.totals.users} growth={data.growth.users}/><GrowthCard title="تحلیل‌های انجام‌شده" value={data.totals.analyses} growth={data.growth.analyses}/><GrowthCard title="نشست‌های ایجادشده" value={data.totals.sessions} growth={data.growth.sessions}/></div>
  <div className="mt-5 grid grid-cols-1 xl:grid-cols-2 gap-4">
   <div className="rounded-xl border border-[var(--card-border-color)] p-4"><h5 className="font-bold">کاربران فعال‌تر از نظر تحلیل</h5>{data.topUsers.length===0?<p className="mt-4 text-sm text-gray-500">در این بازه تحلیلی ثبت نشده است.</p>:<div className="mt-3 overflow-auto"><table className="w-full min-w-[420px] text-sm"><thead><tr className="border-b text-gray-500"><th className="p-2 text-right">رتبه</th><th className="p-2 text-right">کاربر</th><th className="p-2 text-right">تعداد تحلیل</th></tr></thead><tbody>{data.topUsers.map((u,i)=><tr key={`${u.userId}-${i}`} className="border-b last:border-0"><td className="p-2 font-bold">{fmt(i+1)}</td><td className="p-2">{u.username||'کاربر حذف‌شده'}</td><td className="p-2 font-semibold">{fmt(u.analysisCount)}</td></tr>)}</tbody></table></div>}</div>
   <div className="rounded-xl border border-[var(--card-border-color)] p-4"><h5 className="font-bold">برترین نمادها از نظر تعداد تحلیل</h5>{data.topSymbols.length===0?<p className="mt-4 text-sm text-gray-500">در این بازه تحلیلی ثبت نشده است.</p>:<div className="mt-3 overflow-auto"><table className="w-full min-w-[360px] text-sm"><thead><tr className="border-b text-gray-500"><th className="p-2 text-right">رتبه</th><th className="p-2 text-right">نماد</th><th className="p-2 text-right">تعداد تحلیل</th></tr></thead><tbody>{data.topSymbols.map((s,i)=><tr key={`${s.symbol}-${i}`} className="border-b last:border-0"><td className="p-2 font-bold">{fmt(i+1)}</td><td className="p-2 font-semibold">{s.symbol}</td><td className="p-2">{fmt(s.analysisCount)}</td></tr>)}</tbody></table></div>}</div>
  </div>
 </div>;
};
export default AdminReportsInsights;
