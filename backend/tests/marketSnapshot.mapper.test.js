'use strict';

const { mapBRSAllSymbol } = require('../services/marketSnapshot.mapper.cjs');

describe('BRS market snapshot mapper', () => {
  test('preserves every available quote, valuation, liquidity and investor metric', () => {
    const mapped = mapBRSAllSymbol({
      symbol: 'فولاد', name: 'فولاد مبارکه', isin: '123',
      open: 100, high: 110, low: 90, lastPrice: 108, closingPrice: 105,
      lastChange: 8, lastChangePercent: 8, closingChange: 5, closingChangePercent: 5,
      yesterday: 100, allowedMin: 90, allowedMax: 110,
      tradeVolume: 1000, tradeValue: 105000, tradeCount: 50, averagePrice: 105,
      shares: 500000, freeFloatPercent: 25, baseVolume: 100, marketCap: 50000000,
      eps: 20, pe: 5, sector: 'فلزات', sectorId: 12,
      realBuyVolume: 600, realSellVolume: 400, realBuyValue: 63000, realSellValue: 42000,
      realBuyCount: 12, realSellCount: 8, volumeAvg1m: 500,
      instBuyVolume: 300, instSellVolume: 200, instBuyValue: 31500, instSellValue: 21000,
      instBuyCount: 3, instSellCount: 2,
      orderBook: { buy: [{ level: 1, price: 107, volume: 100, count: 2 }], sell: [] }
    });

    for (const [field, expected] of Object.entries({
      lastPrice:108, lastChange:8, lastChangePercent:8,
      closePrice:105, closingPrice:105, change:8, changePercent:8,
      closingChange:5, closingChangePercent:5, yesterday:100,
      volume:1000, value:105000, tradeCount:50, averagePrice:105,
      shares:500000, freeFloatPercent:25, baseVolume:100, marketCap:50000000,
      eps:20, pe:5, realBuyVolume:600, realSellVolume:400,
      realBuyValue:63000, realSellValue:42000, realBuyCount:12, realSellCount:8,
      legalBuyVolume:300, legalSellVolume:200, legalBuyValue:31500, legalSellValue:21000,
      legalBuyCount:3, legalSellCount:2, sectorId:12
    })) {
      expect(mapped[field]).toBe(expected);
    }
    expect(mapped.orderBook.buy[0].price).toBe(107);
    expect(mapped.realMoneyFlow).toBe(200);
    expect(mapped.legalMoneyFlow).toBe(100);
  });

  test('does not fabricate zero values for missing optional BRS metrics', () => {
    const mapped = mapBRSAllSymbol({ symbol: 'نماد' });
    expect(mapped.eps).toBeNull();
    expect(mapped.pe).toBeNull();
    expect(mapped.realBuyCount).toBeNull();
    expect(mapped.legalBuyCount).toBeNull();
    expect(mapped.closingChange).toBeNull();
    expect(mapped.closingPrice).toBeNull();
    expect(mapped.lastChange).toBeNull();
    expect(mapped.lastChangePercent).toBeNull();
  });

  test('derives closing change percent only from real closing and yesterday prices', () => {
    const mapped = mapBRSAllSymbol({ symbol: 'نماد', closingPrice: 110, yesterday: 100 });
    expect(mapped.closingChangePercent).toBe(10);
    expect(mapBRSAllSymbol({ symbol: 'نماد' }).closingChangePercent).toBeNull();
  });
});
