'use strict';

const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const { verifyToken } = require('../middlewares/auth.middleware.cjs');

function getAuthenticatedUserId(req) {
  const rawUserId = req.user?.id ?? req.user?.userId;

  if (rawUserId === undefined || rawUserId === null) {
    return null;
  }

  const userId = Number(rawUserId);
  return Number.isNaN(userId) ? null : userId;
}

/**
 * @route   GET /api/v1/messages/unread-count
 * @desc    دریافت تعداد پیام‌های خوانده‌نشده
 * @access  Private
 */
router.get('/unread-count', verifyToken, async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'کاربر احراز هویت نشد'
      });
    }

    // اگر فیلد read / isRead در مدل وجود دارد، این بخش را مطابق schema تنظیم کن
    let count = 0;

    try {
      count = await prisma.message.count({
        where: {
          receiverId: userId,
          OR: [
            { isRead: false },
            { read: false }
          ]
        }
      });
    } catch (_error) {
      // fallback برای زمانی که یکی از فیلدهای بالا در schema وجود نداشته باشد
      count = 0;
    }

    return res.json({
      success: true,
      data: {
        count
      }
    });
  } catch (error) {
    console.error('Error fetching unread messages count:', error);
    return res.status(500).json({
      success: false,
      message: 'خطا در دریافت تعداد پیام‌های خوانده‌نشده',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/v1/messages
 * @desc    دریافت لیست پیام‌ها
 * @access  Private
 */
router.get('/', verifyToken, async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'کاربر احراز هویت نشد'
      });
    }

    const { page = 1, limit = 50, otherUserId } = req.query;
    const pageNumber = Number(page);
    const limitNumber = Number(limit);

    const safePage = Number.isNaN(pageNumber) || pageNumber < 1 ? 1 : pageNumber;
    const safeLimit = Number.isNaN(limitNumber) || limitNumber < 1 ? 50 : Math.min(limitNumber, 100);

    const skip = (safePage - 1) * safeLimit;
    const take = safeLimit;

    let whereCondition = {};

    if (otherUserId !== undefined && otherUserId !== null && otherUserId !== '') {
      const otherId = Number(otherUserId);

      if (Number.isNaN(otherId)) {
        return res.status(400).json({
          success: false,
          message: 'پارامتر otherUserId نامعتبر است'
        });
      }

      whereCondition = {
        OR: [
          { senderId: userId, receiverId: otherId },
          { senderId: otherId, receiverId: userId }
        ]
      };
    } else {
      whereCondition = {
        OR: [
          { senderId: userId },
          { receiverId: userId }
        ]
      };
    }

    const [total, messages] = await Promise.all([
      prisma.message.count({ where: whereCondition }),
      prisma.message.findMany({
        where: whereCondition,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          sender: {
            select: {
              id: true,
              username: true,
              name: true,
              avatar: true
            }
          },
          receiver: {
            select: {
              id: true,
              username: true,
              name: true,
              avatar: true
            }
          }
        }
      })
    ]);

    return res.json({
      success: true,
      data: messages,
      pagination: {
        page: safePage,
        limit: take,
        total,
        totalPages: Math.ceil(total / take)
      }
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    return res.status(500).json({
      success: false,
      message: 'خطا در دریافت پیام‌ها',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/v1/messages
 * @desc    ارسال پیام جدید
 * @access  Private
 */
router.post('/', verifyToken, async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'کاربر احراز هویت نشد'
      });
    }

    const { receiverId, content } = req.body;

    if (!receiverId || !content || !String(content).trim()) {
      return res.status(400).json({
        success: false,
        message: 'فیلدهای receiverId و content الزامی هستند'
      });
    }

    const rId = Number(receiverId);

    if (Number.isNaN(rId)) {
      return res.status(400).json({
        success: false,
        message: 'receiverId نامعتبر است'
      });
    }

    if (rId === userId) {
      return res.status(400).json({
        success: false,
        message: 'ارسال پیام به خود کاربر مجاز نیست'
      });
    }

    const receiver = await prisma.user.findUnique({
      where: { id: rId }
    });

    if (!receiver) {
      return res.status(404).json({
        success: false,
        message: 'کاربر دریافت‌کننده یافت نشد'
      });
    }

    const message = await prisma.message.create({
      data: {
        senderId: userId,
        receiverId: rId,
        content: String(content).trim()
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            name: true,
            avatar: true
          }
        },
        receiver: {
          select: {
            id: true,
            username: true,
            name: true,
            avatar: true
          }
        }
      }
    });

    return res.status(201).json({
      success: true,
      message: 'پیام با موفقیت ارسال شد',
      data: message
    });
  } catch (error) {
    console.error('Error sending message:', error);
    return res.status(500).json({
      success: false,
      message: 'خطا در ارسال پیام',
      error: error.message
    });
  }
});

module.exports = router;
