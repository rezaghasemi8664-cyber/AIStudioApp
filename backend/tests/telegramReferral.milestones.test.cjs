'use strict';

jest.mock('../config/prisma.cjs', () => ({ prisma: {} }));

const {
  getMilestoneBoundaries,
  hasMilestoneBoundaryDrift,
  getMissingMilestoneRewards,
} = require('../services/telegramReferral.service.cjs');

function makeMembers(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    joinedAt: new Date(Date.UTC(2026, 0, 1, 0, index)),
  }));
}

describe('Telegram referral reward milestones', () => {
  test.each([
    [0, []],
    [19, []],
    [20, [20]],
    [39, [20]],
    [40, [20, 40]],
    [59, [20, 40]],
    [60, [20, 40, 60]],
  ])('creates only completed 20-member boundaries for %i members', (count, expected) => {
    const boundaries = getMilestoneBoundaries(makeMembers(count));

    expect(boundaries.map((item) => item.milestone)).toEqual(expected);
    expect(boundaries.every((item) => item.memberCount === item.milestone)).toBe(true);
  });

  test('handles equal join timestamps at the 20-member milestone boundary', () => {
    const timestamp = new Date('2026-01-01T00:18:00.000Z');
    const members = [
      ...makeMembers(18),
      { id: 22, joinedAt: timestamp },
      { id: 21, joinedAt: timestamp },
    ];

    const [boundary] = getMilestoneBoundaries(members);

    expect(boundary.milestone).toBe(20);
    expect(boundary.completedAt.toISOString()).toBe(timestamp.toISOString());
  });

  test('flags an existing reward whose milestone no longer exists', () => {
    const rewards = [{
      milestone: 40,
      completedAt: new Date('2026-01-01T00:39:00.000Z'),
    }];

    expect(hasMilestoneBoundaryDrift(rewards, getMilestoneBoundaries(makeMembers(20)))).toBe(true);
  });

  test('identifies each completed milestone boundary without a reward row', () => {
    const boundaries = getMilestoneBoundaries(makeMembers(60));
    const rewards = [{ milestone: 20 }, { milestone: 60 }];

    expect(getMissingMilestoneRewards(rewards, boundaries)).toEqual([40]);
  });

  test('returns no missing milestones when every completed boundary has a reward row', () => {
    const boundaries = getMilestoneBoundaries(makeMembers(60));
    const rewards = [{ milestone: 20 }, { milestone: 40 }, { milestone: 60 }];

    expect(getMissingMilestoneRewards(rewards, boundaries)).toEqual([]);
  });

  test('does not report incomplete milestones as missing rewards', () => {
    expect(getMissingMilestoneRewards([], getMilestoneBoundaries(makeMembers(39)))).toEqual([]);
  });
});
