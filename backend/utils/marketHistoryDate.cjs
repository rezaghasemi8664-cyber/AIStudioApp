'use strict';

const { jalaliToGregorianDate } = require('./jalaliDate.cjs');

function validGregorianDate(year, month, day) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null;
  return date;
}

/**
 * Parse daily dates from BRS/TSETMC. Jalali years (1300-1599) must be
 * converted before they are stored in SQL Server; otherwise JS treats them
 * as Gregorian years and creates records centuries too old.
 */
function parseTseDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const raw = String(value).trim();
  if (!raw) return null;

  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(raw);
  const separated = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?=$|[T\s])/.exec(raw);
  const match = compact || separated;

  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);

    if (year >= 1300 && year < 1600) {
      return jalaliToGregorianDate(
        String(year) + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0')
      );
    }

    const date = validGregorianDate(year, month, day);
    if (!date) return null;

    // Preserve an explicit timestamp for Gregorian ISO input; date-only
    // values are normalized to UTC midnight for consistent SQL DATE storage.
    if (/[T\s]/.test(raw)) {
      const timestamp = new Date(raw);
      return Number.isNaN(timestamp.getTime()) ? null : timestamp;
    }
    return date;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

module.exports = { parseTseDate };
