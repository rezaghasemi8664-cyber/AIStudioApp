const cron = require('node-cron');

function registerUsageCron() {
  cron.schedule('0 0 * * *', async () => {
    console.log('[CRON] Reset daily usage counters');
  });
}

module.exports = { registerUsageCron };
