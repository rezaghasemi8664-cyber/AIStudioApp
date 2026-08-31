'use strict';

const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware.cjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function getUserId(req) {
  const raw = req.user && (req.user.id ?? req.user.userId);
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizeItem(item) {
  if (!item || typeof item !== 'object') return null;
  const id = String(item.id ?? '');
  const symbol = String(item.symbol ?? '').trim().toUpperCase();
  const quantity = Number(item.quantity);
  const buyPrice = Number(item.buyPrice ?? item.entryPrice);
  const name = String(item.name ?? symbol).trim() || symbol;
  const entryDate = String(item.entryDate ?? item.purchaseDate ?? item.addedAt ?? '').trim();
  if (!id || !symbol || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(buyPrice) || buyPrice <= 0) return null;
  return { id, symbol, name, quantity, buyPrice, entryDate: entryDate || new Date().toISOString() };
}

async function readPortfolio(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { marketSummary: true } });
  let root = {};
  if (user && user.marketSummary) {
    try { root = JSON.parse(user.marketSummary); } catch (_) { root = {}; }
  }
  const raw = root && root.portfolio ? root.portfolio : (Array.isArray(root) ? { items: root } : root);
  return {
    root: root && typeof root === 'object' && !Array.isArray(root) ? root : {},
    portfolio: {
      items: Array.isArray(raw && raw.items) ? raw.items.map(normalizeItem).filter(Boolean) : [],
      totalValue: Number(raw && raw.totalValue) || 0,
    },
  };
}

async function writePortfolio(userId, state) {
  const root = state.root && typeof state.root === 'object' && !Array.isArray(state.root) ? state.root : {};
  root.portfolio = state.portfolio;
  await prisma.user.update({ where: { id: userId }, data: { marketSummary: JSON.stringify(root) } });
}

router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: 'کاربر احراز هویت نشده است.' });
    const state = await readPortfolio(userId);
    return res.json({ success: true, data: state.portfolio });
  } catch (error) {
    console.error('[PORTFOLIO] GET failed:', error);
    return res.status(500).json({ success: false, message: 'خطا در دریافت سبد سهام.', error: error.message });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: 'کاربر احراز هویت نشده است.' });
    const symbol = String(req.body?.symbol || '').trim().toUpperCase();
    const name = String(req.body?.name || symbol).trim() || symbol;
    const quantity = Number(req.body?.quantity);
    const buyPrice = Number(req.body?.buyPrice);
    const entryDate = String(req.body?.entryDate || '').trim();
    if (!symbol || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(buyPrice) || buyPrice <= 0 || !entryDate) {
      return res.status(400).json({ success: false, message: 'نماد، نام، تعداد، قیمت ورود و تاریخ خرید الزامی است.' });
    }
    const state = await readPortfolio(userId);
    const newItem = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, symbol, name, quantity, buyPrice, entryDate };
    state.portfolio.items.push(newItem);
    await writePortfolio(userId, state);
    return res.status(201).json({ success: true, data: newItem });
  } catch (error) {
    console.error('[PORTFOLIO] POST failed:', error);
    return res.status(500).json({ success: false, message: 'خطا در افزودن سهم به سبد.', error: error.message });
  }
});

router.get('/summary', authMiddleware, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: 'کاربر احراز هویت نشده است.' });
    const state = await readPortfolio(userId);
    const totalInvested = state.portfolio.items.reduce((sum, item) => sum + item.quantity * item.buyPrice, 0);
    return res.json({ success: true, data: { totalItems: state.portfolio.items.length, totalInvested, items: state.portfolio.items } });
  } catch (error) {
    console.error('[PORTFOLIO] SUMMARY failed:', error);
    return res.status(500).json({ success: false, message: 'خطا در دریافت خلاصه سبد.', error: error.message });
  }
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: 'کاربر احراز هویت نشده است.' });
    const itemId = String(req.params.id);
    const state = await readPortfolio(userId);
    const index = state.portfolio.items.findIndex(item => String(item.id) === itemId);
    if (index < 0) return res.status(404).json({ success: false, message: 'سهم موردنظر در سبد این کاربر یافت نشد.' });

    const current = state.portfolio.items[index];
    const next = {
      ...current,
      symbol: req.body?.symbol !== undefined ? String(req.body.symbol).trim().toUpperCase() : current.symbol,
      name: req.body?.name !== undefined ? String(req.body.name).trim() : current.name,
      quantity: req.body?.quantity !== undefined ? Number(req.body.quantity) : current.quantity,
      buyPrice: req.body?.buyPrice !== undefined ? Number(req.body.buyPrice) : current.buyPrice,
      entryDate: req.body?.entryDate !== undefined ? String(req.body.entryDate).trim() : current.entryDate,
    };
    if (!next.symbol || !next.name || !Number.isFinite(next.quantity) || next.quantity <= 0 || !Number.isFinite(next.buyPrice) || next.buyPrice <= 0 || !next.entryDate) {
      return res.status(400).json({ success: false, message: 'اطلاعات سهم نامعتبر است.' });
    }
    state.portfolio.items[index] = next;
    await writePortfolio(userId, state);
    return res.json({ success: true, data: next });
  } catch (error) {
    console.error('[PORTFOLIO] PUT failed:', error);
    return res.status(500).json({ success: false, message: 'خطا در ویرایش سهم.', error: error.message });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: 'کاربر احراز هویت نشده است.' });
    const itemId = String(req.params.id);
    const state = await readPortfolio(userId);
    const before = state.portfolio.items.length;
    state.portfolio.items = state.portfolio.items.filter(item => String(item.id) !== itemId);
    if (state.portfolio.items.length === before) return res.status(404).json({ success: false, message: 'سهم موردنظر در سبد این کاربر یافت نشد.' });
    await writePortfolio(userId, state);
    return res.json({ success: true, data: { id: itemId } });
  } catch (error) {
    console.error('[PORTFOLIO] DELETE failed:', error);
    return res.status(500).json({ success: false, message: 'خطا در حذف سهم.', error: error.message });
  }
});

module.exports = router;
