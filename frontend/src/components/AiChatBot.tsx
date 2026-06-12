import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuthStore } from '../store/authStore';
import * as api from '../lib/api';
import type { AiChatMessage, AiClientAction, A2uiAction } from '../types/ai';
import { A2UIRenderer } from './A2UIRenderer';
import { AiMarkdown } from './AiMarkdown';

function RobotAvatar({ small }: { small?: boolean }) {
  return (
    <div className={`ai-bot-avatar ${small ? 'small' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 64 64" fill="none">
        <rect x="14" y="18" width="36" height="32" rx="10" fill="#E8F0FE" stroke="#1E4D8C" strokeWidth="2" />
        <circle cx="26" cy="34" r="5" fill="#3B82F6" />
        <circle cx="38" cy="34" r="5" fill="#3B82F6" />
        <path d="M28 44h8" stroke="#1E4D8C" strokeWidth="2" strokeLinecap="round" />
        <path d="M32 10v8" stroke="#1E4D8C" strokeWidth="2" strokeLinecap="round" />
        <circle cx="32" cy="8" r="3" fill="#60A5FA" />
        <rect x="8" y="28" width="6" height="14" rx="3" fill="#BFDBFE" />
        <rect x="50" y="28" width="6" height="14" rx="3" fill="#BFDBFE" />
      </svg>
    </div>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
  onAction: (actions: AiClientAction[]) => void | Promise<void>;
  onA2uiAction: (action: A2uiAction) => void | Promise<void>;
}

export function AiChatBot({ open, onClose, onAction, onA2uiAction }: Props) {
  const user = useAuthStore((s) => s.user);
  const [messages, setMessages] = useState<AiChatMessage[]>([
    {
      role: 'assistant',
      content: 'Vanakkam! I\'m your Kryptos AI Assistant — ask me anything like ChatGPT (companies, general knowledge, Tamil/English) or tell me to send messages, create groups, find users, and more.',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && !minimized) {
      inputRef.current?.focus();
    }
  }, [open, minimized]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const send = async (text: string) => {
    if (!user?.token || !text.trim() || loading) return;

    const userMsg: AiChatMessage = { role: 'user', content: text.trim() };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');
    setLoading(true);

    try {
      const history = nextMessages.map((m) => ({ role: m.role, content: m.content }));
      const res = await api.sendAiChat(user.token, history);

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: res.reply,
          a2ui: res.a2ui,
        },
      ]);

      if (res.actions?.length) {
        await onAction(res.actions);
      }
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: e instanceof Error ? e.message : 'Something went wrong. Please try again.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return createPortal(
    <>
      <div className="ai-chat-backdrop" onClick={onClose} aria-hidden="true" />
      <div className={`ai-chat-widget ${minimized ? 'minimized' : ''}`} role="dialog" aria-label="AI Assistant">
      <header className="ai-chat-header">
        <div className="ai-chat-header-left">
          <RobotAvatar small />
          <div>
            <strong>AI Assistant</strong>
            <span className="ai-chat-status">Online</span>
            <p className="ai-chat-greeting">How can I help you today?</p>
          </div>
        </div>
        <div className="ai-chat-header-actions">
          <button
            type="button"
            className="ai-chat-icon-btn"
            onClick={() => setMinimized((v) => !v)}
            aria-label={minimized ? 'Expand' : 'Minimize'}
          >
            {minimized ? '□' : '−'}
          </button>
          <button type="button" className="ai-chat-icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
      </header>

      {!minimized && (
        <>
          <div className="ai-chat-body" ref={listRef}>
            <div className="ai-chat-hero">
              <RobotAvatar />
              <div className="ai-chat-hologram" aria-hidden="true" />
            </div>

            <div className="ai-chat-messages">
              {messages.map((msg, i) => (
                <div key={i} className={`ai-chat-bubble-wrap ${msg.role}`}>
                  {msg.role === 'assistant' && <RobotAvatar small />}
                  <div className={`ai-chat-bubble ${msg.role}`}>
                    {msg.role === 'assistant' ? (
                      <AiMarkdown content={msg.content} />
                    ) : (
                      <p className="ai-chat-plain">{msg.content}</p>
                    )}
                    {msg.a2ui && (
                      <A2UIRenderer surface={msg.a2ui} onAction={onA2uiAction} />
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="ai-chat-bubble-wrap assistant">
                  <RobotAvatar small />
                  <div className="ai-chat-bubble assistant typing">
                    <span /><span /><span />
                  </div>
                </div>
              )}
            </div>
          </div>

          <footer className="ai-chat-footer">
            <input
              ref={inputRef}
              type="text"
              className="ai-chat-input"
              placeholder="Type your message here..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void send(input)}
              disabled={loading}
            />
            <button
              type="button"
              className="ai-chat-send"
              onClick={() => void send(input)}
              disabled={loading || !input.trim()}
              aria-label="Send"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <line x1="22" y1="2" x2="11" y2="13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </footer>
        </>
      )}
      </div>
    </>,
    document.body
  );
}

export function AiChatFab({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="ai-chat-fab" onClick={onClick} aria-label="Open AI Assistant">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 3a7 7 0 0 0-7 7v3l-2 2v2h18v-2l-2-2v-3a7 7 0 0 0-7-7z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <circle cx="9" cy="11" r="1" fill="currentColor" />
        <circle cx="15" cy="11" r="1" fill="currentColor" />
        <path d="M9 17h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </button>
  );
}
