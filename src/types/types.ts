export type { ApiEndpoint } from '../constants/apiEndpoints';

export interface User {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  mobile: string;
  isAdmin: boolean;
  isActive: boolean;
  registrationDate: string;
  activationDate: string;
  validityDays: number;
  email?: string;
  isGuest?: boolean;
  analysisIntervalMinutes: number;
  analysisLimit24h: number;
  isDeleted?: boolean;
  name?: string;
  phone?: string;
  role?: string;
  subscriptionStart?: string | null;
  subscriptionEnd?: string | null;
  subscriptionMonths?: number;
  analysisLimit?: number;
  isSubscriptionActive?: boolean;
  remainingDays?: number;
  createdAt?: string;
  validityDate?: string | null;
  expiresAt?: string | null;
  analysisUsed?: number;
}

export interface StoredUser extends User {
  lastLogin?: string;
  expiryDate?: string;
  passwordHash?: string;
  password?: string;
}

export interface AppNotification {
  id: string;
  message: string;
  timestamp: number;
  read: boolean;
  recipientUserId: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  targetUsers?: string[];
  attachment?: {
    name: string;
    type: string;
    data: string;
  };
}

export type PortfolioAlertType = 'none' | 'buy' | 'sell';

export interface TseLink {
  id: string;
  label: string;
  href: string;
  icon?: string;
  enabled?: boolean;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
