'use strict';

// Temporary, security-safe login diagnostics. Remove after the 401 investigation.
const bcrypt = require('bcryptjs');
const prismaModule = require('../config/prisma.cjs');
const prisma = prismaModule.prisma || prismaModule.default || prismaModule;
const { normalizeEmail } = require('../services/email.service.cjs');

async function authLoginDebug(req, _res, next) {
  try {
    const identity = normalizeEmail(req.body?.email || req.body?.username);
    const password = String(req.body?.password || '');
    console.log('[AUTH_DEBUG_ROUTE] pid=%s identity=%s bodyKeys=%s passwordLength=%s', process.pid, identity, Object.keys(req.body || {}).join(','), password.length);

    const user = await prisma.user.findFirst({
      where: { OR: [{ email: identity }, { username: identity }], isDeleted: false },
      select: { id: true, username: true, email: true, passwordHash: true, isActive: true, isDeleted: true },
    });

    console.log('[AUTH_DEBUG_ROUTE] userFound=%s userId=%s isActive=%s isDeleted=%s', Boolean(user), user?.id ?? null, user?.isActive ?? null, user?.isDeleted ?? null);

    if (user?.passwordHash && password) {
      const result = await bcrypt.compare(password, user.passwordHash);
      console.log('[AUTH_DEBUG_ROUTE] bcryptResult=%s', result);
    } else {
      console.log('[AUTH_DEBUG_ROUTE] bcryptResult=SKIPPED');
    }
  } catch (error) {
    console.error('[AUTH_DEBUG_ROUTE] diagnostic error:', error?.message || error);
  }
  return next();
}

module.exports = { authLoginDebug };
