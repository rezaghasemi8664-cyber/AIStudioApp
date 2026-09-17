'use strict';

/**
 * Market Summary Cron Job
 *
 * Schedule (Tehran):
 * - Primary: 12:35
 * - Retries: 12:40, 12:45, 12:55, 13:10, 13:30
 * - Recovery: 18:00 only when today's summary is still missing
 * - Saturday through Wednesday only
 * - Never creates duplicate records for a day
 */

const cron = require('node-cron');
const prisma = require('../config/prisma.cjs');
const dailyMarketSummaryService = require('../services/dailyMarketSummary.service.cjs');

const TEHRAN_TIMEZONE = 'Asia/Tehran';
const TRADING_DAYS = '0,1,2,3,6';
const SCHEDULES = [
  { expression: `35 12 * * ${TRADING_DAYS}`, attempt: 1, label: '12:35 primary' },
  { expression: `40 12 * * ${TRADING_DAYS}`, attempt: 2, label: '12:40 retry' },
  { expression: `45 12 * * ${TRADING_DAYS}`, attempt: 3, label: '12:45 retry' },
  { expression: `55 12 * * ${TRADING_DAYS}`, attempt: 4, label: '12:55 retry' },
  { expression: `10 13 * * ${TRADING_DAYS}`, attempt: 5, label: '13:10 retry' },
  { expression: `30 13 * * ${TRADING_DAYS}`, attempt: 6, label: '13:30 retry' },
  { expression: `0 18 * * ${TRADING_DAYS}`, attempt: 7, label: '18:00 recovery' }
];

let tasks = [];
let eodRunning = false;

function nowTehranString() {
  return new Date().toLocaleString('en-CA', {
    timeZone: TEHRAN_TIMEZONE,
    hour12: false
  });
}

function todayTehranDateOnly() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TEHRAN_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const out = {};
  for (const p of parts) if (p.type !== 'literal') out[p.type] = p.value;
  return new Date(`${out.year}-${out.month}-${out.day}T00:00:00.000Z`);
}

async function hasTodaySummary() {
  const summaryDate = todayTehranDateOnly();
  const existing = await prisma.marketSummary.findUnique({ where: { summaryDate } });
  return Boolean(existing);
}

async function runEndOfDaySummaryJob(attempt, label) {
  if (eodRunning) {
    console.log(`[Cron][MarketSummary] attempt=${attempt} skipped=ALREADY_RUNNING | ${label}`);
    return { success: false, skipped: true, reason: 'ALREADY_RUNNING', attempt };
  }

  eodRunning = true;
  try {
    const alreadyExists = await hasTodaySummary();
    if (alreadyExists) {
      console.log(`[Cron][MarketSummary] attempt=${attempt} skipped=SUMMARY_ALREADY_EXISTS | ${label}`);
      return { success: true, generated: false, skipped: true, reason: 'SUMMARY_ALREADY_EXISTS', attempt };
    }

    console.log(`[Cron][MarketSummary] attempt=${attempt} started | ${label} | Tehran: ${nowTehranString()}`);

    const result = await dailyMarketSummaryService.generateDailyMarketSummary({ scheduledRun: true });
    const id = result?.id || result?.data?.id || null;

    console.log(
      `[Cron][MarketSummary] attempt=${attempt} ${result?.generated ? '🆕 Generated' : result?.updated ? '♻️ Updated' : result?.skipped ? '⏭️ Skipped' : '✅ OK'} | id=${id ?? 'N/A'} reason=${result?.reason || '-'}${result?.error ? ` error=${result.error}` : ''}`
    );

    return { ...result, attempt };
  } catch (error) {
    console.error(`[Cron][MarketSummary] attempt=${attempt} ERROR | ${label} |`, error?.message || error);
    return {
      success: false,
      error: error?.message || String(error),
      attempt
    };
  } finally {
    eodRunning = false;
  }
}

function startMarketSummaryCron() {
  if (tasks.length > 0) {
    console.log('[Cron] ℹ️ Market Summary retry cron already started. Skipping duplicate start.');
    return { tasks };
  }

  tasks = SCHEDULES.map(({ expression, attempt, label }) =>
    cron.schedule(
      expression,
      async () => {
        try {
          await runEndOfDaySummaryJob(attempt, label);
        } catch (error) {
          console.error(`[Cron][MarketSummary] unhandled attempt=${attempt} error:`, error?.message || error);
        }
      },
      { timezone: TEHRAN_TIMEZONE }
    )
  );

  console.log('[Cron] ✅ Market Summary scheduled: 12:35 primary + 12:40/12:45/12:55/13:10/13:30 retries + 18:00 recovery; Tehran; no duplicate daily records.');
  return { tasks };
}

function stopMarketSummaryCron() {
  for (const task of tasks) task.stop();
  tasks = [];
  console.log('[Cron] 🛑 Market Summary retry tasks stopped.');
}

if (require.main === module) {
  console.log('[Cron][MarketSummary] 🛠 Manual mode detected.');
  startMarketSummaryCron();
}

module.exports = {
  startMarketSummaryCron,
  stopMarketSummaryCron,
  runMarketSummaryNow: () => runEndOfDaySummaryJob(0, 'manual')
};
