// backend/controllers/conversation.controller.cjs
'use strict';

let prisma;
try {
  prisma = require('../config/prisma.cjs');
} catch (e) {
  console.error('[CONVERSATION CTRL] Prisma not available:', e.message);
}

function toInt(value) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

async function getConversations(req, res) {
  try {
    if (!prisma || !prisma.conversation) {
      return res.json({ success: true, data: [] });
    }

    const userId = toInt(req.user?.id ?? req.user?.userId);
    if (!userId) return res.status(400).json({ success: false, message: 'Invalid user id' });

    const conversations = await prisma.conversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true
      }
    });

    res.json({ success: true, data: conversations });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function createConversation(req, res) {
  try {
    if (!prisma || !prisma.conversation) {
      return res.json({
        success: true,
        data: {
          id: Date.now(),
          title: req.body.title || 'New Conversation',
          createdAt: new Date().toISOString()
        }
      });
    }

    const userId = toInt(req.user?.id ?? req.user?.userId);
    if (!userId) return res.status(400).json({ success: false, message: 'Invalid user id' });

    const conversation = await prisma.conversation.create({
      data: {
        userId,
        title: req.body.title || 'New Conversation'
      }
    });

    res.json({ success: true, data: conversation });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * NOTE:
 * Because Message model doesn't have conversationId and Conversation has no messages relation
 * in schema.prisma, we reconstruct "conversation messages" by:
 * 1) fetching conversation members (ConversationMember)
 * 2) fetching Message where (senderId/receiverId) matches member pairs (2-person conversation)
 */
async function getConversationById(req, res) {
  try {
    if (!prisma || !prisma.conversation) {
      return res.status(404).json({ success: false, message: 'Not found' });
    }

    const userId = toInt(req.user?.id ?? req.user?.userId);
    const conversationId = toInt(req.params.id);
    if (!userId || !conversationId) {
      return res.status(400).json({ success: false, message: 'Invalid ids' });
    }

    // Conversation ownership check (based on current schema: Conversation has userId as owner)
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, userId },
      select: {
        id: true,
        title: true,
        userId: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    // Members (including owner if you also store owner as member; if not, we still handle it)
    let members = [];
    if (prisma.conversationMember) {
      members = await prisma.conversationMember.findMany({
        where: { conversationId },
        select: { userId: true, joinedAt: true }
      });
    }

    // Ensure owner is part of member set for message reconstruction
    const memberIdsSet = new Set(members.map(m => m.userId));
    memberIdsSet.add(conversation.userId);
    memberIdsSet.add(userId);

    const memberIds = Array.from(memberIdsSet);

    // For now we support 2-person conversations reliably.
    // If more than 2 members, we fallback to returning empty messages (or could do more complex query).
    let messages = [];
    if (prisma.message && memberIds.length >= 2) {
      // Pick "the other user" as the first member that's not current user
      const otherUserId = memberIds.find(id => id !== userId);

      if (otherUserId) {
        messages = await prisma.message.findMany({
          where: {
            OR: [
              { senderId: userId, receiverId: otherUserId },
              { senderId: otherUserId, receiverId: userId }
            ]
          },
          orderBy: { createdAt: 'asc' },
          include: {
            sender: { select: { id: true, username: true, name: true } },
            receiver: { select: { id: true, username: true, name: true } }
          }
        });
      }
    }

    res.json({
      success: true,
      data: {
        ...conversation,
        members,
        messages
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function updateConversation(req, res) {
  try {
    if (!prisma || !prisma.conversation) {
      return res.json({ success: true, data: req.body });
    }

    const userId = toInt(req.user?.id ?? req.user?.userId);
    const conversationId = toInt(req.params.id);
    if (!userId || !conversationId) {
      return res.status(400).json({ success: false, message: 'Invalid ids' });
    }

    // Ensure user owns this conversation
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, userId },
      select: { id: true }
    });
    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    const updated = await prisma.conversation.update({
      where: { id: conversationId },
      data: { title: req.body.title }
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function deleteConversation(req, res) {
  try {
    const userId = toInt(req.user?.id ?? req.user?.userId);
    const conversationId = toInt(req.params.id);
    if (!userId || !conversationId) {
      return res.status(400).json({ success: false, message: 'Invalid ids' });
    }

    if (prisma && prisma.conversation) {
      // Ensure user owns this conversation
      const conversation = await prisma.conversation.findFirst({
        where: { id: conversationId, userId },
        select: { id: true }
      });
      if (!conversation) {
        return res.status(404).json({ success: false, message: 'Conversation not found' });
      }

      await prisma.conversation.delete({ where: { id: conversationId } });
    }

    res.json({ success: true, message: 'Conversation deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function getMessages(req, res) {
  try {
    if (!prisma || !prisma.message || !prisma.conversation) {
      return res.json({ success: true, data: [] });
    }

    const userId = toInt(req.user?.id ?? req.user?.userId);
    const conversationId = toInt(req.params.id);
    if (!userId || !conversationId) {
      return res.status(400).json({ success: false, message: 'Invalid ids' });
    }

    // Validate conversation ownership
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, userId },
      select: { id: true, userId: true }
    });
    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    let members = [];
    if (prisma.conversationMember) {
      members = await prisma.conversationMember.findMany({
        where: { conversationId },
        select: { userId: true }
      });
    }

    const ids = new Set(members.map(m => m.userId));
    ids.add(conversation.userId);
    ids.add(userId);

    const memberIds = Array.from(ids);
    const otherUserId = memberIds.find(id => id !== userId);

    if (!otherUserId) {
      return res.json({ success: true, data: [] });
    }

    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { senderId: userId, receiverId: otherUserId },
          { senderId: otherUserId, receiverId: userId }
        ]
      },
      orderBy: { createdAt: 'asc' },
      include: {
        sender: { select: { id: true, username: true, name: true } },
        receiver: { select: { id: true, username: true, name: true } }
      }
    });

    res.json({ success: true, data: messages });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function addMessage(req, res) {
  try {
    if (!prisma || !prisma.message || !prisma.conversation) {
      return res.json({
        success: true,
        data: {
          id: Date.now(),
          content: req.body.content,
          createdAt: new Date().toISOString()
        }
      });
    }

    const userId = toInt(req.user?.id ?? req.user?.userId);
    const conversationId = toInt(req.params.id);
    const content = (req.body?.content ?? '').toString().trim();

    if (!userId || !conversationId) {
      return res.status(400).json({ success: false, message: 'Invalid ids' });
    }
    if (!content) {
      return res.status(400).json({ success: false, message: 'content is required' });
    }

    // Validate