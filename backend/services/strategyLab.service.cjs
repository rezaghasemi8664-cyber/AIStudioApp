'use strict';

const provider = require('./analysis-data.provider.cjs');

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function sma(values, period, index) {
  if (index + 1 < period) return null;
  let total = 0;
  for (let i = index - period + 1; i <= index; i += 1) total += values[i];
  return total / period;
}

function normalizeCandles(data) {
  const source = Array.isArray(data?.adjustedDailyCandles) && data.adjustedDailyCandles.length
    ? data.adjustedDailyCandles
    : Array.isArray(data?.candles) ? data.candles : [];
  return source.map(item => ({
    date: item?.date || item?.timestamp || null,
    close: toNumber(item?.close ?? item?.closingPrice ?? item?.pClosing ?? item?.price),
  })).filter(item => item.date && item.close !== null && item.close > 0);
}

async function runSmaCrossover(params = {}) {
  const symbol = String(params.symbol || '').trim().toUpperCase();
  if (!symbol) throw Object.assign(new Error('نماد سهم الزامی است.'), { statusCode: 400, code: 'STRATEGY_SYMBOL_REQUIRED' });

  const initialCapital = Math.max(100000, toNumber(params.initialCapital) ?? 100000000);
  const shortPeriod = Math.max(2, Math.min(100, Math.round(toNumber(params.shortPeriod) ?? 10)));
  const longPeriod = Math.max(shortPeriod + 1, Math.min(250, Math.round(toNumber(params.longPeriod) ?? 30)));
  const feeRate = Math.max(0, Math.min(0.1, (toNumber(params.feePercent) ?? 0.001)));
  const historyCount = Math.max(longPeriod + 10, Math.min(500, Math.round(toNumber(params.historyCount) ?? 180)));

  const data = await provider.getMarketData(symbol, { historyCount });
  const candles = normalizeCandles(data);
  if (candles.length < longPeriod + 2) {
    throw Object.assign(new Error('برای اجرای بک‌تست، تاریخچه معتبر کافی نیست.'), { statusCode: 422, code: 'STRATEGY_INSUFFICIENT_HISTORY', dataQuality: data.dataQuality });
  }

  const closes = candles.map(c => c.close);
  let cash = initialCapital;
  let quantity = 0;
  const trades = [];
  const equityCurve = [];

  for (let i = 0; i < candles.length; i += 1) {
    const short = sma(closes, shortPeriod, i);
    const long = sma(closes, longPeriod, i);
    const previousShort = i > 0 ? sma(closes, shortPeriod, i - 1) : null;
    const previousLong = i > 0 ? sma(closes, longPeriod, i - 1) : null;
    const price = closes[i];

    if (short !== null && long !== null && previousShort !== null && previousLong !== null) {
      if (quantity === 0 && previousShort <= previousLong && short > long) {
        const buyQuantity = Math.floor(cash / (price * (1 + feeRate)));
        if (buyQuantity > 0) {
          const gross = buyQuantity * price;
          const fee = gross * feeRate;
          cash -= gross + fee;
          quantity = buyQuantity;
          trades.push({ date: candles[i].date, side: 'خرید', price, quantity: buyQuantity, value: gross, fee, reason: 'تقاطع صعودی میانگین کوتاه و بلند' });
        }
      } else if (quantity > 0 && previousShort >= previousLong && short < long) {
        const gross = quantity * price;
        const fee = gross * feeRate;
        cash += gross - fee;
        trades.push({ date: candles[i].date, side: 'فروش', price, quantity, value: gross, fee, reason: 'تقاطع نزولی میانگین کوتاه و بلند' });
        quantity = 0;
      }
    }

    equityCurve.push({ date: candles[i].date, close: price, shortSma: short, longSma: long, equity: cash + quantity * price });
  }

  const last = equityCurve[equityCurve.length - 1];
  const finalValue = last.equity;
  const returnPercent = ((finalValue / initialCapital) - 1) * 100;
  let peak = initialCapital;
  let maxDrawdown = 0;
  equityCurve.forEach(point => {
    peak = Math.max(peak, point.equity);
    if (peak > 0) maxDrawdown = Math.min(maxDrawdown, ((point.equity / peak) - 1) * 100);
  });

  const buyHoldValue = initialCapital * (closes[closes.length - 1] / closes[0]);
  const buyHoldReturnPercent = ((buyHoldValue / initialCapital) - 1) * 100;

  const closedPairs = [];
  let openTrade = null;
  let totalFees = 0;
  for (const trade of trades) {
    totalFees += trade.fee;
    if (trade.side === 'خرید') openTrade = trade;
    else if (trade.side === 'فروش' && openTrade) {
      const pnl = (trade.price - openTrade.price) * trade.quantity - openTrade.fee - trade.fee;
      closedPairs.push({ ...trade, buyDate: openTrade.date, buyPrice: openTrade.price, pnl, pnlPercent: openTrade.price > 0 ? ((trade.price / openTrade.price) - 1) * 100 : null });
      openTrade = null;
    }
  }
  const winners = closedPairs.filter(t => t.pnl > 0);
  const losers = closedPairs.filter(t => t.pnl < 0);
  const grossProfit = winners.reduce((sum, t) => sum + t.pnl, 0);
  const grossLoss = Math.abs(losers.reduce((sum, t) => sum + t.pnl, 0));
  const winRate = closedPairs.length ? (winners.length / closedPairs.length) * 100 : null;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? null : 0;
  const dailyReturns = [];
  for (let i = 1; i < equityCurve.length; i += 1) {
    const previous = equityCurve[i - 1].equity;
    const current = equityCurve[i].equity;
    if (previous > 0) dailyReturns.push((current / previous) - 1);
  }
  const meanReturn = dailyReturns.length ? dailyReturns.reduce((a,b) => a + b, 0) / dailyReturns.length : 0;
  const variance = dailyReturns.length > 1 ? dailyReturns.reduce((sum, value) => sum + ((value - meanReturn) ** 2), 0) / (dailyReturns.length - 1) : 0;
  const dailyVolatility = Math.sqrt(variance);
  const annualizedReturnPercent = (Math.pow(finalValue / initialCapital, 252 / Math.max(1, candles.length - 1)) - 1) * 100;
  const annualizedVolatilityPercent = dailyVolatility * Math.sqrt(252) * 100;
  const sharpeRatio = dailyVolatility > 0 ? (meanReturn / dailyVolatility) * Math.sqrt(252) : null;
  const downsideReturns = dailyReturns.filter(value => value < 0);
  const downsideDeviation = downsideReturns.length ? Math.sqrt(downsideReturns.reduce((sum, value) => sum + (value ** 2), 0) / downsideReturns.length) : 0;
  const sortinoRatio = downsideDeviation > 0 ? (meanReturn / downsideDeviation) * Math.sqrt(252) : null;
  const bestTradePercent = closedPairs.length ? Math.max(...closedPairs.map(t => t.pnlPercent ?? -Infinity)) : null;
  const worstTradePercent = closedPairs.length ? Math.min(...closedPairs.map(t => t.pnlPercent ?? Infinity)) : null;
  const averageWinPercent = winners.length ? winners.reduce((sum, t) => sum + (t.pnlPercent ?? 0), 0) / winners.length : null;
  const averageLossPercent = losers.length ? losers.reduce((sum, t) => sum + (t.pnlPercent ?? 0), 0) / losers.length : null;
  const expectancyPercent = closedPairs.length ? closedPairs.reduce((sum, t) => sum + (t.pnlPercent ?? 0), 0) / closedPairs.length : null;
  const exposureDays = closedPairs.reduce((sum, t) => {
    const start = new Date(t.buyDate).getTime();
    const end = new Date(t.date).getTime();
    return sum + (Number.isFinite(start) && Number.isFinite(end) && end >= start ? (end - start) / 86400000 : 0);
  }, 0);
  const averageHoldingDays = closedPairs.length ? exposureDays / closedPairs.length : null;
  const investedDays = equityCurve.reduce((sum, point, index) => sum + (index > 0 && point.equity > 0 && quantity > 0 ? 1 : 0), 0);

  return {
    success: true,
    deterministic: true,
    engine: { name: 'deterministic-sma-crossover-backtest', version: '1.0.0', deterministic: true },
    symbol,
    strategy: { id: 'sma-crossover', name: 'تقاطع میانگین متحرک', shortPeriod, longPeriod, feePercent: feeRate },
    initialCapital, finalValue, returnPercent, buyHoldReturnPercent,
    excessReturnPercent: returnPercent - buyHoldReturnPercent,
    maxDrawdown,
    tradeCount: trades.length,
    closedTradeCount: closedPairs.length,
    winRate,
    profitFactor,
    grossProfit,
    grossLoss,
    totalFees,
    annualizedReturnPercent,
    annualizedVolatilityPercent,
    sharpeRatio,
    sortinoRatio,
    bestTradePercent,
    worstTradePercent,
    averageWinPercent,
    averageLossPercent,
    expectancyPercent,
    averageHoldingDays,
    closedTradeResults: closedPairs,
    openQuantity: quantity,
    cash,
    trades,
    equityCurve,
    dataQuality: data.dataQuality || null,
    source: data.sources || null,
    fetchedAt: data.fetchedAt || new Date().toISOString(),
  };
}

async function backtestStrategy(params = {}) {
  if (String(params.strategy || 'sma-crossover') !== 'sma-crossover') {
    throw Object.assign(new Error('استراتژی انتخاب‌شده در این نسخه پشتیبانی نمی‌شود.'), { statusCode: 400, code: 'STRATEGY_NOT_SUPPORTED' });
  }
  return runSmaCrossover(params);
}

module.exports = { backtestStrategy };
