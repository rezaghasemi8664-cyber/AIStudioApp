'use strict';

const express = require('express');
const { prisma } = require('../config/prisma.cjs');
const authMiddleware = require('../middlewares/auth.middleware.cjs');

const router = express.Router();
let tableReady = false;

async function requireAdmin(req, res, next) {
  const uid = Number(req.user && (req.user.id || req.user.userId));
  if (!uid) return res.status(401).json({ success: false, message: 'احراز هویت الزامی است.' });
  try {
    const user = await prisma.user.findUnique({ where: { id: uid }, include: { Role: true } });
    const role = String(user && user.Role && user.Role.name || req.user.role || '').toLowerCase();
    if (!user || user.isDeleted || (role !== 'admin' && role !== 'superadmin' && user.roleId !== 1 && req.user.isAdmin !== true)) {
      return res.status(403).json({ success: false, message: 'دسترسی مدیر سیستم لازم است.' });
    }
    return next();
  } catch (error) {
    console.error('[AdminPrompts] admin access check failed:', error.message);
    return res.status(500).json({ success: false, message: 'بررسی دسترسی مدیر ناموفق بود.' });
  }
}

async function ensureTable() {
  if (tableReady) return;
  await prisma.$executeRawUnsafe(`
    IF OBJECT_ID(N'dbo.AdminPromptVersion', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.AdminPromptVersion (
        id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        name NVARCHAR(200) NOT NULL,
        version INT NOT NULL,
        value NVARCHAR(MAX) NOT NULL,
        active BIT NOT NULL CONSTRAINT DF_AdminPromptVersion_active DEFAULT 0,
        updatedAt DATETIME2 NOT NULL CONSTRAINT DF_AdminPromptVersion_updatedAt DEFAULT SYSDATETIME(),
        updatedBy INT NULL,
        CONSTRAINT UQ_AdminPromptVersion_name_version UNIQUE(name, version)
      );
      CREATE INDEX IX_AdminPromptVersion_name_active ON dbo.AdminPromptVersion(name, active);
    END;
  `);
  tableReady = true;
}

function fail(res, status, message) {
  return res.status(status).json({ success: false, message });
}

router.use(authMiddleware.authenticate || authMiddleware, requireAdmin);

router.get('/prompts', async (_req, res) => {
  try {
    await ensureTable();
    const rows = await prisma.$queryRawUnsafe(`
      SELECT name, version, active, value, updatedAt
      FROM dbo.AdminPromptVersion
      ORDER BY name ASC, version DESC
    `);
    return res.json({ success: true, data: rows.map(row => ({
      name: row.name,
      version: Number(row.version),
      active: Boolean(row.active),
      value: row.value,
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null
    })) });
  } catch (error) {
    console.error('[AdminPrompts] list failed:', error.message);
    return fail(res, 500, 'دریافت فهرست پرامپت‌ها ناموفق بود.');
  }
});

router.post('/prompts/save-version', async (req, res) => {
  try {
    await ensureTable();
    const name = String(req.body && req.body.name || '').trim();
    const value = req.body && req.body.value;
    if (!name || name.length > 200) return fail(res, 400, 'نام پرامپت الزامی است و نباید بیش از ۲۰۰ نویسه باشد.');
    if (typeof value !== 'string' || !value.trim()) return fail(res, 400, 'متن پرامپت الزامی است.');
    const nextRows = await prisma.$queryRawUnsafe(
      'SELECT ISNULL(MAX(version), 0) + 1 AS nextVersion FROM dbo.AdminPromptVersion WHERE name = @p1',
      name
    );
    const version = Number(nextRows[0] && nextRows[0].nextVersion || 1);
    await prisma.$executeRawUnsafe(
      'INSERT INTO dbo.AdminPromptVersion(name, version, value, active, updatedAt, updatedBy) VALUES(@p1, @p2, @p3, 0, SYSDATETIME(), @p4)',
      name, version, value, Number(req.user && (req.user.id || req.user.userId)) || null
    );
    return res.status(201).json({ success: true, data: { saved: true, name, version } });
  } catch (error) {
    console.error('[AdminPrompts] save version failed:', error.message);
    return fail(res, 500, 'ذخیره نسخه جدید پرامپت ناموفق بود.');
  }
});

router.post('/prompts/activate', async (req, res) => {
  try {
    await ensureTable();
    const name = String(req.body && req.body.name || '').trim();
    const version = Number(req.body && req.body.version);
    if (!name || !Number.isInteger(version) || version < 1) return fail(res, 400, 'نام و شماره نسخه معتبر الزامی است.');
    const matches = await prisma.$queryRawUnsafe(
      'SELECT id FROM dbo.AdminPromptVersion WHERE name = @p1 AND version = @p2',
      name, version
    );
    if (!matches.length) return fail(res, 404, 'نسخه موردنظر پرامپت پیدا نشد.');
    await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe('UPDATE dbo.AdminPromptVersion SET active = 0 WHERE name = @p1', name);
      await tx.$executeRawUnsafe('UPDATE dbo.AdminPromptVersion SET active = 1, updatedAt = SYSDATETIME(), updatedBy = @p3 WHERE name = @p1 AND version = @p2', name, version, Number(req.user && (req.user.id || req.user.userId)) || null);
    });
    return res.json({ success: true, data: { saved: true, name, version, active: true } });
  } catch (error) {
    console.error('[AdminPrompts] activate version failed:', error.message);
    return fail(res, 500, 'فعال‌سازی نسخه پرامپت ناموفق بود.');
  }
});

module.exports = router;
