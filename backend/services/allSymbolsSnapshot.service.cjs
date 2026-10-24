'use strict';

const prisma = require('../config/prisma.cjs');
const brsService = require('./brs.service.cjs');

let ensureTablePromise = null;

function tehranDateKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', calendar: 'gregory' }).format(date);
}
function sqlDate(dateKey) {
  const parts = String(dateKey).split('-').map(Number);
  return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
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
async function ensureTable() {
  if (!ensureTablePromise) {
    ensureTablePromise = prisma.$executeRawUnsafe(
      "IF OBJECT_ID(N'dbo.AllSymbolsSnapshot', N'U') IS NULL BEGIN " +
      "CREATE TABLE [dbo].[AllSymbolsSnapshot] ([id] int NOT NULL CONSTRAINT [PK_AllSymbolsSnapshot] PRIMARY KEY, " +
      "[snapshotDate] date NOT NULL, [symbolCount] int NOT NULL, [symbolsJson] nvarchar(max) NOT NULL, " +
      "[source] nvarchar(50) NOT NULL, [updatedAt] datetime2(3) NOT NULL, " +
      "CONSTRAINT [CK_AllSymbolsSnapshot_SingleRow] CHECK ([id] = 1)); END"
    ).catch((error) => { ensureTablePromise = null; throw error; });
  }
  await ensureTablePromise;
}
async function getStoredSnapshot(tx = prisma) {
  const rows = await tx.$queryRawUnsafe(
    "SELECT TOP (1) [id], [snapshotDate], [symbolCount], [symbolsJson], [source], [updatedAt] " +
    "FROM [dbo].[AllSymbolsSnapshot] WHERE [id] = 1"
  );
  return rows && rows[0] ? rows[0] : null;
}
async function refreshSnapshot() {
  await ensureTable();
  const response = await brsService.getAllSymbols({ forceFresh: true });
  const rows = Array.isArray(response && response.data) ? response.data : Array.isArray(response) ? response : null;
  if (!rows || rows.length < 1000) throw new Error('BRS AllSymbols snapshot rejected: invalid or incomplete payload (' + (rows ? rows.length : 0) + ' symbols)');

  const symbols = rows.map(normalizeSnapshotSymbol).filter((item) => item.symbol);
  const keys = new Set(symbols.map((item) => normalizeKey(item.symbol)));
  if (symbols.length < 1000 || keys.size !== symbols.length) throw new Error('BRS AllSymbols snapshot rejected: empty, incomplete or duplicate symbols');

  const previous = await getStoredSnapshot();
  if (previous) {
    let oldSymbols;
    try { oldSymbols = JSON.parse(previous.symbolsJson); } catch (_) { oldSymbols = null; }
    if (!Array.isArray(oldSymbols) || oldSymbols.length < 1000) throw new Error('Existing AllSymbols snapshot is invalid; refusing to replace it');
    const oldKeys = new Set(oldSymbols.map((item) => normalizeKey(item.symbol)).filter(Boolean));
    const intersection = Array.from(keys).filter((key) => oldKeys.has(key)).length;
    const ratio = symbols.length / oldSymbols.length;
    const oldOverlap = oldKeys.size ? intersection / oldKeys.size : 0;
    const newOverlap = keys.size ? intersection / keys.size : 0;
    if (ratio < 0.65 || ratio > 1.5 || oldOverlap < 0.6 || newOverlap < 0.6) {
      throw new Error('BRS AllSymbols snapshot rejected by completeness guard: ' + JSON.stringify({ previousCount: oldSymbols.length, newCount: symbols.length, ratio, oldOverlap, newOverlap }));
    }
  }

  const dateKey = tehranDateKey();
  const snapshotDate = sqlDate(dateKey);
  const payload = JSON.stringify(symbols);
  const updatedAt = new Date();

  await prisma.$transaction(async (tx) => {
    const changed = await tx.$executeRawUnsafe(
      "UPDATE [dbo].[AllSymbolsSnapshot] SET [snapshotDate] = @P1, [symbolCount] = @P2, [symbolsJson] = @P3, " +
      "[source] = @P4, [updatedAt] = @P5 WHERE [id] = 1",
      snapshotDate, symbols.length, payload, 'brsapi-allsymbols', updatedAt
    );
    if (Number(changed) === 0) {
      await tx.$executeRawUnsafe(
        "INSERT INTO [dbo].[AllSymbolsSnapshot] ([id], [snapshotDate], [symbolCount], [symbolsJson], [source], [updatedAt]) " +
        "VALUES (1, @P1, @P2, @P3, @P4, @P5)",
        snapshotDate, symbols.length, payload, 'brsapi-allsymbols', updatedAt
      );
    }
    const saved = await getStoredSnapshot(tx);
    let parsed;
    try { parsed = JSON.parse(saved && saved.symbolsJson || 'null'); } catch (_) { parsed = null; }
    if (!saved || Number(saved.symbolCount) !== symbols.length || !Array.isArray(parsed) || parsed.length !== symbols.length) {
      throw new Error('AllSymbols snapshot database verification failed; rolling back');
    }
  }, { maxWait: 10000, timeout: 60000 });

  console.log('[ALL-SYMBOLS-SNAPSHOT] Saved verified latest snapshot', JSON.stringify({ snapshotDate: dateKey, symbolCount: symbols.length, updatedAt: updatedAt.toISOString() }));
  return { snapshotDate: dateKey, symbolCount: symbols.length, updatedAt: updatedAt, source: 'brsapi-allsymbols' };
}
async function hasSnapshot() {
  await ensureTable();
  const snapshot = await getStoredSnapshot();
  if (!snapshot) return false;
  let symbols;
  try { symbols = JSON.parse(snapshot.symbolsJson); } catch (_) { return false; }
  return Array.isArray(symbols) && symbols.length >= 1000 && Number(snapshot.symbolCount) === symbols.length;
}
async function searchSymbol(query) {
  await ensureTable();
  const snapshot = await getStoredSnapshot();
  if (!snapshot) return { status: 'NO_SNAPSHOT' };
  let symbols;
  try { symbols = JSON.parse(snapshot.symbolsJson); } catch (_) { symbols = null; }
  if (!Array.isArray(symbols) || !symbols.length) return { status: 'NO_SNAPSHOT' };
  const key = normalizeKey(query);
  const symbol = symbols.find((item) => normalizeKey(item.symbol) === key);
  const dateValue = snapshot.snapshotDate instanceof Date ? snapshot.snapshotDate.toISOString().slice(0, 10) : String(snapshot.snapshotDate || '').slice(0, 10);
  if (!symbol) return { status: 'NOT_FOUND', snapshotUpdatedAt: snapshot.updatedAt, snapshotDate: dateValue, symbolCount: Number(snapshot.symbolCount) };
  return { status: 'FOUND', symbol: symbol, snapshotUpdatedAt: snapshot.updatedAt, snapshotDate: dateValue, symbolCount: Number(snapshot.symbolCount), source: snapshot.source };
}
async function getSnapshot() {
  await ensureTable();
  const snapshot = await getStoredSnapshot();
  if (!snapshot) return { status: 'NO_SNAPSHOT' };
  let symbols;
  try { symbols = JSON.parse(snapshot.symbolsJson); } catch (_) { symbols = null; }
  if (!Array.isArray(symbols) || symbols.length < 1000 || Number(snapshot.symbolCount) !== symbols.length) {
    return { status: 'INVALID_SNAPSHOT', snapshotUpdatedAt: snapshot.updatedAt, symbolCount: Number(snapshot.symbolCount || 0) };
  }
  const snapshotDate = snapshot.snapshotDate instanceof Date ? snapshot.snapshotDate.toISOString().slice(0, 10) : String(snapshot.snapshotDate || '').slice(0, 10);
  return {
    status: 'FOUND',
    symbols,
    snapshotDate,
    snapshotUpdatedAt: snapshot.updatedAt,
    symbolCount: Number(snapshot.symbolCount),
    source: snapshot.source
  };
}
module.exports = { ensureTable, hasSnapshot, refreshSnapshot, searchSymbol, getSnapshot, normalizeSnapshotSymbol, normalizeKey, tehranDateKey };
