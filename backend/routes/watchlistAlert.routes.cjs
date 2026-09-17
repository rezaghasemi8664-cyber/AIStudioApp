'use strict';

const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware.cjs');
const alertService = require('../services/watchlistAlert.service.cjs');

router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const userId = alertService.getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: 'کاربر احراز هویت نشده است.' });
    return res.json({ success: true, data: { alerts: await alertService.readRules(userId) } });
  } catch (error) {
    console.error('[WATCHLIST-ALERT] GET failed:', error);
    return res.status(500).json({ success: false, message: 'خطا در دریافت هشدارها.' });
  }
});

router.post('/', async (req, res) => {
  try {
    const userId = alertService.getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: 'کاربر احراز هویت نشده است.' });
    const alert = await alertService.createRule(userId, req.body || {});
    return res.status(201).json({ success: true, data: alert });
  } catch (error) {
    console.error('[WATCHLIST-ALERT] CREATE failed:', error);
    return res.status(400).json({ success: false, message: error.message || 'ایجاد هشدار ناموفق بود.' });
  }
});

router.post('/evaluate', async (req, res) => {
  try {
    const userId = alertService.getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: 'کاربر احراز هویت نشده است.' });
    const result = await alertService.evaluateArmedRules(userId);
    return res.json({ success: true, data: result });
  } catch (error) {
    console.error('[WATCHLIST-ALERT] EVALUATE failed:', error);
    return res.status(500).json({ success: false, message: 'اجرای موتور هشدار ناموفق بود.' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const userId = alertService.getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: 'کاربر احراز هویت نشده است.' });
    const alert = await alertService.updateRule(userId, req.params.id, req.body || {});
    if (!alert) return res.status(404).json({ success: false, message: 'هشدار پیدا نشد.' });
    return res.json({ success: true, data: alert });
  } catch (error) {
    console.error('[WATCHLIST-ALERT] UPDATE failed:', error);
    return res.status(400).json({ success: false, message: error.message || 'ویرایش هشدار ناموفق بود.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const userId = alertService.getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: 'کاربر احراز هویت نشده است.' });
    const deleted = await alertService.deleteRule(userId, req.params.id);
    if (!deleted) return res.status(404).json({ success: false, message: 'هشدار پیدا نشد.' });
    return res.json({ success: true, data: { id: String(req.params.id) } });
  } catch (error) {
    console.error('[WATCHLIST-ALERT] DELETE failed:', error);
    return res.status(500).json({ success: false, message: 'حذف هشدار ناموفق بود.' });
  }
});

module.exports = router;
