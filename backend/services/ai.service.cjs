// backend/services/ai.service.cjs
// AI Service - connects to GapGPT (OpenAI-compatible API)
// Version: 2.5 - conservative analysis with warnings, canonical input normalization
'use strict';

const env = require('../config/env.cjs');

/* ══════════════════════════════════════════════
   ⚙️ Configuration
   ══════════════════════════════════════════════ */

const API_KEY = process.env.GAPGPT_API_KEY || env.AI_API_KEY || '';
const API_URL = process.env.GAPGPT_API_URL || env.AI_API_URL || 'https://api.gapapi.com/v1';
const MODEL = process.env.GAPGPT_MODEL || env.AI_MODEL || 'gpt-4.1-mini';
const FALLBACK_MODEL = process.env.GAPGPT_FALLBACK_MODEL || 'gpt-4.1-nano';
const MAX_TOKENS = parseInt(process.env.AI_MAX_TOKENS, 10) || 4000;
const FETCH_TIMEOUT = parseInt(process.env.FETCH_TIMEOUT_MS, 10) || 45000;
const MAX_RETRIES = parseInt(process.env.AI_MAX_RETRIES, 10) || 2;
const ONTOLOGY_VERSION = '1.1.0';

/* ══════════════════════════════════════════════
   🔤 System Prompts
   ══════════════════════════════════════════════ */

const SYSTEM_PROMPTS = {
  analyst: [
    'شما یک تحلیلگر حرفه‌ای بازار سرمایه ایران هستید.',
    'پاسخ‌ها باید دقیق، مستند و مبتنی بر داده ورودی باشند.',
    'اگر داده کافی نباشد، کمبود داده را صریح اعلام کنید.',
    'پاسخ‌ها را به زبان فارسی و در قالب JSON ارائه دهید.',
  ].join(' '),

  stockAnalysis: [
    'شما یک تحلیلگر تکنیکال و بنیادی بازار بورس ایران هستید.',
    'باید خروجی فقط JSON خالص و معتبر باشد و هیچ متن اضافه‌ای خارج از JSON ننویسید.',
    'تحلیل باید فقط بر اساس داده‌های ارسالی همان نماد انجام شود.',
    'از حدس، دانش عمومی خارج از داده ورودی، و ساختن قیمت‌ها یا سطوح فرضی خودداری کنید.',
    'اگر بخشی از داده موجود نبود، همان کمبود را صریح اعلام کنید و فقط با داده موجود نتیجه‌گیری کنید.',
    'اگر کیفیت داده ضعیف بود، confidence را پایین نگه دارید و توصیه محافظه‌کارانه بدهید.',
    'تحلیل باید شامل جمع‌بندی، سطح ریسک، داده بازار، امتیاز بنیادی و تکنیکال، نقاط ورود و خروج، حد ضرر، اهداف و توضیحات تحلیلی باشد.',
    'مقادیر recommendation فقط یکی از این‌ها باشد: خرید، فروش، نگهداری.',
    'مقادیر riskLevel فقط یکی از این‌ها باشد: کم، متوسط، زیاد.',
    'مقادیر shortTermTrend و mediumTermTrend فقط یکی از این‌ها باشد: صعودی، نزولی، خنثی.',
    'مقادیر sentiment فقط یکی از این‌ها باشد: مثبت، منفی، خنثی.',
    'confidence را به صورت عددی بین 0 تا 100 برگردان.',
  ].join(' '),

  scalping: [
    'شما یک متخصص اسکالپینگ و معاملات کوتاه‌مدت بازار بورس ایران هستید.',
    'تحلیل فقط باید بر اساس snapshot و history ارسالی انجام شود.',
    'از ساختن اعداد یا سناریوهای فرضی خودداری کنید.',
    'در صورت ضعف داده یا نبود snapshot معتبر، confidence را پایین نگه دارید.',
    'فرصت‌های معاملاتی کوتاه‌مدت 1 تا 5 روزه را شناسایی کنید.',
    'پاسخ را فقط در قالب JSON معتبر و خالص برگردانید.',
    'فیلدهای تحلیل شامل recommendation، riskLevel، نقاط ورود/خروج، حد ضرر، targets، timeframe و reason باشد.',
  ].join(' '),

  comparator: [
    'شما یک تحلیلگر حرفه‌ای مقایسه سهام بازار سرمایه ایران هستید.',
    'دو یا چند سهم را فقط بر اساس داده‌های ارائه‌شده از نظر تکنیکال، بنیادی و ریسک مقایسه کرده و برنده را مشخص کنید.',
    'خروجی از ابتدا تا انتها باید به زبان فارسی طبیعی، روان و حرفه‌ای تولید شود.',
    'تمام عنوان‌ها، توضیحات، خلاصه‌ها، تحلیل‌های تکنیکال و بنیادی، دلایل، نتیجه‌گیری‌ها، سطوح ریسک و توصیه‌ها باید فارسی باشند.',
    'هیچ واژه، عبارت، جمله یا عنوان انگلیسی در مقدارهای متنی خروجی مجاز نیست.',
    'کلیدهای JSON داخلی باید دقیقاً مطابق ساختار مورد انتظار API باقی بمانند و ترجمه نشوند، اما تمام مقدارهای متنی JSON باید فارسی باشند.',
    'مقدار recommendation فقط یکی از این موارد باشد: خرید قوی، خرید، نگهداری، فروش، فروش قوی، خنثی.',
    'نام نمادهای بورسی، EPS و P/E و اعداد و مقادیر مالی استاندارد را تغییر نده؛ این موارد شناسه یا اصطلاح استاندارد مالی هستند.',
    'هیچ داده مالی، امتیاز، قیمت، نسبت یا نتیجه‌ای را حدس نزن و اختراع نکن؛ فقط از داده‌های ورودی استفاده کن.',
    'پاسخ فقط JSON معتبر باشد و هیچ متن، توضیح یا Markdown خارج از JSON تولید نشود.',
  ].join(' '),

  portfolio: [
    'شما یک مشاور سبد سرمایه‌گذاری در بازار بورس ایران هستید.',
    'سبد کاربر را تحلیل کرده و پیشنهادات بهینه‌سازی ارائه دهید.',
    'پاسخ را در قالب JSON برگردانید.',
  ].join(' '),

  chat: [
    'شما دستیار هوشمند بازار سرمایه ایران هستید.',
    'به سوالات کاربران درباره بورس، تحلیل تکنیکال، بنیادی و استراتژی معاملاتی پاسخ دهید.',
    'پاسخ‌ها به زبان فارسی باشد.',
  ].join(' '),
};

/* ══════════════════════════════════════════════
   🔧 JSON Extraction
   ══════════════════════════════════════════════ */

function extractJsonFromText(text) {
  if (!text || typeof text !== 'string') return null;

  try {
    return JSON.parse(text.trim());
  } catch (_) {}

  try {
    const q = String.fromCharCode(96, 96, 96);
    const pattern = q + '(?:json)?\\s*([\\s\\S]*?)' + q;
    const regex = new RegExp(pattern, 'i');
    const codeBlockMatch = text.match(regex);
    if (codeBlockMatch && codeBlockMatch[1]) {
      return JSON.parse(codeBlockMatch[1].trim());
    }
  } catch (_) {}

  try {
    const startObj = text.indexOf('{');
    const endObj = text.lastIndexOf('}');
    if (startObj !== -1 && endObj !== -1 && endObj > startObj) {
      return JSON.parse(text.substring(startObj, endObj + 1));
    }
  } catch (_) {}

  try {
    const startArr = text.indexOf('[');
    const endArr = text.lastIndexOf(']');
    if (startArr !== -1 && endArr !== -1 && endArr > startArr) {
      return JSON.parse(text.substring(startArr, endArr + 1));
    }
  } catch (_) {}

  return null;
}

/* ══════════════════════════════════════════════
   🌐 Fetch with Timeout + Retry
   ══════════════════════════════════════════════ */

async function fetchAI(endpoint, body, retryCount) {
  if (retryCount === undefined) retryCount = 0;

  if (!API_KEY) {
    throw new Error('کلید API هوش مصنوعی تنظیم نشده (GAPGPT_API_KEY)');
  }

  const url = API_URL.replace(/\/+$/, '') + endpoint;
  const requestBody = Object.assign({}, body || {});

  const controller = new AbortController();
  const timeout = setTimeout(function () {
    controller.abort();
  }, FETCH_TIMEOUT);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: 'Bearer ' + API_KEY,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();

      if (response.status === 429 && retryCount < MAX_RETRIES) {
        const waitMs = Math.pow(2, retryCount) * 1000 + Math.random() * 500;
        console.warn('[AI] Rate limit, retry ' + (retryCount + 1) + ' after ' + Math.round(waitMs) + 'ms');
        await sleep(waitMs);

        if (requestBody.model && requestBody.model !== FALLBACK_MODEL) {
          requestBody.model = FALLBACK_MODEL;
        }

        return fetchAI(endpoint, requestBody, retryCount + 1);
      }

      if (response.status >= 500 && retryCount < MAX_RETRIES) {
        const retryWait = Math.pow(2, retryCount) * 2000;
        console.warn('[AI] Server error ' + response.status + ', retry ' + (retryCount + 1));
        await sleep(retryWait);
        return fetchAI(endpoint, requestBody, retryCount + 1);
      }

      throw new Error('AI API HTTP ' + response.status + ': ' + errorText.substring(0, 300));
    }

    return response.json();
  } catch (err) {
    clearTimeout(timeout);

    if (err && err.name === 'AbortError') {
      if (retryCount < 1) {
        console.warn('[AI] Timeout, retry with fallback model...');

        if (requestBody.model && requestBody.model !== FALLBACK_MODEL) {
          requestBody.model = FALLBACK_MODEL;
          requestBody.max_tokens = Math.min(requestBody.max_tokens || MAX_TOKENS, 2200);
        }

        return fetchAI(endpoint, requestBody, retryCount + 1);
      }

      throw new Error('درخواست AI به دلیل تایم‌اوت لغو شد (' + FETCH_TIMEOUT + 'ms)');
    }

    throw err;
  }
}

function sleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

/* ══════════════════════════════════════════════
   🧩 Normalization Helpers
   ══════════════════════════════════════════════ */

function toNumber(v, def) {
  const n = Number(v);
  return Number.isFinite(n) ? n : (def === undefined ? 0 : def);
}

function clamp(v, min, max) {
  const n = toNumber(v, min);
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function safeText(v, def) {
  if (typeof v === 'string' && v.trim()) return v.trim();
  return def || '';
}

function firstDefined() {
  for (let i = 0; i < arguments.length; i += 1) {
    if (arguments[i] !== undefined && arguments[i] !== null && arguments[i] !== '') {
      return arguments[i];
    }
  }
  return undefined;
}

function getNested(obj, path) {
  if (!obj || !path) return undefined;
  const parts = path.split('.');
  let current = obj;

  for (let i = 0; i < parts.length; i += 1) {
    if (!current || typeof current !== 'object' || !(parts[i] in current)) {
      return undefined;
    }
    current = current[parts[i]];
  }

  return current;
}

function pickValue(obj, paths, def) {
  if (!Array.isArray(paths)) return def;

  for (let i = 0; i < paths.length; i += 1) {
    const v = getNested(obj, paths[i]);
    if (v !== undefined && v !== null && v !== '') return v;
  }

  return def;
}

function sanitizeModel(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function sanitizeMaxTokens(value) {
  if (value === undefined || value === null || value === '') return undefined;
  return clamp(value, 256, 4000);
}

function sanitizeTemperature(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return clamp(value, 0, 1);
}

function normalizeRecommendation(value) {
  const text = safeText(value, 'نگهداری');
  if (text === 'buy' || text === 'خرید' || text === 'ورود') return 'خرید';
  if (text === 'sell' || text === 'فروش' || text === 'خروج') return 'فروش';
  if (text === 'hold' || text === 'نگهداری') return 'نگهداری';
  if (text === 'نامشخص') return 'نگهداری';
  return 'نگهداری';
}

function normalizeRiskLevel(value) {
  const text = safeText(value, 'متوسط');
  if (text === 'low' || text === 'کم') return 'کم';
  if (text === 'medium' || text === 'متوسط') return 'متوسط';
  if (text === 'high' || text === 'زیاد') return 'زیاد';
  return 'متوسط';
}

function normalizeRiskLevelEnglish(value) {
  const fa = normalizeRiskLevel(value);
  if (fa === 'کم') return 'low';
  if (fa === 'زیاد') return 'high';
  return 'medium';
}

function normalizeTrend(value) {
  const text = safeText(value, 'خنثی');
  if (text === 'bullish' || text === 'up' || text === 'صعودی') return 'صعودی';
  if (text === 'bearish' || text === 'down' || text === 'نزولی') return 'نزولی';
  if (text === 'neutral' || text === 'sideways' || text === 'خنثی') return 'خنثی';
  return 'خنثی';
}

function normalizeSentiment(value) {
  const text = safeText(value, 'خنثی');
  if (text === 'positive' || text === 'مثبت') return 'مثبت';
  if (text === 'negative' || text === 'منفی') return 'منفی';
  if (text === 'neutral' || text === 'خنثی') return 'خنثی';
  return 'خنثی';
}

function normalizeConfidence(value) {
  const n = toNumber(value, 0);
  if (n > 0 && n <= 1) {
    return clamp(Math.round(n * 100), 0, 100);
  }
  return clamp(n, 0, 100);
}

function normalizeTargetMap(targets) {
  if (!targets || typeof targets !== 'object' || Array.isArray(targets)) {
    return {};
  }

  const normalized = {};
  Object.keys(targets).forEach(function (key) {
    const num = toNumber(targets[key], NaN);
    if (Number.isFinite(num) && num > 0) {
      normalized[key] = num;
    }
  });

  return normalized;
}

function normalizePointArray(arr) {
  if (!Array.isArray(arr)) return [];

  return arr
    .map(function (p) {
      if (typeof p === 'number') {
        return { price: toNumber(p, 0), reason: '' };
      }

      if (p && typeof p === 'object') {
        return {
          price: toNumber(firstDefined(p.price, p.value, p.level), 0),
          reason: safeText(firstDefined(p.reason, p.note, p.description, p.title), ''),
        };
      }

      return null;
    })
    .filter(function (x) {
      return x && x.price > 0;
    });
}

function pointObjectsToNumbers(points) {
  if (!Array.isArray(points)) return [];

  return points
    .map(function (p) {
      return toNumber(p && p.price, 0);
    })
    .filter(function (n) {
      return n > 0;
    });
}

function normalizeCandle(candle) {
  if (!candle || typeof candle !== 'object') return null;

  const normalized = {
    open: toNumber(firstDefined(candle.open, candle.o), 0),
    high: toNumber(firstDefined(candle.high, candle.h), 0),
    low: toNumber(firstDefined(candle.low, candle.l), 0),
    close: toNumber(firstDefined(candle.close, candle.c, candle.priceClose, candle.closing), 0),
    volume: toNumber(firstDefined(candle.volume, candle.v, candle.totalVolume), 0),
    date: safeText(firstDefined(candle.date, candle.d, candle.tradeDate, candle.jdate, candle.gdate), ''),
  };

  if (
    normalized.open <= 0 &&
    normalized.high <= 0 &&
    normalized.low <= 0 &&
    normalized.close <= 0 &&
    normalized.volume <= 0
  ) {
    return null;
  }

  return normalized;
}

function extractCandles(list, limit) {
  if (!Array.isArray(list)) return [];

  return list
    .map(normalizeCandle)
    .filter(Boolean)
    .slice(0, Math.max(0, toNumber(limit, list.length)));
}

function getInputSeries(data, primaryKey, legacyKey, limit) {
  const source = data && typeof data === 'object' ? data : {};
  const series = firstDefined(source[primaryKey], source[legacyKey], []);
  return extractCandles(series, limit);
}

function buildLegacyMoneyFlow(input, kind) {
  const inflow = toNumber(
    firstDefined(
      pickValue(input, [kind + 'MoneyFlow.inflow'], undefined),
      pickValue(input, [kind + 'MoneyFlow.buy'], undefined),
      input[kind + 'Inflow'],
      input[kind + 'BuyValue'],
      input[kind + 'Buy'],
      input[kind + '_buy_value'],
      input[kind + 'MoneyIn']
    ),
    0
  );

  const outflow = toNumber(
    firstDefined(
      pickValue(input, [kind + 'MoneyFlow.outflow'], undefined),
      pickValue(input, [kind + 'MoneyFlow.sell'], undefined),
      input[kind + 'Outflow'],
      input[kind + 'SellValue'],
      input[kind + 'Sell'],
      input[kind + '_sell_value'],
      input[kind + 'MoneyOut']
    ),
    0
  );

  return {
    inflow: inflow,
    outflow: outflow,
    net: inflow - outflow,
  };
}

function buildMoneyFlowFromBrs(source, closingPrice) {
  const realBuyVolume = toNumber(
    firstDefined(getNested(source, 'moneyFlow.real.buyVolume'), source.realBuyVolume),
    0
  );

  const realSellVolume = toNumber(
    firstDefined(getNested(source, 'moneyFlow.real.sellVolume'), source.realSellVolume),
    0
  );

  const legalBuyVolume = toNumber(
    firstDefined(
      getNested(source, 'moneyFlow.institutional.buyVolume'),
      getNested(source, 'moneyFlow.legal.buyVolume'),
      source.legalBuyVolume,
      source.instBuyVolume
    ),
    0
  );

  const legalSellVolume = toNumber(
    firstDefined(
      getNested(source, 'moneyFlow.institutional.sellVolume'),
      getNested(source, 'moneyFlow.legal.sellVolume'),
      source.legalSellVolume,
      source.instSellVolume
    ),
    0
  );

  const realBuyValue = toNumber(
    firstDefined(getNested(source, 'moneyFlow.real.buyValue'), source.realBuyValue),
    0
  );

  const realSellValue = toNumber(
    firstDefined(getNested(source, 'moneyFlow.real.sellValue'), source.realSellValue),
    0
  );

  const legalBuyValue = toNumber(
    firstDefined(
      getNested(source, 'moneyFlow.institutional.buyValue'),
      getNested(source, 'moneyFlow.legal.buyValue'),
      source.legalBuyValue,
      source.instBuyValue
    ),
    0
  );

  const legalSellValue = toNumber(
    firstDefined(
      getNested(source, 'moneyFlow.institutional.sellValue'),
      getNested(source, 'moneyFlow.legal.sellValue'),
      source.legalSellValue,
      source.instSellValue
    ),
    0
  );

  const px = toNumber(closingPrice, 0);

  const resolvedRealInflow = realBuyValue > 0 ? realBuyValue : realBuyVolume * px;
  const resolvedRealOutflow = realSellValue > 0 ? realSellValue : realSellVolume * px;
  const resolvedLegalInflow = legalBuyValue > 0 ? legalBuyValue : legalBuyVolume * px;
  const resolvedLegalOutflow = legalSellValue > 0 ? legalSellValue : legalSellVolume * px;

  return {
    realMoneyFlow: {
      inflow: resolvedRealInflow,
      outflow: resolvedRealOutflow,
      net: resolvedRealInflow - resolvedRealOutflow,
      buyVolume: realBuyVolume,
      sellVolume: realSellVolume,
    },
    legalMoneyFlow: {
      inflow: resolvedLegalInflow,
      outflow: resolvedLegalOutflow,
      net: resolvedLegalInflow - resolvedLegalOutflow,
      buyVolume: legalBuyVolume,
      sellVolume: legalSellVolume,
    },
  };
}

function buildMarketDataFromInput(data) {
  data = data || {};

  const source = data.marketData && typeof data.marketData === 'object' ? data.marketData : data;
  const dailySummary = data.dailySummary && typeof data.dailySummary === 'object' ? data.dailySummary : {};
  const priceNode = source.price && typeof source.price === 'object' ? source.price : {};
  const tradingNode = source.trading && typeof source.trading === 'object' ? source.trading : {};

  const lastClosePrice = toNumber(
    firstDefined(
      source.lastClosePrice,
      source.closingPrice,
      source.closePrice,
      source.finalPrice,
      source.currentPrice,
      source.close,
      source.priceToday,
      source.pl,
      source.pc,
      dailySummary.lastClosePrice,
      dailySummary.close,
      dailySummary.closingPrice,
      priceNode.closing,
      priceNode.last
    ),
    0
  );

  const tradedVolume = toNumber(
    firstDefined(
      source.tradedVolume,
      source.volume,
      source.totalVolume,
      source.qTotTran5J,
      source.zTotTran,
      source.tvol,
      dailySummary.tradedVolume,
      dailySummary.volume,
      tradingNode.volume
    ),
    0
  );

  const nestedFlows = buildMoneyFlowFromBrs(source, lastClosePrice);
  const legacyReal = buildLegacyMoneyFlow(source, 'real');
  const legacyLegal = buildLegacyMoneyFlow(source, 'legal');

  const realMoneyFlow = {
    inflow: nestedFlows.realMoneyFlow.inflow || legacyReal.inflow,
    outflow: nestedFlows.realMoneyFlow.outflow || legacyReal.outflow,
    net: 0,
    buyVolume: nestedFlows.realMoneyFlow.buyVolume || 0,
    sellVolume: nestedFlows.realMoneyFlow.sellVolume || 0,
  };

  const legalMoneyFlow = {
    inflow: nestedFlows.legalMoneyFlow.inflow || legacyLegal.inflow,
    outflow: nestedFlows.legalMoneyFlow.outflow || legacyLegal.outflow,
    net: 0,
    buyVolume: nestedFlows.legalMoneyFlow.buyVolume || 0,
    sellVolume: nestedFlows.legalMoneyFlow.sellVolume || 0,
  };

  realMoneyFlow.net = realMoneyFlow.inflow - realMoneyFlow.outflow;
  legalMoneyFlow.net = legalMoneyFlow.inflow - legalMoneyFlow.outflow;

  return {
    lastClosePrice: lastClosePrice,
    tradedVolume: tradedVolume,
    realMoneyFlow: realMoneyFlow,
    legalMoneyFlow: legalMoneyFlow,
  };
}

function getInputDataMeta(data) {
  const meta = data && data._meta && typeof data._meta === 'object' ? data._meta : {};
  const warnings = Array.isArray(meta.warnings) ? meta.warnings.filter(Boolean).map(String) : [];

  return {
    analysisDataQuality: safeText(meta.analysisDataQuality, ''),
    hasLiveSnapshot: !!meta.hasLiveSnapshot,
    hasFallbackSnapshot: !!meta.hasFallbackSnapshot,
    hasDailyHistory: !!meta.hasDailyHistory,
    hasWeeklyHistory: !!meta.hasWeeklyHistory,
    isFallbackUsed: !!meta.isFallbackUsed,
    warnings: warnings,
  };
}

function buildQualityWarnings(data) {
  const meta = getInputDataMeta(data);
  const warnings = meta.warnings.slice();

  if (!meta.analysisDataQuality) {
    warnings.push('کیفیت داده تحلیل مشخص نشده است.');
  }

  if (!meta.hasLiveSnapshot && !meta.hasFallbackSnapshot) {
    warnings.push('اسنپ‌شات معتبر بازار در دسترس نیست.');
  }

  if (!meta.hasDailyHistory && !meta.hasWeeklyHistory) {
    warnings.push('سری تاریخی معتبر برای تحلیل در دسترس نیست.');
  }

  return Array.from(new Set(warnings.filter(Boolean)));
}

function hasUsableSnapshot(data) {
  const market = buildMarketDataFromInput(data);
  const meta = getInputDataMeta(data);

  if (meta.hasLiveSnapshot || meta.hasFallbackSnapshot) return true;
  return market.lastClosePrice > 0 || market.tradedVolume > 0;
}

function hasUsableHistory(data) {
  const meta = getInputDataMeta(data);
  const daily = getInputSeries(data, 'dailyCandles', 'daily', 30);
  const weekly = getInputSeries(data, 'weeklyCandles', 'weekly', 24);

  if (meta.hasDailyHistory || meta.hasWeeklyHistory) return true;
  return daily.length >= 3 || weekly.length >= 1;
}

function hasMinimumAnalysisData(data) {
  if (!data || typeof data !== 'object') return false;

  const snapshotOk = hasUsableSnapshot(data);
  const historyOk = hasUsableHistory(data);

  return snapshotOk || historyOk;
}

function getConfidenceCapByQuality(data) {
  const meta = getInputDataMeta(data);
  const quality = meta.analysisDataQuality;

  if (quality === 'live') return 90;
  if (quality === 'snapshot-only') return 65;
  if (quality === 'fallback-with-history') return 55;
  if (quality === 'history-only') return 45;
  if (quality === 'fallback-only') return 35;

  if (hasUsableSnapshot(data) && hasUsableHistory(data)) return 70;
  if (hasUsableHistory(data)) return 45;
  if (hasUsableSnapshot(data)) return 40;
  return 25;
}

function buildTopLevelAliases(normalized) {
  const entryPoints = pointObjectsToNumbers(normalized.signals.entryPoints);
  const exitPoints = pointObjectsToNumbers(normalized.signals.exitPoints);

  return {
    meta: {
      ontology_version: ONTOLOGY_VERSION,
      data_quality: normalized.dataQuality || '',
      parser_status: normalized.parserStatus || 'parsed',
      warnings: Array.isArray(normalized.warnings) ? normalized.warnings : [],
    },
    ontology_version: ONTOLOGY_VERSION,
    risk_level: normalizeRiskLevelEnglish(normalized.riskLevel),

    closingPrice: normalized.marketData.lastClosePrice,
    tradedVolume: normalized.marketData.tradedVolume,
    volume: normalized.marketData.tradedVolume,

    realMoneyFlow: normalized.marketData.realMoneyFlow.net,
    legalMoneyFlow: normalized.marketData.legalMoneyFlow.net,
    realMoneyFlowBuy: normalized.marketData.realMoneyFlow.inflow,
    realMoneyFlowSell: normalized.marketData.realMoneyFlow.outflow,
    legalMoneyFlowBuy: normalized.marketData.legalMoneyFlow.inflow,
    legalMoneyFlowSell: normalized.marketData.legalMoneyFlow.outflow,

    fundamentalScore: normalized.scores.fundamentalScore,
    technicalScore: normalized.scores.technicalScore,

    entryPoints: entryPoints,
    exitPoints: exitPoints,
    targets: normalized.signals.targets,
    stopLoss: normalized.signals.stopLoss,

    detailedFundamentalExplanation: normalized.explanations.fundamental,
    detailedTechnicalExplanation: normalized.explanations.technical,
  };
}

function normalizeStockAnalysis(parsed, symbol, inputData, model, usage, analysisType, parserStatus) {
  const marketFallback = buildMarketDataFromInput(inputData);
  const meta = getInputDataMeta(inputData);
  const qualityWarnings = buildQualityWarnings(inputData);
  const confidenceCap = getConfidenceCapByQuality(inputData);
  const p = parsed && typeof parsed === 'object' ? parsed : {};

  const marketData = p.marketData && typeof p.marketData === 'object' ? p.marketData : {};
  const scores = p.scores && typeof p.scores === 'object' ? p.scores : {};
  const signals = p.signals && typeof p.signals === 'object' ? p.signals : {};
  const explanations = p.explanations && typeof p.explanations === 'object' ? p.explanations : {};

  const normalized = {
    symbol: safeText(firstDefined(p.symbol, symbol), symbol),
    recommendation: normalizeRecommendation(p.recommendation),
    riskLevel: normalizeRiskLevel(firstDefined(p.riskLevel, p.risk_level)),
    shortTermTrend: normalizeTrend(p.shortTermTrend),
    mediumTermTrend: normalizeTrend(p.mediumTermTrend),
    summary: safeText(p.summary, ''),
    sentiment: normalizeSentiment(p.sentiment),

    marketData: {
      lastClosePrice: toNumber(
        firstDefined(
          marketData.lastClosePrice,
          marketData.closingPrice,
          marketData.close,
          p.lastClosePrice,
          p.closingPrice,
          p.closePrice
        ),
        marketFallback.lastClosePrice
      ),
      tradedVolume: toNumber(
        firstDefined(
          marketData.tradedVolume,
          marketData.volume,
          p.tradedVolume,
          p.volume
        ),
        marketFallback.tradedVolume
      ),
      realMoneyFlow: {
        inflow: toNumber(
          firstDefined(
            pickValue(marketData, ['realMoneyFlow.inflow', 'realMoneyFlow.buy'], undefined),
            p.realMoneyFlowBuy
          ),
          marketFallback.realMoneyFlow.inflow
        ),
        outflow: toNumber(
          firstDefined(
            pickValue(marketData, ['realMoneyFlow.outflow', 'realMoneyFlow.sell'], undefined),
            p.realMoneyFlowSell
          ),
          marketFallback.realMoneyFlow.outflow
        ),
        net: 0,
      },
      legalMoneyFlow: {
        inflow: toNumber(
          firstDefined(
            pickValue(marketData, ['legalMoneyFlow.inflow', 'legalMoneyFlow.buy'], undefined),
            p.legalMoneyFlowBuy
          ),
          marketFallback.legalMoneyFlow.inflow
        ),
        outflow: toNumber(
          firstDefined(
            pickValue(marketData, ['legalMoneyFlow.outflow', 'legalMoneyFlow.sell'], undefined),
            p.legalMoneyFlowSell
          ),
          marketFallback.legalMoneyFlow.outflow
        ),
        net: 0,
      },
    },

    scores: {
      fundamentalScore: clamp(
        firstDefined(scores.fundamentalScore, scores.fundamental, p.fundamentalScore, 0),
        0,
        100
      ),
      technicalScore: clamp(
        firstDefined(scores.technicalScore, scores.technical, p.technicalScore, p.confidence, 0),
        0,
        100
      ),
    },

    signals: {
      entryPoints: normalizePointArray(firstDefined(signals.entryPoints, p.entryPoints, p.entry, [])),
      exitPoints: normalizePointArray(firstDefined(signals.exitPoints, p.exitPoints, p.exit, [])),
      stopLoss: toNumber(firstDefined(signals.stopLoss, p.stopLoss), 0),
      targets: normalizeTargetMap(firstDefined(signals.targets, p.targets, {})),
      timeframe: safeText(
        firstDefined(signals.timeframe, p.timeframe),
        analysisType === 'scalping' ? '1-5 روز' : 'کوتاه‌مدت/میان‌مدت'
      ),
    },

    explanations: {
      fundamental: safeText(
        firstDefined(
          explanations.fundamental,
          p.detailedFundamentalExplanation,
          p.fundamentalAnalysis,
          p.fundamentalText
        ),
        ''
      ),
      technical: safeText(
        firstDefined(
          explanations.technical,
          p.detailedTechnicalExplanation,
          p.technicalAnalysis,
          p.technicalText,
          p.reason
        ),
        ''
      ),
      additional: safeText(firstDefined(explanations.additional, p.details), ''),
    },

    confidence: Math.min(normalizeConfidence(p.confidence), confidenceCap),
    analysisDate: safeText(p.analysisDate, new Date().toISOString()),
    model: safeText(model, MODEL),
    usage: usage || null,
    dataQuality: meta.analysisDataQuality || 'unknown',
    parserStatus: parserStatus || 'parsed',
    warnings: qualityWarnings,
  };

  normalized.marketData.realMoneyFlow.net =
    normalized.marketData.realMoneyFlow.inflow - normalized.marketData.realMoneyFlow.outflow;

  normalized.marketData.legalMoneyFlow.net =
    normalized.marketData.legalMoneyFlow.inflow - normalized.marketData.legalMoneyFlow.outflow;

  if (!normalized.summary) {
    normalized.summary =
      'جمع‌بندی: توصیه ' +
      normalized.recommendation +
      ' | امتیاز تکنیکال ' +
      normalized.scores.technicalScore +
      ' | امتیاز بنیادی ' +
      normalized.scores.fundamentalScore;
  }

  if (normalized.warnings.length > 0) {
    normalized.summary += ' | هشدار کیفیت داده: ' + normalized.warnings.join(' | ');
  }

  if (!normalized.explanations.fundamental) {
    normalized.explanations.fundamental =
      normalized.warnings.length > 0
        ? 'تحلیل بنیادی با داده محدود انجام شده و باید با احتیاط تفسیر شود.'
        : 'توضیح بنیادی کافی از مدل دریافت نشد.';
  }

  if (!normalized.explanations.technical) {
    normalized.explanations.technical =
      normalized.warnings.length > 0
        ? 'تحلیل تکنیکال با داده محدود انجام شده و قابلیت اتکای آن محدود است.'
        : 'توضیح تکنیکال کافی از مدل دریافت نشد.';
  }

  if (!normalized.explanations.additional) {
    if (normalized.parserStatus === 'fallback-json-parse-failed') {
      normalized.explanations.additional =
        'خروجی مدل JSON معتبر نبود و پاسخ به صورت fallback نرمال‌سازی شد.';
    } else if (normalized.warnings.length > 0) {
      normalized.explanations.additional =
        'نتیجه با رویکرد محافظه‌کارانه و بر اساس داده‌های موجود تولید شده است.';
    } else {
      normalized.explanations.additional = '';
    }
  }

  return Object.assign({}, normalized, buildTopLevelAliases(normalized));
}

/* ══════════════════════════════════════════════
   📊 Data Summarizer
   ══════════════════════════════════════════════ */

function summarizeCandle(candle, idx) {
  return (
    '  ' + (idx + 1) +
    ') O:' + toNumber(firstDefined(candle.open, candle.o), 0) +
    ' H:' + toNumber(firstDefined(candle.high, candle.h), 0) +
    ' L:' + toNumber(firstDefined(candle.low, candle.l), 0) +
    ' C:' + toNumber(firstDefined(candle.close, candle.c), 0) +
    ' V:' + toNumber(firstDefined(candle.volume, candle.v), 0)
  );
}

function summarizeStockData(data) {
  if (!data || typeof data !== 'object') {
    return 'داده ساختاریافته‌ای برای این نماد در دسترس نیست.';
  }

  const parts = [];
  const market = buildMarketDataFromInput(data);
  const meta = getInputDataMeta(data);
  const warnings = buildQualityWarnings(data);

  const lastPrice = toNumber(
    firstDefined(
      getNested(data, 'price.last'),
      getNested(data, 'marketData.price.last'),
      data.lastPrice
    ),
    0
  );

  const openPrice = toNumber(
    firstDefined(
      getNested(data, 'price.open'),
      getNested(data, 'marketData.price.open'),
      data.open
    ),
    0
  );

  const dayHigh = toNumber(
    firstDefined(
      getNested(data, 'price.high'),
      getNested(data, 'marketData.price.high'),
      data.high
    ),
    0
  );

  const dayLow = toNumber(
    firstDefined(
      getNested(data, 'price.low'),
      getNested(data, 'marketData.price.low'),
      data.low
    ),
    0
  );

  const tradeValue = toNumber(
    firstDefined(
      getNested(data, 'trading.value'),
      getNested(data, 'marketData.trading.value'),
      data.tradeValue
    ),
    0
  );

  const tradeCount = toNumber(
    firstDefined(
      getNested(data, 'trading.count'),
      getNested(data, 'marketData.trading.count'),
      data.tradeCount
    ),
    0
  );

  const changePercent = firstDefined(
    getNested(data, 'price.closingChangePercent'),
    getNested(data, 'marketData.price.closingChangePercent'),
    getNested(data, 'dailySummary.changePercent'),
    data.changePercent,
    data.priceChangePercent,
    data.pcp,
    getNested(data, 'marketData.changePercent')
  );

  const pe = firstDefined(
    getNested(data, 'fundamental.pe'),
    getNested(data, 'snapshot.fundamental.pe'),
    data.pe,
    data.PE,
    data.pToE
  );

  const eps = firstDefined(
    getNested(data, 'fundamental.eps'),
    getNested(data, 'snapshot.fundamental.eps'),
    data.eps,
    data.EPS
  );

  if (meta.analysisDataQuality) {
    parts.push('کیفیت داده: ' + meta.analysisDataQuality);
  }

  if (warnings.length > 0) {
    parts.push('هشدارهای کیفیت داده: ' + warnings.join(' | '));
  }

  if (market.lastClosePrice > 0) {
    parts.push('قیمت پایانی: ' + market.lastClosePrice.toLocaleString('fa-IR') + ' ریال');
  }

  if (lastPrice > 0) {
    parts.push('آخرین قیمت: ' + lastPrice.toLocaleString('fa-IR') + ' ریال');
  }

  if (changePercent !== undefined && changePercent !== null && changePercent !== '') {
    parts.push('درصد تغییر پایانی: ' + toNumber(changePercent, 0) + '%');
  }

  if (openPrice > 0) {
    parts.push('قیمت بازگشایی: ' + openPrice.toLocaleString('fa-IR') + ' ریال');
  }

  if (dayHigh > 0 || dayLow > 0) {
    parts.push(
      'بازه روز: ' +
      dayLow.toLocaleString('fa-IR') +
      ' تا ' +
      dayHigh.toLocaleString('fa-IR') +
      ' ریال'
    );
  }

  if (market.tradedVolume > 0) {
    parts.push('حجم معاملات: ' + market.tradedVolume.toLocaleString('fa-IR'));
  }

  if (tradeValue > 0) {
    parts.push('ارزش معاملات: ' + tradeValue.toLocaleString('fa-IR'));
  }

  if (tradeCount > 0) {
    parts.push('تعداد معاملات: ' + tradeCount.toLocaleString('fa-IR'));
  }

  parts.push(
    'جریان حقیقی: ورود=' +
    market.realMoneyFlow.inflow.toLocaleString('fa-IR') +
    ' | خروج=' +
    market.realMoneyFlow.outflow.toLocaleString('fa-IR') +
    ' | خالص=' +
    market.realMoneyFlow.net.toLocaleString('fa-IR')
  );

  parts.push(
    'جریان حقوقی: ورود=' +
    market.legalMoneyFlow.inflow.toLocaleString('fa-IR') +
    ' | خروج=' +
    market.legalMoneyFlow.outflow.toLocaleString('fa-IR') +
    ' | خالص=' +
    market.legalMoneyFlow.net.toLocaleString('fa-IR')
  );

  const realBuyVolume = toNumber(
    firstDefined(
      getNested(data, 'moneyFlow.real.buyVolume'),
      getNested(data, 'marketData.moneyFlow.real.buyVolume')
    ),
    0
  );

  const realSellVolume = toNumber(
    firstDefined(
      getNested(data, 'moneyFlow.real.sellVolume'),
      getNested(data, 'marketData.moneyFlow.real.sellVolume')
    ),
    0
  );

  const legalBuyVolume = toNumber(
    firstDefined(
      getNested(data, 'moneyFlow.institutional.buyVolume'),
      getNested(data, 'moneyFlow.legal.buyVolume'),
      getNested(data, 'marketData.moneyFlow.institutional.buyVolume'),
      getNested(data, 'marketData.moneyFlow.legal.buyVolume')
    ),
    0
  );

  const legalSellVolume = toNumber(
    firstDefined(
      getNested(data, 'moneyFlow.institutional.sellVolume'),
      getNested(data, 'moneyFlow.legal.sellVolume'),
      getNested(data, 'marketData.moneyFlow.institutional.sellVolume'),
      getNested(data, 'marketData.moneyFlow.legal.sellVolume')
    ),
    0
  );

  if (realBuyVolume > 0 || realSellVolume > 0) {
    parts.push(
      'حجم حقیقی: خرید=' +
      realBuyVolume.toLocaleString('fa-IR') +
      ' | فروش=' +
      realSellVolume.toLocaleString('fa-IR')
    );
  }

  if (legalBuyVolume > 0 || legalSellVolume > 0) {
    parts.push(
      'حجم حقوقی: خرید=' +
      legalBuyVolume.toLocaleString('fa-IR') +
      ' | فروش=' +
      legalSellVolume.toLocaleString('fa-IR')
    );
  }

  if (pe !== undefined && pe !== null && pe !== '') parts.push('P/E: ' + pe);
  if (eps !== undefined && eps !== null && eps !== '') parts.push('EPS: ' + eps);

  const daily = getInputSeries(data, 'dailyCandles', 'daily', 30);
  if (daily.length > 0) {
    const recentDaily = daily.slice(0, 5);
    parts.push('');
    parts.push('آخرین ' + recentDaily.length + ' کندل روزانه:');
    recentDaily.forEach(function (candle, idx) {
      parts.push(summarizeCandle(candle, idx));
    });

    const closes = daily
      .map(function (c) {
        return toNumber(firstDefined(c.close, c.c), 0);
      })
      .filter(function (n) {
        return n > 0;
      });

    if (closes.length > 0) {
      const maxPrice = Math.max.apply(null, closes);
      const minPrice = Math.min.apply(null, closes);
      const avgPrice = Math.round(
        closes.reduce(function (a, b) {
          return a + b;
        }, 0) / closes.length
      );

      parts.push(
        'آمار روزانه: بیشینه=' +
        maxPrice +
        ' | کمینه=' +
        minPrice +
        ' | میانگین=' +
        avgPrice
      );
    }
  }

  const weekly = getInputSeries(data, 'weeklyCandles', 'weekly', 24);
  if (weekly.length > 0) {
    const recentWeekly = weekly.slice(0, 3);
    parts.push('');
    parts.push('آخرین ' + recentWeekly.length + ' کندل هفتگی:');
    recentWeekly.forEach(function (candle, idx) {
      parts.push(summarizeCandle(candle, idx));
    });
  }

  if (parts.length === 0) {
    return 'داده‌ای موجود نیست.';
  }

  return parts.join('\n');
}

function buildAnalysisContextPayload(data, dailyCount, weeklyCount) {
  const source = data && typeof data === 'object' ? data : {};
  const market = buildMarketDataFromInput(source);
  const daily = getInputSeries(source, 'dailyCandles', 'daily', dailyCount);
  const weekly = getInputSeries(source, 'weeklyCandles', 'weekly', weeklyCount);
  const meta = getInputDataMeta(source);
  const warnings = buildQualityWarnings(source);

  return {
    meta: {
      ontologyVersion: ONTOLOGY_VERSION,
      analysisDataQuality: meta.analysisDataQuality || '',
      hasLiveSnapshot: meta.hasLiveSnapshot,
      hasFallbackSnapshot: meta.hasFallbackSnapshot,
      hasDailyHistory: meta.hasDailyHistory,
      hasWeeklyHistory: meta.hasWeeklyHistory,
      isFallbackUsed: meta.isFallbackUsed,
      warnings: warnings,
    },
    snapshot: {
      symbol: safeText(firstDefined(source.symbol, source.insCode, source.l18), ''),
      price: {
        open: toNumber(firstDefined(getNested(source, 'price.open'), source.open), 0),
        high: toNumber(firstDefined(getNested(source, 'price.high'), source.high), 0),
        low: toNumber(firstDefined(getNested(source, 'price.low'), source.low), 0),
        last: toNumber(firstDefined(getNested(source, 'price.last'), source.lastPrice), 0),
        closing: market.lastClosePrice,
        closingChangePercent: toNumber(
          firstDefined(
            getNested(source, 'price.closingChangePercent'),
            getNested(source, 'dailySummary.changePercent'),
            source.changePercent,
            source.pcp
          ),
          0
        ),
      },
      trading: {
        volume: market.tradedVolume,
        value: toNumber(firstDefined(getNested(source, 'trading.value'), source.tradeValue), 0),
        count: toNumber(firstDefined(getNested(source, 'trading.count'), source.tradeCount), 0),
      },
      fundamental: {
        pe: firstDefined(getNested(source, 'fundamental.pe'), source.pe, source.PE, null),
        eps: firstDefined(getNested(source, 'fundamental.eps'), source.eps, source.EPS, null),
      },
      moneyFlow: {
        real: {
          inflow: market.realMoneyFlow.inflow,
          outflow: market.realMoneyFlow.outflow,
          net: market.realMoneyFlow.net,
          buyVolume: market.realMoneyFlow.buyVolume || 0,
          sellVolume: market.realMoneyFlow.sellVolume || 0,
        },
        institutional: {
          inflow: market.legalMoneyFlow.inflow,
          outflow: market.legalMoneyFlow.outflow,
          net: market.legalMoneyFlow.net,
          buyVolume: market.legalMoneyFlow.buyVolume || 0,
          sellVolume: market.legalMoneyFlow.sellVolume || 0,
        },
      },
    },
    dailyCandles: daily,
    weeklyCandles: weekly,
    daily: daily,
    weekly: weekly,
  };
}

function buildStockOutputSchema(symbol, analysisType) {
  return {
    symbol: symbol,
    recommendation: 'خرید|فروش|نگهداری',
    riskLevel: 'کم|متوسط|زیاد',
    shortTermTrend: 'صعودی|نزولی|خنثی',
    mediumTermTrend: 'صعودی|نزولی|خنثی',
    summary: 'خلاصه تحلیل در 2 تا 3 جمله',
    sentiment: 'مثبت|منفی|خنثی',
    marketData: {
      lastClosePrice: 0,
      tradedVolume: 0,
      realMoneyFlow: { inflow: 0, outflow: 0, net: 0 },
      legalMoneyFlow: { inflow: 0, outflow: 0, net: 0 },
    },
    scores: {
      fundamentalScore: 0,
      technicalScore: 0,
    },
    signals: {
      entryPoints: [{ price: 0, reason: 'دلیل ورود' }],
      exitPoints: [{ price: 0, reason: 'دلیل خروج' }],
      stopLoss: 0,
      targets: { target1: 0, target2: 0 },
      timeframe: analysisType === 'scalping' ? '1-5 روز' : 'کوتاه‌مدت/میان‌مدت',
    },
    explanations: {
      fundamental: 'توضیحات بنیادی',
      technical: 'توضیحات تکنیکال',
      additional: 'نکات تکمیلی',
    },
    confidence: 75,
  };
}

function buildStockMessages(symbol, data, analysisType, dailyCount, weeklyCount) {
  const systemPrompt = analysisType === 'scalping'
    ? SYSTEM_PROMPTS.scalping
    : SYSTEM_PROMPTS.stockAnalysis;

  const compactContext = buildAnalysisContextPayload(data, dailyCount, weeklyCount);
  const meta = getInputDataMeta(data);
  const warnings = buildQualityWarnings(data);
  const qualityCap = getConfidenceCapByQuality(data);
  const userParts = [];

  userParts.push('نماد: ' + symbol);
  userParts.push('تاریخ: ' + new Date().toLocaleDateString('fa-IR'));
  userParts.push('نوع تحلیل: ' + (analysisType === 'scalping' ? 'اسکالپینگ' : 'تحلیل جامع'));
  userParts.push('تعداد کندل روزانه: ' + dailyCount);
  userParts.push('تعداد کندل هفتگی: ' + weeklyCount);
  userParts.push('کیفیت داده: ' + (meta.analysisDataQuality || 'unknown'));
  userParts.push('سقف confidence مجاز با توجه به کیفیت داده: ' + qualityCap);

  if (warnings.length > 0) {
    userParts.push('هشدارهای کیفیت داده: ' + warnings.join(' | '));
  }

  userParts.push('');
  userParts.push('تحلیل باید فقط بر اساس snapshot و history زیر انجام شود.');
  userParts.push('اگر داده‌ای وجود ندارد، آن را صریحا ناموجود اعلام کن.');
  userParts.push('از ساختن اعداد، قیمت‌ها، حمایت/مقاومت یا سناریوی فرضی خودداری کن.');
  userParts.push('اگر کیفیت داده ضعیف است، confidence را پایین نگه دار و از توصیه تهاجمی پرهیز کن.');
  userParts.push('در صورت ناقص بودن داده، خروجی را متوقف نکن و تحلیل محافظه‌کارانه با ذکر محدودیت‌ها ارائه بده.');
  userParts.push('');

  userParts.push('خلاصه داده‌های بازار:');
  userParts.push(summarizeStockData(data));
  userParts.push('');
  userParts.push('داده ساختاریافته برای تحلیل:');
  userParts.push(JSON.stringify(compactContext, null, 2));
  userParts.push('');
  userParts.push('خروجی را فقط به صورت JSON معتبر و بدون متن اضافه برگردان.');
  userParts.push('ساختار اجباری خروجی:');
  userParts.push(JSON.stringify(buildStockOutputSchema(symbol, analysisType), null, 2));

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userParts.join('\n') },
  ];
}

/* ══════════════════════════════════════════════
   📊 analyzeStock
   ══════════════════════════════════════════════ */

async function analyzeStock(params) {
  params = params || {};

  const symbol = safeText(firstDefined(params.symbol, params.stock), '');
  const rawData = firstDefined(params.data, params.marketData, null);
  const data = rawData && typeof rawData === 'object' ? rawData : {};
  const analysisType = safeText(firstDefined(params.analysisType, params.featureKey), 'analysis');
  const dailyCount = clamp(toNumber(params.dailyCount, 30), 5, 120);
  const weeklyCount = clamp(toNumber(params.weeklyCount, 24), 1, 60);
  const model = sanitizeModel(params.model) || MODEL;
  const maxTokens = sanitizeMaxTokens(params.maxTokens) || MAX_TOKENS;
  const temperature = sanitizeTemperature(params.temperature, 0.25);
  const hasUsableData = hasMinimumAnalysisData(data);

  if (!symbol) {
    throw new Error('نماد سهام الزامی است');
  }

  const messages = buildStockMessages(symbol, data, analysisType, dailyCount, weeklyCount);

  console.log(
    '[AI] analyzeStock: ' + symbol +
    ' (' + analysisType + ')' +
    ' | usableData=' + (hasUsableData ? 'yes' : 'no') +
    ' | quality=' + (getInputDataMeta(data).analysisDataQuality || 'unknown')
  );

  const result = await fetchAI('/chat/completions', {
    model: model,
    messages: messages,
    max_tokens: maxTokens,
    temperature: temperature,
  });

  let content = '';
  if (result && result.choices && result.choices.length > 0) {
    content = result.choices[0].message
      ? result.choices[0].message.content
      : (result.choices[0].text || '');
  }

  const parsed = extractJsonFromText(content);

  if (parsed) {
    const normalized = normalizeStockAnalysis(
      parsed,
      symbol,
      data,
      result.model || model,
      result.usage || null,
      analysisType,
      'parsed'
    );

    console.log(
      '[AI] ' + symbol +
      ': ' + normalized.recommendation +
      ' (T:' + normalized.scores.technicalScore +
      ', F:' + normalized.scores.fundamentalScore +
      ', Q:' + normalized.dataQuality +
      ', W:' + normalized.warnings.length + ')'
    );

    return {
      type: analysisType === 'scalping' ? 'scalping_analysis' : 'stock_analysis',
      content: content,
      data: normalized,
      model: result.model || model,
      usage: result.usage || null,
    };
  }

  console.warn('[AI] JSON parse failed for ' + symbol + ', returning normalized fallback');

  const fallbackData = normalizeStockAnalysis(
    {
      symbol: symbol,
      recommendation: 'نگهداری',
      riskLevel: 'متوسط',
      shortTermTrend: 'خنثی',
      mediumTermTrend: 'خنثی',
      summary: content ? content.substring(0, 500) : 'پاسخی دریافت نشد',
      sentiment: 'خنثی',
      scores: { fundamentalScore: 0, technicalScore: 0 },
      signals: { entryPoints: [], exitPoints: [], stopLoss: 0, targets: {} },
      explanations: {
        fundamental: 'توضیح بنیادی کافی دریافت نشد.',
        technical: 'توضیح تکنیکال کافی دریافت نشد.',
        additional: 'خروجی JSON معتبر از مدل دریافت نشد.',
      },
      confidence: 0,
      analysisDate: new Date().toISOString(),
    },
    symbol,
    data,
    result && result.model ? result.model : model,
    result && result.usage ? result.usage : null,
    analysisType,
    'fallback-json-parse-failed'
  );

  return {
    type: analysisType === 'scalping' ? 'scalping_analysis' : 'stock_analysis',
    content: content,
    data: fallbackData,
    model: (result && result.model) || model,
    usage: (result && result.usage) || null,
  };
}

/* ══════════════════════════════════════════════
   🔄 General Analysis
   ══════════════════════════════════════════════ */

async function analyze(params) {
  params = params || {};

  const prompt = params.prompt || params.query || params.text || '';
  const symbol = params.symbol || '';
  const context = params.context || '';

  const messages = [
    { role: 'system', content: SYSTEM_PROMPTS.analyst },
    { role: 'user', content: buildAnalysisPrompt(symbol, prompt, context) },
  ];

  const result = await fetchAI('/chat/completions', {
    model: sanitizeModel(params.model) || MODEL,
    messages: messages,
    max_tokens: sanitizeMaxTokens(params.maxTokens) || MAX_TOKENS,
    temperature: sanitizeTemperature(params.temperature, 0.7),
  });

  return formatResponse(result, 'analysis');
}

/* ══════════════════════════════════════════════
   ⚖️ Compare Stocks
   ══════════════════════════════════════════════ */

async function compareStocks(params) {
  params = params || {};

  const symbols = params.symbols || params.stocks || [];
  const criteria = params.criteria || 'عمومی';

  if (!Array.isArray(symbols) || symbols.length < 2) {
    throw new Error('حداقل دو نماد برای مقایسه لازم است');
  }

  const userParts = [];
  userParts.push('لطفاً نمادهای زیر را مقایسه کن:');
  userParts.push('نمادها: ' + symbols.join('، '));
  userParts.push('معیارهای مقایسه: ' + criteria);
  userParts.push('');
  userParts.push('الزام زبان خروجی: تمام مقدارهای متنی پاسخ باید فقط به زبان فارسی طبیعی و حرفه‌ای باشند. هیچ واژه یا جمله انگلیسی در متن خروجی مجاز نیست. کلیدهای JSON انگلیسی و ثابت باقی بمانند، اما مقدارهای متنی آن‌ها فارسی باشند. مقادیر recommendation فقط یکی از «خرید قوی»، «خرید»، «نگهداری»، «فروش»، «فروش قوی» یا «خنثی» باشند. نام نمادها، EPS، P/E و اعداد مالی ترجمه نشوند.');
  userParts.push('پاسخ فقط JSON معتبر باشد و هیچ متن خارج از JSON تولید نشود.');

  if (params.data) {
    userParts.push('');
    userParts.push('داده‌ها:');
    userParts.push(JSON.stringify(params.data, null, 2));
  }

  userParts.push('');
  userParts.push('پاسخ را در JSON برگردان:');
  userParts.push(
    JSON.stringify(
      {
        winner: symbols[0],
        reason: 'دلیل انتخاب به زبان فارسی',
        scores: symbols.reduce(function (acc, s) {
          acc[s] = 0;
          return acc;
        }, {}),
        details: 'جزئیات مقایسه به زبان فارسی',
      },
      null,
      2
    )
  );

  const messages = [
    { role: 'system', content: SYSTEM_PROMPTS.comparator },
    { role: 'user', content: userParts.join('\n') },
  ];

  console.log('[AI] compareStocks: ' + symbols.join(' vs '));

  const result = await fetchAI('/chat/completions', {
    model: sanitizeModel(params.model) || MODEL,
    messages: messages,
    max_tokens: sanitizeMaxTokens(params.maxTokens) || MAX_TOKENS,
    temperature: 0.5,
  });

  let content = '';
  if (result && result.choices && result.choices.length > 0) {
    content = result.choices[0].message ? result.choices[0].message.content : '';
  }

  const parsed = extractJsonFromText(content);

  return {
    type: 'comparison',
    content: content,
    data: parsed || {
      winner: symbols[0],
      reason: content ? content.substring(0, 300) : 'مقایسه ناموفق',
      scores: {},
      details: content,
    },
    model: result.model || MODEL,
    usage: result.usage || null,
  };
}

/* ══════════════════════════════════════════════
   💼 Portfolio Optimization
   ══════════════════════════════════════════════ */

async function optimizePortfolio(params) {
  params = params || {};

  const portfolio = params.portfolio || params.items || [];
  const analyses = params.analyses || [];

  if (!Array.isArray(portfolio) || portfolio.length === 0) {
    throw new Error('سبد سرمایه‌گذاری خالی است');
  }

  const context = portfolio.map(function (item, idx) {
    const analysis = analyses[idx] || {};
    return {
      symbol: item.symbol,
      quantity: item.quantity || 0,
      avgPrice: item.avgPrice || item.averagePrice || 0,
      recommendation: analysis.recommendation || 'نامشخص',
      riskLevel: analysis.riskLevel || 'متوسط',
    };
  });

  const userParts = [];
  userParts.push('سبد سرمایه‌گذاری کاربر:');
  userParts.push(JSON.stringify(context, null, 2));
  userParts.push('');
  userParts.push('لطفاً پیشنهادات بهینه‌سازی ارائه بده:');
  userParts.push(
    JSON.stringify(
      {
        summary: 'خلاصه وضعیت سبد',
        riskScore: 75,
        diversificationScore: 60,
        recommendations: [
          { symbol: 'نماد', action: 'خرید|فروش|نگهداری', reason: 'دلیل' },
        ],
      },
      null,
      2
    )
  );

  const messages = [
    { role: 'system', content: SYSTEM_PROMPTS.portfolio },
    { role: 'user', content: userParts.join('\n') },
  ];

  console.log('[AI] optimizePortfolio: ' + portfolio.length + ' items');

  const result = await fetchAI('/chat/completions', {
    model: sanitizeModel(params.model) || MODEL,
    messages: messages,
    max_tokens: sanitizeMaxTokens(params.maxTokens) || MAX_TOKENS,
    temperature: 0.5,
  });

  let content = '';
  if (result && result.choices && result.choices.length > 0) {
    content = result.choices[0].message ? result.choices[0].message.content : '';
  }

  const parsed = extractJsonFromText(content);

  return {
    type: 'portfolio_optimization',
    content: content,
    data: parsed || {
      summary: 'تحلیل سبد در دسترس نیست',
      riskScore: 50,
      diversificationScore: 50,
      recommendations: [],
    },
    model: result.model || MODEL,
    usage: result.usage || null,
  };
}

/* ══════════════════════════════════════════════
   💬 Chat
   ══════════════════════════════════════════════ */

async function chat(params) {
  params = params || {};

  const messages = [];
  messages.push({
    role: 'system',
    content: params.systemPrompt || SYSTEM_PROMPTS.chat,
  });

  if (params.history && Array.isArray(params.history)) {
    params.history.forEach(function (msg) {
      if (msg && (msg.content || msg.text)) {
        messages.push({
          role: msg.role || 'user',
          content: msg.content || msg.text || '',
        });
      }
    });
  }

  const userMessage = params.message || params.content || params.prompt || params.query || '';
  if (userMessage) {
    messages.push({ role: 'user', content: userMessage });
  }

  if (messages.length < 2) {
    throw new Error('پیامی برای ارسال وجود ندارد');
  }

  console.log('[AI] Chat: ' + messages.length + ' messages');

  const result = await fetchAI('/chat/completions', {
    model: sanitizeModel(params.model) || MODEL,
    messages: messages,
    max_tokens: sanitizeMaxTokens(params.maxTokens) || MAX_TOKENS,
    temperature: sanitizeTemperature(params.temperature, 0.7),
    stream: false,
  });

  return formatResponse(result, 'chat');
}

/* ══════════════════════════════════════════════
   🔧 Helpers
   ══════════════════════════════════════════════ */

function buildAnalysisPrompt(symbol, prompt, context) {
  const parts = [];
  if (symbol) parts.push('نماد: ' + symbol);
  if (prompt) parts.push(prompt);
  if (context) parts.push('\nاطلاعات تکمیلی:\n' + context);
  return parts.join('\n') || 'لطفاً تحلیل کلی بازار را ارائه دهید.';
}

function formatResponse(apiResult, type) {
  if (!apiResult || !apiResult.choices || apiResult.choices.length === 0) {
    return {
      type: type,
      content: 'پاسخی از سرویس AI دریافت نشد.',
      data: null,
      model: null,
      usage: null,
    };
  }

  const choice = apiResult.choices[0];
  const content = choice.message ? choice.message.content : (choice.text || '');
  const parsed = extractJsonFromText(content);

  return {
    type: type,
    content: content,
    data: parsed,
    model: apiResult.model || MODEL,
    usage: apiResult.usage || null,
    finishReason: choice.finish_reason || null,
  };
}

/* ══════════════════════════════════════════════
   🏥 Health Check
   ══════════════════════════════════════════════ */

async function healthCheck() {
  try {
    if (!API_KEY) {
      return { ok: false, error: 'API key not configured' };
    }

    const result = await fetchAI('/chat/completions', {
      model: FALLBACK_MODEL,
      messages: [
        { role: 'system', content: 'You are a test assistant.' },
        { role: 'user', content: 'Respond with JSON: {"status":"ok"}' },
      ],
      max_tokens: 50,
      temperature: 0,
    });

    let content = '';
    if (result && result.choices && result.choices.length > 0) {
      content = result.choices[0].message ? result.choices[0].message.content : '';
    }

    return {
      ok: true,
      model: result.model || FALLBACK_MODEL,
      response: content.substring(0, 120),
    };
  } catch (err) {
    return {
      ok: false,
      error: err.message,
    };
  }
}

/* ══════════════════════════════════════════════
   📤 Module Exports
   ══════════════════════════════════════════════ */

const isAvailable = !!API_KEY;

if (isAvailable) {
  console.log('[AI SERVICE] AI service initialized');
  console.log('[AI SERVICE] Model: ' + MODEL + ' (fallback: ' + FALLBACK_MODEL + ')');
  console.log('[AI SERVICE] API URL: ' + API_URL);
  console.log('[AI SERVICE] API Key: ' + API_KEY.substring(0, 8) + '...');
  console.log('[AI SERVICE] Timeout: ' + FETCH_TIMEOUT + 'ms | Retries: ' + MAX_RETRIES);
} else {
  console.warn('[AI SERVICE] AI API key not configured (GAPGPT_API_KEY) - AI features disabled');
}

module.exports = {
  analyze: analyze,
  analyzeStock: analyzeStock,
  compareStocks: compareStocks,
  optimizePortfolio: optimizePortfolio,
  chat: chat,

  healthCheck: healthCheck,
  extractJsonFromText: extractJsonFromText,

  isAvailable: isAvailable,
  getConfig: function () {
    return {
      model: MODEL,
      fallbackModel: FALLBACK_MODEL,
      apiUrl: API_URL,
      maxTokens: MAX_TOKENS,
      timeout: FETCH_TIMEOUT,
      maxRetries: MAX_RETRIES,
      isAvailable: isAvailable,
    };
  },
};
