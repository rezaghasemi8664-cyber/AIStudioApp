// routes/theme.routes.cjs
const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const authMiddleware = require('../middlewares/auth.middleware.cjs');

// GET /api/theme - ?????? ??????? ??
router.get('/', authMiddleware, async (req, res) => {
  try {
    // ThemeConfig model may not be in Prisma Client, use raw query
    let theme = null;
    
    // First try Prisma model
    if (prisma.themeConfig) {
      theme = await prisma.themeConfig.findFirst({
        orderBy: { id: 'desc' }
      });
    } else {
      // Fallback to raw query
      const results = await prisma.$queryRaw`
        SELECT TOP 1 id, name, dataJson, createdAt 
        FROM [dbo].[ThemeConfig] 
        ORDER BY id DESC
      `;
      theme = results.length > 0 ? results[0] : null;
    }

    if (!theme) {
      // Return default theme
      return res.json({
        success: true,
        data: {
          id: null,
          name: 'default',
          dataJson: JSON.stringify({
            primaryColor: '#1976d2',
            secondaryColor: '#dc004e',
            mode: 'light',
            fontSize: 14,
            fontFamily: 'Vazirmatn, sans-serif',
            borderRadius: 8
          }),
          createdAt: new Date()
        }
      });
    }

    // Parse dataJson if it's a string
    let themeData = theme;
    if (theme.dataJson && typeof theme.dataJson === 'string') {
      try {
        themeData = {
          ...theme,
          dataJson: JSON.parse(theme.dataJson)
        };
      } catch (e) {
        // dataJson is not valid JSON, return as-is
      }
    }

    res.json({
      success: true,
      data: themeData
    });
  } catch (error) {
    console.error('Error fetching theme:', error);
    res.status(500).json({
      success: false,
      message: '??? ?? ?????? ??????? ??',
      error: error.message
    });
  }
});

// PUT /api/theme - ????? ??????? ??
router.put('/', authMiddleware, async (req, res) => {
  try {
    const { name, dataJson } = req.body;
    const jsonStr = typeof dataJson === 'string' ? dataJson : JSON.stringify(dataJson || {});
    const themeName = name || 'default';

    let saved = null;

    if (prisma.themeConfig) {
      // Check if a theme already exists
      const existing = await prisma.themeConfig.findFirst({
        orderBy: { id: 'desc' }
      });

      if (existing) {
        saved = await prisma.themeConfig.update({
          where: { id: existing.id },
          data: {
            name: themeName,
            dataJson: jsonStr
          }
        });
      } else {
        saved = await prisma.themeConfig.create({
          data: {
            name: themeName,
            dataJson: jsonStr
          }
        });
      }
    } else {
      // Fallback to raw query
      const existing = await prisma.$queryRaw`
        SELECT TOP 1 id FROM [dbo].[ThemeConfig] ORDER BY id DESC
      `;

      if (existing.length > 0) {
        await prisma.$queryRaw`
          UPDATE [dbo].[ThemeConfig] 
          SET name = ${themeName}, dataJson = ${jsonStr}
          WHERE id = ${existing[0].id}
        `;
        saved = { id: existing[0].id, name: themeName, dataJson: jsonStr };
      } else {
        await prisma.$queryRaw`
          INSERT INTO [dbo].[ThemeConfig] (name, dataJson, createdAt) 
          VALUES (${themeName}, ${jsonStr}, SYSDATETIME())
        `;
        const newRecord = await prisma.$queryRaw`
          SELECT TOP 1 * FROM [dbo].[ThemeConfig] ORDER BY id DESC
        `;
        saved = newRecord[0];
      }
    }

    // Parse dataJson for response
    if (saved && saved.dataJson && typeof saved.dataJson === 'string') {
      try {
        saved = { ...saved, dataJson: JSON.parse(saved.dataJson) };
      } catch (e) { /* ignore */ }
    }

  res.json({
      success: true,
      message: '?? ?? ?????? ????? ??',
      data: saved
    });
  } catch (error) {
    console.error('Error saving theme:', error);
    res.status(500).json({
      success: false,
      message: '??? ?? ????? ??????? ??',
      error: error.message
    });
  }
});

module.exports = router;
