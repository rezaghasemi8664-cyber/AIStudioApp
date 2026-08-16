const { prisma } = require("./db.service.cjs");

// daily request limit (can be ENV)
const DAILY_LIMIT = 100; // ??????? ?? ENV ??????

function today() {
  return new Date().toISOString().split("T")[0];
}

// Increase usage count
async function increase(keyId) {
  const d = today();

  const log = await prisma.usageLog.upsert({
    where: {
      keyId_date: { keyId, date: d }
    },
    create: {
      keyId,
      date: d,
      count: 1
    },
    update: {
      count: { increment: 1 }
    }
  });

  return log;
}

// Check limit
async function checkLimit(keyId) {
  const d = today();

  const log = await prisma.usageLog.findUnique({
    where: {
      keyId_date: { keyId, date: d }
    }
  });

  if (!log) return { allowed: true, count: 0 };

  return { allowed: log.count < DAILY_LIMIT, count: log.count };
}

module.exports = {
  checkLimit,
  increase
};
