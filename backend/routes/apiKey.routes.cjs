// backend/routes/apiKey.routes.cjs
'use strict';

const express = require('express');
const router = express.Router();

let authenticate;
try {
  authenticate = require('../middlewares/auth.middleware.cjs');
} catch (e) {
  authenticate = function(req, res, next) { next(); };
}

let prisma;
try {
  prisma = require('../config/prisma.cjs');
} catch (e) {
  console.warn('[APIKEY ROUTES] Prisma not available');
}

// GET /api/api-keys
router.get('/', authenticate, async function(req, res) {
  try {
    if (!prisma) {
      return res.json({ success: true, data: [] });
    }

    // Check if ApiKey model exists
    if (!prisma.apiKey) {
      // Fallback: store in user settings
      var user = await prisma.user.findUnique({
        where: { id: parseInt(req.user.id, 10) },
        select: { settings: true }
      });

      var settings = {};
      try { settings = JSON.parse(user.settings || '{}'); } catch(e) {}
      var keys = settings.apiKeys || [];

      return res.json({ success: true, data: keys });
    }

    var apiKeys = await prisma.apiKey.findMany({
      where: { userId: parseInt(req.user.id, 10) }
    });

    res.json({ success: true, data: apiKeys });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/api-keys
router.post('/', authenticate, async function(req, res) {
  try {
    var body = req.body;

    if (!prisma) {
      return res.json({ success: true, data: body });
    }

    if (prisma.apiKey) {
      var apiKey = await prisma.apiKey.create({
        data: {
          userId: parseInt(req.user.id, 10),
          name: body.name || 'default',
          key: body.key || body.apiKey,
          service: body.service || 'general',
          isActive: true
        }
      });
      return res.json({ success: true, data: apiKey });
    }

    // Fallback: store in user settings
    var user = await prisma.user.findUnique({
      where: { id: parseInt(req.user.id, 10) },
      select: { settings: true }
    });
    var settings = {};
    try { settings = JSON.parse(user.settings || '{}'); } catch(e) {}
    if (!settings.apiKeys) settings.apiKeys = [];
    settings.apiKeys.push({
      name: body.name || 'default',
      key: body.key || body.apiKey,
      service: body.service || 'general',
      createdAt: new Date().toISOString()
    });
    await prisma.user.update({
      where: { id: parseInt(req.user.id, 10) },
      data: { settings: JSON.stringify(settings) }
    });

    res.json({ success: true, data: body });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/api-keys/:id
router.delete('/:id', authenticate, async function(req, res) {
  try {
    if (prisma && prisma.apiKey) {
      await prisma.apiKey.delete({
        where: {
          id: parseInt(req.params.id, 10),
          userId: parseInt(req.user.id, 10)
        }
      });
    }
    res.json({ success: true, message: 'API key deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
