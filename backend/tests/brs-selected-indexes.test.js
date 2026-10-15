'use strict';

const {
  normalizeSelectedIndexRows,
  selectedIndexFields
} = require('../services/marketHistory.service.cjs');

describe('BRSAPI selected index normalization (type=3)', () => {
  test('normalizes selected index rows and maps documented index names', () => {
    const rows = normalizeSelectedIndexRows({
      data: [
        { name: 'شاخص قیمت (وزنی-ارزشی)', index: '1234.5', index_change: '-12.5', index_change_percent: '-1.0' },
        { name: 'شاخص قیمت (هم وزن)', index: 678.9, index_change: 3.2, index_change_percent: 0.47 },
        { name: 'شاخص آزاد شناور', index: 4567, index_change: 22 },
        { name: 'شاخص بازار اول', index: 888 },
        { name: 'شاخص بازار دوم', index: 999 }
      ]
    });

    expect(rows).toHaveLength(5);
    expect(rows[0]).toEqual({
      name: 'شاخص قیمت (وزنی-ارزشی)',
      index: 1234.5,
      indexChange: -12.5,
      indexChangePercent: -1
    });

    expect(selectedIndexFields(rows)).toMatchObject({
      priceIndex: 1234.5,
      priceIndexChange: -12.5,
      priceIndexChangePercent: -1,
      priceEqualWeightIndex: 678.9,
      priceEqualWeightIndexChange: 3.2,
      priceEqualWeightIndexChangePercent: 0.47,
      freeFloatIndex: 4567,
      freeFloatIndexChange: 22,
      firstMarketIndex: 888,
      secondMarketIndex: 999
    });
  });

  test('keeps missing values null instead of manufacturing zeros', () => {
    const rows = normalizeSelectedIndexRows([
      { name: 'شاخص آزاد شناور' },
      { name: 'شاخص قیمت (وزنی-ارزشی)', index: null }
    ]);

    expect(selectedIndexFields(rows)).toMatchObject({
      priceIndex: null,
      priceIndexChange: null,
      freeFloatIndex: null,
      freeFloatIndexChange: null
    });
  });

  test('accepts JSON string payloads and returns an empty list for unknown shapes', () => {
    expect(normalizeSelectedIndexRows(JSON.stringify([{ name: 'شاخص بازار اول', index: 1 }]))).toHaveLength(1);
    expect(normalizeSelectedIndexRows({ message: 'unavailable' })).toEqual([]);
  });
});
