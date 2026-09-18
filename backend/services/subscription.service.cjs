'use strict';

const { prisma } = require('../config/prisma.cjs');

const SUBSCRIPTION_TYPES = Object.freeze({
  FREE_TRIAL: 'FREE_TRIAL',
  PAID: 'PAID',
});

const SUBSCRIPTION_STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
});

const TRIAL_CONFIG_KEYS = Object.freeze({
  ENABLED: 'subscription.trial.enabled',
  DURATION_DAYS: 'subscription.trial.durationDays',
});

const ACCESS_DENIED_MESSAGE = 'جهت دسترسی به امکانات نرم افزار لطفا اشتراک تهیه فرمایید';

function toPositiveInt(value, fallback = 0) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(String(value).trim().toLowerCase());
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function addMonths(date, months) {
  const result = new Date(date);
  const originalDay = result.getDate();
  result.setMonth(result.getMonth() + months);
  if (result.getDate() < originalDay) result.setDate(0);
  return result;
}

function isActiveSubscription(subscription, now = new Date()) {
  return !!subscription &&
    subscription.status === SUBSCRIPTION_STATUS.ACTIVE &&
    new Date(subscription.startsAt) <= now &&
    new Date(subscription.expiresAt) > now;
}

async function getConfigValue(key) {
  const config = await prisma.appConfig.findUnique({
    where: { key },
    select: { value: true },
  });
  return config?.value ?? null;
}

async function getTrialConfig() {
  const [enabledValue, durationValue] = await Promise.all([
    getConfigValue(TRIAL_CONFIG_KEYS.ENABLED),
    getConfigValue(TRIAL_CONFIG_KEYS.DURATION_DAYS),
  ]);

  return {
    enabled: parseBoolean(enabledValue, true),
    durationDays: toPositiveInt(durationValue, 2),
  };
}

async function getUserSubscriptions(userId) {
  return prisma.subscription.findMany({
    where: { userId: Number(userId) },
    orderBy: [{ expiresAt: 'desc' }, { createdAt: 'desc' }],
    include: {
      plan: true,
    },
  });
}

async function getCurrentSubscription(userId, now = new Date()) {
  const subscriptions = await prisma.subscription.findMany({
    where: {
      userId: Number(userId),
      status: SUBSCRIPTION_STATUS.ACTIVE,
      expiresAt: { gt: now },
    },
    orderBy: { expiresAt: 'desc' },
    include: { plan: true },
    take: 1,
  });

  const current = subscriptions[0] || null;
  if (current && new Date(current.startsAt) <= now) return current;
  return null;
}

async function hasUsedTrial(userId) {
  const trial = await prisma.subscription.findFirst({
    where: {
      userId: Number(userId),
      type: SUBSCRIPTION_TYPES.FREE_TRIAL,
    },
    select: { id: true },
  });
  return !!trial;
}

async function createTrialForUser(userId, now = new Date()) {
  const existing = await hasUsedTrial(userId);
  if (existing) return null;

  const config = await getTrialConfig();
  if (!config.enabled || config.durationDays <= 0) return null;

  const expiresAt = addDays(now, config.durationDays);

  return prisma.subscription.create({
    data: {
      userId: Number(userId),
      planId: null,
      type: SUBSCRIPTION_TYPES.FREE_TRIAL,
      status: SUBSCRIPTION_STATUS.ACTIVE,
      startsAt: now,
      expiresAt,
    },
    include: { plan: true },
  });
}

async function expireOldSubscriptions(userId, now = new Date()) {
  await prisma.subscription.updateMany({
    where: {
      userId: Number(userId),
      status: SUBSCRIPTION_STATUS.ACTIVE,
      expiresAt: { lte: now },
    },
    data: {
      status: SUBSCRIPTION_STATUS.EXPIRED,
    },
  });
}

async function getSubscriptionState(userId, now = new Date()) {
  await expireOldSubscriptions(userId, now);

  const current = await getCurrentSubscription(userId, now);
  const trialUsed = await hasUsedTrial(userId);

  if (current) {
    const expiresAt = new Date(current.expiresAt);
    const daysRemaining = Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / 86400000));
    return {
      hasAccess: true,
      isActive: true,
      subscription: current,
      trialUsed,
      daysRemaining,
      accessDeniedMessage: null,
    };
  }

  return {
    hasAccess: false,
    isActive: false,
    subscription: null,
    trialUsed,
    daysRemaining: 0,
    accessDeniedMessage: ACCESS_DENIED_MESSAGE,
  };
}

async function listActivePlans() {
  return prisma.subscriptionPlan.findMany({
    where: { isActive: true },
    orderBy: [{ durationMonths: 'asc' }, { price: 'asc' }],
  });
}

async function getPlanById(planId) {
  const id = Number(planId);
  if (!Number.isInteger(id) || id <= 0) throw new Error('پلن اشتراک نامعتبر است.');

  const plan = await prisma.subscriptionPlan.findUnique({ where: { id } });
  if (!plan || !plan.isActive) throw new Error('پلن اشتراک فعال نیست.');
  if (toPositiveInt(plan.durationMonths, 0) <= 0) throw new Error('مدت پلن اشتراک نامعتبر است.');
  return plan;
}

async function calculatePaidSubscriptionDates(userId, planId, now = new Date()) {
  const plan = await getPlanById(planId);
  const current = await getCurrentSubscription(userId, now);

  const startsAt = current && new Date(current.expiresAt) > now
    ? new Date(current.expiresAt)
    : now;
  const expiresAt = addMonths(startsAt, plan.durationMonths);

  return { plan, current, startsAt, expiresAt };
}

async function activatePaidSubscription(userId, planId, paymentId = null, now = new Date()) {
  const { plan, startsAt, expiresAt } = await calculatePaidSubscriptionDates(userId, planId, now);

  return prisma.$transaction(async (tx) => {
    await tx.subscription.updateMany({
      where: {
        userId: Number(userId),
        status: SUBSCRIPTION_STATUS.ACTIVE,
        expiresAt: { lte: now },
      },
      data: { status: SUBSCRIPTION_STATUS.EXPIRED },
    });

    const subscription = await tx.subscription.create({
      data: {
        userId: Number(userId),
        planId: plan.id,
        type: SUBSCRIPTION_TYPES.PAID,
        status: SUBSCRIPTION_STATUS.ACTIVE,
        startsAt,
        expiresAt,
      },
      include: { plan: true },
    });

    // Keep the legacy User subscription fields synchronized with the
    // authoritative Subscription record so admin and profile views agree.
    await tx.user.update({
      where: { id: Number(userId) },
      data: {
        subscriptionStart: startsAt,
        subscriptionEnd: expiresAt,
        subscriptionMonths: plan.durationMonths,
        subscriptionType: SUBSCRIPTION_TYPES.PAID,
      },
    });

    return { subscription, paymentId };
  });
}

async function assertFeatureAccess(userId) {
  const state = await getSubscriptionState(userId);
  if (!state.hasAccess) {
    const error = new Error(ACCESS_DENIED_MESSAGE);
    error.code = 'SUBSCRIPTION_REQUIRED';
    error.statusCode = 403;
    throw error;
  }
  return state;
}

module.exports = {
  SUBSCRIPTION_TYPES,
  SUBSCRIPTION_STATUS,
  TRIAL_CONFIG_KEYS,
  ACCESS_DENIED_MESSAGE,
  getTrialConfig,
  getUserSubscriptions,
  getCurrentSubscription,
  hasUsedTrial,
  createTrialForUser,
  expireOldSubscriptions,
  getSubscriptionState,
  listActivePlans,
  getPlanById,
  calculatePaidSubscriptionDates,
  activatePaidSubscription,
  assertFeatureAccess,
};
