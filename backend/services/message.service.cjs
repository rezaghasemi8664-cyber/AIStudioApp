"use strict";

const prisma = require("./db.service.cjs");

class MessageService {
  /* ===================== SEND MESSAGE ===================== */
  static async sendMessage({ conversationId, senderId, content }) {
    if (!conversationId || !senderId) {
      throw new Error("conversationId and senderId are required");
    }

    if (!content || typeof content !== "string" || !content.trim()) {
      throw new Error("Message content cannot be empty");
    }

    // ??????? ?? ????? ????? ??? ?????? ???
    const member = await prisma.conversationMember.findFirst({
      where: {
        conversationId,
        userId: senderId,
      },
      select: { id: true },
    });

    if (!member) {
      throw new Error("User is not a member of this conversation");
    }

    return prisma.message.create({
      data: {
        conversationId,
        senderId,
        content: content.trim(),
        isRead: false,
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            name: true,
            avatar: true,
          },
        },
      },
    });
  }

  /* ===================== GET CONVERSATION MESSAGES ===================== */
  static async getConversationMessages(conversationId, options = {}) {
    if (!conversationId) {
      throw new Error("conversationId is required");
    }

    const take =
      typeof options.take === "number" && options.take > 0
        ? Math.min(options.take, 100)
        : 50;

    const cursor =
      options.cursor && !Number.isNaN(Number(options.cursor))
        ? Number(options.cursor)
        : null;

    return prisma.message.findMany({
      where: { conversationId },
      orderBy: { id: "desc" },
      take,
      ...(cursor
        ? {
            cursor: { id: cursor },
            skip: 1,
          }
        : {}),
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            name: true,
            avatar: true,
          },
        },
      },
    });
  }

  /* ===================== MARK AS READ ===================== */
  static async markAsRead({ conversationId, userId }) {
    if (!conversationId || !userId) {
      throw new Error("conversationId and userId are required");
    }

    return prisma.message.updateMany({
      where: {
        conversationId,
        senderId: { not: userId },
        isRead: false,
      },
      data: {
        isRead: true,
      },
    });
  }
}

module.exports = MessageService;
