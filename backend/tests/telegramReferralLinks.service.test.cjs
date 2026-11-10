'use strict';

jest.mock('../config/prisma.cjs', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    telegramReferralLink: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('../services/telegramBotApi.service.cjs', () => ({
  getTelegramConfig: jest.fn(() => ({ token: 'test-token', chatId: '@RoniyaAnalyzer' })),
  createTelegramInviteLink: jest.fn(),
}));

const prisma = require('../config/prisma.cjs').prisma;
const telegramBotApi = require('../services/telegramBotApi.service.cjs');
const { ensureTelegramReferralLink } = require('../services/telegramReferralLinks.service.cjs');

describe('ensureTelegramReferralLink', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue({ id: 42, isDeleted: false });
  });

  test('creates a link for an inactive but non-deleted account', async () => {
    const createdAt = new Date('2026-11-10T10:00:00.000Z');
    const newLink = {
      channelId: '@RoniyaAnalyzer',
      inviteLink: 'https://t.me/+new-inactive-link',
      inviteName: 'Roniya-42-test',
      createdAt,
    };
    prisma.telegramReferralLink.findUnique.mockResolvedValue(null);
    telegramBotApi.createTelegramInviteLink.mockResolvedValue(newLink);
    prisma.telegramReferralLink.create.mockResolvedValue({ id: 7, inviterId: 42, ...newLink, isActive: true });

    const result = await ensureTelegramReferralLink(42);

    expect(result.id).toBe(7);
    expect(telegramBotApi.createTelegramInviteLink).toHaveBeenCalledWith({ inviterId: 42 });
    expect(prisma.telegramReferralLink.create).toHaveBeenCalledWith({
      data: { inviterId: 42, ...newLink, isActive: true, revokedAt: null },
    });
  });

  test('preserves an existing usable link without creating another Telegram link', async () => {
    const existing = { id: 3, inviterId: 42, channelId: '@RoniyaAnalyzer', isActive: true, revokedAt: null };
    prisma.telegramReferralLink.findUnique.mockResolvedValue(existing);

    const result = await ensureTelegramReferralLink(42);

    expect(result).toBe(existing);
    expect(telegramBotApi.createTelegramInviteLink).not.toHaveBeenCalled();
    expect(prisma.telegramReferralLink.create).not.toHaveBeenCalled();
    expect(prisma.telegramReferralLink.update).not.toHaveBeenCalled();
  });

  test('replaces a revoked link in the same unique inviter/channel row', async () => {
    const existing = { id: 3, inviterId: 42, channelId: '@RoniyaAnalyzer', isActive: false, revokedAt: new Date() };
    const replacement = {
      channelId: '@RoniyaAnalyzer',
      inviteLink: 'https://t.me/+replacement',
      inviteName: 'Roniya-42-new',
      createdAt: new Date('2026-11-10T11:00:00.000Z'),
    };
    prisma.telegramReferralLink.findUnique.mockResolvedValue(existing);
    telegramBotApi.createTelegramInviteLink.mockResolvedValue(replacement);
    prisma.telegramReferralLink.update.mockResolvedValue({ id: 3, ...replacement, isActive: true, revokedAt: null });

    const result = await ensureTelegramReferralLink(42);

    expect(result.id).toBe(3);
    expect(prisma.telegramReferralLink.update).toHaveBeenCalledWith({
      where: { id: 3 },
      data: { ...replacement, isActive: true, revokedAt: null },
    });
    expect(prisma.telegramReferralLink.create).not.toHaveBeenCalled();
  });

  test('rejects deleted accounts', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 42, isDeleted: true });

    await expect(ensureTelegramReferralLink(42)).rejects.toMatchObject({
      code: 'TELEGRAM_REFERRAL_USER_NOT_ELIGIBLE',
    });
    expect(telegramBotApi.createTelegramInviteLink).not.toHaveBeenCalled();
  });
});
