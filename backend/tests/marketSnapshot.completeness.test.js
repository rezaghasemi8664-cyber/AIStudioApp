'use strict';

jest.mock('../config/prisma.cjs', () => ({ $queryRaw: jest.fn() }));
jest.mock('../services/centralMarketCache.service.cjs', () => ({
  get: jest.fn(() => null), set: jest.fn(), invalidatePrefix: jest.fn()
}));

const prisma = require('../config/prisma.cjs');
const snapshot = require('../services/marketSnapshot.service.cjs');

function makeRows(count, overrides = {}) {
  return Array.from({ length: count }, (_, index) => ({
    symbol: 'SYM' + index,
    lastPrice: 100, closePrice: 99, change: 1, changePercent: 1,
    volume: 1000, value: 100000, tradeCount: 10,
    closingChange: 1, closingChangePercent: 1, eps: 10, pe: 10,
    realBuyVolume: 600, realSellVolume: 400, realBuyValue: 60000, realSellValue: 40000,
    realBuyCount: 6, realSellCount: 4,
    legalBuyVolume: 300, legalSellVolume: 200, legalBuyValue: 30000, legalSellValue: 20000,
    legalBuyCount: 3, legalSellCount: 2,
    volumeAvg1m: 500, marketCap: 1000000, shares: 10000, freeFloatPercent: 20,
    ...overrides
  }));
}

describe('market snapshot completeness guard', () => {
  beforeEach(() => jest.clearAllMocks());

  test('normalizes all mapped BRS fields without dropping valuation and investor counts', () => {
    const normalized = snapshot.normalizeSymbol({
      symbol: 'فولاد', lastPrice: 108, closingPrice: 105, closingChange: 5,
      closingChangePercent: 5, eps: 20, pe: 5, marketCap: 50000000,
      shares: 500000, freeFloatPercent: 25, averagePrice: 105,
      realBuyCount: 12, realSellCount: 8, legalBuyCount: 3, legalSellCount: 2,
      legalBuyVolume: 300, legalSellVolume: 200
    });
    expect(normalized).toMatchObject({
      lastPrice:108, closePrice:105, closingChange:5, closingChangePercent:5,
      eps:20, pe:5, marketCap:50000000, shares:500000, freeFloatPercent:25,
      averagePrice:105, realBuyCount:12, realSellCount:8,
      legalBuyCount:3, legalSellCount:2, legalBuyVolume:300, legalSellVolume:200
    });
  });

  test('rejects a new snapshot when a previously well-populated metric disappears', async () => {
    const previous = makeRows(10);
    prisma.$queryRaw.mockResolvedValue([{
      id: 1, status: 'ACTIVE', symbolCount: previous.length,
      symbolsJson: JSON.stringify(previous)
    }]);
    const incoming = makeRows(10, { eps: null });
    await expect(snapshot.validateSnapshotHealth(incoming))
      .rejects.toThrow(/field coverage regressed for eps/);
  });

  test('does not make historically sparse optional PE data mandatory', async () => {
    const previous = makeRows(10, { pe: null });
    prisma.$queryRaw.mockResolvedValue([{
      id: 1, status: 'ACTIVE', symbolCount: previous.length,
      symbolsJson: JSON.stringify(previous)
    }]);
    const incoming = makeRows(10, { pe: null });
    await expect(snapshot.validateSnapshotHealth(incoming)).resolves.toMatchObject({ accepted: true });
  });
});
