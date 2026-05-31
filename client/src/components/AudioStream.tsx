import { useState, useRef, useEffect, useCallback } from 'react';
import { Socket } from 'socket.io-client';

interface AudioStreamProps {
  socket: Socket;
  localStream: MediaStream | null;
  audioInitialized: boolean;
  audioEnabled: boolean;
  onInitAudio: () => void;
  onToggleAudio: () => void;
  users: { id: string; username: string }[];
  onRequestAudio: (targetId: string) => void;
  username: string;
}

type StreamState = 'idle' | 'loading' | 'active' | 'error' | 'empty';

export default function AudioStream({
  socket, localStream, audioInitialized, audioEnabled,
  onInitAudio, onToggleAudio, users, onRequestAudio, username,
}: AudioStreamProps) {
  const localAudioRef = useRef<HTMLAudioElement | null>(null);
  const visualizerRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>();
  const [state, setState] = useState<StreamState>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!audioInitialized) setState('idle');
    else if (audioInitialized && localStream) setState('active');
  }, [audioInitialized, localStream]);

  useEffect(() => {
    if (localStream && audioEnabled) {
      if (!localAudioRef.current) {
        const audio = new Audio();
        audio.muted = true;
        audio.srcObject = localStream;
        audio.play().catch(() => {});
        localAudioRef.current = audio;
      } else {
        localAudioRef.current.srcObject = localStream;
      }
    }
    return () => {
      if (localAudioRef.current) {
        localAudioRef.current.pause();
        localAudioRef.current = null;
      }
    };
  }, [localStream, audioEnabled]);

  const initVisualizer = useCallback(() => {
    if (!localStream || !visualizerRef.current) return;

    let audioCtx: AudioContext | null = null;
    try {
      audioCtx = new AudioContext();
      const src = audioCtx.createMediaStreamSource(localStream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);

      const canvas = visualizerRef.current;
      const canvasCtx = canvas.getContext('2d');
      if (!canvasCtx) return;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const draw = () => {
        animRef.current = requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);

        canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

        const barWidth = (canvas.width / bufferLength) * 2.5;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const barHeight = (dataArray[i] / 255) * canvas.height;
          canvasCtx.fillStyle = `hsl(${200 + (i / bufferLength) * 60}, 80%, 60%)`;
          canvasCtx.fillRect(x, canvas.height - barHeight, Math.max(1, barWidth - 0.5), barHeight);
          x += barWidth + 0.5;
        }
      };
      draw();
    } catch (err) {
      console.error('[visualizer] failed:', err);
    }

    return () => {
      cancelAnimationFrame(animRef.current!);
      audioCtx?.close();
    };
  }, [localStream]);

  useEffect(() => {
    const cleanup = initVisualizer();
    return () => cleanup?.();
  }, [initVisualizer]);

  const handleInitAudio = async () => {
    setState('loading');
    try {
      await onInitAudio();
    } catch (err) {
      setState('error');
      setErrorMsg('Could not access microphone. Check your browser permissions.');
    }
  };

  const renderState = () => {
    switch (state) {
      case 'idle':
        return (
          <div className="stream-controls">
            <div className="empty-state">
              <p>Initialize your audio to start jamming</p>
              <p className="hint">You need a microphone or audio interface connected</p>
            </div>
            <button className="btn-primary btn-lg" onClick={handleInitAudio}>
              Initialize Audio
            </button>
          </div>
        );
      case 'loading':
        return (
          <div className="stream-controls">
            <div className="spinner spinner-lg" role="status" aria-label="Initializing audio" />
            <p style={{ color: 'var(--color-text-secondary)' }}>Requesting microphone access...</p>
          </div>
        );
      case 'error':
        return (
          <div className="stream-controls" role="alert">
            <div className="empty-state">
              <p style={{ color: 'var(--color-danger)' }}>{errorMsg}</p>
              <p className="hint">Go to your browser settings and allow microphone access</p>
            </div>
            <button className="btn-primary" onClick={handleInitAudio}>
              Try Again
            </button>
          </div>
        );
      case 'active':
        return (
          <div className="stream-controls">
            <button
              className={`btn-lg ${audioEnabled ? 'btn-secondary' : 'btn-danger'}`}
              onClick={onToggleAudio}
              aria-label={audioEnabled ? 'Mute microphone' : 'Unmute microphone'}
            >
              {audioEnabled ? 'Mute' : 'Unmute'}
            </button>
            <div className="latency-info" aria-live="polite">
              &lt; 30ms latency (WebRTC)
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="audio-stream" aria-label="Audio stream panel">
      <div className="stream-header">
        <h3>Jam Room</h3>
        <div className="stream-status">
          <span className={`status-dot ${state === 'active' && audioEnabled ? 'online' : 'offline'}`} aria-hidden="true" />
          <span>
            {state === 'active' ? (audioEnabled ? 'Live' : 'Muted') :
             state === 'loading' ? 'Connecting...' :
             state === 'error' ? 'Error' :
             'Offline'}
          </span>
        </div>
      </div>

      <div className="visualizer-container">
        <canvas
          ref={visualizerRef}
          width={600}
          height={200}
          className="visualizer"
          aria-label="Audio frequency visualizer"
        />
        <div className="user-label">{username} (You)</div>
      </div>

      <div className="remote-users" role="list" aria-label="Connected users">
        {users.length === 0 ? (
          <div className="empty-state" role="status">
            <p>Waiting for others to join...</p>
            <p className="hint">Share the room code with your friends</p>
          </div>
        ) : (
          users.map((user) => (
            <div key={user.id} className="remote-user-card" role="listitem">
              <div className="user-avatar" aria-hidden="true">
                {user.username[0].toUpperCase()}
              </div>
              <div className="user-info">
                <span className="user-name">{user.username}</span>
                {audioInitialized ? (
                  <button
                    className="btn-xs btn-secondary"
                    onClick={() => onRequestAudio(user.id)}
                    aria-label={`Request audio from ${user.username}`}
                  >
                    Connect
                  </button>
                ) : (
                  <span className="connected" style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-tertiary)' }}>
                    Not connected
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {renderState()}
    </div>
  );
}
