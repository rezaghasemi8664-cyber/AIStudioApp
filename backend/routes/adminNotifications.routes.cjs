'use strict';

const express = require('express');
const { prisma } = require('../config/prisma.cjs');
const authMiddleware = require('../middlewares/auth.middleware.cjs');
const { hasPermission } = require('../services/rbac.service.cjs');

const router = express.Router();

function userId(req) { return Number(req.user?.id ?? req.user?.userId ?? 0) || null; }
function isAdmin(req) {
  const u = req.user || {};
  if (u.isAdmin === true || ['admin', 'superadmin'].includes(String(u.role || '').toLowerCase())) return true;
  return (Array.isArray(u.roles) ? u.roles : []).some(r => ['admin', 'superadmin'].includes(String(typeof r === 'string' ? r : r?.name).toLowerCase()));
}
async function allowed(req) {
  const id = userId(req);
  return !!(id && await hasPermission(id, 'admin.notifications.manage'));
}
function fail(res, status, message) { return res.status(status).json({ success: false, message }); }

router.use(authMiddleware, (req, res, next) => isAdmin(req) ? next() : fail(res, 403, 'این بخش فقط برای ادمین مجاز است.'));

router.get('/overview', async (req, res) => {
  if (!(await allowed(req))) return fail(res, 403, 'دسترسی مدیریت اطلاع‌رسانی ندارید.');
  try {
    const now = new Date();
    const d24 = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const [total, unread, last24h, last7d, last30d, recent, byType] = await Promise.all([
      prisma.notification.count(),
      prisma.notification.count({ where: { isRead: false } }),
      prisma.notification.count({ where: { createdAt: { gte: d24 } } }),
      prisma.notification.count({ where: { createdAt: { gte: d7 } } }),
      prisma.notification.count({ where: { createdAt: { gte: d30 } } }),
      prisma.notification.findMany({ orderBy: { createdAt: 'desc' }, take: 40, select: { id: true, userId: true, title: true, message: true, type: true, isRead: true, createdAt: true } }),
      prisma.notification.groupBy({ by: ['type'], _count: { _all: true }, orderBy: { _count: { type: 'desc' } } }),
    ]);
    const activeUsers = await prisma.user.count({ where: { isDeleted: false, isActive: true } });
    return res.json({ success: true, data: { counts: { total, unread, last24h, last7d, last30d, activeUsers }, byType: byType.map(x => ({ type: x.type, count: x._count._all })), recent } });
  } catch (e) {
    console.error('[ADMIN_NOTIFICATIONS] overview:', e.message);
    return fail(res, 500, 'دریافت آمار اطلاع‌رسانی ناموفق بود.');
  }
});

module.exports = router;
