'use strict';

jest.mock('../config/prisma.cjs', () => ({
  $queryRaw: jest.fn(),
  $executeRaw: jest.fn()
}));

const XLSX = require('@e965/xlsx');
const prisma = require('../config/prisma.cjs');
const { extractFinancialDataFromAnnouncement } = require('../services/codal-document.service.cjs');

describe('CODAL financial document cache fallback', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete global.fetch;
  });

  test('downloads, extracts and persists financial metrics when the central cache has no row', async () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ['شرح', 'مبلغ'],
      ['درآمدهای عملیاتی', 1250000],
      ['سود خالص', 275000],
      ['جمع دارایی ها', 4000000]
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, 'صورت مالی');
    const file = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    prisma.$queryRaw.mockResolvedValueOnce([]);
    prisma.$executeRaw.mockResolvedValueOnce(1);
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      url: 'https://excel.codal.ir/service/Excel/GetAll/123',
      headers: {
        get(name) {
          if (name === 'content-type') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          if (name === 'content-length') return String(file.length);
          return null;
        }
      },
      body: null,
      arrayBuffer: async () => file
    }));

    const result = await extractFinancialDataFromAnnouncement({
      code: '123',
      title: 'صورت‌های مالی میان‌دوره‌ای',
      dateSend: '1405/06/31',
      l18: 'نمادآزمایشی',
      linkExcel: 'https://excel.codal.ir/service/Excel/GetAll/123'
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(result.available).toBe(true);
    expect(result.cached).toBe(false);
    expect(result.metrics.revenue.value).toBe(1250000);
    expect(result.metrics.netProfit.value).toBe(275000);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });
});
