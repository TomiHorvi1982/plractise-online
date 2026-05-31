import { useState } from 'react';

interface LoginProps {
  onLogin: (username: string) => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = username.trim();
    if (!trimmed) {
      setError('Enter a username');
      return;
    }
    if (trimmed.length > 30) {
      setError('Max 30 characters');
      return;
    }
    onLogin(trimmed);
  };

  return (
    <div className="login-container">
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
            onChange={(e) => { setUsername(e.target.value); setError(''); }}
            maxLength={30}
            autoFocus
            autoComplete="username"
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={error ? 'login-error' : undefined}
          />
          {error && (
            <p className="error-text" id="login-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit">Enter</button>
        </form>
      </div>
    </div>
  );
}
