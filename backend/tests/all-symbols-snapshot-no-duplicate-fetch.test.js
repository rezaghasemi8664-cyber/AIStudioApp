'use strict';

jest.mock('../config/prisma.cjs', () => ({
  $executeRawUnsafe: jest.fn(),
  $queryRawUnsafe: jest.fn(),
  $transaction: jest.fn()
}));
jest.mock('../services/brs.service.cjs', () => ({
  getAllSymbols: jest.fn()
}));
jest.mock('../services/marketSnapshot.service.cjs', () => ({
  getActiveSnapshot: jest.fn()
}));

const prisma = require('../config/prisma.cjs');
const brsService = require('../services/brs.service.cjs');
const marketSnapshotService = require('../services/marketSnapshot.service.cjs');
const allSymbolsSnapshotService = require('../services/allSymbolsSnapshot.service.cjs');

describe('legacy all-symbols snapshot service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('reuses the active MarketSnapshot without fetching BRS or writing the legacy table', async () => {
    const activatedAt = new Date('2026-10-28T11:30:00.000Z');
    marketSnapshotService.getActiveSnapshot.mockResolvedValue({
      id: 42,
      activatedAt,
      verifiedAt: new Date('2026-10-28T11:29:00.000Z'),
      createdAt: new Date('2026-10-28T11:28:00.000Z'),
      symbolCount: 1,
      symbolsJson: JSON.stringify([{ symbol: 'فولاد', lastPrice: 12345 }]),
      source: 'brs-central-worker'
    });

    const result = await allSymbolsSnapshotService.refreshSnapshot();

    expect(result.symbolCount).toBe(1);
    expect(result.source).toBe('brs-central-worker');
    expect(result.updatedAt).toBe(activatedAt);
    expect(result.snapshotDate).toBe(allSymbolsSnapshotService.tehranDateKey(activatedAt));
    expect(brsService.getAllSymbols).not.toHaveBeenCalled();
    expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test('fails clearly when there is no active MarketSnapshot instead of fetching BRS', async () => {
    marketSnapshotService.getActiveSnapshot.mockResolvedValue(null);

    await expect(allSymbolsSnapshotService.refreshSnapshot())
      .rejects.toThrow('No active MarketSnapshot is available; legacy BRS refresh is disabled');

    expect(brsService.getAllSymbols).not.toHaveBeenCalled();
    expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
