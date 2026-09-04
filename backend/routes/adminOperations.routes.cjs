const express = require('express');
const { prisma } = require('../config/prisma.cjs');
const authMiddleware = require('../middlewares/auth.middleware.cjs');

const router = express.Router();
const MODULES = [
  ['dashboard','داشبورد مدیریتی'],['users','مدیریت کاربران'],['subscriptions','اشتراک‌ها و اعتبار'],['analysis','مدیریت تحلیل‌ها'],['market','مدیریت بازار'],['scalping','نوسان‌گیری'],['ai','هوش مصنوعی'],['prompts','مدیریت پرامپت‌ها'],['history','تاریخچه تحلیل‌ها'],['notifications','اطلاع‌رسانی'],['monitoring','مانیتورینگ سیستم'],['reports','گزارش‌ها'],['security','امنیت و دسترسی'],['settings','تنظیمات سامانه'],['maintenance','حالت تعمیرات'],['updates','بروزرسانی و استقرار'],['backup','پشتیبان‌گیری و بازیابی'],['payments','پرداخت‌ها و تراکنش‌ها'],['roles','نقش‌ها و مجوزها'],['audit','گزارش Audit Log'],['sessions','مدیریت نشست‌ها'],['api','سرویس‌ها و APIها'],['infrastructure','سلامت زیرساخت']
].map(([key,title]) => ({key,title}));

let tablesReady = false;
async function ensureTables() {
  if (tablesReady) return;
  await prisma.$executeRawUnsafe(`
    IF OBJECT_ID(N'dbo.AdminControlRecord', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.AdminControlRecord (
        id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        moduleKey NVARCHAR(50) NOT NULL UNIQUE,
        title NVARCHAR(200) NOT NULL,
        enabled BIT NOT NULL CONSTRAINT DF_AdminControlRecord_enabled DEFAULT 1,
        configJson NVARCHAR(MAX) NULL,
        version INT NOT NULL CONSTRAINT DF_AdminControlRecord_version DEFAULT 1,
        updatedBy INT NULL,
        createdAt DATETIME2 NOT NULL CONSTRAINT DF_AdminControlRecord_createdAt DEFAULT SYSDATETIME(),
        updatedAt DATETIME2 NOT NULL CONSTRAINT DF_AdminControlRecord_updatedAt DEFAULT SYSDATETIME()
      );
    END;
    IF OBJECT_ID(N'dbo.AdminAuditLog', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.AdminAuditLog (
        id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        adminUserId INT NULL,
        action NVARCHAR(100) NOT NULL,
        moduleKey NVARCHAR(50) NULL,
        targetId NVARCHAR(100) NULL,
        method NVARCHAR(10) NULL,
        path NVARCHAR(500) NULL,
        statusCode INT NULL,
        ipAddress NVARCHAR(100) NULL,
        userAgent NVARCHAR(500) NULL,
        detailsJson NVARCHAR(MAX) NULL,
        createdAt DATETIME2 NOT NULL CONSTRAINT DF_AdminAuditLog_createdAt DEFAULT SYSDATETIME()
      );
    END;
  `);
  for (const {key,title} of MODULES) {
    await prisma.$executeRawUnsafe(`IF NOT EXISTS (SELECT 1 FROM dbo.AdminControlRecord WHERE moduleKey=@p1) INSERT INTO dbo.AdminControlRecord(moduleKey,title,enabled,configJson,version) VALUES(@p1,@p2,1,@p3,1);`, key, title, JSON.stringify({description:title}));
  }
  tablesReady = true;
}
function uid(req){return Number(req.user?.id ?? req.user?.userId ?? 0)||null;}
function isAdmin(req){const u=req.user||{};if(u.isAdmin===true||String(u.role||'').toLowerCase()==='admin')return true;return (Array.isArray(u.roles)?u.roles:[]).some(r=>String(typeof r==='string'?r:r?.name).toLowerCase()==='admin');}
function requireAdmin(req,res,next){if(!isAdmin(req))return res.status(403).json({success:false,message:'دسترسی فقط برای مدیر سامانه مجاز است.'});next();}
async function audit(req,action,moduleKey,statusCode,details=null){try{await ensureTables();await prisma.$executeRawUnsafe(`INSERT INTO dbo.AdminAuditLog(adminUserId,action,moduleKey,method,path,statusCode,ipAddress,userAgent,detailsJson) VALUES(@p0,@p1,@p2,@p3,@p4,@p5,@p6,@p7,@p8)`,uid(req),action,moduleKey||null,req.method,req.originalUrl,statusCode,req.ip||null,String(req.get('user-agent')||'').slice(0,500),details?JSON.stringify(details):null);}catch(e){console.error('[admin-ops] audit failed:',e.message);}}
function validConfig(v){return v!==null&&typeof v==='object'&&!Array.isArray(v);}
async function getControl(key){await ensureTables();const rows=await prisma.$queryRawUnsafe(`SELECT TOP 1 id,moduleKey,title,enabled,configJson,version,updatedBy,createdAt,updatedAt FROM dbo.AdminControlRecord WHERE moduleKey=@p0`,key);if(rows[0]){let config={};try{config=rows[0].configJson?JSON.parse(rows[0].configJson):{};}catch(_){}return {...rows[0],enabled:Boolean(rows[0].enabled),config};}const item=MODULES.find(m=>m.key===key);await prisma.$executeRawUnsafe(`INSERT INTO dbo.AdminControlRecord(moduleKey,title,enabled,configJson,version) VALUES(@p0,@p1,1,@p2,1)`,key,item?.title||key,'{}');return{id:null,moduleKey:key,title:item?.title||key,enabled:true,version:1,config:{},updatedBy:null,createdAt:null,updatedAt:null};}
async function countModel(model,where){try{return await prisma[model].count(where?{where}:undefined);}catch(_){return 0;}}
async function countsFor(key){const c={};switch(key){case'dashboard':c.users=await countModel('user',{isDeleted:false});c.analyses=await countModel('analysisHistory');c.notifications=await countModel('notification');c.sessions=await countModel('session');c.apiKeys=await countModel('apiKey',{isRevoked:false});c.conversations=await countModel('conversation');break;case'users':c.users=await countModel('user',{isDeleted:false});c.activeUsers=await countModel('user',{isDeleted:false,isActive:true});c.inactiveUsers=Math.max(0,c.users-c.activeUsers);break;case'subscriptions':c.users=await countModel('user',{isDeleted:false});c.activeSubscriptions=await countModel('user',{isDeleted:false,isActive:true});break;case'analysis':case'history':c.analyses=await countModel('analysisHistory');break;case'market':c.marketHistory=await countModel('marketHistory');c.marketDaily=await countModel('marketDaily');c.marketSummary=await countModel('marketSummary');break;case'scalping':c.scalpingRuns=await countModel('scalpingRun');c.opportunities=await countModel('scalpingOpportunity');c.results=await countModel('scalpingResult');break;case'notifications':c.notifications=await countModel('notification');break;case'monitoring':c.logs=await countModel('logEntry');c.sessions=await countModel('session');break;case'reports':c.analyses=await countModel('analysisHistory');c.marketSummaries=await countModel('marketSummary');c.users=await countModel('user',{isDeleted:false});break;case'security':c.sessions=await countModel('session');c.users=await countModel('user',{isDeleted:false});c.apiKeys=await countModel('apiKey',{isRevoked:false});break;case'roles':c.roles=await countModel('role');c.permissions=await countModel('permission');c.roleAssignments=await countModel('rolePermission');break;case'sessions':c.sessions=await countModel('session');break;case'api':c.apiKeys=await countModel('apiKey',{isRevoked:false});break;case'audit':await ensureTables();{const r=await prisma.$queryRawUnsafe(`SELECT COUNT_BIG(*) AS total FROM dbo.AdminAuditLog`);c.total=Number(r[0]?.total||0);}break;default:c.configured=1;}
return c;}
async function overview(req,res){const key=req.params.key,item=MODULES.find(m=>m.key===key);if(!item)return res.status(404).json({success:false,message:'ماژول مدیریتی پیدا نشد.'});try{const control=await getControl(key),counts=await countsFor(key);return res.json({success:true,data:{moduleKey:key,title:item.title,enabled:control.enabled,version:Number(control.version||1),config:control.config,counts}});}catch(error){await audit(req,'VIEW_MODULE_ERROR',key,500,{error:error.message});return res.status(500).json({success:false,message:'دریافت اطلاعات ماژول ناموفق بود.'});}}
async function saveConfig(req,res){const key=req.params.key,item=MODULES.find(m=>m.key===key);if(!item)return res.status(404).json({success:false,message:'ماژول مدیریتی پیدا نشد.'});const {enabled,config}=req.body||{};if(typeof enabled!=='boolean')return res.status(400).json({success:false,message:'مقدار فعال/غیرفعال نامعتبر است.'});if(!validConfig(config))return res.status(400).json({success:false,message:'تنظیمات باید یک شیء JSON معتبر باشد.'});try{const current=await getControl(key),version=Number(current.version||1)+1;await prisma.$executeRawUnsafe(`UPDATE dbo.AdminControlRecord SET enabled=@p0,configJson=@p1,version=@p2,updatedBy=@p3,updatedAt=SYSDATETIME() WHERE moduleKey=@p4`,enabled?1:0,JSON.stringify(config),version,uid(req),key);await audit(req,'UPDATE_MODULE_CONFIG',key,200,{enabled,version});return overview(req,res);}catch(error){await audit(req,'UPDATE_MODULE_CONFIG_ERROR',key,500,{error:error.message});return res.status(500).json({success:false,message:'ذخیره تنظیمات ماژول ناموفق بود.'});}}
router.use(authMiddleware,requireAdmin);
router.get('/_catalog/list',async(_req,res)=>res.json({success:true,data:MODULES}));
router.get('/:key',overview);
router.put('/:key/config',saveConfig);
module.exports=router;
