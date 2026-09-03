"use strict";

const { PrismaClient } = require("@prisma/client");
const env = require("../config/env.cjs");

const prisma = new PrismaClient();

const BRS_API_KEY = env.BRS_API_KEY || "";
const BRS_TIMEOUT_MS = parseInt(env.BRS_TIMEOUT_MS, 10) || 15000;
const BRS_RETRY_COUNT = parseInt(env.BRS_RETRY_COUNT, 10) || 2;
const BRS_RETRY_DELAY_MS = parseInt(env.BRS_RETRY_DELAY_MS, 10) || 1200;
const MARKET_FRESHNESS_MINUTES =
  parseInt(env.MARKET_FRESHNESS_MINUTES, 10) || 15;

const BRS_ENDPOINTS = {
  allSymbols:
    env.BRS_ALL_SYMBOLS_URL ||
    "https://Api.BrsApi.ir/Tsetmc/AllSymbols.php",
  index:
    env.BRS_INDEX_URL ||
    "https://Api.BrsApi.ir/Tsetmc/Index.php",
  history:
    env.BRS_HISTORY_URL ||
    "https://Api.BrsApi.ir/Tsetmc/History.php",
  symbol:
    env.BRS_SYMBOL_URL ||
    "https://Api.BrsApi.ir/Tsetmc/Symbol.php",
};

let symbolsCache = { data: null, timestamp: 0 };
const CACHE_TTL = 5 * 60 * 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildUrl(baseUrl, query = {}) {
  const url = new URL(baseUrl);

  if (BRS_API_KEY) {
    url.searchParams.set("key", BRS_API_KEY);
  }

  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  return url.toString();
}

function maskUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.has("key")) {
      parsed.searchParams.set("key", "***");
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

function isRetryableError(error) {
  const message = String(error && error.message ? error.message : "").toUpperCase();

  return (
    message.includes("ETIMEDOUT") ||
    message.includes("ECONNRESET") ||
    message.includes("ECONNREFUSED") ||
    message.includes("EAI_AGAIN") ||
    message.includes("ENOTFOUND") ||
    message.includes("ABORT") ||
    message.includes("502") ||
    message.includes("503") ||
    message.includes("504")
  );
}

async function brsRequest(url, options = {}) {
  let lastError = null;

  for (let attempt = 0; attempt <= BRS_RETRY_COUNT; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), BRS_TIMEOUT_MS);

    try {
      console.log("[MARKET][BRS] Request:", maskUrl(url));

      const response = await fetch(url, {
        method: "GET",
        ...options,
        headers: {
          Accept: "application/json",
          "User-Agent": "AIStudioApp/5.0",
          ...(options.headers || {}),
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`BRS API error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      lastError = error;
      console.error(
        `[MARKET][BRS] Attempt ${attempt + 1}/${BRS_RETRY_COUNT + 1} failed: ${error.message}`
      );

      if (!isRetryableError(error) || attempt === BRS_RETRY_COUNT) {
        break;
      }

      await sleep(BRS_RETRY_DELAY_MS * (attempt + 1));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError;
}

function parseTseDate(value) {
  if (!value) return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === "number") {
    value = String(value);
  }

  if (typeof value !== "string") {
    return null;
  }

  const raw = value.trim();

  if (/^\d{8}$/.test(raw)) {
    const year = raw.slice(0, 4);
    const month = raw.slice(4, 6);
    const day = raw.slice(6, 8);
    const iso = `${year}-${month}-${day}T00:00:00Z`;
    const parsed = new Date(iso);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function safeParseJson(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function toDateSafe(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function diffMinutes(fromDate, toDate = new Date()) {
  if (!(fromDate instanceof Date) || Number.isNaN(fromDate.getTime())) return null;
  return Math.floor((toDate.getTime() - fromDate.getTime()) / 60000);
}

function enrichFreshnessMeta(base = {}, createdAtLike = null, source = "db") {
  const now = new Date();
  const generatedAt = toDateSafe(createdAtLike) || null;
  const ageMinutes = generatedAt ? diffMinutes(generatedAt, now) : null;
  const isStale =
    ageMinutes == null ? true : ageMinutes > MARKET_FRESHNESS_MINUTES;

  return {
    ...base,
    _meta: {
      generatedAt: generatedAt ? generatedAt.toISOString() : null,
      ageMinutes,
      freshnessThresholdMinutes: MARKET_FRESHNESS_MINUTES,
      isStale,
      source,
      now: now.toISOString(),
    },
  };
}

function extractStoredMarketSnapshot(record) {
  if (!record) return null;

  const parsed = safeParseJson(record.jsonData);

  const metadata = {
    _recordId: record.id ?? null,
    _createdAt: record.createdAt ?? null,
    _updatedAt: record.updatedAt ?? null,
  };

  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return enrichFreshnessMeta(
      {
        ...parsed,
        ...metadata,
      },
      record.createdAt || record.updatedAt || null,
      "db"
    );
  }

  if (parsed !== null) {
    return enrichFreshnessMeta(
      {
        data: parsed,
        ...metadata,
      },
      record.createdAt || record.updatedAt || null,
      "db"
    );
  }

  return enrichFreshnessMeta(
    {
      id: record.id ?? null,
      jsonData: record.jsonData ?? null,
      createdAt: record.createdAt ?? null,
      ...metadata,
    },
    record.createdAt || record.updatedAt || null,
    "db"
  );
}

async function fetchAllSymbols() {
  if (symbolsCache.data && Date.now() - symbolsCache.timestamp < CACHE_TTL) {
    return symbolsCache.data;
  }

  const url = buildUrl(BRS_ENDPOINTS.allSymbols, { type: 1 });
  const data = await brsRequest(url);
  const symbols = Array.isArray(data) ? data : data?.symbols || data?.data || [];

  symbolsCache = { data: symbols, timestamp: Date.now() };
  return symbols;
}

async function getCachedSymbols() {
  const result = await prisma.marketDaily.groupBy({
    by: ["symbol"],
    _count: { symbol: true },
    orderBy: { _count: { symbol: "desc" } },
  });

  return result.map((r) => ({
    symbol: r.symbol,
    dataPoints: r._count.symbol,
  }));
}

async function cacheSymbols(symbols) {
  symbolsCache = { data: symbols, timestamp: Date.now() };
}

async function fetchIndex() {
  const url = buildUrl(BRS_ENDPOINTS.index, { type: 1 });

  try {
    const live = await brsRequest(url);
    return enrichFreshnessMeta(
      {
        ...live,
        _fallback: false,
      },
      new Date(),
      "live"
    );
  } catch (error) {
    console.error("[MARKET][INDEX] Live fetch failed:", error.message);

    const fallback = await getLatestMarketHistory();
    if (fallback) {
      return enrichFreshnessMeta(
        {
          ...fallback,
          _fallback: true,
          _fallbackReason: error.message,
        },
        fallback?._createdAt || fallback?._updatedAt || null,
        "history-fallback"
      );
    }

    throw error;
  }
}

async function fetchSymbolDetail(symbolName) {
  if (!symbolName || typeof symbolName !== "string") {
    throw new Error("Symbol name is required");
  }

  const url = buildUrl(BRS_ENDPOINTS.symbol, {
    l18: symbolName.trim(),
  });

  return brsRequest(url);
}

async function getLatestMarketHistory() {
  const record = await prisma.marketHistory.findFirst({
    orderBy: { createdAt: "desc" },
  });

  if (!record) return null;

  return extractStoredMarketSnapshot(record);
}

async function fetchDailyFromAPI(symbol) {
  const query = { type: 0 };
  if (symbol && typeof symbol === "string") {
    query.l18 = symbol.trim();
  }

  const url = buildUrl(BRS_ENDPOINTS.history, query);
  const data = await brsRequest(url);

  return Array.isArray(data) ? data : data?.data || data?.items || [];
}

async function saveMarketDaily(records) {
  if (!Array.isArray(records) || records.length === 0) return 0;

  let savedCount = 0;

  for (const record of records) {
    try {
      const symbol = (record.symbol || record.Symbol || record.l18 || "").toString().trim();
      const date = parseTseDate(record.date || record.Date || record.dEven);

      if (!symbol || !date) {
        console.warn("[MARKET][SAVE] Skipping invalid record:", record);
        continue;
      }

      const payload = {
        open: Number(record.open || record.Open || record.priceFirst || record.pf || 0),
        high: Number(record.high || record.High || record.priceMax || record.pmax || 0),
        low: Number(record.low || record.Low || record.priceMin || record.pmin || 0),
        close: Number(record.close || record.Close || record.pDrCotVal || record.pc || 0),
        volume: BigInt(record.volume || record.Volume || record.qTotTran5J || record.tvol || 0),
        value: BigInt(record.value || record.Value || record.qTotCap || record.tval || 0),
        trades:
          record.trades != null
            ? Number(record.trades)
            : record.tno != null
              ? Number(record.tno)
              : null,
      };

      await prisma.marketDaily.upsert({
        where: {
          symbol_date: { symbol, date },
        },
        update: payload,
        create: {
          symbol,
          date,
          ...payload,
        },
      });

      savedCount += 1;
    } catch (error) {
      console.warn("[MARKET][SAVE] Upsert error:", error.message);
    }
  }

  return savedCount;
}

async function getMarketHistory(limit = 30) {
  const records = await prisma.marketHistory.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return records.map((record) => extractStoredMarketSnapshot(record));
}

async function getSymbolDaily(symbol, limit = 60) {
  return prisma.marketDaily.findMany({
    where: { symbol },
    orderBy: { date: "desc" },
    take: limit,
  });
}

async function runMarketAI() {
  const recentData = await prisma.marketDaily.findMany({
    orderBy: { date: "desc" },
    take: 100,
  });

  if (recentData.length === 0) {
    return {
      status: "no_data",
      message: "داده‌ای برای تحلیل وجود ندارد. ابتدا داده‌های بازار را دریافت کنید.",
    };
  }

  return {
    status: "placeholder",
    message: "تحلیل AI هنوز متصل نشده است.",
    dataPoints: recentData.length,
    lastDate: recentData[0]?.date,
    symbols: [...new Set(recentData.map((d) => d.symbol))].length,
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function toFiniteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * ورودی را به شکل سازگار با mapDbSnapshotToMarketIndex نرمال می‌کند.
 * هم raw BRS و هم خروجی mapMarketIndexResponse (brs.service) را پوشش می‌دهد.
 */
function normalizeMarketSnapshot(input) {
  if (!isPlainObject(input)) return null;

  const raw =
    isPlainObject(input.data) &&
    input.index == null &&
    input.marketIndex == null
      ? input.data
      : input;

  // Never treat generic `value` as the overall index. In BRS/TSETMC
  // payloads `value` may represent market/trade value and can produce
  // completely invalid multi-session momentum percentages.
  const hasIndexField =
    raw.index != null ||
    raw.marketIndex != null ||
    raw.indexValue != null ||
    raw.lastIndex != null;

  const index = toFiniteNumber(
    raw.index ?? raw.marketIndex ?? raw.indexValue ?? raw.lastIndex,
    NaN
  );

  if (!hasIndexField || !Number.isFinite(index)) {
    return null;
  }

  const indexChange = toFiniteNumber(
    raw.index_change ?? raw.indexChange ?? raw.changeValue ?? raw.marketIndexChange,
    0
  );

  const indexEqualWeight = toFiniteNumber(
    raw.indexEqualWeight ??
      raw.index_equalWeight ??
      raw.equalWeightedValue ??
      raw.equalWeightedIndex,
    0
  );

  const indexEqualWeightChange = toFiniteNumber(
    raw.indexEqualWeightChange ??
      raw.index_equalWeight_change ??
      raw.equalWeightedChangeValue,
    0
  );

  const marketValue = toFiniteNumber(
    raw.mv ?? raw.marketValue ?? raw.totalMarketValue,
    0
  );
  const tradeCount =
    parseInt(raw.tno ?? raw.tradeCount ?? raw.totalTrades ?? 0, 10) || 0;
  const tradeValue = toFiniteNumber(
    raw.tval ?? raw.tradeValue ?? raw.totalTradeValue,
    0
  );
  const tradeVolume = toFiniteNumber(
    raw.tvol ?? raw.tradeVolume ?? raw.totalTradeVolume ?? raw.volume,
    0
  );

  const date = raw.date || "";
  const time = raw.time || "";
  const state = raw.state || raw.marketState || raw.status || "";

  return {
    date,
    time,
    state,
    index,
    index_change: indexChange,
    indexChange,
    index_equalWeight: indexEqualWeight,
    indexEqualWeight,
    index_equalWeight_change: indexEqualWeightChange,
    indexEqualWeightChange,
    mv: marketValue,
    marketValue,
    tno: tradeCount,
    tradeCount,
    tval: tradeValue,
    tradeValue,
    tvol: tradeVolume,
    tradeVolume,
    volume: tradeVolume,

    value: index,
    changeValue: indexChange,
    equalWeightedValue: indexEqualWeight,
    equalWeightedChangeValue: indexEqualWeightChange,
    isMarketOpen:
      typeof raw.isMarketOpen === "boolean" ? raw.isMarketOpen : undefined,
    marketState: state || undefined,
    lastUpdate:
      raw.lastUpdate ||
      `${date} ${time}`.trim() ||
      new Date().toISOString(),

    source: raw.source || "market-cron",
    snapshotCreatedAt: new Date().toISOString(),
  };
}

/**
 * ذخیره snapshot در dbo.MarketHistory.jsonData
 * - fallback را دوباره ذخیره نمی‌کند (جلوگیری از کپی‌های کهنه)
 */
async function saveMarketSnapshot(data) {
  if (!data) {
    console.warn("[MARKET][SNAPSHOT] Skip: empty payload");
    return null;
  }

  if (data._fallback === true || data?._meta?.source === "history-fallback") {
    console.warn(
      "[MARKET][SNAPSHOT] Skip: fallback payload must not be re-persisted"
    );
    return null;
  }

  const snapshot = normalizeMarketSnapshot(data);
  if (!snapshot) {
    console.warn("[MARKET][SNAPSHOT] Skip: unnormalizable payload");
    return null;
  }

  const record = await prisma.marketHistory.create({
    data: {
      jsonData: JSON.stringify(snapshot),
    },
  });

  console.log(
    `[MARKET][SNAPSHOT] Saved id=${record.id} index=${snapshot.index} at ${
      record.createdAt || snapshot.snapshotCreatedAt
    }`
  );

  return extractStoredMarketSnapshot(record);
}

module.exports = {
  fetchAllSymbols,
  fetchIndex,
  fetchSymbolDetail,
  fetchDailyFromAPI,
  getMarketHistory,
  getSymbolDaily,
  saveMarketDaily,
  saveMarketSnapshot,
  normalizeMarketSnapshot,
  getCachedSymbols,
  cacheSymbols,
  getLatestMarketHistory,
  runMarketAI,
};
