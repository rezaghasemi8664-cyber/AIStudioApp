import React, { useCallback, useEffect, useState } from 'react';
import apiClient from '../services/apiClient';

interface Step { name:string; label:string; status:string; startedAt?:string; finishedAt?:string; output?:string; error?:string; }
interface UpdateStatus { jobId?:string; status:string; stage:string; branch?:string; commitSha?:string; message?:string; lastOutput?:string; lastError?:string; startedAt?:string; updatedAt?:string; steps?:Step[]; }

const stageLabels:Record<string,string>={starting:'آماده‌سازی', 'git-pull':'دریافت تغییرات از GitHub', build:'Build پروژه', 'copy-build':'جایگزینی Build سرور', 'pm2-restart-scheduled':'زمان‌بندی ریستارت PM2', 'pm2-restart':'ریستارت PM2', success:'تکمیل موفق', failed:'متوقف‌شده'};
const statusLabels:Record<string,string>={running:'در حال اجرا',scheduled:'زمان‌بندی‌شده',success:'موفق',failed:'ناموفق'};
const fmtDate=(v?:string)=>v?new Date(v).toLocaleString('fa-IR'):'—';

const AdminServerUpdatePanel:React.FC<{onComplete?:()=>Promise<void>|void}>=({onComplete=()=>undefined})=>{
 const [data,setData]=useState<UpdateStatus|null>(null); const [busy,setBusy]=useState(false); const [error,setError]=useState<string|null>(null);
 const load=useCallback(async()=>{try{const r=await apiClient.get<UpdateStatus>('/admin-server-update/status');setData(r?.data??r);}catch(e){setError(e instanceof Error?e.message:'دریافت وضعیت بروزرسانی ناموفق بود.');}},[]);
 useEffect(()=>{void load();},[load]);
 useEffect(()=>{if(!data||data.status!=='running')return;const t=window.setInterval(()=>void load(),2000);return()=>window.clearInterval(t);},[data,load]);
 const start=async()=>{if(busy)return;setBusy(true);setError(null);try{const r=await apiClient.post<UpdateStatus>('/admin-server-update/start',{});setData(r?.data??r);await onComplete();}catch(e){setError(e instanceof Error?e.message:'شروع بروزرسانی ناموفق بود.');}finally{setBusy(false);}};
 const running=data?.status==='running';
 return <div className="space-y-5" dir="rtl">
  <div className="rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-5">
   <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
    <div><h3 className="text-xl font-bold">بروزرسانی مستقیم سرور</h3><p className="mt-1 text-sm text-gray-500">GitHub → Pull → Build → جایگزینی backend/build → PM2 restart</p></div>
    <div className="flex gap-2"><button disabled={busy||running} onClick={()=>void start()} className="rounded-xl bg-cyan-600 px-5 py-2.5 font-semibold text-white disabled:opacity-50">{running?'در حال بروزرسانی…':'دریافت تغییرات و استقرار روی سرور'}</button><button disabled={busy} onClick={()=>void load()} className="rounded-xl border px-4 py-2.5 text-sm">به‌روزرسانی وضعیت</button></div>
   </div>
   <div className="mt-5 rounded-xl bg-amber-50 dark:bg-amber-950/20 p-4 text-sm text-amber-800 dark:text-amber-200">برای جلوگیری از اجرای هم‌زمان، در هر لحظه فقط یک عملیات مجاز است. اگر هر مرحله شکست بخورد، مراحل بعدی اجرا نمی‌شوند و علت کامل خطا در همین صفحه ثبت می‌شود.</div>
  </div>
  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
   <div className="rounded-2xl border bg-[var(--card-bg)] p-4"><div className="text-xs text-gray-500">وضعیت</div><div className="mt-2 font-bold">{statusLabels[data?.status||'']||'آماده'}</div></div>
   <div className="rounded-2xl border bg-[var(--card-bg)] p-4"><div className="text-xs text-gray-500">مرحله</div><div className="mt-2 font-bold">{stageLabels[data?.stage||'']||data?.stage||'—'}</div></div>
   <div className="rounded-2xl border bg-[var(--card-bg)] p-4"><div className="text-xs text-gray-500">Branch</div><div className="mt-2 font-mono text-sm" dir="ltr">{data?.branch||'main'}</div></div>
   <div className="rounded-2xl border bg-[var(--card-bg)] p-4"><div className="text-xs text-gray-500">Commit پس از Pull</div><div className="mt-2 font-mono text-xs truncate" dir="ltr">{data?.commitSha||'—'}</div></div>
  </div>
  {data?.message&&<div className={`rounded-xl p-4 text-sm ${data.status==='failed'?'bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-300':'bg-green-50 text-green-700 dark:bg-green-950/20 dark:text-green-300'}`}>{data.message}</div>}
  {error&&<div className="rounded-xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950/20 dark:text-red-300"><b>خطای ارتباط با API:</b><pre className="mt-2 whitespace-pre-wrap font-mono text-xs" dir="ltr">{error}</pre></div>}
  <div className="rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-5">
   <div className="flex items-center justify-between gap-3"><h4 className="font-bold">جزئیات مرحله‌به‌مرحله</h4><span className="text-xs text-gray-500">شروع: {fmtDate(data?.startedAt)} | آخرین بروزرسانی: {fmtDate(data?.updatedAt)}</span></div>
   <div className="mt-4 space-y-3">{(data?.steps||[]).map((s,i)=><div key={`${s.name}-${i}`} className="rounded-xl border p-4"><div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2"><div className="font-semibold">{s.label}</div><span className={`rounded-full px-2.5 py-1 text-xs ${s.status==='success'?'bg-green-100 text-green-700':s.status==='failed'?'bg-red-100 text-red-700':'bg-amber-100 text-amber-700'}`}>{statusLabels[s.status]||s.status}</span></div><div className="mt-2 text-xs text-gray-500">شروع: {fmtDate(s.startedAt)} | پایان: {fmtDate(s.finishedAt)}</div>{s.output&&<pre className="mt-3 max-h-56 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100" dir="ltr">{s.output}</pre>}{s.error&&<pre className="mt-3 max-h-72 overflow-auto rounded-lg bg-red-950 p-3 text-xs text-red-100" dir="ltr">{s.error}</pre>}</div>)}{(!data?.steps||data.steps.length===0)&&<div className="py-8 text-center text-gray-500">هنوز عملیات بروزرسانی اجرا نشده است.</div>}</div>
  </div>
  {data?.lastError&&<div className="rounded-2xl border border-red-500/40 bg-red-50 dark:bg-red-950/20 p-5"><h4 className="font-bold text-red-700 dark:text-red-300">شرح کامل آخرین خطا</h4><pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded-xl bg-red-950 p-4 text-xs text-red-100" dir="ltr">{data.lastError}</pre></div>}
  <div className="text-xs text-gray-500">زمان‌بندی پیش‌فرض از Branch <span dir="ltr">{data?.branch||'main'}</span> انجام می‌شود. مسیرهای پروژه و Branch از متغیرهای محیطی سرور قابل تنظیم هستند.</div>
 </div>;
};
export default AdminServerUpdatePanel;
