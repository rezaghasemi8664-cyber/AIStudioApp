'use strict';

describe('market summary estimated resistance', () => {
  let estimateForwardResistance;

  beforeAll(() => {
    jest.resetModules();
    jest.doMock('../config/prisma.cjs', () => ({
      MarketSummary: {},
      MarketHistory: {}
    }));
    jest.doMock('../services/sharedMarket.service.cjs', () => ({}));
    jest.doMock('../services/centralMarketCache.service.cjs', () => ({}));
    ({ estimateForwardResistance } = require('../services/marketSummary.service.cjs'));
  });

  afterAll(() => {
    jest.dontMock('../config/prisma.cjs');
    jest.dontMock('../services/sharedMarket.service.cjs');
    jest.dontMock('../services/centralMarketCache.service.cjs');
  });

  test('estimates a level above the current index when historical prices are available', () => {
    const prices = [1000, 1010, 1005, 1020, 1015, 1030, 1025];
    const result = estimateForwardResistance(1050, prices);

    expect(result).not.toBeNull();
    expect(result.level).toBeGreaterThan(1050);
    expect(result.averageAbsoluteMovePct).toBeGreaterThan(0);
    expect(result.observations).toBe(7);
    expect(result.method).toBe('historical-mean-absolute-daily-move');
  });

  test('does not estimate a resistance from insufficient history', () => {
    expect(estimateForwardResistance(1050, [1000, 1010, 1005, 1020, 1015])).toBeNull();
  });

  test('does not invent a level when historical prices have no volatility', () => {
    expect(estimateForwardResistance(1050, [1000, 1000, 1000, 1000, 1000, 1000])).toBeNull();
  });

  test('rejects an invalid current index', () => {
    expect(estimateForwardResistance(0, [1000, 1010, 1005, 1020, 1015, 1030])).toBeNull();
    expect(estimateForwardResistance(null, [1000, 1010, 1005, 1020, 1015, 1030])).toBeNull();
  });
});
