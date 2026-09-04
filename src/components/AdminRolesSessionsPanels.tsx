import React, { useEffect, useMemo, useState } from 'react';
import * as apiClient from '../services/apiClient';
import * as adminActionsService from '../services/adminActionsService';
import type { AdminModuleKey } from '../services/adminControlService';

interface Props { moduleKey: AdminModuleKey; onComplete: () => Promise<void> | void; }
interface Role { id:number; name:string; title?:string|null; userCount:number; permissionCount:number; }
interface Permission { id:number; key:string; assigned:boolean; }
interface Session { id:number; userId:number; username?:string|null; email?:string|null; createdAt?:string|null; }

const card='rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-5';
const input='w-full rounded-xl border border-[var(--card-border-color)] bg-transparent px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-cyan-500/30';
const permissionLabels:Record<string,string>={
 dashboard:'داشبورد',users:'کاربران',subscriptions:'اشتراک‌ها',analysis:'تحلیل‌ها',market:'بازار',scalping:'نوسان‌گیری',ai:'هوش مصنوعی',prompts:'پرامپت‌ها',history:'تاریخچه تحلیل',notifications:'اعلان‌ها',monitoring:'پایش سامانه',reports:'گزارش‌ها',security:'امنیت',settings:'تنظیمات',maintenance:'تعمیرات',updates:'به‌روزرسانی',backup:'پشتیبان‌گیری',payments:'پرداخت‌ها',roles:'نقش‌ها و مجوزها',audit:'گزارش رویدادها',sessions:'نشست‌ها',api:'کلیدهای API',infrastructure:'زیرساخت'
};
const actionLabel=(key:string)=>key.replace(/^admin\./,'').split('.').map((part)=>permissionLabels[part]||part).join(' — ');
const dateFmt=(v?:string|null)=>v?new Date(v).toLocaleString('fa-IR'):'—';

const AdminRolesSessionsPanels:React.FC<Props>=({moduleKey,onComplete})=>{
 const [roles,setRoles]=useState<Role[]>([]);
 const [selectedRole,setSelectedRole]=useState<number|null>(null);
 const [permissions,setPermissions]=useState<Permission[]>([]);
 const [sessions,setSessions]=useState<Session[]>([]);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState<string|null>(null);
 const [message,setMessage]=useState<string|null>(null);

 const selectedRoleInfo=useMemo(()=>roles.find(r=>r.id===selectedRole),[roles,selectedRole]);

 const loadRoles=async()=>{
  const response=await apiClient.get<Role[]>('/admin-rbac/roles');
  if(!response.success||!response.data) throw new Error(response.message||'دریافت نقش‌ها ناموفق بود.');
  setRoles(response.data);
  if(selectedRole===null&&response.data.length) setSelectedRole(response.data[0].id);
 };
 const loadPermissions=async(roleId:number)=>{
  const response=await apiClient.get<Permission[]>(`/admin-rbac/roles/${roleId}/permissions`);
  if(!response.success||!response.data) throw new Error(response.message||'دریافت مجوزهای نقش ناموفق بود.');
  setPermissions(response.data);
 };
 const loadSessions=async()=>{
  const result=await adminActionsService.executeAction<Session[]>('sessions','list-sessions');
  setSessions(Array.isArray(result)?result:[]);
 };
 const refresh=async()=>{
  setBusy(true);setError(null);setMessage(null);
  try{ if(moduleKey==='roles'){await loadRoles();} else {await loadSessions();} }
  catch(e){setError(e instanceof Error?e.message:'دریافت اطلاعات ناموفق بود.');}
  finally{setBusy(false);}
 };
 useEffect(()=>{void refresh();},[moduleKey]);
 useEffect(()=>{if(moduleKey==='roles'&&selectedRole!==null){setBusy(true);setError(null);void loadPermissions(selectedRole).catch(e=>setError(e instanceof Error?e.message:'دریافت مجوزها ناموفق بود.')).finally(()=>setBusy(false));}},[selectedRole,moduleKey]);

 const togglePermission=(key:string)=>setPermissions(current=>current.map(p=>p.key===key?{...p,assigned:!p.assigned}:p));
 const savePermissions=async()=>{
  if(!selectedRole)return;
  setBusy(true);setError(null);setMessage(null);
  try{
   const response=await apiClient.put(`/admin-rbac/roles/${selectedRole}/permissions`,{permissionKeys:permissions.filter(p=>p.assigned).map(p=>p.key)});
   if(!response.success)throw new Error(response.message||'ذخیره مجوزها ناموفق بود.');
   setMessage('مجوزهای نقش با موفقیت ذخیره شد.');await loadRoles();await onComplete();
  }catch(e){setError(e instanceof Error?e.message:'ذخیره مجوزها ناموفق بود.');}
  finally{setBusy(false);}
 };
 const revokeSession=async(id:number)=>{
  if(!window.confirm('آیا از لغو این نشست مطمئن هستید؟'))return;
  setBusy(true);setError(null);setMessage(null);
  try{await adminActionsService.executeAction('sessions','revoke-session',{sessionId:id});setMessage('نشست با موفقیت لغو شد.');await loadSessions();await onComplete();}
  catch(e){setError(e instanceof Error?e.message:'لغو نشست ناموفق بود.');}
  finally{setBusy(false);}
 };
 const revokeAll=async(userId:number)=>{
  if(!window.confirm('همه نشست‌های این کاربر لغو شوند؟'))return;
  setBusy(true);setError(null);setMessage(null);
  try{await adminActionsService.executeAction('sessions','revoke-all-user-sessions',{userId});setMessage('همه نشست‌های کاربر لغو شد.');await loadSessions();await onComplete();}
  catch(e){setError(e instanceof Error?e.message:'لغو نشست‌ها ناموفق بود.');}
  finally{setBusy(false);}
 };

 if(moduleKey==='roles')return <div className={card} dir="rtl">
  <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-bold">نقش‌ها و مجوزها</h3><p className="mt-1 text-sm text-gray-500">مجوزها را برای هر نقش به‌صورت دقیق تعیین کنید. نقش SUPERADMIN قابل تغییر نیست.</p></div><button disabled={busy} onClick={()=>void refresh()} className="rounded-xl border px-4 py-2 text-sm">به‌روزرسانی</button></div>
  <div className="grid grid-cols-1 gap-5 lg:grid-cols-[280px_1fr]">
   <div className="space-y-2">{roles.map(role=><button key={role.id} onClick={()=>setSelectedRole(role.id)} className={`w-full rounded-xl border p-3 text-right transition ${selectedRole===role.id?'border-cyan-500 bg-cyan-500/10':'border-[var(--card-border-color)]'}`}><div className="font-semibold">{role.title||role.name}</div><div className="mt-1 text-xs text-gray-500">{role.userCount.toLocaleString('fa-IR')} کاربر · {role.permissionCount.toLocaleString('fa-IR')} مجوز</div></button>)}{roles.length===0&&<div className="rounded-xl border p-4 text-sm text-gray-500">نقشی ثبت نشده است.</div>}</div>
   <div><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h4 className="font-bold">مجوزهای {selectedRoleInfo?.title||selectedRoleInfo?.name||'نقش'}</h4><p className="text-xs text-gray-500">{permissions.filter(p=>p.assigned).length.toLocaleString('fa-IR')} مجوز فعال از {permissions.length.toLocaleString('fa-IR')}</p></div><button disabled={busy||!selectedRole||selectedRoleInfo?.name?.toUpperCase()==='SUPERADMIN'} onClick={()=>void savePermissions()} className="rounded-xl bg-cyan-600 px-5 py-2.5 font-semibold text-white disabled:opacity-50">ذخیره مجوزها</button></div>
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">{permissions.map(p=><label key={p.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${p.assigned?'border-cyan-500/50 bg-cyan-500/5':'border-[var(--card-border-color)]'}`}><input type="checkbox" checked={p.assigned} disabled={busy||selectedRoleInfo?.name?.toUpperCase()==='SUPERADMIN'} onChange={()=>togglePermission(p.key)} className="h-4 w-4"/><span className="text-sm">{actionLabel(p.key)}</span></label>)}</div>
   </div>
  </div>
  {message&&<p className="mt-4 text-sm text-green-600">{message}</p>}{error&&<p className="mt-4 text-sm text-red-600">{error}</p>}
 </div>;

 return <div className={card} dir="rtl">
  <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-bold">مدیریت نشست‌ها</h3><p className="mt-1 text-sm text-gray-500">نشست‌های فعال را مشاهده و در صورت نیاز لغو کنید. Token هرگز نمایش داده نمی‌شود.</p></div><button disabled={busy} onClick={()=>void refresh()} className="rounded-xl border px-4 py-2 text-sm">به‌روزرسانی</button></div>
  <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3"><div className="rounded-xl border p-4"><div className="text-xs text-gray-500">نشست‌های ثبت‌شده</div><div className="mt-1 text-2xl font-bold">{sessions.length.toLocaleString('fa-IR')}</div></div><div className="rounded-xl border p-4"><div className="text-xs text-gray-500">کاربران دارای نشست</div><div className="mt-1 text-2xl font-bold">{new Set(sessions.map(s=>s.userId)).size.toLocaleString('fa-IR')}</div></div><div className="rounded-xl border p-4"><div className="text-xs text-gray-500">آخرین ایجاد</div><div className="mt-1 text-sm font-semibold">{dateFmt(sessions[0]?.createdAt)}</div></div></div>
  <div className="overflow-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b"><th className="p-3 text-right">شناسه نشست</th><th className="p-3 text-right">کاربر</th><th className="p-3 text-right">تاریخ ایجاد</th><th className="p-3 text-right">عملیات</th></tr></thead><tbody>{sessions.map(s=><tr key={s.id} className="border-b"><td className="p-3" dir="ltr">{s.id}</td><td className="p-3">{s.username||s.email||`کاربر ${s.userId}`} <span className="text-xs text-gray-500">(شناسه {s.userId})</span></td><td className="p-3">{dateFmt(s.createdAt)}</td><td className="p-3"><div className="flex flex-wrap gap-2"><button disabled={busy} onClick={()=>void revokeSession(s.id)} className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-600">لغو نشست</button><button disabled={busy} onClick={()=>void revokeAll(s.userId)} className="rounded-lg border border-amber-500/40 px-3 py-1.5 text-xs font-semibold text-amber-600">لغو همه نشست‌ها</button></div></td></tr>)}</tbody></table>{sessions.length===0&&<div className="py-8 text-center text-sm text-gray-500">نشست فعالی پیدا نشد.</div>}</div>
  {message&&<p className="mt-4 text-sm text-green-600">{message}</p>}{error&&<p className="mt-4 text-sm text-red-600">{error}</p>}
 </div>;
};
export default AdminRolesSessionsPanels;
