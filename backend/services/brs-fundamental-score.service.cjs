'use strict';

/**
 * Deterministic fundamental snapshot scoring from the BRS symbol endpoint.
 *
 * This is a fallback for environments where direct Codal document hosts are
 * unreachable. It deliberately uses only numeric fields already returned by
 * BRS Symbol.php and does not use AI or inferred financial-statement values.
 */

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function scorePositiveEps(eps) {
  if (eps > 0) return { score: 50, reason: 'EPS مثبت است.' };
  if (eps === 0) return { score: 20, reason: 'EPS صفر است.' };
  return { score: 0, reason: 'EPS منفی است.' };
}

function scorePe(pe, groupPe) {
  if (pe <= 0) return null;

  if (groupPe > 0) {
    const ratio = pe / groupPe;
    if (ratio <= 0.8) return { score: 50, reason: 'P/E سهم پایین‌تر از سطح مقایسه‌ای گروه است.' };
    if (ratio <= 1.0) return { score: 42, reason: 'P/E سهم در محدوده یا پایین‌تر از P/E گروه است.' };
    if (ratio <= 1.2) return { score: 34, reason: 'P/E سهم کمی بالاتر از P/E گروه است.' };
    if (ratio <= 1.5) return { score: 24, reason: 'P/E سهم به‌طور محسوسی بالاتر از P/E گروه است.' };
    return { score: 10, reason: 'P/E سهم بیش از ۱.۵ برابر P/E گروه است.' };
  }

  if (pe <= 8) return { score: 50, reason: 'P/E در محدوده پایین قرار دارد.' };
  if (pe <= 12) return { score: 42, reason: 'P/E در محدوده نسبتاً پایین قرار دارد.' };
  if (pe <= 18) return { score: 34, reason: 'P/E در محدوده میانی قرار دارد.' };
  if (pe <= 25) return { score: 24, reason: 'P/E در محدوده نسبتاً بالا قرار دارد.' };
  return { score: 10, reason: 'P/E در محدوده بالا قرار دارد.' };
}

function calculateFundamentalSnapshotScore(fundamental) {
  const eps = finite(fundamental?.eps);
  const pe = finite(fundamental?.pe);
  const groupPe = finite(fundamental?.groupPe);

  const components = [];

  if (eps !== null) {
    const result = scorePositiveEps(eps);
    components.push({
      key: 'eps',
      label: 'سود هر سهم',
      value: eps,
      score: result.score,
      max: 50,
      reason: result.reason,
    });
  }

  if (pe !== null && pe > 0) {
    const result = scorePe(pe, groupPe !== null ? groupPe : null);
    if (result) {
      components.push({
        key: 'pe',
        label: 'P/E',
        value: pe,
        comparisonValue: groupPe,
        score: result.score,
        max: 50,
        reason: result.reason,
      });
    }
  }

  if (components.length < 2) {
    return {
      score: null,
      status: 'insufficient-data',
      coverage: Number((components.length / 2).toFixed(2)),
      components,
      source: 'BRS_SYMBOL',
      fallback: true,
      reason: 'برای امتیاز بنیادی جایگزین، حداقل EPS و P/E معتبر از BRS لازم است.',
    };
  }

  const maxScore = components.reduce((sum, item) => sum + item.max, 0);
  const rawScore = components.reduce((sum, item) => sum + item.score, 0);
  const score = Math.max(0, Math.min(100, Math.round((rawScore / maxScore) * 100)));

  const groupText = groupPe !== null && groupPe > 0
    ? ` P/E گروه ${groupPe} است.`
    : '';

  const reason =
    `به دلیل در دسترس نبودن مستقیم فایل‌های صورت مالی Codal از سرور، امتیاز بنیادی جایگزین با داده‌های عددی معتبر BRS محاسبه شد. EPS برابر ${eps} و P/E برابر ${pe} است.${groupText} امتیاز نهایی ${score} از ۱۰۰ است.`;

  return {
    score,
    status: 'calculated-fallback',
    coverage: 1,
    components,
    source: 'BRS_SYMBOL',
    fallback: true,
    reason,
  };
}

module.exports = {
  calculateFundamentalSnapshotScore,
};
