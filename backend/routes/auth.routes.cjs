// routes/auth.routes.cjs
'use strict';
const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller.cjs');
const { loginSecurity, passwordSecurity } = require('../middlewares/authSecurity.middleware.cjs');

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

module.exports = router;
