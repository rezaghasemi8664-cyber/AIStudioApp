import * as apiClient from './apiClient';

export interface SubscriptionPlan {
  id: number;
  name: string;
  code: string;
  durationMonths: number;
  price: string | number;
  currency: string;
}

export interface CurrentSubscription {
  id: number;
  userId: number;
  planId: number | null;
  type: string;
  status: string;
  startsAt: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  plan?: SubscriptionPlan | null;
}

export interface SubscriptionState {
  hasAccess: boolean;
  isActive: boolean;
  trialUsed: boolean;
  daysRemaining: number;
  accessDeniedMessage: string;
  subscription: CurrentSubscription | null;
}

export interface SubscriptionPaymentResponse {
  transactionId: number;
  authority: string;
  redirectUrl: string;
  amount: number;
  currency: string;
  plan: {
    id: number;
    name: string;
    durationMonths: number;
  };
}

export async function getMySubscription(): Promise<SubscriptionState> {
  const response = await apiClient.get<SubscriptionState>('/v1/subscriptions/me');
  const payload = response?.data;
  if (!response?.success || !payload) {
    throw new Error(response?.message || 'دریافت وضعیت اشتراک ناموفق بود.');
  }
  return payload;
}

export async function getSubscriptionPlans(): Promise<SubscriptionPlan[]> {
  const response = await apiClient.get<SubscriptionPlan[]>('/v1/subscriptions/plans');
  const payload = response?.data;
  if (!response?.success || !Array.isArray(payload)) {
    throw new Error(response?.message || 'دریافت پلن‌های اشتراک ناموفق بود.');
  }
  return payload;
}

export async function createSubscriptionPayment(planId: number): Promise<SubscriptionPaymentResponse> {
  const response = await apiClient.post<SubscriptionPaymentResponse>('/v1/subscriptions/payments/create', { planId });
  const payload = response?.data;
  if (!response?.success || !payload?.redirectUrl) {
    throw new Error(response?.message || 'ایجاد درخواست پرداخت ناموفق بود.');
  }
  return payload;
}

export default {
  getMySubscription,
  getSubscriptionPlans,
  createSubscriptionPayment,
};
