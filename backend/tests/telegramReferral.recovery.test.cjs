'use strict';

jest.mock('../config/prisma.cjs', () => ({
  prisma: { $transaction: jest.fn() },
}));

const prisma = require('../config/prisma.cjs').prisma;
const { reconcileReferralRewards } = require('../services/telegramReferral.service.cjs');

function makeTx({ activeUser = true } = {}) {
  const now = new Date('2026-11-10T12:00:00.000Z');
  const completedAt = new Date('2026-10-01T09:00:00.000Z');
  const members = Array.from({ length: 20 }, (_, index) => ({
    id: index + 1,
    joinedAt: new Date(completedAt.getTime() + index * 60000),
  }));
  const rewardRows = [];

  const tx = {
    telegramReferralMember: {
      findMany: jest.fn().mockResolvedValue(members),
    },
    telegramReferralReward: {
      findMany: jest.fn().mockImplementation(async () => rewardRows),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(async ({ data }) => {
        rewardRows.push(data);
        return { id: 700, ...data };
      }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: 42,
        isActive: activeUser,
        isDeleted: false,
        subscriptionStart: null,
        subscriptionEnd: null,
        subscriptionMonths: 0,
        subscriptionType: 'PAID',
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    subscription: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 501 }),
      update: jest.fn(),
    },
  };

  return { tx, now, completedAt, rewardRows };
}

describe('Telegram referral missing reward recovery', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-10T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  test('issues a missing reward from the actual recovery time, not the old milestone date', async () => {
    const { tx, now, completedAt, rewardRows } = makeTx();
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    const result = await reconcileReferralRewards(42);

    expect(result.newlyGrantedMilestones).toEqual([20]);
    expect(result.missingRewardMilestones).toEqual([]);
    expect(tx.subscription.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        startsAt: now,
        expiresAt: new Date('2026-11-15T12:00:00.000Z'),
      }),
    });
    expect(rewardRows).toHaveLength(1);
    expect(rewardRows[0].completedAt).toEqual(completedAt);
    expect(rewardRows[0].grantedAt).toEqual(now);
    expect(rewardRows[0].startsAt).toEqual(now);
    expect(rewardRows[0].expiresAt).toEqual(new Date('2026-11-15T12:00:00.000Z'));
  });

  test('keeps the missing reward pending while the inviter account is inactive', async () => {
    const { tx, rewardRows } = makeTx({ activeUser: false });
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    const result = await reconcileReferralRewards(42);

    expect(result.newlyGrantedMilestones).toEqual([]);
    expect(result.missingRewardMilestones).toEqual([20]);
    expect(tx.subscription.create).not.toHaveBeenCalled();
    expect(tx.telegramReferralReward.create).not.toHaveBeenCalled();
    expect(rewardRows).toHaveLength(0);
  });

  test('rejects an invalid inviter id before opening a transaction', async () => {
    await expect(reconcileReferralRewards(0)).rejects.toMatchObject({
      code: 'TELEGRAM_REFERRAL_INVITER_ID_INVALID',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
