'use strict';
const authMiddleware=require('./auth.middleware.cjs');
const requirePermission=require('./requirePermission.middleware.cjs');
const VIEW_MODULES=new Set(['dashboard','monitoring','reports','audit']);
module.exports=function adminActionsRbac(req,res,next){
  return authMiddleware(req,res,()=>{
    const parts=String(req.path||'').split('/').filter(Boolean);
    const moduleKey=parts[0];
    const capabilityModule=moduleKey==='capabilities'?parts[1]:moduleKey;
    if(!capabilityModule)return res.status(404).json({success:false,message:'ماژول مدیریتی پیدا نشد.'});
    const permission=`admin.${capabilityModule}.${VIEW_MODULES.has(capabilityModule)?'view':'manage'}`;
    return requirePermission(permission)(req,res,next);
  });
};
