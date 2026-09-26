'use strict';

const cron = require('node-cron');
const prisma = require('../config/prisma.cjs');
const brsService = require('../services/brs.service.cjs');

const MARKET_TZ = 'Asia/Tehran';
const SCALPING_THRESHOLD = 55;
const SCALPING_LIMIT = 30;

function tehranDateKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: MARKET_TZ, calendar: 'gregory' }).format(date);
}
function sqlDate(key) {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function num(v, fallback = null) {
  if (v === null || v === undefined || v === '') return fallback;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : fallback;
}
function int(v, fallback = null) {
  const n = num(v, fallback);
  return n === null ? fallback : Math.trunc(n);
}
function unwrap(response) {
  if (!response) return null;
  if (Array.isArray(response)) return response;
  if (response.data !== undefined) return unwrap(response.data);
  if (response.result !== undefined) return unwrap(response.result);
  return response;
}
function scoreSymbol(item) {
  const last = num(item.lastPrice, 0);
  const close = num(item.closingPrice, last);
  const yesterday = num(item.yesterday, close);
  const pct = yesterday > 0 ? ((last - yesterday) / yesterday) * 100 : num(item.lastChangePercent, 0);
  const volume = num(item.tradeVolume, 0);
  const realNet = num(item.realBuyVolume, 0) - num(item.realSellVolume, 0);
  const activity = Math.min(25, Math.log10(Math.max(volume, 1)) * 2.5);
  const momentum = Math.max(0, Math.min(35, 15 + pct * 4));
  const flow = Math.max(0, Math.min(40, 20 + (realNet / Math.max(volume, 1)) * 40));
  return { score: Math.round(Math.max(0, Math.min(100, activity + momentum + flow))), pct, last, close };
}

async function updateMarketCurrent() {
  const response = await brsService.getMarketIndex();
  const market = unwrap(response) || {};
  const marketDate = sqlDate(tehranDateKey());
  const open = market.isMarketOpen === true;

  await prisma.marketCurrent.upsert({
    where: { marketDate },
    create: {
      marketDate,
      marketStatus: open ? 'OPEN' : 'CLOSED',
      overallIndex: num(market.index),
      overallChange: num(market.indexChange ?? market.index_change),
      equalIndex: num(market.indexEqualWeight ?? market.index_equalWeight),
      equalChange: num(market.indexEqualWeightChange ?? market.index_equalWeight_change),
      totalTrades: int(market.tradeCount),
      totalVolume: int(market.tradeVolume),
      totalValue: num(market.tradeValue),
      updatedAt: new Date(),
      source: 'brs-central-worker',
      isStale: false,
      dataJson: JSON.stringify(market)
    },
    update: {
      marketStatus: open ? 'OPEN' : 'CLOSED',
      overallIndex: num(market.index),
      overallChange: num(market.indexChange ?? market.index_change),
      equalIndex: num(market.indexEqualWeight ?? market.index_equalWeight),
      equalChange: num(market.indexEqualWeightChange ?? market.index_equalWeight_change),
      totalTrades: int(market.tradeCount),
      totalVolume: int(market.tradeVolume),
      totalValue: num(market.tradeValue),
      updatedAt: new Date(),
      source: 'brs-central-worker',
      isStale: false,
      dataJson: JSON.stringify(market)
    }
  });
}

async function updateSymbolsAndMovers() {
  const response = await brsService.getAllSymbols();
  const rows = unwrap(response);
  if (!Array.isArray(rows) || !rows.length) throw new Error('BRS AllSymbols returned no symbols');

  const symbols = rows.map(item => ({
    symbol: String(item.symbol || '').trim(),
    name: item.name || null,
    insCode: String(item.isin || item.id || '').trim() || null,
    lastPrice: num(item.lastPrice),
    closePrice: num(item.closingPrice),
    change: num(item.lastChange),
    changePercent: num(item.lastChangePercent),
    volume: int(item.tradeVolume),
    value: num(item.tradeValue),
    tradeCount: int(item.tradeCount),
    sector: item.sector || null,
    realBuyVolume: int(item.realBuyVolume, 0),
    realSellVolume: int(item.realSellVolume, 0),
    legalBuyVolume: int(item.instBuyVolume, 0),
    legalSellVolume: int(item.instSellVolume, 0)
  })).filter(x => x.symbol);

  for (const item of symbols) {
    await prisma.marketSymbolCurrent.upsert({
      where: { symbol: item.symbol },
      create: { ...item, source: 'brs-central-worker', isStale: false, dataJson: JSON.stringify(item) },
      update: { ...item, updatedAt: new Date(), source: 'brs-central-worker', isStale: false, dataJson: JSON.stringify(item) }
    });
  }

  const gainers = symbols.filter(x => num(x.changePercent, 0) > 0).sort((a, b) => num(b.changePercent, 0) - num(a.changePercent, 0)).slice(0, 10);
  const losers = symbols.filter(x => num(x.changePercent, 0) < 0).sort((a, b) => num(a.changePercent, 0) - num(b.changePercent, 0)).slice(0, 10);
  const volumes = symbols.slice().sort((a, b) => num(b.volume, 0) - num(a.volume, 0)).slice(0, 10);

  for (const [category, rowsForCategory] of [['GAINERS', gainers], ['LOSERS', losers], ['VOLUME', volumes]]) {
    await prisma.marketMoverCurrent.deleteMany({ where: { category } });
    for (let i = 0; i < rowsForCategory.length; i += 1) {
      const row = rowsForCategory[i];
      await prisma.marketMoverCurrent.create({
        data: {
          category,
          symbol: row.symbol,
          price: row.lastPrice,
          changePercent: row.changePercent,
          volume: row.volume,
          value: row.value,
          rank: i + 1,
          updatedAt: new Date()
        }
      });
    }
  }

  return symbols;
}

async function updateScalpingOpportunities(symbols) {
  const marketDate = sqlDate(tehranDateKey());
  const candidates = symbols.map(item => ({ item, scored: scoreSymbol(item) }))
    .filter(x => x.scored.last > 0 && x.scored.score >= SCALPING_THRESHOLD)
    .sort((a, b) => b.scored.score - a.scored.score)
    .slice(0, SCALPING_LIMIT);

  await prisma.marketScalpingOpportunity.updateMany({
    where: { marketDate, status: 'ACTIVE' },
    data: { status: 'EXPIRED' }
  });

  for (const { item, scored } of candidates) {
    const entry = scored.last || scored.close;
    const strategyName = 'momentum-flow';
    await prisma.marketScalpingOpportunity.upsert({
      where: { symbol_marketDate_strategyName: { symbol: item.symbol, marketDate, strategyName } },
      create: {
        symbol: item.symbol,
        score: scored.score,
        signal: scored.score >= 70 ? 'BUY' : 'WATCH',
        entryPrice: entry,
        stopLoss: entry * 0.99,
        takeProfit: entry * 1.02,
        currentPrice: entry,
        confidence: scored.score,
        strategyName,
        recommendationText: scored.score >= 70 ? 'سیگنال بر پایه مومنتوم و جریان نقدینگی مشترک بازار.' : 'نماد در محدوده پایش اسکالپینگ قرار دارد.',
        marketDate,
        status: 'ACTIVE',
        meta: JSON.stringify({ pct: scored.pct, source: 'brs-central-worker' }),
        source: 'brs-central-worker'
      },
      update: {
        score: scored.score,
        signal: scored.score >= 70 ? 'BUY' : 'WATCH',
        currentPrice: entry,
        confidence: scored.score,
        status: 'ACTIVE',
        recommendationText: scored.score >= 70 ? 'سیگنال بر پایه مومنتوم و جریان نقدینگی مشترک بازار.' : 'نماد در محدوده پایش اسکالپینگ قرار دارد.',
        meta: JSON.stringify({ pct: scored.pct, source: 'brs-central-worker' }),
        source: 'brs-central-worker',
        updatedAt: new Date()
      }
    });
  }
}

async function runJob(name, fn) {
  try { await fn(); console.log('[MARKET WORKER] ' + name + ' completed'); return true; }
  catch (error) { console.error('[MARKET WORKER] ' + name + ' failed:', error.message); return false; }
}

async function runMarketWorker() {
  const status = await brsService.getMarketStatus().catch(() => ({ isOpen: false }));
  if (!status || status.isOpen !== true) return { status: 'skipped', reason: 'market-closed' };

  await runJob('market-current', updateMarketCurrent);
  const symbols = await updateSymbolsAndMovers();
  await runJob('scalping-opportunities', () => updateScalpingOpportunities(symbols));
  return { status: 'success', symbols: symbols.length };
}

function startMarketWorker() {
  if (process.env.MARKET_WORKER_ENABLED === 'false') return;
  const instance = process.env.NODE_APP_INSTANCE;
  if (instance !== undefined && instance !== '0') return;
  cron.schedule('*/1 * * * *', () => runMarketWorker());
  console.log('[MARKET WORKER] Central market worker started');
}

module.exports = { runMarketWorker, startMarketWorker, updateMarketCurrent, updateSymbolsAndMovers, updateScalpingOpportunities };
