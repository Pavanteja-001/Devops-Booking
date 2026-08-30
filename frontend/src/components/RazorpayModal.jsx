import React, { useState } from 'react';

export default function RazorpayModal({ 
  amountInINR, 
  seats, 
  showTitle, 
  user, 
  onClose, 
  onPaymentSuccess 
}) {
  const [method, setMethod] = useState('card'); // 'card' | 'upi' | 'netbanking' | 'wallet'
  
  // Card form state
  const [cardNumber, setCardNumber] = useState('4532 8912 7312 9014');
  const [expiry, setExpiry] = useState('12/28');
  const [cvv, setCvv] = useState('892');
  const [cardName, setCardName] = useState(user?.username ? user.username.toUpperCase() : 'DEMO USER');

  // UPI state
  const [upiId, setUpiId] = useState(`${user?.username || 'user'}@okicici`);
  const [selectedUpiApp, setSelectedUpiApp] = useState('gpay');

  // Netbanking state
  const [selectedBank, setSelectedBank] = useState('hdfc');

  // Processing & OTP state
  const [step, setStep] = useState('checkout'); // 'checkout' | 'otp' | 'processing'
  const [otp, setOtp] = useState('789123');

  const formattedAmount = `₹${(amountInINR).toLocaleString('en-IN')}`;

  const handleCardNumberChange = (e) => {
    let val = e.target.value.replace(/\D/g, '').substring(0, 16);
    val = val.replace(/(.{4})/g, '$1 ').trim();
    setCardNumber(val);
  };

  const handleStartPayment = (e) => {
    e.preventDefault();
    setStep('otp');
  };

  const handleVerifyOtp = (e) => {
    e.preventDefault();
    setStep('processing');

    setTimeout(() => {
      const paymentId = `pay_${Math.random().toString(36).substring(2, 12).toUpperCase()}`;
      const orderId = `order_${Math.random().toString(36).substring(2, 10)}`;

      onPaymentSuccess({
        paymentId,
        orderId,
        method: method.toUpperCase(),
        amount: formattedAmount,
        seats,
        paidAt: new Date().toISOString()
      });
    }, 1800);
  };

  return (
    <div className="rzp-overlay">
      <div className="rzp-modal">
        
        {/* Razorpay Brand Header */}
        <div className="rzp-header">
          <div className="rzp-brand-info">
            <div className="rzp-logo">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <div className="rzp-merchant">CineVerse Entertainment</div>
              <div className="rzp-secure-tag">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5">
                  <rect x="3" y="11" width="18" height="11" rx="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                <span>Razorpay Trusted Checkout</span>
              </div>
            </div>
          </div>

          <div className="rzp-amount-badge">
            <div className="rzp-amount-label">Amount to Pay</div>
            <div className="rzp-amount-val">{formattedAmount}</div>
          </div>

          <button className="rzp-close-btn" onClick={onClose}>&times;</button>
        </div>

        {/* Order Details Banner */}
        <div className="rzp-order-banner">
          <div>
            <div className="rzp-order-title">{showTitle}</div>
            <div className="rzp-order-sub">Seats: <strong>{seats.join(', ')}</strong> ({seats.length} Tickets)</div>
          </div>
          <div className="rzp-badge-inr">INR Payments</div>
        </div>

        {step === 'checkout' && (
          <div className="rzp-body">
            {/* Left Tabs */}
            <div className="rzp-tabs">
              <button 
                className={`rzp-tab-btn ${method === 'card' ? 'active' : ''}`}
                onClick={() => setMethod('card')}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                Card
              </button>
              <button 
                className={`rzp-tab-btn ${method === 'upi' ? 'active' : ''}`}
                onClick={() => setMethod('upi')}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
                UPI / QR
              </button>
              <button 
                className={`rzp-tab-btn ${method === 'netbanking' ? 'active' : ''}`}
                onClick={() => setMethod('netbanking')}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3"/></svg>
                Netbanking
              </button>
              <button 
                className={`rzp-tab-btn ${method === 'wallet' ? 'active' : ''}`}
                onClick={() => setMethod('wallet')}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4"/><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/></svg>
                Wallets
              </button>
            </div>

            {/* Right Tab Contents */}
            <div className="rzp-tab-content">
              {method === 'card' && (
                <form onSubmit={handleStartPayment}>
                  <div className="rzp-form-group">
                    <label className="rzp-label">Card Number</label>
                    <input 
                      className="rzp-input" 
                      placeholder="4532 0000 0000 0000"
                      value={cardNumber}
                      onChange={handleCardNumberChange}
                      required
                    />
                  </div>

                  <div className="rzp-form-row">
                    <div className="rzp-form-group">
                      <label className="rzp-label">Expiry (MM/YY)</label>
                      <input 
                        className="rzp-input" 
                        placeholder="12/28"
                        value={expiry}
                        onChange={(e) => setExpiry(e.target.value)}
                        required
                      />
                    </div>
                    <div className="rzp-form-group">
                      <label className="rzp-label">CVV</label>
                      <input 
                        className="rzp-input" 
                        type="password"
                        placeholder="123"
                        maxLength="4"
                        value={cvv}
                        onChange={(e) => setCvv(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div className="rzp-form-group">
                    <label className="rzp-label">Cardholder Name</label>
                    <input 
                      className="rzp-input" 
                      placeholder="Name on card"
                      value={cardName}
                      onChange={(e) => setCardName(e.target.value)}
                      required
                    />
                  </div>

                  <button type="submit" className="rzp-pay-btn">
                    Pay {formattedAmount} via Card
                  </button>
                </form>
              )}

              {method === 'upi' && (
                <form onSubmit={handleStartPayment}>
                  <div className="rzp-upi-apps">
                    <div 
                      className={`rzp-upi-card ${selectedUpiApp === 'gpay' ? 'selected' : ''}`}
                      onClick={() => setSelectedUpiApp('gpay')}
                    >
                      <div className="upi-app-name">Google Pay</div>
                      <div className="upi-app-sub">Instant UPI</div>
                    </div>
                    <div 
                      className={`rzp-upi-card ${selectedUpiApp === 'phonepe' ? 'selected' : ''}`}
                      onClick={() => setSelectedUpiApp('phonepe')}
                    >
                      <div className="upi-app-name">PhonePe</div>
                      <div className="upi-app-sub">UPI / QR</div>
                    </div>
                    <div 
                      className={`rzp-upi-card ${selectedUpiApp === 'paytm' ? 'selected' : ''}`}
                      onClick={() => setSelectedUpiApp('paytm')}
                    >
                      <div className="upi-app-name">Paytm UPI</div>
                      <div className="upi-app-sub">Fast Checkout</div>
                    </div>
                  </div>

                  <div className="rzp-form-group" style={{ marginTop: 16 }}>
                    <label className="rzp-label">Enter UPI VPA ID</label>
                    <input 
                      className="rzp-input" 
                      placeholder="username@upi"
                      value={upiId}
                      onChange={(e) => setUpiId(e.target.value)}
                      required
                    />
                  </div>

                  <button type="submit" className="rzp-pay-btn">
                    Pay {formattedAmount} via {selectedUpiApp.toUpperCase()}
                  </button>
                </form>
              )}

              {method === 'netbanking' && (
                <form onSubmit={handleStartPayment}>
                  <div className="rzp-bank-grid">
                    {[
                      { id: 'hdfc', name: 'HDFC Bank' },
                      { id: 'icici', name: 'ICICI Bank' },
                      { id: 'sbi', name: 'State Bank of India' },
                      { id: 'axis', name: 'Axis Bank' },
                      { id: 'kotak', name: 'Kotak Mahindra' }
                    ].map(bank => (
                      <div 
                        key={bank.id}
                        className={`rzp-bank-tile ${selectedBank === bank.id ? 'selected' : ''}`}
                        onClick={() => setSelectedBank(bank.id)}
                      >
                        <div className="bank-icon">🏦</div>
                        <div className="bank-name">{bank.name}</div>
                      </div>
                    ))}
                  </div>

                  <button type="submit" className="rzp-pay-btn" style={{ marginTop: 20 }}>
                    Pay {formattedAmount} via Netbanking
                  </button>
                </form>
              )}

              {method === 'wallet' && (
                <form onSubmit={handleStartPayment}>
                  <div className="rzp-wallet-list">
                    <div className="rzp-wallet-item selected">
                      <div>
                        <strong>Paytm Wallet</strong>
                        <div style={{ fontSize: 11, opacity: 0.7 }}>Linked Mobile Number</div>
                      </div>
                      <span className="wallet-badge">Active</span>
                    </div>
                    <div className="rzp-wallet-item">
                      <div>
                        <strong>Amazon Pay Balance</strong>
                        <div style={{ fontSize: 11, opacity: 0.7 }}>Instant 1-Click Pay</div>
                      </div>
                    </div>
                  </div>

                  <button type="submit" className="rzp-pay-btn" style={{ marginTop: 20 }}>
                    Pay {formattedAmount} via Wallet
                  </button>
                </form>
              )}
            </div>
          </div>
        )}

        {step === 'otp' && (
          <div className="rzp-otp-screen">
            <div className="otp-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#1084d0" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
            <h3>3D Secure Bank Verification</h3>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
              An OTP has been sent to your registered mobile number for authentication of <strong>{formattedAmount}</strong>.
            </p>

            <form onSubmit={handleVerifyOtp} style={{ maxWidth: 300, margin: '0 auto' }}>
              <div className="rzp-form-group">
                <label className="rzp-label" style={{ textAlign: 'center' }}>Enter 6-Digit OTP</label>
                <input 
                  className="rzp-input" 
                  style={{ textAlign: 'center', fontSize: 20, letterSpacing: 6, fontWeight: 700 }}
                  maxLength="6"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className="rzp-pay-btn" style={{ marginTop: 16 }}>
                Authorize &amp; Complete Payment
              </button>
            </form>
          </div>
        )}

        {step === 'processing' && (
          <div className="rzp-processing-screen">
            <div className="rzp-spinner"></div>
            <h3 style={{ marginTop: 20, color: '#0c2340' }}>Processing Payment...</h3>
            <p style={{ fontSize: 13, color: '#64748b', marginTop: 6 }}>
              Verifying transaction with Razorpay Payment Gateway gateway...
            </p>
          </div>
        )}

        {/* Footer Security Shield */}
        <div className="rzp-footer">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          <span>Secured by 256-bit SSL Encryption &bull; Razorpay Payment Engine</span>
        </div>

      </div>
    </div>
  );
}
