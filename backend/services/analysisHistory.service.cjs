'use strict';

const prisma = require('../config/prisma.cjs');

const MAX_HISTORY_ITEMS = 3;

function toInt(value) {
  const n = Number.parseInt(value, 10);
  return Number.isInteger(n) ? n : null;
}

function safeParseResultJson(input) {
  if (!input || typeof input !== 'string') return null;
  try {
    return JSON.parse(input);
  } catch (_) {
    return null;
  }
}

/**
 * Save AI analysis history (Single Source of Truth)
 * - Enforces max 3 latest records per user
 */
async function saveAnalysis({ userId, symbol, outputPayload }) {
  const uid = toInt(userId);
  if (!uid) {
    throw new Error('analysisHistory.saveAnalysis: userId is required');
  }

  const stock = String(symbol || '').trim();
  if (!stock) {
    throw new Error('analysisHistory.saveAnalysis: symbol is required');
  }

  const created = await prisma.analysisHistory.create({
    data: {
      userId: uid,
      stock,
      resultJson: JSON.stringify(outputPayload ?? {}),
    },
  });

  // Enforce max history items per user
  const all = await prisma.analysisHistory.findMany({
    where: { userId: uid },
    select: { id: true },
    orderBy: { createdAt: 'desc' },
  });

  if (all.length > MAX_HISTORY_ITEMS) {
    const idsToDelete = all.slice(MAX_HISTORY_ITEMS).map((x) => x.id);
    await prisma.analysisHistory.deleteMany({
      where: { id: { in: idsToDelete } },
    });
  }

  return {
    ...created,
    parsedResult: safeParseResultJson(created.resultJson),
  };
}

/**
 * List analyses of user (max 3, newest first)
 */
async function list(userId, limit = MAX_HISTORY_ITEMS) {
  const uid = toInt(userId);
  if (!uid) return [];

  const finalLimit = Math.min(Math.max(toInt(limit) || MAX_HISTORY_ITEMS, 1), MAX_HISTORY_ITEMS);

  const rows = await prisma.analysisHistory.findMany({
    where: { userId: uid },
    orderBy: { createdAt: 'desc' },
    take: finalLimit,
  });

  return rows.map((row) => ({
    ...row,
    parsedResult: safeParseResultJson(row.resultJson),
  }));
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

  return {
    ...row,
    parsedResult: safeParseResultJson(row.resultJson),
  };
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
};
