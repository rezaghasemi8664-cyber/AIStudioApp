'use strict';

const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware.cjs');
const prismaModule = require('../config/prisma.cjs');
const prisma = prismaModule.prisma || prismaModule;
const sharedMarketService = require('../services/sharedMarket.service.cjs');

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

async function enrichWithRealQuotes(items) {
  if (!items.length) return [];

  const symbols = Array.from(new Set(items.map(item => item.symbol).filter(Boolean)));
  const rows = await Promise.all(symbols.map(async symbol => {
    try {
      const data = await sharedMarketService.getSymbols({ symbol, limit: 1 });
      return [symbol, Array.isArray(data) && data.length ? data[0] : null];
    } catch (error) {
      console.error('[PORTFOLIO] Shared quote read failed for ' + symbol + ':', error.message);
      return [symbol, null];
    }
  }));

  const quoteMap = new Map(rows);
  return items.map(item => {
    const quote = quoteMap.get(item.symbol);
    const currentPrice = quote ? Number(quote.lastPrice ?? quote.closePrice) : null;
    const hasPrice = Number.isFinite(currentPrice) && currentPrice > 0;
    const stale = !quote || quote.isStale === true;
    const dataStatus = !hasPrice ? 'UNAVAILABLE' : (stale ? 'CACHED' : 'LIVE');

    return {
      ...item,
      currentPrice: hasPrice ? currentPrice : null,
      dataStatus,
      source: quote ? (quote.source || 'shared-db') : null,
      fetchedAt: quote ? (quote.updatedAt || null) : null,
      stale
    };
  });
}

function normalizeSoldTrade(trade) {
  if (!trade || typeof trade !== 'object') return null;
  const id = String(trade.id ?? '');
  const symbol = String(trade.symbol ?? '').trim().toUpperCase();
  const name = String(trade.name ?? symbol).trim() || symbol;
  const soldQuantity = Number(trade.soldQuantity);
  const sellPrice = Number(trade.sellPrice);
  const sellDate = String(trade.sellDate ?? '').trim();
  const allocations = Array.isArray(trade.allocations) ? trade.allocations.map(a => ({
    lotId: String(a.lotId ?? ''),
    quantity: Number(a.quantity),
    buyPrice: Number(a.buyPrice),
    buyDate: String(a.buyDate ?? '').trim(),
    costBasis: Number(a.costBasis),
    holdingDays: Number.isFinite(Number(a.holdingDays)) ? Number(a.holdingDays) : null,
  })).filter(a => a.lotId && Number.isFinite(a.quantity) && a.quantity > 0) : [];
  const proceeds = Number(trade.proceeds ?? soldQuantity * sellPrice);
  const costBasis = Number(trade.costBasis ?? allocations.reduce((sum, a) => sum + a.costBasis, 0));
  const realizedPnl = Number(trade.realizedPnl ?? proceeds - costBasis);
  const realizedPnlPercent = Number(trade.realizedPnlPercent ?? (costBasis > 0 ? (realizedPnl / costBasis) * 100 : 0));
  if (!id || !symbol || !Number.isFinite(soldQuantity) || soldQuantity <= 0 || !Number.isFinite(sellPrice) || sellPrice <= 0 || !sellDate) return null;
  return { id, symbol, name, soldQuantity, sellPrice, sellDate, allocationMethod: String(trade.allocationMethod || 'MANUAL'), allocations, proceeds, costBasis, realizedPnl, realizedPnlPercent, createdAt: String(trade.createdAt || new Date().toISOString()) };
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
      soldTrades: Array.isArray(raw && raw.soldTrades) ? raw.soldTrades.map(normalizeSoldTrade).filter(Boolean) : [],
    },
  };
}

async function writePortfolio(userId, state) {
  const root = state.root && typeof state.root === 'object' && !Array.isArray(state.root) ? state.root : {};
  root.portfolio = state.portfolio;
  await prisma.user.update({ where: { id: userId }, data: { marketSummary: JSON.stringify(root) } });
}

router.get('/quotes', authMiddleware, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: 'کاربر احراز هویت نشده است.' });
    const state = await readPortfolio(userId);
    const items = await enrichWithRealQuotes(state.portfolio.items);
    const quoted = items.filter(item => Number.isFinite(item.currentPrice) && item.currentPrice > 0);
    const currentValue = quoted.reduce((sum, item) => sum + item.currentPrice * item.quantity, 0);
    const costBasis = quoted.reduce((sum, item) => sum + item.buyPrice * item.quantity, 0);
    return res.json({
      success: true,
      data: {
        items,
        currentValue,
        costBasis,
        unrealizedPnl: currentValue - costBasis,
        dataStatus: items.some(item => item.dataStatus === 'LIVE') ? 'LIVE' : (items.some(item => item.dataStatus === 'CACHED') ? 'CACHED' : 'UNAVAILABLE')
      }
    });
  } catch (error) {
    console.error('[PORTFOLIO] QUOTES failed:', error);
    return res.status(500).json({ success: false, message: 'به‌روزرسانی قیمت‌های سبد ناموفق بود.', error: error.message });
  }
});

router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: 'کاربر احراز هویت نشده است.' });
    const state = await readPortfolio(userId);
    // DB is the authoritative first response. Shared MarketSymbolCurrent quotes are refreshed by /quotes.
    const items = state.portfolio.items.map(item => ({
      ...item,
      currentPrice: null,
      dataStatus: 'UNAVAILABLE',
      source: null,
      fetchedAt: null,
      stale: true
    }));
    const costBasis = items.reduce((sum, item) => sum + item.buyPrice * item.quantity, 0);
    return res.json({
      success: true,
      data: {
        ...state.portfolio,
        items,
        currentValue: 0,
        costBasis,
        unrealizedPnl: 0,
        dataStatus: 'UNAVAILABLE'
      }
    });
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
    const items = await enrichWithRealQuotes(state.portfolio.items);
    const quoted = items.filter(item => Number.isFinite(item.currentPrice) && item.currentPrice > 0);
    const totalInvested = state.portfolio.items.reduce((sum, item) => sum + item.quantity * item.buyPrice, 0);
    const currentValue = quoted.reduce((sum, item) => sum + item.currentPrice * item.quantity, 0);
    const quotedCostBasis = quoted.reduce((sum, item) => sum + item.quantity * item.buyPrice, 0);
    const unrealizedPnl = currentValue - quotedCostBasis;
    const realizedPnl = state.portfolio.soldTrades.reduce((sum, trade) => sum + trade.realizedPnl, 0);
    const dataStatus = items.some(item => item.dataStatus === 'LIVE') ? 'LIVE' : (items.some(item => item.dataStatus === 'CACHED') ? 'CACHED' : 'UNAVAILABLE');
    return res.json({ success: true, data: { totalItems: items.length, totalInvested, currentValue, unrealizedPnl, realizedPnl, dataStatus, soldTrades: state.portfolio.soldTrades, items } });
  } catch (error) {
    console.error('[PORTFOLIO] SUMMARY failed:', error);
    return res.status(500).json({ success: false, message: 'خطا در دریافت خلاصه سبد.', error: error.message });
  }
});

router.get('/trades', authMiddleware, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: 'کاربر احراز هویت نشده است.' });
    const state = await readPortfolio(userId);
    const realizedPnl = state.portfolio.soldTrades.reduce((sum, trade) => sum + trade.realizedPnl, 0);
    const proceeds = state.portfolio.soldTrades.reduce((sum, trade) => sum + trade.proceeds, 0);
    const costBasis = state.portfolio.soldTrades.reduce((sum, trade) => sum + trade.costBasis, 0);
    return res.json({ success: true, data: { trades: state.portfolio.soldTrades, realizedPnl, proceeds, costBasis } });
  } catch (error) {
    console.error('[PORTFOLIO] TRADES GET failed:', error);
    return res.status(500).json({ success: false, message: 'خطا در دریافت معاملات فروخته‌شده.', error: error.message });
  }
});

router.post('/sales', authMiddleware, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: 'کاربر احراز هویت نشده است.' });
    const symbol = String(req.body?.symbol || '').trim().toUpperCase();
    const name = String(req.body?.name || symbol).trim() || symbol;
    const soldQuantity = Number(req.body?.soldQuantity);
    const sellPrice = Number(req.body?.sellPrice);
    const sellDate = String(req.body?.sellDate || '').trim();
    const allocationMethod = String(req.body?.allocationMethod || 'MANUAL').toUpperCase();
    const requestedAllocations = Array.isArray(req.body?.allocations) ? req.body.allocations : [];
    if (!symbol || !Number.isFinite(soldQuantity) || soldQuantity <= 0 || !Number.isFinite(sellPrice) || sellPrice <= 0 || !sellDate) {
      return res.status(400).json({ success: false, message: 'نماد، تعداد فروش، قیمت فروش و تاریخ فروش الزامی است.' });
    }
    if (allocationMethod !== 'MANUAL') return res.status(400).json({ success: false, message: 'در این نسخه تخصیص دستی Lot فعال است.' });
    const state = await readPortfolio(userId);
    const allocations = [];
    let remaining = soldQuantity;
    for (const request of requestedAllocations) {
      if (remaining <= 0) break;
      const lotId = String(request?.lotId || '');
      const requestedQty = Number(request?.quantity);
      const lot = state.portfolio.items.find(item => String(item.id) === lotId && item.symbol === symbol);
      if (!lot || !Number.isFinite(requestedQty) || requestedQty <= 0) return res.status(400).json({ success: false, message: `Lot نامعتبر برای نماد ${symbol}.` });
      const qty = Math.min(requestedQty, remaining);
      if (qty > lot.quantity) return res.status(400).json({ success: false, message: `تعداد انتخاب‌شده از Lot ${lot.id} بیشتر از موجودی آن است.` });
      allocations.push({ lotId: lot.id, quantity: qty, buyPrice: lot.buyPrice, buyDate: lot.entryDate, costBasis: qty * lot.buyPrice, holdingDays: null });
      remaining -= qty;
    }
    if (remaining > 0.000001) return res.status(400).json({ success: false, message: 'تعداد تخصیص‌یافته به Lotها با تعداد فروش برابر نیست.' });

    for (const allocation of allocations) {
      const index = state.portfolio.items.findIndex(item => String(item.id) === allocation.lotId);
      if (index < 0) continue;
      const nextQuantity = state.portfolio.items[index].quantity - allocation.quantity;
      if (nextQuantity <= 0.000001) state.portfolio.items.splice(index, 1);
      else state.portfolio.items[index] = { ...state.portfolio.items[index], quantity: nextQuantity };
    }

    const proceeds = soldQuantity * sellPrice;
    const costBasis = allocations.reduce((sum, allocation) => sum + allocation.costBasis, 0);
    const realizedPnl = proceeds - costBasis;
    const realizedPnlPercent = costBasis > 0 ? (realizedPnl / costBasis) * 100 : 0;
    const trade = normalizeSoldTrade({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      symbol, name, soldQuantity, sellPrice, sellDate, allocationMethod,
      allocations, proceeds, costBasis, realizedPnl, realizedPnlPercent, createdAt: new Date().toISOString(),
    });
    state.portfolio.soldTrades.unshift(trade);
    await writePortfolio(userId, state);
    return res.status(201).json({ success: true, data: trade, portfolio: state.portfolio });
  } catch (error) {
    console.error('[PORTFOLIO] SALE POST failed:', error);
    return res.status(500).json({ success: false, message: 'ثبت فروش سهم ناموفق بود.', error: error.message });
  }
});

router.delete('/sales/:id', authMiddleware, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: 'کاربر احراز هویت نشده است.' });
    const tradeId = String(req.params.id);
    const state = await readPortfolio(userId);
    const index = state.portfolio.soldTrades.findIndex(trade => String(trade.id) === tradeId);
    if (index < 0) return res.status(404).json({ success: false, message: 'معامله فروش موردنظر یافت نشد.' });
    const trade = state.portfolio.soldTrades[index];
    for (const allocation of trade.allocations) {
      const existing = state.portfolio.items.find(item => String(item.id) === String(allocation.lotId));
      if (existing) existing.quantity += allocation.quantity;
      else state.portfolio.items.push({ id: String(allocation.lotId), symbol: trade.symbol, name: trade.name, quantity: allocation.quantity, buyPrice: allocation.buyPrice, entryDate: allocation.buyDate });
    }
    state.portfolio.soldTrades.splice(index, 1);
    await writePortfolio(userId, state);
    return res.json({ success: true, data: { id: tradeId }, portfolio: state.portfolio });
  } catch (error) {
    console.error('[PORTFOLIO] SALE DELETE failed:', error);
    return res.status(500).json({ success: false, message: 'حذف معامله فروش ناموفق بود.', error: error.message });
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
