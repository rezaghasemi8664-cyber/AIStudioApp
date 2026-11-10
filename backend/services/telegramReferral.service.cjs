'use strict';

const crypto = require('crypto');
const prismaModule = require('../config/prisma.cjs');
const prisma = prismaModule.prisma || prismaModule.default || prismaModule;

const MEMBERS_PER_REWARD = 20;
const REWARD_DAYS = 5;
const MEMBER_STATUSES = new Set(['member', 'administrator', 'creator']);

function isMember(chatMember) {
  if (!chatMember || typeof chatMember !== 'object') return false;
  if (MEMBER_STATUSES.has(String(chatMember.status || '').toLowerCase())) return true;
  return String(chatMember.status || '').toLowerCase() === 'restricted' && chatMember.is_member === true;
}

function safeSecretEquals(received, expected) {
  if (typeof received !== 'string' || typeof expected !== 'string' || !received || !expected) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function addDays(date, days) {
  return new Date(new Date(date).getTime() + days * 86400000);
}

function getMilestoneBoundaries(members, step = MEMBERS_PER_REWARD) {
  const ordered = [...(Array.isArray(members) ? members : [])].sort((a, b) => {
    const timeDifference = new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
    return timeDifference || Number(a.id || 0) - Number(b.id || 0);
  });
  const boundaries = [];
  for (let milestone = step; milestone <= ordered.length; milestone += step) {
    boundaries.push({ milestone, memberCount: milestone, completedAt: new Date(ordered[milestone - 1].joinedAt) });
  }
  return boundaries;
}

function hasMilestoneBoundaryDrift(rewards, boundaries) {
  const byMilestone = new Map((Array.isArray(boundaries) ? boundaries : []).map((item) => [Number(item.milestone), item]));
  return (Array.isArray(rewards) ? rewards : []).some((reward) => {
    const boundary = byMilestone.get(Number(reward.milestone));
    if (!boundary) return true;
    return new Date(reward.completedAt).getTime() !== new Date(boundary.completedAt).getTime();
  });
}

function getTrackingConfiguration() {
  const config = require('./telegramBotApi.service.cjs').getTelegramConfig();
  const missing = [];
  if (String(process.env.TELEGRAM_REFERRAL_TRACKING_ENABLED || '').trim().toLowerCase() !== 'true') {
    missing.push('TRACKING_SWITCH');
  }
  if (!String(process.env.TELEGRAM_WEBHOOK_SECRET || '').trim()) missing.push('TELEGRAM_WEBHOOK_SECRET');
  if (!String(process.env.TELEGRAM_WEBHOOK_RELAY_SECRET || '').trim()) missing.push('TELEGRAM_WEBHOOK_RELAY_SECRET');
  if (!config.token) missing.push('TELEGRAM_BOT_TOKEN');
  if (!config.chatId) missing.push('TELEGRAM_CHANNEL_ID');
  return { enabled: missing.length === 0, missing };
}

function channelMatches(chat, configuredChannelId) {
  const expected = String(configuredChannelId || '').trim();
  if (!expected || !chat) return false;
  if (String(chat.id) === expected) return true;
  const username = chat.username ? '@' + String(chat.username).replace(/^@/, '') : '';
  return Boolean(username && username.toLowerCase() === expected.toLowerCase());
}

async function grantMilestone(tx, inviterId, milestone, memberCount, completedAt) {
  const existingReward = await tx.telegramReferralReward.findUnique({
    where: { inviterId_milestone: { inviterId, milestone } },
  });
  if (existingReward) return existingReward;

  const user = await tx.user.findUnique({
    where: { id: inviterId },
    select: {
      id: true,
      isActive: true,
      isDeleted: true,
      subscriptionStart: true,
      subscriptionEnd: true,
      subscriptionMonths: true,
      subscriptionType: true,
    },
  });
  if (!user || !user.isActive || user.isDeleted) return null;

  // Select the subscription that was valid at the milestone's actual Telegram event time.
  const active = await tx.subscription.findFirst({
    where: {
      userId: inviterId,
      status: 'ACTIVE',
      startsAt: { lte: completedAt },
      expiresAt: { gt: completedAt },
    },
    orderBy: [{ expiresAt: 'desc' }, { createdAt: 'desc' }],
  });

  const latest = active || await tx.subscription.findFirst({
    where: { userId: inviterId },
    orderBy: [{ createdAt: 'desc' }, { expiresAt: 'desc' }],
  });

  const legacyStart = user.subscriptionStart ? new Date(user.subscriptionStart) : null;
  const legacyEnd = user.subscriptionEnd ? new Date(user.subscriptionEnd) : null;
  const legacyActive = Boolean(
    legacyEnd &&
    !Number.isNaN(legacyEnd.getTime()) &&
    legacyEnd > completedAt &&
    (!legacyStart || (!Number.isNaN(legacyStart.getTime()) && legacyStart <= completedAt))
  );

  // Legacy-only subscriptions are still authoritative when no Subscription
  // row covers the milestone timestamp. Convert that validity into a row so
  // future renewals and reward extensions use the current subscription model.
  const startsAt = active
    ? new Date(active.startsAt)
    : legacyActive && legacyStart
      ? legacyStart
      : new Date(completedAt);
  const baseEnd = active
    ? new Date(active.expiresAt)
    : legacyActive
      ? legacyEnd
      : new Date(completedAt);
  const expiresAt = addDays(baseEnd, REWARD_DAYS);
  const subscriptionType = String(active?.type || (legacyActive ? user.subscriptionType : null) || latest?.type || user.subscriptionType || 'PAID').slice(0, 30);
  const planId = active?.planId ?? (legacyActive ? null : latest?.planId) ?? null;

  let subscription;
  if (active) {
    subscription = await tx.subscription.update({
      where: { id: active.id },
      data: { expiresAt },
    });
  } else {
    subscription = await tx.subscription.create({
      data: {
        userId: inviterId,
        planId,
        type: subscriptionType,
        status: 'ACTIVE',
        startsAt,
        expiresAt,
      },
    });
  }

  await tx.user.update({
    where: { id: inviterId },
    data: {
      subscriptionStart: startsAt,
      subscriptionEnd: expiresAt,
      subscriptionMonths: user.subscriptionMonths ?? 0,
      subscriptionType,
    },
  });

  return tx.telegramReferralReward.create({
    data: {
      inviterId,
      milestone,
      memberCount,
      days: REWARD_DAYS,
      completedAt,
      startsAt,
      expiresAt,
      subscriptionId: subscription.id,
    },
  });
}

async function processTelegramUpdate(update) {
  const updateIdRaw = update?.update_id;
  if (!Number.isSafeInteger(updateIdRaw) || updateIdRaw < 0) {
    const error = new Error('TELEGRAM_UPDATE_ID_INVALID');
    error.code = 'TELEGRAM_UPDATE_ID_INVALID';
    throw error;
  }

  return prisma.$transaction(async (tx) => {
    await tx.telegramWebhookUpdate.create({
      data: { updateId: BigInt(updateIdRaw), status: 'RECEIVED' },
    });

    const event = update.chat_member;
    if (!event || !event.chat || !event.new_chat_member) {
      await tx.telegramWebhookUpdate.update({
        where: { updateId: BigInt(updateIdRaw) },
        data: { status: 'IGNORED', processedAt: new Date() },
      });
      return { processed: true, counted: false, reason: 'UNSUPPORTED_UPDATE' };
    }

    const config = require('./telegramBotApi.service.cjs').getTelegramConfig();
    if (!channelMatches(event.chat, config.chatId)) {
      await tx.telegramWebhookUpdate.update({
        where: { updateId: BigInt(updateIdRaw) },
        data: { status: 'IGNORED', processedAt: new Date(), errorCode: 'CHANNEL_MISMATCH' },
      });
      return { processed: true, counted: false, reason: 'CHANNEL_MISMATCH' };
    }

    // Only the first transition from non-member to member is a referral join.
    if (isMember(event.old_chat_member) || !isMember(event.new_chat_member)) {
      await tx.telegramWebhookUpdate.update({
        where: { updateId: BigInt(updateIdRaw) },
        data: { status: 'IGNORED', processedAt: new Date() },
      });
      return { processed: true, counted: false, reason: 'NOT_A_NEW_JOIN' };
    }

    const telegramUserId = String(event.new_chat_member.user?.id ?? '');
    const inviteLink = String(event.invite_link?.invite_link || '');
    const eventSeconds = Number(event.date);
    const joinedAt = new Date(eventSeconds * 1000);
    if (!/^\d{1,32}$/.test(telegramUserId) || !inviteLink || !Number.isFinite(eventSeconds) || Number.isNaN(joinedAt.getTime())) {
      await tx.telegramWebhookUpdate.update({
        where: { updateId: BigInt(updateIdRaw) },
        data: { status: 'IGNORED', processedAt: new Date(), errorCode: 'INVALID_JOIN_PAYLOAD' },
      });
      return { processed: true, counted: false, reason: 'INVALID_JOIN_PAYLOAD' };
    }

    const referralLink = await tx.telegramReferralLink.findFirst({
      where: {
        channelId: config.chatId,
        inviteLink,
        createdAt: { lte: joinedAt },
        OR: [{ revokedAt: null }, { revokedAt: { gte: joinedAt } }],
      },
      select: { id: true, inviterId: true },
    });

    if (!referralLink) {
      await tx.telegramWebhookUpdate.update({
        where: { updateId: BigInt(updateIdRaw) },
        data: { status: 'IGNORED', processedAt: new Date(), errorCode: 'REFERRAL_LINK_NOT_FOUND' },
      });
      return { processed: true, counted: false, reason: 'REFERRAL_LINK_NOT_FOUND' };
    }

    // The unique channel/user key guarantees that leaving and rejoining cannot earn another point.
    await tx.telegramReferralMember.create({
      data: {
        channelId: String(event.chat.id),
        telegramUserId,
        inviterId: referralLink.inviterId,
        inviteLinkId: referralLink.id,
        joinedAt,
      },
    });

    const members = await tx.telegramReferralMember.findMany({
      where: { inviterId: referralLink.inviterId },
      orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
      select: { id: true, joinedAt: true },
    });
    const newlyGranted = [];
    const boundaries = getMilestoneBoundaries(members);
    const existingRewards = await tx.telegramReferralReward.findMany({
      where: { inviterId: referralLink.inviterId },
      select: { milestone: true, completedAt: true },
    });
    const reconciliationRequired = hasMilestoneBoundaryDrift(existingRewards, boundaries);

    // Never silently issue later rewards when a delayed Telegram update changes
    // the historical member that completed an already-rewarded milestone.
    if (!reconciliationRequired) for (const boundary of boundaries) {
      const reward = await grantMilestone(
        tx,
        referralLink.inviterId,
        boundary.milestone,
        boundary.memberCount,
        boundary.completedAt
      );
      if (reward) newlyGranted.push(boundary.milestone);
    }

    await tx.telegramWebhookUpdate.update({
      where: { updateId: BigInt(updateIdRaw) },
      data: {
        status: reconciliationRequired ? 'RECONCILE' : 'PROCESSED',
        processedAt: new Date(),
        errorCode: reconciliationRequired ? 'MILESTONE_BOUNDARY_CHANGED' : null,
      },
    });

    return {
      processed: true,
      counted: true,
      inviterId: referralLink.inviterId,
      confirmedMembers: members.length,
      newlyGrantedMilestones: newlyGranted,
      reconciliationRequired,
    };
  }, { isolationLevel: 'Serializable', maxWait: 10000, timeout: 20000 });
}

async function getReferralStats(inviterId) {
  const [members, rewards] = await Promise.all([
    prisma.telegramReferralMember.findMany({
      where: { inviterId: Number(inviterId) },
      orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
      select: { id: true, joinedAt: true },
    }),
    prisma.telegramReferralReward.findMany({
      where: { inviterId: Number(inviterId) },
      select: { days: true, milestone: true, completedAt: true },
    }),
  ]);
  const tracking = getTrackingConfiguration();
  const reconciliationRequired = hasMilestoneBoundaryDrift(rewards, getMilestoneBoundaries(members));
  return {
    confirmedMembers: members.length,
    giftedDays: rewards.reduce((total, reward) => total + Number(reward.days || 0), 0),
    trackingEnabled: tracking.enabled && !reconciliationRequired,
    trackingStatus: reconciliationRequired
      ? 'RECONCILIATION_REQUIRED'
      : tracking.enabled ? 'ACTIVE' : 'NOT_CONFIGURED',
    trackingMissing: tracking.missing,
    reconciliationRequired,
  };
}

module.exports = {
  safeSecretEquals,
  isMember,
  channelMatches,
  getMilestoneBoundaries,
  hasMilestoneBoundaryDrift,
  getTrackingConfiguration,
  processTelegramUpdate,
  getReferralStats,
};
