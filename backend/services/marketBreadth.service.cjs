'use strict';

/**
 * Market breadth / real-money-flow / sector intelligence.
 *
 * Breadth is calculated only from unique traded equity symbols. Non-equity
 * instruments (funds, bonds, options, rights, indices, etc.) are excluded so
 * positive + negative + neutral represents the actual traded equity universe.
 */

const brs = require('./brs.service.cjs');

const fallbackTimeoutMs = 10000;
const TTL = 2 * 60 * 1000;
let cache = { value: null, timestamp: 0 };
let refreshInFlight = null;

function withTimeout(promise, ms, message) {
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error(message)), ms);
      promise.finally(() => clearTimeout(timer)).catch(() => {});
    })
  ]);
}

function num(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(/,/g, '').replace(/٪/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

function first(obj, keys) {
  for (const key of keys) {
    const n = num(obj?.[key]);
    if (n !== null) return n;
  }
  return null;
}

function text(obj, keys) {
  for (const key of keys) {
    const value = obj?.[key];
    if (value !== null && value !== undefined && String(value).trim()) return String(value).trim();
  }
  return null;
}

function flatten(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  const keys = ['marketwatch', 'marketWatch', 'data', 'items', 'result', 'results', 'rows', 'list', 'records', 'clientTypeAllDto', 'sectorSummeries', 'sectorsSummary'];
  for (const key of keys) {
    if (Array.isArray(payload[key])) return payload[key];
    if (payload[key] && typeof payload[key] === 'object') {
      const nested = flatten(payload[key]);
      if (nested.length) return nested;
    }
  }
  return [];
}

function normalizeBRSRow(row) {
  const symbol = text(row, ['symbol', 'l18', 'lVal18AFC', 'ticker']);
  const code = text(row, ['insCode', 'inscode', 'id', 'instrumentId']);
  const last = first(row, ['lastPrice', 'pl', 'last']);
  const close = first(row, ['closingPrice', 'pc', 'close']);
  const yesterday = first(row, ['yesterday', 'py', 'previousClose']);
  const lastPct = first(row, ['lastChangePercent', 'plp']);
  const closePct = first(row, ['closingChangePercent', 'pcp']);
  const volume = first(row, ['tradeVolume', 'tradedVolume', 'tvol', 'volume']) || 0;
  const value = first(row, ['tradeValue', 'tradedValue', 'tval', 'value']) || 0;
  const trades = first(row, ['tradeCount', 'trades', 'tno', 'count']) || 0;
  const pct = closePct !== null
    ? closePct
    : (close !== null && yesterday !== null && yesterday !== 0 ? ((close - yesterday) / yesterday) * 100 : lastPct);

  return {
    item: row,
    symbol,
    code,
    pct,
    last,
    close,
    volume,
    value,
    tradeCount: trades,
    flow: first(row, ['flow', 'market', 'flowId']),
    sector: text(row, ['sector', 'cs', 'sectorName', 'industryName', 'groupName']),
    realBuyVolume: first(row, ['realBuyVolume', 'Buy_I_Volume', 'buy_I_Volume']) || 0,
    realSellVolume: first(row, ['realSellVolume', 'Sell_I_Volume', 'sell_I_Volume']) || 0,
    realBuyValue: first(row, ['realBuyValue', 'Buy_I_Value', 'buy_I_Value']),
    realSellValue: first(row, ['realSellValue', 'Sell_I_Value', 'sell_I_Value']),
    realBuyCount: first(row, ['realBuyCount', 'Buy_CountI', 'buy_CountI']),
    realSellCount: first(row, ['realSellCount', 'Sell_CountI', 'sell_CountI']),
    legalBuyVolume: first(row, ['instBuyVolume', 'legalBuyVolume', 'Buy_N_Volume', 'buy_N_Volume']) || 0,
    legalSellVolume: first(row, ['instSellVolume', 'legalSellVolume', 'Sell_N_Volume', 'sell_N_Volume']) || 0,
  };
}

function isIndex(row) {
  const value = `${row.symbol || ''} ${row.item?.name || ''}`;
  return /شاخص|index/i.test(value) || String(row.item?.paperType ?? row.item?.type ?? '').toLowerCase() === 'index';
}

function instrumentType(row) {
  const raw = row?.item || row || {};
  return [
    raw.paperType,
    raw.paper_type,
    raw.paperTypeId,
    raw.pType,
    raw.pTypeId,
    raw.instrumentType,
    raw.instrumentTypeId,
    raw.insType,
    raw.insTypeId,
    raw.type,
    raw.typeId,
  ].find((value) => value !== undefined && value !== null && value !== '');
}

function isEquity(row) {
  if (!row || !row.symbol || isIndex(row)) return false;

  if (row.flow !== null && row.flow !== undefined) {
    const numericFlow = num(row.flow);
    if (numericFlow !== null && numericFlow !== 1) return false;
  }

  const type = instrumentType(row);
  if (type !== undefined) {
    const numericType = num(type);
    // BRS paper type 1 is the ordinary listed equity instrument.
    if (numericType !== null) return numericType === 1;

    const normalized = String(type).trim().toLowerCase();
    if (['stock', 'share', 'equity', 'commonstock', 'common stock', 'سهم', 'سهام'].includes(normalized)) return true;
    if (/صندوق|اوراق|اختیار|آتی|حق.?تقدم|index|bond|fund|option|future|certificate|warrant/.test(normalized)) return false;
  }

  const label = [row.symbol, row.item?.name, row.item?.lVal30, row.item?.title, row.item?.instrumentName]
    .filter(Boolean).join(' ').toLowerCase();
  if (/شاخص|صندوق|اوراق|اختیار|آتی|حق.?تقدم|اوراق.?تسهیلات|index|fund|bond|option|future|warrant/.test(label)) return false;

  // BRS rows sometimes omit the instrument type. Keep only rows that have real trading data.
  return true;
}

function isTraded(row) {
  return row.tradeCount > 0 || row.volume > 0 || row.value > 0;
}

function dedupeRows(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!row.symbol || !isEquity(row) || !isTraded(row)) continue;
    const key = row.code || `symbol:${row.symbol}`;
    const old = map.get(key);
    const score = row.tradeCount + row.volume + row.value;
    const oldScore = old ? old.tradeCount + old.volume + old.value : -1;
    if (!old || score > oldScore) map.set(key, row);
  }
  return [...map.values()];
}

function moneyFlowFromRows(rows) {
  let buyVolume = 0;
  let sellVolume = 0;
  let buyValue = 0;
  let sellValue = 0;
  let buyValueRows = 0;
  let sellValueRows = 0;
  let buyCount = 0;
  let sellCount = 0;
  let buyCountRows = 0;
  let sellCountRows = 0;
  let matchedSymbols = 0;

  for (const row of rows) {
    if (row.realBuyVolume <= 0 && row.realSellVolume <= 0) continue;
    buyVolume += row.realBuyVolume;
    sellVolume += row.realSellVolume;
    // Use actual BRSAPI investor values when supplied; do not estimate them
    // from last price and volume because that can misstate transaction values.
    if (row.realBuyValue !== null && row.realBuyValue !== undefined) {
      buyValue += row.realBuyValue;
      buyValueRows += 1;
    }
    if (row.realSellValue !== null && row.realSellValue !== undefined) {
      sellValue += row.realSellValue;
      sellValueRows += 1;
    }
    if (row.realBuyCount !== null && row.realBuyCount !== undefined) {
      buyCount += row.realBuyCount;
      buyCountRows += 1;
    }
    if (row.realSellCount !== null && row.realSellCount !== undefined) {
      sellCount += row.realSellCount;
      sellCountRows += 1;
    }
    matchedSymbols += 1;
  }

  if (!matchedSymbols) return null;
  const hasBuyValue = buyValueRows > 0;
  const hasSellValue = sellValueRows > 0;
  const hasBuyCount = buyCountRows > 0;
  const hasSellCount = sellCountRows > 0;
  return {
    available: true,
    buyVolume,
    sellVolume,
    netVolume: buyVolume - sellVolume,
    buyValue: hasBuyValue ? buyValue : null,
    sellValue: hasSellValue ? sellValue : null,
    netValue: hasBuyValue && hasSellValue ? buyValue - sellValue : null,
    buyCount: hasBuyCount ? buyCount : null,
    sellCount: hasSellCount ? sellCount : null,
    matchedSymbols,
    valueCoverageSymbols: { buy: buyValueRows, sell: sellValueRows },
    countCoverageSymbols: { buy: buyCountRows, sell: sellCountRows },
    source: 'brs-all-symbols',
  };
}

function deriveSectors(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (!row.sector || row.pct === null) continue;
    const current = groups.get(row.sector) || { name: row.sector, symbols: 0, sumPct: 0, value: 0 };
    current.symbols += 1;
    current.sumPct += row.pct;
    current.value += row.value;
    groups.set(row.sector, current);
  }
  return [...groups.values()]
    .map((g) => ({ name: g.name, symbols: g.symbols, changePercent: g.symbols ? g.sumPct / g.symbols : null, value: g.value }))
    .filter((g) => g.changePercent !== null)
    .sort((a, b) => b.changePercent - a.changePercent);
}

function build(rows, source = 'brs-all-symbols') {
  const traded = dedupeRows(rows);
  const positive = traded.filter((r) => r.pct !== null && r.pct > 0).length;
  const negative = traded.filter((r) => r.pct !== null && r.pct < 0).length;
  const neutral = traded.filter((r) => r.pct === null || r.pct === 0).length;
  const total = traded.length;
  const invariant = positive + negative + neutral === total;

  const sectors = deriveSectors(traded);
  const moneyFlow = moneyFlowFromRows(traded);
  const topGainers = traded.filter((r) => r.pct !== null && r.pct > 0).sort((a, b) => b.pct - a.pct).slice(0, 10)
    .map((r) => ({ symbol: r.symbol, changePercent: +r.pct.toFixed(4), volume: r.volume, value: r.value }));
  const topLosers = traded.filter((r) => r.pct !== null && r.pct < 0).sort((a, b) => a.pct - b.pct).slice(0, 10)
    .map((r) => ({ symbol: r.symbol, changePercent: +r.pct.toFixed(4), volume: r.volume, value: r.value }));
  const topVolumes = [...traded].sort((a, b) => b.volume - a.volume).slice(0, 10)
    .map((r) => ({ symbol: r.symbol, volume: r.volume, value: r.value, changePercent: r.pct === null ? null : +r.pct.toFixed(4) }));

  const leaders = sectors.slice(0, 5);
  const laggards = sectors.slice(-5).reverse();
  const coveragePercent = total > 0 ? 100 : 0;

  return {
    available: invariant && total > 0,
    source,
    positive,
    negative,
    neutral,
    unknown: 0,
    total,
    classifiedTotal: total,
    tradedSymbols: total,
    coveragePercent,
    positivePercent: total ? (positive / total) * 100 : 0,
    negativePercent: total ? (negative / total) * 100 : 0,
    neutralPercent: total ? (neutral / total) * 100 : 0,
    advanceDeclineRatio: negative ? positive / negative : null,
    score: total ? Math.max(0, Math.min(100, Math.round(50 + ((positive - negative) / total) * 50))) : null,
    interpretation: positive > negative * 1.2 ? 'عرض بازار مثبت و گسترده است' : negative > positive * 1.2 ? 'عرض بازار منفی و ضعیف است' : 'عرض بازار متعادل است',
    topGainers,
    topLosers,
    topVolumes,
    moneyFlow: moneyFlow || { available: false, reason: 'REAL_MONEY_FLOW_UNAVAILABLE', matchedSymbols: 0 },
    sectors: sectors.length
      ? { available: true, leaders, laggards, rows: sectors, source: 'symbol-aggregation' }
      : { available: false, leaders: [], laggards: [], rows: [], reason: 'SECTOR_DATA_UNAVAILABLE' },
    diagnostics: {
      source,
      sourceRows: rows.length,
      uniqueTradedRows: total,
      classifiedRows: total,
      unclassifiedTradedRows: 0,
      clientTypeRows: 0,
      matchedClientTypeRows: moneyFlow?.matchedSymbols || 0,
      sectorRows: sectors.length,
      sectorSource: sectors.length ? 'symbol-aggregation' : 'none',
      invariant,
      breadthRule: 'فقط نمادهای یکتای معامله‌شده در بورس تهران (flow=1 و paperType=1)؛ فرابورس، پایه، صندوق، اوراق، مشتقه، حق‌تقدم و شاخص‌ها حذف؛ نماد بدون درصد تغییر در خنثی قرار می‌گیرد.',
    },
  };
}

async function fetchBRSAllSymbols() {
  const result = await brs.getAllSymbols();
  const data = Array.isArray(result?.data) ? result.data : [];
  if (!data.length) throw new Error('BRS AllSymbols returned no symbol rows');
  return data.map(normalizeBRSRow);
}

async function getMarketBreadth() {
  if (cache.value && Date.now() - cache.timestamp < TTL) return cache.value;
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      // Market breadth must use BRSAPI only. The shared BRS service adds the API
      // key, enforces request spacing, retries transient errors, and normalizes data.
      const rows = await withTimeout(
        fetchBRSAllSymbols(),
        fallbackTimeoutMs,
        'BRS breadth fetch timeout'
      );
      const result = build(rows, 'brs-all-symbols-equities');
      result.diagnostics.generatedAt = new Date().toISOString();
      cache = { value: result, timestamp: Date.now() };
      return result;
    } catch (error) {
      console.error('[MARKET][Breadth] BRS AllSymbols failed:', error.message);
      if (cache.value) {
        return {
          ...cache.value,
          stale: true,
          staleReason: error.message,
          diagnostics: {
            ...(cache.value.diagnostics || {}),
            refreshError: error.message,
            servedFromCache: true
          }
        };
      }
      return {
        available: false,
        reason: 'BREADTH_FETCH_FAILED',
        error: error.message,
        diagnostics: {
          source: 'brs-all-symbols',
          generatedAt: new Date().toISOString()
        }
      };
    }
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

function normalizeRows(payload) {
  return flatten(payload).map(normalizeBRSRow);
}

module.exports = {
  calculateBreadth: (payload) => build(normalizeRows(payload), 'payload'),
  getMarketBreadth,
};
