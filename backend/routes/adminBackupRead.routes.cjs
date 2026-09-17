'use strict';

const express = require('express');
const { prisma } = require('../config/prisma.cjs');
const authMiddleware = require('../middlewares/auth.middleware.cjs');
const { hasPermission } = require('../services/rbac.service.cjs');
const backupService = require('../services/backup.service.cjs');
const { syncFilesystemBackups } = require('../services/backup-admin-sync.service.cjs');

const router = express.Router();

function userId(req) {
  return Number(req.user?.id ?? req.user?.userId ?? 0) || null;
}

function isAdmin(req) {
  const u = req.user || {};
  if (u.isAdmin === true || ['admin', 'superadmin'].includes(String(u.role || '').toLowerCase())) return true;
  return (Array.isArray(u.roles) ? u.roles : []).some((r) =>
    ['admin', 'superadmin'].includes(String(typeof r === 'string' ? r : r?.name).toLowerCase())
  );
}

function fail(res, status, message) {
  return res.status(status).json({ success: false, message });
}

router.use(authMiddleware, async (req, res, next) => {
  if (!isAdmin(req)) return fail(res, 403, 'این عملیات فقط برای ادمین مجاز است.');
  const uid = userId(req);
  if (!uid || !(await hasPermission(uid, 'admin.backup.manage'))) {
    return fail(res, 403, 'سطح دسترسی لازم برای این عملیات را ندارید.');
  }
  return next();
});

router.post('/backup/get-status', async (req, res, next) => {
  try {
    const rows = await syncFilesystemBackups(prisma, userId(req));
    const summary = {
      total: rows.length,
      database: rows.filter((r) => r.type === 'database').length,
      application: rows.filter((r) => r.type === 'application').length,
      latest: rows[0] || null,
      backupDirectory: backupService.getBackupRoot()
    };
    return res.json({ success: true, data: { rows, summary } });
  } catch (error) {
    return next(error);
  }
});

router.post('/backup/list-restorable', async (req, res, next) => {
  try {
    const rows = await syncFilesystemBackups(prisma, userId(req));
    const restorable = rows.filter((row) => row.restorable !== false && Number(row.sizeBytes || 0) > 0);
    return res.json({ success: true, data: restorable });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
