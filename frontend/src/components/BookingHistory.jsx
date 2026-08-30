import React, { useEffect } from 'react';

export default function BookingHistory({ bookings, onRefresh }) {
  useEffect(() => {
    onRefresh();
  }, []);

  return (
    <div class="bookings-card">
      <div class="card-title">
        <span>My Bookings</span>
        <button 
          class="btn-ghost" 
          onClick={onRefresh}
          style={{ padding: '4px 10px', fontSize: 11 }}
          id="refresh-bookings"
        >
          Refresh
        </button>
      </div>

      <div class="booking-list" id="booking-list">
        {bookings.length === 0 ? (
          <div class="empty-seats-msg">No active bookings found</div>
        ) : (
          bookings.map((b) => (
            <div key={b.id} class="booking-item">
              <div class="booking-header">
                <span>Booking #{b.id}</span>
                <span class="booking-status">{b.status}</span>
              </div>
              <div>
                Seats: <span class="booking-seats">{Array.isArray(b.seats) ? b.seats.join(', ') : b.seats}</span>
              </div>
              <div class="booking-time">
                {b.created_at ? new Date(b.created_at).toLocaleTimeString() : 'Just now'} &bull; Show: {b.show_id}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
