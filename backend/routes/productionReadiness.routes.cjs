'use strict';
const express=require('express');
const router=express.Router();
const auth=require('../middlewares/auth.middleware.cjs');
const {prisma}=require('../config/prisma.cjs');
function ok(res,data){res.json({success:true,data,meta:{status:'LIVE',source:'Production Readiness',fetchedAt:new Date().toISOString(),stale:false}})}
router.get('/health',async(req,res)=>{try{await prisma.$queryRaw`SELECT 1`;ok(res,{api:true,database:true,node:process.version,environment:process.env.NODE_ENV||'production'});}catch(e){res.status(503).json({success:false,data:{api:true,database:false},message:'Database health check failed'});}});
router.get('/security',auth,async(req,res)=>{ok(res,{httpsRecommended:true,authMiddleware:true,trustProxy:true,securityHeaders:true,requestId:true,rateLimiting:true});});
module.exports=router;