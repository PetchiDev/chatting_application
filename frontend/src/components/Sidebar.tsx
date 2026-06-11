import { useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import { useChatStore } from '../store/chatStore';
import { useAuthStore } from '../store/authStore';
import { collectOnlineUsers, findUserById } from '../lib/users';
import type { GroupDto, RecentChatDto, UserDto } from '../types';

function LogoutIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="16 17 21 12 16 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="21" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function formatTime(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSelectGlobal: () => void;
  onSelectUser: (user: UserDto) => void;
  onSelectGroup: (group: GroupDto) => void;
  onCreateGroup: () => void;
  onLeaveGroup: (groupId: string) => void;
  onOpenProfile: () => void;
  onLogout: () => void;
}

function UserListItem({
  user,
  active,
  subtitle,
  onClick,
}: {
  user: UserDto;
  active: boolean;
  subtitle?: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`user-item ${active ? 'active' : ''}`} onClick={onClick}>
      <div className="user-item-accent" />
      <div className={`user-avatar ${user.isOnline ? 'online' : ''}`}>
        {user.profilePictureUrl ? (
          <img src={user.profilePictureUrl} alt="" />
        ) : (
          user.username[0]?.toUpperCase()
        )}
      </div>
      <div className="user-info">
        <span className="user-name">
          {user.username}
          {user.isGuest && <span className="guest-badge">Guest</span>}
        </span>
        <span className={`user-status ${user.isOnline ? 'is-online' : ''}`}>
          {subtitle ?? (user.isOnline ? '● Online now' : 'Offline')}
        </span>
      </div>
      <span className="user-chevron">›</span>
    </button>
  );
}

export function Sidebar({
  open,
  onClose,
  onSelectGlobal,
  onSelectUser,
  onSelectGroup,
  onCreateGroup,
  onLeaveGroup,
  onOpenProfile,
  onLogout,
}: Props) {
  const users = useChatStore((s) => s.users);
  const recentChats = useChatStore((s) => s.recentChats);
  const customGroups = useChatStore((s) => s.customGroups);
  const selectedUser = useChatStore((s) => s.selectedUser);
  const selectedGroup = useChatStore((s) => s.selectedGroup);
  const currentUser = useAuthStore((s) => s.user);
  const listRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');

  const onlineUsers = useMemo(
    () => collectOnlineUsers(users, recentChats),
    [users, recentChats]
  );

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return users.filter((u) => u.username.toLowerCase().includes(q));
  }, [search, users]);

  const resolveUser = (chat: RecentChatDto): UserDto => {
    const live = findUserById(users, chat.userId);
    return {
      id: chat.userId,
      username: live?.username ?? chat.username,
      profilePictureUrl: live?.profilePictureUrl ?? chat.profilePictureUrl,
      isGuest: live?.isGuest ?? chat.isGuest,
      isOnline: live?.isOnline || chat.isOnline,
    };
  };

  useEffect(() => {
    if (!listRef.current) return;
    gsap.fromTo(
      listRef.current.children,
      { opacity: 0, x: -16 },
      { opacity: 1, x: 0, duration: 0.35, stagger: 0.04, ease: 'power2.out' }
    );
  }, [onlineUsers.length, recentChats.length, searchResults.length]);

  return (
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <div className="sidebar-top">
        <div className="sidebar-brand">
          <img src="/kryptos-logo.png" alt="Kryptos" className="sidebar-logo" />
          <button type="button" className="sidebar-close" onClick={onClose} aria-label="Close menu">
            ✕
          </button>
        </div>

        <div className="sidebar-stats">
          <div className="stat-pill">
            <span className="stat-dot pulse" />
            {onlineUsers.length} online
          </div>
          <div className="stat-pill muted">{users.length} contacts</div>
        </div>

        <div className="sidebar-search">
          <svg className="sidebar-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            className="sidebar-search-input"
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search users"
          />
          {search && (
            <button
              type="button"
              className="sidebar-search-clear"
              onClick={() => setSearch('')}
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="sidebar-body">
      {search.trim() && (
        <div className="sidebar-section">
          <p className="section-label">
            <span className="section-icon">🔍</span>
            Search Results
          </p>
          <div className="user-list compact">
            {searchResults.length === 0 && (
              <p className="sidebar-empty">No users found</p>
            )}
            {searchResults.map((user) => (
              <UserListItem
                key={user.id}
                user={user}
                active={selectedUser?.id === user.id}
                onClick={() => {
                  onSelectUser(user);
                  setSearch('');
                }}
              />
            ))}
          </div>
        </div>
      )}

      {!search.trim() && (
        <>
          <div className="sidebar-section">
            <p className="section-label">
              <span className="section-icon">💬</span>
              Conversations
            </p>

            <button
              type="button"
              className={`user-item featured ${!selectedUser && !selectedGroup ? 'active' : ''}`}
              onClick={onSelectGlobal}
            >
              <div className="user-item-accent" />
              <div className="user-avatar global">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
              <div className="user-info">
                <span className="user-name">Group Chat</span>
                <span className="user-status">Everyone · Public room</span>
              </div>
              <span className="user-chevron">›</span>
            </button>

            <div className="sidebar-group-actions">
              <button type="button" className="btn-create-group" onClick={onCreateGroup}>
                + New Group
              </button>
            </div>

            {customGroups.length > 0 && (
              <>
                <p className="section-sublabel">My Groups</p>
                <div className="user-list compact">
                  {customGroups.map((group) => (
                    <div key={group.id} className="group-item-row">
                      <button
                        type="button"
                        className={`user-item ${selectedGroup?.id === group.id ? 'active' : ''}`}
                        onClick={() => onSelectGroup(group)}
                      >
                        <div className="user-item-accent" />
                        <div className="user-avatar global">
                          {group.name[0]?.toUpperCase()}
                        </div>
                        <div className="user-info">
                          <span className="user-name">
                            {group.name}
                            {group.isMuted && (
                              <span className="mute-indicator" title="Muted">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                  <path d="M13.73 21a2 2 0 0 1-3.46 0M18 8a6 6 0 0 0-9.33-5.2M6 8c0 7-3 9-3 9h11.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                  <line x1="2" y1="2" x2="22" y2="22" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                                </svg>
                              </span>
                            )}
                          </span>
                          <span className="user-status">{group.memberCount} members</span>
                        </div>
                        <span className="user-chevron">›</span>
                      </button>
                      <button
                        type="button"
                        className="group-leave-btn"
                        title="Leave group"
                        onClick={(e) => {
                          e.stopPropagation();
                          onLeaveGroup(group.id);
                        }}
                      >
                        Leave
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}

            {recentChats.length > 0 && (
              <>
                <p className="section-sublabel">Recent</p>
                <div className="user-list compact">
                  {recentChats.map((chat) => {
                    const user = resolveUser(chat);
                    return (
                      <UserListItem
                        key={chat.userId}
                        user={user}
                        active={selectedUser?.id === chat.userId}
                        subtitle={chat.lastMessagePreview || formatTime(chat.lastMessageAt)}
                        onClick={() => onSelectUser(user)}
                      />
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <div className="sidebar-section">
            <p className="section-label">
              <span className="section-icon">👥</span>
              Active Users
            </p>

            <div className="user-list" ref={listRef}>
              {onlineUsers.length === 0 && (
                <p className="sidebar-empty">No users online right now</p>
              )}
              {onlineUsers.map((user) => (
                <UserListItem
                  key={user.id}
                  user={user}
                  active={selectedUser?.id === user.id}
                  onClick={() => onSelectUser(user)}
                />
              ))}
            </div>
          </div>
        </>
      )}
      </div>

      <div className="sidebar-footer">
        <button type="button" className="profile-card" onClick={onOpenProfile}>
          <div className="user-avatar small ring">
            {currentUser?.profilePictureUrl ? (
              <img src={currentUser.profilePictureUrl} alt="" />
            ) : (
              currentUser?.username[0]?.toUpperCase()
            )}
          </div>
          <div className="profile-card-info">
            <span className="profile-card-name">{currentUser?.username}</span>
            <span className="profile-card-hint">Edit profile</span>
          </div>
          <span className="profile-edit-icon">✎</span>
        </button>
        <button type="button" className="btn-logout sidebar-logout" onClick={onLogout}>
          <LogoutIcon />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  );
}
