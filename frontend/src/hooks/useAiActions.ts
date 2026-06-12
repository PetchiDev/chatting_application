import { useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { findUserById, findGroupById } from '../lib/users';
import type { AiClientAction, A2uiAction } from '../types/ai';
import type { GroupDto, UserDto } from '../types';
import * as api from '../lib/api';

interface Handlers {
  onSelectUser: (user: UserDto) => void;
  onSelectGroup: (group: GroupDto) => void;
  onSelectGlobal: () => void;
}

export function useAiActions({ onSelectUser, onSelectGroup, onSelectGlobal }: Handlers) {
  const user = useAuthStore((s) => s.user);
  const users = useChatStore((s) => s.users);
  const customGroups = useChatStore((s) => s.customGroups);
  const addCustomGroup = useChatStore((s) => s.addCustomGroup);
  const setCustomGroups = useChatStore((s) => s.setCustomGroups);
  const applyMutes = useChatStore((s) => s.applyMutes);
  const setDirectMessages = useChatStore((s) => s.setDirectMessages);

  const refreshGroups = useCallback(async () => {
    if (!user?.token) return;
    const groups = await api.getMyGroups(user.token);
    setCustomGroups(groups);
  }, [user?.token, setCustomGroups]);

  const refreshMutes = useCallback(async () => {
    if (!user?.token) return;
    const mutes = await api.getMutes(user.token);
    applyMutes(mutes);
  }, [user?.token, applyMutes]);

  const resolveUserByName = useCallback(
    async (username: string): Promise<UserDto | null> => {
      const local = users.find((u) => u.username.toLowerCase() === username.toLowerCase());
      if (local) return local;
      if (!user?.token) return null;
      const all = await api.getUsers(user.token);
      return all.find((u) => u.username.toLowerCase() === username.toLowerCase()) ?? null;
    },
    [users, user?.token]
  );

  const executeActions = useCallback(
    async (actions: AiClientAction[]) => {
      for (const action of actions) {
        const payload = action.payload ?? {};

        switch (action.type) {
          case 'open_global':
            onSelectGlobal();
            break;
          case 'open_user': {
            const userId = payload.userId as string;
            const u = findUserById(users, userId);
            if (u) onSelectUser(u);
            break;
          }
          case 'open_user_by_name': {
            const u = await resolveUserByName(payload.username as string);
            if (u) onSelectUser(u);
            break;
          }
          case 'open_group': {
            const g = findGroupById(customGroups, payload.groupId as string);
            if (g) onSelectGroup(g);
            break;
          }
          case 'open_group_by_name': {
            const name = (payload.groupName as string)?.toLowerCase();
            const g = customGroups.find((gr) => gr.name.toLowerCase() === name);
            if (g) onSelectGroup(g);
            else await refreshGroups();
            break;
          }
          case 'group_created': {
            await refreshGroups();
            const g = useChatStore.getState().customGroups.find(
              (gr) => gr.id === payload.groupId
            );
            if (g) onSelectGroup(g);
            break;
          }
          case 'groups_refresh':
            await refreshGroups();
            break;
          case 'mutes_refresh':
            await refreshMutes();
            break;
          case 'dm_sent': {
            const recipientId = payload.recipientId as string;
            if (!recipientId) break;
            if (user?.token) {
              const msgs = await api.getDirectMessages(user.token, recipientId);
              setDirectMessages(recipientId, msgs);
            }
            let target = findUserById(users, recipientId);
            if (!target && user?.token) {
              const all = await api.getUsers(user.token);
              target = all.find((x) => x.id === recipientId);
            }
            if (target) onSelectUser(target);
            break;
          }
          default:
            break;
        }
      }
    },
    [
      users,
      customGroups,
      onSelectUser,
      onSelectGroup,
      onSelectGlobal,
      resolveUserByName,
      refreshGroups,
      refreshMutes,
      setDirectMessages,
      user?.token,
    ]
  );

  const executeA2uiAction = useCallback(
    async (action: A2uiAction) => {
      if (!user?.token) return;

      switch (action.name) {
        case 'open_user': {
          const u = await resolveUserByName(action.payload?.username as string);
          if (u) onSelectUser(u);
          break;
        }
        case 'open_group': {
          const name = (action.payload?.groupName as string)?.toLowerCase();
          const g = customGroups.find((gr) => gr.name.toLowerCase() === name);
          if (g) onSelectGroup(g);
          break;
        }
        case 'create_group_confirm': {
          const name = action.payload?.name as string;
          const memberUsernames = (action.payload?.member_usernames as string[]) ?? [];
          const allUsers = await api.getUsers(user.token);
          const memberIds = memberUsernames
            .map((un) => allUsers.find((u) => u.username.toLowerCase() === un.toLowerCase())?.id)
            .filter(Boolean) as string[];
          const group = await api.createGroup(user.token, name, memberIds);
          addCustomGroup(group);
          onSelectGroup(group);
          break;
        }
        default:
          break;
      }
    },
    [user?.token, customGroups, resolveUserByName, onSelectUser, onSelectGroup, addCustomGroup]
  );

  return { executeActions, executeA2uiAction };
}
