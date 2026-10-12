'use strict';

const { calculateScalpingPriceLevels } = require('../services/scalping-price-levels.service.cjs');

function makeCandles(count = 30) {
  return Array.from({ length: count }, (_, i) => {
    const close = 1000 + i * 3;
    return { open: close - 1, high: close + 2, low: close - 2, close, volume: 1000 };
  });
}
const normalMarket = { allowedMin: 900, allowedMax: 1200, orderBook: { buy: [], sell: [] } };

describe('calculateScalpingPriceLevels', () => {
  test('calculates BUY trigger only inside the legal daily price band', () => {
    const levels = calculateScalpingPriceLevels(makeCandles(), 'BUY', 1087, normalMarket);
    expect(levels).not.toBeNull();
    expect(levels.entryPrice).toBeGreaterThan(levels.resistance);
    expect(levels.entryPrice).toBeLessThanOrEqual(normalMarket.allowedMax);
    expect(levels.targetPrice).toBeGreaterThan(levels.entryPrice);
    expect(levels.stopLossPrice).toBeLessThan(levels.entryPrice);
    expect(levels.method).toBe('swing-resistance-atr');
  });

  test('calculates SELL breakdown only inside the legal daily price band', () => {
    const levels = calculateScalpingPriceLevels(makeCandles(), 'SELL', 1087, normalMarket);
    expect(levels).not.toBeNull();
    expect(levels.entryPrice).toBeLessThan(levels.support);
    expect(levels.entryPrice).toBeGreaterThanOrEqual(normalMarket.allowedMin);
    expect(levels.targetPrice).toBeLessThan(levels.entryPrice);
    expect(levels.stopLossPrice).toBeGreaterThan(levels.entryPrice);
    expect(levels.method).toBe('swing-support-atr');
  });

  test('suppresses BUY when the breakout entry is above the daily ceiling (befjer scenario)', () => {
    const candles = makeCandles().map(c => ({ ...c, high: c.high + 250, open: c.open + 250, low: c.low + 250, close: c.close + 250 }));
    expect(calculateScalpingPriceLevels(candles, 'BUY', 12300, {
      allowedMin: 11700, allowedMax: 12300, orderBook: { buy: [{ price: 12300, volume: 500000 }], sell: [] }
    })).toBeNull();
  });

  test('suppresses SELL when the breakdown entry is below the daily floor (thpardis scenario)', () => {
    const candles = makeCandles().map(c => ({ ...c, high: c.high + 3300, open: c.open + 3300, low: c.low + 3300, close: c.close + 3300 }));
    expect(calculateScalpingPriceLevels(candles, 'SELL', 4340, {
      allowedMin: 4340, allowedMax: 4600, orderBook: { buy: [], sell: [{ price: 4340, volume: 400000 }] }
    })).toBeNull();
  });

  test('fails closed when daily price limits are missing or invalid', () => {
    expect(calculateScalpingPriceLevels(makeCandles(), 'BUY', 1087)).toBeNull();
    expect(calculateScalpingPriceLevels(makeCandles(), 'BUY', 1087, { allowedMin: 1200, allowedMax: 900 })).toBeNull();
  });

  test('returns null when valid history is insufficient', () => {
    expect(calculateScalpingPriceLevels(makeCandles(10), 'BUY', 1030, normalMarket)).toBeNull();
  });

  test('returns null for unknown signal direction', () => {
    expect(calculateScalpingPriceLevels(makeCandles(), 'WATCH', 1087, normalMarket)).toBeNull();
  });
});
