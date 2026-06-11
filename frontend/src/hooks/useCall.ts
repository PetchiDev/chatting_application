import { useCallback, useEffect, useRef, useState } from 'react';
import * as signalR from '@microsoft/signalr';
import { useAuthStore } from '../store/authStore';
import type { CallSignal } from '../types';

const CALL_HUB_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/hubs/call`
  : '/hubs/call';

export interface ActiveCall {
  callId: string;
  callType: 'audio' | 'video';
  isIncoming: boolean;
  remoteName: string;
  toUserId?: string;
  groupId?: string;
}

export function useCall() {
  const user = useAuthStore((s) => s.user);
  const userRef = useRef(user);
  userRef.current = user;

  const connectionRef = useRef<signalR.HubConnection | null>(null);
  const connectionReadyRef = useRef<Promise<void> | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const activeCallRef = useRef<ActiveCall | null>(null);

  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<MediaStream[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  const setActiveCallState = useCallback((call: ActiveCall | null) => {
    activeCallRef.current = call;
    setActiveCall(call);
  }, []);

  const cleanup = useCallback(() => {
    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setRemoteStreams([]);
    setActiveCallState(null);
  }, [setActiveCallState]);

  const sendSignal = useCallback(async (signal: CallSignal) => {
    const conn = connectionRef.current;
    if (!conn || conn.state !== signalR.HubConnectionState.Connected) return;
    await conn.invoke('SendCallSignal', signal);
  }, []);

  const getMedia = useCallback(async (callType: 'audio' | 'video') => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: callType === 'video',
    });
    localStreamRef.current = stream;
    setLocalStream(stream);
    return stream;
  }, []);

  const createPeer = useCallback(
    (peerKey: string, stream: MediaStream, callId: string, targetUserId: string, callType: 'audio' | 'video') => {
      const currentUser = userRef.current;
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.onicecandidate = (e) => {
        if (e.candidate && currentUser) {
          void sendSignal({
            callId,
            fromUserId: currentUser.userId,
            fromUsername: currentUser.username,
            toUserId: targetUserId,
            callType,
            signalType: 'ice',
            payload: e.candidate.toJSON(),
          });
        }
      };

      pc.ontrack = (e) => {
        setRemoteStreams((prev) => {
          const exists = prev.some((s) => s.id === e.streams[0]?.id);
          if (exists || !e.streams[0]) return prev;
          return [...prev, e.streams[0]];
        });
      };

      peersRef.current.set(peerKey, pc);
      return pc;
    },
    [sendSignal]
  );

  const handlersRef = useRef({
    cleanup,
    getMedia,
    createPeer,
    sendSignal,
    setActiveCallState,
  });
  handlersRef.current = { cleanup, getMedia, createPeer, sendSignal, setActiveCallState };

  const waitForConnection = useCallback(async () => {
    if (connectionReadyRef.current) {
      await connectionReadyRef.current;
    }
    const conn = connectionRef.current;
    if (!conn || conn.state !== signalR.HubConnectionState.Connected) {
      throw new Error('Call service not connected');
    }
  }, []);

  useEffect(() => {
    if (!user?.token) return;

    let cancelled = false;

    const connection = new signalR.HubConnectionBuilder()
      .withUrl(`${CALL_HUB_URL}?access_token=${user.token}`)
      .withAutomaticReconnect()
      .build();

    connection.on('CallSignal', async (signal: CallSignal) => {
      const currentUser = userRef.current;
      const { cleanup: doCleanup, getMedia: loadMedia, createPeer: makePeer, sendSignal: emitSignal, setActiveCallState: setCall } =
        handlersRef.current;

      if (!currentUser || signal.fromUserId === currentUser.userId) return;

      if (signal.signalType === 'ring') {
        setCall({
          callId: signal.callId,
          callType: signal.callType,
          isIncoming: true,
          remoteName: signal.fromUsername,
          toUserId: signal.fromUserId,
        });
        return;
      }

      if (signal.signalType === 'hangup') {
        doCleanup();
        return;
      }

      const peerKey = signal.fromUserId;
      let pc = peersRef.current.get(peerKey);

      if (signal.signalType === 'offer') {
        if (!pc) {
          const stream = localStreamRef.current ?? (await loadMedia(signal.callType));
          pc = makePeer(peerKey, stream, signal.callId, signal.fromUserId, signal.callType);
        }
        await pc.setRemoteDescription(new RTCSessionDescription(signal.payload as RTCSessionDescriptionInit));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await emitSignal({
          callId: signal.callId,
          fromUserId: currentUser.userId,
          fromUsername: currentUser.username,
          toUserId: signal.fromUserId,
          callType: signal.callType,
          signalType: 'answer',
          payload: answer,
        });
        setCall(
          activeCallRef.current ?? {
            callId: signal.callId,
            callType: signal.callType,
            isIncoming: true,
            remoteName: signal.fromUsername,
            toUserId: signal.fromUserId,
          }
        );
      } else if (signal.signalType === 'answer' && pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.payload as RTCSessionDescriptionInit));
      } else if (signal.signalType === 'ice' && pc && signal.payload) {
        await pc.addIceCandidate(new RTCIceCandidate(signal.payload as RTCIceCandidateInit));
      }
    });

    connectionReadyRef.current = connection
      .start()
      .then(() => {
        if (cancelled) {
          return connection.stop();
        }
        connectionRef.current = connection;
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('Call hub connection failed:', err);
        }
      });

    return () => {
      cancelled = true;
      connectionRef.current = null;
      connectionReadyRef.current = null;
      connection.stop().catch(() => {});
    };
  }, [user?.token]);

  const startCall = useCallback(
    async (callType: 'audio' | 'video', opts: { toUserId?: string; groupId?: string; remoteName: string }) => {
      const currentUser = userRef.current;
      if (!currentUser) return;

      await waitForConnection();

      const callId = crypto.randomUUID();
      const stream = await getMedia(callType);
      setActiveCallState({
        callId,
        callType,
        isIncoming: false,
        remoteName: opts.remoteName,
        toUserId: opts.toUserId,
        groupId: opts.groupId,
      });

      if (opts.toUserId) {
        const pc = createPeer(opts.toUserId, stream, callId, opts.toUserId, callType);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await sendSignal({
          callId,
          fromUserId: currentUser.userId,
          fromUsername: currentUser.username,
          toUserId: opts.toUserId,
          callType,
          signalType: 'ring',
          payload: null,
        });
        await sendSignal({
          callId,
          fromUserId: currentUser.userId,
          fromUsername: currentUser.username,
          toUserId: opts.toUserId,
          callType,
          signalType: 'offer',
          payload: offer,
        });
      } else if (opts.groupId) {
        const pc = createPeer(opts.groupId, stream, callId, opts.groupId, callType);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await sendSignal({
          callId,
          fromUserId: currentUser.userId,
          fromUsername: currentUser.username,
          groupId: opts.groupId,
          callType,
          signalType: 'ring',
          payload: null,
        });
        await sendSignal({
          callId,
          fromUserId: currentUser.userId,
          fromUsername: currentUser.username,
          groupId: opts.groupId,
          callType,
          signalType: 'offer',
          payload: offer,
        });
        peersRef.current.set(opts.groupId, pc);
      }
    },
    [createPeer, getMedia, sendSignal, setActiveCallState, waitForConnection]
  );

  const acceptCall = useCallback(async () => {
    const call = activeCallRef.current;
    const currentUser = userRef.current;
    if (!call || !currentUser) return;

    await waitForConnection();
    const stream = await getMedia(call.callType);
    const fromId = call.toUserId ?? '';
    if (!fromId) return;
    createPeer(fromId, stream, call.callId, fromId, call.callType);
  }, [createPeer, getMedia, waitForConnection]);

  const hangUp = useCallback(async () => {
    const call = activeCallRef.current;
    const currentUser = userRef.current;
    if (call && currentUser) {
      await sendSignal({
        callId: call.callId,
        fromUserId: currentUser.userId,
        fromUsername: currentUser.username,
        toUserId: call.toUserId,
        groupId: call.groupId,
        callType: call.callType,
        signalType: 'hangup',
        payload: null,
      });
    }
    cleanup();
  }, [cleanup, sendSignal]);

  return { activeCall, localStream, remoteStreams, startCall, acceptCall, hangUp };
}
