'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { prisma } = require('../config/prisma.cjs');
const authMiddleware = require('../middlewares/auth.middleware.cjs');
const { hasPermission } = require('../services/rbac.service.cjs');
const backupService = require('../services/backup.service.cjs');
const { ensureBackupJobTable } = require('../services/backup-admin-sync.service.cjs');

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

function currentDbName() {
  try {
    return new URL(process.env.DATABASE_URL).pathname.replace(/^\//, '').split('?')[0] || null;
  } catch (_) {
    return null;
  }
}

function safeDatabaseIdentifier(value) {
  return String(value || '').replace(/]/g, ']]');
}

router.use(authMiddleware, async (req, res, next) => {
  try {
    if (!isAdmin(req)) return fail(res, 403, 'این عملیات فقط برای ادمین مجاز است.');
    const uid = userId(req);
    if (!uid || !(await hasPermission(uid, 'admin.backup.manage'))) {
      return fail(res, 403, 'سطح دسترسی لازم برای این عملیات را ندارید.');
    }
    return next();
  } catch (error) {
    return next(error);
  }
});

router.post('/backup/validate-backup', async (req, res, next) => {
  try {
    await ensureBackupJobTable(prisma);
    const id = Number(req.body?.jobId);
    if (!id) return fail(res, 400, 'شناسه Backup الزامی است.');
    const rows = await prisma.$queryRawUnsafe(
      `SELECT TOP 1 id,filePath,type,status,sizeBytes FROM dbo.AdminBackupJob WHERE id=@p1`,
      id
    );
    if (!rows.length) return fail(res, 404, 'Backup پیدا نشد.');
    const row = rows[0];
    if (row.status !== 'completed') return fail(res, 400, 'Backup انتخاب‌شده تکمیل نشده است.');

    const resolved = backupService.safeBackupPath(row.filePath);
    if (!resolved || !fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      return res.json({ success: true, data: { jobId: id, type: row.type, exists: false, sizeBytes: 0, nonEmpty: false, verifyOnly: false, valid: false, restorable: false, errorMessage: 'فایل Backup یافت نشد یا مسیر آن مجاز نیست.' } });
    }

    const stat = fs.statSync(resolved);
    if (stat.size <= 0) {
      return res.json({ success: true, data: { jobId: id, type: row.type, exists: true, sizeBytes: 0, nonEmpty: false, verifyOnly: false, valid: false, restorable: false, errorMessage: 'فایل Backup خالی است.' } });
    }

    if (String(row.type).toLowerCase() === 'application' || path.extname(resolved).toLowerCase() === '.zip') {
      const result = backupService.validateApplicationBackup(resolved);
      return res.json({
        success: true,
        data: {
          jobId: id,
          type: 'application',
          fileName: path.basename(resolved),
          exists: true,
          sizeBytes: stat.size,
          nonEmpty: true,
          verifyOnly: null,
          valid: result.valid,
          restorable: result.restorable,
          errorMessage: result.valid ? null : result.message,
          validationMessage: result.message
        }
      });
    }

    try {
      await prisma.$executeRawUnsafe(`RESTORE VERIFYONLY FROM DISK=@p1 WITH CHECKSUM`, resolved);
      return res.json({ success: true, data: { jobId: id, type: 'database', fileName: path.basename(resolved), exists: true, sizeBytes: stat.size, nonEmpty: true, verifyOnly: true, valid: true, restorable: true, errorMessage: null, validationMessage: 'Database Backup با RESTORE VERIFYONLY و CHECKSUM معتبر است.' } });
    } catch (error) {
      return res.json({ success: true, data: { jobId: id, type: 'database', fileName: path.basename(resolved), exists: true, sizeBytes: stat.size, nonEmpty: true, verifyOnly: false, valid: false, restorable: false, errorMessage: String(error.message || error).slice(0, 1000), validationMessage: 'RESTORE VERIFYONLY ناموفق بود.' } });
    }
  } catch (error) {
    return next(error);
  }
});

router.post('/backup/prepare-restore', async (req, res, next) => {
  try {
    await ensureBackupJobTable(prisma);
    const id = Number(req.body?.jobId);
    if (!id) return fail(res, 400, 'شناسه Backup الزامی است.');
    const rows = await prisma.$queryRawUnsafe(`SELECT TOP 1 id,filePath,type,status FROM dbo.AdminBackupJob WHERE id=@p1`, id);
    if (!rows.length || rows[0].status !== 'completed') return fail(res, 400, 'Backup انتخاب‌شده قابل آماده‌سازی برای بازیابی نیست.');
    if (String(rows[0].type).toLowerCase() === 'application' || path.extname(String(rows[0].filePath || '')).toLowerCase() === '.zip') {
      return fail(res, 400, 'بازیابی Application ZIP هنوز فعال نشده است؛ ابتدا اعتبارسنجی ZIP انجام دهید.');
    }
    const resolved = backupService.safeBackupPath(rows[0].filePath);
    if (!resolved || !fs.existsSync(resolved) || fs.statSync(resolved).size <= 0) return fail(res, 400, 'فایل Backup معتبر نیست.');
    await prisma.$executeRawUnsafe(`RESTORE VERIFYONLY FROM DISK=@p1 WITH CHECKSUM`, resolved);
    const token = crypto.randomBytes(18).toString('hex');
    await prisma.$executeRawUnsafe(
      `MERGE dbo.GlobalSetting AS target USING (SELECT @p1 AS [key],@p2 AS [value],N'backup' AS [category]) AS source ON target.[key]=source.[key]
       WHEN MATCHED THEN UPDATE SET [value]=source.[value],updatedAt=SYSDATETIME(),version=target.version+1
       WHEN NOT MATCHED THEN INSERT ([category],[key],[value],[version],[isPublic],[updatedAt]) VALUES(source.[category],source.[key],source.[value],1,0,SYSDATETIME());`,
      `backup.restore.challenge.${id}`,
      JSON.stringify({ token, expiresAt: Date.now() + 10 * 60 * 1000 })
    );
    return res.json({ success: true, data: { jobId: id, confirmationToken: token, expiresInSeconds: 600, warning: 'این مرحله فقط مجوز موقت ایجاد می‌کند و هنوز Restore انجام نشده است.' } });
  } catch (error) {
    return next(error);
  }
});

router.post('/backup/restore-backup', async (req, res, next) => {
  try {
    await ensureBackupJobTable(prisma);
    const id = Number(req.body?.jobId);
    const token = String(req.body?.confirmationToken || '');
    const target = String(req.body?.targetDatabase || '').trim();
    if (!id || !token || !target) return fail(res, 400, 'Backup، توکن تأیید و دیتابیس مقصد الزامی است.');
    const productionDb = currentDbName();
    if (process.env.ADMIN_RESTORE_ENABLED !== 'true') return fail(res, 403, 'Restore از پنل غیرفعال است؛ ابتدا ADMIN_RESTORE_ENABLED=true را صریحاً فعال کنید.');
    if (process.env.ADMIN_ALLOW_PRODUCTION_RESTORE !== 'true' && target === productionDb) return fail(res, 403, 'Restore مستقیم روی دیتابیس Production مسدود است.');
    if (process.env.ADMIN_RESTORE_TARGET && target !== process.env.ADMIN_RESTORE_TARGET) return fail(res, 403, 'دیتابیس مقصد با مقصد مجاز Restore یکسان نیست.');

    const challengeRows = await prisma.$queryRawUnsafe(`SELECT TOP 1 [value] FROM dbo.GlobalSetting WHERE [key]=@p1`, `backup.restore.challenge.${id}`);
    let challenge = null;
    try { challenge = challengeRows.length ? JSON.parse(challengeRows[0].value) : null; } catch (_) {}
    if (!challenge || challenge.token !== token || Number(challenge.expiresAt || 0) < Date.now()) return fail(res, 403, 'توکن تأیید Restore نامعتبر یا منقضی شده است.');

    const rows = await prisma.$queryRawUnsafe(`SELECT TOP 1 id,filePath,type,status FROM dbo.AdminBackupJob WHERE id=@p1`, id);
    if (!rows.length || rows[0].status !== 'completed') return fail(res, 400, 'Backup قابل بازیابی نیست.');
    if (String(rows[0].type).toLowerCase() === 'application' || path.extname(String(rows[0].filePath || '')).toLowerCase() === '.zip') return fail(res, 400, 'بازیابی Application ZIP هنوز فعال نشده است.');
    const resolved = backupService.safeBackupPath(rows[0].filePath);
    if (!resolved || !fs.existsSync(resolved) || fs.statSync(resolved).size <= 0) return fail(res, 400, 'فایل Backup معتبر نیست.');
    await prisma.$executeRawUnsafe(`RESTORE VERIFYONLY FROM DISK=@p1 WITH CHECKSUM`, resolved);
    await prisma.$executeRawUnsafe(`RESTORE DATABASE [${safeDatabaseIdentifier(target)}] FROM DISK=@p1 WITH REPLACE, RECOVERY`, resolved);
    await prisma.$executeRawUnsafe(`UPDATE dbo.GlobalSetting SET [value]=@p1,updatedAt=SYSDATETIME(),version=version+1 WHERE [key]=@p2`, JSON.stringify({ usedAt: Date.now() }), `backup.restore.challenge.${id}`);
    return res.json({ success: true, data: { restored: true, jobId: id, targetDatabase: target } });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
