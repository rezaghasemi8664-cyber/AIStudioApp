/**
 * Default Market Data Endpoints
 * - Supports env override
 * - Injects BRS API key as query param: key=...
 * - Keeps {symbol} placeholder for downstream replace
 */

const BRS_API_KEY = process.env.BRS_API_KEY || "";

function withQuery(baseUrl, query) {
  const url = new URL(baseUrl);
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
}

const BRS_SYMBOL_URL =
  process.env.BRS_SYMBOL_URL || "https://Api.BrsApi.ir/Tsetmc/Symbol.php";

const BRS_HISTORY_URL =
  process.env.BRS_HISTORY_URL || "https://Api.BrsApi.ir/Tsetmc/History.php";

const BRS_ALL_SYMBOLS_URL =
  process.env.BRS_ALL_SYMBOLS_URL || "https://Api.BrsApi.ir/Tsetmc/AllSymbols.php";

const BRS_INDEX_URL =
  process.env.BRS_INDEX_URL || "https://Api.BrsApi.ir/Tsetmc/Index.php";

/**
 * New endpoint for adjusted daily candlestick
 * API format:
 *   https://Api.BrsApi.ir/Tsetmc/Candlestick.php?key=...&type=3&l18=SYMBOL
 */
const BRS_CANDLESTICK_URL =
  process.env.BRS_CANDLESTICK_URL || "https://Api.BrsApi.ir/Tsetmc/Candlestick.php";

module.exports = {
  BRS_SYMBOL: {
    key: "brs_symbol",
    provider: "brs",
    title: "BRS Symbol Info",
    url: withQuery(BRS_SYMBOL_URL, {
      key: BRS_API_KEY,
      l18: "{symbol}",
    }),
    requiresSymbol: true,
    method: "GET",
    enabled: true,
    parameterName: "l18",
  },

  BRS_HISTORY: {
    key: "brs_history",
    provider: "brs",
    title: "BRS Price History",
    url: withQuery(BRS_HISTORY_URL, {
      key: BRS_API_KEY,
      type: 0,
      l18: "{symbol}",
    }),
    requiresSymbol: true,
    method: "GET",
    enabled: true,
    parameterName: "l18",
  },

  BRS_ALL_SYMBOLS: {
    key: "brs_all_symbols",
    provider: "brs",
    title: "BRS All Symbols",
    url: withQuery(BRS_ALL_SYMBOLS_URL, {
      key: BRS_API_KEY,
      type: 1,
    }),
    requiresSymbol: false,
    method: "GET",
    enabled: true,
  },

  BRS_INDEX: {
    key: "brs_index",
    provider: "brs",
    title: "BRS Market Index",
    url: withQuery(BRS_INDEX_URL, {
      key: BRS_API_KEY,
      type: 1,
    }),
    requiresSymbol: false,
    method: "GET",
    enabled: true,
  },

  BRS_MARKET_STATUS: {
    key: "brs_market_status",
    provider: "brs",
    title: "BRS Market Status",
    url: withQuery(BRS_INDEX_URL, {
      key: BRS_API_KEY,
      type: 1,
    }),
    requiresSymbol: false,
    method: "GET",
    enabled: true,
  },

  /**
   * New: Adjusted Daily Candlestick
   * Required fields expected downstream:
   * count, date, time, open, high, low, close, volume
   */
  BRS_CANDLESTICK: {
    key: "brs_candlestick",
    provider: "brs",
    title: "BRS Adjusted Daily Candlestick",
    url: withQuery(BRS_CANDLESTICK_URL, {
      key: BRS_API_KEY,
      type: 3,
      l18: "{symbol}",
    }),
    requiresSymbol: true,
    method: "GET",
    enabled: true,
    parameterName: "l18",
  },

  MARKET_DAILY: {
    url: "https://Api.BrsApi.ir/market/daily",
    method: "GET",
    paramsMap: { symbol: "l18" },
  },
};
