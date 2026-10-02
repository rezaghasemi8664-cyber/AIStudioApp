  const indicators = result?.indicators || {};
  const current = num(result?.currentPrice) ?? num(candles?.[candles.length - 1]?.close);
  const lines = ['تحلیل تکنیکال نمودار', ''];

  if (current !== null) lines.push(`قیمت فعلی: ${formatPrice(current)}`);

  const movingParts = [];
  for (const [label, value] of [['SMA20', indicators.sma20], ['SMA50', indicators.sma50], ['EMA20', indicators.ema20], ['EMA50', indicators.ema50]]) {
    const n = num(value);
    if (n !== null) movingParts.push(`${label}=${formatPrice(n)}${current !== null ? (current > n ? '؛ قیمت بالاتر از میانگین است' : '؛ قیمت پایین‌تر از میانگین است') : ''}`);
  }
  if (movingParts.length) {
    lines.push('میانگین‌های متحرک');
    lines.push(`• ${movingParts.join('\n• ')}`);
    lines.push('');
  }

  const rsi = num(indicators.rsi);
  if (rsi !== null) {
    const state = rsi >= 70 ? 'اشباع خرید' : rsi <= 30 ? 'اشباع فروش' : rsi >= 50 ? 'متمایل به قدرت خرید' : 'متمایل به قدرت فروش';
    lines.push('شاخص قدرت نسبی (RSI)');
    lines.push(`• RSI(14): ${formatNumber(rsi)}`);
    lines.push(`• وضعیت: ${state}`);
    lines.push('');
  }

  if (indicators.macd) {
    const m = indicators.macd;
    const parts = [];
    if (num(m.line) !== null) parts.push(`خط MACD=${formatNumber(m.line)}`);
    if (num(m.signal) !== null) parts.push(`خط سیگنال=${formatNumber(m.signal)}`);
    if (num(m.histogram) !== null) parts.push(`هیستوگرام=${formatNumber(m.histogram)}`);
    if (m.crossover && m.crossover !== 'نامشخص') parts.push(`کراس=${m.crossover}`);
    if (parts.length) {
      lines.push('MACD');
      lines.push(`• ${parts.join('\n• ')}`);
      lines.push('');
    }
  }

  if (indicators.bollinger) {
    const bb = indicators.bollinger;
    const parts = [];
    if (num(bb.upper) !== null) parts.push(`باند بالا=${formatPrice(bb.upper)}`);
    if (num(bb.middle) !== null) parts.push(`باند میانی=${formatPrice(bb.middle)}`);
    if (num(bb.lower) !== null) parts.push(`باند پایین=${formatPrice(bb.lower)}`);
    if (indicators.bollingerPosition) parts.push(`موقعیت قیمت: ${indicators.bollingerPosition}`);
    if (parts.length) {
      lines.push('باندهای بولینگر');
      lines.push(`• ${parts.join('\n• ')}`);
      lines.push('');
    }
  }

  const atr = num(indicators.atr14);
  if (atr !== null) {
    const pct = current && current > 0 ? (atr / current) * 100 : null;
    lines.push('نوسان‌پذیری (ATR)');
    lines.push(`• ATR(14): ${formatPrice(atr)}`);
    if (pct !== null) lines.push(`• نسبت ATR به قیمت: حدود ${formatNumber(pct)}٪`);
    lines.push('• کاربرد: سنجش دامنه نوسان و فاصله‌گذاری منطقی حد ضرر و اهداف');
    lines.push('');
  }

  if (indicators.volume) {
    const v = indicators.volume;
    lines.push('حجم معاملات');
    lines.push(`• حجم فعلی: ${formatNumber(v.current, 0)}`);
    lines.push(`• میانگین ۲۰ روزه: ${formatNumber(v.average, 0)}`);
    lines.push(`• وضعیت حجم: ${v.status || 'نامشخص'}`);
    lines.push('');
  }

  const support = num(result?.supportResistance?.support);
  const resistance = num(result?.supportResistance?.resistance);
  if (support !== null || resistance !== null) {
    lines.push('حمایت و مقاومت');
    if (support !== null) lines.push(`• حمایت اصلی: ${formatPrice(support)}`);
    if (resistance !== null) lines.push(`• مقاومت اصلی: ${formatPrice(resistance)}`);
    lines.push('');
  }

  if (Array.isArray(result?.reasons) && result.reasons.length) {
    lines.push('جمع‌بندی سیگنال‌های تکنیکال');
    result.reasons.forEach((reason) => lines.push(`• ${String(reason).replace(/[؛؛]+$/g, '').trim()}`));
    lines.push('');
  }
  if (Array.isArray(result?.riskWarnings) && result.riskWarnings.length) {
    lines.push('هشدارهای تکنیکال');
    result.riskWarnings.forEach((warning) => lines.push(`• ${String(warning).replace(/[؛؛]+$/g, '').trim()}`));
    lines.push('');
  }
  lines.push('نتیجه نهایی تکنیکال');
  lines.push(`• امتیاز تکنیکال: ${formatNumber(result?.score, 0)} از ۱۰۰`);
  lines.push(`• روند تکنیکال: ${result?.trend || 'خنثی'}`);
  lines.push(`• کیفیت اندیکاتورها: ${result?.indicatorQuality || 'نامشخص'}`);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function combineAnalysisDecision({ technicalScore, fundamentalScore, technicalTrend, sentiment, technicalRisk, fundamentalAvailable }) {
  const hasFundamental = num(fundamentalScore) !== null && fundamentalAvailable === true;
  const tech = Math.max(0, Math.min(100, num(technicalScore) ?? 50));
  const fund = hasFundamental ? Math.max(0, Math.min(100, num(fundamentalScore))) : null;
  const compositeScore = fund === null ? tech : (tech * 0.65) + (fund * 0.35);

  let recommendationFa = 'نگهداری';
  if (compositeScore >= 75) recommendationFa = 'خرید قوی';
  else if (compositeScore >= 60) recommendationFa = 'خرید';
  else if (compositeScore <= 25) recommendationFa = 'فروش قوی';
  else if (compositeScore <= 40) recommendationFa = 'فروش';

  const warnings = [];
  if (technicalRisk === 'زیاد') warnings.push('ریسک تکنیکال بالا است.');
  if (fund !== null && fund < 40) warnings.push('امتیاز بنیادی پایین است.');
  if (fund === null) warnings.push('امتیاز بنیادی عددی معتبر در دسترس نیست؛ جمع‌بندی فعلی بر مبنای تحلیل تکنیکال انجام شده است.');
  if (technicalTrend === 'نزولی') warnings.push('روند تکنیکال نزولی است.');
  if (sentiment === 'منفی') warnings.push('احساس بازار منفی است.');

  const riskLevel = warnings.length >= 3 || compositeScore < 30 ? 'زیاد' : warnings.length === 0 && compositeScore >= 65 ? 'کم' : 'متوسط';
  let compositeTrend = technicalTrend || 'خنثی';
  if (technicalTrend === 'صعودی' && sentiment === 'مثبت') compositeTrend = 'صعودی';
  else if (technicalTrend === 'نزولی' && sentiment === 'منفی') compositeTrend = 'نزولی';
  else if (technicalTrend === 'خنثی') compositeTrend = sentiment || 'خنثی';