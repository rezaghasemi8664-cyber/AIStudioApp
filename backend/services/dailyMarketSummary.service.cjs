'use strict';

const axios = require('axios');
const prisma = require('../config/prisma.cjs');

const TEHRAN_TIMEZONE = 'Asia/Tehran';
const INTERNAL_PORT = Number(process.env.PORT || 3001);
const LIVE_ENDPOINT = `http://127.0.0.1:${INTERNAL_PORT}/api/v1/market-summary/latest`;

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

  const response = await axios.get(LIVE_ENDPOINT, {
    timeout: 60000,
    headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' }
  });

  const payload = response?.data;
  if (!payload?.success || !payload?.data) {
    throw new Error('LIVE_MARKET_SUMMARY_UNAVAILABLE');
  }

  const live = payload.data;
  const expectedGregorian = todayGregorian();
  const expectedJalali = todayJalali();
  const liveGregorian = String(live.date || live.summaryDate || '').slice(0, 10);
  const liveJalali = normalizeJalali(live.marketDateJalali);

  if (liveGregorian !== expectedGregorian || (liveJalali && liveJalali !== expectedJalali)) {
    return {
      success: false,
      generated: false,
      skipped: true,
      reason: 'MARKET_DATA_NOT_FOR_TODAY',
      diagnostics: { expectedGregorian, liveGregorian, expectedJalali, liveJalali }
    };
  }

  const trades = n(live.totalTrades);
  const volume = n(live.totalVolume);
  const value = n(live.totalValue);
  if (!(trades > 0) || !(volume > 0) || !(value > 0)) {
    return { success: false, generated: false, skipped: true, reason: 'NO_TRADING_ACTIVITY' };
  }

  const summaryDate = toDateOnly(live.date || live.summaryDate);
  if (!summaryDate) throw new Error('INVALID_SUMMARY_DATE');

  const dataForDb = {
    date: now,
    summaryDate,
    overallIndex: n(live.overallIndex),
    overallChange: n(live.overallChange),
    equalIndex: n(live.equalIndex),
    equalChange: n(live.equalChange),
    marketStatus: String(live.marketStatus || 'closed'),
    totalTrades: trades === null ? null : BigInt(Math.trunc(trades)),
    totalVolume: volume === null ? null : BigInt(Math.trunc(volume)),
    totalValue: value === null ? null : BigInt(Math.trunc(value)),
    positiveStocks: n(live.positiveStocks),
    negativeStocks: n(live.negativeStocks),
    neutralStocks: n(live.neutralStocks),
    topGainers: JSON.stringify(live.topGainers || []),
    topLosers: JSON.stringify(live.topLosers || []),
    topVolumes: JSON.stringify(live.topVolumes || []),
    content: typeof live.content === 'string' ? live.content : typeof live.summary === 'string' ? live.summary : null,
    summary: typeof live.summary === 'string' ? live.summary : typeof live.content === 'string' ? live.content : null,
    rawJson: JSON.stringify({
      data: live,
      meta: {
        source: 'daily-market-summary',
        generatedAt: now.toISOString(),
        generatedAtTehran: `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`,
        sourceEndpoint: LIVE_ENDPOINT
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
