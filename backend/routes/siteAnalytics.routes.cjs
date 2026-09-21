'use strict';

const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware.cjs');
const { recordVisit, heartbeat, getTodayStats } = require('../services/siteAnalytics.service.cjs');

router.post('/visit', auth.optionalAuth, (req, res) => {
  try {
    const result = recordVisit({ visitorId: req.cookies?.roniyaVisitorId, user: req.user });
    res.cookie('roniyaVisitorId', result.visitorId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 365 * 24 * 60 * 60 * 1000,
      path: '/',
    });
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('[SITE_ANALYTICS] visit failed:', error.message);
    res.status(500).json({ success: false, message: 'ثبت بازدید ناموفق بود.' });
  }
});

router.post('/heartbeat', auth.optionalAuth, (req, res) => {
  try {
    const result = heartbeat({ visitorId: req.cookies?.roniyaVisitorId, user: req.user });
    res.cookie('roniyaVisitorId', result.visitorId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 365 * 24 * 60 * 60 * 1000,
      path: '/',
    });
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('[SITE_ANALYTICS] heartbeat failed:', error.message);
    res.status(500).json({ success: false, message: 'ثبت وضعیت آنلاین ناموفق بود.' });
  }
});

router.get('/today', auth, auth.requireAdmin, (req, res) => {
  try {
    res.json({
      success: true,
      data: getTodayStats(),
      meta: {
        status: 'LIVE',
        source: 'Roniya Site Analytics',
        fetchedAt: new Date().toISOString(),
        stale: false,
      },
    });
  } catch (error) {
    console.error('[SITE_ANALYTICS] stats failed:', error.message);
    res.status(500).json({ success: false, message: 'دریافت آمار بازدید ناموفق بود.' });
  }
});

module.exports = router;