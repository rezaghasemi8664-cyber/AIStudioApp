'use strict';

const cron = require('node-cron');
const optionsMarketService = require('../services/optionsMarketSnapshot.service.cjs');
let registered=false;
function registerOptionsMarketCron(io){
  if(registered)return;
  registered=true;
  cron.schedule('* * * * *',async()=>{
    try{
      // The scheduler is the sole writer. User requests only read the stored snapshot.
      await optionsMarketService.refreshOptionsMarketSnapshot(io||null);
    }catch(error){console.error('[CRON][OptionsMarket] Tick failed:',error.message);}
  },{timezone:'Asia/Tehran'});
  console.log('[CRON] options-market-refresh registered (every minute, Asia/Tehran)');
}
module.exports={registerOptionsMarketCron};
