import { useEffect, useRef, useCallback, useState } from 'react';
import { Socket } from 'socket.io-client';

interface Peer {
  id: string;
  username: string;
  connection: RTCPeerConnection;
  stream?: MediaStream;
  connected: boolean;
}

interface UseWebRTCOptions {
  socket: Socket | null;
  localStream: MediaStream | null;
  onRemoteStream?: (peerId: string, stream: MediaStream) => void;
  channel: 'instrument' | 'voice' | 'screen';
}

export function useWebRTC({ socket, localStream, onRemoteStream, channel }: UseWebRTCOptions) {
  const peersRef = useRef<Map<string, Peer>>(new Map());
  const [connectedPeers, setConnectedPeers] = useState<string[]>([]);

  const getSignalEvent = () => {
    switch (channel) {
      case 'voice': return 'voice-signal';
      case 'screen': return 'screen-signal';
      default: return 'signal';
    }
  };

  const getConfig = (): RTCConfiguration => ({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
    iceCandidatePoolSize: 0,
    ...(channel === 'instrument' ? {
      // Low-latency audio settings
      iceTransportPolicy: 'all' as RTCIceTransportPolicy,
    } : {}),
  });

  const createPeerConnection = useCallback((peerId: string, username: string): RTCPeerConnection => {
    const pc = new RTCPeerConnection(getConfig());

    if (localStream) {
      localStream.getTracks().forEach((track) => {
        if (localStream.getVideoTracks().length > 0 || track.kind === 'audio') {
          pc.addTrack(track, localStream);
        }
      });
    }

    pc.onicecandidate = (e) => {
      if (e.candidate && socket) {
        socket.emit(getSignalEvent(), {
          to: peerId,
          signal: { type: 'candidate', candidate: e.candidate },
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        removePeer(peerId);
      }
    };

    pc.ontrack = (e) => {
      const peer = peersRef.current.get(peerId);
      if (peer) {
        peer.stream = e.streams[0];
        peer.connected = true;
        onRemoteStream?.(peerId, e.streams[0]);
        setConnectedPeers(Array.from(peersRef.current.keys()));
      }
    };

    return pc;
  }, [localStream, socket, onRemoteStream, channel]);

  const addPeer = useCallback((peerId: string, username: string) => {
    if (peersRef.current.has(peerId)) return;
    const pc = createPeerConnection(peerId, username);
    peersRef.current.set(peerId, {
      id: peerId,
      username,
      connection: pc,
      connected: false,
    });
    setConnectedPeers(Array.from(peersRef.current.keys()));
    return pc;
  }, [createPeerConnection]);

  const removePeer = useCallback((peerId: string) => {
    const peer = peersRef.current.get(peerId);
    if (peer) {
      peer.connection.close();
      peersRef.current.delete(peerId);
    }
    setConnectedPeers(Array.from(peersRef.current.keys()));
  }, []);

  const createOffer = useCallback(async (peerId: string) => {
    const peer = peersRef.current.get(peerId);
    if (!peer) return;

    try {
      const offer = await peer.connection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: channel === 'screen',
      });
      await peer.connection.setLocalDescription(offer);
      if (socket) {
        socket.emit(getSignalEvent(), {
          to: peerId,
          signal: { type: 'offer', sdp: offer },
        });
      }
    } catch (err) {
      console.error('Error creating offer:', err);
    }
  }, [socket, channel]);

  const createAnswer = useCallback(async (peerId: string, offer: RTCSessionDescriptionInit) => {
    let peer = peersRef.current.get(peerId);
    if (!peer) {
      addPeer(peerId, '');
      peer = peersRef.current.get(peerId);
    }
    if (!peer) return;

    try {
      await peer.connection.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peer.connection.createAnswer();
      await peer.connection.setLocalDescription(answer);
      if (socket) {
        socket.emit(getSignalEvent(), {
          to: peerId,
          signal: { type: 'answer', sdp: answer },
        });
      }
    } catch (err) {
      console.error('Error creating answer:', err);
    }
  }, [socket, addPeer, channel]);

  const handleSignal = useCallback(async (data: { from: string; signal: any }) => {
    const { from, signal } = data;

    if (signal.type === 'offer') {
      if (!peersRef.current.has(from)) {
        addPeer(from, '');
      }
      await createAnswer(from, signal.sdp);
    } else if (signal.type === 'answer') {
      const peer = peersRef.current.get(from);
      if (peer && peer.connection.localDescription) {
        await peer.connection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
      }
    } else if (signal.type === 'candidate' && signal.candidate) {
      const peer = peersRef.current.get(from);
      if (peer && peer.connection.remoteDescription) {
        try {
          await peer.connection.addIceCandidate(new RTCIceCandidate(signal.candidate));
        } catch (err) {
          // ignore ICE candidate errors
        }
      }
    }
  }, [addPeer, createAnswer]);

  const initiateConnection = useCallback(async (peerId: string) => {
    addPeer(peerId, '');
    await createOffer(peerId);
  }, [addPeer, createOffer]);

  const replaceTrack = useCallback((newStream: MediaStream | null) => {
    peersRef.current.forEach((peer) => {
      const senders = peer.connection.getSenders();
      if (newStream) {
        newStream.getTracks().forEach((track) => {
          const sender = senders.find((s) => s.track?.kind === track.kind);
          if (sender) {
            sender.replaceTrack(track);
          }
        });
      } else {
        senders.forEach((sender) => {
          sender.replaceTrack(null);
        });
      }
    });
  }, []);

  useEffect(() => {
    if (!socket) return;
    const event = getSignalEvent();
    socket.on(event, handleSignal);
    return () => {
      socket.off(event, handleSignal);
    };
  }, [socket, handleSignal, channel]);

  useEffect(() => {
    replaceTrack(localStream);
  }, [localStream, replaceTrack]);

  useEffect(() => {
    return () => {
      peersRef.current.forEach((peer) => peer.connection.close());
      peersRef.current.clear();
      setConnectedPeers([]);
    };
  }, []);

  return {
    connectedPeers: Array.from(peersRef.current.keys()),
    initiateConnection,
    addPeer,
    removePeer,
    handleSignal,
    replaceTrack,
    getPeerStream: (peerId: string) => peersRef.current.get(peerId)?.stream,
    getPeerUsername: (peerId: string) => peersRef.current.get(peerId)?.username,
  };
}
