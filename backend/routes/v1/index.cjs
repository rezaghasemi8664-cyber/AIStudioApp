// backend/routes/v1/index.cjs
const express = require('express');
const router = express.Router();

function tryMount(path, modulePath, label) {
  try {
    const mod = require(modulePath);
    router.use(path, mod);
    console.log(`[ROUTES] mounted ${label} at ${path}`);
  } catch (err) {
    console.warn(`[ROUTES] skipped ${label}: ${err.message}`);
  }
}

tryMount('/auth', '../auth.routes.cjs', 'Auth');
tryMount('/admin', '../admin.routes.cjs', 'Admin');
tryMount('/admin-users', '../adminUsers.routes.cjs', 'Admin Users');
tryMount('/admin-analysis', '../adminAnalysis.routes.cjs', 'Admin Analysis');
tryMount('/admin-market', '../adminMarket.routes.cjs', 'Admin Market');
tryMount('/admin-scalping', '../adminScalping.routes.cjs', 'Admin Scalping');
tryMount('/admin-ai', '../adminAi.routes.cjs', 'Admin AI');
tryMount('/admin-prompts', '../adminPrompts.routes.cjs', 'Admin Prompts');
tryMount('/admin-history', '../adminHistory.routes.cjs', 'Admin History');
tryMount('/admin-plugins', '../adminPlugins.routes.cjs', 'Admin Plugins');
tryMount('/admin-farazsms', '../adminFarazSms.routes.cjs', 'Admin Faraz SMS');
tryMount('/admin-notifications', '../adminNotifications.routes.cjs', 'Admin Notifications');
tryMount('/admin-monitoring', '../adminMonitoring.routes.cjs', 'Admin Monitoring');
tryMount('/admin-reports', '../adminReports.routes.cjs', 'Admin Reports');
tryMount('/admin-security', '../adminSecurity.routes.cjs', 'Admin Security');
tryMount('/admin-settings', '../adminSettings.routes.cjs', 'Admin Settings');
tryMount('/admin-maintenance', '../adminMaintenance.routes.cjs', 'Admin Maintenance');
tryMount('/admin-updates', '../adminUpdates.routes.cjs', 'Admin Updates');
tryMount('/admin-backup', '../adminBackup.routes.cjs', 'Admin Backup');
tryMount('/admin-payments', '../adminPayments.routes.cjs', 'Admin Payments');
tryMount('/admin-roles', '../adminRoles.routes.cjs', 'Admin Roles');
tryMount('/admin-audit', '../adminAudit.routes.cjs', 'Admin Audit');
tryMount('/admin-sessions', '../adminSessions.routes.cjs', 'Admin Sessions');
tryMount('/admin-api', '../adminApi.routes.cjs', 'Admin API');
tryMount('/admin-infrastructure', '../adminInfrastructure.routes.cjs', 'Admin Infrastructure');
tryMount('/farazsms-admin', '../farazsmsAdmin.routes.cjs', 'Faraz SMS Admin');
tryMount('/plugins', '../plugins.routes.cjs', 'Plugins');
tryMount('/roles', '../roles.routes.cjs', 'Roles');
tryMount('/sms-otp', '../sms-otp.routes.cjs', 'SMS OTP');
tryMount('/sms-password', '../sms-password.routes.cjs', 'SMS Password Reset');

// Compatibility route: market history
tryMount('/market-history', '../marketHistory.routes.cjs', 'Market History');

// Root route
router.get('/', (_req, res) => {
  res.json({ success: true, message: 'Roniya Analyzer API v1' });
});

module.exports = router;
