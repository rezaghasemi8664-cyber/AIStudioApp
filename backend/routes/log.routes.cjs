// routes/log.routes.cjs
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const authMiddleware = require('../middlewares/auth.middleware.cjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// GET /api/logs - ?????? ??????
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 50, level, source = 'db' } = req.query;

    if (source === 'file') {
      // Read from file
      const logDir = path.join(__dirname, '..', 'logs');
      const logFile = path.join(logDir, 'access.log');

      if (!fs.existsSync(logFile)) {
        return res.json({
          success: true,
          data: [],
          message: '???? ??? ???? ???'
        });
      }

      const content = fs.readFileSync(logFile, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());
      const total = lines.length;
      const start = (parseInt(page) - 1) * parseInt(limit);
      const pageLines = lines.reverse().slice(start, start + parseInt(limit));

      return res.json({
        success: true,
        data: pageLines.map((line, i) => ({
          id: start + i + 1,
          message: line,
          level: 'info',
          createdAt: new Date()
        })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit))
        }
      });
    }

    // Read from LogEntry table
    // LogEntry: id, level, message, createdAt
    let logs = [];
    let total = 0;

    try {
      const whereLevel = level ? `WHERE level = '${level}'` : '';
      
      const countResult = await prisma.$queryRaw`
        SELECT COUNT(*) as cnt FROM [dbo].[LogEntry]
      `;
      total = Number(countResult[0].cnt);

      const offset = (parseInt(page) - 1) * parseInt(limit);
      
      if (level) {
        logs = await prisma.$queryRaw`
          SELECT id, level, message, createdAt 
          FROM [dbo].[LogEntry]
          WHERE level = ${level}
          ORDER BY id DESC 
          OFFSET ${offset} ROWS 
          FETCH NEXT ${parseInt(limit)} ROWS ONLY
        `;
      } else {
        logs = await prisma.$queryRaw`
          SELECT id, level, message, createdAt 
          FROM [dbo].[LogEntry]
          ORDER BY id DESC 
          OFFSET ${offset} ROWS 
          FETCH NEXT ${parseInt(limit)} ROWS ONLY
        `;
      }
    } catch (dbErr) {
      console.error('LogEntry query error:', dbErr.message);
      logs = [];
    }

    res.json({
      success: true,
      data: logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching logs:', error);
    res.status(500).json({
      success: false,
      message: '??? ?? ?????? ??????',
      error: error.message
    });
  }
});

// DELETE /api/logs - ???????? ??????
router.delete('/', authMiddleware, async (req, res) => {
  try {
    const { source = 'all' } = req.query;

    if (source === 'file' || source === 'all') {
      const logFile = path.join(__dirname, '..', 'logs', 'access.log');
      if (fs.existsSync(logFile)) {
        fs.writeFileSync(logFile, '', 'utf-8');
      }
    }

    if (source === 'db' || source === 'all') {
      try {
        await prisma.$queryRaw`DELETE FROM [dbo].[LogEntry]`;
      } catch (e) {
        console.warn('Could not clear LogEntry table:', e.message);
      }
    }

    res.json({
      success: true,
      message: '?????? ??? ????'
    });
  } catch (error) {
    console.error('Error clearing logs:', error);
    res.status(500).json({
      success: false,
      message: '??? ?? ???????? ??????',
      error: error.message
    });
  }
});

module.exports = router;
