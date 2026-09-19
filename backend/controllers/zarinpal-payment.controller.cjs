'use strict';

const paymentService = require('../services/zarinpal-payment.service.cjs');

function userId(req) {
  return Number(req.user?.userId || req.user?.id || req.user?.sub);
}

function errorResponse(res, error) {
  const status = Number(error?.statusCode) || 400;
  return res.status(status).json({
    success: false,
    message: error?.message || 'خطا در پردازش پرداخت.',
    code: error?.code || 'PAYMENT_ERROR',
  });
}

async function create(req, res) {
  try {
    const id = userId(req);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(401).json({ success: false, message: 'کاربر احراز هویت نشده است.' });
    }

    const planId = Number(req.body?.planId);
    if (!Number.isInteger(planId) || planId <= 0) {
      return res.status(400).json({ success: false, message: 'شناسه پلن اشتراک نامعتبر است.' });
    }

    const result = await paymentService.requestPayment({ userId: id, planId });
    return res.json({ success: true, data: result });
  } catch (error) {
    console.error('[ZARINPAL] create', error);
    return errorResponse(res, error);
  }
}

async function callback(req, res) {
  try {
    const authority = String(req.query?.Authority || '').trim();
    const status = String(req.query?.Status || '').trim();
    const result = await paymentService.verifyAndActivate(authority, status);
    return res.redirect(302, paymentService.callbackRedirect(result));
  } catch (error) {
    console.error('[ZARINPAL] callback', error);
    return res.redirect(302, paymentService.callbackRedirect({ success: false }));
  }
}

module.exports = { create, callback };
