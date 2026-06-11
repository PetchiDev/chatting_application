import { useEffect, useRef } from 'react';
import type { ActiveCall } from '../hooks/useCall';

interface Props {
  call: ActiveCall;
  localStream: MediaStream | null;
  remoteStreams: MediaStream[];
  onAccept: () => void;
  onHangUp: () => void;
}

export function CallModal({ call, localStream, remoteStreams, onAccept, onHangUp }: Props) {
  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);

  const showMedia = call.isAccepted || !call.isIncoming;
  const showLocalVideo = showMedia && call.callType === 'video' && Boolean(localStream);
  const showRemoteVideo = showMedia && call.callType === 'video' && Boolean(remoteStreams[0]);
  const showRemoteAudio = showMedia && call.callType === 'audio' && Boolean(remoteStreams[0]);
  const isRinging = call.isIncoming && !call.isAccepted;

  useEffect(() => {
    if (localRef.current) {
      localRef.current.srcObject = showLocalVideo ? localStream : null;
    }
  }, [localStream, showLocalVideo]);

  useEffect(() => {
    if (remoteRef.current) {
      remoteRef.current.srcObject = showRemoteVideo ? remoteStreams[0] : null;
    }
  }, [remoteStreams, showRemoteVideo]);

  return (
    <div className="call-overlay">
      <div className="call-modal">
        <h2>
          {isRinging ? 'Incoming' : call.isIncoming ? 'Connected' : 'Calling'} {call.remoteName}
        </h2>
        <p className="call-type">
          {call.callType === 'video' ? 'Video call' : 'Audio call'}
          {isRinging && ' — waiting for you to accept'}
          {!call.isIncoming && !call.isAccepted && ' — ringing...'}
        </p>

        {isRinging && (
          <div className="call-ringing">
            <div className="call-ringing-icon" aria-hidden="true">
              {call.callType === 'video' ? '📹' : '📞'}
            </div>
            <p>{call.remoteName} is calling</p>
          </div>
        )}

        {showMedia && (
          <div className="call-videos">
            {call.callType === 'video' && (
              <>
                {showRemoteVideo ? (
                  <video ref={remoteRef} autoPlay playsInline className="call-remote" />
                ) : (
                  <div className="call-waiting">
                    <span>{call.isIncoming ? 'Connecting...' : 'Waiting for answer...'}</span>
                  </div>
                )}
                {showLocalVideo && (
                  <video ref={localRef} autoPlay playsInline muted className="call-local" />
                )}
              </>
            )}
            {showRemoteAudio && (
              <audio
                ref={(el) => {
                  if (el) el.srcObject = remoteStreams[0];
                }}
                autoPlay
              />
            )}
            {call.callType === 'audio' && !remoteStreams[0] && (
              <div className="call-waiting">
                <span>{call.isIncoming ? 'Connecting...' : 'Waiting for answer...'}</span>
              </div>
            )}
          </div>
        )}

        <div className="call-actions">
          {isRinging ? (
            <>
              <button type="button" className="call-btn accept" onClick={onAccept}>
                Accept
              </button>
              <button type="button" className="call-btn hangup" onClick={onHangUp}>
                Decline
              </button>
            </>
          ) : (
            <button type="button" className="call-btn hangup" onClick={onHangUp}>
              End call
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
