'use strict';

const portfolioCache = require('../services/portfolioCache.service.cjs');

describe('per-user portfolio cache isolation', () => {
  beforeEach(() => {
    portfolioCache.invalidateUser(101);
    portfolioCache.invalidateUser(202);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('keeps private portfolio state and quotes isolated by authenticated user id', async () => {
    await portfolioCache.getState(101, async () => ({ items: [{ symbol: 'فولاد' }] }));
    await portfolioCache.getState(202, async () => ({ items: [{ symbol: 'فملی' }] }));
    portfolioCache.setQuotes(101, 7, { currentValue: 100 });
    portfolioCache.setQuotes(202, 7, { currentValue: 900 });

    expect((await portfolioCache.getState(101, async () => null)).items[0].symbol).toBe('فولاد');
    expect((await portfolioCache.getState(202, async () => null)).items[0].symbol).toBe('فملی');
    expect(portfolioCache.getQuotes(101, 7).currentValue).toBe(100);
    expect(portfolioCache.getQuotes(202, 7).currentValue).toBe(900);
  });

  test('keeps portfolio state cached beyond the previous 60-second TTL', async () => {
    jest.useFakeTimers();
    let databaseReads = 0;
    const loader = async () => {
      databaseReads += 1;
      return { items: [{ symbol: 'فولاد' }] };
    };

    await portfolioCache.getState(101, loader);
    jest.advanceTimersByTime(10 * 60 * 1000);
    const state = await portfolioCache.getState(101, loader);

    expect(state.items[0].symbol).toBe('فولاد');
    expect(databaseReads).toBe(1);
  });

  test('does not let an in-flight database read overwrite a newer portfolio write', async () => {
    let resolveDatabaseRead;
    const pendingRead = portfolioCache.getState(
      101,
      () => new Promise(resolve => { resolveDatabaseRead = resolve; })
    );
    await Promise.resolve();

    portfolioCache.setState(101, { version: 2 });
    resolveDatabaseRead({ version: 1 });

    await expect(pendingRead).resolves.toEqual({ version: 2 });
    await expect(portfolioCache.getState(101, async () => ({ version: 3 })))
      .resolves.toEqual({ version: 2 });
  });

  test('does not repopulate an explicitly invalidated cache from an older in-flight read', async () => {
    let resolveDatabaseRead;
    const pendingRead = portfolioCache.getState(
      101,
      () => new Promise(resolve => { resolveDatabaseRead = resolve; })
    );
    await Promise.resolve();

    portfolioCache.invalidateUser(101);
    resolveDatabaseRead({ version: 1 });

    await expect(pendingRead).resolves.toBeNull();
    await expect(portfolioCache.getState(101, async () => ({ version: 2 })))
      .resolves.toEqual({ version: 2 });
  });

  test('invalidating one user\'s cache does not affect another user', async () => {
    portfolioCache.setState(101, { marker: 'first' });
    portfolioCache.setState(202, { marker: 'second' });

    portfolioCache.invalidateUser(101);

    expect(await portfolioCache.getState(101, async () => null)).toBeNull();
    expect(await portfolioCache.getState(202, async () => null)).toEqual({ marker: 'second' });
  });

  test('does not reuse quote cache after the active market snapshot changes', () => {
    portfolioCache.setQuotes(101, 7, { currentValue: 100 });

    expect(portfolioCache.getQuotes(101, 8)).toBeNull();
    expect(portfolioCache.getQuotes(101, 7)).toEqual({ currentValue: 100 });
  });
});
