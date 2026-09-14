'use strict';

/**
 * Deterministic technical-analysis engine.
 * No AI, network access, randomness, or external state.
 * Input candles: [{ open, high, low, close, volume }]
 */

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function closes(candles) { return candles.map(c => num(c.close)).filter(v => v !== null); }

function sma(values, period) {
  if (values.length < period) return null;
  let sum = 0;
  for (let i = values.length - period; i < values.length; i++) sum += values[i];
  return sum / period;
}

function ema(values, period) {
  if (values.length < period) return null;
  let value = sma(values.slice(0, period), period);
  const k = 2 / (period + 1);
  for (let i = period; i < values.length; i++) value = values[i] * k + value * (1 - k);
  return value;
}

function rsi(values, period = 14) {
  if (values.length <= period) return null;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  gain /= period; loss /= period;
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (loss === 0) return 100;
  return 100 - 100 / (1 + gain / loss);
}

function atr(candles, period = 14) {
  if (candles.length <= period) return null;
  const tr = [];
  for (let i = 1; i < candles.length; i++) {
    const h = num(candles[i].high), l = num(candles[i].low), pc = num(candles[i - 1].close);
    if (h === null || l === null || pc === null) continue;
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  return tr.length >= period ? sma(tr, period) : null;
}

function bollinger(values, period = 20, multiplier = 2) {
  if (values.length < period) return null;
  const mean = sma(values, period);
  const slice = values.slice(-period);
  const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period;
  const sd = Math.sqrt(variance);
  return { middle: mean, upper: mean + multiplier * sd, lower: mean - multiplier * sd };
}

function macd(values) {
  const fast = ema(values, 12), slow = ema(values, 26);
  if (fast === null || slow === null) return null;
  const macdLine = fast - slow;
  return { line: macdLine, signal: null, histogram: null };
}

function supportResistance(candles, lookback = 20) {
  const slice = candles.slice(-lookback);
  const highs = slice.map(c => num(c.high)).filter(v => v !== null);
  const lows = slice.map(c => num(c.low)).filter(v => v !== null);
  return {
    resistance: highs.length ? Math.max(...highs) : null,
    support: lows.length ? Math.min(...lows) : null,
  };
}

function analyze(candles, options = {}) {
  if (!Array.isArray(candles) || candles.length < 2) {
    return { success: false, code: 'INSUFFICIENT_DATA', message: 'برای تحلیل تکنیکال حداقل داده کافی لازم است.', dataQuality: 'ضعیف' };
  }
  const values = closes(candles);
  if (values.length < 2) return { success: false, code: 'INVALID_CANDLES', message: 'داده قیمت معتبر نیست.', dataQuality: 'ضعیف' };

  const period = Number(options.rsiPeriod) || 14;
  const current = values[values.length - 1];
  const sma20 = sma(values, 20), sma50 = sma(values, 50);
  const ema20 = ema(values, 20), ema50 = ema(values, 50);
  const rsi14 = rsi(values, period);
  const bb = bollinger(values, 20, 2);
  const macdValue = macd(values);
  const atr14 = atr(candles, 14);
  const sr = supportResistance(candles, Number(options.lookback) || 20);

  let score = 50;
  const reasons = [];
  if (sma20 !== null) { if (current > sma20) { score += 10; reasons.push('قیمت بالاتر از میانگین متحرک ۲۰ روزه است'); } else { score -= 10; reasons.push('قیمت پایین‌تر از میانگین متحرک ۲۰ روزه است'); } }
  if (sma50 !== null) { if (current > sma50) score += 10; else score -= 10; }
  if (ema20 !== null) { if (current > ema20) score += 5; else score -= 5; }
  if (rsi14 !== null) { if (rsi14 >= 70) score -= 8; else if (rsi14 <= 30) score += 8; }
  if (macdValue !== null && macdValue.line > 0) score += 7;
  if (macdValue !== null && macdValue.line < 0) score -= 7;
  score = Math.max(0, Math.min(100, score));

  let recommendation = 'نگهداری';
  if (score >= 65) recommendation = 'خرید';
  else if (score <= 35) recommendation = 'فروش';

  let trend = 'خنثی';
  if ((sma20 !== null && current > sma20) && (sma50 === null || current > sma50)) trend = 'صعودی';
  else if ((sma20 !== null && current < sma20) && (sma50 === null || current < sma50)) trend = 'نزولی';

  const available = [sma20, sma50, ema20, ema50, rsi14, bb, macdValue, atr14].filter(v => v !== null).length;
  const dataQuality = available >= 6 ? 'خوب' : available >= 4 ? 'متوسط' : 'ضعیف';

  return {
    success: true,
    engine: 'deterministic-technical-analysis',
    version: '1.0.0',
    currentPrice: current,
    indicators: { sma20, sma50, ema20, ema50, rsi: rsi14, macd: macdValue, atr14, bollinger: bb },
    supportResistance: sr,
    score,
    recommendation,
    trend,
    dataQuality,
    reasons,
    deterministic: true,
  };
}

module.exports = { analyze, sma, ema, rsi, atr, bollinger, macd, supportResistance };
