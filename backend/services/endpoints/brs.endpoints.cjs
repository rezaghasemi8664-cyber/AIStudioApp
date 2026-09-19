'use strict';

// backend/services/endpoints/brs.endpoints.cjs
// Central BRS endpoint registry used by service layer

function clean(v) {
  return (v || '').toString().trim();
}

function normalizeBase(url, fallback) {
  const u = clean(url) || fallback;
  return u.replace(/\s+/g, '').replace(/\/+$/, '');
}

const API_KEY = clean(process.env.BRS_API_KEY);

// Optional: fail-fast only when module is used for live calls
// (اگر ترجیح می‌دهی سفت‌گیرانه باشد، این را uncomment کن)
// if (!API_KEY) {
//   throw new Error('BRS_API_KEY is missing in environment (.env)');
// }

const BASE = {
  SYMBOL: normalizeBase(process.env.BRS_SYMBOL_URL, 'https://Api.BrsApi.ir/Tsetmc/Symbol.php'),
  ALL_SYMBOLS: normalizeBase(process.env.BRS_ALL_SYMBOLS_URL, 'https://Api.BrsApi.ir/Tsetmc/AllSymbols.php'),
  INDEX: normalizeBase(process.env.BRS_INDEX_URL, 'https://Api.BrsApi.ir/Tsetmc/Index.php'),
  HISTORY: normalizeBase(process.env.BRS_HISTORY_URL, 'https://Api.BrsApi.ir/Tsetmc/History.php'),
  CANDLESTICK: normalizeBase(process.env.BRS_CANDLESTICK_URL, 'https://Api.BrsApi.ir/Tsetmc/Candlestick.php'),
};

// نکته: URLها به صورت template نگه داشته می‌شوند تا لایه سرویس placeholderها را resolve کند.
// placeholders:
//   {apiKey}  -> BRS_API_KEY
//   {symbol}  -> l18
//   {count}   -> تعداد رکورد
//   {type}    -> نوع ایندکس/کندل
module.exports = {
  // Symbol snapshot
  BRS_SYMBOL: {
    key: 'BRS_SYMBOL',
    enabled: true,
    provider: 'BRS',
    url: `${BASE.SYMBOL}?key={apiKey}&l18={symbol}`,
    method: 'GET',
    requiresSymbol: true,
    parameterName: 'l18',
    timeout: 12000,
    retries: 2,
  },

  // All symbols
  BRS_ALL_SYMBOLS: {
    key: 'BRS_ALL_SYMBOLS',
    enabled: true,
    provider: 'BRS',
    url: `${BASE.ALL_SYMBOLS}?key={apiKey}`,
    method: 'GET',
    requiresSymbol: false,
    timeout: 15000,
    retries: 2,
  },

  // Market index (e.g. BRS_INDEX)
  BRS_INDEX: {
    key: 'BRS_INDEX',
    enabled: true,
    provider: 'BRS',
    url: `${BASE.INDEX}?key={apiKey}&type={type}`,
    method: 'GET',
    requiresSymbol: false,
    defaultType: 'BRS_INDEX',
    timeout: 12000,
    retries: 2,
  },

  // Symbol history OHLCV
  BRS_HISTORY: {
    key: 'BRS_HISTORY',
    enabled: true,
    provider: 'BRS',
    url: `${BASE.HISTORY}?key={apiKey}&l18={symbol}&count={count}`,
    method: 'GET',
    requiresSymbol: true,
    parameterName: 'l18',
    defaultCount: 30,
    timeout: 15000,
    retries: 2,
  },

  // Adjusted Daily Candlestick (type=3)
  // Example:
  //   https://Api.BrsApi.ir/Tsetmc/Candlestick.php?key=API_KEY&type=3&l18=SYMBOL&count=30
  BRS_CANDLESTICK: {
    key: 'BRS_CANDLESTICK',
    enabled: true,
    provider: 'BRS',
    url: `${BASE.CANDLESTICK}?key={apiKey}&type=3&l18={symbol}&count={count}`,
    method: 'GET',
    requiresSymbol: true,
    parameterName: 'l18',
    defaultCount: 30,
    timeout: 15000,
    retries: 2,
  },

  // Legacy/internal endpoint (optional, kept for backward compatibility)
  MARKET_DAILY: {
    key: 'MARKET_DAILY',
    enabled: true,
    provider: 'BRS',
    // اگر سرویس شما هنوز از این endpoint استفاده می‌کند، key را هم اضافه کردیم
    url: `https://Api.BrsApi.ir/market/daily?key={apiKey}&l18={symbol}`,
    method: 'GET',
    requiresSymbol: true,
    parameterName: 'l18',
    timeout: 12000,
    retries: 1,
  },

  // meta for diagnostics
  __meta: {
    loadedAt: new Date().toISOString(),
    hasApiKey: !!API_KEY,
    apiKeyLength: API_KEY ? API_KEY.length : 0,
    base: BASE,
  },
};
