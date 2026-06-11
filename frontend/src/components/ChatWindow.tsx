import { useEffect, useRef, useState, useCallback } from 'react';
import gsap from 'gsap';
import { useChatStore } from '../store/chatStore';
import { useAuthStore } from '../store/authStore';
import { MessageBubble } from './MessageBubble';
import { VoiceRecorder } from './VoiceRecorder';
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

interface Props {
  sendMessage: (
    content: string | undefined,
    messageType: string,
    recipientId?: string,
    attachmentUrl?: string,
    attachmentName?: string
  ) => Promise<void>;
  sendTyping: (recipientId: string | null, isTyping: boolean) => Promise<void>;
  deleteMessage: (messageId: string, forEveryone: boolean) => Promise<void>;
  onOpenSidebar: () => void;
  onLogout: () => void;
}

export function ChatWindow({ sendMessage, sendTyping, deleteMessage, onOpenSidebar, onLogout }: Props) {
  const user = useAuthStore((s) => s.user);
  const selectedUser = useChatStore((s) => s.selectedUser);
  const groupMessages = useChatStore((s) => s.groupMessages);
  const directMessages = useChatStore((s) => s.directMessages);
  const typingUsers = useChatStore((s) => s.typingUsers);
  const setDirectMessages = useChatStore((s) => s.setDirectMessages);

  const [text, setText] = useState('');
  const [uploading, setUploading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout>>();

  const messages = selectedUser
    ? directMessages[selectedUser.id] || []
    : groupMessages;

  const title = selectedUser ? selectedUser.username : 'Group Chat';
  const isOnline = selectedUser?.isOnline;
  const isGroup = !selectedUser;

  useEffect(() => {
    if (!user?.token || !selectedUser) return;
    api.getDirectMessages(user.token, selectedUser.id).then((msgs) => {
      setDirectMessages(selectedUser.id, msgs);
    });
  }, [selectedUser?.id, user?.token, setDirectMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  useEffect(() => {
    if (!headerRef.current) return;
    gsap.fromTo(headerRef.current, { y: -12, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35 });
  }, [selectedUser?.id]);

  const handleTyping = useCallback(
    (value: string) => {
      setText(value);
      sendTyping(selectedUser?.id ?? null, true);
      clearTimeout(typingTimeout.current);
      typingTimeout.current = setTimeout(() => {
        sendTyping(selectedUser?.id ?? null, false);
      }, 1500);
    },
    [selectedUser?.id, sendTyping]
  );

  const handleSend = async () => {
    if (!text.trim()) return;
    await sendMessage(text.trim(), 'text', selectedUser?.id);
    setText('');
    sendTyping(selectedUser?.id ?? null, false);
  };

  const handleFileUpload = async (file: File) => {
    if (!user?.token) return;
    setUploading(true);
    try {
      const { url, name, contentType } = await api.uploadFile(user.token, file);
      let type = 'file';
      if (contentType.startsWith('image/')) type = 'image';
      else if (contentType.startsWith('audio/')) type = 'audio';
      await sendMessage(undefined, type, selectedUser?.id, url, name);
    } finally {
      setUploading(false);
    }
  };

  const handleVoice = async (blob: Blob) => {
    if (!user?.token) return;
    setUploading(true);
    try {
      const file = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });
      const { url, name } = await api.uploadFile(user.token, file);
      await sendMessage(undefined, 'audio', selectedUser?.id, url, name);
    } finally {
      setUploading(false);
    }
  };

  return (
    <main className="chat-window">
      <header className="chat-header" ref={headerRef}>
        <div className="chat-header-accent" />
        <div className="chat-header-inner">
          <div className="chat-header-left">
            <button type="button" className="menu-btn" onClick={onOpenSidebar} aria-label="Open menu">
              <span /><span /><span />
            </button>

            <div className={`header-avatar ${isGroup ? 'group' : ''} ${isOnline ? 'online' : ''}`}>
              {isGroup ? (
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
              {isGroup ? (
                <span className="status-badge group-badge">
                  <span className="badge-icon">⏱</span>
                  Resets every 24h
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
            <button type="button" className="btn-logout" onClick={onLogout}>
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
    </main>
  );
}
