'use strict';

describe('compact market summary cache', () => {
  let findFirst;
  let service;

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers({ now: new Date('2026-10-29T12:00:00.000Z') });
    findFirst = jest.fn();
    jest.doMock('../config/prisma.cjs', () => ({
      MarketSummary: { findFirst }
    }));
    service = require('../services/marketSummaryCompact.service.cjs');
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.dontMock('../config/prisma.cjs');
  });

  function summaryRow() {
    return {
      id: 7,
      summaryDate: new Date('2026-10-29T00:00:00.000Z'),
      overallIndex: 2100,
      overallChange: 100,
      equalIndex: 1200,
      equalChange: 40,
      marketStatus: 'open',
      totalTrades: 12n,
      totalVolume: 300n,
      totalValue: 450n,
      positiveStocks: 4,
      negativeStocks: 2,
      neutralStocks: 1,
      createdAt: new Date('2026-10-29T11:00:00.000Z')
    };
  }

  test('reuses the database result inside the 2-second TTL', async () => {
    findFirst.mockResolvedValue(summaryRow());

    const first = await service.getLatestCompactMarketSummary();
    const second = await service.getLatestCompactMarketSummary();

    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
    expect(first.totalTrades).toBe('12');

    jest.advanceTimersByTime(2_001);
    await service.getLatestCompactMarketSummary();

    expect(findFirst).toHaveBeenCalledTimes(2);
  });

  test('shares one database read between concurrent cache misses', async () => {
    let resolveQuery;
    findFirst.mockImplementation(() => new Promise(resolve => { resolveQuery = resolve; }));

    const firstPromise = service.getLatestCompactMarketSummary();
    const secondPromise = service.getLatestCompactMarketSummary();

    expect(findFirst).toHaveBeenCalledTimes(1);
    resolveQuery(summaryRow());

    const [first, second] = await Promise.all([firstPromise, secondPromise]);
    expect(first).toEqual(second);
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  test('caches an empty result briefly rather than querying on every request', async () => {
    findFirst.mockResolvedValue(null);

    expect(await service.getLatestCompactMarketSummary()).toBeNull();
    expect(await service.getLatestCompactMarketSummary()).toBeNull();
    expect(findFirst).toHaveBeenCalledTimes(1);
  });
});
