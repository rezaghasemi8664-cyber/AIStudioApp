'use strict';

const express = require('express');
const axios = require('axios');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware.cjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const PREF_KEY = 'portfolio_watchlists';
const brsBaseUrl = process.env.BRS_API_URL || process.env.BRS_BASE_URL || 'http://localhost:8080';
const brsApiKey = process.env.BRS_API_KEY || '';
const brsTimeout = parseInt(process.env.BRS_TIMEOUT, 10) || 15000;

function getUserId(req) {
  const id = Number(req.user && (req.user.id ?? req.user.userId));
  return Number.isInteger(id) && id > 0 ? id : null;
}
function normalizeSymbol(value) { return String(value || '').trim().toUpperCase(); }
function normalizeWatchlist(item) {
  if (!item || typeof item !== 'object') return null;
  const id = String(item.id || '').trim();
  const name = String(item.name || '').trim();
  if (!id || !name) return null;
  const symbols = Array.isArray(item.symbols) ? item.symbols.map(symbol => ({
    symbol: normalizeSymbol(symbol?.symbol),
    name: String(symbol?.name || symbol?.symbol || '').trim(),
  })).filter(symbol => symbol.symbol) : [];
  return { id, name, symbols, createdAt: item.createdAt, updatedAt: item.updatedAt };
}
async function readWatchlists(userId) {
  const row = await prisma.userPreference.findUnique({ where: { userId_key: { userId, key: PREF_KEY } } });
  if (!row?.value) return [];
  try {
    const parsed = JSON.parse(row.value);
    return Array.isArray(parsed) ? parsed.map(normalizeWatchlist).filter(Boolean) : [];
  } catch (_) { return []; }
}
async function writeWatchlists(userId, watchlists) {
  const value = JSON.stringify(watchlists);
  await prisma.userPreference.upsert({
    where: { userId_key: { userId, key: PREF_KEY } },
    create: { userId, key: PREF_KEY, value },
    update: { value },
  });
}
async function validateMarketSymbol(symbol) {
  const clean = normalizeSymbol(symbol);
  if (!clean) return null;
  try {
    const headers = { Accept: 'application/json' };
    if (brsApiKey) headers['X-API-Key'] = brsApiKey;
    const response = await axios.get(`${brsBaseUrl}/api/symbol/${encodeURIComponent(clean)}`, { headers, timeout: brsTimeout });
    const raw = response.data?.data ?? response.data ?? {};
    if (raw?.available === false) return null;
    const resolved = normalizeSymbol(raw?.symbol ?? raw?.l18 ?? raw?.lVal18AFC ?? raw?.ticker ?? clean);
    if (!resolved) return null;
    return { symbol: resolved, name: String(raw?.name ?? raw?.lVal30 ?? raw?.companyName ?? resolved).trim() || resolved };
  } catch (error) {
    console.error('[WATCHLIST] symbol validation failed:', error.message);
    return null;
  }
}

router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: 'کاربر احراز هویت نشده است.' });
    return res.json({ success: true, data: { watchlists: await readWatchlists(userId) } });
  } catch (error) {
    console.error('[WATCHLIST] GET failed:', error);
    return res.status(500).json({ success: false, message: 'خطا در دریافت دیده‌بان‌ها.' });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: 'کاربر احراز هویت نشده است.' });
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ success: false, message: 'نام دیده‌بان الزامی است.' });
    const watchlists = await readWatchlists(userId);
    if (watchlists.some(item => item.name.localeCompare(name, 'fa', { sensitivity: 'base' }) === 0)) return res.status(409).json({ success: false, message: 'دیده‌بانی با این نام قبلاً ایجاد شده است.' });
    const now = new Date().toISOString();
    const created = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name, symbols: [], createdAt: now, updatedAt: now };
    watchlists.push(created);
    await writeWatchlists(userId, watchlists);
    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    console.error('[WATCHLIST] POST failed:', error);
    return res.status(500).json({ success: false, message: 'خطا در ایجاد دیده‌بان.' });
  }
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: 'کاربر احراز هویت نشده است.' });
    const id = String(req.params.id);
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ success: false, message: 'نام دیده‌بان الزامی است.' });
    const watchlists = await readWatchlists(userId);
    const index = watchlists.findIndex(item => item.id === id);
    if (index < 0) return res.status(404).json({ success: false, message: 'دیده‌بان پیدا نشد.' });
    if (watchlists.some(item => item.id !== id && item.name.localeCompare(name, 'fa', { sensitivity: 'base' }) === 0)) return res.status(409).json({ success: false, message: 'دیده‌بانی با این نام قبلاً وجود دارد.' });
    watchlists[index] = { ...watchlists[index], name, updatedAt: new Date().toISOString() };
    await writeWatchlists(userId, watchlists);
    return res.json({ success: true, data: watchlists[index] });
  } catch (error) {
    console.error('[WATCHLIST] PUT failed:', error);
    return res.status(500).json({ success: false, message: 'خطا در ویرایش دیده‌بان.' });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: 'کاربر احراز هویت نشده است.' });
    const id = String(req.params.id);
    const watchlists = await readWatchlists(userId);
    const next = watchlists.filter(item => item.id !== id);
    if (next.length === watchlists.length) return res.status(404).json({ success: false, message: 'دیده‌بان پیدا نشد.' });
    await writeWatchlists(userId, next);
    return res.json({ success: true, data: { id } });
  } catch (error) {
    console.error('[WATCHLIST] DELETE failed:', error);
    return res.status(500).json({ success: false, message: 'خطا در حذف دیده‌بان.' });
  }
});

router.post('/:id/symbols', authMiddleware, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: 'کاربر احراز هویت نشده است.' });
    const id = String(req.params.id);
    const symbol = normalizeSymbol(req.body?.symbol);
    if (!symbol) return res.status(400).json({ success: false, message: 'نماد الزامی است.' });
    const watchlists = await readWatchlists(userId);
    const index = watchlists.findIndex(item => item.id === id);
    if (index < 0) return res.status(404).json({ success: false, message: 'دیده‌بان پیدا نشد.' });
    if (watchlists[index].symbols.some(item => item.symbol === symbol)) return res.status(409).json({ success: false, message: 'این نماد قبلاً در دیده‌بان وجود دارد.' });
    const marketSymbol = await validateMarketSymbol(symbol);
    if (!marketSymbol) return res.status(422).json({ success: false, message: `نماد «${symbol}» در بازار پیدا نشد.` });
    watchlists[index] = { ...watchlists[index], symbols: [...watchlists[index].symbols, marketSymbol], updatedAt: new Date().toISOString() };
    await writeWatchlists(userId, watchlists);
    return res.status(201).json({ success: true, data: watchlists[index] });
  } catch (error) {
    console.error('[WATCHLIST] ADD SYMBOL failed:', error);
    return res.status(500).json({ success: false, message: 'خطا در افزودن نماد به دیده‌بان.' });
  }
});

router.delete('/:id/symbols', authMiddleware, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: 'کاربر احراز هویت نشده است.' });
    const id = String(req.params.id);
    const symbols = Array.isArray(req.body?.symbols) ? req.body.symbols.map(normalizeSymbol).filter(Boolean) : [];
    if (!symbols.length) return res.status(400).json({ success: false, message: 'حداقل یک نماد برای حذف انتخاب کنید.' });
    const watchlists = await readWatchlists(userId);
    const index = watchlists.findIndex(item => item.id === id);
    if (index < 0) return res.status(404).json({ success: false, message: 'دیده‌بان پیدا نشد.' });
    const removeSet = new Set(symbols);
    watchlists[index] = { ...watchlists[index], symbols: watchlists[index].symbols.filter(item => !removeSet.has(item.symbol)), updatedAt: new Date().toISOString() };
    await writeWatchlists(userId, watchlists);
    return res.json({ success: true, data: watchlists[index] });
  } catch (error) {
    console.error('[WATCHLIST] DELETE SYMBOLS failed:', error);
    return res.status(500).json({ success: false, message: 'خطا در حذف نمادها از دیده‌بان.' });
  }
});

module.exports = router;
