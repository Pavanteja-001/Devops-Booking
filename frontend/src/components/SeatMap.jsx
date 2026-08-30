import React from 'react';

const PRICE_PER_SEAT = 16.0;
const ROWS = ['A', 'B', 'C', 'D', 'E'];
const COLS = Array.from({ length: 10 }, (_, i) => i + 1);

export default function SeatMap({ 
  seatStatus, 
  selectedSeats, 
  onToggleSeat, 
  shows, 
  currentShowId, 
  onSelectShow 
}) {
  const currentShow = shows.find(s => s.id === currentShowId);

  // Compute counts
  let counts = { available: 0, selected: selectedSeats.size, held: 0, booked: 0 };
  
  ROWS.forEach(row => {
    COLS.forEach(col => {
      const id = `${row}${col}`;
      const status = seatStatus[id] || 'available';
      if (selectedSeats.has(id)) {
        // Selected override
      } else if (status in counts) {
        counts[status]++;
      }
    });
  });

  return (
    <div class="theater-card">
      <div class="show-selector-bar">
        <div class="show-info">
          <div class="show-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2 8h20M2 16h20M7 3v18M17 3v18"/>
            </svg>
          </div>
          <div>
            <div class="show-title-label" id="show-title">
              {currentShow ? currentShow.title : (currentShowId === 's1' ? 'Inception - 7:00 PM' : 'Interstellar - 9:30 PM')}
            </div>
            <div class="show-meta">Main Hall &bull; Dolby Cinema &bull; 50 Seats Matrix</div>
          </div>
        </div>

        <div>
          <select 
            id="show-select"
            class="select-show-dropdown"
            value={currentShowId}
            onChange={(e) => onSelectShow(e.target.value)}
          >
            {shows.map((s) => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Screen Curve Graphic */}
      <div class="screen-container">
        <div class="screen-glow"></div>
        <div class="screen-label">STAGE / CINEMA SCREEN</div>
      </div>

      {/* Seat Matrix Grid */}
      <div class="grid-wrapper">
        <div id="grid">
          {ROWS.map(row => (
            COLS.map(col => {
              const id = `${row}${col}`;
              const rawStatus = seatStatus[id] || 'available';
              const isSelected = selectedSeats.has(id);
              const isAvailable = rawStatus === 'available';

              let classNames = `seat ${rawStatus}`;
              if (isSelected) classNames += ' selected';

              return (
                <div
                  key={id}
                  class={classNames}
                  title={`Seat ${id} - $${PRICE_PER_SEAT.toFixed(2)} (${isSelected ? 'selected' : rawStatus})`}
                  onClick={() => {
                    if (isAvailable || isSelected) {
                      onToggleSeat(id);
                    }
                  }}
                >
                  {id}
                </div>
              );
            })
          ))}
        </div>
      </div>

      {/* Legend */}
      <div class="legend">
        <div class="legend-item">
          <div class="legend-box available"></div>
          <span>Available ({counts.available})</span>
        </div>
        <div class="legend-item">
          <div class="legend-box selected"></div>
          <span>Selected ({selectedSeats.size})</span>
        </div>
        <div class="legend-item">
          <div class="legend-box held"></div>
          <span>Held ({counts.held})</span>
        </div>
        <div class="legend-item">
          <div class="legend-box booked"></div>
          <span>Booked ({counts.booked})</span>
        </div>
      </div>
    </div>
  );
}
