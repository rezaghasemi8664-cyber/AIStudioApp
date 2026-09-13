'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const authMiddleware = require('../middlewares/auth.middleware.cjs');
const { hasPermission } = require('../services/rbac.service.cjs');

const router = express.Router();
const MAX_UPLOAD = 25 * 1024 * 1024;
const PLUGIN_ROOT = path.resolve(process.env.ADMIN_PLUGIN_DIR || path.join(__dirname, '..', 'plugins'));
const ID_RE = /^[a-z0-9][a-z0-9._-]{1,63}$/i;
const ALLOWED_SINGLE = new Set(['.js', '.cjs', '.json']);

function uid(req) {
  return Number(req.user?.id ?? req.user?.userId ?? 0) || null;
}

function fail(res, status, message) {
  return res.status(status).json({ success: false, message });
}

function inside(root, target) {
  const r = path.resolve(root);
  const t = path.resolve(target);
  return t === r || t.startsWith(r + path.sep);
}

function cleanName(name) {
  return path.basename(String(name || 'upload.bin')).replace(/[^a-zA-Z0-9._-]/g, '_');
}

function pluginIdFromName(name) {
  const base = path.basename(String(name || 'plugin'), path.extname(String(name || 'plugin')))
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  const id = base || `plugin-${Date.now()}`;
  return ID_RE.test(id) ? id : `plugin-${Date.now()}`;
}

function audit(req, action, statusCode, details) {
  return Promise.resolve().then(async () => {
    try {
      const { prisma } = require('../config/prisma.cjs');
      await prisma.$executeRawUnsafe(
        `IF OBJECT_ID(N'dbo.AdminAuditLog',N'U') IS NOT NULL INSERT INTO dbo.AdminAuditLog(adminUserId,action,moduleKey,targetId,method,path,statusCode,ipAddress,userAgent,detailsJson) VALUES(@p1,@p2,N'plugins',@p3,@p4,@p5,@p6,@p7,@p8,@p9)`,
        uid(req), action, details?.id || null, req.method, req.originalUrl, statusCode,
        req.ip || null, String(req.get('user-agent') || '').slice(0, 500), JSON.stringify(details || {})
      );
    } catch (_) {}
  });
}

async function allowed(req) {
  return !!(uid(req) && await hasPermission(uid(req), 'admin.plugins.manage'));
}

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const contentType = String(req.headers['content-type'] || '');
    const match = contentType.match(/(?:^|;)\s*boundary=(?:"([^"]+)"|([^;]+))/i);
    const rawBoundary = match ? String(match[1] || match[2] || '').trim() : '';
    if (!rawBoundary) return reject(new Error('درخواست multipart معتبر نیست.'));

    const boundary = Buffer.from(`--${rawBoundary}`);
    const chunks = [];
    let totalSize = 0;
    let settled = false;
    const failOnce = (error) => { if (!settled) { settled = true; reject(error); } };

    req.on('data', (chunk) => {
      if (settled) return;
      totalSize += chunk.length;
      if (totalSize > MAX_UPLOAD + 1024 * 1024) {
        failOnce(new Error('حجم فایل بیش از حد مجاز است.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('aborted', () => failOnce(new Error('آپلود افزونه قطع شد.')));
    req.on('error', failOnce);
    req.on('end', () => {
      if (settled) return;
      try {
        const body = Buffer.concat(chunks);
        const parts = [];
        let cursor = 0;
        while (cursor < body.length) {
          const start = body.indexOf(boundary, cursor);
          if (start < 0) break;
          const afterBoundary = start + boundary.length;
          if (body.subarray(afterBoundary, afterBoundary + 2).toString('ascii') === '--') break;
          const next = body.indexOf(boundary, afterBoundary);
          if (next < 0) break;
          let part = body.subarray(afterBoundary, next);
          if (part.subarray(0, 2).toString('ascii') === '\r\n') part = part.subarray(2);
          const separator = Buffer.from('\r\n\r\n');
          const headerEnd = part.indexOf(separator);
          if (headerEnd < 0) { cursor = next; continue; }
          const headerText = part.subarray(0, headerEnd).toString('utf8');
          const dispositionLine = headerText.split(/\r\n/).find((line) => /^content-disposition\s*:/i.test(line));
          if (dispositionLine) {
            const nameMatch = dispositionLine.match(/(?:^|;)\s*name="([^"]*)"/i);
            const filenameMatch = dispositionLine.match(/(?:^|;)\s*filename="([^"]*)"/i);
            const filenameStarMatch = dispositionLine.match(/(?:^|;)\s*filename\*=([^;]+)/i);
            let filename = filenameMatch?.[1] || '';
            if (!filename && filenameStarMatch) {
              const encoded = filenameStarMatch[1].trim();
              const separatorIndex = encoded.indexOf("''");
              const value = separatorIndex >= 0 ? encoded.slice(separatorIndex + 2) : encoded;
              try { filename = decodeURIComponent(value); } catch (_) { filename = value; }
            }
            let data = part.subarray(headerEnd + separator.length);
            if (data.subarray(-2).toString('ascii') === '\r\n') data = data.subarray(0, -2);
            if (nameMatch) parts.push({ name: nameMatch[1], filename, data });
          }
          cursor = next;
        }
        const file = parts.find((part) => part.name === 'file' && part.filename);
        if (!file) throw new Error('فایل افزونه انتخاب نشده است.');
        if (file.data.length > MAX_UPLOAD) throw new Error('حجم فایل بیش از ۲۵ مگابایت مجاز نیست.');
        settled = true;
        resolve(file);
      } catch (error) { failOnce(error); }
    });
  });
}

function readManifest(dir) {
  const p = path.join(dir, 'manifest.json');
  if (!inside(dir, p) || !fs.existsSync(p)) throw new Error('فایل manifest.json افزونه یافت نشد.');
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { throw new Error('manifest.json معتبر نیست.'); }
  if (!manifest || typeof manifest !== 'object' || !ID_RE.test(String(manifest.id || ''))) throw new Error('شناسه افزونه نامعتبر است.');
  if (!/^\d+\.\d+\.\d+(?:[-+].*)?$/.test(String(manifest.version || ''))) throw new Error('نسخه افزونه باید مانند 1.0.0 باشد.');
  return { id: String(manifest.id), name: String(manifest.name || manifest.id).slice(0, 120), version: String(manifest.version), description: String(manifest.description || '').slice(0, 500), main: manifest.main ? String(manifest.main).slice(0, 200) : null };
}

function ensureManifest(dir, sourceName) {
  const manifestPath = path.join(dir, 'manifest.json');
  if (fs.existsSync(manifestPath)) return;
  const id = pluginIdFromName(sourceName);
  const displayName = path.basename(String(sourceName || id), path.extname(String(sourceName || id)));
  fs.writeFileSync(manifestPath, JSON.stringify({
    id,
    name: displayName,
    version: '1.0.0',
    description: 'افزونه نصب‌شده بدون manifest.json',
    main: null,
    generated: true
  }, null, 2), 'utf8');
}

function validateTree(root) {
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const target = path.join(dir, entry.name);
      if (!inside(root, target)) throw new Error('مسیر غیرمجاز داخل افزونه شناسایی شد.');
      if (entry.isSymbolicLink()) throw new Error('لینک نمادین داخل افزونه مجاز نیست.');
      if (entry.isDirectory()) walk(target);
    }
  };
  walk(root);
}

function extractZip(zipPath, stage) {
  if (process.platform === 'win32') {
    const escapePowerShell = (value) => String(value).replace(/'/g, "''");
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Expand-Archive -LiteralPath '${escapePowerShell(zipPath)}' -DestinationPath '${escapePowerShell(stage)}' -Force`], { encoding: 'utf8', timeout: 60000 });
    if (result.status !== 0) throw new Error(String(result.stderr || result.stdout || 'استخراج ZIP ناموفق بود.').trim().slice(0, 500));
  } else {
    const result = spawnSync('unzip', ['-q', '-o', zipPath, '-d', stage], { encoding: 'utf8', timeout: 60000 });
    if (result.status !== 0) throw new Error(String(result.stderr || 'استخراج ZIP ناموفق بود.').trim().slice(0, 500));
  }
}

router.use(authMiddleware, async (req, res, next) => {
  if (!(await allowed(req))) return fail(res, 403, 'مجوز مدیریت افزونه‌ها را ندارید.');
  next();
});

router.get('/', async (_req, res) => {
  try {
    fs.mkdirSync(PLUGIN_ROOT, { recursive: true });
    const items = [];
    for (const entry of fs.readdirSync(PLUGIN_ROOT, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(PLUGIN_ROOT, entry.name);
      try {
        const manifest = readManifest(dir);
        const stat = fs.statSync(dir);
        items.push({ ...manifest, installedAt: stat.birthtime.toISOString(), updatedAt: stat.mtime.toISOString(), status: 'installed' });
      } catch (_) {
        const stat = fs.statSync(dir);
        items.push({ id: entry.name, name: entry.name, version: 'نامعتبر', description: 'اطلاعات افزونه قابل خواندن نیست.', installedAt: stat.birthtime.toISOString(), updatedAt: stat.mtime.toISOString(), status: 'invalid' });
      }
    }
    items.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    return res.json({ success: true, data: items });
  } catch (_) { return fail(res, 500, 'دریافت فهرست افزونه‌ها ناموفق بود.'); }
});

router.post('/install', async (req, res) => {
  let temp = '';
  try {
    const file = await parseMultipart(req);
    const ext = path.extname(file.filename).toLowerCase();
    if (ext !== '.zip' && !ALLOWED_SINGLE.has(ext)) return fail(res, 400, 'فرمت افزونه مجاز نیست. فقط ZIP، JS، CJS یا JSON قابل نصب است.');
    fs.mkdirSync(PLUGIN_ROOT, { recursive: true });
    temp = fs.mkdtempSync(path.join(os.tmpdir(), 'roniya-plugin-'));
    const source = path.join(temp, cleanName(file.filename));
    fs.writeFileSync(source, file.data, { flag: 'wx' });
    const stage = path.join(temp, 'stage');
    fs.mkdirSync(stage);

    if (ext === '.zip') extractZip(source, stage);
    else if (ext === '.json') fs.copyFileSync(source, path.join(stage, 'manifest.json'));
    else {
      fs.copyFileSync(source, path.join(stage, path.basename(source)));
      ensureManifest(stage, source);
    }

    validateTree(stage);
    let root = stage;
    const entries = fs.readdirSync(stage, { withFileTypes: true });
    if (!fs.existsSync(path.join(stage, 'manifest.json')) && entries.length === 1 && entries[0].isDirectory()) root = path.join(stage, entries[0].name);
    ensureManifest(root, file.filename);
    validateTree(root);

    const manifest = readManifest(root);
    const destination = path.join(PLUGIN_ROOT, manifest.id);
    if (!inside(PLUGIN_ROOT, destination)) throw new Error('مسیر مقصد افزونه نامعتبر است.');
    const backup = `${destination}.backup-${Date.now()}`;
    if (fs.existsSync(destination)) fs.renameSync(destination, backup);
    try {
      fs.cpSync(root, destination, { recursive: true });
      if (fs.existsSync(backup)) fs.rmSync(backup, { recursive: true, force: true });
    } catch (installError) {
      if (fs.existsSync(destination)) fs.rmSync(destination, { recursive: true, force: true });
      if (fs.existsSync(backup)) fs.renameSync(backup, destination);
      throw installError;
    }

    await audit(req, 'INSTALL_PLUGIN', 201, { id: manifest.id, version: manifest.version, generatedManifest: !fs.existsSync(path.join(root, 'manifest.json')) });
    return res.status(201).json({ success: true, message: `افزونه «${manifest.name}» با موفقیت نصب شد.`, data: manifest });
  } catch (error) {
    await audit(req, 'INSTALL_PLUGIN', 400, { error: error.message });
    return fail(res, 400, error.message || 'نصب افزونه ناموفق بود.');
  } finally {
    if (temp) { try { fs.rmSync(temp, { recursive: true, force: true }); } catch (_) {} }
  }
});

module.exports = router;
