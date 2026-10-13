import { get, post } from './apiClient';

export interface ReferralSummary {
  referralCode: string;
  invitationsSent: number;
  successfulInvites: number;
  rewardDays: number;
}

export async function getReferralSummary(): Promise<ReferralSummary> {
  const response = await get<any>('/referrals/me');
  if (!response?.success || !response?.data?.referralCode) {
    throw new Error(response?.message || 'دریافت کد معرف ناموفق بود');
  }
  return response.data as ReferralSummary;
}

export async function sendReferralInvite(mobile: string): Promise<void> {
  const response = await post<any>('/referrals/send', { mobile });
  if (!response?.success) throw new Error(response?.message || 'ارسال کد معرف ناموفق بود');
}
