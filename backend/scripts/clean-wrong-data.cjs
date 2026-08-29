// C:\projects\AIStudioApp\scripts\clean-wrong-data.cjs
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Cleaning suspect MarketSummary records...');
  // حذف رکوردهایی که مقادیر رند یا فیک دارند (مثل اعدادی که در تست دیدیم)
  const deleted = await prisma.marketSummary.deleteMany({
    where: {
      OR: [
        { id: 5 }, // آیدی که در خروجی شما بود
        { overallIndex: 2150000 },
        { equalIndex: 720000 }
      ]
    }
  });
  console.log(`Deleted ${deleted.count} suspicious records.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
