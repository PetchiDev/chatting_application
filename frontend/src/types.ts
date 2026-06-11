export interface AuthUser {
  token: string;
  userId: string;
  username: string;
  email?: string;
  isGuest: boolean;
  profilePictureUrl?: string;
  expiresAt?: string;
}

export interface UserDto {
  id: string;
  username: string;
  profilePictureUrl?: string;
  isGuest: boolean;
  isOnline: boolean;
}

export interface MessageDto {
  id: string;
  senderId: string;
  senderUsername: string;
  senderProfilePicture?: string;
  recipientId?: string;
  content?: string;
  messageType: 'text' | 'image' | 'file' | 'audio';
  attachmentUrl?: string;
  attachmentName?: string;
  linkUrl?: string;
  linkTitle?: string;
  linkDescription?: string;
  linkImage?: string;
  createdAt: string;
}

export type ChatMode = 'group' | 'direct';
