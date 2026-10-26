'use strict';

const { calculateScalpingPriceLevels, selectCandidatesWithValidLevels } = require('../services/scalping-price-levels.service.cjs');

function makeCandles(count = 30) {
  return Array.from({ length: count }, (_, i) => {
    const close = 1000 + i * 3;
    return { open: close - 1, high: close + 2, low: close - 2, close, volume: 1000 };
  });
}
const normalMarket = { allowedMin: 900, allowedMax: 1200, orderBook: { buy: [], sell: [] } };

describe('calculateScalpingPriceLevels', () => {
  test('rejects BUY breakout when a distant support makes reward/risk inadequate', () => {
    const levels = calculateScalpingPriceLevels(makeCandles(), 'BUY', 1087, normalMarket);
    expect(levels).toBeNull();
  });

  test('calculates BUY breakout only when reward/risk is at least 1.2 and prices fit the daily band', () => {
    const candles = Array.from({ length: 30 }, () => ({
      open: 1000, high: 1002, low: 998, close: 1001, volume: 1000
    }));
    const levels = calculateScalpingPriceLevels(candles, 'BUY', 1001, normalMarket);
    expect(levels).not.toBeNull();
    expect(levels.entryPrice).toBeGreaterThan(levels.resistance);
    expect(levels.entryPrice).toBeLessThanOrEqual(normalMarket.allowedMax);
    expect(levels.targetPrice).toBeGreaterThan(levels.entryPrice);
    expect(levels.stopLossPrice).toBeLessThan(levels.entryPrice);
    expect((levels.targetPrice - levels.entryPrice) / (levels.entryPrice - levels.stopLossPrice)).toBeGreaterThanOrEqual(1.2);
    expect(levels.method).toBe('swing-resistance-atr');
  });

  test('rejects SELL breakdown when a distant resistance makes reward/risk inadequate', () => {
    const levels = calculateScalpingPriceLevels(makeCandles(), 'SELL', 1087, normalMarket);
    expect(levels).toBeNull();
  });

  test('calculates SELL breakdown only when reward/risk is at least 1.2 and prices fit the daily band', () => {
    const candles = Array.from({ length: 30 }, () => ({
      open: 1000, high: 1002, low: 998, close: 1001, volume: 1000
    }));
    const levels = calculateScalpingPriceLevels(candles, 'SELL', 1001, normalMarket);
    expect(levels).not.toBeNull();
    expect(levels.entryPrice).toBeLessThan(levels.support);
    expect(levels.entryPrice).toBeGreaterThanOrEqual(normalMarket.allowedMin);
    expect(levels.targetPrice).toBeLessThan(levels.entryPrice);
    expect(levels.stopLossPrice).toBeGreaterThan(levels.entryPrice);
    expect((levels.entryPrice - levels.targetPrice) / (levels.stopLossPrice - levels.entryPrice)).toBeGreaterThanOrEqual(1.2);
    expect(levels.method).toBe('swing-support-atr');
  });


  test('creates a BUY support-rebound setup near support with a bullish candle and valid risk/reward', () => {
    const candles = Array.from({ length: 30 }, (_, i) => ({
      open: 1000, high: i === 10 ? 1010 : 1003, low: 998, close: 1001, volume: 1000
    }));
    candles[candles.length - 1] = { open: 999, high: 1003, low: 998, close: 1000, volume: 1000 };
    const levels = calculateScalpingPriceLevels(candles, 'BUY', 1000, {
      allowedMin: 900, allowedMax: 1100, orderBook: { buy: [], sell: [] }
    });
    expect(levels).not.toBeNull();
    expect(levels.method).toBe('support-rebound-atr-v1');
    expect(levels.entryPrice).toBe(1000);
    expect(levels.stopLossPrice).toBeLessThan(levels.entryPrice);
    expect(levels.targetPrice).toBeGreaterThan(levels.entryPrice);
    expect(levels.entryPrice).toBeGreaterThanOrEqual(900);
    expect(levels.targetPrice).toBeLessThanOrEqual(1100);
  });

  test('creates a SELL resistance-rejection exit reference with a bearish candle', () => {
    const candles = Array.from({ length: 30 }, (_, i) => ({
      open: 1005, high: i === 10 ? 1010 : 1008, low: 998, close: 1004, volume: 1000
    }));
    candles[candles.length - 1] = { open: 1009, high: 1010, low: 998, close: 1008, volume: 1000 };
    const levels = calculateScalpingPriceLevels(candles, 'SELL', 1008, {
      allowedMin: 900, allowedMax: 1100, orderBook: { buy: [], sell: [] }
    });
    expect(levels).not.toBeNull();
    expect(levels.method).toBe('resistance-rejection-exit-atr-v1');
    expect(levels.entryPrice).toBe(1008);
    expect(levels.stopLossPrice).toBeGreaterThan(levels.entryPrice);
    expect(levels.targetPrice).toBeLessThan(levels.entryPrice);
    expect(levels.entryPrice).toBeGreaterThanOrEqual(900);
    expect(levels.stopLossPrice).toBeLessThanOrEqual(1100);
  });

  test('does not turn a support touch without a bullish candle into a rebound signal', () => {
    const candles = Array.from({ length: 30 }, () => ({
      open: 1001, high: 1010, low: 998, close: 1000, volume: 1000
    }));
    candles[candles.length - 1] = { open: 1001, high: 1003, low: 998, close: 999, volume: 1000 };
    const reasons = [];
    const levels = calculateScalpingPriceLevels(candles, 'BUY', 999, {
      allowedMin: 900, allowedMax: 1000, orderBook: { buy: [], sell: [] }
    }, reason => reasons.push(reason));
    expect(levels).toBeNull();
    expect(levels?.method).not.toBe('support-rebound-atr-v1');
  });

  test('suppresses BUY when the breakout entry is above the daily ceiling (befjer scenario)', () => {
    const candles = makeCandles().map(c => ({ ...c, high: c.high + 250, open: c.open + 250, low: c.low + 250, close: c.close + 250 }));
    expect(calculateScalpingPriceLevels(candles, 'BUY', 12300, {
      allowedMin: 11700, allowedMax: 12300, orderBook: { buy: [{ price: 12300, volume: 500000 }], sell: [] }
    })).toBeNull();
  });

  test('uses a validated at-market continuation when a breakout trigger exceeds the daily ceiling', () => {
    const candles = Array.from({ length: 30 }, () => ({
      open: 1000, high: 1004, low: 1000, close: 1000, volume: 1000
    }));
    candles[candles.length - 1] = { open: 1000, high: 1004, low: 1000, close: 1001, volume: 1000 };
    const levels = calculateScalpingPriceLevels(candles, 'BUY', 1001, {
      allowedMin: 990, allowedMax: 1004, orderBook: { buy: [], sell: [] }
    });
    expect(levels).not.toBeNull();
    expect(levels.method).toBe('at-market-continuation-atr-v1');
    expect(levels.entryPrice).toBe(1001);
    expect(levels.entryPrice).toBeLessThanOrEqual(1004);
    expect(levels.targetPrice).toBeGreaterThan(levels.entryPrice);
    expect(levels.stopLossPrice).toBeLessThan(levels.entryPrice);
    expect((levels.targetPrice - levels.entryPrice) / (levels.entryPrice - levels.stopLossPrice)).toBeGreaterThanOrEqual(1.2);
  });

  test('suppresses SELL when the breakdown entry is below the daily floor (thpardis scenario)', () => {
    const candles = makeCandles().map(c => ({ ...c, high: c.high + 3300, open: c.open + 3300, low: c.low + 3300, close: c.close + 3300 }));
    expect(calculateScalpingPriceLevels(candles, 'SELL', 4340, {
      allowedMin: 4340, allowedMax: 4600, orderBook: { buy: [], sell: [{ price: 4340, volume: 400000 }] }
    })).toBeNull();
  });

  test('reports missing or invalid daily price bands as a distinct rejection reason', () => {
    const missingReasons = [];
    expect(calculateScalpingPriceLevels(makeCandles(), 'BUY', 1087, {}, reason => missingReasons.push(reason))).toBeNull();
    expect(missingReasons).toContain('invalid_price_band');

    const invalidReasons = [];
    expect(calculateScalpingPriceLevels(
      makeCandles(), 'BUY', 1087,
      { allowedMin: 1200, allowedMax: 900 },
      reason => invalidReasons.push(reason)
    )).toBeNull();
    expect(invalidReasons).toContain('invalid_price_band');
  });

  test('reports a valid band that is too narrow for the calculated BUY entry', () => {
    const reasons = [];
    const narrowBand = { allowedMin: 900, allowedMax: 1080, orderBook: { buy: [], sell: [] } };
    expect(calculateScalpingPriceLevels(makeCandles(), 'BUY', 1070, narrowBand, reason => reasons.push(reason))).toBeNull();
    expect(reasons).toContain('buy_entry_outside_band_or_invalid');
  });

  test('reports a locked upper-limit order book separately from an invalid band', () => {
    const reasons = [];
    const lockedMarket = {
      allowedMin: 900,
      allowedMax: 1087,
      orderBook: { buy: [{ price: 1087, volume: 1000 }], sell: [] }
    };
    expect(calculateScalpingPriceLevels(makeCandles(), 'BUY', 1080, lockedMarket, reason => reasons.push(reason))).toBeNull();
    expect(reasons).toContain('buy_locked_at_upper_limit');
  });

  test('returns null when valid history is insufficient', () => {
    expect(calculateScalpingPriceLevels(makeCandles(10), 'BUY', 1030, normalMarket)).toBeNull();
  });

  test('returns null for unknown signal direction', () => {
    expect(calculateScalpingPriceLevels(makeCandles(), 'WATCH', 1087, normalMarket)).toBeNull();
  });
});

describe('selectCandidatesWithValidLevels', () => {
  test('continues past rejected higher-ranked symbols until it fills the valid opportunity limit', async () => {
    const ranked = [
      { item: { symbol: 'TOP-1' }, scored: { score: 100 } },
      { item: { symbol: 'TOP-2' }, scored: { score: 99 } },
      { item: { symbol: 'NEXT-1' }, scored: { score: 98 } },
      { item: { symbol: 'NEXT-2' }, scored: { score: 97 } }
    ];
    const attempted = [];
    const result = await selectCandidatesWithValidLevels(ranked, 2, async candidate => {
      attempted.push(candidate.item.symbol);
      if (candidate.item.symbol.startsWith('TOP')) return null;
      return { entryPrice: 100, targetPrice: 110, stopLossPrice: 95 };
    });
    expect(attempted).toEqual(['TOP-1', 'TOP-2', 'NEXT-1', 'NEXT-2']);
    expect(result.candidates.map(x => x.item.symbol)).toEqual(['NEXT-1', 'NEXT-2']);
    expect(result.candidates.every(x => x.levels.entryPrice === 100)).toBe(true);
    expect(result.evaluatedCount).toBe(4);
  });

  test('stops checking once the valid opportunity limit is reached', async () => {
    const ranked = [1, 2, 3, 4].map(n => ({ item: { symbol: String(n) } }));
    const attempted = [];
    const result = await selectCandidatesWithValidLevels(ranked, 2, async candidate => {
      attempted.push(candidate.item.symbol);
      return { entryPrice: 100 };
    });
    expect(attempted).toEqual(['1', '2']);
    expect(result.candidates).toHaveLength(2);
    expect(result.evaluatedCount).toBe(2);
  });
});
