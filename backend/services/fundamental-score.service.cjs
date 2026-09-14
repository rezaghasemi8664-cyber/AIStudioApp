'use strict';

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function bandScore(value, bands) {
  if (value == null) return null;
  for (const band of bands) {
    if (band.when(value)) return band.score;
  }
  return null;
}

function calculateFundamentalScore(metrics) {
  const revenue = numberOrNull(metrics?.revenue?.value);
  const operatingProfit = numberOrNull(metrics?.operatingProfit?.value);
  const netProfit = numberOrNull(metrics?.netProfit?.value);
  const assets = numberOrNull(metrics?.assets?.value);
  const liabilities = numberOrNull(metrics?.liabilities?.value);
  const equity = numberOrNull(metrics?.equity?.value);
  const eps = numberOrNull(metrics?.eps?.value);
  const components = [];

  const add = (key, label, score, max, value, reason) => {
    if (score == null) return;
    components.push({ key, label, score, max, value, reason });
  };

  if (revenue > 0 && netProfit != null) {
    const margin = netProfit / revenue;
    add('netMargin', 'حاشیه سود خالص', bandScore(margin, [
      { when: v => v >= 0.20, score: 20 }, { when: v => v >= 0.12, score: 16 },
      { when: v => v >= 0.05, score: 12 }, { when: v => v >= 0, score: 7 },
      { when: v => v >= -0.05, score: 3 }, { when: () => true, score: 0 },
    ]), 20, margin, 'بر اساس حاشیه سود خالص واقعی.');
  }

  if (revenue > 0 && operatingProfit != null) {
    const margin = operatingProfit / revenue;
    add('operatingMargin', 'حاشیه سود عملیاتی', bandScore(margin, [
      { when: v => v >= 0.20, score: 20 }, { when: v => v >= 0.12, score: 16 },
      { when: v => v >= 0.05, score: 12 }, { when: v => v >= 0, score: 7 },
      { when: v => v >= -0.05, score: 3 }, { when: () => true, score: 0 },
    ]), 20, margin, 'بر اساس حاشیه سود عملیاتی واقعی.');
  }

  if (assets > 0 && liabilities >= 0) {
    const ratio = liabilities / assets;
    add('debtRatio', 'نسبت بدهی به دارایی', bandScore(ratio, [
      { when: v => v <= 0.30, score: 20 }, { when: v => v <= 0.50, score: 16 },
      { when: v => v <= 0.65, score: 12 }, { when: v => v <= 0.80, score: 7 },
      { when: v => v <= 0.90, score: 3 }, { when: () => true, score: 0 },
    ]), 20, ratio, 'بر اساس نسبت بدهی به دارایی واقعی.');
  } else if (equity > 0 && liabilities >= 0) {
    const ratio = liabilities / equity;
    add('debtToEquity', 'نسبت بدهی به حقوق مالکانه', bandScore(ratio, [
      { when: v => v <= 0.50, score: 20 }, { when: v => v <= 1, score: 16 },
      { when: v => v <= 1.5, score: 12 }, { when: v => v <= 2.5, score: 7 },
      { when: v => v <= 4, score: 3 }, { when: () => true, score: 0 },
    ]), 20, ratio, 'به‌عنوان معیار جایگزین اهرم مالی.');
  }

  if (equity > 0 && netProfit != null) {
    const roe = netProfit / equity;
    add('roe', 'بازده حقوق مالکانه', bandScore(roe, [
      { when: v => v >= 0.30, score: 20 }, { when: v => v >= 0.20, score: 16 },
      { when: v => v >= 0.10, score: 12 }, { when: v => v >= 0, score: 7 },
      { when: v => v >= -0.10, score: 3 }, { when: () => true, score: 0 },
    ]), 20, roe, 'بر اساس سود خالص و حقوق مالکانه واقعی.');
  }

  if (eps != null) {
    add('eps', 'سود هر سهم', eps > 0 ? 20 : 0, 20, eps, eps > 0 ? 'EPS مثبت است.' : 'EPS غیرمثبت است.');
  }

  if (components.length < 2) {
    return {
      score: null,
      status: 'insufficient-data',
      coverage: Number((components.length / 5).toFixed(2)),
      components,
      reason: 'داده عددی معتبر برای محاسبه امتیاز بنیادی کافی نیست.',
    };
  }

  const maxScore = components.reduce((sum, item) => sum + item.max, 0);
  const rawScore = components.reduce((sum, item) => sum + item.score, 0);

  return {
    score: Math.max(0, Math.min(100, Math.round((rawScore / maxScore) * 100))),
    status: 'calculated',
    coverage: Number((components.length / 5).toFixed(2)),
    components,
    reason: 'امتیاز بنیادی فقط از داده‌های عددی استخراج‌شده از اسناد مالی محاسبه شد.',
  };
}

module.exports = { calculateFundamentalScore };
