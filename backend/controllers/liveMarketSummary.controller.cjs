'use strict';

const brsService = require('../services/brs.service.cjs');
const breadthService = require('../services/marketBreadth.service.cjs');

function n(v) {
  if (v === null || v === undefined || v === '') return null;
  const x = Number(String(v).replace(/,/g, '').replace(/٪/g, '').trim());
  return Number.isFinite(x) ? x : null;
}

function fa(v) {
  return v === null || v === undefined || !Number.isFinite(Number(v)) ? 'نامشخص' : Number(v).toLocaleString('fa-IR', { maximumFractionDigits: 2 });
}

function pct(v) {
  const x = n(v);
  return x === null ? 'نامشخص' : `${x >= 0 ? '+' : ''}${x.toLocaleString('fa-IR', { maximumFractionDigits: 2 })}%`;
}

function direction(v) {
  const x = n(v);
  return x === null ? 'نامشخص' : x > 0 ? 'مثبت' : x < 0 ? 'منفی' : 'خنثی';
}

function signedPercent(current, change) {
  const c = n(current);
  const d = n(change);
  if (c === null || d === null || c - d === 0) return null;
  return (d / (c - d)) * 100;
}

function listSymbols(items) {
  return Array.isArray(items) ? items.slice(0, 5).map(x => x?.symbol || x?.l18 || x?.ticker || x?.name).filter(Boolean).join('، ') : '';
}

function breadthDirection(b) {
  const p = n(b?.positive ?? b?.positiveStocks);
  const m = n(b?.negative ?? b?.negativeStocks);
  if (p === null || m === null) return 'نامشخص';
  return p > m ? 'مثبت' : m > p ? 'منفی' : 'خنثی';
}

function makeText({ market, breadth }) {
  const overall = n(market.index ?? market.overallIndex ?? market.value);
  const overallChange = n(market.index_change ?? market.indexChange ?? market.overallChange ?? market.changeValue ?? market.change);
  const equal = n(market.indexEqualWeight ?? market.index_equalWeight ?? market.equalIndex ?? market.equalWeightedValue);
  const equalChange = n(market.indexEqualWeightChange ?? market.index_equalWeight_change ?? market.equalChange ?? market.equalWeightedChangeValue);
  const overallPct = signedPercent(overall, overallChange);
  const equalPct = signedPercent(equal, equalChange);
  const bd = breadthDirection(breadth);
  const positive = n(breadth?.positive ?? breadth?.positiveStocks);
  const negative = n(breadth?.negative ?? breadth?.negativeStocks);
  const neutral = n(breadth?.neutral ?? breadth?.neutralStocks);
  const money = breadth?.moneyFlow || {};
  const moneyNet = n(money.netValue ?? money.net ?? breadth?.netMoneyFlow);
  const sectors = breadth?.sectors || {};
  const sectorLeaders = Array.isArray(sectors.leaders) ? sectors.leaders.slice(0, 3).map(x => x?.name || x?.sector).filter(Boolean).join('، ') : 'داده صنعت در دسترس نیست';
  const sectorLaggards = Array.isArray(sectors.laggards) ? sectors.laggards.slice(0, 3).map(x => x?.name || x?.sector).filter(Boolean).join('، ') : 'داده صنعت در دسترس نیست';
  const gainers = listSymbols(breadth?.topGainers || market.topGainers);
  const losers = listSymbols(breadth?.topLosers || market.topLosers);
  const status = market.isMarketOpen === true || String(market.marketState || '').includes('باز') ? 'باز' : 'بسته';
  const quality = breadth?.available === false ? 'متوسط رو به پایین؛ داده عرض بازار در دسترس نیست' : 'مناسب برای تحلیل جاری بر اساس Snapshot زنده BRS و عرض بازار جاری';
  const currentBias = overallChange == null || equalChange == null ? 'خنثی' : overallChange < 0 && equalChange < 0 ? 'نزولی' : overallChange > 0 && equalChange > 0 ? 'صعودی' : 'ترکیبی';
  const scenario = currentBias === 'نزولی' ? 'سناریوی پایه: ادامه احتیاط و فشار اصلاحی تا زمان بهبود هم‌زمان شاخص‌ها و عرض بازار؛ سناریوی صعودی فقط با توقف افت و بهبود مشارکت بازار تقویت می‌شود.' : currentBias === 'صعودی' ? 'سناریوی پایه: تداوم حرکت صعودی مشروط به حفظ عرض مثبت و پایداری شاخص هم‌وزن.' : 'سناریوی پایه: بازار نیازمند تأیید جهت در داده‌های جلسه جاری است.';
  const fiveDay = 'برای جلوگیری از اختلاط Snapshot تاریخی با داده زنده، مومنتوم چندروزه از این endpoint حدس زده نمی‌شود.';

  const totalTrades = n(market.totalTrades ?? market.tradeCount ?? market.tno);
  const totalVolume = n(market.totalVolume ?? market.tradeVolume ?? market.tvol);
  const totalValue = n(market.totalValue ?? market.tradeValue ?? market.tval);
  const liquidityText = totalValue !== null || totalVolume !== null || totalTrades !== null
    ? `ارزش معاملات ${fa(totalValue)}، حجم ${fa(totalVolume)} و تعداد معاملات ${fa(totalTrades)} است.`
    : 'ارزش، حجم یا تعداد معاملات از Snapshot جاری قابل تعیین کامل نیست.';

  return [
    `۱) وضعیت کلی بازار: بازار در وضعیت «${status}» است و جهت فعلی بر اساس تغییر شاخص کل ${direction(overallChange)} و شاخص هم‌وزن ${direction(equalChange)} است؛ سوگیری عملیاتی فعلی «${currentBias}» است.`,
    `۲) شاخص‌ها: شاخص کل ${fa(overall)} واحد با تغییر ${pct(overallPct)} (${fa(overallChange)} واحد) و شاخص هم‌وزن ${fa(equal)} واحد با تغییر ${pct(equalPct)} (${fa(equalChange)} واحد) است.`,
    `۳) پهنای بازار: ${fa(positive)} نماد مثبت، ${fa(negative)} نماد منفی و ${fa(neutral)} نماد خنثی؛ جهت عرض بازار «${bd}» است.`,
    `۴) نقدشوندگی و معاملات: ${liquidityText}`,
    `۵) جریان پول حقیقی: ${moneyNet === null ? 'داده خالص جریان پول حقیقی در Snapshot جاری قابل تعیین نیست.' : moneyNet < 0 ? `خروج خالص پول حقیقی به میزان ${fa(moneyNet)} مشاهده می‌شود و هشدار نزولی است.` : moneyNet > 0 ? `ورود خالص پول حقیقی به میزان ${fa(moneyNet)} مشاهده می‌شود و عامل حمایتی است.` : 'جریان خالص پول حقیقی متعادل است.'}`,
    `۶) چرخش صنایع: قوی‌ترین گروه‌های قابل شناسایی: ${sectorLeaders}؛ ضعیف‌ترین گروه‌ها: ${sectorLaggards}.`,
    `۷) مومنتوم: جهت جلسه جاری ${direction(overallChange)} است. ${fiveDay}`,
    `۸) ریسک و نوسان: با توجه به جهت هم‌زمان شاخص‌ها، ریسک جاری ${currentBias === 'نزولی' ? 'متوسط رو به زیاد' : 'متوسط'} ارزیابی می‌شود؛ شاخص عددی نوسان از Snapshot جاری حدس زده نمی‌شود.`,
    `۹) واگرایی‌ها و هشدارها: شاخص کل ${direction(overallChange)} و شاخص هم‌وزن ${direction(equalChange)} هستند و عرض بازار ${bd} است. ${direction(overallChange) === 'منفی' && direction(equalChange) === 'منفی' && bd === 'منفی' ? 'بنابراین فشار فروش در سطح شاخص‌ها و بدنه بازار هم‌جهت است.' : direction(overallChange) === 'مثبت' && direction(equalChange) === 'مثبت' && bd === 'مثبت' ? 'بنابراین حرکت شاخص‌ها از مشارکت گسترده بازار پشتیبانی می‌شود.' : 'در صورت اختلاف جهت، باید آن را به‌عنوان واگرایی بین شاخص و بدنه بازار در نظر گرفت.'}`,
    `۱۰) نمادهای شاخص حرکت: برترین رشدهای جاری: ${gainers || 'نامشخص'}؛ برترین افت‌های جاری: ${losers || 'نامشخص'}.`,
    `۱۱) سناریوهای پیش‌رو: ${scenario}`,
    `۱۲) نتیجه عملیاتی: سوگیری ${currentBias}؛ در وضعیت فعلی ${currentBias === 'نزولی' ? 'احتیاط، کاهش ریسک و پرهیز از تصمیم عجولانه برای ورود' : currentBias === 'صعودی' ? 'پیگیری روند با حد ضرر و مدیریت ریسک' : 'انتظار برای تأیید جهت بازار'} توصیه می‌شود.`,
    `۱۳) شروط تأیید/ابطال: ${currentBias === 'نزولی' ? 'بهبود عرض بازار، توقف افت هر دو شاخص و بازگشت جریان پول حقیقی.' : currentBias === 'صعودی' ? 'حفظ عرض مثبت، پایداری شاخص هم‌وزن و تداوم ورود نقدینگی.' : 'تأیید جهت هر دو شاخص و عرض بازار در ادامه جلسه.'}`,
    `۱۴) کیفیت داده و محدودیت تحلیل: ${quality}. این گزارش برای «آخرین وضعیت» مستقیماً از Snapshot زنده BRS استفاده می‌کند و داده تاریخی را با داده جاری جایگزین نمی‌کند.`
  ].join('\n\n');
}

exports.getLatestMarketSummary = async function getLatestMarketSummary(req, res) {
  try {
    const [marketResult, breadthResult] = await Promise.all([
      brsService.getMarketIndex(),
      breadthService.getMarketBreadth().catch(error => ({ available: false, reason: error.message }))
    ]);

    const marketRoot = marketResult && typeof marketResult === 'object' ? marketResult : {};
    const marketData = marketRoot.data && typeof marketRoot.data === 'object' ? marketRoot.data : {};
    const marketPayload = marketRoot.payload && typeof marketRoot.payload === 'object' ? marketRoot.payload : {};
    const market = Object.assign({}, marketRoot, marketPayload, marketData, marketData.data && typeof marketData.data === 'object' ? marketData.data : {});
    const breadth = breadthResult || { available: false };
    const content = makeText({ market, breadth });
    const overall = n(market.index ?? market.overallIndex ?? market.value);
    const overallChange = n(market.index_change ?? market.indexChange ?? market.overallChange ?? market.changeValue ?? market.change);
    const equal = n(market.indexEqualWeight ?? market.index_equalWeight ?? market.equalIndex ?? market.equalWeightedValue);
    const equalChange = n(market.indexEqualWeightChange ?? market.index_equalWeight_change ?? market.equalChange ?? market.equalWeightedChangeValue);
    const overallPct = signedPercent(overall, overallChange);
    const equalPct = signedPercent(equal, equalChange);
    const now = new Date();
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', calendar: 'gregory' }).format(now);
    const marketDateJalali = market.date || null;
    const totalTrades = n(market.totalTrades ?? market.tradeCount ?? market.tno);
    const totalVolume = n(market.totalVolume ?? market.tradeVolume ?? market.tvol);
    const totalValue = n(market.totalValue ?? market.tradeValue ?? market.tval);

    return res.status(200).json({
      success: true,
      data: {
        id: 0,
        date,
        summaryDate: date,
        marketDateJalali,
        createdAt: now.toISOString(),
        overallIndex: overall,
        overallChange,
        overallChangePercent: overallPct,
        equalIndex: equal,
        equalChange,
        equalChangePercent: equalPct,
        displayOverallIndex: fa(overall),
        displayOverallChange: fa(overallChange),
        displayEqualIndex: fa(equal),
        displayEqualChange: fa(equalChange),
        marketStatus: market.isMarketOpen === true || String(market.marketState || '').includes('باز') ? 'open' : 'closed',
        totalTrades: totalTrades === null ? '' : String(totalTrades),
        totalVolume: totalVolume === null ? '' : String(totalVolume),
        totalValue: totalValue === null ? '' : String(totalValue),
        positiveStocks: breadth.positive ?? breadth.positiveStocks ?? null,
        negativeStocks: breadth.negative ?? breadth.negativeStocks ?? null,
        neutralStocks: breadth.neutral ?? breadth.neutralStocks ?? null,
        topGainers: breadth.topGainers || market.topGainers || [],
        topLosers: breadth.topLosers || market.topLosers || [],
        topVolumes: breadth.topVolumes || market.topVolumes || [],
        symbolsCoverage: breadth.coveragePercent ?? breadth.symbolsCoverage ?? null,
        stale: false,
        staleHours: 0,
        staleReason: null,
        content,
        summary: content,
        fallback: false,
        aiPending: false,
        source: 'brs-live-snapshot',
        diagnostics: {
          source: 'brs-live-snapshot',
          marketTimestamp: market.lastUpdate || market.timestamp || null,
          marketOpen: market.isMarketOpen === true,
          breadthAvailable: breadth.available !== false
        }
      },
      meta: {
        generated: true,
        sourceType: 'live_brs_snapshot',
        cached: false,
        reason: 'LATEST_BUILT_FROM_LIVE_BRS',
        diagnostics: {
          marketTimestamp: market.lastUpdate || market.timestamp || null,
          breadthAvailable: breadth.available !== false
        }
      }
    });
  } catch (error) {
    return res.status(503).json({
      success: false,
      error: 'LIVE_MARKET_DATA_UNAVAILABLE',
      message: 'داده زنده بازار در دسترس نیست؛ برای جلوگیری از نمایش داده قدیمی، خلاصه بازار تولید نشد.',
      details: process.env.NODE_ENV === 'production' ? undefined : error.message
    });
  }
};
