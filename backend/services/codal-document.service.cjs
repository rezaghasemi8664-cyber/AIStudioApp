'use strict';

/**
 * Bounded CODAL financial-document downloader and Excel extractor.
 *
 * The backend intentionally avoids adding a new runtime dependency here.
 * XLSX is a ZIP container, so this reader uses Node's built-in zlib and
 * parses the worksheet XML needed for financial tables.
 */

const zlib = require('zlib');

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

async function downloadDocument(rawUrl) {
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

function findEndOfCentralDirectory(buffer) {
  const start = Math.max(0, buffer.length - 65557);
  for (let offset = buffer.length - 22; offset >= start; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error('Invalid XLSX ZIP: end of central directory not found');
}

function extractZipEntries(buffer) {
  const eocd = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(eocd + 10);
  const centralSize = buffer.readUInt32LE(eocd + 12);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  const entries = new Map();
  let cursor = centralOffset;
  const centralEnd = centralOffset + centralSize;

  for (let index = 0; index < entryCount && cursor < centralEnd; index += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error('Invalid XLSX ZIP: central directory entry not found');
    }

    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.slice(cursor + 46, cursor + 46 + nameLength).toString('utf8');

    if (compressedSize > 32 * 1024 * 1024 || uncompressedSize > 64 * 1024 * 1024) {
      throw new Error('XLSX entry exceeds safety limits');
    }

    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.slice(dataStart, dataStart + compressedSize);

    let content;
    if (method === 0) content = compressed;
    else if (method === 8) content = zlib.inflateRawSync(compressed);
    else throw new Error(`Unsupported XLSX compression method: ${method}`);

    if (content.length !== uncompressedSize) {
      throw new Error(`Invalid XLSX entry size for ${name}`);
    }

    entries.set(name, content);
    cursor += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

function decodeXml(value) {
  return String(value || '')
    .replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (_, code) => {
      const number = code.toLowerCase().startsWith('x')
        ? parseInt(code.slice(1), 16)
        : parseInt(code, 10);
      return Number.isFinite(number) ? String.fromCodePoint(number) : '';
    })
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function attr(tag, name) {
  const expression = new RegExp(`${name}=["']([^"']*)["']`, 'i');
  const match = String(tag || '').match(expression);
  return match ? decodeXml(match[1]) : null;
}

function parseSharedStrings(xml) {
  if (!xml) return [];
  return [...xml.matchAll(/<si\b[\s\S]*?<\/si>/g)].map((match) => {
    return [...match[0].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
      .map((item) => decodeXml(item[1]))
      .join('');
  });
}

function columnIndex(column) {
  let result = 0;
  for (const char of String(column || '').toUpperCase()) {
    if (char < 'A' || char > 'Z') continue;
    result = result * 26 + (char.charCodeAt(0) - 64);
  }
  return Math.max(0, result - 1);
}

function parseWorksheet(xml, sharedStrings) {
  const rows = [];
  const rowMatches = [...String(xml || '').matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)];

  for (const rowMatch of rowMatches) {
    const rowNumber = Number(attr(rowMatch[1], 'r')) || rows.length + 1;
    const row = [];
    const cells = [...rowMatch[2].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)];

    for (const cellMatch of cells) {
      const attributes = cellMatch[1];
      const body = cellMatch[2];
      const reference = attr(attributes, 'r') || '';
      const column = reference.replace(/[0-9]/g, '');
      const index = columnIndex(column);
      const type = attr(attributes, 't');
      const valueMatch = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/);
      const inlineMatch = body.match(/<is\b[\s\S]*?<t\b[^>]*>([\s\S]*?)<\/t>[\s\S]*?<\/is>/);
      let value = valueMatch ? decodeXml(valueMatch[1]) : null;

      if (type === 's' && value !== null) {
        const sharedIndex = Number(value);
        value = Number.isInteger(sharedIndex) ? (sharedStrings[sharedIndex] || '') : '';
      } else if (type === 'inlineStr') {
        value = inlineMatch ? decodeXml(inlineMatch[1]) : '';
      } else if (value !== null) {
        const numeric = parseNumber(value);
        if (numeric !== null) value = numeric;
      }

      row[index] = value;
    }

    rows[rowNumber - 1] = row;
  }

  return rows.filter((row) => Array.isArray(row));
}

function extractExcelRows(buffer) {
  const entries = extractZipEntries(buffer);
  const sharedStrings = parseSharedStrings(
    entries.has('xl/sharedStrings.xml') ? entries.get('xl/sharedStrings.xml').toString('utf8') : ''
  );
  const sheets = [];

  for (const [name, content] of entries) {
    if (!/^xl\/worksheets\/sheet\d+\.xml$/i.test(name)) continue;
    sheets.push({
      name,
      rows: parseWorksheet(content.toString('utf8'), sharedStrings).slice(0, 2000),
    });
  }

  return sheets.sort((a, b) => a.name.localeCompare(b.name));
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
  extractZipEntries,
  extractExcelRows,
  findMetricValues,
  extractFinancialDataFromExcel,
  extractFinancialDataFromAnnouncement,
};
