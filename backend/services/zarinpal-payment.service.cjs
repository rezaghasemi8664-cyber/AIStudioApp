'use strict';

const axios = require('axios');
const { prisma } = require('../config/prisma.cjs');
const subscriptionService = require('./subscription.service.cjs');

const PROVIDER = 'zarinpal';
const STATUS = Object.freeze({
  PENDING: 'PENDING',
  REDIRECTED: 'REDIRECTED',
  VERIFYING: 'VERIFYING',
  VERIFIED: 'VERIFIED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
});

function envBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function isSandbox() {
  return envBoolean(process.env.ZARINPAL_SANDBOX, false);
}

function apiBaseUrl() {
  return isSandbox() ? 'https://sandbox.zarinpal.com/pg/v4/payment' : 'https://api.zarinpal.com/pg/v4/payment';
}

function gatewayBaseUrl() {
  return isSandbox() ? 'https://sandbox.zarinpal.com/pg/StartPay/' : 'https://www.zarinpal.com/pg/StartPay/';
}

function merchantId() {
  const value = String(process.env.ZARINPAL_MERCHANT_ID || '').trim();
  if (!value) {
    const error = new Error('ZarinPal merchant ID تنظیم نشده است.');
    error.statusCode = 503;
    error.code = 'ZARINPAL_NOT_CONFIGURED';
    throw error;
  }
  return value;
}

function callbackUrl() {
  const value = String(process.env.ZARINPAL_CALLBACK_URL || '').trim();
  if (!value) {
    const error = new Error('آدرس callback زرین‌پال تنظیم نشده است.');
    error.statusCode = 503;
    error.code = 'ZARINPAL_CALLBACK_NOT_CONFIGURED';
    throw error;
  }
  return value;
}

function frontendUrl() {
  return String(
    process.env.ZARINPAL_FRONTEND_URL ||
    process.env.FRONTEND_URL ||
    'https://roniya-analyzer.ir'
  ).replace(/\/$/, '');
}

function toRialAmount(price) {
  const amount = Number(price);
  if (!Number.isSafeInteger(amount) || amount < 1000) {
    const error = new Error('مبلغ پلن برای پرداخت زرین‌پال معتبر نیست.');
    error.statusCode = 400;
    error.code = 'INVALID_PAYMENT_AMOUNT';
    throw error;
  }
  return amount;
}

async function getPaymentById(id) {
  const rows = await prisma.$queryRaw`
    SELECT TOP 1
      id, userId, planId, subscriptionId, amount, currency, provider,
      authority, refId, status, description, errorCode, errorMessage,
      metadataJson, createdAt, paidAt, updatedAt
    FROM dbo.PaymentTransaction
    WHERE id = ${Number(id)}
  `;
  return rows[0] || null;
}

async function getPaymentByAuthority(authority) {
  const rows = await prisma.$queryRaw`
    SELECT TOP 1
      id, userId, planId, subscriptionId, amount, currency, provider,
      authority, refId, status, description, errorCode, errorMessage,
      metadataJson, createdAt, paidAt, updatedAt
    FROM dbo.PaymentTransaction
    WHERE provider = ${PROVIDER} AND authority = ${authority}
  `;
  return rows[0] || null;
}

async function createPaymentTransaction({ userId, planId, amount, description }) {
  const rows = await prisma.$queryRaw`
    INSERT INTO dbo.PaymentTransaction
      (userId, planId, amount, currency, provider, status, description, createdAt, updatedAt)
    OUTPUT INSERTED.id
    VALUES
      (${Number(userId)}, ${Number(planId)}, ${amount}, N'IRR', ${PROVIDER}, ${STATUS.PENDING}, ${description}, SYSDATETIME(), SYSDATETIME())
  `;
  return Number(rows[0].id);
}

async function updatePayment(id, values) {
  await prisma.$executeRaw`
    UPDATE dbo.PaymentTransaction
    SET
      authority = ${values.authority ?? null},
      refId = ${values.refId ?? null},
      status = ${values.status},
      errorCode = ${values.errorCode ?? null},
      errorMessage = ${values.errorMessage ?? null},
      metadataJson = ${values.metadataJson ?? null},
      subscriptionId = ${values.subscriptionId ?? null},
      updatedAt = SYSDATETIME()
    WHERE id = ${Number(id)}
  `;
}

async function requestPayment({ userId, planId }) {
  const plan = await subscriptionService.getPlanById(planId);
  const currency = String(plan.currency || 'IRR').toUpperCase();
  if (currency !== 'IRR') {
    const error = new Error('واحد پول این پلن برای زرین‌پال باید IRR باشد.');
    error.statusCode = 400;
    error.code = 'UNSUPPORTED_PAYMENT_CURRENCY';
    throw error;
  }

  const amount = toRialAmount(plan.price);
  const description = `خرید اشتراک ${plan.name} - Roniya Analyzer`;
  const transactionId = await createPaymentTransaction({ userId, planId: plan.id, amount, description });

  try {
    const response = await axios.post(
      `${apiBaseUrl()}/request.json`,
      {
        merchant_id: merchantId(),
        amount,
        callback_url: callbackUrl(),
        description,
      },
      {
        timeout: 15000,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Roniya-Analyzer-ZarinPal/1.0',
        },
      },
    );

    const data = response?.data?.data;
    const errors = response?.data?.errors;
    if (!data || Number(data.code) !== 100 || !data.authority) {
      const errorCode = errors?.code != null ? String(errors.code) : String(data?.code ?? 'REQUEST_FAILED');
      const errorMessage = String(errors?.message || data?.message || 'ایجاد درخواست پرداخت در زرین‌پال ناموفق بود.');
      await updatePayment(transactionId, {
        status: STATUS.FAILED,
        errorCode,
        errorMessage,
        metadataJson: JSON.stringify(response?.data || {}),
      });
      const error = new Error(errorMessage);
      error.statusCode = 502;
      error.code = 'ZARINPAL_REQUEST_FAILED';
      throw error;
    }

    await updatePayment(transactionId, {
      authority: String(data.authority),
      status: STATUS.REDIRECTED,
      metadataJson: JSON.stringify({ code: data.code, fee: data.fee ?? null }),
    });

    return {
      transactionId,
      authority: String(data.authority),
      redirectUrl: `${gatewayBaseUrl()}${encodeURIComponent(String(data.authority))}`,
      amount,
      currency: 'IRR',
      plan: {
        id: plan.id,
        name: plan.name,
        durationMonths: plan.durationMonths,
      },
    };
  } catch (error) {
    if (error?.code === 'ZARINPAL_REQUEST_FAILED' || error?.code === 'ZARINPAL_NOT_CONFIGURED' || error?.code === 'ZARINPAL_CALLBACK_NOT_CONFIGURED') {
      throw error;
    }
    const message = error?.response?.data?.errors?.message || error?.message || 'ارتباط با زرین‌پال ناموفق بود.';
    await updatePayment(transactionId, {
      status: STATUS.FAILED,
      errorCode: error?.code || 'NETWORK_ERROR',
      errorMessage: String(message).slice(0, 1000),
      metadataJson: JSON.stringify(error?.response?.data || {}),
    });
    const wrapped = new Error(String(message));
    wrapped.statusCode = 502;
    wrapped.code = 'ZARINPAL_NETWORK_ERROR';
    throw wrapped;
  }
}

function addMonths(date, months) {
  const result = new Date(date);
  const originalDay = result.getDate();
  result.setMonth(result.getMonth() + months);
  if (result.getDate() < originalDay) result.setDate(0);
  return result;
}

async function verifyAndActivate(authority, status) {
  const normalizedAuthority = String(authority || '').trim();
  if (!normalizedAuthority) throw Object.assign(new Error('Authority زرین‌پال دریافت نشد.'), { statusCode: 400 });

  const payment = await getPaymentByAuthority(normalizedAuthority);
  if (!payment) throw Object.assign(new Error('تراکنش زرین‌پال پیدا نشد.'), { statusCode: 404 });

  if (payment.status === STATUS.VERIFIED && payment.subscriptionId) {
    return { success: true, alreadyVerified: true, payment, subscriptionId: Number(payment.subscriptionId), refId: payment.refId };
  }

  if (String(status || '').toUpperCase() === 'NOK') {
    await updatePayment(payment.id, {
      authority: normalizedAuthority,
      status: STATUS.CANCELLED,
      errorCode: 'USER_CANCELLED',
      errorMessage: 'پرداخت توسط کاربر تکمیل نشد.',
    });
    return { success: false, cancelled: true, payment: await getPaymentById(payment.id) };
  }

  const verifyingRows = await prisma.$queryRaw`
    UPDATE dbo.PaymentTransaction
    SET status = ${STATUS.VERIFYING}, updatedAt = SYSDATETIME()
    OUTPUT INSERTED.id
    WHERE id = ${Number(payment.id)}
      AND status IN (${STATUS.PENDING}, ${STATUS.REDIRECTED})
  `;

  if (!verifyingRows.length) {
    const latest = await getPaymentById(payment.id);
    if (latest?.status === STATUS.VERIFIED && latest.subscriptionId) {
      return { success: true, alreadyVerified: true, payment: latest, subscriptionId: Number(latest.subscriptionId), refId: latest.refId };
    }
    return { success: false, pending: true, payment: latest };
  }

  try {
    const amount = Number(payment.amount);
    const response = await axios.post(
      `${apiBaseUrl()}/verify.json`,
      {
        merchant_id: merchantId(),
        amount,
        authority: normalizedAuthority,
      },
      {
        timeout: 15000,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Roniya-Analyzer-ZarinPal/1.0',
        },
      },
    );

    const data = response?.data?.data;
    const errors = response?.data?.errors;
    const verifyCode = Number(data?.code);
    if (verifyCode !== 100 && verifyCode !== 101) {
      const errorCode = errors?.code != null ? String(errors.code) : String(data?.code ?? 'VERIFY_FAILED');
      const errorMessage = String(errors?.message || data?.message || 'تأیید پرداخت در زرین‌پال ناموفق بود.');
      await updatePayment(payment.id, {
        authority: normalizedAuthority,
        status: STATUS.FAILED,
        errorCode,
        errorMessage,
        metadataJson: JSON.stringify(response?.data || {}),
      });
      return { success: false, payment: await getPaymentById(payment.id), message: errorMessage };
    }

    const refId = data?.ref_id != null ? String(data.ref_id) : null;
    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      const latestRows = await tx.$queryRaw`
        SELECT TOP 1 id, userId, planId, status, subscriptionId
        FROM dbo.PaymentTransaction
        WHERE id = ${Number(payment.id)}
      `;
      const latest = latestRows[0];
      if (!latest) throw new Error('تراکنش در زمان فعال‌سازی پیدا نشد.');
      if (latest.status === STATUS.VERIFIED && latest.subscriptionId) {
        return { subscriptionId: Number(latest.subscriptionId), alreadyVerified: true };
      }

      const plan = await tx.subscriptionPlan.findUnique({ where: { id: Number(latest.planId) } });
      if (!plan || !plan.isActive) throw new Error('پلن انتخاب‌شده دیگر فعال نیست.');

      const current = await tx.subscription.findFirst({
        where: {
          userId: Number(latest.userId),
          status: 'ACTIVE',
          expiresAt: { gt: now },
        },
        orderBy: { expiresAt: 'desc' },
      });

      const startsAt = current ? new Date(current.expiresAt) : now;
      const expiresAt = addMonths(startsAt, Number(plan.durationMonths));

      const subscription = await tx.subscription.create({
        data: {
          userId: Number(latest.userId),
          planId: Number(plan.id),
          type: 'PAID',
          status: 'ACTIVE',
          startsAt,
          expiresAt,
        },
      });

      await tx.$executeRaw`
        UPDATE dbo.PaymentTransaction
        SET
          status = ${STATUS.VERIFIED},
          refId = ${refId},
          subscriptionId = ${subscription.id},
          paidAt = SYSDATETIME(),
          errorCode = NULL,
          errorMessage = NULL,
          metadataJson = ${JSON.stringify({ verifyCode, refId })},
          updatedAt = SYSDATETIME()
        WHERE id = ${Number(payment.id)}
      `;

      return { subscriptionId: subscription.id, alreadyVerified: false };
    });

    return {
      success: true,
      alreadyVerified: result.alreadyVerified,
      subscriptionId: result.subscriptionId,
      refId,
      payment: await getPaymentById(payment.id),
    };
  } catch (error) {
    await updatePayment(payment.id, {
      authority: normalizedAuthority,
      status: STATUS.FAILED,
      errorCode: error?.code || 'VERIFY_EXCEPTION',
      errorMessage: String(error?.message || 'خطا در تأیید پرداخت.').slice(0, 1000),
    });
    throw error;
  }
}

function callbackRedirect(params) {
  const url = new URL(frontendUrl());
  url.searchParams.set('payment', params.success ? 'success' : params.cancelled ? 'cancelled' : params.pending ? 'pending' : 'failed');
  if (params.refId) url.searchParams.set('refId', String(params.refId));
  return url.toString();
}

module.exports = {
  PROVIDER,
  STATUS,
  requestPayment,
  verifyAndActivate,
  callbackRedirect,
};
