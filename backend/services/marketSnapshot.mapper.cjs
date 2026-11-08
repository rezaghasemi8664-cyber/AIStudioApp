'use strict';

function numberOrNull(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const parsed = Number(String(value).replace(/,/g, ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function integerOrNull(...values) {
  const value = numberOrNull(...values);
  return value === null ? null : Math.trunc(value);
}

function mapBRSAllSymbol(item = {}) {
  const closePrice = numberOrNull(item.closingPrice, item.closePrice, item.pc);
  const yesterday = numberOrNull(item.yesterday, item.previousPrice, item.yesterdayPrice, item.py);
  const lastPrice = numberOrNull(item.lastPrice, item.last, item.pl);
  const closeChange = numberOrNull(item.closingChange, item.closeChange, item.pcc);
  const closeChangePercent = numberOrNull(
    item.closingChangePercent, item.closeChangePercent, item.pcp,
    closePrice !== null && yesterday > 0 ? ((closePrice - yesterday) / yesterday) * 100 : null
  );
  const realBuyVolume = integerOrNull(item.realBuyVolume, item.buyRealVolume, item.buy_I_Volume, item.Buy_I_Volume, item.real?.buyVolume);
  const realSellVolume = integerOrNull(item.realSellVolume, item.sellRealVolume, item.sell_I_Volume, item.Sell_I_Volume, item.real?.sellVolume);
  const legalBuyVolume = integerOrNull(item.instBuyVolume, item.legalBuyVolume, item.buy_N_Volume, item.Buy_N_Volume, item.legal?.buyVolume);
  const legalSellVolume = integerOrNull(item.instSellVolume, item.legalSellVolume, item.sell_N_Volume, item.Sell_N_Volume, item.legal?.sellVolume);
  const realBuyValue = numberOrNull(item.realBuyValue, item.buyRealValue, item.buy_I_Value, item.Buy_I_Value, item.real?.buyValue);
  const realSellValue = numberOrNull(item.realSellValue, item.sellRealValue, item.sell_I_Value, item.Sell_I_Value, item.real?.sellValue);
  const legalBuyValue = numberOrNull(item.instBuyValue, item.legalBuyValue, item.buy_N_Value, item.Buy_N_Value, item.legal?.buyValue);
  const legalSellValue = numberOrNull(item.instSellValue, item.legalSellValue, item.sell_N_Value, item.Sell_N_Value, item.legal?.sellValue);
  const realBuyCount = integerOrNull(item.realBuyCount, item.buyRealCount, item.buy_I_Count, item.Buy_CountI, item.real?.buyCount);
  const realSellCount = integerOrNull(item.realSellCount, item.sellRealCount, item.sell_I_Count, item.Sell_CountI, item.real?.sellCount);
  const legalBuyCount = integerOrNull(item.instBuyCount, item.legalBuyCount, item.buy_N_Count, item.Buy_CountN, item.legal?.buyCount);
  const legalSellCount = integerOrNull(item.instSellCount, item.legalSellCount, item.sell_N_Count, item.Sell_CountN, item.legal?.sellCount);
  const volume = integerOrNull(item.tradeVolume, item.volume, item.tvol);
  const value = numberOrNull(item.tradeValue, item.value, item.tval);
  const tradeCount = integerOrNull(item.tradeCount, item.trades, item.tno, item.count);

  return {
    symbol: String(item.symbol || item.l18 || '').trim(),
    name: item.name || item.l30 || null,
    insCode: String(item.isin || item.id || '').trim() || null,
    sector: item.sector ?? item.industryName ?? item.industry ?? item.cs_name ?? item.cs ?? null,
    sectorId: item.sectorId ?? item.cs_id ?? null,
    open: numberOrNull(item.open, item.openPrice, item.pf),
    high: numberOrNull(item.high, item.highPrice, item.pmax),
    low: numberOrNull(item.low, item.lowPrice, item.pmin),
    lastPrice,
    closePrice,
    change: numberOrNull(item.lastChange, item.change, item.plc),
    changePercent: numberOrNull(item.lastChangePercent, item.changePercent, item.plp),
    closingChange: closeChange,
    closeChange,
    closingChangePercent: closeChangePercent,
    closeChangePercent,
    yesterday,
    allowedMin: numberOrNull(item.allowedMin, item.minPrice, item.tmin),
    allowedMax: numberOrNull(item.allowedMax, item.maxPrice, item.tmax),
    volume,
    tradeVolume: volume,
    tradedVolume: volume,
    value,
    tradeValue: value,
    tradedValue: value,
    tradeCount,
    averagePrice: numberOrNull(item.averagePrice, item.avgPrice, value !== null && volume > 0 ? value / volume : null),
    shares: numberOrNull(item.shares, item.z),
    freeFloatPercent: numberOrNull(item.freeFloatPercent, item.ff),
    baseVolume: integerOrNull(item.baseVolume, item.bvol),
    marketCap: numberOrNull(item.marketCap, item.mv),
    eps: numberOrNull(item.eps, item.EPS),
    pe: numberOrNull(item.pe, item.PE, item.PER),
    realBuyVolume,
    realSellVolume,
    realBuyValue,
    realSellValue,
    realBuyCount,
    realSellCount,
    volumeAvg1m: integerOrNull(item.volumeAvg1m, item.tvol_avg_1m, item.monthAverageVolume, item.averageMonthlyVolume),
    legalBuyVolume,
    legalSellVolume,
    legalBuyValue,
    legalSellValue,
    legalBuyCount,
    legalSellCount,
    instBuyVolume: legalBuyVolume,
    instSellVolume: legalSellVolume,
    instBuyValue: legalBuyValue,
    instSellValue: legalSellValue,
    instBuyCount: legalBuyCount,
    instSellCount: legalSellCount,
    orderBook: item.orderBook ?? item.orderbook ?? item.bestLimits ?? item.orderBookData ?? null,
    realMoneyFlow: realBuyVolume !== null && realSellVolume !== null ? realBuyVolume - realSellVolume : null,
    legalMoneyFlow: legalBuyVolume !== null && legalSellVolume !== null ? legalBuyVolume - legalSellVolume : null,
    instMoneyFlow: legalBuyVolume !== null && legalSellVolume !== null ? legalBuyVolume - legalSellVolume : null
  };
}

module.exports = { mapBRSAllSymbol };
