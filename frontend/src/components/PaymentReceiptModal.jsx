import React from 'react';

export default function PaymentReceiptModal({ receipt, onClose }) {
  if (!receipt) return null;

  return (
    <div className="rzp-overlay">
      <div className="rzp-receipt-card">
        
        <div className="receipt-success-badge">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.8">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>

        <h2 className="receipt-title">Payment Successful!</h2>
        <p className="receipt-subtitle">Verified &amp; Processed via Razorpay</p>

        <div className="receipt-amount-display">{receipt.amount}</div>

        <div className="receipt-details-table">
          <div className="receipt-row">
            <span className="receipt-label">Razorpay Payment ID</span>
            <span className="receipt-val mono">{receipt.paymentId}</span>
          </div>

          <div className="receipt-row">
            <span className="receipt-label">Booking ID</span>
            <span className="receipt-val highlight">#{receipt.bookingId}</span>
          </div>

          <div className="receipt-row">
            <span className="receipt-label">Payment Method</span>
            <span className="receipt-val">{receipt.method}</span>
          </div>

          <div className="receipt-row">
            <span className="receipt-label">Movie Show</span>
            <span className="receipt-val">{receipt.showTitle || receipt.showId}</span>
          </div>

          <div className="receipt-row">
            <span className="receipt-label">Seats Reserved</span>
            <span className="receipt-val mono">{receipt.seats.join(', ')}</span>
          </div>

          <div className="receipt-row">
            <span className="receipt-label">Paid At</span>
            <span className="receipt-val">{new Date(receipt.paidAt).toLocaleTimeString()}</span>
          </div>
        </div>

        <div className="receipt-status-banner">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          <span>Payment Verified &bull; Seats Confirmed in Database</span>
        </div>

        <button className="btn-primary" onClick={onClose} style={{ marginTop: 24 }}>
          Done &amp; View My Bookings
        </button>

      </div>
    </div>
  );
}
