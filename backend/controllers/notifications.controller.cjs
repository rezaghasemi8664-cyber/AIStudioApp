// backend/controllers/notifications.controller.cjs
// ═══════════════════════════════════════════════════════════════
// Notifications Controller - Complete CRUD
// ═══════════════════════════════════════════════════════════════
'use strict';

var prisma;
try {
  prisma = require('../config/prisma.cjs');
} catch (e) {
  console.warn('[NOTIFICATIONS CTRL] Prisma not available');
}

// Helper
function getUserId(req) {
  if (!req.user) return null;
  return parseInt(req.user.id || req.user.userId, 10) || null;
}

// ═══════════════════════════════════════════════════════════════
// GET /api/notifications
// ═══════════════════════════════════════════════════════════════
async function getNotifications(req, res) {
  try {
    if (!prisma || !prisma.notification) {
      return res.json({ success: true, data: [] });
    }
    var userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: '\u062F\u0633\u062A\u0631\u0633\u06CC \u063A\u06CC\u0631\u0645\u062C\u0627\u0632' });
    }
    var items = await prisma.notification.findMany({
      where: { userId: userId },
      orderBy: { createdAt: 'desc' },
      take: parseInt(req.query.limit, 10) || 50,
    });
    res.json({ success: true, data: items });
  } catch (err) {
    console.error('[NOTIFICATIONS] Get error:', err);
    res.status(500).json({ success: false, message: '\u062E\u0637\u0627\u06CC \u0633\u0631\u0648\u0631' });
  }
}

// ═══════════════════════════════════════════════════════════════
// GET /api/notifications/unread-count
// ═══════════════════════════════════════════════════════════════
async function getUnreadCount(req, res) {
  try {
    if (!prisma || !prisma.notification) {
      return res.json({ success: true, data: { count: 0 } });
    }
    var userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: '\u062F\u0633\u062A\u0631\u0633\u06CC \u063A\u06CC\u0631\u0645\u062C\u0627\u0632' });
    }
    var count = await prisma.notification.count({
      where: { userId: userId, isRead: false },
    });
    res.json({ success: true, data: { count: count } });
  } catch (err) {
    console.error('[NOTIFICATIONS] Unread count error:', err);
    res.status(500).json({ success: false, message: '\u062E\u0637\u0627\u06CC \u0633\u0631\u0648\u0631' });
  }
}

// ═══════════════════════════════════════════════════════════════
// POST /api/notifications - Create notification (admin/system)
// ═══════════════════════════════════════════════════════════════
async function createNotification(req, res) {
  try {
    if (!prisma || !prisma.notification) {
      return res.status(503).json({
        success: false,
        message: '\u0633\u0631\u0648\u06cc\u0633 \u0627\u0639\u0644\u0627\u0646\u200c\u0647\u0627 \u062f\u0631 \u062f\u0633\u062a\u0631\u0633 \u0646\u06cc\u0633\u062a',
      });
    }

    var body = req.body || {};
    var title = String(body.title || '\u0627\u0637\u0644\u0627\u0639\u06cc\u0647 \u0633\u0627\u0645\u0627\u0646\u0647').trim();
    var message = String(body.message || '').trim();
    var type = String(body.type || 'info').trim().slice(0, 50) || 'info';

    if (!message) {
      return res.status(400).json({
        success: false,
        message: '\u0645\u062a\u0646 \u067e\u06cc\u0627\u0645 \u0627\u0644\u0632\u0627\u0645\u06cc \u0627\u0633\u062a',
      });
    }

    var rawIds = Array.isArray(body.userIds)
      ? body.userIds
      : (body.userId != null ? [body.userId] : []);

    var isAdmin = Boolean(req.user?.isAdmin)
      || ['admin', 'superadmin'].includes(String(req.user?.role || '').toLowerCase());

    if (!isAdmin && Array.isArray(body.userIds)) {
      return res.status(403).json({
        success: false,
        message: '\u0627\u0631\u0633\u0627\u0644 \u0627\u0639\u0644\u0627\u0646 \u0628\u0647 \u06a9\u0627\u0631\u0628\u0631\u0627\u0646 \u062f\u06cc\u06af\u0631 \u0645\u062c\u0627\u0632 \u0646\u06cc\u0633\u062a',
      });
    }

    var targetUsers;
    if (rawIds.length > 0) {
      var ids = [...new Set(rawIds.map(function(value) {
        var id = Number(value);
        return Number.isInteger(id) && id > 0 ? id : null;
      }).filter(Boolean))];

      if (!ids.length) {
        return res.status(400).json({
          success: false,
          message: '\u0634\u0646\u0627\u0633\u0647 \u06a9\u0627\u0631\u0628\u0631 \u0646\u0627\u0645\u0639\u062a\u0628\u0631 \u0627\u0633\u062a',
        });
      }

      targetUsers = await prisma.user.findMany({
        where: { id: { in: ids }, isDeleted: false, isActive: true },
        select: { id: true },
      });
    } else {
      if (!isAdmin) {
        return res.status(403).json({
          success: false,
          message: '\u0641\u0642\u0637 \u0627\u062f\u0645\u06cc\u0646 \u0645\u06cc\u062a\u0648\u0627\u0646\u062f \u0627\u0639\u0644\u0627\u0646 \u0631\u0627 \u0628\u0631\u0627\u06cc \u06a9\u0627\u0631\u0628\u0631\u0627\u0646 \u0627\u0631\u0633\u0627\u0644 \u06a9\u0646\u0646\u062f',
        });
      }
      targetUsers = await prisma.user.findMany({
        where: { isDeleted: false, isActive: true },
        select: { id: true },
      });
    }

    if (!targetUsers.length) {
      return res.status(404).json({
        success: false,
        message: '\u06a9\u0627\u0631\u0628\u0631 \u0641\u0639\u0627\u0644\u06cc \u0628\u0631\u0627\u06cc \u062f\u0631\u06cc\u0627\u0641\u062a \u0627\u0639\u0644\u0627\u0646 \u06cc\u0627\u0641\u062a \u0646\u0634\u062f',
      });
    }

    var rows = targetUsers.map(function(user) {
      return {
        userId: user.id,
        title: title,
        message: message,
        type: type,
        isRead: false,
      };
    });

    await prisma.notification.createMany({ data: rows });

    return res.status(201).json({
      success: true,
      message: '\u0627\u0639\u0644\u0627\u0646 \u0628\u0627 \u0645\u0648\u0641\u0642\u06cc\u062a \u0627\u0631\u0633\u0627\u0644 \u0634\u062f',
      data: rows[0],
      recipients: rows.length,
    });
  } catch (err) {
    console.error('[NOTIFICATIONS] Create error:', err);
    res.status(500).json({ success: false, message: '\u062e\u0637\u0627\u06cc \u0633\u0631\u0648\u0631', error: err.message });
  }
}
// ═══════════════════════════════════════════════════════════════
// PATCH /api/notifications/:id/read
// ═══════════════════════════════════════════════════════════════
async function markAsRead(req, res) {
  try {
    if (!prisma || !prisma.notification) {
      return res.json({ success: true, message: 'OK' });
    }
    var notifId = parseInt(req.params.id, 10);
    var userId = getUserId(req);

    // Security: only mark own notifications
    var notif = await prisma.notification.findFirst({
      where: { id: notifId, userId: userId },
    });
    if (!notif) {
      return res.status(404).json({
        success: false,
        message: '\u0627\u0639\u0644\u0627\u0646 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F',
      });
    }

    await prisma.notification.update({
      where: { id: notifId },
      data: { isRead: true },
    });
    res.json({ success: true, message: '\u062E\u0648\u0627\u0646\u062F\u0647 \u0634\u062F' });
  } catch (err) {
    console.error('[NOTIFICATIONS] Mark read error:', err);
    res.status(500).json({ success: false, message: '\u062E\u0637\u0627\u06CC \u0633\u0631\u0648\u0631' });
  }
}

// ═══════════════════════════════════════════════════════════════
// PATCH /api/notifications/read-all
// ═══════════════════════════════════════════════════════════════
async function markAllAsRead(req, res) {
  try {
    if (!prisma || !prisma.notification) {
      return res.json({ success: true, message: 'OK' });
    }
    var userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: '\u062F\u0633\u062A\u0631\u0633\u06CC \u063A\u06CC\u0631\u0645\u062C\u0627\u0632' });
    }
    await prisma.notification.updateMany({
      where: { userId: userId, isRead: false },
      data: { isRead: true },
    });
    res.json({ success: true, message: '\u0647\u0645\u0647 \u062E\u0648\u0627\u0646\u062F\u0647 \u0634\u062F\u0646\u062F' });
  } catch (err) {
    console.error('[NOTIFICATIONS] Mark all read error:', err);
    res.status(500).json({ success: false, message: '\u062E\u0637\u0627\u06CC \u0633\u0631\u0648\u0631' });
  }
}

// ═══════════════════════════════════════════════════════════════
// DELETE /api/notifications/:id
// ═══════════════════════════════════════════════════════════════
async function deleteNotification(req, res) {
  try {
    if (!prisma || !prisma.notification) {
      return res.json({ success: true, message: 'OK' });
    }
    var notifId = parseInt(req.params.id, 10);
    var userId = getUserId(req);

    // Security: only delete own notifications
    var notif = await prisma.notification.findFirst({
      where: { id: notifId, userId: userId },
    });
    if (!notif) {
      return res.status(404).json({
        success: false,
        message: '\u0627\u0639\u0644\u0627\u0646 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F',
      });
    }

    await prisma.notification.delete({ where: { id: notifId } });
    res.json({ success: true, message: '\u0627\u0639\u0644\u0627\u0646 \u062D\u0630\u0641 \u0634\u062F' });
  } catch (err) {
    console.error('[NOTIFICATIONS] Delete error:', err);
    res.status(500).json({ success: false, message: '\u062E\u0637\u0627\u06CC \u0633\u0631\u0648\u0631' });
  }
}

module.exports = {
  getNotifications: getNotifications,
  getUnreadCount: getUnreadCount,
  createNotification: createNotification,
  markAsRead: markAsRead,
  markAllAsRead: markAllAsRead,
  deleteNotification: deleteNotification,
};
