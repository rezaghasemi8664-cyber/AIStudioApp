// routes/admin.routes.cjs - fixed & aligned with prisma schema
// All comments in English to avoid encoding issues
'use strict';

const express = require('express');
const router = express.Router();
const prismaModule = require('../config/prisma.cjs');
const prisma = prismaModule.prisma || prismaModule;
const path = require('path');
const fs = require('fs');
const authMiddleware = require('../middlewares/auth.middleware.cjs');
const { encryptPassword } = require('../services/passwordVault.service.cjs');

let bcrypt;
try { bcrypt = require('bcryptjs'); } catch (err) { bcrypt = require('bcrypt'); }
function firstDefined(){for(var i=0;i<arguments.length;i+=1){if(arguments[i]!==undefined&&arguments[i]!==null)return arguments[i];}return null;}
function toInt(value,fallbackValue){var parsed=parseInt(value,10);return isNaN(parsed)?fallbackValue:parsed;}
function normalizeString(value){if(value===undefined||value===null)return null;var s=String(value).trim();return s===''?null:s;}
function normalizeBoolean(value,fallbackValue){if(value===undefined)return fallbackValue;if(typeof value==='boolean')return value;if(typeof value==='string'){var v=value.trim().toLowerCase();if(v==='true')return true;if(v==='false')return false;}return Boolean(value);}
function hashPassword(p){return Promise.resolve().then(function(){if(!p||typeof p!=='string')throw new Error('Password is required');return bcrypt.hash(p,10);});}
function calcSubscription(u){var effective=u&&u._effectiveSubscription?u._effectiveSubscription:null;if(effective){var ee=new Date(effective.expiresAt),ss=effective.startsAt?new Date(effective.startsAt):null;var rd=!isNaN(ee.getTime())?Math.max(0,Math.ceil((ee.getTime()-Date.now())/86400000)):0;var aa=rd>0&&(!ss||isNaN(ss.getTime())||ss.getTime()<=Date.now());return{remainingDays:rd,isSubscriptionActive:aa};}var r=0,a=false,e=u.subscriptionEnd?new Date(u.subscriptionEnd):null;if(e&&!isNaN(e.getTime())){var s=u.subscriptionStart?new Date(u.subscriptionStart):null;var startOk=!s||isNaN(s.getTime())||s.getTime()<=Date.now();var d=Math.ceil((e.getTime()-Date.now())/86400000);r=d>0?d:0;a=d>0&&startOk;return{remainingDays:r,isSubscriptionActive:a};}if(u.subscriptionStart&&u.subscriptionMonths&&u.subscriptionMonths>0){var s=new Date(u.subscriptionStart);if(!isNaN(s.getTime())){var end=new Date(s);end.setMonth(end.getMonth()+u.subscriptionMonths);var d2=Math.ceil((end.getTime()-Date.now())/86400000);r=d2>0?d2:0;a=d2>0;}}return{remainingDays:r,isSubscriptionActive:a};}
function subscriptionStatus(u){var sub=calcSubscription(u);if(!sub.isSubscriptionActive)return'expired';return sub.remainingDays<=7?'expiring':'active';}
function calcSubscriptionDays(u){var s=u&&u.subscriptionStart?new Date(u.subscriptionStart):null,e=u&&u.subscriptionEnd?new Date(u.subscriptionEnd):null;if(s&&!isNaN(s.getTime())&&e&&!isNaN(e.getTime()))return Math.max(0,Math.ceil((e.getTime()-s.getTime())/86400000));if(s&&!isNaN(s.getTime())&&u&&u.subscriptionMonths>0){var legacyEnd=new Date(s);legacyEnd.setMonth(legacyEnd.getMonth()+u.subscriptionMonths);return Math.max(0,Math.ceil((legacyEnd.getTime()-s.getTime())/86400000));}return 0;}
var USER_SELECT={id:true,username:true,email:true,passwordEncrypted:true,name:true,firstName:true,lastName:true,phone:true,mobile:true,nationalId:true,avatar:true,bio:true,isActive:true,isDeleted:true,scalping:true,roleId:true,subscriptionStart:true,subscriptionEnd:true,subscriptionMonths:true,subscriptionType:true,analysisLimit:true,analysisLimit24h:true,analysisUsed24h:true,lastAnalysisReset:true,lastLoginAt:true,loginCount:true,createdAt:true,updatedAt:true,Role:{select:{id:true,name:true,title:true}}};
async function attachEffectiveSubscriptions(users) {
  var list=Array.isArray(users)?users:[];
  if(!list.length)return list;
  var ids=list.map(function(u){return Number(u.id);}).filter(function(id){return Number.isInteger(id)&&id>0;});
  if(!ids.length)return list;
  var now=new Date();
  var subs=await prisma.subscription.findMany({
    where:{userId:{in:ids},status:'ACTIVE',startsAt:{lte:now},expiresAt:{gt:now}},
    orderBy:{expiresAt:'desc'},
    include:{plan:true}
  });
  var byUser={};
  for(var i=0;i<subs.length;i++){var s=subs[i];if(!byUser[s.userId])byUser[s.userId]=s;}
  return list.map(function(u){return Object.assign({},u,{_effectiveSubscription:byUser[Number(u.id)]||null});});
}

function formatAdminUser(u){var sub=calcSubscription(u),role=u&&(u.Role||u.role)?(u.Role||u.role):null,fn=firstDefined(u.firstName,null),ln=firstDefined(u.lastName,null),full=((fn||'')+' '+(ln||'')).trim(),name=firstDefined(u.name,full||null,u.username,'');return{id:u.id,username:u.username,email:firstDefined(u.email,null),name:name,firstName:fn,lastName:ln,phone:firstDefined(u.phone,u.mobile,null),mobile:firstDefined(u.mobile,u.phone,null),nationalId:firstDefined(u.nationalId,null),avatar:firstDefined(u.avatar,null),bio:firstDefined(u.bio,null),isActive:typeof u.isActive==='boolean'?u.isActive:true,isDeleted:!!u.isDeleted,scalping:firstDefined(u.scalping,null),roleId:firstDefined(u.roleId,null),roleName:role?firstDefined(role.name,null):null,roleTitle:role?firstDefined(role.title,role.name,null):null,role:role||null,subscriptionStart:firstDefined(u.subscriptionStart,null),subscriptionEnd:firstDefined(u.subscriptionEnd,null),subscriptionDays:calcSubscriptionDays(u),subscriptionMonths:firstDefined(u.subscriptionMonths,0),subscriptionType:firstDefined(u.subscriptionType,'free'),analysisLimit:firstDefined(u.analysisLimit,0),analysisLimit24h:firstDefined(u.analysisLimit24h,u.analysisLimit,0),analysisUsed24h:firstDefined(u.analysisUsed24h,0),lastAnalysisReset:firstDefined(u.lastAnalysisReset,null),remainingDays:sub.remainingDays,isSubscriptionActive:sub.isSubscriptionActive,lastLoginAt:firstDefined(u.lastLoginAt,null),loginCount:firstDefined(u.loginCount,0),createdAt:u.createdAt,updatedAt:u.updatedAt};}
function requireAdmin(req,res,next){var uid=req.user&&(req.user.id||req.user.userId);if(!uid)return res.status(401).json({success:false,message:'Authentication required'});prisma.user.findUnique({where:{id:Number(uid)},include:{Role:true}}).then(function(u){if(!u||!u.Role)return res.status(403).json({success:false,message:'Access denied: admin role required'});var rn=u.Role.name?u.Role.name.toLowerCase():'';if(rn!=='admin'&&rn!=='superadmin'&&u.roleId!==1)return res.status(403).json({success:false,message:'Access denied: admin role required'});req.userRole=u.Role;next();}).catch(function(e){console.error('[Admin] requireAdmin check error:',e.message);res.status(500).json({success:false,message:'Error checking admin access'});});}
router.get('/dashboard',authMiddleware,requireAdmin,function(req,res){Promise.all([prisma.user.count({where:{isDeleted:false}}),prisma.user.count({where:{isActive:true,isDeleted:false}}),prisma.notification.count(),prisma.conversation.count(),prisma.analysisHistory.count(),prisma.apiKey.count({where:{isRevoked:false}})]).then(function(r){return prisma.user.findMany({where:{isDeleted:false},select:{subscriptionStart:true,subscriptionEnd:true,subscriptionMonths:true}}).then(function(all){var active=0;for(var i=0;i<all.length;i++)if(calcSubscription(all[i]).isSubscriptionActive)active++;return prisma.user.findMany({where:{isDeleted:false},select:USER_SELECT,orderBy:{createdAt:'desc'},take:5}).then(function(users){return attachEffectiveSubscriptions(users).then(function(usersWithSubs){users=usersWithSubs;return res.json({success:true,data:{stats:{totalUsers:r[0],activeUsers:r[1],inactiveUsers:r[0]-r[1],activeSubscriptions:active,totalNotifications:r[2],totalConversations:r[3],totalAnalysis:r[4],totalApiKeys:r[5]},recentUsers:users.map(formatAdminUser)}});});});}).catch(function(e){console.error('[Admin] Dashboard error:',e.message);res.status(500).json({success:false,message:'Error fetching dashboard data',error:e.message});});});
router.get('/users',authMiddleware,requireAdmin,function(req,res){var page=Math.max(1,toInt(req.query.page,1)),limit=Math.min(100,Math.max(1,toInt(req.query.limit,20))),search=req.query.search||'',isActive=req.query.isActive,roleId=req.query.roleId,subscriptionStatus=String(req.query.subscriptionStatus||'').toLowerCase(),skip=(page-1)*limit,where={isDeleted:false};if(search&&String(search).trim()!==''){var q=String(search).trim();where.OR=[{username:{contains:q}},{name:{contains:q}},{firstName:{contains:q}},{lastName:{contains:q}},{email:{contains:q}},{phone:{contains:q}},{mobile:{contains:q}},{nationalId:{contains:q}}];}if(isActive!==undefined&&isActive!=='')where.isActive=String(isActive)==='true';if(roleId!==undefined&&roleId!=='')where.roleId=toInt(roleId,undefined);if(subscriptionStatus&&['all','active','expiring','expired'].indexOf(subscriptionStatus)===-1)return res.status(400).json({success:false,message:'Invalid subscriptionStatus'});if(subscriptionStatus&&subscriptionStatus!=='all'){return prisma.user.findMany({where:where,select:USER_SELECT,orderBy:{createdAt:'desc'}}).then(function(all){return attachEffectiveSubscriptions(all).then(function(all){var filtered=all.filter(function(u){return subscriptionStatus(u)===subscriptionStatus;});var total=filtered.length,items=filtered.slice(skip,skip+limit);res.json({success:true,data:items.map(formatAdminUser),pagination:{page:page,limit:limit,total:total,totalPages:Math.ceil(total/limit)}});});}).catch(function(e){console.error('[Admin] Users subscription filter error:',e.message);res.status(500).json({success:false,message:'Error filtering users by subscription',error:e.message});});}Promise.all([prisma.user.findMany({where:where,select:USER_SELECT,skip:skip,take:limit,orderBy:{createdAt:'desc'}}),prisma.user.count({where:where})]).then(function(r){return attachEffectiveSubscriptions(r[0]).then(function(users){res.json({success:true,data:users.map(formatAdminUser),pagination:{page:page,limit:limit,total:r[1],totalPages:Math.ceil(r[1]/limit)}});});}).catch(function(e){console.error('[Admin] Users list error:',e.message);res.status(500).json({success:false,message:'Error fetching users list',error:e.message});});});
router.get('/subscriptions/summary',authMiddleware,requireAdmin,function(req,res){prisma.user.findMany({where:{isDeleted:false},select:{subscriptionStart:true,subscriptionEnd:true,subscriptionMonths:true}}).then(function(users){var summary={total:users.length,active:0,expiring:0,expired:0};for(var i=0;i<users.length;i++)summary[subscriptionStatus(users[i])]++;res.json({success:true,data:summary});}).catch(function(e){console.error('[Admin] Subscription summary error:',e.message);res.status(500).json({success:false,message:'Error fetching subscription summary',error:e.message});});});
router.post('/subscriptions/gift',authMiddleware,requireAdmin,async function(req,res){
  var b=req.body||{};
  var days=toInt(b.days,0);
  if(!Number.isInteger(days)||days<=0||days>3650)return res.status(400).json({success:false,message:'تعداد روزهای اشتراک هدیه باید بین ۱ تا ۳۶۵۰ روز باشد.'});
  try {
    var now=new Date();
    var users=await prisma.user.findMany({where:{isDeleted:false},select:{id:true,subscriptionStart:true,subscriptionEnd:true,subscriptionMonths:true,subscriptionType:true}});
    var ids=users.map(function(u){return Number(u.id);}).filter(function(id){return Number.isInteger(id)&&id>0;});
    var activeSubs=ids.length?await prisma.subscription.findMany({where:{userId:{in:ids},status:'ACTIVE',expiresAt:{gt:now}},orderBy:{expiresAt:'desc'}}):[];
    var byUser={};
    for(var i=0;i<activeSubs.length;i++){var sub=activeSubs[i];if(!byUser[sub.userId])byUser[sub.userId]=sub;}
    var affected=0;
    await prisma.$transaction(async function(tx){
      for(var j=0;j<users.length;j++){
        var u=users[j], current=byUser[u.id], start=current?new Date(current.startsAt):(u.subscriptionStart&&new Date(u.subscriptionStart)>now?new Date(u.subscriptionStart):now);
        var currentEnd=current?new Date(current.expiresAt):(u.subscriptionEnd?new Date(u.subscriptionEnd):null);
        if(!currentEnd||currentEnd<=now)currentEnd=now;
        var end=new Date(currentEnd.getTime()+days*86400000);
        await tx.user.update({where:{id:u.id},data:{subscriptionStart:start,subscriptionEnd:end,subscriptionMonths:0,subscriptionType:(u.subscriptionType&&String(u.subscriptionType).trim())?String(u.subscriptionType).trim():'free'}});
        if(current){
          await tx.subscription.update({where:{id:current.id},data:{expiresAt:end}});
        }else{
          await tx.subscription.create({data:{userId:u.id,planId:null,type:'ADMIN',status:'ACTIVE',startsAt:start,expiresAt:end}});
        }
        affected++;
      }
    });
    return res.json({success:true,message:'اشتراک هدیه برای کاربران با موفقیت اعمال شد.',data:{days,affectedUsers:affected}});
  } catch(e) {
    console.error('[Admin] Gift subscription error:',e.message);
    return res.status(500).json({success:false,message:'اعمال اشتراک هدیه ناموفق بود.',error:e.message});
  }
});
router.post('/users/:id/subscription/gift',authMiddleware,requireAdmin,async function(req,res){
  var id=toInt(req.params.id,NaN);
  var days=toInt(req.body&&req.body.days,0);
  if(isNaN(id))return res.status(400).json({success:false,message:'Invalid user ID'});
  if(!Number.isInteger(days)||days<=0||days>3650)return res.status(400).json({success:false,message:'تعداد روزهای هدیه باید بین ۱ تا ۳۶۵۰ روز باشد.'});
  try{
    var now=new Date();
    var ex=await prisma.user.findUnique({where:{id:id},select:USER_SELECT});
    if(!ex)return res.status(404).json({success:false,message:'User not found'});
    var current=await prisma.subscription.findFirst({where:{userId:id,status:'ACTIVE',startsAt:{lte:now},expiresAt:{gt:now}},orderBy:{expiresAt:'desc'}});
    var end=current?new Date(current.expiresAt):(ex.subscriptionEnd?new Date(ex.subscriptionEnd):null);
    if(!end||end<=now)return res.status(400).json({success:false,message:'این کاربر اشتراک فعال و اعتبار باقی‌مانده ندارد.'});
    var newEnd=new Date(end.getTime()+days*86400000);
    await prisma.$transaction(async function(tx){
      await tx.user.update({where:{id:id},data:{subscriptionEnd:newEnd,subscriptionMonths:0}});
      if(current){
        await tx.subscription.update({where:{id:current.id},data:{expiresAt:newEnd}});
      }else{
        await tx.subscription.create({data:{userId:id,planId:null,type:'ADMIN',status:'ACTIVE',startsAt:ex.subscriptionStart&&new Date(ex.subscriptionStart)<now?new Date(ex.subscriptionStart):now,expiresAt:newEnd}});
      }
    });
    return res.json({success:true,message:'اشتراک هدیه فقط برای همین کاربر اعمال شد.',data:{userId:id,days,previousEnd:end,newEnd}});
  }catch(e){
    console.error('[Admin] User gift subscription error:',e.message);
    return res.status(500).json({success:false,message:'اعمال اشتراک هدیه برای کاربر ناموفق بود.',error:e.message});
  }
});
router.get('/users/:id',authMiddleware,requireAdmin,function(req,res){var id=toInt(req.params.id,NaN);if(isNaN(id))return res.status(400).json({success:false,message:'Invalid user ID'});var sel=Object.assign({},USER_SELECT,{_count:{select:{analysis:true,apiKeys:true,notifications:true,sessions:true}}});prisma.user.findUnique({where:{id:id},select:sel}).then(function(u){if(!u)return res.status(404).json({success:false,message:'User not found'});return attachEffectiveSubscriptions([u]).then(function(withSubs){var formatted=formatAdminUser(withSubs[0]);formatted.counts=u._count||{};return res.json({success:true,data:formatted});});}).catch(function(e){console.error('[Admin] User detail error:',e.message);return res.status(500).json({success:false,message:'Error fetching user details',error:e.message});});});
});
router.post('/users',authMiddleware,requireAdmin,function(req,res){var b=req.body||{},subscriptionDays=b.subscriptionDays!==undefined&&b.subscriptionDays!==null?toInt(b.subscriptionDays,0):null,username=normalizeString(b.email),password=b.password?String(b.password):'',email=normalizeString(b.email),name=normalizeString(b.name),firstName=normalizeString(b.firstName),lastName=normalizeString(b.lastName),phone=normalizeString(b.phone),mobile=normalizeString(b.mobile),nationalId=normalizeString(b.nationalId),avatar=normalizeString(b.avatar),bio=normalizeString(b.bio),subscriptionType=normalizeString(b.subscriptionType)||'free',roleId=b.roleId!==undefined&&b.roleId!==null?toInt(b.roleId,2):2,isActive=b.isActive!==undefined?normalizeBoolean(b.isActive,true):true,scalping=b.scalping!==undefined?String(normalizeBoolean(b.scalping,false)):null,subscriptionMonths=b.subscriptionMonths!==undefined&&b.subscriptionMonths!==null?toInt(b.subscriptionMonths,0):0,analysisLimit=b.analysisLimit!==undefined&&b.analysisLimit!==null?toInt(b.analysisLimit,0):0,analysisLimit24h=b.analysisLimit24h!==undefined&&b.analysisLimit24h!==null?toInt(b.analysisLimit24h,analysisLimit):analysisLimit,analysisUsed24h=b.analysisUsed24h!==undefined&&b.analysisUsed24h!==null?toInt(b.analysisUsed24h,0):0,loginCount=b.loginCount!==undefined&&b.loginCount!==null?toInt(b.loginCount,0):0,subscriptionStart=null,subscriptionEnd=null,lastAnalysisReset=null,lastLoginAt=null;if(!email)return res.status(400).json({success:false,message:'Email is required'});if(!password||password.length<6)return res.status(400).json({success:false,message:'Password must be at least 6 characters'});if(b.subscriptionStart){subscriptionStart=new Date(b.subscriptionStart);if(isNaN(subscriptionStart.getTime()))return res.status(400).json({success:false,message:'Invalid subscriptionStart value'});}else if(subscriptionDays!==null&&subscriptionDays>0)subscriptionStart=new Date();else if(subscriptionMonths>0)subscriptionStart=new Date();if(subscriptionDays!==null&&subscriptionDays>0){if(!subscriptionStart)subscriptionStart=new Date();subscriptionEnd=new Date(subscriptionStart.getTime()+subscriptionDays*86400000);subscriptionMonths=0;}if(!subscriptionStart&&!b.subscriptionEnd&&subscriptionMonths===0&&!(subscriptionDays>0)){subscriptionStart=new Date();subscriptionEnd=new Date(subscriptionStart.getTime()+2*86400000);subscriptionType='free';}if(b.subscriptionEnd&&subscriptionDays===null){subscriptionEnd=new Date(b.subscriptionEnd);if(isNaN(subscriptionEnd.getTime()))return res.status(400).json({success:false,message:'Invalid subscriptionEnd value'});}if(b.lastAnalysisReset){lastAnalysisReset=new Date(b.lastAnalysisReset);if(isNaN(lastAnalysisReset.getTime()))return res.status(400).json({success:false,message:'Invalid lastAnalysisReset value'});}if(b.lastLoginAt){lastLoginAt=new Date(b.lastLoginAt);if(isNaN(lastLoginAt.getTime()))return res.status(400).json({success:false,message:'Invalid lastLoginAt value'});}prisma.role.findUnique({where:{id:roleId}}).then(function(role){if(!role)return res.status(400).json({success:false,message:'Invalid roleId'});var dup=[{username:username}];if(email)dup.push({email:email});if(phone)dup.push({phone:phone});if(mobile)dup.push({mobile:mobile});if(nationalId)dup.push({nationalId:nationalId});return prisma.user.findFirst({where:{OR:dup}}).then(function(ex){if(ex)return res.status(409).json({success:false,message:'User with the same username, email, phone, mobile, or national ID already exists'});return hashPassword(password).then(function(hash){return prisma.user.create({data:{username:username,passwordHash:hash,passwordEncrypted:encryptPassword(password),email:email,name:name,firstName:firstName,lastName:lastName,phone:phone,mobile:mobile,nationalId:nationalId,avatar:avatar,bio:bio,roleId:roleId,isActive:isActive,isDeleted:false,scalping:scalping,subscriptionStart:subscriptionStart,subscriptionEnd:subscriptionEnd,subscriptionMonths:subscriptionMonths,subscriptionType:subscriptionType,analysisLimit:analysisLimit,analysisLimit24h:analysisLimit24h,analysisUsed24h:analysisUsed24h,lastAnalysisReset:lastAnalysisReset,lastLoginAt:lastLoginAt,loginCount:loginCount},select:USER_SELECT}).then(function(u){res.status(201).json({success:true,message:'User created successfully',data:formatAdminUser(u)});});});});}).catch(function(e){console.error('[Admin] Create user error:',e.message);res.status(500).json({success:false,message:'Error creating user',error:e.message});});});
router.put('/users/:id',authMiddleware,requireAdmin,function(req,res){var id=toInt(req.params.id,NaN);if(isNaN(id))return res.status(400).json({success:false,message:'Invalid user ID'});var b=req.body||{},d={};if(b.name!==undefined)d.name=normalizeString(b.name);if(b.firstName!==undefined)d.firstName=normalizeString(b.firstName);if(b.lastName!==undefined)d.lastName=normalizeString(b.lastName);if(b.email!==undefined)d.email=normalizeString(b.email);if(b.phone!==undefined)d.phone=normalizeString(b.phone);if(b.mobile!==undefined)d.mobile=normalizeString(b.mobile);if(b.nationalId!==undefined)d.nationalId=normalizeString(b.nationalId);if(b.avatar!==undefined)d.avatar=normalizeString(b.avatar);if(b.bio!==undefined)d.bio=normalizeString(b.bio);if(b.isActive!==undefined)d.isActive=normalizeBoolean(b.isActive,true);if(b.scalping!==undefined)d.scalping=String(normalizeBoolean(b.scalping,false));if(b.roleId!==undefined)d.roleId=toInt(b.roleId,undefined);if(b.subscriptionType!==undefined)d.subscriptionType=normalizeString(b.subscriptionType)||'free';if(b.analysisLimit!==undefined)d.analysisLimit=toInt(b.analysisLimit,0);if(b.analysisLimit24h!==undefined)d.analysisLimit24h=toInt(b.analysisLimit24h,0);if(b.analysisUsed24h!==undefined)d.analysisUsed24h=toInt(b.analysisUsed24h,0);if(b.loginCount!==undefined)d.loginCount=toInt(b.loginCount,0);if(b.subscriptionStart!==undefined)d.subscriptionStart=b.subscriptionStart?new Date(b.subscriptionStart):null;if(b.subscriptionEnd!==undefined)d.subscriptionEnd=b.subscriptionEnd?new Date(b.subscriptionEnd):null;if(b.subscriptionDays!==undefined){var days=toInt(b.subscriptionDays,0);d.subscriptionMonths=0;d.subscriptionStart=d.subscriptionStart||new Date();d.subscriptionEnd=new Date(d.subscriptionStart.getTime()+days*86400000);}else if(b.subscriptionMonths!==undefined)d.subscriptionMonths=toInt(b.subscriptionMonths,0);if(b.lastAnalysisReset!==undefined)d.lastAnalysisReset=b.lastAnalysisReset?new Date(b.lastAnalysisReset):null;if(b.lastLoginAt!==undefined)d.lastLoginAt=b.lastLoginAt?new Date(b.lastLoginAt):null;if(Object.keys(d).length===0)return res.status(400).json({success:false,message:'No fields to update'});prisma.user.findUnique({where:{id:id}}).then(function(ex){if(!ex)return res.status(404).json({success:false,message:'User not found'});if(b.subscriptionDays!==undefined&&!d.subscriptionStart){d.subscriptionStart=ex.subscriptionStart||new Date();d.subscriptionEnd=new Date(d.subscriptionStart.getTime()+toInt(b.subscriptionDays,0)*86400000);}return prisma.user.update({where:{id:id},data:d,select:USER_SELECT}).then(function(u){res.json({success:true,message:'User updated successfully',data:formatAdminUser(u)});});}).catch(function(e){console.error('[Admin] User update error:',e.message);res.status(500).json({success:false,message:'Error updating user',error:e.message});});});
router.put('/users/:id/subscription',authMiddleware,requireAdmin,async function(req,res){
  var id=toInt(req.params.id,NaN);
  if(isNaN(id))return res.status(400).json({success:false,message:'Invalid user ID'});
  var b=req.body||{};
  try {
    var ex=await prisma.user.findUnique({where:{id:id},select:USER_SELECT});
    if(!ex)return res.status(404).json({success:false,message:'User not found'});

    var now=new Date();
    var current=await prisma.subscription.findFirst({
      where:{userId:id,status:'ACTIVE',startsAt:{lte:now},expiresAt:{gt:now}},
      orderBy:{expiresAt:'desc'},
      include:{plan:true}
    });

    var requestedDays=b.subscriptionDays!==undefined?Math.max(0,toInt(b.subscriptionDays,0)):0;
    var requestedMonths=b.subscriptionMonths!==undefined?Math.max(0,toInt(b.subscriptionMonths,0)):0;
    var isActive=b.isSubscriptionActive===undefined?true:normalizeBoolean(b.isSubscriptionActive,true);
    var start=current?new Date(current.startsAt):(ex.subscriptionStart?new Date(ex.subscriptionStart):now);
    var end=current?new Date(current.expiresAt):null;

    // Admin renewal extends the existing validity instead of replacing it.
    if(requestedDays>0){
      if(!end||end<=now) { start=now; end=new Date(now); }
      end=new Date(end.getTime()+requestedDays*86400000);
    }else if(requestedMonths>0){
      if(!end||end<=now) { start=now; end=new Date(now); }
      var originalDay=end.getDate();
      end.setMonth(end.getMonth()+requestedMonths);
      if(end.getDate()<originalDay)end.setDate(0);
    }else if(b.subscriptionStart!==undefined||b.subscriptionEnd!==undefined){
      start=b.subscriptionStart?new Date(b.subscriptionStart):(ex.subscriptionStart||now);
      end=b.subscriptionEnd?new Date(b.subscriptionEnd):ex.subscriptionEnd;
    }else if(!end&&ex.subscriptionEnd){
      end=new Date(ex.subscriptionEnd);
    }

    if(start&&isNaN(start.getTime()))return res.status(400).json({success:false,message:'Invalid subscriptionStart value'});
    if(end&&isNaN(end.getTime()))return res.status(400).json({success:false,message:'Invalid subscriptionEnd value'});

    var d={};
    if(b.analysisLimit!==undefined)d.analysisLimit=toInt(b.analysisLimit,0);
    if(b.analysisLimit24h!==undefined)d.analysisLimit24h=toInt(b.analysisLimit24h,0);
    if(b.analysisUsed24h!==undefined)d.analysisUsed24h=toInt(b.analysisUsed24h,0);
    if(b.subscriptionType!==undefined)d.subscriptionType=normalizeString(b.subscriptionType)||'free';

    if(isActive&&start&&end&&end>now){
      d.subscriptionStart=start;
      d.subscriptionEnd=end;
      d.subscriptionMonths=requestedMonths>0?requestedMonths:0;
    }else if(!isActive){
      d.subscriptionStart=start||ex.subscriptionStart||null;
      d.subscriptionEnd=end||ex.subscriptionEnd||null;
      d.subscriptionMonths=0;
    }

    var result=await prisma.$transaction(async function(tx){
      var u=await tx.user.update({where:{id:id},data:d,select:USER_SELECT});
      if(isActive&&start&&end&&end>now){
        await tx.subscription.updateMany({where:{userId:id,status:'ACTIVE',expiresAt:{gt:now}},data:{status:'CANCELLED'}});
        await tx.subscription.create({data:{
          userId:id,planId:null,type:current&&current.type?String(current.type):'ADMIN',
          status:'ACTIVE',startsAt:start,expiresAt:end
        }});
      }else if(!isActive){
        await tx.subscription.updateMany({where:{userId:id,status:'ACTIVE',expiresAt:{gt:now}},data:{status:'CANCELLED'}});
      }
      return u;
    });
    var f=formatAdminUser(Object.assign({},result,{_effectiveSubscription:isActive?{startsAt:start,expiresAt:end}:null}));
    return res.json({success:true,message:'Subscription updated successfully',data:{
      id:f.id,username:f.username,subscriptionDays:calcSubscriptionDays(result),
      subscriptionStart:f.subscriptionStart,subscriptionEnd:f.subscriptionEnd,
      subscriptionMonths:f.subscriptionMonths,subscriptionType:f.subscriptionType,
      analysisLimit:f.analysisLimit,analysisLimit24h:f.analysisLimit24h,
      analysisUsed24h:f.analysisUsed24h,remainingDays:f.remainingDays,
      isSubscriptionActive:f.isSubscriptionActive
    }});
  } catch(e) {
    console.error('[Admin] Subscription update error:',e.message);
    return res.status(500).json({success:false,message:'Error updating subscription',error:e.message});
  }
});
router.put('/users/:id/toggle-active',authMiddleware,requireAdmin,function(req,res){var id=toInt(req.params.id,NaN);if(isNaN(id))return res.status(400).json({success:false,message:'Invalid user ID'});var current=req.user&&(req.user.id||req.user.userId);if(id===Number(current))return res.status(400).json({success:false,message:'You cannot change your own active status'});prisma.user.findUnique({where:{id:id}}).then(function(ex){if(!ex)return res.status(404).json({success:false,message:'User not found'});if(ex.isDeleted)return res.status(400).json({success:false,message:'Cannot toggle active status for a deleted user'});return prisma.user.update({where:{id:id},data:{isActive:!ex.isActive},select:USER_SELECT}).then(function(u){res.json({success:true,message:u.isActive?'User activated':'User deactivated',data:formatAdminUser(u)});});}).catch(function(e){res.status(500).json({success:false,message:'Error toggling user status',error:e.message});});});
router.put('/users/:id/reset-password',authMiddleware,requireAdmin,function(req,res){var id=toInt(req.params.id,NaN),p=req.body&&req.body.newPassword?String(req.body.newPassword):'';if(isNaN(id))return res.status(400).json({success:false,message:'Invalid user ID'});if(!p||p.length<6)return res.status(400).json({success:false,message:'New password must be at least 6 characters'});prisma.user.findUnique({where:{id:id}}).then(function(ex){if(!ex)return res.status(404).json({success:false,message:'User not found'});return hashPassword(p).then(function(h){return prisma.user.update({where:{id:id},data:{passwordHash:h,passwordEncrypted:encryptPassword(p),passwordChangedAt:new Date(),updatedAt:new Date()}}).then(function(){return prisma.session.deleteMany({where:{userId:id}}).catch(function(){});}).then(function(){res.json({success:true,forceLogout:id===Number(req.user&&(req.user.id||req.user.userId)),message:'User password reset successfully'});});});}).catch(function(e){res.status(500).json({success:false,message:'Error resetting user password',error:e.message});});});
router.delete('/users/:id',authMiddleware,requireAdmin,function(req,res){var id=toInt(req.params.id,NaN),current=req.user&&(req.user.id||req.user.userId);if(isNaN(id))return res.status(400).json({success:false,message:'Invalid user ID'});if(id===Number(current))return res.status(400).json({success:false,message:'Cannot delete your own account'});prisma.user.findUnique({where:{id:id}}).then(function(ex){if(!ex)return res.status(404).json({success:false,message:'User not found'});return prisma.user.update({where:{id:id},data:{isDeleted:true,isActive:false}}).then(function(){res.json({success:true,message:'User deleted successfully'});});}).catch(function(e){res.status(500).json({success:false,message:'Error deleting user',error:e.message});});});
router.get('/roles',authMiddleware,requireAdmin,function(req,res){prisma.role.findMany({select:{id:true,name:true,title:true,_count:{select:{users:true}}},orderBy:{id:'asc'}}).then(function(rs){res.json({success:true,data:rs.map(function(r){return{id:r.id,name:r.name,title:firstDefined(r.title,r.name,null),userCount:r._count?r._count.users:0};})});}).catch(function(e){res.status(500).json({success:false,message:'Error fetching roles',error:e.message});});});
router.get('/logs',authMiddleware,requireAdmin,function(req,res){var page=toInt(req.query.page,1),limit=toInt(req.query.limit,50),level=req.query.level||'',offset=(page-1)*limit,countQuery,dataQuery;if(level&&String(level).trim()!==''){countQuery=prisma.$queryRawUnsafe("SELECT COUNT(*) as cnt FROM [dbo].[LogEntry] WHERE level = '"+String(level).replace(/'/g,"''")+"'");dataQuery=function(skip,take){return prisma.$queryRawUnsafe("SELECT id, level, message, createdAt FROM [dbo].[LogEntry] WHERE level = '"+String(level).replace(/'/g,"''")+"' ORDER BY id DESC OFFSET "+skip+" ROWS FETCH NEXT "+take+" ROWS ONLY");};}else{countQuery=prisma.$queryRawUnsafe('SELECT COUNT(*) as cnt FROM [dbo].[LogEntry]');dataQuery=function(skip,take){return prisma.$queryRawUnsafe('SELECT id, level, message, createdAt FROM [dbo].[LogEntry] ORDER BY id DESC OFFSET '+skip+' ROWS FETCH NEXT '+take+' ROWS ONLY');};}countQuery.then(function(cr){var total=Number(cr[0].cnt);return dataQuery(offset,limit).then(function(logs){res.json({success:true,data:logs,pagination:{page:page,limit:limit,total:total,totalPages:Math.ceil(total/limit)}});});}).catch(function(e){var file=path.join(__dirname,'..','access.log'),logs=[],total=0;if(fs.existsSync(file)){try{var lines=fs.readFileSync(file,'utf-8').split('\n').filter(function(l){return l.trim()!=='';});var rev=lines.reverse().slice(0,500);total=rev.length;for(var i=offset;i<Math.min(offset+limit,total);i++)logs.push({id:total-i,level:'info',message:rev[i],createdAt:new Date()});}catch(_){} }res.json({success:true,data:logs,pagination:{page:page,limit:limit,total:total,totalPages:Math.ceil(total/limit)}});});});
router.get('/stats',authMiddleware,requireAdmin,function(req,res){Promise.all([prisma.user.count().then(function(c){return{model:'users',count:c};}),prisma.user.count({where:{isActive:true}}).then(function(c){return{model:'activeUsers',count:c};}),prisma.notification.count().then(function(c){return{model:'notifications',count:c};}),prisma.conversation.count().then(function(c){return{model:'conversations',count:c};}),prisma.message.count().then(function(c){return{model:'messages',count:c};}),prisma.analysisHistory.count().then(function(c){return{model:'analyses',count:c};}),prisma.apiKey.count().then(function(c){return{model:'apiKeys',count:c};}),prisma.session.count().then(function(c){return{model:'sessions',count:c};})]).then(function(cs){var s={};for(var i=0;i<cs.length;i++)s[cs[i].model]=cs[i].count;res.json({success:true,data:s});}).catch(function(e){res.status(500).json({success:false,message:'Error fetching stats',error:e.message});});});
router.get('/health',authMiddleware,requireAdmin,function(req,res){var start=Date.now();prisma.$queryRawUnsafe('SELECT 1 as ok').then(function(){res.json({success:true,data:{status:'healthy',database:'connected',dbResponseTime:(Date.now()-start)+'ms',uptime:process.uptime(),memoryUsage:process.memoryUsage(),timestamp:new Date().toISOString()}});}).catch(function(e){res.status(500).json({success:true,data:{status:'degraded',database:'error',error:e.message,timestamp:new Date().toISOString()}});});});
module.exports=router;
