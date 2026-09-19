'use strict';

const express = require('express');
const router = express.Router();
const service = require('../services/roniaAssistant.service.cjs');

router.post('/query', async (req, res) => {
  try {
    const result = await service.answer(req.body || {});
    res.json({ success: true, deterministic: true, engine: { name: 'ronia-assistant-rules', version: '1.0.0', deterministic: true }, data: result });
  } catch (error) {
    console.error('[RONIA-ASSISTANT] Query error:', error.message);
    res.status(Number(error.statusCode) >= 400 ? Number(error.statusCode) : 500).json({
      success: false, deterministic: true, message: error.message || 'خطا در دستیار رونیا', code: error.code || 'ASSISTANT_QUERY_ERROR'
    });
  }
});

module.exports = router;
