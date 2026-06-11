import { useEffect, useRef } from 'react';
import * as signalR from '@microsoft/signalr';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import type { GroupDto, MessageDto, NotificationDto, SendMessageOptions, UserDto } from '../types';
import * as api from '../lib/api';
import { normalizeUserId, sameUserId } from '../lib/users';

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
      mergeUserProfiles,
      patchUserPresence,
      setRecentChats,
      bumpRecentChat,
      setTyping,
      clearAll,
      updateUser,
      removeMessage,
      setGroupMessages,
      setCustomGroups,
      addCustomGroup,
      removeCustomGroup,
      setNotifications,
      addNotification,
      applyMutes,
    } = useChatStore.getState();

    const selfId = normalizeUserId(user.userId);

    const applyOnlineUsers = (users: UserDto[]) => {
      setUsers(users.filter((u) => normalizeUserId(u.id) !== selfId));
    };

    const refreshUserProfiles = async () => {
      try {
        const list = await api.getUsers(user.token);
        mergeUserProfiles(list.filter((u) => normalizeUserId(u.id) !== selfId));
      } catch {
        /* REST fallback failed; SignalR may still update */
      }
    };

    const markSenderOnline = (msg: MessageDto) => {
      if (sameUserId(msg.senderId, user.userId)) return;
      patchUserPresence(msg.senderId, true, {
        id: msg.senderId,
        username: msg.senderUsername,
        profilePictureUrl: msg.senderProfilePicture,
        isGuest: false,
        isOnline: true,
      });
    };

    const syncOnlineUsers = async (conn: signalR.HubConnection) => {
      if (conn.state !== signalR.HubConnectionState.Connected) return;
      await conn.invoke('RequestOnlineUsers');
    };

    const refreshNotifications = async () => {
      try {
        const data = await api.getNotifications(user.token);
        setNotifications(data.items, data.unread);
      } catch {
        /* ignore */
      }
    };

    const refreshGroups = async () => {
      try {
        const groups = await api.getMyGroups(user.token);
        setCustomGroups(groups);
      } catch {
        /* ignore */
      }
    };

    const connection = new signalR.HubConnectionBuilder()
      .withUrl(`${HUB_URL}?access_token=${user.token}`)
      .withAutomaticReconnect()
      .build();

    connection.on('ReceiveMessage', (msg: MessageDto) => {
      if (!msg.recipientId && !msg.groupId) {
        addGroupMessage(msg);
        if (!sameUserId(msg.senderId, user.userId)) {
          markSenderOnline(msg);
          void refreshNotifications();
        }
      }
    });

    connection.on('ReceiveGroupMessage', (msg: MessageDto) => {
      if (msg.groupId) {
        addCustomGroupMessage(msg.groupId, msg);
        if (!sameUserId(msg.senderId, user.userId)) {
          markSenderOnline(msg);
          void refreshNotifications();
        }
      }
    });

    connection.on('ReceiveDirectMessage', (msg: MessageDto) => {
      const fromSelf = sameUserId(msg.senderId, user.userId);
      const otherId = fromSelf ? msg.recipientId! : msg.senderId;
      addDirectMessage(otherId, msg);
      bumpRecentChat(msg, user.userId);
      if (!fromSelf) {
        markSenderOnline(msg);
        void refreshNotifications();
      }
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

    connection.on('GroupAdded', (group: GroupDto) => {
      addCustomGroup(group);
    });

    connection.on('GroupRemoved', (groupId: string) => {
      removeCustomGroup(groupId);
    });

    connection.on(
      'MessageDeleted',
      (payload: { messageId: string; recipientId?: string; groupId?: string }) => {
        removeMessage(payload.messageId, payload.groupId);
      }
    );

    connection.onreconnected(async () => {
      await syncOnlineUsers(connection);
      await refreshUserProfiles();
      await refreshGroups();
    });

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void syncOnlineUsers(connection);
        void refreshUserProfiles();
        void refreshNotifications();
        void refreshGroups();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    (async () => {
      try {
        await connection.start();
        if (cancelled) return;

        connectionRef.current = connection;

        const [groupMsgs, recentChats, groups, notifData, mutes] = await Promise.all([
          api.getGroupMessages(user.token),
          api.getRecentChats(user.token),
          api.getMyGroups(user.token).catch(() => []),
          api.getNotifications(user.token).catch(() => ({ unread: 0, items: [] })),
          api.getMutes(user.token).catch(() => []),
        ]);
        if (cancelled) return;

        setGroupMessages(groupMsgs);
        setCustomGroups(groups);
        setNotifications(notifData.items, notifData.unread);
        applyMutes(mutes);
        await syncOnlineUsers(connection);
        if (cancelled) return;
        await refreshUserProfiles();
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
