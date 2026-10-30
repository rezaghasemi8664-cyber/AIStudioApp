'use strict';

const {
  estimateHistoricalScalpingProbabilities
} = require('../services/scalping-historical-probability.service.cjs');

describe('estimateHistoricalScalpingProbabilities', () => {
  test('does not invent percentages when historical samples are insufficient', () => {
    const result = estimateHistoricalScalpingProbabilities(
      Array.from({ length: 30 }, () => ({ open: 100, high: 102, low: 99, close: 101 })),
      { currentPrice: 101, atr: 3, entryPrice: 100, targetPrice: 104, stopLossPrice: 95 }
    );
    expect(result.status).toBe('INSUFFICIENT_DATA');
    expect(result.entryHitProbability).toBeNull();
    expect(result.reversalAfterEntryProbability).toBeNull();
    expect(result.targetBeforeStopProbability).toBeNull();
  });

  test('uses only subsequent OHLC sessions and reports observed frequencies', () => {
    const history = Array.from({ length: 90 }, () => ({
      open: 100, high: 102, low: 99, close: 101
    }));
    const result = estimateHistoricalScalpingProbabilities(history, {
      currentPrice: 101,
      atr: 3,
      entryPrice: 100,
      targetPrice: 104,
      stopLossPrice: 95,
      entryType: 'PENDING_PULLBACK'
    });
    expect(result.status).toBe('CALIBRATED');
    expect(result.samples).toBeGreaterThanOrEqual(30);
    expect(result.entryHitProbability).toBe(100);
    expect(result.reversalAfterEntryProbability).toBe(100);
    expect(result.targetBeforeStopProbability).toBe(0);
    expect(result.method).toBe('walk-forward-ohlc-atr-v1');
  });

  test('recognizes breakout trigger touches from historical highs', () => {
    const history = Array.from({ length: 90 }, () => ({
      open: 100, high: 102, low: 99, close: 101
    }));
    const result = estimateHistoricalScalpingProbabilities(history, {
      currentPrice: 101,
      atr: 3,
      entryPrice: 102,
      targetPrice: 105,
      stopLossPrice: 96,
      entryType: 'BREAKOUT_TRIGGER'
    });
    expect(result.status).toBe('CALIBRATED');
    expect(result.entryHitProbability).toBe(100);
  });
});
