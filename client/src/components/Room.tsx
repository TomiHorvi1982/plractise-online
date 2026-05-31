import { useState, useEffect, useRef, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { useWebRTC } from '../hooks/useWebRTC';
import Chat from './Chat';
import AudioStream from './AudioStream';
import TrackMixer from './TrackMixer';
import PeerList from './PeerList';
import ScreenShare from './ScreenShare';
import Toast from './Toast';
import LyricsPanel from './LyricsPanel';
import TabsPanel from './TabsPanel';

interface RoomProps {
  socket: Socket;
  roomId: string;
  username: string;
  onLeave: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

interface UserInfo {
  id: string;
  username: string;
}

interface ToastItem {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export default function Room({ socket, roomId, username, onLeave, theme, onToggleTheme }: RoomProps) {
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [audioInitialized, setAudioInitialized] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedInput, setSelectedInput] = useState('');
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [activeTab, setActiveTab] = useState<'peers' | 'chat' | 'tracks' | 'screen'>('peers');
  const [mobilePanel, setMobilePanel] = useState<'peers' | 'chat' | 'tracks' | 'screen' | null>(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [peerVolumes, setPeerVolumes] = useState<{ [peerId: string]: { volume: number; latency: number } }>({});
  const [lyricsText, setLyricsText] = useState('');
  const [tabsText, setTabsText] = useState('');
  const streamRef = useRef<MediaStream | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(340);
  const [sidebarResizing, setSidebarResizing] = useState(false);

  useEffect(() => {
    if (!sidebarResizing) return;
    const onMove = (e: PointerEvent) => {
      setSidebarWidth(Math.max(260, Math.min(800, e.clientX)));
    };
    const onUp = () => setSidebarResizing(false);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
  }, [sidebarResizing]);

  // Floating panels
  const [floatingPanels, setFloatingPanels] = useState<Record<string, {
    visible: boolean; zIndex: number; x: number; y: number; w: number; h: number;
  }>>({
    lyrics: { visible: false, zIndex: 10, x: 420, y: 80, w: 400, h: 450 },
    tabs: { visible: false, zIndex: 10, x: 420, y: 540, w: 500, h: 400 },
  });
  const panelCounterRef = useRef(20);

  const focusPanel = (id: string) => {
    panelCounterRef.current += 1;
    setFloatingPanels((prev) => ({
      ...prev,
      [id]: { ...prev[id], zIndex: panelCounterRef.current },
    }));
  };

  const togglePanel = (id: string) => {
    setFloatingPanels((prev) => {
      const p = prev[id];
      const newVisible = !p.visible;
      if (newVisible) {
        panelCounterRef.current += 1;
        return { ...prev, [id]: { ...p, visible: true, zIndex: panelCounterRef.current } };
      }
      return { ...prev, [id]: { ...p, visible: false } };
    });
  };

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const addToast = useCallback((message: string, type: ToastItem['type'] = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => { setToasts((prev) => prev.filter((t) => t.id !== id)); }, 4000);
  }, []);

  const onRemoteInstrumentStream = useCallback((_peerId: string, _stream: MediaStream) => {
    // handled by AudioStream
  }, []);

  const instrumentWebRTC = useWebRTC({
    socket, localStream, onRemoteStream: onRemoteInstrumentStream, channel: 'instrument',
  });

  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then((devices) => {
      const inputs = devices.filter((d) => d.kind === 'audioinput' && d.deviceId);
      setAudioInputs(inputs);
      if (!selectedInput && inputs.length > 0) setSelectedInput(inputs[0].deviceId);
    }).catch(() => addToast('Could not detect audio devices', 'error'));
  }, []);

  const initAudio = async (deviceId?: string) => {
    try {
      const constraints: MediaStreamConstraints = {
        audio: {
          echoCancellation: false, noiseSuppression: false, autoGainControl: false,
          channelCount: 1, sampleRate: 48000,
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        },
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      setLocalStream(stream);
      setAudioInitialized(true);
      addToast('Audio initialized', 'success');
      return stream;
    } catch (err) {
      console.error('[audio] failed:', err);
      addToast('Microphone access denied. Check permissions.', 'error');
      throw err;
    }
  };

  const handleInitAudio = async () => {
    try { await initAudio(selectedInput || undefined); }
    catch {}
  };

  const handleDeviceChange = async (deviceId: string) => {
    setSelectedInput(deviceId);
    if (audioInitialized) await initAudio(deviceId);
  };

  const toggleAudio = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach((t) => { t.enabled = !audioEnabled; });
      setAudioEnabled(!audioEnabled);
      addToast(audioEnabled ? 'Microphone muted' : 'Microphone unmuted', 'info');
    }
  };

  useEffect(() => {
    const handleJoined = (user: UserInfo) => {
      setUsers((prev) => [...prev, user]);
      addToast(`${user.username} joined the room`, 'info');
    };
    const handleLeft = (userId: string) => {
      const user = users.find((u) => u.id === userId);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      instrumentWebRTC.removePeer(userId);
      if (user) addToast(`${user.username} left`, 'info');
    };
    socket.on('user-joined', handleJoined);
    socket.on('user-left', handleLeft);
    return () => { socket.off('user-joined', handleJoined); socket.off('user-left', handleLeft); };
  }, [socket, users]);

  useEffect(() => {
    socket.on('audio-stream-request', async ({ from }: { from: string }) => {
      if (audioInitialized && localStream) instrumentWebRTC.initiateConnection(from);
    });
    return () => { socket.off('audio-stream-request'); };
  }, [socket, audioInitialized, localStream, instrumentWebRTC]);

  const requestAudio = (targetId: string) => {
    socket.emit('request-audio-stream', targetId);
    addToast('Audio request sent', 'info');
  };

  const handlePeerVolumeChange = (peerId: string, volume: number) => {
    setPeerVolumes((prev) => ({ ...prev, [peerId]: { ...prev[peerId], volume } }));
  };
  const handlePeerLatencyChange = (peerId: string, latency: number) => {
    setPeerVolumes((prev) => ({ ...prev, [peerId]: { ...prev[peerId], latency } }));
  };

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomId).then(() => addToast('Room code copied!', 'success'))
      .catch(() => addToast('Failed to copy', 'error'));
  };

  const otherUsers = users.filter((u) => u.id !== socket.id);

  const openMobilePanel = (tab: 'peers' | 'chat' | 'tracks' | 'screen') => setMobilePanel(tab);
  const closeMobilePanel = () => setMobilePanel(null);

  const renderTabContent = (tab: string) => {
    switch (tab) {
      case 'peers':
        return (
          <PeerList
            users={otherUsers} localUsername={username} audioInitialized={audioInitialized}
            onRequestAudio={requestAudio} onInitAudio={handleInitAudio}
            audioInputs={audioInputs} selectedInput={selectedInput} onDeviceChange={handleDeviceChange}
            audioEnabled={audioEnabled} onToggleAudio={toggleAudio}
            peerVolumes={peerVolumes} onPeerVolumeChange={handlePeerVolumeChange}
            onPeerLatencyChange={handlePeerLatencyChange}
          />
        );
      case 'chat': return <Chat socket={socket} roomId={roomId} username={username} />;
      case 'tracks': return <TrackMixer socket={socket} externalLyrics={lyricsText} onExternalLyricsChange={setLyricsText} externalTabs={tabsText} onExternalTabsChange={setTabsText} />;
      case 'screen': return <ScreenShare socket={socket} username={username} />;
      default: return null;
    }
  };

  return (
    <div className="room">
      <Toast toasts={toasts} onRemove={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />

      <header className="room-header" role="banner">
        <div className="room-info">
          <h2>
            <span className="sr-only">Room: </span>
            <span className="room-code">{roomId}</span>
          </h2>
          <button className="btn-xs btn-secondary" onClick={copyRoomCode} aria-label="Copy room code">Copy</button>
          <span className="user-count" aria-label={`${otherUsers.length + 1} connected`}>{otherUsers.length + 1} online</span>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          <button
            className={`btn-xs ${floatingPanels.lyrics.visible ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => togglePanel('lyrics')}
            title="Toggle Lyrics"
            aria-label="Toggle lyrics panel"
          >
            🎤 Lyrics
          </button>
          <button
            className={`btn-xs ${floatingPanels.tabs.visible ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => togglePanel('tabs')}
            title="Toggle Tabs"
            aria-label="Toggle tabs panel"
          >
            🎸 Tabs
          </button>
          <button
            className="theme-toggle"
            onClick={onToggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
          <button className="btn-sm btn-danger" onClick={onLeave}>Leave</button>
        </div>
      </header>

      <div className="room-body">
        {/* Desktop sidebar */}
        <aside
          className={`room-sidebar ${mobilePanel ? 'visible' : ''}`}
          style={{ width: sidebarWidth, minWidth: sidebarWidth }}
          role="tablist"
          aria-label="Room panels"
        >
          <div className="sidebar-tabs" role="tablist">
            <button className={`tab ${activeTab === 'peers' ? 'active' : ''}`} onClick={() => setActiveTab('peers')} role="tab" aria-selected={activeTab === 'peers'} aria-controls="panel-peers">Players</button>
            <button className={`tab ${activeTab === 'chat' ? 'active' : ''}`} onClick={() => setActiveTab('chat')} role="tab" aria-selected={activeTab === 'chat'} aria-controls="panel-chat">Chat</button>
            <button className={`tab ${activeTab === 'tracks' ? 'active' : ''}`} onClick={() => setActiveTab('tracks')} role="tab" aria-selected={activeTab === 'tracks'} aria-controls="panel-tracks">Tracks</button>
            <button className={`tab ${activeTab === 'screen' ? 'active' : ''}`} onClick={() => setActiveTab('screen')} role="tab" aria-selected={activeTab === 'screen'} aria-controls="panel-screen">Screen</button>
          </div>
          <div className="sidebar-content" role="tabpanel" id={`panel-${activeTab}`}>
            {renderTabContent(activeTab)}
          </div>
          <div className="sidebar-resize-handle" onPointerDown={(e) => { e.preventDefault(); setSidebarResizing(true); }} aria-label="Resize sidebar" />
        </aside>

        {/* Mobile panel overlay */}
        {isMobile && mobilePanel && (
          <div className="mobile-panel active" role="dialog" aria-label={mobilePanel}>
            <div className="mobile-panel-header">
              <h3>{mobilePanel.charAt(0).toUpperCase() + mobilePanel.slice(1)}</h3>
              <button className="btn-sm btn-ghost" onClick={closeMobilePanel} aria-label="Close panel">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="mobile-panel-content">{renderTabContent(mobilePanel)}</div>
          </div>
        )}

        {/* Main area */}
        <main className="room-main" id="panel-peers" role="main">
          <AudioStream
            socket={socket} localStream={localStream} audioInitialized={audioInitialized}
            audioEnabled={audioEnabled} onInitAudio={handleInitAudio} onToggleAudio={toggleAudio}
            users={otherUsers} onRequestAudio={requestAudio} username={username}
          />

          {/* Floating panels */}
          <LyricsPanel
            id="lyrics"
            zIndex={floatingPanels.lyrics.zIndex}
            visible={floatingPanels.lyrics.visible}
            onClose={() => setFloatingPanels((prev) => ({ ...prev, lyrics: { ...prev.lyrics, visible: false } }))}
            onFocus={() => focusPanel('lyrics')}
            text={lyricsText}
            onChange={setLyricsText}
          />
          <TabsPanel
            id="tabs"
            zIndex={floatingPanels.tabs.zIndex}
            visible={floatingPanels.tabs.visible}
            onClose={() => setFloatingPanels((prev) => ({ ...prev, tabs: { ...prev.tabs, visible: false } }))}
            onFocus={() => focusPanel('tabs')}
            text={tabsText}
            onChange={setTabsText}
          />
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav className="mobile-nav" aria-label="Mobile navigation">
        <div className="mobile-nav-inner">
          <button className={`mobile-nav-btn ${activeTab === 'peers' ? 'active' : ''}`} onClick={() => openMobilePanel('peers')} aria-label="Players">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <span>Players</span>
          </button>
          <button className={`mobile-nav-btn ${activeTab === 'chat' ? 'active' : ''}`} onClick={() => openMobilePanel('chat')} aria-label="Chat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span>Chat</span>
          </button>
          <button className={`mobile-nav-btn ${activeTab === 'tracks' ? 'active' : ''}`} onClick={() => openMobilePanel('tracks')} aria-label="Tracks">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
            </svg>
            <span>Tracks</span>
          </button>
          <button className={`mobile-nav-btn ${activeTab === 'screen' ? 'active' : ''}`} onClick={() => openMobilePanel('screen')} aria-label="Screen share">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
            </svg>
            <span>Screen</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
