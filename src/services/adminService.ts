// =============================================================================
// src/services/adminService.ts
// Admin Service — Backend Only
// =============================================================================

import * as apiClient from './apiClient';
import type {
  AdminDashboardStats,
  AdminUserListItem,
  ApiResponse,
} from '../types';

// =============================================================================
// Types
// =============================================================================

export type UserId = string | number;

export interface AdminCreateUserPayload {
  username: string;
  password: string;
  email?: string | null;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  mobile?: string | null;
  nationalId?: string | null;
  bio?: string | null;
  avatar?: string | null;
  roleId?: number | null;
  isActive?: boolean;
  analysisLimit?: number | null;
  analysisLimit24h?: number | null;
  subscriptionStart?: string | null;
  subscriptionEnd?: string | null;
  subscriptionMonths?: number | null;
  isSubscriptionActive?: boolean;
}

export interface AdminUpdateUserPayload {
  username?: string;
  password?: string;
  email?: string | null;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  mobile?: string | null;
  nationalId?: string | null;
  bio?: string | null;
  avatar?: string | null;
  roleId?: number | null;
  isActive?: boolean;
  analysisLimit?: number | null;
  analysisLimit24h?: number | null;
  subscriptionStart?: string | null;
  subscriptionEnd?: string | null;
  subscriptionMonths?: number | null;
  isSubscriptionActive?: boolean;
}

export interface AdminUpdateSubscriptionData {
  userId: UserId;
  isSubscriptionActive?: boolean;
  subscriptionStart?: string | null;
  subscriptionEnd?: string | null;
  subscriptionMonths?: number | null;
  analysisLimit?: number | null;
  analysisLimit24h?: number | null;
}

export interface AdminChangeRolePayload {
  roleId: number;
}

// =============================================================================
// Constants
// =============================================================================

const ADMIN_BASE = '/admin';
const USERS_BASE = `${ADMIN_BASE}/users`;

// =============================================================================
// Helpers
// =============================================================================

function assertUserId(userId: UserId): void {
  if (userId === null || userId === undefined || String(userId).trim() === '') {
    throw new Error('شناسه کاربر معتبر نیست.');
  }
}

function encodeUserId(userId: UserId): string {
  assertUserId(userId);
  return encodeURIComponent(String(userId).trim());
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeNullableString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;

  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function normalizeNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;

  const parsed =
    typeof value === 'number' ? value : Number(String(value).trim());

  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null || value === '') return undefined;

  if (value === 'true' || value === '1' || value === 1) return true;
  if (value === 'false' || value === '0' || value === 0) return false;

  return undefined;
}

function omitUndefined<T extends Record<string, unknown>>(obj: T): T {
  const entries = Object.entries(obj).filter(([, value]) => value !== undefined);
  return Object.fromEntries(entries) as T;
}

function sanitizeCreateUserPayload(
  payload: AdminCreateUserPayload
): AdminCreateUserPayload {
  return omitUndefined({
    username: normalizeString(payload.username),
    password: normalizeString(payload.password),
    email: normalizeNullableString(payload.email),
    name: normalizeNullableString(payload.name),
    firstName: normalizeNullableString(payload.firstName),
    lastName: normalizeNullableString(payload.lastName),
    phone: normalizeNullableString(payload.phone),
    mobile: normalizeNullableString(payload.mobile),
    nationalId: normalizeNullableString(payload.nationalId),
    bio: normalizeNullableString(payload.bio),
    avatar: normalizeNullableString(payload.avatar),
    roleId: normalizeNumber(payload.roleId) ?? payload.roleId ?? undefined,
    isActive: normalizeBoolean(payload.isActive),
    analysisLimit:
      normalizeNumber(payload.analysisLimit) ?? payload.analysisLimit ?? undefined,
    analysisLimit24h:
      normalizeNumber(payload.analysisLimit24h) ??
      payload.analysisLimit24h ??
      undefined,
    subscriptionStart: normalizeNullableString(payload.subscriptionStart),
    subscriptionEnd: normalizeNullableString(payload.subscriptionEnd),
    subscriptionMonths:
      normalizeNumber(payload.subscriptionMonths) ??
      payload.subscriptionMonths ??
      undefined,
    isSubscriptionActive: normalizeBoolean(payload.isSubscriptionActive),
  });
}

function sanitizeUpdateUserPayload(
  payload: AdminUpdateUserPayload
): AdminUpdateUserPayload {
  return omitUndefined({
    username: normalizeString(payload.username),
    password: normalizeString(payload.password),
    email: normalizeNullableString(payload.email),
    name: normalizeNullableString(payload.name),
    firstName: normalizeNullableString(payload.firstName),
    lastName: normalizeNullableString(payload.lastName),
    phone: normalizeNullableString(payload.phone),
    mobile: normalizeNullableString(payload.mobile),
    nationalId: normalizeNullableString(payload.nationalId),
    bio: normalizeNullableString(payload.bio),
    avatar: normalizeNullableString(payload.avatar),
    roleId: normalizeNumber(payload.roleId) ?? payload.roleId ?? undefined,
    isActive: normalizeBoolean(payload.isActive),
    analysisLimit:
      normalizeNumber(payload.analysisLimit) ?? payload.analysisLimit ?? undefined,
    analysisLimit24h:
      normalizeNumber(payload.analysisLimit24h) ??
      payload.analysisLimit24h ??
      undefined,
    subscriptionStart: normalizeNullableString(payload.subscriptionStart),
    subscriptionEnd: normalizeNullableString(payload.subscriptionEnd),
    subscriptionMonths:
      normalizeNumber(payload.subscriptionMonths) ??
      payload.subscriptionMonths ??
      undefined,
    isSubscriptionActive: normalizeBoolean(payload.isSubscriptionActive),
  });
}

function unwrapOrNull<T>(response: ApiResponse<T> | null | undefined): T | null {
  if (response?.success && response?.data != null) return response.data;
  return null;
}

function unwrapUserArray(
  response: ApiResponse<AdminUserListItem[]> | null | undefined
): AdminUserListItem[] {
  if (!response?.success) return [];

  if (Array.isArray(response.data)) return response.data;

  // Tolerant handling in case backend returns nested list structures
  const data = response.data as unknown;

  if (data && typeof data === 'object') {
    const maybeUsers = (data as { users?: unknown }).users;
    const maybeItems = (data as { items?: unknown }).items;

    if (Array.isArray(maybeUsers)) return maybeUsers as AdminUserListItem[];
    if (Array.isArray(maybeItems)) return maybeItems as AdminUserListItem[];
  }

  return [];
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message?.trim()) {
    return error.message;
  }
  return fallback;
}

// =============================================================================
// Dashboard
// =============================================================================

/**
 * GET /admin/dashboard
 */
export async function getDashboard(): Promise<AdminDashboardStats | null> {
  try {
    const response = await apiClient.get<AdminDashboardStats>(
      `${ADMIN_BASE}/dashboard`
    );
    return unwrapOrNull(response);
  } catch (error) {
    console.warn('[adminService] getDashboard failed:', error);
    return null;
  }
}

// =============================================================================
// Users
// =============================================================================

/**
 * GET /admin/users
 */
export async function getUsers(): Promise<AdminUserListItem[]> {
  try {
    const response = await apiClient.get<AdminUserListItem[]>(USERS_BASE);
    return unwrapUserArray(response);
  } catch (error) {
    console.warn('[adminService] getUsers failed:', error);
    return [];
  }
}

/**
 * GET /admin/users/:id
 */
export async function getUser(userId: UserId): Promise<AdminUserListItem | null> {
  try {
    const response = await apiClient.get<AdminUserListItem>(
      `${USERS_BASE}/${encodeUserId(userId)}`
    );
    return unwrapOrNull(response);
  } catch (error) {
    console.warn('[adminService] getUser failed:', error);
    return null;
  }
}

/**
 * POST /admin/users
 */
export async function createUser(
  payload: AdminCreateUserPayload
): Promise<AdminUserListItem | null> {
  try {
    const body = sanitizeCreateUserPayload(payload);

    const response = await apiClient.post<AdminUserListItem>(USERS_BASE, body);
    return unwrapOrNull(response);
  } catch (error) {
    console.warn('[adminService] createUser failed:', error);
    throw new Error(getErrorMessage(error, 'ایجاد کاربر با خطا مواجه شد.'));
  }
}

/**
 * PUT /admin/users/:id
 * or PATCH /admin/users/:id depending on backend implementation
 */
export async function updateUser(
  userId: UserId,
  payload: AdminUpdateUserPayload
): Promise<AdminUserListItem | null> {
  try {
    const body = sanitizeUpdateUserPayload(payload);

    const response = await apiClient.put<AdminUserListItem>(
      `${USERS_BASE}/${encodeUserId(userId)}`,
      body
    );

    return unwrapOrNull(response);
  } catch (error) {
    console.warn('[adminService] updateUser failed:', error);
    throw new Error(getErrorMessage(error, 'ویرایش کاربر با خطا مواجه شد.'));
  }
}

/**
 * PATCH /admin/users/:id/toggle-active
 */
export async function toggleUserActive(
  userId: UserId,
  isActive: boolean
): Promise<AdminUserListItem | null> {
  try {
    const response = await apiClient.patch<AdminUserListItem>(
      `${USERS_BASE}/${encodeUserId(userId)}/toggle-active`,
      { isActive: !!isActive }
    );
    return unwrapOrNull(response);
  } catch (error) {
    console.warn('[adminService] toggleUserActive failed:', error);
    throw new Error(
      getErrorMessage(error, 'تغییر وضعیت فعال بودن کاربر با خطا مواجه شد.')
    );
  }
}

/**
 * PATCH /admin/users/:id/role
 * اگر بک‌اند شما endpoint دیگری دارد، فقط همین مسیر را تغییر بده.
 */
export async function changeUserRole(
  userId: UserId,
  roleId: number
): Promise<AdminUserListItem | null> {
  try {
    const response = await apiClient.patch<AdminUserListItem>(
      `${USERS_BASE}/${encodeUserId(userId)}/role`,
      { roleId }
    );
    return unwrapOrNull(response);
  } catch (error) {
    console.warn('[adminService] changeUserRole failed:', error);
    throw new Error(getErrorMessage(error, 'تغییر نقش کاربر با خطا مواجه شد.'));
  }
}

/**
 * DELETE /admin/users/:id
 */
export async function deleteUser(userId: UserId): Promise<boolean> {
  try {
    const response: ApiResponse<unknown> = await apiClient.del(
      `${USERS_BASE}/${encodeUserId(userId)}`
    );
    return response?.success === true;
  } catch (error) {
    console.warn('[adminService] deleteUser failed:', error);
    throw new Error(getErrorMessage(error, 'حذف کاربر با خطا مواجه شد.'));
  }
}

// =============================================================================
// Subscription
// =============================================================================

/**
 * PUT /admin/users/:id/subscription
 */
export async function updateSubscription(
  data: AdminUpdateSubscriptionData
): Promise<AdminUserListItem | null> {
  try {
    const response = await apiClient.put<AdminUserListItem>(
      `${USERS_BASE}/${encodeUserId(data.userId)}/subscription`,
      omitUndefined({
        isSubscriptionActive: normalizeBoolean(data.isSubscriptionActive),
        subscriptionStart: normalizeNullableString(data.subscriptionStart),
        subscriptionEnd: normalizeNullableString(data.subscriptionEnd),
        subscriptionMonths:
          normalizeNumber(data.subscriptionMonths) ??
          data.subscriptionMonths ??
          undefined,
        analysisLimit:
          normalizeNumber(data.analysisLimit) ??
          data.analysisLimit ??
          undefined,
        analysisLimit24h:
          normalizeNumber(data.analysisLimit24h) ??
          data.analysisLimit24h ??
          undefined,
      })
    );

    return unwrapOrNull(response);
  } catch (error) {
    console.warn('[adminService] updateSubscription failed:', error);
    throw new Error(getErrorMessage(error, 'به‌روزرسانی اشتراک با خطا مواجه شد.'));
  }
}

/**
 * PUT /admin/users/:id/reset-password
 * فقط در صورتی استفاده شود که endpoint در بک‌اند موجود باشد.
 */
export async function resetUserPassword(
  userId: UserId,
  newPassword: string
): Promise<boolean> {
  try {
    const response: ApiResponse<unknown> = await apiClient.put(
      `${USERS_BASE}/${encodeUserId(userId)}/reset-password`,
      { newPassword: normalizeString(newPassword) }
    );
    return response?.success === true;
  } catch (error) {
    console.warn('[adminService] resetUserPassword failed:', error);
    throw new Error(getErrorMessage(error, 'ریست رمز عبور با خطا مواجه شد.'));
  }
}

export default {
  getDashboard,
  getUsers,
  getUser,
  createUser,
  updateUser,
  toggleUserActive,
  changeUserRole,
  deleteUser,
  updateSubscription,
  resetUserPassword,
};
