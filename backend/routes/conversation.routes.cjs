// routes/conversation.routes.cjs
const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const authMiddleware = require('../middlewares/auth.middleware.cjs');

// GET /api/conversations - ???? ??????? ?????
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;

    // Get conversations where user is a member
    // ConversationMember: id, conversationId, userId, lastReadAt
    // Conversation: id, title, isGroup, createdAt, updatedAt
    const memberships = await prisma.$queryRaw`
      SELECT 
        c.id, c.title, c.isGroup, c.createdAt, c.updatedAt,
        cm.lastReadAt
      FROM [dbo].[Conversation] c
      INNER JOIN [dbo].[ConversationMember] cm ON cm.conversationId = c.id
      WHERE cm.userId = ${userId}
      ORDER BY c.updatedAt DESC
    `;

    // For each conversation, get member count
    const conversations = [];
    for (const conv of memberships) {
      const members = await prisma.$queryRaw`
        SELECT cm.userId, u.username, u.name, u.avatar
        FROM [dbo].[ConversationMember] cm
        INNER JOIN [dbo].[User] u ON u.id = cm.userId
        WHERE cm.conversationId = ${conv.id}
      `;

      conversations.push({
        id: conv.id,
        title: conv.title,
        isGroup: conv.isGroup,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
        lastReadAt: conv.lastReadAt,
        memberCount: members.length,
        members: members
      });
    }

    res.json({
      success: true,
      data: conversations
    });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({
      success: false,
      message: '??? ?? ?????? ???????',
      error: error.message
    });
  }
});

// POST /api/conversations - ????? ?????? ????
router.post('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { title, memberIds, isGroup } = req.body;

    // Create conversation
    const conversation = await prisma.conversation.create({
      data: {
        title: title || null,
        isGroup: Boolean(isGroup || (memberIds && memberIds.length > 1))
      }
    });

    // Add creator as member
    await prisma.$queryRaw`
      INSERT INTO [dbo].[ConversationMember] (conversationId, userId)
      VALUES (${conversation.id}, ${userId})
    `;

    // Add other members
    if (memberIds && Array.isArray(memberIds)) {
      for (const memberId of memberIds) {
        if (parseInt(memberId) !== userId) {
          await prisma.$queryRaw`
            INSERT INTO [dbo].[ConversationMember] (conversationId, userId)
            VALUES (${conversation.id}, ${parseInt(memberId)})
          `;
        }
      }
    }

    res.status(201).json({
      success: true,
      message: '?????? ????? ??',
      data: conversation
    });
  } catch (error) {
    console.error('Error creating conversation:', error);
    res.status(500).json({
      success: false,
      message: '??? ?? ????? ??????',
      error: error.message
    });
  }
});

// GET /api/conversations/:id - ?????? ?????? ??????
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id || req.user.userId;

    const conversation = await prisma.conversation.findUnique({
      where: { id: parseInt(id) }
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: '?????? ???? ???'
      });
    }

    // Get members
    const members = await prisma.$queryRaw`
      SELECT cm.userId, cm.lastReadAt, u.username, u.name, u.avatar
      FROM [dbo].[ConversationMember] cm
      INNER JOIN [dbo].[User] u ON u.id = cm.userId
      WHERE cm.conversationId = ${parseInt(id)}
    `;

    // Get messages - Message: id, senderId, receiverId, content, createdAt
    // Messages in conversations don't have conversationId field!
    // We need to handle this differently
    // For now, get direct messages between members
    const memberUserIds = members.map(m => m.userId);
    
    let messages = [];
    if (memberUserIds.length === 2) {
      // Direct conversation between two users
      const [user1, user2] = memberUserIds;
      messages = await prisma.$queryRaw`
        SELECT m.id, m.senderId, m.receiverId, m.content, m.createdAt,
               u.username as senderUsername, u.name as senderName
        FROM [dbo].[Message] m
        LEFT JOIN [dbo].[User] u ON u.id = m.senderId
        WHERE (m.senderId = ${user1} AND m.receiverId = ${user2})
           OR (m.senderId = ${user2} AND m.receiverId = ${user1})
        ORDER BY m.createdAt ASC
      `;
    }

    res.json({
      success: true,
      data: {
        ...conversation,
        members,
        messages
      }
    });
  } catch (error) {
    console.error('Error fetching conversation:', error);
    res.status(500).json({
      success: false,
      message: '??? ?? ?????? ??????',
      error: error.message
    });
  }
});

// DELETE /api/conversations/:id - ??? ??????
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    // Delete members first
    await prisma.$queryRaw`
      DELETE FROM [dbo].[ConversationMember] WHERE conversationId = ${parseInt(id)}
    `;

    // Delete conversation
    await prisma.conversation.delete({
      where: { id: parseInt(id) }
    });

    res.json({
      success: true,
      message: '?????? ??? ??'
    });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    res.status(500).json({
      success: false,
      message: '??? ?? ??? ??????',
      error: error.message
    });
  }
});

module.exports = router;
