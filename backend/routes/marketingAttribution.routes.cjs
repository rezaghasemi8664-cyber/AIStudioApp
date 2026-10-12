'use strict';

const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware.cjs');
const { recordVisit, getReport } = require('../services/marketingAttribution.service.cjs');

router.post('/visit', (req, res) => {
  try {
    const result = recordVisit(req.body?.attribution);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('[MARKETING_ATTRIBUTION] visit failed:', error.message);
    res.status(500).json({ success: false, message: 'ثبت بازدید تبلیغاتی ناموفق بود.' });
  }
});

router.get('/report', auth, auth.requireAdmin, (_req, res) => {
  try {
    res.json({ success: true, data: getReport() });
  } catch (error) {
    console.error('[MARKETING_ATTRIBUTION] report failed:', error.message);
    res.status(500).json({ success: false, message: 'دریافت گزارش تبلیغات ناموفق بود.' });
  }
});

module.exports = router;
