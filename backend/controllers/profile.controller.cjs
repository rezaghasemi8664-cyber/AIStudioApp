// backend/controllers/profile.controller.cjs - Production v9.3 (Fixed)
// =====================================================================
// FIXES:
//   1. BOM removed
//   2. Uses shared Prisma instance from config/prisma.cjs
//   3. USER_SELECT includes all schema.prisma fields
//   4. Role relation uses capital R
//   5. isDeleted included in select for proper filtering
//   6. Added firstName, lastName, nationalId, mobile, bio,
//      subscriptionEnd, subscriptionType, analysisLimit24h
// =====================================================================
'use strict';

const bcrypt = require('bcryptjs');

// --- FIX: Use shared Prisma instance ---
let prisma;
try {
  prisma = require('../config/prisma.cjs');
} catch (e) {
  // Fallback: create new instance if config not available
  const { PrismaClient } = require('@prisma/client');
  prisma = new PrismaClient();
  console.warn('[PROFILE CTRL] Using local PrismaClient (shared not available)');
}

// FIX: Complete USER_SELECT with all schema.prisma fields
const USER_SELECT = {
  id: true,
  username: true,
  email: true,
  name: true,
  firstName: true,
  lastName: true,
  phone: true,
  mobile: true,
  nationalId: true,
  bio: true,
  avatar: true,
  isActive: true,
  isDeleted: true,
  roleId: true,
  subscriptionStart: true,
  subscriptionEnd: true,
  subscriptionMonths: true,
  subscriptionType: true,
  analysisLimit: true,
  analysisLimit24h: true,
  createdAt: true,
  updatedAt: true,
  // FIX: Role with capital R matching schema.prisma
  Role: { select: { id: true, name: true, title: true } },
};

function parseUserId(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return Number(s);
  return s;
}

function calcRemainingDays(subscriptionStart, subscriptionMonths, subscriptionEnd) {
  // Prefer subscriptionEnd if available
  if (subscriptionEnd) {
    var end = new Date(subscriptionEnd);
    var now = new Date();
    var diffMs = end.getTime() - now.getTime();
    var diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  }
  // Fallback: calculate from start + months
  if (!subscriptionStart || !subscriptionMonths || subscriptionMonths <= 0) return 0;
  const start = new Date(subscriptionStart);
  const end2 = new Date(start);
  end2.setMonth(end2.getMonth() + subscriptionMonths);
  const now2 = new Date();
  const diffMs2 = end2.getTime() - now2.getTime();
  const diffDays2 = Math.ceil(diffMs2 / (1000 * 60 * 60 * 24));
  return diffDays2 > 0 ? diffDays2 : 0;
}

function formatUser(user) {
  if (!user) return null;
  // FIX: support both Role (schema) and role (legacy)
  var userRole = user.Role || user.role || null;

  var firstName = user.firstName || '';
  var lastName = user.lastName || '';
  // Fallback: split name into parts if firstName not set
  if (!firstName && user.name) {
    var nameParts = (user.name || '').trim().split(/\s+/);
    firstName = nameParts[0] || '';
    lastName = nameParts.slice(1).join(' ') || lastName;
  }

  const remainingDays = calcRemainingDays(
    user.subscriptionStart,
    user.subscriptionMonths,
    user.subscriptionEnd
  );

  return {
    id: user.id,
    username: user.username,
    email: user.email || '',
    name: user.name || [firstName, lastName].filter(Boolean).join(' ') || '',
    firstName: firstName,
    lastName: lastName,
    phone: user.phone || user.mobile || '',
    mobile: user.mobile || user.phone || '',
    nationalId: user.nationalId || '',
    bio: user.bio || '',
    avatar: user.avatar || '',
    isActive: user.isActive,
    role: userRole ? userRole.name : 'USER',
    roleName: userRole ? userRole.name : 'USER',
    roleTitle: userRole ? (userRole.title || userRole.name) : 'USER',
    roleId: user.roleId,
    isAdmin: (userRole ? userRole.name === 'ADMIN' : false) || user.roleId === 2,
    subscriptionStart: user.subscriptionStart || null,
    subscriptionEnd: user.subscriptionEnd || null,
    subscriptionMonths: user.subscriptionMonths || 0,
    subscriptionType: user.subscriptionType || null,
    analysisLimit: user.analysisLimit24h || user.analysisLimit || 0,
    analysisLimit24h: user.analysisLimit24h || user.analysisLimit || 0,
    remainingDays: remainingDays,
    isSubscriptionActive: remainingDays > 0,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

// ============================================================
// GET PROFILE
// ============================================================
async function getProfile(req, res) {
  try {
    const userId = parseUserId(req.user?.id || req.user?.userId);
    if (!userId) {
      return res.status(401).json({
        success: false,
        // شناسه کاربر نامعتبر
        message: '\u0634\u0646\u0627\u0633\u0647 \u06a9\u0627\u0631\u0628\u0631 \u0646\u0627\u0645\u0639\u062a\u0628\u0631'
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: USER_SELECT,
    });

    if (!user || user.isDeleted) {
      return res.status(404).json({
        success: false,
        // کاربر یافت نشد
        message: '\u06a9\u0627\u0631\u0628\u0631 \u06cc\u0627\u0641\u062a \u0646\u0634\u062f'
      });
    }

    res.json({ success: true, data: formatUser(user) });
  } catch (error) {
    console.error('[PROFILE] getProfile error:', error.message);
    res.status(500).json({
      success: false,
      // خطا در دریافت پروفایل
      message: '\u062e\u0637\u0627 \u062f\u0631 \u062f\u0631\u06cc\u0627\u0641\u062a \u067e\u0631\u0648\u0641\u0627\u06cc\u0644'
    });
  }
}

// ============================================================
// UPDATE PROFILE
// ============================================================
async function updateProfile(req, res) {
  try {
    const userId = parseUserId(req.user?.id || req.user?.userId);
    if (!userId) {
      return res.status(401).json({
        success: false,
        // شناسه کاربر نامعتبر
        message: '\u0634\u0646\u0627\u0633\u0647 \u06a9\u0627\u0631\u0628\u0631 \u0646\u0627\u0645\u0639\u062a\u0628\u0631'
      });
    }

    const { firstName, lastName, name, email, phone, mobile, nationalId, bio, avatar } = req.body;
    const updateData = {};

    if (name !== undefined) {
      updateData.name = name.trim();
    } else if (firstName !== undefined || lastName !== undefined) {
      updateData.name = [firstName, lastName].filter(Boolean).join(' ');
    }

    if (firstName !== undefined) updateData.firstName = firstName.trim() || null;
    if (lastName !== undefined) updateData.lastName = lastName.trim() || null;
    if (email !== undefined) updateData.email = email.trim() || null;
    if (nationalId !== undefined) updateData.nationalId = nationalId.trim() || null;
    if (bio !== undefined) updateData.bio = bio.trim() || null;

    if (phone !== undefined) {
      const cleanPhone = String(phone).replace(/\s+/g, '').trim();
      if (cleanPhone && !/^(\+98|0)?9\d{9}$/.test(cleanPhone) && !/^\d{7,15}$/.test(cleanPhone)) {
        return res.status(400).json({
          success: false,
          // شماره تلفن نامعتبر است
          message: '\u0634\u0645\u0627\u0631\u0647 \u062a\u0644\u0641\u0646 \u0646\u0627\u0645\u0639\u062a\u0628\u0631 \u0627\u0633\u062a'
        });
      }
      updateData.phone = cleanPhone || null;
    }

    if (mobile !== undefined) {
      const cleanMobile = String(mobile).replace(/\s+/g, '').trim();
      if (cleanMobile && !/^(\+98|0)?9\d{9}$/.test(cleanMobile) && !/^\d{7,15}$/.test(cleanMobile)) {
        return res.status(400).json({
          success: false,
          // شماره موبایل نامعتبر است
          message: '\u0634\u0645\u0627\u0631\u0647 \u0645\u0648\u0628\u0627\u06cc\u0644 \u0646\u0627\u0645\u0639\u062a\u0628\u0631 \u0627\u0633\u062a'
        });
      }
      updateData.mobile = cleanMobile || null;
    }

    if (avatar !== undefined) updateData.avatar = avatar || null;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        // داده‌ای برای به‌روزرسانی ارسال نشده
        message: '\u062f\u0627\u062f\u0647\u200c\u0627\u06cc \u0628\u0631\u0627\u06cc \u0628\u0647\u200c\u0631\u0648\u0632\u0631\u0633\u0627\u0646\u06cc \u0627\u0631\u0633\u0627\u0644 \u0646\u0634\u062f\u0647'
      });
    }

    updateData.updatedAt = new Date();

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: USER_SELECT,
    });

    res.json({
      success: true,
      // پروفایل با موفقیت به‌روزرسانی شد
      message: '\u067e\u0631\u0648\u0641\u0627\u06cc\u0644 \u0628\u0627 \u0645\u0648\u0641\u0642\u06cc\u062a \u0628\u0647\u200c\u0631\u0648\u0632\u0631\u0633\u0627\u0646\u06cc \u0634\u062f',
      data: formatUser(updatedUser),
    });
  } catch (error) {
    console.error('[PROFILE] updateProfile error:', error.message);
    if (error.code === 'P2002') {
      return res.status(409).json({
        success: false,
        // ایمیل یا شماره تلفن تکراری است
        message: '\u0627\u06cc\u0645\u06cc\u0644 \u06cc\u0627 \u0634\u0645\u0627\u0631\u0647 \u062a\u0644\u0641\u0646 \u062a\u06a9\u0631\u0627\u0631\u06cc \u0627\u0633\u062a'
      });
    }
    res.status(500).json({
      success: false,
      // خطا در به‌روزرسانی پروفایل
      message: '\u062e\u0637\u0627 \u062f\u0631 \u0628\u0647\u200c\u0631\u0648\u0632\u0631\u0633\u0627\u0646\u06cc \u067e\u0631\u0648\u0641\u0627\u06cc\u0644'
    });
  }
}

// ============================================================
// CHANGE PASSWORD
// ============================================================
async function changePassword(req, res) {
  try {
    const userId = parseUserId(req.user?.id || req.user?.userId);
    if (!userId) {
      return res.status(401).json({
        success: false,
        // شناسه کاربر نامعتبر
        message: '\u0634\u0646\u0627\u0633\u0647 \u06a9\u0627\u0631\u0628\u0631 \u0646\u0627\u0645\u0639\u062a\u0628\u0631'
      });
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        // رمز عبور فعلی و جدید الزامی است
        message: '\u0631\u0645\u0632 \u0639\u0628\u0648\u0631 \u0641\u0639\u0644\u06cc \u0648 \u062c\u062f\u06cc\u062f \u0627\u0644\u0632\u0627\u0645\u06cc \u0627\u0633\u062a'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        // رمز عبور جدید باید حداقل ۶ کاراکتر باشد
        message: '\u0631\u0645\u0632 \u0639\u0628\u0648\u0631 \u062c\u062f\u06cc\u062f \u0628\u0627\u06cc\u062f \u062d\u062f\u0627\u0642\u0644 \u06f6 \u06a9\u0627\u0631\u0627\u06a9\u062a\u0631 \u0628\u0627\u0634\u062f'
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        // کاربر یافت نشد
        message: '\u06a9\u0627\u0631\u0628\u0631 \u06cc\u0627\u0641\u062a \u0646\u0634\u062f'
      });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        // رمز عبور فعلی اشتباه است
        message: '\u0631\u0645\u0632 \u0639\u0628\u0648\u0631 \u0641\u0639\u0644\u06cc \u0627\u0634\u062a\u0628\u0627\u0647 \u0627\u0633\u062a'
      });
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash, updatedAt: new Date() },
    });

    res.json({
      success: true,
      // رمز عبور با موفقیت تغییر کرد
      message: '\u0631\u0645\u0632 \u0639\u0628\u0648\u0631 \u0628\u0627 \u0645\u0648\u0641\u0642\u06cc\u062a \u062a\u063a\u06cc\u06cc\u0631 \u06a9\u0631\u062f'
    });
  } catch (error) {
    console.error('[PROFILE] changePassword error:', error.message);
    res.status(500).json({
      success: false,
      // خطا در تغییر رمز عبور
      message: '\u062e\u0637\u0627 \u062f\u0631 \u062a\u063a\u06cc\u06cc\u0631 \u0631\u0645\u0632 \u0639\u0628\u0648\u0631'
    });
  }
}

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
  getProfile: getProfile,
  updateProfile: updateProfile,
  changePassword: changePassword,
};
