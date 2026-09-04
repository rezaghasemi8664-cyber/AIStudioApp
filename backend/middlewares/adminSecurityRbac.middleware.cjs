'use strict';
const authMiddleware=require('./auth.middleware.cjs');
const requirePermission=require('./requirePermission.middleware.cjs');
const MAP={security:'admin.security.manage',settings:'admin.settings.manage',maintenance:'admin.maintenance.manage'};
module.exports=function(req,res,next){return authMiddleware(req,res,()=>{const key=String(req.path||'').split('/').filter(Boolean)[0];const permission=MAP[key];if(!permission)return res.status(404).json({success:false,message:'مسیر مدیریتی پیدا نشد.'});return requirePermission(permission)(req,res,next);});};
