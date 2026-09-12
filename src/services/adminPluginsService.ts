import * as api from './apiClient';

export interface AdminPlugin { id:string; name:string; version:string; description:string; main?:string|null; installedAt:string; updatedAt:string; status:'installed'|'invalid'; }

function unwrap<T>(r:{success?:boolean;data?:T;message?:string}, fallback:string):T { if(!r.success || r.data===undefined) throw new Error(r.message||fallback); return r.data; }

export async function listPlugins():Promise<AdminPlugin[]> { return unwrap(await api.get<AdminPlugin[]>('/plugins'),'دریافت فهرست افزونه‌ها ناموفق بود.'); }
export async function installPlugin(file:File):Promise<AdminPlugin> {
  const form=new FormData(); form.append('file',file,file.name);
  return unwrap(await api.post<AdminPlugin>('/plugins/install',form),'نصب افزونه ناموفق بود.');
}
