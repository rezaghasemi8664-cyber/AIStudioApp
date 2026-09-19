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
function parseDate(value, endOfDay = false) {
  if (!value) return null;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  if (endOfDay) d.setHours(23, 59, 59, 999);
  return d;
}

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

router.get('/history', async (req, res) => {
  if (!(await allowed(req))) return fail(res, 403, 'دسترسی مدیریت اطلاع‌رسانی ندارید.');
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    const search = String(req.query.search || '').trim();
    const type = String(req.query.type || '').trim().toLowerCase();
    const read = String(req.query.read || '').trim().toLowerCase();
    const from = parseDate(req.query.from);
    const to = parseDate(req.query.to, true);
    if (req.query.from && !from) return fail(res, 400, 'تاریخ شروع نامعتبر است.');
    if (req.query.to && !to) return fail(res, 400, 'تاریخ پایان نامعتبر است.');

    const where = {};
    if (search) where.OR = [{ title: { contains: search } }, { message: { contains: search } }];
    if (type) where.type = type;
    if (read === 'read') where.isRead = true;
    if (read === 'unread') where.isRead = false;
    if (from || to) where.createdAt = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };

    const [total, items] = await Promise.all([
      prisma.notification.count({ where }),
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: { id: true, userId: true, title: true, message: true, type: true, isRead: true, createdAt: true },
      }),
    ]);
    return res.json({ success: true, data: { items, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } } });
  } catch (e) {
    console.error('[ADMIN_NOTIFICATIONS] history:', e.message);
    return fail(res, 500, 'دریافت تاریخچه اطلاع‌رسانی ناموفق بود.');
  }
});

module.exports = router;
