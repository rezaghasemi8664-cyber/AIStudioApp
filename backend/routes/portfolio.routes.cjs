// routes/portfolio.routes.cjs
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware.cjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Note: There's no dedicated Portfolio table in the database.
// We'll store portfolio data in User.marketSummary field as JSON.

// GET /api/portfolio - ?????? ?????????
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { marketSummary: true }
    });

    let portfolio = { items: [], totalValue: 0 };
    if (user && user.marketSummary) {
      try {
        const parsed = JSON.parse(user.marketSummary);
        if (parsed.portfolio) {
          portfolio = parsed.portfolio;
        } else if (Array.isArray(parsed)) {
          portfolio = { items: parsed, totalValue: 0 };
        } else {
          portfolio = parsed;
        }
      } catch (e) {
        // Not valid JSON
      }
    }

    res.json({
      success: true,
      data: portfolio
    });
  } catch (error) {
    console.error('Error fetching portfolio:', error);
    res.status(500).json({
      success: false,
      message: '??? ?? ?????? ?????????',
      error: error.message
    });
  }
});

// POST /api/portfolio - ?????? ???? ?? ?????????
router.post('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { symbol, quantity, buyPrice, name } = req.body;

    if (!symbol || !quantity || !buyPrice) {
      return res.status(400).json({
        success: false,
        message: '??????? symbol, quantity, buyPrice ?????? ?????'
      });
    }

    // Get current portfolio
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { marketSummary: true }
    });

    let portfolio = { items: [] };
    if (user && user.marketSummary) {
      try {
        portfolio = JSON.parse(user.marketSummary);
        if (!portfolio.items) portfolio = { items: Array.isArray(portfolio) ? portfolio : [] };
      } catch (e) {
        portfolio = { items: [] };
      }
    }

    // Add new item
    const newItem = {
      id: Date.now(),
      symbol,
      name: name || symbol,
      quantity: parseFloat(quantity),
      buyPrice: parseFloat(buyPrice),
      addedAt: new Date().toISOString()
    };

    portfolio.items.push(newItem);

    // Save
    await prisma.user.update({
      where: { id: userId },
      data: { marketSummary: JSON.stringify(portfolio) }
    });

    res.status(201).json({
      success: true,
      message: '???? ?? ????????? ????? ??',
      data: newItem
    });
  } catch (error) {
    console.error('Error adding to portfolio:', error);
    res.status(500).json({
      success: false,
      message: '??? ?? ?????? ?? ?????????',
      error: error.message
    });
  }
});

// PUT /api/portfolio/:id - ????????? ???? ?????????
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const itemId = parseInt(req.params.id);
    const { quantity, buyPrice, name } = req.body;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { marketSummary: true }
    });

    let portfolio = { items: [] };
    if (user && user.marketSummary) {
      try {
        portfolio = JSON.parse(user.marketSummary);
        if (!portfolio.items) portfolio = { items: [] };
      } catch (e) {
        portfolio = { items: [] };
      }
    }

    const itemIndex = portfolio.items.findIndex(i => i.id === itemId);
    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        message: '???? ????????? ???? ???'
      });
    }

    if (quantity !== undefined) portfolio.items[itemIndex].quantity = parseFloat(quantity);
    if (buyPrice !== undefined) portfolio.items[itemIndex].buyPrice = parseFloat(buyPrice);
    if (name !== undefined) portfolio.items[itemIndex].name = name;

    await prisma.user.update({
      where: { id: userId },
      data: { marketSummary: JSON.stringify(portfolio) }
    });

    res.json({
      success: true,
      message: '???? ????????? ????????? ??',
      data: portfolio.items[itemIndex]
    });
  } catch (error) {
    console.error('Error updating portfolio item:', error);
    res.status(500).json({
      success: false,
      message: '??? ?? ????????? ???? ?????????',
      error: error.message
    });
  }
});

// DELETE /api/portfolio/:id - ??? ???? ?? ?????????
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const itemId = parseInt(req.params.id);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { marketSummary: true }
    });

    let portfolio = { items: [] };
    if (user && user.marketSummary) {
      try {
        portfolio = JSON.parse(user.marketSummary);
        if (!portfolio.items) portfolio = { items: [] };
      } catch (e) {
        portfolio = { items: [] };
      }
    }

    portfolio.items = portfolio.items.filter(i => i.id !== itemId);

    await prisma.user.update({
      where: { id: userId },
      data: { marketSummary: JSON.stringify(portfolio) }
    });

    res.json({
      success: true,
      message: '???? ?? ????????? ??? ??'
    });
  } catch (error) {
    console.error('Error removing from portfolio:', error);
    res.status(500).json({
      success: false,
      message: '??? ?? ??? ?? ?????????',
      error: error.message
    });
  }
});

// GET /api/portfolio/summary - ????? ?????????
router.get('/summary', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { marketSummary: true }
    });

    let portfolio = { items: [] };
    if (user && user.marketSummary) {
      try {
        portfolio = JSON.parse(user.marketSummary);
        if (!portfolio.items) portfolio = { items: [] };
      } catch (e) {
        portfolio = { items: [] };
      }
    }

    const totalInvested = portfolio.items.reduce((sum, item) => {
      return sum + (item.quantity * item.buyPrice);
    }, 0);

    res.json({
      success: true,
      data: {
        totalItems: portfolio.items.length,
        totalInvested,
        items: portfolio.items
      }
    });
  } catch (error) {
    console.error('Error fetching portfolio summary:', error);
    res.status(500).json({
      success: false,
      message: '??? ?? ?????? ????? ?????????',
      error: error.message
    });
  }
});

module.exports = router;
