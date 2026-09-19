'use strict';

const { prisma } = require('../config/prisma.cjs');

let cache = { value: null, expiresAt: 0 };

function parseValue(value) {
  try { return JSON.parse(value); } catch { return value; }
}

function isExempt(pathname) {
  return pathname === '/api' ||
    pathname.startsWith('/api/health') ||
    pathname.startsWith('/api/v1/health') ||
    pathname.startsWith('/api/version') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/v1/auth') ||
    pathname.startsWith('/api/admin') ||
    pathname.startsWith('/api/v1/admin');
}

async function getPolicy() {
  const now = Date.now();
  if (cache.expiresAt > now && cache.value) return cache.value;
  const row = await prisma.globalSetting.findUnique({ where:{ key:'maintenance.policy' } });
  const value = row && row.category === 'maintenance' ? parseValue(row.value) : { enabled:false, allowAdmins:true, message:'' };
  cache = { value, expiresAt:now + 5000 };
  return value;
}

function invalidateMaintenanceCache() { cache.expiresAt = 0; }

async function maintenanceMiddleware(req,res,next) {
  if (isExempt(req.originalUrl || req.path || '')) return next();
  try {
    const policy = await getPolicy();
    if (!policy || policy.enabled !== true) return next();
    return res.status(503).json({
      success:false,
      code:'MAINTENANCE_MODE',
      message:policy.message || 'سامانه موقتاً در حال نگهداری است.',
      maintenance:true,
      allowAdmins:policy.allowAdmins !== false,
    });
  } catch (error) {
    console.error('[MAINTENANCE] policy read failed:', error.message);
    return next();
  }
}

maintenanceMiddleware.invalidate = invalidateMaintenanceCache;
module.exports = maintenanceMiddleware;
