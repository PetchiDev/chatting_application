import { useState } from 'react';
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

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
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
        <div className="modal-user-list">
          {users.length === 0 && (
            <p className="modal-empty-hint">No other users available yet.</p>
          )}
          {users.map((u) => (
            <label key={u.id} className="modal-check-item">
              <input
                type="checkbox"
                checked={selected.has(u.id)}
                onChange={() => toggle(u.id)}
              />
              <span>{u.username}</span>
            </label>
          ))}
        </div>
        {error && <p className="modal-error">{error}</p>}
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
