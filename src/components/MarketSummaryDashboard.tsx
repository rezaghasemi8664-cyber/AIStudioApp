import React, { useEffect, useMemo, useState } from 'react';
import { getLatestSummary } from '../services/marketSummaryService';

export interface MarketSummaryDashboardProps {
  intelligence?: any;
  content?: string | null;
  loading?: boolean;
}

/* ============================================================================
   FORMATTERS
============================================================================ */

const faNumber = new Intl.NumberFormat('fa-IR', {
  maximumFractionDigits: 2,
});

const faInteger = new Intl.NumberFormat('fa-IR', {
  maximumFractionDigits: 0,
});

const formatNumber = (value: any, integer = false): string => {
  if (value === null || value === undefined || value === '') {
    return 'داده در دسترس نیست';
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return (integer ? faInteger : faNumber).format(value);
  }

  return String(value);
};

const formatPercent = (value: any): string => {
  if (value === null || value === undefined || value === '') {
    return 'داده در دسترس نیست';
  }

  const number =
    typeof value === 'number'
      ? faNumber.format(value)
      : String(value);

  return `${number}٪`;
};

const formatSignedPercent = (value: any): string => {
  if (value === null || value === undefined || value === '') {
    return 'داده در دسترس نیست';
  }

  const numeric = Number(value);

  if (Number.isFinite(numeric)) {
    const sign = numeric > 0 ? '+' : '';
    return `${sign}${faNumber.format(numeric)}٪`;
  }

  return String(value);
};

/* ============================================================================
   PERSIAN TERMINOLOGY
============================================================================ */

const translate = (value: any): string => {
  if (value === null || value === undefined || value === '') {
    return 'داده در دسترس نیست';
  }

  const dictionary: Record<string, string> = {
    bullish: 'صعودی',
    bullish_cautious: 'صعودی محتاطانه',
    neutral: 'خنثی',
    bearish_cautious: 'نزولی محتاطانه',
    bearish: 'نزولی',

    low: 'کم',
    medium: 'متوسط',
    high: 'زیاد',

    Breadth: 'پهنای بازار',
    breadth: 'پهنای بازار',

    Momentum: 'قدرت حرکت',
    momentum: 'قدرت حرکت',

    Bias: 'سوگیری معاملاتی',
    bias: 'سوگیری معاملاتی',

    Liquidity: 'نقدشوندگی',
    liquidity: 'نقدشوندگی',

    Volatility: 'نوسان',
    volatility: 'نوسان',

    Risk: 'ریسک',
    risk: 'ریسک',

    Divergence: 'واگرایی',
    divergence: 'واگرایی',

    Confirmation: 'تأیید',
    confirmation: 'تأیید',

    Invalidation: 'ابطال',
    invalidation: 'ابطال',

    Snapshot: 'تصویر فعلی بازار',
    snapshot: 'تصویر فعلی بازار',

    Score: 'امتیاز',
    score: 'امتیاز',
  };

  return dictionary[String(value)] ?? String(value);
};

const toneFromValue = (
  value: any
): 'positive' | 'negative' | 'warning' | 'neutral' => {
  const text = String(value ?? '').toLowerCase();

  if (
    text.includes('bullish') ||
    text.includes('صعودی') ||
    text.includes('مثبت') ||
    text.includes('خوب') ||
    text.includes('کم')
  ) {
    return 'positive';
  }

  if (
    text.includes('bearish') ||
    text.includes('نزولی') ||
    text.includes('منفی') ||
    text.includes('ضعیف')
  ) {
    return 'negative';
  }

  if (
    text.includes('warning') ||
    text.includes('هشدار') ||
    text.includes('متوسط')
  ) {
    return 'warning';
  }

  return 'neutral';
};

/* ============================================================================
   SHARED COMPONENTS
============================================================================ */

const SectionCard = ({
  number,
  title,
  description,
  children,
}: {
  number: number;
  title: string;
  description?: string;
  children: React.ReactNode;
}) => (
  <section className="rounded-[20px] border border-white/[0.09] bg-slate-900/70 p-5 shadow-[0_10px_35px_rgba(0,0,0,0.16)] md:p-6">
    <div className="mb-5 flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-sky-400/20 bg-sky-500/10 text-[13px] font-extrabold text-sky-300">
        {number}
      </div>

      <div className="min-w-0">
        <h3 className="text-[17px] font-extrabold leading-7 text-white">
          {title}
        </h3>

        {description && (
          <p className="mt-1 text-[14px] leading-[1.9] text-slate-300">
            {description}
          </p>
        )}
      </div>
    </div>

    {children}
  </section>
);

const ExplanationCard = ({
  title = 'توضیح تحلیلی',
  children,
  tone = 'info',
}: {
  title?: string;
  children: React.ReactNode;
  tone?: 'info' | 'positive' | 'warning' | 'negative';
}) => {
  const styles = {
    info: 'border-sky-400/15 bg-sky-500/[0.045]',
    positive: 'border-emerald-400/15 bg-emerald-500/[0.045]',
    warning: 'border-amber-400/15 bg-amber-500/[0.045]',
    negative: 'border-rose-400/15 bg-rose-500/[0.045]',
  };

  const titleStyles = {
    info: 'text-sky-300',
    positive: 'text-emerald-300',
    warning: 'text-amber-300',
    negative: 'text-rose-300',
  };

  return (
    <div
      className={`rounded-2xl border p-4 md:p-5 ${styles[tone]}`}
    >
      <div
        className={`mb-2 text-[14px] font-extrabold ${titleStyles[tone]}`}
      >
        {title}
      </div>

      <div className="text-[15px] font-normal leading-[2] text-slate-200">
        {children}
      </div>
    </div>
  );
};

const KpiCard = ({
  label,
  value,
  secondary,
  tone = 'default',
}: {
  label: string;
  value: React.ReactNode;
  secondary?: React.ReactNode;
  tone?: 'default' | 'positive' | 'negative' | 'warning' | 'info';
}) => {
  const valueColor = {
    default: 'text-white',
    positive: 'text-emerald-300',
    negative: 'text-rose-300',
    warning: 'text-amber-300',
    info: 'text-sky-300',
  };

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-slate-800/45 p-4 md:p-5">
      <div className="mb-2 text-[13px] font-medium leading-6 text-slate-300">
        {label}
      </div>

      <div
        className={`text-[21px] font-extrabold leading-9 tracking-tight ${valueColor[tone ?? 'default']}`}
      >
        {value}
      </div>

      {secondary && (
        <div className="mt-1 text-[13px] leading-6 text-slate-300">
          {secondary}
        </div>
      )}
    </div>
  );
};

const StatusBadge = ({
  value,
  tone,
}: {
  value: any;
  tone?: 'positive' | 'negative' | 'warning' | 'neutral' | 'info';
}) => {
  const currentTone: 'positive' | 'negative' | 'warning' | 'neutral' | 'info' = tone ?? toneFromValue(value);

  const styles = {
    positive:
      'border-emerald-400/20 bg-emerald-500/10 text-emerald-300',
    negative:
      'border-rose-400/20 bg-rose-500/10 text-rose-300',
    warning:
      'border-amber-400/20 bg-amber-500/10 text-amber-300',
    neutral:
      'border-slate-400/20 bg-slate-500/10 text-slate-300',
    info:
      'border-sky-400/20 bg-sky-500/10 text-sky-300',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-[12px] font-bold ${styles[currentTone]}`}
    >
      {translate(value)}
    </span>
  );
};

const MissingDataCard = ({
  title = 'داده در دسترس نیست',
  description = 'اطلاعات این بخش در تصویر فعلی بازار موجود نیست.',
}: {
  title?: string;
  description?: string;
}) => (
  <div className="rounded-2xl border border-white/[0.08] bg-slate-800/25 p-5">
    <div className="text-[14px] font-bold text-slate-300">
      {title}
    </div>

    <div className="mt-1 text-[14px] leading-[1.9] text-slate-400">
      {description}
    </div>
  </div>
);

const AlertCard = ({
  title,
  text,
  tone = 'warning',
}: {
  title: string;
  text: string;
  tone?: 'positive' | 'negative' | 'warning' | 'info';
}) => (
  <ExplanationCard title={title} tone={tone}>
    {text}
  </ExplanationCard>
);

const ListRow = ({
  name,
  value,
  tone = 'neutral',
}: {
  name: string;
  value?: React.ReactNode;
  tone?: 'positive' | 'negative' | 'neutral';
}) => {
  const color =
    tone === 'positive'
      ? 'text-emerald-300'
      : tone === 'negative'
        ? 'text-rose-300'
        : 'text-slate-200';

  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/[0.06] py-3 last:border-b-0">
      <span className="text-[14px] leading-7 text-slate-200">
        {name}
      </span>

      {value !== undefined && (
        <span className={`shrink-0 text-[14px] font-bold ${color}`}>
          {value}
        </span>
      )}
    </div>
  );
};

/* ============================================================================
   MAIN
============================================================================ */

export default function MarketSummaryDashboard({
  intelligence: suppliedIntelligence,
  content,
  loading,
}: MarketSummaryDashboardProps) {
  const [fetchedIntelligence, setFetchedIntelligence] =
    useState<any>(null);

  const [fetching, setFetching] = useState(false);

  const [fetchedContent, setFetchedContent] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;

    let active = true;

    setFetching(true);

    getLatestSummary()
      .then((summary: any) => {
        if (active) {
          setFetchedIntelligence(
            summary?.marketIntelligence ?? null
          );
          setFetchedContent(
            summary?.content ?? summary?.summary ?? null
          );
        }
      })
      .catch(() => {
        if (active) setFetchedIntelligence(null);
      })
      .finally(() => {
        if (active) setFetching(false);
      });

    return () => {
      active = false;
    };
  }, [suppliedIntelligence, loading]);

  const intelligence =
    suppliedIntelligence ?? fetchedIntelligence;

  const canonicalContent = fetchedContent ?? content ?? null;

  if (loading || fetching) {
    return (
      <div
        dir="rtl"
        className="rounded-[20px] border border-white/10 bg-slate-950/70 p-8 text-center"
        style={{
          fontFamily:
            'Vazirmatn, IRANSans, Tahoma, Arial, sans-serif',
        }}
      >
        <div className="text-[16px] font-bold text-slate-200">
          در حال آماده‌سازی تحلیل جامع بازار…
        </div>

        <div className="mt-2 text-[14px] leading-[1.9] text-slate-400">
          داده‌های بازار در حال پردازش هستند.
        </div>
      </div>
    );
  }

  if (canonicalContent) {
    return (
      <div
        dir="rtl"
        className="rounded-[20px] border border-white/10 bg-slate-950/70 p-6"
        style={{
          fontFamily:
            'Vazirmatn, IRANSans, Tahoma, Arial, sans-serif',
        }}
      >
        <div className="text-[18px] font-extrabold text-white">
          خلاصه بازار
        </div>
        <div className="mt-4 whitespace-pre-wrap rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 text-[15px] leading-[2] text-slate-200">
          {canonicalContent}
        </div>
      </div>
    );
  }

  if (canonicalContent) {
    return (
      <div
        dir="rtl"
        className="rounded-[20px] border border-white/10 bg-slate-950/70 p-6"
        style={{ fontFamily: 'Vazirmatn, IRANSans, Tahoma, Arial, sans-serif' }}
      >
        <div className="text-[18px] font-extrabold text-white">خلاصه بازار</div>
        <div className="mt-4 whitespace-pre-wrap rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 text-[15px] leading-[2] text-slate-200">
          {canonicalContent}
        </div>
      </div>
    );
  }

  if (canonicalContent) {
    return (
      <div
        dir="rtl"
        className="rounded-[20px] border border-white/10 bg-slate-950/70 p-6"
        style={{
          fontFamily:
            'Vazirmatn, IRANSans, Tahoma, Arial, sans-serif',
        }}
      >
        <div className="text-[18px] font-extrabold text-white">
          خلاصه بازار
        </div>
        <div className="mt-4 whitespace-pre-wrap rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 text-[15px] leading-[2] text-slate-200">
          {canonicalContent}
        </div>
      </div>
    );
  }

  if (canonicalContent) {
    return (
      <div
        dir="rtl"
        className="rounded-[20px] border border-white/10 bg-slate-950/70 p-6"
        style={{
          fontFamily:
            'Vazirmatn, IRANSans, Tahoma, Arial, sans-serif',
        }}
      >
        <div className="text-[18px] font-extrabold text-white">
          خلاصه بازار
        </div>
        <div className="mt-4 whitespace-pre-wrap rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 text-[15px] leading-[2] text-slate-200">
          {canonicalContent}
        </div>
      </div>
    );
  }

  if (!intelligence) {
    return (
      <div
        dir="rtl"
        className="rounded-[20px] border border-white/10 bg-slate-950/70 p-6"
        style={{
          fontFamily:
            'Vazirmatn, IRANSans, Tahoma, Arial, sans-serif',
        }}
      >
        <div className="text-[18px] font-extrabold text-white">
          خلاصه بازار
        </div>

        <div className="mt-4 whitespace-pre-wrap rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 text-[15px] leading-[2] text-slate-200">
          {content || 'تحلیل بازار در دسترس نیست.'}
        </div>
      </div>
    );
  }

  const r = intelligence.regime || {};
  const idx = intelligence.indexes || {};
  const b = intelligence.breadth || {};
  const l = intelligence.liquidity || {};
  const f = intelligence.moneyFlow || {};
  const sectors = intelligence.sectors || {};
  const m = intelligence.momentum || {};
  const risk = intelligence.risk || {};
  const action = intelligence.action || {};
  const leaders = intelligence.leaders || {};
  const normalizedLeaders: { gainers: unknown[]; losers: unknown[]; volumes: unknown[] } = { gainers: Array.isArray(leaders.gainers) ? leaders.gainers : [], losers: Array.isArray(leaders.losers) ? leaders.losers : [], volumes: Array.isArray(leaders.volumes) ? leaders.volumes : Array.isArray(leaders.volume) ? leaders.volume : [] };
  const dataQuality =
    intelligence.dataQuality ||
    intelligence.data_quality ||
    {};

  const dataQualityAvailable =
    dataQuality.availableFields ?? dataQuality.availableComponents;
  const dataQualityExpected =
    dataQuality.expectedFields ?? dataQuality.totalComponents;
  const dataQualityCoverage =
    dataQualityExpected > 0 ? (Number(dataQualityAvailable) / Number(dataQualityExpected)) * 100 : null;

  const hasRealMoneyFlow = Boolean(f.available) || hasValue(f.net) || hasValue(f.netValue);
  const sectorLeaders = Array.isArray(sectors.leaders) ? sectors.leaders : [];
  const sectorLaggards = Array.isArray(sectors.laggards) ? sectors.laggards : [];

  const divergences = Array.isArray(intelligence.divergences)
    ? intelligence.divergences
    : [];

  const scenarios = Array.isArray(intelligence.scenarios)
    ? intelligence.scenarios
    : [];

  const confirmations = Array.isArray(
    action.confirmation || intelligence.confirmation
  )
    ? action.confirmation || intelligence.confirmation
    : [];

  const invalidations = Array.isArray(
    action.invalidation || intelligence.invalidation
  )
    ? action.invalidation || intelligence.invalidation
    : [];

  const breadthTotal =
    Number(b.classifiedTotal) ||
    Number(b.total) ||
    Number(b.positive || 0) +
      Number(b.negative || 0) +
      Number(b.neutral || 0);

  const positivePct =
    b.positivePercent ??
    (breadthTotal
      ? (Number(b.positive || 0) / breadthTotal) * 100
      : null);

  const negativePct =
    b.negativePercent ??
    (breadthTotal
      ? (Number(b.negative || 0) / breadthTotal) * 100
      : null);

  const neutralPct =
    b.neutralPercent ??
    (breadthTotal
      ? (Number(b.neutral || 0) / breadthTotal) * 100
      : null);

  const regimeTone: 'info' | 'warning' | 'neutral' | 'positive' | 'negative' = toneFromValue(r.state);

  const score = r.score ?? intelligence.score;

  const actionBias =
    action.bias ||
    intelligence.bias ||
    'داده در دسترس نیست';

  return (
    <div
      dir="rtl"
      className="space-y-4 text-right text-[14px] leading-[1.9]"
      style={{
        fontFamily:
          'Vazirmatn, IRANSans, Tahoma, Arial, sans-serif',
      }}
    >
      {/* ================================================================== */}
      {/* 1. REGIME                                                          */}
      {/* ================================================================== */}

      <SectionCard
        number={1}
        title="رژیم و امتیاز بازار"
        description="ارزیابی کلی وضعیت بازار بر اساس مجموعه‌ای از شاخص‌های اصلی."
      >
        <div className="grid gap-5 lg:grid-cols-[1fr_180px]">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-[26px] font-black leading-10 text-white">
                {r.label || translate(r.state)}
              </h2>

              <StatusBadge
                value={r.state || 'neutral'}
                tone={regimeTone}
              />
            </div>

            <div className="mt-5">
              <ExplanationCard
                title="توضیح وضعیت بازار"
                tone={
                  regimeTone === 'positive'
                    ? 'positive'
                    : regimeTone === 'negative'
                      ? 'negative'
                      : 'info'
                }
              >
                {intelligence.headline ||
                  'تحلیل جامع بازار بر اساس داده‌های موجود.'}
              </ExplanationCard>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center rounded-3xl border border-white/[0.08] bg-slate-800/50 p-5 text-center">
            <div className="text-[48px] font-black leading-none tracking-tight text-white">
              {score !== null && score !== undefined
                ? faNumber.format(Number(score))
                : '—'}
            </div>

            <div className="mt-3 text-[13px] font-medium text-slate-300">
              امتیاز بازار
            </div>

            <div className="mt-1 text-[12px] text-slate-400">
              از ۱۰۰
            </div>
          </div>
        </div>
      </SectionCard>

      {/* ================================================================== */}
      {/* 2. INDEXES                                                         */}
      {/* ================================================================== */}

      <SectionCard
        number={2}
        title="شاخص‌ها"
        description="مقدار فعلی شاخص کل و شاخص هم‌وزن به همراه تغییر روزانه."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <KpiCard
            label="شاخص کل"
            value={formatNumber(idx.overall?.value)}
            secondary={
              hasValue(idx.overall?.changePercent)
                ? `تغییر روزانه: ${formatSignedPercent(
                    idx.overall.changePercent
                  )}`
                : 'تغییر روزانه در دسترس نیست'
            }
            tone={
              Number(idx.overall?.changePercent) > 0
                ? 'positive'
                : Number(idx.overall?.changePercent) < 0
                  ? 'negative'
                  : 'default'
            }
          />

          <KpiCard
            label="شاخص هم‌وزن"
            value={formatNumber(idx.equalWeight?.value)}
            secondary={
              hasValue(idx.equalWeight?.changePercent)
                ? `تغییر روزانه: ${formatSignedPercent(
                    idx.equalWeight.changePercent
                  )}`
                : 'تغییر روزانه در دسترس نیست'
            }
            tone={
              Number(idx.equalWeight?.changePercent) > 0
                ? 'positive'
                : Number(idx.equalWeight?.changePercent) < 0
                  ? 'negative'
                  : 'default'
            }
          />
        </div>
      </SectionCard>

      {/* ================================================================== */}
      {/* 3. BREADTH                                                         */}
      {/* ================================================================== */}

      <SectionCard
        number={3}
        title="پهنای بازار"
        description="توزیع نمادهای مثبت، منفی و خنثی در بازار."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <KpiCard
            label="نمادهای مثبت"
            value={formatNumber(b.positive, true)}
            secondary={formatPercent(positivePct)}
            tone="positive"
          />

          <KpiCard
            label="نمادهای منفی"
            value={formatNumber(b.negative, true)}
            secondary={formatPercent(negativePct)}
            tone="negative"
          />

          <KpiCard
            label="نمادهای خنثی"
            value={formatNumber(b.neutral, true)}
            secondary={formatPercent(neutralPct)}
            tone="default"
          />
        </div>

        {breadthTotal > 0 && (
          <div className="mt-5">
            <div className="mb-2 flex h-3 overflow-hidden rounded-full bg-white/10">
              <div
                className="bg-emerald-400"
                style={{
                  width: `${Math.max(
                    0,
                    Math.min(100, Number(positivePct) || 0)
                  )}%`,
                }}
              />

              <div
                className="bg-rose-400"
                style={{
                  width: `${Math.max(
                    0,
                    Math.min(100, Number(negativePct) || 0)
                  )}%`,
                }}
              />

              <div
                className="bg-slate-400"
                style={{
                  width: `${Math.max(
                    0,
                    Math.min(100, Number(neutralPct) || 0)
                  )}%`,
                }}
              />
            </div>

            <div className="flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-slate-300">
              <span>
                مجموع نمادهای طبقه‌بندی‌شده:{' '}
                {formatNumber(breadthTotal, true)}
              </span>

              {b.interpretation && (
                <span>
                  ارزیابی: {translate(b.interpretation)}
                </span>
              )}
            </div>
          </div>
        )}

        {b.interpretation && (
          <div className="mt-5">
            <ExplanationCard title="توضیح پهنای بازار" tone="positive">
              {translate(b.interpretation)}
            </ExplanationCard>
          </div>
        )}
      </SectionCard>

      {/* ================================================================== */}
      {/* 4. LIQUIDITY                                                       */}
      {/* ================================================================== */}

      <SectionCard
        number={4}
        title="نقدشوندگی و معاملات"
        description="بررسی ارزش، حجم و تعداد معاملات و وضعیت نقدشوندگی بازار."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="ارزش معاملات"
            value={
              hasValue(l.value)
                ? formatNumber(l.value)
                : 'داده در دسترس نیست'
            }
            secondary={
              hasValue(l.valueVsPreviousPct)
                ? `تغییر نسبت به روز قبل: ${formatSignedPercent(
                    l.valueVsPreviousPct
                  )}`
                : undefined
            }
          />

          <KpiCard
            label="حجم معاملات"
            value={
              hasValue(l.volume)
                ? formatNumber(l.volume)
                : 'داده در دسترس نیست'
            }
          />

          <KpiCard
            label="تعداد معاملات"
            value={
              hasValue(
                intelligence.tradeCount ??
                  intelligence.totalTrades
              )
                ? formatNumber(
                    intelligence.tradeCount ??
                      intelligence.totalTrades,
                    true
                  )
                : 'داده در دسترس نیست'
            }
          />

          <KpiCard
            label="وضعیت نقدشوندگی"
            value={
              l.label ||
              l.interpretation ||
              'داده در دسترس نیست'
            }
            tone={toneFromValue(l.label) as 'info' | 'warning' | 'default' | 'positive' | 'negative'}
          />
        </div>

        {(l.interpretation || l.description) && (
          <div className="mt-5">
            <ExplanationCard title="توضیح نقدشوندگی" tone="info">
              {l.interpretation || l.description}
            </ExplanationCard>
          </div>
        )}
      </SectionCard>

      {/* ================================================================== */}
      {/* 5. MONEY FLOW                                                       */}
      {/* ================================================================== */}

      <SectionCard
        number={5}
        title="جریان پول حقیقی"
        description="بررسی ورود و خروج سرمایه حقیقی در بازار."
      >
        {f.available === false ||
        (!hasValue(f.net) &&
          !hasValue(f.intensity) &&
          !hasValue(f.state)) ? (
          <MissingDataCard
            title="جریان پول حقیقی"
            description="داده این بخش در تصویر فعلی بازار موجود نیست."
          />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                label="خالص جریان پول"
                value={formatNumber(f.net)}
                tone={
                  Number(f.net) > 0
                    ? 'positive'
                    : Number(f.net) < 0
                      ? 'negative'
                      : 'default'
                }
              />

              <KpiCard
                label="شدت جریان"
                value={formatNumber(f.intensity)}
              />

              <KpiCard
                label="وضعیت جریان"
                value={translate(
                  f.label || f.state
                )}
                tone={toneFromValue(f.state) as 'info' | 'warning' | 'default' | 'positive' | 'negative'}
              />

              <KpiCard
                label="کیفیت داده"
                value={
                  f.quality || 'داده در دسترس نیست'
                }
                tone="default"
              />
            </div>

            {f.interpretation && (
              <div className="mt-5">
                <ExplanationCard title="توضیح جریان پول" tone="info">
                  {translate(f.interpretation)}
                </ExplanationCard>
              </div>
            )}
          </>
        )}
      </SectionCard>

      {/* ================================================================== */}
      {/* 6. SECTORS                                                         */}
      {/* ================================================================== */}

      <SectionCard
        number={6}
        title="چرخش صنایع"
        description="شناسایی گروه‌های قوی‌تر و ضعیف‌تر بازار."
      >
        {sectors.available === false ||
        (!Array.isArray(sectors.leaders) &&
          !Array.isArray(sectors.laggards)) ? (
          <MissingDataCard
            title="چرخش صنایع"
            description="داده صنعت در تصویر فعلی بازار موجود نیست."
          />
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-emerald-400/10 bg-emerald-500/[0.035] p-4">
              <div className="mb-2 text-[15px] font-extrabold text-emerald-300">
                قوی‌ترین صنایع
              </div>

              {Array.isArray(sectors.leaders) &&
              sectors.leaders.length ? (
                sectors.leaders
                  .slice(0, 6)
                  .map((item: any, index: number) => (
                    <ListRow
                      key={index}
                      name={
                        item.name ||
                        item.title ||
                        item.sector ||
                        'نامشخص'
                      }
                      value={formatSignedPercent(
                        item.changePercent
                      )}
                      tone="positive"
                    />
                  ))
              ) : (
                <MissingDataCard description="اطلاعات صنایع قوی موجود نیست." />
              )}
            </div>

            <div className="rounded-2xl border border-rose-400/10 bg-rose-500/[0.035] p-4">
              <div className="mb-2 text-[15px] font-extrabold text-rose-300">
                ضعیف‌ترین صنایع
              </div>

              {Array.isArray(sectors.laggards) &&
              sectors.laggards.length ? (
                sectors.laggards
                  .slice(0, 6)
                  .map((item: any, index: number) => (
                    <ListRow
                      key={index}
                      name={
                        item.name ||
                        item.title ||
                        item.sector ||
                        'نامشخص'
                      }
                      value={formatSignedPercent(
                        item.changePercent
                      )}
                      tone="negative"
                    />
                  ))
              ) : (
                <MissingDataCard description="اطلاعات صنایع ضعیف موجود نیست." />
              )}
            </div>
          </div>
        )}
      </SectionCard>

      {/* ================================================================== */}
      {/* 7. MOMENTUM                                                         */}
      {/* ================================================================== */}

      <SectionCard
        number={7}
        title="قدرت حرکت بازار"
        description="بررسی روند حرکتی بازار در بازه‌های کوتاه‌مدت و میان‌مدت."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="تغییر ۵ جلسه اخیر"
            value={formatSignedPercent(m.fiveDayChangePct)}
            tone={
              Number(m.fiveDayChangePct) > 0
                ? 'positive'
                : Number(m.fiveDayChangePct) < 0
                  ? 'negative'
                  : 'default'
            }
          />

          <KpiCard
            label="تغییر ۱۰ جلسه اخیر"
            value={
              hasValue(m.tenDayChangePct)
                ? formatSignedPercent(
                    m.tenDayChangePct
                  )
                : 'داده در دسترس نیست'
            }
          />

          <KpiCard
            label="تغییر ۲۰ جلسه اخیر"
            value={
              hasValue(m.twentyDayChangePct)
                ? formatSignedPercent(
                    m.twentyDayChangePct
                  )
                : 'داده در دسترس نیست'
            }
          />

          <KpiCard
            label="وضعیت قدرت حرکت"
            value={
              m.label ||
              translate(m.state) ||
              'داده در دسترس نیست'
            }
            tone={toneFromValue(m.state) as 'info' | 'warning' | 'default' | 'positive' | 'negative'}
          />
        </div>

        {hasValue(m.positiveDays) && (
          <div className="mt-4 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 text-[14px] text-slate-200">
            تعداد جلسات مثبت:{' '}
            <strong className="text-white">
              {formatNumber(m.positiveDays, true)}
            </strong>
          </div>
        )}

        {m.interpretation && (
          <div className="mt-5">
            <ExplanationCard title="توضیح قدرت حرکت" tone="positive">
              {m.interpretation}
            </ExplanationCard>
          </div>
        )}
      </SectionCard>

      {/* ================================================================== */}
      {/* 8. RISK                                                            */}
      {/* ================================================================== */}

      <SectionCard
        number={8}
        title="ریسک و نوسان"
        description="ارزیابی سطح ریسک، میزان نوسان و روند تغییر ریسک."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="سطح ریسک"
            value={
              risk.label ||
              translate(risk.state) ||
              'داده در دسترس نیست'
            }
            tone={toneFromValue(risk.state) as 'info' | 'warning' | 'default' | 'positive' | 'negative'}
          />

          <KpiCard
            label="نوسان"
            value={
              hasValue(risk.volatility)
                ? formatPercent(risk.volatility)
                : 'داده در دسترس نیست'
            }
          />

          <KpiCard
            label="روند ریسک"
            value={
              risk.trend ||
              'داده در دسترس نیست'
            }
          />

          <KpiCard
            label="هشدار ریسک"
            value={
              risk.warning ||
              'هشداری ثبت نشده است'
            }
            tone={risk.warning ? 'warning' : 'default'}
          />
        </div>
      </SectionCard>

      {/* ================================================================== */}
      {/* 9. DIVERGENCES                                                     */}
      {/* ================================================================== */}

      <SectionCard
        number={9}
        title="واگرایی‌ها و هشدارها"
        description="هشدارهای تحلیلی و نشانه‌هایی که می‌توانند در تصمیم‌گیری بازار مؤثر باشند."
      >
        {divergences.length ? (
          <div className="space-y-3">
            {divergences.map(
              (item: any, index: number) => (
                <AlertCard
                  key={index}
                  title={
                    item.title ||
                    item.name ||
                    `هشدار تحلیلی ${index + 1}`
                  }
                  text={
                    item.text ||
                    item.message ||
                    item.description ||
                    String(item)
                  }
                  tone={
                    item.severity === 'high' ||
                    item.severity === 'critical'
                      ? 'negative'
                      : item.severity === 'medium'
                        ? 'warning'
                        : 'info'
                  }
                />
              )
            )}
          </div>
        ) : (
          <AlertCard
            title="واگرایی معنادار"
            text="در داده‌های موجود واگرایی معناداری مشاهده نشده است."
            tone="positive"
          />
        )}
      </SectionCard>

      {/* ================================================================== */}
      {/* 10. MARKET MOVERS                                                   */}
      {/* ================================================================== */}

      <SectionCard
        number={10}
        title="نمادهای شاخص حرکت"
        description="نمادهای برجسته از نظر رشد، افت و حجم معاملات."
      >
        <div className="grid gap-5 md:grid-cols-3">
          <div className="rounded-2xl border border-emerald-400/10 bg-emerald-500/[0.035] p-4">
            <div className="mb-2 text-[15px] font-extrabold text-emerald-300">
              برترین رشدها
            </div>

            {Array.isArray(leaders.gainers) &&
            leaders.gainers.length ? (
              leaders.gainers
                .slice(0, 6)
                .map((item: any, index: number) => (
                  <ListRow
                    key={index}
                    name={
                      item.symbol ||
                      item.name ||
                      'نامشخص'
                    }
                    value={formatSignedPercent(
                      item.changePercent
                    )}
                    tone="positive"
                  />
                ))
            ) : (
              <MissingDataCard description="اطلاعات برترین رشدها موجود نیست." />
            )}
          </div>

          <div className="rounded-2xl border border-rose-400/10 bg-rose-500/[0.035] p-4">
            <div className="mb-2 text-[15px] font-extrabold text-rose-300">
              برترین افت‌ها
            </div>

            {Array.isArray(leaders.losers) &&
            leaders.losers.length ? (
              leaders.losers
                .slice(0, 6)
                .map((item: any, index: number) => (
                  <ListRow
                    key={index}
                    name={
                      item.symbol ||
                      item.name ||
                      'نامشخص'
                    }
                    value={formatSignedPercent(
                      item.changePercent
                    )}
                    tone="negative"
                  />
                ))
            ) : (
              <MissingDataCard description="اطلاعات برترین افت‌ها موجود نیست." />
            )}
          </div>

          <div className="rounded-2xl border border-sky-400/10 bg-sky-500/[0.035] p-4">
            <div className="mb-2 text-[15px] font-extrabold text-sky-300">
              برترین حجم‌ها
            </div>

            {Array.isArray(leaders.volume) &&
            leaders.volume.length ? (
              leaders.volume
                .slice(0, 6)
                .map((item: any, index: number) => (
                  <ListRow
                    key={index}
                    name={
                      item.symbol ||
                      item.name ||
                      'نامشخص'
                    }
                    value={
                      hasValue(item.volume)
                        ? formatNumber(
                            item.volume,
                            true
                          )
                        : 'داده در دسترس نیست'
                    }
                  />
                ))
            ) : (
              <MissingDataCard description="اطلاعات برترین حجم‌ها موجود نیست." />
            )}
          </div>
        </div>
      </SectionCard>

      {/* ================================================================== */}
      {/* 11. SCENARIOS                                                       */}
      {/* ================================================================== */}

      <SectionCard
        number={11}
        title="سناریوهای پیش‌رو"
        description="سه مسیر اصلی احتمالی برای ادامه حرکت بازار."
      >
        {scenarios.length ? (
          <div className="grid gap-4 md:grid-cols-3">
            {scenarios.slice(0, 3).map(
              (item: any, index: number) => {
                const tone =
                  index === 1
                    ? 'positive'
                    : index === 2
                      ? 'negative'
                      : 'info';

                return (
                  <div
                    key={index}
                    className="rounded-2xl border border-white/[0.08] bg-slate-800/40 p-5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h4 className="text-[16px] font-extrabold leading-7 text-white">
                        {item.title ||
                          item.name ||
                          `سناریوی ${index + 1}`}
                      </h4>

                      {hasValue(item.probability) && (
                        <StatusBadge
                          value={formatPercent(
                            item.probability
                          )}
                          tone={tone}
                        />
                      )}
                    </div>

                    <div className="mt-4 text-[14px] leading-[2] text-slate-200">
                      {item.text ||
                        item.description ||
                        'توضیح این سناریو در دسترس نیست.'}
                    </div>

                    {item.trigger && (
                      <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.025] p-3 text-[13px] leading-[1.9] text-slate-300">
                        <strong className="text-slate-200">
                          عامل فعال‌کننده:
                        </strong>{' '}
                        {item.trigger}
                      </div>
                    )}
                  </div>
                );
              }
            )}
          </div>
        ) : (
          <MissingDataCard description="سناریوهای پیش‌رو در تصویر فعلی بازار موجود نیستند." />
        )}
      </SectionCard>

      {/* ================================================================== */}
      {/* 12. ACTION                                                          */}
      {/* ================================================================== */}

      <SectionCard
        number={12}
        title="نتیجه عملیاتی"
        description="جمع‌بندی کاربردی تحلیل برای تصمیم‌گیری معاملاتی."
      >
        <div className="grid gap-4 md:grid-cols-3">
          <KpiCard
            label="سوگیری معاملاتی"
            value={translate(actionBias)}
            tone={toneFromValue(actionBias) as 'info' | 'warning' | 'default' | 'positive' | 'negative'}
          />

          <KpiCard
            label="ریسک تصمیم"
            value={
              action.risk ||
              'داده در دسترس نیست'
            }
            tone={toneFromValue(action.risk) as 'info' | 'warning' | 'default' | 'positive' | 'negative'}
          />

          <KpiCard
            label="کاربرد عملی"
            value={
              action.application ||
              'داده در دسترس نیست'
            }
          />
        </div>

        {(action.interpretation ||
          intelligence.operationalConclusion) && (
          <div className="mt-5">
            <ExplanationCard
              title="جمع‌بندی عملیاتی"
              tone="info"
            >
              {action.interpretation ||
                intelligence.operationalConclusion}
            </ExplanationCard>
          </div>
        )}
      </SectionCard>

      {/* ================================================================== */}
      {/* 13. CONFIRMATION / INVALIDATION                                     */}
      {/* ================================================================== */}

      <SectionCard
        number={13}
        title="شروط تأیید و ابطال"
        description="شرایطی که می‌توانند سناریوی فعلی را تقویت یا بی‌اعتبار کنند."
      >
        <div className="grid gap-5 md:grid-cols-2">
          <div className="rounded-2xl border border-emerald-400/15 bg-emerald-500/[0.045] p-5">
            <div className="mb-3 text-[15px] font-extrabold text-emerald-300">
              شروط تأیید
            </div>

            {confirmations.length ? (
              <ul className="space-y-2 pr-5 text-[14px] leading-[2] text-slate-200">
                {confirmations.map(
                  (item: any, index: number) => (
                    <li key={index}>
                      {typeof item === 'string'
                        ? item
                        : item.text ||
                          item.description ||
                          item.condition ||
                          String(item)}
                    </li>
                  )
                )}
              </ul>
            ) : (
              <div className="text-[14px] text-slate-400">
                شرط تأیید مشخصی ثبت نشده است.
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-rose-400/15 bg-rose-500/[0.045] p-5">
            <div className="mb-3 text-[15px] font-extrabold text-rose-300">
              شروط ابطال
            </div>

            {invalidations.length ? (
              <ul className="space-y-2 pr-5 text-[14px] leading-[2] text-slate-200">
                {invalidations.map(
                  (item: any, index: number) => (
                    <li key={index}>
                      {typeof item === 'string'
                        ? item
                        : item.text ||
                          item.description ||
                          item.condition ||
                          String(item)}
                    </li>
                  )
                )}
              </ul>
            ) : (
              <div className="text-[14px] text-slate-400">
                شرط ابطال مشخصی ثبت نشده است.
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      {/* ================================================================== */}
      {/* 14. DATA QUALITY                                                    */}
      {/* ================================================================== */}

      <SectionCard
        number={14}
        title="کیفیت داده و محدودیت تحلیل"
        description="شفاف‌سازی میزان پوشش داده و محدودیت‌هایی که باید هنگام تفسیر گزارش در نظر گرفته شوند."
      >
        <div className="grid gap-3 md:grid-cols-3">
          <KpiCard
            label="کیفیت داده"
            value={
              dataQuality.label ||
              dataQuality.interpretation ||
              dataQuality.status ||
              (dataQualityCoverage !== null ? (dataQualityCoverage >= 80 ? 'بالا' : dataQualityCoverage >= 55 ? 'متوسط' : 'پایین') : 'مشخص نیست')
            }
            tone={
              ['high', 'good', 'بالا'].includes(
                String(dataQuality.status)
              )
                ? 'positive'
                : 'default'
            }
          />

          <KpiCard
            label="پوشش نمادها"
            value={
              hasValue(b.coveragePercent)
                ? formatPercent(
                    b.coveragePercent
                  )
                : 'داده در دسترس نیست'
            }
          />

          <KpiCard
            label="منبع داده"
            value={
              dataQuality.source ||
              intelligence.source ||
              'داده بازار'
            }
          />
        </div>

        {(hasValue(
          dataQuality.availableComponents
        ) ||
          hasValue(dataQuality.totalComponents)) && (
          <div className="mt-5 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 text-[14px] leading-[1.9] text-slate-300">
            <span>مؤلفه‌های موجود: </span>

            <strong className="text-white">
              {formatNumber(
                dataQualityAvailable,
                true
              )}
            </strong>

            {hasValue(dataQuality.totalComponents) && (
              <>
                <span> از </span>

                <strong className="text-white">
                  {formatNumber(
                    dataQualityExpected,
                    true
                  )}
                </strong>

                <span> مؤلفه اصلی</span>
              </>
            )}
          </div>
        )}

        {Array.isArray(dataQuality.warnings) &&
          dataQuality.warnings.length > 0 && (
            <div className="mt-5 space-y-3">
              {dataQuality.warnings.map(
                (warning: any, index: number) => (
                  <AlertCard
                    key={index}
                    title="محدودیت داده"
                    text={String(warning)}
                    tone="warning"
                  />
                )
              )}
            </div>
          )}

        {Array.isArray(dataQuality.limitations) &&
          dataQuality.limitations.length > 0 && (
            <div className="mt-5">
              <ExplanationCard
                title="محدودیت‌های تحلیل"
                tone="warning"
              >
                <ul className="space-y-2 pr-5">
                  {dataQuality.limitations.map(
                    (item: any, index: number) => (
                      <li key={index}>
                        {typeof item === 'string'
                          ? item
                          : item.text ||
                            item.description ||
                            String(item)}
                      </li>
                    )
                  )}
                </ul>
              </ExplanationCard>
            </div>
          )}
      </SectionCard>

      {/* ================================================================== */}
      {/* FULL TEXT REPORT                                                    */}
      {/* ================================================================== */}

      {content && (
        <details className="rounded-[20px] border border-white/[0.08] bg-slate-900/60 p-5 md:p-6">
          <summary className="cursor-pointer text-[16px] font-extrabold leading-7 text-white">
            مشاهده گزارش متنی کامل
          </summary>

          <div className="mt-5 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 whitespace-pre-wrap text-[15px] leading-[2] text-slate-200">
            {content}
          </div>
        </details>
      )}
    </div>
  );
}

/* ============================================================================
   SMALL HELPERS
============================================================================ */

function hasValue(value: any): boolean {
  return value !== null && value !== undefined && value !== '';
}
