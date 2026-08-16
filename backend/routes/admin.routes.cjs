// routes/admin.routes.cjs - fixed & aligned with prisma schema
// All comments in English to avoid encoding issues
'use strict';

const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const path = require('path');
const fs = require('fs');
const authMiddleware = require('../middlewares/auth.middleware.cjs');

let bcrypt;
try {
  bcrypt = require('bcryptjs');
} catch (err) {
  bcrypt = require('bcrypt');
}

// ============================================
// Helpers
// ============================================
function firstDefined() {
  for (var i = 0; i < arguments.length; i += 1) {
    if (arguments[i] !== undefined && arguments[i] !== null) {
      return arguments[i];
    }
  }
  return null;
}

function toInt(value, fallbackValue) {
  var parsed = parseInt(value, 10);
  return isNaN(parsed) ? fallbackValue : parsed;
}

function normalizeString(value) {
  if (value === undefined || value === null) return null;
  var s = String(value).trim();
  return s === '' ? null : s;
}

function normalizeBoolean(value, fallbackValue) {
  if (value === undefined) return fallbackValue;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    var v = value.trim().toLowerCase();
    if (v === 'true') return true;
    if (v === 'false') return false;
  }
  return Boolean(value);
}

function hashPassword(plainPassword) {
  return Promise.resolve().then(function() {
    if (!plainPassword || typeof plainPassword !== 'string') {
      throw new Error('Password is required');
    }

    var saltRounds = 10;
    return bcrypt.hash(plainPassword, saltRounds);
  });
}

function calcSubscription(user) {
  var remainingDays = 0;
  var isSubscriptionActive = false;

  var endDate = user.subscriptionEnd ? new Date(user.subscriptionEnd) : null;

  if (endDate && !isNaN(endDate.getTime())) {
    var now = new Date();
    var diffMs = endDate.getTime() - now.getTime();
    var diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    remainingDays = diffDays > 0 ? diffDays : 0;
    isSubscriptionActive = diffDays > 0;

    return {
      remainingDays: remainingDays,
      isSubscriptionActive: isSubscriptionActive
    };
  }

  if (user.subscriptionStart && user.subscriptionMonths && user.subscriptionMonths > 0) {
    var start = new Date(user.subscriptionStart);

    if (!isNaN(start.getTime())) {
      var end = new Date(start);
      end.setMonth(end.getMonth() + user.subscriptionMonths);

      var now2 = new Date();
      var diffMs2 = end.getTime() - now2.getTime();
      var diffDays2 = Math.ceil(diffMs2 / (1000 * 60 * 60 * 24));

      remainingDays = diffDays2 > 0 ? diffDays2 : 0;
      isSubscriptionActive = diffDays2 > 0;
    }
  }

  return {
    remainingDays: remainingDays,
    isSubscriptionActive: isSubscriptionActive
  };
}

// ============================================
// Shared select fields for User queries
// Aligned with prisma schema + formatter
// ============================================
var USER_SELECT = {
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
  roleId: true,
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
  createdAt: true,
  updatedAt: true,
  Role: {
    select: {
      id: true,
      name: true,
      title: true
    }
  }
};

// ============================================
// Helper: format user object for admin responses
// ============================================
function formatAdminUser(u) {
  var sub = calcSubscription(u);
  var role = u && (u.Role || u.role) ? (u.Role || u.role) : null;

  var firstName = firstDefined(u.firstName, null);
  var lastName = firstDefined(u.lastName, null);
  var fullName = ((firstName || '') + ' ' + (lastName || '')).trim();
  var name = firstDefined(u.name, fullName || null, u.username, '');

  return {
    id: u.id,
    username: u.username,
    email: firstDefined(u.email, null),
    name: name,
    firstName: firstName,
    lastName: lastName,
    phone: firstDefined(u.phone, u.mobile, null),
    mobile: firstDefined(u.mobile, u.phone, null),
    nationalId: firstDefined(u.nationalId, null),
    avatar: firstDefined(u.avatar, null),
    bio: firstDefined(u.bio, null),

    isActive: typeof u.isActive === 'boolean' ? u.isActive : true,
    isDeleted: !!u.isDeleted,
    scalping: firstDefined(u.scalping, null),

    roleId: firstDefined(u.roleId, null),
    roleName: role ? firstDefined(role.name, null) : null,
    roleTitle: role ? firstDefined(role.title, role.name, null) : null,
    role: role || null,

    subscriptionStart: firstDefined(u.subscriptionStart, null),
    subscriptionEnd: firstDefined(u.subscriptionEnd, null),
    subscriptionMonths: firstDefined(u.subscriptionMonths, 0),
    subscriptionType: firstDefined(u.subscriptionType, 'free'),
    analysisLimit: firstDefined(u.analysisLimit24h, u.analysisLimit, 0),
    analysisLimit24h: firstDefined(u.analysisLimit24h, u.analysisLimit, 0),
    analysisUsed24h: firstDefined(u.analysisUsed24h, 0),
    lastAnalysisReset: firstDefined(u.lastAnalysisReset, null),

    remainingDays: sub.remainingDays,
    isSubscriptionActive: sub.isSubscriptionActive,

    lastLoginAt: firstDefined(u.lastLoginAt, null),
    loginCount: firstDefined(u.loginCount, 0),

    createdAt: u.createdAt,
    updatedAt: u.updatedAt
  };
}

// ============================================
// Middleware: require admin role
// ============================================
function requireAdmin(req, res, next) {
  var userId = req.user && (req.user.id || req.user.userId);

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }

  prisma.user.findUnique({
    where: { id: Number(userId) },
    include: { Role: true }
  }).then(function(user) {
    if (!user || !user.Role) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: admin role required'
      });
    }

    var roleName = user.Role.name ? user.Role.name.toLowerCase() : '';
    if (roleName !== 'admin' && roleName !== 'superadmin' && user.roleId !== 1) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: admin role required'
      });
    }

    req.userRole = user.Role;
    next();
  }).catch(function(error) {
    console.error('[Admin] requireAdmin check error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error checking admin access'
    });
  });
}

// ============================================
// GET /api/admin/dashboard
// ============================================
router.get('/dashboard', authMiddleware, requireAdmin, function(req, res) {
  Promise.all([
    prisma.user.count({ where: { isDeleted: false } }),
    prisma.user.count({ where: { isActive: true, isDeleted: false } }),
    prisma.notification.count(),
    prisma.conversation.count(),
    prisma.analysisHistory.count(),
    prisma.apiKey.count({ where: { isRevoked: false } })
  ]).then(function(results) {
    var totalUsers = results[0];
    var activeUsers = results[1];
    var totalNotifications = results[2];
    var totalConversations = results[3];
    var totalAnalysis = results[4];
    var totalApiKeys = results[5];

    return prisma.user.findMany({
      where: { isDeleted: false },
      select: {
        subscriptionStart: true,
        subscriptionEnd: true,
        subscriptionMonths: true
      }
    }).then(function(allUsers) {
      var activeSubscriptions = 0;

      for (var i = 0; i < allUsers.length; i++) {
        var sub = calcSubscription(allUsers[i]);
        if (sub.isSubscriptionActive) {
          activeSubscriptions++;
        }
      }

      return prisma.user.findMany({
        where: { isDeleted: false },
        select: USER_SELECT,
        orderBy: { createdAt: 'desc' },
        take: 5
      }).then(function(recentUsers) {
        var formattedRecent = [];
        for (var j = 0; j < recentUsers.length; j++) {
          formattedRecent.push(formatAdminUser(recentUsers[j]));
        }

        res.json({
          success: true,
          data: {
            stats: {
              totalUsers: totalUsers,
              activeUsers: activeUsers,
              inactiveUsers: totalUsers - activeUsers,
              activeSubscriptions: activeSubscriptions,
              totalNotifications: totalNotifications,
              totalConversations: totalConversations,
              totalAnalysis: totalAnalysis,
              totalApiKeys: totalApiKeys
            },
            recentUsers: formattedRecent
          }
        });
      });
    });
  }).catch(function(error) {
    console.error('[Admin] Dashboard error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error fetching dashboard data',
      error: error.message
    });
  });
});

// ============================================
// GET /api/admin/users - list all users with pagination
// ============================================
router.get('/users', authMiddleware, requireAdmin, function(req, res) {
  var page = toInt(req.query.page, 1);
  var limit = toInt(req.query.limit, 20);
  var search = req.query.search || '';
  var isActive = req.query.isActive;
  var roleId = req.query.roleId;
  var skip = (page - 1) * limit;

  var where = { isDeleted: false };

  if (search && String(search).trim() !== '') {
    var q = String(search).trim();
    where.OR = [
      { username: { contains: q } },
      { name: { contains: q } },
      { firstName: { contains: q } },
      { lastName: { contains: q } },
      { email: { contains: q } },
      { phone: { contains: q } },
      { mobile: { contains: q } },
      { nationalId: { contains: q } }
    ];
  }

  if (isActive !== undefined && isActive !== '') {
    where.isActive = (String(isActive) === 'true');
  }

  if (roleId !== undefined && roleId !== '') {
    where.roleId = toInt(roleId, undefined);
  }

  Promise.all([
    prisma.user.findMany({
      where: where,
      select: USER_SELECT,
      skip: skip,
      take: limit,
      orderBy: { createdAt: 'desc' }
    }),
    prisma.user.count({ where: where })
  ]).then(function(results) {
    var users = results[0];
    var total = results[1];

    var formatted = [];
    for (var i = 0; i < users.length; i++) {
      formatted.push(formatAdminUser(users[i]));
    }

    res.json({
      success: true,
      data: formatted,
      pagination: {
        page: page,
        limit: limit,
        total: total,
        totalPages: Math.ceil(total / limit)
      }
    });
  }).catch(function(error) {
    console.error('[Admin] Users list error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error fetching users list',
      error: error.message
    });
  });
});

// ============================================
// GET /api/admin/users/:id - single user detail
// ============================================
router.get('/users/:id', authMiddleware, requireAdmin, function(req, res) {
  var userId = toInt(req.params.id, NaN);

  if (isNaN(userId)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid user ID'
    });
  }

  var selectWithCount = {};
  var keys = Object.keys(USER_SELECT);

  for (var k = 0; k < keys.length; k++) {
    selectWithCount[keys[k]] = USER_SELECT[keys[k]];
  }

  selectWithCount._count = {
    select: {
      analysis: true,
      apiKeys: true,
      notifications: true,
      sessions: true
    }
  };

  prisma.user.findUnique({
    where: { id: userId },
    select: selectWithCount
  }).then(function(user) {
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    var formatted = formatAdminUser(user);
    formatted.counts = user._count || {};

    res.json({
      success: true,
      data: formatted
    });
  }).catch(function(error) {
    console.error('[Admin] User detail error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error fetching user details',
      error: error.message
    });
  });
});

// ============================================
// POST /api/admin/users - create user
// ============================================
router.post('/users', authMiddleware, requireAdmin, function(req, res) {
  var body = req.body || {};

  var username = normalizeString(body.username);
  var password = body.password ? String(body.password) : '';
  var email = normalizeString(body.email);
  var name = normalizeString(body.name);
  var firstName = normalizeString(body.firstName);
  var lastName = normalizeString(body.lastName);
  var phone = normalizeString(body.phone);
  var mobile = normalizeString(body.mobile);
  var nationalId = normalizeString(body.nationalId);
  var avatar = normalizeString(body.avatar);
  var bio = normalizeString(body.bio);
  var subscriptionType = normalizeString(body.subscriptionType) || 'free';

  var roleId = body.roleId !== undefined && body.roleId !== null ? toInt(body.roleId, 2) : 2;
  var isActive = body.isActive !== undefined ? normalizeBoolean(body.isActive, true) : true;
  var scalping = body.scalping !== undefined ? normalizeBoolean(body.scalping, false) : false;

  var subscriptionMonths = body.subscriptionMonths !== undefined && body.subscriptionMonths !== null
    ? toInt(body.subscriptionMonths, 0)
    : 0;

  var analysisLimit = body.analysisLimit !== undefined && body.analysisLimit !== null
    ? toInt(body.analysisLimit, 0)
    : 0;

  var analysisLimit24h = body.analysisLimit24h !== undefined && body.analysisLimit24h !== null
    ? toInt(body.analysisLimit24h, analysisLimit)
    : analysisLimit;

  var analysisUsed24h = body.analysisUsed24h !== undefined && body.analysisUsed24h !== null
    ? toInt(body.analysisUsed24h, 0)
    : 0;

  var loginCount = body.loginCount !== undefined && body.loginCount !== null
    ? toInt(body.loginCount, 0)
    : 0;

  var subscriptionStart = null;
  var subscriptionEnd = null;
  var lastAnalysisReset = null;
  var lastLoginAt = null;

  if (body.subscriptionStart) {
    subscriptionStart = new Date(body.subscriptionStart);
    if (isNaN(subscriptionStart.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid subscriptionStart value'
      });
    }
  } else if (subscriptionMonths > 0) {
    subscriptionStart = new Date();
  }

  if (body.subscriptionEnd) {
    subscriptionEnd = new Date(body.subscriptionEnd);
    if (isNaN(subscriptionEnd.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid subscriptionEnd value'
      });
    }
  }

  if (body.lastAnalysisReset) {
    lastAnalysisReset = new Date(body.lastAnalysisReset);
    if (isNaN(lastAnalysisReset.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid lastAnalysisReset value'
      });
    }
  }

  if (body.lastLoginAt) {
    lastLoginAt = new Date(body.lastLoginAt);
    if (isNaN(lastLoginAt.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid lastLoginAt value'
      });
    }
  }

  if (!username) {
    return res.status(400).json({
      success: false,
      message: 'Username is required'
    });
  }

  if (!password || password.length < 6) {
    return res.status(400).json({
      success: false,
      message: 'Password must be at least 6 characters'
    });
  }

  prisma.role.findUnique({
    where: { id: roleId }
  }).then(function(role) {
    if (!role) {
      return res.status(400).json({
        success: false,
        message: 'Invalid roleId'
      });
    }

    var duplicateOr = [{ username: username }];

    if (email) duplicateOr.push({ email: email });
    if (phone) duplicateOr.push({ phone: phone });
    if (mobile) duplicateOr.push({ mobile: mobile });
    if (nationalId) duplicateOr.push({ nationalId: nationalId });

    return prisma.user.findFirst({
      where: { OR: duplicateOr }
    }).then(function(existingUser) {
      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: 'User with the same username, email, phone, mobile, or national ID already exists'
        });
      }

      return hashPassword(password).then(function(hashedPassword) {
        return prisma.user.create({
          data: {
            username: username,
            passwordHash: hashedPassword,
            email: email,
            name: name,
            firstName: firstName,
            lastName: lastName,
            phone: phone,
            mobile: mobile,
            nationalId: nationalId,
            avatar: avatar,
            bio: bio,
            roleId: roleId,
            isActive: isActive,
            isDeleted: false,
            scalping: scalping,
            subscriptionStart: subscriptionStart,
            subscriptionEnd: subscriptionEnd,
            subscriptionMonths: subscriptionMonths,
            subscriptionType: subscriptionType,
            analysisLimit: analysisLimit,
            analysisLimit24h: analysisLimit24h,
            analysisUsed24h: analysisUsed24h,
            lastAnalysisReset: lastAnalysisReset,
            lastLoginAt: lastLoginAt,
            loginCount: loginCount
          },
          select: USER_SELECT
        }).then(function(createdUser) {
          res.status(201).json({
            success: true,
            message: 'User created successfully',
            data: formatAdminUser(createdUser)
          });
        });
      });
    });
  }).catch(function(error) {
    console.error('[Admin] Create user error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error creating user',
      error: error.message
    });
  });
});

// ============================================
// PUT /api/admin/users/:id - update user info
// ============================================
router.put('/users/:id', authMiddleware, requireAdmin, function(req, res) {
  var userId = toInt(req.params.id, NaN);

  if (isNaN(userId)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid user ID'
    });
  }

  var body = req.body || {};
  var updateData = {};

  if (body.name !== undefined) updateData.name = normalizeString(body.name);
  if (body.firstName !== undefined) updateData.firstName = normalizeString(body.firstName);
  if (body.lastName !== undefined) updateData.lastName = normalizeString(body.lastName);
  if (body.email !== undefined) updateData.email = normalizeString(body.email);
  if (body.phone !== undefined) updateData.phone = normalizeString(body.phone);
  if (body.mobile !== undefined) updateData.mobile = normalizeString(body.mobile);
  if (body.nationalId !== undefined) updateData.nationalId = normalizeString(body.nationalId);
  if (body.avatar !== undefined) updateData.avatar = normalizeString(body.avatar);
  if (body.bio !== undefined) updateData.bio = normalizeString(body.bio);
  if (body.isActive !== undefined) updateData.isActive = normalizeBoolean(body.isActive, true);
  if (body.scalping !== undefined) updateData.scalping = normalizeBoolean(body.scalping, false);
  if (body.roleId !== undefined) updateData.roleId = toInt(body.roleId, undefined);
  if (body.subscriptionType !== undefined) updateData.subscriptionType = normalizeString(body.subscriptionType) || 'free';

  if (body.subscriptionMonths !== undefined) {
    updateData.subscriptionMonths = toInt(body.subscriptionMonths, 0);
  }

  if (body.analysisLimit !== undefined) {
    updateData.analysisLimit = toInt(body.analysisLimit, 0);
  }

  if (body.analysisLimit24h !== undefined) {
    updateData.analysisLimit24h = toInt(body.analysisLimit24h, 0);
  }

  if (body.analysisUsed24h !== undefined) {
    updateData.analysisUsed24h = toInt(body.analysisUsed24h, 0);
  }

  if (body.loginCount !== undefined) {
    updateData.loginCount = toInt(body.loginCount, 0);
  }

  if (body.subscriptionStart !== undefined) {
    if (body.subscriptionStart === null || body.subscriptionStart === '') {
      updateData.subscriptionStart = null;
    } else {
      var subStart = new Date(body.subscriptionStart);
      if (isNaN(subStart.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid subscriptionStart value'
        });
      }
      updateData.subscriptionStart = subStart;
    }
  }

  if (body.subscriptionEnd !== undefined) {
    if (body.subscriptionEnd === null || body.subscriptionEnd === '') {
      updateData.subscriptionEnd = null;
    } else {
      var subEnd = new Date(body.subscriptionEnd);
      if (isNaN(subEnd.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid subscriptionEnd value'
        });
      }
      updateData.subscriptionEnd = subEnd;
    }
  }

  if (body.lastAnalysisReset !== undefined) {
    if (body.lastAnalysisReset === null || body.lastAnalysisReset === '') {
      updateData.lastAnalysisReset = null;
    } else {
      var lar = new Date(body.lastAnalysisReset);
      if (isNaN(lar.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid lastAnalysisReset value'
        });
      }
      updateData.lastAnalysisReset = lar;
    }
  }

  if (body.lastLoginAt !== undefined) {
    if (body.lastLoginAt === null || body.lastLoginAt === '') {
      updateData.lastLoginAt = null;
    } else {
      var lla = new Date(body.lastLoginAt);
      if (isNaN(lla.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid lastLoginAt value'
        });
      }
      updateData.lastLoginAt = lla;
    }
  }

  if (Object.keys(updateData).length === 0) {
    return res.status(400).json({
      success: false,
      message: 'No fields to update'
    });
  }

  prisma.user.findUnique({
    where: { id: userId }
  }).then(function(existingUser) {
    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    var currentUserId = req.user && (req.user.id || req.user.userId);
    if (
      Number(currentUserId) === userId &&
      updateData.isActive === false
    ) {
      return res.status(400).json({
        success: false,
        message: 'You cannot deactivate your own account'
      });
    }

    var checks = [];

    if (updateData.email !== undefined && updateData.email !== null && updateData.email !== '') {
      checks.push(
        prisma.user.findFirst({
          where: {
            email: updateData.email,
            id: { not: userId }
          }
        })
      );
    } else {
      checks.push(Promise.resolve(null));
    }

    if (updateData.phone !== undefined && updateData.phone !== null && updateData.phone !== '') {
      checks.push(
        prisma.user.findFirst({
          where: {
            phone: updateData.phone,
            id: { not: userId }
          }
        })
      );
    } else {
      checks.push(Promise.resolve(null));
    }

    if (updateData.mobile !== undefined && updateData.mobile !== null && updateData.mobile !== '') {
      checks.push(
        prisma.user.findFirst({
          where: {
            mobile: updateData.mobile,
            id: { not: userId }
          }
        })
      );
    } else {
      checks.push(Promise.resolve(null));
    }

    if (updateData.nationalId !== undefined && updateData.nationalId !== null && updateData.nationalId !== '') {
      checks.push(
        prisma.user.findFirst({
          where: {
            nationalId: updateData.nationalId,
            id: { not: userId }
          }
        })
      );
    } else {
      checks.push(Promise.resolve(null));
    }

    if (updateData.roleId !== undefined) {
      checks.push(
        prisma.role.findUnique({
          where: { id: updateData.roleId }
        })
      );
    } else {
      checks.push(Promise.resolve(true));
    }

    return Promise.all(checks).then(function(results) {
      var duplicateEmailUser = results[0];
      var duplicatePhoneUser = results[1];
      var duplicateMobileUser = results[2];
      var duplicateNationalIdUser = results[3];
      var validRole = results[4];

      if (duplicateEmailUser) {
        return res.status(409).json({
          success: false,
          message: 'Another user already uses this email'
        });
      }

      if (duplicatePhoneUser) {
        return res.status(409).json({
          success: false,
          message: 'Another user already uses this phone'
        });
      }

      if (duplicateMobileUser) {
        return res.status(409).json({
          success: false,
          message: 'Another user already uses this mobile'
        });
      }

      if (duplicateNationalIdUser) {
        return res.status(409).json({
          success: false,
          message: 'Another user already uses this national ID'
        });
      }

      if (updateData.roleId !== undefined && !validRole) {
        return res.status(400).json({
          success: false,
          message: 'Invalid roleId'
        });
      }

      return prisma.user.update({
        where: { id: userId },
        data: updateData,
        select: USER_SELECT
      }).then(function(user) {
        res.json({
          success: true,
          message: 'User updated successfully',
          data: formatAdminUser(user)
        });
      });
    });
  }).catch(function(error) {
    console.error('[Admin] User update error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error updating user',
      error: error.message
    });
  });
});

// ============================================
// PUT /api/admin/users/:id/subscription - manage subscription
// ============================================
router.put('/users/:id/subscription', authMiddleware, requireAdmin, function(req, res) {
  var userId = toInt(req.params.id, NaN);

  if (isNaN(userId)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid user ID'
    });
  }

  var body = req.body || {};
  var updateData = {};

  if (body.subscriptionMonths !== undefined) {
    updateData.subscriptionMonths = toInt(body.subscriptionMonths, 0);
  }

  if (body.analysisLimit !== undefined) {
    updateData.analysisLimit = toInt(body.analysisLimit, 0);
  }

  if (body.analysisLimit24h !== undefined) {
    updateData.analysisLimit24h = toInt(body.analysisLimit24h, 0);
  }

  if (body.analysisUsed24h !== undefined) {
    updateData.analysisUsed24h = toInt(body.analysisUsed24h, 0);
  }

  if (body.subscriptionType !== undefined) {
    updateData.subscriptionType = normalizeString(body.subscriptionType) || 'free';
  }

  if (body.subscriptionStart !== undefined) {
    if (body.subscriptionStart === null || body.subscriptionStart === '') {
      updateData.subscriptionStart = null;
    } else {
      var startDate = new Date(body.subscriptionStart);
      if (isNaN(startDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid subscriptionStart value'
        });
      }
      updateData.subscriptionStart = startDate;
    }
  } else if (body.subscriptionMonths !== undefined && toInt(body.subscriptionMonths, 0) > 0) {
    updateData.subscriptionStart = new Date();
  }

  if (body.subscriptionEnd !== undefined) {
    if (body.subscriptionEnd === null || body.subscriptionEnd === '') {
      updateData.subscriptionEnd = null;
    } else {
      var endDate = new Date(body.subscriptionEnd);
      if (isNaN(endDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid subscriptionEnd value'
        });
      }
      updateData.subscriptionEnd = endDate;
    }
  }

  if (Object.keys(updateData).length === 0) {
    return res.status(400).json({
      success: false,
      message: 'No subscription fields to update'
    });
  }

  prisma.user.findUnique({
    where: { id: userId }
  }).then(function(existingUser) {
    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    return prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: USER_SELECT
    }).then(function(user) {
      var formatted = formatAdminUser(user);

      res.json({
        success: true,
        message: 'Subscription updated successfully',
        data: {
          id: formatted.id,
          username: formatted.username,
          subscriptionStart: formatted.subscriptionStart,
          subscriptionEnd: formatted.subscriptionEnd,
          subscriptionMonths: formatted.subscriptionMonths,
          subscriptionType: formatted.subscriptionType,
          analysisLimit: formatted.analysisLimit,
          analysisLimit24h: formatted.analysisLimit24h,
          analysisUsed24h: formatted.analysisUsed24h,
          remainingDays: formatted.remainingDays,
          isSubscriptionActive: formatted.isSubscriptionActive
        }
      });
    });
  }).catch(function(error) {
    console.error('[Admin] Subscription update error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error updating subscription',
      error: error.message
    });
  });
});

// ============================================
// PUT /api/admin/users/:id/toggle-active - activate/deactivate
// ============================================
router.put('/users/:id/toggle-active', authMiddleware, requireAdmin, function(req, res) {
  var userId = toInt(req.params.id, NaN);

  if (isNaN(userId)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid user ID'
    });
  }

  var currentUserId = req.user && (req.user.id || req.user.userId);
  if (userId === Number(currentUserId)) {
    return res.status(400).json({
      success: false,
      message: 'You cannot change your own active status'
    });
  }

  prisma.user.findUnique({
    where: { id: userId }
  }).then(function(existing) {
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (existing.isDeleted) {
      return res.status(400).json({
        success: false,
        message: 'Cannot toggle active status for a deleted user'
      });
    }

    return prisma.user.update({
      where: { id: userId },
      data: { isActive: !existing.isActive },
      select: USER_SELECT
    }).then(function(updated) {
      res.json({
        success: true,
        message: updated.isActive ? 'User activated' : 'User deactivated',
        data: formatAdminUser(updated)
      });
    });
  }).catch(function(error) {
    console.error('[Admin] Toggle active error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error toggling user status',
      error: error.message
    });
  });
});

// ============================================
// PUT /api/admin/users/:id/reset-password - admin reset user password
// ============================================
router.put('/users/:id/reset-password', authMiddleware, requireAdmin, function(req, res) {
  var userId = toInt(req.params.id, NaN);

  if (isNaN(userId)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid user ID'
    });
  }

  var body = req.body || {};
  var newPassword = body.newPassword ? String(body.newPassword) : '';

  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({
      success: false,
      message: 'New password must be at least 6 characters'
    });
  }

  prisma.user.findUnique({
    where: { id: userId }
  }).then(function(existingUser) {
    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    return hashPassword(newPassword).then(function(hashedPassword) {
      return prisma.user.update({
        where: { id: userId },
        data: {
          passwordHash: hashedPassword
        }
      }).then(function() {
        res.json({
          success: true,
          message: 'User password reset successfully'
        });
      });
    });
  }).catch(function(error) {
    console.error('[Admin] Reset password error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error resetting user password',
      error: error.message
    });
  });
});

// ============================================
// DELETE /api/admin/users/:id - soft delete user
// ============================================
router.delete('/users/:id', authMiddleware, requireAdmin, function(req, res) {
  var userId = toInt(req.params.id, NaN);

  if (isNaN(userId)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid user ID'
    });
  }

  var currentUserId = req.user && (req.user.id || req.user.userId);
  if (userId === Number(currentUserId)) {
    return res.status(400).json({
      success: false,
      message: 'Cannot delete your own account'
    });
  }

  prisma.user.findUnique({
    where: { id: userId }
  }).then(function(existingUser) {
    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    return prisma.user.update({
      where: { id: userId },
      data: {
        isDeleted: true,
        isActive: false
      }
    }).then(function() {
      res.json({
        success: true,
        message: 'User deleted successfully'
      });
    });
  }).catch(function(error) {
    console.error('[Admin] User delete error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error deleting user',
      error: error.message
    });
  });
});

// ============================================
// GET /api/admin/roles - list all roles
// ============================================
router.get('/roles', authMiddleware, requireAdmin, function(req, res) {
  prisma.role.findMany({
    select: {
      id: true,
      name: true,
      title: true,
      _count: {
        select: { users: true }
      }
    },
    orderBy: { id: 'asc' }
  }).then(function(roles) {
    var formatted = [];

    for (var i = 0; i < roles.length; i++) {
      formatted.push({
        id: roles[i].id,
        name: roles[i].name,
        title: firstDefined(roles[i].title, roles[i].name, null),
        userCount: roles[i]._count ? roles[i]._count.users : 0
      });
    }

    res.json({
      success: true,
      data: formatted
    });
  }).catch(function(error) {
    console.error('[Admin] Roles error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error fetching roles',
      error: error.message
    });
  });
});

// ============================================
// GET /api/admin/logs - fetch logs
// ============================================
router.get('/logs', authMiddleware, requireAdmin, function(req, res) {
  var page = toInt(req.query.page, 1);
  var limit = toInt(req.query.limit, 50);
  var level = req.query.level || '';
  var offset = (page - 1) * limit;

  var countQuery;
  var dataQuery;

  if (level && String(level).trim() !== '') {
    countQuery = prisma.$queryRawUnsafe(
      "SELECT COUNT(*) as cnt FROM [dbo].[LogEntry] WHERE level = '" + String(level).replace(/'/g, "''") + "'"
    );

    dataQuery = function(skip, take) {
      return prisma.$queryRawUnsafe(
        "SELECT id, level, message, createdAt FROM [dbo].[LogEntry] WHERE level = '" +
        String(level).replace(/'/g, "''") + "' ORDER BY id DESC OFFSET " + skip +
        " ROWS FETCH NEXT " + take + " ROWS ONLY"
      );
    };
  } else {
    countQuery = prisma.$queryRawUnsafe(
      'SELECT COUNT(*) as cnt FROM [dbo].[LogEntry]'
    );

    dataQuery = function(skip, take) {
      return prisma.$queryRawUnsafe(
        'SELECT id, level, message, createdAt FROM [dbo].[LogEntry] ORDER BY id DESC OFFSET ' +
        skip + ' ROWS FETCH NEXT ' + take + ' ROWS ONLY'
      );
    };
  }

  countQuery.then(function(countResult) {
    var total = Number(countResult[0].cnt);

    return dataQuery(offset, limit).then(function(logs) {
      res.json({
        success: true,
        data: logs,
        pagination: {
          page: page,
          limit: limit,
          total: total,
          totalPages: Math.ceil(total / limit)
        }
      });
    });
  }).catch(function(dbErr) {
    console.error('[Admin] LogEntry query failed, using file:', dbErr.message);

    var logFile = path.join(__dirname, '..', 'access.log');
    var logs = [];
    var total = 0;

    if (fs.existsSync(logFile)) {
      try {
        var content = fs.readFileSync(logFile, 'utf-8');
        var lines = content.split('\n').filter(function(l) {
          return l.trim() !== '';
        });

        var reversed = lines.reverse().slice(0, 500);
        total = reversed.length;

        var start = offset;
        var end = Math.min(offset + limit, total);

        for (var i = start; i < end; i++) {
          logs.push({
            id: total - i,
            level: 'info',
            message: reversed[i],
            createdAt: new Date()
          });
        }
      } catch (fileErr) {
        console.error('[Admin] File log read error:', fileErr.message);
      }
    }

    res.json({
      success: true,
      data: logs,
      pagination: {
        page: page,
        limit: limit,
        total: total,
        totalPages: Math.ceil(total / limit)
      }
    });
  });
});

// ============================================
// GET /api/admin/stats - system statistics
// ============================================
router.get('/stats', authMiddleware, requireAdmin, function(req, res) {
  Promise.all([
    prisma.user.count().then(function(c) { return { model: 'users', count: c }; }),
    prisma.user.count({ where: { isActive: true } }).then(function(c) { return { model: 'activeUsers', count: c }; }),
    prisma.notification.count().then(function(c) { return { model: 'notifications', count: c }; }),
    prisma.conversation.count().then(function(c) { return { model: 'conversations', count: c }; }),
    prisma.message.count().then(function(c) { return { model: 'messages', count: c }; }),
    prisma.analysisHistory.count().then(function(c) { return { model: 'analyses', count: c }; }),
    prisma.apiKey.count().then(function(c) { return { model: 'apiKeys', count: c }; }),
    prisma.session.count().then(function(c) { return { model: 'sessions', count: c }; })
  ]).then(function(counts) {
    var stats = {};

    for (var i = 0; i < counts.length; i++) {
      stats[counts[i].model] = counts[i].count;
    }

    res.json({
      success: true,
      data: stats
    });
  }).catch(function(error) {
    console.error('[Admin] Stats error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error fetching stats',
      error: error.message
    });
  });
});

// ============================================
// GET /api/admin/health - admin health check
// ============================================
router.get('/health', authMiddleware, requireAdmin, function(req, res) {
  var startTime = Date.now();

  prisma.$queryRawUnsafe('SELECT 1 as ok').then(function() {
    var dbTime = Date.now() - startTime;

    res.json({
      success: true,
      data: {
        status: 'healthy',
        database: 'connected',
        dbResponseTime: dbTime + 'ms',
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        timestamp: new Date().toISOString()
      }
    });
  }).catch(function(error) {
    res.status(500).json({
      success: true,
      data: {
        status: 'degraded',
        database: 'error',
        error: error.message,
        timestamp: new Date().toISOString()
      }
    });
  });
});

module.exports = router;
