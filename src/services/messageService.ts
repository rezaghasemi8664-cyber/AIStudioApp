// src/services/messageService.ts
import type { DirectMessage, StoredUser } from '../types';
import { appApiFetch } from './apiConfigService';

/** ????? ???? ????? ?? ????? */
export const sendMessageToAdmin = async (
  user: StoredUser,
  message: string,
  attachment?: DirectMessage['attachment']
): Promise<DirectMessage> => {
  return await appApiFetch<DirectMessage>('/messages', {
    method: 'POST',
    body: JSON.stringify({
      senderId: user.id, // ??????? ?????? ?? session ??????
      senderUsername: user.username, // ??????? ?????? ?? session/profile ??????
      message,
      attachment,
    }),
  });
};

/** ?????? ??? ??????? (?????) */
export const getAllMessages = async (): Promise<DirectMessage[]> => {
  const data = await appApiFetch<DirectMessage[]>('/messages', { method: 'GET' });
  return Array.isArray(data) ? [...data].sort((a, b) => b.timestamp - a.timestamp) : [];
};

/** ????? ???????? ??????????? ???? ????? */
export const getUnreadMessageCountForAdmin = async (): Promise<number> => {
  const result = await appApiFetch<{ count: number }>('/messages/unread-count', {
    method: 'GET',
  });
  return typeof result?.count === 'number' ? result.count : 0;
};

/** ??????????? ???? ???????? ?????????? ???? ????? */
export const markAsReadByAdmin = async (messageId: string): Promise<DirectMessage> => {
  return await appApiFetch<DirectMessage>(`/messages/${encodeURIComponent(messageId)}/read`, {
    method: 'PATCH',
  });
};

/** ??? attachment ???? */
export const deleteAttachment = async (messageId: string): Promise<DirectMessage> => {
  return await appApiFetch<DirectMessage>(
    `/messages/${encodeURIComponent(messageId)}/attachment`,
    { method: 'DELETE' }
  );
};

/** ????? ???? ????? ?? ????? */
export const sendReplyToUser = async (
  messageId: string,
  replyMessage: string
): Promise<DirectMessage> => {
  return await appApiFetch<DirectMessage>(
    `/messages/${encodeURIComponent(messageId)}/reply`,
    {
      method: 'POST',
      body: JSON.stringify({ text: replyMessage }),
    }
  );
};

