'use strict';

/**
 * BRS CODAL Announcement provider.
 *
 * The provider reads the dedicated CODAL configuration when present and
 * falls back to the existing BRS CODAL configuration used by the backend.
 * API keys are never returned or logged.
 */

function getConfig() {
  return {
    apiUrl: String(process.env.CODAL_API_URL || process.env.BRS_CODAL_URL || '').trim(),
    apiKey: String(process.env.BRS_CODAL_API_KEY || process.env.CODAL_API_KEY || '').trim(),
    category: String(process.env.CODAL_CATEGORY || '').trim(),
    audited: String(process.env.CODAL_AUDITED || 'true').trim(),
    unaudited: String(process.env.CODAL_UNAUDITED || 'true').trim(),
    onlyMainCompany: String(process.env.CODAL_ONLY_MAIN_COMPANY || 'true').trim(),
    onlySubsidiaries: String(process.env.CODAL_ONLY_SUBSIDIARIES || 'false').trim(),
  };
}

function getStatus() {
  const config = getConfig();
  return {
    provider: 'CODAL_DB_SNAPSHOT',
    configured: true,
    enabled: true,
    endpointConfigured: Boolean(config.apiUrl),
    credentialsConfigured: Boolean(config.apiKey),
    reason: 'Codal consumers read the persisted database snapshot; API credentials are used only by the scheduled snapshot worker'
  };
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];

  const candidates = [
    value.announcement,
    value.data,
    value.result,
    value.items,
    value.list,
    value.rows,
    value.records,
    value.announcements,
    value.data && value.data.announcement,
    value.data && value.data.items,
    value.data && value.data.list,
    value.result && value.result.announcement,
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
    category: pick(source, ['category', 'Category', 'category_id', 'categoryId']),
    categoryName: pick(source, ['category_name', 'categoryName', 'CategoryName']),
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
    url: pick(source, ['url', 'Url']),
    linkReport: pick(source, ['link_report', 'linkReport']),
    raw: source
  };
}

async function getCompanyReports(options = {}) {
  const snapshot = require('./codalSnapshot.service.cjs');
  const result = await snapshot.getCompanyReports(options);
  const requestedCategory = String(options.category ?? '').trim();
  const announcements = asArray(result && result.announcements).map(item => {
    const normalized = normalizeAnnouncement(item);
    if (!normalized.category && requestedCategory) normalized.category = requestedCategory;
    return normalized;
  });
  return { ...result, provider: 'CODAL_DB_SNAPSHOT', announcements };
}

module.exports = {
  getStatus,
  getCompanyReports,
  normalizeAnnouncement
};
