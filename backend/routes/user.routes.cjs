// backend/routes/user.routes.cjs
// User Management Routes - Production v3.2
// Synced with schema.prisma
'use strict';

var express = require('express');
var router = express.Router();

// ---- Prisma singleton (NO new PrismaClient in normal path) ----
var prisma;
try {
  prisma = require('../config/prisma.cjs');
} catch (e) {
  console.warn('[USER-ROUTES] config/prisma.cjs not found, trying direct');
  try {
    var PrismaClient = require('@prisma/client').PrismaClient;
    prisma = new PrismaClient();
    console.warn('[USER-ROUTES] WARNING: Using standalone PrismaClient instance');
  } catch (e2) {
    console.error('[USER-ROUTES] Prisma not available:', e2.message);
    prisma = null;
  }
}

// ---- Auth middleware (safe search) ----
var authMiddleware;
try {
  authMiddleware = require('../middlewares/auth.middleware.cjs');
} catch (e1) {
  try {
    authMiddleware = require('../middleware/auth.middleware.cjs');
  } catch (e2) {
    try {
      authMiddleware = require('../middleware/auth.cjs');
    } catch (e3) {
      console.warn('[USER-ROUTES] No auth middleware found, using passthrough');
      authMiddleware = function (req, res, next) { next(); };
    }
  }
}

// Unwrap authenticate if needed
if (authMiddleware && typeof authMiddleware.authenticate === 'function') {
  authMiddleware = authMiddleware.authenticate;
} else if (authMiddleware && typeof authMiddleware !== 'function') {
  console.warn('[USER-ROUTES] authMiddleware is not a function, using passthrough');
  authMiddleware = function (req, res, next) { next(); };
}

// ---- Users controller (optional delegation) ----
var usersController;
try {
  usersController = require('../controllers/users.controller.cjs');
} catch (e) {
  console.warn('[USER-ROUTES] users.controller.cjs not found, using inline handlers');
  usersController = null;
}

// ---- UserFormatter (optional) ----
var userFormatter;
try {
  userFormatter = require('../utils/userFormatter.cjs');
} catch (e) {
  console.warn('[USER-ROUTES] userFormatter.cjs not found');
  userFormatter = null;
}

// =============================================================================
// HELPERS
// =============================================================================

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function toIntOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  var n = parseInt(value, 10);
  return isNaN(n) ? null : n;
}

function toNumberOrDefault(value, defaultValue) {
  if (value === null || value === undefined || value === '') return defaultValue;
  var n = Number(value);
  return isNaN(n) ? defaultValue : n;
}

function toDateOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  var d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d;
}

function safeContains(value) {
  return {
    contains: value,
    mode: 'insensitive',
  };
}

function normalizeScalping(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch (e) {
    return null;
  }
}

/**
 * Full user SELECT - fields aligned with schema
 */
function getUserSelect() {
  return {
    id: true,
    username: true,
    email: true,
    name: true,
    firstName: true,
    lastName: true,
    phone: true,
    mobile: true,
    nationalId: true,
    avatar: true,
    bio: true,
    isActive: true,
    isDeleted: true,
    scalping: true,
    subscriptionStart: true,
    subscriptionEnd: true,
    subscriptionMonths: true,
    subscriptionType: true,
    analysisLimit: true,
    analysisLimit24h: true,
    analysisUsed24h: true,
    lastAnalysisReset: true,
    lastLoginAt: true,
    loginCount: true,
    roleId: true,
    createdAt: true,
    updatedAt: true,
    Role: {
      select: {
        id: true,
        name: true,
        title: true,
      },
    },
  };
}

/**
 * Format user for API response
 */
function formatUserResponse(u) {
  if (!u) return null;

  if (userFormatter && typeof userFormatter.formatUser === 'function') {
    return userFormatter.formatUser(u, { isAdmin: true });
  }

  var role = u.Role || u.role || null;
  var fullName = u.name;
  if (!fullName) {
    fullName = ((u.firstName || '') + ' ' + (u.lastName || '')).trim();
  }
  if (!fullName) {
    fullName = u.username || '';
  }

  var analysisLimitValue = u.analysisLimit24h;
  if (analysisLimitValue === null || analysisLimitValue === undefined) {
    analysisLimitValue = u.analysisLimit;
  }
  if (analysisLimitValue === null || analysisLimitValue === undefined) {
    analysisLimitValue = 5;
  }

  return {
    id: u.id,
    username: u.username,
    email: u.email ?? null,
    name: fullName,
    firstName: u.firstName ?? null,
    lastName: u.lastName ?? null,
    phone: u.phone ?? null,
    mobile: u.mobile ?? null,
    nationalId: u.nationalId ?? null,
    avatar: u.avatar ?? null,
    bio: u.bio ?? null,
    isActive: u.isActive !== false,
    isDeleted: !!u.isDeleted,
    scalping: u.scalping ?? null,
    subscriptionStart: u.subscriptionStart ?? null,
    subscriptionEnd: u.subscriptionEnd ?? null,
    subscriptionMonths: u.subscriptionMonths ?? 0,
    subscriptionType: u.subscriptionType ?? 'free',
    analysisLimit: analysisLimitValue,
    analysisLimit24h: analysisLimitValue,
    analysisUsed24h: u.analysisUsed24h ?? 0,
    lastAnalysisReset: u.lastAnalysisReset ?? null,
    lastLoginAt: u.lastLoginAt ?? null,
    loginCount: u.loginCount ?? 0,
    roleId: u.roleId ?? null,
    roleName: role ? (role.title || role.name || 'unknown') : 'unknown',
    role: role,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

async function hashPassword(rawPassword) {
  var bcrypt;
  try {
    bcrypt = require('bcrypt');
    return await bcrypt.hash(rawPassword, 10);
  } catch (e1) {
    try {
      bcrypt = require('bcryptjs');
      return await bcrypt.hash(rawPassword, 10);
    } catch (e2) {
      console.warn('[USER-ROUTES] No bcrypt/bcryptjs available for hashing');
      return null;
    }
  }
}

function buildDuplicateOrConditions(body, excludeId) {
  var conditions = [];

  if (body.username) {
    conditions.push({ username: body.username });
  }
  if (body.email) {
    conditions.push({ email: body.email });
  }
  if (body.phone) {
    conditions.push({ phone: body.phone });
  }
  if (body.mobile) {
    conditions.push({ mobile: body.mobile });
  }
  if (body.nationalId) {
    conditions.push({ nationalId: body.nationalId });
  }

  if (!conditions.length) return null;

  var where = { OR: conditions };

  if (excludeId) {
    where.NOT = { id: excludeId };
  }

  return where;
}

async function findDuplicateUser(body, excludeId) {
  var where = buildDuplicateOrConditions(body, excludeId);
  if (!where) return null;
  return prisma.user.findFirst({
    where: where,
    select: {
      id: true,
      username: true,
      email: true,
      phone: true,
      mobile: true,
      nationalId: true,
    },
  });
}

function buildSearchWhere(search, isActive) {
  var where = { isDeleted: false };

  if (search) {
    where.OR = [
      { username: safeContains(search) },
      { name: safeContains(search) },
      { email: safeContains(search) },
      { firstName: safeContains(search) },
      { lastName: safeContains(search) },
      { mobile: safeContains(search) },
      { nationalId: safeContains(search) },
      { phone: safeContains(search) },
    ];
  }

  if (isActive !== undefined && isActive !== '') {
    where.isActive = String(isActive) === 'true';
  }

  return where;
}

// =============================================================================
// SHARED UPDATE HANDLER
// =============================================================================
async function updateUserHandler(req, res) {
  try {
    if (!prisma) {
      return res.status(503).json({
        success: false,
        message: 'Database not available',
      });
    }

    var userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) {
      return res.status(400).json({
        success: false,
        message: 'شناسه نامعتبر',
      });
    }

    var body = req.body || {};

    var existingUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        isActive: true,
        isDeleted: true,
        roleId: true,
      },
    });

    if (!existingUser || existingUser.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'کاربر یافت نشد',
      });
    }

    var duplicate = await findDuplicateUser(body, userId);
    if (duplicate) {
      return res.status(409).json({
        success: false,
        message: 'اطلاعات وارد شده قبلاً برای کاربر دیگری ثبت شده است',
      });
    }

    var updateData = {};
    var allowedFields = [
      'name',
      'firstName',
      'lastName',
      'email',
      'phone',
      'mobile',
      'nationalId',
      'avatar',
      'bio',
      'isActive',
      'roleId',
      'subscriptionType',
      'subscriptionMonths',
      'analysisLimit',
      'analysisLimit24h',
      'scalping',
    ];

    allowedFields.forEach(function (field) {
      if (!hasOwn(body, field)) return;

      if (field === 'scalping') {
        updateData.scalping = normalizeScalping(body.scalping);
        return;
      }

      if (field === 'subscriptionMonths') {
        updateData.subscriptionMonths = toNumberOrDefault(body.subscriptionMonths, 0);
        return;
      }

      if (field === 'analysisLimit') {
        updateData.analysisLimit = toNumberOrDefault(body.analysisLimit, 5);
        return;
      }

      if (field === 'analysisLimit24h') {
        updateData.analysisLimit24h = toNumberOrDefault(body.analysisLimit24h, 5);
        return;
      }

      if (field === 'roleId') {
        var roleId = toIntOrNull(body.roleId);
        updateData.roleId = roleId;
        return;
      }

      updateData[field] = body[field];
    });

    if (hasOwn(body, 'subscriptionStart')) {
      if (body.subscriptionStart === null || body.subscriptionStart === '') {
        updateData.subscriptionStart = null;
      } else {
        var subscriptionStart = toDateOrNull(body.subscriptionStart);
        if (!subscriptionStart) {
          return res.status(400).json({
            success: false,
            message: 'subscriptionStart نامعتبر است',
          });
        }
        updateData.subscriptionStart = subscriptionStart;
      }
    }

    if (hasOwn(body, 'subscriptionEnd')) {
      if (body.subscriptionEnd === null || body.subscriptionEnd === '') {
        updateData.subscriptionEnd = null;
      } else {
        var subscriptionEnd = toDateOrNull(body.subscriptionEnd);
        if (!subscriptionEnd) {
          return res.status(400).json({
            success: false,
            message: 'subscriptionEnd نامعتبر است',
          });
        }
        updateData.subscriptionEnd = subscriptionEnd;
      }
    }

    if (
      updateData.subscriptionStart &&
      updateData.subscriptionEnd &&
      updateData.subscriptionEnd < updateData.subscriptionStart
    ) {
      return res.status(400).json({
        success: false,
        message: 'subscriptionEnd نمی‌تواند قبل از subscriptionStart باشد',
      });
    }

    // Prevent self-deactivation
    if (
      hasOwn(updateData, 'isActive') &&
      updateData.isActive === false &&
      req.user &&
      (req.user.userId === userId || req.user.id === userId)
    ) {
      return res.status(400).json({
        success: false,
        message: 'نمی‌توانید حساب خود را غیرفعال کنید',
      });
    }

    // Prevent self-role-change
    if (
      hasOwn(updateData, 'roleId') &&
      req.user &&
      (req.user.userId === userId || req.user.id === userId)
    ) {
      return res.status(400).json({
        success: false,
        message: 'نمی‌توانید نقش حساب خود را از این مسیر تغییر دهید',
      });
    }

    if (body.password) {
      var hashedPassword = await hashPassword(body.password);
      if (!hashedPassword) {
        return res.status(500).json({
          success: false,
          message: 'امکان هش کردن رمز عبور وجود ندارد',
        });
      }
      updateData.passwordHash = hashedPassword;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'هیچ فیلدی برای به‌روزرسانی ارسال نشده',
      });
    }

    var updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: getUserSelect(),
    });

    return res.json({
      success: true,
      message: 'کاربر به‌روزرسانی شد',
      data: formatUserResponse(updatedUser),
    });
  } catch (error) {
    console.error('[USER-ROUTES PUT/PATCH /:id] Error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'خطای سرور',
    });
  }
}

// =============================================================================
// GET /api/users
// =============================================================================
router.get('/', authMiddleware, async function (req, res) {
  try {
    if (!prisma) {
      return res.status(503).json({
        success: false,
        message: 'Database not available',
      });
    }

    var page = parseInt(req.query.page, 10) || 1;
    var limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    var search = String(req.query.search || '').trim();
    var isActive = req.query.isActive;
    var skip = (page - 1) * limit;

    var where = buildSearchWhere(search, isActive);

    var results = await Promise.all([
      prisma.user.findMany({
        where: where,
        select: getUserSelect(),
        skip: skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where: where }),
    ]);

    var users = results[0];
    var total = results[1];

    return res.json({
      success: true,
      data: users.map(formatUserResponse),
      pagination: {
        page: page,
        limit: limit,
        total: total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error) {
    console.error('[USER-ROUTES GET /] Error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'خطای سرور',
    });
  }
});

// =============================================================================
// GET /api/users/search
// =============================================================================
router.get('/search', authMiddleware, async function (req, res) {
  try {
    if (!prisma) {
      return res.status(503).json({
        success: false,
        message: 'Database not available',
      });
    }

    var q = String(req.query.q || req.query.search || '').trim();
    if (!q || q.length < 2) {
      return res.json({
        success: true,
        data: [],
      });
    }

    var users = await prisma.user.findMany({
      where: buildSearchWhere(q, undefined),
      select: getUserSelect(),
      take: 20,
      orderBy: { username: 'asc' },
    });

    return res.json({
      success: true,
      data: users.map(formatUserResponse),
    });
  } catch (error) {
    console.error('[USER-ROUTES SEARCH] Error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'خطای سرور',
    });
  }
});

// =============================================================================
// POST /api/users (create user)
// =============================================================================
router.post('/', authMiddleware, async function (req, res) {
  try {
    if (!prisma) {
      return res.status(503).json({
        success: false,
        message: 'Database not available',
      });
    }

    var body = req.body || {};

    if (!body.username || !String(body.username).trim()) {
      return res.status(400).json({
        success: false,
        message: 'نام کاربری الزامی است',
      });
    }

    var duplicate = await findDuplicateUser(body, null);
    if (duplicate) {
      return res.status(409).json({
        success: false,
        message: 'کاربر با این اطلاعات قبلاً وجود دارد',
      });
    }

    var hashedPassword = await hashPassword(body.password || 'default123');
    if (!hashedPassword) {
      return res.status(500).json({
        success: false,
        message: 'امکان هش کردن رمز عبور وجود ندارد',
      });
    }

    var subscriptionStart = null;
    var subscriptionEnd = null;

    if (hasOwn(body, 'subscriptionStart') && body.subscriptionStart !== '' && body.subscriptionStart !== null) {
      subscriptionStart = toDateOrNull(body.subscriptionStart);
      if (!subscriptionStart) {
        return res.status(400).json({
          success: false,
          message: 'subscriptionStart نامعتبر است',
        });
      }
    }

    if (hasOwn(body, 'subscriptionEnd') && body.subscriptionEnd !== '' && body.subscriptionEnd !== null) {
      subscriptionEnd = toDateOrNull(body.subscriptionEnd);
      if (!subscriptionEnd) {
        return res.status(400).json({
          success: false,
          message: 'subscriptionEnd نامعتبر است',
        });
      }
    }

    if (subscriptionStart && subscriptionEnd && subscriptionEnd < subscriptionStart) {
      return res.status(400).json({
        success: false,
        message: 'subscriptionEnd نمی‌تواند قبل از subscriptionStart باشد',
      });
    }

    var analysisLimit = toNumberOrDefault(body.analysisLimit, 5);
    var analysisLimit24h = hasOwn(body, 'analysisLimit24h')
      ? toNumberOrDefault(body.analysisLimit24h, 5)
      : analysisLimit;

    var newUser = await prisma.user.create({
      data: {
        username: String(body.username).trim(),
        passwordHash: hashedPassword,
        email: body.email || null,
        name: body.name || String(body.username).trim(),
        firstName: body.firstName || null,
        lastName: body.lastName || null,
        phone: body.phone || null,
        mobile: body.mobile || null,
        nationalId: body.nationalId || null,
        avatar: body.avatar || null,
        bio: body.bio || null,
        isActive: body.isActive !== false,
        roleId: toIntOrNull(body.roleId) || 2,
        subscriptionType: body.subscriptionType || 'free',
        subscriptionMonths: toNumberOrDefault(body.subscriptionMonths, 0),
        subscriptionStart: subscriptionStart,
        subscriptionEnd: subscriptionEnd,
        analysisLimit: analysisLimit,
        analysisLimit24h: analysisLimit24h,
        scalping: hasOwn(body, 'scalping') ? normalizeScalping(body.scalping) : null,
      },
      select: getUserSelect(),
    });

    return res.status(201).json({
      success: true,
      message: 'کاربر با موفقیت ایجاد شد',
      data: formatUserResponse(newUser),
    });
  } catch (error) {
    console.error('[USER-ROUTES POST /] Error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'خطای سرور',
    });
  }
});

// =============================================================================
// GET /api/users/:id
// =============================================================================
router.get('/:id', authMiddleware, async function (req, res) {
  try {
    if (!prisma) {
      return res.status(503).json({
        success: false,
        message: 'Database not available',
      });
    }

    var userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) {
      return res.status(400).json({
        success: false,
        message: 'شناسه نامعتبر',
      });
    }

    var user = await prisma.user.findUnique({
      where: { id: userId },
      select: getUserSelect(),
    });

    if (!user || user.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'کاربر یافت نشد',
      });
    }

    return res.json({
      success: true,
      data: formatUserResponse(user),
    });
  } catch (error) {
    console.error('[USER-ROUTES GET /:id] Error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'خطای سرور',
    });
  }
});

// =============================================================================
// PUT /api/users/:id
// =============================================================================
router.put('/:id', authMiddleware, updateUserHandler);

// =============================================================================
// PATCH /api/users/:id
// =============================================================================
router.patch('/:id', authMiddleware, updateUserHandler);

// =============================================================================
// DELETE /api/users/:id (soft delete)
// =============================================================================
router.delete('/:id', authMiddleware, async function (req, res) {
  try {
    if (!prisma) {
      return res.status(503).json({
        success: false,
        message: 'Database not available',
      });
    }

    var userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) {
      return res.status(400).json({
        success: false,
        message: 'شناسه نامعتبر',
      });
    }

    if (req.user && (req.user.userId === userId || req.user.id === userId)) {
      return res.status(400).json({
        success: false,
        message: 'نمی‌توانید حساب خود را حذف کنید',
      });
    }

    var existingUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        isDeleted: true,
      },
    });

    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: 'کاربر یافت نشد',
      });
    }

    if (existingUser.isDeleted) {
      return res.status(400).json({
        success: false,
        message: 'کاربر قبلاً حذف شده',
      });
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        isDeleted: true,
        isActive: false,
        updatedAt: new Date(),
      },
    });

    return res.json({
      success: true,
      message: 'کاربر با موفقیت حذف شد',
    });
  } catch (error) {
    console.error('[USER-ROUTES DELETE /:id] Error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'خطای سرور',
    });
  }
});

// =============================================================================
// PUT /api/users/:id/toggle-active
// =============================================================================
router.put('/:id/toggle-active', authMiddleware, async function (req, res) {
  try {
    if (!prisma) {
      return res.status(503).json({
        success: false,
        message: 'Database not available',
      });
    }

    var userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) {
      return res.status(400).json({
        success: false,
        message: 'شناسه نامعتبر',
      });
    }

    if (req.user && (req.user.userId === userId || req.user.id === userId)) {
      return res.status(400).json({
        success: false,
        message: 'نمی‌توانید وضعیت فعال بودن حساب خود را تغییر دهید',
      });
    }

    var user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        isActive: true,
        isDeleted: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'کاربر یافت نشد',
      });
    }

    if (user.isDeleted) {
      return res.status(400).json({
        success: false,
        message: 'امکان تغییر وضعیت کاربر حذف‌شده وجود ندارد',
      });
    }

    var updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        isActive: !user.isActive,
      },
      select: getUserSelect(),
    });

    return res.json({
      success: true,
      message: updatedUser.isActive ? 'کاربر فعال شد' : 'کاربر غیرفعال شد',
      data: formatUserResponse(updatedUser),
    });
  } catch (error) {
    console.error('[USER-ROUTES TOGGLE-ACTIVE] Error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'خطای سرور',
    });
  }
});

// =============================================================================
// GET /api/users/:id/stats
// =============================================================================
router.get('/:id/stats', authMiddleware, async function (req, res) {
  try {
    if (!prisma) {
      return res.status(503).json({
        success: false,
        message: 'Database not available',
      });
    }

    var userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) {
      return res.status(400).json({
        success: false,
        message: 'شناسه نامعتبر',
      });
    }

    var user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        isDeleted: true,
        loginCount: true,
        lastLoginAt: true,
        analysisLimit: true,
        analysisLimit24h: true,
        analysisUsed24h: true,
        subscriptionType: true,
        createdAt: true,
      },
    });

    if (!user || user.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'کاربر یافت نشد',
      });
    }

    var analysisCount = 0;
    try {
      analysisCount = await prisma.analysisHistory.count({
        where: { userId: userId },
      });
    } catch (e) {}

    var notificationCount = 0;
    try {
      notificationCount = await prisma.notification.count({
        where: { userId: userId },
      });
    } catch (e2) {}

    var effectiveAnalysisLimit = user.analysisLimit24h;
    if (effectiveAnalysisLimit === null || effectiveAnalysisLimit === undefined) {
      effectiveAnalysisLimit = user.analysisLimit;
    }
    if (effectiveAnalysisLimit === null || effectiveAnalysisLimit === undefined) {
      effectiveAnalysisLimit = 5;
    }

    return res.json({
      success: true,
      data: {
        userId: user.id,
        loginCount: user.loginCount ?? 0,
        lastLoginAt: user.lastLoginAt ?? null,
        analysisLimit: effectiveAnalysisLimit,
        analysisUsed24h: user.analysisUsed24h ?? 0,
        totalAnalyses: analysisCount,
        totalNotifications: notificationCount,
        subscriptionType: user.subscriptionType ?? 'free',
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error('[USER-ROUTES STATS] Error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'خطای سرور',
    });
  }
});

module.exports = router;
