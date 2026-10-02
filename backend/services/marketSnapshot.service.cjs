'use strict';

const prisma = require('../config/prisma.cjs');

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeSymbol(item) {
  const closePrice = toNumber(item.closingPrice);
  const yesterday = toNumber(item.yesterday ?? item.previousPrice ?? item.yesterdayPrice);
  const fallbackPct = closePrice !== null && yesterday > 0 ? ((closePrice - yesterday) / yesterday) * 100 : null;
  const closeChangePercent = toNumber(item.closingChangePercent ?? fallbackPct);
  return {
    symbol: String(item.symbol || '').trim(),
    name: item.name || null,
    insCode: String(item.isin || item.id || '').trim() || null,
    open: toNumber(item.open ?? item.openPrice),
    high: toNumber(item.high ?? item.highPrice),
    low: toNumber(item.low ?? item.lowPrice),
    lastPrice: toNumber(item.lastPrice),
    closePrice,
    change: toNumber(item.lastChange),
    changePercent: toNumber(item.lastChangePercent),
    closeChangePercent,
    volume: item.tradeVolume == null ? null : Math.trunc(Number(item.tradeVolume)),
    value: toNumber(item.tradeValue),
    tradeCount: item.tradeCount == null ? null : Math.trunc(Number(item.tradeCount)),
    yesterday,
    sector: item.sector || null,
    realBuyVolume: item.realBuyVolume == null ? 0 : Math.trunc(Number(item.realBuyVolume)),
    realSellVolume: item.realSellVolume == null ? 0 : Math.trunc(Number(item.realSellVolume)),
    legalBuyVolume: item.instBuyVolume == null ? 0 : Math.trunc(Number(item.instBuyVolume)),
    legalSellVolume: item.instSellVolume == null ? 0 : Math.trunc(Number(item.instSellVolume))
  };
}

function isEligible(row) {
  const last = toNumber(row.lastPrice);
  const close = toNumber(row.closePrice);
  const volume = Math.max(0, Number(row.volume || 0));
  const value = Math.max(0, Number(row.value || 0));
  const yesterday = toNumber(row.yesterday);
  if (!(last > 0) || !(close > 0) || !(volume > 0) || !(value > 0) || !(yesterday > 0)) return false;
  if (row.open != null && Number(row.open) <= 0) return false;
  if (row.high != null && row.low != null && (Number(row.high) < Number(row.low) || last < Number(row.low) || last > Number(row.high))) return false;
  const pct = ((last - yesterday) / yesterday) * 100;
  const placeholder = last === 1 && close === 1 && pct <= -99.99 && value === volume &&
    Number(row.realBuyVolume || 0) === 0 && Number(row.realSellVolume || 0) === 0;
  return !placeholder;
}

function changePercent(row) {
  const last = Number(row.lastPrice);
  const yesterday = Number(row.yesterday);
  if (last > 0 && yesterday > 0) return ((last - yesterday) / yesterday) * 100;
  return toNumber(row.changePercent);
}

function buildDerived(symbols, generatedAt) {
  const valid = symbols
    .filter(isEligible)
    .filter((row) => !/شاخص|index/i.test(String(row.symbol || '') + ' ' + String(row.name || '')))
    .map((row) => ({ ...row, radarChangePercent: changePercent(row) }))
    .filter((row) => row.radarChangePercent !== null);

  const positive = valid.filter((r) => r.radarChangePercent > 0).length;
  const negative = valid.filter((r) => r.radarChangePercent < 0).length;
  const neutral = valid.filter((r) => r.radarChangePercent === 0).length;
  const total = positive + negative + neutral;

  const toPublic = (row, pct = row.changePercent) => ({
    symbol: row.symbol, name: row.name, insCode: row.insCode,
    lastPrice: row.lastPrice, closePrice: row.closePrice, change: row.change,
    changePercent: pct, lastChangePercent: pct, closeChangePercent: row.closeChangePercent,
    volume: row.volume, value: row.value, tradeCount: row.tradeCount, sector: row.sector,
    realBuyVolume: row.realBuyVolume, realSellVolume: row.realSellVolume,
    legalBuyVolume: row.legalBuyVolume, legalSellVolume: row.legalSellVolume
  });

  const gainers = valid.filter(r => r.radarChangePercent > 0)
    .sort((a,b) => b.radarChangePercent - a.radarChangePercent).slice(0,10)
    .map(r => toPublic(r, r.radarChangePercent));
  const losers = valid.filter(r => r.radarChangePercent < 0)
    .sort((a,b) => a.radarChangePercent - b.radarChangePercent).slice(0,10)
    .map(r => toPublic(r, r.radarChangePercent));
  const highVolume = [...valid]
    .sort((a,b) => (Number(b.volume||0)-Number(a.volume||0)) || (Number(b.value||0)-Number(a.value||0)))
    .slice(0,10).map(r => toPublic(r));

  const realFlowRows = valid.filter(r => Number(r.realBuyVolume||0) > 0 || Number(r.realSellVolume||0) > 0);
  const totalRealBuyVolume = realFlowRows.reduce((s,r) => s + Math.max(0,Number(r.realBuyVolume||0)),0);
  const totalRealSellVolume = realFlowRows.reduce((s,r) => s + Math.max(0,Number(r.realSellVolume||0)),0);

  const sectorsMap = new Map();
  for (const row of valid) {
    const name = String(row.sector || '').trim() || 'سایر / صنعت نامشخص';
    const s = sectorsMap.get(name) || {symbols:0,positive:0,negative:0,neutral:0,sumPct:0,value:0};
    s.symbols++;
    if (row.radarChangePercent > 0) s.positive++;
    else if (row.radarChangePercent < 0) s.negative++;
    else s.neutral++;
    s.sumPct += row.radarChangePercent;
    s.value += Number(row.value || 0);
    sectorsMap.set(name,s);
  }
  const sectors = [...sectorsMap.entries()].map(([name,s]) => ({
    name, symbols:s.symbols, positive:s.positive, negative:s.negative, neutral:s.neutral,
    changePercent:s.symbols ? s.sumPct/s.symbols : 0, value:s.value, rank:0
  })).filter(r => Number.isFinite(r.changePercent));
  sectors.sort((a,b) => b.changePercent-a.changePercent);
  sectors.forEach((r,i)=>{r.rank=i+1;});

  return {
    snapshotSymbolCount: symbols.length,
    eligibleSymbolCount: valid.length,
    generatedAt,
    breadth: {
      available:true, stale:false, source:'versioned-market-snapshot', updatedAt:generatedAt,
      positive, negative, neutral, total,
      positivePercent: total ? positive/total*100 : 0,
      negativePercent: total ? negative/total*100 : 0,
      neutralPercent: total ? neutral/total*100 : 0,
      advanceDeclineRatio: negative ? positive/negative : null,
      coveragePercent: symbols.length ? total/symbols.length*100 : 0,
      topGainers:gainers, topLosers:losers, topVolumes:highVolume,
      realFlow:{available:realFlowRows.length>0,rowsWithRealFlow:realFlowRows.length,
        totalRealBuyVolume,totalRealSellVolume,netRealBuyVolume:totalRealBuyVolume-totalRealSellVolume,unit:'volume'},
      sectors:{
        available:sectors.length>0,
        leaders:sectors.slice(0,6),
        laggards:[...sectors].sort((a,b)=>a.changePercent-b.changePercent).slice(0,6),
        rows:sectors
      }
    },
    movers:{gainers,losers,highVolume},
    industries:sectors.map(s => ({
      industryCode:null, industryName:s.name, symbolCount:s.symbols, changePercent:s.changePercent,
      value:s.value, rank:s.rank, updatedAt:generatedAt, source:'versioned-market-snapshot', isStale:false
    }))
  };
}

async function createPreparedSnapshot(symbols) {
  const unique = new Set(symbols.map(s => s.symbol).filter(Boolean));
  if (!symbols.length || unique.size !== symbols.length) {
    throw new Error('BRS snapshot failed completeness validation: empty or duplicate symbols');
  }
  const now = new Date();
  const result = await prisma.$queryRaw`
    INSERT INTO [dbo].[MarketSnapshot] ([status],[symbolCount],[symbolsJson],[source],[createdAt])
    OUTPUT INSERTED.[id]
    VALUES ('PREPARED', ${symbols.length}, ${JSON.stringify(symbols)}, 'brs-central-worker', ${now})
  `;
  const id = Number(result?.[0]?.id);
  if (!Number.isInteger(id)) throw new Error('MarketSnapshot insert failed');
  return id;
}

async function verifyPreparedSnapshot(id, expectedCount) {
  const rows = await prisma.$queryRaw`
    SELECT [id],[status],[symbolCount],[symbolsJson]
    FROM [dbo].[MarketSnapshot] WHERE [id]=${id}
  `;
  const row = rows?.[0];
  if (!row || row.status !== 'PREPARED' || Number(row.symbolCount) !== expectedCount) {
    throw new Error('MarketSnapshot verification failed');
  }
  let parsed;
  try { parsed = JSON.parse(row.symbolsJson); } catch { parsed = null; }
  if (!Array.isArray(parsed) || parsed.length !== expectedCount) {
    throw new Error('MarketSnapshot payload verification failed');
  }
  const unique = new Set(parsed.map(s => s && s.symbol).filter(Boolean));
  if (unique.size !== expectedCount) throw new Error('MarketSnapshot uniqueness verification failed');
  return parsed;
}

function getHealthThreshold(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

async function validateSnapshotHealth(symbols) {
  const unique = new Set(symbols.map(s => String(s?.symbol || '').trim()).filter(Boolean));
  const duplicateCount = Math.max(0, symbols.length - unique.size);
  if (!symbols.length || duplicateCount > 0) {
    throw new Error('BRS snapshot health check failed: empty=' + (symbols.length === 0) + ', duplicateCount=' + duplicateCount);
  }

  const active = await getActiveSnapshot();
  if (!active) {
    return {
      mode: 'BOOTSTRAP', accepted: true, previousCount: 0, newCount: symbols.length,
      intersectionCount: 0, countRatio: null, overlapRatio: null, overlapNewRatio: null, duplicateCount
    };
  }

  let previousSymbols;
  try { previousSymbols = JSON.parse(active.symbolsJson); }
  catch { throw new Error('BRS snapshot health check failed: active snapshot payload is invalid'); }
  if (!Array.isArray(previousSymbols) || !previousSymbols.length) {
    throw new Error('BRS snapshot health check failed: active snapshot has no symbols');
  }

  const previousSet = new Set(previousSymbols.map(s => String(s?.symbol || '').trim()).filter(Boolean));
  const newSet = unique;
  const intersectionCount = [...newSet].filter(symbol => previousSet.has(symbol)).length;
  const previousCount = previousSet.size;
  const newCount = newSet.size;
  const countRatio = previousCount ? newCount / previousCount : null;
  const overlapRatio = previousCount ? intersectionCount / previousCount : null;
  const overlapNewRatio = newCount ? intersectionCount / newCount : null;

  const minCountRatio = getHealthThreshold('MARKET_SNAPSHOT_MIN_COUNT_RATIO', 0.90);
  const minOverlapRatio = getHealthThreshold('MARKET_SNAPSHOT_MIN_OVERLAP_RATIO', 0.90);
  const maxCountRatio = getHealthThreshold('MARKET_SNAPSHOT_MAX_COUNT_RATIO', 1.10);

  const healthy = countRatio >= minCountRatio && countRatio <= maxCountRatio &&
    overlapRatio >= minOverlapRatio && overlapNewRatio >= minOverlapRatio;

  const health = {
    mode: 'COMPARE_ACTIVE', accepted: healthy, previousCount, newCount, intersectionCount,
    countRatio, overlapRatio, overlapNewRatio, duplicateCount,
    thresholds: { minCountRatio, maxCountRatio, minOverlapRatio }
  };

  if (!healthy) {
    throw new Error('BRS snapshot health check failed: ' + JSON.stringify(health));
  }
  return health;
}
async function publishMarketSnapshot(symbols) {
  const health = await validateSnapshotHealth(symbols);
  const id = await createPreparedSnapshot(symbols);
  const verifiedSymbols = await verifyPreparedSnapshot(id, symbols.length);
  const derived = buildDerived(verifiedSymbols, new Date());

  await prisma.$executeRaw`
    UPDATE [dbo].[MarketSnapshot]
    SET [derivedJson]=${JSON.stringify(derived)}, [status]='VERIFIED', [verifiedAt]=SYSDATETIME()
    WHERE [id]=${id} AND [status]='PREPARED'
  `;

  const verified = await prisma.$queryRaw`
    SELECT [id],[status],[symbolCount],[symbolsJson],[derivedJson]
    FROM [dbo].[MarketSnapshot] WHERE [id]=${id}
  `;
  const row = verified?.[0];
  if (!row || row.status !== 'VERIFIED' || Number(row.symbolCount) !== verifiedSymbols.length || !row.derivedJson) {
    throw new Error('MarketSnapshot derived-result verification failed');
  }

  let derivedCheck;
  try { derivedCheck = JSON.parse(row.derivedJson); } catch { derivedCheck = null; }
  if (!derivedCheck?.breadth || Number(derivedCheck.snapshotSymbolCount) !== verifiedSymbols.length) {
    throw new Error('MarketSnapshot derived payload is incomplete');
  }

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`DELETE FROM [dbo].[MarketSnapshot] WHERE [status]='ACTIVE'`;

    await tx.marketSymbolCurrent.deleteMany({});
    const dbRows = verifiedSymbols.map((item) => ({
      symbol:item.symbol, name:item.name, insCode:item.insCode,
      lastPrice:item.lastPrice, closePrice:item.closePrice, change:item.change,
      changePercent:item.changePercent, closeChangePercent:item.closeChangePercent,
      volume:item.volume, value:item.value, tradeCount:item.tradeCount, sector:item.sector,
      realBuyVolume:item.realBuyVolume, realSellVolume:item.realSellVolume,
      legalBuyVolume:item.legalBuyVolume, legalSellVolume:item.legalSellVolume,
      source:'brs-central-worker', isStale:false, dataJson:JSON.stringify(item)
    }));
    await tx.marketSymbolCurrent.createMany({data:dbRows});

    await tx.marketMoverCurrent.deleteMany({});
    const movers = [
      ...derivedCheck.movers.gainers.map((r,i)=>({category:'GAINERS',r,i})),
      ...derivedCheck.movers.losers.map((r,i)=>({category:'LOSERS',r,i})),
      ...derivedCheck.movers.highVolume.map((r,i)=>({category:'VOLUME',r,i}))
    ];
    if (movers.length) await tx.marketMoverCurrent.createMany({data:movers.map(({category,r,i})=>({
      category,symbol:r.symbol,price:r.lastPrice,changePercent:r.changePercent,
      volume:r.volume,value:r.value,rank:i+1,updatedAt:new Date()
    }))});

    await tx.marketIndustryCurrent.deleteMany({});
    if (derivedCheck.industries.length) await tx.marketIndustryCurrent.createMany({data:derivedCheck.industries.map(r=>({
      industryCode:r.industryCode,industryName:r.industryName,symbolCount:r.symbolCount,
      changePercent:r.changePercent,value:r.value,rank:r.rank,updatedAt:new Date(),
      source:r.source,isStale:false
    }))});

    await tx.$executeRaw`
      UPDATE [dbo].[MarketSnapshot]
      SET [status]='ACTIVE', [activatedAt]=SYSDATETIME()
      WHERE [id]=${id} AND [status]='VERIFIED'
    `;
  });

  return { snapshotId:id, symbolCount:verifiedSymbols.length, health, derived:derivedCheck };
}

async function getActiveSnapshot() {
  const rows = await prisma.$queryRaw`
    SELECT TOP 1 [id],[status],[symbolCount],[symbolsJson],[derivedJson],[source],[createdAt],[verifiedAt],[activatedAt]
    FROM [dbo].[MarketSnapshot] WHERE [status]='ACTIVE' ORDER BY [activatedAt] DESC, [id] DESC
  `;
  return rows?.[0] || null;
}

async function getActiveDerived() {
  const row = await getActiveSnapshot();
  if (!row?.derivedJson) return null;
  try {
    const derived = JSON.parse(row.derivedJson);
    return { snapshotId:Number(row.id), symbolCount:Number(row.symbolCount), ...derived,
      source:row.source, updatedAt:row.activatedAt || row.createdAt };
  } catch { return null; }
}

async function getActiveSymbols() {
  const row = await getActiveSnapshot();
  if (!row?.symbolsJson) return [];
  try { return JSON.parse(row.symbolsJson); } catch { return []; }
}

module.exports = { normalizeSymbol, publishMarketSnapshot, getActiveSnapshot, getActiveDerived, getActiveSymbols };
