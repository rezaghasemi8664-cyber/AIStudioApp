'use strict';

const authMiddleware = require('./auth.middleware.cjs');
const requirePermission = require('./requirePermission.middleware.cjs');

const VIEW_MODULES = new Set(['dashboard','monitoring','reports','audit']);

module.exports = function adminActionsRbac(req,res,next){
  return authMiddleware(req,res,()=>{
    const parts=String(req.path||'').split('/').filter(Boolean);
    const moduleKey=parts[0];
    if(!moduleKey || moduleKey==='capabilities') {
      const capabilityModule=parts[1];
      if(!capabilityModule) return res.status(404).json({success:false,message:'ماژول مدیریتی پیدا نشد.'});
      return requirePermission(`admin.${capabilityModule}.${VIEW_MODULES.has(capabilityModule)?'view':'manage'}'`)(req,res,next);
    }
    return requirePermission(`admin.${moduleKey}.${VIEW_MODULES.has(moduleKey)?'view':'manage'}`)(req,res,next);
  });
};
