'use strict';
const prisma=require('../config/prisma.cjs'); const brs=require('./brs.service.cjs'); const allSymbolsSnapshot=require('./allSymbolsSnapshot.service.cjs');
const defs=[['high-buy-power','قدرت خرید بالا'],['highest-volume','بالاترین حجم'],['positive','سهم‌های مثبت'],['negative','سهم‌های منفی'],['highest-value','بالاترین ارزش معاملات'],['real-buy-volume','بالاترین حجم خرید حقیقی'],['real-sell-volume','بالاترین حجم فروش حقیقی'],['legal-buy-volume','بالاترین حجم خرید حقوقی'],['legal-sell-volume','بالاترین حجم فروش حقوقی'],['highest-buy-power','بالاترین قدرت خرید'],['growth-candidates','مستعد رشد'],['momentum','مومنتوم قوی'],['real-money-inflow','ورود پول حقیقی'],['value-candidates','ارزش‌گذاری و قدرت خرید'],['high-liquidity','نقدشوندگی بالا'],['buy-queue','صف‌های خرید'],['sell-queue','صف‌های فروش'],['suspicious-volume','حجم معاملات مشکوک'],['buy-queue-contracting','جمع شدن صف خرید'],['sell-queue-contracting','جمع شدن صف فروش'],['queue-balance','تعادل صف خرید و فروش']];
let snap={updatedAt:null,marketStatus:null,filters:{},previous:{buy:{},sell:{}},centralSnapshot:null};
let ensureTablePromise=null;
async function ensureTable(){if(!ensureTablePromise){ensureTablePromise=prisma.$executeRawUnsafe("IF OBJECT_ID(N'dbo.DailyFiltersCurrent', N'U') IS NULL BEGIN CREATE TABLE [dbo].[DailyFiltersCurrent] ([id] int NOT NULL CONSTRAINT [PK_DailyFiltersCurrent] PRIMARY KEY CHECK ([id]=1), [snapshotDate] date NOT NULL, [snapshotUpdatedAt] datetime2(3) NOT NULL, [symbolCount] int NOT NULL, [filtersJson] nvarchar(max) NOT NULL, [marketStatusJson] nvarchar(max) NULL, [updatedAt] datetime2(3) NOT NULL, [source] nvarchar(50) NOT NULL); END").catch(error=>{ensureTablePromise=null;throw error;});}await ensureTablePromise;}
async function readStored(){await ensureTable();const rows=await prisma.$queryRawUnsafe("SELECT TOP (1) [snapshotDate],[snapshotUpdatedAt],[symbolCount],[filtersJson],[marketStatusJson],[updatedAt],[source] FROM [dbo].[DailyFiltersCurrent] WHERE [id]=1");const r=rows&&rows[0];if(!r)return null;let parsed;try{parsed=JSON.parse(r.filtersJson);}catch(_){return null;}const date=r.snapshotDate instanceof Date?r.snapshotDate.toISOString().slice(0,10):String(r.snapshotDate||'').slice(0,10);return{snapshotDate:date,snapshotUpdatedAt:r.snapshotUpdatedAt, symbolCount:Number(r.symbolCount),filters:parsed.filters||{},previous:parsed.previous||{buy:{},sell:{}},marketStatus:(()=>{try{return JSON.parse(r.marketStatusJson||'null');}catch(_){return null;}})(),updatedAt:r.updatedAt,source:r.source};}
function tehranDateKey(date=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tehran',calendar:'gregory'}).format(date);}
function isTradingSession(now=new Date()){const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tehran',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(now);const values=Object.fromEntries(parts.map(p=>[p.type,p.value]));const minute=Number(values.hour||0)*60+Number(values.minute||0);return ['Sat','Sun','Mon','Tue','Wed'].includes(values.weekday)&&minute>=540&&minute<750;}
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
async function refresh(){
 const central=await allSymbolsSnapshot.getSnapshot();
 if(central.status!=='FOUND'||!Array.isArray(central.symbols)||central.symbols.length<1000){console.warn('[DAILY-FILTERS] Central AllSymbols DB snapshot unavailable; refusing to calculate.',central.status);return false;}
 if(!isTradingSession()||central.snapshotDate!==tehranDateKey())return false;
 const previousStored=await readStored();
 const centralUpdatedAt=new Date(central.snapshotUpdatedAt||0);
 if(!Number.isFinite(centralUpdatedAt.getTime()))return false;
 if(previousStored&&new Date(previousStored.snapshotUpdatedAt).getTime()===centralUpdatedAt.getTime())return false;
 const status=await brs.getMarketStatus();
 const rows=central.symbols.map(x=>row(x)).filter(x=>x.symbol);
 if(rows.length<1000)return false;
 const prev={buy:{},sell:{}};
 (previousStored?.filters?.['buy-queue']?.rows||[]).forEach(x=>prev.buy[x.symbol]={volume:n(x.buyQueueVolume),count:n(x.buyQueueCount)});
 (previousStored?.filters?.['sell-queue']?.rows||[]).forEach(x=>prev.sell[x.symbol]={volume:n(x.sellQueueVolume),count:n(x.sellQueueCount)});
 const computedAt=new Date();
 const filters={};
 for(const [id,label] of defs)filters[id]={label,rows:calc(rows,id,prev),updatedAt:computedAt.toISOString()};
 const payload=JSON.stringify({filters,previous:prev});
 const marketStatusJson=JSON.stringify(status||{isOpen:true});
 const dateParts=String(central.snapshotDate).split('-').map(Number);
 const snapshotDate=new Date(Date.UTC(dateParts[0],dateParts[1]-1,dateParts[2]));
 await ensureTable();
 await prisma.$transaction(async tx=>{
  const changed=await tx.$executeRawUnsafe("UPDATE [dbo].[DailyFiltersCurrent] SET [snapshotDate]=@P1,[snapshotUpdatedAt]=@P2,[symbolCount]=@P3,[filtersJson]=@P4,[marketStatusJson]=@P5,[updatedAt]=@P6,[source]=@P7 WHERE [id]=1",snapshotDate,centralUpdatedAt,central.symbolCount,payload,marketStatusJson,computedAt,'central-all-symbols-db');
  if(Number(changed)===0)await tx.$executeRawUnsafe("INSERT INTO [dbo].[DailyFiltersCurrent] ([id],[snapshotDate],[snapshotUpdatedAt],[symbolCount],[filtersJson],[marketStatusJson],[updatedAt],[source]) VALUES (1,@P1,@P2,@P3,@P4,@P5,@P6,@P7)",snapshotDate,centralUpdatedAt,central.symbolCount,payload,marketStatusJson,computedAt,'central-all-symbols-db');
  const verify=await tx.$queryRawUnsafe("SELECT [snapshotUpdatedAt],[symbolCount],[filtersJson] FROM [dbo].[DailyFiltersCurrent] WHERE [id]=1");
  if(!verify?.[0]||Number(verify[0].symbolCount)!==central.symbolCount||new Date(verify[0].snapshotUpdatedAt).getTime()!==centralUpdatedAt.getTime())throw new Error('Daily filters database verification failed');
 },{maxWait:10000,timeout:60000});
 snap={updatedAt:computedAt.toISOString(),marketStatus:status,filters,previous:prev,centralSnapshot:{date:central.snapshotDate,updatedAt:centralUpdatedAt.toISOString(),symbolCount:central.symbolCount,source:central.source}};
 console.log('[DAILY-FILTERS] Saved latest calculation to database',JSON.stringify({snapshotDate:central.snapshotDate,symbolCount:central.symbolCount,filterCount:Object.keys(filters).length,computedAt:computedAt.toISOString()}));
 return true;
}
async function getFilters(){
 const status=await brs.getMarketStatus();
 const stored=await readStored();
 if(stored)snap={updatedAt:stored.updatedAt instanceof Date?stored.updatedAt.toISOString():new Date(stored.updatedAt).toISOString(),marketStatus:stored.marketStatus,filters:stored.filters,previous:stored.previous,centralSnapshot:{date:stored.snapshotDate,updatedAt:stored.snapshotUpdatedAt instanceof Date?stored.snapshotUpdatedAt.toISOString():new Date(stored.snapshotUpdatedAt).toISOString(),symbolCount:stored.symbolCount,source:stored.source}};
 const hasSnapshot=Boolean(stored&&snap.updatedAt&&Object.keys(snap.filters||{}).length);
 const dataStatus=!hasSnapshot?'UNAVAILABLE':(status.isOpen?'LIVE':'CACHED');
 return{success:true,marketStatus:status,filters:defs.map(([id,label])=>({id,label,count:hasSnapshot?(snap.filters[id]?.rows||[]).length:0,updatedAt:snap.filters[id]?.updatedAt||snap.updatedAt||null,rows:hasSnapshot?(snap.filters[id]?.rows||[]).slice(0,MAX_FILTER_ROWS):[]})),meta:{status:dataStatus,source:stored?.source||'central-all-symbols-db',fetchedAt:snap.updatedAt||null,cachedAt:dataStatus==='CACHED'?(snap.updatedAt||null):null,stale:dataStatus==='CACHED',centralSnapshot:snap.centralSnapshot||null}};
}
module.exports={getFilters,refresh,ensureTable};
