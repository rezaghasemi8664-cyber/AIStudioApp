'use strict';

/**
 * Deterministic Jalali (Persian) calendar date -> Gregorian date conversion.
 *
 * The returned Date is UTC midnight so it can be stored safely in a Prisma
 * DateTime field mapped to SQL Server DATE without local-timezone drift.
 */
function jalaliToGregorianDate(value) {
  const raw = String(value ?? '').trim().replace(/\//g, '-');
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw);
  if (!match) return null;

  const jy = Number(match[1]);
  const jm = Number(match[2]);
  const jd = Number(match[3]);

  if (!Number.isInteger(jy) || !Number.isInteger(jm) || !Number.isInteger(jd)) {
    return null;
  }

  if (jm < 1 || jm > 12 || jd < 1 || jd > (jm <= 6 ? 31 : jm <= 11 ? 30 : 30)) {
    return null;
  }

  let jYear = jy + 1595;
  let days =
    -355668 +
    365 * jYear +
    Math.floor(jYear / 33) * 8 +
    Math.floor(((jYear % 33) + 3) / 4) +
    jd;

  if (jm < 7) {
    days += (jm - 1) * 31;
  } else {
    days += (jm - 7) * 30 + 186;
  }

  let gy = 400 * Math.floor(days / 146097);
  days %= 146097;

  if (days > 36524) {
    gy += 100 * Math.floor(--days / 36524);
    days %= 36524;
    if (days >= 365) days += 1;
  }

  gy += 4 * Math.floor(days / 1461);
  days %= 1461;

  if (days > 365) {
    gy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }

  let gd = days + 1;
  const leap =
    gy % 4 === 0 &&
    (gy % 100 !== 0 || gy % 400 === 0);

  const monthDays = [
    31,
    leap ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];

  let gm = 1;
  while (gm <= 12 && gd > monthDays[gm - 1]) {
    gd -= monthDays[gm - 1];
    gm += 1;
  }

  if (gm > 12) return null;
  return new Date(Date.UTC(gy, gm - 1, gd));
}

function jalaliToGregorianISO(value) {
  const date = jalaliToGregorianDate(value);
  return date ? date.toISOString().slice(0, 10) : null;
}

module.exports = {
  jalaliToGregorianDate,
  jalaliToGregorianISO,
};
