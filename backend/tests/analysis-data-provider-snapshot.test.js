'use strict';

jest.mock('../services/brs.service.cjs', () => ({
  getSymbolData: jest.fn(),
  getSymbolHistory: jest.fn(),
  getAdjustedDailyCandlestick: jest.fn()
}));
jest.mock('../services/allSymbolsSnapshot.service.cjs', () => ({
  searchSymbol: jest.fn()
}));
jest.mock('../services/codal.provider.cjs', () => ({
  getStatus: jest.fn(() => ({ configured: false, enabled: false }))
}));
jest.mock('../services/fundamental-analysis.v2.service.cjs', () => ({
  analyzeAnnouncements: jest.fn(async () => ({}))
}));

const brs = require('../services/brs.service.cjs');
const snapshot = require('../services/allSymbolsSnapshot.service.cjs');
const provider = require('../services/analysis-data.provider.cjs');

function tehranDateKey(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tehran',
    calendar: 'gregory'
  }).format(date);
}

describe('analysis market quote source', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    brs.getSymbolHistory.mockResolvedValue({ data: [], _meta: { source: 'history' } });
    brs.getAdjustedDailyCandlestick.mockResolvedValue({ data: [], _meta: { source: 'adjusted-history' } });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('uses a fresh same-day AllSymbols snapshot for quote fields and retains BRS history', async () => {
    const now = new Date();
    snapshot.searchSymbol.mockResolvedValue({
      status: 'FOUND',
      symbol: {
        symbol: 'فولاد',
        name: 'فولاد مبارکه',
        lastPrice: 12345,
        lastChange: 45,
        lastChangePercent: 0.36,
        closingPrice: 12300,
        closingChange: 20,
        closingChangePercent: 0.16,
        tradeVolume: 987654,
        tradeCount: 321,
        allowedMin: 11700,
        allowedMax: 12900,
        pe: 6.5,
        eps: 1900,
        realBuyVolume: 50000,
        realSellVolume: 40000,
        instBuyVolume: 10000,
        instSellVolume: 20000
      },
      snapshotDate: tehranDateKey(now),
      snapshotUpdatedAt: now.toISOString(),
      symbolCount: 1300,
      source: 'brsapi-allsymbols'
    });

    const result = await provider.getMarketData('فولاد');

    expect(result.sources.market).toBe('AllSymbolsSnapshot');
    expect(result.market.lastPrice).toBe(12345);
    expect(result.market.closingPrice).toBe(12300);
    expect(result.market.allowedMin).toBe(11700);
    expect(result.market.allowedMax).toBe(12900);
    expect(result.market.pe).toBe(6.5);
    expect(result.market.eps).toBe(1900);
    expect(result.sources.history).toBe('BRS');
    expect(brs.getSymbolData).not.toHaveBeenCalled();
    expect(brs.getSymbolHistory).toHaveBeenCalledWith('فولاد', 120);
    expect(brs.getAdjustedDailyCandlestick).toHaveBeenCalledWith('فولاد', 120);
    expect(result.meta.market.source).toBe('all-symbols-snapshot');
  });

  test('falls back to BRS for an old snapshot during expected market hours', async () => {
    // Sunday at 09:30 Tehran time: the market is expected to be open.
    jest.useFakeTimers().setSystemTime(new Date('2026-10-18T06:00:00.000Z'));
    const old = new Date(Date.now() - 48 * 60 * 60 * 1000);
    snapshot.searchSymbol.mockResolvedValue({
      status: 'FOUND',
      symbol: { symbol: 'فولاد', lastPrice: 12345, closingPrice: 12300 },
      snapshotDate: tehranDateKey(old),
      snapshotUpdatedAt: old.toISOString(),
      symbolCount: 1300
    });
    brs.getSymbolData.mockResolvedValue({
      data: { symbol: 'فولاد', lastPrice: 456, closingPrice: 455 },
      _meta: { source: 'live' }
    });

    const result = await provider.getMarketData('فولاد');

    expect(brs.getSymbolData).toHaveBeenCalledWith('فولاد');
    expect(result.sources.market).toBe('BRS');
    expect(result.market.lastPrice).toBe(456);
  });

  test('uses the latest valid snapshot across multiple closed days', async () => {
    // Saturday at 15:30 Tehran time, after two days without a market refresh.
    jest.useFakeTimers().setSystemTime(new Date('2026-10-17T12:00:00.000Z'));
    const old = new Date(Date.now() - 48 * 60 * 60 * 1000);
    snapshot.searchSymbol.mockResolvedValue({
      status: 'FOUND',
      symbol: { symbol: 'فولاد', lastPrice: 12345, closingPrice: 12300 },
      snapshotDate: tehranDateKey(old),
      snapshotUpdatedAt: old.toISOString(),
      symbolCount: 1300,
      source: 'brsapi-allsymbols'
    });

    const result = await provider.getMarketData('فولاد');

    expect(result.sources.market).toBe('AllSymbolsSnapshot');
    expect(result.market.lastPrice).toBe(12345);
    expect(result.market.closingPrice).toBe(12300);
    expect(brs.getSymbolData).not.toHaveBeenCalled();
  });

  test('falls back to BRS when the snapshot lookup fails', async () => {
    snapshot.searchSymbol.mockRejectedValue(new Error('database unavailable'));
    brs.getSymbolData.mockResolvedValue({
      data: { symbol: 'فولاد', lastPrice: 456, closingPrice: 455 },
      _meta: { source: 'live' }
    });

    const result = await provider.getMarketData('فولاد');

    expect(brs.getSymbolData).toHaveBeenCalledWith('فولاد');
    expect(result.sources.market).toBe('BRS');
  });
});
