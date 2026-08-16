// backend/routes/v1/index.cjs
'use strict';

var express = require('express');
var router = express.Router();

var loadedCount = 0;
var failedCount = 0;

function normalizeRouterExport(mod) {
  // حالت صحیح: module.exports = router/function
  if (typeof mod === 'function') return mod;

  // حالت اشتباه رایج: module.exports = { router }
  if (mod && typeof mod.router === 'function') return mod.router;

  // حالت ESM transpile: default
  if (mod && typeof mod.default === 'function') return mod.default;
  if (mod && mod.default && typeof mod.default.router === 'function') return mod.default.router;

  return null;
}

function tryMount(path, moduleFile, label) {
  try {
    var mod = require(moduleFile);
    var mountable = normalizeRouterExport(mod);

    if (!mountable) {
      throw new Error('Route module export is not mountable (expected router/function)');
    }

    router.use(path, mountable);
    loadedCount++;
    console.log('[v1/index] Mounted: ' + label + ' -> ' + path);
    return true;
  } catch (err) {
    failedCount++;
    console.warn('[v1/index] FAILED to mount ' + label + ' (' + path + '): ' + err.message);
    return false;
  }
}

tryMount('/auth', '../auth.routes.cjs', 'Auth');
tryMount('/analyze', '../analyze.routes.cjs', 'Analyze');
tryMount('/analysis', '../analysis.routes.cjs', 'Analysis');
tryMount('/analysis-history', '../analysisHistory.routes.cjs', 'Analysis History');
tryMount('/portfolio', '../portfolio.routes.cjs', 'Portfolio');
tryMount('/market-history', '../marketHistory.routes.cjs', 'Market History');
tryMount('/market-summary', '../marketSummary.routes.cjs', 'Market Summary');
tryMount('/conversations', '../conversation.routes.cjs', 'Conversations');
tryMount('/messages', '../message.routes.cjs', 'Messages');
tryMount('/notifications', '../notification.routes.cjs', 'Notifications');
tryMount('/scalping', '../scalping.routes.cjs', 'Scalping');
tryMount('/theme', '../theme.routes.cjs', 'Theme');
tryMount('/ui-config', '../uiConfig.routes.cjs', 'UI Config');
tryMount('/app-config', '../appConfig.routes.cjs', 'App Config');
tryMount('/settings', '../settings.routes.cjs', 'Settings');
tryMount('/global-settings', '../globalSettings.routes.cjs', 'Global Settings');
tryMount('/api-keys', '../apiKey.routes.cjs', 'API Keys');
tryMount('/admin', '../admin.routes.cjs', 'Admin');
tryMount('/user-preference', '../userPreference.routes.cjs', 'User Preference');
tryMount('/market', '../market.routes.cjs', 'Market'); // only once

router.get('/', function (_req, res) {
  res.json({
    ok: true,
    version: 'v1',
    routes: {
      loaded: loadedCount,
      failed: failedCount,
      total: loadedCount + failedCount
    },
    timestamp: new Date().toISOString()
  });
});

console.log('[v1/index] Route aggregator ready: ' + loadedCount + ' loaded, ' + failedCount + ' failed');

module.exports = router;
