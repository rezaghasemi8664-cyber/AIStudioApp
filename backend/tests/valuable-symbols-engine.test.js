'use strict';

jest.mock('../services/sharedMarket.service.cjs', () => ({
  getSymbols: jest.fn(),
  getSymbolHistory: jest.fn()
}));
jest.mock('../services/codalIntelligence.service.cjs', () => ({
  getReports: jest.fn()
}));

const market = require('../services/sharedMarket.service.cjs');
const codal = require('../services/codalIntelligence.service.cjs');
const engine = require('../services/valuableSymbols.engine.cjs');
const codalService = jest.requireActual('../services/codalIntelligence.service.cjs');

describe('Codal normalization compatibility', () => {
  test('normalizes Persian digits and numeric values', () => {
    expect(codalService.normalizeDigits('۱۴۰۵/۰۷/۲۱')).toBe('1405/07/21');
    expect(codalService.normalizeNumber('۱٬۲۳۴')).toBe(1234);
    expect(codalService.normalizeNumber('۱۲۵')).toBe(125);
  });

  test('extracts financial metrics from a nested financial data object', () => {
    expect(codalService.extractFinancialMetrics({
      FinancialData: { EPS: '۱۲۳', NetProfit: '۴۵۶۷', Revenue: '۹۸۷۶' }
    })).toMatchObject({ eps: 123, netProfit: 4567, revenue: 9876 });
  });

  test('normalizes alternate publication date fields and Persian digits', () => {
    const item = codalService.normalizeItem({
      Title: 'گزارش مالی', SendDate: '۱۴۰۵/۰۷/۲۰', EPS: '۱۰۰'
    });
    expect(item.publishDate).toBe('1405/07/20');
    expect(item.financialMetrics.eps).toBe(100);
  });
});

describe('valuable symbols freshness guards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('accepts a recent price timestamp and rejects missing, future, and expired timestamps', () => {
    const now = Date.parse('2026-10-12T08:00:00.000Z');
    expect(engine.isFreshTimestamp('2026-10-12T07:00:00.000Z', 72 * 60 * 60 * 1000, now)).toBe(true);
    expect(engine.isFreshTimestamp('2026-10-08T07:00:00.000Z', 72 * 60 * 60 * 1000, now)).toBe(false);
    expect(engine.isFreshTimestamp(null, 72 * 60 * 60 * 1000, now)).toBe(false);
    expect(engine.isFreshTimestamp('2026-10-13T08:00:00.000Z', 72 * 60 * 60 * 1000, now)).toBe(false);
  });

  test('does not request technical history for a market row with expired prices', async () => {
    const now = new Date('2026-10-12T08:00:00.000Z');
    market.getSymbols.mockResolvedValue([{
      symbol: 'STALE', name: 'Stale row', lastPrice: 100, closePrice: 100,
      value: 100000, updatedAt: '2026-10-08T07:00:00.000Z', isStale: false
    }]);

    await expect(engine.evaluateValuableSymbols({ now })).resolves.toEqual([]);
    expect(market.getSymbolHistory).not.toHaveBeenCalled();
    expect(codal.getReports).not.toHaveBeenCalled();
  });

  test('rejects technical history whose latest candle is too old or whose dates are missing', () => {
    const now = Date.parse('2026-10-12T08:00:00.000Z');
    const oldHistory = Array.from({ length: 20 }, (_, index) => ({
      date: new Date(now - (10 + index) * 86400000),
      open: 100, high: 110, low: 90, close: 100
    }));
    expect(engine.isFreshHistory(oldHistory, now)).toBe(false);
    expect(engine.isFreshHistory(oldHistory.map(row => ({ ...row, date: null })), now)).toBe(false);
  });

  test('requires a dated, positive Codal financial report and rejects expired reports', () => {
    const now = new Date('2026-10-12T08:00:00.000Z');
    const metrics = { eps: 10, netProfit: 100, revenue: 500 };
    expect(engine.analyzeFundamental([{ financialMetrics: metrics, publishDate: null }], now)).toBeNull();
    expect(engine.analyzeFundamental([{
      financialMetrics: metrics, publishDate: '2024-01-01', title: 'Old report'
    }], now)).toBeNull();
    expect(engine.analyzeFundamental([{
      financialMetrics: metrics, publishDate: '2026-10-01', title: 'Recent report'
    }], now)).toMatchObject({ source: 'codal', reportTitle: 'Recent report', eps: 10 });
  });

  test('labels the Tehran market as closed outside the trading session', () => {
    expect(engine.getMarketSession(new Date('2026-10-12T16:00:00.000Z')).status).toBe('CLOSED');
  });
});
