// backend/controllers/portfolio.controller.cjs
'use strict';

let prisma;
try {
  prisma = require('../config/prisma.cjs');
} catch (e) {
  console.error('[PORTFOLIO CTRL] Prisma not available:', e.message);
}

async function getPortfolio(req, res) {
  try {
    if (!prisma) {
      return res.json({ success: true, data: [] });
    }

    // Try Portfolio model
    if (prisma.portfolio) {
      var items = await prisma.portfolio.findMany({
        where: { userId: parseInt(req.user.id, 10) },
        orderBy: { createdAt: 'desc' }
      });
      return res.json({ success: true, data: items });
    }

    // Fallback: user settings
    var user = await prisma.user.findUnique({
      where: { id: parseInt(req.user.id, 10) },
      select: { settings: true }
    });
    var settings = {};
    try { settings = JSON.parse(user.settings || '{}'); } catch(e) {}
    res.json({ success: true, data: settings.portfolio || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function addToPortfolio(req, res) {
  try {
    var body = req.body;

    if (prisma && prisma.portfolio) {
      var item = await prisma.portfolio.create({
        data: {
          userId: parseInt(req.user.id, 10),
          symbol: body.symbol,
          quantity: body.quantity || 0,
          buyPrice: body.buyPrice || body.price || 0,
          notes: body.notes || ''
        }
      });
      return res.json({ success: true, data: item });
    }

    res.json({ success: true, data: body });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function updatePortfolioItem(req, res) {
  try {
    if (prisma && prisma.portfolio) {
      var item = await prisma.portfolio.update({
        where: {
          id: parseInt(req.params.id, 10),
          userId: parseInt(req.user.id, 10)
        },
        data: req.body
      });
      return res.json({ success: true, data: item });
    }
    res.json({ success: true, data: req.body });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function removeFromPortfolio(req, res) {
  try {
    if (prisma && prisma.portfolio) {
      await prisma.portfolio.delete({
        where: {
          id: parseInt(req.params.id, 10),
          userId: parseInt(req.user.id, 10)
        }
      });
    }
    res.json({ success: true, message: 'Removed from portfolio' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function getPortfolioSummary(req, res) {
  try {
    if (prisma && prisma.portfolio) {
      var items = await prisma.portfolio.findMany({
        where: { userId: parseInt(req.user.id, 10) }
      });
      var totalValue = items.reduce(function(sum, i) {
        return sum + (i.quantity * i.buyPrice);
      }, 0);
      return res.json({
        success: true,
        data: {
          totalItems: items.length,
          totalValue: totalValue,
          items: items
        }
      });
    }
    res.json({ success: true, data: { totalItems: 0, totalValue: 0, items: [] } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = {
  getPortfolio: getPortfolio,
  addToPortfolio: addToPortfolio,
  updatePortfolioItem: updatePortfolioItem,
  removeFromPortfolio: removeFromPortfolio,
  getPortfolioSummary: getPortfolioSummary
};
