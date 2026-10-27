'use strict';

const prisma = require('../config/prisma.cjs');
const brsService = require('./brs.service.cjs');
const sharedMarketService = require('./sharedMarket.service.cjs');
const brsRoutes = require('../routes/brs.routes.cjs');

let running = false;

function first(record, keys) {
  for (const key of keys) {
    const value = record && record[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}
function number(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[,٬\s]/g, '').trim();
  if (!normalized) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}
function expiryDays(value, now = Date.now()) {
  const text = String(value || '').replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  const m = text.match(/(13\d{2}|14\d{2}|20\d{2})[\/-]?(\d{1,2})[\/-]?(\d{1,2})/);
  if (!m) return null;
  const y=Number(m[1]), mo=Number(m[2]), day=Number(m[3]);
  let date;
  if (y < 1600) {
    const jy=y+1595; let days=-355668+365*jy+Math.floor(jy/33)*8+Math.floor(((jy%33)+3)/4)+day+(mo<7?(mo-1)*31:(mo-7)*30+186);
    let gy=400*Math.floor(days/146097); days%=146097;
    if(days>36524){gy+=4*Math.floor(--days/1461);days%=1461;} else gy+=4*Math.floor(days/1461),days%=1461;
    if(days>365){gy+=Math.floor((days-1)/365);days=(days-1)%365;}
    let gd=days+1, gm=1; const md=[0,31,((gy%4===0&&gy%100!==0)||gy%400===0)?29:28,31,30,31,30,31,31,30,31,30,31];
    while(gm<=12&&gd>md[gm]){gd-=md[gm];gm++;}
    if(gm>12)return null; date=Date.UTC(gy,gm-1,gd);
  } else date=Date.UTC(y,mo-1,day);
  return Number.isFinite(date) ? Math.ceil((date-now)/86400000) : null;
}
function analyze(contracts) {
  const counts={spot:0,strike:0,ask:0,bid:0,crossed:0,kind:0,expiry:0,spread:0};
  const ranked=[];
  for(const c of contracts){
    const spot=number(c.underlyingLastPrice);
    const strike=number(first(c,['strikePrice','price_strike','priceStrike','strike']));
    const ask=number(first(c,['bestAskPrice','po1','pMeOf','askPrice','sellPrice']));
    const bid=number(first(c,['bestBidPrice','pd1','pMeDem','bidPrice','buyPrice']));
    const rawKind=String(first(c,['optionKind','type','Type','optionType','OptionType','callPut','CallPut','نوع'])||'').trim().toLowerCase();
    const kind=['call','c','خرید'].includes(rawKind)||rawKind.includes('اختیار خرید')?'call':
      (['put','p','فروش'].includes(rawKind)||rawKind.includes('اختیار فروش')?'put':null);
    const days=expiryDays(first(c,['date_end','dateEnd','expiryDate','ExpiryDate','maturityDate','MaturityDate','endDate','EndDate','سررسید']));
    let reason=null;
    if(!(spot>0))reason='spot'; else if(!(strike>0))reason='strike'; else if(!(ask>0))reason='ask';
    else if(!(bid>0))reason='bid'; else if(ask<bid)reason='crossed'; else if(!kind)reason='kind';
    else if(days===null||days<7)reason='expiry';
    else {const spread=((ask-bid)/((ask+bid)/2))*100;if(!Number.isFinite(spread)||spread>20)reason='spread';}
    if(reason){counts[reason]++;continue;}
    const spread=((ask-bid)/((ask+bid)/2))*100, moneyness=Math.abs(spot-strike)/spot;
    const volume=Math.max(0,number(first(c,['tradedVolume','tvol','volume','qTotTran5J']))||0);
    const oi=Math.max(0,number(first(c,['openInterest','interest_open','interestOpen','OI']))||0);
    const mScore=Math.max(0,1-moneyness/0.15);
    const timeScore=days<14?0.45+(days-7)/7*0.25:days<=60?1:days<=120?0.8:0.55;
    const liq=(Math.min(1,Math.log10(volume+1)/4)*0.5)+(Math.min(1,Math.log10(oi+1)/5)*0.5);
    const spreadScore=Math.max(0,1-spread/20), ratio=ask/spot;
    const premium=ratio<=0.01?0.5:ratio<=0.08?1:Math.max(0,1-(ratio-0.08)/0.2);
    const score=Math.round(100*(mScore*0.25+timeScore*0.20+liq*0.30+spreadScore*0.15+premium*0.10));
    ranked.push({symbol:String(first(c,['l18','L18','symbol','Symbol','contractSymbol'])||'—'),baseSymbol:String(first(c,['base_l18','baseL18','baseSymbol','underlyingSymbol'])||'—'),expiry:String(first(c,['date_end','dateEnd','expiryDate','ExpiryDate','maturityDate','MaturityDate','endDate','EndDate','سررسید'])||'—'),days,score,entryPrice:ask,exitPrice:bid,spreadPercent:spread,kind});
  }
  ranked.sort((a,b)=>b.score-a.score);
  return {ranked:ranked.slice(0,3),eligibleCount:ranked.length,counts,analyzedAt:new Date().toISOString(),method:'deterministic-formula'};
}
async function refreshOptionsMarketSnapshot(io) {
  if(running) return {skipped:true,reason:'already-running'};
  running=true;
  try {
    const fetched=await brsService.getOptionContracts({forceFresh:true});
    const raw=Array.isArray(fetched&&fetched.data)?fetched.data:[];
    if(!raw.length) throw new Error('BRS returned an empty option-contract list; previous snapshot retained');
    const symbols=await sharedMarketService.getSymbols({limit:10000});
    const contracts=brsRoutes.enrichOptionContracts(raw,Array.isArray(symbols)?symbols:[]);
    if(!Array.isArray(contracts)||!contracts.length) throw new Error('Option-contract enrichment failed; previous snapshot retained');
    const analysis=analyze(contracts);
    try { await require('./optionsExitAlert.service.cjs').evaluateOptionExitAlerts(contracts); } catch (alertError) { console.error('[OPTIONS EXIT ALERT] Evaluation failed:', alertError.message); }
    const now=new Date();
    const record=await prisma.optionMarketCurrent.upsert({
      where:{id:1},
      create:{id:1,contractCount:contracts.length,contractsJson:JSON.stringify(contracts),analysisJson:JSON.stringify(analysis),source:'brs-live',fetchedAt:now,analyzedAt:new Date(analysis.analyzedAt),updatedAt:now},
      update:{contractCount:contracts.length,contractsJson:JSON.stringify(contracts),analysisJson:JSON.stringify(analysis),source:'brs-live',fetchedAt:now,analyzedAt:new Date(analysis.analyzedAt),updatedAt:now}
    });
    if(io) io.emit('options-market:updated',{contracts,analysis,contractCount:record.contractCount,source:record.source,fetchedAt:record.fetchedAt.toISOString(),analyzedAt:record.analyzedAt.toISOString(),updatedAt:record.updatedAt.toISOString()});
    console.log('[OPTIONS MARKET] Snapshot committed',JSON.stringify({contractCount:record.contractCount,updatedAt:record.updatedAt.toISOString(),eligibleCount:analysis.eligibleCount}));
    return {updated:true,contractCount:record.contractCount,analysis};
  } catch(error) {
    console.error('[OPTIONS MARKET] Refresh failed; retaining previous valid snapshot:',error.message);
    return {updated:false,error:error.message};
  } finally { running=false; }
}
async function getCurrentOptionsMarket() {
  const row=await prisma.optionMarketCurrent.findUnique({where:{id:1}});
  if(!row)return null;
  let contracts=[],analysis=null;
  try{contracts=JSON.parse(row.contractsJson);}catch{}
  try{analysis=JSON.parse(row.analysisJson);}catch{}
  return {contracts:Array.isArray(contracts)?contracts:[],analysis,contractCount:row.contractCount,source:row.source,fetchedAt:row.fetchedAt,analyzedAt:row.analyzedAt,updatedAt:row.updatedAt};
}
module.exports={refreshOptionsMarketSnapshot,getCurrentOptionsMarket,analyze};
