'use strict';

const comparisonService = require('./deterministic-stock-comparison.service.cjs');

function fa(value, digits = 0) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return 'نامشخص';
  return Number(value).toLocaleString('fa-IR', { maximumFractionDigits: digits });
}

function normalizeIntent(message) {
  const text = String(message || '').trim().toLowerCase();
  if (!text) return { type: 'help' };
  if (/راهنما|چه کار|دستورات|کمک/.test(text)) return { type: 'help' };
  if (/p\/e|pe|پی بر ای|پی بر ئی/.test(text)) return { type: 'pe' };
  if (/قیمت|ارزش|آخرین|پایانی/.test(text)) return { type: 'price' };
  if (/تغییر|بازده|درصد/.test(text)) return { type: 'change' };
  if (/امتیاز|اسکور|score/.test(text)) return { type: 'score' };
  if (/ریسک/.test(text)) return { type: 'risk' };
  if (/جریان پول|پول حقیقی|پول حقوقی|ورود پول|خروج پول/.test(text)) return { type: 'moneyFlow' };
  if (/روند|ترند/.test(text)) return { type: 'trend' };
  if (/مقایسه/.test(text)) return { type: 'compare' };
  return { type: 'overview' };
}

function extractSymbols(message) {
  const raw = String(message || '');
  const candidates = raw.match(/[آ-یA-Za-z][آ-یA-Za-z0-9۰-۹_-]{1,14}/g) || [];
  const stop = new Set(['قیمت','سهم','سهام','امتیاز','ریسک','روند','مقایسه','جریان','پول','حقیقی','حقوقی','بازده','درصد','امروز','راهنما','تحلیل','نماد','پی','بر','ای','آخرین','پایانی','ارزش','من','را','از','برای','چیست','چقدر','است']);
  return [...new Set(candidates.map(s => s.trim()).filter(s => !stop.has(s.toLowerCase())))].slice(0, 5);
}

function helpResponse() {
  return {
    type: 'help',
    title: 'راهنمای دستیار رونیا',
    answer: 'من یک دستیار قطعی و داده‌محور هستم. می‌توانم قیمت فعلی یا پایانی، تغییر روزانه، P/E، امتیاز، ریسک، روند و جریان پول یک نماد را از داده‌های واقعی موجود گزارش کنم. برای مقایسه، دو تا پنج نماد را در یک پیام بنویسید؛ مثال: «فملی و فولاد را مقایسه کن».',
    actions: [
      { label: 'پروفایل سهم', tab: 'profile' },
      { label: 'مقایسه', tab: 'comparison' },
      { label: 'Smart Score', tab: 'smartScore' },
      { label: 'رادار بازار', tab: 'marketRadar' }
    ]
  };
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
  if (!rows.length) return { type: 'noData', title: 'داده در دسترس نیست', answer: 'برای نماد واردشده داده معتبر از منابع متصل در دسترس نیست.', failed: result?.failed || [] };

  const describe = row => {
    if (intent.type === 'price') return `${row.symbol}: قیمت فعلی ${fa(row.currentPrice)}، قیمت پایانی ${fa(row.closingPrice)}.`;
    if (intent.type === 'change') return `${row.symbol}: تغییر روزانه ${fa(row.priceChangePercent, 2)}٪.`;
    if (intent.type === 'score') return `${row.symbol}: امتیاز تکنیکال ${fa(row.technicalScore)}، بنیادی ${fa(row.fundamentalScore)}، کل ${fa(row.totalScore)}.`;
    if (intent.type === 'risk') return `${row.symbol}: سطح ریسک ثبت‌شده «${row.riskLevel || 'نامشخص'}».`;
    if (intent.type === 'moneyFlow') return `${row.symbol}: جریان پول خالص ${fa(row.netMoneyFlow)}؛ حقیقی ${fa(row.realMoneyFlow)}؛ حقوقی ${fa(row.legalMoneyFlow)}.`;
    if (intent.type === 'trend') return `${row.symbol}: روند «${row.trend || 'نامشخص'}» و تغییر روزانه ${fa(row.priceChangePercent, 2)}٪.`;
    if (intent.type === 'pe') return `${row.symbol}: P/E برابر ${fa(row.pe, 2)} و EPS برابر ${fa(row.eps, 2)}.`;
    return `${row.symbol}: قیمت پایانی ${fa(row.closingPrice)}، تغییر روزانه ${fa(row.priceChangePercent, 2)}٪، امتیاز کل ${fa(row.totalScore)}، روند «${row.trend || 'نامشخص'}» و ریسک «${row.riskLevel || 'نامشخص'}».`;
  };

  if (intent.type === 'compare' || rows.length > 1) {
    return {
      type: 'comparison',
      title: 'مقایسه داده‌محور',
      answer: rows.map(describe).join(' '),
      rows,
      metrics: result.metrics || {},
      failed: result.failed || []
    };
  }

  return {
    type: intent.type,
    title: `اطلاعات ${rows[0].symbol}`,
    answer: describe(rows[0]),
    row: rows[0],
    actions: [
      { label: 'پروفایل سهم', tab: 'profile', symbol: rows[0].symbol },
      { label: 'Smart Score', tab: 'smartScore', symbol: rows[0].symbol }
    ]
  };
}

module.exports = { answer };
