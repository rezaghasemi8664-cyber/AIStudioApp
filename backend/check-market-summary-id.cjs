const prisma = require('./config/prisma.cjs');

const sql = "SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMNPROPERTY(OBJECT_ID('dbo.MarketSummary'), COLUMN_NAME, 'IsIdentity') AS IsIdentity FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='MarketSummary' AND COLUMN_NAME='id'";

prisma.$queryRawUnsafe(sql)
  .then(r => console.log(JSON.stringify(r, null, 2)))
  .catch(e => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
