import React from 'react';

export default function MovieCatalog({ shows, selectedShowId, onSelectShow }) {
  const movieDetails = {
    s1: {
      tag: "Sci-Fi / Action",
      rating: "8.8 / 10",
      duration: "2h 28m",
      director: "Christopher Nolan",
      banner: "linear-gradient(135deg, #1e1b4b, #311b92)",
      description: "A thief who steals corporate secrets through dream-sharing technology is given the inverse task of planting an idea."
    },
    s2: {
      tag: "Sci-Fi / Adventure",
      rating: "8.7 / 10",
      duration: "2h 49m",
      director: "Christopher Nolan",
      banner: "linear-gradient(135deg, #0c4a6e, #075985)",
      description: "When Earth becomes uninhabitable, a team of ex-NASA pilots travel through a wormhole to find a new home."
    }
  };

  return (
    <div>
      <div class="catalog-header">
        <h2 class="catalog-title">Now Showing in Theaters</h2>
        <p class="catalog-subtitle">Select a movie screening to pick your seats and proceed with real-time booking</p>
      </div>

      <div class="movies-grid">
        {shows.map((show) => {
          const details = movieDetails[show.id] || {
            tag: "Feature Film",
            rating: "8.5 / 10",
            duration: "2h 00m",
            director: "CineVerse Studios",
            banner: "linear-gradient(135deg, #1e293b, #0f172a)",
            description: "Experience high fidelity audio and real-time interactive seating in Screen 1."
          };
          const isSelected = show.id === selectedShowId;

          return (
            <div key={show.id} class="movie-card">
              <div class="movie-poster-wrap" style={{ background: details.banner }}>
                <span class="movie-badge">{details.tag}</span>
                <div style={{ textAlign: 'center', color: '#fff', zIndex: 1, padding: 20 }}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="1.5" style={{ marginBottom: 8 }}>
                    <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/>
                    <line x1="7" y1="2" x2="7" y2="22"/>
                    <line x1="17" y1="2" x2="17" y2="22"/>
                    <line x1="2" y1="12" x2="22" y2="12"/>
                    <line x1="2" y1="7" x2="7" y2="7"/>
                    <line x1="2" y1="17" x2="7" y2="17"/>
                    <line x1="17" y1="17" x2="22" y2="17"/>
                    <line x1="17" y1="7" x2="22" y2="7"/>
                  </svg>
                  <div style={{ fontSize: 13, fontWeight: 700, opacity: 0.9 }}>Dolby Atmos Cinema</div>
                </div>
              </div>

              <div class="movie-card-body">
                <h3 class="movie-title">{show.title}</h3>
                <div class="movie-meta-list">
                  <div class="movie-meta-item">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-amber)" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                    <span>IMDb Rating: {details.rating} &bull; {details.duration}</span>
                  </div>
                  <div class="movie-meta-item">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-cyan)" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    <span>Director: {details.director}</span>
                  </div>
                </div>

                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, flex: 1, lineHeight: 1.5 }}>
                  {details.description}
                </p>

                <button 
                  class={`btn-primary ${isSelected ? 'selected' : ''}`}
                  onClick={() => onSelectShow(show.id)}
                  style={{
                    background: isSelected 
                      ? 'linear-gradient(135deg, var(--accent-emerald), #059669)' 
                      : undefined
                  }}
                >
                  <span>{isSelected ? '✓ Currently Selected' : 'Select Seats & Book'}</span>
                  {!isSelected && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
