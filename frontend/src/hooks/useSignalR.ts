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

    const {
      addGroupMessage,
      addDirectMessage,
      setUsers,
      setTyping,
      clearAll,
      updateUser,
      removeMessage,
    } = useChatStore.getState();

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
    });

    connection.on('OnlineUsers', (users: UserDto[]) =>
      setUsers(users.filter((u) => u.id !== user.userId))
    );

    connection.on('UserJoined', (u: UserDto) => {
      const current = useChatStore.getState().users;
      const exists = current.find((x) => x.id === u.id);
      if (exists) {
        setUsers(current.map((x) => (x.id === u.id ? { ...x, isOnline: true } : x)));
      } else {
        setUsers([...current, u]);
      }
    });

    connection.on('UserLeft', (u: UserDto) => {
      const current = useChatStore.getState().users;
      setUsers(current.map((x) => (x.id === u.id ? { ...x, isOnline: false } : x)));
    });

    connection.on('UserTyping', (username: string, isTyping: boolean) => {
      setTyping(username, isTyping);
    });

    connection.on('ProfileUpdated', (u: UserDto) => updateUser(u));

    connection.on('ChatReset', () => clearAll());

    connection.on('MessageDeleted', (payload: { messageId: string }) => {
      removeMessage(payload.messageId);
    });

    connection
      .start()
      .then(async () => {
        const [groupMsgs, users] = await Promise.all([
          api.getGroupMessages(user.token),
          api.getUsers(user.token),
        ]);
        useChatStore.getState().setGroupMessages(groupMsgs);
        setUsers(users);
      })
      .catch(console.error);

    connectionRef.current = connection;

    return () => {
      connection.stop();
      connectionRef.current = null;
    };
  }, [user?.token]);

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
