// backend/routes/roles.routes.cjs
'use strict';

var express = require('express');
var router = express.Router();

var prisma;
try {
  prisma = require('../config/prisma.cjs');
} catch (e) {
  var PrismaClient = require('@prisma/client').PrismaClient;
  prisma = new PrismaClient();
}

var authMiddleware;
try { authMiddleware = require('../middlewares/auth.middleware.cjs'); }
catch (e1) {
  try { authMiddleware = require('../middleware/auth.middleware.cjs'); }
  catch (e2) {
    try { authMiddleware = require('../middleware/auth.cjs'); }
    catch (e3) { authMiddleware = function (req, res, next) { next(); }; }
  }
}

// GET /api/roles - لیست همه نقش‌ها
router.get('/', authMiddleware, async function (req, res) {
  try {
    if (!prisma) {
      return res.status(503).json({ success: false, message: 'Database not available' });
    }

    var roles = await prisma.role.findMany({
      select: {
        id: true,
        name: true,
        title: true,
        permissions: {
          select: {
            permission: {
              select: { id: true, key: true }
            }
          }
        }
      },
      orderBy: { id: 'asc' }
    });

    // فرمت خروجی
    var formatted = roles.map(function (r) {
      return {
        id: r.id,
        name: r.name,
        title: r.title || r.name,
        permissions: (r.permissions || []).map(function (rp) {
          return rp.permission ? rp.permission.key : null;
        }).filter(Boolean)
      };
    });

    res.json({ success: true, data: formatted });
  } catch (error) {
    console.error('[ROLES] GET / error:', error.message);

    // اگر خطای title بود، بدون title تلاش کن
    try {
      var rolesFallback = await prisma.role.findMany({
        select: { id: true, name: true },
        orderBy: { id: 'asc' }
      });
      var formattedFallback = rolesFallback.map(function (r) {
        return { id: r.id, name: r.name, title: r.name, permissions: [] };
      });
      return res.json({ success: true, data: formattedFallback });
    } catch (err2) {
      res.status(500).json({
        success: false,
        message: 'خطا در دریافت لیست نقش‌ها',
        error: error.message
      });
    }
  }
});

// GET /api/roles/:id
router.get('/:id', authMiddleware, async function (req, res) {
  try {
    var id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: 'شناسه نامعتبر' });
    }

    var role = await prisma.role.findUnique({
      where: { id: id },
      select: {
        id: true,
        name: true,
        title: true,
        permissions: {
          select: {
            permission: { select: { id: true, key: true } }
          }
        }
      }
    });

    if (!role) {
      return res.status(404).json({ success: false, message: 'نقش یافت نشد' });
    }

    res.json({
      success: true,
      data: {
        id: role.id,
        name: role.name,
        title: role.title || role.name,
        permissions: (role.permissions || []).map(function (rp) {
          return rp.permission ? rp.permission.key : null;
        }).filter(Boolean)
      }
    });
  } catch (error) {
    console.error('[ROLES] GET /:id error:', error.message);
    res.status(500).json({ success: false, message: 'خطا', error: error.message });
  }
});

// POST /api/roles
router.post('/', authMiddleware, async function (req, res) {
  try {
    var body = req.body || {};
    if (!body.name) {
      return res.status(400).json({ success: false, message: 'نام نقش الزامی است' });
    }

    var newRole = await prisma.role.create({
      data: {
        name: body.name,
        title: body.title || body.name
      }
    });

    res.status(201).json({ success: true, data: newRole, message: 'نقش ایجاد شد' });
  } catch (error) {
    console.error('[ROLES] POST / error:', error.message);
    res.status(500).json({ success: false, message: 'خطا در ایجاد نقش', error: error.message });
  }
});

// PUT /api/roles/:id
router.put('/:id', authMiddleware, async function (req, res) {
  try {
    var id = parseInt(req.params.id);
    var body = req.body || {};

    var updateData = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.title !== undefined) updateData.title = body.title;

    var updated = await prisma.role.update({
      where: { id: id },
      data: updateData
    });

    res.json({ success: true, data: updated, message: 'نقش به‌روزرسانی شد' });
  } catch (error) {
    console.error('[ROLES] PUT /:id error:', error.message);
    res.status(500).json({ success: false, message: 'خطا', error: error.message });
  }
});

module.exports = router;
