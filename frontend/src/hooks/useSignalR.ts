import { useEffect, useRef } from 'react';
import * as signalR from '@microsoft/signalr';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import type { MessageDto, UserDto } from '../types';
import * as api from '../lib/api';

const HUB_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/hubs/chat`
  : '/hubs/chat';

export function useSignalR() {
  const user = useAuthStore((s) => s.user);
  const connectionRef = useRef<signalR.HubConnection | null>(null);

  useEffect(() => {
    if (!user?.token) return;

    let cancelled = false;

    const {
      addGroupMessage,
      addDirectMessage,
      setUsers,
      setRecentChats,
      bumpRecentChat,
      setTyping,
      clearAll,
      updateUser,
      removeMessage,
    } = useChatStore.getState();

    const applyOnlineUsers = (users: UserDto[]) => {
      setUsers(users.filter((u) => u.id !== user.userId));
    };

    const syncOnlineUsers = async (conn: signalR.HubConnection) => {
      if (conn.state !== signalR.HubConnectionState.Connected) return;
      await conn.invoke('RequestOnlineUsers');
    };

    const connection = new signalR.HubConnectionBuilder()
      .withUrl(`${HUB_URL}?access_token=${user.token}`)
      .withAutomaticReconnect()
      .build();

    connection.on('ReceiveMessage', (msg: MessageDto) => {
      if (!msg.recipientId) addGroupMessage(msg);
    });

    connection.on('ReceiveDirectMessage', (msg: MessageDto) => {
      const otherId =
        msg.senderId === user.userId
          ? msg.recipientId!
          : msg.senderId;
      addDirectMessage(otherId, msg);
      bumpRecentChat(msg, user.userId);
    });

    connection.on('OnlineUsers', applyOnlineUsers);

    connection.on('UserTyping', (username: string, isTyping: boolean) => {
      setTyping(username, isTyping);
    });

    connection.on('ProfileUpdated', (u: UserDto) => updateUser(u));

    connection.on('ChatReset', () => clearAll());

    connection.on('MessageDeleted', (payload: { messageId: string }) => {
      removeMessage(payload.messageId);
    });

    connection.onreconnected(async () => {
      await syncOnlineUsers(connection);
    });

    (async () => {
      try {
        await connection.start();
        if (cancelled) return;

        connectionRef.current = connection;

        // Presence sync first — hub is the source of truth for online status
        await syncOnlineUsers(connection);
        if (cancelled) return;

        const [groupMsgs, recentChats] = await Promise.all([
          api.getGroupMessages(user.token),
          api.getRecentChats(user.token),
        ]);
        if (cancelled) return;

        useChatStore.getState().setGroupMessages(groupMsgs);
        setRecentChats(recentChats);
      } catch (err) {
        console.error(err);
      }
    })();

    return () => {
      cancelled = true;
      connection.stop();
      connectionRef.current = null;
    };
  }, [user?.token, user?.userId]);

  const sendMessage = async (
    content: string | undefined,
    messageType: string,
    recipientId?: string,
    attachmentUrl?: string,
    attachmentName?: string
  ) => {
    const conn = connectionRef.current;
    if (!conn || conn.state !== signalR.HubConnectionState.Connected) return;
    await conn.invoke('SendMessage', {
      content,
      messageType,
      recipientId: recipientId || null,
      attachmentUrl,
      attachmentName,
    });
  };

  const sendTyping = async (recipientId: string | null, isTyping: boolean) => {
    const conn = connectionRef.current;
    if (!conn || conn.state !== signalR.HubConnectionState.Connected) return;
    await conn.invoke('SendTyping', recipientId, isTyping);
  };

  const deleteMessage = async (messageId: string, forEveryone: boolean) => {
    const conn = connectionRef.current;
    if (!conn || conn.state !== signalR.HubConnectionState.Connected) return;
    await conn.invoke('DeleteMessage', messageId, forEveryone);
  };

  return { sendMessage, sendTyping, deleteMessage };
}
