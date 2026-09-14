'use strict';

/**
 * Downloads and extracts structured numeric data from CODAL financial
 * attachments. Excel is preferred because it preserves tabular values.
 *
 * Security boundaries:
 * - HTTPS is required by default.
 * - Hosts must be in CODAL_DOCUMENT_ALLOWED_HOSTS when configured.
 * - Response size and timeout are bounded.
 * - No URL containing credentials is followed.
 */

const XLSX = require('xlsx');

const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;

function envNumber(name, fallback, min, max) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function normalizeDigits(value) {
  return String(value ?? '')
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
}

function normalizeText(value) {
  return normalizeDigits(value)
    .replace(/[\u200c\u200f\u200e]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = normalizeDigits(value)
    .replace(/[٬،,]/g, '')
    .replace(/\s+/g, '')
    .replace(/[٪%]/g, '')
    .trim();
  if (!text || text === '-' || text === '—') return null;

  const negative = /^\(.*\)$/.test(text) || text.startsWith('-');
  const cleaned = text.replace(/[()]/g, '').replace(/[^0-9.+-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.') return null;
  const number = Number(cleaned);
  if (!Number.isFinite(number)) return null;
  return negative ? -Math.abs(number) : number;
}

function getAllowedHosts() {
  return String(process.env.CODAL_DOCUMENT_ALLOWED_HOSTS || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function validateDocumentUrl(rawUrl) {
  if (!rawUrl) return { ok: false, reason: 'empty-url' };

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: 'invalid-url' };
  }

  if (url.username || url.password) return { ok: false, reason: 'credentials-not-allowed' };
  if (url.protocol !== 'https:') return { ok: false, reason: 'https-required' };

  const allowedHosts = getAllowedHosts();
  if (allowedHosts.length > 0 && !allowedHosts.includes(url.hostname.toLowerCase())) {
    return { ok: false, reason: 'host-not-allowed' };
  }

  return { ok: true, url };
}

async function downloadDocument(rawUrl, options = {}) {
  const validation = validateDocumentUrl(rawUrl);
  if (!validation.ok) {
    throw new Error(`CODAL document URL rejected: ${validation.reason}`);
  }

  const timeoutMs = envNumber('CODAL_DOCUMENT_TIMEOUT_MS', DEFAULT_TIMEOUT_MS, 3000, 60000);
  const maxBytes = envNumber('CODAL_DOCUMENT_MAX_BYTES', DEFAULT_MAX_BYTES, 256 * 1024, 32 * 1024 * 1024);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(validation.url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'Accept': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/pdf,application/octet-stream;q=0.8,*/*;q=0.1',
        'User-Agent': 'RoniyaAnalyzer/5.2.1',
      },
    });

    if (!response.ok) throw new Error(`CODAL document HTTP ${response.status}`);

    const contentLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      throw new Error(`CODAL document exceeds ${maxBytes} bytes`);
    }

    const chunks = [];
    let total = 0;
    for await (const chunk of response.body) {
      total += chunk.length;
      if (total > maxBytes) throw new Error(`CODAL document exceeds ${maxBytes} bytes`);
      chunks.push(Buffer.from(chunk));
    }

    const buffer = Buffer.concat(chunks);
    return {
      buffer,
      contentType: String(response.headers.get('content-type') || '').toLowerCase(),
      finalUrl: response.url,
      bytes: buffer.length,
    };
  } finally {
    clearTimeout(timer);
  }
}

function looksLikeExcel(contentType, url) {
  return /spreadsheet|excel|vnd\.ms-excel|officedocument\.spreadsheet/.test(contentType)
    || /\.(xlsx|xls)(?:$|[?#])/i.test(url);
}

function extractExcelRows(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false, raw: true });
  const sheets = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: false,
    });

    sheets.push({
      name: sheetName,
      rows: rows.slice(0, 2000),
    });
  }

  return sheets;
}

const METRIC_PATTERNS = {
  revenue: ['فروش', 'درآمد عملیاتی', 'درآمد حاصل از فروش', 'درآمد'],
  operatingProfit: ['سود عملیاتی', 'سود (زیان) عملیاتی', 'سود و زیان عملیاتی'],
  netProfit: ['سود خالص', 'سود (زیان) خالص', 'سود زیان خالص'],
  assets: ['جمع دارایی', 'جمع داراییها', 'جمع دارایی ها'],
  liabilities: ['جمع بدهی', 'جمع بدهیها', 'جمع بدهی ها'],
  equity: ['حقوق مالکانه', 'حقوق صاحبان سهام', 'جمع حقوق مالکانه'],
  cash: ['وجه نقد', 'موجودی نقد', 'نقد و معادل نقد'],
  eps: ['سود هر سهم', 'eps'],
};

function findMetricValues(sheets) {
  const metrics = {};

  for (const sheet of sheets) {
    for (const row of sheet.rows) {
      const normalizedCells = row.map((cell) => normalizeText(cell));
      for (let index = 0; index < normalizedCells.length; index += 1) {
        const label = normalizedCells[index];
        if (!label) continue;

        for (const [metric, patterns] of Object.entries(METRIC_PATTERNS)) {
          if (metrics[metric] !== undefined) continue;
          if (!patterns.some((pattern) => label.toLowerCase().includes(normalizeText(pattern).toLowerCase()))) continue;

          const candidates = normalizedCells.slice(index + 1).map(parseNumber).filter((value) => value !== null);
          if (candidates.length > 0) {
            metrics[metric] = {
              value: candidates[0],
              sheet: sheet.name,
              label,
            };
          }
        }
      }
    }
  }

  return metrics;
}

async function extractFinancialDataFromExcel(rawUrl) {
  const downloaded = await downloadDocument(rawUrl);
  if (!looksLikeExcel(downloaded.contentType, downloaded.finalUrl)) {
    throw new Error('CODAL attachment is not recognized as an Excel document');
  }

  const sheets = extractExcelRows(downloaded.buffer);
  return {
    sourceType: 'excel',
    url: downloaded.finalUrl,
    bytes: downloaded.bytes,
    sheetCount: sheets.length,
    metrics: findMetricValues(sheets),
  };
}

async function extractFinancialDataFromAnnouncement(announcement) {
  const excelUrl = announcement && announcement.link_excel;
  if (!excelUrl) {
    return {
      available: false,
      sourceType: null,
      reason: 'excel-link-not-available',
      metrics: {},
    };
  }

  try {
    const result = await extractFinancialDataFromExcel(excelUrl);
    return {
      available: Object.keys(result.metrics).length > 0,
      ...result,
    };
  } catch (error) {
    return {
      available: false,
      sourceType: 'excel',
      reason: error.message,
      metrics: {},
    };
  }
}

module.exports = {
  normalizeDigits,
  normalizeText,
  parseNumber,
  validateDocumentUrl,
  downloadDocument,
  extractExcelRows,
  findMetricValues,
  extractFinancialDataFromExcel,
  extractFinancialDataFromAnnouncement,
};
