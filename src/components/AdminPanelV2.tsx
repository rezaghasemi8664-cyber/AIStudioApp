import React,{useState} from 'react';
import AdminPanel from './AdminPanel';
import AdminAnalysesPanel from './AdminAnalysesPanel';
interface Props{isOnline:boolean;onMessageUpdate:()=>void;onlineCount:number}
export default function AdminPanelV2(props:Props){const[analysisMode,setAnalysisMode]=useState(false);return <div className="space-y-4"><div dir="rtl" className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-2"><button onClick={()=>setAnalysisMode(false)} className={!analysisMode?'rounded-xl bg-cyan-600 px-4 py-2 text-white font-semibold':'rounded-xl px-4 py-2 text-sm'}>پنل مدیریت</button><button onClick={()=>setAnalysisMode(true)} className={analysisMode?'rounded-xl bg-cyan-600 px-4 py-2 text-white font-semibold':'rounded-xl px-4 py-2 text-sm'}>مدیریت تحلیل‌ها</button></div>{analysisMode?<AdminAnalysesPanel/>:<AdminPanel {...props}/>}</div>}
