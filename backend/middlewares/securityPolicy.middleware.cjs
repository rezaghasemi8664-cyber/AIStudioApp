'use strict';

const { prisma } = require('../config/prisma.cjs');

const DEFAULT_SECURITY = {
  passwordMinLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSpecial: false,
  maxLoginAttempts: 20,
  lockoutMinutes: 15,
  sessionMaxAgeHours: 24,
  maxSessionsPerUser: 5,
};

let cached = null;
let cachedAt = 0;
const CACHE_MS = 5000;

async function getSecurityPolicy() {
  const now = Date.now();
  if (cached && now - cachedAt < CACHE_MS) return cached;
  try {
    const row = await prisma.globalSetting.findUnique({ where: { key: 'security.policy' } });
    if (!row || row.category !== 'security') return DEFAULT_SECURITY;
    const value = JSON.parse(row.value);
    cached = { ...DEFAULT_SECURITY, ...value };
    cachedAt = now;
    return cached;
  } catch (_) {
    return cached || DEFAULT_SECURITY;
  }
}

function invalidateSecurityPolicyCache() {
  cached = null;
  cachedAt = 0;
}

function validatePassword(password, policy) {
  const value = String(password || '');
  const errors = [];
  if (value.length < Number(policy.passwordMinLength || 8)) errors.push(`رمز عبور باید حداقل ${policy.passwordMinLength} کاراکتر باشد.`);
  if (policy.requireUppercase && !/[A-Z]/.test(value)) errors.push('رمز عبور باید حداقل یک حرف بزرگ لاتین داشته باشد.');
  if (policy.requireLowercase && !/[a-z]/.test(value)) errors.push('رمز عبور باید حداقل یک حرف کوچک لاتین داشته باشد.');
  if (policy.requireNumber && !/\d/.test(value)) errors.push('رمز عبور باید حداقل یک عدد داشته باشد.');
  if (policy.requireSpecial && ![^A-Za-z0-9\s]/.test(value)) errors.push('رمز عبور باید حداقل یک کاراکتر ویژه داشته باشد.');
  return { valid: errors.length === 0, errors };
}

module.exports = { DEFAULT_SECURITY, getSecurityPolicy, invalidateSecurityPolicyCache, validatePassword };
