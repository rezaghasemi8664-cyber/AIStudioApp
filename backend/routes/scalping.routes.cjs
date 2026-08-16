'use strict';

const express = require('express');
const router = express.Router();
// استفاده از require استاندارد به جای بلوک try-catch طولانی (چون در محیط شما قطعی است)
const authMiddleware = require('../middlewares/auth.middleware.cjs');
const scalpingController = require('../controllers/scalping.controller.cjs');

function safeHandler(fn, name) {
  if (typeof fn === 'function') return fn;
  return function (_req, res) {
    return res.status(501).json({ // استفاده از 501 Not Implemented برای متدهای ناقص
      success: false,
      message: 'Scalping handler not implemented: ' + name,
      code: 'SCALPING_HANDLER_MISSING',
    });
  };
}

// Routes
router.get('/settings', authMiddleware, safeHandler(scalpingController.getSettings, 'getSettings'));
router.put('/settings', authMiddleware, safeHandler(scalpingController.updateSettings, 'updateSettings'));

router.get('/signals', authMiddleware, safeHandler(scalpingController.getSignals, 'getSignals'));
// اگر قصد پیاده‌سازی ایجاد سیگنال دستی ندارید، خط زیر را کامنت کنید:
// router.post('/signals', authMiddleware, safeHandler(scalpingController.createSignal, 'createSignal'));

router.get('/best', authMiddleware, safeHandler(scalpingController.getBestSignal, 'getBestSignal'));
router.get('/history', authMiddleware, safeHandler(scalpingController.getHistory, 'getHistory'));
router.get('/status', authMiddleware, safeHandler(scalpingController.getStatus, 'getStatus'));

router.post('/start', authMiddleware, safeHandler(scalpingController.start, 'start'));
router.post('/stop', authMiddleware, safeHandler(scalpingController.stop, 'stop'));

// Backward-compatible aliases
router.get('/config', authMiddleware, safeHandler(scalpingController.getSettings, 'getSettings'));
router.put('/config', authMiddleware, safeHandler(scalpingController.updateSettings, 'updateSettings'));
router.post('/run', authMiddleware, safeHandler(scalpingController.runScalping, 'runScalping'));

module.exports = router;
