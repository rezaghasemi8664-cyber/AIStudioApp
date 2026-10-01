'use strict';

const assert = require('node:assert/strict');
const {
  jalaliToGregorianISO,
} = require('../utils/jalaliDate.cjs');

const cases = [
  ['1405-05-31', '2026-08-22'],
  ['1405-06-01', '2026-08-23'],
  ['1405-06-02', '2026-08-24'],
  ['1405-06-03', '2026-08-25'],
  ['1405-06-04', '2026-08-26'],
  ['1405-06-07', '2026-08-29'],
  ['1405-06-09', '2026-08-31'],
  ['1405-06-10', '2026-09-01'],
  ['1405-06-11', '2026-09-02'],
  ['1405-06-14', '2026-09-05'],
  ['1405-06-15', '2026-09-06'],
  ['1405-06-16', '2026-09-07'],
  ['1405-06-22', '2026-09-13'],
  ['1405-06-23', '2026-09-14'],
  ['1405-06-24', '2026-09-15'],
  ['1405-06-25', '2026-09-16'],
  ['1405-06-28', '2026-09-19'],
  ['1405-06-29', '2026-09-20'],
  ['1405-06-30', '2026-09-21'],
];

for (const [jalali, expected] of cases) {
  const actual = jalaliToGregorianISO(jalali);
  assert.equal(actual, expected, `${jalali}: expected ${expected}, got ${actual}`);
}

console.log(`[JALALI] Verified ${cases.length} known trading-day conversions successfully.`);
