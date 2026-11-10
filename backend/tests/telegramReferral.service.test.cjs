'use strict';

jest.mock('../config/prisma.cjs', () => ({ prisma: {} }));

const {
  safeSecretEquals,
  isMember,
  channelMatches,
  getMilestoneBoundaries,
  hasMilestoneBoundaryDrift,
  getTrackingConfiguration,
} = require('../services/telegramReferral.service.cjs');

describe('Telegram referral validation helpers', () => {
  test('compares webhook secrets and rejects missing or different values', () => {
    expect(safeSecretEquals('a-long-secret', 'a-long-secret')).toBe(true);
    expect(safeSecretEquals('a-long-secret', 'another-secret')).toBe(false);
    expect(safeSecretEquals('', 'a-long-secret')).toBe(false);
    expect(safeSecretEquals('a-long-secret', '')).toBe(false);
  });

  test('recognizes Telegram channel member states', () => {
    expect(isMember({ status: 'member' })).toBe(true);
    expect(isMember({ status: 'administrator' })).toBe(true);
    expect(isMember({ status: 'creator' })).toBe(true);
    expect(isMember({ status: 'restricted', is_member: true })).toBe(true);
    expect(isMember({ status: 'restricted', is_member: false })).toBe(false);
    expect(isMember({ status: 'left' })).toBe(false);
    expect(isMember(null)).toBe(false);
  });

  test('matches configured channel id or channel username', () => {
    expect(channelMatches({ id: -100123 }, '-100123')).toBe(true);
    expect(channelMatches({ id: -100123, username: 'RoniyaAnalyzer' }, '@roniyaAnalyzer')).toBe(true);
    expect(channelMatches({ id: -100123, username: 'OtherChannel' }, '@roniyaAnalyzer')).toBe(false);
    expect(channelMatches({ id: -100123 }, '')).toBe(false);
  });
  test('calculates 20- and 40-member milestone boundaries by Telegram join time', () => {
    const members = Array.from({ length: 40 }, (_, index) => ({
      id: index + 1,
      joinedAt: new Date(Date.UTC(2026, 0, 1, 0, index)),
    })).reverse();

    const boundaries = getMilestoneBoundaries(members);

    expect(boundaries).toHaveLength(2);
    expect(boundaries[0].milestone).toBe(20);
    expect(boundaries[0].completedAt.toISOString()).toBe(new Date(Date.UTC(2026, 0, 1, 0, 19)).toISOString());
    expect(boundaries[1].milestone).toBe(40);
    expect(boundaries[1].completedAt.toISOString()).toBe(new Date(Date.UTC(2026, 0, 1, 0, 39)).toISOString());
  });

  test('includes a delayed earlier join in chronological milestone ordering', () => {
    const members = Array.from({ length: 20 }, (_, index) => ({
      id: index + 1,
      joinedAt: new Date(Date.UTC(2026, 0, 1, 0, index + 1)),
    }));
    members.push({ id: 21, joinedAt: new Date(Date.UTC(2025, 11, 31, 23, 59)) });

    const [boundary] = getMilestoneBoundaries(members);

    expect(boundary.milestone).toBe(20);
    expect(boundary.completedAt.toISOString()).toBe(new Date(Date.UTC(2026, 0, 1, 0, 19)).toISOString());
  });

});


describe('Telegram referral tracking readiness', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    for (const key of [
      'TELEGRAM_REFERRAL_TRACKING_ENABLED',
      'TELEGRAM_WEBHOOK_SECRET',
      'TELEGRAM_WEBHOOK_RELAY_SECRET',
      'TELEGRAM_BOT_TOKEN',
      'TELEGRAM_CHANNEL_ID',
      'TELEGRAM_CHANNEL_USERNAME',
    ]) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  });

  test('does not report tracking active until the explicit switch and all secrets/config are present', () => {
    process.env.TELEGRAM_REFERRAL_TRACKING_ENABLED = 'true';
    process.env.TELEGRAM_WEBHOOK_SECRET = 'telegram-secret';
    process.env.TELEGRAM_WEBHOOK_RELAY_SECRET = 'relay-secret';
    process.env.TELEGRAM_BOT_TOKEN = '123:token';
    process.env.TELEGRAM_CHANNEL_ID = '@RoniyaAnalyzer';

    expect(getTrackingConfiguration()).toEqual({ enabled: true, missing: [] });

    delete process.env.TELEGRAM_WEBHOOK_RELAY_SECRET;
    expect(getTrackingConfiguration().enabled).toBe(false);
    expect(getTrackingConfiguration().missing).toContain('TELEGRAM_WEBHOOK_RELAY_SECRET');
  });

  test('detects when a delayed join changes an already rewarded milestone boundary', () => {
    const originalBoundary = new Date('2026-01-01T00:20:00.000Z');
    const shiftedBoundary = new Date('2026-01-01T00:19:00.000Z');
    expect(hasMilestoneBoundaryDrift(
      [{ milestone: 20, completedAt: originalBoundary }],
      [{ milestone: 20, completedAt: shiftedBoundary }]
    )).toBe(true);
    expect(hasMilestoneBoundaryDrift(
      [{ milestone: 20, completedAt: originalBoundary }],
      [{ milestone: 20, completedAt: originalBoundary }]
    )).toBe(false);
  });
});
