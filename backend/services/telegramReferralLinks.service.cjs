'use strict';

const prismaModule = require('../config/prisma.cjs');
const prisma = prismaModule.prisma || prismaModule.default || prismaModule;
const telegramBotApi = require('./telegramBotApi.service.cjs');

const inFlight = new Map();

function getLinkKey(userId, channelId) {
  return String(userId) + ':' + String(channelId);
}

async function ensureTelegramReferralLink(userId) {
  const normalizedUserId = Number(userId);
  if (!Number.isSafeInteger(normalizedUserId) || normalizedUserId <= 0) {
    const error = new Error('TELEGRAM_INVITER_ID_INVALID');
    error.code = 'TELEGRAM_INVITER_ID_INVALID';
    throw error;
  }

  const config = telegramBotApi.getTelegramConfig();
  if (!config.token || !config.chatId) {
    const error = new Error('TELEGRAM_NOT_CONFIGURED');
    error.code = 'TELEGRAM_NOT_CONFIGURED';
    throw error;
  }

  const key = getLinkKey(normalizedUserId, config.chatId);
  if (inFlight.has(key)) return inFlight.get(key);

  const operation = (async () => {
    const user = await prisma.user.findUnique({
      where: { id: normalizedUserId },
      select: { id: true, isDeleted: true },
    });
    if (!user || user.isDeleted) {
      const error = new Error('TELEGRAM_REFERRAL_USER_NOT_ELIGIBLE');
      error.code = 'TELEGRAM_REFERRAL_USER_NOT_ELIGIBLE';
      throw error;
    }

    const existing = await prisma.telegramReferralLink.findUnique({
      where: {
        inviterId_channelId: {
          inviterId: normalizedUserId,
          channelId: config.chatId,
        },
      },
    });

    // Account activation is deliberately independent from referral-link status.
    if (existing && existing.isActive && !existing.revokedAt) return existing;

    const created = await telegramBotApi.createTelegramInviteLink({ inviterId: normalizedUserId });
    const data = {
      channelId: created.channelId,
      inviteLink: created.inviteLink,
      inviteName: created.inviteName,
      isActive: true,
      createdAt: created.createdAt,
      revokedAt: null,
    };

    if (existing) {
      return prisma.telegramReferralLink.update({
        where: { id: existing.id },
        data,
      });
    }

    try {
      return await prisma.telegramReferralLink.create({
        data: { inviterId: normalizedUserId, ...data },
      });
    } catch (error) {
      if (error?.code !== 'P2002') throw error;
      const raced = await prisma.telegramReferralLink.findUnique({
        where: {
          inviterId_channelId: {
            inviterId: normalizedUserId,
            channelId: config.chatId,
          },
        },
      });
      if (raced) return raced;
      throw error;
    }
  })();

  inFlight.set(key, operation);
  try {
    return await operation;
  } finally {
    inFlight.delete(key);
  }
}

module.exports = { ensureTelegramReferralLink };
