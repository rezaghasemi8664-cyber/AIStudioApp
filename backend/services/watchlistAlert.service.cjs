'use strict';

const prismaModule = require('../config/prisma.cjs');
const prisma = prismaModule.prisma || prismaModule;
const brsService = require('./brs.service.cjs');

const PREF_KEY = 'watchlist_alerts';
const METRICS = new Set(['lastPrice', 'lastChangePercent', 'volume', 'closePrice', 'closeChangePercent']);
const OPERATORS = new Set(['gt', 'gte', 'lt', 'lte', 'eq']);
const STATUSES = new Set(['armed', 'triggered', 'disabled']);

function getUserId(req) {
  const id = Number(req.user && (req.user.id ?? req.user.userId));
  return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizeRule(input, existing = {}) {
  const symbol = String(input?.symbol ?? existing.symbol ?? '').trim().toUpperCase();
  const metric = String(input?.metric ?? existing.metric ?? '');
  const operator = String(input?.operator ?? existing.operator ?? '');
  const threshold = Number(input?.threshold ?? existing.threshold);
  const status = String(input?.status ?? existing.status ?? 'armed');
  if (!symbol || !METRICS.has(metric) || !OPERATORS.has(operator) || !Number.isFinite(threshold) || !STATUSES.has(status)) return null;
  const now = new Date().toISOString();
  return {
    id: String(existing.id || input?.id || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`),
    symbol,
    metric,
    operator,
    threshold,
    status,
    createdAt: String(existing.createdAt || now),
    updatedAt: now,
    ...(existing.triggeredAt || input?.triggeredAt ? { triggeredAt: String(input?.triggeredAt ?? existing.triggeredAt) } : {}),
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
  await prisma.userPreference.upsert({
    where: { userId_key: { userId, key: PREF_KEY } },
    create: { userId, key: PREF_KEY, value: JSON.stringify(rules) },
    update: { value: JSON.stringify(rules) },
  });
}

async function createRule(userId, input) {
  const rule = normalizeRule(input);
  if (!rule) throw new Error('قانون هشدار نامعتبر است.');
  const rules = await readRules(userId);
  rules.push(rule);
  await writeRules(userId, rules);
  return rule;
}

async function updateRule(userId, id, input) {
  const rules = await readRules(userId);
  const index = rules.findIndex(item => item.id === String(id));
  if (index < 0) return null;
  const updated = normalizeRule(input, rules[index]);
  if (!updated) throw new Error('قانون هشدار نامعتبر است.');
  rules[index] = updated;
  await writeRules(userId, rules);
  return updated;
}

async function deleteRule(userId, id) {
  const rules = await readRules(userId);
  const next = rules.filter(item => item.id !== String(id));
  if (next.length === rules.length) return false;
  await writeRules(userId, next);
  return true;
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
  const lastPrice = number(raw.pDrCotVal, raw.pl, raw.last, raw.lastPrice, raw.priceLast);
  const closePrice = number(raw.pClosing, raw.pc, raw.close, raw.closingPrice);
  const volume = number(raw.tvol, raw.qTotTran5J, raw.volume, raw.tradeVolume);
  const lastChangePercent = number(raw.plp, raw.lastChangePercent, raw.percentChange, raw.priceChangePercent);
  const closeChangePercent = number(raw.pcp, raw.closeChangePercent, raw.closingChangePercent);
  const yesterday = number(raw.pYest, raw.py, raw.yesterdayPrice, raw.previousClose, raw.yesterday);
  return {
    symbol: String(raw.symbol ?? raw.l18 ?? raw.lVal18AFC ?? raw.ticker ?? symbol).trim().toUpperCase(),
    lastPrice,
    lastChangePercent: lastChangePercent ?? (lastPrice != null && yesterday ? ((lastPrice - yesterday) / yesterday) * 100 : null),
    volume,
    closePrice,
    closeChangePercent: closeChangePercent ?? (closePrice != null && yesterday ? ((closePrice - yesterday) / yesterday) * 100 : null),
    capturedAt: new Date().toISOString(),
  };
}

async function evaluateArmedRules(userId) {
  const rules = await readRules(userId);
  const armed = rules.filter(rule => rule.status === 'armed');
  const quotes = new Map();
  const triggered = [];
  for (const rule of armed) {
    if (!quotes.has(rule.symbol)) {
      try { quotes.set(rule.symbol, await getQuote(rule.symbol)); } catch (_) { quotes.set(rule.symbol, null); }
    }
    const quote = quotes.get(rule.symbol);
    const value = metricValue(quote, rule.metric);
    if (value !== null && evaluate(value, rule.operator, rule.threshold)) {
      const triggeredAt = new Date().toISOString();
      const nextRule = { ...rule, status: 'triggered', triggeredAt, updatedAt: triggeredAt };
      const index = rules.findIndex(item => item.id === rule.id);
      if (index >= 0) rules[index] = nextRule;
      triggered.push({ rule: nextRule, snapshot: { symbol: rule.symbol, metric: rule.metric, value, capturedAt: quote.capturedAt } });
    }
  }
  if (triggered.length) await writeRules(userId, rules);
  return { checked: armed.length, triggered };
}

module.exports = {
  getUserId,
  readRules,
  createRule,
  updateRule,
  deleteRule,
  evaluateArmedRules,
};
