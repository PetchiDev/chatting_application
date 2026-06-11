import { create } from 'zustand';
import type { MessageDto, RecentChatDto, UserDto } from '../types';

function messagePreview(msg: MessageDto): string {
  switch (msg.messageType) {
    case 'image':
      return 'Photo';
    case 'audio':
      return 'Voice message';
    case 'file':
      return msg.attachmentName || 'Attachment';
    default:
      return msg.content || msg.linkTitle || 'Message';
  }
}

interface ChatState {
  users: UserDto[];
  recentChats: RecentChatDto[];
  groupMessages: MessageDto[];
  directMessages: Record<string, MessageDto[]>;
  selectedUser: UserDto | null;
  typingUsers: string[];
  setUsers: (users: UserDto[]) => void;
  patchUserPresence: (userId: string, isOnline: boolean, user?: UserDto) => void;
  setRecentChats: (chats: RecentChatDto[]) => void;
  bumpRecentChat: (msg: MessageDto, currentUserId: string) => void;
  setGroupMessages: (messages: MessageDto[]) => void;
  addGroupMessage: (message: MessageDto) => void;
  setDirectMessages: (userId: string, messages: MessageDto[]) => void;
  addDirectMessage: (otherUserId: string, message: MessageDto) => void;
  selectUser: (user: UserDto | null) => void;
  setTyping: (username: string, isTyping: boolean) => void;
  clearAll: () => void;
  updateUser: (user: UserDto) => void;
  removeMessage: (messageId: string) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  users: [],
  recentChats: [],
  groupMessages: [],
  directMessages: {},
  selectedUser: null,
  typingUsers: [],

  setUsers: (users) =>
    set((s) => {
      const selectedUser = s.selectedUser
        ? users.find((u) => u.id === s.selectedUser!.id) ?? { ...s.selectedUser, isOnline: false }
        : null;
      const recentChats = s.recentChats.map((chat) => {
        const live = users.find((u) => u.id === chat.userId);
        return live ? { ...chat, isOnline: live.isOnline, username: live.username } : chat;
      });
      return { users, selectedUser, recentChats };
    }),

  patchUserPresence: (userId, isOnline, user) =>
    set((s) => {
      const exists = s.users.some((u) => u.id === userId);
      const users = exists
        ? s.users.map((u) => (u.id === userId ? { ...u, isOnline } : u))
        : user
          ? [...s.users, user]
          : s.users;
      const selectedUser =
        s.selectedUser?.id === userId ? { ...s.selectedUser, isOnline } : s.selectedUser;
      const recentChats = s.recentChats.map((chat) =>
        chat.userId === userId ? { ...chat, isOnline } : chat
      );
      return { users, selectedUser, recentChats };
    }),

  setRecentChats: (recentChats) => set({ recentChats }),

  bumpRecentChat: (msg, currentUserId) =>
    set((s) => {
      const otherId =
        msg.senderId === currentUserId ? msg.recipientId! : msg.senderId;
      const otherUser = s.users.find((u) => u.id === otherId);
      const username =
        otherUser?.username ??
        (msg.senderId === currentUserId ? '' : msg.senderUsername);
      const entry: RecentChatDto = {
        userId: otherId,
        username,
        profilePictureUrl:
          otherUser?.profilePictureUrl ??
          (msg.senderId === currentUserId ? undefined : msg.senderProfilePicture),
        isGuest: otherUser?.isGuest ?? false,
        isOnline: otherUser?.isOnline ?? false,
        lastMessageAt: msg.createdAt,
        lastMessagePreview: messagePreview(msg),
      };
      const rest = s.recentChats.filter((c) => c.userId !== otherId);
      return { recentChats: [entry, ...rest] };
    }),

  setGroupMessages: (messages) => set({ groupMessages: messages }),

  addGroupMessage: (message) =>
    set((s) => ({ groupMessages: [...s.groupMessages, message] })),

  setDirectMessages: (userId, messages) =>
    set((s) => ({
      directMessages: { ...s.directMessages, [userId]: messages },
    })),

  addDirectMessage: (otherUserId, message) =>
    set((s) => {
      const existing = s.directMessages[otherUserId] || [];
      return {
        directMessages: {
          ...s.directMessages,
          [otherUserId]: [...existing, message],
        },
      };
    }),

  selectUser: (user) => set({ selectedUser: user }),

  setTyping: (username, isTyping) =>
    set((s) => ({
      typingUsers: isTyping
        ? [...new Set([...s.typingUsers, username])]
        : s.typingUsers.filter((u) => u !== username),
    })),

  clearAll: () =>
    set({
      groupMessages: [],
      directMessages: {},
      recentChats: [],
      typingUsers: [],
    }),

  updateUser: (user) =>
    set((s) => ({
      users: s.users.map((u) => (u.id === user.id ? user : u)),
      selectedUser:
        s.selectedUser?.id === user.id ? user : s.selectedUser,
    })),

  removeMessage: (messageId) =>
    set((s) => {
      const directMessages: Record<string, MessageDto[]> = {};
      for (const [key, msgs] of Object.entries(s.directMessages)) {
        directMessages[key] = msgs.filter((m) => m.id !== messageId);
      }
      return {
        groupMessages: s.groupMessages.filter((m) => m.id !== messageId),
        directMessages,
      };
    }),
}));
