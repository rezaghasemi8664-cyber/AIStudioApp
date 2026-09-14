'use strict';

/**
 * BRS CODAL Announcement provider.
 *
 * The provider reads the dedicated CODAL configuration when present and
 * falls back to the existing BRS CODAL configuration used by the backend.
 * API keys are never returned or logged.
 */

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_PAGE = 1;

function getConfig() {
  return {
    apiUrl: String(process.env.CODAL_API_URL || process.env.BRS_CODAL_URL || '').trim(),
    apiKey: String(process.env.CODAL_API_KEY || process.env.BRS_API_KEY || '').trim(),
    category: String(process.env.CODAL_CATEGORY || '').trim(),
    audited: String(process.env.CODAL_AUDITED || 'true').trim(),
    unaudited: String(process.env.CODAL_UNAUDITED || 'true').trim(),
    onlyMainCompany: String(process.env.CODAL_ONLY_MAIN_COMPANY || 'true').trim(),
    onlySubsidiaries: String(process.env.CODAL_ONLY_SUBSIDIARIES || 'false').trim(),
    timeoutMs: Number(process.env.CODAL_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS
  };
}

function getStatus() {
  const config = getConfig();
  const configured = Boolean(config.apiUrl && config.apiKey);

  return {
    provider: 'CODAL',
    configured,
    enabled: configured,
    endpointConfigured: Boolean(config.apiUrl),
    credentialsConfigured: Boolean(config.apiKey),
    reason: configured
      ? 'BRS CODAL Announcement API configured'
      : !config.apiUrl
        ? 'CODAL_API_URL is not configured'
        : 'CODAL_API_KEY is not configured'
  };
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];

  const candidates = [
    value.data,
    value.result,
    value.items,
    value.list,
    value.rows,
    value.records,
    value.announcements,
    value.data && value.data.items,
    value.data && value.data.list,
    value.result && value.result.items
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }

  return [];
}

function pick(object, keys) {
  if (!object || typeof object !== 'object') return null;
  for (const key of keys) {
    if (object[key] !== undefined && object[key] !== null && object[key] !== '') {
      return object[key];
    }
  }
  return null;
}

function normalizeAnnouncement(item) {
  const source = item && typeof item === 'object' ? item : {};

  return {
    l18: pick(source, ['l18', 'symbol', 'Symbol']),
    l30: pick(source, ['l30', 'companyName', 'company', 'name']),
    title: pick(source, ['title', 'Title']),
    code: pick(source, ['code', 'Code']),
    dateTitle: pick(source, ['date_title', 'dateTitle']),
    dateSend: pick(source, ['date_send', 'dateSend']),
    timeSend: pick(source, ['time_send', 'timeSend']),
    datePublish: pick(source, ['date_publish', 'datePublish']),
    timePublish: pick(source, ['time_publish', 'timePublish']),
    link: pick(source, ['link', 'Link']),
    linkPdf: pick(source, ['link_pdf', 'linkPdf']),
    linkExcel: pick(source, ['link_excel', 'linkExcel']),
    linkAttachment: pick(source, ['link_attachment', 'linkAttachment']),
    raw: source
  };
}

function buildUrl(options = {}) {
  const config = getConfig();
  if (!config.apiUrl) {
    const error = new Error('CODAL_API_URL is not configured');
    error.code = 'CODAL_URL_NOT_CONFIGURED';
    throw error;
  }
  if (!config.apiKey) {
    const error = new Error('CODAL_API_KEY is not configured');
    error.code = 'CODAL_KEY_NOT_CONFIGURED';
    throw error;
  }

  const url = new URL(config.apiUrl);
  url.searchParams.set('key', config.apiKey);

  if (options.symbol) url.searchParams.set('l18', String(options.symbol).trim());
  if (options.category !== undefined) {
    if (String(options.category).trim()) url.searchParams.set('category', String(options.category).trim());
  } else if (config.category) {
    url.searchParams.set('category', config.category);
  }

  // BRS Announcement.php accepts these filters, but date_start/date_end
  // are not supported and cause HTTP 400 responses. Keep the supported
  // announcement filters only.
  url.searchParams.set('audited', options.audited ?? config.audited);
  url.searchParams.set('unaudited', options.unaudited ?? config.unaudited);
  url.searchParams.set('only_main_company', options.onlyMainCompany ?? config.onlyMainCompany);
  url.searchParams.set('only_subsidiaries', options.onlySubsidiaries ?? config.onlySubsidiaries);
  url.searchParams.set('page', String(options.page || DEFAULT_PAGE));

  return url;
}

async function fetchJson(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'RoniyaAnalyzer/5.2.1'
      },
      signal: controller.signal
    });

    const text = await response.text();
    let payload = null;

    try {
      payload = text ? JSON.parse(text) : null;
    } catch (error) {
      const parseError = new Error('CODAL JSON parse error: ' + error.message);
      parseError.code = 'CODAL_INVALID_JSON';
      throw parseError;
    }

    if (!response.ok) {
      const error = new Error('CODAL HTTP ' + response.status);
      error.code = 'CODAL_HTTP_ERROR';
      error.statusCode = response.status;
      error.payload = payload;
      throw error;
    }

    return payload;
  } catch (error) {
    if (error && error.name === 'AbortError') {
      const timeoutError = new Error('CODAL request timed out');
      timeoutError.code = 'CODAL_TIMEOUT';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function getCompanyReports(options = {}) {
  const status = getStatus();
  if (!status.configured) {
    const error = new Error('Codal provider is not configured');
    error.code = 'CODAL_NOT_CONFIGURED';
    error.status = status;
    throw error;
  }

  const config = getConfig();
  const url = buildUrl(options);
  const payload = await fetchJson(url, config.timeoutMs);
  const announcements = asArray(payload).map(normalizeAnnouncement);

  return {
    success: true,
    provider: 'CODAL',
    symbol: options.symbol ? String(options.symbol).trim() : null,
    announcements,
    countAnnouncement: pick(payload, ['count_announcement', 'countAnnouncement']) ?? announcements.length,
    countPage: pick(payload, ['count_page', 'countPage']),
    page: Number(options.page || DEFAULT_PAGE),
    fetchedAt: new Date().toISOString()
  };
}

module.exports = {
  getStatus,
  getCompanyReports,
  buildUrl,
  normalizeAnnouncement
};
