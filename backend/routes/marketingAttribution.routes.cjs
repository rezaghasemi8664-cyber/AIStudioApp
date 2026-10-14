'use strict';

const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware.cjs');
const { normalizeAttribution, recordVisit, getReport } = require('../services/marketingAttribution.service.cjs');

router.post('/visit', (req, res) => {
  try {
    const attribution = normalizeAttribution(req.body?.attribution);
    if (!attribution) return res.json({ success: true, data: { recorded: false } });

    const secure = req.secure === true || String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https';
    // Server-side fallback ensures registration attribution survives SPA navigation
    // and does not depend exclusively on browser localStorage.
    res.cookie('roniyaMarketingAttribution', [
      attribution.source, attribution.medium, attribution.campaign, attribution.content,
    ].join('|'), {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    const result = recordVisit(attribution);
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
