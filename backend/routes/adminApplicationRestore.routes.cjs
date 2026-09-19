'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { prisma } = require('../config/prisma.cjs');
const authMiddleware = require('../middlewares/auth.middleware.cjs');
const { hasPermission } = require('../services/rbac.service.cjs');
const backupService = require('../services/backup.service.cjs');
const applicationRestoreService = require('../services/application-restore.service.cjs');
const { ensureBackupJobTable } = require('../services/backup-admin-sync.service.cjs');

const router = express.Router();

function userId(req) {
  return Number(req.user?.id ?? req.user?.userId ?? 0) || null;
}
function isAdmin(req) {
  const u = req.user || {};
  if (u.isAdmin === true || ['admin', 'superadmin'].includes(String(u.role || '').toLowerCase())) return true;
  return (Array.isArray(u.roles) ? u.roles : []).some((r) => ['admin', 'superadmin'].includes(String(typeof r === 'string' ? r : r?.name).toLowerCase()));
}
function fail(res, status, message) {
  return res.status(status).json({ success: false, message });
}

router.use(authMiddleware, async (req, res, next) => {
  try {
    if (!isAdmin(req)) return fail(res, 403, 'این عملیات فقط برای ادمین مجاز است.');
    const uid = userId(req);
    if (!uid || !(await hasPermission(uid, 'admin.backup.manage'))) return fail(res, 403, 'سطح دسترسی لازم برای این عملیات را ندارید.');
    next();
  } catch (error) {
    next(error);
  }
});

router.post('/backup/prepare-application-restore', async (req, res, next) => {
  try {
    await ensureBackupJobTable(prisma);
    applicationRestoreService.cleanupStaging();

    const id = Number(req.body?.jobId);
    if (!id) return fail(res, 400, 'شناسه Application Backup الزامی است.');

    const rows = await prisma.$queryRawUnsafe(
      `SELECT TOP 1 id,filePath,type,status,sizeBytes FROM dbo.AdminBackupJob WHERE id=@p1`,
      id
    );
    if (!rows.length || rows[0].status !== 'completed') return fail(res, 400, 'Application Backup انتخاب‌شده تکمیل نشده است.');
    if (String(rows[0].type).toLowerCase() !== 'application' && path.extname(String(rows[0].filePath || '')).toLowerCase() !== '.zip') {
      return fail(res, 400, 'این Backup از نوع Application نیست.');
    }

    const resolved = backupService.safeBackupPath(rows[0].filePath);
    if (!resolved || !fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) return fail(res, 400, 'فایل Application Backup معتبر نیست.');

    const prepared = await applicationRestoreService.prepare(resolved, id);
    const token = crypto.randomBytes(18).toString('hex');
    const challenge = {
      token,
      jobId: id,
      zipFileName: prepared.zipFileName,
      zipSha256: prepared.zipSha256,
      stagingId: prepared.stagingId,
      expiresAt: Date.now() + 10 * 60 * 1000
    };

    await prisma.$executeRawUnsafe(
      `MERGE dbo.GlobalSetting AS target USING (SELECT @p1 AS [key],@p2 AS [value],N'backup' AS [category]) AS source ON target.[key]=source.[key]
       WHEN MATCHED THEN UPDATE SET [value]=source.[value],updatedAt=SYSDATETIME(),version=target.version+1
       WHEN NOT MATCHED THEN INSERT ([category],[key],[value],[version],[isPublic],[updatedAt]) VALUES(source.[category],source.[key],source.[value],1,0,SYSDATETIME());`,
      `backup.application.restore.challenge.${id}`,
      JSON.stringify(challenge)
    );

    return res.json({
      success: true,
      data: {
        jobId: id,
        confirmationToken: token,
        expiresInSeconds: 600,
        stagingId: prepared.stagingId,
        fileName: prepared.zipFileName,
        zipSha256: prepared.zipSha256,
        fileCount: prepared.fileCount,
        totalUncompressedBytes: prepared.totalUncompressedBytes,
        warning: 'این مرحله فقط Backup را در محیط موقت بررسی و آماده می‌کند؛ هیچ فایل Production جایگزین نشده است.'
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
