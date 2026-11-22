'use strict';

const { normalizePayload } = require('./nerkhPrice.service.cjs');

describe('Nerkh price normalization', () => {
  test('normalizes gold and currency groups while preserving 24h metrics', () => {
    const result = normalizePayload({
      gold: {
        GOLD18K: { current: 23214000, ch_24h_percent: -0.13, min: { '24h': 22884000 }, max: { '24h': 23348000 }, update: '1405-09-01 09:59:18' },
        OUNCE: { current: 3535, ch_24h_percent: 0, min: { '24h': 3535 }, max: { '24h': 3535 } }
      },
      currency: { USD: { current: 268960, ch_24h_percent: -0.37, min: { '24h': 268740 }, max: { '24h': 272280 } } },
      crypto: {}
    });
    expect(result.groups.gold).toHaveLength(2);
    expect(result.groups.gold[0]).toMatchObject({ symbol: 'GOLD18K', current: 232140000, min24h: 228840000, max24h: 233480000 });
    expect(result.groups.gold[1]).toMatchObject({ symbol: 'OUNCE', current: 3535, min24h: 3535, max24h: 3535 });
    expect(result.groups.currency[0]).toMatchObject({ symbol: 'USD', current: 2689600, change24hPercent: -0.37, min24h: 2687400, max24h: 2722800 });
  });

  test('rejects an empty or invalid provider response', () => {
    expect(() => normalizePayload({ gold: {}, currency: {}, crypto: {} })).toThrow();
  });
});
