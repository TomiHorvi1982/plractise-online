import { useState } from 'react';

interface PeerUser {
  id: string;
  username: string;
}

interface PeerVolumes {
  [peerId: string]: { volume: number; latency: number };
}

interface PeerListProps {
  users: PeerUser[];
  localUsername: string;
  audioInitialized: boolean;
  onRequestAudio: (targetId: string) => void;
  onInitAudio: () => void;
  audioInputs: MediaDeviceInfo[];
  selectedInput: string;
  onDeviceChange: (deviceId: string) => void;
  audioEnabled: boolean;
  onToggleAudio: () => void;
  peerVolumes: PeerVolumes;
  onPeerVolumeChange: (peerId: string, volume: number) => void;
  onPeerLatencyChange: (peerId: string, latency: number) => void;
}

export default function PeerList({
  users, localUsername, audioInitialized, onRequestAudio,
  onInitAudio, audioInputs, selectedInput, onDeviceChange,
  audioEnabled, onToggleAudio,
  peerVolumes, onPeerVolumeChange, onPeerLatencyChange,
}: PeerListProps) {
  const [expandedPeer, setExpandedPeer] = useState<string | null>(null);

  return (
    <div className="peer-list" role="tabpanel" aria-label="Players and audio setup">
      <div className="audio-setup">
        <h3>Audio Setup</h3>
        {!audioInitialized ? (
          <button className="btn-primary btn-sm" onClick={onInitAudio} aria-label="Start audio input">
            Start Audio
          </button>
        ) : (
          <div className="audio-controls">
            <label htmlFor="audio-device-select" className="sr-only">Audio input device</label>
            <select
              id="audio-device-select"
              value={selectedInput}
              onChange={(e) => onDeviceChange(e.target.value)}
              aria-label="Select microphone"
            >
              {audioInputs.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Microphone ${d.deviceId.slice(0, 8)}`}
                </option>
              ))}
            </select>
            <div className="peer-volume-row">
              <span className="peer-vol-label">You</span>
              <span className={`status-dot ${audioEnabled ? 'online' : 'offline'}`} aria-label={audioEnabled ? 'Audio active' : 'Audio muted'} />
              <button
                className={`btn-xs ${audioEnabled ? 'btn-secondary' : 'btn-danger'}`}
                onClick={onToggleAudio}
                aria-label={audioEnabled ? 'Mute microphone' : 'Unmute microphone'}
              >
                {audioEnabled ? 'Mute' : 'Unmute'}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="user-list">
        <h3>Players</h3>
        <div className="user-item local" role="listitem">
          <span className="user-name">{localUsername}</span>
          <span className="user-badge">You</span>
        </div>
        {users.length === 0 && (
          <p className="empty-hint">No other players yet</p>
        )}
        {users.map((user) => {
          const pv = peerVolumes[user.id] || { volume: 0, latency: 0 };
          const expanded = expandedPeer === user.id;
          return (
            <div key={user.id} className="user-item-col" role="listitem">
              <div className="user-item" onClick={() => setExpandedPeer(expanded ? null : user.id)} style={{ cursor: 'pointer' }}>
                <span className="user-name">{user.username}</span>
                {audioInitialized && (
                  <button
                    className="btn-xs btn-secondary"
                    onClick={(e) => { e.stopPropagation(); onRequestAudio(user.id); }}
                    aria-label={`Connect to ${user.username}`}
                  >
                    Connect
                  </button>
                )}
                <button className="btn-xs btn-ghost" aria-label={expanded ? 'Collapse' : 'Expand'} onClick={(e) => e.stopPropagation()}>
                  {expanded ? '▲' : '▼'}
                </button>
              </div>

              {expanded && (
                <div className="peer-detail">
                  <div className="peer-control">
                    <label>Volume</label>
                    <div className="peer-control-row">
                      <input
                        type="range" min={-40} max={12} step={1}
                        value={pv.volume}
                        onChange={(e) => onPeerVolumeChange(user.id, parseInt(e.target.value))}
                        className="mini-slider"
                        aria-label={`${user.username} volume`}
                      />
                      <span className="mini-val">{pv.volume > 0 ? '+' : ''}{pv.volume}dB</span>
                    </div>
                  </div>
                  <div className="peer-control">
                    <label>Latency comp.</label>
                    <div className="peer-control-row">
                      <input
                        type="range" min={0} max={200} step={5}
                        value={pv.latency}
                        onChange={(e) => onPeerLatencyChange(user.id, parseInt(e.target.value))}
                        className="mini-slider"
                        aria-label={`${user.username} latency compensation`}
                      />
                      <span className="mini-val">{pv.latency}ms</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
