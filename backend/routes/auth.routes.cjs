// routes/auth.routes.cjs
'use strict';
const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller.cjs');
const { loginSecurity, passwordSecurity } = require('../middlewares/authSecurity.middleware.cjs');
const passkeyController = require('../controllers/passkey.controller.cjs');
const rateLimit = require('express-rate-limit');
const passkeyLoginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false, message: { success: false, message: 'تعداد تلاش‌های ورود بیومتریک بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.' } });
const passkeyRegistrationLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false, message: { success: false, message: 'تعداد تلاش‌های ثبت دستگاه بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.' } });

let authMiddleware;
for (const p of ['../middleware/auth.middleware.cjs','../middlewares/auth.middleware.cjs']) {
  try {
    const mod = require(p);
    authMiddleware = mod.authenticate || mod.authMiddleware || mod.verifyToken || mod;
    if (typeof authMiddleware === 'function') break;
    authMiddleware = null;
  } catch (_) {}
}
if (typeof authMiddleware !== 'function') {
  authMiddleware = function (_req,res) { return res.status(401).json({success:false,message:'سیستم احراز هویت پیکربندی نشده است'}); };
}

const requiredMethods=['login','register','verify','refreshToken','logout','me','updateProfile','changePassword','getSubscription','recoverPassword','resetPassword'];
requiredMethods.forEach(method=>{
  if(typeof authController[method]!=='function') authController[method]=(_req,res)=>res.status(501).json({success:false,message:`متد ${method} هنوز پیاده‌سازی نشده`});
});

router.post('/login', loginSecurity, authController.login);
router.post('/register', authController.register);
router.post('/signup', authController.register);
router.post('/recover-password', authController.recoverPassword);
router.post('/forgot-password', authController.recoverPassword);
router.post('/reset-password', authController.resetPassword);

// Public discoverable-passkey login endpoints are rate limited independently.
router.post('/passkeys/login/options', passkeyLoginLimiter, passkeyController.loginOptions);
router.post('/passkeys/login/verify', passkeyLoginLimiter, passkeyController.verifyLogin);

router.get('/verify',(req,res,next)=>authMiddleware(req,res,()=>next()),authController.verify);
router.post('/verify',(req,res,next)=>authMiddleware(req,res,()=>next()),authController.verify);
router.get('/verify-token',(req,res,next)=>authMiddleware(req,res,()=>next()),authController.verify);
router.post('/verify-token',(req,res,next)=>authMiddleware(req,res,()=>next()),authController.verify);
router.post('/refresh',authController.refreshToken);
router.post('/refresh-token',authController.refreshToken);
router.post('/logout',authMiddleware,authController.logout);
router.get('/logout',authMiddleware,authController.logout);
router.get('/me',authMiddleware,authController.me);
router.put('/profile',authMiddleware,authController.updateProfile);
router.patch('/profile',authMiddleware,authController.updateProfile);
router.post('/change-password',authMiddleware,passwordSecurity,authController.changePassword);
router.put('/change-password',authMiddleware,passwordSecurity,authController.changePassword);
router.get('/subscription',authMiddleware,authController.getSubscription);

// Passkey management is always scoped to the authenticated account.
router.get('/passkeys', authMiddleware, passkeyController.getSettings);
router.post('/passkeys/register/options', authMiddleware, passkeyRegistrationLimiter, passkeyController.registrationOptions);
router.post('/passkeys/register/verify', authMiddleware, passkeyRegistrationLimiter, passkeyController.verifyRegistration);
router.put('/passkeys/enabled', authMiddleware, passkeyController.updateEnabled);
router.delete('/passkeys/:credentialId', authMiddleware, passkeyController.removeDevice);
router.delete('/passkeys', authMiddleware, passkeyController.removeAllDevices);

module.exports = router;

