const express = require('express');
const router = express.Router();

const { claimAnalysisHandler } = require('../controllers/analysisClaim.controller.cjs');
const authenticate = require('../middlewares/authenticate.middleware.cjs');

router.post('/claim', authenticate, claimAnalysisHandler);

module.exports = router;
