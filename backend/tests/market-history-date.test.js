'use strict';

const { parseTseDate } = require('../utils/marketHistoryDate.cjs');

describe('BRS/TSETMC market history date parsing', () => {
  test('converts compact and separated Jalali dates to Gregorian UTC dates', () => {
    expect(parseTseDate('13940410')).toEqual(new Date('2015-07-01T00:00:00.000Z'));
    expect(parseTseDate('1394-04-10')).toEqual(new Date('2015-07-01T00:00:00.000Z'));
    expect(parseTseDate('1405/07/21')).toEqual(new Date('2026-10-13T00:00:00.000Z'));
  });

  test('keeps Gregorian dates unchanged', () => {
    expect(parseTseDate('20261013')).toEqual(new Date('2026-10-13T00:00:00.000Z'));
    expect(parseTseDate('2026-10-13')).toEqual(new Date('2026-10-13T00:00:00.000Z'));
    expect(parseTseDate('2026-10-13T00:00:00.000Z')).toEqual(new Date('2026-10-13T00:00:00.000Z'));
  });

  test('rejects invalid dates and preserves valid Date instances', () => {
    expect(parseTseDate('2026-02-30')).toBeNull();
    expect(parseTseDate('1405-13-40')).toBeNull();
    expect(parseTseDate(null)).toBeNull();
    const date = new Date('2026-10-13T00:00:00.000Z');
    expect(parseTseDate(date)).toBe(date);
  });
});
