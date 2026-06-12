import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import type { NotificationDto } from '../types';
import * as api from '../lib/api';

interface Props {
  onNavigate: (n: NotificationDto) => void;
}

function DeleteIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function NotificationPanel({ onNavigate }: Props) {
  const user = useAuthStore((s) => s.user);
  const notifications = useChatStore((s) => s.notifications);
  const unreadCount = useChatStore((s) => s.unreadCount);
  const markRead = useChatStore((s) => s.markNotificationsRead);
  const removeNotification = useChatStore((s) => s.removeNotification);
  const setNotifications = useChatStore((s) => s.setNotifications);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const visibleNotifications = useMemo(
    () => notifications.filter((n) => !n.isRead),
    [notifications]
  );

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const handleOpen = async () => {
    setOpen((o) => !o);
    if (!open && user?.token) {
      try {
        const data = await api.getNotifications(user.token);
        setNotifications(data.items, data.unread);
      } catch {
        /* ignore */
      }
    }
  };

  const handleClick = async (n: NotificationDto) => {
    if (user?.token) {
      await api.markNotificationsRead(user.token, [n.id]).catch(() => {});
    }
    markRead([n.id]);
    setOpen(false);
    onNavigate(n);
  };

  const handleMarkAll = async () => {
    if (user?.token) await api.markNotificationsRead(user.token).catch(() => {});
    markRead();
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (user?.token) {
      await api.deleteNotification(user.token, id).catch(() => {});
    }
    removeNotification(id);
  };

  return (
    <div className="notification-wrap" ref={panelRef}>
      <button
        type="button"
        className={`header-icon-btn ${open ? 'active' : ''}`}
        onClick={handleOpen}
        aria-label="Notifications"
        aria-expanded={open}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {unreadCount > 0 && <span className="notif-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>

      {open && (
        <div className="notification-panel">
          <div className="notification-panel-header">
            <h3>Notifications</h3>
            {visibleNotifications.length > 0 && (
              <button type="button" className="link-btn" onClick={handleMarkAll}>
                Mark all read
              </button>
            )}
          </div>
          <div className="notification-list">
            {visibleNotifications.length === 0 && (
              <p className="notification-empty">No notifications yet</p>
            )}
            {visibleNotifications.map((n) => (
              <div key={n.id} className="notification-item-row">
                <button
                  type="button"
                  className="notification-item unread"
                  onClick={() => handleClick(n)}
                >
                  <span className="notif-title">{n.title}</span>
                  <span className="notif-body">{n.body}</span>
                  <span className="notif-time">
                    {new Date(n.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </button>
                <button
                  type="button"
                  className="notification-delete-btn"
                  onClick={(e) => handleDelete(e, n.id)}
                  aria-label="Delete notification"
                >
                  <DeleteIcon />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
