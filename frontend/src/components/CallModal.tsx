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

  useEffect(() => {
    if (localRef.current) localRef.current.srcObject = localStream;
  }, [localStream]);

  useEffect(() => {
    if (remoteRef.current && remoteStreams[0]) {
      remoteRef.current.srcObject = remoteStreams[0];
    }
  }, [remoteStreams]);

  return (
    <div className="call-overlay">
      <div className="call-modal">
        <h2>
          {call.isIncoming ? 'Incoming' : 'Calling'} {call.remoteName}
        </h2>
        <p className="call-type">{call.callType === 'video' ? 'Video call' : 'Audio call'}</p>

        <div className="call-videos">
          {call.callType === 'video' && (
            <>
              <video ref={remoteRef} autoPlay playsInline className="call-remote" />
              <video ref={localRef} autoPlay playsInline muted className="call-local" />
            </>
          )}
          {call.callType === 'audio' && remoteStreams[0] && (
            <audio ref={(el) => { if (el) el.srcObject = remoteStreams[0]; }} autoPlay />
          )}
        </div>

        <div className="call-actions">
          {call.isIncoming ? (
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
