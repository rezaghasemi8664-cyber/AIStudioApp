import api from '../api/apiClient';
export type JournalSide='BUY'|'SELL';
export interface TraderJournalEntry{id:string;symbol:string;side:JournalSide;tradeDate:string;quantity:number;entryPrice:number;exitPrice:number|null;pnl:number|null;setup:string;emotion:string;thesis:string;lesson:string;notes:string;createdAt:string;updatedAt:string}
const unwrap=(r:any)=>(r?.data?.data??r?.data??r);
export async function getJournal(){const r=await api.get('/trader-journal');const d=unwrap(r);return Array.isArray(d)?d as TraderJournalEntry[]:[]}
export async function createJournalEntry(x:Omit<TraderJournalEntry,'id'|'createdAt'|'updatedAt'|'pnl'>){return unwrap(await api.post('/trader-journal',x)) as TraderJournalEntry}
export async function updateJournalEntry(id:string,x:Partial<TraderJournalEntry>){return unwrap(await api.put('/trader-journal/'+encodeURIComponent(id),x)) as TraderJournalEntry}
export async function deleteJournalEntry(id:string){await api.delete('/trader-journal/'+encodeURIComponent(id))}
