'use strict';

const { getSecurityPolicy, validatePassword } = require('./securityPolicy.middleware.cjs');

const failures = new Map();

function clientKey(req) {
  const ip = req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  const identity = String(req.body?.email || req.body?.username || '').trim().toLowerCase();
  return `${ip}:${identity}`;
}

async function loginSecurity(req, res, next) {
  const policy = await getSecurityPolicy();
  const key = clientKey(req);
  const state = failures.get(key);
  if (state && state.lockedUntil > Date.now()) {
    const seconds = Math.max(1, Math.ceil((state.lockedUntil - Date.now()) / 1000));
    return res.status(429).json({ success:false, message:`تلاش‌های ورود بیش از حد مجاز است. ${seconds} ثانیه دیگر دوباره تلاش کنید.`, code:'AUTH_LOCKED' });
  }
  if (state && state.lockedUntil <= Date.now()) failures.delete(key);

  const originalEnd = res.end.bind(res);
  res.end = function (...args) {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      failures.delete(key);
    } else if (res.statusCode === 401 || res.statusCode === 403) {
      const current = failures.get(key) || { count:0, lockedUntil:0 };
      current.count += 1;
      if (current.count >= Number(policy.maxLoginAttempts || 20)) {
        current.lockedUntil = Date.now() + Number(policy.lockoutMinutes || 15) * 60000;
        current.count = 0;
      }
      failures.set(key, current);
    }
    return originalEnd(...args);
  };
  return next();
}

async function passwordSecurity(req, res, next) {
  const policy = await getSecurityPolicy();
  const password = req.body?.newPassword ?? req.body?.password;
  const result = validatePassword(password, policy);
  if (!result.valid) return res.status(400).json({ success:false, message:result.errors.join(' '), code:'PASSWORD_POLICY_VIOLATION', errors:result.errors });
  return next();
}

module.exports = { loginSecurity, passwordSecurity };
