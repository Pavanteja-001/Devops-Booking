import React from 'react';

export default function Navbar({ 
  user, 
  wsStatus,
  appVersion, 
  activeTab, 
  setActiveTab, 
  onLogout 
}) {
  return (
    <header>
      <div class="brand" onClick={() => setActiveTab('movies')}>
        <div class="brand-logo">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M7 4v16M17 4v16M3 8h4M3 12h18M3 16h4M17 8h4M17 16h4"/>
          </svg>
        </div>
        <div>
          <h1 class="brand-title">CINEVERSE</h1>
          <p class="brand-subtitle">Seat Booking Microservices</p>
        </div>
      </div>

      {user && (
        <div class="nav-tabs">
          <button 
            class={`nav-tab-btn ${activeTab === 'movies' ? 'active' : ''}`}
            onClick={() => setActiveTab('movies')}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2 8h20M2 16h20M7 3v18M17 3v18"/>
            </svg>
            Movies
          </button>
          <button 
            class={`nav-tab-btn ${activeTab === 'theater' ? 'active' : ''}`}
            onClick={() => setActiveTab('theater')}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>
            </svg>
            Seat Map
          </button>
          <button 
            class={`nav-tab-btn ${activeTab === 'bookings' ? 'active' : ''}`}
            onClick={() => setActiveTab('bookings')}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            My Bookings
          </button>
        </div>
      )}

      <div class="header-actions">
        <div class="status-badge">
          <div class={`status-dot ${wsStatus}`}></div>
          <span>
            {wsStatus === 'connected' ? 'Live WS Connected' : wsStatus === 'connecting' ? 'Connecting...' : 'Offline'}
          </span>
        </div>

        <span class="version-chip">version: {appVersion}</span>

        {user && (
          <div class="user-profile">
            <div class="user-avatar">{user.username.charAt(0).toUpperCase()}</div>
            <span class="user-name">@{user.username}</span>
            <button class="btn-ghost" onClick={onLogout}>Logout</button>
          </div>
        )}
      </div>
    </header>
  );
}
