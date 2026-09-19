'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const authMiddleware = require('../middlewares/auth.middleware.cjs');
const { hasPermission } = require('../services/rbac.service.cjs');
const env = require('../config/env.cjs');

const router = express.Router();
const PLUGIN_ZIP = path.resolve(env.FARAZ_SMS_PLUGIN_ZIP);
const PLUGIN_ID = 'faraz-sms';
const PLUGIN_NAME = 'Faraz SMS';
const PLUGIN_VERSION = '3.22.212';

function uid(req) {
  return Number(req.user?.id ?? req.user?.userId ?? 0) || null;
}

async function allowed(req) {
  return !!(uid(req) && await hasPermission(uid(req), 'admin.plugins.manage'));
}

function fail(res, status, message) {
  return res.status(status).json({ success: false, message });
}

router.use(authMiddleware, async (req, res, next) => {
  if (!(await allowed(req))) return fail(res, 403, 'مجوز مدیریت افزونه‌ها را ندارید.');
  next();
});

router.get('/faraz-sms', (_req, res) => {
  try {
    if (!fs.existsSync(PLUGIN_ZIP)) {
      return fail(res, 404, 'فایل ZIP افزونه Faraz SMS در مسیر سرور یافت نشد.');
    }
    const stat = fs.statSync(PLUGIN_ZIP);
    return res.json({
      success: true,
      data: {
        id: PLUGIN_ID,
        name: PLUGIN_NAME,
        version: PLUGIN_VERSION,
        type: 'WordPress',
        fileName: path.basename(PLUGIN_ZIP),
        size: stat.size,
        sizeMb: Number((stat.size / 1024 / 1024).toFixed(2)),
        updatedAt: stat.mtime.toISOString(),
        available: true,
      },
    });
  } catch (error) {
    return fail(res, 500, error.message || 'خواندن اطلاعات فایل افزونه ناموفق بود.');
  }
});

router.get('/faraz-sms/download', (_req, res) => {
  if (!fs.existsSync(PLUGIN_ZIP)) {
    return fail(res, 404, 'فایل ZIP افزونه Faraz SMS در مسیر سرور یافت نشد.');
  }
  return res.download(PLUGIN_ZIP, path.basename(PLUGIN_ZIP), (error) => {
    if (error && !res.headersSent) return fail(res, 500, 'دریافت فایل افزونه ناموفق بود.');
  });
});

module.exports = router;
