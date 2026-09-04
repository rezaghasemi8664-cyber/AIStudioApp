'use strict';

const { prisma } = require('../config/prisma.cjs');
const { getSecurityPolicy } = require('../middlewares/securityPolicy.middleware.cjs');

async function enforceSession(token, userId) {
  if (!token || !userId) return { valid: false, code: 'SESSION_REQUIRED' };

  const policy = await getSecurityPolicy();
  const maxAgeHours = Math.max(1, Number(policy.sessionMaxAgeHours) || 24);
  const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
  const now = Date.now();

  let session = await prisma.session.findUnique({
    where: { token },
    select: { id: true, userId: true, createdAt: true },
  });

  // Existing deployments may have JWTs issued before session persistence was enabled.
  // Register the currently valid access token on its first authenticated request.
  if (!session) {
    session = await prisma.session.create({
      data: { userId: Number(userId), token, createdAt: new Date() },
      select: { id: true, userId: true, createdAt: true },
    });
  }

  if (Number(session.userId) !== Number(userId)) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return { valid: false, code: 'SESSION_USER_MISMATCH' };
  }

  const createdAt = session.createdAt ? new Date(session.createdAt).getTime() : now;
  if (!Number.isFinite(createdAt) || now - createdAt > maxAgeMs) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return { valid: false, code: 'SESSION_EXPIRED' };
  }

  // Enforce the configured per-user session limit. Keep the newest sessions.
  const maxSessions = Math.max(1, Number(policy.maxSessionsPerUser) || 5);
  const sessions = await prisma.session.findMany({
    where: { userId: Number(userId) },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { id: true },
  });
  if (sessions.length > maxSessions) {
    const staleIds = sessions.slice(maxSessions).map((item) => item.id);
    if (staleIds.length) await prisma.session.deleteMany({ where: { id: { in: staleIds } } });
    if (staleIds.includes(session.id)) return { valid: false, code: 'SESSION_LIMIT_EXCEEDED' };
  }

  return { valid: true, sessionId: session.id, policy };
}

async function revokeSession(token) {
  if (!token) return 0;
  const result = await prisma.session.deleteMany({ where: { token } });
  return result.count;
}

async function revokeAllSessions(userId) {
  if (!userId) return 0;
  const result = await prisma.session.deleteMany({ where: { userId: Number(userId) } });
  return result.count;
}

module.exports = { enforceSession, revokeSession, revokeAllSessions };
