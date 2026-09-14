import type { AnalysisDataQuality } from '../types';

// Deterministic analysis quality is intentionally shown separately from the trading signal.
type Props = {
  dataQuality?: AnalysisDataQuality | null;
  warnings?: string[];
};

function fa(value: number | string | null | undefined, digits = 0): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return n.toLocaleString('fa-IR', { maximumFractionDigits: digits });
}

function levelLabel(level?: string): string {
  switch (level) {
    case 'عالی': return 'عالی';
    case 'خوب': return 'خوب';
    case 'متوسط': return 'متوسط';
    case 'ضعیف': return 'ضعیف';
    default: return level || 'نامشخص';
  }
}

export default function AnalysisDataQualityCard({ dataQuality, warnings = [] }: Props) {
  if (!dataQuality) return null;

  const coverage = Math.max(0, Math.min(1, Number(dataQuality.coverageRatio) || 0));
  const coveragePercent = coverage * 100;
  const level = levelLabel(dataQuality.level);
  const isWeak = level === 'ضعیف' || coveragePercent < 70;
  const primaryWarning = warnings[0] || dataQuality.reasons?.find((reason) => reason.includes('پوشش OHLC'));

  return (
    <section
      dir="rtl"
      aria-label="کیفیت داده تحلیل"
      style={{
        marginTop: 16,
        padding: 16,
        borderRadius: 16,
        border: `1px solid ${isWeak ? 'rgba(245,158,11,.35)' : 'rgba(148,163,184,.2)'}`,
        background: 'rgba(15,23,42,.035)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15 }}>کیفیت داده تحلیل</div>
          <div style={{ marginTop: 4, fontSize: 12, opacity: .7 }}>
            کیفیت داده از سیگنال معاملاتی جداگانه نمایش داده می‌شود.
          </div>
        </div>
        <div style={{ fontWeight: 800, fontSize: 14 }}>
          {level} · {fa(dataQuality.score)} از ۱۰۰
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 10, marginTop: 14 }}>
        <div><div style={{ fontSize: 11, opacity: .65 }}>تاریخچه دریافتی</div><strong>{fa(dataQuality.rawHistoryCount)}</strong></div>
        <div><div style={{ fontSize: 11, opacity: .65 }}>کندل معتبر</div><strong>{fa(dataQuality.candleCount)}</strong></div>
        <div><div style={{ fontSize: 11, opacity: .65 }}>رکورد حذف‌شده</div><strong>{fa(dataQuality.invalidCandleCount)}</strong></div>
        <div><div style={{ fontSize: 11, opacity: .65 }}>پوشش OHLC</div><strong>{fa(coveragePercent, 1)}٪</strong></div>
      </div>

      <div style={{ marginTop: 14, height: 7, borderRadius: 999, background: 'rgba(148,163,184,.18)', overflow: 'hidden' }}>
        <div style={{ width: `${coveragePercent}%`, height: '100%', borderRadius: 999, background: isWeak ? '#f59e0b' : '#22c55e' }} />
      </div>

      {primaryWarning && (
        <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 12, background: 'rgba(245,158,11,.09)', fontSize: 12, lineHeight: 1.8 }}>
          ⚠️ {primaryWarning}
        </div>
      )}
    </section>
  );
}
