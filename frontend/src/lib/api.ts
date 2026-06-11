import type { AuthUser, MessageDto, UserDto } from '../types';

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

export async function getUsers(token: string) {
  const res = await fetch(`${API_URL}/api/message/users`, {
    headers: authHeaders(token),
  });
  return handleResponse<UserDto[]>(res);
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
