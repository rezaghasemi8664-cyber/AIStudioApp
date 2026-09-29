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

  const isoMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    if (year >= 1900 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
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

function jalaliToGregorian(jy: number, jm: number, jd: number): string {
  const gy = jy + 621;
  const breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
  let leapJ = -14;
  let jp = breaks[0];
  let jump = 0;
  for (let i = 1; i < breaks.length; i += 1) {
    const jmBreak = breaks[i];
    jump = jmBreak - jp;
    if (jy < jmBreak) break;
    leapJ += Math.floor(jump / 33) * 8 + Math.floor(((jump % 33) + 3) / 4);
    jp = jmBreak;
  }
  const n = jy - jp;
  if (jump === 33 && n === 4) leapJ += 1;
  const leapG = Math.floor(gy / 4) - Math.floor((Math.floor(gy / 100) + 1) * 3 / 4) - 150;
  const march = 20 + leapJ - leapG;
  const days = jm <= 6 ? (jm - 1) * 31 + (jd - 1) : (jm - 7) * 30 + 186 + (jd - 1);
  const gDate = new Date(Date.UTC(gy, 2, march));
  gDate.setUTCDate(gDate.getUTCDate() + days);
  return gDate.toISOString().slice(0, 10);
}
