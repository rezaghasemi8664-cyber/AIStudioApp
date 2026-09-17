'use strict';

const express = require('express');
const router = express.Router();
const controller = require('../controllers/subscriptions.controller.cjs');

let auth;
try {
  auth = require('../middleware/auth.middleware.cjs');
} catch (_) {
  try { auth = require('../middlewares/auth.middleware.cjs'); } catch (error) { auth = null; }
}

const authenticate = auth?.authenticate || auth?.authMiddleware || auth?.requireAuth || auth?.verifyToken || auth;

if (typeof authenticate !== 'function') {
  throw new Error('Subscription routes require the existing authentication middleware.');
}

router.get('/me', authenticate, controller.me);
router.get('/plans', authenticate, controller.plans);

module.exports = router;
