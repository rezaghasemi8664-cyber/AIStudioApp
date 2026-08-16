// backend/routes/health.routes.cjs
'use strict';

const express = require('express');
const router = express.Router();

router.get('/', function(req, res) {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    version: '4.0.0'
  });
});

module.exports = router;
