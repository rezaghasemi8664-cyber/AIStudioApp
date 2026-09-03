'use strict';

const axios = require('axios');
const prisma = require('../config/prisma.cjs');

const TEHRAN_TIMEZONE = 'Asia/Tehran';
const INTERNAL_PORT = Number(process.env.PORT || 3001);
const LIVE_ENDPOINT = `http://127.0.0.1:${INTERNAL_PORT}/api/v1/market-summary/live`;

function tehranParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TEHRAN_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(date);
  const out = {};
  for (const p of parts) if (p.type !== 'literal') out[p.type] = p.value;
  return out;
}

function todayGregorian() {
  const p = tehranParts();
  return `${p.year}-${p.month}-${p.day}`;
}

function todayJalali() {
  const parts = new Intl.DateTimeFormat('en-US-u-ca-persian', {
    timeZone: TEHRAN_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const out = {};
  for (const p of parts) if (p.type !== 'literal') out[p.type] = p.value;
  return `${out.year}-${out.month}-${out.day}`;
}

function isTradingCalendarDay() {
  const weekday = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: TEHRAN_TIMEZONE
  }).format(new Date());
  return ['Sat', 'Sun', 'Mon', 'Tue', 'Wed'].includes(weekday);
}

function n(value) {
  const x = Number(String(value ?? '').replace(/,/g, '').replace(/٪/g, '').trim());
  return Number.isFinite(x) ? x : null;
}

function normalizeJalali(value) {
  if (!value) return null;
  const text = String(value).trim().replace(/\//g, '-');
  const match = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) return null;
  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
}

function toDateOnly(value) {
  const text = String(value || '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return new Date(`${text}T00:00:00.000Z`);
  return null;
}

function datePart(value) {
  const text = String(value || '').trim().replace(/\//g, '-');
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function isLiveDataForToday(live, expectedGregorian, expectedJalali) {
  const explicitJalali = normalizeJalali(live.marketDateJalali);
  if (explicitJalali && explicitJalali !== expectedJalali) return false;

  const candidates = [live.date, live.summaryDate, live.tradingDate, live.marketDate]
    .map(datePart)
    .filter(Boolean);

  for (const candidate of candidates) {
    // تاریخ ۱۴۰۵-... جلالی است؛ تاریخ ۲۰۲۶-... میلادی است.
    if (/^1[34]\d{2}-/.test(candidate)) return candidate === expectedJalali;
    if (/^20\d{2}-/.test(candidate)) return candidate === expectedGregorian;
  }

  if (explicitJalali) return true;

  const lastUpdate = live.lastUpdate || live.timestamp || live.updatedAt;
  if (lastUpdate) {
    const lastUpdateDate = datePart(new Intl.DateTimeFormat('en-CA', {
      timeZone: TEHRAN_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date(lastUpdate)));
    if (lastUpdateDate === expectedGregorian) return true;
  }

  return false;
}

async function generateDailyMarketSummary() {
  const now = new Date();
  const p = tehranParts(now);
  const minute = Number(p.minute);
  const hour = Number(p.hour);

  if (hour !== 12 || minute !== 35) {
    return { success: false, generated: false, skipped: true, reason: 'OUTSIDE_12_35_WINDOW' };
  }

  if (!isTradingCalendarDay()) {
    return { success: false, generated: false, skipped: true, reason: 'NON_TRADING_DAY' };
  }

  const internalKey = process.env.INTERNAL_API_KEY || process.env.ADMIN_SECRET;
  if (!internalKey) throw new Error('INTERNAL_API_KEY_NOT_CONFIGURED');

  const response = await axios.get(LIVE_ENDPOINT, {
    timeout: 60000,
    headers: {
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
      'x-internal-key': internalKey
    }
  });

  const payload = response?.data;
  if (!payload?.success || !payload?.data) {
    throw new Error('LIVE_MARKET_SUMMARY_UNAVAILABLE');
  }

  const live = payload.data;
  const expectedGregorian = todayGregorian();
  const expectedJalali = todayJalali();

  if (!isLiveDataForToday(live, expectedGregorian, expectedJalali)) {
    return {
      success: false,
      generated: false,
      skipped: true,
      reason: 'MARKET_DATA_NOT_FOR_TODAY',
      diagnostics: {
        expectedGregorian,
        expectedJalali,
        liveDate: live.date || null,
        liveSummaryDate: live.summaryDate || null,
        liveMarketDateJalali: live.marketDateJalali || null
      }
    };
  }

  const trades = n(live.totalTrades ?? live.tradeCount ?? live.tno);
  const volume = n(live.totalVolume ?? live.tradeVolume ?? live.tvol ?? live.volume);
  const value = n(live.totalValue ?? live.tradeValue ?? live.tval);
  if (!(trades > 0) || !(volume > 0) || !(value > 0)) {
    return { success: false, generated: false, skipped: true, reason: 'NO_TRADING_ACTIVITY' };
  }

  // summaryDate همیشه از تاریخ میلادی امروز ساخته می‌شود؛ date موجود در BRS ممکن است جلالی باشد.
  const summaryDate = toDateOnly(expectedGregorian);
  if (!summaryDate) throw new Error('INVALID_SUMMARY_DATE');

  const content = typeof live.content === 'string' && live.content.trim()
    ? live.content
    : typeof live.summary === 'string' && live.summary.trim()
      ? live.summary
      : null;

  if (!content) throw new Error('LIVE_MARKET_SUMMARY_CONTENT_UNAVAILABLE');

  const dataForDb = {
    date: now,
    summaryDate,
    overallIndex: n(live.overallIndex ?? live.index ?? live.value),
    overallChange: n(live.overallChange ?? live.indexChange ?? live.index_change ?? live.changeValue ?? live.change),
    equalIndex: n(live.equalIndex ?? live.indexEqualWeight ?? live.index_equalWeight ?? live.equalWeightedValue),
    equalChange: n(live.equalChange ?? live.indexEqualWeightChange ?? live.index_equalWeight_change ?? live.equalWeightedChangeValue),
    marketStatus: String(live.marketStatus ?? live.marketState ?? live.state ?? 'closed'),
    totalTrades: BigInt(Math.trunc(trades)),
    totalVolume: BigInt(Math.trunc(volume)),
    totalValue: BigInt(Math.trunc(value)),
    positiveStocks: n(live.positiveStocks ?? live.positive),
    negativeStocks: n(live.negativeStocks ?? live.negative),
    neutralStocks: n(live.neutralStocks ?? live.neutral),
    topGainers: JSON.stringify(live.topGainers || []),
    topLosers: JSON.stringify(live.topLosers || []),
    topVolumes: JSON.stringify(live.topVolumes || []),
    // همان متن واقعی ۱۴بخشی تولیدشده توسط liveMarketSummary.controller.cjs ذخیره می‌شود.
    content,
    summary: content,
    rawJson: JSON.stringify({
      data: live,
      meta: {
        source: 'live-market-summary-controller',
        generatedAt: now.toISOString(),
        generatedAtTehran: `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`,
        sourceEndpoint: LIVE_ENDPOINT,
        jalaliDate: expectedJalali,
        gregorianDate: expectedGregorian
      }
    })
  };

  const existing = await prisma.marketSummary.findUnique({ where: { summaryDate } });
  const record = existing
    ? await prisma.marketSummary.update({ where: { id: existing.id }, data: dataForDb })
    : await prisma.marketSummary.create({ data: dataForDb });

  return {
    success: true,
    generated: !existing,
    updated: Boolean(existing),
    skipped: false,
    id: record.id,
    data: record,
    sourceType: 'daily-live-analysis',
    reason: existing ? 'UPDATED_EXISTING_DAY' : 'CREATED_AT_12_35'
  };
}

module.exports = { generateDailyMarketSummary };
