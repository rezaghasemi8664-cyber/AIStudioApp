'use strict';

const marketSummaryService = require('../services/marketSummary.service.cjs');
const marketIntelligenceService = require('../services/marketIntelligence.service.cjs');
const marketBreadthService = require('../services/marketBreadth.service.cjs');
let brsService = null;
try { brsService = require('../services/brs.service.cjs'); } catch (e) { console.warn('[MarketSummaryController][BRS]', e.message); }

function sanitizeBigIntDeep(input) {
  if (input === null || input === undefined) return input;
  if (typeof input === 'bigint') return input.toString();
  if (Array.isArray(input)) return input.map(sanitizeBigIntDeep);
  if (typeof input === 'object') return Object.fromEntries(Object.entries(input).map(([k, v]) => [k, sanitizeBigIntDeep(v)]));
  return input;
}
const sendResponse = (res, code, payload) => { if (res.headersSent) return; return res.status(code).json(sanitizeBigIntDeep(payload)); };
const toDateInputOrNull = (v) => { if (v === undefined || v === null) return null; const s = String(v).trim(); return s ? s : null; };
const fa = (v) => v === null || v === undefined ? 'نامشخص' : Number(v).toLocaleString('fa-IR', { maximumFractionDigits: 2 });
const signPct = (v) => v === null || v === undefined ? 'نامشخص' : `${v >= 0 ? '+' : ''}${Number(v).toLocaleString('fa-IR', { maximumFractionDigits: 2 })}%`;
const level = (v) => ({ low:'کم', medium:'متوسط', high:'زیاد' })[v] || 'نامشخص';

function directionFa(value) {
  const n = finiteOrNull(value);
  if (n === null) return 'نامشخص';
  if (n > 0) return 'مثبت';
  if (n < 0) return 'منفی';
  return 'خنثی';
}

function buildDeterministicDivergenceText(indexes, breadth, liquidity, flow) {
  const overallDirection = directionFa(indexes.overall?.change);
  const equalDirection = directionFa(indexes.equalWeight?.change);
  const breadthDirection = breadth?.positive != null && breadth?.negative != null
    ? breadth.positive > breadth.negative ? 'مثبت' : breadth.negative > breadth.positive ? 'منفی' : 'خنثی'
    : 'نامشخص';

  const parts = [];
  if (overallDirection !== 'نامشخص' || equalDirection !== 'نامشخص') {
    parts.push(`شاخص کل ${overallDirection} و شاخص هم‌وزن ${equalDirection} هستند`);
  }
  if (breadthDirection !== 'نامشخص') {
    parts.push(`عرض بازار ${breadthDirection} است`);
  }

  let text = parts.length
    ? `${parts.join(' و ')}.`
    : 'جهت شاخص‌ها یا عرض بازار از داده‌های موجود قابل تعیین نیست.';

  if (overallDirection === 'منفی' && equalDirection === 'منفی' && breadthDirection === 'منفی') {
    text += ' بنابراین فشار فروش در سطح شاخص‌ها و بدنه بازار هم‌جهت است.';
  } else if (overallDirection === 'مثبت' && equalDirection === 'مثبت' && breadthDirection === 'مثبت') {
    text += ' بنابراین حرکت شاخص‌ها از مشارکت گسترده بازار پشتیبانی می‌شود.';
  } else if (overallDirection !== 'نامشخص' && breadthDirection !== 'نامشخص' && overallDirection !== breadthDirection) {
    text += ' این اختلاف جهت، واگرایی بین حرکت شاخص و مشارکت بدنه بازار را نشان می‌دهد.';
  }

  if (liquidity?.interpretation) text += ` ${liquidity.interpretation}`;
  if (flow?.net != null && Number(flow.net) < 0) text += ' خروج خالص پول حقیقی نیز یک هشدار نزولی است.';
  if (flow?.net != null && Number(flow.net) > 0) text += ' ورود خالص پول حقیقی یک عامل حمایتی برای بازار است.';
  return text;
}

function buildDeterministicScenarioText(indexes, breadth, flow) {
  const overall = finiteOrNull(indexes.overall?.change);
  const equal = finiteOrNull(indexes.equalWeight?.change);
  const positive = finiteOrNull(breadth?.positive);
  const negative = finiteOrNull(breadth?.negative);
  const net = finiteOrNull(flow?.net);

  if (overall !== null && overall < 0 && equal !== null && equal < 0 && positive !== null && negative !== null && negative > positive) {
    return 'سناریوی پایه: متوسط رو به نزولی — هر دو شاخص منفی‌اند و برتری نمادهای منفی نشان‌دهنده فشار فروش گسترده است. | سناریوی صعودی: ضعیف — بهبود عرض بازار، توقف افت شاخص‌ها و برگشت نقدینگی حقیقی لازم است. | سناریوی نزولی: زیاد — تداوم فشار فروش، ضعف عرض بازار و خروج نقدینگی می‌تواند اصلاح را تشدید کند.';
  }
  if (overall !== null && overall > 0 && equal !== null && equal > 0 && positive !== null && negative !== null && positive > negative) {
    return 'سناریوی پایه: متوسط رو به صعودی — هر دو شاخص مثبت‌اند و مشارکت گسترده نمادهای مثبت از حرکت حمایت می‌کند. | سناریوی صعودی: زیاد — حفظ عرض مثبت و ورود نقدینگی می‌تواند حرکت را تثبیت کند. | سناریوی نزولی: متوسط — افت عرض بازار یا خروج نقدینگی می‌تواند حرکت را تضعیف کند.';
  }
  const flowText = net === null ? '' : net < 0 ? ' خروج پول حقیقی ریسک نزولی را بیشتر می‌کند.' : net > 0 ? ' ورود پول حقیقی یک عامل حمایتی است.' : '';
  return `سناریوی پایه: متوسط — جهت بعدی بازار به تأیید هم‌زمان شاخص‌ها و عرض بازار وابسته است. | سناریوی صعودی: متوسط — بهبود مشارکت نمادها و نقدینگی می‌تواند احتمال تثبیت حرکت را افزایش دهد. | سناریوی نزولی: متوسط — ضعف عرض بازار یا خروج نقدینگی می‌تواند بازار را به سمت اصلاح سوق دهد.${flowText}`;
}

function intelligenceText(i) {
  if (!i) return null;
  const regime=i.regime||{}, breadth=i.breadth||{}, liq=i.liquidity||{}, flow=i.moneyFlow||{}, mom=i.momentum||{}, risk=i.risk||{}, sectors=i.sectors||{}, indexes=i.indexes||{};
  const action=i.action||{}, quality=i.dataQuality||{};
  const gainers=(i.leaders?.gainers||[]).slice(0,5).map(x=>x?.symbol).filter(Boolean).join('، ')||'نامشخص';
  const losers=(i.leaders?.losers||[]).slice(0,5).map(x=>x?.symbol).filter(Boolean).join('، ')||'نامشخص';
  const sectorLeaders=(sectors.leaders||[]).slice(0,3).map(x=>`${x.name}${x.changePercent==null?'':` (${signPct(x.changePercent)})`}`).join('، ')||'داده صنعت در دسترس نیست';
  const sectorLaggards=(sectors.laggards||[]).slice(0,3).map(x=>`${x.name}${x.changePercent==null?'':` (${signPct(x.changePercent)})`}`).join('، ')||'داده صنعت در دسترس نیست';
  const overallChange = finiteOrNull(indexes.overall?.change);
  const equalChange = finiteOrNull(indexes.equalWeight?.change);
  const overallDirection = directionFa(overallChange);
  const equalDirection = directionFa(equalChange);
  const breadthDirection = breadth?.positive != null && breadth?.negative != null
    ? breadth.positive > breadth.negative ? 'مثبت' : breadth.negative > breadth.positive ? 'منفی' : 'خنثی'
    : 'نامشخص';
  const divergenceText = buildDeterministicDivergenceText(indexes, breadth, liq, flow);
  const scenarioText = buildDeterministicScenarioText(indexes, breadth, flow);
  const confirmation = overallDirection === 'منفی'
    ? 'بهبود عرض بازار، کاهش فشار فروش، توقف افت هم‌زمان شاخص کل و هم‌وزن و بازگشت نقدینگی حقیقی.'
    : overallDirection === 'مثبت'
      ? 'حفظ عرض مثبت بازار، پایداری شاخص هم‌وزن و تداوم نقدینگی حقیقی.'
      : 'تأیید جهت شاخص‌ها و عرض بازار در جلسه بعد.';
  const operationalBias = overallDirection === 'منفی' && equalDirection === 'منفی' ? 'نزولی' : overallDirection === 'مثبت' && equalDirection === 'مثبت' ? 'صعودی' : 'خنثی';
  const operationalRisk = operationalBias === 'نزولی' ? 'متوسط رو به زیاد' : operationalBias === 'صعودی' ? 'متوسط' : (action.risk || 'متوسط');
  const suitableFor = operationalBias === 'نزولی' ? 'احتیاط، کاهش ریسک و انتظار برای تأیید برگشت' : operationalBias === 'صعودی' ? 'پیگیری روند با مدیریت ریسک' : (action.suitableFor || 'انتظار برای تأیید روند');

  return [
    `۱) رژیم بازار و امتیاز: بازار در وضعیت «${regime.label||'نامشخص'}» با امتیاز ${fa(regime.score)} از ۱۰۰ قرار دارد؛ جهت جلسه جاری بر اساس شاخص کل ${overallDirection} و شاخص هم‌وزن ${equalDirection} است.`,
    `۲) شاخص‌ها: شاخص کل ${fa(indexes.overall?.value)} واحد با تغییر ${signPct(indexes.overall?.changePercent)}؛ شاخص هم‌وزن ${fa(indexes.equalWeight?.value)} واحد با تغییر ${signPct(indexes.equalWeight?.changePercent)}.`,
    `۳) پهنای بازار: ${fa(breadth.positive)} نماد مثبت، ${fa(breadth.negative)} نماد منفی و ${fa(breadth.neutral)} نماد خنثی؛ ارزیابی breadth: ${breadth.interpretation||`عرض بازار ${breadthDirection} است.`}.`,
    `۴) نقدشوندگی و معاملات: ارزش معاملات ${fa(liq.value)}، حجم معاملات ${fa(liq.volume)} و تعداد معاملات ${fa(liq.trades)}؛ وضعیت نقدشوندگی ${liq.interpretation||'نامشخص'} است.`,
    `۵) جریان پول: ${flow.interpretation||'داده جریان پول حقیقی در دسترس نیست'}${flow.net==null?'':`؛ خالص جریان ${fa(flow.net)}`}.`,
    `۶) چرخش صنایع: قوی‌ترین صنایع/گروه‌های قابل شناسایی: ${sectorLeaders}. ضعیف‌ترین‌ها: ${sectorLaggards}.`,
    `۷) مومنتوم: وضعیت جلسه جاری ${overallDirection}؛ مومنتوم ۵ جلسه اخیر ${mom.state==='positive'?'مثبت':mom.state==='negative'?'منفی':mom.state==='neutral'?'خنثی':'نامشخص'} است؛ تغییر تجمعی ۵ جلسه اخیر ${signPct(mom.fiveDayChangePct)} و ${fa(mom.positiveDays5)} جلسه مثبت از ۵ جلسه اخیر ثبت شده است.`,
    `۸) ریسک و نوسان: سطح ریسک ${risk.label||'نامشخص'} و وضعیت نوسان ${level(risk.volatilityState)} است${risk.volatility==null?'':`؛ انحراف معیار تغییرات روزانه حدود ${fa(risk.volatility)}%`}.`,
    `۹) واگرایی‌ها و هشدارها: ${divergenceText}`,
    `۱۰) نمادهای شاخص حرکت: برترین رشدهای موجود: ${gainers}؛ برترین افت‌ها: ${losers}.`,
    `۱۱) سناریوهای پیش‌رو: ${scenarioText}`,
    `۱۲) نتیجه عملیاتی: سوگیری ${operationalBias} و ریسک ${operationalRisk}؛ مناسب برای ${suitableFor}.`,
    `۱۳) شروط تأیید/ابطال: ${confirmation}.`,
    `۱۴) کیفیت داده و محدودیت تحلیل: کیفیت داده ${quality.level==='high'?'بالا':quality.level==='medium'?'متوسط':'پایین'} است؛ ${fa(quality.availableFields)} مورد از ${fa(quality.expectedFields)} مؤلفه اصلی در دسترس بوده و پوشش نمادها ${quality.symbolsCoverage==null?'نامشخص':`${quality.symbolsCoverage}%`} است. این گزارش فقط بر داده‌های موجود تکیه دارد و در صورت نبود داده، عدد یا نتیجه‌ای حدس زده نشده است.`
  ].join('\n\n');
}

function finiteOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function extractLiveIndexPayload(result) {
  if (!result) return null;
  const candidate = result.data && typeof result.data === 'object' ? result.data : result;
  if (!candidate || typeof candidate !== 'object') return null;
  const raw = candidate.data && typeof candidate.data === 'object' ? candidate.data : candidate;
  const overall = finiteOrNull(raw.index ?? raw.value ?? raw.marketIndex);
  const overallChange = finiteOrNull(raw.indexChange ?? raw.index_change ?? raw.changeValue ?? raw.change);
  const equal = finiteOrNull(raw.indexEqualWeight ?? raw.index_equalWeight ?? raw.equalWeightedValue ?? raw.equalIndex);
  const equalChange = finiteOrNull(raw.indexEqualWeightChange ?? raw.index_equalWeight_change ?? raw.equalWeightedChangeValue ?? raw.equalChange);
  if (overall === null && equal === null) return null;
  const pct = overall !== null && overallChange !== null && overall - overallChange !== 0 ? (overallChange / (overall - overallChange)) * 100 : null;
  const equalPct = equal !== null && equalChange !== null && equal - equalChange !== 0 ? (equalChange / (equal - equalChange)) * 100 : null;
  return { overall, overallChange, equal, equalChange, pct, equalPct, source: 'brs-live' };
}

async function getLiveIndexes() {
  if (!brsService || typeof brsService.getMarketIndex !== 'function') return null;
  try { return extractLiveIndexPayload(await brsService.getMarketIndex()); }
  catch (error) { console.warn('[MarketSummaryController][LiveIndex]', error.message); return null; }
}

function applyLiveIndexes(intelligence, live) {
  if (!live) return intelligence;
  const indexes = intelligence.indexes || {};
  return {
    ...intelligence,
    indexes: {
      ...indexes,
      overall: {
        ...(indexes.overall || {}),
        value: live.overall,
        change: live.overallChange,
        changePercent: live.pct
      },
      equalWeight: {
        ...(indexes.equalWeight || {}),
        value: live.equal,
        change: live.equalChange,
        changePercent: live.equalPct
      },
      source: live.source
    },
    liveMarketIndex: live
  };
}

async function enrich(item, options = {}) {
  const useLiveMarketData = options.useLiveMarketData === true;
  if (!item?.id) return item;
  try {
    let intelligence=await marketIntelligenceService.buildMarketIntelligence(item.id,{historyLimit:20});
    if (!intelligence) return item;
    const liveIndexes = useLiveMarketData ? await getLiveIndexes() : null;
    if (useLiveMarketData) {
      intelligence = applyLiveIndexes(intelligence, liveIndexes);
    }
    try {
      const breadth = await marketBreadthService.getMarketBreadth();
      if (useLiveMarketData && breadth?.available) {
        intelligence.breadth = { ...intelligence.breadth, ...breadth };
        intelligence.leaders = {
          ...(intelligence.leaders || {}),
          gainers: (breadth.topGainers?.length ? breadth.topGainers : intelligence.leaders?.gainers || []).slice(0, 5),
          losers: (breadth.topLosers?.length ? breadth.topLosers : intelligence.leaders?.losers || []).slice(0, 5),
          volumes: (breadth.topVolumes?.length ? breadth.topVolumes : intelligence.leaders?.volumes || []).slice(0, 5)
        };
        intelligence.dataQuality = {
          ...(intelligence.dataQuality || {}),
          breadthAvailable: true,
          breadthClassifiedSymbols: breadth.classifiedTotal,
          breadthTotalSymbols: breadth.total,
          breadthUnknownSymbols: breadth.unknown,
          breadthCoveragePercent: breadth.coveragePercent
        };
        if (breadth.sectors?.available) intelligence.sectors = breadth.sectors;
        if (breadth.moneyFlow?.available) {
          intelligence.moneyFlow = { ...(intelligence.moneyFlow || {}), ...breadth.moneyFlow, net: breadth.moneyFlow.netValue, available: true,
            interpretation: breadth.moneyFlow.netValue > 0 ? 'ورود خالص پول حقیقی مشاهده شده است.' : breadth.moneyFlow.netValue < 0 ? 'خروج خالص پول حقیقی مشاهده شده است.' : 'جریان خالص پول حقیقی متعادل است.' };
        }
      } else if (useLiveMarketData) {
        intelligence.breadth = { ...(intelligence.breadth || {}), available: false, reason: breadth?.reason || 'BREADTH_UNAVAILABLE' };
        intelligence.dataQuality = { ...(intelligence.dataQuality || {}), breadthAvailable: false };
      }
    } catch (breadthError) {
      console.error('[MarketSummaryController][Breadth]', breadthError);
      if (useLiveMarketData) {
        intelligence.breadth = { ...(intelligence.breadth || {}), available: false, reason: 'BREADTH_ERROR' };
      }
    }
    const text=intelligenceText(intelligence);
    const dataPatch = useLiveMarketData && liveIndexes ? {
      overallIndex: liveIndexes.overall,
      overallChange: liveIndexes.overallChange,
      equalIndex: liveIndexes.equal,
      equalChange: liveIndexes.equalChange,
      liveMarketIndex: liveIndexes
    } : {};
    return {...item,...dataPatch,content:text,summary:text,marketIntelligence:intelligence};
  } catch(error) { console.error('[MarketSummaryController][Intelligence]',error); return item; }
}
async function enrichMany(items, options = {}) { return Promise.all((items||[]).map((item) => enrich(item, options))); }

exports.getLatestMarketSummary=async(req,res)=>{try{const result=await marketSummaryService.findOrGenerateLatest();if(!result?.data){const nowIso=new Date().toISOString();return sendResponse(res,200,{success:true,data:{id:0,date:nowIso,createdAt:nowIso,summaryDate:nowIso.split('T')[0],content:result?.message||'در حال حاضر داده‌ای در دسترس نیست.',summary:result?.message||'در حال حاضر داده‌ای در دسترس نیست.',overallIndex:null,isNoDataNotice:true},meta:{generated:false,fallback:true,sourceType:result?.sourceType||'none',reason:result?.reason||'NO_DATA_AVAILABLE',diagnostics:result?.diagnostics||null}});}const data=await enrich(result.data,{useLiveMarketData:true});return sendResponse(res,200,{success:true,data,meta:{generated:!!result.generated,sourceType:result.sourceType,cached:!!result.cached,reason:result.reason,diagnostics:result.diagnostics||null}});}catch(error){console.error('[MarketSummaryController][Critical]',error);return sendResponse(res,500,{success:false,message:'Internal Server Failure',error:error.message});}};
exports.getMarketSummaryHistory=async(req,res)=>{try{const page=Math.max(parseInt(req.query.page,10)||1,1),limit=Math.min(Math.max(parseInt(req.query.limit,10)||10,1),50);const result=await marketSummaryService.findHistory({page,limit});const data=await enrichMany(result.data||[],{useLiveMarketData:false});return sendResponse(res,200,{success:true,data,pagination:result.pagination});}catch(error){console.error('[MarketSummaryController][HistoryError]',error);return sendResponse(res,500,{success:false,message:error.message});}};
exports.getAvailableDates=async(req,res)=>{try{return sendResponse(res,200,{success:true,data:await marketSummaryService.getAvailableDates()||[]});}catch(error){return sendResponse(res,500,{success:false,message:'خطا در دریافت لیست تاریخ‌ها',error:error.message});}};
exports.getMarketSummaryByDate=async(req,res)=>{try{const dateInput=toDateInputOrNull(req.params?.date);if(!dateInput)return sendResponse(res,400,{success:false,message:'پارامتر تاریخ الزامی است. مثال: /by-date/2026-08-19'});const item=await marketSummaryService.findByDate(dateInput);if(!item)return sendResponse(res,404,{success:false,message:'تحلیلی برای تاریخ درخواستی یافت نشد',meta:{date:dateInput,reason:'NOT_FOUND'}});const todayTehran=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());const useLiveMarketData=dateInput===todayTehran;return sendResponse(res,200,{success:true,data:await enrich(item,{useLiveMarketData}),meta:{date:dateInput,sourceType:'by_date',useLiveMarketData}});}catch(error){return sendResponse(res,500,{success:false,message:'خطا در دریافت تحلیل بر اساس تاریخ',error:error.message});}};
exports.generateMarketSummary=async(req,res)=>{try{const history=await marketSummaryService.findLatestUsableMarketHistoryRow();if(!history||!history.marketData){const inspection=await marketSummaryService.inspectLatestMarketHistoryRows({take:5});return sendResponse(res,200,{success:false,message:'امکان تولید دستی وجود ندارد زیرا داده معتبری در سوابق بازار (MarketHistory) یافت نشد.',meta:{reason:inspection?.diagnostics?.reasonCode||'NO_USABLE_MARKET_HISTORY',diagnostics:inspection?.diagnostics||null}});}const result=await marketSummaryService.generateMarketSummary({marketData:history.marketData,fallbackDate:history.row.createdAt});return sendResponse(res,200,{success:true,data:await enrich(result.data),meta:{sourceType:result.sourceType,generated:true,reason:result.reason,diagnostics:result.diagnostics||null}});}catch(error){return sendResponse(res,500,{success:false,message:'خطا در فرآیند تولید دستی خلاصه بازار',error:error.message});}};
exports.autoGenerateMarketSummary=async(req,res)=>{try{const result=await marketSummaryService.findOrGenerateLatest();return sendResponse(res,200,{success:true,source:'auto-cron',data:result.data?await enrich(result.data):null,meta:{sourceType:result.sourceType,reason:result.reason,generated:!!result.generated,cached:!!result.cached,diagnostics:result.diagnostics||null}});}catch(error){return sendResponse(res,500,{success:false,message:error.message});}};
exports.runRetentionNow=async(req,res)=>{try{const keep=Number.parseInt(req.query.keep,10);const result=await marketSummaryService.retainOnlyLastNSummaries(Number.isInteger(keep)&&keep>0?keep:undefined);return sendResponse(res,200,{success:true,data:result});}catch(error){return sendResponse(res,500,{success:false,message:'خطا در اجرای retention',error:error.message});}};