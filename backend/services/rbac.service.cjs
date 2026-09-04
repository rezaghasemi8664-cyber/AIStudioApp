'use strict';

const { prisma } = require('../config/prisma.cjs');

const MODULES = ['dashboard','users','subscriptions','analysis','market','scalping','ai','prompts','history','notifications','monitoring','reports','security','settings','maintenance','updates','backup','payments','roles','audit','sessions','api','infrastructure'];
const PERMISSIONS = MODULES.map((moduleKey) => `admin.${moduleKey}.${['dashboard','monitoring','reports','audit'].includes(moduleKey) ? 'view' : 'manage'}`);

let bootstrapPromise = null;
async function ensurePermissions() {
  if (bootstrapPromise) return bootstrapPromise;
  bootstrapPromise = (async () => {
    for (const key of PERMISSIONS) await prisma.permission.upsert({where:{key},update:{},create:{key}});
    const adminRoles=await prisma.role.findMany({where:{name:{in:['ADMIN','SUPERADMIN']}},select:{id:true,name:true}});
    for(const role of adminRoles) for(const key of PERMISSIONS){
      const permission=await prisma.permission.findUnique({where:{key},select:{id:true}});
      if(permission) await prisma.rolePermission.upsert({where:{roleId_permissionId:{roleId:role.id,permissionId:permission.id}},update:{},create:{roleId:role.id,permissionId:permission.id}});
    }
  })().catch(error=>{bootstrapPromise=null;throw error;});
  return bootstrapPromise;
}
async function hasPermission(userId,permissionKey){
  await ensurePermissions();
  const user=await prisma.user.findUnique({where:{id:Number(userId)},select:{Role:{select:{id:true,name:true}}}});
  const role=user?.Role;
  if(!role)return false;
  if(String(role.name).toUpperCase()==='SUPERADMIN')return true;
  return !!(await prisma.rolePermission.findFirst({where:{roleId:role.id,permission:{key:permissionKey}},select:{id:true}}));
}
async function listRolePermissions(roleId){
  await ensurePermissions();
  const permissions=await prisma.permission.findMany({orderBy:{key:'asc'},select:{id:true,key:true}});
  const assigned=await prisma.rolePermission.findMany({where:{roleId:Number(roleId)},select:{permissionId:true}});
  const set=new Set(assigned.map(x=>x.permissionId));
  return permissions.map(p=>({...p,assigned:set.has(p.id)}));
}
async function setRolePermissions(roleId,permissionKeys){
  await ensurePermissions();
  const id=Number(roleId); const role=await prisma.role.findUnique({where:{id},select:{id:true,name:true}});
  if(!role)throw new Error('نقش پیدا نشد.');
  if(String(role.name).toUpperCase()==='SUPERADMIN')return {roleId:id,permissionCount:PERMISSIONS.length,protected:true};
  const keys=Array.isArray(permissionKeys)?permissionKeys.map(String):[];
  const permissions=await prisma.permission.findMany({where:{key:{in:keys}},select:{id:true}});
  await prisma.rolePermission.deleteMany({where:{roleId:id}});
  for(const permission of permissions) await prisma.rolePermission.create({data:{roleId:id,permissionId:permission.id}});
  return {roleId:id,permissionCount:permissions.length};
}
module.exports={MODULES,PERMISSIONS,ensurePermissions,hasPermission,listRolePermissions,setRolePermissions};
