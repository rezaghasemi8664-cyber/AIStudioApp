'use strict';

const { _parseStoredSelectedIndexFields } = require('../services/brs.service.cjs');

describe('stored BRS selected indexes exposed by market index service', () => {
  test('reads auxiliary values and selected rows from snapshot JSON', () => {
    const result = _parseStoredSelectedIndexFields(JSON.stringify({
      priceIndex: 1234.5,
      priceIndexChange: -12,
      priceIndexChangePercent: -0.9,
      priceEqualWeightIndex: 678,
      freeFloatIndex: 4567,
      firstMarketIndex: 888,
      secondMarketIndex: 999,
      selectedIndexes: [{ name: 'شاخص قیمت (وزنی-ارزشی)', index: 1234.5 }]
    }));

    expect(result).toMatchObject({
      priceIndex: 1234.5,
      priceIndexChange: -12,
      priceIndexChangePercent: -0.9,
      priceEqualWeightIndex: 678,
      freeFloatIndex: 4567,
      firstMarketIndex: 888,
      secondMarketIndex: 999,
      selectedIndexes: [{ name: 'شاخص قیمت (وزنی-ارزشی)', index: 1234.5 }]
    });
  });

  test('keeps missing values null and tolerates invalid snapshot JSON', () => {
    expect(_parseStoredSelectedIndexFields('{}')).toMatchObject({
      priceIndex: null,
      freeFloatIndex: null,
      firstMarketIndex: null,
      secondMarketIndex: null,
      selectedIndexes: []
    });
    expect(_parseStoredSelectedIndexFields('{bad json')).toMatchObject({
      priceIndex: null,
      selectedIndexes: []
    });
  });
});
