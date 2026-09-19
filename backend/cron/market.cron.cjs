const cron = require('node-cron');
const {
  fetchIndex,
  saveMarketSnapshot,
} = require('../services/marketHistory.service.cjs');
const { isMarketOpen } = require('../services/brs.service.cjs');

function registerMarketCron() {
  cron.schedule('*/2 * * * *', async () => {
    const open = await isMarketOpen();
    if (!open) return;

    try {
      const data = await fetchIndex();

      if (!data || data._fallback) {
        console.warn('[CRON] Skip snapshot: empty or fallback index');
        return;
      }

      const saved = await saveMarketSnapshot(data);
      if (saved) {
        console.log(
          `[CRON] Market snapshot saved at ${new Date().toISOString()}`
        );
      }
    } catch (error) {
      console.error('[CRON] Market snapshot failed:', error.message);
    }
  });
}

module.exports = { registerMarketCron };
