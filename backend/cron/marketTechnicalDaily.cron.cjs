'use strict';

const cron = require('node-cron');
const prisma = require('../config/prisma.cjs');
const TZ = 'Asia/Tehran';

function dayKey(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, calendar: 'gregory' }).format(d);
}
function dayValue(d = new Date()) {
  const [y,m,day] = dayKey(d).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}
function tradingWeekday(d = new Date()) {
  return ['Sat','Sun','Mon','Tue','Wed'].includes(new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(d));
}
function n(v) { const x = Number(v); return Number.isFinite(x) ? x : null; }

async function pruneOldTechnicalDailyRecords() {
  const rows = await prisma.marketTechnicalDaily.findMany({
    orderBy: { marketDate: 'desc' },
    skip: 90,
    take: 1,
    select: { marketDate: true }
  });
  if (!rows.length) return 0;
  const result = await prisma.marketTechnicalDaily.deleteMany({
    where: { marketDate: { lt: rows[0].marketDate } }
  });
  return result.count;
}

async function writeMarketTechnicalDaily() {
  const now = new Date();
  const marketDate = dayValue(now);
  const key = dayKey(now);
  if (!tradingWeekday(now)) return { skipped: true, reason: 'NON_TRADING_WEEKDAY' };
  const existing = await prisma.marketTechnicalDaily.findUnique({ where: { marketDate } });
  if (existing) { const deleted = await pruneOldTechnicalDailyRecords(); return { skipped: true, reason: 'ALREADY_EXISTS', id: existing.id, deleted }; }

  const rows = await prisma.marketHistory.findMany({
    orderBy: { createdAt: 'desc' }, take: 60,
    select: { id: true, createdAt: true, jsonData: true }
  });
  const row = rows.find(r => dayKey(r.createdAt) === key);
  if (!row) return { skipped: true, reason: 'NO_TODAY_SNAPSHOT' };

  let raw;
  try { raw = JSON.parse(row.jsonData || '{}'); } catch { return { skipped: true, reason: 'INVALID_SNAPSHOT' }; }
  const index = n(raw.index ?? raw.marketIndex ?? raw.indexValue ?? raw.lastIndex);
  if (!(index > 0)) return { skipped: true, reason: 'INVALID_INDEX' };

  const saved = await prisma.marketTechnicalDaily.create({
    data: {
      marketDate,
      overallIndex: index,
      overallChange: n(raw.index_change ?? raw.indexChange ?? raw.changeValue),
      equalIndex: n(raw.indexEqualWeight ?? raw.index_equalWeight ?? raw.equalWeightedIndex),
      equalChange: n(raw.indexEqualWeightChange ?? raw.index_equalWeight_change ?? raw.equalWeightedChangeValue),
      source: String(raw.source || 'market-history').slice(0, 50)
    }
  });
  const deleted = await pruneOldTechnicalDailyRecords();
  console.log('[CRON][MarketTechnicalDaily] saved', saved.id, key, row.id, index, 'pruned', deleted);
  return { created: true, id: saved.id, deleted };
}

function registerMarketTechnicalDailyCron() {
  cron.schedule('32 12 * * 0,1,2,3,6', () => writeMarketTechnicalDaily().catch(e => console.error('[CRON][MarketTechnicalDaily]', e.message)), { timezone: TZ });
  console.log('[CRON] MarketTechnicalDaily scheduled 12:32 Tehran');
}

module.exports = { registerMarketTechnicalDailyCron, writeMarketTechnicalDaily };
