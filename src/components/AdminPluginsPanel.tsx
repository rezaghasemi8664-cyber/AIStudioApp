import React,{useCallback,useEffect,useRef,useState} from 'react';
import * as pluginService from '../services/adminPluginsService';
import * as farazSmsService from '../services/wordpressFarazSmsService';

const AdminPluginsPanel:React.FC=()=>{
 const inputRef=useRef<HTMLInputElement>(null); const [file,setFile]=useState<File|null>(null); const [items,setItems]=useState<pluginService.AdminPlugin[]>([]); const [loading,setLoading]=useState(true); const [busy,setBusy]=useState(false); const [error,setError]=useState<string|null>(null); const [message,setMessage]=useState<string|null>(null); const [farazReachable,setFarazReachable]=useState<boolean|null>(null);
 const load=useCallback(async()=>{setLoading(true);setError(null);try{const [plugins,faraz]=await Promise.all([pluginService.listPlugins(),farazSmsService.getStatus().catch(()=>null)]);setItems(plugins);setFarazReachable(faraz?.reachable??false);}catch(e){setError(e instanceof Error?e.message:'دریافت افزونه‌ها ناموفق بود.');setFarazReachable(false);}finally{setLoading(false);}},[]);
 useEffect(()=>{void load();},[load]);
 const choose=(e:React.ChangeEvent<HTMLInputElement>)=>{const f=e.target.files?.[0]||null;setFile(f);setMessage(null);setError(null);};
 const install=async()=>{if(!file)return;setBusy(true);setError(null);setMessage(null);try{const p=await pluginService.installPlugin(file);setMessage(`افزونه «${p.name}» نسخه ${p.version} با موفقیت نصب شد.`);setFile(null);if(inputRef.current)inputRef.current.value='';await load();}catch(e){setError(e instanceof Error?e.message:'نصب افزونه ناموفق بود.');}finally{setBusy(false);}};
 return <div className="space-y-5">
  <div className="rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-5 shadow-sm">
   <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between"><div><h2 className="text-lg font-bold">مدیریت افزونه‌ها</h2><p className="mt-1 text-sm text-gray-500">افزونه‌های سامانه و افزونه‌های متصل به WordPress را از همین بخش مدیریت کنید.</p></div><span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-300">حداکثر ۲۵ مگابایت</span></div>
   <div className="mt-5 rounded-xl border border-dashed border-[var(--card-border-color)] p-5">
    <input ref={inputRef} type="file" accept=".zip,.js,.cjs,.json" onChange={choose} className="block w-full text-sm"/>
    {file&&<div className="mt-3 rounded-xl bg-gray-50 p-3 text-sm dark:bg-gray-800/60"><b>{file.name}</b><span className="mr-3 text-gray-500">{(file.size/1024/1024).toFixed(2)} مگابایت</span></div>}
    <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={!file||busy} onClick={()=>void install()} className="rounded-xl bg-cyan-600 px-5 py-2.5 font-semibold text-white disabled:opacity-50">{busy?'در حال نصب…':'نصب افزونه'}</button><button type="button" disabled={busy} onClick={()=>void load()} className="rounded-xl border border-[var(--card-border-color)] px-5 py-2.5 font-semibold">به‌روزرسانی فهرست</button></div>
   </div>
   <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">ZIP لازم نیست <b>manifest.json</b> داشته باشد. در صورت نبود manifest، اطلاعات پایه افزونه هنگام نصب به‌صورت خودکار ساخته می‌شود.</div>
   {message&&<div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">{message}</div>}
   {error&&<div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
  </div>
  <div className="rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-5 shadow-sm">
   <div className="flex items-center justify-between"><h3 className="font-bold">افزونه‌های نصب‌شده و متصل</h3><span className="rounded-full bg-gray-100 px-3 py-1 text-xs dark:bg-gray-800">{(items.length+1).toLocaleString('fa-IR')} افزونه</span></div>
   <div className="mt-4 overflow-x-auto"><table className="w-full text-right text-sm"><thead><tr className="border-b border-[var(--card-border-color)]"><th className="p-3">نام</th><th className="p-3">شناسه</th><th className="p-3">نسخه</th><th className="p-3">نوع</th><th className="p-3">وضعیت</th><th className="p-3">عملیات</th></tr></thead><tbody>
    <tr className="border-b border-[var(--card-border-color)] bg-cyan-50/30 dark:bg-cyan-950/10"><td className="p-3 font-semibold">Faraz SMS<div className="text-xs text-gray-500">افزونه پیامک نصب‌شده در WordPress</div></td><td className="p-3 font-mono text-xs ltr" dir="ltr">faraz-sms</td><td className="p-3">3.22.212</td><td className="p-3">WordPress</td><td className="p-3"><span className={`rounded-full px-2.5 py-1 text-xs ${farazReachable?'bg-green-100 text-green-700':'bg-amber-100 text-amber-700'}`}>{farazReachable?'فعال و متصل':'WordPress در دسترس نیست'}</span></td><td className="p-3"><button type="button" disabled={!farazReachable} className="rounded-lg border border-cyan-300 px-3 py-1.5 text-xs font-semibold text-cyan-700 disabled:cursor-not-allowed disabled:opacity-50">باز کردن افزونه</button></td></tr>
    {items.map(p=><tr key={p.id} className="border-b border-[var(--card-border-color)] last:border-0"><td className="p-3 font-semibold">{p.name}<div className="text-xs text-gray-500">{p.description}</div></td><td className="p-3 font-mono text-xs ltr" dir="ltr">{p.id}</td><td className="p-3">{p.version}</td><td className="p-3">Roniya</td><td className="p-3"><span className={`rounded-full px-2.5 py-1 text-xs ${p.status==='installed'?'bg-green-100 text-green-700':'bg-red-100 text-red-700'}`}>{p.status==='installed'?'نصب‌شده':'نامعتبر'}</span></td><td className="p-3">—</td></tr>)}
   </tbody></table></div>
   {!loading&&items.length===0&&<div className="mt-4 text-center text-sm text-gray-500">افزونه Roniya دیگری نصب نشده است.</div>}
   {loading&&<div className="mt-4 py-4 text-center text-sm text-gray-500">در حال بررسی وضعیت WordPress و دریافت فهرست افزونه‌ها…</div>}
  </div>
 </div>;
};
export default AdminPluginsPanel;
