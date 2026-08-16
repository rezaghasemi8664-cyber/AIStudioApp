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

router.get('/usage', authenticate, getHistoryStats);
router.get('/', authenticate, getAnalysisHistory);
router.get('/:id', authenticate, getAnalysisById);
router.post('/', authenticate, createAnalysisHistory);
router.delete('/clear', authenticate, clearHistory);
router.delete('/:id', authenticate, deleteAnalysis);

module.exports = router;
