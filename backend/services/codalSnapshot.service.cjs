'use strict';

const crypto = require('crypto');
const cron = require('node-cron');
const prisma = require('../config/prisma.cjs');
const centralCache = require('./centralMarketCache.service.cjs');

const CODAL_SNAPSHOT_CACHE_KEY = 'codal:snapshot:active';

const TEHRAN_TIMEZONE = 'Asia/Tehran';
const DEFAULT_DAILY_LIMIT = 500;
const DEFAULT_MAX_PAGES = 180;
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

function normalizeAnnouncement(source) {
  const item = source && typeof source === 'object' ? source : {};
  const normalized = {
    l18: first(item, ['l18', 'symbol', 'Symbol']),
    l30: first(item, ['l30', 'companyName', 'company', 'name']),
    category: first(item, ['category', 'Category', 'category_id', 'categoryId']),
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
    url: String(process.env.BRS_CODAL_URL || process.env.CODAL_API_URL || '').trim(),
    key: String(process.env.BRS_API_KEY || '').trim(),
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

async function fetchPage(page, filters = {}) {
  const config = getApiConfig();
  if (!config.url || !config.key) {
    const error = new Error('Codal API URL/key are not configured.');
    error.code = 'CODAL_NOT_CONFIGURED';
    throw error;
  }
  const url = new URL(config.url);
  url.searchParams.set('key', config.key);
  url.searchParams.set('page', String(page));
  // BRS CODAL v2 uses l18 for the issuer symbol (not symbol).
  if (filters.l18) url.searchParams.set('l18', String(filters.l18).trim());
  for (const [envName, paramName, fallback] of [
    ['CODAL_AUDITED', 'audited', 'true'],
    ['CODAL_UNAUDITED', 'unaudited', 'true'],
    ['CODAL_ONLY_MAIN_COMPANY', 'only_main_company', 'true']
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
          ' page=' + page + ' error=' + (normalized.message || normalized));
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


function publishCodalSnapshotCache(snapshot, reason = 'manual') {
  if (!centralCache.set(CODAL_SNAPSHOT_CACHE_KEY, snapshot)) {
    const error = new Error('Codal snapshot cache could not be replaced.');
    error.code = 'CODAL_CACHE_PUBLISH_FAILED';
    throw error;
  }
  const io = global.io;
  if (io && typeof io.emit === 'function') {
    try {
      io.emit('codal-snapshot:updated', {
        snapshotId: snapshot.snapshotId,
        fetchedAt: snapshot.fetchedAt,
        announcementCount: snapshot.announcementCount,
        pageCount: snapshot.pageCount,
        updatedAt: snapshot.updatedAt,
        reason
      });
    } catch (emitError) {
      console.warn('[CODAL SNAPSHOT] cache updated but socket notification failed:', emitError.message || emitError);
    }
  }
  console.log('[CODAL SNAPSHOT] central cache updated reason=' + reason + ' id=' + snapshot.snapshotId + ' records=' + snapshot.announcements.length);
  return snapshot;
}

async function refreshSnapshot({ reason = 'scheduled' } = {}) {
  if (refreshRunning) return { success: false, skipped: true, reason: 'ALREADY_RUNNING' };
  refreshRunning = true;
  const snapshotId = crypto.randomUUID();
  const startedAt = new Date();
  let snapshotActivated = false;
  try {
    const config = getApiConfig();
    const all = [];
    let reportedPages = null;
    let reportedCount = null;
    const generalBudget = config.maxPages;
    let totalPages = 0;

    // BRS CODAL v2 does not support the legacy category=1 filter.
    // Fetch the supported listing and classify financial filings locally.

    let generalPage = 1;
    while (generalPage <= generalBudget) {
      const payload = await fetchPage(generalPage);
      totalPages += 1;
      const items = asArray(payload);
      reportedPages = Number(first(payload, ['count_page', 'countPage'])) || reportedPages;
      reportedCount = Number(first(payload, ['count_announcement', 'countAnnouncement'])) || reportedCount;
      all.push(...items.map(item => normalizeAnnouncement(item)));
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
      // Keep an actual category field when the provider supplies one.
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

    // Read and validate the complete staged snapshot BEFORE switching the active pointer.
    // This guarantees the cache can be replaced from the exact same complete dataset.
    const stagedRows = await prisma.$queryRaw`SELECT AnnouncementKey, PayloadJson FROM dbo.CodalSnapshotAnnouncement WHERE SnapshotId = ${snapshotId} ORDER BY PublishedAt DESC, AnnouncementKey`;
    const stagedAnnouncements = stagedRows.map(row => {
      try { return JSON.parse(row.PayloadJson); } catch (_) { return null; }
    }).filter(Boolean);
    if (stagedAnnouncements.length !== unique.size) {
      const error = new Error('Codal staged snapshot validation failed: expected ' + unique.size + ' records but read ' + stagedAnnouncements.length + '.');
      error.code = 'CODAL_SNAPSHOT_VALIDATION_FAILED';
      throw error;
    }
    const activationTime = new Date();
    const nextSnapshotCache = {
      snapshotId,
      fetchedAt: activationTime.toISOString(),
      announcementCount: unique.size,
      pageCount: totalPages,
      announcements: stagedAnnouncements,
      updatedAt: activationTime.toISOString()
    };

    // Activate only after every staged row, archive batch, and cache payload has succeeded.
    await prisma.$transaction(async tx => {
      const stateRows = await tx.$queryRaw`SELECT StateId FROM dbo.CodalSnapshotState WHERE StateId = 1`;
      if (stateRows.length) {
        await tx.$executeRaw`UPDATE dbo.CodalSnapshotState SET ActiveSnapshotId = ${snapshotId}, LastAttemptAt = ${activationTime}, LastSuccessAt = ${activationTime}, LastError = NULL, AnnouncementCount = ${unique.size}, PageCount = ${totalPages} WHERE StateId = 1`;
      } else {
        await tx.$executeRaw`INSERT INTO dbo.CodalSnapshotState (StateId, ActiveSnapshotId, LastAttemptAt, LastSuccessAt, LastError, AnnouncementCount, PageCount) VALUES (1, ${snapshotId}, ${activationTime}, ${activationTime}, NULL, ${unique.size}, ${totalPages})`;
      }
    });
    snapshotActivated = true;

    // Publish the already-validated complete dataset to the process cache immediately
    // after the database pointer swap. No second database read is needed here.
    publishCodalSnapshotCache(nextSnapshotCache, 'snapshot-activated');

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
    // Financial-document processing starts only from its dedicated 08:20 daily schedule.
    return { success: true, snapshotId, announcementCount: unique.size, pageCount: totalPages, reportedCount, reportedPages, cacheUpdated: true, startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString() };
  } catch (error) {
    if (!snapshotActivated) {
      try {
        await prisma.$executeRaw`DELETE FROM dbo.CodalSnapshotAnnouncement WHERE SnapshotId = ${snapshotId}`;
      } catch (_) {}
    }
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

  if (symbol) {
    // Prefer the same persisted snapshot that feeds the financial-document cache.
    // Only fall back to the live CODAL listing when this issuer has no financial
    // filings in the active snapshot (the global snapshot is intentionally capped).
    const state = await prisma.$queryRaw`SELECT ActiveSnapshotId, LastSuccessAt FROM dbo.CodalSnapshotState WHERE StateId = 1`;
    const activeId = state[0] && state[0].ActiveSnapshotId ? String(state[0].ActiveSnapshotId) : '';
    if (activeId) {
      const rows = await prisma.$queryRaw`SELECT AnnouncementKey, PayloadJson FROM dbo.CodalSnapshotAnnouncement WHERE SnapshotId = ${activeId} AND Symbol = ${symbol} ORDER BY PublishedAt DESC, AnnouncementKey`;
      const snapshotItems = rows.map(row => {
        try { return JSON.parse(row.PayloadJson); } catch (_) { return null; }
      }).filter(Boolean);
      const hasFinancialFilings = snapshotItems.some(item => {
        const title = String(first(item, ['title', 'Title']) || '');
        const categoryName = String(first(item, ['categoryName', 'category_name']) || '');
        return /صورت|ترازنامه|سود و زیان|فعالیت ماهانه|گزارش مالی|پیش.?بینی سود|financial statement/i.test(title + ' ' + categoryName);
      });
      if (hasFinancialFilings) {
        const filtered = category
          ? snapshotItems.filter(item => String(first(item, ['category', 'Category', 'category_id', 'categoryId']) || '') === category)
          : snapshotItems;
        const start = (page - 1) * pageSize;
        return {
          success: true,
          provider: 'CODAL_DB_SNAPSHOT',
          symbol,
          announcements: filtered.slice(start, start + pageSize),
          countAnnouncement: filtered.length,
          countPage: Math.ceil(filtered.length / pageSize),
          page,
          fetchedAt: state[0].LastSuccessAt ? new Date(state[0].LastSuccessAt).toISOString() : null,
          snapshotId: activeId,
          stale: false
        };
      }
    }

    // Snapshot coverage is incomplete for some issuers. In that case only,
    // retrieve the issuer's filings directly from CODAL; the downstream
    // document service will persist any successfully extracted metrics.
    const payload = await fetchPage(page, { l18: symbol });
    const items = asArray(payload).map(item => normalizeAnnouncement(item));
    const filtered = category
      ? items.filter(item => String(item.category || '') === category)
      : items;
    const reportedCount = Number(first(payload, ['count_announcement', 'countAnnouncement'])) || filtered.length;
    const reportedPages = Number(first(payload, ['count_page', 'countPage'])) || Math.ceil(reportedCount / Math.max(1, items.length));
    return {
      success: true,
      provider: 'BRS_CODAL_V2_SYMBOL_FALLBACK',
      symbol,
      announcements: filtered,
      countAnnouncement: category ? filtered.length : reportedCount,
      countPage: category ? Math.ceil(filtered.length / Math.max(1, items.length)) : reportedPages,
      page,
      fetchedAt: new Date().toISOString(),
      stale: false,
      fallbackReason: 'NO_FINANCIAL_FILINGS_IN_ACTIVE_SNAPSHOT'
    };
  }

  const state = await prisma.$queryRaw`SELECT ActiveSnapshotId, LastSuccessAt, AnnouncementCount, PageCount FROM dbo.CodalSnapshotState WHERE StateId = 1`;
  const activeId = state[0] && state[0].ActiveSnapshotId ? String(state[0].ActiveSnapshotId) : '';
  if (!activeId) {
    return { success: true, provider: 'CODAL_DB_SNAPSHOT', symbol: null, announcements: [], countAnnouncement: 0, countPage: 0, page, fetchedAt: null, snapshotId: null, stale: true };
  }
  const conditions = ['SnapshotId = @P1'];
  const params = [activeId];
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
    symbol: null,
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

async function refreshCodalSnapshotCache({ reason = 'manual' } = {}) {
  const stateRows = await prisma.$queryRaw`SELECT ActiveSnapshotId, LastSuccessAt, AnnouncementCount, PageCount FROM dbo.CodalSnapshotState WHERE StateId = 1`;
  const state = stateRows[0] || null;
  const snapshotId = state && state.ActiveSnapshotId ? String(state.ActiveSnapshotId) : '';
  if (!snapshotId) {
    const empty = { snapshotId: null, fetchedAt: null, announcementCount: 0, pageCount: 0, announcements: [], updatedAt: new Date().toISOString() };
    centralCache.set(CODAL_SNAPSHOT_CACHE_KEY, empty);
    return empty;
  }
  const rows = await prisma.$queryRaw`SELECT AnnouncementKey, PayloadJson FROM dbo.CodalSnapshotAnnouncement WHERE SnapshotId = ${snapshotId} ORDER BY PublishedAt DESC, AnnouncementKey`;
  const announcements = rows.map(row => {
    try { return JSON.parse(row.PayloadJson); } catch (_) { return null; }
  }).filter(Boolean);
  const snapshot = {
    snapshotId,
    fetchedAt: state.LastSuccessAt ? new Date(state.LastSuccessAt).toISOString() : null,
    announcementCount: Number(state.AnnouncementCount || announcements.length),
    pageCount: Number(state.PageCount || 0),
    announcements,
    updatedAt: new Date().toISOString()
  };
  return publishCodalSnapshotCache(snapshot, reason);
}

async function getCodalSnapshotFromCache() {
  return centralCache.getOrLoad(CODAL_SNAPSHOT_CACHE_KEY, 24 * 60 * 60 * 1000, () => refreshCodalSnapshotCache({ reason: 'cache-hydration' }));
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
  void refreshCodalSnapshotCache({ reason: 'startup-hydration' }).catch(error => {
    console.error('[CODAL SNAPSHOT] startup cache hydration failed:', error.message || error);
  });
  cronTasks = [
    cron.schedule('0 8 * * *', () => refreshSnapshot({ reason: 'scheduled-08:00' }), { timezone: TEHRAN_TIMEZONE })
  ];
  console.log('[CODAL SNAPSHOT] scheduled daily at 08:00 Asia/Tehran; global daily API cap=' + getApiConfig().dailyLimit);
}

function stopCodalSnapshotCron() {
  for (const task of cronTasks) task.stop();
  cronTasks = [];
}

async function getSnapshotStatus() {
  const rows = await prisma.$queryRaw`SELECT ActiveSnapshotId, LastAttemptAt, LastSuccessAt, LastError, AnnouncementCount, PageCount FROM dbo.CodalSnapshotState WHERE StateId = 1`;
  return { state: rows[0] || null, usage: await readUsage() };
}

module.exports = { getCompanyReports, getArchivedReports, getReports, refreshSnapshot, refreshCodalSnapshotCache, getCodalSnapshotFromCache, startCodalSnapshotCron, stopCodalSnapshotCron, getSnapshotStatus, normalizeAnnouncement };
