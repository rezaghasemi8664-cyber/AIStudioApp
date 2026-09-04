// =============================================================================
// src/services/adminService.ts
// Admin Service — Backend Only
// =============================================================================

import * as apiClient from './apiClient';
import type { AdminDashboardStats, AdminUserListItem, ApiResponse } from '../types';

export type UserId = string | number;

export interface AdminCreateUserPayload {
  username: string; password: string; email?: string | null; name?: string | null;
  firstName?: string | null; lastName?: string | null; phone?: string | null; mobile?: string | null;
  nationalId?: string | null; bio?: string | null; avatar?: string | null; roleId?: number | null;
  isActive?: boolean; analysisLimit?: number | null; analysisLimit24h?: number | null;
  subscriptionStart?: string | null; subscriptionEnd?: string | null; subscriptionDays?: number | null;
  subscriptionMonths?: number | null; isSubscriptionActive?: boolean;
}
export interface AdminUpdateUserPayload {
  username?: string; password?: string; email?: string | null; name?: string | null;
  firstName?: string | null; lastName?: string | null; phone?: string | null; mobile?: string | null;
  nationalId?: string | null; bio?: string | null; avatar?: string | null; roleId?: number | null;
  isActive?: boolean; analysisLimit?: number | null; analysisLimit24h?: number | null;
  subscriptionStart?: string | null; subscriptionEnd?: string | null; subscriptionDays?: number | null;
  subscriptionMonths?: number | null; isSubscriptionActive?: boolean;
}
export interface AdminUpdateSubscriptionData {
  userId: UserId; isSubscriptionActive?: boolean; subscriptionStart?: string | null;
  subscriptionEnd?: string | null; subscriptionDays?: number | null; subscriptionMonths?: number | null;
  analysisLimit?: number | null; analysisLimit24h?: number | null;
}
export interface AdminChangeRolePayload { roleId: number; }

const ADMIN_BASE = '/admin';
const USERS_BASE = `${ADMIN_BASE}/users`;
const assertUserId=(id:UserId)=>{if(id===null||id===undefined||String(id).trim()==='')throw new Error('شناسه کاربر معتبر نیست.');};
const encodeUserId=(id:UserId)=>{assertUserId(id);return encodeURIComponent(String(id).trim());};
const normalizeString=(v:unknown):string|undefined=>{if(typeof v!=='string')return undefined;const x=v.trim();return x||undefined;};
const normalizeNullableString=(v:unknown):string|null|undefined=>{if(v===undefined)return undefined;if(v===null)return null;if(typeof v!=='string')return undefined;const x=v.trim();return x||null;};
const normalizeNumber=(v:unknown):number|undefined=>{if(v===undefined||v===null||v==='')return undefined;const n=typeof v==='number'?v:Number(String(v).trim());return Number.isFinite(n)?n:undefined;};
const normalizeBoolean=(v:unknown):boolean|undefined=>{if(typeof v==='boolean')return v;if(v===undefined||v===null||v==='')return undefined;if(v==='true'||v==='1'||v===1)return true;if(v==='false'||v==='0'||v===0)return false;return undefined;};
const omitUndefined=<T extends Record<string,unknown>>(o:T):T=>Object.fromEntries(Object.entries(o).filter(([,v])=>v!==undefined)) as T;
const unwrapOrNull=<T>(r:ApiResponse<T>|null|undefined):T|null=>r?.success&&r.data!=null?r.data:null;
const errorMessage=(e:unknown,f:string)=>e instanceof Error&&e.message.trim()?e.message:f;

export async function getDashboard():Promise<AdminDashboardStats|null>{try{return unwrapOrNull(await apiClient.get<AdminDashboardStats>(`${ADMIN_BASE}/dashboard`));}catch(e){console.warn('[adminService] getDashboard failed:',e);return null;}}
export async function getUsers():Promise<AdminUserListItem[]>{try{const r=await apiClient.get<AdminUserListItem[]>(USERS_BASE);if(!r?.success)return [];if(Array.isArray(r.data))return r.data;const d=r.data as unknown;if(d&&typeof d==='object'){const u=(d as {users?:unknown}).users,i=(d as {items?:unknown}).items;if(Array.isArray(u))return u as AdminUserListItem[];if(Array.isArray(i))return i as AdminUserListItem[];}return [];}catch(e){console.warn('[adminService] getUsers failed:',e);return [];}}
export async function getUser(id:UserId):Promise<AdminUserListItem|null>{try{return unwrapOrNull(await apiClient.get<AdminUserListItem>(`${USERS_BASE}/${encodeUserId(id)}`));}catch(e){console.warn('[adminService] getUser failed:',e);return null;}}
export async function createUser(p:AdminCreateUserPayload):Promise<AdminUserListItem|null>{try{return unwrapOrNull(await apiClient.post<AdminUserListItem>(USERS_BASE,omitUndefined({username:normalizeString(p.username)||'',password:normalizeString(p.password)||'',email:normalizeNullableString(p.email),name:normalizeNullableString(p.name),firstName:normalizeNullableString(p.firstName),lastName:normalizeNullableString(p.lastName),phone:normalizeNullableString(p.phone),mobile:normalizeNullableString(p.mobile),nationalId:normalizeNullableString(p.nationalId),bio:normalizeNullableString(p.bio),avatar:normalizeNullableString(p.avatar),roleId:normalizeNumber(p.roleId),isActive:normalizeBoolean(p.isActive),analysisLimit:normalizeNumber(p.analysisLimit),analysisLimit24h:normalizeNumber(p.analysisLimit24h),subscriptionStart:normalizeNullableString(p.subscriptionStart),subscriptionEnd:normalizeNullableString(p.subscriptionEnd),subscriptionDays:normalizeNumber(p.subscriptionDays),subscriptionMonths:normalizeNumber(p.subscriptionMonths),isSubscriptionActive:normalizeBoolean(p.isSubscriptionActive)})));}catch(e){throw new Error(errorMessage(e,'ایجاد کاربر با خطا مواجه شد.'));}}
export async function updateUser(id:UserId,p:AdminUpdateUserPayload):Promise<AdminUserListItem|null>{try{return unwrapOrNull(await apiClient.put<AdminUserListItem>(`${USERS_BASE}/${encodeUserId(id)}`,omitUndefined({username:normalizeString(p.username),password:normalizeString(p.password),email:normalizeNullableString(p.email),name:normalizeNullableString(p.name),firstName:normalizeNullableString(p.firstName),lastName:normalizeNullableString(p.lastName),phone:normalizeNullableString(p.phone),mobile:normalizeNullableString(p.mobile),nationalId:normalizeNullableString(p.nationalId),bio:normalizeNullableString(p.bio),avatar:normalizeNullableString(p.avatar),roleId:normalizeNumber(p.roleId),isActive:normalizeBoolean(p.isActive),analysisLimit:normalizeNumber(p.analysisLimit),analysisLimit24h:normalizeNumber(p.analysisLimit24h),subscriptionStart:normalizeNullableString(p.subscriptionStart),subscriptionEnd:normalizeNullableString(p.subscriptionEnd),subscriptionDays:normalizeNumber(p.subscriptionDays),subscriptionMonths:normalizeNumber(p.subscriptionMonths),isSubscriptionActive:normalizeBoolean(p.isSubscriptionActive)})));}catch(e){throw new Error(errorMessage(e,'ویرایش کاربر با خطا مواجه شد.'));}}
export async function toggleUserActive(id:UserId,isActive:boolean):Promise<AdminUserListItem|null>{try{return unwrapOrNull(await apiClient.patch<AdminUserListItem>(`${USERS_BASE}/${encodeUserId(id)}/toggle-active`,{isActive:!!isActive}));}catch(e){throw new Error(errorMessage(e,'تغییر وضعیت فعال بودن کاربر با خطا مواجه شد.'));}}

/** Privileged role changes must go through RBAC, never the generic user update route. */
export async function changeUserRole(id:UserId,roleId:number):Promise<AdminUserListItem|null>{try{assertUserId(id);if(!Number.isInteger(roleId)||roleId<=0)throw new Error('شناسه نقش معتبر نیست.');const r=await apiClient.patch<{userId:UserId;roleId:number;roleName:string;roleTitle?:string|null}>(`/admin-rbac/users/${encodeUserId(id)}/role`,{roleId});if(!r?.success)throw new Error(r?.message||'تغییر نقش کاربر ناموفق بود.');return getUser(id);}catch(e){throw new Error(errorMessage(e,'تغییر نقش کاربر با خطا مواجه شد.'));}}

export async function deleteUser(id:UserId):Promise<boolean>{try{const r:ApiResponse<unknown>=await apiClient.del(`${USERS_BASE}/${encodeUserId(id)}`);return r?.success===true;}catch(e){throw new Error(errorMessage(e,'حذف کاربر با خطا مواجه شد.'));}}
export async function updateSubscription(d:AdminUpdateSubscriptionData):Promise<AdminUserListItem|null>{try{return unwrapOrNull(await apiClient.put<AdminUserListItem>(`${USERS_BASE}/${encodeUserId(d.userId)}/subscription`,omitUndefined({isSubscriptionActive:normalizeBoolean(d.isSubscriptionActive),subscriptionStart:normalizeNullableString(d.subscriptionStart),subscriptionEnd:normalizeNullableString(d.subscriptionEnd),subscriptionDays:normalizeNumber(d.subscriptionDays)??d.subscriptionDays,subscriptionMonths:normalizeNumber(d.subscriptionMonths)??d.subscriptionMonths,analysisLimit:normalizeNumber(d.analysisLimit)??d.analysisLimit,analysisLimit24h:normalizeNumber(d.analysisLimit24h)??d.analysisLimit24h})));}catch(e){throw new Error(errorMessage(e,'به‌روزرسانی اشتراک با خطا مواجه شد.'));}}
export async function resetUserPassword(id:UserId,newPassword:string):Promise<boolean>{try{const r:ApiResponse<unknown>=await apiClient.put(`${USERS_BASE}/${encodeUserId(id)}/reset-password`,{newPassword:normalizeString(newPassword)});return r?.success===true;}catch(e){throw new Error(errorMessage(e,'ریست رمز عبور با خطا مواجه شد.'));}}

export default {getDashboard,getUsers,getUser,createUser,updateUser,toggleUserActive,changeUserRole,deleteUser,updateSubscription,resetUserPassword};
