'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const v1 = express.Router();

function safeLoad(file, label) {
  const fullPath = path.join(__dirname, file);

  if (!fs.existsSync(fullPath)) {
    console.warn(`[ROUTE] SKIP ${label}: file not found -> ${file}`);
    return null;
  }

  try {
    const mod = require(fullPath);
    return mod && mod.default ? mod.default : mod;
  } catch (err) {
    console.error(`[ROUTE] FAIL ${label}: ${err.message}`);
    return null;
  }
}

function mount(prefix, file, label) {
  const routeModule = safeLoad(file, label);

  if (!routeModule) return;
  v1.use(prefix, routeModule);
  console.log(`[ROUTE] OK ${label}: mounted at ${prefix}`);
}

mount('/auth', './auth.routes.cjs', 'Auth');
mount('/profile', './profile.routes.cjs', 'Profile');
mount('/users', './user.routes.cjs', 'Users');
mount('/user-preference', './userPreference.routes.cjs', 'User Preference');
mount('/analysis', './analysis.routes.cjs', 'Analysis');
mount('/analyze', './analyze.routes.cjs', 'Analyze');
mount('/analysis-history', './analysisHistory.routes.cjs', 'Analysis History');
mount('/analysis-claim', './analysisClaim.routes.cjs', 'Analysis Claim');
mount('/market', './market.routes.cjs', 'Market');
mount('/market-history', './marketHistory.routes.cjs', 'Market History');
mount('/market-summary', './marketSummary.routes.cjs', 'Market Summary');
mount('/scalping', './scalping.routes.cjs', 'Scalping');
mount('/brs', './brs.routes.cjs', 'BRS');
mount('/messages', './message.routes.cjs', 'Messages');
mount('/conversation', './conversation.routes.cjs', 'Conversation');
mount('/notifications', './notification.routes.cjs', 'Notifications');
mount('/portfolio', './portfolio.routes.cjs', 'Portfolio');
mount('/settings', './settings.routes.cjs', 'Settings');
mount('/ui-config', './uiConfig.routes.cjs', 'UI Config');
mount('/theme', './theme.routes.cjs', 'Theme');
mount('/app-config', './appConfig.routes.cjs', 'App Config');
mount('/global-settings', './globalSettings.routes.cjs', 'Global Settings');
mount('/health', './health.routes.cjs', 'Health');
mount('/admin', './admin.routes.cjs', 'Admin');
mount('/admin-control', './adminControl.routes.cjs', 'Admin Control');
mount('/api-keys', './apiKey.routes.cjs', 'API Keys');
mount('/roles', './roles.routes.cjs', 'Roles');
mount('/watchlist', './watchlist.routes.cjs', 'Watchlist');
mount('/endpoints', './endpoints.routes.cjs', 'Endpoints');

router.use('/v1', v1);
router.use('/', v1);

router.use((req, res) => {
  res.status(404).json({ success:false, message:`مسیر یافت نشد: ${req.originalUrl}` });
});

module.exports = router;
