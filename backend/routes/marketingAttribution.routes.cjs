'use strict';

const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware.cjs');
const { normalizeAttribution, recordVisit, recordEvent, getReport, getAdCampaigns, saveAdCampaign, getAdCampaignSlots, saveAdCampaignSlot, getAdCampaignArchives, deleteAdCampaignArchive } = require('../services/marketingAttribution.service.cjs');

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

router.post('/event', (req, res) => {
  try {
    const attribution = normalizeAttribution(req.body?.attribution);
    if (!attribution) return res.json({ success: true, data: { recorded: false } });
    const result = recordEvent({ input: attribution, eventType: String(req.body?.eventType || '') });
    return res.json({ success: true, data: result });
  } catch (error) {
    console.error('[MARKETING_ATTRIBUTION] event failed:', error.message);
    return res.status(500).json({ success: false, message: 'ثبت رویداد تبلیغاتی ناموفق بود.' });
  }
});


router.get('/settings', auth, auth.requireAdmin, (_req, res) => {
  try {
    return res.json({ success: true, data: { campaigns: getAdCampaigns() } });
  } catch (error) {
    console.error('[MARKETING_ATTRIBUTION] settings read failed:', error.message);
    return res.status(500).json({ success: false, message: 'دریافت تنظیمات پیام تبلیغات ناموفق بود.' });
  }
});

router.put('/settings', auth, auth.requireAdmin, (req, res) => {
  try {
    const result = saveAdCampaign(req.body || {});
    if (!result.saved) {
      const message = result.reason === 'missing-name' ? 'نام کانال یا سایت را وارد کنید.'
        : result.reason === 'missing-message' ? 'متن پیام تبلیغاتی را وارد کنید.'
        : 'شناسه کانال معتبر نیست.';
      return res.status(400).json({ success: false, message });
    }
    return res.json({ success: true, data: result });
  } catch (error) {
    console.error('[MARKETING_ATTRIBUTION] settings save failed:', error.message);
    return res.status(500).json({ success: false, message: 'ذخیره تنظیمات پیام تبلیغات ناموفق بود.' });
  }
});


router.get('/slots', auth, auth.requireAdmin, (_req, res) => {
  try { return res.json({ success: true, data: { slots: getAdCampaignSlots(), archives: getAdCampaignArchives() } }); }
  catch (error) { console.error('[MARKETING_ATTRIBUTION] slots read failed:', error.message); return res.status(500).json({ success: false, message: 'دریافت جایگاه‌های تبلیغاتی ناموفق بود.' }); }
});

router.put('/slots', auth, auth.requireAdmin, (req, res) => {
  try {
    const result = saveAdCampaignSlot(req.body || {});
    if (!result.saved) {
      const messages = {
        'invalid-slot': 'جایگاه تبلیغاتی معتبر نیست.',
        'incomplete-slot': 'برای فعال‌بودن جایگاه، هم نام کانال یا سایت و هم لینک اختصاصی را وارد کنید؛ برای غیرفعال‌کردن، هر دو را پاک کنید.',
        'invalid-link': 'لینک واردشده معتبر نیست.',
        'invalid-attribution-link': 'لینک باید شامل utm_source معتبر (نام سایت یا پلتفرم)، utm_medium=paid، utm_campaign=roniya_ads و utm_content معتبر باشد.',
        'duplicate-link': 'این لینک در جایگاه دیگری استفاده شده است.',
      };
      return res.status(400).json({ success: false, message: messages[result.reason] || 'تنظیمات جایگاه معتبر نیست.' });
    }
    return res.json({ success: true, data: result });
  } catch (error) { console.error('[MARKETING_ATTRIBUTION] slot save failed:', error.message); return res.status(500).json({ success: false, message: 'ذخیره جایگاه تبلیغاتی ناموفق بود.' }); }
});

router.delete('/archives/:id', auth, auth.requireAdmin, (req, res) => {
  try {
    const result = deleteAdCampaignArchive(req.params.id);
    if (!result.deleted) return res.status(404).json({ success: false, message: 'آرشیو موردنظر پیدا نشد.' });
    return res.json({ success: true, data: result });
  } catch (error) { console.error('[MARKETING_ATTRIBUTION] archive delete failed:', error.message); return res.status(500).json({ success: false, message: 'حذف آمار آرشیوشده ناموفق بود.' }); }
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
