'use strict';
const express=require('express');
const { prisma }=require('../config/prisma.cjs');
const authMiddleware=require('../middlewares/auth.middleware.cjs');
const requirePermission=require('../middlewares/requirePermission.middleware.cjs');
const { PERMISSIONS,ensurePermissions,listRolePermissions,setRolePermissions,hasPermission }=require('../services/rbac.service.cjs');
const router=express.Router();
async function audit(req,action,targetId,details){try{await prisma.$executeRawUnsafe(`IF OBJECT_ID(N'dbo.AdminAuditLog',N'U') IS NOT NULL INSERT INTO dbo.AdminAuditLog(adminUserId,action,moduleKey,targetId,method,path,statusCode,ipAddress,userAgent,detailsJson) VALUES(@p1,@p2,N'roles',@p3,@p4,@p5,200,@p6,@p7,@p8)`,Number(req.user?.userId||req.user?.id)||null,action,targetId==null?null:String(targetId),req.method,req.originalUrl,req.ip||null,String(req.get('user-agent')||'').slice(0,500),details?JSON.stringify(details):null);}catch(_) {}}
router.get('/me/permissions',authMiddleware,async(req,res)=>{try{await ensurePermissions();if(String(req.user?.role||'').toUpperCase()==='SUPERADMIN')return res.json({success:true,data:PERMISSIONS});const allowed=[];for(const key of PERMISSIONS)if(await hasPermission(req.user?.userId||req.user?.id,key))allowed.push(key);return res.json({success:true,data:allowed});}catch(error){return res.status(500).json({success:false,message:error?.message||'دریافت مجوزهای کاربر ناموفق بود.'});}});
router.use(authMiddleware,requirePermission('admin.roles.manage'));
router.get('/permissions',async(_req,res)=>{await ensurePermissions();return res.json({success:true,data:PERMISSIONS});});
router.get('/roles',async(_req,res)=>{await ensurePermissions();const roles=await prisma.role.findMany({orderBy:{id:'asc'},select:{id:true,name:true,title:true,_count:{select:{users:true,permissions:true}}}});return res.json({success:true,data:roles.map(r=>({id:r.id,name:r.name,title:r.title,userCount:r._count.users,permissionCount:r._count.permissions}))});});
router.get('/roles/:roleId/permissions',async(req,res)=>{const id=Number(req.params.roleId);if(!id)return res.status(400).json({success:false,message:'شناسه نقش نامعتبر است.'});return res.json({success:true,data:await listRolePermissions(id)});});
router.put('/roles/:roleId/permissions',async(req,res)=>{try{const id=Number(req.params.roleId);if(!id)return res.status(400).json({success:false,message:'شناسه نقش نامعتبر است.'});const keys=Array.isArray(req.body?.permissionKeys)?req.body.permissionKeys:[];const data=await setRolePermissions(id,keys);await audit(req,'ADMIN_ROLE_PERMISSIONS_UPDATED',id,{permissionCount:data.permissionCount});return res.json({success:true,message:'مجوزهای نقش ذخیره شد.',data});}catch(error){return res.status(400).json({success:false,message:error?.message||'ذخیره مجوزهای نقش ناموفق بود.'});}});
module.exports=router;
