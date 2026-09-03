// backend/routes/profile.routes.cjs - Production v10.0 (fixed password route)
// =============================================================================
'use strict';

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ─── Load auth middleware (safe search) ─────────────────────────────
let authMiddleware;
try {
  authMiddleware = require('../middlewares/auth.middleware.cjs');
} catch (e1) {
  try {
    authMiddleware = require('../middleware/auth.middleware.cjs');
  } catch (e2) {
    try {
      authMiddleware = require('../middleware/auth.cjs');
    } catch (e3) {
      console.warn('[PROFILE-ROUTES] No auth middleware found, using passthrough');
      authMiddleware = function (req, res, next) { next(); };
    }
  }
}

// ─── USER_SELECT ────────────────────────────────────────────────────
const USER_SELECT = {
  id: true,
  username: true,
  email: true,
  name: true,
  phone: true,
  avatar: true,
  isActive: true,
  roleId: true,
  subscriptionStart: true,
  subscriptionEnd: true,
  subscriptionMonths: true,
  analysisLimit: true,
  createdAt: true,
  updatedAt: true,
  Role: { select: { id: true, name: true } }
};

// ─── Helpers ────────────────────────────────────────────────────────
function parseUserId(raw) {
  if (raw === null || raw === undefined) return null;
  var s = String(raw).trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return Number(s);
  return s;
}

function calcRemainingDays(subscriptionStart, subscriptionMonths, subscriptionEnd) {
  var end = subscriptionEnd ? new Date(subscriptionEnd) : null;
  if (!end && subscriptionStart && subscriptionMonths > 0) {
    var startLegacy = new Date(subscriptionStart);
    end = new Date(startLegacy);
    end.setMonth(end.getMonth() + subscriptionMonths);
  }
  if (!end || isNaN(end.getTime())) return 0;
  var diffDays = Math.ceil((end.getTime() - Date.now()) / 86400000);
  return diffDays > 0 ? diffDays : 0;
}

function calcSubscriptionDurationDays(subscriptionStart, subscriptionEnd, subscriptionMonths) {
  var start = subscriptionStart ? new Date(subscriptionStart) : null;
  var end = subscriptionEnd ? new Date(subscriptionEnd) : null;
  if (start && !isNaN(start.getTime()) && end && !isNaN(end.getTime())) return Math.max(0, Math.ceil((end.getTime() - start.getTime()) / 86400000));
  if (start && !isNaN(start.getTime()) && subscriptionMonths > 0) { var legacyEnd = new Date(start); legacyEnd.setMonth(legacyEnd.getMonth() + subscriptionMonths); return Math.max(0, Math.ceil((legacyEnd.getTime() - start.getTime()) / 86400000)); }
  return 0;
}

function formatUserResponse(user) {
  if (!user) return null;
  var nameParts = (user.name || '').trim().split(/\s+/);
  var remainingDays = calcRemainingDays(user.subscriptionStart, user.subscriptionMonths, user.subscriptionEnd);
  return {
    id: user.id,
    username: user.username,
    email: user.email || '',
    name: user.name || '',
    firstName: nameParts[0] || '',
    lastName: nameParts.slice(1).join(' ') || '',
    phone: user.phone || '',
    avatar: user.avatar || '',
    isActive: user.isActive,
    role: user.Role ? user.Role.name : 'USER',
    roleId: user.roleId,
    isAdmin: (user.Role && user.Role.name === 'ADMIN') || user.roleId === 2,
    subscriptionStart: user.subscriptionStart || null,
    subscriptionEnd: user.subscriptionEnd || null,
    subscriptionDays: calcSubscriptionDurationDays(user.subscriptionStart, user.subscriptionEnd, user.subscriptionMonths),
    subscriptionMonths: user.subscriptionMonths || 0,
    analysisLimit: user.analysisLimit || 0,
    remainingDays: remainingDays,
    isSubscriptionActive: remainingDays > 0,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

// ============================================================
// GET /api/profile — دریافت پروفایل
// ============================================================
router.get('/', authMiddleware, async function (req, res) {
  try {
    var userId = parseUserId(req.user && (req.user.id || req.user.userId));
    if (!userId) {
      return res.status(401).json({ success: false, message: 'شناسه کاربر نامعتبر است' });
    }

    var user = await prisma.user.findUnique({
      where: { id: userId },
      select: USER_SELECT
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'کاربر یافت نشد' });
    }

    res.json({ success: true, data: formatUserResponse(user) });
  } catch (error) {
    console.error('[PROFILE] GET / error:', error.message);
    res.status(500).json({ success: false, message: 'خطا در دریافت پروفایل' });
  }
});

// ============================================================
// PUT /api/profile — به‌روزرسانی پروفایل
// ============================================================
router.put('/', authMiddleware, async function (req, res) {
  try {
    var userId = parseUserId(req.user && (req.user.id || req.user.userId));
    if (!userId) {
      return res.status(401).json({ success: false, message: 'شناسه کاربر نامعتبر است' });
    }

    var body = req.body || {};
    var updateData = {};

    if (body.name !== undefined) {
      updateData.name = String(body.name).trim();
    } else if (body.firstName !== undefined || body.lastName !== undefined) {
      updateData.name = [body.firstName, body.lastName].filter(Boolean).join(' ');
    }

    if (body.email !== undefined) {
      updateData.email = String(body.email).trim() || null;
    }

    if (body.phone !== undefined) {
      var cleanPhone = String(body.phone).replace(/\s+/g, '').trim();
      if (cleanPhone && !/^(\+98|0)?9\d{9}$/.test(cleanPhone) && !/^\d{7,15}$/.test(cleanPhone)) {
        return res.status(400).json({ success: false, message: 'شماره تلفن نامعتبر است' });
      }
      updateData.phone = cleanPhone || null;
    }

    if (body.avatar !== undefined) {
      updateData.avatar = body.avatar || null;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ success: false, message: 'هیچ داده‌ای برای به‌روزرسانی ارسال نشده' });
    }

    var updated = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: USER_SELECT
    });

    console.log('[PROFILE] User ' + userId + ' updated fields: ' + Object.keys(updateData).join(', '));
    res.json({ success: true, data: formatUserResponse(updated), message: 'پروفایل با موفقیت به‌روزرسانی شد' });
  } catch (error) {
    console.error('[PROFILE] PUT / error:', error.message);
    if (error.code === 'P2002') {
      return res.status(409).json({ success: false, message: 'ایمیل قبلاً ثبت شده است' });
    }
    res.status(500).json({ success: false, message: 'خطا در به‌روزرسانی پروفایل' });
  }
});

// ============================================================
// PUT & POST /api/profile/password — تغییر رمز عبور
// (هر دو متد PUT و POST پشتیبانی می‌شوند)
// ============================================================
async function handleChangePassword(req, res) {
  try {
    var userId = parseUserId(req.user && (req.user.id || req.user.userId));
    if (!userId) {
      return res.status(401).json({ success: false, message: 'شناسه کاربر نامعتبر است' });
    }

    var body = req.body || {};
    var currentPassword = body.currentPassword;
    var newPassword = body.newPassword;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'رمز عبور فعلی و جدید الزامی است' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'رمز عبور جدید باید حداقل ۶ کاراکتر باشد' });
    }

    var user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true }
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'کاربر یافت نشد' });
    }

    var isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ success: false, message: 'رمز عبور فعلی اشتباه است' });
    }

    var salt = await bcrypt.genSalt(12);
    var newHash = await bcrypt.hash(newPassword, salt);

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash }
    });

    console.log('[PROFILE] User ' + userId + ' changed password');
    res.json({ success: true, message: 'رمز عبور با موفقیت تغییر کرد' });
  } catch (error) {
    console.error('[PROFILE] password error:', error.message);
    res.status(500).json({ success: false, message: 'خطا در تغییر رمز عبور' });
  }
}

// پشتیبانی از هر دو متد
router.put('/password', authMiddleware, handleChangePassword);
router.post('/password', authMiddleware, handleChangePassword);

module.exports = router;
