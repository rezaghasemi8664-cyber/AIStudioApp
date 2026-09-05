import React, { useCallback, useEffect, useState } from 'react';
import * as reportsService from '../services/adminReportsService';

const card='rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-5 shadow-sm';
const fmt=(v:number)=>Number(v||0).toLocaleString('fa-IR');
const money=(v:number,currency:string)=>`${fmt(v)} ${currency}`;

const Stat:React.FC<{title:string;value:string;hint?:string}>=({title,value,hint})=><div className={card}><div className="text-sm text-gray-500">{title}</div><div className="mt-2 text-2xl font-extrabold">{value}</div>{hint&&<div className="mt-2 text-xs text-gray-500">{hint}</div>}</div>;

const AdminReportsPanel:React.FC=()=>{
 const [data,setData]=useState<reportsService.AdminReportsSummary|null>(null);
 const [loading,setLoading]=useState(true); const [error,setError]=useState<string|null>(null);
 const load=useCallback(async()=>{setLoading(true);setError(null);try{setData(await reportsService.getSummary());}catch(e){setError(e instanceof Error?e.message:'دریافت گزارش مدیریتی ناموفق بود.');}finally{setLoading(false);}},[]);
 useEffect(()=>{void load();},[load]);
 if(loading&&!data)return <div className={card} dir="rtl"><div className="animate-pulse text-gray-500">در حال دریافت گزارش مدیریتی...</div></div>;
 if(error&&!data)return <div className={card} dir="rtl"><div className="text-red-600">{error}</div><button onClick={()=>void load()} className="mt-4 rounded-xl border px-4 py-2">تلاش مجدد</button></div>;
 if(!data)return null;
 return <div className="space-y-6" dir="rtl">
  <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-xl font-bold">گزارش‌های مدیریتی</h3><p className="mt-1 text-sm text-gray-500">نمای کلی واقعی از کاربران، تحلیل‌ها، بازار، مالی و رویدادهای مدیریتی</p></div><div className="flex items-center gap-2"><span className="text-xs text-gray-500">آخرین بروزرسانی: {new Date(data.generatedAt).toLocaleString('fa-IR')}</span><button disabled={loading} onClick={()=>void load()} className="rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-50">بروزرسانی</button></div></div>
  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
   <Stat title="کل کاربران" value={fmt(data.users.total)} hint={`فعال ${fmt(data.users.active)} · غیرفعال ${fmt(data.users.inactive)}`}/>
   <Stat title="کل تحلیل‌ها" value={fmt(data.analyses.total)} hint="سوابق ثبت‌شده تحلیل"/>
   <Stat title="نشست‌ها" value={fmt(data.sessions.total)} hint="نشست‌های ثبت‌شده"/>
   <Stat title="کلیدهای API فعال" value={fmt(data.apiKeys.active)} hint="کلیدهای لغونشده"/>
  </div>
  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
   <Stat title="اعلان‌ها" value={fmt(data.notifications.total)} />
   <Stat title="رویدادهای Audit" value={fmt(data.audit.events)} />
   <Stat title="خلاصه‌های بازار" value={fmt(data.market.summaries)} hint={`روزانه ${fmt(data.market.daily)} · خام ${fmt(data.market.history)}`}/>
   <Stat title="تراکنش‌های پرداخت" value={fmt(data.payments.transactionCount)} hint={`پرداخت‌شده ${fmt(data.payments.paidCount)} · در انتظار ${fmt(data.payments.pendingCount)}`}/>
  </div>
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
   <div className={card}><h4 className="font-bold">وضعیت کاربران</h4><div className="mt-5 space-y-4"><div><div className="mb-1 flex justify-between text-sm"><span>فعال</span><b>{fmt(data.users.active)}</b></div><div className="h-3 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800"><div className="h-full rounded-full bg-emerald-500" style={{width:`${data.users.total?Math.min(100,data.users.active/data.users.total*100):0}%`}}/></div></div><div><div className="mb-1 flex justify-between text-sm"><span>غیرفعال</span><b>{fmt(data.users.inactive)}</b></div><div className="h-3 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800"><div className="h-full rounded-full bg-slate-400" style={{width:`${data.users.total?Math.min(100,data.users.inactive/data.users.total*100):0}%`}}/></div></div></div></div>
   <div className={card}><h4 className="font-bold">گزارش مالی</h4><div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3"><div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 p-4"><div className="text-xs text-gray-500">پرداخت‌شده ریالی</div><div className="mt-2 font-bold">{money(data.payments.paidIrr,'ریال')}</div></div><div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 p-4"><div className="text-xs text-gray-500">پرداخت‌شده تومانی</div><div className="mt-2 font-bold">{money(data.payments.paidIrt,'تومان')}</div></div></div><p className="mt-4 text-xs text-gray-500">مبالغ ریال و تومان عمداً جداگانه نمایش داده می‌شوند و با هم جمع نمی‌شوند.</p></div>
  </div>
  <div className={card}><h4 className="font-bold">پوشش داده‌های بازار</h4><div className="mt-4 overflow-auto"><table className="w-full min-w-[620px] text-sm"><thead><tr className="border-b"><th className="p-3 text-right">منبع/نوع داده</th><th className="p-3 text-right">تعداد</th><th className="p-3 text-right">توضیح</th></tr></thead><tbody><tr className="border-b"><td className="p-3">تاریخچه خام بازار</td><td className="p-3 font-semibold">{fmt(data.market.history)}</td><td className="p-3 text-gray-500">داده‌های ثبت‌شده تاریخی</td></tr><tr className="border-b"><td className="p-3">داده روزانه</td><td className="p-3 font-semibold">{fmt(data.market.daily)}</td><td className="p-3 text-gray-500">خلاصه‌های روزانه</td></tr><tr><td className="p-3">خلاصه بازار</td><td className="p-3 font-semibold">{fmt(data.market.summaries)}</td><td className="p-3 text-gray-500">گزارش‌های خلاصه بازار</td></tr></tbody></table></div></div>
  {error&&<div className="text-sm text-red-600">{error}</div>}
 </div>;
};
export default AdminReportsPanel;
