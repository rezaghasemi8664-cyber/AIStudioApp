import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as adminActionsService from '../services/adminActionsService';
import * as paymentsService from '../services/adminPaymentsService';

interface Props { onComplete?: () => Promise<void> | void; }
const card='rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-5';
const input='w-full rounded-xl border border-[var(--card-border-color)] bg-transparent px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-cyan-500/30';
const labels:Record<string,string>={pending:'در انتظار',paid:'پرداخت‌شده',failed:'ناموفق',cancelled:'لغوشده',refunded:'مستردشده'};
const fmt=(v:number)=>Number(v||0).toLocaleString('fa-IR');
const dateFmt=(v?:string|null)=>v?new Date(v).toLocaleString('fa-IR'):'—';
const currencyLabel=(c:string)=>c==='IRT'?'تومان':'ریال';

const AdminPaymentsPanel:React.FC<Props>=({onComplete=()=>undefined})=>{
 const [summary,setSummary]=useState<paymentsService.PaymentSummary|null>(null);
 const [result,setResult]=useState<paymentsService.PaymentsResult|null>(null);
 const [page,setPage]=useState(1);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState<string|null>(null);
 const [message,setMessage]=useState<string|null>(null);
 const [filters,setFilters]=useState({userId:'',search:'',status:'',gateway:'',currency:'',from:'',to:''});
 const [form,setForm]=useState({userId:'',amount:'',currency:'IRR',gateway:'',description:''});
 const [selected,setSelected]=useState<paymentsService.PaymentRow|null>(null);
 const [statusForm,setStatusForm]=useState({status:'paid',referenceNo:''});

 const load=useCallback(async(targetPage=page)=>{
   setBusy(true);setError(null);
   try{
     const q:paymentsService.PaymentsQuery={page:targetPage,limit:20,search:filters.search,status:filters.status,gateway:filters.gateway,currency:filters.currency,from:filters.from,to:filters.to};
     if(filters.userId)q.userId=Number(filters.userId);
     const [s,r]=await Promise.all([paymentsService.getSummary(),paymentsService.getTransactions(q)]);
     setSummary(s);setResult(r);setPage(targetPage);
   }catch(e){setError(e instanceof Error?e.message:'دریافت اطلاعات پرداخت‌ها ناموفق بود.');}
   finally{setBusy(false);}
 },[filters,page]);
 useEffect(()=>{void load(1);},[]);
 const currencies=useMemo(()=>Object.entries(summary?.byCurrency||{}),[summary]);
 const runAction=async(action:string,payload:Record<string,unknown>)=>{
   setBusy(true);setError(null);setMessage(null);
   try{await adminActionsService.executeAction('payments',action,payload);setMessage(action==='create-transaction'?'تراکنش با موفقیت ثبت شد.':'وضعیت تراکنش با موفقیت تغییر کرد.');await load(1);await onComplete();}
   catch(e){setError(e instanceof Error?e.message:'عملیات پرداخت ناموفق بود.');}
   finally{setBusy(false);}
 };
 const create=()=>{if(!form.userId||!form.amount)return;void runAction('create-transaction',{userId:Number(form.userId),amount:Number(form.amount),currency:form.currency,gateway:form.gateway,description:form.description});};
 const setStatus=()=>{if(!selected)return;void runAction('set-status',{transactionId:selected.id,status:statusForm.status,referenceNo:statusForm.referenceNo});setSelected(null);};
 const reset=()=>setFilters({userId:'',search:'',status:'',gateway:'',currency:'',from:'',to:''});
 const currencyBlock=(currency:string,data:{paidAmount:number;pendingAmount:number;refundedAmount:number;failedAmount:number})=><div key={currency} className="rounded-xl border border-[var(--card-border-color)] p-4"><div className="text-sm text-gray-500">مبالغ {currencyLabel(currency)}</div><div className="mt-2 grid grid-cols-2 lg:grid-cols-4 gap-3"><div><div className="text-xs text-gray-500">پرداخت‌شده</div><b>{fmt(data.paidAmount)}</b></div><div><div className="text-xs text-gray-500">در انتظار</div><b>{fmt(data.pendingAmount)}</b></div><div><div className="text-xs text-gray-500">مستردشده</div><b>{fmt(data.refundedAmount)}</b></div><div><div className="text-xs text-gray-500">ناموفق</div><b>{fmt(data.failedAmount)}</b></div></div></div>;
 return <div className="space-y-5" dir="rtl">
   <div><h2 className="text-xl font-extrabold">پرداخت‌ها و تراکنش‌ها</h2><p className="mt-1 text-sm text-gray-500">داشبورد مالی، جست‌وجو، فیلتر و کنترل وضعیت تراکنش‌ها.</p></div>
   <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
    {[[`کل تراکنش‌ها`,summary?.total||0],['پرداخت‌شده',summary?.paidCount||0],['در انتظار',summary?.pendingCount||0],['مستردشده',summary?.refundedCount||0],['ناموفق',summary?.failedCount||0]].map(([t,v])=><div key={String(t)} className={card}><div className="text-xs text-gray-500">{t}</div><div className="mt-2 text-2xl font-extrabold">{fmt(Number(v))}</div></div>)}
   </div>
   {currencies.length>0&&<div className="grid grid-cols-1 lg:grid-cols-2 gap-3">{currencies.map(([c,d])=>currencyBlock(c,d))}</div>}
   <div className={card}>
    <div className="flex items-center justify-between gap-3"><h3 className="font-bold">فیلتر تراکنش‌ها</h3><button onClick={()=>{reset();void setTimeout(()=>load(1),0);}} className="rounded-lg border px-3 py-2 text-xs">پاک‌کردن فیلترها</button></div>
    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <input className={input} value={filters.userId} onChange={e=>setFilters({...filters,userId:e.target.value})} placeholder="شناسه کاربر" dir="ltr"/>
      <input className={input} value={filters.search} onChange={e=>setFilters({...filters,search:e.target.value})} placeholder="مرجع، authority یا توضیحات"/>
      <select className={input} value={filters.status} onChange={e=>setFilters({...filters,status:e.target.value})}><option value="">همه وضعیت‌ها</option>{Object.entries(labels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>
      <input className={input} value={filters.gateway} onChange={e=>setFilters({...filters,gateway:e.target.value})} placeholder="درگاه"/>
      <select className={input} value={filters.currency} onChange={e=>setFilters({...filters,currency:e.target.value})}><option value="">همه ارزها</option><option value="IRR">ریال</option><option value="IRT">تومان</option></select>
      <input className={input} type="date" value={filters.from} onChange={e=>setFilters({...filters,from:e.target.value})}/><input className={input} type="date" value={filters.to} onChange={e=>setFilters({...filters,to:e.target.value})}/>
      <button disabled={busy} onClick={()=>void load(1)} className="rounded-xl bg-cyan-600 px-4 py-2.5 font-semibold text-white disabled:opacity-50">اعمال فیلتر</button>
    </div>
   </div>
   <div className={card}>
    <div className="flex items-center justify-between gap-3"><h3 className="font-bold">ثبت تراکنش دستی</h3><span className="text-xs text-gray-500">تراکنش جدید ابتدا «در انتظار» ثبت می‌شود.</span></div>
    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3"><input className={input} value={form.userId} onChange={e=>setForm({...form,userId:e.target.value})} placeholder="شناسه کاربر" dir="ltr"/><input className={input} type="number" min="1" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} placeholder="مبلغ" dir="ltr"/><select className={input} value={form.currency} onChange={e=>setForm({...form,currency:e.target.value})}><option value="IRR">ریال</option><option value="IRT">تومان</option></select><input className={input} value={form.gateway} onChange={e=>setForm({...form,gateway:e.target.value})} placeholder="درگاه"/><input className={input} value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="توضیحات"/></div>
    <button disabled={busy||!form.userId||!form.amount} onClick={create} className="mt-3 rounded-xl bg-cyan-600 px-5 py-2.5 font-semibold text-white disabled:opacity-50">ثبت تراکنش</button>
   </div>
   <div className={card}>
    <div className="flex items-center justify-between"><h3 className="font-bold">فهرست تراکنش‌ها</h3><span className="text-xs text-gray-500">{fmt(result?.pagination.total||0)} مورد</span></div>
    <div className="mt-3 overflow-auto"><table className="w-full min-w-[1050px] text-sm"><thead><tr className="border-b"><th className="p-3 text-right">شناسه</th><th className="p-3 text-right">کاربر</th><th className="p-3 text-right">مبلغ</th><th className="p-3 text-right">درگاه</th><th className="p-3 text-right">وضعیت</th><th className="p-3 text-right">مرجع</th><th className="p-3 text-right">زمان</th><th className="p-3 text-right">عملیات</th></tr></thead><tbody>{result?.items.map(r=><tr key={r.id} className="border-b hover:bg-gray-50 dark:hover:bg-gray-800/40"><td className="p-3" dir="ltr">{r.id}</td><td className="p-3" dir="ltr">{r.userId}</td><td className="p-3 font-semibold">{fmt(r.amount)} {currencyLabel(r.currency)}</td><td className="p-3">{r.gateway||'—'}</td><td className="p-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs dark:bg-slate-800">{labels[r.status]||r.status}</span></td><td className="p-3" dir="ltr">{r.referenceNo||'—'}</td><td className="p-3">{dateFmt(r.createdAt)}</td><td className="p-3"><button onClick={()=>{setSelected(r);setStatusForm({status:r.status==='paid'?'refunded':'paid',referenceNo:r.referenceNo||''});}} className="rounded-lg border px-3 py-1.5 text-xs">جزئیات / وضعیت</button></td></tr>)}</tbody></table>{!result?.items.length&&<div className="py-8 text-center text-gray-500">تراکنشی مطابق فیلترها پیدا نشد.</div>}</div>
    <div className="mt-4 flex items-center justify-center gap-3"><button disabled={busy||page<=1} onClick={()=>void load(page-1)} className="rounded-lg border px-4 py-2 text-sm disabled:opacity-40">قبلی</button><span className="text-sm">صفحه {fmt(page)} از {fmt(result?.pagination.totalPages||1)}</span><button disabled={busy||page>=(result?.pagination.totalPages||1)} onClick={()=>void load(page+1)} className="rounded-lg border px-4 py-2 text-sm disabled:opacity-40">بعدی</button></div>
   </div>
   {(message||error)&&<div className={`${card} text-sm ${error?'text-red-600':'text-green-600'}`}>{error||message}</div>}
   {selected&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="w-full max-w-lg rounded-2xl bg-[var(--card-bg)] p-5 shadow-xl" dir="rtl"><div className="flex items-center justify-between"><h3 className="font-bold">جزئیات تراکنش #{selected.id}</h3><button onClick={()=>setSelected(null)} className="text-xl">×</button></div><div className="mt-4 grid grid-cols-2 gap-3 text-sm"><div>کاربر: <b dir="ltr">{selected.userId}</b></div><div>مبلغ: <b>{fmt(selected.amount)} {currencyLabel(selected.currency)}</b></div><div>درگاه: <b>{selected.gateway||'—'}</b></div><div>authority: <b dir="ltr">{selected.authority||'—'}</b></div><div>مرجع: <b dir="ltr">{selected.referenceNo||'—'}</b></div><div>ایجاد: <b>{dateFmt(selected.createdAt)}</b></div></div><p className="mt-4 rounded-xl bg-gray-50 p-3 text-sm dark:bg-gray-800/60">{selected.description||'بدون توضیحات'}</p><div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3"><select className={input} value={statusForm.status} onChange={e=>setStatusForm({...statusForm,status:e.target.value})}>{Object.entries(labels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select><input className={input} value={statusForm.referenceNo} onChange={e=>setStatusForm({...statusForm,referenceNo:e.target.value})} placeholder="شماره مرجع" dir="ltr"/></div><div className="mt-4 flex justify-end gap-2"><button onClick={()=>setSelected(null)} className="rounded-xl border px-4 py-2">انصراف</button><button disabled={busy} onClick={setStatus} className="rounded-xl bg-cyan-600 px-4 py-2 font-semibold text-white disabled:opacity-50">ثبت وضعیت</button></div></div></div>}
 </div>;
};
export default AdminPaymentsPanel;
