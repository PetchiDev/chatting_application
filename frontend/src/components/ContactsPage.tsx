import { useMemo } from 'react';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import type { UserDto } from '../types';

interface Props {
  onBack: () => void;
  onSelectUser: (user: UserDto) => void;
}

export function ContactsPage({ onBack, onSelectUser }: Props) {
  const currentUserId = useAuthStore((s) => s.user?.userId);
  const users = useChatStore((s) => s.users);

  const contacts = useMemo(
    () =>
      [...users]
        .filter((u) => u.id !== currentUserId)
        .sort((a, b) => a.username.localeCompare(b.username)),
    [users, currentUserId]
  );

  const onlineCount = contacts.filter((u) => u.isOnline).length;

  return (
    <div className="contacts-page">
      <header className="contacts-header">
        <button type="button" className="contacts-back" onClick={onBack} aria-label="Back to chat">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="contacts-header-text">
          <h1>Contacts</h1>
          <p>{contacts.length} people · {onlineCount} online</p>
        </div>
      </header>

      <div className="contacts-grid">
        {contacts.length === 0 && (
          <p className="contacts-empty">No contacts yet</p>
        )}
        {contacts.map((user) => (
          <button
            key={user.id}
            type="button"
            className="contact-card"
            onClick={() => onSelectUser(user)}
          >
            <div className={`contact-card-avatar ${user.isOnline ? 'online' : ''}`}>
              {user.profilePictureUrl ? (
                <img src={user.profilePictureUrl} alt="" />
              ) : (
                <span className="contact-card-placeholder">{user.username[0]?.toUpperCase()}</span>
              )}
            </div>
            <span className="contact-card-name">{user.username}</span>
            {user.isGuest && <span className="contact-card-guest">Guest</span>}
            <span className={`contact-card-status ${user.isOnline ? 'is-online' : ''}`}>
              <span className="contact-status-dot" />
              {user.isOnline ? 'Online' : 'Offline'}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
