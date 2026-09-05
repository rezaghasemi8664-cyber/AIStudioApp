import * as apiClient from './apiClient';

export const ADMIN_MODULES = ['dashboard','users','subscriptions','analysis','market','scalping','ai','prompts','history','notifications','monitoring','reports','security','settings','maintenance','updates','backup','payments','roles','audit','sessions','api','infrastructure'] as const;
export type AdminModuleKey = typeof ADMIN_MODULES[number];
export interface AdminModuleRecord { id:number; moduleKey:AdminModuleKey; title:string; enabled:boolean; config:Record<string,unknown>; version:number; updatedBy?:number|null; createdAt?:string; updatedAt?:string; }
export interface AdminSummary { users:number; activeUsers:number; analyses:number; apiKeys:number; notifications:number; sessions:number; auditEvents:number; moduleCount:number; }
export interface AdminAuditRecord extends Record<string,unknown> { id:number|string; adminUserId?:number|null; username?:string|null; email?:string|null; action:string; moduleKey?:string|null; targetId?:string|null; method?:string|null; path?:string|null; statusCode?:number|null; ipAddress?:string|null; details?:unknown; createdAt?:string|null; }
export interface AdminAuditFilters { moduleKey?:AdminModuleKey|string; action?:string; status?:number|string; adminUserId?:number|string; from?:string; to?:string; }
export interface AdminAuditStats { total:number; successful:number; failed:number; last24h:number; }
export interface AdminAuditPage { data:AdminAuditRecord[]; pagination:{limit:number;offset:number;total:number}; stats?:AdminAuditStats; }
function message<T>(response:{success?:boolean;message?:string;data?:T},fallback:string):T { if(!response.success||response.data===undefined)throw new Error(response.message||fallback); return response.data; }
export async function getModules():Promise<AdminModuleRecord[]> { return message(await apiClient.get<AdminModuleRecord[]>('/admin-control/modules'),'دریافت ماژول‌های مدیریت ناموفق بود.'); }
export async function getModule(moduleKey:AdminModuleKey):Promise<AdminModuleRecord> { return message(await apiClient.get<AdminModuleRecord>(`/admin-control/modules/${moduleKey}`),'دریافت تنظیمات ماژول ناموفق بود.'); }
export async function updateModule(moduleKey:AdminModuleKey,enabled:boolean,config:Record<string,unknown>):Promise<AdminModuleRecord> { return message(await apiClient.put<AdminModuleRecord>(`/admin-control/modules/${moduleKey}`,{enabled,config}),'ذخیره تنظیمات ماژول ناموفق بود.'); }
export async function getAuditPage(limit=100,offset=0,filters:AdminAuditFilters={}):Promise<AdminAuditPage> {
 const safeLimit=Math.min(Math.max(limit,1),200); const safeOffset=Math.max(offset,0);
 const params=new URLSearchParams({limit:String(safeLimit),offset:String(safeOffset)});
 Object.entries(filters).forEach(([k,v])=>{if(v!==undefined&&v!==null&&String(v).trim()!=='')params.set(k,String(v));});
 const r=await apiClient.get<AdminAuditRecord[]>(`/admin-control/audit?${params.toString()}`);
 if(!r.success||r.data===undefined)throw new Error(r.message||'دریافت Audit Log ناموفق بود.');
 const raw=r as typeof r & {pagination?:AdminAuditPage['pagination'];stats?:AdminAuditStats};
 return {data:r.data,pagination:raw.pagination||{limit:safeLimit,offset:safeOffset,total:r.data.length},stats:raw.stats};
}
export async function getAudit(limit=100,offset=0,filters:AdminAuditFilters={}):Promise<AdminAuditRecord[]> { return (await getAuditPage(limit,offset,filters)).data; }
export async function getSummary():Promise<AdminSummary> { return message(await apiClient.get<AdminSummary>('/admin-control/summary'),'دریافت آمار مدیریتی ناموفق بود.'); }
export default {getModules,getModule,updateModule,getAudit,getAuditPage,getSummary};
