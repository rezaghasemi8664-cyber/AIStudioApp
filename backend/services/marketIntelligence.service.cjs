'use strict';

const prismaModule = require('../config/prisma.cjs');
const { getMarketBreadth } = require('./marketBreadth.service.cjs');

const resolvePrismaClient = (mod) =>
  [mod?.prisma, mod?.db, mod?.client, mod?.default, mod]
    .find((x) => x && typeof x === 'object') || null;

const prisma = resolvePrismaClient(prismaModule);

if (!prisma) {
  throw new Error('[MarketIntelligence] Prisma client unavailable');
}

const MarketSummary = prisma.MarketSummary || prisma.marketSummary;

if (!MarketSummary) {
  throw new Error('[MarketIntelligence] MarketSummary model unavailable');
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const clamp = (value, min, max) => {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return min;
  }

  return Math.min(max, Math.max(min, n));
};

const num = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const normalized = String(value)
    .replace(/[,\u066C\s]/g, '')
    .replace(/٫/g, '.')
    .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));

  const n = Number(normalized);

  return Number.isFinite(n) ? n : null;
};

const obj = (value) => {
  if (!value) {
    return null;
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }

  try {
    const parsed = JSON.parse(value);

    return parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
};

const arr = (value) => {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value !== 'string') {
    return [];
  }

  try {
    const parsed = JSON.parse(value);

    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const first = (object, keys) => {
  if (!object || typeof object !== 'object') {
    return null;
  }

  for (const key of keys) {
    if (
      object[key] !== undefined &&
      object[key] !== null &&
      object[key] !== ''
    ) {
      return object[key];
    }

    const matchedKey = Object.keys(object).find(
      (candidate) => candidate.toLowerCase() === key.toLowerCase()
    );

    if (
      matchedKey &&
      object[matchedKey] !== undefined &&
      object[matchedKey] !== null &&
      object[matchedKey] !== ''
    ) {
      return object[matchedKey];
    }
  }

  return null;
};

const dateOnly = (date) => {
  const value = new Date(date);

  if (Number.isNaN(value.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(value);
};

function rawData(summary) {
  const raw = obj(summary?.rawJson) || {};

  return {
    raw,
    data: obj(raw.data) || raw
  };
}

/* -------------------------------------------------------------------------- */
/* Indexes                                                                    */
/* -------------------------------------------------------------------------- */

function indexPct(summary, data) {
  const direct = num(
    first(data, [
      'changePercent',
      'overallChangePercent',
      'indexChangePercent',
      'index_change_percent',
      'percentChange',
      'pcp',
      'change_index_percent'
    ])
  );

  if (direct !== null) {
    return direct;
  }

  const summaryPercent = num(summary?.overallChangePercent);

  if (summaryPercent !== null) {
    return summaryPercent;
  }

  /*
   * If percentage change is unavailable but absolute change is available,
   * derive the percentage from:
   *
   * previous = current - change
   * percent  = change / previous * 100
   */
  const current = num(summary?.overallIndex);
  const change = num(summary?.overallChange);

  if (
    current !== null &&
    change !== null
  ) {
    const previous = current - change;

    if (Number.isFinite(previous) && previous !== 0) {
      const calculated = (change / previous) * 100;

      return Number.isFinite(calculated)
        ? calculated
        : null;
    }
  }

  return null;
}

function equalPct(summary, data) {
  const direct = num(
    first(data, [
      'equalWeightedChangePercent',
      'equalChangePercent',
      'indexEqualWeightChangePercent',
      'index_equalWeight_change_percent',
      'index_equal_weight_change_percent'
    ])
  );

  if (direct !== null) {
    return direct;
  }

  const summaryPercent = num(summary?.equalChangePercent);

  if (summaryPercent !== null) {
    return summaryPercent;
  }

  const current = num(summary?.equalIndex);
  const change = num(summary?.equalChange);

  if (
    current !== null &&
    change !== null
  ) {
    const previous = current - change;

    if (Number.isFinite(previous) && previous !== 0) {
      const calculated = (change / previous) * 100;

      return Number.isFinite(calculated)
        ? calculated
        : null;
    }
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* Liquidity                                                                  */
/* -------------------------------------------------------------------------- */

function liquidity(current, previous) {
  const value = num(current?.totalValue);
  const volume = num(current?.totalVolume);
  const trades = num(current?.totalTrades);

  const previousValue = num(previous?.totalValue);
  const previousVolume = num(previous?.totalVolume);

  const valueVsPreviousPct =
    value !== null &&
    previousValue !== null &&
    previousValue !== 0
      ? ((value / previousValue) - 1) * 100
      : null;

  const volumeVsPreviousPct =
    volume !== null &&
    previousVolume !== null &&
    previousVolume !== 0
      ? ((volume / previousVolume) - 1) * 100
      : null;

  let state = 'unknown';
  let interpretation = 'داده کافی برای ارزیابی نقدشوندگی وجود ندارد.';

  if (value !== null) {
    if (valueVsPreviousPct === null) {
      state = 'neutral';
      interpretation = 'ارزش معاملات ثبت شده است، اما مقایسه با روز قبل در دسترس نیست.';
    } else if (valueVsPreviousPct >= 15) {
      state = 'strong';
      interpretation = 'ارزش معاملات نسبت به روز قبل افزایش معناداری دارد.';
    } else if (valueVsPreviousPct <= -15) {
      state = 'weak';
      interpretation = 'ارزش معاملات نسبت به روز قبل کاهش معناداری دارد.';
    } else {
      state = 'normal';
      interpretation = 'ارزش معاملات در محدوده عادی قرار دارد.';
    }
  }

  return {
    value,
    volume,
    trades,
    previousValue,
    valueVsPreviousPct,
    volumeVsPreviousPct,
    state,
    interpretation
  };
}

/* -------------------------------------------------------------------------- */
/* Real Money Flow                                                            */
/* -------------------------------------------------------------------------- */

function money(data) {
  const sources = [
    data,
    data?.clientType,
    data?.clientTypeAll,
    data?.clientTypeAllDto,
    data?.clientTypes,
    data?.realMoney,
    data?.moneyFlow
  ].filter(Boolean);

  const sumField = (keys) => sources.reduce((sum, src) => {
    const v = num(first(src, keys));
    return sum + (v === null ? 0 : v);
  }, 0);

  const buyVolume = sumField(['buy_I_Volume','buyIVolume','realBuyVolume','individualBuyVolume','buyRealVolume']);
  const sellVolume = sumField(['sell_I_Volume','sellIVolume','realSellVolume','individualSellVolume','sellRealVolume']);
  const directInflow = sources.map(src => num(first(src,['realMoneyInflow','real_inflow','realNetInflow','netRealMoney','realMoneyNet']))).find(v=>v!==null);
  const directOutflow = sources.map(src => num(first(src,['realMoneyOutflow','real_outflow','realNetOutflow']))).find(v=>v!==null);
  const buyValue = sources.map(src => num(first(src,['realBuyValue','real_buy_value','realPurchaseValue','buy_I_Value','buyIValue']))).find(v=>v!==null);
  const sellValue = sources.map(src => num(first(src,['realSellValue','real_sell_value','realSalesValue','sell_I_Value','sellIValue']))).find(v=>v!==null);
  let net = directInflow;
  if (net === null && buyValue !== null && sellValue !== null) net = buyValue - sellValue;
  if (net === null && directOutflow !== null) net = -directOutflow;
  if (net === null && buyVolume > 0 || sellVolume > 0) {
    const price = sources.map(src => num(first(src,['pl','pDrCotVal','lastPrice','priceLast','pc','pClosing']))).find(v=>v!==null);
    if (price !== undefined && price !== null) net = (buyVolume - sellVolume) * price;
  }
  const available = net !== null && Number.isFinite(net);
  return {
    net: available ? net : null,
    inflow: directInflow,
    outflow: directOutflow,
    buy: buyValue !== null ? buyValue : (buyVolume || null),
    sell: sellValue !== null ? sellValue : (sellVolume || null),
    buyVolume: buyVolume || null,
    sellVolume: sellVolume || null,
    available,
    interpretation: available
      ? net > 0 ? 'ورود خالص پول حقیقی مشاهده شده است.' : net < 0 ? 'خروج خالص پول حقیقی مشاهده شده است.' : 'جریان خالص پول حقیقی متعادل است.'
      : 'داده جریان پول حقیقی در Snapshot بازار موجود نیست.'
  };
}

/* -------------------------------------------------------------------------- */
/* Sector data                                                                */
/* -------------------------------------------------------------------------- */

function sectors(data) {
  const raw = first(data, ['sectors','sectorRotation','sector_rotation','industryPerformance','industry_performance','industries','groups']);
  const list = arr(raw);
  if (!list.length) return { available:false, leaders:[], laggards:[], reason:'SECTOR_DATA_UNAVAILABLE' };
  const normalized = list.map(item => {
    if (!item || typeof item !== 'object') return null;
    const change = num(first(item,['changePercent','change','percentChange','performance','pct']));
    const name = first(item,['name','title','sector','industry','group','sectorName','industryName','groupName']);
    return name && change !== null ? {...item,name:String(name),changePercent:change} : null;
  }).filter(Boolean).sort((a,b)=>b.changePercent-a.changePercent);
  return normalized.length
    ? {available:true,leaders:normalized.slice(0,5),laggards:normalized.slice(-5).reverse()}
    : {available:false,leaders:[],laggards:[],reason:'SECTOR_DATA_INVALID'};
}

/* -------------------------------------------------------------------------- */
/* Momentum                                                                   */
/* -------------------------------------------------------------------------- */

function momentum(summaries) {
  const changes = [...summaries]
    .reverse()
    .map((row) => {
      const { data } = rawData(row);

      return indexPct(row, data);
    })
    .filter((value) => value !== null);

  const five = changes.slice(-5);
  const ten = changes.slice(-10);

  const fiveDayChangePct = five.length
    ? five.reduce((sum, value) => sum + value, 0)
    : null;

  const tenDayChangePct = ten.length
    ? ten.reduce((sum, value) => sum + value, 0)
    : null;

  let state = 'unknown';

  if (fiveDayChangePct !== null) {
    if (fiveDayChangePct >= 3) {
      state = 'positive';
    } else if (fiveDayChangePct <= -3) {
      state = 'negative';
    } else {
      state = 'neutral';
    }
  }

  return {
    fiveDayChangePct,
    tenDayChangePct,
    positiveDays5: five.filter((value) => value > 0).length,
    observations: changes.length,
    state
  };
}

/* -------------------------------------------------------------------------- */
/* Volatility                                                                 */
/* -------------------------------------------------------------------------- */

function volatility(summaries) {
  const values = summaries
    .map((row) => {
      const { data } = rawData(row);

      return indexPct(row, data);
    })
    .filter((value) => value !== null);

  if (values.length < 2) {
    return {
      volatility: null,
      state: 'unknown',
      observations: values.length
    };
  }

  const mean =
    values.reduce((sum, value) => sum + value, 0) / values.length;

  const variance =
    values.reduce(
      (sum, value) => sum + (value - mean) ** 2,
      0
    ) / values.length;

  const standardDeviation = Math.sqrt(variance);

  if (!Number.isFinite(standardDeviation)) {
    return {
      volatility: null,
      state: 'unknown',
      observations: values.length
    };
  }

  return {
    volatility: standardDeviation,
    state:
      standardDeviation >= 3
        ? 'high'
        : standardDeviation >= 1.5
          ? 'medium'
          : 'low',
    observations: values.length
  };
}

/* -------------------------------------------------------------------------- */
/* Market Score                                                               */
/* -------------------------------------------------------------------------- */

function score({
  indexPctValue,
  equalPctValue,
  b,
  liq,
  flow,
  mom,
  vol
}) {
  /*
   * Every score component is guaranteed to be finite.
   * Missing data receives a neutral value of 50.
   */

  const component = (value) => {
    if (value === null || value === undefined) {
      return 50;
    }

    const n = Number(value);

    if (!Number.isFinite(n)) {
      return 50;
    }

    return clamp(n, 0, 100);
  };

  /* شاخص کل */
  const trend = component(
    indexPctValue === null
      ? null
      : 50 + clamp(indexPctValue * 8, -50, 50)
  );

  /* شاخص هم‌وزن */
  const equalWeight = component(
    equalPctValue === null
      ? null
      : 50 + clamp(equalPctValue * 8, -50, 50)
  );

  /*
   * Breadth:
   *
   * positivePercent = 72.65
   * negativePercent = 20.31
   *
   * ratio = (72.65 - 20.31) / 100
   *       = 0.5234
   *
   * breadth score ≈ 76.17
   */
  const positivePercent = num(b?.positivePercent);
  const negativePercent = num(b?.negativePercent);

  const breadthRatio =
    positivePercent !== null &&
    negativePercent !== null
      ? (positivePercent - negativePercent) / 100
      : null;

  const breadth = component(
    breadthRatio === null
      ? null
      : 50 + breadthRatio * 50
  );

  /* نقدشوندگی */
  const liquidityScore = component(
    liq?.valueVsPreviousPct === null ||
    liq?.valueVsPreviousPct === undefined
      ? null
      : 50 + clamp(
          liq.valueVsPreviousPct * 2,
          -50,
          50
        )
  );

  /* جریان پول */
  let moneyFlow = 50;

  if (flow?.net !== null && flow?.net !== undefined) {
    const net = Number(flow.net);

    if (Number.isFinite(net)) {
      moneyFlow =
        net > 0
          ? 70
          : net < 0
            ? 30
            : 50;
    }
  }

  moneyFlow = component(moneyFlow);

  /* مومنتوم */
  const momentumScore = component(
    mom?.fiveDayChangePct === null ||
    mom?.fiveDayChangePct === undefined
      ? null
      : 50 + clamp(
          mom.fiveDayChangePct * 5,
          -50,
          50
        )
  );

  /* جریمه ریسک */
  const riskPenalty =
    vol?.volatility !== null &&
    vol?.volatility !== undefined &&
    Number.isFinite(Number(vol.volatility))
      ? clamp(
          (Number(vol.volatility) - 1.5) * 5,
          0,
          20
        )
      : 0;

  const rawScore =
    trend * 0.20 +
    equalWeight * 0.10 +
    breadth * 0.20 +
    liquidityScore * 0.15 +
    moneyFlow * 0.15 +
    momentumScore * 0.20;

  const safeRawScore = Number.isFinite(rawScore)
    ? rawScore
    : 50;

  const value = Math.round(
    clamp(
      safeRawScore - riskPenalty,
      0,
      100
    )
  );

  let regime = 'neutral';

  if (value >= 70) {
    regime = 'bullish';
  } else if (value >= 58) {
    regime = 'bullish_cautious';
  } else if (value >= 43) {
    regime = 'neutral';
  } else if (value >= 30) {
    regime = 'bearish_cautious';
  } else {
    regime = 'bearish';
  }

  return {
    score: value,
    regime,
    components: {
      trend,
      equalWeight,
      breadth,
      liquidity: liquidityScore,
      moneyFlow,
      momentum: momentumScore,
      riskPenalty
    }
  };
}

/* -------------------------------------------------------------------------- */
/* Persian labels                                                             */
/* -------------------------------------------------------------------------- */

function regimeFa(regime) {
  return {
    bullish: 'صعودی',
    bullish_cautious: 'صعودی محتاطانه',
    neutral: 'خنثی',
    bearish_cautious: 'نزولی محتاطانه',
    bearish: 'نزولی'
  }[regime] || 'نامشخص';
}

function riskFa(risk) {
  return {
    low: 'کم',
    medium: 'متوسط',
    high: 'زیاد',
    unknown: 'نامشخص'
  }[risk] || 'نامشخص';
}

/* -------------------------------------------------------------------------- */
/* Scenarios                                                                  */
/* -------------------------------------------------------------------------- */

function scenarios(scoreValue) {
  if (scoreValue >= 70) {
    return [
      {
        title: 'سناریوی پایه',
        probability: 'زیاد',
        text:
          'تداوم سوگیری مثبت با نوسان‌های مقطعی، مشروط به حفظ مشارکت بازار و ارزش معاملات.'
      },
      {
        title: 'سناریوی صعودی',
        probability: 'متوسط',
        text:
          'افزایش عرض بازار و حفظ ارزش معاملات می‌تواند حرکت صعودی را تقویت کند.'
      },
      {
        title: 'سناریوی نزولی',
        probability: 'کم',
        text:
          'کاهش هم‌زمان عرض بازار و نقدشوندگی می‌تواند بازار را وارد فاز اصلاحی کند.'
      }
    ];
  }

  if (scoreValue < 43) {
    return [
      {
        title: 'سناریوی پایه',
        probability: 'زیاد',
        text:
          'تداوم فشار عرضه تا زمان مشاهده نشانه‌های پایدار از بهبود عرض بازار و نقدشوندگی.'
      },
      {
        title: 'سناریوی صعودی',
        probability: 'کم',
        text:
          'ورود نقدینگی و افزایش گسترده تعداد نمادهای مثبت می‌تواند زمینه تغییر روند را فراهم کند.'
      },
      {
        title: 'سناریوی نزولی',
        probability: 'متوسط',
        text:
          'تشدید فشار فروش و کاهش نقدشوندگی می‌تواند اصلاح بازار را عمیق‌تر کند.'
      }
    ];
  }

  return [
    {
      title: 'سناریوی پایه',
      probability: 'متوسط',
      text:
        'بازار در وضعیت میانی قرار دارد و جهت بعدی به تأیید هم‌زمان عرض بازار و نقدشوندگی وابسته است.'
    },
    {
      title: 'سناریوی صعودی',
      probability: 'متوسط',
      text:
        'حفظ مشارکت نمادها و ارزش معاملات می‌تواند احتمال تثبیت حرکت مثبت را افزایش دهد.'
    },
    {
      title: 'سناریوی نزولی',
      probability: 'متوسط',
      text:
        'ضعف عرض بازار یا خروج نقدینگی می‌تواند سوگیری بازار را به سمت اصلاح تغییر دهد.'
    }
  ];
}

/* -------------------------------------------------------------------------- */
/* Divergences                                                                */
/* -------------------------------------------------------------------------- */

function divergences(summary, breadthData, liq, mom) {
  const { data } = rawData(summary);

  const indexChange = indexPct(summary, data);

  const breadthRatio =
    num(breadthData?.positivePercent) !== null &&
    num(breadthData?.negativePercent) !== null
      ? (
          num(breadthData.positivePercent) -
          num(breadthData.negativePercent)
        ) / 100
      : null;

  const result = [];

  if (
    indexChange !== null &&
    breadthRatio !== null &&
    indexChange > 0 &&
    breadthRatio < 0
  ) {
    result.push({
      type: 'index_breadth',
      severity: 'warning',
      text:
        'شاخص مثبت است، اما عرض بازار منفی است؛ بنابراین رشد شاخص از مشارکت گسترده نمادها برخوردار نیست.'
    });
  }

  if (
    indexChange !== null &&
    breadthRatio !== null &&
    indexChange < 0 &&
    breadthRatio > 0
  ) {
    result.push({
      type: 'index_breadth',
      severity: 'positive',
      text:
        'شاخص منفی است، اما عرض بازار مثبت است؛ این وضعیت می‌تواند نشانه بهبود درونی بازار باشد.'
    });
  }

  if (
    indexChange !== null &&
    liq?.valueVsPreviousPct !== null &&
    indexChange > 0 &&
    liq.valueVsPreviousPct < -10
  ) {
    result.push({
      type: 'price_liquidity',
      severity: 'warning',
      text:
        'حرکت مثبت شاخص با کاهش ارزش معاملات همراه شده است و نیاز به تأیید نقدینگی دارد.'
    });
  }

  if (
    indexChange !== null &&
    liq?.valueVsPreviousPct !== null &&
    indexChange > 0 &&
    liq.valueVsPreviousPct > 15
  ) {
    result.push({
      type: 'price_liquidity',
      severity: 'positive',
      text:
        'رشد شاخص با افزایش معنادار ارزش معاملات همراه شده و از نظر نقدشوندگی تأیید می‌شود.'
    });
  }

  if (
    mom?.fiveDayChangePct !== null &&
    indexChange !== null &&
    indexChange > 0 &&
    mom.fiveDayChangePct < 0
  ) {
    result.push({
      type: 'momentum',
      severity: 'warning',
      text:
        'حرکت روز جاری مثبت است، اما مومنتوم چندروزه همچنان ضعیف است.'
    });
  }

  return result;
}

/* -------------------------------------------------------------------------- */
/* Operational Action                                                         */
/* -------------------------------------------------------------------------- */

function action(scoreValue, breadthData, liq, risk) {
  const breadthRatio =
    num(breadthData?.positivePercent) !== null &&
    num(breadthData?.negativePercent) !== null
      ? (
          num(breadthData.positivePercent) -
          num(breadthData.negativePercent)
        ) / 100
      : null;

  const bias =
    scoreValue >= 70
      ? 'مثبت'
      : scoreValue < 43
        ? 'منفی'
        : 'خنثی';

  const confirmation = [];

  if (breadthRatio !== null) {
    confirmation.push(
      breadthRatio > 0
        ? 'حفظ برتری نمادهای مثبت'
        : 'بهبود عرض بازار'
    );
  }

  if (liq?.valueVsPreviousPct !== null) {
    confirmation.push(
      liq.valueVsPreviousPct > 0
        ? 'حفظ یا افزایش ارزش معاملات'
        : 'بازگشت نقدینگی'
    );
  }

  let suitableFor = 'انتظار برای تأیید روند';

  if (risk === 'high') {
    suitableFor = 'معاملات انتخابی با حجم کنترل‌شده';
  } else if (bias === 'مثبت') {
    suitableFor = 'معاملات کوتاه‌مدت انتخابی با تأیید روند';
  }

  return {
    bias,
    risk: riskFa(risk),
    suitableFor,
    confirmation
  };
}

/* -------------------------------------------------------------------------- */
/* Main Builder                                                               */
/* -------------------------------------------------------------------------- */

async function buildMarketIntelligence(
  summaryId,
  { historyLimit = 20 } = {}
) {
  const current = await MarketSummary.findUnique({
    where: {
      id: Number(summaryId)
    }
  });

  if (!current) {
    return null;
  }

  const summaries = await MarketSummary.findMany({
    orderBy: [
      {
        summaryDate: 'desc'
      },
      {
        id: 'desc'
      }
    ],
    take: historyLimit
  });

  const previous =
    summaries.find((row) => row.id !== current.id) || null;

  const { data } = rawData(current);

  const breadth = await getMarketBreadth();

  const liquidityData = liquidity(
    current,
    previous
  );

  const moneyFlow = money(data);

  const sectorData = sectors(data);

  const momentumData = momentum(
    summaries
  );

  const volatilityData = volatility(
    summaries
  );

  const overallChangePct = indexPct(
    current,
    data
  );

  const equalChangePct = equalPct(
    current,
    data
  );

  const scoreData = score({
    indexPctValue: overallChangePct,
    equalPctValue: equalChangePct,
    b: breadth,
    liq: liquidityData,
    flow: moneyFlow,
    mom: momentumData,
    vol: volatilityData
  });

  const riskState =
    volatilityData.state === 'high' ||
    scoreData.score < 35
      ? 'high'
      : volatilityData.state === 'medium'
        ? 'medium'
        : 'low';

  /*
   * Seven principal fields:
   *
   * 1. overall index
   * 2. equal-weight index
   * 3. trading value
   * 4. breadth
   * 5. index percentage change
   * 6. liquidity comparison
   * 7. five-day momentum
   */
  const qualityChecks = {
    overallIndex: num(current.overallIndex) !== null,
    equalIndex: num(current.equalIndex) !== null,
    tradingValue: num(current.totalValue) !== null,
    tradingVolume: num(current.totalVolume) !== null,
    tradeCount: num(current.totalTrades) !== null,
    breadth: Boolean(breadth?.available),
    indexChange: overallChangePct !== null,
    equalChange: equalChangePct !== null,
    liquidityComparison: liquidityData.valueVsPreviousPct !== null,
    moneyFlow: Boolean(moneyFlow?.available),
    sectors: Boolean(sectorData?.available),
    leaders: Boolean((breadth?.topGainers?.length || current.topGainers) && (breadth?.topLosers?.length || current.topLosers))
  };
  const availableFields = Object.values(qualityChecks).filter(Boolean).length;
  const expectedFields = Object.keys(qualityChecks).length;
  const dataQualityLevel =
    availableFields >= Math.ceil(expectedFields * 0.8) ? 'high'
      : availableFields >= Math.ceil(expectedFields * 0.55) ? 'medium'
      : 'low';

  const scoreNumber = Number.isFinite(
    Number(scoreData.score)
  )
    ? Number(scoreData.score)
    : 50;

  const headline =
    `بازار ${regimeFa(scoreData.regime)} ` +
    `با امتیاز ${scoreNumber} از 100 ارزیابی می‌شود؛ ` +
    `سطح ریسک ${riskFa(riskState)} است.`;

  return {
    version: '2.1',

    generatedAt: new Date().toISOString(),

    date: dateOnly(current.summaryDate),

    headline,

    regime: {
      key: scoreData.regime,
      label: regimeFa(scoreData.regime),
      score: scoreNumber,
      components: scoreData.components
    },

    indexes: {
      overall: {
        value: num(current.overallIndex),
        changeValue: num(current.overallChange),
        changePercent: overallChangePct
      },

      equalWeight: {
        value: num(current.equalIndex),
        changeValue: num(current.equalChange),
        changePercent: equalChangePct
      }
    },

    breadth,

    liquidity: liquidityData,

    moneyFlow,

    sectors: sectorData,

    momentum: momentumData,

    risk: {
      state: riskState,
      label: riskFa(riskState),
      volatility: volatilityData.volatility,
      volatilityState: volatilityData.state
    },

    divergences: divergences(
      current,
      breadth,
      liquidityData,
      momentumData
    ),

    leaders: {
      gainers: (breadth?.topGainers?.length ? breadth.topGainers : arr(current.topGainers)).slice(0,5),
      losers: (breadth?.topLosers?.length ? breadth.topLosers : arr(current.topLosers)).slice(0,5),
      volumes: (breadth?.topVolumes?.length ? breadth.topVolumes : arr(current.topVolumes)).slice(0,5)
    },

    scenarios: scenarios(
      scoreNumber
    ),

    action: action(
      scoreNumber,
      breadth,
      liquidityData,
      riskState
    ),

    dataQuality: {
      level: dataQualityLevel,
      availableFields,
      expectedFields,
      checks: qualityChecks,
      symbolsCoverage:
        breadth?.available && Number.isFinite(Number(breadth.coveragePercent))
          ? Number(Number(breadth.coveragePercent).toFixed(1))
          : null,
      breadthAvailable:
        Boolean(breadth?.available),
      breadthReason:
        breadth?.reason || null
    }
  };
}

module.exports = {
  buildMarketIntelligence,
  regimeFa
};