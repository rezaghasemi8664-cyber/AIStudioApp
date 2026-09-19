// scripts/check-raw.cjs
const prismaModule = require('../config/prisma.cjs');
const prisma = prismaModule.prisma || prismaModule.default || prismaModule;

async function check() {
  const row = await prisma.marketSummary.findFirst({
    orderBy: { summaryDate: 'desc' }
  });
  
  if (!row) {
    console.log("No data found.");
    return;
  }

  console.log("--- DB Fields ---");
  console.log("ID:", row.id);
  console.log("Equal Index:", row.equalIndex);
  console.log("Equal Change:", row.equalChange);
  
  const raw = JSON.parse(row.rawJson || '{}');
  console.log("\n--- Raw Data (from BRS) ---");
  console.log(JSON.stringify(raw.data || "No data key found", null, 2));
}

check().catch(console.error).finally(() => prisma.$disconnect());
