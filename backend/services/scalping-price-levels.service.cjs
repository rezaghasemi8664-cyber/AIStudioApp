'use strict';

function isFinitePositive(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

function isLockedAtUpperLimit(market) {
  const max = Number(market.allowedMax);
  const buy = market.orderBook && market.orderBook.buy;
  const sell = market.orderBook && market.orderBook.sell;
  const bestBuy = Array.isArray(buy) ? buy[0] : null;
  const bestSell = Array.isArray(sell) ? sell[0] : null;
  return isFinitePositive(max) &&
    bestBuy && Number(bestBuy.price) === max && Number(bestBuy.volume) > 0 &&
    (!bestSell || !(Number(bestSell.price) > 0) || !(Number(bestSell.volume) > 0));
}

function isLockedAtLowerLimit(market) {
  const min = Number(market.allowedMin);
  const buy = market.orderBook && market.orderBook.buy;
  const sell = market.orderBook && market.orderBook.sell;
  const bestBuy = Array.isArray(buy) ? buy[0] : null;
  const bestSell = Array.isArray(sell) ? sell[0] : null;
  return isFinitePositive(min) &&
    bestSell && Number(bestSell.price) === min && Number(bestSell.volume) > 0 &&
    (!bestBuy || !(Number(bestBuy.price) > 0) || !(Number(bestBuy.volume) > 0));
}

function calculateScalpingPriceLevels(candles, signal, currentPrice, market = {}, onReject) {
  const reject = (reason, details = {}) => {
    if (typeof onReject === 'function') onReject(reason, details);
    return null;
  };

  if (!Array.isArray(candles) || candles.length < 15) {
    return reject('insufficient_candles', { candleCount: Array.isArray(candles) ? candles.length : 0 });
  }
  const valid = candles.filter(c => c && [c.open,c.high,c.low,c.close].every(v => Number.isFinite(Number(v))) && Number(c.low) > 0 && Number(c.high) >= Number(c.low) && Number(c.open) >= Number(c.low) && Number(c.open) <= Number(c.high) && Number(c.close) >= Number(c.low) && Number(c.close) <= Number(c.high));
  if (valid.length < 15) {
    return reject('insufficient_valid_candles', { candleCount: candles.length, validCandleCount: valid.length });
  }

  // Fail closed: actionable intraday signals require a validated current-day price band.
  const allowedMin = Number(market.allowedMin);
  const allowedMax = Number(market.allowedMax);
  if (!isFinitePositive(allowedMin) || !isFinitePositive(allowedMax) || allowedMin >= allowedMax) {
    return reject('invalid_price_band', {
      allowedMin: Number.isFinite(allowedMin) ? allowedMin : null,
      allowedMax: Number.isFinite(allowedMax) ? allowedMax : null
    });
  }

  const recent = valid.slice(-20);
  const support = Math.min(...recent.map(c => Number(c.low)));
  const resistance = Math.max(...recent.map(c => Number(c.high)));
  const ranges = [];
  for (let i = 1; i < valid.length; i++) {
    const c = valid[i]; const prev = Number(valid[i - 1].close);
    ranges.push(Math.max(Number(c.high)-Number(c.low), Math.abs(Number(c.high)-prev), Math.abs(Number(c.low)-prev)));
  }
  if (ranges.length < 14) return reject('insufficient_true_ranges', { rangeCount: ranges.length });
  const atr = ranges.slice(-14).reduce((a,b) => a+b, 0) / 14;
  const current = Number(currentPrice);
  if (!(current > 0) || !(atr > 0) || !(resistance > support)) {
    return reject('invalid_current_price_or_atr', {
      currentPrice: Number.isFinite(current) ? current : null,
      atr: Number.isFinite(atr) ? atr : null,
      support,
      resistance
    });
  }
  const round = n => Number(n.toFixed(2));

  if (signal === 'BUY') {
    // A buy trigger above today's legal ceiling cannot execute today.
    if (current >= allowedMax) return reject('buy_current_at_or_above_max', { currentPrice: current, allowedMax });
    if (isLockedAtUpperLimit(market)) return reject('buy_locked_at_upper_limit', { allowedMax });
    const entryPrice = resistance + atr * 0.1;
    const targetPrice = entryPrice + atr * 2;
    if (!(entryPrice > current && entryPrice <= allowedMax && support < entryPrice && targetPrice > entryPrice)) {
      return reject('buy_entry_outside_band_or_invalid', { currentPrice: current, entryPrice, targetPrice, allowedMin, allowedMax });
    }
    return { entryPrice: round(entryPrice), targetPrice: round(targetPrice), stopLossPrice: round(support), support: round(support), resistance: round(resistance), atr: round(atr), method: 'swing-resistance-atr' };
  }

  if (signal === 'SELL') {
    // A sell trigger below today's legal floor cannot execute today.
    if (current <= allowedMin) return reject('sell_current_at_or_below_min', { currentPrice: current, allowedMin });
    if (isLockedAtLowerLimit(market)) return reject('sell_locked_at_lower_limit', { allowedMin });
    const entryPrice = support - atr * 0.1;
    const targetPrice = entryPrice - atr * 2;
    if (!(entryPrice < current && entryPrice >= allowedMin && targetPrice > 0 && targetPrice < entryPrice && resistance > entryPrice)) {
      return reject('sell_entry_outside_band_or_invalid', { currentPrice: current, entryPrice, targetPrice, allowedMin, allowedMax });
    }
    return { entryPrice: round(entryPrice), targetPrice: round(targetPrice), stopLossPrice: round(resistance), support: round(support), resistance: round(resistance), atr: round(atr), method: 'swing-support-atr' };
  }
  return reject('unsupported_signal', { signal: String(signal) });
}

module.exports = { calculateScalpingPriceLevels, isLockedAtUpperLimit, isLockedAtLowerLimit };
