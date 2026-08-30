import React from 'react';

const PRICE_PER_SEAT_USD = 15.0;
const USD_TO_INR = 83.0;

export default function CheckoutPanel({ 
  selectedSeats, 
  onDeselectSeat, 
  currentShowId, 
  shows, 
  onOpenRazorpay,
  statusMsg
}) {
  const currentShow = shows?.find(s => s.id === currentShowId);
  const selectedList = Array.from(selectedSeats).sort();
  const totalPriceUSD = (selectedSeats.size * PRICE_PER_SEAT_USD);
  const totalPriceINR = Math.round(totalPriceUSD * USD_TO_INR);

  return (
    <div className="checkout-card">
      <div className="card-title">
        <span>Ticket Summary</span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2">
          <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0"/>
        </svg>
      </div>

      <div className="selected-seats-container" id="selected-seats-box">
        {selectedList.length === 0 ? (
          <div className="empty-seats-msg">No seats selected</div>
        ) : (
          selectedList.map((id) => (
            <div key={id} className="seat-chip">
              <span>{id}</span>
              <span 
                style={{ cursor: 'pointer', opacity: 0.7 }}
                onClick={() => onDeselectSeat(id)}
              >
                &times;
              </span>
            </div>
          ))
        )}
      </div>

      <div className="price-summary">
        <div className="price-row">
          <span>Price per seat</span>
          <span>₹1,245 (USD $15.00)</span>
        </div>
        <div className="price-row">
          <span>Selected seats</span>
          <span id="summary-count">{selectedSeats.size}</span>
        </div>
        <div className="price-row total">
          <span>Total Payable</span>
          <span id="summary-total" style={{ color: 'var(--accent-cyan)' }}>
            ₹{totalPriceINR.toLocaleString('en-IN')} <span style={{ fontSize: 12, opacity: 0.7 }}>(${totalPriceUSD.toFixed(2)})</span>
          </span>
        </div>
      </div>

      <button 
        className="btn-primary" 
        onClick={onOpenRazorpay} 
        disabled={selectedSeats.size === 0}
        id="book"
        style={{
          background: 'linear-gradient(135deg, #1084d0, #0c2340)',
          border: '1px solid rgba(16, 132, 208, 0.4)'
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
        </svg>
        <span>Proceed to Pay via Razorpay</span>
      </button>

      {statusMsg && (
        <div id="status" className={`status-alert ${statusMsg.type}`}>
          {statusMsg.text}
        </div>
      )}
    </div>
  );
}
