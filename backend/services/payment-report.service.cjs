'use strict';

const { prisma } = require('../config/prisma.cjs');

const MONTH_NAMES = Object.freeze([
  'فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور',
  'مهر','آبان','آذر','دی','بهمن','اسفند',
]);

function jalaliParts(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date);
  const parts = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(value);
  const get = (type) => Number(parts.find((p) => p.type === type)?.value || 0);
  return { year: get('year'), month: get('month'), day: get('day') };
}

function jalaliLabel(year, month, day) {
  return day == null
    ? `${year}/${String(month).padStart(2, '0')}`
    : `${year}/${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
}

function monthName(month) {
  return MONTH_NAMES[Number(month) - 1] || String(month);
}

function monthStartGregorianFor(jYear, jMonth, reference = new Date()) {
  let cursor = new Date(reference);
  for (let i = 0; i < 45; i += 1) {
    const p = jalaliParts(cursor);
    if (p.year === jYear && p.month === jMonth && p.day === 1) return cursor;
    cursor = new Date(cursor.getTime() - 86400000);
  }
  throw new Error('شروع ماه شمسی جاری پیدا نشد.');
}

function currentMonthDayCount(now = new Date()) {
  const current = jalaliParts(now);
  let cursor = monthStartGregorianFor(current.year, current.month, now);
  let count = 0;
  while (count < 32) {
    const p = jalaliParts(cursor);
    if (p.year !== current.year || p.month !== current.month) break;
    count += 1;
    cursor = new Date(cursor.getTime() + 86400000);
  }
  return count;
}

async function cleanupRetention(current) {
  await prisma.$executeRaw`
    DELETE FROM dbo.PaymentDailySummary
    WHERE jalaliYear <> ${current.year} OR jalaliMonth <> ${current.month}
  `;
  await prisma.$executeRaw`
    DELETE FROM dbo.PaymentMonthlySummary
    WHERE jalaliYear <> ${current.year}
  `;
}

async function aggregatePaymentsByJalaliYearMonthDay() {
  const rows = await prisma.$queryRaw`
    SELECT paidAt, amount
    FROM dbo.PaymentTransaction
    WHERE status = N'VERIFIED'
      AND paidAt IS NOT NULL
  `;
  const daily = new Map();
  const monthly = new Map();
  const yearly = new Map();

  for (const row of rows) {
    const parts = jalaliParts(row.paidAt);
    if (!parts.year || !parts.month || !parts.day) continue;
    const amount = Number(row.amount || 0);
    const dayKey = `${parts.year}-${parts.month}-${parts.day}`;
    const monthKey = `${parts.year}-${parts.month}`;

    const d = daily.get(dayKey) || { year: parts.year, month: parts.month, day: parts.day, count: 0, amount: 0 };
    d.count += 1; d.amount += amount; daily.set(dayKey, d);

    const m = monthly.get(monthKey) || { year: parts.year, month: parts.month, count: 0, amount: 0 };
    m.count += 1; m.amount += amount; monthly.set(monthKey, m);

    const y = yearly.get(parts.year) || { year: parts.year, count: 0, amount: 0 };
    y.count += 1; y.amount += amount; yearly.set(parts.year, y);
  }

  return { daily, monthly, yearly };
}

async function syncSummaries(now = new Date()) {
  const current = jalaliParts(now);
  const aggregates = await aggregatePaymentsByJalaliYearMonthDay();

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      DELETE FROM dbo.PaymentDailySummary
      WHERE jalaliYear <> ${current.year} OR jalaliMonth <> ${current.month}
    `;
    await tx.$executeRaw`
      DELETE FROM dbo.PaymentMonthlySummary
      WHERE jalaliYear <> ${current.year}
    `;

    for (const item of aggregates.daily.values()) {
      if (item.year !== current.year || item.month !== current.month) continue;
      await tx.$executeRaw`
        MERGE dbo.PaymentDailySummary AS target
        USING (SELECT ${item.year} AS jalaliYear, ${item.month} AS jalaliMonth, ${item.day} AS jalaliDay) AS source
        ON target.jalaliYear = source.jalaliYear
           AND target.jalaliMonth = source.jalaliMonth
           AND target.jalaliDay = source.jalaliDay
        WHEN MATCHED THEN UPDATE SET paymentCount=${item.count}, totalAmount=${item.amount}, updatedAt=SYSDATETIME()
        WHEN NOT MATCHED THEN INSERT (jalaliYear,jalaliMonth,jalaliDay,paymentCount,totalAmount)
          VALUES (source.jalaliYear,source.jalaliMonth,source.jalaliDay,${item.count},${item.amount});
      `;
    }

    for (const item of aggregates.monthly.values()) {
      if (item.year !== current.year) continue;
      await tx.$executeRaw`
        MERGE dbo.PaymentMonthlySummary AS target
        USING (SELECT ${item.year} AS jalaliYear, ${item.month} AS jalaliMonth) AS source
        ON target.jalaliYear = source.jalaliYear AND target.jalaliMonth = source.jalaliMonth
        WHEN MATCHED THEN UPDATE SET paymentCount=${item.count}, totalAmount=${item.amount}, updatedAt=SYSDATETIME()
        WHEN NOT MATCHED THEN INSERT (jalaliYear,jalaliMonth,paymentCount,totalAmount)
          VALUES (source.jalaliYear,source.jalaliMonth,${item.count},${item.amount});
      `;
    }

    for (const item of aggregates.yearly.values()) {
      await tx.$executeRaw`
        MERGE dbo.PaymentYearlySummary AS target
        USING (SELECT ${item.year} AS jalaliYear) AS source
        ON target.jalaliYear = source.jalaliYear
        WHEN MATCHED THEN UPDATE SET paymentCount=${item.count}, totalAmount=${item.amount}, updatedAt=SYSDATETIME()
        WHEN NOT MATCHED THEN INSERT (jalaliYear,paymentCount,totalAmount)
          VALUES (source.jalaliYear,${item.count},${item.amount});
      `;
    }
  });

  return current;
}

async function getReport(period = 'monthly', now = new Date()) {
  const normalized = ['daily', 'monthly', 'yearly'].includes(String(period)) ? String(period) : 'monthly';
  const current = await syncSummaries(now);

  if (normalized === 'daily') {
    const rows = await prisma.$queryRaw`
      SELECT jalaliDay AS day, paymentCount, totalAmount
      FROM dbo.PaymentDailySummary
      WHERE jalaliYear = ${current.year} AND jalaliMonth = ${current.month}
      ORDER BY jalaliDay ASC
    `;
    const byDay = new Map(rows.map((r) => [Number(r.day), r]));
    const days = currentMonthDayCount(now);
    const items = Array.from({ length: days }, (_, i) => {
      const day = i + 1;
      const row = byDay.get(day);
      return {
        key: jalaliLabel(current.year, current.month, day),
        label: String(day),
        day,
        month: current.month,
        year: current.year,
        paymentCount: Number(row?.paymentCount || 0),
        totalAmount: Number(row?.totalAmount || 0),
      };
    });
    return { period: normalized, calendar: 'jalali', year: current.year, month: current.month, monthName: monthName(current.month), items };
  }

  if (normalized === 'monthly') {
    const rows = await prisma.$queryRaw`
      SELECT jalaliMonth AS month, paymentCount, totalAmount
      FROM dbo.PaymentMonthlySummary
      WHERE jalaliYear = ${current.year}
      ORDER BY jalaliMonth ASC
    `;
    const byMonth = new Map(rows.map((r) => [Number(r.month), r]));
    const items = Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      const row = byMonth.get(month);
      return {
        key: jalaliLabel(current.year, month),
        label: monthName(month),
        month,
        year: current.year,
        paymentCount: Number(row?.paymentCount || 0),
        totalAmount: Number(row?.totalAmount || 0),
      };
    });
    return { period: normalized, calendar: 'jalali', year: current.year, items };
  }

  const rows = await prisma.$queryRaw`
    SELECT jalaliYear AS year, paymentCount, totalAmount
    FROM dbo.PaymentYearlySummary
    ORDER BY jalaliYear ASC
  `;
  return {
    period: normalized,
    calendar: 'jalali',
    items: rows.map((r) => ({
      key: String(Number(r.year)),
      label: String(Number(r.year)),
      year: Number(r.year),
      paymentCount: Number(r.paymentCount || 0),
      totalAmount: Number(r.totalAmount || 0),
    })),
  };
}

module.exports = { jalaliParts, monthName, syncSummaries, getReport };
