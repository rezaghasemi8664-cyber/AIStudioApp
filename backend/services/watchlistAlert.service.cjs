'use strict';

const prismaModule = require('../config/prisma.cjs');
const prisma = prismaModule.prisma || prismaModule;
const brsService = require('./brs.service.cjs');

const PREF_KEY = 'watchlist_alerts';
const HISTORY_KEY = 'watchlist_alert_history';
const METRICS = new Set(['lastPrice', 'lastChangePercent', 'volume', 'closePrice', 'closeChangePercent']);
const OPERATORS = new Set(['gt', 'gte', 'lt', 'lte', 'eq']);
const STATUSES = new Set(['armed', 'triggered', 'disabled']);
const LOGICS = new Set(['AND', 'OR']);
const HISTORY_LIMIT = 200;
const AUTO_EVALUATE_MS = 60 * 1000;

function getUserId(req) {
  const id = Number(req.user && (req.user.id ?? req.user.userId));
  return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizeCondition(input) {
  const metric = String(input?.metric ?? '');
  const operator = String(input?.operator ?? '');
  const threshold = Number(input?.threshold);
  if (!METRICS.has(metric) || !OPERATORS.has(operator) || !Number.isFinite(threshold)) return null;
  return { metric, operator, threshold };
}

function normalizeRule(input, existing = {}) {
  const symbol = String(input?.symbol ?? existing.symbol ?? '').trim().toUpperCase();
  const status = String(input?.status ?? existing.status ?? 'armed');
  const logic = String(input?.logic ?? existing.logic ?? 'AND').toUpperCase();
  const sourceConditions = Array.isArray(input?.conditions) ? input.conditions : (Array.isArray(existing.conditions) ? existing.conditions : null);
  const legacy = { metric: input?.metric ?? existing.metric, operator: input?.operator ?? existing.operator, threshold: input?.threshold ?? existing.threshold };
  const conditions = (sourceConditions || [legacy]).map(normalizeCondition).filter(Boolean);
  if (!symbol || !conditions.length || !STATUSES.has(status) || !LOGICS.has(logic)) return null;
  const primary = conditions[0];
  const now = new Date().toISOString();
  const rearmed = status === 'armed';
  return {
    id: String(existing.id || input?.id || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`),
    symbol,
    metric: primary.metric,
    operator: primary.operator,
    threshold: primary.threshold,
    conditions,
    logic,
    status,
    createdAt: String(existing.createdAt || now),
    updatedAt: now,
    ...(rearmed ? {} : (existing.triggeredAt || input?.triggeredAt ? { triggeredAt: String(input?.triggeredAt ?? existing.triggeredAt) } : {})),
    ...(input?.note !== undefined || existing.note !== undefined ? { note: String(input?.note ?? existing.note ?? '').trim() || undefined } : {}),
  };
}

function evaluate(value, operator, threshold) {
  if (!Number.isFinite(Number(value)) || !Number.isFinite(Number(threshold))) return false;
  const v = Number(value); const t = Number(threshold);
  if (operator === 'gt') return v > t;
  if (operator === 'gte') return v >= t;
  if (operator === 'lt') return v < t;
  if (operator === 'lte') return v <= t;
  if (operator === 'eq') return v === t;
  return false;
}

function metricValue(quote, metric) {
  const value = quote?.[metric];
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

async function readRules(userId) {
  const row = await prisma.userPreference.findUnique({ where: { userId_key: { userId, key: PREF_KEY } } });
  if (!row?.value) return [];
  try {
    const parsed = JSON.parse(row.value);
    return Array.isArray(parsed) ? parsed.map(item => normalizeRule(item, item)).filter(Boolean) : [];
  } catch (_) { return []; }
}

async function writeRules(userId, rules) {
  await prisma.userPreference.upsert({ where: { userId_key: { userId, key: PREF_KEY } }, create: { userId, key: PREF_KEY, value: JSON.stringify(rules) }, update: { value: JSON.stringify(rules) } });
}

async function readHistory(userId) {
  const row = await prisma.userPreference.findUnique({ where: { userId_key: { userId, key: HISTORY_KEY } } });
  if (!row?.value) return [];
  try { const parsed = JSON.parse(row.value); return Array.isArray(parsed) ? parsed : []; } catch (_) { return []; }
}

async function writeHistory(userId, history) {
  await prisma.userPreference.upsert({ where: { userId_key: { userId, key: HISTORY_KEY } }, create: { userId, key: HISTORY_KEY, value: JSON.stringify(history.slice(0, HISTORY_LIMIT)) }, update: { value: JSON.stringify(history.slice(0, HISTORY_LIMIT)) } });
}

async function createRule(userId, input) {
  const rule = normalizeRule(input);
  if (!rule) throw new Error('قانون هشدار نامعتبر است.');
  const rules = await readRules(userId); rules.push(rule); await writeRules(userId, rules); return rule;
}

async function updateRule(userId, id, input) {
  const rules = await readRules(userId); const index = rules.findIndex(item => item.id === String(id));
  if (index < 0) return null;
  const updated = normalizeRule(input, rules[index]); if (!updated) throw new Error('قانون هشدار نامعتبر است.');
  rules[index] = updated; await writeRules(userId, rules); return updated;
}

async function deleteRule(userId, id) {
  const rules = await readRules(userId); const next = rules.filter(item => item.id !== String(id));
  if (next.length === rules.length) return false; await writeRules(userId, next); return true;
}

async function getQuote(symbol) {
  const result = await brsService.getSymbolData(symbol);
  const raw = result?.data ?? result ?? {};
  const number = (...values) => {
    for (const value of values) {
      if (value === null || value === undefined || value === '') continue;
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
    return null;
  };

  const sourceMeta = result?._meta || result?.meta || {};
  const source = String(sourceMeta.source || result?.source || '').toLowerCase();
  const dataStatus = source === 'live'
    ? 'LIVE'
    : (source === 'cache' || source.includes('history') || source.includes('fallback') ? 'CACHED' : 'UNAVAILABLE');

  const lastPrice = number(raw.pDrCotVal, raw.pl, raw.last, raw.lastPrice, raw.priceLast);
  const closePrice = number(raw.pClosing, raw.pc, raw.close, raw.closingPrice);
  const volume = number(raw.tvol, raw.qTotTran5J, raw.volume, raw.tradeVolume);
  const lastChangePercent = number(raw.plp, raw.lastChangePercent, raw.percentChange, raw.priceChangePercent);
  const closeChangePercent = number(raw.pcp, raw.closeChangePercent, raw.closingChangePercent);
  const yesterday = number(raw.pYest, raw.py, raw.yesterdayPrice, raw.previousClose, raw.yesterday);

  const hasUsableQuote = lastPrice != null || closePrice != null || volume != null;
  return {
    symbol: String(raw.symbol ?? raw.l18 ?? raw.lVal18AFC ?? raw.ticker ?? symbol).trim().toUpperCase(),
    lastPrice,
    lastChangePercent: lastChangePercent ?? (lastPrice != null && yesterday ? ((lastPrice - yesterday) / yesterday) * 100 : null),
    volume,
    closePrice,
    closeChangePercent: closeChangePercent ?? (closePrice != null && yesterday ? ((closePrice - yesterday) / yesterday) * 100 : null),
    capturedAt: sourceMeta.fetchedAt || result?.fetchedAt || new Date().toISOString(),
    dataStatus: hasUsableQuote ? dataStatus : 'UNAVAILABLE',
    source: source || 'unavailable',
    stale: dataStatus !== 'LIVE'
  };
}

async function evaluateArmedRules(userId) {
  const rules = await readRules(userId); const armed = rules.filter(rule => rule.status === 'armed'); const quotes = new Map(); const triggered = [];
  for (const rule of armed) {
    if (!quotes.has(rule.symbol)) { try { quotes.set(rule.symbol, await getQuote(rule.symbol)); } catch (_) { quotes.set(rule.symbol, null); } }
    const quote = quotes.get(rule.symbol);\n    if (!quote || quote.dataStatus === 'UNAVAILABLE') continue;\n    const results = rule.conditions.map(condition => ({ ...condition, value: metricValue(quote, condition.metric), matched: evaluate(metricValue(quote, condition.metric), condition.operator, condition.threshold) }));
    const matched = rule.logic === 'OR' ? results.some(item => item.matched) : results.every(item => item.matched);
    if (!matched) continue;
    const triggeredAt = new Date().toISOString(); const nextRule = { ...rule, status: 'triggered', triggeredAt, updatedAt: triggeredAt }; const index = rules.findIndex(item => item.id === rule.id); if (index >= 0) rules[index] = nextRule;
    const primary = results[0];
    const snapshot = { ...quote, metric: primary.metric, value: primary.value, ruleId: rule.id, capturedAt: quote.capturedAt };
    triggered.push({ rule: nextRule, snapshot, conditions: results });
  }
  if (triggered.length) {
    await writeRules(userId, rules); const history = await readHistory(userId);
    const entries = triggered.map(item => ({ id: `${item.rule.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ruleId: item.rule.id, symbol: item.rule.symbol, metric: item.rule.metric, operator: item.rule.operator, threshold: item.rule.threshold, value: item.snapshot.value, triggeredAt: item.rule.triggeredAt, logic: item.rule.logic, conditions: item.conditions, snapshot: item.snapshot, dataStatus: item.snapshot.dataStatus, source: item.snapshot.source, stale: item.snapshot.stale }));
    await writeHistory(userId, [...entries.reverse(), ...history]);
  }
  return { checked: armed.length, triggered };
}

async function evaluateAllUsers() {
  try { const rows = await prisma.userPreference.findMany({ where: { key: PREF_KEY }, select: { userId: true } }); const userIds = [...new Set(rows.map(row => Number(row.userId)).filter(id => Number.isInteger(id) && id > 0))]; for (const userId of userIds) { try { await evaluateArmedRules(userId); } catch (error) { console.error(`[WATCHLIST-ALERT] auto evaluation failed for user ${userId}:`, error.message); } } } catch (error) { console.error('[WATCHLIST-ALERT] auto evaluation cycle failed:', error.message); }
}

if (!global.__roniyaWatchlistAlertScheduler) { global.__roniyaWatchlistAlertScheduler = setInterval(() => { void evaluateAllUsers(); }, AUTO_EVALUATE_MS); if (typeof global.__roniyaWatchlistAlertScheduler.unref === 'function') global.__roniyaWatchlistAlertScheduler.unref(); }

module.exports = { getUserId, readRules, readHistory, createRule, updateRule, deleteRule, evaluateArmedRules };
