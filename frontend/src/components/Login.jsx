import React, { useState } from 'react';

export default function Login({ onLogin, apiBase }) {
  const [username, setUsername] = useState('testuser');
  const [password, setPassword] = useState('password');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Please enter both username and password.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${apiBase}/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setError(errData.error || 'Authentication failed. Check credentials.');
        setLoading(false);
        return;
      }

      const data = await res.json();
      onLogin({ token: data.token, username: data.username || username.trim() });
    } catch (err) {
      setError('Network error connecting to authentication service: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemo = (u, p) => {
    setUsername(u);
    setPassword(p);
  };

  return (
    <div class="auth-container">
      <div class="auth-icon">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M13 12H3"/>
        </svg>
      </div>

      <h2 class="auth-title">Welcome Back</h2>
      <p class="auth-subtitle">Sign in to choose your movie seats</p>

      {error && <div class="status-alert error" style={{ marginBottom: 18 }}>{error}</div>}

      <form onSubmit={handleSubmit}>
        <div class="form-group">
          <label class="form-label" htmlFor="username">Username</label>
          <input 
            id="username"
            class="form-input" 
            placeholder="e.g. testuser"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={loading}
          />
        </div>

        <div class="form-group">
          <label class="form-label" htmlFor="password">Password</label>
          <input 
            id="password"
            type="password"
            class="form-input" 
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
          />
        </div>

        <button type="submit" class="btn-primary" disabled={loading} id="login">
          <span>{loading ? 'Authenticating...' : 'Sign In'}</span>
          {!loading && (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          )}
        </button>
      </form>

      <div class="quick-demo">
        Quick Demo Credentials: 
        <button class="quick-demo-btn" type="button" onClick={() => handleQuickDemo('testuser', 'password')}>@testuser</button>
        <button class="quick-demo-btn" type="button" onClick={() => handleQuickDemo('user2', 'password')}>@user2</button>
      </div>
    </div>
  );
}
