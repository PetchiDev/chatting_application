import type { GroupDto, RecentChatDto, UserDto } from '../types';

export function normalizeUserId(id: string) {
  return id.toLowerCase();
}

export function sameUserId(a: string, b: string) {
  return normalizeUserId(a) === normalizeUserId(b);
}

export function findUserById(users: UserDto[], id: string) {
  const norm = normalizeUserId(id);
  return users.find((u) => normalizeUserId(u.id) === norm);
}

export function findGroupById(groups: GroupDto[], id: string) {
  const norm = normalizeUserId(id);
  return groups.find((g) => normalizeUserId(g.id) === norm);
}

export function userFromRecentChat(chat: RecentChatDto): UserDto {
  return {
    id: chat.userId,
    username: chat.username,
    profilePictureUrl: chat.profilePictureUrl,
    isGuest: chat.isGuest,
    isOnline: chat.isOnline,
  };
}

export function resolveUserForNotification(
  channelId: string,
  title: string,
  users: UserDto[],
  recentChats: RecentChatDto[]
): UserDto {
  const known = findUserById(users, channelId);
  if (known) return known;

  const chat = recentChats.find((c) => sameUserId(c.userId, channelId));
  if (chat) return userFromRecentChat(chat);

  return {
    id: channelId,
    username: title,
    isGuest: false,
    isOnline: false,
  };
}

export function mergeRecentWithUsers(recentChats: RecentChatDto[], users: UserDto[]): RecentChatDto[] {
  return recentChats.map((chat) => {
    const live = findUserById(users, chat.userId);
    if (!live) return chat;
    return {
      ...chat,
      username: live.username,
      profilePictureUrl: live.profilePictureUrl ?? chat.profilePictureUrl,
      isGuest: live.isGuest,
      isOnline: live.isOnline || chat.isOnline,
    };
  });
}

export function collectOnlineUsers(users: UserDto[], recentChats: RecentChatDto[]): UserDto[] {
  const map = new Map<string, UserDto>();

  for (const u of users) {
    if (u.isOnline) map.set(normalizeUserId(u.id), u);
  }

  for (const chat of recentChats) {
    if (!chat.isOnline) continue;
    const id = normalizeUserId(chat.userId);
    const existing = map.get(id) ?? findUserById(users, chat.userId);
    if (existing) {
      map.set(id, { ...existing, isOnline: true });
      continue;
    }
    map.set(id, {
      id: chat.userId,
      username: chat.username,
      profilePictureUrl: chat.profilePictureUrl,
      isGuest: chat.isGuest,
      isOnline: true,
    });
  }

  return Array.from(map.values());
}
