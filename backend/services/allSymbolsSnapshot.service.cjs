'use strict';

const marketSnapshotService = require('./marketSnapshot.service.cjs');

function tehranDateKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', calendar: 'gregory' }).format(date);
}
function normalizeKey(value) {
  return String(value || '').normalize('NFKC')
    .replace(/[\u064A\u0649]/g, 'ی').replace(/\u0643/g, 'ک')
    .replace(/[\u200c\u200f\u200e]/g, '').replace(/\s+/g, '').trim().toLocaleLowerCase('fa-IR');
}
function numberOrNull() {
  for (const value of arguments) {
    if (value === null || value === undefined || value === '') continue;
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}
function normalizeSnapshotSymbol(item) {
  const sector = item.industryName || item.sectorName || item.industry || item.sector || null;
  return {
    ...item, symbol: String(item.symbol || '').trim(), name: item.name || null, industryName: sector,
    lastPrice: numberOrNull(item.lastPrice, item.lastTradedPrice),
    lastChange: numberOrNull(item.lastChange, item.change),
    lastChangePercent: numberOrNull(item.lastChangePercent, item.changePercent),
    closingPrice: numberOrNull(item.closingPrice, item.closePrice),
    closingChange: numberOrNull(item.closingChange, item.closeChange),
    closingChangePercent: numberOrNull(item.closingChangePercent, item.closeChangePercent),
    allowedMin: numberOrNull(item.allowedMin, item.minPrice), allowedMax: numberOrNull(item.allowedMax, item.maxPrice),
    pe: numberOrNull(item.pe, item.pE), eps: numberOrNull(item.eps, item.EPS),
    tradeCount: numberOrNull(item.tradeCount, item.count), tradeVolume: numberOrNull(item.tradeVolume, item.volume),
    realBuyVolume: numberOrNull(item.realBuyVolume, item.buyRealVolume),
    realSellVolume: numberOrNull(item.realSellVolume, item.sellRealVolume),
    instBuyVolume: numberOrNull(item.instBuyVolume, item.legalBuyVolume, item.buy_N_Volume),
    instSellVolume: numberOrNull(item.instSellVolume, item.legalSellVolume, item.sell_N_Volume),
    realBuyCount: numberOrNull(item.realBuyCount, item.buyRealCount, item.Buy_CountI),
    realSellCount: numberOrNull(item.realSellCount, item.sellRealCount, item.Sell_CountI),
    instBuyCount: numberOrNull(item.instBuyCount, item.legalBuyCount, item.Buy_CountN),
    instSellCount: numberOrNull(item.instSellCount, item.legalSellCount, item.Sell_CountN)
  };
}
async function refreshSnapshot() {
  // Compatibility entry point for the legacy cron. The versioned MarketSnapshot
  // worker is the sole owner of BRS AllSymbols fetching and snapshot persistence.
  // This function deliberately performs a read only; it never calls BRS or writes
  // to dbo.AllSymbolsSnapshot.
  const snapshot = await getActiveStoredSnapshot();
  if (!snapshot) {
    throw new Error('No active MarketSnapshot is available; legacy BRS refresh is disabled');
  }

  const updatedAt = snapshot.updatedAt || new Date();
  return {
    snapshotDate: tehranDateKey(new Date(updatedAt)),
    symbolCount: snapshot.symbolCount,
    updatedAt,
    source: snapshot.source || 'versioned-market-snapshot'
  };
}
async function getActiveStoredSnapshot() {
  const active = await marketSnapshotService.getActiveSnapshot();
  if (!active) return null;
  let rawSymbols;
  try { rawSymbols = JSON.parse(active.symbolsJson); } catch (_) { rawSymbols = null; }
  if (!Array.isArray(rawSymbols) || !rawSymbols.length || Number(active.symbolCount) !== rawSymbols.length) {
    throw new Error('Active MarketSnapshot payload is invalid');
  }
  const symbols = rawSymbols.map(normalizeSnapshotSymbol).filter((item) => item.symbol);
  if (symbols.length !== rawSymbols.length) throw new Error('Active MarketSnapshot contains invalid symbol keys');
  return {
    id: Number(active.id),
    snapshotDate: active.activatedAt || active.verifiedAt || active.createdAt,
    symbolCount: Number(active.symbolCount),
    symbols,
    updatedAt: active.activatedAt || active.verifiedAt || active.createdAt,
    source: active.source || 'versioned-market-snapshot'
  };
}
async function hasSnapshot() {
  const snapshot = await getActiveStoredSnapshot();
  return Boolean(snapshot && snapshot.symbolCount === snapshot.symbols.length);
}
async function searchSymbol(query) {
  const snapshot = await getActiveStoredSnapshot();
  if (!snapshot) return { status: 'NO_SNAPSHOT' };
  const key = normalizeKey(query);
  const symbol = snapshot.symbols.find((item) => normalizeKey(item.symbol) === key);
  const dateValue = snapshot.snapshotDate instanceof Date ? snapshot.snapshotDate.toISOString().slice(0, 10) : String(snapshot.snapshotDate || '').slice(0, 10);
  const metadata = { snapshotId: snapshot.id, snapshotUpdatedAt: snapshot.updatedAt, snapshotDate: dateValue, symbolCount: snapshot.symbolCount, source: snapshot.source };
  if (!symbol) return { status: 'NOT_FOUND', ...metadata };
  return { status: 'FOUND', symbol, ...metadata };
}
async function getSnapshot() {
  const snapshot = await getActiveStoredSnapshot();
  if (!snapshot) return { status: 'NO_SNAPSHOT' };
  const snapshotDate = snapshot.snapshotDate instanceof Date ? snapshot.snapshotDate.toISOString().slice(0, 10) : String(snapshot.snapshotDate || '').slice(0, 10);
  return {
    status: 'FOUND', snapshotId: snapshot.id, symbols: snapshot.symbols,
    snapshotDate, snapshotUpdatedAt: snapshot.updatedAt, symbolCount: snapshot.symbolCount, source: snapshot.source
  };
}
module.exports = { hasSnapshot, refreshSnapshot, searchSymbol, getSnapshot, normalizeSnapshotSymbol, normalizeKey, tehranDateKey };
