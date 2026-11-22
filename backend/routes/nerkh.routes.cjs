'use strict';

const express = require('express');
const prisma = require('../config/prisma.cjs');
const authMiddleware = require('../middlewares/auth.middleware.cjs');
const { encryptPassword } = require('../services/passwordVault.service.cjs');
const nerkh = require('../services/nerkhPrice.service.cjs');

const router = express.Router();
const requireAdmin = authMiddleware.requireAdmin;

router.get('/prices', authMiddleware, (_req, res) => {
  const snapshot = nerkh.getCachedPrices();
  if (!snapshot) return res.status(503).json({ success: false, code: 'NERKH_SNAPSHOT_NOT_READY', message: 'اسنپ‌شات قیمت‌های Nerkh هنوز آماده نیست.' });
  return res.json({ success: true, data: snapshot, source: 'central-cache' });
});

router.get('/admin/token-status', authMiddleware, requireAdmin, async (_req, res) => {
  try {
    const setting = await prisma.globalSetting.findUnique({ where: { key: nerkh.TOKEN_KEY }, select: { category: true, value: true, updatedAt: true } });
    const configured = Boolean(setting && setting.category === nerkh.TOKEN_CATEGORY && setting.value);
    return res.json({ success: true, data: { configured, updatedAt: configured ? setting.updatedAt : null } });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'دریافت وضعیت توکن Nerkh ناموفق بود.' });
  }
});

router.put('/admin/token', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const token = String(req.body?.token || '').trim();
    if (!token || token.length > 2048 || /\\s/.test(token)) {
      return res.status(400).json({ success: false, message: 'توکن واردشده معتبر نیست.' });
    }
    const encrypted = encryptPassword(token);
    await prisma.globalSetting.upsert({
      where: { key: nerkh.TOKEN_KEY },
      update: { category: nerkh.TOKEN_CATEGORY, value: encrypted, updatedBy: String(req.user?.id ?? ''), updatedAt: new Date(), isPublic: false },
      create: { category: nerkh.TOKEN_CATEGORY, key: nerkh.TOKEN_KEY, value: encrypted, updatedBy: String(req.user?.id ?? ''), isPublic: false }
    });
    void nerkh.refreshPrices({ reason: 'token-updated' });
    return res.json({ success: true, data: { configured: true }, message: 'توکن Nerkh به‌صورت رمزنگاری‌شده ذخیره شد.' });
  } catch (error) {
    console.error('[NERKH] Token save failed:', error?.name || 'SAVE_ERROR');
    return res.status(500).json({ success: false, message: error.message?.includes('PASSWORD_VAULT_KEY') ? 'کلید رمزنگاری PASSWORD_VAULT_KEY یا JWT_SECRET روی سرور تنظیم نشده است.' : 'ذخیره توکن Nerkh ناموفق بود.' });
  }
});

router.post('/admin/test-connection', authMiddleware, requireAdmin, async (_req, res) => {
  try {
    const token = await nerkh.getToken();
    if (!token) return res.status(400).json({ success: false, message: 'ابتدا توکن Nerkh را ثبت کنید.' });
    const payload = await nerkh.requestPrices(token);
    const groups = nerkh.normalizePayload(payload).groups;
    return res.json({ success: true, data: { connected: true, counts: { gold: groups.gold.length, currency: groups.currency.length, crypto: groups.crypto.length } }, message: 'اتصال به Nerkh موفق بود.' });
  } catch (error) {
    return res.status(error.statusCode && error.statusCode >= 400 && error.statusCode < 500 ? 400 : 502)
      .json({ success: false, message: error.message || 'آزمون اتصال Nerkh ناموفق بود.' });
  }
});

module.exports = router;
