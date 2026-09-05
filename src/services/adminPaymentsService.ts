import api from '../api/apiClient';

export interface PaymentSummary {
  total: number;
  paidCount: number;
  pendingCount: number;
  refundedCount: number;
  failedCount: number;
  byCurrency: Record<string, { paidAmount: number; pendingAmount: number; refundedAmount: number; failedAmount: number }>;
}

export interface PaymentRow {
  id: number;
  userId: number;
  amount: number;
  currency: string;
  gateway?: string | null;
  authority?: string | null;
  referenceNo?: string | null;
  status: string;
  description?: string | null;
  createdAt?: string;
  paidAt?: string | null;
}

export interface PaymentsQuery {
  page?: number;
  limit?: number;
  userId?: number;
  search?: string;
  status?: string;
  gateway?: string;
  currency?: string;
  from?: string;
  to?: string;
}

export interface PaymentsResult {
  items: PaymentRow[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

const getData = (response: any) => response?.data?.data ?? response?.data ?? {};

export async function getSummary(): Promise<PaymentSummary> {
  const response = await api.get('/admin-payments/summary');
  return getData(response);
}

export async function getTransactions(query: PaymentsQuery = {}): Promise<PaymentsResult> {
  const params = Object.fromEntries(Object.entries(query).filter(([, value]) => value !== undefined && value !== null && value !== ''));
  const response = await api.get('/admin-payments/transactions', { params });
  return getData(response);
}
