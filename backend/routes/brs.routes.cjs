// backend/routes/brs.routes.cjs
'use strict';

const express = require('express');
const router = express.Router();
const sharedBrsService = require('../services/brs.service.cjs');
const sharedMarketService = require('../services/sharedMarket.service.cjs');
const authMiddleware = require('../middlewares/auth.middleware.cjs');

function userAuth(req, res, next) {
  return typeof authMiddleware === 'function'
    ? authMiddleware(req, res, next)
    : next();
}

function getFirstValue(record, keys) {
  for (const key of keys) {
    const value = record && record[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

function parseFiniteNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const normalized = value
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[,٬\s]/g, '')
    .trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function getOptionKind(record) {
  const raw = getFirstValue(record, ['type', 'Type', 'optionType', 'OptionType', 'callPut', 'CallPut', 'نوع']);
  if (raw == null) return null;
  const value = String(raw).trim().toLowerCase();
  if (value === 'call' || value === 'c' || value.includes('اختیار خرید') || value === 'خرید') return 'call';
  if (value === 'put' || value === 'p' || value.includes('اختیار فروش') || value === 'فروش') return 'put';
  return null;
}

function enrichOptionContracts(contracts, symbols) {
  const spotBySymbol = new Map();
  for (const symbol of symbols) {
    const name = String(symbol && symbol.symbol || '').trim().toLocaleLowerCase();
    const price = parseFiniteNumber(symbol && symbol.lastPrice);
    if (name && price !== null && price > 0) spotBySymbol.set(name, price);
  }

  return contracts.map((contract) => {
    const baseRaw = getFirstValue(contract, ['base_l18', 'baseL18', 'baseSymbol', 'BaseSymbol', 'underlyingSymbol', 'UnderlyingSymbol', 'symbolBase', 'نماد پایه']);
    const baseSymbol = baseRaw == null ? '' : String(baseRaw).trim();
    const underlyingLastPrice = spotBySymbol.get(baseSymbol.toLocaleLowerCase()) ?? null;
    const strike = parseFiniteNumber(getFirstValue(contract, ['price_strike', 'priceStrike', 'strikePrice', 'StrikePrice', 'strike', 'Strike', 'قیمت اعمال']));
    const kind = getOptionKind(contract);
    const optionLastPrice = parseFiniteNumber(getFirstValue(contract, ['pl', 'lastPrice', 'LastPrice', 'pClosing', 'PClosing', 'last', 'Last']));
    const bestAskPrice = parseFiniteNumber(getFirstValue(contract, ['pMeOf', 'bestAskPrice', 'bestAsk', 'askPrice', 'sellPrice', 'priceSell', 'قیمت فروش']));
    const bestBidPrice = parseFiniteNumber(getFirstValue(contract, ['pMeDem', 'bestBidPrice', 'bestBid', 'bidPrice', 'buyPrice', 'priceBuy', 'قیمت خرید']));
    const tradedVolume = parseFiniteNumber(getFirstValue(contract, ['tvol', 'volume', 'Volume', 'qTotTran5J', 'QTotTran5J']));
    const openInterest = parseFiniteNumber(getFirstValue(contract, ['interest_open', 'interestOpen', 'openInterest', 'OpenInterest', 'open_interest', 'OI']));
    const breakEvenPrice = strike !== null && optionLastPrice !== null && kind ? (kind === 'call' ? strike + optionLastPrice : strike - optionLastPrice) : null;
    const intrinsicValue = underlyingLastPrice !== null && strike !== null && kind
      ? Math.max(0, kind === 'call' ? underlyingLastPrice - strike : strike - underlyingLastPrice)
      : null;

    return Object.assign({}, contract, {
      underlyingLastPrice,
      optionKind: kind,
      strikePrice: strike,
      optionLastPrice,
      bestAskPrice: bestAskPrice !== null && bestAskPrice > 0 ? bestAskPrice : null,
      bestBidPrice: bestBidPrice !== null && bestBidPrice > 0 ? bestBidPrice : null,
      tradedVolume,
      openInterest,
      breakEvenPrice,
      intrinsicValue,
      intrinsicValueStatus: intrinsicValue === null ? 'insufficient-data' : 'calculated'
    });
  });
}

router.get('/options', userAuth, async function getOptionContracts(_req, res) {
  try {
    const result = await sharedBrsService.getOptionContracts();
    const contracts = Array.isArray(result && result.data) ? result.data : [];
    let symbols = [];
    try {
      symbols = await sharedMarketService.getSymbols({ limit: 10000 });
    } catch (marketError) {
      console.warn('[BRS] Shared market spot prices unavailable for options:', marketError.message);
    }
    const data = enrichOptionContracts(contracts, symbols);
    return res.json({
      success: true,
      data,
      total: data.length,
      source: result && result._meta ? result._meta.source : 'brs-option',
      cached: !!(result && result._cached),
      meta: result && result._meta ? result._meta : null
    });
  } catch (error) {
    console.error('[BRS] GET /options error:', error.message);
    return res.status(502).json({
      success: false,
      code: 'BRS_OPTION_FETCH_FAILED',
      message: 'خطا در دریافت اطلاعات اختیار معامله از BRS'
    });
  }
});

router.get('/status', userAuth, async function (req, res) {
  try {
    const available = !!process.env.BRS_API_KEY;
    return res.json({ success: true, data: { service: 'BRS', available, status: available ? 'configured' : 'disconnected', hasApiKey: available, timestamp: new Date().toISOString() } });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'خطا در بررسی وضعیت سرویس BRS', error: error.message });
  }
});

router.get('/symbol/:symbol', userAuth, async function (req, res) {
  try {
    const symbol = String(req.params.symbol || '').trim();
    if (!symbol) return res.status(400).json({ success: false, message: 'نام نماد الزامی است.' });
    const result = await sharedBrsService.getSymbolData(symbol);
    const data = result && Object.prototype.hasOwnProperty.call(result, 'data') ? result.data : result;
    return res.json({ success: true, data: data || { symbol, available: false }, source: 'brs-service', cached: !!(result && result._cached) });
  } catch (error) {
    console.error('[BRS] GET /symbol/:symbol error:', error.message);
    return res.status(502).json({ success: false, message: `خطا در دریافت اطلاعات نماد «${req.params.symbol || ''}».` });
  }
});

router.get('/symbol/:symbol/history', userAuth, async function (req, res) {
  try {
    const symbol = String(req.params.symbol || '').trim();
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 60, 10), 5000);
    if (!symbol) return res.status(400).json({ success: false, message: 'نام نماد الزامی است.' });
    // Portfolio analytics needs real per-symbol daily history. Do not depend on MarketDaily;
    // the shared DB is not guaranteed to contain history for every portfolio symbol.
    const result = await sharedBrsService.getSymbolHistory(symbol, limit);
    const data = Array.isArray(result && result.data) ? result.data : [];
    return res.json({ success: true, data, total: data.length, meta: result && result._meta ? result._meta : null, cached: !!(result && result._cached), source: result && result._meta && result._meta.source ? result._meta.source : 'brs-history' });
  } catch (error) {
    console.error('[BRS] GET /symbol/:symbol/history error:', error.message);
    return res.status(502).json({ success: false, message: `خطا در دریافت تاریخچه نماد «${req.params.symbol || ''}».` });
  }
});

router.get('/symbol/:symbol/candles', userAuth, async function (req, res) {
  try {
    const symbol = String(req.params.symbol || '').trim();
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 60, 10), 5000);
    if (!symbol) return res.status(400).json({ success: false, message: 'نام نماد الزامی است.' });
    const result = await sharedBrsService.getAdjustedDailyCandlestick(symbol, limit);
    return res.json({ success: true, data: Array.isArray(result && result.data) ? result.data : [], meta: result && result._meta ? result._meta : null, cached: !!(result && result._cached), source: 'brs-candlestick' });
  } catch (error) {
    console.error('[BRS] GET /symbol/:symbol/candles error:', error.message);
    return res.status(502).json({ success: false, message: `خطا در دریافت کندل نماد «${req.params.symbol || ''}».` });
  }
});

module.exports = router;
