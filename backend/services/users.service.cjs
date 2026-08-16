// backend/services/users.service.cjs
'use strict';

const bcrypt = require('bcryptjs');
const prisma = require('../config/prisma.cjs');

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);

function toNullableTrimmedString(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s ? s : null;
}

function normalizeUsername(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function normalizeEmail(value) {
  if (value === undefined || value === null) return null;
  const email = String(value).trim().toLowerCase();
  return email || null;
}

function isValidEmail(email) {
  if (!email) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function buildDisplayName({
  name,
  firstName,
  lastName,
  fallbackUsername,
}) {
  const explicitName = toNullableTrimmedString(name);
  if (explicitName) return explicitName;

  const f = toNullableTrimmedString(firstName);
  const l = toNullableTrimmedString(lastName);
  const combined = [f, l].filter(Boolean).join(' ').trim();

  return combined || fallbackUsername || '';
}

async function resolveRoleId(roleId) {
  if (roleId !== undefined && roleId !== null && roleId !== '') {
    const parsedRoleId = parseInt(roleId, 10);
    if (isNaN(parsedRoleId)) {
      throw new Error('INVALID_ROLE');
    }

    const role = await prisma.role.findUnique({
      where: { id: parsedRoleId },
      select: { id: true, name: true },
    });

    if (!role) {
      throw new Error('INVALID_ROLE');
    }

    return role.id;
  }

  const defaultRole = await prisma.role.findUnique({
    where: { name: 'USER' },
    select: { id: true, name: true },
  });

  if (!defaultRole) {
    throw new Error('DEFAULT_USER_ROLE_NOT_FOUND');
  }

  return defaultRole.id;
}

function mapUniqueConstraintError(error) {
  if (!error || error.code !== 'P2002') return error;

  const target = Array.isArray(error.meta?.target)
    ? error.meta.target
    : typeof error.meta?.target === 'string'
      ? [error.meta.target]
      : [];

  if (target.some((item) => String(item).includes('username'))) {
    return new Error('USERNAME_EXISTS');
  }

  if (target.some((item) => String(item).includes('email'))) {
    return new Error('EMAIL_EXISTS');
  }

  return new Error('UNIQUE_CONSTRAINT_FAILED');
}

async function createUser({
  username,
  password,
  email,
  name,
  firstName,
  lastName,
  phone,
  mobile,
  nationalId,
  avatar,
  bio,
  roleId,
  isActive,
  analysisLimit,
  analysisLimit24h,
}) {
  const normalizedUsername = normalizeUsername(username);
  const normalizedPassword = typeof password === 'string' ? password : '';
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedUsername) {
    throw new Error('USERNAME_REQUIRED');
  }

  if (!normalizedPassword) {
    throw new Error('PASSWORD_REQUIRED');
  }

  if (normalizedPassword.length < 6) {
    throw new Error('PASSWORD_TOO_SHORT');
  }

  if (normalizedEmail && !isValidEmail(normalizedEmail)) {
    throw new Error('INVALID_EMAIL');
  }

  const existing = await prisma.user.findFirst({
    where: {
      OR: [
        { username: normalizedUsername },
        normalizedEmail ? { email: normalizedEmail } : undefined,
      ].filter(Boolean),
    },
    select: {
      id: true,
      username: true,
      email: true,
    },
  });

  if (existing) {
    if (existing.username === normalizedUsername) {
      throw new Error('USERNAME_EXISTS');
    }

    if (normalizedEmail && existing.email === normalizedEmail) {
      throw new Error('EMAIL_EXISTS');
    }

    throw new Error('USER_ALREADY_EXISTS');
  }

  const finalRoleId = await resolveRoleId(roleId);
  const passwordHash = await bcrypt.hash(normalizedPassword, BCRYPT_ROUNDS);

  try {
    const user = await prisma.user.create({
      data: {
        username: normalizedUsername,
        passwordHash,
        email: normalizedEmail,
        name: buildDisplayName({
          name,
          firstName,
          lastName,
          fallbackUsername: normalizedUsername,
        }),
        firstName: toNullableTrimmedString(firstName),
        lastName: toNullableTrimmedString(lastName),
        phone: toNullableTrimmedString(phone),
        mobile: toNullableTrimmedString(mobile),
        nationalId: toNullableTrimmedString(nationalId),
        avatar: toNullableTrimmedString(avatar),
        bio: toNullableTrimmedString(bio),
        roleId: finalRoleId,
        ...(typeof isActive === 'boolean' ? { isActive } : {}),
        ...(analysisLimit !== undefined && analysisLimit !== null
          ? { analysisLimit: parseInt(analysisLimit, 10) || 0 }
          : {}),
        ...(analysisLimit24h !== undefined && analysisLimit24h !== null
          ? { analysisLimit24h: parseInt(analysisLimit24h, 10) || 0 }
          : {}),
      },
      include: {
        Role: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return user;
  } catch (error) {
    throw mapUniqueConstraintError(error);
  }
}

module.exports = {
  createUser,
};
