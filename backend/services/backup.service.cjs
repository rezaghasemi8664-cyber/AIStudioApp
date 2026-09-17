'use strict';

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const DEFAULT_ROOT = process.platform === 'win32' ? 'C:\\RoniyaBackups' : '/var/backups/roniya';
const CATEGORIES = ['Daily', 'Weekly', 'Monthly', 'Application'];
const FORBIDDEN_ZIP_NAMES = [
  '.env', '.env.local', '.env.production', 'production.env',
  'scalping-token.txt', 'id_rsa', 'id_rsa.pem'
];

function getBackupRoot() {
  return path.resolve(process.env.ADMIN_BACKUP_DIR || DEFAULT_ROOT);
}

function safeBackupPath(value) {
  if (!value) return null;
  const root = getBackupRoot();
  const candidate = path.resolve(String(value));
  if (candidate === root || candidate.startsWith(root + path.sep)) return candidate;
  return null;
}

function categoryFromPath(filePath) {
  const relative = path.relative(getBackupRoot(), filePath);
  const first = relative.split(path.sep)[0] || '';
  const match = CATEGORIES.find((item) => item.toLowerCase() === first.toLowerCase());
  return match ? match.toLowerCase() : 'other';
}

function typeFromExtension(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.bak') return 'database';
  if (ext === '.zip') return 'application';
  return null;
}

function toBackupRecord(filePath, stat, validation = null) {
  const type = typeFromExtension(filePath);
  if (!type) return null;
  return {
    id: Buffer.from(filePath).toString('base64url'),
    type,
    category: categoryFromPath(filePath),
    fileName: path.basename(filePath),
    sizeBytes: stat.size,
    createdAt: stat.birthtime.toISOString(),
    modifiedAt: stat.mtime.toISOString(),
    valid: validation ? validation.valid : null,
    restorable: validation ? validation.restorable : true,
    validationMessage: validation?.message || null,
    path: filePath
  };
}

function listBackupFiles() {
  const root = getBackupRoot();
  if (!fs.existsSync(root)) return [];
  const records = [];
  for (const category of CATEGORIES) {
    const dir = path.join(root, category);
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const fullPath = path.join(dir, entry.name);
      const type = typeFromExtension(fullPath);
      if (!type) continue;
      const stat = fs.statSync(fullPath);
      records.push(toBackupRecord(fullPath, stat));
    }
  }
  return records.sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));
}

function resolveBackup(idOrPath) {
  let candidate = null;
  if (idOrPath) {
    try {
      const decoded = Buffer.from(String(idOrPath), 'base64url').toString('utf8');
      if (decoded && typeFromExtension(decoded)) candidate = decoded;
    } catch (_) {}
    if (!candidate && String(idOrPath).includes(path.sep)) candidate = String(idOrPath);
  }
  const safe = safeBackupPath(candidate);
  if (!safe || !fs.existsSync(safe) || !fs.statSync(safe).isFile()) {
    const error = new Error('فایل Backup معتبر یا مجاز پیدا نشد.');
    error.statusCode = 404;
    throw error;
  }
  return safe;
}

function validateApplicationBackup(filePath) {
  try {
    const zip = new AdmZip(filePath);
    const entries = zip.getEntries();
    if (!entries.length) return { valid: false, restorable: false, message: 'فایل ZIP خالی است.' };
    for (const entry of entries) {
      const normalized = entry.entryName.replace(/\\/g, '/').replace(/^\/+/, '');
      if (normalized.split('/').some((part) => part === '..')) {
        return { valid: false, restorable: false, message: 'ZIP شامل مسیر ناامن است.' };
      }
      const base = normalized.split('/').pop().toLowerCase();
      if (FORBIDDEN_ZIP_NAMES.some((name) => base === name.toLowerCase())) {
        return { valid: false, restorable: false, message: `ZIP شامل فایل ممنوع ${base} است.` };
      }
    }
    return { valid: true, restorable: true, message: `ZIP معتبر است (${entries.length} entry).` };
  } catch (error) {
    return { valid: false, restorable: false, message: `ZIP نامعتبر است: ${error.message}` };
  }
}

function validateBackup(idOrPath) {
  const filePath = resolveBackup(idOrPath);
  const stat = fs.statSync(filePath);
  const type = typeFromExtension(filePath);
  if (!stat.size) return toBackupRecord(filePath, stat, { valid: false, restorable: false, message: 'فایل Backup خالی است.' });
  if (type === 'application') {
    return toBackupRecord(filePath, stat, validateApplicationBackup(filePath));
  }
  return toBackupRecord(filePath, stat, {
    valid: true,
    restorable: true,
    message: 'فایل Database Backup از نظر فایل و اندازه معتبر است؛ VERIFYONLY در مرحله Restore اجرا می‌شود.'
  });
}

function getStatus() {
  const rows = listBackupFiles();
  const database = rows.filter((r) => r.type === 'database');
  const application = rows.filter((r) => r.type === 'application');
  return {
    rows,
    summary: {
      total: rows.length,
      database: database.length,
      application: application.length,
      latest: rows[0] || null,
      backupDirectory: getBackupRoot()
    }
  };
}

module.exports = {
  getBackupRoot,
  safeBackupPath,
  listBackupFiles,
  getStatus,
  resolveBackup,
  validateBackup,
  validateApplicationBackup
};
