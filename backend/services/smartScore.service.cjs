'use strict';

function num(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function component(label, score, details) {
  return { label, score: Math.round(clamp(score)), details };
}

function scoreTrend(data) {
  const change = num(data.lastChangePercent, data.plp, data.percentChange);
  if (change === null) return component('روند قیمت', 50, 'داده تغییر قیمت در دسترس نیست');
  return component('روند قیمت', clamp(50 + change * 8), `تغییر آخرین قیمت: ${change.toFixed(2)}٪`);
}

function scoreMomentum(data) {
  const closeChange = num(data.closeChangePercent, data.pcp);
  const high = num(data.high, data.pmax);
  const low = num(data.low, data.pmin);
  const last = num(data.lastPrice, data.pDrCotVal, data.pl);
  let score = closeChange === null ? 50 : 50 + closeChange * 7;
  if (last !== null && high !== null && low !== null && high > low) {
    score += ((last - low) / (high - low) - 0.5) * 20;
  }
  return component('مومنتوم', score, closeChange === null ? 'داده مومنتوم کافی نیست' : `تغییر پایانی: ${closeChange.toFixed(2)}٪`);
}

function scoreLiquidity(data) {
  const volume = num(data.volume, data.tvol, data.qTotTran5J);
  const baseVolume = num(data.baseVolume, data.bvol);
  if (volume === null) return component('حجم و نقدشوندگی', 50, 'حجم معاملات در دسترس نیست');
  const ratio = baseVolume && baseVolume > 0 ? volume / baseVolume : null;
  return component('حجم و نقدشوندگی', ratio === null ? 55 : clamp(45 + Math.log10(Math.max(ratio, 0.01) + 1) * 35), ratio === null ? 'حجم واقعی موجود است' : `نسبت حجم به حجم مبنا: ${ratio.toFixed(2)}`);
}

function scoreMoneyFlow(data) {
  const net = num(data.realNetValue, data.realMoneyFlow);
  const buy = num(data.realBuyValue);
  const sell = num(data.realSellValue);
  if (net === null) return component('جریان پول حقیقی', 50, 'خالص پول حقیقی در دسترس نیست');
  const denominator = Math.max(Math.abs(buy || 0), Math.abs(sell || 0), 1);
  const ratio = net / denominator;
  return component('جریان پول حقیقی', clamp(50 + ratio * 50), `خالص پول حقیقی: ${net.toLocaleString('fa-IR')}`);
}

function scoreValuation(data) {
  const pe = num(data.pe, data.pE, data.peRatio);
  if (pe === null) return component('ارزش‌گذاری', 50, 'P/E در دسترس نیست');
  if (pe <= 0) return component('ارزش‌گذاری', 45, `P/E: ${pe.toFixed(2)}`);
  return component('ارزش‌گذاری', clamp(85 - pe * 4), `P/E: ${pe.toFixed(2)}`);
}

function scoreTrading(data) {
  const bid = num(data.bidVolume, data.qTitMeDem);
  const ask = num(data.askVolume, data.qTitMeOf);
  if (bid === null && ask === null) return component('وضعیت معاملات', 50, 'عمق سفارش‌ها در دسترس نیست');
  const total = (bid || 0) + (ask || 0);
  const pressure = total > 0 ? ((bid || 0) - (ask || 0)) / total : 0;
  return component('وضعیت معاملات', 50 + pressure * 50, `فشار سفارش: ${(pressure * 100).toFixed(1)}٪`);
}

function scoreDataQuality(data) {
  const fields = ['lastPrice', 'closePrice', 'volume', 'value', 'high', 'low', 'pe', 'realNetValue'];
  const available = fields.filter(key => num(data[key]) !== null).length;
  return component('کیفیت داده', (available / fields.length) * 100, `${available} از ${fields.length} شاخص اصلی موجود است`);
}

function calculateSmartScore(data = {}) {
  const components = [scoreTrend(data), scoreMomentum(data), scoreLiquidity(data), scoreMoneyFlow(data), scoreValuation(data), scoreTrading(data), scoreDataQuality(data)];
  const score = Math.round(components.reduce((sum, item) => sum + item.score, 0) / components.length);
  const status = score >= 67 ? 'Bullish' : score <= 33 ? 'Bearish' : 'Neutral';
  return { score, status, components, calculatedAt: new Date().toISOString(), source: 'real-market-data', ai: false };
}

module.exports = { calculateSmartScore };
