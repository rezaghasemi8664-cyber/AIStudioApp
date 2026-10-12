'use strict';

const {
  ensureMarketDailyHistory,
  parseMarketHistoryDate,
  isValidDailyCandle
} = require('../services/market-daily-history.service.cjs');

function candle(date, price = 100) {
  return { date, open: price, high: price + 2, low: price - 2, close: price + 1, volume: 1000, value: 100000, count: 20 };
}

describe('market daily history backfill', () => {
  test('parses only valid Gregorian ISO dates', () => {
    expect(parseMarketHistoryDate('2026-10-11')).toEqual(new Date('2026-10-11T00:00:00.000Z'));
    expect(parseMarketHistoryDate('2026-02-30')).toBeNull();
    expect(parseMarketHistoryDate('1405/07/19')).toBeNull();
  });

  test('rejects invalid OHLC candles', () => {
    expect(isValidDailyCandle(candle('2026-10-10'))).toBe(true);
    expect(isValidDailyCandle({ ...candle('2026-10-10'), high: 50 })).toBe(false);
  });

  test('backfills valid historical candles but never overwrites today or future dates', async () => {
    const stored = [candle('2026-10-12')].map(x => ({ ...x, date: new Date('2026-10-12T00:00:00.000Z') }));
    const upsert = jest.fn(async ({ where, create, update }) => {
      const existing = stored.find(x => x.date.getTime() === where.symbol_date.date.getTime());
      if (existing) Object.assign(existing, update);
      else stored.push({ ...create });
    });
    const prisma = {
      marketDaily: {
        findMany: jest.fn(async ({ take }) => stored.slice().sort((a, b) => b.date - a.date).slice(0, take)),
        upsert
      }
    };
    const brsService = {
      getSymbolHistory: jest.fn(async () => ({
        data: [
          candle('2026-10-11'),
          candle('2026-10-10'),
          candle('2026-10-12'),
          candle('2026-10-13'),
          { ...candle('2026-10-09'), high: 1 }
        ]
      }))
    };

    const rows = await ensureMarketDailyHistory({
      prisma,
      brsService,
      symbol: 'فزر',
      marketDate: new Date('2026-10-12T00:00:00.000Z')
    });

    expect(brsService.getSymbolHistory).toHaveBeenCalledWith('فزر', 40);
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(stored.map(x => x.date.toISOString().slice(0, 10)).sort()).toEqual([
      '2026-10-10', '2026-10-11', '2026-10-12'
    ]);
    expect(rows).toHaveLength(3);
  });

  test('does not call BRS when shared DB already has enough valid candles', async () => {
    const stored = Array.from({ length: 15 }, (_, index) => {
      const day = String(15 - index).padStart(2, '0');
      return { ...candle('2026-10-' + day), date: new Date('2026-10-' + day + 'T00:00:00.000Z') };
    });
    const brsService = { getSymbolHistory: jest.fn() };
    const prisma = { marketDaily: { findMany: jest.fn(async () => stored), upsert: jest.fn() } };

    await ensureMarketDailyHistory({
      prisma,
      brsService,
      symbol: 'فولاد',
      marketDate: new Date('2026-10-20T00:00:00.000Z')
    });

    expect(brsService.getSymbolHistory).not.toHaveBeenCalled();
    expect(prisma.marketDaily.upsert).not.toHaveBeenCalled();
  });
});
