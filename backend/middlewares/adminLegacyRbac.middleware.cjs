'use strict';
const authMiddleware=require('./auth.middleware.cjs');
const requirePermission=require('./requirePermission.middleware.cjs');
const { prisma }=require('../config/prisma.cjs');
const VIEW_MODULES=new Set(['dashboard','monitoring','reports','audit']);
const PATH_MODULES=new Map([
 ['users','users'],['subscriptions','subscriptions'],['analysis','analysis'],['market','market'],['scalping','scalping'],['ai','ai'],['prompts','prompts'],['history','history'],['notifications','notifications'],['monitoring','monitoring'],['reports','reports'],['security','security'],['settings','settings'],['maintenance','maintenance'],['updates','updates'],['backup','backup'],['payments','payments'],['roles','roles'],['sessions','sessions'],['api','api'],['infrastructure','infrastructure']
]);

async function requiresRoleManagement(req){
 const parts=String(req.path||'').split('/').filter(Boolean);
 if(parts[0]!=='users'||!['POST','PUT','PATCH'].includes(req.method))return false;
 if(!req.body||req.body.roleId===undefined||req.body.roleId===null||req.body.roleId==='')return false;
 const roleId=Number(req.body.roleId);
 if(!Number.isInteger(roleId)||roleId<=0)return true;
 try{
  const role=await prisma.role.findUnique({where:{id:roleId},select:{name:true}});
  return String(role?.name||'').toUpperCase()!=='USER';
 }catch(_){
  return true;
 }
}

module.exports=async function adminLegacyRbac(req,res,next){
 return authMiddleware(req,res,async()=>{
  const parts=String(req.path||'').split('/').filter(Boolean);
  const moduleKey=PATH_MODULES.get(parts[0])||'dashboard';
  const mode=VIEW_MODULES.has(moduleKey)&&req.method==='GET'?'view':'manage';
  if(await requiresRoleManagement(req))return requirePermission('admin.roles.manage')(req,res,next);
  return requirePermission(`admin.${moduleKey}.${mode}`)(req,res,next);
 });
};
