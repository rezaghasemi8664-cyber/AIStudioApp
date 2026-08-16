// services/auth.service.cjs
// ---------------------------------------------------------------
// Auth Service - Business logic for authentication
// Fixed: passwordHash, restore/reactivate flow, normalization
// ---------------------------------------------------------------

const prisma = require('../config/prisma.cjs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { JWT_SECRET, JWT_REFRESH_SECRET } = require('../config/env.cjs');

// ---------------------------------------------
// Helpers
// ---------------------------------------------
function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function resolveRoleName(user) {
  if (!user) return 'USER';

  if (typeof user.role === 'string' && user.role.trim()) {
    return user.role.trim().toUpperCase();
  }

  if (user.role && typeof user.role === 'object' && user.role.name) {
    return String(user.role.name).trim().toUpperCase();
  }

  return 'USER';
}

function buildDisplayName({ firstName, lastName, email, username, name }) {
  if (name && String(name).trim()) return String(name).trim();

  const fullName = [firstName, lastName]
    .filter(Boolean)
    .map(v => String(v).trim())
    .filter(Boolean)
    .join(' ')
    .trim();

  if (fullName) return fullName;

  return email || username || '';
}

async function getDefaultUserRoleId() {
  try {
    const role = await prisma.role.findFirst({
      where: { name: { equals: 'USER' } },
      select: { id: true },
    });

    if (role?.id) return role.id;
  } catch (_) {
    // ignore and fallback
  }

  return 1;
}

// ---------------------------------------------
// Helper: Build safe user object
// ---------------------------------------------
function buildSafeUser(user) {
  if (!user) return null;

  const roleName = resolveRoleName(user);
  const isAdmin = roleName === 'ADMIN';
  const isGuest = roleName === 'GUEST';

  let isSubscriptionActive = false;
  let subscriptionEnd = null;

  if (isAdmin) {
    isSubscriptionActive = true;
    subscriptionEnd = null;
  } else if (user.subscriptionEnd) {
    subscriptionEnd = user.subscriptionEnd instanceof Date
      ? user.subscriptionEnd.toISOString()
      : user.subscriptionEnd;

    isSubscriptionActive = new Date(subscriptionEnd) > new Date();
  } else if (user.subscriptionMonths && user.subscriptionMonths > 0 && user.createdAt) {
    const endDate = new Date(user.createdAt);
    endDate.setMonth(endDate.getMonth() + user.subscriptionMonths);
    subscriptionEnd = endDate.toISOString();
    isSubscriptionActive = endDate > new Date();
  }

  return {
    id: user.id,
    username: user.username || user.email || '',
    email: user.email || '',
    firstName: user.firstName || '',
    lastName: user.lastName || '',
    name: user.name || buildDisplayName(user),
    phone: user.phone || user.mobile || '',
    mobile: user.mobile || user.phone || '',
    role: roleName,
    roleId: user.roleId ?? null,
    isAdmin,
    isGuest,
    isActive: user.isActive !== false,
    isDeleted: user.isDeleted === true,
    createdAt: user.createdAt || null,
    updatedAt: user.updatedAt || null,
    lastLogin: user.lastLogin || null,
    isSubscriptionActive,
    subscriptionEnd,
    subscriptionMonths: isAdmin ? 9999 : (user.subscriptionMonths || 0),
    analysisLimit: isAdmin ? 999999 : (user.analysisLimit || 0),
    analysisUsed: user.analysisUsed || 0,
    profileImage: user.profileImage || user.avatar || null,
    theme: user.theme || 'system',
  };
}

// ---------------------------------------------
// Generate tokens
// ---------------------------------------------
function generateTokens(user) {
  const roleName = resolveRoleName(user);

  const payload = {
    userId: user.id,
    email: user.email || null,
    username: user.username || null,
    role: roleName,
  };

  const accessToken = jwt.sign(
    payload,
    JWT_SECRET || 'fallback-secret-key',
    { expiresIn: '24h' }
  );

  const refreshToken = jwt.sign(
    payload,
    JWT_REFRESH_SECRET || JWT_SECRET || 'fallback-refresh-key',
    { expiresIn: '7d' }
  );

  return { accessToken, refreshToken };
}

// ---------------------------------------------
// Login user
// ---------------------------------------------
async function loginUser(identifier, password) {
  const normalizedIdentifier = normalizeEmail(identifier);

  if (!normalizedIdentifier || !password) {
    throw Object.assign(new Error('Email/username and password are required'), { status: 400 });
  }

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: normalizedIdentifier },
        { username: normalizedIdentifier },
      ],
    },
    include: {
      role: true,
    },
  });

  if (!user || user.isDeleted === true) {
    throw Object.assign(new Error('Invalid credentials'), { status: 401 });
  }

  if (user.isActive === false) {
    throw Object.assign(new Error('Account is locked'), { status: 423 });
  }

  const storedPasswordHash = user.passwordHash || user.password || null;
  if (!storedPasswordHash) {
    throw Object.assign(new Error('User password is not configured correctly'), { status: 500 });
  }

  const isPasswordValid = await bcrypt.compare(password, storedPasswordHash);
  if (!isPasswordValid) {
    throw Object.assign(new Error('Invalid credentials'), { status: 401 });
  }

  let updatedUser = user;

  try {
    updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
      include: { role: true },
    });
  } catch (e) {
    console.warn('[AuthService] Failed to update lastLogin:', e.message);
  }

  const tokens = generateTokens(updatedUser);
  const safeUser = buildSafeUser(updatedUser);

  return {
    ...tokens,
    restored: false,
    user: safeUser,
  };
}

// ---------------------------------------------
// Register user
// ---------------------------------------------
async function registerUser(data) {
  const firstName = normalizeText(data?.firstName);
  const lastName = normalizeText(data?.lastName);
  const mobile = normalizeText(data?.mobile);
  const phone = normalizeText(data?.phone);
  const rawPassword = typeof data?.password === 'string' ? data.password : '';
  const email = normalizeEmail(data?.email);

  if (!email || !rawPassword) {
    throw Object.assign(new Error('Email and password are required'), { status: 400 });
  }

  if (rawPassword.length < 6) {
    throw Object.assign(new Error('Password must be at least 6 characters'), { status: 400 });
  }

  const username = email;
  const passwordHash = await bcrypt.hash(rawPassword, 12);

  const existing = await prisma.user.findFirst({
    where: {
      OR: [
        { email },
        { username },
      ],
    },
    include: {
      role: true,
    },
  });

  // Active existing user => duplicate
  if (existing && existing.isDeleted !== true && existing.isActive !== false) {
    throw Object.assign(new Error('User already exists'), { status: 409 });
  }

  // Restore deleted/inactive user
  if (existing && (existing.isDeleted === true || existing.isActive === false)) {
    const restored = await prisma.user.update({
      where: { id: existing.id },
      data: {
        email,
        username,
        passwordHash,
        firstName,
        lastName,
        name: buildDisplayName({ firstName, lastName, email, username }),
        phone: mobile || phone || existing.phone || null,
        isDeleted: false,
        isActive: true,
        updatedAt: new Date(),
      },
      include: {
        role: true,
      },
    });

    const tokens = generateTokens(restored);
    const safeUser = buildSafeUser(restored);

    return {
      ...tokens,
      restored: true,
      user: safeUser,
    };
  }

  const defaultRoleId = await getDefaultUserRoleId();

  const newUser = await prisma.user.create({
    data: {
      email,
      username,
      passwordHash,
      firstName,
      lastName,
      name: buildDisplayName({ firstName, lastName, email, username }),
      phone: mobile || phone || null,
      roleId: defaultRoleId,
      isActive: true,
      isDeleted: false,
      subscriptionMonths: 0,
      analysisLimit: 5,
      analysisUsed: 0,
    },
    include: {
      role: true,
    },
  });

  const tokens = generateTokens(newUser);
  const safeUser = buildSafeUser(newUser);

  return {
    ...tokens,
    restored: false,
    user: safeUser,
  };
}

// ---------------------------------------------
// Verify token
// ---------------------------------------------
async function verifyToken(token) {
  if (!token) {
    throw Object.assign(new Error('No token provided'), { status: 400 });
  }

  const decoded = jwt.verify(token, JWT_SECRET || 'fallback-secret-key');

  const user = await prisma.user.findUnique({
    where: { id: decoded.userId },
    include: { role: true },
  });

  if (!user || user.isDeleted === true) {
    throw Object.assign(new Error('User not found'), { status: 404 });
  }

  if (user.isActive === false) {
    throw Object.assign(new Error('Account is locked'), { status: 423 });
  }

  return buildSafeUser(user);
}

// ---------------------------------------------
// Get user by ID
// ---------------------------------------------
async function getUserById(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: true },
  });

  if (!user || user.isDeleted === true) return null;
  return buildSafeUser(user);
}

// ---------------------------------------------
// EXPORTS
// ---------------------------------------------
module.exports = {
  buildSafeUser,
  generateTokens,
  loginUser,
  registerUser,
  verifyToken,
  getUserById,
};
