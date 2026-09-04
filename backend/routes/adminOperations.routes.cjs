'use strict';

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const auth = require('../middlewares/auth.middleware.cjs');
const router = express.Router();
const prisma = new PrismaClient();

const MODULES = {
  dashboard: 'داشبورد مدیریتی', users: 'مدیریت کاربران', subscriptions: 'اشتراک‌ها و اعتبار', analysis: 'مدیریت تحلیل‌ها',
  market: 'مدیریت بازار', scalping: 'نوسان‌گیری', ai: 'هوش مصنوعی', prompts: 'مدیریت پرامپت‌ها', history: 'تاریخچه تحلیل‌ها',
  notifications: 'اطلاع‌رسانی', monitoring: 'مانیتورینگ سیستم', reports: 'گزارش‌ها', security: 'امنیت و دسترسی', settings: 'تنظیمات سامانه',
  maintenance: 'حالت تعمیرات', updates: 'بروزرسانی و استقرار', backup: 'پشتیبان‌گیری و بازیابی', payments: 'پرداخت‌ها و تراکنش‌ها',
  roles: 'نقش‌ها و مجوزها', audit: 'گزارش Audit Log', sessions: 'مدیریت نشست‌ها', api: 'سرویس‌ها و APIها', infrastructure: 'سلامت زیرساخت'
};

const uid = (req) => Number(req.user?.id || req.user?.userId) || null;
const fail = (res, status, message) => res.status(status).json({ success: false, message });

async function ensureControlTable() {
  await prisma.$executeRawUnsafe(`IF OBJECT_ID(N'dbo.AdminControlRecord', N'U') IS NULL CREATE TABLE dbo.AdminControlRecord (id INT IDENTITY(1,1) PRIMARY KEY,moduleKey NVARCHAR(50) NOT NULL UNIQUE,title NVARCHAR(200) NOT NULL,enabled BIT NOT NULL DEFAULT 1,configJson NVARCHAR(MAX) NULL,version INT NOT NULL DEFAULT 1,updatedBy INT NULL,createdAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),updatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME());`);
}

async function audit(req, action, moduleKey, details, statusCode = 200) {
  try {
    await prisma.$executeRawUnsafe(`IF OBJECT_ID(N'dbo.AdminAuditLog', N'U') IS NULL CREATE TABLE dbo.AdminAuditLog (id BIGINT IDENTITY(1,1) PRIMARY KEY,adminUserId INT NULL,action NVARCHAR(100) NOT NULL,moduleKey NVARCHAR(50) NULL,targetId NVARCHAR(100) NULL,method NVARCHAR(10) NULL,path NVARCHAR(500) NULL,statusCode INT NULL,ipAddress NVARCHAR(100) NULL,userAgent NVARCHAR(500) NULL,detailsJson NVARCHAR(MAX) NULL,createdAt DATETIME2 NOT NULL DEFAULT SYSDATETIME());`);
    await prisma.$executeRawUnsafe(`INSERT INTO dbo.AdminAuditLog(adminUserId,action,moduleKey,method,path,statusCode,ipAddress,userAgent,detailsJson) VALUES(@p1,@p2,@p3,@p4,@p5,@p6,@p7,@p8,@p9)`, uid(req), action, moduleKey, req.method, req.originalUrl, statusCode, req.ip || null, String(req.get('user-agent') || '').slice(0,500), details ? JSON.stringify(details) : null);
  } catch (e) { console.error('[ADMIN-OPS-AUDIT]', e.message); }
}

async function requireAdmin(req, res, next) {
  const id = uid(req);
  if (!id) return fail(res, 401, 'احراز هویت الزامی است.');
  try {
    const user = await prisma.user.findUnique({ where: { id }, include: { Role: true } });
    const role = String(user?.Role?.name || '').toLowerCase();
    if (!user || (!user.Role) || (role !== 'admin' && role !== 'superadmin' && user.roleId !== 1)) return fail(res, 403, 'این عملیات فقط برای ادمین مجاز است.');
    req.adminUser = user;
    next();
  } catch (e) { console.error('[ADMIN-OPS-AUTH]', e.message); return fail(res, 500, 'خطا در بررسی دسترسی ادمین.'); }
}

router.use(auth, requireAdmin);

async function getControl(key) {
  await ensureControlTable();
  const rows = await prisma.$queryRawUnsafe(`SELECT TOP 1 id,moduleKey,title,enabled,configJson,version,updatedBy,createdAt,updatedAt FROM dbo.AdminControlRecord WHERE moduleKey=@p1`, key);
  if (!rows.length) return null;
  const r = rows[0];
  let config = {};
  try { config = r.configJson ? JSON.parse(r.configJson) : {}; } catch { config = {}; }
  return { ...r, config };
}

async function overview(key) {
  const control = await getControl(key);
  const counts = {};
  if (key === 'users') counts.total = await prisma.user.count({ where: { isDeleted: false } });
  if (key === 'subscriptions') counts.active = await prisma.user.count({ where: { isDeleted: false, isActive: true, subscriptionEnd: { gt: new Date() } } });
  if (key === 'analysis' || key === 'history') counts.total = await prisma.analysisHistory.count();
  if (key === 'market') { counts.marketHistory = await prisma.marketHistory.count(); counts.daily = await prisma.marketDaily.count(); counts.summary = await prisma.marketSummary.count(); }
  if (key === 'scalping') { counts.runs = await prisma.scalpingRun.count(); counts.opportunities = await prisma.scalpingOpportunity.count(); }
  if (key === 'notifications') counts.total = await prisma.notification.count();
  if (key === 'sessions' || key === 'security') counts.total = await prisma.session.count();
  if (key === 'roles') counts.roles = await prisma.role.count(); counts.permissions = await prisma.permission.count();
  if (key === 'api') counts.keys = await prisma.apiKey.count({ where: { isRevoked: false } });
  if (key === 'audit') { const r = await prisma.$queryRawUnsafe(`SELECT COUNT_BIG(*) AS total FROM dbo.AdminAuditLog`); counts.total = Number(r[0]?.total || 0); }
  return { moduleKey: key, title: MODULES[key], enabled: control?.enabled ?? true, version: control?.version ?? 1, config: control?.config ?? {}, counts };
}

for (const key of Object.keys(MODULES)) {
  router.get(`/${key}`, async (req, res) => {
    try { return res.json({ success: true, data: await overview(key) }); }
    catch (e) { console.error(`[ADMIN-OPS] GET /${key}`, e.message); await audit(req, 'READ_MODULE', key, { error: e.message }, 500); return fail(res, 500, `خطا در دریافت ${MODULES[key]}.`); }
  });

  router.put(`/${key}/config`, async (req, res) => {
    const body = req.body || {};
    if (body.enabled !== undefined && typeof body.enabled !== 'boolean') return fail(res, 400, 'فیلد فعال باید boolean باشد.');
    if (body.config !== undefined && (!body.config || typeof body.config !== 'object' || Array.isArray(body.config))) return fail(res, 400, 'تنظیمات باید یک شیء JSON معتبر باشد.');
    try {
      const current = await getControl(key);
      if (!current) return fail(res, 404, 'ماژول یافت نشد.');
      const enabled = body.enabled === undefined ? current.enabled : body.enabled;
      const config = body.config === undefined ? current.config : body.config;
      await prisma.$executeRawUnsafe(`UPDATE dbo.AdminControlRecord SET enabled=@p1,configJson=@p2,version=version+1,updatedBy=@p3,updatedAt=SYSDATETIME() WHERE moduleKey=@p4`, enabled, JSON.stringify(config), uid(req), key);
      await audit(req, 'UPDATE_MODULE_CONFIG', key, { enabled, config });
      return res.json({ success: true, message: 'تنظیمات با موفقیت ذخیره شد.', data: await overview(key) });
    } catch (e) { console.error(`[ADMIN-OPS] PUT /${key}/config`, e.message); await audit(req, 'UPDATE_MODULE_CONFIG', key, { error: e.message }, 500); return fail(res, 500, 'ذخیره تنظیمات ناموفق بود.'); }
  });
}

router.get('/_catalog/list', async (req, res) => res.json({ success: true, data: Object.entries(MODULES).map(([key, title]) => ({ key, title, endpoint: `/api/v1/admin-ops/${key}` })) }));

module.exports = router;
