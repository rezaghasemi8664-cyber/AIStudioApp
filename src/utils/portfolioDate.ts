export function normalizePortfolioDate(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  const normalized = raw
    .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[.\-]/g, '/');

  const compactMatch = normalized.match(/^(\d{4})(\d{2})(\d{2})(?:\D|$)/);
  if (compactMatch) {
    const year = Number(compactMatch[1]);
    const month = Number(compactMatch[2]);
    const day = Number(compactMatch[3]);
    if (year >= 1900 && month >= 1 && month <= 12 && day >= 1 && day <= 31) return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (year >= 1200 && year <= 1600 && month >= 1 && month <= 12 && day >= 1 && day <= 31) return jalaliToGregorian(year, month, day);
  }

  const isoMatch = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    if (year >= 1900 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    }
    if (year >= 1200 && year <= 1600 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return jalaliToGregorian(year, month, day);
    }
  }

  const jalaliMatch = normalized.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (jalaliMatch) {
    const jy = Number(jalaliMatch[1]);
    const jm = Number(jalaliMatch[2]);
    const jd = Number(jalaliMatch[3]);
    if (jy >= 1200 && jy <= 1600 && jm >= 1 && jm <= 12 && jd >= 1 && jd <= 31) {
      return jalaliToGregorian(jy, jm, jd);
    }
  }

  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : null;
}

const PERSIAN_FORMATTER = new Intl.DateTimeFormat('en-US-u-ca-persian', {
  timeZone: 'UTC', year: 'numeric', month: 'numeric', day: 'numeric',
});
const JALALI_GREGORIAN_CACHE = new Map<string,string>();
function jalaliToGregorian(jy: number, jm: number, jd: number): string {
  const target = { year: jy, month: jm, day: jd };
  const cacheKey = `${jy}-${jm}-${jd}`;
  const cached = JALALI_GREGORIAN_CACHE.get(cacheKey);
  if (cached) return cached;

  const readPersianParts = (date: Date) => {
    const raw = PERSIAN_FORMATTER.formatToParts(date);
    const get = (type: string) => Number(raw.find(part => part.type === type)?.value || 0);
    return { year: get('year'), month: get('month'), day: get('day') };
  };

  // 1 Farvardin is around 20/21 March. Search a bounded window so the
  // conversion is independent of Gregorian leap-year arithmetic.
  const approximateMs = Date.UTC(jy + 621, 2, 21, 12, 0, 0);
  let lo = approximateMs - 370 * 86400000, hi = approximateMs + 370 * 86400000;
  while (lo <= hi) {
    const mid = lo + Math.floor((hi - lo) / (2 * 86400000)) * 86400000;
    const candidate = new Date(mid);
    const parts = readPersianParts(candidate);
    const cmp = parts.year !== target.year ? parts.year - target.year : parts.month !== target.month ? parts.month - target.month : parts.day - target.day;
    if (cmp === 0) {
      const result = candidate.toISOString().slice(0, 10);
      JALALI_GREGORIAN_CACHE.set(cacheKey, result);
      return result;
    }
    if (cmp < 0) lo = mid + 86400000; else hi = mid - 86400000;
  }
  return '';
}


export function formatPortfolioNumber(value: number | null | undefined, maximumFractionDigits = 0): string {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return Number(value).toLocaleString('fa-IR', {
    maximumFractionDigits,
    minimumFractionDigits: maximumFractionDigits,
  });
}

export function formatPortfolioPercent(value: number | null | undefined, maximumFractionDigits = 2): string {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const n = Number(value);
  const sign = n > 0 ? '+' : '';
  return `${sign}${formatPortfolioNumber(n, maximumFractionDigits)}٪`;
}

export function formatPortfolioDate(value: unknown): string {
  const normalized = normalizePortfolioDate(value);
  if (!normalized) return '—';
  const [year, month, day] = normalized.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function formatPortfolioDateTime(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '—';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return formatPortfolioDate(value);
  return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
