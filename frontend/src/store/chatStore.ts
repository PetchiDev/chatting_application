import { create } from 'zustand';
import { findUserById, mergeRecentWithUsers, normalizeUserId, sameUserId } from '../lib/users';
import type { GroupDto, MessageDto, MuteEntryDto, NotificationDto, RecentChatDto, UserDto } from '../types';

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
  customGroups: GroupDto[];
  groupMessages: MessageDto[];
  customGroupMessages: Record<string, MessageDto[]>;
  directMessages: Record<string, MessageDto[]>;
  selectedUser: UserDto | null;
  selectedGroup: GroupDto | null;
  globalMuted: boolean;
  dmMutes: Record<string, boolean>;
  notifications: NotificationDto[];
  unreadCount: number;
  typingUsers: string[];
  setUsers: (users: UserDto[]) => void;
  mergeUserProfiles: (users: UserDto[]) => void;
  patchUserPresence: (userId: string, isOnline: boolean, user?: UserDto) => void;
  setRecentChats: (chats: RecentChatDto[]) => void;
  bumpRecentChat: (msg: MessageDto, currentUserId: string) => void;
  setCustomGroups: (groups: GroupDto[]) => void;
  addCustomGroup: (group: GroupDto) => void;
  removeCustomGroup: (groupId: string) => void;
  updateGroupMute: (groupId: string, isMuted: boolean) => void;
  setGlobalMuted: (muted: boolean) => void;
  setDmMuted: (userId: string, muted: boolean) => void;
  applyMutes: (entries: MuteEntryDto[]) => void;
  setGroupMessages: (messages: MessageDto[]) => void;
  addGroupMessage: (message: MessageDto) => void;
  setCustomGroupMessages: (groupId: string, messages: MessageDto[]) => void;
  addCustomGroupMessage: (groupId: string, message: MessageDto) => void;
  setDirectMessages: (userId: string, messages: MessageDto[]) => void;
  addDirectMessage: (otherUserId: string, message: MessageDto) => void;
  selectUser: (user: UserDto | null) => void;
  selectGroup: (group: GroupDto | null) => void;
  selectGlobal: () => void;
  setNotifications: (items: NotificationDto[], unread: number) => void;
  addNotification: (n: NotificationDto) => void;
  markNotificationsRead: (ids?: string[]) => void;
  setTyping: (username: string, isTyping: boolean) => void;
  clearAll: () => void;
  updateUser: (user: UserDto) => void;
  removeMessage: (messageId: string, groupId?: string) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  users: [],
  recentChats: [],
  customGroups: [],
  groupMessages: [],
  customGroupMessages: {},
  directMessages: {},
  selectedUser: null,
  selectedGroup: null,
  globalMuted: false,
  dmMutes: {},
  notifications: [],
  unreadCount: 0,
  typingUsers: [],

  setUsers: (users) =>
    set((s) => {
      const selectedUser = s.selectedUser
        ? findUserById(users, s.selectedUser.id) ?? { ...s.selectedUser, isOnline: false }
        : null;
      const recentChats = mergeRecentWithUsers(s.recentChats, users);
      return { users, selectedUser, recentChats };
    }),

  mergeUserProfiles: (incoming) =>
    set((s) => {
      const users =
        s.users.length === 0
          ? incoming
          : incoming.map((inc) => {
              const existing = findUserById(s.users, inc.id);
              return existing ? { ...inc, isOnline: existing.isOnline } : inc;
            });
      const selectedUser = s.selectedUser
        ? findUserById(users, s.selectedUser.id) ?? { ...s.selectedUser, isOnline: false }
        : null;
      const recentChats = mergeRecentWithUsers(s.recentChats, users);
      return { users, selectedUser, recentChats };
    }),

  patchUserPresence: (userId, isOnline, user) =>
    set((s) => {
      const exists = s.users.some((u) => sameUserId(u.id, userId));
      const users = exists
        ? s.users.map((u) => (sameUserId(u.id, userId) ? { ...u, isOnline } : u))
        : user
          ? [...s.users, user]
          : s.users;
      const selectedUser =
        s.selectedUser && sameUserId(s.selectedUser.id, userId)
          ? { ...s.selectedUser, isOnline }
          : s.selectedUser;
      const recentChats = s.recentChats.map((chat) =>
        sameUserId(chat.userId, userId) ? { ...chat, isOnline } : chat
      );
      return { users, selectedUser, recentChats };
    }),

  setRecentChats: (recentChats) =>
    set((s) => ({
      recentChats: mergeRecentWithUsers(recentChats, s.users),
    })),

  bumpRecentChat: (msg, currentUserId) =>
    set((s) => {
      const fromSelf = sameUserId(msg.senderId, currentUserId);
      const otherId = fromSelf ? msg.recipientId! : msg.senderId;
      const otherUser = findUserById(s.users, otherId);
      const username =
        otherUser?.username ?? (fromSelf ? '' : msg.senderUsername);
      const entry: RecentChatDto = {
        userId: otherId,
        username,
        profilePictureUrl:
          otherUser?.profilePictureUrl ?? (fromSelf ? undefined : msg.senderProfilePicture),
        isGuest: otherUser?.isGuest ?? false,
        isOnline: otherUser?.isOnline ?? !fromSelf,
        lastMessageAt: msg.createdAt,
        lastMessagePreview: messagePreview(msg),
      };
      const rest = s.recentChats.filter((c) => !sameUserId(c.userId, otherId));
      return { recentChats: [entry, ...rest] };
    }),

  setCustomGroups: (customGroups) => set({ customGroups }),

  addCustomGroup: (group) =>
    set((s) => ({ customGroups: [group, ...s.customGroups.filter((g) => g.id !== group.id)] })),

  removeCustomGroup: (groupId) =>
    set((s) => ({
      customGroups: s.customGroups.filter((g) => g.id !== groupId),
      selectedGroup: s.selectedGroup?.id === groupId ? null : s.selectedGroup,
      customGroupMessages: Object.fromEntries(
        Object.entries(s.customGroupMessages).filter(([id]) => id !== groupId)
      ),
    })),

  updateGroupMute: (groupId, isMuted) =>
    set((s) => ({
      customGroups: s.customGroups.map((g) => (g.id === groupId ? { ...g, isMuted } : g)),
      selectedGroup:
        s.selectedGroup?.id === groupId ? { ...s.selectedGroup, isMuted } : s.selectedGroup,
    })),

  setGlobalMuted: (globalMuted) => set({ globalMuted }),

  setDmMuted: (userId, muted) =>
    set((s) => {
      const key = normalizeUserId(userId);
      const dmMutes = { ...s.dmMutes };
      if (muted) dmMutes[key] = true;
      else delete dmMutes[key];
      return { dmMutes };
    }),

  applyMutes: (entries) =>
    set(() => {
      let globalMuted = false;
      const dmMutes: Record<string, boolean> = {};
      for (const entry of entries) {
        if (entry.channelType === 'global') {
          globalMuted = true;
        } else if (entry.channelType === 'dm' && entry.channelId) {
          dmMutes[normalizeUserId(entry.channelId)] = true;
        }
      }
      return { globalMuted, dmMutes };
    }),

  setGroupMessages: (messages) => set({ groupMessages: messages }),

  addGroupMessage: (message) =>
    set((s) => ({ groupMessages: [...s.groupMessages, message] })),

  setCustomGroupMessages: (groupId, messages) =>
    set((s) => ({
      customGroupMessages: { ...s.customGroupMessages, [groupId]: messages },
    })),

  addCustomGroupMessage: (groupId, message) =>
    set((s) => {
      const existing = s.customGroupMessages[groupId] || [];
      return {
        customGroupMessages: {
          ...s.customGroupMessages,
          [groupId]: [...existing, message],
        },
      };
    }),

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

  selectUser: (user) => set({ selectedUser: user, selectedGroup: null }),

  selectGroup: (group) => set({ selectedGroup: group, selectedUser: null }),

  selectGlobal: () => set({ selectedUser: null, selectedGroup: null }),

  setNotifications: (notifications, unreadCount) => set({ notifications, unreadCount }),

  addNotification: (n) =>
    set((s) => {
      const exists = s.notifications.some(
        (x) => x.id === n.id || (n.messageId != null && x.messageId === n.messageId)
      );
      if (exists) return s;
      return {
        notifications: [n, ...s.notifications],
        unreadCount: s.unreadCount + (n.isRead ? 0 : 1),
      };
    }),

  markNotificationsRead: (ids) =>
    set((s) => {
      const idSet = ids ? new Set(ids) : null;
      const notifications = s.notifications.map((n) =>
        !idSet || idSet.has(n.id) ? { ...n, isRead: true } : n
      );
      const unreadCount = notifications.filter((n) => !n.isRead).length;
      return { notifications, unreadCount };
    }),

  setTyping: (username, isTyping) =>
    set((s) => ({
      typingUsers: isTyping
        ? [...new Set([...s.typingUsers, username])]
        : s.typingUsers.filter((u) => u !== username),
    })),

  clearAll: () =>
    set({
      groupMessages: [],
      customGroupMessages: {},
      directMessages: {},
      recentChats: [],
      customGroups: [],
      typingUsers: [],
      notifications: [],
      unreadCount: 0,
    }),

  updateUser: (user) =>
    set((s) => ({
      users: s.users.map((u) =>
        sameUserId(u.id, user.id) ? { ...user, isOnline: user.isOnline || u.isOnline } : u
      ),
      selectedUser:
        s.selectedUser && sameUserId(s.selectedUser.id, user.id)
          ? { ...user, isOnline: user.isOnline || s.selectedUser.isOnline }
          : s.selectedUser,
    })),

  removeMessage: (messageId, groupId) =>
    set((s) => {
      const directMessages: Record<string, MessageDto[]> = {};
      for (const [key, msgs] of Object.entries(s.directMessages)) {
        directMessages[key] = msgs.filter((m) => m.id !== messageId);
      }
      if (groupId) {
        const customGroupMessages = { ...s.customGroupMessages };
        customGroupMessages[groupId] = (customGroupMessages[groupId] || []).filter(
          (m) => m.id !== messageId
        );
        return { directMessages, customGroupMessages };
      }
      return {
        groupMessages: s.groupMessages.filter((m) => m.id !== messageId),
        directMessages,
        customGroupMessages: Object.fromEntries(
          Object.entries(s.customGroupMessages).map(([gid, msgs]) => [
            gid,
            msgs.filter((m) => m.id !== messageId),
          ])
        ),
      };
    }),
}));
