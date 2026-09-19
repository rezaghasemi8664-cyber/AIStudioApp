import * as api from './apiClient';

export interface WordPressFarazSmsStatus {
  reachable:boolean;
  wordpressUrl:string;
  status:number;
}

function unwrap<T>(r:{success?:boolean;data?:T;message?:string},fallback:string):T{
  if(!r.success||r.data===undefined) throw new Error(r.message||fallback);
  return r.data;
}

export async function getStatus():Promise<WordPressFarazSmsStatus>{
  return unwrap(await api.get<WordPressFarazSmsStatus>('/admin/faraz-sms/status'),'دریافت وضعیت Faraz SMS ناموفق بود.');
}
