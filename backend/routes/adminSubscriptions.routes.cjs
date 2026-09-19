'use strict';

const express = require('express');
const prismaModule = require('../config/prisma.cjs');
const authMiddleware = require('../middlewares/auth.middleware.cjs');

const router = express.Router();
const prisma = prismaModule.prisma || prismaModule;

function subscriptionStatus(user) {
  const end = user && user.subscriptionEnd ? new Date(user.subscriptionEnd) : null;
  if (end && !Number.isNaN(end.getTime())) {
    const days = Math.ceil((end.getTime() - Date.now()) / 86400000);
    if (days > 7) return 'active';
    if (days > 0) return 'expiring';
    return 'expired';
  }
  if (user && user.subscriptionStart && Number(user.subscriptionMonths) > 0) {
    const start = new Date(user.subscriptionStart);
    if (!Number.isNaN(start.getTime())) {
      const endByMonth = new Date(start);
      endByMonth.setMonth(endByMonth.getMonth() + Number(user.subscriptionMonths));
      const days = Math.ceil((endByMonth.getTime() - Date.now()) / 86400000);
      if (days > 7) return 'active';
      if (days > 0) return 'expiring';
    }
  }
  return 'expired';
}

async function requireAdmin(req, res, next) {
  const uid = req.user && (req.user.id || req.user.userId);
  if (!uid) return res.status(401).json({ success: false, message: 'Authentication required' });
  try {
    const user = await prisma.user.findUnique({ where: { id: Number(uid) }, include: { Role: true } });
    if (!user || !user.Role) return res.status(403).json({ success: false, message: 'Access denied: admin role required' });
    const role = String(user.Role.name || '').toLowerCase();
    if (role !== 'admin' && role !== 'superadmin' && user.roleId !== 1) {
      return res.status(403).json({ success: false, message: 'Access denied: admin role required' });
    }
    next();
  } catch (error) {
    console.error('[AdminSubscriptions] access check failed:', error.message);
    res.status(500).json({ success: false, message: 'Error checking admin access' });
  }
}

router.get('/summary', authMiddleware, requireAdmin, async (_req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { isDeleted: false },
      select: { subscriptionStart: true, subscriptionEnd: true, subscriptionMonths: true }
    });
    const summary = { total: users.length, active: 0, expiring: 0, expired: 0 };
    for (const user of users) summary[subscriptionStatus(user)] += 1;
    res.json({ success: true, data: summary });
  } catch (error) {
    console.error('[AdminSubscriptions] summary failed:', error.message);
    res.status(500).json({ success: false, message: 'Error fetching subscription summary' });
  }
});


// Subscription plan management. Prices are stored in the database and are never hard-coded.
function normalizePlanPayload(body) {
  const b = body || {};
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  const code = typeof b.code === 'string' ? b.code.trim() : '';
  const durationMonths = Number(b.durationMonths);
  const price = b.price === '' || b.price === null || b.price === undefined ? NaN : Number(b.price);
  const currency = typeof b.currency === 'string' ? b.currency.trim().toUpperCase() : 'IRR';
  const isActive = b.isActive === undefined ? true : (b.isActive === true || b.isActive === 'true' || b.isActive === 1 || b.isActive === '1');
  if (!name) return { error: 'نام پلن الزامی است.' };
  if (!code || !/^[A-Za-z0-9_-]+$/.test(code)) return { error: 'کد پلن فقط می‌تواند شامل حروف انگلیسی، عدد، خط تیره و زیرخط باشد.' };
  if (!Number.isInteger(durationMonths) || durationMonths <= 0 || durationMonths > 120) return { error: 'مدت پلن باید یک عدد صحیح بین ۱ تا ۱۲۰ ماه باشد.' };
  if (!Number.isFinite(price) || price < 0) return { error: 'قیمت پلن باید عددی بزرگ‌تر یا مساوی صفر باشد.' };
  if (!currency || currency.length > 10) return { error: 'واحد پول معتبر نیست.' };
  return { data: { name, code, durationMonths, price, currency, isActive } };
}

router.get('/plans', authMiddleware, requireAdmin, async (_req, res) => {
  try {
    const plans = await prisma.subscriptionPlan.findMany({
      orderBy: [{ durationMonths: 'asc' }, { price: 'asc' }, { id: 'asc' }],
    });
    res.json({ success: true, data: plans });
  } catch (error) {
    console.error('[AdminSubscriptions] plans list failed:', error.message);
    res.status(500).json({ success: false, message: 'دریافت پلن‌ها ناموفق بود.' });
  }
});

router.post('/plans', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const parsed = normalizePlanPayload(req.body);
    if (parsed.error) return res.status(400).json({ success: false, message: parsed.error });
    const { name, code, durationMonths, price, currency, isActive } = parsed.data;
    const existing = await prisma.subscriptionPlan.findUnique({ where: { code } });
    if (existing) return res.status(409).json({ success: false, message: 'کد پلن قبلاً استفاده شده است.' });
    const plan = await prisma.subscriptionPlan.create({
      data: { name, code, durationMonths, price, currency, isActive },
    });
    res.status(201).json({ success: true, message: 'پلن با موفقیت ایجاد شد.', data: plan });
  } catch (error) {
    console.error('[AdminSubscriptions] plan create failed:', error.message);
    res.status(500).json({ success: false, message: 'ایجاد پلن ناموفق بود.' });
  }
});

router.put('/plans/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ success: false, message: 'شناسه پلن معتبر نیست.' });
    const parsed = normalizePlanPayload(req.body);
    if (parsed.error) return res.status(400).json({ success: false, message: parsed.error });
    const { name, code, durationMonths, price, currency, isActive } = parsed.data;
    const existing = await prisma.subscriptionPlan.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: 'پلن پیدا نشد.' });
    const duplicate = await prisma.subscriptionPlan.findFirst({ where: { code, NOT: { id } } });
    if (duplicate) return res.status(409).json({ success: false, message: 'کد پلن قبلاً استفاده شده است.' });
    const plan = await prisma.subscriptionPlan.update({
      where: { id },
      data: { name, code, durationMonths, price, currency, isActive },
    });
    res.json({ success: true, message: 'پلن با موفقیت به‌روزرسانی شد.', data: plan });
  } catch (error) {
    console.error('[AdminSubscriptions] plan update failed:', error.message);
    res.status(500).json({ success: false, message: 'به‌روزرسانی پلن ناموفق بود.' });
  }
});

router.delete('/plans/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ success: false, message: 'شناسه پلن معتبر نیست.' });
    const existing = await prisma.subscriptionPlan.findUnique({ where: { id }, include: { subscriptions: { select: { id: true }, take: 1 } } });
    if (!existing) return res.status(404).json({ success: false, message: 'پلن پیدا نشد.' });
    if (existing.subscriptions.length > 0) {
      return res.status(409).json({ success: false, message: 'این پلن در سوابق اشتراک استفاده شده و قابل حذف نیست؛ آن را غیرفعال کنید.' });
    }
    await prisma.subscriptionPlan.delete({ where: { id } });
    res.json({ success: true, message: 'پلن حذف شد.' });
  } catch (error) {
    console.error('[AdminSubscriptions] plan delete failed:', error.message);
    res.status(500).json({ success: false, message: 'حذف پلن ناموفق بود.' });
  }
});

module.exports = router;
