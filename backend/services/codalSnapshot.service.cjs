'use strict';

const crypto = require('crypto');
const cron = require('node-cron');
const prisma = require('../config/prisma.cjs');

const TEHRAN_TIMEZONE = 'Asia/Tehran';
const DEFAULT_DAILY_LIMIT = 500;
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
    timeoutMs: envInt('CODAL_TIMEOUT_MS', 30000, 3000, 60000),
    dailyLimit: envInt('CODAL_DAILY_REQUEST_LIMIT', DEFAULT_DAILY_LIMIT, 1, 500),
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

  // Retry one transient timeout/network/5xx failure. Every attempt is counted
  // against the shared daily API quota before making the external request.
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    await reserveDailyRequest();
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
        error.status = response.status;
        throw error;
      }
      return await response.json();
    } catch (error) {
      let normalized = error;
      if (error && error.name === 'AbortError') {
        normalized = new Error('Codal API request timed out');
        normalized.code = 'CODAL_TIMEOUT';
      }
      const retryable = normalized.code === 'CODAL_TIMEOUT' ||
        normalized instanceof TypeError ||
        (normalized.code === 'CODAL_HTTP_ERROR' && normalized.status >= 500);
      if (attempt < 2 && retryable) {
        console.warn('[CODAL SNAPSHOT] transient request failure; retrying page=' + page +
          ' category=' + (category || 'general') + ' error=' + (normalized.message || normalized));
        continue;
      }
      throw normalized;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error('Codal API request failed after retry.');
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
    // The API may report the total number of Codal pages, not the number
    // available within this category. Treat the configured budget as a
    // deliberate recent-data window instead of rejecting every snapshot.
    if (financialReportedPages > financialBudget || financialPage > financialBudget) {
      console.warn('[CODAL SNAPSHOT] financial page budget reached; continuing with the fetched recent pages (' +
        financialBudget + ' max, API reported ' + financialReportedPages + ').');
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
    // Snapshot is intentionally bounded to protect the daily API quota.
    // A larger API-reported total must not invalidate the recent pages fetched.
    if (reportedPages > generalBudget || generalPage > generalBudget) {
      console.warn('[CODAL SNAPSHOT] general page budget reached; continuing with the fetched recent pages (' +
        generalBudget + ' max, API reported ' + reportedPages + ').');
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

    const records = Array.from(unique.values());
    const batchSize = 100;

    // Stage the new version in small transactions. Consumers continue reading
    // the old ActiveSnapshotId until the final pointer swap.
    for (let offset = 0; offset < records.length; offset += batchSize) {
      const batch = records.slice(offset, offset + batchSize);
      await prisma.$transaction(async tx => {
        for (const item of batch) {
          const key = item._archiveKey;
          const symbol = item.l18 == null ? null : String(item.l18);
          const category = item.category == null ? null : String(item.category);
          const title = item.title == null ? null : String(item.title);
          const publishedAt = item.datePublish == null ? (item.dateSend == null ? (item.dateTitle == null ? null : String(item.dateTitle)) : String(item.dateSend)) : String(item.datePublish);
          const payloadJson = JSON.stringify(item);
          await tx.$executeRaw`INSERT INTO dbo.CodalSnapshotAnnouncement (SnapshotId, AnnouncementKey, Symbol, Category, Title, PublishedAt, PayloadJson) VALUES (${snapshotId}, ${key}, ${symbol}, ${category}, ${title}, ${publishedAt}, ${payloadJson})`;
        }
      }, { maxWait: 10000, timeout: 30000 });
    }

    // Maintain the durable unique-announcement archive in bounded transactions.
    for (let offset = 0; offset < records.length; offset += batchSize) {
      const batch = records.slice(offset, offset + batchSize);
      await prisma.$transaction(async tx => {
        for (const item of batch) {
          const key = item._archiveKey;
          const symbol = item.l18 == null ? null : String(item.l18);
          const category = item.category == null ? null : String(item.category);
          const title = item.title == null ? null : String(item.title);
          const publishedAt = item.datePublish == null ? (item.dateSend == null ? (item.dateTitle == null ? null : String(item.dateTitle)) : String(item.dateSend)) : String(item.datePublish);
          const payloadJson = JSON.stringify(item);
          const updated = await tx.$executeRaw`UPDATE dbo.CodalAnnouncement SET Symbol = ${symbol}, Category = ${category}, Title = ${title}, PublishedAt = ${publishedAt}, PayloadJson = ${payloadJson}, LastSnapshotId = ${snapshotId}, LastSeenAt = SYSUTCDATETIME() WHERE AnnouncementKey = ${key}`;
          if (!updated) {
            await tx.$executeRaw`INSERT INTO dbo.CodalAnnouncement (AnnouncementKey, Symbol, Category, Title, PublishedAt, PayloadJson, LastSnapshotId, FirstSeenAt, LastSeenAt) VALUES (${key}, ${symbol}, ${category}, ${title}, ${publishedAt}, ${payloadJson}, ${snapshotId}, SYSUTCDATETIME(), SYSUTCDATETIME())`;
          }
        }
      }, { maxWait: 10000, timeout: 30000 });
    }

    // Activate only after every staged row and archive batch has succeeded.
    await prisma.$transaction(async tx => {
      const stateRows = await tx.$queryRaw`SELECT StateId FROM dbo.CodalSnapshotState WHERE StateId = 1`;
      if (stateRows.length) {
        await tx.$executeRaw`UPDATE dbo.CodalSnapshotState SET ActiveSnapshotId = ${snapshotId}, LastAttemptAt = SYSUTCDATETIME(), LastSuccessAt = SYSUTCDATETIME(), LastError = NULL, AnnouncementCount = ${unique.size}, PageCount = ${totalPages} WHERE StateId = 1`;
      } else {
        await tx.$executeRaw`INSERT INTO dbo.CodalSnapshotState (StateId, ActiveSnapshotId, LastAttemptAt, LastSuccessAt, LastError, AnnouncementCount, PageCount) VALUES (1, ${snapshotId}, SYSUTCDATETIME(), SYSUTCDATETIME(), NULL, ${unique.size}, ${totalPages})`;
      }
    });

    // Keep only the active physical snapshot; the durable archive above keeps
    // historical announcement records. Delete in small batches to limit log growth.
    try {
      let deleted = 0;
      do {
        deleted = await prisma.$executeRaw`DELETE TOP (500) FROM dbo.CodalSnapshotAnnouncement WHERE SnapshotId <> ${snapshotId}`;
      } while (deleted > 0);
    } catch (cleanupError) {
      console.warn('[CODAL SNAPSHOT] old snapshot cleanup deferred:', cleanupError.message || cleanupError);
    }

    console.log('[CODAL SNAPSHOT] success reason=' + reason + ' id=' + snapshotId + ' records=' + unique.size + ' pages=' + totalPages + ' reported=' + (reportedCount || '-') + '/' + (reportedPages || '-'));
    // Start financial-document extraction only after the new snapshot is fully
    // persisted and activated. This removes the race with the fixed 13:50 cron.
    try {
      const documentCache = require('./codal-document.service.cjs');
      const cacheRows = await prisma.$queryRaw`SELECT COUNT_BIG(1) AS Total FROM dbo.CodalFinancialDocumentCache`;
      const cacheCount = Number(cacheRows[0] && cacheRows[0].Total || 0);
      const cacheResult = await documentCache.refreshFinancialDocumentCache({
        limit: 25,
        reason: cacheCount === 0 ? 'snapshot-complete-empty-cache' : 'snapshot-complete'
      });
      console.log('[CODAL SNAPSHOT] financial document cache follow-up=' + JSON.stringify(cacheResult));
    } catch (cacheError) {
      console.error('[CODAL SNAPSHOT] financial document cache follow-up failed:', cacheError.message || cacheError);
    }
    return { success: true, snapshotId, announcementCount: unique.size, pageCount: totalPages, reportedCount, reportedPages, startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString() };
  } catch (error) {
    try {
      await prisma.$executeRaw`DELETE FROM dbo.CodalSnapshotAnnouncement WHERE SnapshotId = ${snapshotId}`;
    } catch (_) {}
    try {
      const failureMessage = String(error.message || error).slice(0, 4000);
      const stateRows = await prisma.$queryRaw`SELECT StateId FROM dbo.CodalSnapshotState WHERE StateId = 1`;
      if (stateRows.length) {
        await prisma.$executeRaw`UPDATE dbo.CodalSnapshotState SET LastAttemptAt = SYSUTCDATETIME(), LastError = ${failureMessage} WHERE StateId = 1`;
      } else {
        // Persist the first failure too; UPDATE alone silently loses it when
        // the state row has never been created (the no-snapshot bootstrap case).
        await prisma.$executeRaw`INSERT INTO dbo.CodalSnapshotState (StateId, ActiveSnapshotId, LastAttemptAt, LastSuccessAt, LastError, AnnouncementCount, PageCount) VALUES (1, NULL, SYSUTCDATETIME(), NULL, ${failureMessage}, 0, 0)`;
      }
    } catch (stateError) {
      console.error('[CODAL SNAPSHOT] could not persist failure state:', stateError.message || stateError);
    }
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
  const state = await prisma.$queryRaw`SELECT ActiveSnapshotId, LastSuccessAt, AnnouncementCount, PageCount FROM dbo.CodalSnapshotState WHERE StateId = 1`;
  const activeId = state[0] && state[0].ActiveSnapshotId ? String(state[0].ActiveSnapshotId) : '';
  if (!activeId) {
    return { success: true, provider: 'CODAL_DB_SNAPSHOT', symbol: symbol || null, announcements: [], countAnnouncement: 0, countPage: 0, page, fetchedAt: null, snapshotId: null, stale: true };
  }
  const conditions = ['SnapshotId = @P1'];
  const params = [activeId];
  if (symbol) { params.push(symbol); conditions.push('Symbol = @P' + params.length); }
  if (category) { params.push(category); conditions.push('Category = @P' + params.length); }
  const where = ' WHERE ' + conditions.join(' AND ');
  const rows = await prisma.$queryRawUnsafe(
    'SELECT AnnouncementKey, PayloadJson FROM dbo.CodalSnapshotAnnouncement' + where + ' ORDER BY PublishedAt DESC, AnnouncementKey OFFSET ' + ((page - 1) * pageSize) + ' ROWS FETCH NEXT ' + pageSize + ' ROWS ONLY',
    ...params
  );
  const countRows = await prisma.$queryRawUnsafe('SELECT COUNT_BIG(1) AS Total FROM dbo.CodalSnapshotAnnouncement' + where, ...params);
  const total = Number(countRows[0] && countRows[0].Total || 0);
  return {
    success: true,
    provider: 'CODAL_DB_SNAPSHOT',
    symbol: symbol || null,
    announcements: rows.map(row => { try { return JSON.parse(row.PayloadJson); } catch (_) { return null; } }).filter(Boolean),
    countAnnouncement: total,
    countPage: Math.ceil(total / pageSize),
    page,
    fetchedAt: state[0].LastSuccessAt ? new Date(state[0].LastSuccessAt).toISOString() : null,
    snapshotId: activeId,
    stale: false
  };
}

async function getArchivedReports({ symbol = '', category = '', from = '', to = '', limit = 200 } = {}) {
  const conditions = [];
  const params = [];
  const dateKey = value => String(value || '').replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[^0-9]/g, '').slice(0, 8);
  if (symbol) { params.push(String(symbol).trim()); conditions.push('a.Symbol = @P' + params.length); }
  if (category) { params.push(String(category).trim()); conditions.push('a.Category = @P' + params.length); }
  const fromKey = dateKey(from);
  const toKey = dateKey(to);
  if (fromKey.length === 8) { params.push(fromKey); conditions.push('d.DateKey >= @P' + params.length); }
  if (toKey.length === 8) { params.push(toKey); conditions.push('d.DateKey <= @P' + params.length); }
  const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';
  const max = Math.max(1, Math.min(2000, Number(limit) || 200));
  // Normalize date digits/separators in SQL and filter before limiting, so
  // older requested periods are not hidden by the newest announcements.
  const dateExpression = "LEFT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRANSLATE(ISNULL(a.PublishedAt, ''), N'۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', N'01234567890123456789'), '/', ''), '-', ''), ':', ''), ' ', ''), '.', ''), 8)";
  const rows = await prisma.$queryRawUnsafe(
    'SELECT TOP (' + max + ') a.AnnouncementKey, a.PayloadJson FROM dbo.CodalAnnouncement a CROSS APPLY (SELECT ' + dateExpression + ' AS DateKey) d' + where + ' ORDER BY d.DateKey DESC, a.AnnouncementKey',
    ...params
  );
  return rows.map(row => {
    try { return JSON.parse(row.PayloadJson); } catch (_) { return null; }
  }).filter(Boolean);
}

async function getReports({ symbol = '', from = '', to = '', limit = 50 } = {}) {
  const boundedLimit = Math.max(1, Math.min(200, Number(limit) || 50));
  const stored = await getCompanyReports({ symbol, page: 1 });
  const normalizeDate = value => String(value || '').replace(/[^0-9]/g, '');
  let items = stored.announcements || [];
  if (from) items = items.filter(item => normalizeDate(item.datePublish || item.dateSend || item.dateTitle) >= normalizeDate(from));
  if (to) items = items.filter(item => normalizeDate(item.datePublish || item.dateSend || item.dateTitle) <= normalizeDate(to));
  items = items.slice(0, boundedLimit);
  return {
    items,
    summary: null,
    fetchedAt: stored.fetchedAt || null,
    source: 'codal-db-snapshot',
    configured: true,
    snapshotId: stored.snapshotId || null,
    stale: Boolean(stored.stale)
  };
}

function startCodalSnapshotCron() {
  if (cronTasks.length) return;
  cronTasks = [
    cron.schedule('0 8 * * *', () => refreshSnapshot({ reason: 'scheduled-08:00' }), { timezone: TEHRAN_TIMEZONE }),
    cron.schedule('30 13 * * *', () => refreshSnapshot({ reason: 'scheduled-13:30' }), { timezone: TEHRAN_TIMEZONE })
  ];
  console.log('[CODAL SNAPSHOT] scheduled daily at 08:00 and 13:30 Asia/Tehran; global daily API cap=' + getApiConfig().dailyLimit);

  // Bootstrap immediately after startup if the database has no active snapshot.
  // This avoids waiting until the next cron window after a deployment/restart.
  setImmediate(async () => {
    try {
      const status = await getSnapshotStatus();
      if (!status.state || !status.state.ActiveSnapshotId) {
        console.log('[CODAL SNAPSHOT] no active snapshot found; starting bootstrap refresh');
        await refreshSnapshot({ reason: 'startup-bootstrap' });
      }
    } catch (error) {
      console.error('[CODAL SNAPSHOT] startup bootstrap check failed:', error.message || error);
    }
  });
}

function stopCodalSnapshotCron() {
  for (const task of cronTasks) task.stop();
  cronTasks = [];
}

async function getSnapshotStatus() {
  const rows = await prisma.$queryRaw`SELECT ActiveSnapshotId, LastAttemptAt, LastSuccessAt, LastError, AnnouncementCount, PageCount FROM dbo.CodalSnapshotState WHERE StateId = 1`;
  return { state: rows[0] || null, usage: await readUsage() };
}

module.exports = { getCompanyReports, getArchivedReports, getReports, refreshSnapshot, startCodalSnapshotCron, stopCodalSnapshotCron, getSnapshotStatus, normalizeAnnouncement };
