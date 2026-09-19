'use strict';

const express = require('express');
const router = express.Router();

let authMiddleware = (req, res, next) => next();
try {
  const auth = require('../middlewares/auth.middleware.cjs');
  authMiddleware = auth.authenticate || auth.authMiddleware || auth.verifyToken || authMiddleware;
} catch (error) {
  console.warn('[STRATEGY-ROUTES] Auth middleware load warning:', error.message);
}

const service = require('../services/strategyLab.service.cjs');

router.post('/backtest', authMiddleware, async (req, res) => {
  try {
    const result = await service.backtestStrategy(req.body || {});
    return res.json({
      success: true,
      data: result,
      deterministic: true,
      engine: result.engine,
    });
  } catch (error) {
    console.error('[STRATEGY-ROUTES] Backtest error:', error.message);
    return res.status(Number(error.statusCode) >= 400 ? Number(error.statusCode) : 500).json({
      success: false,
      message: error.message || 'خطا در اجرای بک‌تست',
      code: error.code || 'STRATEGY_BACKTEST_ERROR',
      dataQuality: error.dataQuality,
      requestId: req.requestId,
    });
  }
});

module.exports = router;
