import React, { useCallback, useEffect, useState } from 'react';
import * as apiClient from '../services/apiClient';
import * as adminActionsService from '../services/adminActionsService';

interface AiOverview {
  service: string; configured: boolean; status: 'online'|'degraded'|'not-configured'; endpoint: string|null;
  model: string; fallbackModel: string|null; timeout: number; maxTokens: number; enabled: boolean;
  health: { available: boolean; latencyMs: number|null; status: number|null; error: string|null };
  checkedAt: string; savedConfig: Record<string, unknown>;
}
interface TestResult { passed: boolean; latencyMs: number; status: number|null; model: string; message: string; error?: string; }

const card='rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-5 shadow-sm';
const badge=(ok:boolean)=>ok?'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300':'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300';
const fmt=(v:number)=>Number(v||0).toLocaleString('fa-IR');

const AdminAiPanel:React.FC<{onComplete?:()=>void}>=({onComplete})=>{
 const [data,setData]=useState<AiOverview|null>(null); const [loading,setLoading]=useState(true); const [busy,setBusy]=useState(false); const [error,setError]=useState<string|null>(null); const [message,setMessage]=useState<string|null>(null); const [test,setTest]=useState<TestResult|null>(null);
 const load=useCallback(async()=>{setLoading(true);setError(null);try{const r=await apiClient.get<AiOverview>('/admin-ai/overview');if(!r.success||!r.data)throw new Error(r.message||'دریافت وضعیت AI ناموفق بود.');setData(r.data);}catch(e){setError(e instanceof Error?e.message:'دریافت وضعیت AI ناموفق بود.');}finally{setLoading(false);}},[]);
 useEffect(()=>{void load();},[load]);
 const runTest=async()=>{setBusy(true);setMessage(null);setError(null);try{const r=await apiClient.post<TestResult>('/admin-ai/test',{});if(!r.success||!r.data)throw new Error(r.message||'آزمون AI ناموفق بود.');setTest(r.data);setMessage(r.data.message);onComplete?.();await load();}catch(e){setError(e instanceof Error?e.message:'آزمون اتصال AI ناموفق بود.');}finally{setBusy(false);}};
 const setConfig=async(key:string,value:unknown)=>{setBusy(true);setError(null);setMessage(null);try{await adminActionsService.executeAction('ai','set-config',{key,value});setMessage('تنظیمات AI با موفقیت ذخیره شد.');await load();onComplete?.();}catch(e){setError(e instanceof Error?e.message:'ذخیره تنظیمات AI ناموفق بود.');}finally{setBusy(false);}};
 if(loading&&!data)return <div className="p-6 text-center text-gray-500">در حال دریافت وضعیت هوش مصنوعی...</div>;
 return <div dir="rtl" className="space-y-6">
  <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-extrabold">مرکز مدیریت هوش مصنوعی</h2><p className="mt-1 text-sm text-gray-500">سلامت سرویس، مدل، تنظیمات و آزمون اتصال AI</p></div><button onClick={()=>void load()} disabled={loading} className="rounded-xl border border-[var(--card-border-color)] px-4 py-2 text-sm font-semibold disabled:opacity-50">↻ بروزرسانی</button></div>
  {error&&<div className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}{message&&<div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-700">{message}</div>}
  {data&&<>
   <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
    <div className={card}><div className="text-sm text-gray-500">وضعیت سرویس</div><div className="mt-2 flex items-center gap-2"><span className={`rounded-full px-3 py-1 text-xs font-bold ${badge(data.status==='online')}`}>{data.status==='online'?'آنلاین':data.status==='degraded'?'اختلال':'تنظیم نشده'}</span></div></div>
    <div className={card}><div className="text-sm text-gray-500">مدل فعال</div><div className="mt-2 font-bold ltr text-left" dir="ltr">{data.model}</div></div>
    <div className={card}><div className="text-sm text-gray-500">زمان پاسخ سلامت</div><div className="mt-2 text-2xl font-extrabold">{data.health.latencyMs==null?'—':`${fmt(data.health.latencyMs)} ms`}</div></div>
    <div className={card}><div className="text-sm text-gray-500">کلید API</div><div className="mt-2 font-bold">{data.configured?'تنظیم شده (مخفی)':'تنظیم نشده'}</div></div>
   </div>
   <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <div className={card}><h3 className="font-bold">پیکربندی سرویس</h3><div className="mt-4 space-y-3 text-sm"><div className="flex justify-between gap-4"><span className="text-gray-500">Endpoint</span><b dir="ltr" className="truncate max-w-[65%]">{data.endpoint||'—'}</b></div><div className="flex justify-between"><span className="text-gray-500">Timeout</span><b>{fmt(data.timeout)} میلی‌ثانیه</b></div><div className="flex justify-between"><span className="text-gray-500">حداکثر توکن</span><b>{fmt(data.maxTokens)}</b></div><div className="flex justify-between"><span className="text-gray-500">مدل پشتیبان</span><b dir="ltr">{data.fallbackModel||'تنظیم نشده'}</b></div><div className="flex justify-between"><span className="text-gray-500">فعال بودن AI</span><b>{data.enabled?'فعال':'غیرفعال'}</b></div></div><div className="mt-5 flex flex-wrap gap-2"><button disabled={busy} onClick={()=>void setConfig('enabled',!data.enabled)} className="rounded-xl border border-cyan-500/40 px-4 py-2 text-sm font-semibold disabled:opacity-50">{data.enabled?'غیرفعال‌سازی AI':'فعال‌سازی AI'}</button>{!data.fallbackModel&&<button disabled={busy} onClick={()=>void setConfig('fallback-model','gpt-4o-mini')} className="rounded-xl border border-[var(--card-border-color)] px-4 py-2 text-sm font-semibold disabled:opacity-50">ثبت مدل پشتیبان</button>}</div></div>
    <div className={card}><div className="flex items-center justify-between gap-3"><div><h3 className="font-bold">آزمون واقعی اتصال</h3><p className="mt-1 text-xs text-gray-500">بدون نمایش یا ذخیره کلید API؛ فقط سلامت Endpoint بررسی می‌شود.</p></div><button disabled={busy} onClick={()=>void runTest()} className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy?'در حال بررسی...':'اجرای آزمون'}</button></div>{test&&<div className="mt-5 rounded-xl bg-gray-50 p-4 dark:bg-gray-800/60"><div className="flex items-center justify-between"><span>نتیجه</span><span className={`rounded-full px-3 py-1 text-xs font-bold ${badge(test.passed)}`}>{test.passed?'موفق':'ناموفق'}</span></div><div className="mt-3 grid grid-cols-2 gap-3 text-sm"><div>زمان پاسخ: <b>{fmt(test.latencyMs)} ms</b></div><div>HTTP: <b>{test.status??'—'}</b></div><div className="col-span-2">مدل: <b dir="ltr">{test.model}</b></div></div>{test.error&&<div className="mt-3 text-xs text-rose-600">{test.error}</div>}</div>}</div>
   </div>
   <div className={card}><h3 className="font-bold">وضعیت وابستگی‌ها</h3><div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3"><div className="rounded-xl border border-[var(--card-border-color)] p-4"><div className="text-xs text-gray-500">Endpoint</div><div className="mt-1 font-semibold">{data.endpoint?'تنظیم شده':'مفقود'}</div></div><div className="rounded-xl border border-[var(--card-border-color)] p-4"><div className="text-xs text-gray-500">احراز هویت</div><div className="mt-1 font-semibold">{data.configured?'کلید موجود':'کلید موجود نیست'}</div></div><div className="rounded-xl border border-[var(--card-border-color)] p-4"><div className="text-xs text-gray-500">آخرین بررسی</div><div className="mt-1 font-semibold">{new Date(data.checkedAt).toLocaleString('fa-IR')}</div></div></div></div>
  </>}
 </div>;
};
export default AdminAiPanel;
