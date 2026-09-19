// backend/controllers/theme.controller.cjs
'use strict';

let prisma;
try {
  prisma = require('../config/prisma.cjs');
} catch (e) {
  console.warn('[THEME CTRL] Prisma not available');
}

async function getTheme(req, res) {
  try {
    if (!prisma) {
      return res.json({ success: true, data: { theme: 'dark' } });
    }
    var user = await prisma.user.findUnique({
      where: { id: parseInt(req.user.id, 10) },
      select: { theme: true }
    });
    res.json({ success: true, data: { theme: (user && user.theme) || 'dark' } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function saveTheme(req, res) {
  try {
    if (!prisma) {
      return res.json({ success: true, data: req.body });
    }
    var theme = req.body.theme || req.body;
    var themeStr = typeof theme === 'string' ? theme : JSON.stringify(theme);
    await prisma.user.update({
      where: { id: parseInt(req.user.id, 10) },
      data: { theme: themeStr }
    });
    res.json({ success: true, data: { theme: themeStr } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = {
  getTheme: getTheme,
  saveTheme: saveTheme
};
