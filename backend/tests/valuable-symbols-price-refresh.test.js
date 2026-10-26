'use strict';

const { refreshValuableSymbolPrices } = require('../services/valuableSymbols.priceRefresh.cjs');

function cachedItem(overrides = {}) {
  return {
    symbol: 'مثقال',
    currentPrice: 206748,
    entryPrice: 206748,
    targetPrice: 207000,
    stopLoss: 205000,
    support: 205000,
    sma20: 200000,
    rsi14: 56,
    fundamental: { score: 80, source: 'codal' },
    ...overrides
  };
}

describe('valuable-symbols current price refresh', () => {
  const now = new Date('2026-10-12T06:00:00.000Z');

  test('replaces a cached displayed price with the latest shared market price and recalculates levels', () => {
    const result = refreshValuableSymbolPrices(
      [cachedItem()],
      [{
        symbol: 'مثقال',
        lastPrice: 206700,
        updatedAt: '2026-10-12T05:59:00.000Z',
        isStale: false
      }],
      now,
      true
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      symbol: 'مثقال',
      currentPrice: 206700,
      entryPrice: 206700,
      targetPrice: 210100,
      stopLoss: 205000,
      marketDataAgeMinutes: 1,
      marketStatus: 'OPEN',
      fundamental: { score: 80, source: 'codal' }
    });
  });

  test('does not return cached prices when the shared market row is stale or too old during market hours', () => {
    const result = refreshValuableSymbolPrices(
      [cachedItem(), cachedItem({ symbol: 'OLD' })],
      [
        { symbol: 'مثقال', lastPrice: 206700, updatedAt: '2026-10-12T05:40:00.000Z', isStale: false },
        { symbol: 'OLD', lastPrice: 100, updatedAt: '2026-10-12T05:59:00.000Z', isStale: true }
      ],
      now,
      true
    );

    expect(result).toEqual([]);
  });

  test('omits recommendations whose latest market price no longer meets the cached technical risk rules', () => {
    const result = refreshValuableSymbolPrices(
      [cachedItem()],
      [{ symbol: 'مثقال', lastPrice: 204000, updatedAt: now, isStale: false }],
      now,
      true
    );

    expect(result).toEqual([]);
  });

  test('does not synthesize a current price when no shared market row exists', () => {
    expect(refreshValuableSymbolPrices([cachedItem()], [], now, false)).toEqual([]);
  });

  test('shows the latest persisted price after close when the market row is marked stale but within the allowed age', () => {
    const closedNow = new Date('2026-10-12T16:00:00.000Z');
    const result = refreshValuableSymbolPrices(
      [cachedItem()],
      [{
        symbol: 'مثقال',
        lastPrice: 206700,
        updatedAt: '2026-10-12T12:00:00.000Z',
        isStale: true
      }],
      closedNow,
      false
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      symbol: 'مثقال',
      currentPrice: 206700,
      entryPrice: 206700,
      marketStatus: 'CLOSED'
    });
  });
});
