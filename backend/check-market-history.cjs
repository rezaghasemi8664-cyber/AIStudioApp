/**
 * اسکریپت تشخیصی: بررسی تعداد ردیف‌های MarketHistory و MarketSummary
 * به تفکیک روز، برای فهمیدن اینکه برای کدام روزها داده‌ی خام بازار
 * ذخیره شده و برای کدام روزها تحلیل نهایی ساخته شده است.
 *
 * نحوه‌ی اجرا (از داخل پوشه‌ی backend پروژه، روی سرور):
 *   node check-market-history.cjs
 *
 * این اسکریپت فقط می‌خواند (SELECT)، هیچ داده‌ای را تغییر یا حذف نمی‌کند.
 */
'use strict';

const path = require('path');
const prisma = require(path.join(__dirname, 'config', 'prisma.cjs'));

function toDateOnly(d) {
  if (!d) return null;
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  // نمایش بر اساس UTC که همان چیزی است که در دیتابیس ذخیره شده
  return dt.toISOString().slice(0, 10);
}

async function main() {
  console.log('=== بررسی جدول MarketHistory (داده‌ی خام هر ۲ دقیقه) ===\n');

  const historyRows = await prisma.MarketHistory.findMany({
    select: { id: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 5000,
  });

  const historyByDay = new Map();
  for (const row of historyRows) {
    const day = toDateOnly(row.createdAt);
    if (!day) continue;
    historyByDay.set(day, (historyByDay.get(day) || 0) + 1);
  }

  if (historyByDay.size === 0) {
    console.log('هیچ ردیفی در MarketHistory یافت نشد (جدول کاملاً خالی است).\n');
  } else {
    const sortedDays = Array.from(historyByDay.keys()).sort().reverse();
    for (const day of sortedDays.slice(0, 15)) {
      console.log(`  ${day}  ->  ${historyByDay.get(day)} ردیف`);
    }
    console.log('');
  }

  console.log('=== بررسی جدول MarketSummary (تحلیل‌های ساخته‌شده) ===\n');

  const summaryRows = await prisma.MarketSummary.findMany({
    select: { id: true, summaryDate: true, createdAt: true },
    orderBy: { summaryDate: 'desc' },
    take: 20,
  });

  if (summaryRows.length === 0) {
    console.log('هیچ رکوردی در MarketSummary یافت نشد.\n');
  } else {
    for (const row of summaryRows) {
      console.log(
        `  id=${row.id}  summaryDate=${toDateOnly(row.summaryDate)}  createdAt=${toDateOnly(
          row.createdAt
        )}`
      );
    }
    console.log('');
  }

  console.log('=== نتیجه‌گیری خودکار ===\n');
  const today = toDateOnly(new Date());
  const summaryDays = new Set(summaryRows.map((r) => toDateOnly(r.summaryDate)));
  const missing = [];
  for (const day of Array.from(historyByDay.keys()).sort().reverse().slice(0, 10)) {
    if (day === today) continue;
    if (!summaryDays.has(day)) {
      missing.push({ day, rows: historyByDay.get(day) });
    }
  }

  if (missing.length === 0) {
    console.log('هیچ روزِ «دارای داده‌ی خام ولی بدون تحلیل» پیدا نشد.');
    console.log('اگر تب خالی است، یعنی برای روزهای موردنظر اصلاً داده‌ی خامی در MarketHistory ذخیره نشده بوده.');
  } else {
    console.log('روزهایی که داده‌ی خام دارند ولی هنوز تحلیل ندارند (کاندیدای catch-up):');
    for (const m of missing) {
      console.log(`  ${m.day}  (${m.rows} ردیف داده‌ی خام موجود)`);
    }
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('خطا در اجرای اسکریپت:', err);
  try {
    await prisma.$disconnect();
  } catch (_) {}
  process.exit(1);
});
