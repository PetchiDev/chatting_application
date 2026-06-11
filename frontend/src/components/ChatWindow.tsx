import { useEffect, useRef, useState, useCallback } from 'react';
import gsap from 'gsap';
import { useChatStore } from '../store/chatStore';
import { normalizeUserId } from '../lib/users';
import { useAuthStore } from '../store/authStore';
import { MessageBubble } from './MessageBubble';
import { VoiceRecorder } from './VoiceRecorder';
import { NotificationPanel } from './NotificationPanel';
import { ForwardMessageModal } from './ForwardMessageModal';
import type { MessageDto, NotificationDto, SendMessageOptions } from '../types';
import * as api from '../lib/api';

function LogoutIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="16 17 21 12 16 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="21" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BellOnIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BellOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M13.73 21a2 2 0 0 1-3.46 0M18 8a6 6 0 0 0-9.33-5.2M6 8c0 7-3 9-3 9h11.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line x1="2" y1="2" x2="22" y2="22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

interface Props {
  sendMessage: (
    content: string | undefined,
    messageType: string,
    options?: SendMessageOptions
  ) => Promise<void>;
  sendTyping: (recipientId: string | null, isTyping: boolean, groupId?: string | null) => Promise<void>;
  deleteMessage: (messageId: string, forEveryone: boolean) => Promise<void>;
  forwardMessage: (messageId: string, recipientId?: string, groupId?: string) => Promise<void>;
  onStartCall: (type: 'audio' | 'video') => void;
  onOpenSidebar: () => void;
  onLogout: () => void;
  onNotificationNavigate: (n: NotificationDto) => void;
}

export function ChatWindow({
  sendMessage,
  sendTyping,
  deleteMessage,
  forwardMessage,
  onStartCall,
  onOpenSidebar,
  onLogout,
  onNotificationNavigate,
}: Props) {
  const user = useAuthStore((s) => s.user);
  const selectedUser = useChatStore((s) => s.selectedUser);
  const selectedGroup = useChatStore((s) => s.selectedGroup);
  const groupMessages = useChatStore((s) => s.groupMessages);
  const customGroupMessages = useChatStore((s) => s.customGroupMessages);
  const directMessages = useChatStore((s) => s.directMessages);
  const typingUsers = useChatStore((s) => s.typingUsers);
  const globalMuted = useChatStore((s) => s.globalMuted);
  const dmMutes = useChatStore((s) => s.dmMutes);
  const setDirectMessages = useChatStore((s) => s.setDirectMessages);
  const setCustomGroupMessages = useChatStore((s) => s.setCustomGroupMessages);
  const setGlobalMuted = useChatStore((s) => s.setGlobalMuted);
  const setDmMuted = useChatStore((s) => s.setDmMuted);
  const updateGroupMute = useChatStore((s) => s.updateGroupMute);

  const [text, setText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [forwardMsg, setForwardMsg] = useState<MessageDto | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout>>();

  const isGlobal = !selectedUser && !selectedGroup;
  const isCustomGroup = Boolean(selectedGroup);
  const isDm = Boolean(selectedUser);

  const messages = selectedUser
    ? directMessages[selectedUser.id] || []
    : selectedGroup
      ? customGroupMessages[selectedGroup.id] || []
      : groupMessages;

  const title = selectedUser?.username ?? selectedGroup?.name ?? 'Group Chat';
  const isOnline = selectedUser?.isOnline;
  const isMuted = selectedGroup
    ? selectedGroup.isMuted
    : isGlobal
      ? globalMuted
      : selectedUser
        ? Boolean(dmMutes[normalizeUserId(selectedUser.id)])
        : false;

  const messageOptions: SendMessageOptions = {
    recipientId: selectedUser?.id,
    groupId: selectedGroup?.id,
  };

  useEffect(() => {
    if (!user?.token || !selectedUser) return;
    api.getDirectMessages(user.token, selectedUser.id).then((msgs) => {
      setDirectMessages(selectedUser.id, msgs);
    });
  }, [selectedUser?.id, user?.token, setDirectMessages]);

  useEffect(() => {
    if (!user?.token || !selectedGroup) return;
    api.getCustomGroupMessages(user.token, selectedGroup.id).then((msgs) => {
      setCustomGroupMessages(selectedGroup.id, msgs);
    });
  }, [selectedGroup?.id, user?.token, setCustomGroupMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  useEffect(() => {
    if (!headerRef.current) return;
    gsap.fromTo(headerRef.current, { y: -12, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35 });
  }, [selectedUser?.id, selectedGroup?.id]);

  const handleTyping = useCallback(
    (value: string) => {
      setText(value);
      sendTyping(selectedUser?.id ?? null, true, selectedGroup?.id ?? null);
      clearTimeout(typingTimeout.current);
      typingTimeout.current = setTimeout(() => {
        sendTyping(selectedUser?.id ?? null, false, selectedGroup?.id ?? null);
      }, 1500);
    },
    [selectedUser?.id, selectedGroup?.id, sendTyping]
  );

  const handleSend = async () => {
    if (!text.trim()) return;
    await sendMessage(text.trim(), 'text', messageOptions);
    setText('');
    sendTyping(selectedUser?.id ?? null, false, selectedGroup?.id ?? null);
  };

  const handleFileUpload = async (file: File) => {
    if (!user?.token) return;
    setUploading(true);
    try {
      const { url, name, contentType } = await api.uploadFile(user.token, file);
      let type = 'file';
      if (contentType.startsWith('image/')) type = 'image';
      else if (contentType.startsWith('audio/')) type = 'audio';
      await sendMessage(undefined, type, { ...messageOptions, attachmentUrl: url, attachmentName: name });
    } finally {
      setUploading(false);
    }
  };

  const handleVoice = async (blob: Blob) => {
    if (!user?.token || blob.size === 0) return;
    setUploading(true);
    try {
      const mime = (blob.type || 'audio/webm').split(';')[0];
      const ext = mime.includes('mp4') ? 'm4a' : 'webm';
      const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: mime });
      const { url, name } = await api.uploadFile(user.token, file);
      await sendMessage(undefined, 'audio', { ...messageOptions, attachmentUrl: url, attachmentName: name });
    } catch (err) {
      console.error(err);
      alert('Failed to send voice message');
    } finally {
      setUploading(false);
    }
  };

  const handleToggleMute = async () => {
    if (!user?.token) return;
    const next = !isMuted;
    try {
      if (isGlobal) {
        await api.setMute(user.token, 'global', null, next);
        setGlobalMuted(next);
      } else if (selectedGroup) {
        await api.setMute(user.token, 'group', selectedGroup.id, next);
        updateGroupMute(selectedGroup.id, next);
      } else if (selectedUser) {
        await api.setMute(user.token, 'dm', selectedUser.id, next);
        setDmMuted(selectedUser.id, next);
      }
    } catch {
      alert('Could not update mute setting. Please try again.');
    }
  };

  const handleDownload = async (msg: MessageDto) => {
    if (!user?.token) return;
    try {
      await api.downloadAttachment(user.token, msg.id, msg.attachmentName || 'attachment');
    } catch {
      alert('Download failed');
    }
  };

  const handleForward = async (recipientId?: string, groupId?: string) => {
    if (!forwardMsg) return;
    await forwardMessage(forwardMsg.id, recipientId, groupId);
    setForwardMsg(null);
  };

  const canCall = isDm || isCustomGroup;

  return (
    <main className="chat-window">
      <header className="chat-header" ref={headerRef}>
        <div className="chat-header-accent" />
        <div className="chat-header-inner">
          <div className="chat-header-left">
            <button type="button" className="menu-btn" onClick={onOpenSidebar} aria-label="Open menu">
              <span /><span /><span />
            </button>

            <div className={`header-avatar ${isGlobal || isCustomGroup ? 'group' : ''} ${isOnline ? 'online' : ''}`}>
              {isGlobal || isCustomGroup ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              ) : selectedUser?.profilePictureUrl ? (
                <img src={selectedUser.profilePictureUrl} alt="" />
              ) : (
                title[0]?.toUpperCase()
              )}
            </div>

            <div className="chat-header-info">
              <h1>{title}</h1>
              {isGlobal ? (
                <span className="status-badge group-badge">
                  <span className="badge-icon">⏱</span>
                  Resets every 24h
                </span>
              ) : isCustomGroup ? (
                <span className="status-badge group-badge">
                  {selectedGroup?.memberCount} members
                </span>
              ) : (
                <span className={`status-badge ${isOnline ? 'online' : 'offline'}`}>
                  <span className={`status-dot ${isOnline ? 'online' : ''}`} />
                  {isOnline ? 'Online' : 'Offline'}
                </span>
              )}
            </div>
          </div>

          <div className="chat-header-actions">
            {canCall && (
              <>
                <button type="button" className="header-icon-btn" onClick={() => onStartCall('audio')} title="Audio call" aria-label="Audio call">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" stroke="currentColor" strokeWidth="2"/></svg>
                </button>
                <button type="button" className="header-icon-btn" onClick={() => onStartCall('video')} title="Video call" aria-label="Video call">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><polygon points="23 7 16 12 23 17 23 7" stroke="currentColor" strokeWidth="2"/><rect x="1" y="5" width="15" height="14" rx="2" stroke="currentColor" strokeWidth="2"/></svg>
                </button>
              </>
            )}
            <button
              type="button"
              className={`header-icon-btn mute-toggle-btn ${isMuted ? 'is-muted' : ''}`}
              onClick={handleToggleMute}
              title={isMuted ? 'Unmute notifications' : 'Mute notifications'}
              aria-label={isMuted ? 'Unmute notifications' : 'Mute notifications'}
              aria-pressed={isMuted}
            >
              {isMuted ? <BellOffIcon /> : <BellOnIcon />}
            </button>
            <NotificationPanel onNavigate={onNotificationNavigate} />
            <button type="button" className="btn-logout header-signout" onClick={onLogout}>
              <LogoutIcon />
              <span className="logout-label">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <div className="messages-container">
        {messages.length === 0 && (
          <div className="empty-chat">
            <div className="empty-chat-icon">💬</div>
            <p>No messages yet</p>
            <span>Say hello and start the conversation!</span>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isOwn={msg.senderId === user?.userId}
            onDelete={deleteMessage}
            onForward={(m) => setForwardMsg(m)}
            onDownload={handleDownload}
          />
        ))}
        {typingUsers.length > 0 && (
          <div className="typing-indicator">
            <span className="typing-dots">
              <span /><span /><span />
            </span>
            {typingUsers.join(', ')} typing...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <footer className="chat-input-area">
        <div className="input-toolbar">
          <label className="tool-btn attach-btn" title="Attach file">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <input
              type="file"
              hidden
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file);
                e.target.value = '';
              }}
            />
          </label>

          <VoiceRecorder onRecorded={handleVoice} disabled={uploading} />
        </div>

        <input
          type="text"
          className="chat-input"
          placeholder="Type a message..."
          value={text}
          onChange={(e) => handleTyping(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          disabled={uploading}
        />

        <button type="button" className="send-btn" onClick={handleSend} disabled={uploading || !text.trim()}>
          <span className="send-btn-text">Send</span>
          <svg className="send-btn-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <line x1="22" y1="2" x2="11" y2="13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </footer>

      {forwardMsg && (
        <ForwardMessageModal
          message={forwardMsg}
          onClose={() => setForwardMsg(null)}
          onForward={handleForward}
        />
      )}
    </main>
  );
}
