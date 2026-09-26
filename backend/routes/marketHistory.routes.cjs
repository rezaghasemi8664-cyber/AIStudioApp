'use strict';

const express = require('express');
const router = express.Router();

const authMiddleware = require('../middlewares/auth.middleware.cjs');
const marketHistoryController = require('../controllers/marketHistory.controller.cjs');

// Legacy compatibility endpoint.
// Market refreshes are NOT performed here; user-facing live market data comes
// from the central Shared Market DB through market routes.
router.get('/', authMiddleware, marketHistoryController.getHistory);
router.post('/', authMiddleware, marketHistoryController.create);
router.get('/latest', marketHistoryController.getLatest);

module.exports = router;
