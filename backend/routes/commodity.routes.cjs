'use strict';

const express = require('express');
const router = express.Router();
const commoditySnapshotService = require('../services/commoditySnapshot.service.cjs');

// Serve only the process-local shared cache. No per-user SQL/API request.
router.get('/', function getCommoditySnapshot(_req, res) {
  const snapshot = commoditySnapshotService.getCachedSnapshot();
  if (!snapshot) {
    return res.status(503).json({
      success: false,
      code: 'COMMODITY_SNAPSHOT_NOT_READY',
      message: 'اسنپ‌شات کامودیتی هنوز آماده نیست.'
    });
  }
  return res.json({ success: true, data: snapshot, source: 'central-cache' });
});

module.exports = router;
