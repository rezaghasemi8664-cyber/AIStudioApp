'use strict';

const express = require('express');
const router = express.Router();
const controller = require('../controllers/subscriptions.controller.cjs');
const paymentController = require('../controllers/zarinpal-payment.controller.cjs');

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

// Payment creation requires the authenticated user.
router.post('/payments/create', authenticate, paymentController.create);

// ZarinPal callback is public because the gateway redirects the browser here.
router.get('/payments/callback', paymentController.callback);

module.exports = router;
