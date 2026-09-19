'use strict';

const express = require('express');
const authenticate = require('../middlewares/auth.middleware.cjs');
const { getReports } = require('../services/codalIntelligence.service.cjs');

const router = express.Router();

router.get('/reports', authenticate, async (req, res) => {
  try {
    const result = await getReports({
      symbol: String(req.query.symbol || '').trim(),
      from: String(req.query.from || '').trim(),
      to: String(req.query.to || '').trim(),
      limit: req.query.limit,
    });
    return res.json({ success: true, data: result });
  } catch (error) {
    const status = error?.code === 'CODAL_NOT_CONFIGURED' ? 503 : 502;
    return res.status(status).json({
      success: false,
      code: error?.code || 'CODAL_FETCH_FAILED',
      message: error?.message || 'دریافت اطلاعیه‌های کدال ناموفق بود.',
    });
  }
});

router.get('/recent', authenticate, async (req, res) => {
  try {
    const result = await getReports({
      symbol: '',
      from: '',
      to: '',
      limit: req.query.limit || 8,
    });
    return res.json({ success: true, data: result });
  } catch (error) {
    const status = error?.code === 'CODAL_NOT_CONFIGURED' ? 503 : 502;
    return res.status(status).json({
      success: false,
      code: error?.code || 'CODAL_FETCH_FAILED',
      message: error?.message || 'دریافت اطلاعیه‌های اخیر کدال ناموفق بود.',
    });
  }
});

module.exports = router;
