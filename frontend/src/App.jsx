import React, { useState, useEffect, useRef } from 'react';
import Navbar from './components/Navbar';
import Login from './components/Login';
import MovieCatalog from './components/MovieCatalog';
import SeatMap from './components/SeatMap';
import CheckoutPanel from './components/CheckoutPanel';
import BookingHistory from './components/BookingHistory';
import RazorpayModal from './components/RazorpayModal';
import PaymentReceiptModal from './components/PaymentReceiptModal';

const API_BASE = window.location.port === "8090" ? `http://${window.location.hostname}:8082` : "http://localhost:8082";
const WS_BASE = window.location.port === "8090" ? `ws://${window.location.hostname}:8083/ws` : "ws://localhost:8083/ws";
const USD_TO_INR = 83.0;

export default function App() {
  const [user, setUser] = useState(() => {
    const token = localStorage.getItem('token');
    const username = localStorage.getItem('username');
    return token && username ? { token, username } : null;
  });

  const [activeTab, setActiveTab] = useState('movies');
  const [shows, setShows] = useState([
    { id: 's1', title: 'Inception - 7:00 PM' },
    { id: 's2', title: 'Interstellar - 9:30 PM' }
  ]);
  const [currentShowId, setCurrentShowId] = useState('s1');
  const [seatStatus, setSeatStatus] = useState({});
  const [selectedSeats, setSelectedSeats] = useState(new Set());
  const [wsStatus, setWsStatus] = useState('disconnected');
  const [appVersion, setAppVersion] = useState('v1.0.0');
  const [bookings, setBookings] = useState([]);

  // Razorpay Modals state at root level
  const [showRzpModal, setShowRzpModal] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [statusMsg, setStatusMsg] = useState(null);

  const wsRef = useRef(null);

  // Fetch Version & Shows on Mount
  useEffect(() => {
    fetch(`${API_BASE}/healthz`)
      .then(r => {
        const ver = r.headers.get("x-app-version") || "v1.0.0";
        setAppVersion(ver);
      })
      .catch(() => setAppVersion("v1.0.0"));

    fetchShows();
  }, []);

  const fetchShows = async () => {
    try {
      const res = await fetch(`${API_BASE}/shows`);
      if (res.ok) {
        const data = await res.json();
        if (data.shows && data.shows.length > 0) {
          setShows(data.shows);
        }
      }
    } catch (e) {
      console.warn("Could not fetch shows list:", e);
    }
  };

  // WebSocket Manager
  useEffect(() => {
    if (!user) {
      if (wsRef.current) wsRef.current.close();
      setWsStatus('disconnected');
      return;
    }

    setWsStatus('connecting');
    if (wsRef.current) wsRef.current.close();

    try {
      const ws = new WebSocket(WS_BASE);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsStatus('connected');
        ws.send(JSON.stringify({ showId: currentShowId }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "snapshot") {
            const map = Object.fromEntries(msg.seats.map((s) => [s.id, s.status]));
            setSeatStatus(map);
          } else if (msg.type === "update") {
            setSeatStatus((prev) => {
              const updated = { ...prev };
              for (const id of msg.seats) updated[id] = msg.status;
              return updated;
            });
          }
        } catch (err) {
          console.error("WebSocket message parse error:", err);
        }
      };

      ws.onclose = () => {
        setWsStatus('disconnected');
      };

      ws.onerror = () => {
        setWsStatus('disconnected');
      };
    } catch (err) {
      setWsStatus('disconnected');
    }

    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, [user, currentShowId]);

  const handleLogin = (userData) => {
    setUser(userData);
    localStorage.setItem('token', userData.token);
    localStorage.setItem('username', userData.username);
    setActiveTab('movies');
    fetchBookings(userData.token);
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    if (wsRef.current) wsRef.current.close();
  };

  const handleToggleSeat = (seatId) => {
    setSelectedSeats((prev) => {
      const next = new Set(prev);
      if (next.has(seatId)) next.delete(seatId);
      else next.add(seatId);
      return next;
    });
  };

  const handleDeselectSeat = (seatId) => {
    setSelectedSeats((prev) => {
      const next = new Set(prev);
      next.delete(seatId);
      return next;
    });
  };

  const handleSelectShow = (showId) => {
    setCurrentShowId(showId);
    setSelectedSeats(new Set());
    setActiveTab('theater');
  };

  const fetchBookings = async (authToken = user?.token) => {
    if (!authToken) return;
    try {
      const res = await fetch(`${API_BASE}/bookings`, {
        headers: { authorization: `Bearer ${authToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setBookings(data.bookings ? [...data.bookings].reverse() : []);
      }
    } catch (err) {
      console.warn("Could not fetch user bookings:", err);
    }
  };

  const handleOpenRazorpay = () => {
    if (selectedSeats.size === 0) {
      setStatusMsg({ type: 'error', text: 'Please select at least one seat to proceed to payment.' });
      return;
    }
    setStatusMsg(null);
    setShowRzpModal(true);
  };

  const handleRazorpaySuccess = async (rzpData) => {
    setShowRzpModal(false);
    setStatusMsg({ type: 'info', text: 'Razorpay Payment Authorized. Confirming seat lock in database...' });

    const selectedList = Array.from(selectedSeats).sort();
    const currentShow = shows.find(s => s.id === currentShowId);
    const showTitle = currentShow ? currentShow.title : currentShowId;

    try {
      const res = await fetch(`${API_BASE}/book`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'authorization': `Bearer ${user.token}`
        },
        body: JSON.stringify({ showId: currentShowId, seats: selectedList })
      });

      const ver = res.headers.get("x-app-version") || "v1.0.0";
      setAppVersion(ver);

      const data = await res.json();

      if (res.ok) {
        setReceipt({
          ...rzpData,
          bookingId: data.bookingId,
          showTitle,
          showId: currentShowId
        });
        setStatusMsg({ 
          type: 'success', 
          text: `🎉 Payment & Booking Confirmed! Razorpay Txn: ${rzpData.paymentId}. Booking ID: ${data.bookingId}.` 
        });
        setSelectedSeats(new Set());
        setTimeout(() => fetchBookings(), 1200);
      } else {
        setStatusMsg({ 
          type: 'error', 
          text: `❌ Booking Failed: ${data.error || 'Conflict or seat reservation error'}` 
        });
      }
    } catch (err) {
      setStatusMsg({ type: 'error', text: `❌ Network Error: ${err.message}` });
    }
  };

  const currentShow = shows.find(s => s.id === currentShowId);
  const showTitle = currentShow ? currentShow.title : currentShowId;
  const totalPriceINR = Math.round(selectedSeats.size * 15.0 * USD_TO_INR);

  return (
    <div>
      <Navbar 
        user={user}
        wsStatus={wsStatus}
        appVersion={appVersion}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onLogout={handleLogout}
      />

      <main>
        {!user ? (
          <Login onLogin={handleLogin} apiBase={API_BASE} />
        ) : (
          <div>
            {activeTab === 'movies' && (
              <MovieCatalog 
                shows={shows}
                selectedShowId={currentShowId}
                onSelectShow={handleSelectShow}
              />
            )}

            {activeTab === 'theater' && (
              <div className="dashboard-layout">
                <SeatMap 
                  seatStatus={seatStatus}
                  selectedSeats={selectedSeats}
                  onToggleSeat={handleToggleSeat}
                  shows={shows}
                  currentShowId={currentShowId}
                  onSelectShow={setCurrentShowId}
                />

                <div className="sidebar-panel">
                  <CheckoutPanel 
                    selectedSeats={selectedSeats}
                    onDeselectSeat={handleDeselectSeat}
                    currentShowId={currentShowId}
                    shows={shows}
                    onOpenRazorpay={handleOpenRazorpay}
                    statusMsg={statusMsg}
                  />

                  <BookingHistory 
                    bookings={bookings}
                    onRefresh={() => fetchBookings()}
                  />
                </div>
              </div>
            )}

            {activeTab === 'bookings' && (
              <div style={{ maxWidth: 700, margin: '0 auto' }}>
                <BookingHistory 
                  bookings={bookings}
                  onRefresh={() => fetchBookings()}
                />
              </div>
            )}
          </div>
        )}
      </main>

      {/* Global Razorpay Checkout Modal */}
      {showRzpModal && (
        <RazorpayModal
          amountInINR={totalPriceINR}
          seats={Array.from(selectedSeats).sort()}
          showTitle={showTitle}
          user={user}
          onClose={() => setShowRzpModal(false)}
          onPaymentSuccess={handleRazorpaySuccess}
        />
      )}

      {/* Global Payment Receipt Modal */}
      {receipt && (
        <PaymentReceiptModal
          receipt={receipt}
          onClose={() => {
            setReceipt(null);
            setActiveTab('bookings');
          }}
        />
      )}
    </div>
  );
}
