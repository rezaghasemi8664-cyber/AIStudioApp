'use strict';

const { prisma } = require('../config/prisma.cjs');

let cache = { value: null, expiresAt: 0 };
let policyReadInFlight = null;

function parseValue(value) {
  try { return JSON.parse(value); } catch { return value; }
}

function isExempt(pathname) {
  const pathOnly = String(pathname || '').split('?')[0];
  if (pathOnly === '/api/maintenance/status' || pathOnly === '/api/v1/maintenance/status' || pathOnly === '/v1/maintenance/status') return true;
  return pathOnly === '/api' ||
    pathOnly.startsWith('/api/health') ||
    pathOnly.startsWith('/api/v1/health') ||
    pathOnly.startsWith('/api/version') ||
    pathOnly.startsWith('/api/auth') ||
    pathOnly.startsWith('/api/v1/auth') ||
    pathOnly.startsWith('/api/admin') ||
    pathOnly.startsWith('/api/v1/admin');
}

async function getPolicy() {
  const now = Date.now();
  if (cache.expiresAt > now && cache.value) return cache.value;
  if (policyReadInFlight) return policyReadInFlight;

  policyReadInFlight = (async () => {
    try {
      const row = await prisma.globalSetting.findUnique({ where: { key: 'maintenance.policy' } });
      const parsed = row && row.category === 'maintenance'
        ? parseValue(row.value)
        : { enabled: false, allowAdmins: true, message: '' };
      const value = parsed && typeof parsed === 'object'
        ? parsed
        : { enabled: false, allowAdmins: true, message: '' };
      cache = { value, expiresAt: Date.now() + 5000 };
      return value;
    } finally {
      policyReadInFlight = null;
    }
  })();

  return policyReadInFlight;
}

function invalidateMaintenanceCache() {
  cache.expiresAt = 0;
}

async function maintenanceMiddleware(req, res, next) {
  if (isExempt(req.originalUrl || req.path || '')) return next();
  try {
    const policy = await getPolicy();
    if (!policy || policy.enabled !== true) return next();
    return res.status(503).json({
      success: false,
      code: 'MAINTENANCE_MODE',
      message: policy.message || 'سامانه موقتاً در حال نگهداری است.',
      maintenance: true,
      allowAdmins: policy.allowAdmins !== false,
    });
  } catch (error) {
    console.error('[MAINTENANCE] policy read failed:', error.message);
    return next();
  }
}

maintenanceMiddleware.invalidate = invalidateMaintenanceCache;
module.exports = maintenanceMiddleware;
