import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { GUIDE_PAGES, type GuidePage, type GuideSection } from '../data/comprehensiveGuide';
import { loadGuidePages, saveGuidePages } from '../services/comprehensiveGuideService';

const emptySection = (): GuideSection => ({
 title: 'بخش جدید',
 purpose: '',
 usage: '',
 interpretation: '',
 cautions: '',
});
const makeId = (title: string) => {
 const slug = title.trim().toLowerCase().replace(/[^\\p{L}\\p{N}]+/gu, '-').replace(/^-|-$/g, '');
 return `${slug || 'guide'}-${Date.now().toString(36)}`;
};

const AdminComprehensiveGuide: React.FC = () => {
 const [pages,setPages]=useState<GuidePage[]>(GUIDE_PAGES);
 const [selectedId,setSelectedId]=useState(GUIDE_PAGES[0]?.id||'dashboard');
 const [deletedIds,setDeletedIds]=useState<string[]>([]);
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const [message,setMessage]=useState('');
 const [error,setError]=useState('');
 const selected=useMemo(()=>pages.find(p=>p.id===selectedId)||pages[0],[pages,selectedId]);
 const refresh=useCallback(async()=>{setLoading(true);try{const loaded=await loadGuidePages();setPages(loaded);setSelectedId(loaded[0]?.id||'');setDeletedIds([]);setError('');}catch(e){setError(e instanceof Error?e.message:'دریافت محتوا ناموفق بود.');}finally{setLoading(false);}},[]);
 useEffect(()=>{void refresh();},[refresh]);
 const updatePage=(patch:Partial<GuidePage>)=>setPages(current=>current.map(p=>p.id===selectedId?{...p,...patch}:p));
 const updateSection=(index:number,patch:Partial<GuideSection>)=>{if(!selected)return;updatePage({sections:selected.sections.map((s,i)=>i===index?{...s,...patch}:s)});};
 const addPage=()=>{const title=window.prompt('نام صفحه راهنمای جدید را وارد کنید:')?.trim();if(!title)return;const page:GuidePage={id:makeId(title),title,summary:'توضیح کوتاهی درباره این صفحه وارد کنید.',sections:[emptySection()]};setPages(current=>[...current,page]);setSelectedId(page.id);setMessage('صفحه جدید ایجاد شد؛ توضیحات آن را تکمیل و ذخیره کنید.');setError('');};
 const deletePage=()=>{if(!selected)return;if(!window.confirm(`صفحه «${selected.title}» و تمام بخش‌ها و توضیحات آن حذف شود؟ این حذف پس از ذخیره نهایی می‌شود.`))return;const id=selected.id;const next=pages.filter(p=>p.id!==id);setPages(next);setSelectedId(next[0]?.id||'');setDeletedIds(current=>[...current,id]);setMessage('صفحه برای حذف علامت‌گذاری شد؛ برای اعمال نهایی، ذخیره را بزنید.');setError('');};
 const renamePage=()=>{if(!selected)return;const title=window.prompt('نام جدید صفحه:',selected.title)?.trim();if(title)updatePage({title});};
 const addSection=()=>{if(!selected)return;updatePage({sections:[...selected.sections,emptySection()]});setMessage('بخش جدید اضافه شد؛ کارت‌های توضیحات آن را تکمیل کنید.');};
 const deleteSection=(index:number)=>{if(!selected)return;const section=selected.sections[index];if(!window.confirm(`بخش «${section.title}» و تمام توضیحات آن حذف شود؟`))return;updatePage({sections:selected.sections.filter((_,i)=>i!==index)});setMessage('بخش و توضیحات وابسته به آن حذف شد؛ برای ثبت نهایی ذخیره را بزنید.');};
 const save=async()=>{setBusy(true);setMessage('');setError('');try{await saveGuidePages(pages,deletedIds);setDeletedIds([]);setMessage('تمام تغییرات صفحات و بخش‌ها ذخیره شد و در راهنمای کاربران قابل مشاهده است.');}catch(e){setError(e instanceof Error?e.message:'ذخیره محتوا ناموفق بود.');}finally{setBusy(false);}};
 if(loading)return <div className="p-8 text-center text-gray-500">در حال دریافت صفحات راهنما…</div>;
 return <div className="space-y-5" dir="rtl">
  <div className="rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-5"><h2 className="text-xl font-black">مدیریت راهنمای جامع نرم‌افزار</h2><p className="mt-2 text-sm leading-7 text-gray-500">امکان افزودن، حذف و تغییر نام صفحه‌ها و بخش‌ها وجود دارد. هر بخش دارای کارت‌های کاربرد، روش استفاده، تفسیر اطلاعات و نکات محدودیت است. همه تغییرات با دکمه ذخیره ثبت می‌شوند.</p></div>
  <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
   <aside className="rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-3">
    <div className="flex items-center justify-between gap-2 px-2 py-2"><h3 className="text-sm font-bold">صفحات راهنما</h3><button onClick={addPage} className="rounded-lg bg-cyan-600 px-3 py-2 text-xs font-bold text-white">+ افزودن صفحه</button></div>
    <div className="max-h-[65vh] space-y-1 overflow-y-auto">{pages.map(p=><button key={p.id} onClick={()=>{setSelectedId(p.id);setMessage('');setError('');}} className={`w-full rounded-xl px-3 py-3 text-right text-sm ${selectedId===p.id?'bg-cyan-50 font-bold text-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-200':'hover:bg-gray-100 dark:hover:bg-gray-800'}`}>{p.title}<span className="mt-1 block text-xs font-normal text-gray-500">{p.sections.length} بخش</span></button>)}</div>
   </aside>
   <div className="min-w-0 space-y-4">
    {selected ? <>
     <section className="rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-black">مشخصات صفحه</h3><div className="flex gap-2"><button onClick={renamePage} className="rounded-lg border border-[var(--card-border-color)] px-3 py-2 text-xs font-bold">تغییر نام</button><button onClick={deletePage} className="rounded-lg border border-red-300 px-3 py-2 text-xs font-bold text-red-600">حذف صفحه</button></div></div>
      <label className="mb-2 mt-4 block text-sm font-bold">عنوان صفحه</label><input value={selected.title} onChange={e=>updatePage({title:e.target.value})} className="w-full rounded-xl border border-[var(--card-border-color)] bg-transparent px-3 py-2.5"/>
      <label className="mb-2 mt-4 block text-sm font-bold">معرفی صفحه</label><textarea rows={3} value={selected.summary} onChange={e=>updatePage({summary:e.target.value})} className="w-full rounded-xl border border-[var(--card-border-color)] bg-transparent p-3 leading-7"/>
     </section>
     <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-black">بخش‌های این صفحه</h3><button onClick={addSection} className="rounded-xl border border-cyan-500 px-4 py-2 text-sm font-bold text-cyan-700 dark:text-cyan-300">+ افزودن بخش جدید</button></div>
     {selected.sections.map((section,index)=><section key={index} className="space-y-3 rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-5">
      <div className="flex items-center justify-between gap-3"><h3 className="font-black">بخش {(index+1).toLocaleString('fa-IR')}</h3><button onClick={()=>deleteSection(index)} className="rounded-lg border border-red-300 px-3 py-2 text-xs font-bold text-red-600">حذف این بخش</button></div>
      <Field label="نام بخش / کارت / زیرتب" value={section.title} onChange={title=>updateSection(index,{title})}/>
      <Field label="کاربرد این بخش" value={section.purpose} onChange={purpose=>updateSection(index,{purpose})} multiline/>
      <Field label="روش استفاده" value={section.usage} onChange={usage=>updateSection(index,{usage})} multiline/>
      <Field label="تفسیر اطلاعات، اعداد و نمودارها" value={section.interpretation} onChange={interpretation=>updateSection(index,{interpretation})} multiline/>
      <Field label="نکات و محدودیت‌ها" value={section.cautions} onChange={cautions=>updateSection(index,{cautions})} multiline/>
     </section>)}
     {selected.sections.length===0&&<div className="rounded-xl border border-dashed border-[var(--card-border-color)] p-6 text-center text-sm text-gray-500">هنوز بخشی برای این صفحه تعریف نشده است؛ از دکمه افزودن بخش جدید استفاده کنید.</div>}
    </> : <div className="rounded-2xl border border-dashed border-[var(--card-border-color)] p-8 text-center text-gray-500">صفحه‌ای وجود ندارد. یک صفحه جدید اضافه کنید.</div>}
    <div className="sticky bottom-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-4 shadow-lg"><div className="text-sm">{error&&<span className="text-red-600">{error}</span>}{message&&<span className="text-green-600">{message}</span>}</div><button onClick={()=>void save()} disabled={busy} className="rounded-xl bg-cyan-600 px-6 py-3 text-sm font-bold text-white disabled:opacity-50">{busy?'در حال ذخیره…':'ذخیره تغییرات راهنما'}</button></div>
   </div>
  </div>
 </div>;
};
const Field:React.FC<{label:string;value:string;onChange:(value:string)=>void;multiline?:boolean}> = ({label,value,onChange,multiline})=><label className="block"><span className="mb-2 block text-xs font-bold text-gray-600 dark:text-gray-300">{label}</span>{multiline?<textarea rows={3} value={value} onChange={e=>onChange(e.target.value)} className="w-full rounded-xl border border-[var(--card-border-color)] bg-transparent p-3 text-sm leading-7"/>:<input value={value} onChange={e=>onChange(e.target.value)} className="w-full rounded-xl border border-[var(--card-border-color)] bg-transparent px-3 py-2.5 text-sm"/>}</label>;
export default AdminComprehensiveGuide;
