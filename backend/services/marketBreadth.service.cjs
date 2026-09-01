'use strict';

const { fetchAllSymbols } = require('./marketHistory.service.cjs');
const env = require('../config/env.cjs');

const CDN = 'https://cdn.tsetmc.com/api';
const timeoutMs = Number(env.BRS_TIMEOUT_MS) || 15000;
const TTL = 2 * 60 * 1000;
let cache = { value: null, timestamp: 0 };

const CHANGE_KEYS = ['plp','pLp','percentLast','lastPercent','priceChangePercent','price_change_percent','pcp','pCp','percentClose','closePercent','changePercent','change_percent','percentage','percent'];
const LAST_KEYS = ['pl','pDrCotVal','lastPrice','last','priceLast','closeLast'];
const PREV_KEYS = ['py','priceYesterday','previousClose','prevClose','yesterdayClose','yesterdayPrice'];
const CLOSE_KEYS = ['pc','pClosing','closingPrice','closePrice','close'];
const VOL_KEYS = ['qTotTran5J','tvol','totalVolume','volume','tradeVolume'];
const VALUE_KEYS = ['qTotCap','tval','totalValue','tradeValue','tradeValue'];
const NAME_KEYS = ['lVal18AFC','lVal18','symbol','l18','l30','namad','name','ticker'];
const CODE_KEYS = ['insCode','inscode','InsCode','instrumentCode','instrumentId'];
const SECTOR_KEYS = ['lSecVal','sectorName','sector','industryName','industry','groupName','group'];
const ARRAY_KEYS = ['symbols','data','items','result','results','rows','list','records','clientTypeAllDto','sectorSummeries','sectorsSummary','marketwatch'];

function num(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(/,/g, '').replace(/٪/g, '').trim());
  return Number.isFinite(n) ? n : null;
}
function first(obj, keys) { for (const k of keys) { const n = num(obj?.[k]); if (n !== null) return n; } return null; }
function nameOf(row) { for (const k of NAME_KEYS) if (row?.[k] != null && String(row[k]).trim()) return String(row[k]).trim(); return null; }
function codeOf(row) { for (const k of CODE_KEYS) if (row?.[k] != null && String(row[k]).trim()) return String(row[k]).trim(); return null; }
function sectorOf(row) { for (const k of SECTOR_KEYS) if (row?.[k] != null && String(row[k]).trim()) return String(row[k]).trim(); return null; }
function flatten(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  for (const k of ARRAY_KEYS) {
    if (Array.isArray(payload[k])) return payload[k];
    if (payload[k] && typeof payload[k] === 'object') { const x = flatten(payload[k]); if (x.length) return x; }
  }
  return [];
}
async function getJson(url) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), timeoutMs);
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'AIStudioApp/5.0' }, signal: c.signal });
    if (!r.ok) throw new Error(`TSETMC ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}
function pctOf(row) {
  for (const k of CHANGE_KEYS) { const n = num(row?.[k]); if (n !== null && Math.abs(n) > 1e-12) return n; }
  const last = first(row, LAST_KEYS), prev = first(row, PREV_KEYS);
  if (last !== null && prev !== null && prev !== 0) return (last - prev) / prev * 100;
  const close = first(row, CLOSE_KEYS);
  if (close !== null && prev !== null && prev !== 0) return (close - prev) / prev * 100;
  return 0;
}
function isTraded(row) {
  const trades = first(row, ['zTotTran','tno','tradeCount','totalTrades']);
  const volume = first(row, VOL_KEYS);
  const value = first(row, VALUE_KEYS);
  return (trades !== null && trades > 0) || (volume !== null && volume > 0) || (value !== null && value > 0);
}
function isIndex(row) {
  const n = nameOf(row) || '';
  return /شاخص|index/i.test(n) || String(row?.paperType ?? row?.type ?? '').toLowerCase() === 'index';
}

function normalizeRows(payload) {
  return flatten(payload).filter(r => nameOf(r) && !isIndex(r)).map(r => ({
    item: r, symbol: nameOf(r), code: codeOf(r), pct: pctOf(r), traded: isTraded(r),
    volume: first(r, VOL_KEYS) || 0, value: first(r, VALUE_KEYS) || 0,
  }));
}

function moneyFlowFromRows(rows) {
  let buyVolume=0,sellVolume=0,buyValue=0,sellValue=0,buyCount=0,sellCount=0,matched=0;
  for (const r of rows) {
    const x=r.item;
    const bv=first(x,['buy_I_Volume','buyIVolume','buyIvolume','buy_I_volume','buyVolumeI']);
    const sv=first(x,['sell_I_Volume','sellIVolume','sellIvolume','sell_I_volume','sellVolumeI']);
    if (bv===null && sv===null) continue;
    const price=first(x,LAST_KEYS) ?? first(x,CLOSE_KEYS) ?? 0;
    const bvVal=first(x,['buy_I_Value','buyIValue','buy_I_value']);
    const svVal=first(x,['sell_I_Value','sellIValue','sell_I_value']);
    buyVolume+=bv||0; sellVolume+=sv||0;
    buyValue+=bvVal ?? (bv||0)*price; sellValue+=svVal ?? (sv||0)*price;
    buyCount+=first(x,['buy_CountI','buyI_Count','buy_I_Count'])||0;
    sellCount+=first(x,['sell_CountI','sellI_Count','sell_I_Count'])||0;
    matched++;
  }
  if (!matched) return null;
  return { available:true,buyVolume,sellVolume,netVolume:buyVolume-sellVolume,buyValue,sellValue,netValue:buyValue-sellValue,buyCount,sellCount,matchedSymbols:matched };
}
function moneyFlowFromClientTypes(clientRows, priceByCode) {
  const rows=clientRows.map(x=>({item:{...x,...(priceByCode.get(codeOf(x))||{})}}));
  return moneyFlowFromRows(rows);
}
function deriveSectors(rows) {
  const groups=new Map();
  for(const r of rows){
    if(!r.traded) continue;
    const s=sectorOf(r.item); if(!s) continue;
    let g=groups.get(s); if(!g) g={name:s,count:0,sumPct:0,value:0};
    g.count++; g.sumPct+=r.pct; g.value+=r.value;
    groups.set(s,g);
  }
  return [...groups.values()].filter(g=>g.count>0).map(g=>({name:g.name,symbols:g.count,changePercent:g.sumPct/g.count,value:g.value}));
}
async function fetchClientTypes(){
  try {
    const p=await getJson(`${CDN}/ClientType/GetClientTypeAll`);
    const rows=flatten(p).filter(r=>codeOf(r));
    if(rows.length) return rows;
  } catch(e) { console.warn('[MARKET][ClientType]',e.message); }
  try {
    const r=await fetch('https://old.tsetmc.com/tsev2/data/ClientTypeAll.aspx',{headers:{'User-Agent':'AIStudioApp/5.0'}});
    if(!r.ok) throw new Error(`TSETMC ${r.status}`);
    const text=await r.text();
    return text.split(';').map(x=>x.trim()).filter(Boolean).map(x=>x.split(',')).filter(p=>p.length>=9&&p[0]).map(p=>({insCode:p[0],buy_CountI:num(p[1])||0,buy_CountN:num(p[2])||0,buy_I_Volume:num(p[3])||0,buy_N_Volume:num(p[4])||0,sell_CountI:num(p[5])||0,sell_CountN:num(p[6])||0,sell_I_Volume:num(p[7])||0,sell_N_Volume:num(p[8])||0}));
  } catch(e) { console.warn('[MARKET][ClientType fallback]',e.message); return []; }
}
async function fetchSectorsApi(){
  try { return flatten(await getJson(`${CDN}/MarketData/GetSectorsSummary`)).map(r=>({name:r.lSecVal??r.lVal30??r.name??r.sectorName??r.title??r.sector,changePercent:first(r,['changePercent','change_percentage','percent','pChange','change','changeValue','priceChangePercent']),symbols:first(r,['symbols','symbolCount','count','numberOfSymbols','insCount']),value:first(r,['tradeValue','tval','value','qTotCap'])})).filter(r=>r.name&&r.changePercent!==null); }
  catch(e){ console.warn('[MARKET][Sectors]',e.message); return []; }
}
function build(payload,clientRows,sectorApiRows){
  const all=normalizeRows(payload);
  const rows=all.filter(r=>r.traded);
  const positive=rows.filter(r=>r.pct>0).length, negative=rows.filter(r=>r.pct<0).length, neutral=rows.filter(r=>r.pct===0).length;
  const total=rows.length;
  const priceByCode=new Map(all.filter(r=>r.code).map(r=>[r.code,r.item]));
  let moneyFlow=moneyFlowFromClientTypes(clientRows,priceByCode);
  if(!moneyFlow) moneyFlow=moneyFlowFromRows(all);
  let sectors=deriveSectors(all);
  if(!sectors.length) sectors=sectorApiRows;
  const leaders=[...sectors].sort((a,b)=>(b.changePercent||0)-(a.changePercent||0)).slice(0,5);
  const laggards=[...sectors].sort((a,b)=>(a.changePercent||0)-(b.changePercent||0)).slice(0,5);
  const topGainers=rows.filter(r=>r.pct>0).sort((a,b)=>b.pct-a.pct).slice(0,10).map(r=>({symbol:r.symbol,changePercent:+r.pct.toFixed(4),volume:r.volume,value:r.value}));
  const topLosers=rows.filter(r=>r.pct<0).sort((a,b)=>a.pct-b.pct).slice(0,10).map(r=>({symbol:r.symbol,changePercent:+r.pct.toFixed(4),volume:r.volume,value:r.value}));
  const topVolumes=[...rows].sort((a,b)=>b.volume-a.volume).slice(0,10).map(r=>({symbol:r.symbol,volume:r.volume,value:r.value,changePercent:+r.pct.toFixed(4)}));
  return {available:true,positive,negative,neutral,unknown:0,total,classifiedTotal:total,coveragePercent:100,positivePercent:total?positive/total*100:0,negativePercent:total?negative/total*100:0,neutralPercent:total?neutral/total*100:0,advanceDeclineRatio:negative?positive/negative:null,score:total?Math.max(0,Math.min(100,Math.round(50+(positive-negative)/total*50))):null,topGainers,topLosers,topVolumes,moneyFlow:moneyFlow||{available:false,reason:'REAL_MONEY_FLOW_UNAVAILABLE'},sectors:sectors.length?{available:true,leaders,laggards,rows:sectors}:{available:false,leaders:[],laggards:[],reason:'SECTOR_DATA_UNAVAILABLE'},interpretation:positive>negative*1.2?'عرض بازار مثبت و گسترده است':negative>positive*1.2?'عرض بازار منفی و ضعیف است':'عرض بازار متعادل است',diagnostics:{clientTypeRows:clientRows.length,sectorRows:sectors.length,moneyFlowDerivedFromSymbolData:!moneyFlow||clientRows.length===0,sectorDerivedFromSymbolData:deriveSectors(all).length>0}};
}

async function getMarketBreadth(){
  if(cache.value&&Date.now()-cache.timestamp<TTL) return cache.value;
  try{
    const payload=await fetchAllSymbols();
    const [clientResult,sectorResult]=await Promise.allSettled([fetchClientTypes(),fetchSectorsApi()]);
    const clientRows=clientResult.status==='fulfilled'?clientResult.value:[];
    const sectorRows=sectorResult.status==='fulfilled'?sectorResult.value:[];
    const result=build(payload,clientRows,sectorRows);
    result.diagnostics.clientTypeError=clientResult.status==='rejected'?clientResult.reason?.message:null;
    result.diagnostics.sectorError=sectorResult.status==='rejected'?sectorResult.reason?.message:null;
    result.diagnostics.breadthRule='فقط نمادهای دارای معامله/حجم/ارزش معامله؛ شاخص‌ها حذف شدند';
    cache={value:result,timestamp:Date.now()};
    return result;
  }catch(error){return {available:false,reason:'BREADTH_FETCH_FAILED',error:error.message};}
}

module.exports={calculateBreadth:(payload,extras={})=>build(payload,extras.clientTypes||[],extras.sectors||[]),getMarketBreadth};
