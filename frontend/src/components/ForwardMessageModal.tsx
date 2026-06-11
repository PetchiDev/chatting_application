import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { collectAllContacts, sameUserId, userFromRecentChat } from '../lib/users';
import type { GroupDto, MessageDto, UserDto } from '../types';
import * as api from '../lib/api';

interface Props {
  message: MessageDto;
  onClose: () => void;
  onForward: (recipientId?: string, groupId?: string) => void | Promise<void>;
}

function ForwardSelect<T extends { id: string; label: string; hint?: string }>({
  label,
  placeholder,
  options,
  value,
  onChange,
  emptyText,
  loading,
}: {
  label: string;
  placeholder: string;
  options: T[];
  value: string | null;
  onChange: (id: string | null) => void;
  emptyText: string;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => value && sameUserId(o.id, value));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, search]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    searchRef.current?.focus();
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="forward-field">
      <p className="modal-label">{label}</p>
      <div className="forward-select" ref={wrapRef}>
        <button
          type="button"
          className={`forward-select-trigger ${open ? 'open' : ''}`}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-haspopup="listbox"
        >
          <span className="forward-select-value">
            {selected ? selected.label : placeholder}
          </span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>

        {open && (
          <div className="forward-select-dropdown">
            <div className="member-multiselect-search-wrap">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                <path d="M20 20l-3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <input
                ref={searchRef}
                type="search"
                className="member-multiselect-search"
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="forward-select-options" role="listbox">
              {loading && <p className="modal-empty-hint">Loading…</p>}
              {!loading && options.length === 0 && (
                <p className="modal-empty-hint">{emptyText}</p>
              )}
              {!loading && options.length > 0 && filtered.length === 0 && (
                <p className="modal-empty-hint">No matches found.</p>
              )}
              {filtered.map((opt) => {
                const isSelected = value ? sameUserId(value, opt.id) : false;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`forward-select-option ${isSelected ? 'selected' : ''}`}
                    onClick={() => {
                      onChange(opt.id);
                      setOpen(false);
                      setSearch('');
                    }}
                  >
                    <span className="forward-option-icon" aria-hidden="true">
                      {opt.hint === 'group' ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" />
                          <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2" />
                          <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="2" />
                        </svg>
                      ) : (
                        opt.label[0]?.toUpperCase()
                      )}
                    </span>
                    <span className="forward-option-label">{opt.label}</span>
                    {isSelected && (
                      <svg className="forward-option-check" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M5 12l5 5L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function ForwardMessageModal({ message, onClose, onForward }: Props) {
  const user = useAuthStore((s) => s.user);
  const customGroups = useChatStore((s) => s.customGroups);
  const [allUsers, setAllUsers] = useState<UserDto[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user?.token) return;
    let cancelled = false;
    setLoadingUsers(true);

    const { users: storeUsers, recentChats } = useChatStore.getState();
    api
      .getUsers(user.token)
      .then((list) => {
        if (!cancelled) {
          setAllUsers(
            collectAllContacts(user.userId, list, storeUsers, recentChats.map(userFromRecentChat))
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAllUsers(
            collectAllContacts(user.userId, [], storeUsers, recentChats.map(userFromRecentChat))
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingUsers(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.token, user?.userId]);

  const groupOptions = useMemo(
    () => customGroups.map((g: GroupDto) => ({ id: g.id, label: g.name, hint: 'group' as const })),
    [customGroups]
  );

  const userOptions = useMemo(
    () => allUsers.map((u) => ({ id: u.id, label: u.username, hint: 'user' as const })),
    [allUsers]
  );

  const canForward = Boolean(selectedGroupId || selectedUserId);

  const handleGroupChange = (id: string | null) => {
    setSelectedGroupId(id);
    if (id) setSelectedUserId(null);
  };

  const handleUserChange = (id: string | null) => {
    setSelectedUserId(id);
    if (id) setSelectedGroupId(null);
  };

  const handleSubmit = async () => {
    if (!canForward) return;
    setSubmitting(true);
    try {
      await onForward(selectedUserId ?? undefined, selectedGroupId ?? undefined);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal forward-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Forward message</h2>

        <div className="forward-modal-body">
          <p className="forward-preview">
            {message.content || message.attachmentName || 'Attachment'}
          </p>

          <ForwardSelect
            label="Group"
            placeholder="Select a group…"
            options={groupOptions}
            value={selectedGroupId}
            onChange={handleGroupChange}
            emptyText="No groups available."
          />

          <ForwardSelect
            label="User"
            placeholder="Select a user…"
            options={userOptions}
            value={selectedUserId}
            onChange={handleUserChange}
            emptyText="No users available."
            loading={loadingUsers}
          />
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!canForward || submitting}
            onClick={handleSubmit}
          >
            {submitting ? 'Forwarding…' : 'Forward'}
          </button>
        </div>
      </div>
    </div>
  );
}
