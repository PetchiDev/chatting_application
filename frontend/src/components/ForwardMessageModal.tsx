import { useChatStore } from '../store/chatStore';
import type { MessageDto } from '../types';

interface Props {
  message: MessageDto;
  onClose: () => void;
  onForward: (recipientId?: string, groupId?: string) => void;
}

export function ForwardMessageModal({ message, onClose, onForward }: Props) {
  const users = useChatStore((s) => s.users);
  const customGroups = useChatStore((s) => s.customGroups);
  const recentChats = useChatStore((s) => s.recentChats);

  const recentUserIds = new Set(recentChats.map((c) => c.userId));
  const sortedUsers = [
    ...users.filter((u) => recentUserIds.has(u.id)),
    ...users.filter((u) => !recentUserIds.has(u.id)),
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal forward-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Forward message</h2>
        <p className="forward-preview">
          {message.content || message.attachmentName || 'Attachment'}
        </p>

        {customGroups.length > 0 && (
          <>
            <p className="modal-label">Groups</p>
            <div className="forward-list">
              {customGroups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className="forward-item"
                  onClick={() => onForward(undefined, g.id)}
                >
                  <span className="forward-icon">👥</span>
                  {g.name}
                </button>
              ))}
            </div>
          </>
        )}

        <p className="modal-label">Users</p>
        <div className="forward-list">
          {sortedUsers.map((u) => (
            <button
              key={u.id}
              type="button"
              className="forward-item"
              onClick={() => onForward(u.id)}
            >
              <span className="forward-icon">{u.username[0]?.toUpperCase()}</span>
              {u.username}
            </button>
          ))}
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
