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

  return source
    .map(item => ({
      date: item?.date || item?.timestamp || null,
      close: toNumber(item?.close ?? item?.closingPrice ?? item?.pClosing ?? item?.price),
    }))
    .filter(item => item.date && item.close !== null && item.close > 0);
}

async function runSmaCrossover(params = {}) {
  const symbol = String(params.symbol || '').trim().toUpperCase();
  if (!symbol) {
    throw Object.assign(new Error('نماد سهم الزامی است.'), {
      statusCode: 400,
      code: 'STRATEGY_SYMBOL_REQUIRED',
    });
  }

  const initialCapital = Math.max(100000, toNumber(params.initialCapital) ?? 100000000);
  const shortPeriod = Math.max(2, Math.min(100, Math.round(toNumber(params.shortPeriod) ?? 10)));
  const longPeriod = Math.max(shortPeriod + 1, Math.min(250, Math.round(toNumber(params.longPeriod) ?? 30)));
  const feeRate = Math.max(0, Math.min(0.1, toNumber(params.feePercent) ?? 0.001));
  const historyCount = Math.max(longPeriod + 10, Math.min(500, Math.round(toNumber(params.historyCount) ?? 180)));

  const data = await provider.getMarketData(symbol, { historyCount });
  const candles = normalizeCandles(data);

  if (candles.length < longPeriod + 2) {
    throw Object.assign(new Error('برای اجرای بک‌تست، تاریخچه معتبر کافی نیست.'), {
      statusCode: 422,
      code: 'STRATEGY_INSUFFICIENT_HISTORY',
      dataQuality: data.dataQuality,
    });
  }

  const closes = candles.map(candle => candle.close);
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
          trades.push({
            date: candles[i].date,
            side: 'خرید',
            price,
            quantity: buyQuantity,
            value: gross,
            fee,
            reason: 'تقاطع صعودی میانگین کوتاه و بلند',
          });
        }
      } else if (quantity > 0 && previousShort >= previousLong && short < long) {
        const gross = quantity * price;
        const fee = gross * feeRate;
        cash += gross - fee;
        trades.push({
          date: candles[i].date,
          side: 'فروش',
          price,
          quantity,
          value: gross,
          fee,
          reason: 'تقاطع نزولی میانگین کوتاه و بلند',
        });
        quantity = 0;
      }
    }

    equityCurve.push({
      date: candles[i].date,
      close: price,
      shortSma: short,
      longSma: long,
      equity: cash + quantity * price,
    });
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

  const closedTrades = [];
  for (let i = 0; i < trades.length - 1; i += 1) {
    const buy = trades[i];
    const sell = trades[i + 1];
    if (buy.side !== 'خرید' || sell.side !== 'فروش') continue;
    const grossPnl = (sell.price - buy.price) * sell.quantity;
    const fees = buy.fee + sell.fee;
    closedTrades.push({
      entryDate: buy.date,
      exitDate: sell.date,
      quantity: sell.quantity,
      entryPrice: buy.price,
      exitPrice: sell.price,
      grossPnl,
      fees,
      netPnl: grossPnl - fees,
      returnPercent: buy.price > 0 ? ((sell.price / buy.price) - 1) * 100 : null,
    });
  }
  const winners = closedTrades.filter(trade => trade.netPnl > 0);
  const losers = closedTrades.filter(trade => trade.netPnl < 0);
  const grossProfit = winners.reduce((sum, trade) => sum + trade.netPnl, 0);
  const grossLoss = Math.abs(losers.reduce((sum, trade) => sum + trade.netPnl, 0));
  const dailyReturns = equityCurve.slice(1).map((point, index) => {
    const previous = equityCurve[index].equity;
    return previous > 0 ? (point.equity / previous) - 1 : 0;
  });
  const meanDailyReturn = dailyReturns.length ? dailyReturns.reduce((sum, value) => sum + value, 0) / dailyReturns.length : 0;
  const variance = dailyReturns.length > 1 ? dailyReturns.reduce((sum, value) => sum + ((value - meanDailyReturn) ** 2), 0) / (dailyReturns.length - 1) : 0;
  const dailyVolatility = Math.sqrt(Math.max(0, variance));
  const sharpe = dailyVolatility > 0 ? (meanDailyReturn / dailyVolatility) * Math.sqrt(252) : null;

  return {
    success: true,
    deterministic: true,
    engine: {
      name: 'deterministic-sma-crossover-backtest',
      version: '1.0.0',
      deterministic: true,
    },
    symbol,
    strategy: {
      id: 'sma-crossover',
      name: 'تقاطع میانگین متحرک',
      shortPeriod,
      longPeriod,
      feePercent: feeRate,
    },
    initialCapital,
    finalValue,
    returnPercent,
    buyHoldReturnPercent,
    excessReturnPercent: returnPercent - buyHoldReturnPercent,
    maxDrawdown,
    tradeCount: trades.length,
    closedTradeCount: closedTrades.length,
    winRate: closedTrades.length ? (winners.length / closedTrades.length) * 100 : null,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
    averageClosedTradePnl: closedTrades.length ? closedTrades.reduce((sum, trade) => sum + trade.netPnl, 0) / closedTrades.length : null,
    sharpe,
    closedTrades,
    openQuantity: quantity,
    cash,
    trades,
    equityCurve,
    dataQuality: data.dataQuality || null,
    source: data.sources || null,
    fetchedAt: data.fetchedAt || new Date().toISOString(),
  };
}

async function optimizeSmaCrossover(params = {}) {
  const symbol = String(params.symbol || '').trim().toUpperCase();
  if (!symbol) throw Object.assign(new Error('نماد سهم الزامی است.'), { statusCode: 400, code: 'STRATEGY_SYMBOL_REQUIRED' });

  const initialCapital = Math.max(100000, toNumber(params.initialCapital) ?? 100000000);
  const feePercent = Math.max(0, Math.min(10, toNumber(params.feePercent) ?? 0.1));
  const shortPeriods = Array.isArray(params.shortPeriods) && params.shortPeriods.length
    ? params.shortPeriods.map(Number).filter(Number.isFinite).map(Math.round).filter(v => v >= 2 && v <= 100)
    : [5, 10, 15, 20];
  const longPeriods = Array.isArray(params.longPeriods) && params.longPeriods.length
    ? params.longPeriods.map(Number).filter(Number.isFinite).map(Math.round).filter(v => v >= 3 && v <= 250)
    : [30, 50, 70];

  const combinations = [];
  for (const shortPeriod of [...new Set(shortPeriods)]) {
    for (const longPeriod of [...new Set(longPeriods)]) {
      if (longPeriod > shortPeriod) combinations.push({ shortPeriod, longPeriod });
    }
  }
  if (!combinations.length || combinations.length > 16) {
    throw Object.assign(new Error('ترکیب پارامترها باید بین ۱ تا ۱۶ حالت معتبر داشته باشد.'), { statusCode: 400, code: 'STRATEGY_PARAMETER_GRID_INVALID' });
  }

  const results = [];
  for (const combination of combinations) {
    try {
      const result = await runSmaCrossover({
        symbol,
        initialCapital,
        feePercent: feePercent / 100,
        historyCount: Math.max(combination.longPeriod + 10, 180),
        ...combination,
      });
      results.push({
        shortPeriod: combination.shortPeriod,
        longPeriod: combination.longPeriod,
        returnPercent: result.returnPercent,
        buyHoldReturnPercent: result.buyHoldReturnPercent,
        excessReturnPercent: result.excessReturnPercent,
        maxDrawdown: result.maxDrawdown,
        sharpe: result.sharpe,
        tradeCount: result.tradeCount,
        closedTradeCount: result.closedTradeCount,
        winRate: result.winRate,
        profitFactor: result.profitFactor,
      });
    } catch (error) {
      results.push({ shortPeriod: combination.shortPeriod, longPeriod: combination.longPeriod, error: error.message });
    }
  }

  const valid = results.filter(item => Number.isFinite(Number(item.returnPercent)));
  const ranked = [...valid].sort((a, b) =>
    (Number(b.sharpe ?? -Infinity) - Number(a.sharpe ?? -Infinity)) ||
    (Number(b.returnPercent) - Number(a.returnPercent))
  );

  return {
    success: true,
    deterministic: true,
    engine: { name: 'deterministic-sma-crossover-optimizer', version: '1.0.0', deterministic: true },
    symbol,
    initialCapital,
    feePercent,
    combinations: results.length,
    validCombinations: valid.length,
    ranking: ranked,
    note: 'این رتبه‌بندی فقط بر اساس داده تاریخی همان بازه است و به‌تنهایی نشانه عملکرد آینده یا توصیه سرمایه‌گذاری نیست.',
  };
}

async function backtestStrategy(params = {}) {
  if (String(params.strategy || 'sma-crossover') !== 'sma-crossover') {
    throw Object.assign(new Error('استراتژی انتخاب‌شده در این نسخه پشتیبانی نمی‌شود.'), {
      statusCode: 400,
      code: 'STRATEGY_NOT_SUPPORTED',
    });
  }

  return runSmaCrossover(params);
}

module.exports = { backtestStrategy, optimizeSmaCrossover };
