'use strict';

// Independent analysis engine. It intentionally does not import the scalping engine.
const market = require('./sharedMarket.service.cjs');
const codal = require('./codalIntelligence.service.cjs');
const fundamentalAnalysis = require('./fundamental-analysis.v2.service.cjs');
const prisma = require('../config/prisma.cjs');
const marketSnapshotService = require('./marketSnapshot.service.cjs');
const centralCache = require('./centralMarketCache.service.cjs');

const PERSISTENCE_KEY = 'valuableSymbols.snapshot.v1';

const MAX_RESULTS = 20;
const MIN_HISTORY = 20;
const MAX_CODAL_LOOKUPS = positiveEnv('VALUABLE_SYMBOLS_MAX_CODAL_LOOKUPS', 15);
const MAX_HISTORY_CANDIDATES = positiveEnv('VALUABLE_SYMBOLS_MAX_HISTORY_CANDIDATES', 180);
const MAX_PRICE_AGE_HOURS = positiveEnv('VALUABLE_SYMBOLS_MAX_PRICE_AGE_HOURS', 72);
const MAX_HISTORY_AGE_DAYS = positiveEnv('VALUABLE_SYMBOLS_MAX_HISTORY_AGE_DAYS', 7);
const MAX_CODAL_REPORT_AGE_DAYS = positiveEnv('VALUABLE_SYMBOLS_MAX_CODAL_REPORT_AGE_DAYS', 540);
let cachedResults = [];
let cachedEvaluatedAt = null;
let persistenceReadAt = 0;
let persistenceReadInFlight = null;
let evaluationInFlight = null;
let evaluationRunId = 0;
const EVALUATION_TIMEOUT_MS = positiveEnv('VALUABLE_SYMBOLS_EVALUATION_TIMEOUT_MS', 8 * 60 * 1000);

async function getStoredValuableSymbols({ force = false } = {}) {
  const memoryValue = centralCache.get('market:valuable-symbols');
  if (!force && memoryValue) return memoryValue;
  if (!force && Date.now() - persistenceReadAt < 5000 && cachedEvaluatedAt) {
    return { results: cachedResults, evaluatedAt: cachedEvaluatedAt, snapshotId: null };
  }
  if (persistenceReadInFlight) return persistenceReadInFlight;
  persistenceReadInFlight = (async () => {
    const row = await prisma.appConfig.findUnique({ where: { key: PERSISTENCE_KEY } });
    let payload = null;
    try { payload = row?.value ? JSON.parse(row.value) : null; } catch (_) { payload = null; }
    if (payload && Array.isArray(payload.results) && payload.results.length) {
      cachedResults = payload.results.slice(0, MAX_RESULTS);
      cachedEvaluatedAt = payload.evaluatedAt || null;
    }
    persistenceReadAt = Date.now();
    const result = { results: cachedResults, evaluatedAt: cachedEvaluatedAt, snapshotId: payload?.snapshotId ?? null, snapshotUpdatedAt: payload?.snapshotUpdatedAt || null };
    if (result.results.length) centralCache.set('market:valuable-symbols', result);
    return result;
  })();
  try { return await persistenceReadInFlight; }
  finally { persistenceReadInFlight = null; }
}

async function persistValuableSymbols(results, evaluatedAt, snapshotId = null) {
  if (!Array.isArray(results) || !results.length) return false;
  const payload = {
    results: results.slice(0, MAX_RESULTS),
    evaluatedAt,
    snapshotId: snapshotId === null ? null : Number(snapshotId),
    snapshotUpdatedAt: results.reduce((latest, item) => {
      const candidate = parseTimestamp(item?.marketUpdatedAt);
      return candidate !== null && (latest === null || candidate > latest) ? candidate : latest;
    }, null) === null ? null : new Date(results.reduce((latest, item) => {
      const candidate = parseTimestamp(item?.marketUpdatedAt);
      return candidate !== null && (latest === null || candidate > latest) ? candidate : latest;
    }, null)).toISOString(),
    source: 'shared-market-db+codal'
  };
  await prisma.appConfig.upsert({
    where: { key: PERSISTENCE_KEY },
    create: { key: PERSISTENCE_KEY, value: JSON.stringify(payload) },
    update: { value: JSON.stringify(payload), updatedAt: new Date() }
  });
  cachedResults = payload.results;
  cachedEvaluatedAt = evaluatedAt;
  persistenceReadAt = Date.now();
  centralCache.set('market:valuable-symbols', { results: cachedResults, evaluatedAt: cachedEvaluatedAt, snapshotId: payload.snapshotId, snapshotUpdatedAt: payload.snapshotUpdatedAt });
  return true;
}

function positiveEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function parseTimestamp(value) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (value === null || value === undefined || value === '') return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function isFreshTimestamp(value, maxAgeMs, now = Date.now()) {
  const timestamp = parseTimestamp(value);
  return timestamp !== null && timestamp <= now + 5 * 60 * 1000 &&
    now - timestamp <= maxAgeMs;
}

function getMarketSession(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tehran',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const minuteOfDay = Number(values.hour || 0) * 60 + Number(values.minute || 0);
  const isOpen = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed'].includes(values.weekday) &&
    minuteOfDay >= 540 && minuteOfDay < 750;
  return { status: isOpen ? 'OPEN' : 'CLOSED', isOpen };
}

function tehranDateKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', calendar: 'gregory' }).format(date);
}

function historyContainsCurrentMarketDay(history, now = new Date()) {
  if (!Array.isArray(history) || !history.length) return false;
  const latest = Math.max(...history.map(row => parseTimestamp(row && row.date)).filter(value => value !== null));
  if (!Number.isFinite(latest)) return false;
  return new Date(latest).toISOString().slice(0, 10) === tehranDateKey(now);
}

function isFreshHistory(history, now = Date.now()) {
  if (!Array.isArray(history) || history.length < MIN_HISTORY) return false;
  const timestamps = history.map(row => parseTimestamp(row && row.date)).filter(value => value !== null);
  if (timestamps.length !== history.length || timestamps.length < MIN_HISTORY) return false;
  const latest = Math.max(...timestamps);
  const oldestAllowed = now - MAX_HISTORY_AGE_DAYS * 24 * 60 * 60 * 1000;
  return latest <= now + 24 * 60 * 60 * 1000 && latest >= oldestAllowed;
}

// Convert a Jalali date (the format normally returned by Codal) to a comparable
// approximate day number. The approximation is sufficient for a conservative age gate.
function jalaliDayNumber(year, month, day) {
  const monthStarts = [0, 31, 62, 93, 124, 155, 186, 216, 246, 276, 306, 336];
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const monthLength = month <= 6 ? 31 : month <= 11 ? 30 : 30;
  if (day > monthLength) return null;
  return year * 365 + monthStarts[month - 1] + day;
}

function currentJalaliDayNumber(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US-u-ca-persian', {
    timeZone: 'Asia/Tehran', year: 'numeric', month: 'numeric', day: 'numeric'
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return jalaliDayNumber(Number(values.year), Number(values.month), Number(values.day));
}

function getReportAgeDays(value, now = new Date()) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year >= 1300 && year < 1600) {
    const reportDay = jalaliDayNumber(year, month, day);
    const currentDay = currentJalaliDayNumber(now);
    if (reportDay === null || currentDay === null || reportDay > currentDay) return null;
    return currentDay - reportDay;
  }
  const timestamp = Date.UTC(year, month - 1, day);
  if (!Number.isFinite(timestamp) || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const age = (Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - timestamp) / 86400000;
  return age < 0 ? null : age;
}

function analyzeTechnical(history, currentPrice) {
  const rows = (Array.isArray(history) ? history : [])
    .filter(row => [row.open, row.high, row.low, row.close].every(v => toNumber(v) > 0))
    .reverse();
  if (rows.length < MIN_HISTORY || !(toNumber(currentPrice) > 0)) return null;
  const closes = rows.map(row => toNumber(row.close));
  const sma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  let gains = 0, losses = 0;
  for (let i = closes.length - 14; i < closes.length; i += 1) {
    const delta = closes[i] - closes[i - 1];
    if (delta > 0) gains += delta;
    else losses -= delta;
  }
  const rsi14 = losses === 0 ? 100 : 100 - 100 / (1 + gains / losses);
  const recent = rows.slice(-10);
  const support = Math.min(...recent.map(row => toNumber(row.low)));
  const resistance = Math.max(...recent.map(row => toNumber(row.high)));
  const price = toNumber(currentPrice);
  if (!(sma20 > 0 && support > 0 && resistance > support) ||
      price < sma20 || price <= support || rsi14 < 45 || rsi14 > 68) return null;
  const risk = price - support;
  if (!(risk > 0)) return null;
  return {
    score: Math.round(100 - Math.abs(56 - rsi14)),
    currentPrice: price,
    entryPrice: price,
    targetPrice: price + risk * 2,
    stopLoss: support,
    sma20,
    rsi14,
    support,
    resistance
  };
}

function analyzeFundamental(items, now = new Date()) {
  for (const item of Array.isArray(items) ? items : []) {
    const metrics = item && item.financialMetrics;
    const reportDate = item && item.publishDate;
    const reportAgeDays = getReportAgeDays(reportDate, now);
    if (!metrics || reportAgeDays === null || reportAgeDays > MAX_CODAL_REPORT_AGE_DAYS) continue;
    const eps = toNumber(metrics.eps);
    const netProfit = toNumber(metrics.netProfit);
    if (!((eps !== null && eps > 0) || (netProfit !== null && netProfit > 0))) continue;
    let score = 50;
    if (eps > 0) score += 20;
    if (netProfit > 0) score += 20;
    if (toNumber(metrics.revenueGrowthPercent) > 0) score += 5;
    if (toNumber(metrics.netProfitGrowthPercent) > 0) score += 5;
    return {
      score, eps, netProfit, revenue: toNumber(metrics.revenue),
      reportTitle: item.title || null, reportDate, reportAgeDays: Math.floor(reportAgeDays),
      source: 'codal'
    };
  }
  return null;
}


function toCodalAnnouncement(item) {
  const raw = item && item.raw && typeof item.raw === 'object' ? item.raw : {};
  return {
    ...raw,
    title: item?.title || raw.title || raw.Title || '',
    date_publish: item?.publishDate || raw.date_publish || raw.datePublish || raw.date_send || raw.dateSend || '',
    link_excel: item?.excelUrl || raw.link_excel || raw.linkExcel || '',
    link_attachment: item?.attachmentUrl || raw.link_attachment || raw.linkAttachment || '',
    link_pdf: item?.pdfUrl || raw.link_pdf || raw.linkPdf || '',
    link: item?.url || raw.url || raw.link || '',
    category: raw.category ?? raw.categoryId ?? raw.category_id ?? '',
    categoryName: raw.categoryName ?? raw.category_name ?? ''
  };
}

function metricValue(metrics, key) {
  const entry = metrics && metrics[key];
  return toNumber(entry && typeof entry === 'object' && Object.prototype.hasOwnProperty.call(entry, 'value')
    ? entry.value
    : entry);
}

async function analyzeFundamentalWithDocuments(items, now = new Date()) {
  // Preserve the fast path when the provider already supplies real numeric values.
  const direct = analyzeFundamental(items, now);
  if (direct) return direct;

  const recentReports = (Array.isArray(items) ? items : []).filter(item => {
    const age = getReportAgeDays(item?.publishDate, now);
    if (age === null || age > MAX_CODAL_REPORT_AGE_DAYS) return false;
    return Boolean(item?.excelUrl || item?.attachmentUrl || item?.pdfUrl || item?.url ||
      item?.raw?.link_excel || item?.raw?.link_attachment || item?.raw?.link_pdf || item?.raw?.link);
  });
  if (!recentReports.length) return null;

  const announcements = recentReports.map(toCodalAnnouncement);
  const extracted = await fundamentalAnalysis.analyzeAnnouncements({ announcements });
  const metrics = extracted?.numericData?.metrics || {};
  const eps = metricValue(metrics, 'eps');
  const netProfit = metricValue(metrics, 'netProfit');
  if (!((eps !== null && eps > 0) || (netProfit !== null && netProfit > 0))) return null;
  if (!Number.isFinite(Number(extracted.score)) || extracted.scoreStatus !== 'calculated') return null;

  const document = (extracted.financialDocuments || []).find(item => {
    if (!item?.available) return false;
    const age = getReportAgeDays(
      item.announcement?.publishDate || item.announcement?.date_publish || item.announcement?.date_send,
      now
    );
    return age !== null && age <= MAX_CODAL_REPORT_AGE_DAYS &&
      (metricValue(item.metrics, 'eps') > 0 || metricValue(item.metrics, 'netProfit') > 0 ||
       metricValue(metrics, 'eps') > 0 || metricValue(metrics, 'netProfit') > 0);
  });
  const announcement = document?.announcement || announcements.find(item =>
    item.title && /صورت.*مالی|سود و زیان|ترازنامه|financial statement/i.test(item.title)
  ) || announcements[0];
  const reportDate = announcement?.publishDate || announcement?.date_publish || announcement?.date_send || null;
  const reportAgeDays = getReportAgeDays(reportDate, now);
  if (reportAgeDays === null || reportAgeDays > MAX_CODAL_REPORT_AGE_DAYS) return null;

  return {
    score: Number(extracted.score),
    eps,
    netProfit,
    revenue: metricValue(metrics, 'revenue'),
    reportTitle: announcement?.title || null,
    reportDate,
    reportAgeDays: Math.floor(reportAgeDays),
    source: 'codal-financial-documents',
    extractedMetricCount: Number(extracted.numericData?.quality?.extractedMetricCount) || Object.keys(metrics).length,
    scoreCoverage: extracted.scoreCoverage ?? null
  };
}

function assertEvaluationRun(runId) {
  if (runId !== evaluationRunId) {
    const error = new Error('Valuable-symbols evaluation exceeded its time limit and was superseded');
    error.code = 'VALUABLE_SYMBOLS_RUN_SUPERSEDED';
    throw error;
  }
}

async function evaluateValuableSymbols({ limit = MAX_RESULTS, now = new Date(), allowClosedRecovery = false } = {}) {
  if (evaluationInFlight) return evaluationInFlight;
  const runId = ++evaluationRunId;
  let timer;
  const work = evaluateValuableSymbolsInternal({ limit, now, allowClosedRecovery, runId });
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      if (evaluationRunId === runId) evaluationRunId += 1;
      const error = new Error('Valuable-symbols evaluation timed out');
      error.code = 'VALUABLE_SYMBOLS_EVALUATION_TIMEOUT';
      reject(error);
    }, EVALUATION_TIMEOUT_MS);
  });
  const wrapped = Promise.race([work, timeout]).finally(() => {
    clearTimeout(timer);
    if (evaluationInFlight === wrapped) evaluationInFlight = null;
  });
  evaluationInFlight = wrapped;
  return wrapped;
}

async function evaluateValuableSymbolsInternal({ limit = MAX_RESULTS, now = new Date(), allowClosedRecovery = false, runId } = {}) {
  assertEvaluationRun(runId);
  const nowMs = now.getTime();
  const marketSession = getMarketSession(now);
  const activeSnapshot = await marketSnapshotService.getActiveSnapshot();
  assertEvaluationRun(runId);
  if (!activeSnapshot || !activeSnapshot.id || !activeSnapshot.activatedAt) {
    assertEvaluationRun(runId);
    return (await getStoredValuableSymbols({ force: true })).results;
  }
  const snapshotId = Number(activeSnapshot.id);
  const activatedAtMs = parseTimestamp(activeSnapshot.activatedAt);
  // During the session, only evaluate after a recently activated, verified snapshot.
  // After hours, permit the last verified snapshot solely for empty-list recovery.
  if (marketSession.isOpen && (!isFreshTimestamp(activeSnapshot.activatedAt, 5 * 60 * 1000, nowMs))) {
    console.log('[VALUABLE SYMBOLS] Skipping: no recently activated market snapshot');
    return (await getStoredValuableSymbols({ force: true })).results;
  }
  if (!marketSession.isOpen && !allowClosedRecovery) return (await getStoredValuableSymbols({ force: true })).results;
  const diagnostics = { snapshotId, marketStatus: marketSession.status, marketRows: 0, eligiblePrices: 0, staleOrInvalidPrices: 0, historyRequests: 0, invalidHistory: 0, missingCurrentDayHistory: 0, invalidTechnical: 0, codalLookups: 0, invalidFundamentals: 0, candidateErrors: 0, persisted: false };
  const symbols = await market.getSymbols({ limit: 1200 });
  assertEvaluationRun(runId);
  diagnostics.marketRows = Array.isArray(symbols) ? symbols.length : 0;
  const candidates = symbols
    .filter(row => row && row.symbol && !row.isStale &&
      toNumber(row.lastPrice) > 0 && toNumber(row.closePrice) > 0 &&
      isFreshTimestamp(row.updatedAt, MAX_PRICE_AGE_HOURS * 60 * 60 * 1000, nowMs))
    .sort((a, b) => (toNumber(b.value) || 0) - (toNumber(a.value) || 0))
    .slice(0, MAX_HISTORY_CANDIDATES);
  diagnostics.eligiblePrices = candidates.length;
  diagnostics.staleOrInvalidPrices = Math.max(0, diagnostics.marketRows - candidates.length);
  const results = [];
  let codalLookups = 0;
  for (const row of candidates) {
    if (results.length >= Math.max(1, Math.min(Number(limit) || MAX_RESULTS, MAX_RESULTS))) break;
    if (codalLookups >= MAX_CODAL_LOOKUPS) break;
    try {
      diagnostics.historyRequests += 1;
      const history = await market.getSymbolHistory(row.symbol, 40);
      assertEvaluationRun(runId);
      if (!isFreshHistory(history, nowMs)) { diagnostics.invalidHistory += 1; continue; }
      if (marketSession.isOpen && !historyContainsCurrentMarketDay(history, now)) { diagnostics.missingCurrentDayHistory += 1; continue; }
      const technical = analyzeTechnical(history, row.lastPrice);
      if (!technical) { diagnostics.invalidTechnical += 1; continue; }
      codalLookups += 1;
      diagnostics.codalLookups = codalLookups;
      const reports = await codal.getReports({ symbol: row.symbol, limit: 30 });
      assertEvaluationRun(runId);
      const fundamental = await analyzeFundamentalWithDocuments(reports.items, now);
      assertEvaluationRun(runId);
      if (!fundamental) { diagnostics.invalidFundamentals += 1; continue; }
      const priceTimestamp = parseTimestamp(row.updatedAt);
      results.push({
        symbol: row.symbol, name: row.name || row.symbol, sector: row.sector || null,
        ...technical,
        technicalScore: technical.score,
        score: Math.round(technical.score * 0.6 + fundamental.score * 0.4),
        fundamental, source: 'shared-market-db+codal',
        marketUpdatedAt: new Date(priceTimestamp).toISOString(),
        marketSnapshotId: snapshotId,
        marketDataAgeMinutes: Math.max(0, Math.floor((nowMs - priceTimestamp) / 60000)),
        marketStatus: marketSession.status,
        evaluatedAt: now.toISOString()
      });
    } catch (error) {
      if (error?.code === 'VALUABLE_SYMBOLS_RUN_SUPERSEDED') throw error;
      // Missing, malformed, or expired inputs disqualify the candidate; no synthetic fallback data.
      diagnostics.candidateErrors += 1;
      console.warn('[VALUABLE SYMBOLS] Candidate evaluation failed for ' + String(row?.symbol || 'unknown') + ': ' + error.message);
      continue;
    }
  }
  const rankedResults = results.sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(Number(limit) || MAX_RESULTS, MAX_RESULTS)));
  // The market rows are captured once before candidate evaluation. A newer
  // snapshot can become active while history/Codal requests are in flight;
  // discarding the entire run in that case can prevent persistence indefinitely
  // when the market snapshot refresh cadence is shorter than evaluation time.
  // Each result still carries its captured price timestamp and is revalidated
  // against the shared market data by the read endpoint before being displayed.
  assertEvaluationRun(runId);
  // Never replace a valid persisted list with an empty/failed evaluation.
  if (rankedResults.length) {
    await persistValuableSymbols(rankedResults, now.toISOString(), snapshotId);
    diagnostics.persisted = true;
    console.log('[VALUABLE SYMBOLS] Evaluation diagnostics: ' + JSON.stringify({ ...diagnostics, rankedResults: rankedResults.length }));
    return cachedResults;
  }
  const stored = await getStoredValuableSymbols({ force: true });
  console.warn('[VALUABLE SYMBOLS] Evaluation diagnostics: ' + JSON.stringify({ ...diagnostics, rankedResults: 0, storedResults: stored.results.length }));
  return stored.results;
}

function getCachedValuableSymbols() {
  return { results: cachedResults, evaluatedAt: cachedEvaluatedAt };
}

module.exports = {
  evaluateValuableSymbols, getCachedValuableSymbols, getStoredValuableSymbols, persistValuableSymbols, analyzeTechnical, analyzeFundamental, analyzeFundamentalWithDocuments,
  isFreshTimestamp, isFreshHistory, historyContainsCurrentMarketDay, getReportAgeDays, getMarketSession
};
