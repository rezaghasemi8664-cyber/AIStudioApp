'use strict';

const env = require('../config/env.cjs');

const CDN = 'https://cdn.tsetmc.com/api';
const timeoutMs = Number(env.BRS_TIMEOUT_MS) || 15000;
const TTL = 2 * 60 * 1000;
let cache = { value: null, timestamp: 0 };

const NAME_KEYS = ['lVal18AFC','lVal18','symbol','l18','l30','namad','name','ticker'];
const CODE_KEYS = ['insCode','inscode','InsCode','instrumentCode','instrumentId','ins_code'];
const SECTOR_KEYS = ['sectorName','industryName','groupName','sector','industry','group','lSecVal'];
const VOLUME_KEYS = ['qTotTran5J','tvol','totalVolume','volume','tradeVolume'];
const VALUE_KEYS = ['qTotCap','tval','totalValue','tradeValue'];
const TRADE_KEYS = ['zTotTran','tno','tradeCount','totalTrades'];

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
function nameOf(row) {
  for (const key of NAME_KEYS) if (row?.[key] != null && String(row[key]).trim()) return String(row[key]).trim();
  return null;
}
function codeOf(row) {
  for (const key of CODE_KEYS) if (row?.[key] != null && String(row[key]).trim()) return String(row[key]).trim();
  return null;
}
function sectorOf(row) {
  for (const key of SECTOR_KEYS) if (row?.[key] != null && String(row[key]).trim()) return String(row[key]).trim();
  return null;
}
function flatten(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  const keys = ['marketwatch','marketWatch','data','items','result','results','rows','list','records','clientTypeAllDto','sectorSummeries','sectorsSummary'];
  for (const key of keys) {
    if (Array.isArray(payload[key])) return payload[key];
    if (payload[key] && typeof payload[key] === 'object') {
      const nested = flatten(payload[key]);
      if (nested.length) return nested;
    }
  }
  return [];
}
async function getJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'AIStudioApp/5.0' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`TSETMC ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}
function percentChange(row) {
  for (const key of ['plp','pLp','percentLast','lastPercent','priceChangePercent','price_change_percent','pcp','pCp','percentClose','closePercent','changePercent','change_percent','percentage','percent']) {
    const n = num(row?.[key]);
    if (n !== null) return n;
  }
  const last = first(row, ['pl','pDrCotVal','lastPrice','last','priceLast']);
  const close = first(row, ['pc','pClosing','closingPrice','closePrice','close']);
  const previous = first(row, ['py','priceYesterday','previousClose','prevClose','yesterdayClose','yesterdayPrice']);
  const base = close ?? last;
  if (base !== null && previous !== null && previous !== 0) return ((base - previous) / previous) * 100;
  return null;
}
function isIndex(row) {
  const name = nameOf(row) || '';
  return /شاخص|index/i.test(name) || String(row?.paperType ?? row?.type ?? '').toLowerCase() === 'index';
}
function normalizeRows(payload) {
  return flatten(payload).map(row => ({
    item: row,
    symbol: nameOf(row),
    code: codeOf(row),
    pct: percentChange(row),
    volume: first(row, VOLUME_KEYS) || 0,
    value: first(row, VALUE_KEYS) || 0,
    tradeCount: first(row, TRADE_KEYS) || 0,
  })).filter(row => row.symbol && !isIndex(row.item));
}
function isTraded(row) {
  return row.tradeCount > 0 || row.volume > 0 || row.value > 0;
}
function dedupeRows(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!isTraded(row)) continue;
    const key = row.code || `symbol:${row.symbol}`;
    const old = map.get(key);
    if (!old || (row.tradeCount + row.volume + row.value) > (old.tradeCount + old.volume + old.value)) map.set(key, row);
  }
  return [...map.values()];
}

// TSETMC's CDN market-watch is the complete live market universe. BRS AllSymbols
// may return a reduced/filtered set and must not be used to define breadth totals.
async function fetchCompleteMarketWatch() {
  const params = [
    'market=0',
    'industrialGroup=',
    'paperTypes%5B0%5D=1',
    'paperTypes%5B1%5D=2',
    'paperTypes%5B2%5D=3',
    'paperTypes%5B3%5D=4',
    'paperTypes%5B4%5D=5',
    'paperTypes%5B5%5D=6',
    'paperTypes%5B6%5D=7',
    'paperTypes%5B7%5D=8',
    'paperTypes%5B8%5D=9',
    'withBestLimits=false',
    'hEven=0',
    'RefID=0',
  ].join('&');
  const payload = await getJson(`${CDN}/ClosingPrice/GetMarketWatch?${params}`);
  const rows = normalizeRows(payload);
  if (!rows.length) throw new Error('TSETMC MarketWatch returned no symbol rows');
  return rows;
}

async function fetchClientTypes() {
  try {
    const payload = await getJson(`${CDN}/ClientType/GetClientTypeAll`);
    return flatten(payload).filter(row => codeOf(row));
  } catch (error) {
    console.warn('[MARKET][ClientType]', error.message);
    return [];
  }
}
function moneyFlowFromClientTypes(clientRows, priceByCode) {
  let buyVolume = 0, sellVolume = 0, buyValue = 0, sellValue = 0, buyCount = 0, sellCount = 0, matchedSymbols = 0;
  for (const client of clientRows) {
    const code = codeOf(client);
    if (!code || !priceByCode.has(code)) continue;
    const market = priceByCode.get(code);
    const price = first(market, ['pl','pDrCotVal','lastPrice','pc','pClosing','close']) || 0;
    const buyV = first(client, ['buy_I_Volume','buyIVolume','buyIvolume']) || 0;
    const sellV = first(client, ['sell_I_Volume','sellIVolume','sellIvolume']) || 0;
    const buyVal = first(client, ['buy_I_Value','buyIValue','buy_I_value']);
    const sellVal = first(client, ['sell_I_Value','sellIValue','sell_I_value']);
    buyVolume += buyV; sellVolume += sellV;
    buyValue += buyVal ?? buyV * price;
    sellValue += sellVal ?? sellV * price;
    buyCount += first(client, ['buy_CountI','buyI_Count','buy_I_Count']) || 0;
    sellCount += first(client, ['sell_CountI','sellI_Count','sell_I_Count']) || 0;
    matchedSymbols += 1;
  }
  if (!matchedSymbols) return null;
  return { available: true, buyVolume, sellVolume, netVolume: buyVolume - sellVolume, buyValue, sellValue, netValue: buyValue - sellValue, buyCount, sellCount, matchedSymbols };
}
async function fetchSectorsApi() {
  try {
    const payload = await getJson(`${CDN}/MarketData/GetSectorsSummary`);
    return flatten(payload).map(row => ({
      name: row.lSecVal ?? row.lVal30 ?? row.name ?? row.sectorName ?? row.title ?? row.sector,
      changePercent: first(row, ['changePercent','change_percentage','percent','pChange','change','changeValue','priceChangePercent']),
      symbols: first(row, ['symbols','symbolCount','count','numberOfSymbols','insCount']),
      value: first(row, ['tradeValue','tval','value','qTotCap']),
    })).filter(row => row.name && row.changePercent !== null);
  } catch (error) {
    console.warn('[MARKET][Sectors]', error.message);
    return [];
  }
}
function deriveSectors(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (row.pct === null) continue;
    const sector = sectorOf(row.item);
    if (!sector) continue;
    const current = groups.get(sector) || { name: sector, symbols: 0, sumPct: 0, value: 0 };
    current.symbols += 1; current.sumPct += row.pct; current.value += row.value;
    groups.set(sector, current);
  }
  return [...groups.values()].map(g => ({ name: g.name, symbols: g.symbols, changePercent: g.sumPct / g.symbols, value: g.value }));
}

function build(rows, clientRows = [], sectorApiRows = []) {
  const traded = dedupeRows(rows);
  const classified = traded.map(row => ({ ...row, pct: row.pct === null ? 0 : row.pct }));
  const positive = classified.filter(r => r.pct > 0).length;
  const negative = classified.filter(r => r.pct < 0).length;
  const neutral = classified.filter(r => r.pct === 0).length;
  const total = positive + negative + neutral;
  const priceByCode = new Map(rows.filter(r => r.code).map(r => [r.code, r.item]));
  const moneyFlow = moneyFlowFromClientTypes(clientRows, priceByCode);
  const derivedSectors = deriveSectors(traded);
  const sectors = sectorApiRows.length ? sectorApiRows : derivedSectors;
  const leaders = [...sectors].sort((a,b) => (b.changePercent || 0) - (a.changePercent || 0)).slice(0,5);
  const laggards = [...sectors].sort((a,b) => (a.changePercent || 0) - (b.changePercent || 0)).slice(0,5);
  const topGainers = classified.filter(r => r.pct > 0).sort((a,b) => b.pct-a.pct).slice(0,10).map(r => ({symbol:r.symbol,changePercent:+r.pct.toFixed(4),volume:r.volume,value:r.value}));
  const topLosers = classified.filter(r => r.pct < 0).sort((a,b) => a.pct-b.pct).slice(0,10).map(r => ({symbol:r.symbol,changePercent:+r.pct.toFixed(4),volume:r.volume,value:r.value}));
  const topVolumes = [...classified].sort((a,b) => b.volume-a.volume).slice(0,10).map(r => ({symbol:r.symbol,volume:r.volume,value:r.value,changePercent:+r.pct.toFixed(4)}));
  return {
    available:true, positive, negative, neutral, unknown:0, total, classifiedTotal:total,
    tradedSymbols:traded.length, coveragePercent:traded.length ? 100 : 0,
    positivePercent:total ? positive/total*100 : 0, negativePercent:total ? negative/total*100 : 0, neutralPercent:total ? neutral/total*100 : 0,
    advanceDeclineRatio:negative ? positive/negative : null,
    score:total ? Math.max(0,Math.min(100,Math.round(50+((positive-negative)/total)*50))) : null,
    topGainers, topLosers, topVolumes,
    moneyFlow:moneyFlow || {available:false,reason:'REAL_MONEY_FLOW_UNAVAILABLE',matchedSymbols:0},
    sectors:sectors.length ? {available:true,leaders,laggards,rows:sectors,source:sectorApiRows.length?'tsetmc-sector-summary':'symbol-aggregation'} : {available:false,leaders:[],laggards:[],rows:[],reason:'SECTOR_DATA_UNAVAILABLE'},
    interpretation:positive > negative*1.2 ? 'عرض بازار مثبت و گسترده است' : negative > positive*1.2 ? 'عرض بازار منفی و ضعیف است' : 'عرض بازار متعادل است',
    diagnostics:{
      clientTypeRows:clientRows.length, matchedClientTypeRows:moneyFlow?.matchedSymbols||0, sectorRows:sectors.length,
      sectorSource:sectorApiRows.length?'tsetmc-sector-summary':derivedSectors.length?'symbol-aggregation':'none',
      breadthRule:'منبع Breadth = TSETMC MarketWatch کامل؛ فقط نمادهای یکتای دارای معامله/حجم/ارزش؛ شاخص‌ها و تکراری‌ها حذف؛ درصد نامشخص = خنثی',
      sourceRows:rows.length, uniqueTradedRows:traded.length, classifiedRows:total, unclassifiedTradedRows:0,
      invariant:total===traded.length,
    },
  };
}

async function getMarketBreadth() {
  if (cache.value && Date.now()-cache.timestamp<TTL) return cache.value;
  try {
    const rows = await fetchCompleteMarketWatch();
    const [clientResult,sectorResult] = await Promise.allSettled([fetchClientTypes(),fetchSectorsApi()]);
    const clientRows = clientResult.status==='fulfilled' ? clientResult.value : [];
    const sectorRows = sectorResult.status==='fulfilled' ? sectorResult.value : [];
    const result = build(rows,clientRows,sectorRows);
    result.diagnostics.clientTypeError = clientResult.status==='rejected' ? clientResult.reason?.message : null;
    result.diagnostics.sectorError = sectorResult.status==='rejected' ? sectorResult.reason?.message : null;
    cache={value:result,timestamp:Date.now()};
    return result;
  } catch(error) {
    console.error('[MARKET][Breadth]',error.message);
    return {available:false,reason:'BREADTH_FETCH_FAILED',error:error.message};
  }
}

module.exports={calculateBreadth:(payload,extras={})=>build(normalizeRows(payload),extras.clientTypes||[],extras.sectors||[]),getMarketBreadth};