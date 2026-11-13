'use strict';
const express=require('express');
const {prisma}=require('../config/prisma.cjs');
const authMiddleware=require('../middlewares/auth.middleware.cjs');
const {hasPermission}=require('../services/rbac.service.cjs');
const router=express.Router();
// SQL Server BIGINT values are returned by Prisma as JavaScript BigInt,
// which Express cannot serialize with res.json(). Keep safe integers numeric
// for the existing UI and stringify only values outside Number's safe range.
function jsonSafeRow(row){
  return Object.fromEntries(Object.entries(row).map(([key,value])=>[
    key,
    typeof value==='bigint'
      ? (value<=BigInt(Number.MAX_SAFE_INTEGER)&&value>=BigInt(Number.MIN_SAFE_INTEGER)?Number(value):value.toString())
      : value,
  ]));
}
const uid=req=>Number(req.user?.id??req.user?.userId??0)||null;
async function admin(req,res,next){const id=uid(req);if(!id)return res.status(401).json({success:false,message:'احراز هویت الزامی است.'});try{if(!(await hasPermission(id,'admin.payments.manage')))return res.status(403).json({success:false,message:'دسترسی مدیریت پرداخت‌ها مجاز نیست.'});next();}catch(e){res.status(500).json({success:false,message:'بررسی دسترسی ناموفق بود.'});}}
async function ensure(){await prisma.$executeRawUnsafe(`IF OBJECT_ID(N'dbo.AdminPaymentTransaction',N'U') IS NULL BEGIN CREATE TABLE dbo.AdminPaymentTransaction(id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,userId INT NOT NULL,amount DECIMAL(18,2) NOT NULL,currency NVARCHAR(10) NOT NULL DEFAULT N'IRR',gateway NVARCHAR(50) NULL,authority NVARCHAR(200) NULL,referenceNo NVARCHAR(200) NULL,status NVARCHAR(30) NOT NULL DEFAULT N'pending',description NVARCHAR(500) NULL,createdAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),updatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),paidAt DATETIME2 NULL); CREATE INDEX IX_AdminPaymentTransaction_userId ON dbo.AdminPaymentTransaction(userId); CREATE INDEX IX_AdminPaymentTransaction_status ON dbo.AdminPaymentTransaction(status); END;`);}
router.use(authMiddleware,admin);

const paymentReportService = require('../services/payment-report.service.cjs');

router.get('/reports', async (req,res)=>{
  try {
    const period=String(req.query.period||'monthly').toLowerCase();
    if(!['daily','monthly','yearly'].includes(period)) return res.status(400).json({success:false,message:'بازه گزارش نامعتبر است.'});
    const data=await paymentReportService.getReport(period);
    return res.json({success:true,data});
  } catch(e) {
    console.error('[AdminPayments] reports:',e);
    return res.status(500).json({success:false,message:'دریافت گزارش پرداخت‌ها ناموفق بود.'});
  }
});
router.get('/summary',async(req,res)=>{try{await ensure();const rows=await prisma.$queryRawUnsafe(`
      WITH AllPayments AS (
        SELECT
          currency,
          CASE
            WHEN UPPER(status)=N'VERIFIED' THEN N'paid'
            WHEN UPPER(status) IN (N'PENDING',N'REDIRECTED',N'VERIFYING') THEN N'pending'
            WHEN UPPER(status) IN (N'FAILED',N'CANCELLED') THEN N'failed'
            ELSE LOWER(status)
          END AS normalizedStatus,
          amount
        FROM dbo.PaymentTransaction
        UNION ALL
        SELECT
          currency,
          LOWER(status) AS normalizedStatus,
          amount
        FROM dbo.AdminPaymentTransaction
      )
      SELECT
        currency,
        COUNT_BIG(*) AS total,
        COALESCE(SUM(CASE WHEN normalizedStatus=N'paid' THEN 1 ELSE 0 END),0) AS paidCount,
        COALESCE(SUM(CASE WHEN normalizedStatus=N'pending' THEN 1 ELSE 0 END),0) AS pendingCount,
        COALESCE(SUM(CASE WHEN normalizedStatus=N'refunded' THEN 1 ELSE 0 END),0) AS refundedCount,
        COALESCE(SUM(CASE WHEN normalizedStatus=N'failed' THEN 1 ELSE 0 END),0) AS failedCount,
        COALESCE(SUM(CASE WHEN normalizedStatus=N'paid' THEN amount ELSE 0 END),0) AS paidAmount,
        COALESCE(SUM(CASE WHEN normalizedStatus=N'pending' THEN amount ELSE 0 END),0) AS pendingAmount,
        COALESCE(SUM(CASE WHEN normalizedStatus=N'refunded' THEN amount ELSE 0 END),0) AS refundedAmount,
        COALESCE(SUM(CASE WHEN normalizedStatus=N'failed' THEN amount ELSE 0 END),0) AS failedAmount
      FROM AllPayments
      GROUP BY currency
    `);const data={total:0,paidCount:0,pendingCount:0,refundedCount:0,failedCount:0,byCurrency:{}};for(const r of rows){const currency=String(r.currency||'IRR');data.total+=Number(r.total||0);data.paidCount+=Number(r.paidCount||0);data.pendingCount+=Number(r.pendingCount||0);data.refundedCount+=Number(r.refundedCount||0);data.failedCount+=Number(r.failedCount||0);data.byCurrency[currency]={paidAmount:Number(r.paidAmount||0),pendingAmount:Number(r.pendingAmount||0),refundedAmount:Number(r.refundedAmount||0),failedAmount:Number(r.failedAmount||0)};}return res.json({success:true,data});}catch(e){console.error('[AdminPayments] summary:',e);res.status(500).json({success:false,message:'دریافت خلاصه مالی ناموفق بود.'});}});
router.get('/transactions',async(req,res)=>{
  try {
    await ensure();
    const page=Math.max(1,Number(req.query.page)||1);
    const limit=Math.min(100,Math.max(1,Number(req.query.limit)||20));
    const userId=Number(req.query.userId)||0;
    const search=String(req.query.search||'').trim();
    const status=String(req.query.status||'').trim().toLowerCase();
    const gateway=String(req.query.gateway||'').trim();
    const currency=String(req.query.currency||'').trim().toUpperCase();
    const from=String(req.query.from||'').trim();
    const to=String(req.query.to||'').trim();
    const conditions=[]; const params=[];
    if(userId){conditions.push(`userId=@p${params.length+1}`);params.push(userId);}
    if(status){conditions.push(`normalizedStatus=@p${params.length+1}`);params.push(status);}
    if(gateway){conditions.push(`gateway LIKE @p${params.length+1}`);params.push(`%${gateway}%`);}
    if(currency){conditions.push(`currency=@p${params.length+1}`);params.push(currency);}
    if(search){const p=params.length+1;conditions.push(`(referenceNo LIKE @p${p} OR authority LIKE @p${p} OR description LIKE @p${p})`);params.push(`%${search}%`);}
    if(from){const d=new Date(from);if(!Number.isNaN(d.getTime())){conditions.push(`createdAt>=@p${params.length+1}`);params.push(d);}}
    if(to){const d=new Date(to);if(!Number.isNaN(d.getTime())){d.setHours(23,59,59,999);conditions.push(`createdAt<=@p${params.length+1}`);params.push(d);}}
    const cte=`WITH AllPayments AS (
      SELECT id,userId,amount,currency,provider AS gateway,authority,refId AS referenceNo,
        CASE WHEN UPPER(status)=N'VERIFIED' THEN N'paid'
             WHEN UPPER(status) IN (N'PENDING',N'REDIRECTED',N'VERIFYING') THEN N'pending'
             WHEN UPPER(status)=N'FAILED' THEN N'failed'
             WHEN UPPER(status)=N'CANCELLED' THEN N'cancelled'
             ELSE LOWER(status) END AS normalizedStatus,
        description,createdAt,paidAt,N'zarinpal' AS source
      FROM dbo.PaymentTransaction
      UNION ALL
      SELECT id,userId,amount,currency,gateway,authority,referenceNo,LOWER(status) AS normalizedStatus,
        description,createdAt,paidAt,N'admin' AS source
      FROM dbo.AdminPaymentTransaction
    )`;
    const where=conditions.length?`WHERE ${conditions.join(' AND ')}`:'';
    const countRows=await prisma.$queryRawUnsafe(`${cte} SELECT COUNT_BIG(*) AS total FROM AllPayments ${where}`,...params);
    const total=Number(countRows[0]?.total||0);
    const offset=(page-1)*limit;
    const rows=await prisma.$queryRawUnsafe(`${cte} SELECT id,userId,amount,currency,gateway,authority,referenceNo,normalizedStatus AS status,description,createdAt,paidAt,source FROM AllPayments ${where} ORDER BY createdAt DESC,id DESC OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`,...params);
    return res.json({success:true,data:{items:rows.map(jsonSafeRow),pagination:{page,limit,total,totalPages:Math.ceil(total/limit)}}});
  } catch(e) {
    console.error('[AdminPayments] transactions:',e);
    return res.status(500).json({success:false,message:'دریافت تراکنش‌ها ناموفق بود.'});
  }
});
module.exports=router;
