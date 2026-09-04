const express = require('express');
const { prisma } = require('../config/prisma.cjs');
const authMiddleware = require('../middlewares/auth.middleware.cjs');

const router = express.Router();

const MODULES = [
  ['dashboard','داشبورد مدیریتی'],['users','مدیریت کاربران'],['subscriptions','اشتراک‌ها و اعتبار'],['analysis','مدیریت تحلیل‌ها'],['market','مدیریت بازار'],['scalping','نوسان‌گیری'],['ai','هوش مصنوعی'],['prompts','مدیریت پرامپت‌ها'],['history','تاریخچه تحلیل‌ها'],['notifications','اطلاع‌رسانی'],['monitoring','مانیتورینگ سیستم'],['reports','گزارش‌ها'],['security','امنیت و دسترسی'],['settings','تنظیمات سامانه'],['maintenance','حالت تعمیرات'],['updates','بروزرسانی و استقرار'],['backup','پشتیبان‌گیری و بازیابی'],['payments','پرداخت‌ها و تراکنش‌ها'],['roles','نقش‌ها و مجوزها'],['audit','گزارش Audit Log'],['sessions','مدیریت نشست‌ها'],['api','سرویس‌ها و APIها'],['infrastructure','سلامت زیرساخت']
].map(([key,title]) => ({ key, title }));

let tablesReady = false;

async function ensureTables() {
  if (tablesReady) return;
  await prisma.$executeRawUnsafe(`
    IF OBJECT_ID(N'dbo.AdminControlRecord', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.AdminControlRecord (
        id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        moduleKey NVARCHAR(80) NOT NULL UNIQUE,
        enabled BIT NOT NULL CONSTRAINT DF_AdminControlRecord_enabled DEFAULT 1,
        version INT NOT NULL CONSTRAINT DF_AdminControlRecord_version DEFAULT 1,
        config NVARCHAR(MAX) NOT NULL CONSTRAINT DF_AdminControlRecord_config DEFAULT N'{}',
        createdAt DATETIME2 NOT NULL CONSTRAINT DF_AdminControlRecord_createdAt DEFAULT SYSUTCDATETIME(),
        updatedAt DATETIME2 NOT NULL CONSTRAINT DF_AdminControlRecord_updatedAt DEFAULT SYSUTCDATETIME()
      );
    END
  `);
  await prisma.$executeRawUnsafe(`
    IF OBJECT_ID(N'dbo.AdminAuditLog', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.AdminAuditLog (
        id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        adminUserId INT NULL,
        action NVARCHAR(120) NOT NULL,
        moduleKey NVARCHAR(80) NULL,
        method NVARCHAR(12) NULL,
        path NVARCHAR(500) NULL,
        statusCode INT NULL,
        ip NVARCHAR(80) NULL,
        userAgent NVARCHAR(500) NULL,
        details NVARCHAR(MAX) NULL,
        createdAt DATETIME2 NOT NULL CONSTRAINT DF_AdminAuditLog_createdAt DEFAULT SYSUTCDATETIME()
      );
    END
  `);
  tablesReady = true;
}

function getUserId(req) {
  return Number(req.user?.id ?? req.user?.userId ?? 0) || null;
}

function isAdmin(req) {
  const u = req.user || {};
  if (u.isAdmin === true || u.role === 'admin' || u.role === 'ADMIN') return true;
  const roles = Array.isArray(u.roles) ? u.roles : [];
  return roles.some((r) => String(typeof r === 'string' ? r : r?.name).toLowerCase() === 'admin');
}

function requireAdmin(req, res, next) {
  if (!isAdmin(req)) return res.status(403).json({ success: false, message: 'دسترسی فقط برای مدیر سامانه مجاز است.' });
  next();
}

async function audit(req, action, moduleKey, statusCode, details = null) {
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO dbo.AdminAuditLog (adminUserId, action, moduleKey, method, path, statusCode, ip, userAgent, details) VALUES (@p0,@p1,@p2,@p3,@p4,@p5,@p6,@p7,@p8)`,
      getUserId(req), action, moduleKey, req.method, req.originalUrl, statusCode,
      req.ip || null, String(req.get('user-agent') || '').slice(0, 500), details ? JSON.stringify(details) : null
    );
  } catch (e) {
    console.error('[admin-ops] audit failed:', e.message);
  }
}

function validConfig(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function getControl(moduleKey) {
  await ensureTables();
  const rows = await prisma.$queryRawUnsafe(`SELECT TOP 1 id,moduleKey,enabled,version,config,createdAt,updatedAt FROM dbo.AdminControlRecord WHERE moduleKey=@p0`, moduleKey);
  if (rows[0]) {
    let config = {};
    try { config = JSON.parse(rows[0].config || '{}'); } catch (_) {}
    return { ...rows[0], enabled: Boolean(rows[0].enabled), config };
  }
  await prisma.$executeRawUnsafe(`INSERT INTO dbo.AdminControlRecord (moduleKey) VALUES (@p0)`, moduleKey);
  return { id: null, moduleKey, enabled: true, version: 1, config: {}, createdAt: null, updatedAt: null };
}

async function countModel(model, where) {
  try { return await prisma[model].count(where ? { where } : undefined); } catch (_) { return 0; }
}

async function countsFor(moduleKey) {
  const counts = {};
  if (moduleKey === 'users' || moduleKey === 'subscriptions' || moduleKey === 'dashboard') {
    counts.users = await countModel('user');
  }
  if (moduleKey === 'subscriptions' || moduleKey === 'dashboard') {
    try {
      counts.activeSubscriptions = await prisma.user.count({ where: { isActive: true, subscriptionEnd: { gte: new Date() } } });
    } catch (_) { counts.activeSubscriptions = 0; }
  }
  if (moduleKey === 'analysis' || moduleKey === 'history' || moduleKey === 'dashboard') counts.analyses = await countModel('analysisHistory');
  if (moduleKey === 'market') {
    counts.marketHistory = await countModel('marketHistory');
    counts.marketDaily = await countModel('marketDaily');
    counts.marketSummary = await countModel('marketSummary');
  }
  if (moduleKey === 'scalping') {
    counts.scalpingRuns = await countModel('scalpingRun');
    counts.opportunities = await countModel('scalpingOpportunity');
  }
  if (moduleKey === 'notifications') counts.notifications = await countModel('notification');
  if (moduleKey === 'sessions' || moduleKey === 'security') counts.sessions = await countModel('session');
  if (moduleKey === 'roles') {
    counts.roles = await countModel('role');
    counts.permissions = await countModel('permission');
  }
  if (moduleKey === 'api') counts.apiKeys = await countModel('apiKey');
  if (moduleKey === 'audit') {
    await ensureTables();
    const rows = await prisma.$queryRawUnsafe(`SELECT COUNT_BIG(*) AS total FROM dbo.AdminAuditLog`);
    counts.total = Number(rows[0]?.total || 0);
  }
  return counts;
}

async function overview(req, res) {
  const moduleKey = req.params.key;
  const item = MODULES.find((m) => m.key === moduleKey);
  if (!item) return res.status(404).json({ success: false, message: 'ماژول مدیریتی پیدا نشد.' });
  try {
    const control = await getControl(moduleKey);
    const counts = await countsFor(moduleKey);
    return res.json({ success: true, data: { moduleKey, title: item.title, enabled: control.enabled, version: control.version, config: control.config, counts } });
  } catch (error) {
    await audit(req, 'VIEW_MODULE_ERROR', moduleKey, 500, { error: error.message });
    return res.status(500).json({ success: false, message: 'دریافت اطلاعات ماژول ناموفق بود.' });
  }
}

async function saveConfig(req, res) {
  const moduleKey = req.params.key;
  const item = MODULES.find((m) => m.key === moduleKey);
  if (!item) return res.status(404).json({ success: false, message: 'ماژول مدیریتی پیدا نشد.' });
  const { enabled, config } = req.body || {};
  if (typeof enabled !== 'boolean') return res.status(400).json({ success: false, message: 'مقدار فعال/غیرفعال نامعتبر است.' });
  if (!validConfig(config)) return res.status(400).json({ success: false, message: 'تنظیمات باید یک شیء JSON معتبر باشد.' });
  try {
    const current = await getControl(moduleKey);
    const version = Number(current.version || 0) + 1;
    await prisma.$executeRawUnsafe(`UPDATE dbo.AdminControlRecord SET enabled=@p0,version=@p1,config=@p2,updatedAt=SYSUTCDATETIME() WHERE moduleKey=@p3`, enabled ? 1 : 0, version, JSON.stringify(config), moduleKey);
    await audit(req, 'UPDATE_MODULE_CONFIG', moduleKey, 200, { enabled, version });
    return overview(req, res);
  } catch (error) {
    await audit(req, 'UPDATE_MODULE_CONFIG_ERROR', moduleKey, 500, { error: error.message });
    return res.status(500).json({ success: false, message: 'ذخیره تنظیمات ماژول ناموفق بود.' });
  }
}

router.use(authMiddleware);
router.use(requireAdmin);
router.get('/_catalog/list', async (_req, res) => res.json({ success: true, data: MODULES }));
router.get('/:key', overview);
router.put('/:key/config', saveConfig);

module.exports = router;
