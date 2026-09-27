'use strict';

const cron = require('node-cron');
const prisma = require('../config/prisma.cjs');
const brsService = require('../services/brs.service.cjs');

const MARKET_TZ = 'Asia/Tehran';
// Stricter real-market filters: prefer fewer, higher-conviction opportunities.
const SCALPING_THRESHOLD = 55;
const SCALPING_LIMIT = 20;
const SCALPING_MIN_CHANGE_PCT = 0.7;
const SCALPING_MIN_VALUE = 200000000;
const SCALPING_MIN_TRADES = 50;
const SCALPING_MIN_REAL_FLOW_RATIO = 0.10;
const SCALPING_MIN_POSITION = 0.65;
const SCALPING_MAX_POSITION = 0.35;
const SCALPING_MIN_RANGE_PCT = 0.8;
const SCALPING_MIN_REAL_PARTICIPATION = 0.15;

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
  const close = num(item.closePrice, last);
  const yesterday = num(item.yesterday, close);
  const open = num(item.open, last);
  const high = num(item.high, Math.max(last, open));
  const low = num(item.low, Math.min(last, open));
  const pct = yesterday > 0 ? ((last - yesterday) / yesterday) * 100 : num(item.changePercent, 0);
  const volume = Math.max(0, num(item.volume, 0));
  const value = Math.max(0, num(item.value, 0));
  const trades = Math.max(0, num(item.tradeCount, 0));
  const realBuy = Math.max(0, num(item.realBuyVolume, 0));
  const realSell = Math.max(0, num(item.realSellVolume, 0));
  const realTotal = realBuy + realSell;
  const realNetRatio = realTotal > 0 ? (realBuy - realSell) / realTotal : 0;
  const realParticipation = volume > 0 ? realTotal / volume : 0;
  const range = Math.max(0, high - low);
  const rangePct = yesterday > 0 ? (range / yesterday) * 100 : 0;
  const position = range > 0 ? Math.max(0, Math.min(1, (last - low) / range)) : 0.5;
  const dataQuality =
    last > 0 && close > 0 && yesterday > 0 && open > 0 && high >= low &&
    last >= low && last <= high && close >= low && close <= high;

  // All components are derived from the current BRS market snapshot.
  // No synthetic/history-free prices are introduced.
  const liquidity = Math.min(20, Math.max(0, (Math.log10(Math.max(value, 1)) - 7) * 5));
  const activity = Math.min(15, Math.max(0, Math.log10(trades + 1) * 3));
  const momentum = Math.min(30, Math.max(0, Math.abs(pct) * 5));
  const flow = Math.min(20, Math.max(0, Math.abs(realNetRatio) * 20));
  const rangePosition = Math.min(15, Math.abs(position - 0.5) * 30);

  const directionalAgreement =
    ((pct > 0 && realNetRatio > 0 && position >= 0.55) ||
     (pct < 0 && realNetRatio < 0 && position <= 0.45)) ? 10 : 0;

  const score = Math.round(Math.max(0, Math.min(100,
    liquidity + activity + momentum + flow + rangePosition + directionalAgreement
  )));

  const bullish =
    dataQuality &&
    pct >= SCALPING_MIN_CHANGE_PCT &&
    realNetRatio >= SCALPING_MIN_REAL_FLOW_RATIO &&
    realParticipation >= SCALPING_MIN_REAL_PARTICIPATION &&
    position >= SCALPING_MIN_POSITION &&
    last >= open &&
    last >= close;
  const bearish =
    dataQuality &&
    pct <= -SCALPING_MIN_CHANGE_PCT &&
    realNetRatio <= -SCALPING_MIN_REAL_FLOW_RATIO &&
    realParticipation >= SCALPING_MIN_REAL_PARTICIPATION &&
    position <= SCALPING_MAX_POSITION &&
    last <= open &&
    last <= close;

  const signal = bullish ? 'BUY' : bearish ? 'SELL' : 'WATCH';

  return {
    score,
    signal,
    pct,
    last,
    close,
    open,
    high,
    low,
    position,
    realNetRatio,
    value,
    volume,
    trades,
    realParticipation,
    rangePct,
    dataQuality
  };
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
    open: num(item.open ?? item.openPrice),
    high: num(item.high ?? item.highPrice),
    low: num(item.low ?? item.lowPrice),
    lastPrice: num(item.lastPrice),
    closePrice: num(item.closingPrice),
    change: num(item.lastChange),
    changePercent: num(item.lastChangePercent),
    volume: int(item.tradeVolume),
    value: num(item.tradeValue),
    tradeCount: int(item.tradeCount),
    yesterday: num(item.yesterday ?? item.previousPrice ?? item.yesterdayPrice),
    sector: item.sector || null,
    realBuyVolume: int(item.realBuyVolume, 0),
    realSellVolume: int(item.realSellVolume, 0),
    legalBuyVolume: int(item.instBuyVolume, 0),
    legalSellVolume: int(item.instSellVolume, 0)
  })).filter(x => x.symbol);

  for (const item of symbols) {
    const { open, high, low, yesterday, ...dbItem } = item;
    await prisma.marketSymbolCurrent.upsert({
      where: { symbol: item.symbol },
      create: { ...dbItem, source: 'brs-central-worker', isStale: false, dataJson: JSON.stringify(item) },
      update: { ...dbItem, updatedAt: new Date(), source: 'brs-central-worker', isStale: false, dataJson: JSON.stringify(item) }
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

async function updateMarketDaily(symbols) {
  const marketDate = sqlDate(tehranDateKey());
  let written = 0;
  for (const item of symbols) {
    const open = num(item.open);
    const high = num(item.high);
    const low = num(item.low);
    const close = num(item.closePrice ?? item.lastPrice);
    if (![open, high, low, close].every(Number.isFinite)) continue;
    await prisma.marketDaily.upsert({
      where: { symbol_date: { symbol: item.symbol, date: marketDate } },
      create: {
        symbol: item.symbol,
        date: marketDate,
        open,
        high,
        low,
        close,
        volume: BigInt(Math.max(0, int(item.volume, 0))),
        value: BigInt(Math.max(0, Math.trunc(num(item.value, 0)))),
        trades: Math.max(0, int(item.tradeCount, 0))
      },
      update: {
        open,
        high,
        low,
        close,
        volume: BigInt(Math.max(0, int(item.volume, 0))),
        value: BigInt(Math.max(0, Math.trunc(num(item.value, 0)))),
        trades: Math.max(0, int(item.tradeCount, 0))
      }
    });
    written += 1;
  }
  return written;
}

async function updateIndustries(symbols) {
  const groups = new Map();
  for (const item of symbols) {
    const name = String(item.sector || '').trim();
    if (!name) continue;
    const current = groups.get(name) || { industryName: name, symbolCount: 0, value: 0, changeSum: 0, changeCount: 0 };
    current.symbolCount += 1;
    current.value += num(item.value, 0);
    const change = num(item.changePercent);
    if (change !== null) { current.changeSum += change; current.changeCount += 1; }
    groups.set(name, current);
  }
  const rows = Array.from(groups.values()).map(x => ({
    industryName: x.industryName,
    symbolCount: x.symbolCount,
    value: x.value,
    changePercent: x.changeCount ? x.changeSum / x.changeCount : 0
  })).sort((a, b) => b.value - a.value);
  await prisma.marketIndustryCurrent.deleteMany({});
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    await prisma.marketIndustryCurrent.create({
      data: {
        industryName: row.industryName,
        symbolCount: row.symbolCount,
        value: row.value,
        changePercent: row.changePercent,
        rank: i + 1,
        updatedAt: new Date(),
        source: 'brs-central-worker',
        isStale: false
      }
    });
  }
  return rows.length;
}

async function updateScalpingOpportunities(symbols, marketIsOpen = true) {
  const marketDate = sqlDate(tehranDateKey());

  // Never create fresh intraday signals while the exchange is closed.
  // Existing signals are expired so the UI cannot present stale opportunities.
  if (!marketIsOpen) {
    await prisma.marketScalpingOpportunity.updateMany({
      where: { marketDate, status: 'ACTIVE' },
      data: { status: 'EXPIRED', updatedAt: new Date() }
    });
    return 0;
  }

  const scoredSymbols = symbols.map(item => ({ item, scored: scoreSymbol(item) }));
  const validPrice = scoredSymbols.filter(({ scored }) => scored.last > 0);
  const liquid = validPrice.filter(({ scored }) => scored.value >= SCALPING_MIN_VALUE);
  const moving = liquid.filter(({ scored }) =>
    scored.dataQuality &&
    Math.abs(scored.pct) >= SCALPING_MIN_CHANGE_PCT &&
    scored.trades >= SCALPING_MIN_TRADES &&
    Math.abs(scored.realNetRatio) >= SCALPING_MIN_REAL_FLOW_RATIO &&
    scored.realParticipation >= SCALPING_MIN_REAL_PARTICIPATION &&
    scored.rangePct >= SCALPING_MIN_RANGE_PCT
  );
  const threshold = moving.filter(({ scored }) => scored.score >= SCALPING_THRESHOLD);
  const directional = threshold.filter(({ scored }) =>
    (scored.signal === 'BUY' && scored.realNetRatio >= SCALPING_MIN_REAL_FLOW_RATIO && scored.position >= SCALPING_MIN_POSITION) ||
    (scored.signal === 'SELL' && scored.realNetRatio <= -SCALPING_MIN_REAL_FLOW_RATIO && scored.position <= SCALPING_MAX_POSITION)
  );

  const candidates = directional
    .sort((a, b) => b.scored.score - a.scored.score)
    .slice(0, SCALPING_LIMIT);

  const diagnosticTop = scoredSymbols
    .filter(({ scored }) => scored.last > 0 && scored.value >= SCALPING_MIN_VALUE)
    .sort((a, b) => b.scored.score - a.scored.score)
    .slice(0, 10)
    .map(({ item, scored }) => ({
      symbol: item.symbol,
      score: scored.score,
      signal: scored.signal,
      pct: Number(scored.pct.toFixed(2)),
      value: Math.trunc(scored.value),
      position: Number(scored.position.toFixed(2)),
      realNetRatio: Number(scored.realNetRatio.toFixed(3)),
      realParticipation: Number(scored.realParticipation.toFixed(3)),
      rangePct: Number(scored.rangePct.toFixed(2))
    }));

  console.log('[SCALPING DIAGNOSTIC]', JSON.stringify({
    total: symbols.length,
    validPrice: validPrice.length,
    liquid: liquid.length,
    moving: moving.length,
    threshold: threshold.length,
    directional: directional.length,
    candidates: candidates.length,
    thresholdValue: SCALPING_THRESHOLD,
    minChangePct: SCALPING_MIN_CHANGE_PCT,
    minValue: SCALPING_MIN_VALUE,
    minTrades: SCALPING_MIN_TRADES,
    minRealFlowRatio: SCALPING_MIN_REAL_FLOW_RATIO,
    minPosition: SCALPING_MIN_POSITION,
    maxPosition: SCALPING_MAX_POSITION,
    minRangePct: SCALPING_MIN_RANGE_PCT,
    minRealParticipation: SCALPING_MIN_REAL_PARTICIPATION,
    top: diagnosticTop
  }));

  await prisma.marketScalpingOpportunity.updateMany({
    where: { marketDate, status: 'ACTIVE' },
    data: { status: 'EXPIRED' }
  });

  for (const { item, scored } of candidates) {
    const entry = scored.last;
    const isBuy = scored.signal === 'BUY';
    const strategyName = 'momentum-flow-v2';
    const stopLoss = isBuy ? entry * 0.99 : entry * 1.01;
    const takeProfit = isBuy ? entry * 1.02 : entry * 0.98;
    const recommendationText = isBuy
      ? 'مومنتوم مثبت، موقعیت قیمت و جریان خرید حقیقی هم‌جهت هستند.'
      : 'مومنتوم منفی، موقعیت قیمت و جریان فروش حقیقی هم‌جهت هستند.';

    const meta = {
      pct: scored.pct,
      position: scored.position,
      realNetRatio: scored.realNetRatio,
      liquidity: scored.value,
      volume: scored.volume,
      trades: scored.trades,
      source: 'brs-central-worker'
    };

    await prisma.marketScalpingOpportunity.upsert({
      where: {
        symbol_marketDate_strategyName: {
          symbol: item.symbol,
          marketDate,
          strategyName
        }
      },
      create: {
        symbol: item.symbol,
        score: scored.score,
        signal: scored.signal,
        entryPrice: entry,
        stopLoss,
        takeProfit,
        currentPrice: entry,
        confidence: scored.score,
        strategyName,
        recommendationText,
        marketDate,
        status: 'ACTIVE',
        meta: JSON.stringify(meta),
        source: 'brs-central-worker'
      },
      update: {
        score: scored.score,
        signal: scored.signal,
        entryPrice: entry,
        stopLoss,
        takeProfit,
        currentPrice: entry,
        confidence: scored.score,
        status: 'ACTIVE',
        recommendationText,
        meta: JSON.stringify(meta),
        source: 'brs-central-worker',
        updatedAt: new Date()
      }
    });
  }

  return candidates.length;
}

async function runJob(name, fn) {
  try { await fn(); console.log('[MARKET WORKER] ' + name + ' completed'); return true; }
  catch (error) { console.error('[MARKET WORKER] ' + name + ' failed:', error.message); return false; }
}

async function runMarketWorker() {
  const status = await brsService.getMarketStatus().catch(() => ({ isOpen: false }));
  const existingMarketCurrent = await prisma.marketCurrent.findFirst({
    orderBy: { updatedAt: 'desc' },
    select: { id: true, updatedAt: true }
  }).catch(() => null);

  // The shared database must be bootstrapped even when the market is closed.
  // Otherwise a fresh deployment can remain empty forever until the next
  // trading session, causing /api/v1/market/index to return NO_SHARED_MARKET_DATA.
  const needsBootstrap = !existingMarketCurrent;
  if (!status || status.isOpen !== true) {
    if (!needsBootstrap) return { status: 'skipped', reason: 'market-closed' };
    console.log('[MARKET WORKER] Market is closed, but shared market data is empty; running bootstrap refresh.');
  }

  await runJob('market-current', updateMarketCurrent);
  const symbols = await updateSymbolsAndMovers();
  await runJob('market-daily', () => updateMarketDaily(symbols));
  await runJob('industries', () => updateIndustries(symbols));
  await runJob('scalping-opportunities', () => updateScalpingOpportunities(symbols, status?.isOpen === true));
  return { status: 'success', symbols: symbols.length };
}

function startMarketWorker() {
  if (process.env.MARKET_WORKER_ENABLED === 'false') {
    console.log('[MARKET WORKER] Disabled by MARKET_WORKER_ENABLED=false');
    return;
  }
  const instance = process.env.NODE_APP_INSTANCE;
  if (instance !== undefined && instance !== '0') {
    console.log('[MARKET WORKER] Skipped on PM2 instance ' + String(instance));
    return;
  }

  // Run immediately after backend startup so a fresh/empty shared database
  // is populated without waiting for the first one-minute cron tick.
  runMarketWorker().catch((error) => {
    console.error('[MARKET WORKER] Initial refresh failed:', error?.message || error);
  });

  cron.schedule('*/1 * * * *', () => {
    runMarketWorker().catch((error) => {
      console.error('[MARKET WORKER] Scheduled refresh failed:', error?.message || error);
    });
  });

  console.log('[MARKET WORKER] Central market worker started (immediate bootstrap + every minute)');
}

module.exports = { runMarketWorker, startMarketWorker, updateMarketCurrent, updateSymbolsAndMovers, updateIndustries, updateMarketDaily, updateScalpingOpportunities };
