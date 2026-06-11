import type { AuthUser, GroupDto, MessageDto, NotificationDto, RecentChatDto, UserDto } from '../types';

const API_URL = import.meta.env.VITE_API_URL || '';

function authHeaders(token: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

async function handleResponse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data as T;
}

function mapAuth(data: Record<string, unknown>): AuthUser {
  return {
    token: data.token as string,
    userId: data.userId as string,
    username: data.username as string,
    email: data.email as string | undefined,
    isGuest: data.isGuest as boolean,
    profilePictureUrl: data.profilePictureUrl as string | undefined,
    expiresAt: data.expiresAt as string | undefined,
  };
}

export async function register(email: string, username: string, password: string) {
  const res = await fetch(`${API_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, username, password }),
  });
  return mapAuth(await handleResponse(res));
}

export async function login(identifier: string, password: string) {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });
  return mapAuth(await handleResponse(res));
}

export async function guestLogin(username: string) {
  const res = await fetch(`${API_URL}/api/auth/guest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  });
  return mapAuth(await handleResponse(res));
}

export async function getMe(token: string) {
  const res = await fetch(`${API_URL}/api/auth/me`, {
    headers: authHeaders(token),
  });
  return mapAuth(await handleResponse(res));
}

export async function getGroupMessages(token: string) {
  const res = await fetch(`${API_URL}/api/message/group`, {
    headers: authHeaders(token),
  });
  return handleResponse<MessageDto[]>(res);
}

export async function getDirectMessages(token: string, otherUserId: string) {
  const res = await fetch(`${API_URL}/api/message/direct/${otherUserId}`, {
    headers: authHeaders(token),
  });
  return handleResponse<MessageDto[]>(res);
}

export async function getRecentChats(token: string) {
  const res = await fetch(`${API_URL}/api/message/recent`, {
    headers: authHeaders(token),
  });
  return handleResponse<RecentChatDto[]>(res);
}

export async function getUsers(token: string) {
  const res = await fetch(`${API_URL}/api/message/users`, {
    headers: authHeaders(token),
  });
  return handleResponse<UserDto[]>(res);
}

export async function getMyGroups(token: string) {
  const res = await fetch(`${API_URL}/api/group`, {
    headers: authHeaders(token),
  });
  return handleResponse<GroupDto[]>(res);
}

export async function createGroup(token: string, name: string, memberIds: string[]) {
  const res = await fetch(`${API_URL}/api/group`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ name, memberIds }),
  });
  return handleResponse<GroupDto>(res);
}

export async function addGroupMembers(token: string, groupId: string, memberIds: string[]) {
  const res = await fetch(`${API_URL}/api/group/${groupId}/members`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ memberIds }),
  });
  await handleResponse(res);
}

export async function leaveGroup(token: string, groupId: string) {
  const res = await fetch(`${API_URL}/api/group/${groupId}/leave`, {
    method: 'POST',
    headers: authHeaders(token),
  });
  await handleResponse(res);
}

export async function getCustomGroupMessages(token: string, groupId: string) {
  const res = await fetch(`${API_URL}/api/group/${groupId}/messages`, {
    headers: authHeaders(token),
  });
  return handleResponse<MessageDto[]>(res);
}

export async function setMute(
  token: string,
  channelType: 'global' | 'dm' | 'group',
  channelId: string | null,
  muted: boolean
) {
  const res = await fetch(`${API_URL}/api/group/mute`, {
    method: 'PUT',
    headers: authHeaders(token),
    body: JSON.stringify({ channelType, channelId, muted }),
  });
  await handleResponse(res);
}

export async function getNotifications(token: string) {
  const res = await fetch(`${API_URL}/api/notification`, {
    headers: authHeaders(token),
  });
  return handleResponse<{ unread: number; items: NotificationDto[] }>(res);
}

export async function markNotificationsRead(token: string, ids?: string[]) {
  const res = await fetch(`${API_URL}/api/notification/read`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(ids ?? null),
  });
  await handleResponse(res);
}

export async function subscribePush(
  token: string,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } }
) {
  const res = await fetch(`${API_URL}/api/notification/push/subscribe`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    }),
  });
  await handleResponse(res);
}

export async function getVapidPublicKey() {
  const res = await fetch(`${API_URL}/api/notification/push/vapid-public-key`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.publicKey as string;
}

export async function downloadAttachment(token: string, messageId: string, fileName: string) {
  const res = await fetch(`${API_URL}/api/attachment/${messageId}/download`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Download failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName || 'attachment';
  a.click();
  URL.revokeObjectURL(url);
}

export async function updateProfile(token: string, username: string) {
  const res = await fetch(`${API_URL}/api/profile`, {
    method: 'PUT',
    headers: authHeaders(token),
    body: JSON.stringify({ username }),
  });
  return mapAuth(await handleResponse(res));
}

export async function updateProfilePicture(token: string, file: File) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_URL}/api/profile/picture`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  return mapAuth(await handleResponse(res));
}

export async function uploadFile(token: string, file: File) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_URL}/api/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  return handleResponse<{ url: string; name: string; contentType: string }>(res);
}
