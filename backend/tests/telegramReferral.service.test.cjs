'use strict';

jest.mock('../config/prisma.cjs', () => ({ prisma: {} }));

const {
  safeSecretEquals,
  isMember,
  channelMatches,
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
});
