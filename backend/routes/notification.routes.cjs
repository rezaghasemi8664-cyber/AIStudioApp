// routes/notification.routes.cjs - Production v2.1 (Fixed)
// =================================================
// FIXES: BOM removed, no new PrismaClient, Unicode-escaped messages
// Routes: GET /, GET /unread-count, POST /, PUT /:id/read, PUT /read-all, DELETE /:id
// =================================================
'use strict';

const express = require('express');
const router = express.Router();

// --- Load auth middleware ---
let authMiddleware = null;
const authPaths = [
  '../middlewares/auth.middleware.cjs',
  '../middleware/auth.middleware.cjs',
  '../middleware/auth.cjs',
];
for (const p of authPaths) {
  try {
    const m = require(p);
    authMiddleware = m.authenticate || m.verifyToken || m.authMiddleware || m;
    if (typeof authMiddleware === 'function') break;
    authMiddleware = null;
  } catch (_) {}
}
if (!authMiddleware) {
  authMiddleware = function(req, res, next) {
    if (!req.user) {
      // \u0627\u062D\u0631\u0627\u0632 \u0647\u0648\u06CC\u062A \u0627\u0644\u0632\u0627\u0645\u06CC \u0627\u0633\u062A
      return res.status(401).json({ success: false, message: '\u0627\u062D\u0631\u0627\u0632 \u0647\u0648\u06CC\u062A \u0627\u0644\u0632\u0627\u0645\u06CC \u0627\u0633\u062A' });
    }
    next();
  };
}

// --- Load controller ---
let ctrl = {};
try {
  ctrl = require('../controllers/notifications.controller.cjs');
} catch (e) {
  console.warn('[NOTIF_ROUTES] Controller not loaded:', e.message);
}

// --- Load Prisma (shared singleton only, no new PrismaClient) ---
let prisma = null;
try {
  const mod = require('../config/prisma.cjs');
  prisma = mod.prisma || mod;
} catch (_) {
  console.warn('[NOTIF_ROUTES] Prisma not available from config/prisma.cjs');
}

// --- Helper: parse userId ---
function parseUserId(req) {
  const raw = req.user?.id || req.user?.userId;
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return Number(s);
  return s;
}

// --- Unicode messages ---
var MSG = {
  // \u0634\u0646\u0627\u0633\u0647 \u06A9\u0627\u0631\u0628\u0631 \u0646\u0627\u0645\u0639\u062A\u0628\u0631
  INVALID_USER:    '\u0634\u0646\u0627\u0633\u0647 \u06A9\u0627\u0631\u0628\u0631 \u0646\u0627\u0645\u0639\u062A\u0628\u0631',
  // \u062E\u0637\u0627 \u062F\u0631 \u062F\u0631\u06CC\u0627\u0641\u062A \u0627\u0639\u0644\u0627\u0646\u200C\u0647\u0627
  FETCH_ERROR:     '\u062E\u0637\u0627 \u062F\u0631 \u062F\u0631\u06CC\u0627\u0641\u062A \u0627\u0639\u0644\u0627\u0646\u200C\u0647\u0627',
  // \u062E\u0637\u0627 \u062F\u0631 \u062F\u0631\u06CC\u0627\u0641\u062A \u062A\u0639\u062F\u0627\u062F \u0627\u0639\u0644\u0627\u0646\u200C\u0647\u0627
  COUNT_ERROR:     '\u062E\u0637\u0627 \u062F\u0631 \u062F\u0631\u06CC\u0627\u0641\u062A \u062A\u0639\u062F\u0627\u062F \u0627\u0639\u0644\u0627\u0646\u200C\u0647\u0627',
  // \u0639\u0646\u0648\u0627\u0646 \u06CC\u0627 \u067E\u06CC\u0627\u0645 \u0627\u0639\u0644\u0627\u0646 \u0627\u0644\u0632\u0627\u0645\u06CC \u0627\u0633\u062A
  TITLE_REQUIRED:  '\u0639\u0646\u0648\u0627\u0646 \u06CC\u0627 \u067E\u06CC\u0627\u0645 \u0627\u0639\u0644\u0627\u0646 \u0627\u0644\u0632\u0627\u0645\u06CC \u0627\u0633\u062A',
  // \u0633\u0631\u0648\u06CC\u0633 \u0627\u0639\u0644\u0627\u0646\u200C\u0647\u0627 \u062F\u0631 \u062F\u0633\u062A\u0631\u0633 \u0646\u06CC\u0633\u062A
  UNAVAILABLE:     '\u0633\u0631\u0648\u06CC\u0633 \u0627\u0639\u0644\u0627\u0646\u200C\u0647\u0627 \u062F\u0631 \u062F\u0633\u062A\u0631\u0633 \u0646\u06CC\u0633\u062A',
  // \u0627\u0639\u0644\u0627\u0646 \u0627\u06CC\u062C\u0627\u062F \u0634\u062F
  CREATED:         '\u0627\u0639\u0644\u0627\u0646 \u0627\u06CC\u062C\u0627\u062F \u0634\u062F',
  // \u0627\u0639\u0644\u0627\u0646 \u062C\u062F\u06CC\u062F
  NEW_NOTIF:       '\u0627\u0639\u0644\u0627\u0646 \u062C\u062F\u06CC\u062F',
  // \u062E\u0637\u0627 \u062F\u0631 \u0627\u06CC\u062C\u0627\u062F \u0627\u0639\u0644\u0627\u0646
  CREATE_ERROR:    '\u062E\u0637\u0627 \u062F\u0631 \u0627\u06CC\u062C\u0627\u062F \u0627\u0639\u0644\u0627\u0646',
  // \u0634\u0646\u0627\u0633\u0647 \u0646\u0627\u0645\u0639\u062A\u0628\u0631
  INVALID_ID:      '\u0634\u0646\u0627\u0633\u0647 \u0646\u0627\u0645\u0639\u062A\u0628\u0631',
  // \u0627\u0639\u0644\u0627\u0646 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F
  NOT_FOUND:       '\u0627\u0639\u0644\u0627\u0646 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F',
  // \u0627\u0639\u0644\u0627\u0646 \u062E\u0648\u0627\u0646\u062F\u0647 \u0634\u062F
  MARKED_READ:     '\u0627\u0639\u0644\u0627\u0646 \u062E\u0648\u0627\u0646\u062F\u0647 \u0634\u062F',
  // \u062E\u0637\u0627 \u062F\u0631 \u0628\u0647\u200C\u0631\u0648\u0632\u0631\u0633\u0627\u0646\u06CC
  UPDATE_ERROR:    '\u062E\u0637\u0627 \u062F\u0631 \u0628\u0647\u200C\u0631\u0648\u0632\u0631\u0633\u0627\u0646\u06CC',
  // \u0647\u0645\u0647 \u0627\u0639\u0644\u0627\u0646\u200C\u0647\u0627 \u062E\u0648\u0627\u0646\u062F\u0647 \u0634\u062F\u0646\u062F
  ALL_READ:        '\u0647\u0645\u0647 \u0627\u0639\u0644\u0627\u0646\u200C\u0647\u0627 \u062E\u0648\u0627\u0646\u062F\u0647 \u0634\u062F\u0646\u062F',
  // \u0627\u0639\u0644\u0627\u0646 \u062D\u0630\u0641 \u0634\u062F
  DELETED:         '\u0627\u0639\u0644\u0627\u0646 \u062D\u0630\u0641 \u0634\u062F',
  // \u062E\u0637\u0627 \u062F\u0631 \u062D\u0630\u0641 \u0627\u0639\u0644\u0627\u0646
  DELETE_ERROR:    '\u062E\u0637\u0627 \u062F\u0631 \u062D\u0630\u0641 \u0627\u0639\u0644\u0627\u0646',
};

// ============================================================
// GET / - get notifications
// ============================================================
router.get('/', authMiddleware, function(req, res) {
  if (typeof ctrl.getNotifications === 'function') {
    return ctrl.getNotifications(req, res);
  }
  // Fallback inline
  (async () => {
    try {
      const userId = parseUserId(req);
      if (!userId) return res.status(401).json({ success: false, message: MSG.INVALID_USER });

      if (!prisma || !prisma.notification) {
        return res.json({ success: true, data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } });
      }

      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 20;
      const skip = (page - 1) * limit;
      const unreadOnly = req.query.unreadOnly === 'true';

      const where = { userId: userId };
      if (unreadOnly) where.isRead = false;

      const [notifications, total] = await Promise.all([
        prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit }),
        prisma.notification.count({ where }),
      ]);

      res.json({
        success: true,
        data: notifications,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    } catch (error) {
      console.error('[NOTIF_ROUTE] GET / error:', error.message);
      res.status(500).json({ success: false, message: MSG.FETCH_ERROR });
    }
  })();
});

// ============================================================
// GET /unread-count
// ============================================================
router.get('/unread-count', authMiddleware, function(req, res) {
  if (typeof ctrl.getUnreadCount === 'function') {
    return ctrl.getUnreadCount(req, res);
  }
  (async () => {
    try {
      const userId = parseUserId(req);
      if (!userId) return res.status(401).json({ success: false, message: MSG.INVALID_USER });

      if (!prisma || !prisma.notification) {
        return res.json({ success: true, data: { count: 0 } });
      }

      const count = await prisma.notification.count({
        where: { userId: userId, isRead: false },
      });

      res.json({ success: true, data: { count } });
    } catch (error) {
      console.error('[NOTIF_ROUTE] GET /unread-count error:', error.message);
      res.status(500).json({ success: false, message: MSG.COUNT_ERROR });
    }
  })();
});

// ============================================================
// POST / - create notification
// ============================================================
router.post('/', authMiddleware, function(req, res) {
  if (typeof ctrl.createNotification === 'function') {
    return ctrl.createNotification(req, res);
  }
  (async () => {
    try {
      const userId = parseUserId(req);
      if (!userId) return res.status(401).json({ success: false, message: MSG.INVALID_USER });

      const { title, message, type } = req.body || {};
      if (!title && !message) {
        return res.status(400).json({ success: false, message: MSG.TITLE_REQUIRED });
      }

      if (!prisma || !prisma.notification) {
        return res.status(503).json({ success: false, message: MSG.UNAVAILABLE });
      }

      const notification = await prisma.notification.create({
        data: {
          userId: userId,
          title: title || MSG.NEW_NOTIF,
          message: message || '',
          type: type || 'INFO',
          isRead: false,
        },
      });

      res.status(201).json({ success: true, message: MSG.CREATED, data: notification });
    } catch (error) {
      console.error('[NOTIF_ROUTE] POST / error:', error.message);
      res.status(500).json({ success: false, message: MSG.CREATE_ERROR });
    }
  })();
});

// ============================================================
// PUT /:id/read - mark single notification as read
// ============================================================
router.put('/:id/read', authMiddleware, function(req, res) {
  if (typeof ctrl.markAsRead === 'function') {
    return ctrl.markAsRead(req, res);
  }
  (async () => {
    try {
      const userId = parseUserId(req);
      if (!userId) return res.status(401).json({ success: false, message: MSG.INVALID_USER });

      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ success: false, message: MSG.INVALID_ID });

      if (!prisma || !prisma.notification) {
        return res.json({ success: true, message: MSG.MARKED_READ });
      }

      const notif = await prisma.notification.findFirst({
        where: { id: id, userId: userId },
      });

      if (!notif) {
        return res.status(404).json({ success: false, message: MSG.NOT_FOUND });
      }

      const updated = await prisma.notification.update({
        where: { id: id },
        data: { isRead: true },
      });

      res.json({ success: true, message: MSG.MARKED_READ, data: updated });
    } catch (error) {
      console.error('[NOTIF_ROUTE] PUT /:id/read error:', error.message);
      res.status(500).json({ success: false, message: MSG.UPDATE_ERROR });
    }
  })();
});

// ============================================================
// PUT /read-all - mark all as read
// ============================================================
router.put('/read-all', authMiddleware, function(req, res) {
  if (typeof ctrl.markAllAsRead === 'function') {
    return ctrl.markAllAsRead(req, res);
  }
  (async () => {
    try {
      const userId = parseUserId(req);
      if (!userId) return res.status(401).json({ success: false, message: MSG.INVALID_USER });

      if (prisma && prisma.notification) {
        await prisma.notification.updateMany({
          where: { userId: userId, isRead: false },
          data: { isRead: true },
        });
      }

      res.json({ success: true, message: MSG.ALL_READ });
    } catch (error) {
      console.error('[NOTIF_ROUTE] PUT /read-all error:', error.message);
      res.status(500).json({ success: false, message: MSG.UPDATE_ERROR });
    }
  })();
});

// ============================================================
// DELETE /:id - delete notification
// ============================================================
router.delete('/:id', authMiddleware, function(req, res) {
  if (typeof ctrl.deleteNotification === 'function') {
    return ctrl.deleteNotification(req, res);
  }
  (async () => {
    try {
      const userId = parseUserId(req);
      if (!userId) return res.status(401).json({ success: false, message: MSG.INVALID_USER });

      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ success: false, message: MSG.INVALID_ID });

      if (!prisma || !prisma.notification) {
        return res.json({ success: true, message: MSG.DELETED });
      }

      const notif = await prisma.notification.findFirst({
        where: { id: id, userId: userId },
      });

      if (!notif) {
        return res.status(404).json({ success: false, message: MSG.NOT_FOUND });
      }

      await prisma.notification.delete({ where: { id: id } });

      res.json({ success: true, message: MSG.DELETED });
    } catch (error) {
      console.error('[NOTIF_ROUTE] DELETE /:id error:', error.message);
      res.status(500).json({ success: false, message: MSG.DELETE_ERROR });
    }
  })();
});

console.log('[NOTIF_ROUTES] Loaded. Routes: GET /, GET /unread-count, POST /, PUT /:id/read, PUT /read-all, DELETE /:id');

module.exports = router;

