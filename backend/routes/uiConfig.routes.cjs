'use strict';

const express = require('express');
const router = express.Router();

const authMiddleware = require('../middlewares/auth.middleware.cjs');
const uiConfigController = require('../controllers/uiConfig.controller.cjs');
const fontConfigController = require('../controllers/fontConfig.controller.cjs');

// UI Config
router.get('/', authMiddleware, uiConfigController.getConfig);
router.post('/', authMiddleware, uiConfigController.saveConfig);
router.put('/', authMiddleware, uiConfigController.saveConfig);

// TSE Links
router.get('/tse-links', authMiddleware, uiConfigController.getTseLinks);
router.post('/tse-links', authMiddleware, uiConfigController.saveTseLinks);
router.put('/tse-links', authMiddleware, uiConfigController.saveTseLinks);

// Features
router.get('/features', authMiddleware, uiConfigController.getFeatures);
router.post('/features', authMiddleware, uiConfigController.saveFeatures);
router.put('/features', authMiddleware, uiConfigController.saveFeatures);

// Fonts
router.get('/fonts', authMiddleware, fontConfigController.getFonts);
router.get('/fonts/active', authMiddleware, fontConfigController.getActiveFonts);
router.post('/fonts', authMiddleware, fontConfigController.addFont);
router.put('/fonts/selected', authMiddleware, fontConfigController.setSelectedFont);

module.exports = router;
