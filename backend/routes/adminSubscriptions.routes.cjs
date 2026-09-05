'use strict';

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const authMiddleware = require('../middlewares/auth.middleware.cjs');

const router = express.Router();
const prisma = new PrismaClient();

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

module.exports = router;
