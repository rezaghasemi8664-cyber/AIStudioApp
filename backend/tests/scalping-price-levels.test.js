'use strict';

const { calculateScalpingPriceLevels } = require('../services/scalping-price-levels.service.cjs');

function makeCandles(count = 30) {
  return Array.from({ length: count }, (_, i) => {
    const close = 1000 + i * 3;
    return { open: close - 1, high: close + 2, low: close - 2, close, volume: 1000 };
  });
}

describe('calculateScalpingPriceLevels', () => {
  test('calculates BUY trigger, target and stop from swing levels and ATR', () => {
    const levels = calculateScalpingPriceLevels(makeCandles(), 'BUY', 1087);
    expect(levels).not.toBeNull();
    expect(levels.entryPrice).toBeGreaterThan(levels.resistance);
    expect(levels.targetPrice).toBeGreaterThan(levels.entryPrice);
    expect(levels.stopLossPrice).toBeLessThan(levels.entryPrice);
    expect(levels.method).toBe('swing-resistance-atr');
  });

  test('calculates SELL breakdown, downside target and invalidation from chart levels', () => {
    const levels = calculateScalpingPriceLevels(makeCandles(), 'SELL', 1087);
    expect(levels).not.toBeNull();
    expect(levels.entryPrice).toBeLessThan(levels.support);
    expect(levels.targetPrice).toBeLessThan(levels.entryPrice);
    expect(levels.stopLossPrice).toBeGreaterThan(levels.entryPrice);
    expect(levels.method).toBe('swing-support-atr');
  });

  test('returns null when valid history is insufficient', () => {
    expect(calculateScalpingPriceLevels(makeCandles(10), 'BUY', 1030)).toBeNull();
  });

  test('returns null for unknown signal direction', () => {
    expect(calculateScalpingPriceLevels(makeCandles(), 'WATCH', 1087)).toBeNull();
  });
});
