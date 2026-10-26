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

async function backfillMarketTechnicalDaily() {
  const rows = await prisma.marketCurrent.findMany({
    orderBy: [{ marketDate: 'desc' }, { updatedAt: 'desc' }]
  });

  const byDay = new Map();

  for (const row of rows) {
    const key = dayKey(row.marketDate);
    if (!tradingWeekday(row.marketDate) || byDay.has(key)) continue;

    const index = n(row.overallIndex);
    if (!(index > 0)) continue;

    byDay.set(key, {
      marketDate: dayValue(row.marketDate),
      overallIndex: index,
      overallChange: n(row.overallChange),
      equalIndex: n(row.equalIndex),
      equalChange: n(row.equalChange),
      source: String(row.source || 'market-current').slice(0, 50)
    });
  }

  let created = 0;
  let updated = 0;

  for (const item of byDay.values()) {
    const existing = await prisma.marketTechnicalDaily.findUnique({
      where: { marketDate: item.marketDate },
      select: { id: true }
    });

    if (existing) {
      await prisma.marketTechnicalDaily.update({
        where: { id: existing.id },
        data: {
          overallIndex: item.overallIndex,
          overallChange: item.overallChange,
          equalIndex: item.equalIndex,
          equalChange: item.equalChange,
          source: item.source
        }
      });
      updated++;
    } else {
      await prisma.marketTechnicalDaily.create({
        data: {
          marketDate: item.marketDate,
          overallIndex: item.overallIndex,
          overallChange: item.overallChange,
          equalIndex: item.equalIndex,
          equalChange: item.equalChange,
          source: item.source
        }
      });
      created++;
    }
  }

  const deleted = await pruneOldTechnicalDailyRecords();
  console.log('[CRON][MarketTechnicalDaily] backfill completed', {
    sourceRows: rows.length,
    validTradingDays: byDay.size,
    created,
    updated,
    deleted
  });

  return { sourceRows: rows.length, validTradingDays: byDay.size, created, updated, deleted };
}

async function writeMarketTechnicalDaily() {
  const now = new Date();
  const marketDate = dayValue(now);
  const key = dayKey(now);
  if (!tradingWeekday(now)) return { skipped: true, reason: 'NON_TRADING_WEEKDAY' };

  // MarketCurrent is the canonical one-row-per-trading-day index snapshot.
  // MarketHistory is a legacy table and stopped receiving snapshots.
  const current = await prisma.marketCurrent.findUnique({
    where: { marketDate },
    select: {
      marketDate: true,
      overallIndex: true,
      overallChange: true,
      equalIndex: true,
      equalChange: true,
      source: true,
      updatedAt: true
    }
  });
  const index = n(current?.overallIndex);
  if (!current || !(index > 0)) {
    return { skipped: true, reason: 'NO_TODAY_MARKET_CURRENT' };
  }

  const saved = await prisma.marketTechnicalDaily.upsert({
    where: { marketDate },
    create: {
      marketDate,
      overallIndex: index,
      overallChange: n(current.overallChange),
      equalIndex: n(current.equalIndex),
      equalChange: n(current.equalChange),
      source: String(current.source || 'market-current').slice(0, 50)
    },
    update: {
      overallIndex: index,
      overallChange: n(current.overallChange),
      equalIndex: n(current.equalIndex),
      equalChange: n(current.equalChange),
      source: String(current.source || 'market-current').slice(0, 50)
    }
  });

  const deleted = await pruneOldTechnicalDailyRecords();
  console.log('[CRON][MarketTechnicalDaily] saved from MarketCurrent', saved.id, key, index, 'sourceUpdatedAt', current.updatedAt, 'pruned', deleted);
  return { createdOrUpdated: true, id: saved.id, deleted };
}

function registerMarketTechnicalDailyCron() {
  cron.schedule('32 12 * * 0,1,2,3,6', () => writeMarketTechnicalDaily().catch(e => console.error('[CRON][MarketTechnicalDaily]', e.message)), { timezone: TZ });
  cron.schedule('35 12 * * 0,1,2,3,6', () => backfillMarketTechnicalDaily().catch(e => console.error('[CRON][MarketTechnicalDaily][BACKFILL]', e.message)), { timezone: TZ });
  console.log('[CRON] MarketTechnicalDaily scheduled 12:32 Tehran; canonical history backfill scheduled 12:35 Tehran');
}

module.exports = { registerMarketTechnicalDailyCron, writeMarketTechnicalDaily, backfillMarketTechnicalDaily };
