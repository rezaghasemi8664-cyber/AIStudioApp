'use strict';

const express = require('express');
const { prisma } = require('../config/prisma.cjs');
const router = express.Router();

const DEFAULT_POLICY = {
  enabled: false,
  allowAdmins: true,
  message: 'سامانه موقتاً در حال بروزرسانی و نگهداری است. لطفاً بعداً مراجعه کنید.',
};

router.get('/status', async (_req, res) => {
  try {
    const row = await prisma.globalSetting.findUnique({ where: { key: 'maintenance.policy' } });
    let policy = DEFAULT_POLICY;
    if (row && row.category === 'maintenance') {
      try {
        const parsed = JSON.parse(row.value);
        if (parsed && typeof parsed === 'object') policy = { ...DEFAULT_POLICY, ...parsed };
      } catch (_) {}
    }
    return res.set('Cache-Control', 'no-store').json({
      success: true,
      data: {
        enabled: policy.enabled === true,
        allowAdmins: policy.allowAdmins !== false,
        message: String(policy.message || DEFAULT_POLICY.message).slice(0, 500),
      },
    });
  } catch (error) {
    console.error('[MAINTENANCE] status read failed:', error.message);
    return res.status(503).json({ success: false, message: 'وضعیت تعمیرات فعلاً قابل دریافت نیست.' });
  }
});

module.exports = router;
