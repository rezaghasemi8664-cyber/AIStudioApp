'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const crypto = require('crypto');
const authMiddleware = require('../middlewares/auth.middleware.cjs');
const { hasPermission } = require('../services/rbac.service.cjs');

const router = express.Router();
const ROOT = path.resolve(process.env.DEPLOY_PROJECT_ROOT || path.join(__dirname, '../..'));
const STATUS_DIR = path.resolve(process.env.DEPLOY_STATUS_DIR || path.join(ROOT, 'backend', 'runtime', 'admin-deployment'));
const STATUS_FILE = path.join(STATUS_DIR, 'latest.json');
const SCRIPT = path.resolve(process.env.ADMIN_UPDATE_SCRIPT || path.join(ROOT, 'backend', 'scripts', 'admin-server-update.ps1'));
const BRANCH = String(process.env.DEPLOY_GIT_BRANCH || 'main').trim() || 'main';

function isAdmin(req) {
  const u = req.user || {};
  if (u.isAdmin === true || ['admin', 'superadmin'].includes(String(u.role || '').toLowerCase())) return true;
  return (Array.isArray(u.roles) ? u.roles : []).some(r => ['admin', 'superadmin'].includes(String(typeof r === 'string' ? r : r?.name).toLowerCase()));
}
function fail(res, status, message, details) { return res.status(status).json({ success: false, message, details: details || null }); }
function readStatus() {
  try { return JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8')); } catch (_) { return null; }
}
function writeStatus(value) {
  fs.mkdirSync(STATUS_DIR, { recursive: true });
  const temp = `${STATUS_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(temp, STATUS_FILE);
}

router.use(authMiddleware);
router.use(async (req, res, next) => {
  if (!isAdmin(req)) return fail(res, 403, 'این عملیات فقط برای ادمین مجاز است.');
  const id = Number(req.user?.id ?? req.user?.userId ?? 0);
  if (!id || !(await hasPermission(id, 'admin.updates.manage'))) return fail(res, 403, 'دسترسی اجرای بروزرسانی سرور برای شما مجاز نیست.');
  next();
});

router.get('/status', (_req, res) => {
  const status = readStatus();
  return res.json({ success: true, data: status || { status: 'idle', message: 'هنوز اجرای بروزرسانی ثبت نشده است.' } });
});

router.post('/start', (_req, res) => {
  if (!fs.existsSync(SCRIPT)) return fail(res, 503, 'اسکریپت بروزرسانی روی سرور/مخزن پیدا نشد.', { script: SCRIPT });
  if (!fs.existsSync(path.join(ROOT, '.git'))) return fail(res, 503, 'پوشه Git پروژه روی سرور پیدا نشد.', { projectRoot: ROOT });

  const current = readStatus();
  if (current?.status === 'running') return fail(res, 409, 'یک بروزرسانی دیگر در حال اجراست.', { jobId: current.jobId, startedAt: current.startedAt });

  const jobId = crypto.randomUUID();
  const initial = { jobId, status: 'running', stage: 'starting', branch: BRANCH, projectRoot: ROOT, startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), steps: [] };
  writeStatus(initial);

  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT, '-ProjectRoot', ROOT, '-Branch', BRANCH, '-StatusFile', STATUS_FILE, '-JobId', jobId], {
    cwd: ROOT,
    detached: true,
    windowsHide: true,
    stdio: 'ignore',
    env: { ...process.env, RONIYA_ADMIN_UPDATE_JOB: jobId }
  });
  child.unref();
  return res.status(202).json({ success: true, message: 'فرآیند بروزرسانی آغاز شد. نتیجه هر مرحله در همین پنل نمایش داده می‌شود.', data: initial });
});

module.exports = router;
