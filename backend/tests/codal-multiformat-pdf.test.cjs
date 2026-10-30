'use strict';

jest.mock('pdf-parse', () => jest.fn(async () => ({
  text: ['درآمدهای عملیاتی 1250000', 'سود خالص 275000', 'جمع دارایی ها 4000000'].join(String.fromCharCode(10))
})));

const {
  extractPdfRows,
  findMetricValues,
  isPdfDocument,
  validateDocumentUrl
} = require('../services/codal-document.service.cjs');

describe('Codal multi-format document handling', () => {
  test('detects PDF by signature, content type and extension', () => {
    expect(isPdfDocument('', '', Buffer.from('%PDF-1.4'))).toBe(true);
    expect(isPdfDocument('application/pdf', '', Buffer.from('not-pdf'))).toBe(true);
    expect(isPdfDocument('', 'https://codal.ir/report.pdf', Buffer.from('not-pdf'))).toBe(true);
    expect(isPdfDocument('text/html', 'https://codal.ir/report', Buffer.from('<html/>'))).toBe(false);
  });

  test('extracts financial metrics from text-based PDF content', async () => {
    const sheets = await extractPdfRows(Buffer.from('%PDF-1.4 test fixture'));
    const metrics = findMetricValues(sheets);
    expect(metrics.revenue.value).toBe(1250000);
    expect(metrics.netProfit.value).toBe(275000);
    expect(metrics.assets.value).toBe(4000000);
  });

  test('rejects scanned or invalid PDF responses without text extraction', async () => {
    const pdfParse = require('pdf-parse');
    pdfParse.mockResolvedValueOnce({ text: '   ' });
    await expect(extractPdfRows(Buffer.from('%PDF-1.4 empty'))).rejects.toThrow(/no extractable text/i);
    await expect(extractPdfRows(Buffer.from('not a pdf'))).rejects.toThrow(/valid PDF signature/i);
  });

  test('rejects non-Codal hosts and preserves the configured relay contract', () => {
    expect(() => validateDocumentUrl('https://example.com/file.pdf')).toThrow(/allowed domain/i);
    const relayUrl = validateDocumentUrl('https://excel.codal.ir/service/Excel/GetAll/123');
    const parsed = new URL(relayUrl);
    expect(parsed.hostname).toBe('codal-relay.codal.mytestdomain123.ir');
    expect(parsed.searchParams.get('url')).toBe('https://excel.codal.ir/service/Excel/GetAll/123');
    expect(validateDocumentUrl(relayUrl)).toBe(relayUrl);
  });
});
