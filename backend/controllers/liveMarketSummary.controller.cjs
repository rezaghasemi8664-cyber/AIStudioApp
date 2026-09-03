'use strict';

const brsService = require('../services/brs.service.cjs');
const breadthService = require('../services/marketBreadth.service.cjs');
const marketHistoryService = require('../services/marketHistory.service.cjs');

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

function snapshotValue(snapshot, ...keys) {
  for (const key of keys) {
    const value = snapshot?.[key];
    if (value !== undefined && value !== null && value !== '') return value;
    const nested = snapshot?.data;
    if (nested && typeof nested === 'object' && nested[key] !== undefined && nested[key] !== null && nested[key] !== '') return nested[key];
  }
  return null;
}

function snapshotTradingDate(snapshot) {
  const raw = snapshotValue(snapshot, 'date', 'summaryDate', 'marketDateJalali');
  if (!raw) return null;
  const text = String(raw).trim();
  if (/^\d{4}[-/]\d{2}[-/]\d{2}$/.test(text)) return text.replace(/\//g, '-');
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', calendar: 'gregory' }).format(parsed);
}

function snapshotTime(snapshot) {
  const raw = snapshotValue(snapshot, 'time', 'lastUpdate', 'timestamp', 'createdAt', '_createdAt');
  if (!raw) return 0;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function snapshotIndex(snapshot, equal = false) {
  return n(snapshotValue(snapshot, ...(equal ? ['indexEqualWeight', 'index_equalWeight', 'equalIndex', 'equalWeightedValue'] : ['index', 'overallIndex', 'value'])));
}

function buildTradingSessions(snapshots, liveMarket) {
  const byDate = new Map();
  for (const snapshot of Array.isArray(snapshots) ? snapshots : []) {
    const date = snapshotTradingDate(snapshot);
    if (!date) continue;
    const current = byDate.get(date);
    if (!current || snapshotTime(snapshot) >= snapshotTime(current)) byDate.set(date, snapshot);
  }

  const liveDate = snapshotTradingDate(liveMarket) || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', calendar: 'gregory' }).format(new Date());
  const liveSnapshot = { ...liveMarket, date: liveDate, _live: true };
  const storedToday = byDate.get(liveDate);
  if (!storedToday || snapshotTime(liveSnapshot) >= snapshotTime(storedToday)) byDate.set(liveDate, liveSnapshot);

  return Array.from(byDate.entries())
    .map(([date, snapshot]) => ({ date, snapshot }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

function calculateMomentum(sessions) {
  const valid = Array.isArray(sessions) ? sessions.filter(x => snapshotIndex(x.snapshot) !== null || snapshotIndex(x.snapshot, true) !== null) : [];
  if (valid.length < 2) {
    return { available: false, sessions: valid.length, oneDay: null, threeDay: null, fiveDay: null, bias: 'خنثی' };
  }

  const current = valid[0].snapshot;
  const currentOverall = snapshotIndex(current);
  const currentEqual = snapshotIndex(current, true);

  const compare = (offset) => {
    const reference = valid[offset]?.snapshot;
    if (!reference) return null;
    const overallBase = snapshotIndex(reference);
    const equalBase = snapshotIndex(reference, true);
    const overall = currentOverall !== null && overallBase !== null && overallBase !== 0 ? ((currentOverall - overallBase) / overallBase) * 100 : null;
    const equal = currentEqual !== null && equalBase !== null && equalBase !== 0 ? ((currentEqual - equalBase) / equalBase) * 100 : null;
    const directions = [overall, equal].filter(x => x !== null).map(x => x > 0 ? 1 : x < 0 ? -1 : 0);
    const bias = directions.length === 0 ? 'خنثی' : directions.every(x => x > 0) ? 'صعودی' : directions.every(x => x < 0) ? 'نزولی' : 'ترکیبی';
    return { date: valid[offset].date, overall, equal, bias };
  };

  return {
    available: true,
    sessions: valid.length,
    oneDay: compare(1),
    threeDay: valid.length > 3 ? compare(3) : null,
    fiveDay: valid.length > 5 ? compare(5) : null,
    bias: compare(Math.min(5, valid.length - 1))?.bias || compare(1)?.bias || 'خنثی'
  };
}

function momentumText(momentum) {
  if (!momentum?.available) return `بر اساس ${fa(momentum?.sessions || 0)} جلسه معتبر، سابقه کافی برای سنجش مومنتوم چندروزه در دسترس نیست.`;
  const parts = [];
  if (momentum.oneDay) parts.push(`یک‌جلسه‌ای: شاخص کل ${pct(momentum.oneDay.overall)} و هم‌وزن ${pct(momentum.oneDay.equal)}`);
  if (momentum.threeDay) parts.push(`سه‌جلسه‌ای: شاخص کل ${pct(momentum.threeDay.overall)} و هم‌وزن ${pct(momentum.threeDay.equal)}`);
  if (momentum.fiveDay) parts.push(`پنج‌جلسه‌ای: شاخص کل ${pct(momentum.fiveDay.overall)} و هم‌وزن ${pct(momentum.fiveDay.equal)}`);
  return `${parts.join('؛ ')}. جمع‌بندی مومنتوم: «${momentum.bias}».`;
}

function makeText({ market, breadth, momentum }) {
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
  const quality = breadth?.available === false ? 'متوسط رو به پایین؛ داده عرض بازار در دسترس نیست' : 'مناسب؛ بر پایه داده زنده بازار و سابقه معاملات ثبت‌شده';
  const currentBias = overallChange == null || equalChange == null ? 'خنثی' : overallChange < 0 && equalChange < 0 ? 'نزولی' : overallChange > 0 && equalChange > 0 ? 'صعودی' : 'ترکیبی';
  const scenario = currentBias === 'نزولی' ? 'سناریوی پایه: ادامه احتیاط و فشار اصلاحی تا زمان بهبود هم‌زمان شاخص‌ها و عرض بازار؛ سناریوی صعودی فقط با توقف افت و بهبود مشارکت بازار تقویت می‌شود.' : currentBias === 'صعودی' ? 'سناریوی پایه: تداوم حرکت صعودی مشروط به حفظ عرض مثبت و پایداری شاخص هم‌وزن.' : 'سناریوی پایه: بازار نیازمند تأیید جهت در داده‌های جلسات بعدی است.';

  const totalTrades = n(market.totalTrades ?? market.tradeCount ?? market.tno);
  const totalVolume = n(market.totalVolume ?? market.tradeVolume ?? market.tvol);
  const totalValue = n(market.totalValue ?? market.tradeValue ?? market.tval);
  const liquidityText = totalValue !== null || totalVolume !== null || totalTrades !== null
    ? `ارزش معاملات ${fa(totalValue)}، حجم ${fa(totalVolume)} و تعداد معاملات ${fa(totalTrades)} است.`
    : 'ارزش، حجم یا تعداد معاملات از داده جاری قابل تعیین کامل نیست.';

  return [
    `۱) وضعیت کلی بازار: بازار در وضعیت «${status}» است و جهت فعلی بر اساس تغییر شاخص کل ${direction(overallChange)} و شاخص هم‌وزن ${direction(equalChange)} است؛ سوگیری عملیاتی فعلی «${currentBias}» است.`,
    `۲) شاخص‌ها: شاخص کل ${fa(overall)} واحد با تغییر ${pct(overallPct)} (${fa(overallChange)} واحد) و شاخص هم‌وزن ${fa(equal)} واحد با تغییر ${pct(equalPct)} (${fa(equalChange)} واحد) است.`,
    `۳) پهنای بازار: ${fa(positive)} نماد مثبت، ${fa(negative)} نماد منفی و ${fa(neutral)} نماد خنثی؛ جهت عرض بازار «${bd}» است.`,
    `۴) نقدشوندگی و معاملات: ${liquidityText}`,
    `۵) جریان پول حقیقی: ${moneyNet === null ? 'داده خالص جریان پول حقیقی در وضعیت جاری قابل تعیین نیست.' : moneyNet < 0 ? `خروج خالص پول حقیقی به میزان ${fa(moneyNet)} مشاهده می‌شود و هشدار نزولی است.` : moneyNet > 0 ? `ورود خالص پول حقیقی به میزان ${fa(moneyNet)} مشاهده می‌شود و عامل حمایتی است.` : 'جریان خالص پول حقیقی متعادل است.'}`,
    `۶) چرخش صنایع: قوی‌ترین گروه‌های قابل شناسایی: ${sectorLeaders}؛ ضعیف‌ترین گروه‌ها: ${sectorLaggards}.`,
    `۷) مومنتوم: ${momentumText(momentum)}`,
    `۸) ریسک و نوسان: با توجه به جهت شاخص‌ها، عرض بازار و مومنتوم چندجلسه‌ای، ریسک جاری ${currentBias === 'نزولی' || momentum?.bias === 'نزولی' ? 'متوسط رو به زیاد' : currentBias === 'صعودی' && momentum?.bias === 'صعودی' ? 'متوسط' : 'متوسط رو به زیاد'} ارزیابی می‌شود. در صورت تداوم افت هم‌زمان شاخص‌ها و عرض منفی، ریسک افزایش می‌یابد.`,
    `۹) واگرایی‌ها و هشدارها: شاخص کل ${direction(overallChange)} و شاخص هم‌وزن ${direction(equalChange)} هستند و عرض بازار ${bd} است. ${direction(overallChange) === 'منفی' && direction(equalChange) === 'منفی' && bd === 'منفی' ? 'فشار فروش در سطح شاخص‌ها و بدنه بازار هم‌جهت است و هشدار نزولی تقویت می‌شود.' : direction(overallChange) === 'مثبت' && direction(equalChange) === 'مثبت' && bd === 'مثبت' ? 'حرکت شاخص‌ها از مشارکت گسترده بازار پشتیبانی می‌شود.' : 'اختلاف جهت شاخص‌ها و بدنه بازار می‌تواند نشانه واگرایی باشد و نیازمند تأیید در جلسات بعدی است.'}`,
    `۱۰) نمادهای شاخص حرکت: برترین رشدهای جاری: ${gainers || 'نامشخص'}؛ برترین افت‌های جاری: ${losers || 'نامشخص'}.`,
    `۱۱) سناریوهای پیش‌رو: ${scenario}`,
    `۱۲) نتیجه عملیاتی: سوگیری ${currentBias}؛ در وضعیت فعلی ${currentBias === 'نزولی' ? 'احتیاط، کاهش ریسک و پرهیز از ورود عجولانه' : currentBias === 'صعودی' ? 'پیگیری روند با حد ضرر و مدیریت ریسک' : 'انتظار برای تأیید جهت بازار'} توصیه می‌شود.`,
    `۱۳) شروط تأیید/ابطال: ${currentBias === 'نزولی' ? 'بهبود عرض بازار، توقف افت هر دو شاخص و بازگشت جریان پول حقیقی.' : currentBias === 'صعودی' ? 'حفظ عرض مثبت، پایداری شاخص هم‌وزن و تداوم ورود نقدینگی.' : 'تأیید هم‌زمان جهت شاخص‌ها، عرض بازار و مومنتوم چندجلسه‌ای.'}`,
    `۱۴) جمع‌بندی نهایی بازار: در حال حاضر سوگیری بازار «${currentBias}» است و ${momentum?.bias && momentum.bias !== 'خنثی' ? `مومنتوم چندجلسه‌ای نیز «${momentum.bias}» را نشان می‌دهد` : 'مومنتوم چندجلسه‌ای هنوز نیازمند تأیید بیشتر است'}؛ بنابراین تصمیم‌گیری باید بر پایه هم‌جهتی شاخص‌ها، عرض بازار، جریان نقدینگی و تأیید جلسات بعدی انجام شود.`
  ].join('\n\n');
}

exports.getLatestMarketSummary = async function getLatestMarketSummary(req, res) {
  try {
    const [marketResult, breadthResult, historyResult] = await Promise.all([
      brsService.getMarketIndex(),
      breadthService.getMarketBreadth().catch(error => ({ available: false, reason: error.message })),
      marketHistoryService.getMarketHistory(3000).catch(error => [])
    ]);

    const marketRoot = marketResult && typeof marketResult === 'object' ? marketResult : {};
    const marketData = marketRoot.data && typeof marketRoot.data === 'object' ? marketRoot.data : {};
    const marketPayload = marketRoot.payload && typeof marketRoot.payload === 'object' ? marketRoot.payload : {};
    const market = Object.assign({}, marketRoot, marketPayload, marketData, marketData.data && typeof marketData.data === 'object' ? marketData.data : {});
    const breadth = breadthResult || { available: false };
    const sessions = buildTradingSessions(historyResult, market);
    const momentum = calculateMomentum(sessions);
    const content = makeText({ market, breadth, momentum });
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
          breadthAvailable: breadth.available !== false,
          momentumSessions: momentum.sessions,
          momentumAvailable: momentum.available
        }
      },
      meta: {
        generated: true,
        sourceType: 'live_brs_snapshot',
        cached: false,
        reason: 'LATEST_BUILT_FROM_LIVE_BRS',
        diagnostics: {
          marketTimestamp: market.lastUpdate || market.timestamp || null,
          breadthAvailable: breadth.available !== false,
          momentumSessions: momentum.sessions
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