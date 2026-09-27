'use strict';

const express=require('express');
const router=express.Router();
const prismaModule=require('../config/prisma.cjs');
const prisma=prismaModule.prisma||prismaModule;
const auth=require('../middlewares/auth.middleware.cjs');
const verifyToken=auth.verifyToken||auth;
const requireAdmin=auth.requireAdmin;

function getAuthenticatedUserId(req){const raw=req.user?.id??req.user?.userId;if(raw===undefined||raw===null)return null;const id=Number(raw);return Number.isNaN(id)?null:id;}
async function getAdminUserId(){const admin=await prisma.user.findFirst({where:{isActive:true,isDeleted:false,Role:{name:{in:['ADMIN','SUPERADMIN']}}},select:{id:true}});return admin?.id??null;}
const messageInclude=()=>({sender:{select:{id:true,username:true,name:true,avatar:true}},receiver:{select:{id:true,username:true,name:true,avatar:true}}});
async function createUserNotification(userId, message) {
  try {
    if (!prisma.notification) return;
    await prisma.notification.create({ data:{ userId:Number(userId), title:'پیام جدید از مدیر سیستم', message:String(message), type:'INFO' } });
  } catch (error) {
    console.error('Error creating message notification:', error);
  }
}

router.get('/unread-count',verifyToken,async(req,res)=>{try{const userId=getAuthenticatedUserId(req);if(!userId)return res.status(401).json({success:false,message:'کاربر احراز هویت نشد'});return res.json({success:true,data:{count:0}});}catch(error){return res.status(500).json({success:false,message:'خطا در دریافت تعداد پیام‌های خوانده‌نشده'});}});

router.get('/',verifyToken,async(req,res)=>{
 try{
  const userId=getAuthenticatedUserId(req);if(!userId)return res.status(401).json({success:false,message:'کاربر احراز هویت نشد'});
  const {page=1,limit=50,otherUserId}=req.query;const pn=Number(page),ln=Number(limit);const pageNumber=Number.isNaN(pn)||pn<1?1:pn;const take=Number.isNaN(ln)||ln<1?50:Math.min(ln,100);const skip=(pageNumber-1)*take;
  let where;if(otherUserId!==undefined&&otherUserId!==''){const oid=Number(otherUserId);if(Number.isNaN(oid))return res.status(400).json({success:false,message:'پارامتر otherUserId نامعتبر است'});where={OR:[{senderId:userId,receiverId:oid},{senderId:oid,receiverId:userId}]};}else where={OR:[{senderId:userId},{receiverId:userId}]};
  const [total,messages]=await Promise.all([prisma.message.count({where}),prisma.message.findMany({where,orderBy:{createdAt:'desc'},skip,take,include:messageInclude()})]);
  return res.json({success:true,data:messages,pagination:{page:pageNumber,limit:take,total,totalPages:Math.ceil(total/take)}});
 }catch(error){console.error('Error fetching messages:',error);return res.status(500).json({success:false,message:'خطا در دریافت پیام‌ها',error:error.message});}
});

router.post('/',verifyToken,async(req,res)=>{
 try{
  const userId=getAuthenticatedUserId(req);if(!userId)return res.status(401).json({success:false,message:'کاربر احراز هویت نشد'});
  const content=String(req.body?.content??req.body?.message??'').trim();if(!content)return res.status(400).json({success:false,message:'متن پیام الزامی است'});
  let receiverId=req.body?.receiverId!=null?Number(req.body.receiverId):null;if(receiverId!==null&&Number.isNaN(receiverId))return res.status(400).json({success:false,message:'receiverId نامعتبر است'});
  if(receiverId===null){if(req.user?.isAdmin)return res.status(400).json({success:false,message:'برای ارسال پیام از طرف ادمین، receiverId الزامی است'});receiverId=await getAdminUserId();if(!receiverId)return res.status(503).json({success:false,message:'مدیر فعال سیستم یافت نشد'});}
  if(receiverId===userId)return res.status(400).json({success:false,message:'ارسال پیام به خود کاربر مجاز نیست'});
  const receiver=await prisma.user.findFirst({where:{id:receiverId,isActive:true,isDeleted:false},select:{id:true}});if(!receiver)return res.status(404).json({success:false,message:'کاربر دریافت‌کننده یافت نشد'});
  const created=await prisma.message.create({data:{senderId:userId,receiverId,content},include:messageInclude()});
  if (req.user?.isAdmin) await createUserNotification(receiverId, content);
  return res.status(201).json({success:true,message:'پیام با موفقیت ارسال شد',data:created});
 }catch(error){console.error('Error sending message:',error);return res.status(500).json({success:false,message:'خطا در ارسال پیام',error:error.message});}
});

router.post('/:id/reply',verifyToken,requireAdmin,async(req,res)=>{
 try{
  const adminId=getAuthenticatedUserId(req),messageId=Number(req.params.id),text=String(req.body?.text??'').trim();
  if(!adminId||Number.isNaN(messageId)||!text)return res.status(400).json({success:false,message:'پارامترهای پاسخ نامعتبر است'});
  const original=await prisma.message.findUnique({where:{id:messageId}});
  if(!original?.senderId)return res.status(404).json({success:false,message:'پیام اصلی یافت نشد'});
  if(Number(original.senderId)===adminId)return res.status(400).json({success:false,message:'این پیام ورودی کاربر نیست'});
  const receiverId=Number(original.senderId);
  const created=await prisma.message.create({data:{senderId:adminId,receiverId,content:text},include:messageInclude()});
  await createUserNotification(receiverId, text);
  return res.status(201).json({success:true,message:'پاسخ با موفقیت ارسال شد',data:created});
 }catch(error){console.error('Error replying to message:',error);return res.status(500).json({success:false,message:'خطا در ارسال پاسخ',error:error.message});}
});
module.exports=router;
