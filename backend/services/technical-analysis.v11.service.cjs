'use strict';

/**
 * Deterministic technical-analysis engine v1.1.1.
 * Isolated compatibility implementation; no AI, network, randomness, or external state.
 * Input candles must be ordered oldest -> newest.
 */

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function closes(candles) {
  return candles.map(c => num(c.close)).filter(v => v !== null);
}

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
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  gain /= period;
  loss /= period;
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
    const h = num(candles[i].high);
    const l = num(candles[i].low);
    const pc = num(candles[i - 1].close);
    if (h === null || l === null || pc === null) continue;
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  return tr.length >= period ? sma(tr, period) : null;
}

function bollinger(values, period = 20, multiplier = 2) {
  if (values.length < period) return null;
  const middle = sma(values, period);
  const slice = values.slice(-period);
  const variance = slice.reduce((s, v) => s + (v - middle) ** 2, 0) / period;
  const sd = Math.sqrt(variance);
  const upper = middle + multiplier * sd;
  const lower = middle - multiplier * sd;
  return {
    middle,
    upper,
    lower,
    width: middle !== 0 ? (upper - lower) / middle : null
  };
}

function macd(values, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  if (values.length < slowPeriod + signalPeriod - 1) return null;
  const lineSeries = [];
  for (let i = slowPeriod - 1; i < values.length; i++) {
    const slice = values.slice(0, i + 1);
    const fast = ema(slice, fastPeriod);
    const slow = ema(slice, slowPeriod);
    if (fast !== null && slow !== null) lineSeries.push(fast - slow);
  }
  if (!lineSeries.length) return null;
  const line = lineSeries[lineSeries.length - 1];
  const signal = ema(lineSeries, signalPeriod);
  const previousLine = lineSeries.length > 1 ? lineSeries[lineSeries.length - 2] : null;
  const previousSignal = lineSeries.length > signalPeriod ? ema(lineSeries.slice(0, -1), signalPeriod) : null;
  const histogram = signal === null ? null : line - signal;
  return {
    line,
    signal,
    histogram,
    crossover: previousLine !== null && previousSignal !== null && signal !== null
      ? (previousLine <= previousSignal && line > signal ? 'صعودی' : previousLine >= previousSignal && line < signal ? 'نزولی' : 'بدون کراس')
      : 'نامشخص'
  };
}

function volume(candles, period = 20) {
  const values = candles.map(c => num(c.volume)).filter(v => v !== null && v >= 0);
  if (!values.length) return null;
  const current = values[values.length - 1];
  const average = sma(values, period);
  return {
    current,
    average,
    ratio: average && average > 0 ? current / average : null,
    status: average === null ? 'نامشخص' : current >= average * 1.5 ? 'بالا' : current <= average * 0.7 ? 'پایین' : 'عادی'
  };
}

function supportResistance(candles, lookback = 20) {
  const slice = candles.slice(-lookback);
  const highs = slice.map(c => num(c.high)).filter(v => v !== null);
  const lows = slice.map(c => num(c.low)).filter(v => v !== null);
  return {
    resistance: highs.length ? Math.max(...highs) : null,
    support: lows.length ? Math.min(...lows) : null
  };
}

function analyze(candles, options = {}) {
  if (!Array.isArray(candles) || candles.length < 2) {
    return { success: false, code: 'INSUFFICIENT_DATA', message: 'برای تحلیل تکنیکال حداقل داده کافی لازم است.', indicatorQuality: 'ضعیف' };
  }
  const values = closes(candles);
  if (values.length < 2) {
    return { success: false, code: 'INVALID_CANDLES', message: 'داده قیمت معتبر نیست.', indicatorQuality: 'ضعیف' };
  }

  const rsiPeriod = Number(options.rsiPeriod) || 14;
  const lookback = Number(options.lookback) || 20;
  const current = values[values.length - 1];
  const sma20 = sma(values, 20);
  const sma50 = sma(values, 50);
  const ema20 = ema(values, 20);
  const ema50 = ema(values, 50);
  const rsiValue = rsi(values, rsiPeriod);
  const bb = bollinger(values, 20, 2);
  const macdValue = macd(values);
  const atr14 = atr(candles, 14);
  const volumeValue = volume(candles, 20);
  const sr = supportResistance(candles, lookback);

  let score = 50;
  const reasons = [];
  const scoreBreakdown = [];
  const riskWarnings = [];

  function add(points, reason) {
    score += points;
    scoreBreakdown.push({ points, reason });
    reasons.push(reason);
  }

  if (sma20 !== null) add(current > sma20 ? 10 : -10, current > sma20 ? 'قیمت بالاتر از میانگین متحرک ۲۰ روزه است' : 'قیمت پایین‌تر از میانگین متحرک ۲۰ روزه است');
  if (sma50 !== null) add(current > sma50 ? 10 : -10, current > sma50 ? 'قیمت بالاتر از میانگین متحرک ۵۰ روزه است' : 'قیمت پایین‌تر از میانگین متحرک ۵۰ روزه است');
  if (ema20 !== null) add(current > ema20 ? 5 : -5, current > ema20 ? 'قیمت بالاتر از EMA20 است' : 'قیمت پایین‌تر از EMA20 است');
  if (rsiValue !== null) {
    if (rsiValue >= 70) {
      add(-8, 'RSI در ناحیه اشباع خرید است');
      riskWarnings.push('RSI در ناحیه اشباع خرید قرار دارد؛ احتمال اصلاح کوتاه‌مدت وجود دارد.');
    } else if (rsiValue <= 30) {
      add(8, 'RSI در ناحیه اشباع فروش است');
      riskWarnings.push('RSI در ناحیه اشباع فروش قرار دارد؛ احتمال نوسان و بازگشت قیمت وجود دارد.');
    } else if (rsiValue >= 50) add(3, 'RSI بالاتر از محدوده میانی است');
    else add(-3, 'RSI پایین‌تر از محدوده میانی است');
  }
  if (macdValue !== null) {
    if (macdValue.line > 0) add(7, 'MACD بالاتر از خط صفر است');
    else if (macdValue.line < 0) add(-7, 'MACD پایین‌تر از خط صفر است');
    if (macdValue.crossover === 'صعودی') add(5, 'کراس صعودی MACD مشاهده شد');
    else if (macdValue.crossover === 'نزولی') add(-5, 'کراس نزولی MACD مشاهده شد');
  }
  if (volumeValue && volumeValue.ratio !== null) {
    if (volumeValue.ratio >= 1.5) add(3, 'حجم معاملات حداقل ۵۰ درصد بالاتر از میانگین ۲۰ روزه است');
    else if (volumeValue.ratio <= 0.7) add(-2, 'حجم معاملات پایین‌تر از میانگین ۲۰ روزه است');
  }

  let bollingerPosition = 'نامشخص';
  if (bb) {
    if (current >= bb.upper) {
      bollingerPosition = 'بالاتر از باند بالایی';
      riskWarnings.push('قیمت بالاتر از باند بالایی بولینگر قرار دارد؛ احتمال اصلاح یا بازگشت به میانگین وجود دارد.');
    } else if (current <= bb.lower) {
      bollingerPosition = 'پایین‌تر از باند پایینی';
      riskWarnings.push('قیمت پایین‌تر از باند پایینی بولینگر قرار دارد؛ نوسان و احتمال بازگشت باید بررسی شود.');
    } else if (current >= bb.middle) bollingerPosition = 'نیمه بالایی';
    else bollingerPosition = 'نیمه پایینی';
  }

  score = Math.max(0, Math.min(100, score));
  const recommendation = score >= 65 ? 'خرید' : score <= 35 ? 'فروش' : 'نگهداری';
  const trend = (sma20 !== null && current > sma20) && (sma50 === null || current > sma50)
    ? 'صعودی'
    : (sma20 !== null && current < sma20) && (sma50 === null || current < sma50) ? 'نزولی' : 'خنثی';

  const available = [sma20, sma50, ema20, ema50, rsiValue, bb, macdValue, atr14, volumeValue].filter(v => v !== null).length;
  const indicatorQuality = available >= 7 ? 'خوب' : available >= 5 ? 'متوسط' : 'ضعیف';

  return {
    success: true,
    engine: 'deterministic-technical-analysis',
    version: '1.1.1',
    currentPrice: current,
    indicators: {
      sma20, sma50, ema20, ema50,
      rsi: rsiValue,
      macd: macdValue,
      atr14,
      bollinger: bb,
      bollingerPosition,
      volume: volumeValue
    },
    supportResistance: sr,
    score,
    scoreBreakdown,
    recommendation,
    trend,
    indicatorQuality,
    riskWarnings,
    reasons,
    deterministic: true
  };
}

module.exports = { analyze, sma, ema, rsi, atr, bollinger, macd, supportResistance, volume };
