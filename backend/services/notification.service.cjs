const { prisma } = require("./db.service.cjs");

// Create notification
async function createNotification(userId, title, message) {
  return prisma.notification.create({
    data: { userId, title, message }
  });
}

// Mark as read
async function markRead(id) {
  return prisma.notification.update({
    where: { id },
    data: { read: true }
  });
}

// Mark all as read for user
async function markAllRead(userId) {
  return prisma.notification.updateMany({
    where: { userId, read: false },
    data: { read: true }
  });
}

// Get notifications
async function getNotifications(userId) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" }
  });
}

module.exports = {
  createNotification,
  getNotifications,
  markRead,
  markAllRead
};
