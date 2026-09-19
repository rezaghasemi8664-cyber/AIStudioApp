'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const AdmZip = require('adm-zip');

const BACKUP_ROOT = process.env.RONIYA_BACKUP_ROOT || 'C:\\RoniyaBackups';
const STAGING_ROOT = path.join(BACKUP_ROOT, 'Application', 'restore-staging');
const MAX_ZIP_BYTES = Number(process.env.ADMIN_APPLICATION_RESTORE_MAX_ZIP_BYTES || 500 * 1024 * 1024);
const MAX_UNCOMPRESSED_BYTES = Number(process.env.ADMIN_APPLICATION_RESTORE_MAX_UNCOMPRESSED_BYTES || 2 * 1024 * 1024 * 1024);
const MAX_ENTRY_BYTES = Number(process.env.ADMIN_APPLICATION_RESTORE_MAX_ENTRY_BYTES || 200 * 1024 * 1024);

const FORBIDDEN_NAMES = new Set([
  '.env', '.env.local', '.env.production', 'production.env',
  'scalping-token.txt', 'id_rsa', 'id_rsa.pem'
]);
const FORBIDDEN_DIRS = new Set(['.git', 'node_modules', 'build', 'dist', 'logs', 'tmp', 'temp', 'diagnostics']);
const REQUIRED_FILES = ['backend/server.cjs', 'backend/package.json', 'src/App.tsx', 'package.json'];

function normalizeEntryName(name) {
  const raw = String(name || '').replace(/\\/g, '/');
  if (!raw || raw.includes('\0')) throw new Error('نام فایل ZIP نامعتبر است.');
  if (raw.startsWith('/') || /^[A-Za-z]:\//.test(raw)) throw new Error('ZIP شامل مسیر مطلق غیرمجاز است.');
  const normalized = path.posix.normalize(raw);
  if (normalized === '..' || normalized.startsWith('../')) throw new Error('ZIP شامل مسیر traversal غیرمجاز است.');
  return normalized.replace(/^\.\//, '');
}

function isForbidden(relativePath) {
  const parts = relativePath.split('/').filter(Boolean);
  if (parts.some((part) => FORBIDDEN_NAMES.has(part))) return true;
  if (parts.some((part) => FORBIDDEN_DIRS.has(part))) return true;
  return false;
}

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function ensureInside(root, target) {
  const rootResolved = path.resolve(root) + path.sep;
  const targetResolved = path.resolve(target);
  return targetResolved === path.resolve(root) || targetResolved.startsWith(rootResolved);
}

function inspectZip(zipPath) {
  const stat = fs.statSync(zipPath);
  if (!stat.isFile() || stat.size <= 0) throw new Error('فایل Application Backup معتبر نیست.');
  if (stat.size > MAX_ZIP_BYTES) throw new Error('حجم ZIP از حد مجاز Restore بیشتر است.');

  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();
  if (!entries.length) throw new Error('ZIP خالی است.');

  const seen = new Set();
  let totalUncompressed = 0;
  let fileCount = 0;
  const files = [];

  for (const entry of entries) {
    const relativePath = normalizeEntryName(entry.entryName);
    if (!relativePath) continue;
    if (seen.has(relativePath)) throw new Error(`ZIP شامل فایل تکراری است: ${relativePath}`);
    seen.add(relativePath);

    if (isForbidden(relativePath)) throw new Error(`ZIP شامل مسیر/فایل ممنوع است: ${relativePath}`);
    const size = Number(entry.header?.size || 0);
    if (!entry.isDirectory) {
      if (size > MAX_ENTRY_BYTES) throw new Error(`حجم فایل ${relativePath} از حد مجاز بیشتر است.`);
      totalUncompressed += size;
      fileCount += 1;
      if (totalUncompressed > MAX_UNCOMPRESSED_BYTES) throw new Error('حجم استخراج‌شده ZIP از حد مجاز بیشتر است.');
      files.push(relativePath);
    }
  }

  const missingRequired = REQUIRED_FILES.filter((item) => !seen.has(item));
  if (missingRequired.length) throw new Error(`فایل‌های اصلی Backup وجود ندارند: ${missingRequired.join(', ')}`);

  return {
    zip,
    entryCount: entries.length,
    fileCount,
    totalUncompressedBytes: totalUncompressed,
    files
  };
}

async function prepare(zipPath, jobId) {
  const resolvedZip = path.resolve(zipPath);
  const backupRoot = path.resolve(BACKUP_ROOT);
  if (!ensureInside(backupRoot, resolvedZip)) throw new Error('مسیر Backup خارج از محدوده مجاز است.');
  if (!fs.existsSync(resolvedZip)) throw new Error('فایل Application Backup پیدا نشد.');

  const inspected = inspectZip(resolvedZip);
  const sha256 = await hashFile(resolvedZip);
  fs.mkdirSync(STAGING_ROOT, { recursive: true });

  const stagingId = `${Number(jobId) || 0}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
  const stagingDir = path.join(STAGING_ROOT, stagingId);
  fs.mkdirSync(stagingDir, { recursive: true });

  try {
    inspected.zip.extractAllTo(stagingDir, true);
    const requiredMissingAfterExtract = REQUIRED_FILES.filter((item) => !fs.existsSync(path.join(stagingDir, ...item.split('/'))));
    if (requiredMissingAfterExtract.length) throw new Error(`فایل‌های اصلی پس از استخراج پیدا نشدند: ${requiredMissingAfterExtract.join(', ')}`);

    const manifest = {
      jobId: Number(jobId) || null,
      zipFileName: path.basename(resolvedZip),
      zipSha256: sha256,
      zipSizeBytes: fs.statSync(resolvedZip).size,
      stagingId,
      stagingDir,
      entryCount: inspected.entryCount,
      fileCount: inspected.fileCount,
      totalUncompressedBytes: inspected.totalUncompressedBytes,
      preparedAt: new Date().toISOString(),
      host: os.hostname()
    };
    fs.writeFileSync(path.join(stagingDir, '.restore-manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
    return manifest;
  } catch (error) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
    throw error;
  }
}

function cleanupStaging(maxAgeMs = 30 * 60 * 1000) {
  if (!fs.existsSync(STAGING_ROOT)) return 0;
  let removed = 0;
  const cutoff = Date.now() - maxAgeMs;
  for (const name of fs.readdirSync(STAGING_ROOT)) {
    const dir = path.join(STAGING_ROOT, name);
    try {
      const stat = fs.statSync(dir);
      if (stat.isDirectory() && stat.mtimeMs < cutoff) {
        fs.rmSync(dir, { recursive: true, force: true });
        removed += 1;
      }
    } catch (_) {}
  }
  return removed;
}

module.exports = {
  BACKUP_ROOT,
  STAGING_ROOT,
  REQUIRED_FILES,
  inspectZip,
  prepare,
  cleanupStaging,
  ensureInside,
  hashFile
};
