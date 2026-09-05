'use strict';

const express = require('express');
const axios = require('axios');
const { prisma } = require('../config/prisma.cjs');
const authMiddleware = require('../middlewares/auth.middleware.cjs');
const { hasPermission } = require('../services/rbac.service.cjs');

const router = express.Router();

function userId(req) { return Number(req.user?.id ?? req.user?.userId ?? 0) || null; }
function isAdmin(req) {
  const u = req.user || {};
  if (u.isAdmin === true || ['admin', 'superadmin'].includes(String(u.role || '').toLowerCase())) return true;
  return (Array.isArray(u.roles) ? u.roles : []).some(r => ['admin', 'superadmin'].includes(String(typeof r === 'string' ? r : r?.name).toLowerCase()));
}
async function canManage(req) {
  const id = userId(req);
  return !!(id && await hasPermission(id, 'admin.ai.manage'));
}
function maskUrl(value) {
  try {
    const u = new URL(value);
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch (_) { return value ? '[تنظیم‌شده]' : null; }
}
function safeError(error) {
  return String(error?.response?.data?.message || error?.message || 'خطای نامشخص').slice(0, 300);
}

router.use(authMiddleware, async (req, res, next) => {
  if (!isAdmin(req)) return res.status(403).json({ success: false, message: 'این بخش فقط برای ادمین مجاز است.' });
  if (!(await canManage(req))) return res.status(403).json({ success: false, message: 'دسترسی مدیریت هوش مصنوعی برای شما مجاز نیست.' });
  next();
});

router.get('/overview', async (req, res) => {
  const started = Date.now();
  const baseUrl = process.env.AI_API_URL || process.env.GAPGPT_URL || 'http://localhost:8000';
  const apiKey = process.env.AI_API_KEY || process.env.GAPGPT_API_KEY || '';
  const model = process.env.GAPGPT_MODEL || process.env.AI_MODEL || 'gpt-4o-mini';
  const fallbackModel = process.env.GAPGPT_FALLBACK_MODEL || '';
  const timeout = Number(process.env.AI_TIMEOUT || 30000) || 30000;
  const maxTokens = Number(process.env.AI_MAX_TOKENS || 3000) || 3000;
  const configured = !!apiKey;
  let health = { available: false, latencyMs: null, status: null, error: null };
  try {
    const r = await axios.get(`${baseUrl.replace(/\/$/, '')}/health`, { timeout: Math.min(timeout, 5000) });
    health = { available: true, latencyMs: Date.now() - started, status: r.status, error: null };
  } catch (error) {
    health = { available: false, latencyMs: Date.now() - started, status: error?.response?.status || null, error: safeError(error) };
  }

  let saved = {};
  try {
    const rows = await prisma.globalSetting.findMany({ where: { category: 'ai' }, select: { key: true, value: true, updatedAt: true } });
    for (const row of rows) {
      try { saved[row.key] = JSON.parse(row.value); } catch (_) { saved[row.key] = row.value; }
    }
  } catch (_) {}

  return res.json({ success: true, data: {
    service: 'GapGPT / AI',
    configured,
    status: health.available ? 'online' : (configured ? 'degraded' : 'not-configured'),
    endpoint: maskUrl(baseUrl),
    model,
    fallbackModel: fallbackModel || saved['fallback-model'] || null,
    timeout,
    maxTokens,
    enabled: saved.enabled !== false,
    health,
    savedConfig: saved,
    checkedAt: new Date().toISOString()
  }});
});

router.post('/test', async (req, res) => {
  const baseUrl = process.env.AI_API_URL || process.env.GAPGPT_URL || 'http://localhost:8000';
  const apiKey = process.env.AI_API_KEY || process.env.GAPGPT_API_KEY || '';
  const started = Date.now();
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const response = await axios.get(`${baseUrl.replace(/\/$/, '')}/health`, { headers, timeout: 5000 });
    return res.json({ success: true, data: { passed: true, latencyMs: Date.now() - started, status: response.status, model: process.env.GAPGPT_MODEL || process.env.AI_MODEL || 'gpt-4o-mini', message: 'اتصال سرویس AI با موفقیت بررسی شد.' } });
  } catch (error) {
    return res.json({ success: true, data: { passed: false, latencyMs: Date.now() - started, status: error?.response?.status || null, error: safeError(error), message: 'اتصال سرویس AI برقرار نشد.' } });
  }
});

module.exports = router;
