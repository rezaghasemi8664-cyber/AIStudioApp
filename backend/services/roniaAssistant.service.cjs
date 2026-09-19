'use strict';

const comparisonService = require('./deterministic-stock-comparison.service.cjs');

function fa(value, digits = 0) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return 'نامشخص';
  return Number(value).toLocaleString('fa-IR', { maximumFractionDigits: digits });
}

function historyReturn(row, points = 22) {
  const history = Array.isArray(row?.history)
    ? row.history.filter(p => Number.isFinite(Number(p?.close)) && Number(p.close) > 0)
    : [];
  if (history.length < 2) return null;
  const start = Number(history[Math.max(0, history.length - points)]?.close);
  const end = Number(history[history.length - 1]?.close);
  return Number.isFinite(start) && start > 0 && Number.isFinite(end) ? ((end / start) - 1) * 100 : null;
}

function qualityText(row) {
  const q = row?.comparisonQuality;
  if (!q) return 'کیفیت داده: نامشخص';
  return `کیفیت داده ${fa(q.score)} از ۱۰۰، پوشش فیلدها ${fa(q.fieldCoverage, 1)}٪ و پوشش تاریخچه ${fa(q.historyCoverage, 1)}٪.`;
}

function normalizeIntent(message) {
  const text = String(message || '').trim().toLowerCase();
  if (!text || /راهنما|چه کار|دستورات|کمک/.test(text)) return { type: 'help' };
  if (/مقایسه|مقایسه کن|هم مقایسه/.test(text)) return { type: 'compare' };
  if (/کیفیت داده|اعتبار داده|داده معتبر|پوشش داده/.test(text)) return { type: 'dataQuality' };
  if (/نقدشوندگی|حجم معاملات|ارزش معاملات|لیکوئید/.test(text)) return { type: 'liquidity' };
  if (/بازده ماه|بازده ۱ ماه|بازده یک ماه|بازده 1 ماه|عملکرد ماه/.test(text)) return { type: 'monthlyReturn' };
  if (/p\/e|pe|پی بر ای|پی بر ئی/.test(text)) return { type: 'pe' };
  if (/قیمت|آخرین|پایانی/.test(text)) return { type: 'price' };
  if (/تغییر|درصد روز|بازده روز/.test(text)) return { type: 'change' };
  if (/امتیاز|اسکور|score/.test(text)) return { type: 'score' };
  if (/ریسک/.test(text)) return { type: 'risk' };
  if (/جریان پول|پول حقیقی|پول حقوقی|ورود پول|خروج پول/.test(text)) return { type: 'moneyFlow' };
  if (/روند|ترند/.test(text)) return { type: 'trend' };
  return { type: 'overview' };
}

function extractSymbols(message) {
  const candidates = String(message || '').match(/[آ-یA-Za-z][آ-یA-Za-z0-9۰-۹_-]{1,14}/g) || [];
  const stop = new Set([
    'قیمت','سهم','سهام','امتیاز','ریسک','روند','مقایسه','جریان','پول','حقیقی','حقوقی','بازده',
    'درصد','روز','امروز','راهنما','تحلیل','نماد','پی','بر','ای','آخرین','پایانی','ارزش','من',
    'را','از','برای','چیست','چقدر','است','داده','کیفیت','معتبر','نقدشوندگی','حجم','معاملات',
    'ماه','یک','کن','کنم','میخواهم','می‌خواهم','اطلاعات','نسبت'
  ]);
  return [...new Set(candidates.map(s => s.trim()).filter(s => !stop.has(s.toLowerCase())))].slice(0, 5);
}

function helpResponse() {
  return {
    type: 'help',
    title: 'راهنمای دستیار رونیا',
    answer: 'دستیار رونیا قطعی و داده‌محور است. می‌تواند قیمت، تغییر روزانه، P/E، EPS، امتیاز، ریسک، روند، جریان پول، نقدشوندگی، بازده تقریبی یک‌ماهه و کیفیت داده یک نماد را از داده‌های واقعی گزارش کند. برای مقایسه دو تا پنج نماد را بنویسید؛ مثال: «فملی و فولاد را مقایسه کن».',
    actions: [
      { label: 'پروفایل سهم', tab: 'profile' },
      { label: 'مقایسه', tab: 'comparison' },
      { label: 'Smart Score', tab: 'smartScore' },
      { label: 'رادار بازار', tab: 'marketRadar' }
    ]
  };
}

function describe(row, intent) {
  const monthly = historyReturn(row);
  if (intent.type === 'price') return `${row.symbol}: قیمت فعلی ${fa(row.currentPrice)}، قیمت پایانی ${fa(row.closingPrice)}.`;
  if (intent.type === 'change') return `${row.symbol}: تغییر روزانه ${fa(row.priceChangePercent, 2)}٪.`;
  if (intent.type === 'score') return `${row.symbol}: امتیاز تکنیکال ${fa(row.technicalScore)}، بنیادی ${fa(row.fundamentalScore)}، کل ${fa(row.totalScore)}.`;
  if (intent.type === 'risk') return `${row.symbol}: سطح ریسک ثبت‌شده «${row.riskLevel || 'نامشخص'}».`;
  if (intent.type === 'moneyFlow') return `${row.symbol}: جریان پول خالص ${fa(row.netMoneyFlow)}؛ حقیقی ${fa(row.realMoneyFlow)}؛ حقوقی ${fa(row.legalMoneyFlow)}.`;
  if (intent.type === 'trend') return `${row.symbol}: روند «${row.trend || 'نامشخص'}» و تغییر روزانه ${fa(row.priceChangePercent, 2)}٪.`;
  if (intent.type === 'pe') return `${row.symbol}: P/E برابر ${fa(row.pe, 2)} و EPS برابر ${fa(row.eps, 2)}.`;
  if (intent.type === 'liquidity') return `${row.symbol}: حجم معاملات ${fa(row.tradedVolume)}، ارزش معاملات ${fa(row.tradedValue)}.`;
  if (intent.type === 'monthlyReturn') return `${row.symbol}: بازده محاسباتی حدود یک‌ماهه بر اساس تاریخچه موجود ${fa(monthly, 2)}٪.`;
  if (intent.type === 'dataQuality') return `${row.symbol}: ${qualityText(row)}`;
  return `${row.symbol}: قیمت پایانی ${fa(row.closingPrice)}، تغییر روزانه ${fa(row.priceChangePercent, 2)}٪، امتیاز کل ${fa(row.totalScore)}، روند «${row.trend || 'نامشخص'}» و ریسک «${row.riskLevel || 'نامشخص'}».`;
}

async function answer(params = {}) {
  const message = String(params.message || '').trim();
  const intent = normalizeIntent(message);
  if (intent.type === 'help') return helpResponse();

  const symbols = extractSymbols(message);
  if (!symbols.length) {
    return { type: 'clarification', title: 'نماد مشخص نیست', answer: 'لطفاً نام یا نماد سهم را وارد کنید؛ مثال: «قیمت فملی چیست؟»' };
  }

  const result = await comparisonService.compareStocksDeterministic({ symbols });
  const rows = Array.isArray(result?.rows) ? result.rows : [];
  if (!rows.length) {
    return { type: 'noData', title: 'داده در دسترس نیست', answer: 'برای نماد واردشده داده معتبر از منابع متصل در دسترس نیست.', failed: result?.failed || [] };
  }

  const enriched = rows.map(row => ({
    ...row,
    monthlyReturnPercent: historyReturn(row),
    qualityText: qualityText(row)
  }));

  if (intent.type === 'compare' || rows.length > 1) {
    return {
      type: 'comparison',
      title: 'مقایسه داده‌محور',
      answer: rows.map(row => describe(row, intent)).join(' '),
      rows: enriched,
      metrics: result.metrics || {},
      failed: result.failed || [],
      actions: [{ label: 'باز کردن مقایسه', tab: 'comparison' }, { label: 'رادار بازار', tab: 'marketRadar' }]
    };
  }

  return {
    type: intent.type,
    title: `اطلاعات ${rows[0].symbol}`,
    answer: describe(rows[0], intent),
    row: enriched[0],
    actions: [
      { label: 'پروفایل سهم', tab: 'profile', symbol: rows[0].symbol },
      { label: 'Smart Score', tab: 'smartScore', symbol: rows[0].symbol },
      { label: 'مقایسه', tab: 'comparison', symbol: rows[0].symbol }
    ]
  };
}

module.exports = { answer };
