// backend/routes/v2/index.cjs
'use strict';

var express = require('express');
var router = express.Router();

router.get('/health', function (_req, res) {
  res.status(200).json({
    success: true,
    version: 'v2',
    status: 'reserved',
    message: 'API v2 is not implemented yet',
    timestamp: new Date().toISOString()
  });
});

router.get('/', function (_req, res) {
  res.status(200).json({
    success: true,
    version: 'v2',
    status: 'reserved',
    message: 'API v2 root is available but not implemented yet',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
