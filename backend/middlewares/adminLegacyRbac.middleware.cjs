'use strict';
const authMiddleware=require('./auth.middleware.cjs');
const requirePermission=require('./requirePermission.middleware.cjs');
const { prisma }=require('../config/prisma.cjs');
const VIEW_MODULES=new Set(['dashboard','monitoring','reports','audit']);
const PATH_MODULES=new Map([
 ['users','users'],['subscriptions','subscriptions'],['analysis','analysis'],['market','market'],['scalping','scalping'],['ai','ai'],['prompts','prompts'],['history','history'],['notifications','notifications'],['monitoring','monitoring'],['reports','reports'],['security','security'],['settings','settings'],['maintenance','maintenance'],['updates','updates'],['backup','backup'],['payments','payments'],['roles','roles'],['sessions','sessions'],['api','api'],['infrastructure','infrastructure']
]);

function actorIsSuperAdmin(req){return String(req.user?.role||'').toUpperCase()==='SUPERADMIN';}
function actorId(req){return String(req.user?.userId??req.user?.id??'');}

async function getRequestedRole(req){
 const parts=String(req.path||'').split('/').filter(Boolean);
 if(parts[0]!=='users'||!['POST','PUT','PATCH'].includes(req.method))return null;
 if(!req.body||req.body.roleId===undefined||req.body.roleId===null||req.body.roleId==='')return null;
 const roleId=Number(req.body.roleId);
 if(!Number.isInteger(roleId)||roleId<=0)return {invalid:true};
 try{return await prisma.role.findUnique({where:{id:roleId},select:{id:true,name:true}});}catch(_){return {invalid:true};}
}

module.exports=async function adminLegacyRbac(req,res,next){
 return authMiddleware(req,res,async()=>{
  const parts=String(req.path||'').split('/').filter(Boolean);
  const moduleKey=PATH_MODULES.get(parts[0])||'dashboard';
  const mode=VIEW_MODULES.has(moduleKey)&&req.method==='GET'?'view':'manage';
  const requestedRole=await getRequestedRole(req);

  // Any explicit roleId in the legacy users API is privileged: role changes
  // must use the dedicated RBAC permission even when the selected role is USER.
  if(requestedRole){
   if(requestedRole.invalid)return res.status(400).json({success:false,message:'شناسه نقش نامعتبر است.'});
   if(String(requestedRole.name||'').toUpperCase()==='SUPERADMIN'&&!actorIsSuperAdmin(req)){
    return res.status(403).json({success:false,message:'فقط SUPERADMIN می‌تواند نقش SUPERADMIN را اختصاص دهد.'});
   }
   if(actorId(req)&&String(req.body?.userId||req.params?.id||'')===actorId(req)&&String(requestedRole.name||'').toUpperCase()!=='SUPERADMIN'){
    return res.status(400).json({success:false,message:'نمی‌توانید نقش حساب مدیریتی خود را به سطح پایین‌تر تغییر دهید.'});
   }
   return requirePermission('admin.roles.manage')(req,res,next);
  }

  return requirePermission(`admin.${moduleKey}.${mode}`)(req,res,next);
 });
};
