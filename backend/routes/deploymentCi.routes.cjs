'use strict';

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { prisma } = require('../config/prisma.cjs');

const router = express.Router();

function timingSafeEqualText(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
function requireCiSecret(req, res, next) {
  const configured = process.env.DEPLOYMENT_WEBHOOK_SECRET;
  if (!configured) return res.status(503).json({ success: false, message: 'DEPLOYMENT_WEBHOOK_SECRET تنظیم نشده است.' });
  const supplied = req.get('x-deployment-secret') || String(req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!timingSafeEqualText(supplied, configured)) return res.status(401).json({ success: false, message: 'اعتبار CI/CD نامعتبر است.' });
  next();
}
function currentDbName() { try { return new URL(process.env.DATABASE_URL).pathname.replace(/^\//, '').split('?')[0] || null; } catch (_) { return null; } }
function safeBackupPath(value) {
  const dir = process.env.ADMIN_BACKUP_DIR; if (!dir || !value) return null;
  const root = path.resolve(dir), candidate = path.resolve(value);
  return candidate === root || candidate.startsWith(root + path.sep) ? candidate : null;
}
async function ensureTable() {
  await prisma.$executeRawUnsafe(`IF OBJECT_ID(N'dbo.AdminBackupJob',N'U') IS NULL BEGIN CREATE TABLE dbo.AdminBackupJob(id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,type NVARCHAR(30) NOT NULL DEFAULT N'database',filePath NVARCHAR(500) NULL,status NVARCHAR(30) NOT NULL,startedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),finishedAt DATETIME2 NULL,sizeBytes BIGINT NULL,errorMessage NVARCHAR(1000) NULL,createdBy INT NULL); CREATE INDEX IX_AdminBackupJob_startedAt ON dbo.AdminBackupJob(startedAt); END; IF OBJECT_ID(N'dbo.AdminDeploymentLog',N'U') IS NULL BEGIN CREATE TABLE dbo.AdminDeploymentLog(id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,version NVARCHAR(100) NULL,channel NVARCHAR(30) NOT NULL,commitSha NVARCHAR(100) NULL,status NVARCHAR(30) NOT NULL,detailsJson NVARCHAR(MAX) NULL,createdAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),createdBy INT NULL); CREATE INDEX IX_AdminDeploymentLog_createdAt ON dbo.AdminDeploymentLog(createdAt); END;`);
}
async function createBackup() {
  const dir = process.env.ADMIN_BACKUP_DIR; if (!dir) throw new Error('ADMIN_BACKUP_DIR تنظیم نشده است.');
  const dbName = currentDbName(); if (!dbName) throw new Error('نام دیتابیس از DATABASE_URL قابل تشخیص نیست.');
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `roniya-ci-${new Date().toISOString().replace(/[:.]/g, '-')}.bak`);
  const job = await prisma.$queryRawUnsafe(`INSERT INTO dbo.AdminBackupJob(type,filePath,status,createdBy) OUTPUT INSERTED.id VALUES(N'database',@p1,N'running',NULL)`, filePath);
  const id = Number(job[0].id);
  try {
    await prisma.$executeRawUnsafe(`BACKUP DATABASE [${dbName.replace(/]/g, ']]')}] TO DISK=@p1 WITH INIT, CHECKSUM`, filePath);
    const stat = fs.statSync(filePath); if (!stat.size) throw new Error('فایل Backup خالی است.');
    await prisma.$executeRawUnsafe(`UPDATE dbo.AdminBackupJob SET status=N'completed',finishedAt=SYSDATETIME(),sizeBytes=@p1 WHERE id=@p2`, stat.size, id);
    return { id, filePath, sizeBytes: stat.size, dbName };
  } catch (error) {
    await prisma.$executeRawUnsafe(`UPDATE dbo.AdminBackupJob SET status=N'failed',finishedAt=SYSDATETIME(),errorMessage=@p1 WHERE id=@p2`, String(error.message || error).slice(0, 1000), id);
    throw error;
  }
}
async function validateBackup(id) {
  const rows = await prisma.$queryRawUnsafe(`SELECT TOP 1 id,filePath,status,sizeBytes FROM dbo.AdminBackupJob WHERE id=@p1`, id), row = rows[0];
  if (!row || row.status !== 'completed') return { valid: false, reason: 'Backup کامل‌شده پیدا نشد.' };
  const filePath = safeBackupPath(row.filePath); if (!filePath) return { valid: false, reason: 'مسیر Backup خارج از محدوده مجاز است.' };
  try { if (!fs.existsSync(filePath) || fs.statSync(filePath).size <= 0) return { valid: false, reason: 'فایل Backup وجود ندارد یا خالی است.' }; await prisma.$executeRawUnsafe(`RESTORE VERIFYONLY FROM DISK=@p1 WITH CHECKSUM`, filePath); return { valid: true, filePath, sizeBytes: fs.statSync(filePath).size }; }
  catch (error) { return { valid: false, reason: String(error.message || error).slice(0, 500) }; }
}
async function saveGate(gate) {
  await prisma.$executeRawUnsafe(`MERGE dbo.GlobalSetting AS target USING (SELECT @p1 AS [key],@p2 AS [value],N'updates' AS [category]) AS source ON target.[key]=source.[key] WHEN MATCHED THEN UPDATE SET [value]=source.[value],version=target.version+1,updatedAt=SYSDATETIME() WHEN NOT MATCHED THEN INSERT ([category],[key],[value],[version],[isPublic],[updatedAt]) VALUES(source.[category],source.[key],source.[value],1,0,SYSDATETIME());`, 'deployment.ci.gate', JSON.stringify(gate));
}
async function readGate() { try { const rows = await prisma.$queryRawUnsafe(`SELECT TOP 1 [value] FROM dbo.GlobalSetting WHERE [key]=N'deployment.ci.gate'`); return rows[0]?.value ? JSON.parse(rows[0].value) : null; } catch (_) { return null; } }

router.use(requireCiSecret);
router.get('/health', (_req, res) => res.json({ success: true, service: 'deployment-ci', configured: Boolean(process.env.DEPLOYMENT_WEBHOOK_SECRET) }));

router.post('/preflight', async (req, res) => {
  const body = req.body || {}, commitSha = String(body.commitSha || '').trim(), channel = String(body.channel || 'stable').toLowerCase(), version = String(body.version || '').trim(), workflowRunId = String(body.workflowRunId || '').trim();
  if (!/^[0-9a-f]{40}$/i.test(commitSha)) return res.status(400).json({ success: false, message: 'Commit SHA نامعتبر است.' });
  if (!['stable', 'beta'].includes(channel)) return res.status(400).json({ success: false, message: 'کانال انتشار نامعتبر است.' });
  if (channel === 'stable' && process.env.ADMIN_REQUIRE_BACKUP_FOR_PRODUCTION_DEPLOY !== 'false') {
    await ensureTable();
    try {
      const backup = await createBackup(), validation = await validateBackup(backup.id);
      if (!validation.valid) return res.status(503).json({ success: false, message: 'Backup پیش از استقرار معتبر نشد.', backupId: backup.id, validation });
      const gate = { gateToken: crypto.randomBytes(32).toString('hex'), backupId: backup.id, commitSha, channel, version, workflowRunId, expiresAt: Date.now() + 30 * 60 * 1000 };
      await saveGate(gate);
      return res.json({ success: true, data: { gateToken: gate.gateToken, backupId: backup.id, backupPath: backup.filePath, backupSizeBytes: backup.sizeBytes, backupValid: true, commitSha, channel, version, workflowRunId, expiresAt: gate.expiresAt } });
    } catch (error) { return res.status(503).json({ success: false, message: `Backup پیش از استقرار انجام نشد: ${String(error.message || error).slice(0, 500)}` }); }
  }
  return res.json({ success: true, data: { gateRequired: false, commitSha, channel, version, workflowRunId } });
});

router.post('/execute', async (req, res) => {
  const body = req.body || {}, commitSha = String(body.commitSha || '').trim(), channel = String(body.channel || 'stable').toLowerCase(), version = String(body.version || '').slice(0, 100), workflowRunId = String(body.workflowRunId || '').slice(0, 100), gateToken = String(body.gateToken || '');
  if (!/^[0-9a-f]{40}$/i.test(commitSha)) return res.status(400).json({ success: false, message: 'Commit SHA نامعتبر است.' });
  if (!['stable', 'beta'].includes(channel)) return res.status(400).json({ success: false, message: 'کانال انتشار نامعتبر است.' });
  const scriptPath = process.env.DEPLOYMENT_SCRIPT_PATH;
  if (!scriptPath) return res.status(503).json({ success: false, message: 'DEPLOYMENT_SCRIPT_PATH روی سرور تنظیم نشده است.' });
  const resolved = path.resolve(scriptPath); if (!fs.existsSync(resolved)) return res.status(503).json({ success: false, message: 'اسکریپت استقرار روی سرور پیدا نشد.' });
  await ensureTable();
  const gate = await readGate();
  if (channel === 'stable' && process.env.ADMIN_REQUIRE_BACKUP_FOR_PRODUCTION_DEPLOY !== 'false') {
    if (!gate || gate.expiresAt < Date.now() || !timingSafeEqualText(gate.gateToken, gateToken) || gate.commitSha.toLowerCase() !== commitSha.toLowerCase()) return res.status(409).json({ success: false, message: 'دروازه استقرار معتبر نیست یا با Commit جاری تطبیق ندارد.' });
    const validation = await validateBackup(Number(gate.backupId)); if (!validation.valid) return res.status(409).json({ success: false, message: 'Backup مرتبط با استقرار معتبر نیست.', validation });
  }
  const childEnv = { ...process.env, RONIYA_DEPLOY_COMMIT_SHA: commitSha, RONIYA_DEPLOY_CHANNEL: channel, RONIYA_DEPLOY_VERSION: version, RONIYA_DEPLOY_WORKFLOW_RUN_ID: workflowRunId, RONIYA_DEPLOY_BACKUP_ID: String(gate?.backupId || '') };
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', resolved], { env: childEnv, timeout: 20 * 60 * 1000, maxBuffer: 2 * 1024 * 1024 }, async (error, stdout, stderr) => {
    const status = error ? 'failed' : 'completed';
    const details = { executionSource: 'ci-cd', actualCiCd: true, workflowRunId, backupId: gate?.backupId ?? null, scriptPath: path.basename(resolved), stdout: String(stdout || '').slice(-12000), stderr: String(stderr || '').slice(-12000) };
    try { await prisma.$executeRawUnsafe(`INSERT INTO dbo.AdminDeploymentLog(version,channel,commitSha,status,detailsJson,createdBy) VALUES(@p1,@p2,@p3,@p4,@p5,NULL)`, version, channel, commitSha, status, JSON.stringify(details)); } catch (_) {}
    if (status === 'completed') { try { await prisma.$executeRawUnsafe(`DELETE FROM dbo.GlobalSetting WHERE [key]=N'deployment.ci.gate'`); } catch (_) {} }
    if (error) return res.status(500).json({ success: false, message: 'استقرار CI/CD شکست خورد.', status, backupId: details.backupId, workflowRunId, output: String(stderr || stdout || error.message).slice(-4000) });
    return res.json({ success: true, data: { deployed: true, status, executionSource: 'ci-cd', actualCiCd: true, backupId: details.backupId, workflowRunId } });
  });
});

router.post('/complete', async (req, res) => {
  const body = req.body || {}, commitSha = String(body.commitSha || '').trim(), status = String(body.status || 'completed').slice(0, 30), channel = String(body.channel || 'stable').toLowerCase(), version = String(body.version || '').slice(0, 100), workflowRunId = String(body.workflowRunId || '').slice(0, 100), gateToken = String(body.gateToken || '');
  if (!/^[0-9a-f]{40}$/i.test(commitSha)) return res.status(400).json({ success: false, message: 'Commit SHA نامعتبر است.' });
  await ensureTable(); const gate = await readGate();
  if (status === 'completed' && process.env.ADMIN_REQUIRE_BACKUP_FOR_PRODUCTION_DEPLOY !== 'false') {
    if (!gate || gate.expiresAt < Date.now() || !timingSafeEqualText(gate.gateToken, gateToken) || gate.commitSha.toLowerCase() !== commitSha.toLowerCase() || Number(gate.backupId) <= 0) return res.status(409).json({ success: false, message: 'دروازه استقرار معتبر نیست یا Backup با Commit جاری تطبیق ندارد.' });
    const validation = await validateBackup(Number(gate.backupId)); if (!validation.valid) return res.status(409).json({ success: false, message: 'Backup مرتبط با استقرار دیگر معتبر نیست.', validation });
  }
  const details = { executionSource: 'ci-cd', actualCiCd: true, workflowRunId, backupId: gate?.backupId ?? null, completedAt: new Date().toISOString() };
  await prisma.$executeRawUnsafe(`INSERT INTO dbo.AdminDeploymentLog(version,channel,commitSha,status,detailsJson,createdBy) VALUES(@p1,@p2,@p3,@p4,@p5,NULL)`, version, channel, commitSha, status, JSON.stringify(details));
  if (status === 'completed') { try { await prisma.$executeRawUnsafe(`DELETE FROM dbo.GlobalSetting WHERE [key]=N'deployment.ci.gate'`); } catch (_) {} }
  return res.json({ success: true, data: { recorded: true, executionSource: 'ci-cd', actualCiCd: true, backupId: details.backupId, workflowRunId, status } });
});

module.exports = router;
