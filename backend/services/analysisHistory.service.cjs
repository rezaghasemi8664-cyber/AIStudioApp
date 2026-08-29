'use strict';

const prisma = require('../config/prisma.cjs');

const MAX_HISTORY_ITEMS = 3;

function toInt(value) {
  const n = Number.parseInt(String(value), 10);
  return Number.isInteger(n) ? n : null;
}

function safeText(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function safeParseResultJson(input) {
  if (!input) return null;

  // اگر قبلاً object باشد (مثلاً از لایه‌ای دیگر آمده)
  if (typeof input === 'object') return input;

  if (typeof input !== 'string') return null;

  try {
    return JSON.parse(input);
  } catch (_) {
    return null;
  }
}

/**
 * متن کامل تحلیل را از ساختارهای رایج خروجی استخراج می‌کند.
 * اولویت:
 * fullText > content > analysisText > text > details > explanation > longSummary > summary
 * سپس داخل result/parsedResult و در نهایت fallbackSummary
 */
function extractFullTextFromParsed(parsed, fallbackSummary) {
  const summaryFallback = safeText(fallbackSummary);

  if (!parsed || typeof parsed !== 'object') {
    return summaryFallback;
  }

  const nestedResult = parsed.result && typeof parsed.result === 'object' ? parsed.result : null;
  const nestedParsed = parsed.parsedResult && typeof parsed.parsedResult === 'object' ? parsed.parsedResult : null;

  const candidates = [
    parsed.fullText,
    parsed.content,
    parsed.analysisText,
    parsed.text,
    parsed.details,
    parsed.explanation,
    parsed.longSummary,
    parsed.summary,

    nestedResult && nestedResult.fullText,
    nestedResult && nestedResult.content,
    nestedResult && nestedResult.analysisText,
    nestedResult && nestedResult.text,
    nestedResult && nestedResult.details,
    nestedResult && nestedResult.summary,

    nestedParsed && nestedParsed.fullText,
    nestedParsed && nestedParsed.content,
    nestedParsed && nestedParsed.analysisText,
    nestedParsed && nestedParsed.text,
    nestedParsed && nestedParsed.details,
    nestedParsed && nestedParsed.summary,
  ];

  for (const c of candidates) {
    const t = safeText(c);
    if (t) return t;
  }

  return summaryFallback;
}

function normalizeRow(row) {
  const parsedResult = safeParseResultJson(row.resultJson);
  const fullText = extractFullTextFromParsed(parsedResult, row.summary);

  return {
    ...row,
    parsedResult,
    fullText,
  };
}

/**
 * Save AI analysis history (Single Source of Truth)
 * - Enforces max 3 latest records per user
 */
async function saveAnalysis({ userId, symbol, stock, outputPayload, summary, recommendation, riskLevel }) {
  const uid = toInt(userId);
  if (!uid) {
    throw new Error('analysisHistory.saveAnalysis: userId is required');
  }

  // هم symbol و هم stock را بپذیر
  const resolvedStock = safeText(symbol) || safeText(stock);
  if (!resolvedStock) {
    throw new Error('analysisHistory.saveAnalysis: symbol/stock is required');
  }

  const payload = outputPayload && typeof outputPayload === 'object' ? outputPayload : {};

  const created = await prisma.analysisHistory.create({
    data: {
      userId: uid,
      stock: resolvedStock,
      // اگر ستون‌ها در schema وجود داشته باشند، Prisma آنها را می‌پذیرد
      // اگر در schema نباشند این خطوط را حذف کن.
      summary: safeText(summary) || null,
      recommendation: safeText(recommendation) || null,
      riskLevel: safeText(riskLevel) || null,
      resultJson: JSON.stringify(payload),
    },
  });

  // Enforce max history items per user (ordering stable)
  const all = await prisma.analysisHistory.findMany({
    where: { userId: uid },
    select: { id: true, createdAt: true },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });

  if (all.length > MAX_HISTORY_ITEMS) {
    const idsToDelete = all.slice(MAX_HISTORY_ITEMS).map((x) => x.id);

    if (idsToDelete.length > 0) {
      // deleteMany with scoped userId for extra safety
      await prisma.analysisHistory.deleteMany({
        where: {
          userId: uid,
          id: { in: idsToDelete },
        },
      });
    }
  }

  return normalizeRow(created);
}

/**
 * List analyses of user (newest first)
 * - Supports offset for pagination
 * - Limit is clamped to MAX_HISTORY_ITEMS by current business rule
 */
async function list(userId, limit = MAX_HISTORY_ITEMS, offset = 0) {
  const uid = toInt(userId);
  if (!uid) return [];

  const parsedLimit = toInt(limit);
  const parsedOffset = toInt(offset);

  const finalLimit = Math.min(Math.max(parsedLimit || MAX_HISTORY_ITEMS, 1), MAX_HISTORY_ITEMS);
  const finalOffset = Math.max(parsedOffset || 0, 0);

  const rows = await prisma.analysisHistory.findMany({
    where: { userId: uid },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    skip: finalOffset,
    take: finalLimit,
  });

  return rows.map(normalizeRow);
}

/**
 * Get single analysis (ownership safe)
 */
async function getOne(userId, id) {
  const uid = toInt(userId);
  const analysisId = toInt(id);
  if (!uid || !analysisId) return null;

  const row = await prisma.analysisHistory.findFirst({
    where: { id: analysisId, userId: uid },
  });

  if (!row) return null;

  return normalizeRow(row);
}

/**
 * Delete single analysis (ownership safe)
 */
async function removeOne(userId, id) {
  const uid = toInt(userId);
  const analysisId = toInt(id);
  if (!uid || !analysisId) return { deleted: false, reason: 'INVALID_INPUT' };

  const existing = await prisma.analysisHistory.findFirst({
    where: { id: analysisId, userId: uid },
    select: { id: true, stock: true },
  });

  if (!existing) return { deleted: false, reason: 'NOT_FOUND' };

  // چون id یکتا است، delete با id کافی است (مالکیت را بالا بررسی کردیم)
  await prisma.analysisHistory.delete({
    where: { id: analysisId },
  });

  return { deleted: true, data: existing };
}

/**
 * Clear all analyses for user
 */
async function clearUserHistory(userId) {
  const uid = toInt(userId);
  if (!uid) return { count: 0 };

  const result = await prisma.analysisHistory.deleteMany({
    where: { userId: uid },
  });

  return { count: result.count };
}

module.exports = {
  MAX_HISTORY_ITEMS,
  saveAnalysis,
  list,
  getOne,
  removeOne,
  clearUserHistory,
  // برای استفاده احتمالی در controller
  safeParseResultJson,
  extractFullTextFromParsed,
};
