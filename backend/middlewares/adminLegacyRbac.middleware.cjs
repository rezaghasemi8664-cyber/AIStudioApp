'use strict';
const authMiddleware=require('./auth.middleware.cjs');
const requirePermission=require('./requirePermission.middleware.cjs');
const VIEW_MODULES=new Set(['dashboard','monitoring','reports','audit']);
const PATH_MODULES=new Map([
 ['users','users'],['subscriptions','subscriptions'],['analysis','analysis'],['market','market'],['scalping','scalping'],['ai','ai'],['prompts','prompts'],['history','history'],['notifications','notifications'],['monitoring','monitoring'],['reports','reports'],['security','security'],['settings','settings'],['maintenance','maintenance'],['updates','updates'],['backup','backup'],['payments','payments'],['roles','roles'],['sessions','sessions'],['api','api'],['infrastructure','infrastructure']
]);
module.exports=function adminLegacyRbac(req,res,next){
 return authMiddleware(req,res,()=>{
  const parts=String(req.path||'').split('/').filter(Boolean);
  const moduleKey=PATH_MODULES.get(parts[0])||'dashboard';
  const mode=VIEW_MODULES.has(moduleKey)&&req.method==='GET'?'view':'manage';
  return requirePermission(`admin.${moduleKey}.${mode}`)(req,res,next);
 });
};
