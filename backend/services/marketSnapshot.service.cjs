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
    realBuyValue: item.realBuyValue == null || item.realBuyValue === '' ? null : toNumber(item.realBuyValue),
    realSellValue: item.realSellValue == null || item.realSellValue === '' ? null : toNumber(item.realSellValue),
    realBuyCount: item.realBuyCount == null ? 0 : Math.max(0, Math.trunc(Number(item.realBuyCount))),
    realSellCount: item.realSellCount == null ? 0 : Math.max(0, Math.trunc(Number(item.realSellCount))),
    volumeAvg1m: item.volumeAvg1m == null ? null : Math.max(0, Math.trunc(Number(item.volumeAvg1m))),
    orderBook: item.orderBook && typeof item.orderBook === 'object' ? item.orderBook : null,
    allowedMin: toNumber(item.allowedMin),
    allowedMax: toNumber(item.allowedMax),
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
    realBuyValue: row.realBuyValue, realSellValue: row.realSellValue,
    realBuyCount: row.realBuyCount, realSellCount: row.realSellCount,
    volumeAvg1m: row.volumeAvg1m, orderBook: row.orderBook,
    allowedMin: row.allowedMin, allowedMax: row.allowedMax,
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
  const totalRealBuyVolume = realFlowRows.reduce((sum,row) => sum + Math.max(0,Number(row.realBuyVolume||0)),0);
  const totalRealSellVolume = realFlowRows.reduce((sum,row) => sum + Math.max(0,Number(row.realSellVolume||0)),0);
  const moneyFlowRows = valid.filter(row => Number.isFinite(row.realBuyValue) && Number.isFinite(row.realSellValue));
  const totalRealBuyValue = moneyFlowRows.reduce((sum,row) => sum + Math.max(0,row.realBuyValue),0);
  const totalRealSellValue = moneyFlowRows.reduce((sum,row) => sum + Math.max(0,row.realSellValue),0);
  const realBuyerCount = moneyFlowRows.reduce((sum,row) => sum + Math.max(0,Number(row.realBuyCount||0)),0);
  const realSellerCount = moneyFlowRows.reduce((sum,row) => sum + Math.max(0,Number(row.realSellCount||0)),0);
  const averageRealBuyPerBuyer = realBuyerCount > 0 ? totalRealBuyValue / realBuyerCount : null;
  const averageRealSellPerSeller = realSellerCount > 0 ? totalRealSellValue / realSellerCount : null;
  const abnormalVolumeRows = valid.filter(row =>
    Number.isFinite(row.volumeAvg1m) && row.volumeAvg1m > 0 &&
    Number.isFinite(row.volume) && row.volume >= row.volumeAvg1m * 2
  );
  const queueRows = valid.filter(row => row.orderBook && Array.isArray(row.orderBook.buy) && Array.isArray(row.orderBook.sell) &&
    Number(row.allowedMin) > 0 && Number(row.allowedMax) > Number(row.allowedMin) &&
    [...row.orderBook.buy, ...row.orderBook.sell].some(level => Number(level?.price) > 0 && Number(level?.volume) > 0));
  const buyQueueCount = queueRows.filter(row => {
    const buys = row.orderBook.buy.filter(level => Number(level?.price) > 0 && Number(level?.volume) > 0);
    const sells = row.orderBook.sell.filter(level => Number(level?.price) > 0 && Number(level?.volume) > 0);
    return buys.length > 0 && sells.length === 0 && Math.abs(Number(buys[0].price) - Number(row.allowedMax)) <= Math.max(1, Number(row.allowedMax) * 0.000001);
  }).length;
  const sellQueueCount = queueRows.filter(row => {
    const buys = row.orderBook.buy.filter(level => Number(level?.price) > 0 && Number(level?.volume) > 0);
    const sells = row.orderBook.sell.filter(level => Number(level?.price) > 0 && Number(level?.volume) > 0);
    return sells.length > 0 && buys.length === 0 && Math.abs(Number(sells[0].price) - Number(row.allowedMin)) <= Math.max(1, Number(row.allowedMin) * 0.000001);
  }).length;

  const sectorsMap = new Map();
  for (const row of valid) {
    const name = String(row.sector || '').trim() || 'سایر / صنعت نامشخص';
    const s = sectorsMap.get(name) || {symbols:0,positive:0,negative:0,neutral:0,sumPct:0,value:0,realMoneyFlow:0,moneyFlowRows:0};
    s.symbols++;
    if (row.radarChangePercent > 0) s.positive++;
    else if (row.radarChangePercent < 0) s.negative++;
    else s.neutral++;
    s.sumPct += row.radarChangePercent;
    s.value += Number(row.value || 0);
    if (Number.isFinite(row.realBuyValue) && Number.isFinite(row.realSellValue)) {
      s.realMoneyFlow += row.realBuyValue - row.realSellValue;
      s.moneyFlowRows += 1;
    }
    sectorsMap.set(name,s);
  }
  const sectors = [...sectorsMap.entries()].map(([name,s]) => ({
    name, symbols:s.symbols, positive:s.positive, negative:s.negative, neutral:s.neutral,
    changePercent:s.symbols ? s.sumPct/s.symbols : 0, value:s.value,
    realMoneyFlow:s.moneyFlowRows ? s.realMoneyFlow : null, moneyFlowRows:s.moneyFlowRows, rank:0
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
      realFlow:{
        available:realFlowRows.length>0,
        rowsWithRealFlow:realFlowRows.length,
        totalRealBuyVolume,totalRealSellVolume,
        netRealBuyVolume:totalRealBuyVolume-totalRealSellVolume,
        moneyFlowAvailable:moneyFlowRows.length>0,
        moneyFlowRows:moneyFlowRows.length,
        totalRealBuyValue:moneyFlowRows.length ? totalRealBuyValue : null,
        totalRealSellValue:moneyFlowRows.length ? totalRealSellValue : null,
        netRealMoneyFlow:moneyFlowRows.length ? totalRealBuyValue-totalRealSellValue : null,
        realBuyerCount:moneyFlowRows.length ? realBuyerCount : null,
        realSellerCount:moneyFlowRows.length ? realSellerCount : null,
        averageRealBuyPerBuyer, averageRealSellPerSeller,
        perCapitaRatio:averageRealBuyPerBuyer != null && averageRealSellPerSeller > 0 ? averageRealBuyPerBuyer/averageRealSellPerSeller : null,
        unit:moneyFlowRows.length ? 'rial' : 'volume'
      },
      abnormalVolume:{available:valid.some(row => Number.isFinite(row.volumeAvg1m) && row.volumeAvg1m > 0),count:abnormalVolumeRows.length,multiplier:2,baseline:'BRS monthly average volume'},
      queues:{available:queueRows.length>0,classifiedSymbols:queueRows.length,buy:buyQueueCount,sell:sellQueueCount},
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

  // BRS AllSymbols can legitimately shrink when suspended/non-trading symbols are
  // omitted. Accept a stable subset only when almost every returned symbol was
  // present in the previous snapshot and the shrink is not extreme. This keeps
  // partial/empty responses from replacing the active snapshot while allowing
  // the provider's current ~2/3 sized universe to refresh normally.
  const variableSizeMinCountRatio = getHealthThreshold('MARKET_SNAPSHOT_VARIABLE_MIN_COUNT_RATIO', 0.65);
  const variableSizeMinOverlapRatio = getHealthThreshold('MARKET_SNAPSHOT_VARIABLE_MIN_OVERLAP_RATIO', 0.98);
  const variableSizeOldOverlapRatio = getHealthThreshold('MARKET_SNAPSHOT_VARIABLE_MIN_OLD_OVERLAP_RATIO', 0.60);

  // Allow a genuine increase in the provider's symbol universe only when the
  // new snapshot still contains nearly all previously active symbols and a
  // substantial majority of its symbols overlap the previous verified snapshot.
  // This rejects unrelated/partial payloads while allowing the observed ~1.4x growth.
  const growthMaxCountRatio = getHealthThreshold('MARKET_SNAPSHOT_GROWTH_MAX_COUNT_RATIO', 1.50);
  const growthMinOldOverlapRatio = getHealthThreshold('MARKET_SNAPSHOT_GROWTH_MIN_OLD_OVERLAP_RATIO', 0.98);
  const growthMinNewOverlapRatio = getHealthThreshold('MARKET_SNAPSHOT_GROWTH_MIN_NEW_OVERLAP_RATIO', 0.65);

  const standardHealthy = countRatio >= minCountRatio && countRatio <= maxCountRatio &&
    overlapRatio >= minOverlapRatio && overlapNewRatio >= minOverlapRatio;
  const variableSizeHealthy = countRatio >= variableSizeMinCountRatio && countRatio <= maxCountRatio &&
    overlapRatio >= variableSizeOldOverlapRatio && overlapNewRatio >= variableSizeMinOverlapRatio;
  const growthHealthy = countRatio > maxCountRatio && countRatio <= growthMaxCountRatio &&
    overlapRatio >= growthMinOldOverlapRatio && overlapNewRatio >= growthMinNewOverlapRatio;

  const healthy = standardHealthy || variableSizeHealthy || growthHealthy;
  const mode = standardHealthy ? 'COMPARE_ACTIVE' :
    growthHealthy ? 'COMPARE_ACTIVE_GROWTH' : 'COMPARE_ACTIVE_VARIABLE_SIZE';

  const health = {
    mode, accepted: healthy, previousCount, newCount, intersectionCount,
    countRatio, overlapRatio, overlapNewRatio, duplicateCount,
    thresholds: {
      minCountRatio, maxCountRatio, minOverlapRatio,
      variableSizeMinCountRatio, variableSizeMinOverlapRatio, variableSizeOldOverlapRatio,
      growthMaxCountRatio, growthMinOldOverlapRatio, growthMinNewOverlapRatio
    }
  };

  if (!healthy) {
    throw new Error('BRS snapshot health check failed: ' + JSON.stringify(health));
  }
  return health;
}
async function addHistoricalValueComparison(derived, symbols) {
  const marketDateKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tehran',
    calendar: 'gregory'
  }).format(new Date());
  const [year, month, day] = marketDateKey.split('-').map(Number);
  const marketDate = new Date(Date.UTC(year, month - 1, day));
  let rows = [];
  try {
    rows = await prisma.$queryRaw`
      SELECT TOP 20 CAST([date] AS date) AS [marketDate],
        SUM(CAST([value] AS decimal(38,0))) AS [totalValue]
      FROM [dbo].[MarketDaily]
      WHERE [date] < ${marketDate} AND [value] IS NOT NULL
      GROUP BY CAST([date] AS date)
      ORDER BY CAST([date] AS date) DESC
    `;
  } catch (error) {
    derived.breadth.marketValueVsAverage = {
      available: false, currentValue: 0, historicalAverage: null, changePercent: null,
      sampleDays: 0, baseline: 'previous trading-day totals from MarketDaily'
    };
    console.warn('[MARKET SNAPSHOT] historical traded-value comparison unavailable:', error.message);
    return;
  }
  const dailyValues = (Array.isArray(rows) ? rows : [])
    .map(row => Number(row.totalValue))
    .filter(value => Number.isFinite(value) && value > 0);
  const currentValue = symbols.filter(isEligible).reduce((sum, row) => sum + Math.max(0, Number(row.value || 0)), 0);
  const historicalAverage = dailyValues.length
    ? dailyValues.reduce((sum, value) => sum + value, 0) / dailyValues.length
    : null;
  derived.breadth.marketValueVsAverage = {
    available: historicalAverage != null && historicalAverage > 0 && currentValue > 0,
    currentValue,
    historicalAverage,
    changePercent: historicalAverage != null && historicalAverage > 0 && currentValue > 0
      ? ((currentValue - historicalAverage) / historicalAverage) * 100
      : null,
    sampleDays: dailyValues.length,
    baseline: 'previous trading-day totals from MarketDaily'
  };
}

async function publishMarketSnapshotInternal(symbols) {
  const health = await validateSnapshotHealth(symbols);
  let id = null;

  try {
    id = await createPreparedSnapshot(symbols);
    const verifiedSymbols = await verifyPreparedSnapshot(id, symbols.length);
    const derived = buildDerived(verifiedSymbols, new Date());
    await addHistoricalValueComparison(derived, verifiedSymbols);

    await prisma.$executeRaw`
      UPDATE [dbo].[MarketSnapshot]
      SET [derivedJson]=${JSON.stringify(derived)}, [status]='VERIFIED', [verifiedAt]=SYSUTCDATETIME()
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
      await tx.$executeRaw`
        DELETE FROM [dbo].[MarketSnapshot] WHERE [status]='ACTIVE'
      `;

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
        SET [status]='ACTIVE', [activatedAt]=SYSUTCDATETIME()
        WHERE [id]=${id} AND [status]='VERIFIED'
      `;
    }, { maxWait: 15000, timeout: 120000 });

    return { snapshotId:id, symbolCount:verifiedSymbols.length, health, derived:derivedCheck };
  } catch (error) {
    if (id !== null) {
      try {
        await prisma.$executeRaw`
          DELETE FROM [dbo].[MarketSnapshot]
          WHERE [id]=${id} AND [status] IN ('PREPARED','VERIFIED')
        `;
      } catch (cleanupError) {
        console.warn('[MARKET SNAPSHOT] failed to clean incomplete snapshot ' + id + ': ' + cleanupError.message);
      }
    }
    throw error;
  }
}

let publishInFlight = false;

async function publishMarketSnapshot(symbols) {
  if (publishInFlight) {
    throw new Error('Market snapshot publish already in progress; skipping overlapping run');
  }
  publishInFlight = true;
  try {
    return await publishMarketSnapshotInternal(symbols);
  } finally {
    publishInFlight = false;
  }
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
