import { useState, useRef, useEffect } from 'react';
import { Socket } from 'socket.io-client';

interface ScreenShareProps {
  socket: Socket | null;
  username?: string;
}

export default function ScreenShare({ socket, username }: ScreenShareProps) {
  const [sharing, setSharing] = useState(false);
  const [remoteScreens, setRemoteScreens] = useState<string[]>([]);
  const [error, setError] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startSharing = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      } as any);

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      stream.getVideoTracks()[0].onended = () => stopSharing();

      setSharing(true);
      socket?.emit('screen-sharing-started');
    } catch (err: any) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError('Screen sharing permission denied');
      } else {
        setError('Could not start screen sharing');
      }
      console.error('[screen] sharing failed:', err);
    }
  };

  const stopSharing = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setSharing(false);
    socket?.emit('screen-sharing-stopped');
  };

  useEffect(() => {
    if (!socket) return;
    const handleStarted = (userId: string) => {
      setRemoteScreens((prev) => (prev.includes(userId) ? prev : [...prev, userId]));
    };
    const handleStopped = (userId: string) => {
      setRemoteScreens((prev) => prev.filter((id) => id !== userId));
    };
    socket.on('screen-sharing-started', handleStarted);
    socket.on('screen-sharing-stopped', handleStopped);
    return () => {
      socket.off('screen-sharing-started', handleStarted);
      socket.off('screen-sharing-stopped', handleStopped);
    };
  }, [socket]);

  return (
    <div className="screen-share" role="tabpanel" aria-label="Screen sharing">
      <h3>Screen Share</h3>
      <div className="share-controls">
        {!sharing ? (
          <button className="btn-primary btn-sm" onClick={startSharing} aria-label="Start sharing your screen">
            Share Screen
          </button>
        ) : (
          <button className="btn-danger btn-sm" onClick={stopSharing} aria-label="Stop sharing your screen">
            Stop Sharing
          </button>
        )}
      </div>

      {error && (
        <p className="error-text" role="alert" style={{ marginBottom: 'var(--space-2)' }}>
          {error}
        </p>
      )}

      {sharing && (
        <div className="local-screen">
          <video ref={videoRef} autoPlay muted className="screen-video" aria-label="Your shared screen" />
          <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--color-text-tertiary)', marginTop: 'var(--space-1)' }}>
            Sharing your screen
          </p>
        </div>
      )}

      {!sharing && remoteScreens.length === 0 && (
        <div className="empty-state" style={{ padding: 'var(--space-6) 0' }}>
          <p>No one is sharing their screen</p>
          <p className="hint">Click "Share Screen" to show your screen to the room</p>
        </div>
      )}

      {remoteScreens.length > 0 && (
        <div style={{ marginTop: 'var(--space-3)' }}>
          <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--color-text-secondary)' }}>
            {remoteScreens.length} screen(s) shared
          </p>
        </div>
      )}
    </div>
  );
}
