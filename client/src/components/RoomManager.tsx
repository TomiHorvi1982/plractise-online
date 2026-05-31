import { useState } from 'react';

interface RoomManagerProps {
  onCreateRoom: () => void;
  onJoinRoom: (roomId: string) => void;
  loading: boolean;
}

export default function RoomManager({ onCreateRoom, onJoinRoom, loading }: RoomManagerProps) {
  const [roomId, setRoomId] = useState('');
  const [error, setError] = useState('');

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = roomId.trim().toUpperCase();
    if (!trimmed) {
      setError('Enter a room code');
      return;
    }
    onJoinRoom(trimmed);
  };

  return (
    <div className="room-manager">
      <div className="room-card">
        <h2>Create or Join a Room</h2>
        <button
          className="btn-primary"
          onClick={onCreateRoom}
          disabled={loading}
          aria-busy={loading}
        >
          {loading ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <span className="spinner" aria-hidden="true" />
              Creating...
            </span>
          ) : (
            'Create New Room'
          )}
        </button>
        <div className="divider" role="separator" aria-label="or"><span>or</span></div>
        <form onSubmit={handleJoin} aria-label="Join room form">
          <label htmlFor="room-code-input" className="sr-only">Room code</label>
          <input
            id="room-code-input"
            type="text"
            placeholder="Enter room code"
            value={roomId}
            onChange={(e) => { setRoomId(e.target.value); setError(''); }}
            maxLength={8}
            autoComplete="off"
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={error ? 'join-error' : undefined}
          />
          {error && (
            <p className="error-text" id="join-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn-secondary" disabled={loading}>
            Join Room
          </button>
        </form>
      </div>
    </div>
  );
}
