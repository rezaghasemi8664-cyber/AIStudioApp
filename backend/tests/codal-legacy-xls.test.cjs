'use strict';
const XLSX = require('@e965/xlsx');
const { extractExcelRows, findMetricValues } = require('../services/codal-document.service.cjs');

describe('Codal legacy XLS extraction', () => {
  test('reads BIFF/XLS workbook cells and extracts financial metrics', () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ['شرح', 'مبلغ'],
      ['درآمدهای عملیاتی', 1250000],
      ['سود خالص', 275000],
      ['جمع دارایی ها', 4000000]
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, 'صورت مالی');
    const binaryXls = XLSX.write(workbook, { type: 'buffer', bookType: 'xls' });
    expect(binaryXls.slice(0, 8).toString('hex')).toBe('d0cf11e0a1b11ae1');
    const sheets = extractExcelRows(binaryXls);
    expect(sheets).toHaveLength(1);
    expect(sheets[0].rows).toEqual(expect.arrayContaining([
      expect.arrayContaining(['درآمدهای عملیاتی', '1250000']),
      expect.arrayContaining(['سود خالص', '275000']),
      expect.arrayContaining(['جمع دارایی ها', '4000000'])
    ]));
    const metrics = findMetricValues(sheets);
    expect(metrics.revenue.value).toBe(1250000);
    expect(metrics.netProfit.value).toBe(275000);
    expect(metrics.assets.value).toBe(4000000);
  });
  test('does not interpret an empty HTML response as financial data', () => {
    expect(extractExcelRows(Buffer.from('<html><body><h1>صورت سود و زیان</h1></body></html>'))).toEqual([]);
  });
});
