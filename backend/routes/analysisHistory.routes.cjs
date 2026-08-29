'use strict';

const express = require('express');
const router = express.Router();

const authModule = require('../middlewares/auth.middleware.cjs');
const controller = require('../controllers/analysisHistory.controller.cjs');

const authenticate =
  authModule.authenticate ||
  authModule.authMiddleware ||
  authModule.verifyToken;

if (typeof authenticate !== 'function') {
  throw new Error('analysisHistory.routes: authenticate middleware not found');
}

const {
  createAnalysisHistory,
  getAnalysisHistory,
  getAnalysisById,
  deleteAnalysis,
  clearHistory,
  getHistoryStats,
} = controller;

if (
  typeof createAnalysisHistory !== 'function' ||
  typeof getAnalysisHistory !== 'function' ||
  typeof getAnalysisById !== 'function' ||
  typeof deleteAnalysis !== 'function' ||
  typeof clearHistory !== 'function' ||
  typeof getHistoryStats !== 'function'
) {
  throw new Error('analysisHistory.routes: one or more controller handlers are missing');
}

/**
 * نکته مهم: مسیرهای ثابت باید قبل از مسیرهای داینامیک تعریف شوند.
 * تا /clear یا /usage اشتباهاً به عنوان :id تفسیر نشوند.
 */
router.get('/usage', authenticate, getHistoryStats);
router.delete('/clear', authenticate, clearHistory);

router.get('/', authenticate, getAnalysisHistory);
router.post('/', authenticate, createAnalysisHistory);

router.get('/:id', authenticate, getAnalysisById);
router.delete('/:id', authenticate, deleteAnalysis);

module.exports = router;
