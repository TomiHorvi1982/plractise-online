import { useState, useCallback, useEffect } from 'react';
import { Socket } from 'socket.io-client';
import { connectSocket, disconnectSocket } from './utils/socket';
import Login from './components/Login';
import RoomManager from './components/RoomManager';
import Room from './components/Room';

type AppState =
  | { screen: 'login' }
  | { screen: 'rooms' }
  | { screen: 'room'; roomId: string; socket: Socket }
  | { screen: 'error'; message: string };

export default function App() {
  const [state, setState] = useState<AppState>({ screen: 'login' });
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window === 'undefined') return 'dark';
    const stored = localStorage.getItem('jamstream-theme');
    if (stored === 'light' || stored === 'dark') return stored;
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('jamstream-theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const handleLogin = useCallback((name: string) => {
    setUsername(name);
    setState({ screen: 'rooms' });
  }, []);

  const connectAndNavigate = useCallback((username: string, handler: (socket: Socket) => void) => {
    setLoading(true);
    try {
      const socket = connectSocket(username);
      const onConnect = () => {
        handler(socket);
      };
      const onError = (err: Error) => {
        setState({ screen: 'error', message: err.message || 'Connection failed. Is the server running?' });
        setLoading(false);
      };
      socket.on('connect', onConnect);
      socket.on('connect_error', onError);
    } catch (err: any) {
      setState({ screen: 'error', message: err.message || 'Connection failed' });
      setLoading(false);
    }
  }, []);

  const handleCreateRoom = useCallback(() => {
    connectAndNavigate(username, (socket) => {
      socket.emit('create-room', (roomId: string) => {
        setState({ screen: 'room', roomId, socket });
        setLoading(false);
      });
    });
  }, [username, connectAndNavigate]);

  const handleJoinRoom = useCallback((roomId: string) => {
    connectAndNavigate(username, (socket) => {
      socket.emit('join-room', roomId, (result: { success: boolean; error?: string }) => {
        if (result.success) {
          setState({ screen: 'room', roomId, socket });
        } else {
          setState({ screen: 'error', message: result.error || 'Room not found' });
        }
        setLoading(false);
      });
    });
  }, [username, connectAndNavigate]);

  const handleLeaveRoom = useCallback(() => {
    disconnectSocket();
    setState({ screen: 'rooms' });
  }, []);

  const handleBackToLogin = useCallback(() => {
    disconnectSocket();
    setState({ screen: 'login' });
  }, []);

  switch (state.screen) {
    case 'login':
      return <Login onLogin={handleLogin} />;

    case 'rooms':
      return (
        <div className="app">
          <div className="top-bar">
            <span className="username-display">
              <span aria-hidden="true">&#9679;</span> Logged in as: <strong>{username}</strong>
            </span>
            <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
              <button
                className="theme-toggle"
                onClick={toggleTheme}
                aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              >
                {theme === 'dark' ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                  </svg>
                )}
              </button>
              <button className="btn-sm btn-ghost" onClick={handleBackToLogin}>
                Change
              </button>
            </div>
          </div>
          <RoomManager
            onCreateRoom={handleCreateRoom}
            onJoinRoom={handleJoinRoom}
            loading={loading}
          />
        </div>
      );

    case 'room':
      return (
        <Room
          socket={state.socket}
          roomId={state.roomId}
          username={username}
          onLeave={handleLeaveRoom}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      );

    case 'error':
      return (
        <div className="error-screen" role="alert">
          <h2>Connection Error</h2>
          <p>{state.message}</p>
          <button className="btn-primary" onClick={handleBackToLogin}>
            Try Again
          </button>
        </div>
      );
  }
}
