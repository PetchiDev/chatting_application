import { useCallback, useEffect, useRef, useState } from 'react';

import * as signalR from '@microsoft/signalr';

import { useAuthStore } from '../store/authStore';
import { normalizeUserId, sameUserId } from '../lib/users';

import type { CallSignal } from '../types';

const toPeerKey = (id: string) => normalizeUserId(id);



const CALL_HUB_URL = import.meta.env.VITE_API_URL

  ? `${import.meta.env.VITE_API_URL}/hubs/call`

  : '/hubs/call';



export interface ActiveCall {

  callId: string;

  callType: 'audio' | 'video';

  isIncoming: boolean;

  isAccepted: boolean;

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

  const pendingOffersRef = useRef<Map<string, RTCSessionDescriptionInit>>(new Map());

  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

  const acceptingRef = useRef(false);



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

    pendingOffersRef.current.clear();

    pendingIceRef.current.clear();

    acceptingRef.current = false;

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



  const flushPendingIce = useCallback(async (key: string, pc: RTCPeerConnection) => {

    const queued = pendingIceRef.current.get(key) ?? [];

    pendingIceRef.current.delete(key);

    for (const candidate of queued) {

      try {

        await pc.addIceCandidate(new RTCIceCandidate(candidate));

      } catch {

        /* candidate may already be applied */

      }

    }

  }, []);



  const createPeer = useCallback(

    (stream: MediaStream, callId: string, targetUserId: string, callType: 'audio' | 'video') => {

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



      peersRef.current.set(toPeerKey(targetUserId), pc);

      return pc;

    },

    [sendSignal]

  );



  const establishIncomingCall = useCallback(

    async (call: ActiveCall, offer: RTCSessionDescriptionInit) => {

      const currentUser = userRef.current;

      if (!currentUser || acceptingRef.current) return;



      const fromId = call.toUserId ?? '';

      if (!fromId) return;

      const key = toPeerKey(fromId);

      acceptingRef.current = true;

      try {

        await waitForConnectionRef.current?.();

        const existing = peersRef.current.get(key);

        if (existing) {

          existing.close();

          peersRef.current.delete(key);

        }

        const stream = await getMedia(call.callType);

        const pc = createPeer(stream, call.callId, fromId, call.callType);



        await pc.setRemoteDescription(new RTCSessionDescription(offer));

        pendingOffersRef.current.delete(call.callId);

        await flushPendingIce(key, pc);



        const answer = await pc.createAnswer();

        await pc.setLocalDescription(answer);



        await sendSignal({

          callId: call.callId,

          fromUserId: currentUser.userId,

          fromUsername: currentUser.username,

          toUserId: fromId,

          callType: call.callType,

          signalType: 'answer',

          payload: answer,

        });



        setActiveCallState({ ...call, isAccepted: true });

      } finally {

        acceptingRef.current = false;

      }

    },

    [createPeer, flushPendingIce, getMedia, sendSignal, setActiveCallState]

  );



  const waitForConnectionRef = useRef<() => Promise<void>>(async () => {});



  const waitForConnection = useCallback(async () => {

    if (connectionReadyRef.current) {

      await connectionReadyRef.current;

    }

    const conn = connectionRef.current;

    if (!conn || conn.state !== signalR.HubConnectionState.Connected) {

      throw new Error('Call service not connected');

    }

  }, []);



  waitForConnectionRef.current = waitForConnection;



  const handlersRef = useRef({

    cleanup,

    sendSignal,

    setActiveCallState,

    establishIncomingCall,

    createPeer,

    flushPendingIce,

    getMedia,

  });

  handlersRef.current = {

    cleanup,

    sendSignal,

    setActiveCallState,

    establishIncomingCall,

    createPeer,

    flushPendingIce,

    getMedia,

  };



  useEffect(() => {

    if (!user?.token) return;



    let cancelled = false;



    const connection = new signalR.HubConnectionBuilder()

      .withUrl(`${CALL_HUB_URL}?access_token=${user.token}`)

      .withAutomaticReconnect()

      .build();



    connection.on('CallSignal', async (signal: CallSignal) => {

      const currentUser = userRef.current;

      const {
        cleanup: doCleanup,
        setActiveCallState: setCall,
        establishIncomingCall: connectIncoming,
        flushPendingIce: flushIce,
      } = handlersRef.current;



      if (!currentUser || sameUserId(signal.fromUserId, currentUser.userId)) return;

      const key = toPeerKey(signal.fromUserId);



      if (signal.signalType === 'ring') {

        const active = activeCallRef.current;

        if (active && active.callId !== signal.callId) {

          doCleanup();

        }

        setCall({

          callId: signal.callId,

          callType: signal.callType,

          isIncoming: true,

          isAccepted: false,

          remoteName: signal.fromUsername,

          toUserId: signal.fromUserId,

        });

        return;

      }



      if (signal.signalType === 'hangup') {

        const active = activeCallRef.current;

        if (!active || active.callId === signal.callId) {

          doCleanup();

        }

        return;

      }



      if (signal.signalType === 'offer') {

        const offer = signal.payload as RTCSessionDescriptionInit;

        pendingOffersRef.current.set(signal.callId, offer);



        let call = activeCallRef.current;

        if (!call || call.callId !== signal.callId) {

          call = {

            callId: signal.callId,

            callType: signal.callType,

            isIncoming: true,

            isAccepted: false,

            remoteName: signal.fromUsername,

            toUserId: signal.fromUserId,

          };

          setCall(call);

        }



        if (call.isAccepted) {

          await connectIncoming(call, offer);

        }

        return;

      }



      let pc = peersRef.current.get(key);



      if (signal.signalType === 'answer') {

        if (!pc) return;

        await pc.setRemoteDescription(new RTCSessionDescription(signal.payload as RTCSessionDescriptionInit));

        await flushIce(key, pc);

        const active = activeCallRef.current;

        if (active) {

          setCall({ ...active, isAccepted: true });

        }

        return;

      }



      if (signal.signalType === 'ice' && signal.payload) {

        if (!pc) {

          const queue = pendingIceRef.current.get(key) ?? [];

          queue.push(signal.payload as RTCIceCandidateInit);

          pendingIceRef.current.set(key, queue);

          return;

        }

        try {

          await pc.addIceCandidate(new RTCIceCandidate(signal.payload as RTCIceCandidateInit));

        } catch {

          /* ignore stale candidates */

        }

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

        isAccepted: false,

        remoteName: opts.remoteName,

        toUserId: opts.toUserId,

        groupId: opts.groupId,

      });



      if (opts.toUserId) {

        const pc = createPeer(stream, callId, opts.toUserId, callType);

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

        const pc = createPeer(stream, callId, opts.groupId, callType);

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

      }

    },

    [createPeer, getMedia, sendSignal, setActiveCallState, waitForConnection]

  );



  const acceptCall = useCallback(async () => {

    const call = activeCallRef.current;

    if (!call || !call.isIncoming || call.isAccepted) return;



    const offer = pendingOffersRef.current.get(call.callId);

    const acceptedCall = { ...call, isAccepted: true };

    setActiveCallState(acceptedCall);



    if (offer) {

      try {

        await establishIncomingCall(acceptedCall, offer);

      } catch (err) {

        setActiveCallState({ ...call, isAccepted: false });

        throw err;

      }

      return;

    }

    // Offer not received yet — media starts when offer arrives (see offer handler)

  }, [establishIncomingCall, setActiveCallState]);



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


