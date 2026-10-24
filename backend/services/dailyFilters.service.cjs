'use strict';
const fs=require('fs'); const path=require('path'); const brs=require('./brs.service.cjs'); const allSymbolsSnapshot=require('./allSymbolsSnapshot.service.cjs');
const REFRESH_MS=300000,file=path.join(__dirname,'..','data','daily-filters.json');
const defs=[['high-buy-power','قدرت خرید بالا'],['highest-volume','بالاترین حجم'],['positive','سهم‌های مثبت'],['negative','سهم‌های منفی'],['highest-value','بالاترین ارزش معاملات'],['real-buy-volume','بالاترین حجم خرید حقیقی'],['real-sell-volume','بالاترین حجم فروش حقیقی'],['legal-buy-volume','بالاترین حجم خرید حقوقی'],['legal-sell-volume','بالاترین حجم فروش حقوقی'],['highest-buy-power','بالاترین قدرت خرید'],['growth-candidates','مستعد رشد'],['momentum','مومنتوم قوی'],['real-money-inflow','ورود پول حقیقی'],['value-candidates','ارزش‌گذاری و قدرت خرید'],['high-liquidity','نقدشوندگی بالا'],['buy-queue','صف‌های خرید'],['sell-queue','صف‌های فروش'],['suspicious-volume','حجم معاملات مشکوک'],['buy-queue-contracting','جمع شدن صف خرید'],['sell-queue-contracting','جمع شدن صف فروش'],['queue-balance','تعادل صف خرید و فروش']];
let snap={updatedAt:null,marketStatus:null,filters:{},previous:{buy:{},sell:{}}};
try{if(fs.existsSync(file))snap=Object.assign(snap,JSON.parse(fs.readFileSync(file,'utf8')));}catch(e){}
const n=v=>Number.isFinite(Number(v))?Number(v):0; const first=(o,ks)=>{for(const k of ks)if(o&&o[k]!=null&&o[k]!=='')return o[k];return 0;};
function row(x,raw={}){
 const rb=n(first(x,['realBuyVolume','buyRealVolume']))||n(first(raw,['Buy_I_Volume','realBuyVolume']));
 const rs=n(first(x,['realSellVolume','sellRealVolume']))||n(first(raw,['Sell_I_Volume','realSellVolume']));
 const lb=n(first(x,['legalBuyVolume','instBuyVolume']))||n(first(raw,['Buy_N_Volume','legalBuyVolume']));
 const ls=n(first(x,['legalSellVolume','instSellVolume']))||n(first(raw,['Sell_N_Volume','legalSellVolume']));
 const rc=n(first(x,['realBuyCount','buyCountI','Buy_CountI']))||n(first(raw,['Buy_CountI','buyCountI']));
 const sc=n(first(x,['realSellCount','sellCountI','Sell_CountI']))||n(first(raw,['Sell_CountI','sellCountI']));
 const lc=n(first(x,['legalBuyCount','instBuyCount','buyCountN','Buy_CountN']))||n(first(raw,['Buy_CountN','buyCountN']));
 const lsc=n(first(x,['legalSellCount','instSellCount','sellCountN','Sell_CountN']))||n(first(raw,['Sell_CountN','sellCountN']));
 const avg=n(first(x,['volumeAvg1m']))||n(first(raw,['tvol_avg_1m','volumeAvg1m','avgVolume1M']));
 const v=n(first(x,['tradeVolume','volume','tradedVolume']));
 const last=n(first(x,['lastPrice','last','price']));
 const max=n(first(x,['allowedMax','maxPrice']))||n(first(raw,['tmax','allowedMax']));
 const min=n(first(x,['allowedMin','minPrice']))||n(first(raw,['tmin','allowedMin']));
 const buyLevel=Array.isArray(x.orderBook&&x.orderBook.buy)?x.orderBook.buy[0]:null;
 const sellLevel=Array.isArray(x.orderBook&&x.orderBook.sell)?x.orderBook.sell[0]:null;
 const bqv=n(first(x,['buyQueueVolume']))||n(buyLevel&&[buyLevel.volume])||n(first(raw,['qd1','Buy_Q_Volume','buyQueueVolume']));
 const bqc=n(first(x,['buyQueueCount']))||n(buyLevel&&[buyLevel.count])||n(first(raw,['zd1','Buy_Q_Count','buyQueueCount']));
 const sqv=n(first(x,['sellQueueVolume']))||n(sellLevel&&[sellLevel.volume])||n(first(raw,['qo1','Sell_Q_Volume','sellQueueVolume']));
 const sqc=n(first(x,['sellQueueCount']))||n(sellLevel&&[sellLevel.count])||n(first(raw,['zo1','Sell_Q_Count','sellQueueCount']));
 const isB=max>0&&last>=max&&bqv>0,isS=min>0&&last<=min&&sqv>0;
 const bp=rc>0&&sc>0&&rs>0?(rb/rc)/(rs/sc):0;
 const realFlow=n(first(x,['realMoneyFlow']))||rb-rs;
 const queueTotal=bqv+sqv,queueBalance=queueTotal>0?(bqv-sqv)/queueTotal:0;
 return{symbol:x.symbol||'',name:x.name||'',buyPower:Number(bp.toFixed(2)),lastPrice:last,closingPrice:n(first(x,['closingPrice','lastClosePrice','closePrice'])),lastChangePercent:n(first(x,['lastChangePercent','changePercent'])),volume:v,value:n(first(x,['tradeValue','value','tradedValue'])),realBuyVolume:rb,realSellVolume:rs,legalBuyVolume:lb,legalSellVolume:ls,realBuyCount:rc,realSellCount:sc,legalBuyCount:lc,legalSellCount:lsc,pe:n(first(x,['pe','PE']))||n(first(raw,['pe','PE','p_e'])),eps:n(first(x,['eps','EPS']))||n(first(raw,['eps','EPS'])),volumeAvg1m:avg,volumeRatio1m:avg>0?Number((v/avg).toFixed(2)):0,buyQueueVolume:isB?bqv:0,buyQueueCount:isB?bqc:0,sellQueueVolume:isS?sqv:0,sellQueueCount:isS?sqc:0,realMoneyFlow:realFlow,queueBalance:Number(queueBalance.toFixed(4))};
}
function desc(a,k){return a.slice().sort((x,y)=>n(y[k])-n(x[k]))}
const MAX_FILTER_ROWS=30;
function calc(a,id,p){
 const valid=x=>x&&x.symbol&&n(x.lastPrice)>0&&n(x.volume)>0&&n(x.value)>0;
 const ranked=(items,key,dir=-1)=>items.slice().sort((x,y)=>dir*(n(x[key])-n(y[key]))).slice(0,MAX_FILTER_ROWS);
 if(id==='positive')return ranked(a.filter(x=>valid(x)&&x.lastChangePercent>0),'lastChangePercent');
 if(id==='negative')return ranked(a.filter(x=>valid(x)&&x.lastChangePercent<0),'lastChangePercent',1);
 if(id==='highest-volume')return ranked(a.filter(x=>valid(x)),'volume');
 if(id==='highest-value')return ranked(a.filter(x=>valid(x)),'value');
 if(id==='real-buy-volume')return ranked(a.filter(x=>valid(x)&&x.realBuyVolume>0),'realBuyVolume');
 if(id==='real-sell-volume')return ranked(a.filter(x=>valid(x)&&x.realSellVolume>0),'realSellVolume');
 if(id==='legal-buy-volume')return ranked(a.filter(x=>valid(x)&&x.legalBuyVolume>0),'legalBuyVolume');
 if(id==='legal-sell-volume')return ranked(a.filter(x=>valid(x)&&x.legalSellVolume>0),'legalSellVolume');
 if(id==='high-buy-power')return ranked(a.filter(x=>valid(x)&&x.buyPower>=1.5&&x.realBuyCount>0&&x.realSellCount>0),'buyPower');
 if(id==='highest-buy-power')return ranked(a.filter(x=>valid(x)&&x.buyPower>=1.2&&x.realBuyCount>0&&x.realSellCount>0),'buyPower');
 if(id==='growth-candidates')return ranked(a.filter(x=>valid(x)&&x.buyPower>=1.2&&x.lastChangePercent>=0&&x.realBuyVolume>x.realSellVolume),'buyPower');
 if(id==='momentum')return ranked(a.filter(x=>valid(x)&&x.lastChangePercent>=2&&x.volumeRatio1m>=2&&x.buyPower>=1.2),'volumeRatio1m');
 if(id==='real-money-inflow')return ranked(a.filter(x=>valid(x)&&x.realMoneyFlow>0&&x.buyPower>=1.2),'realMoneyFlow');
 if(id==='value-candidates')return ranked(a.filter(x=>valid(x)&&x.pe>0&&x.pe<=10&&x.buyPower>=1.2&&x.lastChangePercent>=0),'buyPower');
 if(id==='high-liquidity')return ranked(a.filter(x=>valid(x)),'value');
 if(id==='buy-queue')return ranked(a.filter(x=>valid(x)&&x.buyQueueVolume>0),'buyQueueVolume');
 if(id==='sell-queue')return ranked(a.filter(x=>valid(x)&&x.sellQueueVolume>0),'sellQueueVolume');
 if(id==='suspicious-volume')return ranked(a.filter(x=>valid(x)&&x.volumeAvg1m>0&&x.volumeRatio1m>4),'volumeRatio1m');
 if(id==='buy-queue-contracting')return ranked(a.filter(x=>valid(x)&&x.buyQueueVolume>0&&p.buy[x.symbol]&&(x.buyQueueVolume<p.buy[x.symbol].volume||x.buyQueueCount<p.buy[x.symbol].count)),'buyQueueVolume');
 if(id==='sell-queue-contracting')return ranked(a.filter(x=>valid(x)&&x.sellQueueVolume>0&&p.sell[x.symbol]&&(x.sellQueueVolume<p.sell[x.symbol].volume||x.sellQueueCount<p.sell[x.symbol].count)),'sellQueueVolume');
 if(id==='queue-balance')return ranked(a.filter(x=>valid(x)&&(x.buyQueueVolume>0||x.sellQueueVolume>0)&&Math.abs(x.queueBalance)<=0.2),'value');
 return a.filter(valid).slice(0,MAX_FILTER_ROWS);
}
async function refresh(force=false){
 const status=await brs.getMarketStatus();
 const central=await allSymbolsSnapshot.getSnapshot();
 if(central.status!=='FOUND'||!Array.isArray(central.symbols)||central.symbols.length<1000){
  console.warn('[DAILY-FILTERS] Central AllSymbols DB snapshot unavailable; refusing to request symbol data separately.',central.status);
  return false;
 }
 const rows=central.symbols.map(x=>row(x)).filter(x=>x.symbol);
 if(rows.length<1000)return false;
 const prev={buy:{},sell:{}};
 (snap.filters['buy-queue']?.rows||[]).forEach(x=>prev.buy[x.symbol]={volume:n(x.buyQueueVolume),count:n(x.buyQueueCount)});
 (snap.filters['sell-queue']?.rows||[]).forEach(x=>prev.sell[x.symbol]={volume:n(x.sellQueueVolume),count:n(x.sellQueueCount)});
 snap.previous=prev;
 const now=central.snapshotUpdatedAt?new Date(central.snapshotUpdatedAt).toISOString():new Date().toISOString();
 for(const [id,label] of defs)snap.filters[id]={label,rows:calc(rows,id,prev),updatedAt:now};
 snap.updatedAt=now;
 snap.marketStatus=status;
 snap.centralSnapshot={date:central.snapshotDate,updatedAt:now,symbolCount:central.symbolCount,source:central.source};
 fs.mkdirSync(path.dirname(file),{recursive:true});
 fs.writeFileSync(file,JSON.stringify(snap),'utf8');
 return true;
}
async function getFilters(force){
 const status=await brs.getMarketStatus();
 const age=snap.updatedAt?Date.now()-Date.parse(snap.updatedAt):Infinity;
 if(force||age>=REFRESH_MS||!snap.updatedAt)await refresh(Boolean(force));
 const hasSnapshot=Boolean(snap.updatedAt&&Object.keys(snap.filters||{}).length);
 const dataStatus=status.isOpen&&hasSnapshot?'LIVE':(!status.isOpen&&hasSnapshot?'CACHED':'UNAVAILABLE');
 const source=snap.centralSnapshot?.source||'central-all-symbols-db';
 return{success:true,marketStatus:status,filters:defs.map(([id,label])=>({id,label,count:hasSnapshot?(snap.filters[id]?.rows||[]).length:0,updatedAt:snap.filters[id]?.updatedAt||snap.updatedAt||null,rows:hasSnapshot?calc(snap.filters[id]?.rows||[],id,snap.previous||{buy:{},sell:{}}).slice(0,MAX_FILTER_ROWS):[]})),meta:{status:dataStatus,source,fetchedAt:snap.updatedAt||null,cachedAt:dataStatus==='CACHED'?(snap.updatedAt||null):null,stale:dataStatus==='CACHED',centralSnapshot:snap.centralSnapshot||null}};
}
module.exports={getFilters,refresh,REFRESH_MS};
