'use strict';

const express = require('express');
const authMiddleware = require('../middlewares/auth.middleware.cjs');
const farazsmsAdmin = require('../services/farazsmsAdmin.service.cjs');
const farazsmsSend = require('../services/farazsmsSend.service.cjs');

const router = express.Router();

function isAdmin(req) {
  const user = req.user || {};
  if (user.isAdmin === true || String(user.role || '').toLowerCase() === 'admin') return true;
  return (Array.isArray(user.roles) ? user.roles : []).some((role) => String(typeof role === 'string' ? role : role?.name).toLowerCase() === 'admin');
}

function requireAdmin(req, res, next) {
  if (!isAdmin(req)) return res.status(403).json({ success: false, message: 'دسترسی فقط برای مدیر سامانه مجاز است.' });
  next();
}

function handleError(res, error, fallback) {
  return res.status(error.statusCode || 502).json({ success: false, message: error.message || fallback });
}

router.use(authMiddleware, requireAdmin);

router.get('/status', async (_req, res) => {
  res.json({ success: true, data: await farazsmsAdmin.getStatus() });
});

router.get('/account/balance', async (_req, res) => {
  try { return res.json({ success: true, data: await farazsmsAdmin.getBalance() }); }
  catch (error) { return handleError(res, error, 'دریافت اعتبار فراز اس‌ام‌اس ناموفق بود.'); }
});

router.get('/account/profile', async (_req, res) => {
  try { return res.json({ success: true, data: await farazsmsAdmin.getProfile() }); }
  catch (error) { return handleError(res, error, 'دریافت اطلاعات حساب فراز اس‌ام‌اس ناموفق بود.'); }
});

router.post('/send-simple', async (req, res) => {
  try { return res.json({ success: true, data: await farazsmsSend.sendSimple(req.body || {}) }); }
  catch (error) { return handleError(res, error, 'ارسال پیامک ساده ناموفق بود.'); }
});

router.post('/send-pattern', async (req, res) => {
  try { return res.json({ success: true, data: await farazsmsSend.sendPattern(req.body || {}) }); }
  catch (error) { return handleError(res, error, 'ارسال پیامک الگویی ناموفق بود.'); }
});

module.exports = router;
