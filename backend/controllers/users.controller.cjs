// backend/controllers/users.controller.cjs
// ═══════════════════════════════════════════════════════════════
// User Management Controller (Admin)
// Uses singleton Prisma, centralized messages & formatter
// Final revised version + restore/reactivate instead of duplicate
// ═══════════════════════════════════════════════════════════════
'use strict';

// --- Prisma singleton ---
var prisma = require('../config/prisma.cjs');

// --- bcrypt with fallback to bcryptjs ---
var bcrypt;
try {
  bcrypt = require('bcrypt');
} catch (_e) {
  try {
    bcrypt = require('bcryptjs');
    console.warn('[USERS CTRL] Using bcryptjs as fallback');
  } catch (_e2) {
    console.error('[USERS CTRL] FATAL: Neither bcrypt nor bcryptjs found!');
    bcrypt = {
      hash: function () { return Promise.reject(new Error('No bcrypt available')); },
      compare: function () { return Promise.reject(new Error('No bcrypt available')); },
    };
  }
}

// --- Messages with fallback ---
var MESSAGES;
try {
  MESSAGES = require('../constants/messages.cjs');
} catch (_e) {
  MESSAGES = {
    GENERAL: {
      SERVER_ERROR: 'خطای سرور',
      INVALID_ID: 'شناسه نامعتبر است',
    },
    AUTH: {
      REQUIRED_FIELDS: 'نام کاربری و رمز عبور الزامی است',
      PASSWORD_WEAK: 'رمز عبور باید حداقل ۶ کاراکتر باشد',
      USERNAME_EXISTS: 'نام کاربری تکراری است',
    },
    USER: {
      LIST_SUCCESS: 'لیست کاربران',
      GET_SUCCESS: 'اطلاعات کاربر',
      CREATED: 'کاربر ایجاد شد',
      UPDATED: 'کاربر به‌روزرسانی شد',
      DELETED: 'کاربر حذف شد',
      RESTORED: 'کاربر حذف‌شده/غیرفعال با موفقیت بازیابی شد',
      NOT_FOUND: 'کاربر یافت نشد',
      INVALID_ROLE: 'نقش نامعتبر',
      ROLE_CHANGED: 'نقش تغییر کرد',
      TOGGLED_ACTIVE: 'وضعیت کاربر تغییر کرد',
      SUBSCRIPTION_UPDATED: 'اشتراک به‌روزرسانی شد',
      CANNOT_DELETE_SELF: 'نمی‌توانید خودتان را حذف کنید',
      CANNOT_DEACTIVATE_SELF: 'نمی‌توانید خودتان را غیرفعال کنید',
      EMAIL_EXISTS: 'ایمیل تکراری است',
      INVALID_EMAIL: 'ایمیل نامعتبر است',
    },
  };
}

// --- User Formatter with fallback ---
var formatUser, formatUsers, getUserInclude, getUserSelect;
try {
  var formatter = require('../utils/userFormatter.cjs');
  formatUser = formatter.formatUser;
  formatUsers = formatter.formatUsers;
  getUserInclude = formatter.getUserInclude;
  getUserSelect = formatter.getUserSelect;
} catch (_e) {
  console.warn('[USERS CTRL] userFormatter.cjs not found, using inline fallback');

  getUserInclude = function (opts) {
    var inc = { Role: true };
    if (opts && opts.settings) {
      inc.settings = true;
    }
    return inc;
  };

  getUserSelect = function () {
    return undefined;
  };

  formatUser = function (user, opts) {
    if (!user) return null;
    var options = opts || {};
    var userRole = user.Role || user.role || null;
    var name = user.name
      || ((user.firstName || '') + ' ' + (user.lastName || '')).trim()
      || user.username || '';

    var formatted = {
      id: user.id,
      username: user.username,
      name: name,
      firstName: user.firstName || null,
      lastName: user.lastName || null,
      email: user.email || null,
      mobile: user.mobile || user.phone || null,
      phone: user.phone || user.mobile || null,
      nationalId: user.nationalId || null,
      bio: user.bio || null,
      avatar: user.avatar || null,
      isActive: !!user.isActive,
      roleId: user.roleId,
      roleName: userRole ? userRole.name : null,
      roleTitle: userRole ? (userRole.title || userRole.name) : null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      subscriptionStart: user.subscriptionStart || null,
      subscriptionEnd: user.subscriptionEnd || null,
      subscriptionMonths: user.subscriptionMonths || 0,
      subscriptionType: user.subscriptionType || null,
      analysisLimit: user.analysisLimit24h || user.analysisLimit || 5,
      analysisLimit24h: user.analysisLimit24h || user.analysisLimit || 5,
    };

    if (formatted.subscriptionEnd) {
      var now = new Date();
      var endDate = new Date(formatted.subscriptionEnd);
      formatted.isSubscriptionActive = endDate > now;
      formatted.daysRemaining = Math.max(
        0,
        Math.ceil((endDate - now) / (1000 * 60 * 60 * 24))
      );
    } else {
      formatted.isSubscriptionActive = false;
      formatted.daysRemaining = 0;
    }

    if (options.isAdmin) {
      formatted.isDeleted = !!user.isDeleted;
      formatted.lastLoginAt = user.lastLoginAt || null;
      formatted.loginCount = user.loginCount || 0;
      formatted.analysisCount = user.analysisCount || 0;
      formatted.analysisCount24h = user.analysisCount24h || 0;
    }

    if (options.includeSettings && user.settings) {
      formatted.settings = user.settings;
    }

    return formatted;
  };

  formatUsers = function (users, opts) {
    if (!Array.isArray(users)) return [];
    return users.map(function (u) { return formatUser(u, opts); });
  };
}

// --- Constants ---
var BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════
function getRequestUserId(req) {
  var u = req.user;
  if (!u) return null;
  var raw = u.userId || u.id || u.sub;
  if (!raw) return null;
  var n = parseInt(raw, 10);
  return isNaN(n) ? null : n;
}

function toNullableTrimmedString(value) {
  if (value === undefined || value === null) return null;
  var s = String(value).trim();
  return s ? s : null;
}

function normalizeUsername(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function normalizeEmail(value) {
  if (value === undefined || value === null) return null;
  var email = String(value).trim().toLowerCase();
  return email || null;
}

function isValidEmail(email) {
  if (!email) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function toBoolean(value, defaultValue) {
  if (value === undefined) return defaultValue;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    var v = value.trim().toLowerCase();
    if (v === 'true' || v === '1' || v === 'yes' || v === 'on') return true;
    if (v === 'false' || v === '0' || v === 'no' || v === 'off') return false;
  }
  return !!value;
}

function toPositiveInt(value, defaultValue) {
  var n = parseInt(value, 10);
  return isNaN(n) || n < 0 ? defaultValue : n;
}

function buildDisplayName(body, fallbackUsername) {
  var explicitName = toNullableTrimmedString(body.name);
  if (explicitName) return explicitName;

  var firstName = toNullableTrimmedString(body.firstName);
  var lastName = toNullableTrimmedString(body.lastName);
  var combined = [firstName, lastName].filter(Boolean).join(' ').trim();

  return combined || fallbackUsername || '';
}

function getP2002Field(error) {
  if (!error || error.code !== 'P2002') return null;
  var target = error.meta && error.meta.target;

  if (Array.isArray(target)) {
    if (target.indexOf('username') !== -1) return 'username';
    if (target.indexOf('email') !== -1) return 'email';
    return 'unique';
  }

  if (typeof target === 'string') {
    if (target.indexOf('username') !== -1) return 'username';
    if (target.indexOf('email') !== -1) return 'email';
    return 'unique';
  }

  return 'unique';
}

// ═══════════════════════════════════════════════════════════════
// GET /api/users - List all users (admin)
// ═══════════════════════════════════════════════════════════════
async function listUsers(req, res) {
  try {
    var page = Math.max(1, parseInt(req.query.page, 10) || 1);
    var limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    var skip = (page - 1) * limit;
    var search = (req.query.search || '').trim();
    var roleFilter = req.query.role || req.query.roleId || null;
    var activeFilter = req.query.isActive;

    var where = { isDeleted: false };

    if (search) {
      where.OR = [
        { username: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (roleFilter) {
      var rId = parseInt(roleFilter, 10);
      if (!isNaN(rId)) {
        where.roleId = rId;
      }
    }

    if (activeFilter !== undefined && activeFilter !== '') {
      where.isActive = activeFilter === 'true' || activeFilter === '1';
    }

    var includeClause = getUserInclude({ settings: true });

    var total = await prisma.user.count({ where: where });
    var users = await prisma.user.findMany({
      where: where,
      include: includeClause,
      orderBy: { createdAt: 'desc' },
      skip: skip,
      take: limit,
    });

    var formatted = formatUsers(users, { isAdmin: true, includeSettings: true });

    res.set('X-Total-Count', String(total));
    return res.json({
      success: true,
      message: MESSAGES.USER.LIST_SUCCESS,
      data: {
        users: formatted,
        pagination: {
          page: page,
          limit: limit,
          total: total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error('[USERS] List error:', error);
    return res.status(500).json({
      success: false,
      message: MESSAGES.GENERAL.SERVER_ERROR,
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// GET /api/users/:id - Get single user (admin)
// ═══════════════════════════════════════════════════════════════
async function getUser(req, res) {
  try {
    var id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: MESSAGES.GENERAL.INVALID_ID,
      });
    }

    var user = await prisma.user.findFirst({
      where: { id: id, isDeleted: false },
      include: getUserInclude({ settings: true }),
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: MESSAGES.USER.NOT_FOUND,
      });
    }

    return res.json({
      success: true,
      message: MESSAGES.USER.GET_SUCCESS,
      data: {
        user: formatUser(user, { isAdmin: true, includeSettings: true }),
      },
    });
  } catch (error) {
    console.error('[USERS] Get error:', error);
    return res.status(500).json({
      success: false,
      message: MESSAGES.GENERAL.SERVER_ERROR,
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// POST /api/users - Create user (admin)
// Restore/reactivate soft-deleted or inactive user instead of recreating
// ═══════════════════════════════════════════════════════════════
async function createUser(req, res) {
  try {
    var body = req.body || {};

    var username = normalizeUsername(body.username);
    var password = typeof body.password === 'string' ? body.password : '';
    var email = normalizeEmail(body.email);

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: MESSAGES.AUTH.REQUIRED_FIELDS,
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: MESSAGES.AUTH.PASSWORD_WEAK,
      });
    }

    if (email && !isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: MESSAGES.USER.INVALID_EMAIL || 'ایمیل نامعتبر است',
      });
    }

    var roleId = 1;
    if (body.roleId !== undefined && body.roleId !== null && body.roleId !== '') {
      var rId = parseInt(body.roleId, 10);
      if (isNaN(rId)) {
        return res.status(400).json({
          success: false,
          message: MESSAGES.USER.INVALID_ROLE,
        });
      }

      var roleExists = await prisma.role.findUnique({ where: { id: rId } });
      if (!roleExists) {
        return res.status(400).json({
          success: false,
          message: MESSAGES.USER.INVALID_ROLE,
        });
      }

      roleId = rId;
    }

    var existing = await prisma.user.findFirst({
      where: {
        OR: [
          { username: username },
          email ? { email: email } : undefined,
        ].filter(Boolean),
      },
      select: {
        id: true,
        username: true,
        email: true,
        isDeleted: true,
        isActive: true,
      },
    });

    // فقط کاربر فعال و غیرحذف‌شده conflict واقعی محسوب می‌شود
    if (existing && !existing.isDeleted && existing.isActive) {
      if (existing.username === username) {
        return res.status(409).json({
          success: false,
          message: MESSAGES.AUTH.USERNAME_EXISTS,
        });
      }

      if (email && existing.email === email) {
        return res.status(409).json({
          success: false,
          message: MESSAGES.USER.EMAIL_EXISTS || 'ایمیل تکراری است',
        });
      }

      return res.status(409).json({
        success: false,
        message: MESSAGES.AUTH.USERNAME_EXISTS,
      });
    }

    var passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // اگر کاربر حذف‌شده یا غیرفعال بود => restore/reactivate
    if (existing && (existing.isDeleted || !existing.isActive)) {
      var activeConflict = await prisma.user.findFirst({
        where: {
          id: { not: existing.id },
          isDeleted: false,
          isActive: true,
          OR: [
            { username: username },
            email ? { email: email } : undefined,
          ].filter(Boolean),
        },
        select: {
          id: true,
          username: true,
          email: true,
        },
      });

      if (activeConflict) {
        if (activeConflict.username === username) {
          return res.status(409).json({
            success: false,
            message: MESSAGES.AUTH.USERNAME_EXISTS,
          });
        }

        if (email && activeConflict.email === email) {
          return res.status(409).json({
            success: false,
            message: MESSAGES.USER.EMAIL_EXISTS || 'ایمیل تکراری است',
          });
        }

        return res.status(409).json({
          success: false,
          message: MESSAGES.AUTH.USERNAME_EXISTS,
        });
      }

      var restoredUser = await prisma.user.update({
        where: { id: existing.id },
        data: {
          username: username,
          passwordHash: passwordHash,
          email: email,
          name: buildDisplayName(body, username),
          firstName: toNullableTrimmedString(body.firstName),
          lastName: toNullableTrimmedString(body.lastName),
          phone: toNullableTrimmedString(body.phone || body.mobile),
          mobile: toNullableTrimmedString(body.mobile || body.phone),
          nationalId: toNullableTrimmedString(body.nationalId),
          bio: toNullableTrimmedString(body.bio),
          avatar: body.avatar || null,
          roleId: roleId,
          isDeleted: false,
          isActive: true,
          analysisLimit: toPositiveInt(body.analysisLimit, 5),
          analysisLimit24h: toPositiveInt(
            body.analysisLimit24h !== undefined ? body.analysisLimit24h : body.analysisLimit,
            5
          ),
          updatedAt: new Date(),
        },
        include: getUserInclude({ settings: true }),
      });

      return res.status(200).json({
        success: true,
        message: MESSAGES.USER.RESTORED || 'کاربر حذف‌شده/غیرفعال با موفقیت بازیابی شد',
        data: {
          user: formatUser(restoredUser, { isAdmin: true, includeSettings: true }),
          restored: true,
        },
      });
    }

    var newUser = await prisma.user.create({
      data: {
        username: username,
        passwordHash: passwordHash,
        email: email,
        name: buildDisplayName(body, username),
        firstName: toNullableTrimmedString(body.firstName),
        lastName: toNullableTrimmedString(body.lastName),
        phone: toNullableTrimmedString(body.phone || body.mobile),
        mobile: toNullableTrimmedString(body.mobile || body.phone),
        nationalId: toNullableTrimmedString(body.nationalId),
        bio: toNullableTrimmedString(body.bio),
        avatar: body.avatar || null,
        roleId: roleId,
        isActive: toBoolean(body.isActive, true),
        analysisLimit: toPositiveInt(body.analysisLimit, 5),
        analysisLimit24h: toPositiveInt(
          body.analysisLimit24h !== undefined ? body.analysisLimit24h : body.analysisLimit,
          5
        ),
      },
      include: getUserInclude({ settings: true }),
    });

    return res.status(201).json({
      success: true,
      message: MESSAGES.USER.CREATED,
      data: {
        user: formatUser(newUser, { isAdmin: true, includeSettings: true }),
        restored: false,
      },
    });
  } catch (error) {
    console.error('[USERS] Create error:', error);

    var uniqueField = getP2002Field(error);
    if (uniqueField === 'username') {
      return res.status(409).json({
        success: false,
        message: MESSAGES.AUTH.USERNAME_EXISTS,
      });
    }
    if (uniqueField === 'email') {
      return res.status(409).json({
        success: false,
        message: MESSAGES.USER.EMAIL_EXISTS || 'ایمیل تکراری است',
      });
    }

    return res.status(500).json({
      success: false,
      message: MESSAGES.GENERAL.SERVER_ERROR,
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// PUT /api/users/:id - Update user (admin)
// ═══════════════════════════════════════════════════════════════
async function updateUser(req, res) {
  try {
    var id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: MESSAGES.GENERAL.INVALID_ID,
      });
    }

    var user = await prisma.user.findFirst({
      where: { id: id, isDeleted: false },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: MESSAGES.USER.NOT_FOUND,
      });
    }

    var body = req.body || {};
    var updateData = { updatedAt: new Date() };

    if (body.name !== undefined) {
      updateData.name = toNullableTrimmedString(body.name);
    }

    if (body.firstName !== undefined) {
      updateData.firstName = toNullableTrimmedString(body.firstName);
    }

    if (body.lastName !== undefined) {
      updateData.lastName = toNullableTrimmedString(body.lastName);
    }

    if (body.email !== undefined) {
      var normalizedEmail = normalizeEmail(body.email);

      if (normalizedEmail && !isValidEmail(normalizedEmail)) {
        return res.status(400).json({
          success: false,
          message: MESSAGES.USER.INVALID_EMAIL || 'ایمیل نامعتبر است',
        });
      }

      if (normalizedEmail && normalizedEmail !== (user.email || null)) {
        var existingEmailUser = await prisma.user.findFirst({
          where: {
            email: normalizedEmail,
            id: { not: id },
            isDeleted: false,
            isActive: true,
          },
          select: { id: true },
        });

        if (existingEmailUser) {
          return res.status(409).json({
            success: false,
            message: MESSAGES.USER.EMAIL_EXISTS || 'ایمیل تکراری است',
          });
        }
      }

      updateData.email = normalizedEmail;
    }

    if (body.phone !== undefined) {
      updateData.phone = toNullableTrimmedString(body.phone);
    }

    if (body.mobile !== undefined) {
      updateData.mobile = toNullableTrimmedString(body.mobile);
    }

    if (body.nationalId !== undefined) {
      updateData.nationalId = toNullableTrimmedString(body.nationalId);
    }

    if (body.bio !== undefined) {
      updateData.bio = toNullableTrimmedString(body.bio);
    }

    if (body.avatar !== undefined) {
      updateData.avatar = body.avatar || null;
    }

    if (body.isActive !== undefined) {
      updateData.isActive = toBoolean(body.isActive, !!user.isActive);
    }

    if (body.roleId !== undefined) {
      var newRoleId = parseInt(body.roleId, 10);

      if (isNaN(newRoleId)) {
        return res.status(400).json({
          success: false,
          message: MESSAGES.USER.INVALID_ROLE,
        });
      }

      var roleExists = await prisma.role.findUnique({ where: { id: newRoleId } });
      if (!roleExists) {
        return res.status(400).json({
          success: false,
          message: MESSAGES.USER.INVALID_ROLE,
        });
      }

      updateData.roleId = newRoleId;
    }

    if (body.password !== undefined && body.password !== null && body.password !== '') {
      if (String(body.password).length < 6) {
        return res.status(400).json({
          success: false,
          message: MESSAGES.AUTH.PASSWORD_WEAK,
        });
      }
      updateData.passwordHash = await bcrypt.hash(String(body.password), BCRYPT_ROUNDS);
    }

    if (body.analysisLimit !== undefined) {
      updateData.analysisLimit = toPositiveInt(body.analysisLimit, user.analysisLimit || 5);
    }

    if (body.analysisLimit24h !== undefined) {
      updateData.analysisLimit24h = toPositiveInt(
        body.analysisLimit24h,
        user.analysisLimit24h || user.analysisLimit || 5
      );
    }

    if (
      body.name === undefined &&
      (body.firstName !== undefined || body.lastName !== undefined)
    ) {
      var mergedFirstName = updateData.firstName !== undefined ? updateData.firstName : user.firstName;
      var mergedLastName = updateData.lastName !== undefined ? updateData.lastName : user.lastName;
      var rebuiltName = [mergedFirstName, mergedLastName].filter(Boolean).join(' ').trim();

      if (rebuiltName) {
        updateData.name = rebuiltName;
      }
    }

    var updatedUser = await prisma.user.update({
      where: { id: id },
      data: updateData,
      include: getUserInclude({ settings: true }),
    });

    return res.json({
      success: true,
      message: MESSAGES.USER.UPDATED,
      data: {
        user: formatUser(updatedUser, { isAdmin: true, includeSettings: true }),
      },
    });
  } catch (error) {
    console.error('[USERS] Update error:', error);

    var uniqueField = getP2002Field(error);
    if (uniqueField === 'username') {
      return res.status(409).json({
        success: false,
        message: MESSAGES.AUTH.USERNAME_EXISTS,
      });
    }
    if (uniqueField === 'email') {
      return res.status(409).json({
        success: false,
        message: MESSAGES.USER.EMAIL_EXISTS || 'ایمیل تکراری است',
      });
    }

    return res.status(500).json({
      success: false,
      message: MESSAGES.GENERAL.SERVER_ERROR,
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// DELETE /api/users/:id - Soft delete user (admin)
// ═══════════════════════════════════════════════════════════════
async function deleteUser(req, res) {
  try {
    var id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: MESSAGES.GENERAL.INVALID_ID,
      });
    }

    var requesterId = getRequestUserId(req);
    if (requesterId && requesterId === id) {
      return res.status(400).json({
        success: false,
        message: MESSAGES.USER.CANNOT_DELETE_SELF,
      });
    }

    var user = await prisma.user.findFirst({
      where: { id: id, isDeleted: false },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: MESSAGES.USER.NOT_FOUND,
      });
    }

    await prisma.user.update({
      where: { id: id },
      data: {
        isDeleted: true,
        isActive: false,
        updatedAt: new Date(),
      },
    });

    return res.json({
      success: true,
      message: MESSAGES.USER.DELETED,
    });
  } catch (error) {
    console.error('[USERS] Delete error:', error);
    return res.status(500).json({
      success: false,
      message: MESSAGES.GENERAL.SERVER_ERROR,
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// PATCH /api/users/:id/toggle-active - Toggle active status
// ═══════════════════════════════════════════════════════════════
async function toggleActive(req, res) {
  try {
    var id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: MESSAGES.GENERAL.INVALID_ID,
      });
    }

    var requesterId = getRequestUserId(req);
    if (requesterId && requesterId === id) {
      return res.status(400).json({
        success: false,
        message: MESSAGES.USER.CANNOT_DEACTIVATE_SELF,
      });
    }

    var user = await prisma.user.findFirst({
      where: { id: id, isDeleted: false },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: MESSAGES.USER.NOT_FOUND,
      });
    }

    var updatedUser = await prisma.user.update({
      where: { id: id },
      data: {
        isActive: !user.isActive,
        updatedAt: new Date(),
      },
      include: getUserInclude({ settings: true }),
    });

    return res.json({
      success: true,
      message: MESSAGES.USER.TOGGLED_ACTIVE,
      data: {
        user: formatUser(updatedUser, { isAdmin: true, includeSettings: true }),
      },
    });
  } catch (error) {
    console.error('[USERS] Toggle active error:', error);
    return res.status(500).json({
      success: false,
      message: MESSAGES.GENERAL.SERVER_ERROR,
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// PATCH /api/users/:id/role - Change user role
// ═══════════════════════════════════════════════════════════════
async function changeRole(req, res) {
  try {
    var id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: MESSAGES.GENERAL.INVALID_ID,
      });
    }

    var newRoleId = parseInt(req.body && req.body.roleId, 10);
    if (isNaN(newRoleId)) {
      return res.status(400).json({
        success: false,
        message: MESSAGES.USER.INVALID_ROLE,
      });
    }

    var user = await prisma.user.findFirst({
      where: { id: id, isDeleted: false },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: MESSAGES.USER.NOT_FOUND,
      });
    }

    var role = await prisma.role.findUnique({ where: { id: newRoleId } });
    if (!role) {
      return res.status(400).json({
        success: false,
        message: MESSAGES.USER.INVALID_ROLE,
      });
    }

    var updatedUser = await prisma.user.update({
      where: { id: id },
      data: {
        roleId: newRoleId,
        updatedAt: new Date(),
      },
      include: getUserInclude({ settings: true }),
    });

    return res.json({
      success: true,
      message: MESSAGES.USER.ROLE_CHANGED,
      data: {
        user: formatUser(updatedUser, { isAdmin: true, includeSettings: true }),
      },
    });
  } catch (error) {
    console.error('[USERS] Change role error:', error);
    return res.status(500).json({
      success: false,
      message: MESSAGES.GENERAL.SERVER_ERROR,
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// PATCH /api/users/:id/subscription - Update subscription
// ═══════════════════════════════════════════════════════════════
async function updateSubscription(req, res) {
  try {
    var id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: MESSAGES.GENERAL.INVALID_ID,
      });
    }

    var user = await prisma.user.findFirst({
      where: { id: id, isDeleted: false },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: MESSAGES.USER.NOT_FOUND,
      });
    }

    var body = req.body || {};
    var updateData = { updatedAt: new Date() };

    if (body.subscriptionStart !== undefined) {
      updateData.subscriptionStart = body.subscriptionStart
        ? new Date(body.subscriptionStart)
        : null;
    }

    if (body.subscriptionMonths !== undefined) {
      updateData.subscriptionMonths = toPositiveInt(body.subscriptionMonths, 0);
    }

    if (body.subscriptionType !== undefined) {
      updateData.subscriptionType = body.subscriptionType || null;
    }

    var start = updateData.subscriptionStart !== undefined
      ? updateData.subscriptionStart
      : user.subscriptionStart;

    var months = updateData.subscriptionMonths !== undefined
      ? updateData.subscriptionMonths
      : user.subscriptionMonths;

    if (start && months && months > 0) {
      var end = new Date(start);
      end.setMonth(end.getMonth() + months);
      updateData.subscriptionEnd = end;
    } else if (updateData.subscriptionStart === null || months === 0) {
      updateData.subscriptionEnd = null;
    }

    if (body.analysisLimit24h !== undefined) {
      var lim = toPositiveInt(body.analysisLimit24h, 0);
      updateData.analysisLimit24h = lim;
      updateData.analysisLimit = lim;
    } else if (body.analysisLimit !== undefined) {
      var lim2 = toPositiveInt(body.analysisLimit, 0);
      updateData.analysisLimit = lim2;
      updateData.analysisLimit24h = lim2;
    }

    var updatedUser = await prisma.user.update({
      where: { id: id },
      data: updateData,
      include: getUserInclude({ settings: true }),
    });

    return res.json({
      success: true,
      message: MESSAGES.USER.SUBSCRIPTION_UPDATED,
      data: {
        user: formatUser(updatedUser, { isAdmin: true, includeSettings: true }),
      },
    });
  } catch (error) {
    console.error('[USERS] Update subscription error:', error);
    return res.status(500).json({
      success: false,
      message: MESSAGES.GENERAL.SERVER_ERROR,
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════
module.exports = {
  listUsers: listUsers,
  getUser: getUser,
  createUser: createUser,
  updateUser: updateUser,
  deleteUser: deleteUser,
  toggleActive: toggleActive,
  changeRole: changeRole,
  updateSubscription: updateSubscription,
};
