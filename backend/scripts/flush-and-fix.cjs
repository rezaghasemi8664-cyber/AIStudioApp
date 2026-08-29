'use strict';
const prismaModule = require('../config/prisma.cjs');
const prisma = prismaModule.prisma || prismaModule.default || prismaModule;

async function flushAndFix() {
  console.log("⚠️ در حال پاکسازی داده‌های اشتباه قبلی...");
  
  // ۱. حذف رکوردهای قبلی که اعداد اشتباه داشتند
  await prisma.marketSummary.deleteMany({});
  
  console.log("✅ دیتابیس پاکسازی شد. حالا سیستم در اولین فراخوانی دیتای جدید می‌گیرد.");
  
  // ۲. بررسی ساختار فیلدها در سرویس اصلی
  console.log("ℹ️ لطفاً مطمئن شوید سرویس BRS دیتای واقعی برمی‌گرداند.");
}

flushAndFix()
  .catch(err => console.error("خطا:", err))
  .finally(() => prisma.$disconnect());
