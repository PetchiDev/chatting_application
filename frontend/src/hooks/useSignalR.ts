import { useEffect, useRef } from 'react';
import * as signalR from '@microsoft/signalr';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import type { MessageDto, NotificationDto, SendMessageOptions, UserDto } from '../types';
import * as api from '../lib/api';
import { normalizeUserId } from '../lib/users';

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
      addCustomGroupMessage,
      addDirectMessage,
      setUsers,
      setRecentChats,
      bumpRecentChat,
      setTyping,
      clearAll,
      updateUser,
      removeMessage,
      setGroupMessages,
      setCustomGroups,
      setNotifications,
      addNotification,
    } = useChatStore.getState();

    const selfId = normalizeUserId(user.userId);

    const applyOnlineUsers = (users: UserDto[]) => {
      setUsers(users.filter((u) => normalizeUserId(u.id) !== selfId));
    };

    const refreshUsers = async () => {
      try {
        const list = await api.getUsers(user.token);
        applyOnlineUsers(list);
      } catch {
        /* REST fallback failed; SignalR may still update */
      }
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
      if (!msg.recipientId && !msg.groupId) addGroupMessage(msg);
    });

    connection.on('ReceiveGroupMessage', (msg: MessageDto) => {
      if (msg.groupId) addCustomGroupMessage(msg.groupId, msg);
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

    connection.on('NewNotification', (n: NotificationDto) => {
      addNotification(n);
    });

    connection.on(
      'MessageDeleted',
      (payload: { messageId: string; recipientId?: string; groupId?: string }) => {
        removeMessage(payload.messageId, payload.groupId);
      }
    );

    connection.onreconnected(async () => {
      await syncOnlineUsers(connection);
      await refreshUsers();
    });

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void refreshUsers();
        void syncOnlineUsers(connection);
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    (async () => {
      try {
        await connection.start();
        if (cancelled) return;

        connectionRef.current = connection;

        const [groupMsgs, recentChats, groups, notifData] = await Promise.all([
          api.getGroupMessages(user.token),
          api.getRecentChats(user.token),
          api.getMyGroups(user.token).catch(() => []),
          api.getNotifications(user.token).catch(() => ({ unread: 0, items: [] })),
        ]);
        if (cancelled) return;

        setGroupMessages(groupMsgs);
        setCustomGroups(groups);
        setNotifications(notifData.items, notifData.unread);
        await Promise.all([syncOnlineUsers(connection), refreshUsers()]);
        if (cancelled) return;
        setRecentChats(recentChats);
      } catch (err) {
        console.error(err);
      }
    })();

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      connection.stop();
      connectionRef.current = null;
    };
  }, [user?.token, user?.userId]);

  const sendMessage = async (
    content: string | undefined,
    messageType: string,
    options: SendMessageOptions = {}
  ) => {
    const conn = connectionRef.current;
    if (!conn || conn.state !== signalR.HubConnectionState.Connected) return;
    await conn.invoke('SendMessage', {
      content,
      messageType,
      recipientId: options.recipientId || null,
      groupId: options.groupId || null,
      attachmentUrl: options.attachmentUrl,
      attachmentName: options.attachmentName,
      forwardedFromId: null,
    });
  };

  const forwardMessage = async (
    messageId: string,
    recipientId?: string,
    groupId?: string
  ) => {
    const conn = connectionRef.current;
    if (!conn || conn.state !== signalR.HubConnectionState.Connected) return;
    await conn.invoke('ForwardMessage', { messageId, recipientId: recipientId || null, groupId: groupId || null });
  };

  const sendTyping = async (
    recipientId: string | null,
    isTyping: boolean,
    groupId?: string | null
  ) => {
    const conn = connectionRef.current;
    if (!conn || conn.state !== signalR.HubConnectionState.Connected) return;
    await conn.invoke('SendTyping', recipientId, groupId || null, isTyping);
  };

  const deleteMessage = async (messageId: string, forEveryone: boolean) => {
    const conn = connectionRef.current;
    if (!conn || conn.state !== signalR.HubConnectionState.Connected) return;
    await conn.invoke('DeleteMessage', messageId, forEveryone);
  };

  return { sendMessage, sendTyping, deleteMessage, forwardMessage };
}
