'use strict';

jest.mock('../config/prisma.cjs', () => ({
  appConfig: {
    findUnique: jest.fn().mockResolvedValue(null),
    upsert: jest.fn().mockResolvedValue({})
  }
}));
jest.mock('../services/marketSnapshot.service.cjs', () => ({
  getActiveSnapshot: jest.fn().mockResolvedValue({
    id: 1,
    activatedAt: '2026-10-12T08:00:00.000Z'
  })
}));
jest.mock('../services/sharedMarket.service.cjs', () => ({
  getSymbols: jest.fn(),
  getSymbolHistory: jest.fn()
}));
jest.mock('../services/codalIntelligence.service.cjs', () => ({
  getReports: jest.fn()
}));
jest.mock('../services/fundamental-analysis.v2.service.cjs', () => ({
  analyzeAnnouncements: jest.fn()
}));

const market = require('../services/sharedMarket.service.cjs');
const codal = require('../services/codalIntelligence.service.cjs');
const fundamentalAnalysis = require('../services/fundamental-analysis.v2.service.cjs');
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

  test('normalizes the actual BRS Codal API date and attachment field names', () => {
    const item = codalService.normalizeItem({
      title: 'صورت‌های مالی', l18: 'فزر', date_publish: '۱۴۰۵/۰۷/۱۴',
      date_send: '۱۴۰۵/۰۷/۱۳', link_pdf: 'https://example.test/report.pdf',
      link_excel: 'https://example.test/report.xlsx',
      link_attachment: 'https://example.test/attachment'
    });
    expect(item.publishDate).toBe('1405/07/14');
    expect(item.symbol).toBe('فزر');
    expect(item.pdfUrl).toBe('https://example.test/report.pdf');
    expect(item.excelUrl).toBe('https://example.test/report.xlsx');
    expect(item.attachmentUrl).toBe('https://example.test/attachment');
    expect(item.financialMetrics).toEqual({});
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


  test('extracts fundamental metrics from real Codal statement documents when list rows have no numbers', async () => {
    const now = new Date('2026-10-12T08:00:00.000Z');
    fundamentalAnalysis.analyzeAnnouncements.mockResolvedValue({
      score: 78,
      scoreStatus: 'calculated',
      scoreCoverage: 0.8,
      numericData: {
        metrics: {
          revenue: { value: 9000 }, operatingProfit: { value: 1800 },
          netProfit: { value: 1200 }, assets: { value: 15000 },
          liabilities: { value: 6000 }, equity: { value: 9000 }, eps: { value: 125 }
        },
        quality: { extractedMetricCount: 7 }
      },
      financialDocuments: [{
        available: true,
        announcement: { title: 'اطلاعات و صورت‌های مالی میان‌دوره‌ای شش‌ماهه', publishDate: '1405/07/01' },
        metrics: { eps: { value: 125 }, netProfit: { value: 1200 } }
      }]
    });
    const reports = [{
      title: 'اطلاعات و صورت‌های مالی میان‌دوره‌ای شش‌ماهه',
      publishDate: '1405/07/01',
      excelUrl: 'https://excel.codal.ir/report.xlsx',
      attachmentUrl: 'https://codal.ir/attachment',
      pdfUrl: 'https://codal.ir/report.pdf',
      url: 'https://codal.ir/report',
      raw: { title: 'اطلاعات و صورت‌های مالی میان‌دوره‌ای شش‌ماهه', date_publish: '1405/07/01' },
      financialMetrics: {}
    }];

    await expect(engine.analyzeFundamentalWithDocuments(reports, now)).resolves.toMatchObject({
      score: 78, eps: 125, netProfit: 1200, revenue: 9000,
      source: 'codal-financial-documents', extractedMetricCount: 7
    });
    expect(fundamentalAnalysis.analyzeAnnouncements).toHaveBeenCalledWith({
      announcements: [expect.objectContaining({
        title: reports[0].title,
        date_publish: reports[0].publishDate,
        link_excel: reports[0].excelUrl,
        link_attachment: reports[0].attachmentUrl,
        link_pdf: reports[0].pdfUrl
      })]
    });
  });

  test('does not download or score financial documents older than the Codal freshness limit', async () => {
    const reports = [{
      title: 'صورت‌های مالی',
      publishDate: '2024/01/01',
      excelUrl: 'https://excel.codal.ir/old.xlsx',
      financialMetrics: {}
    }];
    await expect(engine.analyzeFundamentalWithDocuments(reports, new Date('2026-10-12T08:00:00.000Z'))).resolves.toBeNull();
    expect(fundamentalAnalysis.analyzeAnnouncements).not.toHaveBeenCalled();
  });

  test('labels the Tehran market as closed outside the trading session', () => {
    expect(engine.getMarketSession(new Date('2026-10-12T16:00:00.000Z')).status).toBe('CLOSED');
  });
});
