// routes/watchlist.routes.cjs
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware.cjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Note: There's no dedicated Watchlist table in the database.
// We'll store watchlist data in User.marketIndex field as JSON,
// or use AppConfig with user-specific keys.

// GET /api/watchlist - ?????? ????????
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;

    // Try to get from User.marketIndex field
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { marketIndex: true }
    });

    let watchlist = [];
    if (user && user.marketIndex) {
      try {
        const parsed = JSON.parse(user.marketIndex);
        if (Array.isArray(parsed)) {
          watchlist = parsed;
        } else if (parsed.watchlist) {
          watchlist = parsed.watchlist;
        }
      } catch (e) {
        // Not valid JSON
      }
    }

    res.json({
      success: true,
      data: watchlist
    });
  } catch (error) {
    console.error('Error fetching watchlist:', error);
    res.status(500).json({
      success: false,
      message: '??? ?? ?????? ????????',
      error: error.message
    });
  }
});

// POST /api/watchlist - ?????? ?? ????????
router.post('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { symbol, name } = req.body;

    if (!symbol) {
      return res.status(400).json({
        success: false,
        message: '???? (symbol) ?????? ???'
      });
    }

    // Get current watchlist
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { marketIndex: true }
    });

    let watchlist = [];
    if (user && user.marketIndex) {
      try {
        const parsed = JSON.parse(user.marketIndex);
        watchlist = Array.isArray(parsed) ? parsed : (parsed.watchlist || []);
      } catch (e) {
        watchlist = [];
      }
    }

    // Check if already exists
    const exists = watchlist.find(w => 
      (typeof w === 'string' ? w : w.symbol) === symbol
    );

    if (exists) {
      return res.status(400).json({
        success: false,
        message: '??? ???? ????? ?? ???????? ???? ????'
      });
    }

    // Add to watchlist
    watchlist.push({
      symbol,
      name: name || symbol,
      addedAt: new Date().toISOString()
    });

    // Save
    await prisma.user.update({
      where: { id: userId },
      data: { marketIndex: JSON.stringify(watchlist) }
    });

    res.status(201).json({
      success: true,
      message: '???? ?? ???????? ????? ??',
      data: watchlist
    });
  } catch (error) {
    console.error('Error adding to watchlist:', error);
    res.status(500).json({
      success: false,
      message: '??? ?? ?????? ?? ????????',
      error: error.message
    });
  }
});

// DELETE /api/watchlist/:symbol - ??? ?? ????????
router.delete('/:symbol', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { symbol } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { marketIndex: true }
    });

    let watchlist = [];
    if (user && user.marketIndex) {
      try {
        const parsed = JSON.parse(user.marketIndex);
        watchlist = Array.isArray(parsed) ? parsed : (parsed.watchlist || []);
      } catch (e) {
        watchlist = [];
      }
    }

    // Remove symbol
    watchlist = watchlist.filter(w => {
      const sym = typeof w === 'string' ? w : w.symbol;
      return sym !== symbol;
    });

    // Save
    await prisma.user.update({
      where: { id: userId },
      data: { marketIndex: JSON.stringify(watchlist) }
    });

    res.json({
      success: true,
      message: '???? ?? ???????? ??? ??',
      data: watchlist
    });
  } catch (error) {
    console.error('Error removing from watchlist:', error);
    res.status(500).json({
      success: false,
      message: '??? ?? ??? ?? ????????',
      error: error.message
    });
  }
});

module.exports = router;
