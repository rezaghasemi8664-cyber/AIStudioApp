'use strict';

const express = require('express');
const router = express.Router();

const controller = require('../controllers/userPreference.controller.cjs');
const { verifyToken } = require('../middlewares/auth.middleware.cjs');

// همه مسیرها نیازمند احراز هویت هستند
router.use(verifyToken);

// مهم: این route باید قبل از /:key تعریف شود
router.get('/feature-endpoints', controller.getFeatureEndpoints);

// دریافت تمام تنظیمات کاربر
router.get('/', controller.getUserPreferences);

// دریافت یک تنظیم خاص
router.get('/:key', controller.getUserPreference);

// ذخیره گروهی تنظیمات
router.put('/', controller.bulkUpsertUserPreferences);

// ذخیره یا بروزرسانی یک تنظیم خاص
router.put('/:key', controller.upsertUserPreference);

// حذف یک تنظیم خاص
router.delete('/:key', controller.deleteUserPreference);

module.exports = router;
