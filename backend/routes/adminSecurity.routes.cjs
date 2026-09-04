'use strict';

const express = require('express');
const { prisma } = require('../config/prisma.cjs');
const authMiddleware = require('../middlewares/auth.middleware.cjs');

const router = express.Router();

const DEFAULT_SECURITY = {
  passwordMinLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSpecial: false,
  maxLoginAttempts: 20,
  lockoutMinutes: 15,
  sessionMaxAgeHours: 24,
  maxSessionsPerUser: 5,
};

const DEFAULT_SETTINGS = {
  siteName: 'تحلیلگر هوشمند بورس رونیا',
  defaultLanguage: 'fa',
  timezone: 'Asia/Tehran',
  defaultTheme: 'system',
  enableNotifications: true,
  enableRegistration: true,
};

const DEFAULT_MAINTENANCE = {
  enabled: false,
  message: 'سامانه موقتاً در حال بروزرسانی و نگهداری است. لطفاً بعداً مراجعه کنید.',
  allowAdmins: true,
};

function uid(req) { return Number(req.user?.id || req.user?.userId || 0) || null; }
function fail(res, status, message) { return res.status(status).json({ success:false, message }); }
function isAdmin(req) {
  const u = req.user || {};
  if (u.isAdmin === true) return true;
  if (['admin','superadmin'].includes(String(u.role || '').toLowerCase())) return true;
  return (Array.isArray(u.roles) ? u.roles : []).some(r => ['admin','superadmin'].includes(String(typeof r === 'string' ? r : r?.name).toLowerCase()));
}

async function getSetting(category, key, fallback) {
  const row = await prisma.globalSetting.findUnique({ where:{ key } });
  if (!row || row.category !== category) return fallback;
  try { return JSON.parse(row.value); } catch { return row.value; }
}

async function saveSetting(category, key, value, req) {
  const row = await prisma.globalSetting.upsert({
    where:{ key },
    update:{ value:JSON.stringify(value), updatedBy:uid(req), updatedAt:new Date(), category },
    create:{ category, key, value:JSON.stringify(value), updatedBy:uid(req) },
  });
  const io = req.app.get('io');
  if (io) io.emit('global-settings:updated', { category, key, value, updatedBy:uid(req), updatedAt:row.updatedAt });
  return value;
}

function normalizeSecurity(input) {
  const x = input || {};
  return {
    passwordMinLength: Math.min(64, Math.max(6, Number(x.passwordMinLength ?? DEFAULT_SECURITY.passwordMinLength) || DEFAULT_SECURITY.passwordMinLength)),
    requireUppercase: Boolean(x.requireUppercase),
    requireLowercase: Boolean(x.requireLowercase),
    requireNumber: Boolean(x.requireNumber),
    requireSpecial: Boolean(x.requireSpecial),
    maxLoginAttempts: Math.min(100, Math.max(3, Number(x.maxLoginAttempts ?? DEFAULT_SECURITY.maxLoginAttempts) || DEFAULT_SECURITY.maxLoginAttempts)),
    lockoutMinutes: Math.min(1440, Math.max(1, Number(x.lockoutMinutes ?? DEFAULT_SECURITY.lockoutMinutes) || DEFAULT_SECURITY.lockoutMinutes)),
    sessionMaxAgeHours: Math.min(720, Math.max(1, Number(x.sessionMaxAgeHours ?? DEFAULT_SECURITY.sessionMaxAgeHours) || DEFAULT_SECURITY.sessionMaxAgeHours)),
    maxSessionsPerUser: Math.min(50, Math.max(1, Number(x.maxSessionsPerUser ?? DEFAULT_SECURITY.maxSessionsPerUser) || DEFAULT_SECURITY.maxSessionsPerUser)),
  };
}

function normalizeSettings(input) {
  const x = input || {};
  return {
    siteName: String(x.siteName ?? DEFAULT_SETTINGS.siteName).trim().slice(0,120) || DEFAULT_SETTINGS.siteName,
    defaultLanguage: ['fa','en'].includes(String(x.defaultLanguage)) ? String(x.defaultLanguage) : DEFAULT_SETTINGS.defaultLanguage,
    timezone: String(x.timezone ?? DEFAULT_SETTINGS.timezone).trim().slice(0,80) || DEFAULT_SETTINGS.timezone,
    defaultTheme: ['system','light','dark'].includes(String(x.defaultTheme)) ? String(x.defaultTheme) : DEFAULT_SETTINGS.defaultTheme,
    enableNotifications: Boolean(x.enableNotifications),
    enableRegistration: Boolean(x.enableRegistration),
  };
}

function normalizeMaintenance(input) {
  const x = input || {};
  return {
    enabled: Boolean(x.enabled),
    message: String(x.message ?? DEFAULT_MAINTENANCE.message).trim().slice(0,500) || DEFAULT_MAINTENANCE.message,
    allowAdmins: x.allowAdmins !== false,
  };
}

router.use(authMiddleware, (req,res,next) => isAdmin(req) ? next() : fail(res,403,'این بخش فقط برای مدیر سامانه مجاز است.'));

router.get('/security', async (req,res) => {
  try { return res.json({success:true,data:await getSetting('security','security.policy',DEFAULT_SECURITY)}); }
  catch(e) { return fail(res,500,'خطا در دریافت سیاست امنیتی.'); }
});
router.put('/security', async (req,res) => {
  try { const data=normalizeSecurity(req.body); await saveSetting('security','security.policy',data,req); return res.json({success:true,message:'سیاست امنیتی ذخیره شد.',data}); }
  catch(e) { console.error('[ADMIN-SECURITY]',e); return fail(res,500,'ذخیره سیاست امنیتی ناموفق بود.'); }
});

router.get('/settings', async (req,res) => {
  try { return res.json({success:true,data:await getSetting('settings','system.settings',DEFAULT_SETTINGS)}); }
  catch(e) { return fail(res,500,'خطا در دریافت تنظیمات سامانه.'); }
});
router.put('/settings', async (req,res) => {
  try { const data=normalizeSettings(req.body); await saveSetting('settings','system.settings',data,req); return res.json({success:true,message:'تنظیمات سامانه ذخیره شد.',data}); }
  catch(e) { console.error('[ADMIN-SETTINGS]',e); return fail(res,500,'ذخیره تنظیمات سامانه ناموفق بود.'); }
});

router.get('/maintenance', async (req,res) => {
  try { return res.json({success:true,data:await getSetting('maintenance','maintenance.policy',DEFAULT_MAINTENANCE)}); }
  catch(e) { return fail(res,500,'خطا در دریافت وضعیت تعمیرات.'); }
});
router.put('/maintenance', async (req,res) => {
  try { const data=normalizeMaintenance(req.body); await saveSetting('maintenance','maintenance.policy',data,req); return res.json({success:true,message:data.enabled?'حالت تعمیرات فعال شد.':'حالت تعمیرات غیرفعال شد.',data}); }
  catch(e) { console.error('[ADMIN-MAINTENANCE]',e); return fail(res,500,'ذخیره حالت تعمیرات ناموفق بود.'); }
});
router.post('/maintenance/toggle', async (req,res) => {
  try {
    const current=await getSetting('maintenance','maintenance.policy',DEFAULT_MAINTENANCE);
    const data=normalizeMaintenance({...current,enabled:req.body?.enabled});
    await saveSetting('maintenance','maintenance.policy',data,req);
    return res.json({success:true,message:data.enabled?'حالت تعمیرات فعال شد.':'حالت تعمیرات غیرفعال شد.',data});
  } catch(e) { return fail(res,500,'تغییر وضعیت تعمیرات ناموفق بود.'); }
});

module.exports = router;
