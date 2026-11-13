'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const prismaModule = require('../config/prisma.cjs');
const prisma = prismaModule.prisma || prismaModule.default || prismaModule;
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');

let env = {};
try { env = require('../config/env.cjs'); } catch (_) {}

const ENABLED_KEY = 'passkey.login.enabled';
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function userIdOf(req) {
  const value = Number(req.user?.userId || req.user?.id);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function getWebAuthnConfig(req) {
  const requestOrigin = String(req.headers.origin || '').trim();
  const configuredOrigins = String(process.env.WEBAUTHN_ORIGIN || '')
    .split(',').map(value => value.trim()).filter(Boolean);
  if (!requestOrigin) throw Object.assign(new Error('مبدأ درخواست برای احراز هویت بیومتریک مشخص نیست.'), { status: 400 });
  if (configuredOrigins.length && !configuredOrigins.includes(requestOrigin)) {
    throw Object.assign(new Error('مبدأ درخواست برای ورود بیومتریک مجاز نیست.'), { status: 403 });
  }
  let parsed;
  try { parsed = new URL(requestOrigin); } catch (_) {
    throw Object.assign(new Error('نشانی مبدأ درخواست معتبر نیست.'), { status: 400 });
  }
  if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
    throw Object.assign(new Error('ورود بیومتریک فقط از طریق HTTPS امکان‌پذیر است.'), { status: 400 });
  }
  const rpID = String(process.env.WEBAUTHN_RP_ID || parsed.hostname).trim().toLowerCase();
  const host = parsed.hostname.toLowerCase();
  if (host !== rpID && !host.endsWith('.' + rpID)) {
    throw Object.assign(new Error('دامنه تنظیم‌شده برای Passkey با مبدأ برنامه مطابقت ندارد.'), { status: 400 });
  }
  if (process.env.NODE_ENV === 'production' && (!process.env.WEBAUTHN_RP_ID || !configuredOrigins.length)) {
    throw Object.assign(new Error('تنظیمات WEBAUTHN_RP_ID و WEBAUTHN_ORIGIN روی سرور تکمیل نشده است.'), { status: 503 });
  }
  return {
    rpID,
    rpName: process.env.WEBAUTHN_RP_NAME || 'رونیا',
    expectedOrigin: configuredOrigins.length ? configuredOrigins : [requestOrigin],
  };
}

function credentialHash(credentialId) {
  return crypto.createHash('sha256').update(String(credentialId)).digest('hex');
}

async function createChallenge({ userId = null, challenge, purpose }) {
  const now = new Date();
  await prisma.passkeyChallenge.deleteMany({ where: { expiresAt: { lt: now } } });
  await prisma.passkeyChallenge.create({
    data: { userId, challenge, purpose, expiresAt: new Date(now.getTime() + CHALLENGE_TTL_MS) },
  });
}

async function consumeChallenge({ userId = null, challenge, purpose }) {
  if (!challenge || typeof challenge !== 'string') return false;
  const result = await prisma.passkeyChallenge.deleteMany({
    where: { userId, challenge, purpose, expiresAt: { gt: new Date() } },
  });
  return result.count === 1;
}

async function isEnabled(userId) {
  const pref = await prisma.userPreference.findUnique({
    where: { userId_key: { userId, key: ENABLED_KEY } },
    select: { value: true },
  });
  return pref?.value === 'true';
}

async function setEnabled(userId, enabled) {
  await prisma.userPreference.upsert({
    where: { userId_key: { userId, key: ENABLED_KEY } },
    create: { userId, key: ENABLED_KEY, value: enabled ? 'true' : 'false' },
    update: { value: enabled ? 'true' : 'false', updatedAt: new Date() },
  });
}

function parseTransports(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) { return []; }
}

function safeDeviceName(value, fallback) {
  const name = String(value || fallback || 'دستگاه ثبت‌شده').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return (name || 'دستگاه ثبت‌شده').slice(0, 120);
}

async function getSettings(req, res) {
  try {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ success: false, message: 'احراز هویت نامعتبر است.' });
    const [enabled, credentials] = await Promise.all([
      isEnabled(userId),
      prisma.passkeyCredential.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: { id: true, deviceName: true, deviceType: true, backedUp: true, createdAt: true, lastUsedAt: true },
      }),
    ]);
    return res.json({ success: true, data: { enabled, devices: credentials } });
  } catch (error) {
    console.error('[PASSKEY] settings failed:', error?.code || error?.name || 'ERROR');
    return res.status(500).json({ success: false, message: 'دریافت تنظیمات ورود بیومتریک ناموفق بود.' });
  }
}

async function registrationOptions(req, res) {
  try {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ success: false, message: 'احراز هویت نامعتبر است.' });
    const config = getWebAuthnConfig(req);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, email: true, name: true, firstName: true, lastName: true, isActive: true, isDeleted: true },
    });
    if (!user || !user.isActive || user.isDeleted) return res.status(401).json({ success: false, message: 'حساب کاربری غیرفعال یا نامعتبر است.' });
    const existing = await prisma.passkeyCredential.findMany({ where: { userId }, select: { credentialId: true, transportsJson: true } });
    const options = await generateRegistrationOptions({
      rpName: config.rpName,
      rpID: config.rpID,
      userID: new Uint8Array(Buffer.from(String(userId))),
      userName: user.email || user.username || String(userId),
      userDisplayName: user.name || [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || 'کاربر رونیا',
      attestationType: 'none',
      timeout: 60000,
      excludeCredentials: existing.map(item => ({ id: item.credentialId, transports: parseTransports(item.transportsJson) })),
      authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'required', requireResidentKey: true, userVerification: 'required' },
    });
    await createChallenge({ userId, challenge: options.challenge, purpose: 'registration' });
    return res.json({ success: true, data: { options, challenge: options.challenge } });
  } catch (error) {
    console.error('[PASSKEY] registration options failed:', error?.code || error?.name || 'ERROR');
    return res.status(error?.status || 500).json({ success: false, message: error?.message || 'آماده‌سازی ثبت دستگاه ناموفق بود.' });
  }
}

async function verifyRegistration(req, res) {
  try {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ success: false, message: 'احراز هویت نامعتبر است.' });
    const config = getWebAuthnConfig(req);
    const response = req.body?.response;
    const challenge = String(req.body?.challenge || '');
    if (!response?.id || !challenge) return res.status(400).json({ success: false, message: 'اطلاعات ثبت دستگاه ناقص است.' });
    const challengeValid = await consumeChallenge({ userId, challenge, purpose: 'registration' });
    if (!challengeValid) return res.status(400).json({ success: false, message: 'درخواست ثبت دستگاه منقضی یا نامعتبر است. دوباره تلاش کنید.' });
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: config.expectedOrigin,
      expectedRPID: config.rpID,
      requireUserVerification: true,
    });
    if (!verification.verified || !verification.registrationInfo?.credential) {
      return res.status(400).json({ success: false, message: 'تأیید هویت دستگاه انجام نشد.' });
    }
    const credential = verification.registrationInfo.credential;
    const wasEnabled = await isEnabled(userId);
    const existingCount = await prisma.passkeyCredential.count({ where: { userId } });
    const credentialId = credential.id;
    const existing = await prisma.passkeyCredential.findUnique({ where: { credentialIdHash: credentialHash(credentialId) }, select: { id: true } });
    if (existing) return res.status(409).json({ success: false, message: 'این کلید امنیتی قبلاً ثبت شده است.' });
    const fallbackName = req.headers['user-agent'] || 'دستگاه جدید';
    await prisma.passkeyCredential.create({
      data: {
        userId,
        credentialId,
        credentialIdHash: credentialHash(credentialId),
        publicKey: Buffer.from(credential.publicKey),
        counter: BigInt(credential.counter),
        transportsJson: JSON.stringify(credential.transports || response.response?.transports || []),
        deviceName: safeDeviceName(req.body?.deviceName, fallbackName),
        deviceType: verification.registrationInfo.credentialDeviceType,
        backedUp: verification.registrationInfo.credentialBackedUp,
      },
    });
    if (existingCount === 0 || wasEnabled) await setEnabled(userId, true);
    return res.json({ success: true, message: existingCount === 0 ? 'این دستگاه ثبت شد و ورود بیومتریک فعال گردید.' : 'دستگاه جدید با موفقیت ثبت شد.' });
  } catch (error) {
    console.error('[PASSKEY] registration verification failed:', error?.code || error?.name || 'ERROR');
    return res.status(error?.status || 500).json({ success: false, message: error?.message || 'ثبت دستگاه ناموفق بود.' });
  }
}

async function updateEnabled(req, res) {
  try {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ success: false, message: 'احراز هویت نامعتبر است.' });
    if (typeof req.body?.enabled !== 'boolean') return res.status(400).json({ success: false, message: 'وضعیت فعال‌سازی نامعتبر است.' });
    if (req.body.enabled) {
      const count = await prisma.passkeyCredential.count({ where: { userId } });
      if (!count) return res.status(400).json({ success: false, message: 'ابتدا حداقل یک دستگاه را ثبت کنید.' });
    }
    await setEnabled(userId, req.body.enabled);
    return res.json({ success: true, data: { enabled: req.body.enabled } });
  } catch (error) {
    console.error('[PASSKEY] enable setting failed:', error?.code || error?.name || 'ERROR');
    return res.status(500).json({ success: false, message: 'ذخیره وضعیت ورود بیومتریک ناموفق بود.' });
  }
}

async function removeDevice(req, res) {
  try {
    const userId = userIdOf(req);
    const id = Number(req.params?.credentialId);
    if (!userId || !Number.isSafeInteger(id) || id < 1) return res.status(400).json({ success: false, message: 'شناسه دستگاه نامعتبر است.' });
    const removed = await prisma.passkeyCredential.deleteMany({ where: { id, userId } });
    if (!removed.count) return res.status(404).json({ success: false, message: 'دستگاه موردنظر پیدا نشد.' });
    const remaining = await prisma.passkeyCredential.count({ where: { userId } });
    if (!remaining) await setEnabled(userId, false);
    return res.json({ success: true, data: { remaining, enabled: remaining > 0 ? await isEnabled(userId) : false } });
  } catch (error) {
    console.error('[PASSKEY] remove device failed:', error?.code || error?.name || 'ERROR');
    return res.status(500).json({ success: false, message: 'حذف دستگاه ناموفق بود.' });
  }
}

async function removeAllDevices(req, res) {
  try {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ success: false, message: 'احراز هویت نامعتبر است.' });
    await prisma.passkeyCredential.deleteMany({ where: { userId } });
    await setEnabled(userId, false);
    return res.json({ success: true, data: { remaining: 0, enabled: false } });
  } catch (error) {
    console.error('[PASSKEY] remove all devices failed:', error?.code || error?.name || 'ERROR');
    return res.status(500).json({ success: false, message: 'حذف دستگاه‌ها ناموفق بود.' });
  }
}

async function loginOptions(req, res) {
  try {
    const config = getWebAuthnConfig(req);
    const enabledUsers = await prisma.userPreference.findMany({
      where: { key: ENABLED_KEY, value: 'true' },
      select: { userId: true },
    });
    const enabledUserIds = enabledUsers.map(item => item.userId);
    const count = enabledUserIds.length
      ? await prisma.passkeyCredential.count({ where: { userId: { in: enabledUserIds } } })
      : 0;
    if (!count) return res.status(404).json({ success: false, message: 'ورود بیومتریک برای هیچ حسابی فعال نیست.' });
    const options = await generateAuthenticationOptions({
      rpID: config.rpID,
      timeout: 60000,
      userVerification: 'required',
      allowCredentials: [],
    });
    await createChallenge({ challenge: options.challenge, purpose: 'authentication' });
    return res.json({ success: true, data: { options, challenge: options.challenge } });
  } catch (error) {
    console.error('[PASSKEY] login options failed:', error?.code || error?.name || 'ERROR');
    return res.status(error?.status || 500).json({ success: false, message: error?.message || 'آماده‌سازی ورود بیومتریک ناموفق بود.' });
  }
}

function tokenSecret(type) {
  if (type === 'access') return env.JWT_ACCESS_SECRET || process.env.JWT_ACCESS_SECRET || env.JWT_SECRET || process.env.JWT_SECRET || 'fallback-access-secret';
  return env.JWT_REFRESH_SECRET || process.env.JWT_REFRESH_SECRET || env.JWT_SECRET || process.env.JWT_SECRET || 'fallback-refresh-secret';
}
function setAuthCookies(req, res, accessToken, refreshToken) {
  const host = String(req.headers.host || '').toLowerCase();
  const local = host.includes('localhost') || host.startsWith('127.0.0.1');
  const https = req.secure === true || String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https';
  const secure = !local && https;
  const options = { httpOnly: true, secure, sameSite: secure ? 'none' : 'lax', path: '/' };
  res.cookie('accessToken', accessToken, { ...options, maxAge: 86400000 });
  res.cookie('token', accessToken, { ...options, maxAge: 86400000 });
  res.cookie('refreshToken', refreshToken, { ...options, maxAge: 604800000 });
}
function formatPasskeyUser(user) {
  const role = user.Role || {};
  const start = user.subscriptionStart ? new Date(user.subscriptionStart) : null;
  let end = user.subscriptionEnd ? new Date(user.subscriptionEnd) : null;
  if (!end && start && Number(user.subscriptionMonths) > 0) {
    end = new Date(start);
    end.setMonth(end.getMonth() + Number(user.subscriptionMonths));
  }
  const remainingDays = end && !Number.isNaN(end.getTime()) ? Math.max(0, Math.ceil((end.getTime() - Date.now()) / 86400000)) : 0;
  return {
    id: user.id, username: user.username, email: user.email || '',
    name: user.name || [user.firstName, user.lastName].filter(Boolean).join(' '),
    firstName: user.firstName || '', lastName: user.lastName || '',
    phone: user.phone || user.mobile || '', mobile: user.mobile || user.phone || '',
    nationalId: user.nationalId || '', bio: user.bio || '', avatar: user.avatar || '',
    isActive: user.isActive, isDeleted: user.isDeleted || false,
    role: role.name || 'USER', roleName: role.name || 'USER',
    roleTitle: role.title || role.name || 'USER', roleId: user.roleId,
    isAdmin: role.name === 'ADMIN' || role.name === 'SUPERADMIN' || user.roleId === 2,
    subscriptionStart: user.subscriptionStart || null, subscriptionEnd: user.subscriptionEnd || null,
    subscriptionDays: start && end ? Math.max(0, Math.ceil((end.getTime() - start.getTime()) / 86400000)) : 0,
    subscriptionMonths: user.subscriptionMonths || 0, subscriptionType: user.subscriptionType || 'free',
    analysisLimit: user.analysisLimit24h || user.analysisLimit || 0,
    analysisLimit24h: user.analysisLimit24h || user.analysisLimit || 0,
    remainingDays, isSubscriptionActive: remainingDays > 0,
    lastLoginAt: user.lastLoginAt || null, createdAt: user.createdAt, updatedAt: user.updatedAt,
  };
}

async function verifyLogin(req, res) {
  try {
    const config = getWebAuthnConfig(req);
    const response = req.body?.response;
    const challenge = String(req.body?.challenge || '');
    const credentialId = String(response?.id || response?.rawId || '');
    if (!response || !credentialId || !challenge) return res.status(400).json({ success: false, message: 'اطلاعات ورود بیومتریک ناقص است.' });
    const record = await prisma.passkeyCredential.findUnique({ where: { credentialIdHash: credentialHash(credentialId) } });
    if (!record || !(await isEnabled(record.userId))) return res.status(401).json({ success: false, message: 'ورود بیومتریک برای این حساب فعال نیست.' });
    const challengeValid = await consumeChallenge({ challenge, purpose: 'authentication' });
    if (!challengeValid) return res.status(400).json({ success: false, message: 'درخواست ورود منقضی یا نامعتبر است. دوباره تلاش کنید.' });
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: config.expectedOrigin,
      expectedRPID: config.rpID,
      credential: {
        id: record.credentialId,
        publicKey: new Uint8Array(record.publicKey),
        counter: Number(record.counter),
        transports: parseTransports(record.transportsJson),
      },
      requireUserVerification: true,
    });
    if (!verification.verified) return res.status(401).json({ success: false, message: 'تأیید هویت بیومتریک ناموفق بود.' });
    const user = await prisma.user.findUnique({
      where: { id: record.userId },
      select: {
        id: true, username: true, email: true, name: true, firstName: true, lastName: true,
        phone: true, mobile: true, nationalId: true, bio: true, avatar: true,
        isActive: true, isDeleted: true, roleId: true, subscriptionStart: true,
        subscriptionEnd: true, subscriptionMonths: true, subscriptionType: true,
        analysisLimit: true, analysisLimit24h: true, lastLoginAt: true,
        createdAt: true, updatedAt: true,
        Role: { select: { id: true, name: true, title: true } },
      },
    });
    if (!user || !user.isActive || user.isDeleted) return res.status(401).json({ success: false, message: 'حساب کاربری غیرفعال یا نامعتبر است.' });
    const maintenanceRow = await prisma.globalSetting.findUnique({ where: { key: 'maintenance.policy' } }).catch(() => null);
    if (maintenanceRow?.category === 'maintenance') {
      let policy = {};
      try { policy = JSON.parse(maintenanceRow.value) || {}; } catch (_) {}
      const roleName = String(user.Role?.name || '').toUpperCase();
      const isAdmin = roleName === 'ADMIN' || roleName === 'SUPERADMIN' || user.roleId === 2;
      if (policy.enabled === true && !(policy.allowAdmins !== false && isAdmin)) {
        return res.status(503).json({ success: false, code: 'MAINTENANCE_MODE', maintenance: true, message: String(policy.message || 'سامانه موقتاً در حال نگهداری است.').slice(0, 500) });
      }
    }
    await prisma.passkeyCredential.update({
      where: { id: record.id },
      data: { counter: BigInt(verification.authenticationInfo.newCounter), lastUsedAt: new Date(), deviceType: verification.authenticationInfo.credentialDeviceType, backedUp: verification.authenticationInfo.credentialBackedUp },
    });
    const lastLoginAt = new Date();
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt, loginCount: { increment: 1 } } }).catch(() => {});
    const accessToken = jwt.sign({
      userId: user.id, sub: user.id, username: user.username, email: user.email || null,
      role: user.Role?.name || 'USER',
      isAdmin: user.Role?.name === 'ADMIN' || user.Role?.name === 'SUPERADMIN' || user.roleId === 2,
    }, tokenSecret('access'), { expiresIn: process.env.JWT_ACCESS_EXPIRY || '24h' });
    const refreshToken = jwt.sign({ userId: user.id, sub: user.id, type: 'refresh' }, tokenSecret('refresh'), { expiresIn: process.env.JWT_REFRESH_EXPIRY || '7d' });
    setAuthCookies(req, res, accessToken, refreshToken);
    const effective = await prisma.subscription.findFirst({
      where: { userId: user.id, status: 'ACTIVE', startsAt: { lte: lastLoginAt }, expiresAt: { gt: lastLoginAt } },
      orderBy: { expiresAt: 'desc' }, select: { startsAt: true, expiresAt: true, type: true },
    }).catch(() => null);
    const effectiveUser = effective ? { ...user, subscriptionStart: effective.startsAt, subscriptionEnd: effective.expiresAt, subscriptionMonths: 0, subscriptionType: effective.type || user.subscriptionType } : user;
    return res.json({
      success: true, message: 'ورود موفق',
      data: { user: formatPasskeyUser({ ...effectiveUser, lastLoginAt }), token: accessToken, accessToken, refreshToken },
    });
  } catch (error) {
    console.error('[PASSKEY] login verification failed:', error?.code || error?.name || 'ERROR');
    return res.status(error?.status || 401).json({ success: false, message: error?.message || 'ورود بیومتریک ناموفق بود.' });
  }
}

module.exports = {
  getSettings, registrationOptions, verifyRegistration, updateEnabled,
  removeDevice, removeAllDevices, loginOptions, verifyLogin,
};
