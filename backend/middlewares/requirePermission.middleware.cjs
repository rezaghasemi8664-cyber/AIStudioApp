'use strict';

const { hasPermission } = require('../services/rbac.service.cjs');

function requirePermission(permissionKey) {
  return async function permissionMiddleware(req,res,next) {
    try {
      if(!req.user) return res.status(401).json({success:false,message:'احراز هویت الزامی است.',code:'AUTH_REQUIRED'});
      if(String(req.user.role||'').toUpperCase()==='SUPERADMIN') return next();
      const allowed=await hasPermission(req.user.userId||req.user.id,permissionKey);
      if(!allowed) return res.status(403).json({success:false,message:'شما مجوز انجام این عملیات را ندارید.',code:'PERMISSION_DENIED',permission:permissionKey});
      return next();
    }catch(error){
      console.error('[RBAC] permission check failed:',error?.message||error);
      return res.status(503).json({success:false,message:'امکان بررسی سطح دسترسی وجود ندارد.',code:'PERMISSION_CHECK_FAILED'});
    }
  };
}
module.exports=requirePermission;
module.exports.requirePermission=requirePermission;
