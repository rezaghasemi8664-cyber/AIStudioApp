'use strict';

const MIN_SAMPLES = 30;
const LOOKAHEAD_SESSIONS = 5;

function finitePositive(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}

function averageTrueRange(candles, endExclusive) {
  const start = Math.max(1, endExclusive - 14);
  if (endExclusive - start < 14) return null;
  const ranges = [];
  for (let i = start; i < endExclusive; i += 1) {
    const c = candles[i];
    const prevClose = Number(candles[i - 1].close);
    ranges.push(Math.max(
      Number(c.high) - Number(c.low),
      Math.abs(Number(c.high) - prevClose),
      Math.abs(Number(c.low) - prevClose)
    ));
  }
  const atr = ranges.reduce((sum, value) => sum + value, 0) / ranges.length;
  return finitePositive(atr) ? atr : null;
}

function rate(successes, samples) {
  return samples >= MIN_SAMPLES
    ? Number(((successes / samples) * 100).toFixed(1))
    : null;
}

/**
 * Walk-forward analog test. Every historical setup uses only candles before
 * its signal date; outcomes are read only from the following five sessions.
 * Same-session TP/SL ambiguity is resolved conservatively as stop-first.
 */
function estimateHistoricalScalpingProbabilities(history, currentSetup) {
  const candles = Array.isArray(history) ? history.filter(c =>
    c && [c.open, c.high, c.low, c.close].every(finitePositive) &&
    Number(c.high) >= Number(c.low)
  ) : [];
  const currentPrice = Number(currentSetup && currentSetup.currentPrice);
  const currentAtr = Number(currentSetup && currentSetup.atr);
  const entry = Number(currentSetup && currentSetup.entryPrice);
  const target = Number(currentSetup && currentSetup.targetPrice);
  const stop = Number(currentSetup && currentSetup.stopLossPrice);
  const entryType = String(currentSetup && currentSetup.entryType || 'PENDING_PULLBACK');
  if (candles.length < 50 || ![currentPrice, currentAtr, entry, target, stop].every(finitePositive)) {
    return { status: 'INSUFFICIENT_DATA', minimumSamples: MIN_SAMPLES, samples: 0, lookaheadSessions: LOOKAHEAD_SESSIONS };
  }

  const entryOffset = (entry - currentPrice) / currentAtr;
  const targetOffset = (target - currentPrice) / currentAtr;
  const stopOffset = (stop - currentPrice) / currentAtr;
  let samples = 0;
  let entryHits = 0;
  let reversals = 0;
  let targetBeforeStop = 0;

  for (let signalIndex = 15; signalIndex < candles.length - LOOKAHEAD_SESSIONS; signalIndex += 1) {
    const reference = Number(candles[signalIndex - 1].close);
    const historicalAtr = averageTrueRange(candles, signalIndex);
    if (!finitePositive(reference) || !finitePositive(historicalAtr)) continue;

    const historicalEntry = reference + entryOffset * historicalAtr;
    const historicalTarget = reference + targetOffset * historicalAtr;
    const historicalStop = reference + stopOffset * historicalAtr;
    if (![historicalEntry, historicalTarget, historicalStop].every(finitePositive)) continue;
    if (historicalTarget <= historicalEntry || historicalStop >= historicalEntry) continue;

    samples += 1;
    const future = candles.slice(signalIndex, signalIndex + LOOKAHEAD_SESSIONS);
    const isBreakout = entryType === 'BREAKOUT_TRIGGER';
    const hitIndex = future.findIndex(c => isBreakout
      ? Number(c.high) >= historicalEntry
      : Number(c.low) <= historicalEntry);
    if (hitIndex < 0) continue;
    entryHits += 1;
    if (isBreakout
      ? Number(future[hitIndex].close) > historicalEntry
      : Number(future[hitIndex].close) > historicalEntry) reversals += 1;

    let outcome = null;
    for (let j = hitIndex; j < future.length; j += 1) {
      const bar = future[j];
      const hitStop = Number(bar.low) <= historicalStop;
      const hitTarget = Number(bar.high) >= historicalTarget;
      if (hitStop && hitTarget) { outcome = 'STOP'; break; }
      if (hitStop) { outcome = 'STOP'; break; }
      if (hitTarget) { outcome = 'TARGET'; break; }
    }
    if (outcome === 'TARGET') targetBeforeStop += 1;
  }

  return {
    status: samples >= MIN_SAMPLES ? 'CALIBRATED' : 'INSUFFICIENT_DATA',
    minimumSamples: MIN_SAMPLES,
    samples,
    lookaheadSessions: LOOKAHEAD_SESSIONS,
    entryHitProbability: rate(entryHits, samples),
    reversalAfterEntryProbability: rate(reversals, entryHits),
    targetBeforeStopProbability: rate(targetBeforeStop, entryHits),
    method: 'walk-forward-ohlc-atr-v1',
    note: samples >= MIN_SAMPLES
      ? 'برآورد تاریخی؛ تضمین عملکرد آینده نیست.'
      : 'نمونه تاریخی کافی نیست؛ درصدها عمداً نمایش داده نمی‌شوند.'
  };
}

async function getHistoricalScalpingProbabilities(prisma, symbol, marketDate, levels, currentPrice) {
  const rows = await prisma.marketDaily.findMany({
    where: { symbol, date: { lt: marketDate } },
    orderBy: { date: 'desc' },
    take: 180,
    select: { date: true, open: true, high: true, low: true, close: true }
  });
  const history = rows.reverse();
  return estimateHistoricalScalpingProbabilities(history, {
    currentPrice,
    entryPrice: levels.entryPrice,
    targetPrice: levels.targetPrice,
    stopLossPrice: levels.stopLossPrice,
    atr: levels.atr,
    entryType: levels.entryType
  });
}

module.exports = {
  estimateHistoricalScalpingProbabilities,
  getHistoricalScalpingProbabilities,
  MIN_SAMPLES,
  LOOKAHEAD_SESSIONS
};
