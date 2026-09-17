'use strict';

const subscriptionService = require('../services/subscription.service.cjs');

function userId(req) {
  return Number(req.user?.userId || req.user?.id || req.user?.sub);
}

function errorResponse(res, error) {
  const status = Number(error?.statusCode) || 400;
  return res.status(status).json({ success: false, message: error?.message || 'خطا در پردازش اشتراک' });
}

async function me(req, res) {
  try {
    const id = userId(req);
    if (!Number.isInteger(id) || id <= 0) return res.status(401).json({ success: false, message: 'کاربر احراز هویت نشده است' });
    const state = await subscriptionService.getSubscriptionState(id);
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
