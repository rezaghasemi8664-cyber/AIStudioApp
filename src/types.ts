// =============================================================================
// src/types.ts
// Centralized shared type definitions for frontend modules
// Last update: aligned with structured stock analysis output
// =============================================================================

// --- Price & Analysis ---
export interface PriceDataPoint { date: string; price: number; }
export type AnalysisRiskLevel = 'low' | 'medium' | 'high';
export type AnalysisSignalType = 'trend' | 'volume' | 'money_flow' | 'order_book' | 'index';
export interface AnalysisSignal { type: AnalysisSignalType; strength: number; description: string; }
export interface AnalysisDataQuality { score: number; level: string; marketAvailable: boolean; rawHistoryCount: number; candleCount: number; invalidCandleCount: number; coverageRatio: number; fallbackUsed: boolean; stale: boolean; chronology: string; fundamentalAvailable: boolean; deterministicReady: boolean; reasons?: string[]; }
export interface AnalysisEngineInfo { name: string; version: string; deterministic: boolean; }
export interface StructuredStockAnalysisResult {
  summary: string; signals: AnalysisSignal[]; risk_level: AnalysisRiskLevel; confidence: number; ontology_version: '1.0.0';
  closingPrice: number; realMoneyFlow: number; legalMoneyFlow: number; tradedVolume: number; fundamentalScore: number; technicalScore: number;
  entryPoints: number[]; exitPoints: number[]; detailedFundamentalExplanation: string; detailedTechnicalExplanation: string; fallback?: boolean;
}
export interface AnalysisResult extends StructuredStockAnalysisResult {
  isGoodForEntry: boolean; entryPrice: string; exitPrice: string; technicalAnalysis: string; fundamentalAnalysis: string; currentPrice: number;
  recommendation: 'BUY' | 'SELL' | 'HOLD'; symbol?: string; analysisDate?: string; model?: string; content?: string; usage?: unknown;
  riskLevel?: AnalysisRiskLevel; ontologyVersion?: string; targets?: Record<string, number>; stopLoss?: number;
  dataQuality?: AnalysisDataQuality; dataQualityWarnings?: string[]; deterministic?: boolean; engine?: AnalysisEngineInfo;
  priceHistory: { daily: PriceDataPoint[]; weekly: PriceDataPoint[] };
}
export interface StockComparisonResult { symbol1_analysis: AnalysisResult; symbol2_analysis: AnalysisResult; comparison_summary: string; final_recommendation: string; }
export interface PortfolioOptimizationHoldingSummary { symbol: string; name?: string; totalQuantity: number; averageEntryPrice: number; totalCost: number; currentPrice: number; currentValue: number; pnl: number; pnlPercent: number; }
export interface PortfolioOptimizationResult {
  summary: string;
  suggestions?: { symbol: string; action: 'HOLD' | 'INCREASE' | 'DECREASE' | 'SELL'; reason: string; }[];
  holdingsSummary?: PortfolioOptimizationHoldingSummary[];
  riskScore?: number;
  diversificationScore?: number;
  recommendations?: unknown[];
}
export interface PortfolioItem { id: string; symbol: string; name?: string; entryPrice: number; entryDate: string; quantity: number; }

// --- Scalping ---
export type ScalpingSignalType = 'BUY' | 'SELL' | 'NONE';
export interface ScalpingOpportunity { id?: string | number; symbol: string; price: number | null; currentPrice?: number | null; reason: string; score: number; confidence?: number | null; signal?: ScalpingSignalType; signalType?: ScalpingSignalType; type?: ScalpingSignalType; entryPrice?: number | null; exitPrice?: number | null; targetPrice?: number | null; stopLossPrice?: number | null; timestamp?: number; createdAt?: string; updatedAt?: string; }
export interface ScalpingHistoryItem extends ScalpingOpportunity {}
export interface ScalpingHistoryResult { items: ScalpingHistoryItem[]; page: number; limit: number; total: number; totalPages: number; }
export interface ScalpingCache { data: ScalpingOpportunity[]; timestamp: number; }
export interface ScalpingSchedule { isEnabled: boolean; startTime: string; endTime: string; days: number[]; interval: number; }
export interface ScalpingSettings { isEnabled: boolean; startTime: string; endTime: string; days: number[]; interval: number; }
export type PortfolioAlertType = 'none' | 'buy' | 'sell';

// =============================================================================
// User
// =============================================================================
export interface User {
  id: string; username: string; firstName: string; lastName: string; mobile: string; isAdmin: boolean; isActive: boolean; registrationDate: string;
  activationDate: string; validityDays: number; email?: string; isGuest?: boolean; analysisIntervalMinutes: number; analysisLimit24h: number; isDeleted?: boolean;
  name?: string; phone?: string; role?: string; subscriptionStart?: string | null; subscriptionEnd?: string | null; subscriptionDays?: number;
  subscriptionMonths?: number; analysisLimit?: number; isSubscriptionActive?: boolean; remainingDays?: number; createdAt?: string; validityDate?: string | null; expiresAt?: string | null; analysisUsed?: number;
}
export interface StoredUser extends User { passwordHash: string; password?: string; }
export interface ValidityInfo { isExpired: boolean; daysRemaining: number | null; expiryDate: string | null; statusText: string; statusColor: string; }
export interface UserProfile { id: string; username: string; name: string; email: string | null; phone: string | null; mobile: string | null; role: string; isActive: boolean; isSubscriptionActive: boolean; subscriptionStart: string | null; subscriptionEnd: string | null; subscriptionDays: number; subscriptionMonths: number; analysisLimit: number; remainingDays: number; analysisCount: number; createdAt: string; updatedAt: string; }
export interface UpdateProfileData { name?: string; email?: string; phone?: string; mobile?: string; }
export interface SubscriptionInfo { isSubscriptionActive: boolean; subscriptionStart: string | null; subscriptionEnd: string | null; subscriptionDays: number; subscriptionMonths: number; analysisLimit: number; remainingDays: number; analysisCount: number; }
export interface AdminDashboardStats { totalUsers: number; activeSubscriptions: number; totalAnalyses: number; totalApiKeys: number; recentUsers?: AdminUserListItem[]; }
export interface AdminUserListItem { id: string; username: string; name: string | null; email: string | null; phone: string | null; mobile: string | null; role: string; isActive: boolean; isSubscriptionActive: boolean; subscriptionStart: string | null; subscriptionEnd: string | null; subscriptionDays: number; subscriptionMonths: number; analysisLimit: number; remainingDays: number; analysisCount: number; createdAt: string; updatedAt: string; }
export interface AdminUpdateSubscriptionData { userId: string; isSubscriptionActive: boolean; subscriptionStart: string; subscriptionEnd: string; subscriptionDays: number; subscriptionMonths: number; analysisLimit: number; }
export interface SystemRole { id: string; name: string; description?: string; }

// =============================================================================
// Phase 1 - Real Data Contracts
// These contracts describe only real, server/source-backed data.
// No mock, demo, generated, or fallback market values are permitted.
// =============================================================================
export type DataSourceStatus = 'LIVE' | 'CACHED' | 'UNAVAILABLE';

export interface DataSourceMeta {
  status: DataSourceStatus;
  source?: string;
  fetchedAt?: string;
  cachedAt?: string;
  stale?: boolean;
  requestId?: string;
}

export interface MarketQuoteContract {
  symbol: string;
  name?: string;
  lastPrice: number | null;
  closePrice: number | null;
  change: number | null;
  changePercent: number | null;
  volume: number | null;
  value: number | null;
  timestamp: string;
  source: string;
}

export interface MarketCandleContract {
  symbol: string;
  interval: string;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  source: string;
}

export interface CodalNoticeContract {
  id: string;
  symbol?: string;
  title: string;
  publishedAt: string;
  url: string;
  noticeType?: string;
  source: 'CODAL';
}

export interface ApiResponse<T = unknown> { success: boolean; data?: T; error?: string; message?: string; statusCode?: number; ok?: boolean; meta?: DataSourceMeta; }
export type ApiResult<T = unknown> = ApiResponse<T>;
export interface LoginResponse { user: UserProfile; accessToken: string; refreshToken?: string; }
export interface ChangePasswordResponse { message: string; }
export interface SettingsProps { currentUser: User; initialTab?: string; onUserAccessChange?: (isDisconnected: boolean) => void; }
export interface PasswordChangeFormProps { onPasswordChange: (currentPass: string, newPass: string) => Promise<void>; }
export interface AnalysisHistoryItem { symbol: string; timestamp: number; result: AnalysisResult; summary?: string; }
export interface AppNotification { id: string; message: string; timestamp: number; recipientUserId: string; read: boolean; attachment?: { name: string; type: string; data: string; }; }
export interface Notification { id: number; message: string; type: 'success' | 'info' | 'error' | 'warning'; }
export interface MarketIndexData { value: number | null; changeValue: number | null; changePercent: number | null; isMarketOpen: boolean | null; equalWeightedValue: number | null; equalWeightedChangeValue: number | null; equalWeightedChangePercent: number | null; }
export interface MarketIndexCache { data: MarketIndexData; timestamp: number; }
export interface MarketIndexSchedule { isEnabled: boolean; startTime: string; endTime: string; days: number[]; interval: number; }
export interface MarketSummarySchedule { isEnabled: boolean; analysisTime: string; days: number[]; }
export interface MarketSummaryItem { summary: string; timestamp: number; }
export interface MarketSummaryHistoryItem { date: string; summary: string; timestamp: number; }
export interface MarketSummary { id: number; date: string; overallIndex: number | null; overallChange: number | null; equalIndex: number | null; equalChange: number | null; marketStatus: string | null; totalTrades: string | null; totalVolume: string | null; totalValue: string | null; positiveStocks: number | null; negativeStocks: number | null; neutralStocks: number | null; topGainers: unknown; topLosers: unknown; topVolumes: unknown; rawJson: unknown; createdAt: string; }
export interface ApiEndpoint { id: string; name: string; url: string; }
export interface MostTradedStock { symbol: string; lastPrice: number; tradeCount: number; tradeVolume: number; }
export interface TopIndustryGroup { name: string; value: number; change: number; }
export interface MoneyFlowStock { symbol: string; value: number; }
export interface AppFont { id: string; name: string; type: 'persian' | 'latin'; url: string; }
export interface DirectMessage { id: string; senderId: string; senderUsername: string; message: string; timestamp: number; readByAdmin: boolean; reply?: { text: string; timestamp: number; }; attachment?: { name: string; type: string; data: string; }; }
export interface ElementStyles { fontFamily: string; fontSize: string; color: string; backgroundColor: string; borderColor: string; borderWidth: string; borderStyle: 'solid' | 'dashed' | 'dotted' | 'none'; size: string; }
export type ThemeSettings = Record<string, Partial<ElementStyles>>;
export interface ThemeableElement { id: string; name: string; group: string; }
export interface WelcomeBannerConfig { text: string; durationSeconds: number; }
export interface ServerFile { name: string; type: 'archive' | 'file'; extracted?: boolean; size: number; uploadedAt: number; }
export type ServerFileSystem = Record<string, ServerFile[]>;
export interface UpdateHistoryItem { id: string; fileName: string; size: number; date: number; versionNumber: number; isActive: boolean; }
export interface TseLink { id: string; label: string; href: string; title?: string; url?: string; category?: string; }
export type FeatureKey = 'analysis' | 'scalping' | 'marketIndex' | 'stockComparison' | 'marketSummary' | 'portfolio';
