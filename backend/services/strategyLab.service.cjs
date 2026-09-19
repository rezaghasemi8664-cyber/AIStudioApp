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
    closedTradeCount: trades.filter(trade => trade.side === 'فروش').length,
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
    throw Object.assign(new Error('استراتژی انتخاب‌شده در این نسخه پشتیبانی نمی‌شود.'), {
      statusCode: 400,
      code: 'STRATEGY_NOT_SUPPORTED',
    });
  }

  return runSmaCrossover(params);
}

module.exports = { backtestStrategy };
