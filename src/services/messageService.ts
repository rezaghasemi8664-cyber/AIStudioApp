// src/services/messageService.ts
import type { DirectMessage, StoredUser } from '../types';
import { appApiFetch } from './apiConfigService';

type ApiMessage = {
  id:number; senderId:number|null; receiverId:number|null; content:string|null; createdAt:string|null;
  sender?:{id:number;username:string;name:string|null;avatar:string|null};
  receiver?:{id:number;username:string;name:string|null;avatar:string|null};
};
const encodeContent=(message:string,attachment?:DirectMessage['attachment'])=>attachment?JSON.stringify({__roniyaMessage:1,text:message,attachment}):message;
const decodeContent=(content:string|null)=>{
  if(!content) return {text:'',attachment:undefined};
  try{const p=JSON.parse(content);if(p&&p.__roniyaMessage===1)return {text:String(p.text||''),attachment:p.attachment};}catch{}
  return {text:content,attachment:undefined};
};
const mapMessage=(m:ApiMessage):DirectMessage=>{
  const d=decodeContent(m.content);
  return {id:String(m.id),senderId:String(m.senderId??''),senderUsername:m.sender?.username||'',message:d.text,timestamp:m.createdAt?new Date(m.createdAt).getTime():Date.now(),readByAdmin:false,attachment:d.attachment};
};
export const sendMessageToAdmin=async(user:StoredUser,message:string,attachment?:DirectMessage['attachment']):Promise<DirectMessage>=>{
  const r=await appApiFetch<{success:boolean;data:ApiMessage}>('/messages',{method:'POST',body:JSON.stringify({content:encodeContent(message,attachment),toAdmin:true})});
  if(!r?.data)throw new Error('پیام در سرور ثبت نشد.');
  return mapMessage(r.data);
};
export const getAllMessages=async():Promise<DirectMessage[]>=>{
  const r=await appApiFetch<{success:boolean;data:ApiMessage[]}>('/messages?limit=100',{method:'GET'});
  return (Array.isArray(r?.data)?r.data:[]).map(mapMessage).sort((a,b)=>b.timestamp-a.timestamp);
};
export const sendMessageToUser=async(receiverId:string|number,message:string):Promise<DirectMessage>=>{
  const r=await appApiFetch<{success:boolean;data:ApiMessage}>('/messages',{method:'POST',body:JSON.stringify({receiverId:Number(receiverId),content:message})});
  if(!r?.data)throw new Error('پیام در سرور ثبت نشد.');
  return mapMessage(r.data);
};
export const sendReplyToUser=async(messageId:string,replyMessage:string):Promise<DirectMessage>=>{
  const r=await appApiFetch<{success:boolean;data:ApiMessage}>(`/messages/${encodeURIComponent(messageId)}/reply`,{method:'POST',body:JSON.stringify({text:replyMessage})});
  if(!r?.data)throw new Error('پاسخ در سرور ثبت نشد.');
  return mapMessage(r.data);
};
export const deleteMessagesByAdmin=async(ids:string[]):Promise<number>=>{const normalized=[...new Set(ids.map(id=>Number(id)).filter(id=>Number.isInteger(id)&&id>0))];if(!normalized.length)return 0;const r=await appApiFetch<{success:boolean;deletedCount?:number;message?:string}>('/messages/admin/bulk',{method:'DELETE',body:JSON.stringify({ids:normalized})});if(!r?.success)throw new Error(r?.message||'حذف پیام‌ها ناموفق بود.');return Number(r.deletedCount||0);};
export const getUnreadMessageCountForAdmin=async():Promise<number>=>{
  const r=await appApiFetch<{success:boolean;data:{count:number}}>('/messages/unread-count',{method:'GET'});
  return Number(r?.data?.count||0);
};
export const markAsReadByAdmin=async(messageId:string):Promise<DirectMessage>=>{
  const messages=await getAllMessages(); const found=messages.find(m=>m.id===messageId); if(!found)throw new Error('پیام یافت نشد.'); return found;
};
export const deleteAttachment=async(messageId:string):Promise<DirectMessage>=>{
  const messages=await getAllMessages(); const found=messages.find(m=>m.id===messageId); if(!found)throw new Error('پیام یافت نشد.'); return {...found,attachment:undefined};
};
