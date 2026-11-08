'use strict';

const centralCache = require('../services/centralMarketCache.service.cjs');

describe('per-user portfolio cache isolation', () => {
  beforeEach(() => {
    centralCache.invalidatePrefix('portfolio:user:');
  });

  test('keeps portfolio state and quote snapshots isolated by authenticated user id', () => {
    centralCache.set('portfolio:user:101:state', { portfolio: { items: [{ symbol: 'فولاد' }] } });
    centralCache.set('portfolio:user:202:state', { portfolio: { items: [{ symbol: 'فملی' }] } });
    centralCache.set('portfolio:user:101:quotes', { snapshotId: 7, data: { currentValue: 100 } });
    centralCache.set('portfolio:user:202:quotes', { snapshotId: 7, data: { currentValue: 900 } });

    expect(centralCache.get('portfolio:user:101:state').portfolio.items[0].symbol).toBe('فولاد');
    expect(centralCache.get('portfolio:user:202:state').portfolio.items[0].symbol).toBe('فملی');
    expect(centralCache.get('portfolio:user:101:quotes').data.currentValue).toBe(100);
    expect(centralCache.get('portfolio:user:202:quotes').data.currentValue).toBe(900);
  });

  test('invalidating one user portfolio does not invalidate another user cache', () => {
    centralCache.set('portfolio:user:101:state', { marker: 'first' });
    centralCache.set('portfolio:user:202:state', { marker: 'second' });

    centralCache.invalidate('portfolio:user:101:state');

    expect(centralCache.get('portfolio:user:101:state')).toBeNull();
    expect(centralCache.get('portfolio:user:202:state')).toEqual({ marker: 'second' });
  });
});
