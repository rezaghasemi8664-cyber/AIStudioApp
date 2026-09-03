import type { StoredUser, ValidityInfo } from '../types';
import { get, post, put, del } from './apiClient';

export type { StoredUser, ValidityInfo };

export interface RegisterUserData {
  firstName: string;
  lastName: string;
  mobile: string;
  email: string;
}

// -----------------------------
// Storage Keys
// -----------------------------
const ACCESS_TOKEN_KEY = 'token'; // هماهنگ با apiConfigService
const REFRESH_TOKEN_KEY = 'refreshToken';
const USER_STORAGE_KEY = 'currentUser';

// -----------------------------
// Helpers
// -----------------------------
function extractRole(raw: any): string {
  if (raw?.role && typeof raw.role === 'object' && raw.role.name) {
    return String(raw.role.name).toLowerCase();
  }
  if (typeof raw?.role === 'string') return raw.role.toLowerCase();
  if (raw?.roleName) return String(raw.roleName).toLowerCase();
  if (raw?.isAdmin === true) return 'admin';
  if (raw?.isGuest === true) return 'guest';
  return 'user';
}

function normalizeUser(raw: any, fallbackEmail?: string): StoredUser {
  const email = raw?.email || raw?.username || fallbackEmail || '';
  const firstName = raw?.firstName || raw?.name?.split?.(' ')?.[0] || '';
  const lastName = raw?.lastName || raw?.name?.split?.(' ')?.slice?.(1)?.join?.(' ') || '';
  const role = extractRole(raw);
  const isAdmin = role === 'admin' || raw?.isAdmin === true;

  return {
    id: raw?.id || raw?._id || '',
    username: raw?.username || email,
    firstName,
    lastName,
    mobile: raw?.mobile || raw?.phone || '',
    email,
    isAdmin,
    isActive: raw?.isActive !== false,
    isGuest: role === 'guest' || raw?.isGuest === true,
    role,
    registrationDate: raw?.registrationDate || raw?.createdAt || new Date().toISOString(),
    activationDate: raw?.activationDate || raw?.createdAt || new Date().toISOString(),
    validityDays: raw?.validityDays ?? raw?.remainingDays ?? raw?.daysRemaining ?? 0,
    analysisIntervalMinutes: raw?.analysisIntervalMinutes ?? 5,
    analysisLimit24h: raw?.analysisLimit24h ?? raw?.analysisLimit ?? 100,
    isDeleted: raw?.isDeleted === true,
    subscriptionStart: raw?.subscriptionStart || null,
    subscriptionEnd: raw?.subscriptionEnd || null,
    subscriptionDays: raw?.subscriptionDays ?? 0,
    subscriptionMonths: raw?.subscriptionMonths ?? 0,
    analysisLimit: raw?.analysisLimit ?? raw?.analysisLimit24h ?? null,
    isSubscriptionActive: raw?.isSubscriptionActive ?? raw?.isActive ?? true,
    remainingDays: raw?.remainingDays ?? raw?.daysRemaining ?? raw?.validityDays ?? undefined,
    createdAt: raw?.createdAt || raw?.registrationDate || new Date().toISOString(),
    validityDate: raw?.validityDate || null,
    expiresAt: raw?.expiresAt || null,
    analysisUsed: raw?.analysisUsed ?? raw?.analysisCount ?? 0,
  } as StoredUser;
}

function getExpiryDate(user: StoredUser): Date | null {
  const dateStr =
    user.subscriptionEnd ||
    (user as any).validityDate ||
    (user as any).expiresAt ||
    (user as any).expiry ||
    (user as any).subscription_end ||
    (user as any).validity_date ||
    (user as any).expires_at;

  if (!dateStr) return null;

  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getCookieValue(name: string): string | null {
  if (typeof document === 'undefined' || !document.cookie) return null;

  const prefix = `${encodeURIComponent(name)}=`;
  const cookies = document.cookie.split(';');

  for (const rawCookie of cookies) {
    const cookie = rawCookie.trim();

    if (cookie.startsWith(prefix)) {
      const value = cookie.slice(prefix.length);
      return value ? decodeURIComponent(value) : null;
    }
  }

  return null;
}

function getStorageToken(): string | null {
  if (typeof window === 'undefined') return null;

  return localStorage.getItem(ACCESS_TOKEN_KEY) || localStorage.getItem('accessToken');
}

function setStoredToken(token: string): void {
  if (typeof window === 'undefined' || !token) return;

  localStorage.setItem(ACCESS_TOKEN_KEY, token);
  localStorage.setItem('accessToken', token); // سازگاری با کدهای دیگر
}

function removeStoredToken(): void {
  if (typeof window === 'undefined') return;

  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem('accessToken');
}

function getStoredRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;

  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

function setStoredRefreshToken(token: string): void {
  if (typeof window === 'undefined' || !token) return;

  localStorage.setItem(REFRESH_TOKEN_KEY, token);
}

function removeStoredRefreshToken(): void {
  if (typeof window === 'undefined') return;

  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

function setStoredUser(user: StoredUser): void {
  if (typeof window === 'undefined') return;

  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
}

function removeStoredUser(): void {
  if (typeof window === 'undefined') return;

  localStorage.removeItem(USER_STORAGE_KEY);
}

function extractTokenFromResponse(response: any): string | null {
  return (
    response?.data?.token ||
    response?.data?.accessToken ||
    response?.data?.data?.token ||
    response?.data?.data?.accessToken ||
    response?.data?.user?.token ||
    response?.data?.user?.accessToken ||
    response?.token ||
    response?.accessToken ||
    null
  );
}

function extractRefreshTokenFromResponse(response: any): string | null {
  return (
    response?.data?.refreshToken ||
    response?.data?.data?.refreshToken ||
    response?.data?.user?.refreshToken ||
    response?.refreshToken ||
    null
  );
}

function extractUserFromResponse(response: any): any {
  return (
    response?.data?.user ||
    response?.data?.data?.user ||
    response?.data?.data ||
    response?.data ||
    response?.user ||
    null
  );
}

export function getToken(): string | null {
  return (
    getStorageToken() ||
    getCookieValue('accessToken') ||
    getCookieValue('token') ||
    getCookieValue('authToken')
  );
}

export function getRefreshToken(): string | null {
  return getStoredRefreshToken() || getCookieValue('refreshToken');
}

export async function getMe(): Promise<{ success: boolean; data?: StoredUser; message?: string }> {
  try {
    const res = await get<any>('/auth/me');
    if (!res.success || !res.data) return { success: false, message: res.message || 'دریافت اطلاعات کاربر ناموفق بود' };
    const user = normalizeUser(res.data.user || res.data);
    setStoredUser(user);
    return { success: true, data: user };
  } catch (error: any) {
    return { success: false, message: error?.message || 'خطا در دریافت اطلاعات کاربر' };
  }
}

export async function getCurrentUser(): Promise<StoredUser | null> {
  const res = await get<any>('/auth/me');

  if (!res.success || !res.data) return null;

  const user = normalizeUser(res.data.user || res.data);
  setStoredUser(user);

  return user;
}

export async function getUsers(): Promise<StoredUser[]> {
  const res = await get<any>('/admin/users');

  if (!res.success) throw new Error(res.message || 'Failed to fetch users');

  const rows = Array.isArray(res.data) ? res.data : res.data?.users || res.data?.data || [];

  return rows.map((u: any) => normalizeUser(u));
}

export async function getGuestUsers(): Promise<StoredUser[]> {
  const res = await get<any>('/admin/users/guests');

  if (!res.success) throw new Error(res.message || 'Failed to fetch guest users');

  const rows = Array.isArray(res.data) ? res.data : res.data?.users || res.data?.data || [];

  return rows.map((u: any) => normalizeUser(u));
}

export async function login(
  emailOrUsername: string,
  password: string,
  _rememberMe = false
): Promise<StoredUser> {
  const res = await post<any>('/auth/login', {
    email: emailOrUsername,
    password,
  });

  if (!res.success) {
    throw new Error(res.message || 'Login failed');
  }

  const accessToken = extractTokenFromResponse(res);
  const refreshToken = extractRefreshTokenFromResponse(res);

  if (accessToken) {
    setStoredToken(accessToken);
  }

  // در بک‌اند فعلی ممکن است refreshToken فقط به صورت cookie ست شود.
  if (refreshToken) {
    setStoredRefreshToken(refreshToken);
  }

  const directUser = extractUserFromResponse(res);

  if (directUser?.id || directUser?.email || directUser?.username) {
    const user = normalizeUser(directUser, emailOrUsername);
    setStoredUser(user);
    return user;
  }

  const me = await getCurrentUser();

  if (!me) {
    throw new Error('Authenticated user could not be resolved after login');
  }

  return me;
}

export async function logout(): Promise<void> {
  try {
    await post('/auth/logout', {});
  } finally {
    removeStoredToken();
    removeStoredRefreshToken();
    removeStoredUser();
  }
}

export async function updateUser(
  userOrId: StoredUser | string,
  updates?: Partial<StoredUser>
): Promise<StoredUser> {
  const userId = typeof userOrId === 'string' ? userOrId : userOrId.id;
  const payload = typeof userOrId === 'string' ? (updates || {}) : { ...userOrId, ...(updates || {}) };

  const res = await put<any>(`/admin/users/${encodeURIComponent(userId)}`, payload);

  if (!res.success) throw new Error(res.message || 'Failed to update user');

  return normalizeUser(res.data?.user || res.data?.data || res.data);
}

export async function updateProfile(updates: Partial<StoredUser>): Promise<StoredUser> {
  const res = await put<any>('/auth/profile', updates);

  if (!res.success) throw new Error(res.message || 'Failed to update profile');

  const user = normalizeUser(res.data?.user || res.data?.data || res.data);
  setStoredUser(user);

  return user;
}

export async function deleteUser(userId: string): Promise<void> {
  const res = await del<any>(`/admin/users/${encodeURIComponent(userId)}`);

  if (!res.success) throw new Error(res.message || 'Failed to delete user');
}

export async function createGuestUser(guestData: {
  firstName: string;
  lastName: string;
  mobile?: string;
  email?: string;
  validityDays?: number;
}): Promise<StoredUser> {
  const res = await post<any>('/admin/users/guest', {
    ...guestData,
    role: 'guest',
    isGuest: true,
  });

  if (!res.success) throw new Error(res.message || 'Failed to create guest user');

  return normalizeUser(res.data?.user || res.data?.data || res.data);
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const res = await post<any>('/auth/change-password', {
    currentPassword,
    newPassword,
  });

  if (!res.success) throw new Error(res.message || 'Failed to change password');
}

export async function recoverPassword(email: string): Promise<void> {
  const res = await post<any>('/auth/recover-password', {
    email,
  });

  if (!res.success) throw new Error(res.message || 'Failed to recover password');
}

export async function registerUser(userData: RegisterUserData): Promise<StoredUser> {
  const fullName = [userData.firstName, userData.lastName].filter(Boolean).join(' ').trim();

  const res = await post<any>('/auth/register', {
    username: userData.email,
    email: userData.email,
    name: fullName,
    phone: userData.mobile,
  });

  if (!res.success) {
    throw new Error(res.message || 'Registration failed');
  }

  const accessToken = extractTokenFromResponse(res);
  const refreshToken = extractRefreshTokenFromResponse(res);

  if (accessToken) {
    setStoredToken(accessToken);
  }

  if (refreshToken) {
    setStoredRefreshToken(refreshToken);
  }

  const directUser = extractUserFromResponse(res);
  const user = normalizeUser(directUser, userData.email);

  setStoredUser(user);

  return user;
}

export function isAccountExpired(user: StoredUser): boolean {
  if (user.isAdmin) return false;
  if (user.isSubscriptionActive === false) return true;
  if (typeof user.remainingDays === 'number' && user.remainingDays <= 0) return true;

  const expiryDate = getExpiryDate(user);

  if (!expiryDate) return false;

  return new Date() > expiryDate;
}

export function getUserValidityInfo(user: StoredUser): ValidityInfo {
  if (user.isAdmin) {
    return {
      isExpired: false,
      daysRemaining: null,
      expiryDate: null,
      statusText: 'Administrator account',
      statusColor: 'green',
    };
  }

  const expiryDate = getExpiryDate(user);

  if (!expiryDate) {
    return {
      isExpired: false,
      daysRemaining: typeof user.remainingDays === 'number' ? user.remainingDays : null,
      expiryDate: null,
      statusText: typeof user.remainingDays === 'number'
        ? `${user.remainingDays} days remaining`
        : 'No expiry date',
      statusColor: typeof user.remainingDays === 'number'
        ? (user.remainingDays <= 3 ? 'red' : user.remainingDays <= 7 ? 'orange' : 'green')
        : 'green',
    };
  }

  const diffMs = expiryDate.getTime() - Date.now();
  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const isExpired = diffMs <= 0;

  return {
    isExpired,
    daysRemaining,
    expiryDate: expiryDate.toLocaleDateString('fa-IR'),
    statusText: isExpired ? 'Account expired' : `${daysRemaining} days remaining`,
    statusColor: isExpired ? 'red' : daysRemaining <= 3 ? 'red' : daysRemaining <= 7 ? 'orange' : 'green',
  };
}

export function updateUserPresence(_userId: string): void {}

export function removeUserPresence(_userId: string): void {}

export function getOnlineUserCount(): number {
  return 0;
}

const authService = {
  getToken,
  getRefreshToken,
  getCurrentUser,
  getMe,
  getUsers,
  getGuestUsers,
  login,
  logout,
  recoverPassword,
  registerUser,
  updateUser,
  updateProfile,
  deleteUser,
  createGuestUser,
  changePassword,
  isAccountExpired,
  getUserValidityInfo,
  updateUserPresence,
  removeUserPresence,
  getOnlineUserCount,
};

export default authService;
