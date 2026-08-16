// backend/controllers/auth.controller.cjs - Production v11.5 (lastLoginAt fixed + hardening)
// =====================================================================
// FIXES (v11.5):
//   1) login/register/refresh now update lastLoginAt (not just updatedAt)
//   2) USER_SELECT / USER_SELECT_PUBLIC include lastLoginAt
//   3) formatUser returns lastLoginAt
//   4) Prisma safety guard added (service unavailable if prisma missing)
//   5) minor input hardening in updateProfile
// =====================================================================
'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// --- FIX: Use shared Prisma instance (normalized export) ---
let prisma;
try {
  const prismaModule = require('../config/prisma.cjs');
  prisma = prismaModule?.prisma || prismaModule;
} catch (_) {
  try {
    const { PrismaClient } = require('@prisma/client');
    prisma = new PrismaClient();
    console.warn('[AUTH_CTRL] Using local PrismaClient (shared not available)');
  } catch (_2) {
    console.error('[AUTH_CTRL] FATAL: Prisma not available!');
  }
}

// --- Load env ---
let env = {};
try {
  env = require('../config/env.cjs');
} catch (_) {
  console.warn('[AUTH_CTRL] env.cjs not found, using process.env');
}

// --- Load messages (optional) ---
let MESSAGES = null;
try {
  MESSAGES = require('../constants/messages.cjs');
} catch (_) {
  console.warn('[AUTH_CTRL] messages.cjs not found, using inline messages');
}

// ============================================================
// HELPERS
// ============================================================

function ensurePrisma(res) {
  if (prisma && typeof prisma === 'object') return true;
  res.status(503).json({
    success: false,
    message: 'سرویس پایگاه‌داده در دسترس نیست',
  });
  return false;
}

function getSecret(type) {
  if (type === 'access') {
    return (env && env.JWT_ACCESS_SECRET)
      || process.env.JWT_ACCESS_SECRET
      || (env && env.JWT_SECRET)
      || process.env.JWT_SECRET
      || 'fallback-access-secret';
  }
  if (type === 'refresh') {
    return (env && env.JWT_REFRESH_SECRET)
      || process.env.JWT_REFRESH_SECRET
      || (env && env.JWT_SECRET)
      || process.env.JWT_SECRET
      || 'fallback-refresh-secret';
  }
  return process.env.JWT_SECRET || 'fallback-secret';
}

function getExpiry(type) {
  if (type === 'access') {
    return (env && env.JWT_ACCESS_EXPIRY)
      || process.env.JWT_ACCESS_EXPIRY
      || '24h';
  }
  if (type === 'refresh') {
    return (env && env.JWT_REFRESH_EXPIRY)
      || process.env.JWT_REFRESH_EXPIRY
      || '7d';
  }
  return '24h';
}

function msg(path, fallback) {
  if (!MESSAGES) return fallback;
  try {
    const parts = path.split('.');
    let obj = MESSAGES;
    for (const p of parts) {
      obj = obj[p];
      if (obj === undefined) return fallback;
    }
    return obj || fallback;
  } catch (_) {
    return fallback;
  }
}

// request-aware cookie policy
function getCookieBaseOptions(req) {
  const host = String(req?.headers?.host || '').toLowerCase();

  const isLocalHost =
    host.includes('localhost') ||
    host.startsWith('127.0.0.1') ||
    host.startsWith('0.0.0.0');

  const isHttps =
    req?.secure === true ||
    String(req?.headers?.['x-forwarded-proto'] || '').toLowerCase() === 'https';

  // secure only when non-local AND https
  const secure = !isLocalHost && isHttps;

  return {
    httpOnly: true,
    secure,
    sameSite: secure ? 'none' : 'lax',
    path: '/',
  };
}

function setAuthCookies(req, res, accessToken, refreshToken) {
  const base = getCookieBaseOptions(req);

  res.cookie('accessToken', accessToken, {
    ...base,
    maxAge: 24 * 60 * 60 * 1000,
  });

  // backward compatibility
  res.cookie('token', accessToken, {
    ...base,
    maxAge: 24 * 60 * 60 * 1000,
  });

  res.cookie('refreshToken', refreshToken, {
    ...base,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function clearAuthCookies(req, res) {
  const base = getCookieBaseOptions(req);
  res.clearCookie('accessToken', base);
  res.clearCookie('token', base);
  res.clearCookie('refreshToken', base);
}

// Complete USER_SELECT with schema fields used by controller
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
  passwordHash: true,
  subscriptionStart: true,
  subscriptionEnd: true,
  subscriptionMonths: true,
  subscriptionType: true,
  analysisLimit: true,
  analysisLimit24h: true,
  lastLoginAt: true, // FIX
  createdAt: true,
  updatedAt: true,
  Role: { select: { id: true, name: true, title: true } },
};

const USER_SELECT_PUBLIC = {
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
  roleId: true,
  subscriptionStart: true,
  subscriptionEnd: true,
  subscriptionMonths: true,
  subscriptionType: true,
  analysisLimit: true,
  analysisLimit24h: true,
  lastLoginAt: true, // FIX
  createdAt: true,
  updatedAt: true,
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
  if (subscriptionEnd) {
    const end = new Date(subscriptionEnd);
    const now = new Date();
    const diffMs = end.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  }
  if (!subscriptionStart || !subscriptionMonths || subscriptionMonths <= 0) return 0;
  const start = new Date(subscriptionStart);
  const end = new Date(start);
  end.setMonth(end.getMonth() + subscriptionMonths);
  const now = new Date();
  const diffMs = end.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
}

function formatUser(user) {
  if (!user) return null;

  const userRole = user.Role || user.role || null;

  const firstName = user.firstName || '';
  const lastName = user.lastName || '';
  let fName = firstName;
  let lName = lastName;
  if (!fName && user.name) {
    const nameParts = (user.name || '').trim().split(/\s+/);
    fName = nameParts[0] || '';
    lName = nameParts.slice(1).join(' ') || lName;
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
    name: user.name || [fName, lName].filter(Boolean).join(' ') || '',
    firstName: fName,
    lastName: lName,
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
    remainingDays,
    isSubscriptionActive: remainingDays > 0,
    lastLoginAt: user.lastLoginAt || null, // FIX
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function generateTokens(user) {
  const userRole = user.Role || user.role || null;
  const payload = {
    userId: user.id,
    sub: user.id,
    username: user.username,
    email: user.email || null,
    role: userRole ? userRole.name : 'USER',
    isAdmin: (userRole ? userRole.name === 'ADMIN' : false) || user.roleId === 2,
  };

  const accessToken = jwt.sign(payload, getSecret('access'), {
    expiresIn: getExpiry('access'),
  });

  const refreshToken = jwt.sign(
    { userId: user.id, sub: user.id, type: 'refresh' },
    getSecret('refresh'),
    { expiresIn: getExpiry('refresh') }
  );

  return { accessToken, refreshToken };
}

function extractToken(req) {
  const authHeader = req.headers.authorization || req.headers['Authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    if (token && token !== 'null' && token !== 'undefined') return token;
  }

  if (req.body && (req.body.token || req.body.accessToken || req.body.refreshToken)) {
    return req.body.token || req.body.accessToken || req.body.refreshToken;
  }

  if (req.query && (req.query.token || req.query.accessToken || req.query.refreshToken)) {
    return req.query.token || req.query.accessToken || req.query.refreshToken;
  }

  if (req.cookies) {
    return (
      req.cookies.token ||
      req.cookies.accessToken ||
      req.cookies.access_token ||
      req.cookies.refreshToken ||
      null
    );
  }

  return null;
}

// ============================================================
// 1. LOGIN
// ============================================================
async function login(req, res) {
  try {
    if (!ensurePrisma(res)) return;

    const { username, password, email } = req.body || {};
    const loginIdentifier = (username || email || '').trim();

    if (!loginIdentifier || !password) {
      return res.status(400).json({
        success: false,
        message: msg('AUTH.REQUIRED_FIELDS', 'نام کاربری و رمز عبور الزامی است'),
      });
    }

    let user = null;
    try {
      user = await prisma.user.findFirst({
        where: {
          OR: [{ username: loginIdentifier }, { email: loginIdentifier }],
          isDeleted: false,
        },
        select: USER_SELECT,
      });
    } catch (dbErr) {
      user = await prisma.user.findFirst({
        where: { OR: [{ username: loginIdentifier }, { email: loginIdentifier }] },
        select: USER_SELECT,
      });
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: msg('AUTH.INVALID_CREDENTIALS', 'نام کاربری یا رمز عبور اشتباه است'),
      });
    }

    if (user.isActive === false) {
      return res.status(403).json({
        success: false,
        message: msg('AUTH.ACCOUNT_DISABLED', 'حساب کاربری غیرفعال است'),
      });
    }

    if (!user.passwordHash) {
      return res.status(500).json({
        success: false,
        message: msg('GENERAL.SERVER_ERROR', 'خطای داخلی سرور'),
      });
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: msg('AUTH.INVALID_CREDENTIALS', 'نام کاربری یا رمز عبور اشتباه است'),
      });
    }

    const tokens = generateTokens(user);
    setAuthCookies(req, res, tokens.accessToken, tokens.refreshToken);

    // FIX: update lastLoginAt (and updatedAt for audit consistency)
    prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), updatedAt: new Date() },
    }).catch(e => console.warn('[AUTH] Failed to update lastLoginAt:', e.message));

    // keep response coherent even before async update completes
    const responseUser = { ...user, lastLoginAt: new Date() };

    return res.json({
      success: true,
      message: msg('AUTH.LOGIN_SUCCESS', 'ورود موفق'),
      data: {
        user: formatUser(responseUser),
        token: tokens.accessToken,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      },
    });
  } catch (error) {
    console.error('[AUTH] Login error:', error);
    return res.status(500).json({
      success: false,
      message: msg('GENERAL.SERVER_ERROR', 'خطای سرور'),
    });
  }
}

// ============================================================
// 2. REGISTER
// ============================================================
async function register(req, res) {
  try {
    if (!ensurePrisma(res)) return;

    const rawUsername = req.body?.username;
    const rawPassword = req.body?.password;
    const rawEmail = req.body?.email;
    const rawName = req.body?.name;
    const rawPhone = req.body?.phone;

    const username = typeof rawUsername === 'string' ? rawUsername.trim() : '';
    const password = typeof rawPassword === 'string' ? rawPassword : '';
    const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : null;
    const name = typeof rawName === 'string' ? rawName.trim() : '';
    const phone = typeof rawPhone === 'string' ? rawPhone.trim() : null;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: msg('AUTH.REQUIRED_FIELDS', 'نام کاربری و رمز عبور الزامی است'),
      });
    }

    if (username.length < 3) {
      return res.status(400).json({
        success: false,
        message: msg('AUTH.USERNAME_SHORT', 'نام کاربری باید حداقل ۳ کاراکتر باشد'),
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: msg('AUTH.PASSWORD_WEAK', 'رمز عبور باید حداقل ۶ کاراکتر باشد'),
      });
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ username }, ...(email ? [{ email }] : [])],
      },
      select: {
        id: true,
        username: true,
        email: true,
        isDeleted: true,
        isActive: true,
      },
    });

    if (existingUser && !existingUser.isDeleted && existingUser.isActive) {
      if (existingUser.username === username) {
        return res.status(409).json({
          success: false,
          message: msg('AUTH.USERNAME_EXISTS', 'نام کاربری تکراری است'),
        });
      }
      if (email && existingUser.email === email) {
        return res.status(409).json({
          success: false,
          message: msg('USER.EMAIL_EXISTS', 'ایمیل تکراری است'),
        });
      }
      return res.status(409).json({
        success: false,
        message: msg('AUTH.USERNAME_EXISTS', 'نام کاربری یا ایمیل تکراری است'),
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    let defaultRoleId = 1;
    try {
      const userRole = await prisma.role.findFirst({ where: { name: 'USER' } });
      if (userRole) defaultRoleId = userRole.id;
    } catch (_) {}

    if (existingUser && (existingUser.isDeleted || !existingUser.isActive)) {
      const activeConflict = await prisma.user.findFirst({
        where: {
          id: { not: existingUser.id },
          isDeleted: false,
          isActive: true,
          OR: [{ username }, ...(email ? [{ email }] : [])],
        },
        select: { id: true, username: true, email: true },
      });

      if (activeConflict) {
        if (activeConflict.username === username) {
          return res.status(409).json({
            success: false,
            message: msg('AUTH.USERNAME_EXISTS', 'نام کاربری تکراری است'),
          });
        }
        if (email && activeConflict.email === email) {
          return res.status(409).json({
            success: false,
            message: msg('USER.EMAIL_EXISTS', 'ایمیل تکراری است'),
          });
        }
        return res.status(409).json({
          success: false,
          message: msg('AUTH.USERNAME_EXISTS', 'نام کاربری یا ایمیل تکراری است'),
        });
      }

      const restoredUser = await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          username,
          passwordHash,
          email,
          name: name || username,
          phone,
          mobile: null,
          isDeleted: false,
          isActive: true,
          roleId: defaultRoleId,
          lastLoginAt: new Date(), // FIX
          updatedAt: new Date(),
        },
        select: USER_SELECT,
      });

      const tokens = generateTokens(restoredUser);
      setAuthCookies(req, res, tokens.accessToken, tokens.refreshToken);

      return res.status(200).json({
        success: true,
        message: msg('USER.RESTORED', 'کاربر حذف‌شده/غیرفعال با موفقیت بازیابی شد'),
        data: {
          user: formatUser(restoredUser),
          restored: true,
          token: tokens.accessToken,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
        },
      });
    }

    const newUser = await prisma.user.create({
      data: {
        username,
        passwordHash,
        email,
        name: (name || username).trim(),
        firstName: null,
        lastName: null,
        phone,
        mobile: null,
        roleId: defaultRoleId,
        isActive: true,
        lastLoginAt: new Date(), // FIX: first successful auth timestamp
      },
      select: USER_SELECT,
    });

    const tokens = generateTokens(newUser);
    setAuthCookies(req, res, tokens.accessToken, tokens.refreshToken);

    return res.status(201).json({
      success: true,
      message: msg('AUTH.REGISTER_SUCCESS', 'ثبت‌نام موفق'),
      data: {
        user: formatUser(newUser),
        restored: false,
        token: tokens.accessToken,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      },
    });
  } catch (error) {
    console.error('[AUTH] Register error:', error);
    if (error.code === 'P2002') {
      return res.status(409).json({
        success: false,
        message: msg('AUTH.USERNAME_EXISTS', 'نام کاربری یا ایمیل تکراری است'),
      });
    }
    return res.status(500).json({
      success: false,
      message: msg('GENERAL.SERVER_ERROR', 'خطای سرور'),
    });
  }
}

// ============================================================
// 3. VERIFY TOKEN
// ============================================================
async function verify(req, res) {
  try {
    if (!ensurePrisma(res)) return;

    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({
        success: false,
        valid: false,
        message: msg('AUTH.TOKEN_MISSING', 'توکن ارائه نشده'),
      });
    }

    const decoded = jwt.verify(token, getSecret('access'));
    const userId = parseUserId(decoded.userId || decoded.sub || decoded.id);

    if (!userId) {
      return res.status(401).json({
        success: false,
        valid: false,
        message: 'توکن نامعتبر',
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: USER_SELECT_PUBLIC,
    });

    if (!user || user.isActive === false) {
      return res.status(401).json({
        success: false,
        valid: false,
        message: 'کاربر یافت نشد یا غیرفعال است',
      });
    }

    return res.json({
      success: true,
      valid: true,
      data: { user: formatUser(user) },
    });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        valid: false,
        expired: true,
        message: 'توکن منقضی شده',
      });
    }
    return res.status(401).json({
      success: false,
      valid: false,
      message: 'توکن نامعتبر',
    });
  }
}

// ============================================================
// 4. REFRESH TOKEN
// ============================================================
async function refreshToken(req, res) {
  try {
    if (!ensurePrisma(res)) return;

    const token =
      req.body?.refreshToken ||
      req.cookies?.refreshToken ||
      req.body?.token ||
      extractToken(req);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'توکن ارائه نشده',
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, getSecret('refresh'));
    } catch (_) {
      decoded = jwt.verify(token, getSecret('access'));
    }

    const userId = parseUserId(decoded.userId || decoded.sub || decoded.id);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'توکن نامعتبر',
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: USER_SELECT,
    });

    if (!user || user.isActive === false) {
      return res.status(401).json({
        success: false,
        message: 'کاربر یافت نشد',
      });
    }

    const tokens = generateTokens(user);
    setAuthCookies(req, res, tokens.accessToken, tokens.refreshToken);

    // FIX: refresh is a successful auth event => update lastLoginAt
    prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), updatedAt: new Date() },
    }).catch(e => console.warn('[AUTH] Failed to update lastLoginAt on refresh:', e.message));

    const responseUser = { ...user, lastLoginAt: new Date() };

    return res.json({
      success: true,
      message: 'توکن به‌روزرسانی شد',
      data: {
        user: formatUser(responseUser),
        token: tokens.accessToken,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      },
    });
  } catch (error) {
    console.error('[AUTH] refreshToken error:', error.message);
    return res.status(401).json({
      success: false,
      message: 'توکن نامعتبر یا منقضی',
    });
  }
}

// ============================================================
// 5. LOGOUT
// ============================================================
async function logout(req, res) {
  clearAuthCookies(req, res);
  return res.json({
    success: true,
    message: msg('AUTH.LOGOUT_SUCCESS', 'خروج موفق'),
  });
}

// ============================================================
// 6. ME
// ============================================================
async function me(req, res) {
  try {
    if (!ensurePrisma(res)) return;

    const userId = parseUserId(req.user?.userId || req.user?.id || req.user?.sub);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'شناسه کاربر نامعتبر',
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: USER_SELECT_PUBLIC,
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'کاربر یافت نشد',
      });
    }

    return res.json({
      success: true,
      data: { user: formatUser(user) },
    });
  } catch (error) {
    console.error('[AUTH] me error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'خطای سرور',
    });
  }
}

// ============================================================
// 7. UPDATE PROFILE
// ============================================================
async function updateProfile(req, res) {
  try {
    if (!ensurePrisma(res)) return;

    const userId = parseUserId(req.user?.userId || req.user?.id || req.user?.sub);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'شناسه کاربر نامعتبر',
      });
    }

    const { name, firstName, lastName, email, phone, mobile, nationalId, bio, avatar } = req.body || {};
    const updateData = {};

    if (name !== undefined) {
      updateData.name = typeof name === 'string' ? name.trim() : '';
    } else if (firstName !== undefined || lastName !== undefined) {
      const fn = typeof firstName === 'string' ? firstName.trim() : '';
      const ln = typeof lastName === 'string' ? lastName.trim() : '';
      updateData.name = [fn, ln].filter(Boolean).join(' ');
    }

    if (firstName !== undefined) updateData.firstName = (typeof firstName === 'string' ? firstName.trim() : '') || null;
    if (lastName !== undefined) updateData.lastName = (typeof lastName === 'string' ? lastName.trim() : '') || null;
    if (email !== undefined) updateData.email = (typeof email === 'string' ? email.trim() : '') || null;
    if (phone !== undefined) updateData.phone = (typeof phone === 'string' ? phone.trim() : '') || null;
    if (mobile !== undefined) updateData.mobile = (typeof mobile === 'string' ? mobile.trim() : '') || null;
    if (nationalId !== undefined) updateData.nationalId = (typeof nationalId === 'string' ? nationalId.trim() : '') || null;
    if (bio !== undefined) updateData.bio = (typeof bio === 'string' ? bio.trim() : '') || null;
    if (avatar !== undefined) updateData.avatar = avatar || null;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'داده‌ای برای به‌روزرسانی ارسال نشده',
      });
    }

    updateData.updatedAt = new Date();

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: USER_SELECT_PUBLIC,
    });

    return res.json({
      success: true,
      message: 'پروفایل به‌روزرسانی شد',
      data: { user: formatUser(updatedUser) },
    });
  } catch (error) {
    console.error('[AUTH] updateProfile error:', error.message);
    if (error.code === 'P2002') {
      return res.status(409).json({
        success: false,
        message: 'ایمیل یا شماره تلفن تکراری است',
      });
    }
    return res.status(500).json({
      success: false,
      message: 'خطا در به‌روزرسانی پروفایل',
    });
  }
}

// ============================================================
// 8. CHANGE PASSWORD
// ============================================================
async function changePassword(req, res) {
  try {
    if (!ensurePrisma(res)) return;

    const userId = parseUserId(req.user?.userId || req.user?.id || req.user?.sub);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'شناسه کاربر نامعتبر',
      });
    }

    const { currentPassword, newPassword } = req.body || {};

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'رمز عبور فعلی و جدید الزامی است',
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'رمز عبور جدید باید حداقل ۶ کاراکتر باشد',
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'کاربر یافت نشد',
      });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'رمز عبور فعلی اشتباه است',
      });
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash, updatedAt: new Date() },
    });

    return res.json({
      success: true,
      message: 'رمز عبور با موفقیت تغییر کرد',
    });
  } catch (error) {
    console.error('[AUTH] changePassword error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'خطا در تغییر رمز عبور',
    });
  }
}

// ============================================================
// 9. GET SUBSCRIPTION
// ============================================================
async function getSubscription(req, res) {
  try {
    if (!ensurePrisma(res)) return;

    const userId = parseUserId(req.user?.userId || req.user?.id || req.user?.sub);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'شناسه کاربر نامعتبر',
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        subscriptionStart: true,
        subscriptionEnd: true,
        subscriptionMonths: true,
        subscriptionType: true,
        analysisLimit: true,
        analysisLimit24h: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'کاربر یافت نشد',
      });
    }

    const remainingDays = calcRemainingDays(
      user.subscriptionStart,
      user.subscriptionMonths,
      user.subscriptionEnd
    );

    return res.json({
      success: true,
      data: {
        subscriptionStart: user.subscriptionStart || null,
        subscriptionEnd: user.subscriptionEnd || null,
        subscriptionMonths: user.subscriptionMonths || 0,
        subscriptionType: user.subscriptionType || null,
        analysisLimit: user.analysisLimit24h || user.analysisLimit || 0,
        analysisLimit24h: user.analysisLimit24h || user.analysisLimit || 0,
        remainingDays,
        isActive: remainingDays > 0,
      },
    });
  } catch (error) {
    console.error('[AUTH] getSubscription error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'خطا در دریافت اطلاعات اشتراک',
    });
  }
}

// ============================================================
// 10. RECOVER PASSWORD
// ============================================================
async function recoverPassword(req, res) {
  try {
    if (!ensurePrisma(res)) return;

    const { email, username } = req.body || {};
    const identifier = (email || username || '').trim();

    if (!identifier) {
      return res.status(400).json({
        success: false,
        message: msg('AUTH.EMAIL_REQUIRED', 'ایمیل یا نام کاربری الزامی است'),
      });
    }

    let user = null;
    try {
      user = await prisma.user.findFirst({
        where: { OR: [{ email: identifier }, { username: identifier }] },
        select: { id: true, email: true, username: true },
      });
    } catch (dbErr) {
      console.warn('[AUTH] recoverPassword lookup error:', dbErr.message);
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000);

    if (user) {
      try {
        await prisma.user.update({
          where: { id: user.id },
          data: { resetToken, resetTokenExpiry },
        });
      } catch (updateErr) {
        console.warn('[AUTH] Could not store resetToken (columns may not exist):', updateErr.message);
      }
    }

    return res.json({
      success: true,
      message: msg('AUTH.RECOVER_SENT', 'در صورت وجود حساب، دستورالعمل بازیابی رمز عبور ارسال شد'),
      data: {
        sent: true,
        ...(process.env.NODE_ENV !== 'production' && user ? { resetToken } : {}),
      },
    });
  } catch (error) {
    console.error('[AUTH] recoverPassword error:', error);
    return res.status(500).json({
      success: false,
      message: msg('GENERAL.SERVER_ERROR', 'خطای سرور'),
    });
  }
}

// ============================================================
// 11. RESET PASSWORD
// ============================================================
async function resetPassword(req, res) {
  try {
    if (!ensurePrisma(res)) return;

    const { token, resetToken: bodyResetToken, newPassword } = req.body || {};
    const actualToken = (token || bodyResetToken || '').trim();

    if (!actualToken || !newPassword) {
      return res.status(400).json({
        success: false,
        message: msg('AUTH.RESET_REQUIRED', 'توکن و رمز عبور جدید الزامی است'),
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: msg('AUTH.PASSWORD_WEAK', 'رمز عبور باید حداقل ۶ کاراکتر باشد'),
      });
    }

    let user = null;
    try {
      user = await prisma.user.findFirst({
        where: {
          resetToken: actualToken,
          resetTokenExpiry: { gte: new Date() },
        },
        select: { id: true, username: true },
      });
    } catch (dbErr) {
      console.warn('[AUTH] resetPassword lookup error (columns may not exist):', dbErr.message);
      return res.status(400).json({
        success: false,
        message: msg('AUTH.RESET_INVALID', 'توکن نامعتبر یا منقضی شده'),
      });
    }

    if (!user) {
      return res.status(400).json({
        success: false,
        message: msg('AUTH.RESET_INVALID', 'توکن نامعتبر یا منقضی شده'),
      });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        resetToken: null,
        resetTokenExpiry: null,
        updatedAt: new Date(),
      },
    });

    return res.json({
      success: true,
      message: msg('AUTH.RESET_SUCCESS', 'رمز عبور با موفقیت بازیابی شد'),
    });
  } catch (error) {
    console.error('[AUTH] resetPassword error:', error);
    return res.status(500).json({
      success: false,
      message: msg('GENERAL.SERVER_ERROR', 'خطای سرور'),
    });
  }
}

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
  login,
  register,
  verify,
  refreshToken,
  logout,
  me,
  updateProfile,
  changePassword,
  getSubscription,
  recoverPassword,
  resetPassword,

  // aliases
  refresh: refreshToken,
  getMe: me,
  getProfile: me,
};

console.log('[AUTH_CTRL] Exported methods:', Object.keys(module.exports));
