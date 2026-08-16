// backend/controllers/messages.controller.cjs
'use strict';

let prisma;
try {
  prisma = require('../config/prisma.cjs');
} catch (e) {
  console.warn('[MESSAGES CTRL] Prisma not available');
}

async function getMessages(req, res) {
  try {
    if (!prisma || !prisma.message) {
      return res.json({ success: true, data: [] });
    }
    var messages = await prisma.message.findMany({
      where: { userId: parseInt(req.user.id, 10) },
      orderBy: { createdAt: 'desc' },
      take: parseInt(req.query.limit, 10) || 50
    });
    res.json({ success: true, data: messages });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function sendMessage(req, res) {
  try {
    if (!prisma || !prisma.message) {
      return res.json({ success: true, data: req.body });
    }
    var message = await prisma.message.create({
      data: {
        userId: parseInt(req.user.id, 10),
        content: req.body.content,
        type: req.body.type || 'text'
      }
    });
    res.json({ success: true, data: message });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function getMessageById(req, res) {
  try {
    if (!prisma || !prisma.message) {
      return res.status(404).json({ success: false, message: 'Not found' });
    }
    var message = await prisma.message.findFirst({
      where: {
        id: parseInt(req.params.id, 10),
        userId: parseInt(req.user.id, 10)
      }
    });
    if (!message) {
      return res.status(404).json({ success: false, message: 'Not found' });
    }
    res.json({ success: true, data: message });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function deleteMessage(req, res) {
  try {
    if (prisma && prisma.message) {
      await prisma.message.delete({
        where: { id: parseInt(req.params.id, 10) }
      });
    }
    res.json({ success: true, message: 'Message deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = {
  getMessages: getMessages,
  sendMessage: sendMessage,
  getMessageById: getMessageById,
  deleteMessage: deleteMessage
};
