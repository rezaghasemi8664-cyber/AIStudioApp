// controllers/analyze.controller.cjs
// Controller for AI-powered stock analysis
'use strict';

const aiService = require('../services/ai.service.cjs');
const brsService = require('../services/brs.service.cjs');

let prisma = null;
try {
  const { PrismaClient } = require('@prisma/client');
  prisma = new PrismaClient();
} catch (err) {
  console.warn('[Analyze] Prisma not available:', err.message);
}

function normalizeSymbol(symbol) {
  return typeof symbol === 'string' ? symbol.trim() : '';
}

function toNumber(value, def) {
  const num = Number(value);
  return Number.isFinite(num) ? num : (def === undefined ? 0 : def);
}

function toFiniteOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function clampNumber(value, min, max, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function firstDefined() {
  for (let i = 0; i < arguments.length; i += 1) {
    const value = arguments[i];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function getNested(obj, path) {
  if (!obj || !path) return undefined;
  const parts = String(path).split('.');
  let current = obj;
  for (let i = 0; i < parts.length; i += 1) {
    if (!current || typeof current !== 'object' || !(parts[i] in current)) return undefined;
    current = current[parts[i]];
  }
  return current;
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function pickNumericFromPaths(source, paths) {
  if (!isObject(source) || !Array.isArray(paths) || paths.length === 0) return null;
  for (let i = 0; i < paths.length; i += 1) {
    const raw = paths[i].includes('.') ? getNested(source, paths[i]) : source[paths[i]];
    const num = toFiniteOrNull(raw);
    if (num !== null) return num;
  }
  return null;
}

function pickFirstObject() {
  for (let i = 0; i < arguments.length; i += 1) {
    if (isObject(arguments[i])) return arguments[i];
  }
  return null;
}

function mergePreferSnapshot(fallbackMetrics, snapshotMetrics) {
  const base = isObject(fallbackMetrics) ? fallbackMetrics : {};
  const snap = isObject(snapshotMetrics) ? snapshotMetrics : {};
  const keys = Array.from(new Set(Object.keys(base).concat(Object.keys(snap))));
  const merged = {};
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    const snapValue = snap[key];
    const baseValue = base[key];
    merged[key] = snapValue !== undefined && snapValue !== null ? snapValue : (baseValue !== undefined ? baseValue : null);
  }
  return merged;
}

function normalizeMoneyFlowValue(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }
  if (isObject(value)) return toFiniteOrNull(firstDefined(value.net, value.value, value.amount, value.total));
  return null;
}

function normalizeMoneyFlowBreakdown(value) {
  if (!isObject(value)) return null;
  const inflow = toFiniteOrNull(firstDefined(value.inflow, value.in, value.buy, value.buyValue));
  const outflow = toFiniteOrNull(firstDefined(value.outflow, value.out, value.sell, value.sellValue));
  const net = toFiniteOrNull(firstDefined(value.net, value.value, value.amount, value.total));
  if (inflow === null && outflow === null && net === null) return null;
  return { inflow, outflow, net: net !== null ? net : (inflow !== null && outflow !== null ? inflow - outflow : null) };
}

function enrichMarketMetrics(data) {
  if (!isObject(data)) {
    return { pe:null, eps:null, marketCap:null, priceChangePercent:null, tradedValue:null, realMoneyFlow:null, legalMoneyFlow:null, realMoneyFlowBreakdown:null, legalMoneyFlowBreakdown:null, highPrice:null, lowPrice:null, averagePrice:null, lastPrice:null, closingPrice:null, tradedVolume:null, yesterdayClose:null, priceChange:null };
  }
  const pe = pickNumericFromPaths(data, ['pe','peRatio','priceToEarnings','p_e','pe_ttm','price_earnings','fundamental.pe','fundamentals.pe','metrics.pe','snapshot.pe','snapshot.peRatio','snapshot.priceToEarnings','snapshot.p_e','snapshot.pe_ttm']);
  const eps = pickNumericFromPaths(data, ['eps','earningsPerShare','eps_ttm','earning_per_share','fundamental.eps','fundamentals.eps','metrics.eps','snapshot.eps','snapshot.earningsPerShare','snapshot.eps_ttm']);
  const marketCap = pickNumericFromPaths(data, ['marketCap','market_capitalization','capitalization','marketCapitalization','market_cap','market_value','mcap','fundamental.marketCap','fundamentals.marketCap','metrics.marketCap','snapshot.marketCap','snapshot.market_cap','snapshot.market_value']);
  let priceChangePercent = pickNumericFromPaths(data, ['priceChangePercent','pctChange','changePercent','chp','pct_change','percent_change','change_percent','snapshot.priceChangePercent','snapshot.pctChange','snapshot.changePercent','snapshot.chp','snapshot.pct_change']);
  let priceChange = pickNumericFromPaths(data, ['priceChange','change','chg','changeValue','price_change','change_value','lastChange','closeChange','snapshot.priceChange','snapshot.change','snapshot.chg','snapshot.lastChange','snapshot.closeChange']);
  const tradedVolume = pickNumericFromPaths(data, ['tradedVolume','volume','tradeVolume','totalVolume','tvol','trade_volume','qTotTran5J','snapshot.tradedVolume','snapshot.volume','snapshot.tvol']);
  const lastPriceRaw = pickNumericFromPaths(data, ['lastPrice','last','lastTradePrice','priceLast','last_trade_price','ltp','pl','snapshot.lastPrice','snapshot.last','snapshot.lastTradePrice','snapshot.ltp','snapshot.pl']);
  const closingPriceRaw = pickNumericFromPaths(data, ['closingPrice','close','closePrice','lastClosePrice','cp','pc','closing_price','snapshot.closingPrice','snapshot.close','snapshot.closePrice','snapshot.cp','snapshot.pc']);
  const highPrice = pickNumericFromPaths(data, ['highPrice','high','maxPrice','hp','h','day_high','price.high','snapshot.highPrice','snapshot.high','snapshot.hp','snapshot.h']);
  const lowPrice = pickNumericFromPaths(data, ['lowPrice','low','minPrice','lp','l','day_low','price.low','snapshot.lowPrice','snapshot.low','snapshot.lp','snapshot.l']);
  const tradedValueDirect = pickNumericFromPaths(data, ['tradedValue','value','tradeValue','totalValue','tval','trade_value','turnover','qTotCap','snapshot.tradedValue','snapshot.value','snapshot.tval']);
  const yesterdayClose = pickNumericFromPaths(data, ['yesterdayClose','yesterday','previousClose','py','snapshot.yesterdayClose','snapshot.yesterday','snapshot.previousClose','snapshot.py']);
  let averagePrice = pickNumericFromPaths(data, ['averagePrice','avgPrice','avg','avg_price','wap','vwap','price.avg','snapshot.averagePrice','snapshot.avgPrice','snapshot.avg','snapshot.vwap']);
  const closingPrice = closingPriceRaw;
  const lastPrice = lastPriceRaw !== null ? lastPriceRaw : closingPriceRaw;
  const derivedPrice = lastPrice !== null ? lastPrice : closingPrice;
  const tradedValue = tradedValueDirect !== null ? tradedValueDirect : (derivedPrice !== null && tradedVolume !== null ? derivedPrice * tradedVolume : null);
  if (averagePrice === null && tradedValue !== null && tradedVolume !== null && tradedVolume > 0) averagePrice = tradedValue / tradedVolume;
  if (priceChange === null && lastPrice !== null && closingPrice !== null) priceChange = lastPrice - closingPrice;
  if (priceChangePercent === null && priceChange !== null && closingPrice !== null && closingPrice !== 0) priceChangePercent = (priceChange / closingPrice) * 100;
  const realMoneyFlowRaw = firstDefined(getNested(data,'realMoneyFlow'),getNested(data,'realFlow'),getNested(data,'moneyFlow.real'),getNested(data,'money_flow.real'),getNested(data,'snapshot.realMoneyFlow'),getNested(data,'snapshot.realFlow'));
  const legalMoneyFlowRaw = firstDefined(getNested(data,'legalMoneyFlow'),getNested(data,'legalFlow'),getNested(data,'moneyFlow.legal'),getNested(data,'money_flow.legal'),getNested(data,'snapshot.legalMoneyFlow'),getNested(data,'snapshot.legalFlow'));
  return { pe, eps, marketCap, priceChangePercent, tradedValue, realMoneyFlow:normalizeMoneyFlowValue(realMoneyFlowRaw), legalMoneyFlow:normalizeMoneyFlowValue(legalMoneyFlowRaw), realMoneyFlowBreakdown:normalizeMoneyFlowBreakdown(realMoneyFlowRaw), legalMoneyFlowBreakdown:normalizeMoneyFlowBreakdown(legalMoneyFlowRaw), highPrice, lowPrice, averagePrice, lastPrice:derivedPrice, closingPrice, tradedVolume, yesterdayClose, priceChange };
}

function normalizeErrorMessage(error, fallbackMessage) {
  return error && typeof error.message === 'string' && error.message.trim() ? error.message.trim() : fallbackMessage;
}
function generateRequestId() { return 'anl-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7); }
function isTimeoutError(error) {
  if (!error) return false;
  const chain = [error,error.cause].filter(Boolean);
  for (let i=0;i<chain.length;i+=1) {
    const err=chain[i]; const statusCode=toNumber(err.statusCode||err.status||getNested(err,'response.status')||getNested(err,'cause.statusCode'),0); const code=String(err.code||err.name||'').toUpperCase(); const message=String(err.message||'').toLowerCase();
    if (statusCode===408||statusCode===504||code==='REQUEST_TIMEOUT'||code==='ETIMEDOUT'||code==='ESOCKETTIMEDOUT'||code==='ECONNABORTED'||code==='ABORT_ERROR'||code==='ABORTERR'||message.includes('timeout')||message.includes('timed out')||message.includes('aborted')||message.includes('request timeout')) return true;
  }
  return false;
}
function mapAnalyzeError(error) {
  const requestId=generateRequestId();
  if (isTimeoutError(error)) return {statusCode:504,body:{success:false,message:'درخواست شما بیش از حد طول کشید. لطفاً دوباره تلاش کنید.',messageEn:'Request timeout. Please try again.',code:'REQUEST_TIMEOUT',requestId}};
  const statusCode=toNumber((error&&(error.statusCode||error.status||getNested(error,'response.status')))||500,500);
  return {statusCode:statusCode>=400?statusCode:500,body:{success:false,message:normalizeErrorMessage(error,'خطا در تحلیل سهام'),requestId}};
}

function extractBrsMarketData(payload) {
  if (!payload) return null;
  const raw=isObject(payload.data)?payload.data:isObject(payload.result)?payload.result:isObject(payload.symbolData)?payload.symbolData:isObject(payload.snapshot)?payload.snapshot:isObject(payload)?payload:null;
  if (!isObject(raw)) return null;
  const safeCopy=Object.assign({},raw);
  const existingMetrics=pickFirstObject(safeCopy.marketMetrics,getNested(safeCopy,'metrics.marketMetrics'));
  safeCopy.marketMetrics=mergePreferSnapshot(existingMetrics,enrichMarketMetrics(safeCopy));
  return safeCopy;
}
function extractHistoryItems(payload) {
  if (!payload) return [];
  const candidates=[payload.data,payload.result,payload.items,payload.history,payload.rows,payload.records,payload.candles,payload.daily];
  for(let i=0;i<candidates.length;i+=1) if(Array.isArray(candidates[i])) return candidates[i];
  return Array.isArray(payload)?payload:[];
}
function normalizeHistoryCandle(item) {
  if(!isObject(item)) return null;
  const open=toNumber(firstDefined(item.open,item.o,item.openPrice,item.openingPrice,item.priceFirst,item.firstPrice,item.pf),0);
  const high=toNumber(firstDefined(item.high,item.h,item.highPrice,item.maxPrice,item.priceMax,item.pmax),0);
  const low=toNumber(firstDefined(item.low,item.l,item.lowPrice,item.minPrice,item.priceMin,item.pmin),0);
  const close=toNumber(firstDefined(item.close,item.c,item.priceClose,item.closing,item.closingPrice,item.lastClosePrice,item.finalPrice,item.pc,item.pl),0);
  const last=toNumber(firstDefined(item.last,item.lastPrice,item.currentPrice,item.tradedPrice,item.pl,item.pc),0);
  const yesterdayClose=toNumber(firstDefined(item.yesterdayClose,item.previousClose,item.yesterday,item.py),0);
  const volume=toNumber(firstDefined(item.volume,item.v,item.totalVolume,item.tradedVolume,item.tradeVolume,item.qTotTran5J,item.tvol),0);
  const value=toNumber(firstDefined(item.value,item.tradeValue,item.tradedValue,item.qTotCap,item.tval),0);
  const count=toNumber(firstDefined(item.count,item.tradeCount,item.transactions,item.zTotTran,item.tno),0);
  const date=firstDefined(item.date,item.d,item.tradeDate,item.jdate,item.gdate,item.insDate,item.deven,item.timestampLabel,'');
  if(open<=0&&high<=0&&low<=0&&close<=0&&last<=0&&volume<=0) return null;
  return {open,high,low,close,last,yesterdayClose,volume,value,count,date:typeof date==='string'||typeof date==='number'?String(date):''};
}
function sanitizeCandleSeries(items,limit) { return !Array.isArray(items)?[]:items.map(normalizeHistoryCandle).filter(Boolean).slice(0,Math.max(1,toNumber(limit,30))); }
function getClosingPrice(data) { return toNumber(firstDefined(getNested(data,'price.closing'),getNested(data,'price.close'),getNested(data,'snapshot.close'),getNested(data,'snapshot.closingPrice'),getNested(data,'snapshot.pc'),data.closingPrice,data.closePrice,data.close,data.pc,getNested(data,'price.last'),getNested(data,'snapshot.last'),getNested(data,'snapshot.pl'),data.lastClosePrice,data.lastPrice,data.pl),0); }
function getLastPrice(data) { return toNumber(firstDefined(getNested(data,'price.last'),getNested(data,'snapshot.last'),getNested(data,'snapshot.pl'),data.lastPrice,data.pl,getClosingPrice(data)),0); }
function getTradedVolume(data) { return toNumber(firstDefined(getNested(data,'trading.volume'),getNested(data,'snapshot.volume'),getNested(data,'snapshot.tradedVolume'),data.tradedVolume,data.tradeVolume,data.volume,data.tvol,data.qTotTran5J),0); }
function getFallbackDailySeries(fallbackData,dailyLimit) {
  if(!isObject(fallbackData)) return [];
  const candidates=[fallbackData.adjustedDailyCandles,fallbackData.dailyCandles,fallbackData.daily,fallbackData.history,fallbackData.items,fallbackData.rows,fallbackData.records];
  for(let i=0;i<candidates.length;i+=1) if(Array.isArray(candidates[i])&&candidates[i].length>0) return sanitizeCandleSeries(candidates[i],dailyLimit);
  return [];
}
function normalizeMoneyFlowPayload(payload) {
  if(!payload) return {real:null,legal:null};
  const root=isObject(payload.data)?payload.data:isObject(payload.result)?payload.result:isObject(payload.moneyFlow)?payload.moneyFlow:payload;
  if(!isObject(root)) return {real:null,legal:null};
  const realRaw=firstDefined(root.real,root.realMoneyFlow,root.haghighi,root.individual);
  const legalRaw=firstDefined(root.legal,root.legalMoneyFlow,root.hoghoghi,root.corporate);
  const real=normalizeMoneyFlowBreakdown(realRaw)||(normalizeMoneyFlowValue(realRaw)!==null?{inflow:null,outflow:null,net:normalizeMoneyFlowValue(realRaw)}:null);
  const legal=normalizeMoneyFlowBreakdown(legalRaw)||(normalizeMoneyFlowValue(legalRaw)!==null?{inflow:null,outflow:null,net:normalizeMoneyFlowValue(legalRaw)}:null);
  return {real,legal};
}
function hasMinimumAnalysisData(data) {
  if(!isObject(data)) return false;
  if(Math.max(getClosingPrice(data),getLastPrice(data))>0) return true;
  const dailySeries=Array.isArray(data.dailyCandles)?data.dailyCandles:(Array.isArray(data.daily)?data.daily:[]);
  const latestDaily=dailySeries.length>0?normalizeHistoryCandle(dailySeries[0]):null;
  return Boolean(latestDaily&&(latestDaily.close>0||latestDaily.last>0));
}
function createQualityMeta(overrides) {
  return Object.assign({quality:'invalid',hasLiveSnapshot:false,hasFallbackSnapshot:false,hasDailyHistory:false,hasRichDailyHistory:false,hasAdjustedDailyHistory:false,hasMoneyFlow:false,isFallbackUsed:false,isTradableDataset:false,sources:{liveSnapshotRequested:false,liveSnapshotSucceeded:false,historyRequested:false,historySucceeded:false,adjustedDailyRequested:false,adjustedDailySucceeded:false,moneyFlowRequested:false,moneyFlowSucceeded:false}},overrides||{});
}
function buildMarketDataQuality(snapshot,daily,fallbackData,dailyLimit,moneyFlow) {
  const fallbackDaily=getFallbackDailySeries(fallbackData,dailyLimit); const resolvedDaily=Array.isArray(daily)&&daily.length>0?daily:fallbackDaily;
  const snapshotPrice=Math.max(getClosingPrice(snapshot||{}),getLastPrice(snapshot||{})); const fallbackPrice=Math.max(getClosingPrice(fallbackData||{}),getLastPrice(fallbackData||{}));
  const hasLiveSnapshot=snapshotPrice>0; const hasFallbackSnapshot=fallbackPrice>0; const hasDailyHistory=Array.isArray(resolvedDaily)&&resolvedDaily.length>=1; const hasRichDailyHistory=Array.isArray(resolvedDaily)&&resolvedDaily.length>=5;
  const hasMoneyFlow=Boolean(moneyFlow&&((moneyFlow.real&&toFiniteOrNull(moneyFlow.real.net)!==null)||(moneyFlow.legal&&toFiniteOrNull(moneyFlow.legal.net)!==null)));
  let quality='invalid';
  if(hasLiveSnapshot&&hasRichDailyHistory&&hasMoneyFlow) quality='live-rich'; else if(hasLiveSnapshot&&hasRichDailyHistory) quality='live'; else if(hasLiveSnapshot&&hasDailyHistory) quality='live-limited-history'; else if(hasLiveSnapshot) quality='snapshot-only'; else if(hasFallbackSnapshot&&hasRichDailyHistory) quality='fallback-with-history'; else if(hasFallbackSnapshot) quality='fallback-only'; else if(hasDailyHistory) quality='history-only';
  return {quality,hasLiveSnapshot,hasFallbackSnapshot,hasDailyHistory,hasRichDailyHistory,hasAdjustedDailyHistory:hasDailyHistory,hasMoneyFlow,isFallbackUsed:!hasLiveSnapshot&&(hasFallbackSnapshot||hasDailyHistory),isTradableDataset:hasLiveSnapshot||hasFallbackSnapshot||hasDailyHistory};
}
function buildQualityWarnings(qualityMeta) {
  const warnings=[]; if(!qualityMeta||typeof qualityMeta!=='object') return ['market-data-quality-unknown'];
  if(qualityMeta.quality==='invalid') warnings.push('insufficient-market-data');
  if(qualityMeta.quality==='snapshot-only'||qualityMeta.quality==='live-limited-history') warnings.push('limited-history');
  if(qualityMeta.quality==='fallback-only') warnings.push('fallback-snapshot','missing-history');
  if(qualityMeta.quality==='fallback-with-history') warnings.push('fallback-snapshot');
  if(qualityMeta.quality==='history-only') warnings.push('missing-live-snapshot');
  if(!qualityMeta.hasRichDailyHistory) warnings.push('short-daily-history');
  if(!qualityMeta.hasMoneyFlow) warnings.push('missing-money-flow');
  if(qualityMeta.sources&&qualityMeta.sources.liveSnapshotRequested&&!qualityMeta.sources.liveSnapshotSucceeded) warnings.push('live-snapshot-fetch-failed');
  if(qualityMeta.sources&&(qualityMeta.sources.adjustedDailyRequested||qualityMeta.sources.historyRequested)&&!(qualityMeta.sources.adjustedDailySucceeded||qualityMeta.sources.historySucceeded)) warnings.push('history-fetch-failed');
  if(qualityMeta.sources&&qualityMeta.sources.moneyFlowRequested&&!qualityMeta.sources.moneyFlowSucceeded) warnings.push('money-flow-fetch-failed');
  return Array.from(new Set(warnings));
}
function buildDailySummary(merged,dailySeries) {
  const latest=Array.isArray(dailySeries)&&dailySeries.length>0?dailySeries[0]:null; const closingPrice=getClosingPrice(merged||{}); const lastPrice=getLastPrice(merged||{}); const tradedVolume=getTradedVolume(merged||{});
  return {close:latest&&latest.close>0?latest.close:closingPrice,last:latest&&latest.last>0?latest.last:lastPrice,open:latest?toNumber(latest.open,0):0,high:latest?toNumber(latest.high,0):0,low:latest?toNumber(latest.low,0):0,volume:latest&&latest.volume>0?latest.volume:tradedVolume,value:latest?toNumber(latest.value,0):0,count:latest?toNumber(latest.count,0):0,yesterdayClose:latest?toNumber(latest.yesterdayClose,0):0,date:latest&&latest.date?latest.date:''};
}
function buildResolvedMarketData(snapshot,daily,fallbackData,qualityMeta,dailyLimit,moneyFlow) {
  const merged=Object.assign({},fallbackData||{},snapshot||{}); const fallbackDaily=getFallbackDailySeries(fallbackData,dailyLimit); const resolvedDaily=Array.isArray(daily)&&daily.length>0?daily:fallbackDaily; const safeQualityMeta=createQualityMeta(qualityMeta); const qualityWarnings=buildQualityWarnings(safeQualityMeta);
  merged.daily=resolvedDaily; merged.dailyCandles=resolvedDaily; merged.adjustedDailyCandles=resolvedDaily; merged.weekly=[]; merged.weeklyCandles=[];
  if(!merged.dailySummary||typeof merged.dailySummary!=='object') merged.dailySummary=buildDailySummary(merged,resolvedDaily);
  const snapshotMetrics=isObject(snapshot)?enrichMarketMetrics(snapshot):null; const fallbackMetrics=isObject(fallbackData)?mergePreferSnapshot(pickFirstObject(fallbackData.marketMetrics),enrichMarketMetrics(fallbackData)):null;
  const mergedMetrics=mergePreferSnapshot(mergePreferSnapshot(fallbackMetrics,pickFirstObject(merged.marketMetrics)),snapshotMetrics);
  if(moneyFlow&&isObject(moneyFlow)){ merged.moneyFlow=moneyFlow; if(moneyFlow.real&&toFiniteOrNull(moneyFlow.real.net)!==null) merged.realMoneyFlow=moneyFlow.real.net; if(moneyFlow.legal&&toFiniteOrNull(moneyFlow.legal.net)!==null) merged.legalMoneyFlow=moneyFlow.legal.net; mergedMetrics.realMoneyFlow=firstDefined(toFiniteOrNull(mergedMetrics.realMoneyFlow),toFiniteOrNull(merged.realMoneyFlow),moneyFlow.real?toFiniteOrNull(moneyFlow.real.net):null); mergedMetrics.legalMoneyFlow=firstDefined(toFiniteOrNull(mergedMetrics.legalMoneyFlow),toFiniteOrNull(merged.legalMoneyFlow),moneyFlow.legal?toFiniteOrNull(moneyFlow.legal.net):null); mergedMetrics.realMoneyFlowBreakdown=mergedMetrics.realMoneyFlowBreakdown||(moneyFlow.real||null); mergedMetrics.legalMoneyFlowBreakdown=mergedMetrics.legalMoneyFlowBreakdown||(moneyFlow.legal||null); }
  merged.marketMetrics=mergedMetrics;
  if(toFiniteOrNull(merged.realMoneyFlow)===null&&toFiniteOrNull(mergedMetrics.realMoneyFlow)!==null) merged.realMoneyFlow=mergedMetrics.realMoneyFlow;
  if(toFiniteOrNull(merged.legalMoneyFlow)===null&&toFiniteOrNull(mergedMetrics.legalMoneyFlow)!==null) merged.legalMoneyFlow=mergedMetrics.legalMoneyFlow;
  if(toFiniteOrNull(merged.tradedValue)===null&&toFiniteOrNull(mergedMetrics.tradedValue)!==null) merged.tradedValue=mergedMetrics.tradedValue;
  if(toFiniteOrNull(merged.averagePrice)===null&&toFiniteOrNull(mergedMetrics.averagePrice)!==null) merged.averagePrice=mergedMetrics.averagePrice;
  if(toFiniteOrNull(merged.high)===null&&toFiniteOrNull(mergedMetrics.highPrice)!==null) merged.high=mergedMetrics.highPrice;
  if(toFiniteOrNull(merged.low)===null&&toFiniteOrNull(mergedMetrics.lowPrice)!==null) merged.low=mergedMetrics.lowPrice;
  if(toFiniteOrNull(merged.last)===null&&toFiniteOrNull(mergedMetrics.lastPrice)!==null) merged.last=mergedMetrics.lastPrice;
  if(toFiniteOrNull(merged.lastClosePrice)===null&&toFiniteOrNull(mergedMetrics.closingPrice)!==null) merged.lastClosePrice=mergedMetrics.closingPrice;
  if(toFiniteOrNull(merged.tradedVolume)===null&&toFiniteOrNull(mergedMetrics.tradedVolume)!==null) merged.tradedVolume=mergedMetrics.tradedVolume;
  merged._meta=Object.assign({},merged._meta||{},{analysisDataQuality:safeQualityMeta.quality,hasLiveSnapshot:safeQualityMeta.hasLiveSnapshot,hasFallbackSnapshot:safeQualityMeta.hasFallbackSnapshot,hasDailyHistory:safeQualityMeta.hasDailyHistory,hasRichDailyHistory:safeQualityMeta.hasRichDailyHistory,hasAdjustedDailyHistory:safeQualityMeta.hasAdjustedDailyHistory,hasMoneyFlow:safeQualityMeta.hasMoneyFlow,isFallbackUsed:safeQualityMeta.isFallbackUsed,isTradableDataset:safeQualityMeta.isTradableDataset,hasMinimumAnalysisData:hasMinimumAnalysisData(merged),warnings:qualityWarnings,sources:safeQualityMeta.sources||{}});
  return merged;
}
function buildMarketClosedFallbackPayload(basePayload) {
  const payload=isObject(basePayload)?Object.assign({},basePayload):{}; const existingWarnings=payload&&payload._meta&&Array.isArray(payload._meta.warnings)?payload._meta.warnings:[];
  if(!Array.isArray(payload.dailyCandles)) payload.dailyCandles=[]; if(!Array.isArray(payload.adjustedDailyCandles)) payload.adjustedDailyCandles=payload.dailyCandles; if(!Array.isArray(payload.daily)) payload.daily=payload.dailyCandles; payload.weekly=[]; payload.weeklyCandles=[];
  if(!isObject(payload.dailySummary)) payload.dailySummary={close:0,last:0,open:0,high:0,low:0,volume:0,value:0,count:0,yesterdayClose:0,date:''};
  if(!isObject(payload.marketMetrics)) payload.marketMetrics=enrichMarketMetrics(payload); else payload.marketMetrics=mergePreferSnapshot(payload.marketMetrics,enrichMarketMetrics(payload));
  const hasAnyMinimumData=hasMinimumAnalysisData(payload);
  payload._meta=Object.assign({},payload._meta||{},{analysisDataQuality:'market-closed-fallback',hasLiveSnapshot:false,hasFallbackSnapshot:false,hasDailyHistory:Array.isArray(payload.dailyCandles)&&payload.dailyCandles.length>0,hasRichDailyHistory:Array.isArray(payload.dailyCandles)&&payload.dailyCandles.length>=5,hasAdjustedDailyHistory:Array.isArray(payload.adjustedDailyCandles)&&payload.adjustedDailyCandles.length>0,hasMoneyFlow:Boolean(toFiniteOrNull(payload.realMoneyFlow)!==null||toFiniteOrNull(payload.legalMoneyFlow)!==null),isFallbackUsed:true,isTradableDataset:hasAnyMinimumData,hasMinimumAnalysisData:hasAnyMinimumData,warnings:Array.from(new Set([].concat(existingWarnings).concat(['market-closed','no-live-market-data','used-minimal-fallback'])))});
  return payload;
}
function buildPriceHistory(analysisPayload) {
  const rawDaily=Array.isArray(analysisPayload&&analysisPayload.dailyCandles)?analysisPayload.dailyCandles:(Array.isArray(analysisPayload&&analysisPayload.daily)?analysisPayload.daily:[]); const rawAdjusted=Array.isArray(analysisPayload&&analysisPayload.adjustedDailyCandles)?analysisPayload.adjustedDailyCandles:(Array.isArray(analysisPayload&&analysisPayload.adjustedDaily)?analysisPayload.adjustedDaily:rawDaily);
  const mapSeries=(series)=>series.map(item=>normalizeHistoryCandle(item)).filter(Boolean).map(item=>({date:item.date||'',close:toNumber(item.close,0),open:toNumber(item.open,0),high:toNumber(item.high,0),low:toNumber(item.low,0),last:toNumber(item.last,0),volume:toNumber(item.volume,0),value:toNumber(item.value,0),count:toNumber(item.count,0),yesterdayClose:toNumber(item.yesterdayClose,0)}));
  const daily=mapSeries(rawDaily); const adjustedDaily=mapSeries(rawAdjusted); return {daily,adjustedDaily,weekly:[],monthly:[]};
}
function buildResponseMarketData(analysisPayload,responseMarketMetrics,responsePriceHistory) {
  const dailySummary=isObject(analysisPayload&&analysisPayload.dailySummary)?analysisPayload.dailySummary:buildDailySummary(analysisPayload||{},[]);
  const closingPrice=Math.max(toNumber(dailySummary.close,0),toNumber(responseMarketMetrics&&responseMarketMetrics.closingPrice,0),getClosingPrice(analysisPayload||{})); const lastPrice=Math.max(toNumber(dailySummary.last,0),toNumber(responseMarketMetrics&&responseMarketMetrics.lastPrice,0),getLastPrice(analysisPayload||{})); const tradedVolume=Math.max(toNumber(dailySummary.volume,0),toNumber(responseMarketMetrics&&responseMarketMetrics.tradedVolume,0),getTradedVolume(analysisPayload||{}));
  const tradedValue=firstDefined(toFiniteOrNull(analysisPayload&&analysisPayload.tradedValue),toFiniteOrNull(responseMarketMetrics&&responseMarketMetrics.tradedValue),toFiniteOrNull(dailySummary.value)); const dailyCandles=Array.isArray(responsePriceHistory&&responsePriceHistory.daily)?responsePriceHistory.daily:[]; const adjustedDailyCandles=Array.isArray(responsePriceHistory&&responsePriceHistory.adjustedDaily)?responsePriceHistory.adjustedDaily:dailyCandles;
  return {lastClosePrice:closingPrice>0?closingPrice:0,closingPrice:closingPrice>0?closingPrice:0,close:closingPrice>0?closingPrice:0,lastPrice:lastPrice>0?lastPrice:0,last:lastPrice>0?lastPrice:0,tradedVolume:tradedVolume>0?tradedVolume:0,tradeVolume:tradedVolume>0?tradedVolume:0,volume:tradedVolume>0?tradedVolume:0,tradedValue:tradedValue!==null?tradedValue:0,tradeValue:tradedValue!==null?tradedValue:0,value:tradedValue!==null?tradedValue:0,high:firstDefined(toFiniteOrNull(analysisPayload&&analysisPayload.high),toFiniteOrNull(dailySummary.high),toFiniteOrNull(responseMarketMetrics&&responseMarketMetrics.highPrice),0),low:firstDefined(toFiniteOrNull(analysisPayload&&analysisPayload.low),toFiniteOrNull(dailySummary.low),toFiniteOrNull(responseMarketMetrics&&responseMarketMetrics.lowPrice),0),averagePrice:firstDefined(toFiniteOrNull(analysisPayload&&analysisPayload.averagePrice),toFiniteOrNull(responseMarketMetrics&&responseMarketMetrics.averagePrice),0),pe:firstDefined(toFiniteOrNull(responseMarketMetrics&&responseMarketMetrics.pe),null),eps:firstDefined(toFiniteOrNull(responseMarketMetrics&&responseMarketMetrics.eps),null),marketCap:firstDefined(toFiniteOrNull(responseMarketMetrics&&responseMarketMetrics.marketCap),null),priceChangePercent:firstDefined(toFiniteOrNull(responseMarketMetrics&&responseMarketMetrics.priceChangePercent),toFiniteOrNull(analysisPayload&&analysisPayload.lastChangePercent),toFiniteOrNull(analysisPayload&&analysisPayload.closeChangePercent),null),changePercent:firstDefined(toFiniteOrNull(responseMarketMetrics&&responseMarketMetrics.priceChangePercent),toFiniteOrNull(analysisPayload&&analysisPayload.lastChangePercent),toFiniteOrNull(analysisPayload&&analysisPayload.closeChangePercent),null),lastChangePercent:firstDefined(toFiniteOrNull(analysisPayload&&analysisPayload.lastChangePercent),toFiniteOrNull(responseMarketMetrics&&responseMarketMetrics.priceChangePercent),null),priceChange:firstDefined(toFiniteOrNull(responseMarketMetrics&&responseMarketMetrics.priceChange),toFiniteOrNull(analysisPayload&&analysisPayload.lastChange),toFiniteOrNull(analysisPayload&&analysisPayload.closeChange),null),yesterdayClose:firstDefined(toFiniteOrNull(dailySummary.yesterdayClose),toFiniteOrNull(responseMarketMetrics&&responseMarketMetrics.yesterdayClose),toFiniteOrNull(analysisPayload&&analysisPayload.yesterday),null),realMoneyFlow:firstDefined(toFiniteOrNull(analysisPayload&&analysisPayload.realMoneyFlow),toFiniteOrNull(responseMarketMetrics&&responseMarketMetrics.realMoneyFlow),null),legalMoneyFlow:firstDefined(toFiniteOrNull(analysisPayload&&analysisPayload.legalMoneyFlow),toFiniteOrNull(responseMarketMetrics&&responseMarketMetrics.legalMoneyFlow),null),realMoneyFlowBreakdown:responseMarketMetrics&&responseMarketMetrics.realMoneyFlowBreakdown?responseMarketMetrics.realMoneyFlowBreakdown:null,legalMoneyFlowBreakdown:responseMarketMetrics&&responseMarketMetrics.legalMoneyFlowBreakdown?responseMarketMetrics.legalMoneyFlowBreakdown:null,moneyFlow:analysisPayload&&analysisPayload.moneyFlow?analysisPayload.moneyFlow:null,dailyCandles,adjustedDailyCandles,priceHistory:{daily:dailyCandles,adjustedDaily:adjustedDailyCandles,weekly:[],monthly:[]}};
}
function computeLowQualityMeta(quality,analysisPayload,aiResultData) {
  const warnings=analysisPayload&&analysisPayload._meta&&Array.isArray(analysisPayload._meta.warnings)?analysisPayload._meta.warnings:[]; const aiMeta=isObject(aiResultData&&aiResultData.meta)?aiResultData.meta:{}; const lowFromAI=Boolean(aiResultData&&(aiResultData.lowQuality===true||aiMeta.lowQuality===true||aiResultData.dataInsufficient===true||aiMeta.dataInsufficient===true)); const lowFromQuality=!quality||['invalid','snapshot-only','history-only','fallback-only'].includes(quality.quality); const lowFromWarnings=warnings.some(w=>['insufficient-market-data','limited-history','missing-money-flow','history-fetch-failed'].includes(w)); const lowQuality=lowFromAI||lowFromQuality||lowFromWarnings; const lowQualityReason=firstDefined(aiResultData&&aiResultData.lowQualityReason,aiMeta.lowQualityReason,lowFromQuality?'input-market-data-low-quality':null,lowFromWarnings?'warnings:'+warnings.join(','):null,null); return {lowQuality,lowQualityReason,dataQualityScore:quality&&quality.quality?quality.quality:'unknown'};
}
async function resolveAnalysisContext(symbol,fallbackData,dailyCount,weeklyCount) {
  const normalizedDailyCount=Math.max(5,toNumber(dailyCount,30)); const invalidQuality=createQualityMeta();
  if(!symbol) return {marketData:buildResolvedMarketData(null,[],fallbackData,invalidQuality,normalizedDailyCount,null),quality:invalidQuality};
  const context={snapshot:null,daily:[],moneyFlow:null,snapshotError:null,historyError:null,moneyFlowError:null}; const historyLimit=Math.max(normalizedDailyCount,30); const canFetchAdjusted=brsService&&typeof brsService.getAdjustedDailyCandlestick==='function'; const canFetchHistory=brsService&&typeof brsService.getSymbolHistory==='function'; const canFetchMoneyFlow=brsService&&typeof brsService.getMoneyFlow==='function';
  const qualitySources={liveSnapshotRequested:Boolean(brsService&&typeof brsService.getSymbolData==='function'),liveSnapshotSucceeded:false,historyRequested:Boolean(canFetchHistory),historySucceeded:false,adjustedDailyRequested:Boolean(canFetchAdjusted),adjustedDailySucceeded:false,moneyFlowRequested:Boolean(canFetchMoneyFlow),moneyFlowSucceeded:false}; const tasks=[];
  if(qualitySources.liveSnapshotRequested) tasks.push(brsService.getSymbolData(symbol).then(r=>{context.snapshot=extractBrsMarketData(r);qualitySources.liveSnapshotSucceeded=Boolean(context.snapshot);}).catch(err=>{context.snapshotError=err;console.warn('[Analyze] Live market fetch failed for '+symbol+':',err.message);}));
  if(canFetchAdjusted) tasks.push(brsService.getAdjustedDailyCandlestick(symbol,historyLimit).then(r=>{context.daily=sanitizeCandleSeries(extractHistoryItems(r),normalizedDailyCount);qualitySources.adjustedDailySucceeded=context.daily.length>0;qualitySources.historySucceeded=qualitySources.adjustedDailySucceeded;}).catch(err=>{context.historyError=err;console.warn('[Analyze] Adjusted daily history fetch failed for '+symbol+':',err.message);})); else if(canFetchHistory) tasks.push(brsService.getSymbolHistory(symbol,historyLimit).then(r=>{context.daily=sanitizeCandleSeries(extractHistoryItems(r),normalizedDailyCount);qualitySources.historySucceeded=context.daily.length>0;}).catch(err=>{context.historyError=err;console.warn('[Analyze] History fetch failed for '+symbol+':',err.message);}));
  if(canFetchMoneyFlow) tasks.push(brsService.getMoneyFlow(symbol).then(r=>{const normalized=normalizeMoneyFlowPayload(r);context.moneyFlow=normalized;qualitySources.moneyFlowSucceeded=Boolean((normalized.real&&toFiniteOrNull(normalized.real.net)!==null)||(normalized.legal&&toFiniteOrNull(normalized.legal.net)!==null));}).catch(err=>{context.moneyFlowError=err;console.warn('[Analyze] Money flow fetch failed for '+symbol+':',err.message);}));
  if(tasks.length>0) await Promise.allSettled(tasks);
  const quality=createQualityMeta(Object.assign(buildMarketDataQuality(context.snapshot,context.daily,fallbackData,normalizedDailyCount,context.moneyFlow),{sources:qualitySources}));
  return {marketData:buildResolvedMarketData(context.snapshot,context.daily,fallbackData,quality,normalizedDailyCount,context.moneyFlow),quality,errors:{snapshot:context.snapshotError,history:context.historyError,moneyFlow:context.moneyFlowError}};
}
function shouldRejectAnalysisQuality(){return false;}
function normalizeAnalysisType(value){return typeof value!=='string'||!value.trim()?'analysis':value.trim();}
function extractRequestOptions(body){const safeBody=body&&typeof body==='object'?body:{};return {dailyCount:Math.max(5,toNumber(safeBody.dailyCount,30)),weeklyCount:Math.max(1,toNumber(safeBody.weeklyCount,24)),model:typeof safeBody.model==='string'&&safeBody.model.trim()?safeBody.model.trim():undefined,maxTokens:clampNumber(safeBody.maxTokens,256,4000,undefined),temperature:clampNumber(safeBody.temperature,0,1,undefined)};}
function extractUserId(req){if(!req||!req.user||typeof req.user!=='object')return null;const raw=req.user.id!==undefined?req.user.id:req.user.userId;if(raw===undefined||raw===null||raw==='')return null;const parsed=Number(raw);return Number.isInteger(parsed)&&parsed>0?parsed:null;}

const analyzeStockHandler=async(req,res)=>{try{if(!aiService.isAvailable)return res.status(503).json({success:false,message:'سرویس هوش مصنوعی در دسترس نیست. لطفاً GAPGPT_API_KEY را تنظیم کنید.'});const body=req.body||{};const {symbol,data,marketData,analysisType,featureKey}=body;const normalizedSymbol=normalizeSymbol(symbol);if(!normalizedSymbol)return res.status(400).json({success:false,message:'نماد سهام الزامی است'});const options=extractRequestOptions(body);const resolvedAnalysisType=normalizeAnalysisType(analysisType||featureKey);const fallbackMarketData=data||marketData||null;const resolvedContext=await resolveAnalysisContext(normalizedSymbol,fallbackMarketData,options.dailyCount,options.weeklyCount);let analysisPayload=isObject(resolvedContext.marketData)?resolvedContext.marketData:buildResolvedMarketData(null,[],fallbackMarketData,createQualityMeta(resolvedContext.quality),options.dailyCount,null);const hasHistory=Array.isArray(analysisPayload&&analysisPayload.dailyCandles)&&analysisPayload.dailyCandles.length>0;const hasAnyPrice=getClosingPrice(analysisPayload||{})>0||getLastPrice(analysisPayload||{})>0;if(!hasHistory&&!hasAnyPrice){let marketStatus=null;try{if(brsService&&typeof brsService.getMarketStatus==='function')marketStatus=await brsService.getMarketStatus();}catch(e){console.warn('[Analyze] market status check failed:',e.message);}const isMarketOpenNow=marketStatus&&typeof marketStatus.isOpen==='boolean'?marketStatus.isOpen:false;if(isMarketOpenNow)return res.status(503).json({success:false,message:'داده بازار در حال حاضر در دسترس نیست. لطفاً کمی بعد دوباره تلاش کنید.',messageEn:'Market data is currently unavailable. Please try again later.',code:'MARKET_DATA_UNAVAILABLE',requestId:generateRequestId()});analysisPayload=buildMarketClosedFallbackPayload(analysisPayload);}
  if(shouldRejectAnalysisQuality(resolvedContext.quality))return res.status(422).json({success:false,message:'کیفیت داده برای تحلیل کافی نیست.',code:'LOW_QUALITY_INPUT',dataQuality:resolvedContext.quality?resolvedContext.quality.quality:'unknown',warnings:analysisPayload&&analysisPayload._meta?analysisPayload._meta.warnings:[],requestId:generateRequestId()});
  const result=await aiService.analyzeStock({symbol:normalizedSymbol,data:analysisPayload,analysisType:resolvedAnalysisType,dailyCount:options.dailyCount,weeklyCount:options.weeklyCount,model:options.model,maxTokens:options.maxTokens,temperature:options.temperature}); const qualityMeta=computeLowQualityMeta(resolvedContext.quality,analysisPayload,result&&result.data); const userId=extractUserId(req);
  if(prisma&&userId!==null&&result&&result.data){try{const historyResult=result.data;const historySymbol=historyResult?.symbol||normalizedSymbol;if(historyResult&&historySymbol){await prisma.analysisHistory.create({data:{userId,stock:String(historySymbol).trim(),resultJson:typeof historyResult==='string'?historyResult:JSON.stringify(historyResult)}});const historyIds=await prisma.analysisHistory.findMany({where:{userId},select:{id:true},orderBy:{createdAt:'desc'}});if(historyIds.length>3)await prisma.analysisHistory.deleteMany({where:{id:{in:historyIds.slice(3).map(item=>item.id)}}});}}catch(historyError){console.error('[Analyze] History save failed:',historyError);}}
  const responseMarketMetrics=isObject(analysisPayload&&analysisPayload.marketMetrics)?analysisPayload.marketMetrics:enrichMarketMetrics(analysisPayload||{});const responsePriceHistory=buildPriceHistory(analysisPayload);const responseMarketData=buildResponseMarketData(analysisPayload,responseMarketMetrics,responsePriceHistory);const responseData=Object.assign({},result&&isObject(result.data)?result.data:{},{symbol:normalizedSymbol,marketData:responseMarketData,marketMetrics:responseMarketMetrics,dailySummary:analysisPayload&&analysisPayload.dailySummary?analysisPayload.dailySummary:null,priceHistory:responsePriceHistory,marketDataMeta:analysisPayload&&analysisPayload._meta?analysisPayload._meta:null,lowQuality:qualityMeta.lowQuality,lowQualityReason:qualityMeta.lowQualityReason,dataQualityScore:qualityMeta.dataQualityScore});
  return res.json({success:true,symbol:normalizedSymbol,data:responseData,content:result&&result.content?result.content:'',model:result&&result.model?result.model:undefined,usage:result?result.usage:undefined,type:result?result.type:undefined,marketDataIncluded:Boolean(analysisPayload),dataQuality:analysisPayload&&analysisPayload._meta&&analysisPayload._meta.analysisDataQuality?analysisPayload._meta.analysisDataQuality:(resolvedContext.quality?resolvedContext.quality.quality:'unknown'),dataQualityScore:qualityMeta.dataQualityScore,lowQuality:qualityMeta.lowQuality,lowQualityReason:qualityMeta.lowQualityReason,warnings:analysisPayload&&analysisPayload._meta&&Array.isArray(analysisPayload._meta.warnings)?analysisPayload._meta.warnings:[],marketDataMeta:analysisPayload&&analysisPayload._meta?analysisPayload._meta:null,marketMetrics:responseMarketMetrics,marketData:responseMarketData,dailySummary:analysisPayload&&analysisPayload.dailySummary?analysisPayload.dailySummary:null,priceHistory:responsePriceHistory,rawData:{symbol:normalizedSymbol,marketData:analysisPayload,marketMetrics:responseMarketMetrics,dailySummary:analysisPayload&&analysisPayload.dailySummary?analysisPayload.dailySummary:null,priceHistory:responsePriceHistory}});
}catch(error){console.error('[Analyze] Stock error:',error.message);const mapped=mapAnalyzeError(error);return res.status(mapped.statusCode).json(mapped.body);}};

const analyzeGeneralHandler=async(req,res)=>{try{if(!aiService.isAvailable)return res.status(503).json({success:false,message:'سرویس هوش مصنوعی در دسترس نیست'});const body=req.body||{};const {prompt,query,text,symbol,context}=body;const options=extractRequestOptions(body);const userPrompt=prompt||query||text||'';if(!userPrompt)return res.status(400).json({success:false,message:'متن درخواست الزامی است'});const result=await aiService.analyze({prompt:userPrompt,symbol:symbol||'',context:context||'',model:options.model,maxTokens:options.maxTokens,temperature:options.temperature});return res.json({success:true,data:result.data||null,content:result.content||'',model:result.model,usage:result.usage});}catch(error){console.error('[Analyze] General error:',error.message);const mapped=mapAnalyzeError(error);return res.status(mapped.statusCode).json(mapped.body);}};

function normalizeComparisonResponse(result, symbols) {
  const source = result && isObject(result.data) ? result.data : {};
  const symbol1 = symbols[0] || '';
  const symbol2 = symbols[1] || '';
  const existing1 = isObject(source.symbol1_analysis) ? source.symbol1_analysis : null;
  const existing2 = isObject(source.symbol2_analysis) ? source.symbol2_analysis : null;
  const winner = normalizeSymbol(source.winner || source.selectedSymbol || '');
  const reason = String(source.reason || '').trim();
  const details = source.details;
  const detailsText = typeof details === 'string' ? details : (details ? JSON.stringify(details, null, 2) : '');
  const scores = isObject(source.scores) ? source.scores : {};
  const makeAnalysis = (symbol, existing, isWinner) => {
    const score = scores[symbol];
    const scoreText = score !== undefined && score !== null ? 'امتیاز مقایسه: ' + score : '';
    const technical = existing && (existing.technicalAnalysis || existing.technical_analysis);
    const fundamental = existing && (existing.fundamentalAnalysis || existing.fundamental_analysis);
    return {
      ...(existing || {}),
      recommendation: (existing && existing.recommendation) || (isWinner ? 'خرید' : 'نگهداری'),
      summary: (existing && existing.summary) || (isWinner ? (symbol + ' به عنوان گزینه برتر مقایسه انتخاب شده است. ' + reason).trim() : (symbol + ' در این مقایسه به عنوان گزینه برتر انتخاب نشده است. ' + reason).trim()),
      technicalAnalysis: technical || scoreText || 'تحلیل تکنیکال تفصیلی در پاسخ فعلی سرویس ارائه نشده است.',
      fundamentalAnalysis: fundamental || detailsText || 'تحلیل بنیادی تفصیلی در پاسخ فعلی سرویس ارائه نشده است.',
    };
  };
  return {
    symbol1_analysis: makeAnalysis(symbol1, existing1, Boolean(winner && winner === symbol1)),
    symbol2_analysis: makeAnalysis(symbol2, existing2, Boolean(winner && winner === symbol2)),
    comparison_summary: source.comparison_summary || source.comparisonSummary || detailsText || reason || ('نتیجه مقایسه برای ' + symbol1 + ' و ' + symbol2 + ' دریافت شد.'),
    final_recommendation: source.final_recommendation || source.finalRecommendation || (winner ? ('برنده مقایسه: ' + winner + (reason ? ' — ' + reason : '')) : 'سرویس مقایسه برنده مشخصی اعلام نکرده است.'),
  };
}

const compareStocksHandler=async(req,res)=>{try{if(!aiService.isAvailable)return res.status(503).json({success:false,message:'سرویس هوش مصنوعی در دسترس نیست'});const body=req.body||{};const {symbols,stocks,criteria,data}=body;const options=extractRequestOptions(body);const rawList=Array.isArray(symbols)?symbols:(Array.isArray(stocks)?stocks:[]);const symbolList=rawList.map(normalizeSymbol).filter(Boolean);if(symbolList.length<2)return res.status(400).json({success:false,message:'حداقل دو نماد برای مقایسه لازم است'});const result=await aiService.compareStocks({symbols:symbolList,criteria:criteria||'عمومی',data:data||null,model:options.model,maxTokens:options.maxTokens,temperature:options.temperature});const normalizedData=normalizeComparisonResponse(result,symbolList);return res.json({success:true,data:normalizedData,content:result&&result.content?result.content:'',model:result&&result.model,usage:result&&result.usage});}catch(error){console.error('[Analyze] Compare error:',error.message);const mapped=mapAnalyzeError(error);return res.status(mapped.statusCode).json(mapped.body);}};

const optimizePortfolioHandler=async(req,res)=>{try{if(!aiService.isAvailable)return res.status(503).json({success:false,message:'سرویس هوش مصنوعی در دسترس نیست'});const body=req.body||{};const {portfolio,items,analyses}=body;const options=extractRequestOptions(body);const portfolioItems=Array.isArray(portfolio)?portfolio:(Array.isArray(items)?items:[]);if(portfolioItems.length===0)return res.status(400).json({success:false,message:'سبد سرمایه‌گذاری خالی است'});const result=await aiService.optimizePortfolio({portfolio:portfolioItems,analyses:Array.isArray(analyses)?analyses:[],model:options.model,maxTokens:options.maxTokens,temperature:options.temperature});return res.json({success:true,data:result.data||null,content:result.content||'',model:result.model,usage:result.usage});}catch(error){console.error('[Analyze] Portfolio error:',error.message);const mapped=mapAnalyzeError(error);return res.status(mapped.statusCode).json(mapped.body);}};

const chatHandler=async(req,res)=>{try{if(!aiService.isAvailable)return res.status(503).json({success:false,message:'سرویس هوش مصنوعی در دسترس نیست'});const body=req.body||{};const {message,content,prompt,query,history,systemPrompt}=body;const options=extractRequestOptions(body);const userMessage=message||content||prompt||query||'';const chatHistory=Array.isArray(history)?history:[];if(!userMessage&&chatHistory.length===0)return res.status(400).json({success:false,message:'پیامی ارسال نشده است'});const result=await aiService.chat({message:userMessage,history:chatHistory,systemPrompt,model:options.model,maxTokens:options.maxTokens,temperature:options.temperature});return res.json({success:true,data:result.data||null,content:result.content||'',model:result.model,usage:result.usage});}catch(error){console.error('[Analyze] Chat error:',error.message);const mapped=mapAnalyzeError(error);return res.status(mapped.statusCode).json(mapped.body);}};

const healthHandler=async(req,res)=>{try{const health=await aiService.healthCheck();const config=aiService.getConfig();return res.json({success:true,available:aiService.isAvailable,health,config:{model:config.model,fallbackModel:config.fallbackModel,timeout:config.timeout}});}catch(error){const mapped=mapAnalyzeError(error);return res.status(mapped.statusCode).json(mapped.body);}};
async function shutdownPrisma(){if(prisma&&typeof prisma.$disconnect==='function'){try{await prisma.$disconnect();}catch(err){console.warn('[Analyze] Prisma disconnect failed:',err.message);}}}
process.once('SIGINT',shutdownPrisma);process.once('SIGTERM',shutdownPrisma);
module.exports={analyzeStockHandler,analyzeGeneralHandler,compareStocksHandler,optimizePortfolioHandler,chatHandler,healthHandler,analyzeStock:analyzeStockHandler,analyze:analyzeGeneralHandler,compare:compareStocksHandler};
