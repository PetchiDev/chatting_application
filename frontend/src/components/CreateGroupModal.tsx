import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import * as api from '../lib/api';

interface Props {
  onClose: () => void;
  onCreated: (groupId: string) => void;
}

export function CreateGroupModal({ onClose, onCreated }: Props) {
  const user = useAuthStore((s) => s.user);
  const users = useChatStore((s) => s.users);
  const addCustomGroup = useChatStore((s) => s.addCustomGroup);
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => u.username.toLowerCase().includes(q));
  }, [users, search]);

  const selectedUsers = useMemo(
    () => users.filter((u) => selected.has(u.id)),
    [users, selected]
  );

  useEffect(() => {
    if (!dropdownOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDropdownOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    searchRef.current?.focus();
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [dropdownOpen]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const removeMember = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const handleCreate = async () => {
    if (!user?.token || !name.trim()) return;
    setLoading(true);
    setError('');
    try {
      const group = await api.createGroup(user.token, name.trim(), [...selected]);
      addCustomGroup(group);
      onCreated(group.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create group');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal create-group-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Create Group</h2>

        <div className="create-group-modal-body">
          <label className="form-label">
            Group name
            <input
              type="text"
              placeholder="Enter group name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
            />
          </label>

          <p className="modal-label">Add members</p>
          <div className="member-multiselect" ref={dropdownRef}>
          <button
            type="button"
            className={`member-multiselect-trigger ${dropdownOpen ? 'open' : ''}`}
            onClick={() => setDropdownOpen((o) => !o)}
            aria-expanded={dropdownOpen}
            aria-haspopup="listbox"
          >
            <span className="member-multiselect-placeholder">
              {selected.size > 0
                ? `${selected.size} member${selected.size === 1 ? '' : 's'} selected`
                : 'Search and select members…'}
            </span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>

          {selectedUsers.length > 0 && (
            <div className="member-chips">
              {selectedUsers.map((u) => (
                <span key={u.id} className="member-chip">
                  {u.username}
                  <button
                    type="button"
                    className="member-chip-remove"
                    onClick={() => removeMember(u.id)}
                    aria-label={`Remove ${u.username}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          {dropdownOpen && (
            <div className="member-multiselect-dropdown">
              <div className="member-multiselect-search-wrap">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                  <path d="M20 20l-3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <input
                  ref={searchRef}
                  type="search"
                  className="member-multiselect-search"
                  placeholder="Search users…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="member-multiselect-options" role="listbox" aria-multiselectable="true">
                {users.length === 0 && (
                  <p className="modal-empty-hint">No other users available yet.</p>
                )}
                {users.length > 0 && filteredUsers.length === 0 && (
                  <p className="modal-empty-hint">No users match your search.</p>
                )}
                {filteredUsers.map((u) => {
                  const isSelected = selected.has(u.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      className={`member-multiselect-option ${isSelected ? 'selected' : ''}`}
                      onClick={() => toggle(u.id)}
                    >
                      <span className="member-option-check" aria-hidden="true">
                        {isSelected && (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <path d="M5 12l5 5L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </span>
                      <span className="member-option-name">{u.username}</span>
                      {u.isGuest && <span className="guest-badge">GUEST</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          </div>

          {error && <p className="modal-error">{error}</p>}
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={loading || !name.trim()}
            onClick={handleCreate}
          >
            {loading ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
