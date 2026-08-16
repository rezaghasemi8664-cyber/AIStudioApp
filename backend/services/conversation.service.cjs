const prisma = require("./db.service.cjs");

class ConversationService {
  /* ===============================
     Create Conversation
  =============================== */
  static async createConversation({
    creatorId,
    title,
    isGroup = false,
    memberIds = [],
  }) {
    // DM validation
    if (!isGroup && memberIds.length !== 1) {
      throw new Error("DM must have exactly one participant")
    }

    const conversation = await prisma.conversation.create({
      data: {
        title: isGroup ? title : null,
        isGroup,
        members: {
          create: [
            { userId: creatorId },
            ...memberIds.map((id) => ({ userId: id })),
          ],
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                name: true,
                avatar: true,
              },
            },
          },
        },
      },
    })

    return conversation
  }

  /* ===============================
     User Conversations
  =============================== */
  static async getUserConversations(userId) {
    return prisma.conversation.findMany({
      where: {
        members: {
          some: { userId },
        },
      },
      orderBy: { updatedAt: "desc" },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                name: true,
                avatar: true,
              },
            },
          },
        },
        messages: {
          take: 1,
          orderBy: { createdAt: "desc" },
        },
      },
    })
  }

  /* ===============================
     Add Member (Group only)
  =============================== */
  static async addMember({ conversationId, requesterId, userId }) {
    const convo = await prisma.conversation.findUnique({
      where: { id: conversationId },
    })

    if (!convo) throw new Error("Conversation not found")
    if (!convo.isGroup) throw new Error("Cannot add member to DM")

    // requester must be member
    const isMember = await prisma.conversationMember.findFirst({
      where: { conversationId, userId: requesterId },
    })
    if (!isMember) throw new Error("Access denied")

    return prisma.conversationMember.create({
      data: { conversationId, userId },
    })
  }

  /* ===============================
     Leave / Remove Member
  =============================== */
  static async removeMember({ conversationId, requesterId, userId }) {
    if (requesterId !== userId) {
      throw new Error("Only user can remove themselves (for now)")
    }

    return prisma.conversationMember.deleteMany({
      where: { conversationId, userId },
    })
  }
}

module.exports = ConversationService
