import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { useChatStore } from '../store/chatStore';
import { useAuthStore } from '../store/authStore';
import type { UserDto } from '../types';

function LogoutIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="16 17 21 12 16 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="21" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSelectUser: (user: UserDto | null) => void;
  onOpenProfile: () => void;
  onLogout: () => void;
}

export function Sidebar({ open, onClose, onSelectUser, onOpenProfile, onLogout }: Props) {
  const users = useChatStore((s) => s.users);
  const selectedUser = useChatStore((s) => s.selectedUser);
  const currentUser = useAuthStore((s) => s.user);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!listRef.current) return;
    gsap.fromTo(
      listRef.current.children,
      { opacity: 0, x: -16 },
      { opacity: 1, x: 0, duration: 0.35, stagger: 0.04, ease: 'power2.out' }
    );
  }, [users.length]);

  const onlineUsers = users.filter((u) => u.isOnline);

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
      </div>

      <div className="sidebar-section">
        <p className="section-label">
          <span className="section-icon">💬</span>
          Conversations
        </p>

        <button
          type="button"
          className={`user-item featured ${!selectedUser ? 'active' : ''}`}
          onClick={() => onSelectUser(null)}
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
      </div>

      <div className="sidebar-section flex-grow">
        <p className="section-label">
          <span className="section-icon">👥</span>
          Active Users
        </p>

        <div className="user-list" ref={listRef}>
          {users.length === 0 && (
            <p className="sidebar-empty">No other users yet</p>
          )}
          {users.map((user) => (
            <button
              key={user.id}
              type="button"
              className={`user-item ${selectedUser?.id === user.id ? 'active' : ''}`}
              onClick={() => onSelectUser(user)}
            >
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
                  {user.isOnline ? '● Online now' : 'Offline'}
                </span>
              </div>
              <span className="user-chevron">›</span>
            </button>
          ))}
        </div>
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
