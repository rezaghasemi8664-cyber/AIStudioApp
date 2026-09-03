// src/services/profileService.ts
import type { StoredUser, SubscriptionInfo, DirectMessage } from '../types';
import type { ApiResult } from '../types';
import { safeApi } from './apiResult';

export interface ProfileUpdateData {
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  profileImage?: string;
}

export interface SendMessageInput {
  subject: string;
  body: string;
  attachment?: { name: string; data: string; type?: string };
}

/** ?????? ????? ?????? */
export async function getSubscriptionStatus(userId?: string): Promise<ApiResult<SubscriptionInfo>> {
  const endpoint = '/auth/subscription';
  return safeApi<SubscriptionInfo>(endpoint, { method: 'GET' });
}

/** alias */
export const getSubscriptionInfo = getSubscriptionStatus;

/** ?????? ??????? */
export async function getProfile(): Promise<ApiResult<StoredUser>> {
  return safeApi<StoredUser>('/profile', { method: 'GET' });
}

/** ?????? ??????? */
export async function updateProfile(updates: ProfileUpdateData): Promise<ApiResult<StoredUser>> {
  return safeApi<StoredUser>('/profile', {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

/** ????? ????? ??????? */
export async function uploadProfileImage(imageBase64: string): Promise<ApiResult<{ url: string }>> {
  return safeApi<{ url: string }>('/profile/image', {
    method: 'POST',
    body: JSON.stringify({ image: imageBase64 }),
  });
}

/** ????? ??? ???? */
export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<ApiResult<{ success: true }>> {
  return safeApi<{ success: true }>('/profile/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

/** ????? ???? ?? ?????/???????? */
export async function sendMessage(message: SendMessageInput): Promise<ApiResult<{ success: true }>> {
  return safeApi<{ success: true }>('/profile/messages', {
    method: 'POST',
    body: JSON.stringify(message),
  });
}

/** ?????? ??????? */
export async function getMessages(userId?: string): Promise<ApiResult<DirectMessage[]>> {
  const endpoint = userId
    ? `/profile/messages/${encodeURIComponent(userId)}`
    : '/profile/messages';

  return safeApi<DirectMessage[]>(endpoint, { method: 'GET' });
}

/** ??????? ????? ?????? */
export async function requestSubscriptionExtension(message?: string): Promise<ApiResult<{ success: true }>> {
  return safeApi<{ success: true }>('/profile/subscription/extend-request', {
    method: 'POST',
    body: JSON.stringify({
      message: message || '??????? ????? ??????',
    }),
  });
}

export default {
  getSubscriptionStatus,
  getSubscriptionInfo,
  getProfile,
  updateProfile,
  uploadProfileImage,
  changePassword,
  sendMessage,
  getMessages,
  requestSubscriptionExtension,
};

