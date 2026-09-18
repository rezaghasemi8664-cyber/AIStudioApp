'use strict';

const subscriptionService = require('../services/subscription.service.cjs');

function userId(req) {
  return Number(req.user?.userId || req.user?.id || req.user?.sub);
}

function isAdminUser(req) {
  return req.user?.isAdmin === true ||
    String(req.user?.role || '').toLowerCase() === 'admin';
}


function legacySubscriptionFromUser(user, now = new Date()) {
  if (!user?.subscriptionStart && !user?.subscriptionEnd) return null;
  const start = user.subscriptionStart ? new Date(user.subscriptionStart) : null;
  const end = user.subscriptionEnd ? new Date(user.subscriptionEnd) : null;
  if (start && Number.isNaN(start.getTime())) return null;
  if (end && Number.isNaN(end.getTime())) return null;
  const remainingDays = end ? Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86400000)) : 0;
  const isActive = Boolean(end && end.getTime() > now.getTime() && (!start || start.getTime() <= now.getTime()));
  const durationDays = start && end ? Math.max(0, Math.ceil((end.getTime() - start.getTime()) / 86400000)) : 0;
  return { subscriptionStart: start?.toISOString() || null, subscriptionEnd: end?.toISOString() || null, subscriptionMonths: Number(user.subscriptionMonths || 0), subscriptionDays: durationDays, remainingDays, isActive };
}

function errorResponse(res, error) {
  const status = Number(error?.statusCode) || 400;
  return res.status(status).json({ success: false, message: error?.message || 'خطا در پردازش اشتراک' });
}

async function me(req, res) {
  try {
    const id = userId(req);
    if (!Number.isInteger(id) || id <= 0) return res.status(401).json({ success: false, message: 'کاربر احراز هویت نشده است' });

    const admin = isAdminUser(req);
    const state = await subscriptionService.getSubscriptionState(id);
    let subscription = state.subscription;
    let legacy = null;
    if (!subscription) legacy = legacySubscriptionFromUser(await subscriptionService.getUserProfileSubscriptionFields(id));

    // Administrators have permanent application access and must not be
    // presented as having an inactive paid subscription in their profile.
    if (admin) {
      return res.json({
        success: true,
        data: {
          hasAccess: true,
          isActive: true,
          trialUsed: state.trialUsed,
          daysRemaining: state.daysRemaining,
          accessDeniedMessage: null,
          subscription: subscription || legacy ? { startsAt: legacy.subscriptionStart, expiresAt: legacy.subscriptionEnd, plan: legacy.subscriptionMonths > 0 ? { durationMonths: legacy.subscriptionMonths } : null } : null,
        },
      });
    }

    return res.json({
      success: true,
      data: {
        hasAccess: state.hasAccess,
        isActive: state.isActive,
        trialUsed: state.trialUsed,
        daysRemaining: state.daysRemaining,
        accessDeniedMessage: state.accessDeniedMessage,
        subscription: state.subscription,
      },
    });
  } catch (error) {
    console.error('[SUBSCRIPTIONS] me', error);
    return errorResponse(res, error);
  }
}

async function plans(req, res) {
  try {
    const rows = await subscriptionService.listActivePlans();
    return res.json({
      success: true,
      data: rows.map((plan) => ({
        id: plan.id,
        name: plan.name,
        code: plan.code,
        durationMonths: plan.durationMonths,
        price: plan.price,
        currency: plan.currency,
      })),
    });
  } catch (error) {
    console.error('[SUBSCRIPTIONS] plans', error);
    return errorResponse(res, error);
  }
}

module.exports = { me, plans };
