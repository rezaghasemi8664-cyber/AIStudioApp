import React, { useCallback, useEffect, useState } from 'react';
import * as adminActionsService from '../services/adminActionsService';

interface Props { onComplete?: () => Promise<void> | void; }
interface Check { name:string; status:string; httpStatus?:number; latencyMs?:number; error?:string; }
interface Health { overall?:string; checks?:Check[]; [key:string]:unknown; }

const labels:Record<string,string>={healthy:'سالم',degraded:'ناپایدار',down:'قطع',unknown:'نامشخص'};
const title:Record<string,string>={database:'پایگاه داده',backend:'بک‌اند',frontend:'فرانت‌اند',api:'API',tsetmc:'TSETMC',codal:'کدال'};
const statusClass=(s:string)=>s==='healthy'?'bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-300':s==='degraded'?'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300':'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-300';

const AdminInfrastructurePanel:React.FC<Props>=({onComplete=()=>undefined})=>{
 const [health,setHealth]=useState<Health|null>(null); const [busy,setBusy]=useState(false); const [error,setError]=useState<string|null>(null); const [lastCheck,setLastCheck]=useState<string|null>(null);
 const check=useCallback(async()=>{setBusy(true);setError(null);try{const result=await adminActionsService.executeAction('infrastructure','health-check',{});setHealth(result as Health);setLastCheck(new Date().toISOString());await onComplete();}catch(e){setError(e instanceof Error?e.message:'بررسی سلامت زیرساخت ناموفق بود.');}finally{setBusy(false);}},[onComplete]);
 useEffect(()=>{void check();},[check]);
 const checks=Array.isArray(health?.checks)?health.checks:[]; const healthy=checks.filter(x=>x.status==='healthy').length; const degraded=checks.filter(x=>x.status==='degraded').length; const down=checks.filter(x=>!['healthy','degraded'].includes(x.status)).length;
 return <div className="space-y-5" dir="rtl">
  <div className="rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-5">
   <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><h3 className="text-xl font-bold">سلامت زیرساخت</h3><p className="mt-1 text-sm text-gray-500">بررسی زنده پایگاه داده، سرویس‌ها و endpointهای اصلی سامانه.</p></div><button onClick={()=>void check()} disabled={busy} className="rounded-xl bg-cyan-600 px-5 py-2.5 font-semibold text-white disabled:opacity-50">{busy?'در حال بررسی…':'بررسی مجدد'}</button></div>
   {error&&<div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">{error}</div>}
   <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-3"><div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-900/50"><div className="text-xs text-gray-500">کل بررسی‌ها</div><div className="mt-2 text-2xl font-extrabold">{checks.length.toLocaleString('fa-IR')}</div></div><div className="rounded-xl bg-green-50 p-4 dark:bg-green-950/20"><div className="text-xs text-green-700 dark:text-green-300">سالم</div><div className="mt-2 text-2xl font-extrabold">{healthy.toLocaleString('fa-IR')}</div></div><div className="rounded-xl bg-amber-50 p-4 dark:bg-amber-950/20"><div className="text-xs text-amber-700 dark:text-amber-300">ناپایدار</div><div className="mt-2 text-2xl font-extrabold">{degraded.toLocaleString('fa-IR')}</div></div><div className="rounded-xl bg-red-50 p-4 dark:bg-red-950/20"><div className="text-xs text-red-700 dark:text-red-300">قطع/نامشخص</div><div className="mt-2 text-2xl font-extrabold">{down.toLocaleString('fa-IR')}</div></div></div>
  </div>
  <div className="rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-5"><div className="mb-4 flex items-center justify-between"><h4 className="font-bold">وضعیت سرویس‌ها</h4><span className="text-xs text-gray-500">آخرین بررسی: {lastCheck?new Date(lastCheck).toLocaleString('fa-IR'):'—'}</span></div><div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">{checks.map((item,i)=><div key={`${item.name}-${i}`} className="rounded-xl border border-[var(--card-border-color)] p-4"><div className="flex items-center justify-between gap-2"><span className="font-semibold">{title[item.name]||item.name||'سرویس'}</span><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(item.status)}`}>{labels[item.status]||item.status}</span></div><div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-500"><span>تاخیر: <b className="text-gray-800 dark:text-gray-200">{item.latencyMs!=null?`${item.latencyMs.toLocaleString('fa-IR')} ms`:'—'}</b></span><span>HTTP: <b className="text-gray-800 dark:text-gray-200">{item.httpStatus??'—'}</b></span></div>{item.error&&<div className="mt-3 rounded-lg bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/20 dark:text-red-300">{item.error}</div>}</div>)}{checks.length===0&&!busy&&<div className="col-span-full py-8 text-center text-gray-500">داده‌ای برای نمایش دریافت نشد.</div>}</div></div>
  <div className="rounded-xl border border-cyan-500/20 bg-cyan-50 p-4 text-sm text-cyan-900 dark:bg-cyan-950/20 dark:text-cyan-100">این بخش فقط وضعیت واقعی سرویس‌ها را نمایش می‌دهد و هیچ تغییری در تنظیمات یا داده‌های عملیاتی ایجاد نمی‌کند.</div>
 </div>;
};
export default AdminInfrastructurePanel;
