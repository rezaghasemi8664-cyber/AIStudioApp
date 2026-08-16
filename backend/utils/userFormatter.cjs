// backend/utils/userFormatter.cjs
// User Formatter Utility
// Centralized formatting for user objects in API responses
'use strict';

/**
 * Return first value that is not undefined/null
 * Preserves falsy values like 0 / false / ''
 * @returns {*}
 */
function firstDefined() {
  for (var i = 0; i < arguments.length; i += 1) {
    if (arguments[i] !== undefined && arguments[i] !== null) {
      return arguments[i];
    }
  }
  return null;
}

/**
 * Safely convert value to integer with fallback
 * @param {*} value
 * @param {number} fallback
 * @returns {number}
 */
function toInt(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  var num = Number(value);
  return Number.isFinite(num) ? Math.trunc(num) : fallback;
}

/**
 * Safely get role object from user - handles both 'Role' and 'role'
 * @param {Object} user
 * @returns {Object|null}
 */
function getUserRole(user) {
  if (!user) return null;
  return user.Role || user.role || null;
}

/**
 * Build Prisma `include` clause for user queries
 * @param {Object} opts - Options
 * @param {boolean} opts.settings - Include user settings relation
 * @returns {Object} Prisma include object
 */
function getUserInclude(opts) {
  var include = { Role: true };

  if (opts && opts.settings) {
    include.settings = true;
  }

  return include;
}

/**
 * Build Prisma `select` clause for user queries
 * Returns all fields needed by frontend + Role relation
 * @returns {Object}
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
        title: true
      }
    }
  };
}

/**
 * Format a single user object for API response
 * @param {Object} user - Raw Prisma user object
 * @param {Object} opts - Options
 * @param {boolean} opts.isAdmin - Include admin-level fields
 * @param {boolean} opts.includeSettings - Include settings in response
 * @returns {Object|null} Formatted user object
 */
function formatUser(user, opts) {
  if (!user) return null;

  var options = opts || {};
  var role = getUserRole(user);

  var firstName = firstDefined(user.firstName, null);
  var lastName = firstDefined(user.lastName, null);
  var fullNameFromParts = ((firstName || '') + ' ' + (lastName || '')).trim();
  var name = firstDefined(user.name, fullNameFromParts || null, user.username, '');

  var subscriptionStart = firstDefined(user.subscriptionStart, null);
  var subscriptionEnd = firstDefined(user.subscriptionEnd, null);
  var subscriptionMonths = toInt(firstDefined(user.subscriptionMonths, 0), 0);
  var subscriptionType = firstDefined(user.subscriptionType, 'free');

  var analysisLimit = firstDefined(user.analysisLimit24h, user.analysisLimit, 5);
  var analysisLimit24h = firstDefined(user.analysisLimit24h, user.analysisLimit, 5);
  var analysisUsed24h = toInt(firstDefined(user.analysisUsed24h, 0), 0);

  var formatted = {
    id: user.id,
    username: user.username,
    name: name,
    firstName: firstName,
    lastName: lastName,
    email: firstDefined(user.email, null),
    mobile: firstDefined(user.mobile, user.phone, null),
    phone: firstDefined(user.phone, user.mobile, null),
    nationalId: firstDefined(user.nationalId, null),
    bio: firstDefined(user.bio, null),
    avatar: firstDefined(user.avatar, null),
    isActive: typeof user.isActive === 'boolean' ? user.isActive : true,
    roleId: firstDefined(user.roleId, null),
    roleName: role ? firstDefined(role.name, null) : null,
    roleTitle: role ? firstDefined(role.title, role.name, null) : null,
    scalping: firstDefined(user.scalping, null),
    createdAt: firstDefined(user.createdAt, null),
    updatedAt: firstDefined(user.updatedAt, null),

    // Subscription info
    subscriptionStart: subscriptionStart,
    subscriptionEnd: subscriptionEnd,
    subscriptionMonths: subscriptionMonths,
    subscriptionType: subscriptionType,
    analysisLimit: analysisLimit,
    analysisLimit24h: analysisLimit24h,
    analysisUsed24h: analysisUsed24h
  };

  // Subscription status calculation
  if (formatted.subscriptionEnd) {
    var now = new Date();
    var endDate = new Date(formatted.subscriptionEnd);

    if (!Number.isNaN(endDate.getTime())) {
      formatted.isSubscriptionActive = endDate > now;
      formatted.daysRemaining = Math.max(
        0,
        Math.ceil((endDate - now) / (1000 * 60 * 60 * 24))
      );
    } else {
      formatted.isSubscriptionActive = false;
      formatted.daysRemaining = 0;
    }
  } else if (formatted.subscriptionStart && formatted.subscriptionMonths > 0) {
    var start = new Date(formatted.subscriptionStart);

    if (!Number.isNaN(start.getTime())) {
      var calculatedEnd = new Date(start);
      calculatedEnd.setMonth(calculatedEnd.getMonth() + formatted.subscriptionMonths);

      var now2 = new Date();
      formatted.isSubscriptionActive = calculatedEnd > now2;
      formatted.daysRemaining = Math.max(
        0,
        Math.ceil((calculatedEnd - now2) / (1000 * 60 * 60 * 24))
      );
    } else {
      formatted.isSubscriptionActive = false;
      formatted.daysRemaining = 0;
    }
  } else {
    formatted.isSubscriptionActive = false;
    formatted.daysRemaining = 0;
  }

  // Admin-only fields
  if (options.isAdmin) {
    formatted.isDeleted = !!user.isDeleted;
    formatted.lastLoginAt = firstDefined(user.lastLoginAt, null);
    formatted.loginCount = toInt(firstDefined(user.loginCount, 0), 0);
    formatted.lastAnalysisReset = firstDefined(user.lastAnalysisReset, null);
  }

  // Settings
  if (options.includeSettings && user.settings) {
    formatted.settings = user.settings;
  }

  return formatted;
}

/**
 * Format an array of user objects
 * @param {Array} users - Array of raw Prisma user objects
 * @param {Object} opts - Options (passed to formatUser)
 * @returns {Array} Array of formatted user objects
 */
function formatUsers(users, opts) {
  if (!Array.isArray(users)) return [];

  return users.map(function (user) {
    return formatUser(user, opts);
  });
}

module.exports = {
  formatUser: formatUser,
  formatUsers: formatUsers,
  getUserInclude: getUserInclude,
  getUserSelect: getUserSelect,
  getUserRole: getUserRole
};
