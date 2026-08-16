// backend/routes/ai.routes.cjs - v4.1 Complete
'use strict';

const express = require('express');
const router = express.Router();
const axios = require('axios');

// --- Auth Middleware ---
let authenticate;
try {
  const authMw = require('../middlewares/auth.middleware.cjs');
  authenticate = authMw.authenticate || authMw;
} catch (_e) {
  try {
    const authMw = require('../middlewares/authenticate.middleware.cjs');
    authenticate = authMw.authenticate || authMw;
  } catch (_e2) {
    authenticate = function (req, res, next) {
      if (!req.headers.authorization) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }
      next();
    };
  }
}

// --- AI Config ---
const aiBaseUrl = process.env.AI_API_URL || process.env.GAPGPT_URL || 'http://localhost:8000';
const aiApiKey = process.env.AI_API_KEY || process.env.GAPGPT_API_KEY || '';
const aiTimeout = parseInt(process.env.AI_TIMEOUT) || 30000;

// Helper: check AI service
async function checkAIHealth() {
  try {
    const response = await axios.get(`${aiBaseUrl}/health`, { timeout: 5000 });
    return { available: true, status: response.status, data: response.data };
  } catch (error) {
    return { available: false, error: error.message };
  }
}

// Helper: Call AI service
async function callAI(endpoint, data, method) {
  method = method || 'POST';
  try {
    const url = `${aiBaseUrl}${endpoint}`;
    const headers = { 'Content-Type': 'application/json' };
    if (aiApiKey) headers['Authorization'] = `Bearer ${aiApiKey}`;

    const config = { method, url, headers, timeout: aiTimeout };
    if (method === 'GET') {
      config.params = data;
    } else {
      config.data = data;
    }

    const response = await axios(config);
    return { success: true, data: response.data };
  } catch (error) {
    return { 
      success: false, 
      error: error.message,
      status: error.response ? error.response.status : null
    };
  }
}

// --- GET /api/ai/status - AI service status ---
router.get('/status', authenticate, async function (req, res) {
  try {
    const health = await checkAIHealth();
    
    return res.json({
      success: true,
      data: {
        service: 'GapGPT AI',
        baseUrl: aiBaseUrl,
        available: health.available,
        status: health.available ? 'connected' : 'disconnected',
        details: health.available ? health.data : null,
        error: health.available ? null : health.error,
        hasApiKey: !!aiApiKey,
        timeout: aiTimeout,
        models: health.available && health.data && health.data.models ? health.data.models : [],
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('[AI] GET /status error:', error.message);
    return res.status(500).json({
      success: false,
      message: '??? ?? ????? ????? ????? AI',
      error: error.message
    });
  }
});

// --- POST /api/ai/analyze - Run AI analysis ---
router.post('/analyze', authenticate, async function (req, res) {
  try {
    const { symbol, prompt, model, options } = req.body;

    if (!symbol && !prompt) {
      return res.status(400).json({
        success: false,
        message: 'symbol ?? prompt ?????? ???'
      });
    }

    const result = await callAI('/api/analyze', {
      symbol: symbol,
      prompt: prompt,
      model: model || 'default',
      options: options || {},
      userId: req.user.id
    });

    if (result.success) {
      return res.json({
        success: true,
        data: result.data.data || result.data,
        source: 'ai'
      });
    }

    return res.json({
      success: false,
      message: '????? AI ?? ????? ????',
      error: result.error,
      source: 'fallback'
    });
  } catch (error) {
    console.error('[AI] POST /analyze error:', error.message);
    return res.status(500).json({ success: false, message: '??? ?? ????? AI' });
  }
});

// --- POST /api/ai/chat - Chat with AI ---
router.post('/chat', authenticate, async function (req, res) {
  try {
    const { message, conversationId, model } = req.body;

    if (!message) {
      return res.status(400).json({ success: false, message: '???? ?????? ???' });
    }

    const result = await callAI('/api/chat', {
      message: message,
      conversationId: conversationId,
      model: model || 'default',
      userId: req.user.id
    });

    if (result.success) {
      return res.json({
        success: true,
        data: result.data.data || result.data,
        source: 'ai'
      });
    }

    return res.json({
      success: false,
      message: '????? ?? AI ?? ????? ????',
      error: result.error
    });
  } catch (error) {
    console.error('[AI] POST /chat error:', error.message);
    return res.status(500).json({ success: false, message: '??? ?? ?? AI' });
  }
});

// --- GET /api/ai/models - Available AI models ---
router.get('/models', authenticate, async function (req, res) {
  try {
    const result = await callAI('/api/models', {}, 'GET');
    
    if (result.success) {
      return res.json({ success: true, data: result.data.data || result.data });
    }

    return res.json({
      success: true,
      data: [
        { id: 'default', name: '??? ???????', available: false }
      ],
      message: '????? AI ?? ????? ????',
      source: 'fallback'
    });
  } catch (error) {
    console.error('[AI] GET /models error:', error.message);
    return res.status(500).json({ success: false, message: '???' });
  }
});

module.exports = router;
