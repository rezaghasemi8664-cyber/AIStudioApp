import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { GUIDE_PAGES, type GuidePage } from '../data/comprehensiveGuide';
import { loadGuidePages, saveGuidePage } from '../services/comprehensiveGuideService';

const AdminComprehensiveGuide: React.FC = () => {
 const [pages,setPages]=useState<GuidePage[]>(GUIDE_PAGES);
 const [selectedId,setSelectedId]=useState(GUIDE_PAGES[0]?.id||'dashboard');
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const [message,setMessage]=useState('');
 const [error,setError]=useState('');
 const selected=useMemo(()=>pages.find(p=>p.id===selectedId)||pages[0],[pages,selectedId]);
 const update=(patch:Partial<GuidePage>)=>setPages(current=>current.map(p=>p.id===selectedId?{...p,...patch}:p));
 const updateSection=(index:number,patch:Partial<GuidePage['sections'][number]>)=>update({sections:selected.sections.map((s,i)=>i===index?{...s,...patch}:s)});
 const refresh=useCallback(async()=>{setLoading(true);try{setPages(await loadGuidePages());setError('');}catch(e){setError(e instanceof Error?e.message:'دریافت محتوا ناموفق بود.');}finally{setLoading(false);}},[]);
 useEffect(()=>{void refresh();},[refresh]);
 const save=async()=>{if(!selected)return;setBusy(true);setMessage('');setError('');try{await saveGuidePage(selected);setMessage('تغییرات این صفحه با موفقیت ذخیره شد و در راهنمای کاربران قابل مشاهده است.');}catch(e){setError(e instanceof Error?e.message:'ذخیره محتوا ناموفق بود.');}finally{setBusy(false);}};
 if(loading)return <div className="p-8 text-center text-gray-500">در حال دریافت صفحات راهنما…</div>;
 if(!selected)return <div className="p-8 text-center text-gray-500">صفحه‌ای برای ویرایش وجود ندارد.</div>;
 return <div className="space-y-5" dir="rtl">
  <div className="rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-5"><h2 className="text-xl font-black">مدیریت راهنمای جامع نرم‌افزار</h2><p className="mt-2 text-sm leading-7 text-gray-500">صفحه موردنظر را انتخاب و توضیحات هر بخش را ویرایش کنید. تغییرات فقط پس از فشردن دکمه ذخیره در راهنمای کاربران منتشر می‌شوند.</p></div>
  <div className="grid gap-5 lg:grid-cols-[230px_minmax(0,1fr)]">
   <aside className="rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-3"><h3 className="px-3 py-2 text-sm font-bold">صفحات قابل ویرایش</h3><div className="max-h-[70vh] space-y-1 overflow-y-auto">{pages.map(p=><button key={p.id} onClick={()=>{setSelectedId(p.id);setMessage('');setError('');}} className={`w-full rounded-xl px-3 py-3 text-right text-sm ${selectedId===p.id?'bg-cyan-50 font-bold text-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-200':'hover:bg-gray-100 dark:hover:bg-gray-800'}`}>{p.title}<span className="mt-1 block text-xs font-normal text-gray-500">{p.sections.length} بخش</span></button>)}</div></aside>
   <div className="min-w-0 space-y-4">
    <section className="rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-5"><label className="mb-2 block text-sm font-bold">عنوان صفحه</label><input value={selected.title} onChange={e=>update({title:e.target.value})} className="w-full rounded-xl border border-[var(--card-border-color)] bg-transparent px-3 py-2.5"/><label className="mb-2 mt-4 block text-sm font-bold">معرفی صفحه</label><textarea rows={3} value={selected.summary} onChange={e=>update({summary:e.target.value})} className="w-full rounded-xl border border-[var(--card-border-color)] bg-transparent p-3 leading-7"/></section>
    {selected.sections.map((section,index)=><section key={index} className="space-y-3 rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-5"><div className="flex items-center justify-between gap-3"><h3 className="font-black">{section.title}</h3><span className="text-xs text-gray-500">بخش {(index+1).toLocaleString('fa-IR')}</span></div>
      <Field label="عنوان کارت یا زیرتب" value={section.title} onChange={title=>updateSection(index,{title})}/>
      <Field label="کاربرد این بخش" value={section.purpose} onChange={purpose=>updateSection(index,{purpose})} multiline/>
      <Field label="روش استفاده" value={section.usage} onChange={usage=>updateSection(index,{usage})} multiline/>
      <Field label="تفسیر اطلاعات، اعداد و نمودارها" value={section.interpretation} onChange={interpretation=>updateSection(index,{interpretation})} multiline/>
      <Field label="نکات و محدودیت‌ها" value={section.cautions} onChange={cautions=>updateSection(index,{cautions})} multiline/>
    </section>)}
    <div className="sticky bottom-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-4 shadow-lg"><div className="text-sm">{error&&<span className="text-red-600">{error}</span>}{message&&<span className="text-green-600">{message}</span>}</div><button onClick={()=>void save()} disabled={busy} className="rounded-xl bg-cyan-600 px-6 py-3 text-sm font-bold text-white disabled:opacity-50">{busy?'در حال ذخیره…':'ذخیره صفحه راهنما'}</button></div>
   </div>
  </div>
 </div>;
};
const Field:React.FC<{label:string;value:string;onChange:(value:string)=>void;multiline?:boolean}> = ({label,value,onChange,multiline})=><label className="block"><span className="mb-2 block text-xs font-bold text-gray-600 dark:text-gray-300">{label}</span>{multiline?<textarea rows={3} value={value} onChange={e=>onChange(e.target.value)} className="w-full rounded-xl border border-[var(--card-border-color)] bg-transparent p-3 text-sm leading-7"/>:<input value={value} onChange={e=>onChange(e.target.value)} className="w-full rounded-xl border border-[var(--card-border-color)] bg-transparent px-3 py-2.5 text-sm"/>}</label>;
export default AdminComprehensiveGuide;
