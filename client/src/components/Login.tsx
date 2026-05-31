import { useState } from 'react';

interface LoginProps {
  onLogin: (username: string) => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);

  const trimmed = username.trim();
  const isEmpty = trimmed.length === 0;
  const isOverLimit = trimmed.length > 30;
  const canSubmit = !isEmpty && !isOverLimit && !isConnecting;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setIsConnecting(true);
    setError('');
    onLogin(trimmed);
  };

  return (
    <main className="login-container">
      <div className="login-card">
        <h1 className="logo">JamStream</h1>
        <p className="subtitle">Play music together in real-time</p>
        <form onSubmit={handleSubmit} aria-label="Login form">
          <label htmlFor="username-input" className="sr-only">Username</label>
          <input
            id="username-input"
            type="text"
            placeholder="Your username"
            value={username}
            onChange={(e) => { setUsername(e.target.value); setError(''); setIsConnecting(false); }}
            maxLength={30}
            autoFocus
            autoComplete="username"
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={error ? 'login-error' : undefined}
          />
          <div className={`char-counter${username.length >= 30 ? ' char-counter--limit' : ''}`} aria-live="polite">
            {username.length}/30
          </div>
          {error && (
            <p className="error-text" id="login-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" disabled={!canSubmit} aria-busy={isConnecting}>
            {isConnecting ? 'Connecting...' : 'Enter'}
          </button>
        </form>
      </div>
    </main>
  );
}
