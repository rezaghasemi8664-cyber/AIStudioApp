// backend/routes/apiKey.routes.cjs
'use strict';

const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware.cjs');
const { prisma } = require('../config/prisma.cjs');

function currentUserId(req) {
  return Number(req.user?.id ?? req.user?.userId ?? 0) || 0;
}

// GET /api/api-keys — never return the secret value.
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = currentUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: 'کاربر احراز هویت نشده است.' });

    const apiKeys = await prisma.apiKey.findMany({
      where: { userId },
      select: { id: true, name: true, createdAt: true, isRevoked: true },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: apiKeys });
  } catch (err) {
    res.status(500).json({ success: false, message: 'دریافت کلیدهای API ناموفق بود.' });
  }
});

// POST /api/api-keys — create a key and return it only once.
router.post('/', authMiddleware, async (req, res) => {
  try {
    const userId = currentUserId(req);
    const value = String(req.body?.key ?? req.body?.apiKey ?? '').trim();
    const name = String(req.body?.name ?? 'default').trim().slice(0, 100) || 'default';
    if (!userId || !value) return res.status(400).json({ success: false, message: 'کلید API الزامی است.' });

    const apiKey = await prisma.apiKey.create({
      data: { userId, name, value, isRevoked: false },
      select: { id: true, name: true, createdAt: true, isRevoked: true },
    });

    res.status(201).json({ success: true, data: { ...apiKey, key: value } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'ایجاد کلید API ناموفق بود.' });
  }
});

// DELETE /api/api-keys/:id — revoke instead of hard-delete for auditability.
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const userId = currentUserId(req);
    const id = Number(req.params.id);
    if (!userId || !id) return res.status(400).json({ success: false, message: 'شناسه کلید API نامعتبر است.' });

    const result = await prisma.apiKey.updateMany({
      where: { id, userId, isRevoked: false },
      data: { isRevoked: true },
    });
    if (!result.count) return res.status(404).json({ success: false, message: 'کلید API پیدا نشد یا قبلاً لغو شده است.' });

    res.json({ success: true, data: { revoked: true, id } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'لغو کلید API ناموفق بود.' });
  }
});

module.exports = router;
