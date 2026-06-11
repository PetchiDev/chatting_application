import { useEffect, useRef, useState } from 'react';

import gsap from 'gsap';

import type { MessageDto } from '../types';

import { LinkPreview } from './LinkPreview';

import { AudioMessage } from './AudioMessage';



function ForwardIcon() {
  return (
    <svg className="msg-menu-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M15 14v5l7-7-7-7v5H2v4h13z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg className="msg-menu-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3v12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M7 10l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 21h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg className="msg-menu-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 6h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M8 6V4h8v2M10 11v6M14 11v6M5 6l1 14h12l1-14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface Props {
  message: MessageDto;
  isOwn: boolean;
  onDelete: (messageId: string, forEveryone: boolean) => void;
  onForward?: (message: MessageDto) => void;
  onDownload?: (message: MessageDto) => void;
}



export function MessageBubble({ message, isOwn, onDelete, onForward, onDownload }: Props) {

  const ref = useRef<HTMLDivElement>(null);

  const [menuOpen, setMenuOpen] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);



  useEffect(() => {

    if (!ref.current) return;

    gsap.fromTo(

      ref.current,

      { opacity: 0, y: 20, scale: 0.95 },

      { opacity: 1, y: 0, scale: 1, duration: 0.35, ease: 'back.out(1.4)' }

    );

  }, [message.id]);



  useEffect(() => {

    if (!menuOpen) return;

    const close = (e: MouseEvent) => {

      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {

        setMenuOpen(false);

      }

    };

    document.addEventListener('mousedown', close);

    return () => document.removeEventListener('mousedown', close);

  }, [menuOpen]);



  const hasLinkPreview = Boolean(message.linkUrl);

  const messageType = message.messageType?.toLowerCase();

  const hasAttachment = Boolean(message.attachmentUrl);

  const isAudio =

    messageType === 'audio' ||

    Boolean(

      message.attachmentUrl &&

        (message.attachmentName?.startsWith('voice-') ||

          /\.(webm|mp3|ogg|wav|m4a|aac)(\?|$)/i.test(message.attachmentUrl))

    );



  const handleDelete = (forEveryone: boolean) => {

    setMenuOpen(false);

    onDelete(message.id, forEveryone);

  };



  const renderContent = () => {

    if (isAudio && message.attachmentUrl) {

      return <AudioMessage src={message.attachmentUrl} isOwn={isOwn} />;

    }



    switch (messageType) {

      case 'image':

        return (

          <a href={message.attachmentUrl} target="_blank" rel="noreferrer">

            <img src={message.attachmentUrl} alt={message.attachmentName || 'image'} className="msg-image" />

          </a>

        );

      case 'file':

        return (

          <a href={message.attachmentUrl} target="_blank" rel="noreferrer" className="msg-file">

            📎 {message.attachmentName || 'Attachment'}

          </a>

        );

      default:

        return (

          <>

            {message.forwardedFromId && <span className="msg-forwarded">↪ Forwarded</span>}

            {message.content && <p className="msg-text">{message.content}</p>}

            {hasLinkPreview && (

              <LinkPreview

                url={message.linkUrl!}

                title={message.linkTitle}

                description={message.linkDescription}

                image={message.linkImage}

                isOwn={isOwn}

              />

            )}

          </>

        );

    }

  };



  return (

    <div ref={ref} className={`message-bubble ${isOwn ? 'own' : 'other'} ${menuOpen ? 'menu-open' : ''}`}>

      {!isOwn && (

        <div className="msg-avatar">

          {message.senderProfilePicture ? (

            <img src={message.senderProfilePicture} alt="" />

          ) : (

            <span>{message.senderUsername[0]?.toUpperCase()}</span>

          )}

        </div>

      )}

      <div className="msg-body">

        {!isOwn && <span className="msg-sender">{message.senderUsername}</span>}

        <div className="msg-content-wrap">

          <div className={`msg-content ${hasLinkPreview ? 'has-link' : ''} ${isAudio ? 'has-audio' : ''}`}>{renderContent()}</div>

          <div className={`msg-actions ${menuOpen ? 'open' : ''}`} ref={menuRef}>

            <button

              type="button"

              className="msg-menu-btn"

              onClick={() => setMenuOpen((o) => !o)}

              aria-label="Message options"

              aria-expanded={menuOpen}

            >

              ⋮

            </button>

            {menuOpen && (

              <div className="msg-menu" role="menu">

                {onForward && (

                  <button

                    type="button"

                    className="msg-menu-item"

                    role="menuitem"

                    onClick={() => { setMenuOpen(false); onForward(message); }}
                  >
                    <ForwardIcon />
                    Forward
                  </button>

                )}

                {hasAttachment && onDownload && (

                  <button

                    type="button"

                    className="msg-menu-item"

                    role="menuitem"

                    onClick={() => { setMenuOpen(false); onDownload(message); }}
                  >
                    <DownloadIcon />
                    Download
                  </button>

                )}

                {isOwn ? (

                  <button type="button" className="msg-menu-item danger" role="menuitem" onClick={() => handleDelete(true)}>
                    <DeleteIcon />
                    Delete for everyone
                  </button>

                ) : (

                  <button type="button" className="msg-menu-item danger" role="menuitem" onClick={() => handleDelete(false)}>
                    <DeleteIcon />
                    Delete for me
                  </button>

                )}

              </div>

            )}

          </div>

        </div>

        <span className="msg-time">

          {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}

        </span>

      </div>

    </div>

  );

}


