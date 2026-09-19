'use strict';

const jwt = require('jsonwebtoken');
const env = require('../config/env.cjs');
const { enforceSession, revokeSession } = require('../services/sessionSecurity.service.cjs');
let prisma;
try { prisma = require('../config/prisma.cjs').prisma || require('../config/prisma.cjs'); } catch (_) { prisma = null; }

function getJwtSecret() {
  const secret = env?.JWT_ACCESS_SECRET || process.env.JWT_ACCESS_SECRET || env?.JWT_SECRET || process.env.JWT_SECRET;
  if (!secret) console.error('[AUTH_MW] CRITICAL: No JWT access secret found!');
  return secret;
}
function isUsableToken(v) { return !!(v && typeof v === 'string' && v.trim() && v !== 'null' && v !== 'undefined'); }
function extractToken(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (isUsableToken(authHeader) && /^Bearer\s+/i.test(authHeader)) {
    const t = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (isUsableToken(t)) return { token: t, source: 'header' };
  }
  if (isUsableToken(authHeader) && !/^Bearer\s+/i.test(authHeader)) return { token: String(authHeader).trim(), source: 'header_raw' };
  const cookieToken = (req.cookies && (req.cookies.accessToken || req.cookies.access_token || req.cookies.token)) ||
    (req.signedCookies && (req.signedCookies.accessToken || req.signedCookies.access_token || req.signedCookies.token));
  if (isUsableToken(cookieToken)) return { token: cookieToken, source: 'cookie' };
  if (req.query && isUsableToken(req.query.token)) return { token: String(req.query.token).trim(), source: 'query' };
  return { token: null, source: null };
}
function buildUserFromDecoded(decoded) {
  if (!decoded || typeof decoded !== 'object') return null;
  const userId = decoded.userId || decoded.sub || decoded.id || decoded.user_id;
  if (!userId) return null;
  const roleRaw = decoded.role || decoded.userRole || null;
  const role = typeof roleRaw === 'string' ? roleRaw.toUpperCase() : 'USER';
  const isAdmin = decoded.isAdmin === true || decoded.is_admin === true || role === 'ADMIN' || role === 'SUPERADMIN';
  return { id:userId, userId, sub:userId, username:decoded.username || decoded.user || decoded.name || null, email:decoded.email || null, isAdmin, role, iat:decoded.iat || null, exp:decoded.exp || null };
}

async function authenticate(req, res, next) {
  try {
    const { token, source } = extractToken(req);
    if (!token) return res.status(401).json({ success:false, message:'توکن احراز هویت ارسال نشده است.', messageEn:'Authentication token not provided.', code:'NO_TOKEN' });
    const secret = getJwtSecret();
    if (!secret) return res.status(500).json({ success:false, message:'خطای پیکربندی سرور.', messageEn:'Server configuration error.', code:'CONFIG_ERROR' });
    const decoded = jwt.verify(token, secret);
    if (decoded?.type && String(decoded.type).toLowerCase() === 'refresh') return res.status(401).json({ success:false, message:'نوع توکن نامعتبر است.', messageEn:'Invalid token type for this endpoint.', code:'INVALID_TOKEN_TYPE' });
    const user = buildUserFromDecoded(decoded);
    if (!user) return res.status(401).json({ success:false, message:'توکن فاقد اطلاعات کاربری معتبر است.', messageEn:'Token missing valid user information.', code:'INVALID_TOKEN_PAYLOAD' });

    if (prisma) {
      const dbUser = await prisma.user.findUnique({ where:{id:Number(user.userId)}, select:{id:true,isActive:true,isDeleted:true,passwordChangedAt:true} });
      if (!dbUser || !dbUser.isActive || dbUser.isDeleted) return res.status(401).json({success:false,message:'حساب کاربری غیرفعال یا نامعتبر است.',code:'USER_DISABLED'});
      if (dbUser.passwordChangedAt && decoded.iat && dbUser.passwordChangedAt.getTime() > Number(decoded.iat)*1000) return res.status(401).json({success:false,message:'کلمه عبور تغییر کرده است. لطفا مجددا وارد شوید.',code:'PASSWORD_CHANGED'});
      try {
        const session = await enforceSession(token, user.userId);
        if (!session.valid) return res.status(401).json({success:false,message:'نشست شما منقضی یا لغو شده است. لطفا مجددا وارد شوید.',code:session.code});
        req.sessionId = session.sessionId;
      } catch (sessionError) {
        console.error('[AUTH_MW] session enforcement failed:', sessionError?.message || sessionError);
        return res.status(503).json({success:false,message:'امکان بررسی نشست کاربر وجود ندارد.',code:'SESSION_CHECK_FAILED'});
      }
    }

    req.user = user;
    if ((process.env.NODE_ENV || 'development') !== 'production') console.log(`[AUTH_MW] OK userId=${user.userId} role=${user.role} via=${source}`);

    // Logout invalidates the current persistent session before the controller clears cookies.
    if (req.path === '/logout' || req.path === '/logout/') await revokeSession(token).catch(() => {});
    return next();
  } catch (err) {
    if (err?.name === 'TokenExpiredError') return res.status(401).json({success:false,message:'توکن منقضی شده است.',messageEn:'Token expired.',code:'TOKEN_EXPIRED'});
    if (err?.name === 'JsonWebTokenError') return res.status(401).json({success:false,message:'توکن نامعتبر است.',messageEn:'Invalid token.',code:'INVALID_TOKEN'});
    if (err?.name === 'NotBeforeError') return res.status(401).json({success:false,message:'توکن هنوز فعال نشده است.',messageEn:'Token not active yet.',code:'TOKEN_NOT_ACTIVE'});
    console.error('[AUTH_MW] authentication error:', err?.message || err);
    return res.status(401).json({success:false,message:'خطا در احراز هویت.',messageEn:'Authentication failed.',code:'AUTH_ERROR'});
  }
}

function optionalAuth(req, _res, next) {
  try {
    const { token } = extractToken(req);
    if (!token) { req.user=null; return next(); }
    const secret=getJwtSecret();
    if (!secret) { req.user=null; return next(); }
    try { const decoded=jwt.verify(token,secret); req.user=(decoded?.type && String(decoded.type).toLowerCase()==='refresh')?null:buildUserFromDecoded(decoded); } catch { req.user=null; }
    return next();
  } catch { req.user=null; return next(); }
}
function requireAdmin(req,res,next) {
  if (!req.user) return res.status(401).json({success:false,message:'احراز هویت الزامی است.',messageEn:'Authentication required.',code:'AUTH_REQUIRED'});
  if (!req.user.isAdmin) return res.status(403).json({success:false,message:'دسترسی فقط برای مدیران مجاز است.',messageEn:'Admin access required.',code:'ADMIN_REQUIRED'});
  return next();
}
module.exports=authenticate;
module.exports.authenticate=authenticate;
module.exports.authenticateToken=authenticate;
module.exports.authMiddleware=authenticate;
module.exports.verifyToken=authenticate;
module.exports.optionalAuth=optionalAuth;
module.exports.requireAdmin=requireAdmin;
module.exports.extractToken=extractToken;
module.exports.buildUserFromDecoded=buildUserFromDecoded;
module.exports.getJwtSecret=getJwtSecret;
