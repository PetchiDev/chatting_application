import { useCallback, useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { sameUserId } from '../lib/users';
import type { GroupDto, GroupMemberDto } from '../types';
import * as api from '../lib/api';

interface Props {
  group: GroupDto;
  onClose: () => void;
}

export function GroupMembersModal({ group, onClose }: Props) {
  const user = useAuthStore((s) => s.user);
  const updateCustomGroup = useChatStore((s) => s.updateCustomGroup);

  const [members, setMembers] = useState<GroupMemberDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [removingId, setRemovingId] = useState<string | null>(null);

  const isAdmin = members.some(
    (m) => m.role === 'owner' && user && sameUserId(m.userId, user.userId)
  );

  const loadMembers = useCallback(async () => {
    if (!user?.token) return;
    setLoading(true);
    setError('');
    try {
      const list = await api.getGroupMembers(user.token, group.id);
      setMembers(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load members');
    } finally {
      setLoading(false);
    }
  }, [group.id, user?.token]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const handleRemove = async (memberId: string) => {
    if (!user?.token || removingId) return;
    if (!window.confirm('Remove this member from the group?')) return;

    setRemovingId(memberId);
    setError('');
    try {
      await api.removeGroupMember(user.token, group.id, memberId);
      const next = members.filter((m) => !sameUserId(m.userId, memberId));
      setMembers(next);
      updateCustomGroup({ ...group, memberCount: next.length });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove member');
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        className="modal group-members-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="group-members-title"
        aria-modal="true"
      >
        <div className="group-members-header">
          <h2 id="group-members-title">{group.name}</h2>
          <p className="group-members-subtitle">
            {members.length || group.memberCount} member{(members.length || group.memberCount) !== 1 ? 's' : ''}
          </p>
        </div>

        {error && <p className="modal-error">{error}</p>}

        <div className="group-members-list" aria-busy={loading}>
          {loading ? (
            <p className="group-members-empty">Loading members…</p>
          ) : members.length === 0 ? (
            <p className="group-members-empty">No members found</p>
          ) : (
            members.map((member) => {
              const isSelf = user && sameUserId(member.userId, user.userId);
              const canRemove = isAdmin && member.role !== 'owner' && !isSelf;

              return (
                <div key={member.userId} className="group-member-row">
                  <div className={`group-member-avatar ${member.isOnline ? 'online' : ''}`}>
                    {member.profilePictureUrl ? (
                      <img src={member.profilePictureUrl} alt="" />
                    ) : (
                      member.username[0]?.toUpperCase()
                    )}
                  </div>

                  <div className="group-member-info">
                    <div className="group-member-name-row">
                      <span className="group-member-name">
                        {member.username}
                        {isSelf ? ' (You)' : ''}
                      </span>
                      {member.isGuest && <span className="guest-badge">Guest</span>}
                      {member.role === 'owner' && <span className="admin-badge">Admin</span>}
                    </div>
                    <span className={`group-member-status ${member.isOnline ? 'online' : ''}`}>
                      {member.isOnline ? 'Online' : 'Offline'}
                    </span>
                  </div>

                  {canRemove && (
                    <button
                      type="button"
                      className="group-member-remove"
                      onClick={() => void handleRemove(member.userId)}
                      disabled={removingId === member.userId}
                      aria-label={`Remove ${member.username}`}
                    >
                      {removingId === member.userId ? '…' : 'Remove'}
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
