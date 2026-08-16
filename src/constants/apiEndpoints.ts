// src/constants/apiEndpoints.ts
// ثابت‌های Endpoint پیش‌فرض — هم‌راستا با API_BASE_URL در apiClient

export interface ApiEndpoint {
  id: string;
  name: string;
  url: string; // داخلی: نسبی مثل /auth/login | خارجی: کامل مثل https://...
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  category: 'market' | 'ai' | 'trading' | 'auth' | 'system' | string;
  enabled: boolean;
  description?: string;
  headers?: Record<string, string>;
  timeout?: number;
  params?: Record<string, string>;
}

export const DEFAULT_ENDPOINTS: ApiEndpoint[] = [
  // Market Data — External (BRS)
  {
    id: 'brs-symbol',
    name: 'BRS Symbol API',
    url: 'https://brsapi.ir/Api/Tsetmc/Symbol.php',
    method: 'GET',
    category: 'market',
    enabled: true,
    description: 'دریافت اطلاعات نماد',
    timeout: 10000,
  },
  {
    id: 'brs-all-symbols',
    name: 'BRS All Symbols API',
    url: 'https://brsapi.ir/Api/Tsetmc/AllSymbols.php',
    method: 'GET',
    category: 'market',
    enabled: true,
    description: 'دریافت لیست تمام نمادها',
    timeout: 15000,
  },
  {
    id: 'brs-index',
    name: 'BRS Index API',
    url: 'https://brsapi.ir/Api/Tsetmc/Index.php',
    method: 'GET',
    category: 'market',
    enabled: true,
    description: 'دریافت شاخص کل بازار',
    timeout: 10000,
  },
  {
    id: 'brs-history-daily',
    name: 'BRS Daily History',
    url: 'https://brsapi.ir/Api/Tsetmc/History.php',
    method: 'GET',
    category: 'market',
    enabled: true,
    description: 'دریافت تاریخچه روزانه قیمت',
    timeout: 15000,
    params: { type: 'daily' },
  },
  {
    id: 'brs-history-weekly',
    name: 'BRS Weekly History',
    url: 'https://brsapi.ir/Api/Tsetmc/History.php',
    method: 'GET',
    category: 'market',
    enabled: true,
    description: 'دریافت تاریخچه هفتگی قیمت',
    timeout: 15000,
    params: { type: 'weekly' },
  },
  {
    id: 'brs-market-watch',
    name: 'BRS Market Watch',
    url: 'https://brsapi.ir/Api/Tsetmc/MarketWatch.php',
    method: 'GET',
    category: 'market',
    enabled: true,
    description: 'دیده‌بان بازار',
    timeout: 10000,
  },
  {
    id: 'brs-real-time',
    name: 'BRS Real-Time Data',
    url: 'https://brsapi.ir/Api/Tsetmc/RealTime.php',
    method: 'GET',
    category: 'market',
    enabled: true,
    description: 'داده‌های لحظه‌ای نماد',
    timeout: 8000,
  },
  {
    id: 'brs-orderbook',
    name: 'BRS Order Book',
    url: 'https://brsapi.ir/Api/Tsetmc/OrderBook.php',
    method: 'GET',
    category: 'market',
    enabled: true,
    description: 'دفتر سفارشات نماد',
    timeout: 8000,
  },

  // AI Analysis — Internal (via backend)
  {
    id: 'gapgpt-analyze',
    name: 'GapGPT Analysis',
    url: '/analyze',
    method: 'POST',
    category: 'ai',
    enabled: true,
    description: 'تحلیل هوشمند سهم با GapGPT',
    timeout: 60000,
  },
  {
    id: 'gapgpt-compare',
    name: 'GapGPT Comparison',
    url: '/analyze/compare',
    method: 'POST',
    category: 'ai',
    enabled: true,
    description: 'مقایسه هوشمند سهام',
    timeout: 60000,
  },
  {
    id: 'gapgpt-health',
    name: 'GapGPT Health Check',
    url: '/analyze/health',
    method: 'GET',
    category: 'ai',
    enabled: true,
    description: 'بررسی سلامت سرویس AI',
    timeout: 5000,
  },

  // Trading — Internal
  {
    id: 'scalping-scan',
    name: 'Scalping Scanner',
    url: '/scalping/scan',
    method: 'POST',
    category: 'trading',
    enabled: true,
    description: 'اسکن فرصت‌های نوسان‌گیری',
    timeout: 30000,
  },
  {
    id: 'scalping-opportunities',
    name: 'Scalping Opportunities',
    url: '/scalping/opportunities',
    method: 'GET',
    category: 'trading',
    enabled: true,
    description: 'فرصت‌های فعلی نوسان‌گیری',
    timeout: 10000,
  },

  // Auth & System — Internal
  {
    id: 'auth-login',
    name: 'Login',
    url: '/auth/login',
    method: 'POST',
    category: 'auth',
    enabled: true,
    description: 'ورود کاربر',
    timeout: 10000,
  },
  {
    id: 'auth-register',
    name: 'Register',
    url: '/auth/register',
    method: 'POST',
    category: 'auth',
    enabled: true,
    description: 'ثبت‌نام کاربر جدید',
    timeout: 10000,
  },
  {
    id: 'system-health',
    name: 'System Health',
    url: '/health',
    method: 'GET',
    category: 'system',
    enabled: true,
    description: 'بررسی سلامت سرور',
    timeout: 5000,
  },
];

export const getEndpointsByCategory = (category: string): ApiEndpoint[] =>
  DEFAULT_ENDPOINTS.filter((ep) => ep.category === category && ep.enabled);

export const getEndpointById = (id: string): ApiEndpoint | undefined =>
  DEFAULT_ENDPOINTS.find((ep) => ep.id === id);

export const getEnabledEndpoints = (): ApiEndpoint[] =>
  DEFAULT_ENDPOINTS.filter((ep) => ep.enabled);
