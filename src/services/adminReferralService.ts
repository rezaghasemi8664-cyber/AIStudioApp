import * as apiClient from './apiClient';

export interface AdminReferralUser {
  id: number;
  username: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  mobile: string | null;
  phone: string | null;
  referralCode: string | null;
  createdAt: string | null;
}

export interface AdminReferralRow {
  id: number;
  referralCode: string;
  redeemedAt: string | null;
  inviter: AdminReferralUser;
  invitee: AdminReferralUser;
}

export interface AdminReferralResult {
  items: AdminReferralRow[];
  summary: { total: number; uniqueInviters: number; uniqueInvitees: number };
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface AdminReferralQuery {
  inviterId?: string;
  inviteeId?: string;
  name?: string;
  registeredFrom?: string;
  registeredTo?: string;
  page?: number;
  limit?: number;
}

export async function getAdminReferrals(query: AdminReferralQuery = {}): Promise<AdminReferralResult> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && String(value).trim() !== '') params.set(key, String(value).trim());
  }
  const response = await apiClient.get<AdminReferralResult>(`/admin/referrals?${params.toString()}`);
  if (!response?.success || !response.data) {
    throw new Error(response?.message || 'دریافت آمار کد دعوت ناموفق بود.');
  }
  return response.data;
}
