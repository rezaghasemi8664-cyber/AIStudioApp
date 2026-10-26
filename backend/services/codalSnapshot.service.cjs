'use strict';

const crypto = require('crypto');
const cron = require('node-cron');
const prisma = require('../config/prisma.cjs');

const TEHRAN_TIMEZONE = 'Asia/Tehran';
const DEFAULT_DAILY_LIMIT = 400;
const DEFAULT_MAX_PAGES = 180;
const DEFAULT_FINANCIAL_PAGES = 30;
let refreshRunning = false;
let cronTasks = [];

function envInt(name, fallback, min, max) {
  const value = Number.parseInt(process.env[name], 10);
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

function tehranDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TEHRAN_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const values = {};
  for (const part of parts) if (part.type !== 'literal') values[part.type] = part.value;
  return values.year + '-' + values.month + '-' + values.day;
}

function first(obj, keys) {
  if (!obj || typeof obj !== 'object') return null;
  for (const key of keys) if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') return obj[key];
  return null;
}

function asArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  for (const key of ['announcement', 'data', 'result', 'items', 'list', 'rows', 'records', 'announcements']) {
    if (Array.isArray(payload[key])) return payload[key];
    if (payload[key] && typeof payload[key] === 'object') {
      for (const nested of ['announcement', 'items', 'list', 'rows', 'records']) {
        if (Array.isArray(payload[key][nested])) return payload[key][nested];
      }
    }
  }
  return [];
}

function normalizeAnnouncement(source, requestedCategory) {
  const item = source && typeof source === 'object' ? source : {};
  const normalized = {
    l18: first(item, ['l18', 'symbol', 'Symbol']),
    l30: first(item, ['l30', 'companyName', 'company', 'name']),
    category: first(item, ['category', 'Category', 'category_id', 'categoryId']) || requestedCategory || null,
    categoryName: first(item, ['category_name', 'categoryName', 'CategoryName']),
    title: first(item, ['title', 'Title']),
    code: first(item, ['code', 'Code']),
    dateTitle: first(item, ['date_title', 'dateTitle']),
    dateSend: first(item, ['date_send', 'dateSend']),
    timeSend: first(item, ['time_send', 'timeSend']),
    datePublish: first(item, ['date_publish', 'datePublish']),
    timePublish: first(item, ['time_publish', 'timePublish']),
    link: first(item, ['link', 'Link']),
    linkPdf: first(item, ['link_pdf', 'linkPdf']),
    linkExcel: first(item, ['link_excel', 'linkExcel']),
    linkAttachment: first(item, ['link_attachment', 'linkAttachment']),
    url: first(item, ['url', 'Url']),
    linkReport: first(item, ['link_report', 'linkReport']),
    raw: item
  };
  const identity = [
    normalized.code, normalized.link, normalized.linkPdf, normalized.linkExcel,
    normalized.dateSend, normalized.title, normalized.l18
  ].map(value => String(value || '').trim()).join('|');
  return { ...normalized, _archiveKey: crypto.createHash('sha256').update(identity).digest('hex') };
}

function getApiConfig() {
  return {
    url: String(process.env.CODAL_API_URL || process.env.BRS_CODAL_URL || '').trim(),
    key: String(process.env.BRS_CODAL_API_KEY || process.env.CODAL_API_KEY || '').trim(),
    timeoutMs: envInt('CODAL_TIMEOUT_MS', 15000, 3000, 60000),
    dailyLimit: envInt('CODAL_DAILY_REQUEST_LIMIT', DEFAULT_DAILY_LIMIT, 1, DEFAULT_DAILY_LIMIT),
    maxPages: envInt('CODAL_SNAPSHOT_MAX_PAGES', DEFAULT_MAX_PAGES, 1, DEFAULT_MAX_PAGES)
  };
}

async function reserveDailyRequest() {
  const dateKey = tehranDateKey();
  const limit = getApiConfig().dailyLimit;
  return prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw`SELECT RequestCount FROM dbo.CodalApiDailyUsage WITH (UPDLOCK, HOLDLOCK) WHERE RequestDate = ${dateKey}`;
    if (rows.length) {
      const current = Number(rows[0].RequestCount || 0);
      if (current >= limit) {
        const error = new Error('Codal daily API request limit reached (' + limit + ').');
        error.code = 'CODAL_DAILY_LIMIT_REACHED';
        throw error;
      }
      await tx.$executeRaw`UPDATE dbo.CodalApiDailyUsage SET RequestCount = RequestCount + 1, UpdatedAt = SYSUTCDATETIME() WHERE RequestDate = ${dateKey}`;
      return current + 1;
    }
    await tx.$executeRaw`INSERT INTO dbo.CodalApiDailyUsage (RequestDate, RequestCount, UpdatedAt) VALUES (${dateKey}, 1, SYSUTCDATETIME())`;
    return 1;
  });
}

async function fetchPage(page, category = '') {
  const config = getApiConfig();
  if (!config.url || !config.key) {
    const error = new Error('Codal API URL/key are not configured.');
    error.code = 'CODAL_NOT_CONFIGURED';
    throw error;
  }
  await reserveDailyRequest();
  const url = new URL(config.url);
  url.searchParams.set('key', config.key);
  url.searchParams.set('page', String(page));
  if (category) url.searchParams.set('category', String(category));
  for (const [envName, paramName, fallback] of [
    ['CODAL_AUDITED', 'audited', 'true'],
    ['CODAL_UNAUDITED', 'unaudited', 'true'],
    ['CODAL_ONLY_MAIN_COMPANY', 'only_main_company', 'true'],
    ['CODAL_ONLY_SUBSIDIARIES', 'only_subsidiaries', 'false']
  ]) url.searchParams.set(paramName, String(process.env[envName] || fallback));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': process.env.CODAL_USER_AGENT || 'Roniya-Analyzer/1.0' },
      signal: controller.signal
    });
    if (!response.ok) {
      const error = new Error('Codal API returned HTTP ' + response.status);
      error.code = 'CODAL_HTTP_ERROR';
      throw error;
    }
    return await response.json();
  } catch (error) {
    if (error && error.name === 'AbortError') {
      const timeout = new Error('Codal API request timed out');
      timeout.code = 'CODAL_TIMEOUT';
      throw timeout;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function readUsage() {
  const dateKey = tehranDateKey();
  const rows = await prisma.$queryRaw`SELECT RequestCount FROM dbo.CodalApiDailyUsage WHERE RequestDate = ${dateKey}`;
  return { date: dateKey, count: rows.length ? Number(rows[0].RequestCount || 0) : 0, limit: getApiConfig().dailyLimit };
}

async function refreshSnapshot({ reason = 'scheduled' } = {}) {
  if (refreshRunning) return { success: false, skipped: true, reason: 'ALREADY_RUNNING' };
  refreshRunning = true;
  const snapshotId = crypto.randomUUID();
  const startedAt = new Date();
  try {
    const config = getApiConfig();
    const all = [];
    let reportedPages = null;
    let reportedCount = null;
    const financialBudget = Math.min(DEFAULT_FINANCIAL_PAGES, Math.max(1, Math.floor(config.maxPages / 6)));
    const generalBudget = config.maxPages - financialBudget;
    let totalPages = 0;

    // Fetch financial statements separately because BRS may omit category IDs
    // from individual rows even when category=1 was requested.
    let financialPage = 1;
    let financialReportedPages = null;
    while (financialPage <= financialBudget) {
      const payload = await fetchPage(financialPage, '1');
      totalPages += 1;
      const items = asArray(payload);
      financialReportedPages = Number(first(payload, ['count_page', 'countPage'])) || financialReportedPages;
      reportedCount = Number(first(payload, ['count_announcement', 'countAnnouncement'])) || reportedCount;
      all.push(...items.map(item => normalizeAnnouncement(item, '1')));
      if (!items.length || (financialReportedPages && financialPage >= financialReportedPages)) break;
      financialPage += 1;
    }
    if (financialReportedPages > financialBudget || financialPage > financialBudget) {
      const error = new Error('Codal financial-statement pages exceed the reserved snapshot budget; previous snapshot preserved.');
      error.code = 'CODAL_FINANCIAL_PAGE_CAP_REACHED';
      throw error;
    }

    let generalPage = 1;
    while (generalPage <= generalBudget) {
      const payload = await fetchPage(generalPage);
      totalPages += 1;
      const items = asArray(payload);
      reportedPages = Number(first(payload, ['count_page', 'countPage'])) || reportedPages;
      reportedCount = Number(first(payload, ['count_announcement', 'countAnnouncement'])) || reportedCount;
      all.push(...items.map(item => normalizeAnnouncement(item, null)));
      if (!items.length || (reportedPages && generalPage >= reportedPages)) break;
      generalPage += 1;
    }
    if (reportedPages > generalBudget || generalPage > generalBudget) {
      const error = new Error('Codal general-announcement pages exceed the reserved snapshot budget; previous snapshot preserved.');
      error.code = 'CODAL_GENERAL_PAGE_CAP_REACHED';
      throw error;
    }
    const unique = new Map();
    for (const item of all) {
      const previous = unique.get(item._archiveKey);
      // Prefer the category=1 result when the general listing omits category.
      if (!previous || (String(item.category || '') === '1' && String(previous.category || '') !== '1')) unique.set(item._archiveKey, item);
    }
    if (!unique.size) {
      const error = new Error('Codal snapshot returned zero announcements; existing snapshot preserved.');
      error.code = 'CODAL_EMPTY_SNAPSHOT';
      throw error;
    }

    await prisma.$transaction(async tx => {
      for (const item of unique.values()) {
        const key = item._archiveKey;
        const symbol = item.l18 == null ? null : String(item.l18);
        const category = item.category == null ? null : String(item.category);
        const title = item.title == null ? null : String(item.title);
        const publishedAt = item.datePublish == null ? (item.dateSend == null ? null : String(item.dateSend)) : String(item.datePublish);
        const payloadJson = JSON.stringify(item);
        const updated = await tx.$executeRaw`UPDATE dbo.CodalAnnouncement SET Symbol = ${symbol}, Category = ${category}, Title = ${title}, PublishedAt = ${publishedAt}, PayloadJson = ${payloadJson}, LastSnapshotId = ${snapshotId}, LastSeenAt = SYSUTCDATETIME() WHERE AnnouncementKey = ${key}`;
        if (!updated) {
          await tx.$executeRaw`INSERT INTO dbo.CodalAnnouncement (AnnouncementKey, Symbol, Category, Title, PublishedAt, PayloadJson, LastSnapshotId, FirstSeenAt, LastSeenAt) VALUES (${key}, ${symbol}, ${category}, ${title}, ${publishedAt}, ${payloadJson}, ${snapshotId}, SYSUTCDATETIME(), SYSUTCDATETIME())`;
        }
      }
      await tx.$executeRaw`UPDATE dbo.CodalSnapshotState SET ActiveSnapshotId = ${snapshotId}, LastAttemptAt = SYSUTCDATETIME(), LastSuccessAt = SYSUTCDATETIME(), LastError = NULL, AnnouncementCount = ${unique.size}, PageCount = ${totalPages} WHERE StateId = 1`;
      const stateRows = await tx.$queryRaw`SELECT StateId FROM dbo.CodalSnapshotState WHERE StateId = 1`;
      if (!stateRows.length) {
        await tx.$executeRaw`INSERT INTO dbo.CodalSnapshotState (StateId, ActiveSnapshotId, LastAttemptAt, LastSuccessAt, LastError, AnnouncementCount, PageCount) VALUES (1, ${snapshotId}, SYSUTCDATETIME(), SYSUTCDATETIME(), NULL, ${unique.size}, ${totalPages})`;
      }
    });

    console.log('[CODAL SNAPSHOT] success reason=' + reason + ' id=' + snapshotId + ' records=' + unique.size + ' pages=' + totalPages + ' reported=' + (reportedCount || '-') + '/' + (reportedPages || '-'));
    return { success: true, snapshotId, announcementCount: unique.size, pageCount: totalPages, reportedCount, reportedPages, startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString() };
  } catch (error) {
    try {
      await prisma.$executeRaw`UPDATE dbo.CodalSnapshotState SET LastAttemptAt = SYSUTCDATETIME(), LastError = ${String(error.message || error).slice(0, 4000)} WHERE StateId = 1`;
    } catch (_) {}
    console.error('[CODAL SNAPSHOT] failed reason=' + reason + ' code=' + (error.code || '-') + ' error=' + (error.message || error));
    return { success: false, error: error.message || String(error), code: error.code || 'CODAL_SNAPSHOT_FAILED' };
  } finally {
    refreshRunning = false;
  }
}

async function getCompanyReports(options = {}) {
  const symbol = options.symbol ? String(options.symbol).trim() : '';
  const category = options.category == null ? '' : String(options.category).trim();
  const page = Math.max(1, Number(options.page) || 1);
  const pageSize = 200;
  const conditions = [];
  if (symbol) conditions.push('Symbol = @P' + (conditions.length + 1));
  if (category) conditions.push('Category = @P' + (conditions.length + 1));
  const params = [];
  if (symbol) params.push(symbol);
  if (category) params.push(category);
  const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';
  const rows = await prisma.$queryRawUnsafe(
    'SELECT AnnouncementKey, PayloadJson FROM dbo.CodalAnnouncement' + where + ' ORDER BY PublishedAt DESC, LastSeenAt DESC OFFSET ' + ((page - 1) * pageSize) + ' ROWS FETCH NEXT ' + pageSize + ' ROWS ONLY',
    ...params
  );
  const state = await prisma.$queryRaw`SELECT ActiveSnapshotId, LastSuccessAt, AnnouncementCount, PageCount FROM dbo.CodalSnapshotState WHERE StateId = 1`;
  const countRows = await prisma.$queryRawUnsafe('SELECT COUNT_BIG(1) AS Total FROM dbo.CodalAnnouncement' + where, ...params);
  const total = Number(countRows[0] && countRows[0].Total || 0);
  return {
    success: true,
    provider: 'CODAL_DB_SNAPSHOT',
    symbol: symbol || null,
    announcements: rows.map(row => { try { return JSON.parse(row.PayloadJson); } catch (_) { return null; } }).filter(Boolean),
    countAnnouncement: total,
    countPage: Math.ceil(total / pageSize),
    page,
    fetchedAt: state[0] && state[0].LastSuccessAt ? new Date(state[0].LastSuccessAt).toISOString() : null,
    snapshotId: state[0] && state[0].ActiveSnapshotId ? String(state[0].ActiveSnapshotId) : null,
    stale: !state[0] || !state[0].LastSuccessAt
  };
}

async function getReports({ symbol = '', from = '', to = '', limit = 50 } = {}) {
  const boundedLimit = Math.max(1, Math.min(200, Number(limit) || 50));
  const where = [];
  const params = [];
  if (symbol) { params.push(String(symbol).trim()); where.push('Symbol = @P' + params.length); }
  const sqlWhere = where.length ? ' WHERE ' + where.join(' AND ') : '';
  const rows = await prisma.$queryRawUnsafe(
    'SELECT PayloadJson FROM dbo.CodalAnnouncement' + sqlWhere + ' ORDER BY PublishedAt DESC, LastSeenAt DESC OFFSET 0 ROWS FETCH NEXT ' + boundedLimit + ' ROWS ONLY',
    ...params
  );
  let items = rows.map(row => { try { return JSON.parse(row.PayloadJson); } catch (_) { return null; } }).filter(Boolean);
  const normalizeDate = value => String(value || '').replace(/[^0-9]/g, '');
  if (from) items = items.filter(item => normalizeDate(item.datePublish || item.dateSend || item.dateTitle) >= normalizeDate(from));
  if (to) items = items.filter(item => normalizeDate(item.datePublish || item.dateSend || item.dateTitle) <= normalizeDate(to));
  const state = await prisma.$queryRaw`SELECT ActiveSnapshotId, LastSuccessAt FROM dbo.CodalSnapshotState WHERE StateId = 1`;
  return {
    items,
    summary: null,
    fetchedAt: state[0] && state[0].LastSuccessAt ? new Date(state[0].LastSuccessAt).toISOString() : null,
    source: 'codal-db-snapshot',
    configured: true,
    snapshotId: state[0] && state[0].ActiveSnapshotId ? String(state[0].ActiveSnapshotId) : null,
    stale: !state[0] || !state[0].LastSuccessAt
  };
}

function startCodalSnapshotCron() {
  if (cronTasks.length) return;
  cronTasks = [
    cron.schedule('0 8 * * *', () => refreshSnapshot({ reason: 'scheduled-08:00' }), { timezone: TEHRAN_TIMEZONE }),
    cron.schedule('30 13 * * *', () => refreshSnapshot({ reason: 'scheduled-13:30' }), { timezone: TEHRAN_TIMEZONE })
  ];
  console.log('[CODAL SNAPSHOT] scheduled daily at 08:00 and 13:30 Asia/Tehran; global daily API cap=' + getApiConfig().dailyLimit);
}

function stopCodalSnapshotCron() {
  for (const task of cronTasks) task.stop();
  cronTasks = [];
}

async function getSnapshotStatus() {
  const rows = await prisma.$queryRaw`SELECT ActiveSnapshotId, LastAttemptAt, LastSuccessAt, LastError, AnnouncementCount, PageCount FROM dbo.CodalSnapshotState WHERE StateId = 1`;
  return { state: rows[0] || null, usage: await readUsage() };
}

module.exports = { getCompanyReports, getReports, refreshSnapshot, startCodalSnapshotCron, stopCodalSnapshotCron, getSnapshotStatus, normalizeAnnouncement };
