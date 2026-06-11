import { create } from 'zustand';
import type { MessageDto, UserDto } from '../types';

interface ChatState {
  users: UserDto[];
  groupMessages: MessageDto[];
  directMessages: Record<string, MessageDto[]>;
  selectedUser: UserDto | null;
  typingUsers: string[];
  setUsers: (users: UserDto[]) => void;
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
  groupMessages: [],
  directMessages: {},
  selectedUser: null,
  typingUsers: [],

  setUsers: (users) => set({ users }),

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
