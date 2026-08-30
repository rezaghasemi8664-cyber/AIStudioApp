'use strict';

const prismaModule = require('../config/prisma.cjs');
const { getMarketBreadth } = require('./marketBreadth.service.cjs');
const resolvePrismaClient = (mod) => [mod?.prisma, mod?.db, mod?.client, mod?.default, mod].find((x) => x && typeof x === 'object') || null;
const prisma = resolvePrismaClient(prismaModule);
if (!prisma) throw new Error('[MarketIntelligence] Prisma client unavailable');
const MarketSummary = prisma.MarketSummary || prisma.marketSummary;
if (!MarketSummary) throw new Error('[MarketIntelligence] MarketSummary model unavailable');

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/[,\u066C\s]/g, ''));
  return Number.isFinite(n) ? n : null;
};
const obj = (v) => {
  if (!v) return null;
  if (typeof v === 'object' && !Array.isArray(v)) return v;
  try { const p = JSON.parse(v); return p && typeof p === 'object' && !Array.isArray(p) ? p : null; } catch { return null; }
};
const arr = (v) => Array.isArray(v) ? v : (typeof v === 'string' ? (() => { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } })() : []);
const first = (o, keys) => {
  if (!o || typeof o !== 'object') return null;
  for (const k of keys) {
    if (o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k];
    const hit = Object.keys(o).find((x) => x.toLowerCase() === k.toLowerCase());
    if (hit && o[hit] !== undefined && o[hit] !== null && o[hit] !== '') return o[hit];
  }
  return null;
};
const dateOnly = (d) => {
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? null : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).format(x);
};
function rawData(summary) { const raw = obj(summary?.rawJson) || {}; return { raw, data: obj(raw.data) || raw }; }
function indexPct(summary, data) { return num(first(data, ['changePercent','overallChangePercent','indexChangePercent','index_change_percent','percentChange','pcp','change_index_percent'])) ?? num(summary?.overallChangePercent); }
function equalPct(summary, data) { return num(first(data, ['equalWeightedChangePercent','equalChangePercent','indexEqualWeightChangePercent','index_equalWeight_change_percent','index_equal_weight_change_percent'])) ?? num(summary?.equalChangePercent); }
function liquidity(s, p) {
  const value = num(s?.totalValue), volume = num(s?.totalVolume), trades = num(s?.totalTrades), prev = num(p?.totalValue), prevVolume = num(p?.totalVolume);
  const valueVsPreviousPct = value !== null && prev ? (value / prev - 1) * 100 : null;
  const volumeVsPreviousPct = volume !== null && prevVolume ? (volume / prevVolume - 1) * 100 : null;
  return { value, volume, trades, previousValue: prev, valueVsPreviousPct, volumeVsPreviousPct, state: value === null ? 'unknown' : valueVsPreviousPct === null ? 'neutral' : valueVsPreviousPct >= 15 ? 'strong' : valueVsPreviousPct <= -15 ? 'weak' : 'normal', interpretation: value === null ? 'داده کافی نیست' : valueVsPreviousPct === null ? 'عادی' : valueVsPreviousPct >= 15 ? 'قوی' : valueVsPreviousPct <= -15 ? 'ضعیف' : 'عادی' };
}
function money(data) {
  const inflow = num(first(data, ['realMoneyInflow','real_inflow','realNetInflow','netRealMoney','realMoneyNet']));
  const outflow = num(first(data, ['realMoneyOutflow','real_outflow','realNetOutflow']));
  const buy = num(first(data, ['realBuyValue','real_buy_value','realPurchaseValue']));
  const sell = num(first(data, ['realSellValue','real_sell_value','realSalesValue']));
  const net = inflow !== null ? inflow : (buy !== null && sell !== null ? buy - sell : (outflow !== null ? -outflow : null));
  return { net, inflow, outflow, buy, sell, available: net !== null, interpretation: net === null ? 'داده جریان پول حقیقی در دسترس نیست' : net > 0 ? 'ورود خالص پول حقیقی' : net < 0 ? 'خروج خالص پول حقیقی' : 'متعادل' };
}
function sectors(data) {
  const ss = arr(first(data, ['sectors','sectorPerformance','sectorStats','industries','industryPerformance']));
  if (!ss.length) return { available: false, leaders: [], laggards: [] };
  const n = ss.map(s => ({ name: String(first(s, ['name','sector','title','industry','group']) || 'نامشخص'), changePercent: num(first(s, ['changePercent','percent','change','performance','pcp'])), value: num(first(s, ['value','tradeValue','totalValue','tval'])), moneyFlow: num(first(s, ['moneyFlow','realMoneyFlow','netMoney','netInflow'])) })).filter(s => s.changePercent !== null || s.value !== null || s.moneyFlow !== null);
  return { available: true, leaders: [...n].sort((a,b) => (b.changePercent ?? -Infinity) - (a.changePercent ?? -Infinity)).slice(0,5), laggards: [...n].sort((a,b) => (a.changePercent ?? Infinity) - (b.changePercent ?? Infinity)).slice(0,5) };
}
function momentum(summaries) {
  const changes = [...summaries].reverse().map(r => indexPct(r, rawData(r).data)).filter(x => x !== null);
  const five = changes.slice(-5), ten = changes.slice(-10), fiveSum = five.length ? five.reduce((a,b) => a+b,0) : null, tenSum = ten.length ? ten.reduce((a,b) => a+b,0) : null;
  return { fiveDayChangePct: fiveSum, tenDayChangePct: tenSum, positiveDays5: five.filter(x => x > 0).length, observations: changes.length, state: fiveSum === null ? 'unknown' : fiveSum >= 3 ? 'positive' : fiveSum <= -3 ? 'negative' : 'neutral' };
}
function volatility(summaries) {
  const v = summaries.map(r => indexPct(r, rawData(r).data)).filter(x => x !== null);
  if (v.length < 2) return { volatility: null, state: 'unknown', observations: v.length };
  const m = v.reduce((a,b) => a+b,0) / v.length, sd = Math.sqrt(v.reduce((a,b) => a + (b-m)**2,0) / v.length);
  return { volatility: sd, state: sd >= 3 ? 'high' : sd >= 1.5 ? 'medium' : 'low', observations: v.length };
}
function score({ indexPctValue, equalPctValue, b, liq, flow, mom, vol }) {
  const c = x => x === null ? 50 : clamp(x, 0, 100);
  const trend = c(indexPctValue === null ? null : 50 + clamp(indexPctValue * 8, -50, 50));
  const eq = c(equalPctValue === null ? null : 50 + clamp(equalPctValue * 8, -50, 50));
  const bs = c(b.breadthRatio === null ? null : 50 + b.breadthRatio * 50);
  const ls = c(liq.valueVsPreviousPct === null ? null : 50 + clamp(liq.valueVsPreviousPct * 2, -50, 50));
  const fs = c(flow.net === null ? null : flow.net > 0 ? 70 : flow.net < 0 ? 30 : 50);
  const ms = c(mom.fiveDayChangePct === null ? null : 50 + clamp(mom.fiveDayChangePct * 5, -50, 50));
  const riskPenalty = vol.volatility === null ? 0 : clamp((vol.volatility - 1.5) * 5, 0, 20);
  const raw = trend*.20 + eq*.10 + bs*.20 + ls*.15 + fs*.15 + ms*.20;
  const value = Math.round(clamp(raw - riskPenalty, 0, 100));
  return { score: value, regime: value >= 70 ? 'bullish' : value >= 58 ? 'bullish_cautious' : value >= 43 ? 'neutral' : value >= 30 ? 'bearish_cautious' : 'bearish', components: { trend, equalWeight: eq, breadth: bs, liquidity: ls, moneyFlow: fs, momentum: ms, riskPenalty } };
}
function regimeFa(r) { return ({ bullish:'صعودی', bullish_cautious:'صعودی محتاطانه', neutral:'خنثی', bearish_cautious:'نزولی محتاطانه', bearish:'نزولی' })[r] || 'نامشخص'; }
function riskFa(v) { return ({ low:'کم', medium:'متوسط', high:'زیاد', unknown:'نامشخص' })[v] || 'نامشخص'; }
function scenarios(s) {
  if (s >= 70) return [{ title:'سناریوی پایه', probability:'زیاد', text:'تداوم سوگیری مثبت با نوسان‌های مقطعی، مشروط به حفظ مشارکت بازار و ارزش معاملات.' }, { title:'سناریوی صعودی', probability:'متوسط', text:'افزایش breadth و ارزش معاملات می‌تواند حرکت صعودی را تقویت کند.' }, { title:'سناریوی نزولی', probability:'کم', text:'افت هم‌زمان breadth و نقدینگی می‌تواند بازار را وارد فاز اصلاحی کند.' }];
  if (s < 43) return [{ title:'سناریوی پایه', probability:'زیاد', text:'تداوم فشار عرضه تا زمان مشاهده نشانه‌های بهبود breadth و نقدینگی.' }, { title:'سناریوی صعودی', probability:'کم', text:'ورود نقدینگی و بهبود گسترده تعداد نمادهای مثبت می‌تواند روند را برگرداند.' }, { title:'سناریوی نزولی', probability:'متوسط', text:'تشدید نوسان و خروج نقدینگی می‌تواند اصلاح را عمیق‌تر کند.' }];
  return [{ title:'سناریوی پایه', probability:'متوسط', text:'بازار در فاز نوسانی قرار دارد و جهت بعدی به تأیید breadth و نقدینگی وابسته است.' }, { title:'سناریوی صعودی', probability:'متوسط', text:'افزایش مشارکت نمادها و ارزش معاملات احتمال تثبیت روند مثبت را بالا می‌برد.' }, { title:'سناریوی نزولی', probability:'متوسط', text:'ضعف breadth یا خروج پول می‌تواند سوگیری بازار را به سمت اصلاح تغییر دهد.' }];
}
function divergences(summary, b, liq, mom) {
  const { data } = rawData(summary), ip = indexPct(summary, data), ds = [];
  if (ip !== null && b.breadthRatio !== null && ip > 0 && b.breadthRatio < 0) ds.push({ type:'index_breadth', severity:'warning', text:'شاخص مثبت است اما عرض بازار منفی است؛ رشد بازار مشارکت گسترده ندارد.' });
  if (ip !== null && b.breadthRatio !== null && ip < 0 && b.breadthRatio > 0) ds.push({ type:'index_breadth', severity:'positive', text:'شاخص منفی است اما عرض بازار بهتر شده؛ احتمال بهبود درونی بازار وجود دارد.' });
  if (ip !== null && liq.valueVsPreviousPct !== null && ip > 0 && liq.valueVsPreviousPct < -10) ds.push({ type:'price_liquidity', severity:'warning', text:'حرکت مثبت شاخص با افت ارزش معاملات همراه شده است.' });
  if (ip !== null && liq.valueVsPreviousPct !== null && ip > 0 && liq.valueVsPreviousPct > 15) ds.push({ type:'price_liquidity', severity:'positive', text:'رشد شاخص با افزایش ارزش معاملات تأیید شده است.' });
  if (mom.fiveDayChangePct !== null && ip !== null && ip > 0 && mom.fiveDayChangePct < 0) ds.push({ type:'momentum', severity:'warning', text:'حرکت روز جاری مثبت است اما مومنتوم چندروزه هنوز ضعیف است.' });
  return ds;
}
function action(scoreValue, b, liq, risk) {
  const bias = scoreValue >= 70 ? 'مثبت' : scoreValue < 43 ? 'منفی' : 'خنثی';
  const confirmation = [];
  if (b.breadthRatio !== null) confirmation.push(b.breadthRatio > 0 ? 'حفظ برتری نمادهای مثبت' : 'بهبود عرض بازار');
  if (liq.valueVsPreviousPct !== null) confirmation.push(liq.valueVsPreviousPct > 0 ? 'حفظ/افزایش ارزش معاملات' : 'بازگشت نقدینگی');
  return { bias, risk: riskFa(risk), suitableFor: risk === 'high' ? 'معاملات انتخابی با حجم کنترل‌شده' : bias === 'مثبت' ? 'Swing و معاملات کوتاه‌مدت انتخابی' : 'انتظار برای تأیید روند', confirmation };
}

async function buildMarketIntelligence(summaryId, { historyLimit = 20 } = {}) {
  const current = await MarketSummary.findUnique({ where: { id: Number(summaryId) } });
  if (!current) return null;
  const summaries = await MarketSummary.findMany({ orderBy: [{ summaryDate:'desc' }, { id:'desc' }], take: historyLimit });
  const previous = summaries.find(x => x.id !== current.id) || null;
  const { raw, data } = rawData(current);
  const b = await getMarketBreadth();
  const liq = liquidity(current, previous), flow = money(data), sec = sectors(data), mom = momentum(summaries), vol = volatility(summaries);
  const ip = indexPct(current, data), ep = equalPct(current, data), sc = score({ indexPctValue:ip, equalPctValue:ep, b, liq, flow, mom, vol });
  const riskState = vol.state === 'high' || sc.score < 35 ? 'high' : vol.state === 'medium' ? 'medium' : 'low';
  const available = [current.overallIndex, current.equalIndex, current.totalValue, b.available ? b.total : null, ip, liq.valueVsPreviousPct, mom.fiveDayChangePct].filter(x => x !== null && x !== undefined).length;
  return {
    version:'2.0', generatedAt:new Date().toISOString(), date:dateOnly(current.summaryDate),
    headline:`بازار ${regimeFa(sc.regime)} با امتیاز ${sc.score} از 100 ارزیابی می‌شود؛ ریسک ${riskFa(riskState)} است.`,
    regime:{ key:sc.regime, label:regimeFa(sc.regime), score:sc.score, components:sc.components },
    indexes:{ overall:{ value:num(current.overallIndex), changeValue:num(current.overallChange), changePercent:ip }, equalWeight:{ value:num(current.equalIndex), changeValue:num(current.equalChange), changePercent:ep } },
    breadth:b, liquidity:liq, moneyFlow:flow, sectors:sec, momentum:mom,
    risk:{ state:riskState, label:riskFa(riskState), volatility:vol.volatility, volatilityState:vol.state },
    divergences:divergences(current,b,liq,mom),
    leaders:{ gainers:arr(current.topGainers).slice(0,5), losers:arr(current.topLosers).slice(0,5), volumes:arr(current.topVolumes).slice(0,5) },
    scenarios:scenarios(sc.score), action:action(sc.score,b,liq,riskState),
    dataQuality:{ level:available >= 6 ? 'high' : available >= 4 ? 'medium' : 'low', availableFields:available, expectedFields:7, symbolsCoverage:b.available ? Number(b.coveragePercent.toFixed(1)) : 0, breadthAvailable:b.available, breadthReason:b.reason || null }
  };
}

module.exports = { buildMarketIntelligence, regimeFa };