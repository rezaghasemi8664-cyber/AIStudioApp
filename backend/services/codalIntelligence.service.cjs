'use strict';

const axios = require('axios');

function normalizeNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function first(obj, keys) {
  for (const key of keys) {
    const value = obj?.[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

function normalizeItem(item) {
  const row = item && typeof item === 'object' ? item : {};
  return {
    title: String(first(row, ['title', 'Title', 'reportTitle', 'subject', 'Subject']) || '').trim(),
    symbol: String(first(row, ['symbol', 'Symbol', 'l18', 'ticker']) || '').trim(),
    companyName: String(first(row, ['companyName', 'CompanyName', 'company', 'name']) || '').trim(),
    reportType: String(first(row, ['reportType', 'ReportType', 'type', 'kind']) || '').trim(),
    publishDate: String(first(row, ['publishDate', 'PublishDate', 'date', 'Date', 'sendDate']) || '').trim(),
    period: String(first(row, ['period', 'Period', 'fiscalPeriod']) || '').trim(),
    periodEnd: String(first(row, ['periodEnd', 'PeriodEnd', 'endDate']) || '').trim(),
    url: String(first(row, ['url', 'URL', 'link', 'Link', 'documentUrl']) || '').trim(),
    audited: Boolean(first(row, ['audited', 'Audited', 'isAudited'])),
    attachment: Boolean(first(row, ['attachment', 'Attachment', 'hasAttachment'])),
    raw: row,
  };
}

function extractItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  for (const key of ['data', 'items', 'results', 'reports', 'Rows', 'Data']) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  return [];
}

function buildSummary(items) {
  const reports = items.length;
  const audited = items.filter(item => item.audited).length;
  const attachments = items.filter(item => item.attachment).length;
  const byType = items.reduce((map, item) => {
    const key = item.reportType || 'نامشخص';
    map[key] = (map[key] || 0) + 1;
    return map;
  }, {});
  return { reports, audited, attachments, byType };
}

async function getReports({ symbol = '', from = '', to = '', limit = 50 } = {}) {
  const baseUrl = process.env.CODAL_API_URL || '';
  if (!baseUrl) {
    const error = new Error('CODAL_API_URL تنظیم نشده است.');
    error.code = 'CODAL_NOT_CONFIGURED';
    throw error;
  }

  const params = {};
  if (symbol) params.symbol = symbol;
  if (from) params.from = from;
  if (to) params.to = to;
  params.limit = Math.min(Math.max(Number(limit) || 50, 1), 200);

  const response = await axios.get(baseUrl, {
    params,
    timeout: Number(process.env.CODAL_TIMEOUT_MS) || 15000,
    headers: { 'Accept': 'application/json', 'User-Agent': process.env.CODAL_USER_AGENT || 'Roniya-Analyzer/1.0' },
  });

  const items = extractItems(response.data).map(normalizeItem).filter(item => item.title || item.symbol || item.publishDate || item.url);
  return {
    items,
    summary: buildSummary(items),
    fetchedAt: new Date().toISOString(),
    source: 'codal',
    configured: true,
  };
}

module.exports = { getReports, normalizeNumber };
