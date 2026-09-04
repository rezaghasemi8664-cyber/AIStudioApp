import * as apiClient from './apiClient';

export interface AdminDashboardData {
  totalUsers: number;
  activeSubscriptions: number;
  totalAnalyses: number;
  totalApiKeys: number;
  activeUsers: number;
  inactiveUsers: number;
  totalNotifications: number;
  totalConversations: number;
  recentUsers: unknown[];
}

interface BackendDashboardResponse {
  stats?: {
    totalUsers?: number;
    activeUsers?: number;
    inactiveUsers?: number;
    activeSubscriptions?: number;
    totalNotifications?: number;
    totalConversations?: number;
    totalAnalysis?: number;
    totalAnalyses?: number;
    totalApiKeys?: number;
  };
  recentUsers?: unknown[];
}

export async function getAdminDashboard(): Promise<AdminDashboardData> {
  const response = await apiClient.get<BackendDashboardResponse>('/admin/dashboard');
  if (!response?.success) {
    throw new Error(response?.message || 'دریافت داشبورد مدیریتی ناموفق بود.');
  }

  const data = response.data || {};
  const stats = data.stats || {};

  return {
    totalUsers: Number(stats.totalUsers || 0),
    activeSubscriptions: Number(stats.activeSubscriptions || 0),
    totalAnalyses: Number(stats.totalAnalyses ?? stats.totalAnalysis ?? 0),
    totalApiKeys: Number(stats.totalApiKeys || 0),
    activeUsers: Number(stats.activeUsers || 0),
    inactiveUsers: Number(stats.inactiveUsers || 0),
    totalNotifications: Number(stats.totalNotifications || 0),
    totalConversations: Number(stats.totalConversations || 0),
    recentUsers: Array.isArray(data.recentUsers) ? data.recentUsers : [],
  };
}

export default { getAdminDashboard };
