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
  return isFinitePositive(max) && bestBuy && Number(bestBuy.price) === max &&
    Number(bestBuy.volume) > 0 && (!bestSell || !(Number(bestSell.price) > 0) || !(Number(bestSell.volume) > 0));
}

function isLockedAtLowerLimit(market) {
  const min = Number(market.allowedMin);
  const buy = market.orderBook && market.orderBook.buy;
  const sell = market.orderBook && market.orderBook.sell;
  const bestBuy = Array.isArray(buy) ? buy[0] : null;
  const bestSell = Array.isArray(sell) ? sell[0] : null;
  return isFinitePositive(min) && bestSell && Number(bestSell.price) === min &&
    Number(bestSell.volume) > 0 && (!bestBuy || !(Number(bestBuy.price) > 0) || !(Number(bestBuy.volume) > 0));
}

function calculateScalpingPriceLevels(candles, signal, currentPrice, market = {}, onReject) {
  const reject = (reason, details = {}) => {
    if (typeof onReject === 'function') onReject(reason, details);
    return null;
  };
  if (!Array.isArray(candles) || candles.length < 15) {
    return reject('insufficient_candles', { candleCount: Array.isArray(candles) ? candles.length : 0 });
  }
  const valid = candles.filter(c => c && [c.open, c.high, c.low, c.close].every(v => Number.isFinite(Number(v))) &&
    Number(c.low) > 0 && Number(c.high) >= Number(c.low) && Number(c.open) >= Number(c.low) &&
    Number(c.open) <= Number(c.high) && Number(c.close) >= Number(c.low) && Number(c.close) <= Number(c.high));
  if (valid.length < 15) return reject('insufficient_valid_candles', { candleCount: candles.length, validCandleCount: valid.length });

  // Fail closed: every actionable setup needs a verified legal daily price band.
  const allowedMin = Number(market.allowedMin);
  const allowedMax = Number(market.allowedMax);
  if (!isFinitePositive(allowedMin) || !isFinitePositive(allowedMax) || allowedMin >= allowedMax) {
    return reject('invalid_price_band', { allowedMin: Number.isFinite(allowedMin) ? allowedMin : null, allowedMax: Number.isFinite(allowedMax) ? allowedMax : null });
  }
  // Scalping uses near-term structure, not the full 20-session swing range.
  // Keep ATR on its 14-period window below, but derive actionable support and
  // resistance from the latest five valid candles so distant historical
  // extremes do not make same-day targets fail legal-band/reward-risk checks.
  const recent = valid.slice(-5);
  const support = Math.min(...recent.map(c => Number(c.low)));
  const resistance = Math.max(...recent.map(c => Number(c.high)));
  const ranges = [];
  for (let i = 1; i < valid.length; i++) {
    const c = valid[i]; const prev = Number(valid[i - 1].close);
    ranges.push(Math.max(Number(c.high) - Number(c.low), Math.abs(Number(c.high) - prev), Math.abs(Number(c.low) - prev)));
  }
  if (ranges.length < 14) return reject('insufficient_true_ranges', { rangeCount: ranges.length });
  const atr = ranges.slice(-14).reduce((a, b) => a + b, 0) / 14;
  const current = Number(currentPrice);
  if (!(current > 0) || !(atr > 0) || !(resistance > support)) {
    return reject('invalid_current_price_or_atr', { currentPrice: Number.isFinite(current) ? current : null, atr: Number.isFinite(atr) ? atr : null, support, resistance });
  }
  const round = n => Number(n.toFixed(2));
  const lastCandle = valid[valid.length - 1];
  const bullishCandle = Number(lastCandle.close) > Number(lastCandle.open);
  const bearishCandle = Number(lastCandle.close) < Number(lastCandle.open);

  if (signal === 'BUY') {
    if (current >= allowedMax) return reject('buy_current_at_or_above_max', { currentPrice: current, allowedMax });
    if (isLockedAtUpperLimit(market)) return reject('buy_locked_at_upper_limit', { allowedMax });

    // Support-rebound setup: only when price is near verified support and the
    // latest real candle confirms a bounce. Entry is near/at current price,
    // never an unreachable trigger above the legal ceiling.
    const nearSupport = current >= support && current - support <= atr * 0.45;
    if (nearSupport && bullishCandle) {
      const entryPrice = current;
      const stopLossPrice = Math.max(allowedMin, support - atr * 0.5);
      const targetPrice = Math.min(resistance, entryPrice + atr * 1.5);
      const risk = entryPrice - stopLossPrice;
      const reward = targetPrice - entryPrice;
      if (stopLossPrice < entryPrice && targetPrice > entryPrice && targetPrice <= allowedMax && risk > 0 && reward / risk >= 1.2) {
        return { entryPrice: round(entryPrice), targetPrice: round(targetPrice), stopLossPrice: round(stopLossPrice), support: round(support), resistance: round(resistance), atr: round(atr), method: 'support-rebound-atr-v1' };
      }
      // If the rebound setup fails its risk/reward check, continue to evaluate
      // the independent breakout/continuation setup below instead of rejecting
      // the symbol before checking whether that setup is valid.
    }

    // Preferred pullback setup: publish a pending entry below the current price
    // when price is close enough to verified support for a technically plausible
    // retracement. The target is always above the proposed entry and the stop
    // remains below it; this is a pending level, not an instruction to buy now.
    const pullbackEntry = Math.max(allowedMin, Math.min(current - atr * 0.1, support + atr * 0.15));
    const pullbackStop = Math.max(allowedMin, support - atr * 0.5);
    const pullbackTarget = Math.min(resistance, allowedMax, pullbackEntry + atr * 1.5);
    const pullbackRisk = pullbackEntry - pullbackStop;
    const pullbackReward = pullbackTarget - pullbackEntry;
    const pullbackDistance = current - support;
    if (pullbackEntry < current && pullbackDistance >= 0 && pullbackDistance <= atr * 1.5 &&
        pullbackStop < pullbackEntry && pullbackTarget > pullbackEntry &&
        pullbackRisk > 0 && pullbackReward / pullbackRisk >= 1.2) {
      return {
        entryPrice: round(pullbackEntry),
        targetPrice: round(pullbackTarget),
        stopLossPrice: round(pullbackStop),
        support: round(support),
        resistance: round(resistance),
        atr: round(atr),
        entryType: 'PENDING_PULLBACK',
        method: 'support-pullback-atr-v2'
      };
    }

    // If no pullback entry is valid, evaluate a resistance-breakout entry above
    // current price. It remains conditional on a confirmed breakout.
    const entryPrice = resistance + atr * 0.1;
    const targetPrice = Math.min(allowedMax, entryPrice + atr * 2);
    const stopLossPrice = Math.max(allowedMin, support);
    const risk = entryPrice - stopLossPrice;
    const reward = targetPrice - entryPrice;
    if (entryPrice > current && entryPrice <= allowedMax && stopLossPrice < entryPrice &&
        targetPrice > entryPrice && risk > 0 && reward / risk >= 1.2) {
      return {
        entryPrice: round(entryPrice),
        targetPrice: round(targetPrice),
        stopLossPrice: round(stopLossPrice),
        support: round(support),
        resistance: round(resistance),
        atr: round(atr),
        entryType: 'BREAKOUT_TRIGGER',
        method: 'swing-resistance-atr-v2'
      };
    }

    // At-market continuation is a final fallback only when a real bullish candle
    // confirms momentum and a valid reward/risk plan exists.
    const marketEntry = current;
    const marketStop = Math.max(allowedMin, support - atr * 0.25);
    const marketTarget = Math.min(resistance, allowedMax, marketEntry + atr * 1.5);
    const marketRisk = marketEntry - marketStop;
    const marketReward = marketTarget - marketEntry;
    if (bullishCandle && marketEntry < resistance && marketStop < marketEntry &&
        marketTarget > marketEntry && marketRisk > 0 && marketReward / marketRisk >= 1.2) {
      return {
        entryPrice: round(marketEntry),
        targetPrice: round(marketTarget),
        stopLossPrice: round(marketStop),
        support: round(support),
        resistance: round(resistance),
        atr: round(atr),
        entryType: 'MARKET_ENTRY',
        method: 'at-market-continuation-atr-v2'
      };
    }
    return reject('buy_entry_outside_band_or_invalid', {
      currentPrice: current,
      entryPrice,
      targetPrice,
      stopLossPrice,
      allowedMin,
      allowedMax,
      support,
      resistance,
      atr,
      risk,
      reward,
      rewardRiskRatio: risk > 0 ? reward / risk : null,
      entryWithinBand: entryPrice >= allowedMin && entryPrice <= allowedMax,
      targetWithinBand: targetPrice >= allowedMin && targetPrice <= allowedMax
    });
  }

  if (signal === 'SELL') {
    if (current <= allowedMin) return reject('sell_current_at_or_below_min', { currentPrice: current, allowedMin });
    if (isLockedAtLowerLimit(market)) return reject('sell_locked_at_lower_limit', { allowedMin });

    // A confirmed rejection near resistance can be used as an exit/reduce-risk
    // reference for existing holders; it is not a short-selling instruction.
    const nearResistance = current <= resistance && resistance - current <= atr * 0.45;
    if (nearResistance && bearishCandle) {
      const entryPrice = current;
      const stopLossPrice = Math.min(allowedMax, resistance + atr * 0.5);
      const targetPrice = Math.max(support, entryPrice - atr * 1.5);
      const risk = stopLossPrice - entryPrice;
      const reward = entryPrice - targetPrice;
      if (stopLossPrice > entryPrice && targetPrice > 0 && targetPrice < entryPrice && risk > 0 && reward / risk >= 1.2) {
        return { entryPrice: round(entryPrice), targetPrice: round(targetPrice), stopLossPrice: round(stopLossPrice), support: round(support), resistance: round(resistance), atr: round(atr), method: 'resistance-rejection-exit-atr-v1' };
      }
      return reject('sell_rejection_risk_reward_invalid', { currentPrice: current, support, resistance, atr, stopLossPrice, targetPrice });
    }

    const entryPrice = support - atr * 0.1;
    const targetPrice = Math.max(allowedMin, entryPrice - atr * 2);
    const stopLossPrice = Math.min(allowedMax, resistance);
    const risk = stopLossPrice - entryPrice;
    const reward = entryPrice - targetPrice;
    if (entryPrice < current && entryPrice >= allowedMin && targetPrice > 0 &&
        targetPrice < entryPrice && stopLossPrice > entryPrice && risk > 0 && reward / risk >= 1.2) {
      return { entryPrice: round(entryPrice), targetPrice: round(targetPrice), stopLossPrice: round(stopLossPrice), support: round(support), resistance: round(resistance), atr: round(atr), method: 'swing-support-atr' };
    }

    // SELL is an exit/reduce-risk reference for existing holders, not a short
    // sale. If a breakdown trigger would fall outside today's legal price band,
    // evaluate an executable sell-at-current-price plan instead. Keep the same
    // legal-band, directional-level, and minimum 1.2 reward/risk safeguards.
    const exitEntry = current;
    const exitTarget = Math.max(allowedMin, Math.min(support, exitEntry - atr * 0.5));
    const exitStop = Math.min(allowedMax, Math.max(resistance, exitEntry + atr * 0.5));
    const exitRisk = exitStop - exitEntry;
    const exitReward = exitEntry - exitTarget;
    if (bearishCandle && exitEntry > allowedMin && exitTarget >= allowedMin && exitTarget < exitEntry &&
        exitStop > exitEntry && exitStop <= allowedMax && exitRisk > 0 &&
        exitReward / exitRisk >= 1.2) {
      return {
        entryPrice: round(exitEntry),
        targetPrice: round(exitTarget),
        stopLossPrice: round(exitStop),
        support: round(support),
        resistance: round(resistance),
        atr: round(atr),
        method: 'sell-exit-reference-atr-v2'
      };
    }

    return reject('sell_entry_outside_band_or_invalid', {
      currentPrice: current, entryPrice, targetPrice, stopLossPrice,
      allowedMin, allowedMax, risk, reward,
      rewardRiskRatio: risk > 0 ? reward / risk : null,
      exitReference: {
        entryPrice: exitEntry,
        targetPrice: exitTarget,
        stopLossPrice: exitStop,
        rewardRiskRatio: exitRisk > 0 ? exitReward / exitRisk : null
      }
    });
  }
  return reject('unsupported_signal', { signal: String(signal) });
}

async function selectCandidatesWithValidLevels(rankedCandidates, limit, resolveLevels) {
  const candidates = [];
  let evaluatedCount = 0;
  for (const candidate of rankedCandidates) {
    if (candidates.length >= limit) break;
    evaluatedCount += 1;
    const levels = await resolveLevels(candidate);
    if (levels) candidates.push({ ...candidate, levels });
  }
  return { candidates, evaluatedCount };
}

module.exports = { calculateScalpingPriceLevels, isLockedAtUpperLimit, isLockedAtLowerLimit, selectCandidatesWithValidLevels };
