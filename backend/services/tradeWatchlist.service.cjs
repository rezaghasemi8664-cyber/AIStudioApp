'use strict';

const prismaModule = require('../config/prisma.cjs');
const prisma = prismaModule.prisma || prismaModule;
const snapshotService = require('./allSymbolsSnapshot.service.cjs');

const LIST_TYPES = new Set(['scalping', 'valuable']);
const EMPTY_WATCHLISTS = () => ({ scalping: [], valuable: [] });

function getUserId(req) {
  const raw = req.user && (req.user.id ?? req.user.userId);
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}
function normalizeDigits(value) {
  return String(value ?? '').replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}
function normalizeSymbol(value) {
  return String(value || '').normalize('NFKC').replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/[\u200c\u200f\u200e\s]/g, '').trim().toLocaleUpperCase('fa-IR');
}
function normalizePrice(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(normalizeDigits(value).replace(/,/g, ''));
  return Number.isFinite(number) && number > 0 ? number : null;
}
function parseRoot(value) {
  if (!value) return {};
  try {
    const root = JSON.parse(value);
    return root && typeof root === 'object' && !Array.isArray(root) ? root : {};
  } catch (_) {
    return {};
  }
}
function normalizeItem(item) {
  if (!item || typeof item !== 'object') return null;
  const symbol = String(item.symbol || '').trim().toUpperCase();
  const quantity = Number(item.quantity);
  const entryPrice = Number(item.entryPrice);
  if (!item.id || !symbol || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(entryPrice) || entryPrice <= 0) return null;
  return {
    id: String(item.id), listType: item.listType === 'valuable' ? 'valuable' : 'scalping',
    symbol, name: String(item.name || symbol), entryDate: String(item.entryDate || ''),
    quantity, entryPrice, targetPrice: normalizePrice(item.targetPrice), stopLoss: normalizePrice(item.stopLoss),
    targetAlertEnabled: item.targetAlertEnabled !== false, stopLossAlertEnabled: item.stopLossAlertEnabled !== false,
    targetAlertTriggered: item.targetAlertTriggered === true, stopLossAlertTriggered: item.stopLossAlertTriggered === true,
  };
}
async function readUser(userId) {
  return prisma.user.findUnique({ where: { id: userId }, select: { marketSummary: true } });
}
async function readState(userId) {
  const user = await readUser(userId);
  if (!user) return null;
  const root = parseRoot(user.marketSummary);
  const raw = root.tradeWatchlists && typeof root.tradeWatchlists === 'object' ? root.tradeWatchlists : {};
  const lists = {
    scalping: Array.isArray(raw.scalping) ? raw.scalping.map(normalizeItem).filter(Boolean) : [],
    valuable: Array.isArray(raw.valuable) ? raw.valuable.map(normalizeItem).filter(Boolean) : [],
  };
  return { root, lists };
}
async function writeState(userId, state) {
  state.root.tradeWatchlists = state.lists;
  await prisma.user.update({ where: { id: userId }, data: { marketSummary: JSON.stringify(state.root) } });
}
function buildQuoteMap(snapshot) {
  const map = new Map();
  if (snapshot?.status !== 'FOUND' || !Array.isArray(snapshot.symbols)) return map;
  for (const row of snapshot.symbols) {
    const key = normalizeSymbol(row.symbol);
    const price = normalizePrice(row.lastPrice ?? row.lastTradedPrice);
    if (key && price && !map.has(key)) map.set(key, { price, name: String(row.name || row.symbol || '') });
  }
  return map;
}
function enrichItem(item, quoteMap, snapshot) {
  const quote = quoteMap.get(normalizeSymbol(item.symbol));
  const currentPrice = quote?.price ?? null;
  const pnl = currentPrice === null ? null : (currentPrice - item.entryPrice) * item.quantity;
  const cost = item.entryPrice * item.quantity;
  return {
    ...item, name: item.name || quote?.name || item.symbol, currentPrice,
    pnl, pnlPercent: pnl === null || cost <= 0 ? null : (pnl / cost) * 100,
    snapshotUpdatedAt: snapshot?.snapshotUpdatedAt || null,
    quoteAvailable: currentPrice !== null,
  };
}
async function getWatchlist(userId, listType) {
  if (!LIST_TYPES.has(listType)) throw Object.assign(new Error('نوع سبد نامعتبر است.'), { statusCode: 400 });
  const state = await readState(userId);
  if (!state) throw Object.assign(new Error('کاربر یافت نشد.'), { statusCode: 404 });
  let snapshot = null;
  try { snapshot = await snapshotService.getSnapshot(); } catch (error) { console.error('[TRADE-WATCHLIST] Snapshot read failed:', error.message); }
  const quoteMap = buildQuoteMap(snapshot);
  return { items: state.lists[listType].map(item => enrichItem(item, quoteMap, snapshot)), snapshotUpdatedAt: snapshot?.snapshotUpdatedAt || null, snapshotAvailable: snapshot?.status === 'FOUND' };
}
async function addWatchlistItem(userId, listType, input) {
  if (!LIST_TYPES.has(listType)) throw Object.assign(new Error('نوع سبد نامعتبر است.'), { statusCode: 400 });
  const symbol = String(input?.symbol || '').trim().toUpperCase();
  const name = String(input?.name || symbol).trim() || symbol;
  const entryDate = normalizeDigits(input?.entryDate).trim();
  const quantity = Number(normalizeDigits(input?.quantity));
  const entryPrice = normalizePrice(input?.entryPrice);
  const targetPrice = normalizePrice(input?.targetPrice);
  const stopLoss = normalizePrice(input?.stopLoss);
  if (!symbol || !/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(entryDate) || !Number.isFinite(quantity) || quantity <= 0 || !entryPrice) {
    throw Object.assign(new Error('نماد، تاریخ ورود شمسی، تعداد سهم و قیمت ورود الزامی و باید معتبر باشند.'), { statusCode: 400 });
  }
  if (input?.targetPrice !== '' && input?.targetPrice != null && !targetPrice) throw Object.assign(new Error('هدف قیمتی باید عددی بزرگ‌تر از صفر باشد.'), { statusCode: 400 });
  if (input?.stopLoss !== '' && input?.stopLoss != null && !stopLoss) throw Object.assign(new Error('حد ضرر باید عددی بزرگ‌تر از صفر باشد.'), { statusCode: 400 });
  const state = await readState(userId);
  if (!state) throw Object.assign(new Error('کاربر یافت نشد.'), { statusCode: 404 });
  const item = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, listType, symbol, name, entryDate,
    quantity, entryPrice, targetPrice, stopLoss,
    targetAlertEnabled: input?.targetAlertEnabled !== false,
    stopLossAlertEnabled: input?.stopLossAlertEnabled !== false,
    targetAlertTriggered: false, stopLossAlertTriggered: false,
  };
  state.lists[listType].push(item);
  await writeState(userId, state);
  return item;
}
async function deleteWatchlistItem(userId, listType, itemId) {
  if (!LIST_TYPES.has(listType)) throw Object.assign(new Error('نوع سبد نامعتبر است.'), { statusCode: 400 });
  const state = await readState(userId);
  if (!state) throw Object.assign(new Error('کاربر یافت نشد.'), { statusCode: 404 });
  const before = state.lists[listType].length;
  state.lists[listType] = state.lists[listType].filter(item => item.id !== String(itemId));
  if (state.lists[listType].length === before) throw Object.assign(new Error('نماد موردنظر در این سبد یافت نشد.'), { statusCode: 404 });
  await writeState(userId, state);
}
async function checkAlerts() {
  const snapshot = await snapshotService.getSnapshot();
  if (snapshot?.status !== 'FOUND') return { usersChecked: 0, alertsCreated: 0 };
  const quoteMap = buildQuoteMap(snapshot);
  const users = await prisma.user.findMany({ where: { marketSummary: { not: null } }, select: { id: true, marketSummary: true } });
  let alertsCreated = 0;
  for (const user of users) {
    const root = parseRoot(user.marketSummary);
    const raw = root.tradeWatchlists;
    if (!raw || typeof raw !== 'object') continue;
    let changed = false;
    for (const listType of LIST_TYPES) {
      if (!Array.isArray(raw[listType])) continue;
      for (const item of raw[listType]) {
        const symbol = String(item?.symbol || '').trim();
        const quote = quoteMap.get(normalizeSymbol(symbol));
        if (!quote) continue;
        const target = normalizePrice(item.targetPrice);
        const stop = normalizePrice(item.stopLoss);
        if (item.targetAlertEnabled !== false && target && quote.price >= target && item.targetAlertTriggered !== true) {
          await prisma.notification.create({ data: { userId: user.id, title: `هشدار هدف قیمتی: ${symbol}`, message: `قیمت فعلی نماد ${symbol} به ${quote.price.toLocaleString('fa-IR')} رسیده و به هدف قیمتی ${target.toLocaleString('fa-IR')} رسیده یا از آن عبور کرده است.`, type: 'price-alert' } });
          item.targetAlertTriggered = true;
          alertsCreated += 1;
          changed = true;
        }
        if (item.stopLossAlertEnabled !== false && stop && quote.price <= stop && item.stopLossAlertTriggered !== true) {
          await prisma.notification.create({ data: { userId: user.id, title: `هشدار حد ضرر: ${symbol}`, message: `قیمت فعلی نماد ${symbol} به ${quote.price.toLocaleString('fa-IR')} رسیده و به حد ضرر ${stop.toLocaleString('fa-IR')} رسیده یا پایین‌تر آمده است.`, type: 'price-alert' } });
          item.stopLossAlertTriggered = true;
          alertsCreated += 1;
          changed = true;
        }
      }
    }
    if (changed) {
      await prisma.user.update({ where: { id: user.id }, data: { marketSummary: JSON.stringify(root) } });
    }
  }
  return { usersChecked: users.length, alertsCreated };
}
module.exports = { getUserId, getWatchlist, addWatchlistItem, deleteWatchlistItem, checkAlerts };
