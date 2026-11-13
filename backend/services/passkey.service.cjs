'use strict';

const crypto = require('crypto');
const prismaModule = require('../config/prisma.cjs');
const prisma = prismaModule.prisma || prismaModule.default || prismaModule;
const env = require('../config/env.cjs');

let webauthnPromise;
function webauthn() {
  if (!webauthnPromise) webauthnPromise = import('@simplewebauthn/server');
  return webauthnPromise;
}

function requestConfig(req) {
  const configuredOrigins = Array.isArray(env.ALLOWED_ORIGINS) ? env.ALLOWED_ORIGINS : [];
  const configuredWebAuthnOrigin = String(process.env.WEBAUTHN_ORIGIN || env.WEBAUTHN_ORIGIN || '').replace(/\/+$/, '');
  const requestOrigin = String(req.headers.origin || '').replace(/\/+$/, '');
  const origin = String(requestOrigin || configuredWebAuthnOrigin || env.FRONTEND_URL || configuredOrigins[0] || '').replace(/\/+$/, '');
  if (configuredWebAuthnOrigin && requestOrigin && requestOrigin !== configuredWebAuthnOrigin) throw Object.assign(new Error('مبدأ درخواست با مبدأ مجاز Passkey مطابقت ندارد.'), { status: 403 });
  if (!origin) throw Object.assign(new Error('مبدأ معتبر برای احراز هویت بیومتریک تنظیم نشده است.'), { status: 503 });
  if (configuredOrigins.length && !configuredOrigins.includes(origin)) {
    throw Object.assign(new Error('مبدأ درخواست برای احراز هویت بیومتریک مجاز نیست.'), { status: 403 });
  }
  let hostname;
  try { hostname = new URL(origin).hostname; } catch (_) {
    throw Object.assign(new Error('نشانی مبدأ احراز هویت معتبر نیست.'), { status: 400 });
  }
  const rpID = String(process.env.WEBAUTHN_RP_ID || env.WEBAUTHN_RP_ID || (hostname.toLowerCase().startsWith('www.') ? hostname.slice(4) : hostname)).trim().toLowerCase();
  return { rpID, origin };
}

async function saveChallenge({ userId, purpose, challenge }) {
  await prisma.webAuthnChallenge.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => {});
  const id = crypto.randomUUID();
  await prisma.webAuthnChallenge.create({
    data: { id, userId: userId || null, purpose, challenge, expiresAt: new Date(Date.now() + 5 * 60 * 1000) },
  });
  return id;
}

async function consumeChallenge(id, purpose, userId) {
  if (!id || typeof id !== 'string') throw Object.assign(new Error('درخواست احراز هویت منقضی یا نامعتبر است.'), { status: 400 });
  const record = await prisma.webAuthnChallenge.findUnique({ where: { id } });
  await prisma.webAuthnChallenge.deleteMany({ where: { id } }).catch(() => {});
  if (!record || record.purpose !== purpose || record.expiresAt <= new Date() || (userId && record.userId !== Number(userId))) {
    throw Object.assign(new Error('درخواست احراز هویت منقضی یا نامعتبر است. دوباره تلاش کنید.'), { status: 400 });
  }
  return record;
}

async function isEnabled(userId) {
  const preference = await prisma.userPreference.findUnique({
    where: { userId_key: { userId: Number(userId), key: 'passkey.enabled' } },
    select: { value: true },
  });
  return preference?.value === 'true';
}

async function setEnabled(userId, enabled) {
  await prisma.userPreference.upsert({
    where: { userId_key: { userId: Number(userId), key: 'passkey.enabled' } },
    create: { userId: Number(userId), key: 'passkey.enabled', value: enabled ? 'true' : 'false' },
    update: { value: enabled ? 'true' : 'false' },
  });
}

async function listDevices(userId) {
  const [enabled, credentials] = await Promise.all([
    isEnabled(userId),
    prisma.passkeyCredential.findMany({
      where: { userId: Number(userId) },
      orderBy: { createdAt: 'desc' },
      select: { id: true, deviceName: true, deviceType: true, backedUp: true, createdAt: true, lastUsedAt: true },
    }),
  ]);
  return { enabled, devices: credentials };
}

async function registrationOptions(req, userId) {
  const { rpID } = requestConfig(req);
  const user = await prisma.user.findUnique({ where: { id: Number(userId) }, select: { id: true, username: true, email: true, name: true } });
  if (!user) throw Object.assign(new Error('کاربر یافت نشد.'), { status: 404 });
  const existing = await prisma.passkeyCredential.findMany({ where: { userId: Number(userId) }, select: { credentialId: true, transports: true } });
  const { generateRegistrationOptions } = await webauthn();
  const options = await generateRegistrationOptions({
    rpName: 'رونیا - تحلیلگر هوشمند بورس',
    rpID,
    userID: Buffer.from(String(user.id)),
    userName: String(user.email || user.username).slice(0, 64),
    userDisplayName: String(user.name || user.email || user.username).slice(0, 64),
    attestationType: 'none',
    excludeCredentials: existing.map((item) => ({
      id: item.credentialId,
      transports: item.transports ? JSON.parse(item.transports) : undefined,
    })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    timeout: 60000,
  });
  const challengeId = await saveChallenge({ userId, purpose: 'registration', challenge: options.challenge });
  return { challengeId, options };
}

async function verifyRegistration(req, userId, response, challengeId, deviceName) {
  const config = requestConfig(req);
  const challenge = await consumeChallenge(challengeId, 'registration', userId);
  const { verifyRegistrationResponse } = await webauthn();
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: config.origin,
      expectedRPID: config.rpID,
      requireUserVerification: true,
    });
  } catch (_) {
    throw Object.assign(new Error('پاسخ ثبت دستگاه معتبر نیست یا تأیید امنیتی انجام نشد.'), { status: 400 });
  }
  if (!verification.verified || !verification.registrationInfo) {
    throw Object.assign(new Error('ثبت کلید امنیتی توسط دستگاه تأیید نشد.'), { status: 400 });
  }
  const info = verification.registrationInfo;
  const credential = info.credential;
  const transports = Array.isArray(response?.response?.transports) ? response.response.transports : [];
  const safeName = String(deviceName || 'دستگاه جدید').replace(/[<>]/g, '').trim().slice(0, 200) || 'دستگاه جدید';
  await prisma.passkeyCredential.create({
    data: {
      userId: Number(userId),
      credentialId: credential.id,
      credentialIdHash: crypto.createHash('sha256').update(credential.id).digest('hex'),
      publicKey: Buffer.from(credential.publicKey).toString('base64url'),
      counter: Number(credential.counter || 0),
      transports: JSON.stringify(transports),
      deviceName: safeName,
      deviceType: info.credentialDeviceType || 'singleDevice',
      backedUp: Boolean(info.credentialBackedUp),
    },
  });
  await setEnabled(userId, true);
  return listDevices(userId);
}

async function authenticationOptions(req, identifier) {
  const config = requestConfig(req);
  const normalized = String(identifier || '').trim().toLowerCase();
  let user = null;
  let allowCredentials;
  if (normalized) {
    user = await prisma.user.findFirst({
      where: { OR: [{ email: normalized }, { username: normalized }], isActive: true, isDeleted: false },
      select: { id: true },
    });
    if (!user || !(await isEnabled(user.id))) throw Object.assign(new Error('برای این حساب ورود بیومتریک فعال نیست.'), { status: 401 });
    const credentials = await prisma.passkeyCredential.findMany({ where: { userId: user.id } });
    if (!credentials.length) throw Object.assign(new Error('برای این حساب کلید امنیتی ثبت نشده است.'), { status: 401 });
    allowCredentials = credentials.map((item) => ({
      id: item.credentialId,
      transports: item.transports ? JSON.parse(item.transports) : undefined,
    }));
  }

  const { generateAuthenticationOptions } = await webauthn();
  const options = await generateAuthenticationOptions({
    rpID: config.rpID,
    ...(allowCredentials ? { allowCredentials } : {}),
    userVerification: 'required',
    timeout: 60000,
  });
  // A null userId enables discoverable-credential authentication. The credential
  // returned by the authenticator identifies the account during verification.
  const challengeId = await saveChallenge({ userId: user?.id || null, purpose: 'authentication', challenge: options.challenge });
  return { challengeId, options };
}

async function verifyAuthentication(req, challengeId, response, userSelect) {
  const challenge = await consumeChallenge(challengeId, 'authentication');
  const config = requestConfig(req);
  const credentialId = String(response?.id || response?.rawId || '');
  const credentialIdHash = crypto.createHash('sha256').update(credentialId).digest('hex');
  const stored = await prisma.passkeyCredential.findUnique({ where: { credentialIdHash } });
  if (!stored || (challenge.userId != null && stored.userId !== challenge.userId) || !(await isEnabled(stored.userId))) {
    throw Object.assign(new Error('کلید امنیتی معتبر نیست یا ورود بیومتریک غیرفعال شده است.'), { status: 401 });
  }
  const { verifyAuthenticationResponse } = await webauthn();
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: config.origin,
      expectedRPID: config.rpID,
      credential: {
        id: stored.credentialId,
        publicKey: Buffer.from(stored.publicKey, 'base64url'),
        counter: stored.counter,
        transports: stored.transports ? JSON.parse(stored.transports) : [],
      },
      requireUserVerification: true,
    });
  } catch (_) {
    throw Object.assign(new Error('تأیید هویت بیومتریک ناموفق بود.'), { status: 401 });
  }
  if (!verification.verified) throw Object.assign(new Error('تأیید هویت بیومتریک ناموفق بود.'), { status: 401 });
  await prisma.passkeyCredential.update({
    where: { id: stored.id },
    data: { counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() },
  });
  const user = await prisma.user.findUnique({
    where: { id: stored.userId },
    select: { id: true, isActive: true, isDeleted: true },
  });
  if (!user || !user.isActive || user.isDeleted) throw Object.assign(new Error('حساب کاربری غیرفعال یا نامعتبر است.'), { status: 401 });
  return prisma.user.findUnique({ where: { id: stored.userId }, select: userSelect || { id: true, username: true, email: true, roleId: true, Role: { select: { id: true, name: true, title: true } } } });
}

async function removeDevice(userId, deviceId) {
  const parsedDeviceId = Number(deviceId);
  if (!Number.isSafeInteger(parsedDeviceId) || parsedDeviceId < 1) throw Object.assign(new Error('دستگاه موردنظر یافت نشد.'), { status: 404 });
  const result = await prisma.passkeyCredential.deleteMany({ where: { id: parsedDeviceId, userId: Number(userId) } });
  if (!result.count) throw Object.assign(new Error('دستگاه موردنظر یافت نشد.'), { status: 404 });
  const remaining = await prisma.passkeyCredential.count({ where: { userId: Number(userId) } });
  if (!remaining) await setEnabled(userId, false);
  return listDevices(userId);
}

async function removeAllDevices(userId) {
  await prisma.passkeyCredential.deleteMany({ where: { userId: Number(userId) } });
  await setEnabled(userId, false);
  return listDevices(userId);
}

async function disable(userId) { await setEnabled(userId, false); return listDevices(userId); }
async function enable(userId) {
  const count = await prisma.passkeyCredential.count({ where: { userId: Number(userId) } });
  if (!count) throw Object.assign(new Error('برای فعال‌سازی، ابتدا این دستگاه را ثبت کنید.'), { status: 400 });
  await setEnabled(userId, true);
  return listDevices(userId);
}

module.exports = {
  registrationOptions, verifyRegistration, authenticationOptions, verifyAuthentication,
  listDevices, removeDevice, removeAllDevices, enable, disable,
};
