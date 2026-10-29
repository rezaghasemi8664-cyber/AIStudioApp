'use strict';

const prisma = require('../config/prisma.cjs');
const { getSecurityPolicy } = require('../middlewares/securityPolicy.middleware.cjs');

const SESSION_SELECT = { id: true, userId: true, createdAt: true };

// Coalesce concurrent requests for the same token inside this Node.js process.
// The database unique constraint remains the source of truth across processes.
const sessionCreationInFlight = new Map();

function isUniqueConstraintError(error) {
  const codes = [
    error?.code,
    error?.cause?.code,
    error?.number,
    error?.originalError?.info?.number,
    error?.cause?.originalError?.info?.number,
  ].map((value) => String(value ?? ''));
  return codes.some((code) => code === 'P2002' || code === '2601' || code === '2627');
}

async function findOrCreateSession(token, userId) {
  const pending = sessionCreationInFlight.get(token);
  if (pending) {
    return { session: await pending, createdSession: false };
  }

  let createdSession = false;
  const lookup = (async () => {
    let session = await prisma.session.findUnique({
      where: { token },
      select: SESSION_SELECT,
    });
    if (session) return session;

    try {
      session = await prisma.session.create({
        data: { userId: Number(userId), token, createdAt: new Date() },
        select: SESSION_SELECT,
      });
      createdSession = true;
      return session;
    } catch (createError) {
      // A different Node.js process may have won the unique-token race.
      // Only recover from a unique-key conflict; surface unrelated DB failures.
      if (!isUniqueConstraintError(createError)) throw createError;
      session = await prisma.session.findUnique({
        where: { token },
        select: SESSION_SELECT,
      });
      if (!session) throw createError;
      return session;
    }
  })();

  sessionCreationInFlight.set(token, lookup);
  try {
    return { session: await lookup, createdSession };
  } finally {
    if (sessionCreationInFlight.get(token) === lookup) {
      sessionCreationInFlight.delete(token);
    }
  }
}

async function enforceSession(token, userId) {
  if (!token || !userId) return { valid: false, code: 'SESSION_REQUIRED' };

  const policy = await getSecurityPolicy();
  const maxAgeHours = Math.max(1, Number(policy.sessionMaxAgeHours) || 24);
  const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
  const now = Date.now();

  const { session, createdSession } = await findOrCreateSession(token, userId);

  if (Number(session.userId) !== Number(userId)) {
    // Never revoke another user's session just because a request supplied its token.
    return { valid: false, code: 'SESSION_USER_MISMATCH' };
  }

  const createdAt = session.createdAt ? new Date(session.createdAt).getTime() : now;
  if (!Number.isFinite(createdAt) || now - createdAt > maxAgeMs) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return { valid: false, code: 'SESSION_EXPIRED' };
  }

  if (createdSession) {
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
