const API_BASE = window.location.port === "8090" ? `http://${window.location.hostname}:8082` : "http://localhost:8082";
const WS_BASE = window.location.port === "8090" ? `ws://${window.location.hostname}:8083/ws` : "ws://localhost:8083/ws";

let currentShowId = "s1";
let token = localStorage.getItem("token") || null;
let currentUsername = localStorage.getItem("username") || null;
let selected = new Set();
let seatStatus = {};
let ws = null;
const PRICE_PER_SEAT = 15.0;

function fillDemo(u, p) {
  document.getElementById("username").value = u;
  document.getElementById("password").value = p;
}

function updateWsBadge(status) {
  const dot = document.getElementById("ws-dot");
  const text = document.getElementById("ws-text");
  if (!dot || !text) return;
  dot.className = "status-dot " + status;
  if (status === "connected") text.textContent = "Live WS Connected";
  else if (status === "connecting") text.textContent = "Connecting...";
  else text.textContent = "Offline";
}

function setStatus(msg, type = "info") {
  const el = document.getElementById("status");
  if (!el) return;
  el.className = type;
  el.innerHTML = msg;
  el.style.display = "block";
}

function renderGrid() {
  const grid = document.getElementById("grid");
  if (!grid) return;
  grid.innerHTML = "";

  let counts = { available: 0, selected: selected.size, held: 0, booked: 0 };

  Object.entries(seatStatus).forEach(([id, status]) => {
    if (status in counts && !selected.has(id)) counts[status]++;
    
    const el = document.createElement("div");
    const isSelected = selected.has(id);
    el.className = `seat ${status}` + (isSelected ? " selected" : "");
    el.textContent = id;
    el.title = `Seat ${id} - $${PRICE_PER_SEAT.toFixed(2)} (${status})`;

    if (status === "available" || isSelected) {
      el.onclick = () => {
        if (selected.has(id)) {
          selected.delete(id);
        } else {
          selected.add(id);
        }
        renderGrid();
        renderSummary();
      };
    }
    grid.appendChild(el);
  });

  const countAvail = document.getElementById("count-available");
  const countSel = document.getElementById("count-selected");
  const countHeld = document.getElementById("count-held");
  const countBooked = document.getElementById("count-booked");

  if (countAvail) countAvail.textContent = counts.available;
  if (countSel) countSel.textContent = selected.size;
  if (countHeld) countHeld.textContent = counts.held;
  if (countBooked) countBooked.textContent = counts.booked;
}

function renderSummary() {
  const box = document.getElementById("selected-seats-box");
  const countEl = document.getElementById("summary-count");
  const totalEl = document.getElementById("summary-total");

  if (!box || !countEl || !totalEl) return;

  if (selected.size === 0) {
    box.innerHTML = `<div class="empty-seats-msg">No seats selected</div>`;
    countEl.textContent = "0";
    totalEl.textContent = "$0.00";
    return;
  }

  box.innerHTML = "";
  const sorted = Array.from(selected).sort();
  sorted.forEach(id => {
    const chip = document.createElement("div");
    chip.className = "seat-chip";
    chip.innerHTML = `<span>${id}</span> <span style="cursor:pointer;opacity:0.7" onclick="deselectSeat('${id}')">&times;</span>`;
    box.appendChild(chip);
  });

  countEl.textContent = selected.size;
  totalEl.textContent = `$${(selected.size * PRICE_PER_SEAT).toFixed(2)}`;
}

function deselectSeat(id) {
  selected.delete(id);
  renderGrid();
  renderSummary();
}

async function loadShows() {
  try {
    const res = await fetch(`${API_BASE}/shows`);
    if (res.ok) {
      const data = await res.json();
      if (data.shows && data.shows.length > 0) {
        const select = document.getElementById("show-select");
        if (!select) return;
        select.innerHTML = "";
        data.shows.forEach(s => {
          const opt = document.createElement("option");
          opt.value = s.id;
          opt.textContent = s.title;
          select.appendChild(opt);
        });
        select.value = currentShowId;
      }
    }
  } catch (e) {
    console.warn("Could not fetch shows list:", e);
  }
}

function connectSeatmap() {
  updateWsBadge("connecting");
  if (ws) ws.close();

  try {
    ws = new WebSocket(WS_BASE);

    ws.onopen = () => {
      updateWsBadge("connected");
      ws.send(JSON.stringify({ showId: currentShowId }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "snapshot") {
          const showTitleEl = document.getElementById("show-title");
          if (showTitleEl) {
            showTitleEl.textContent = msg.show_id === "s1" ? "Inception - 7:00 PM" : (msg.show_id === "s2" ? "Interstellar - 9:30 PM" : msg.show_id);
          }
          seatStatus = Object.fromEntries(msg.seats.map((s) => [s.id, s.status]));
        } else if (msg.type === "update") {
          for (const id of msg.seats) seatStatus[id] = msg.status;
        }
        renderGrid();
      } catch (err) {
        console.error("WS Parse error", err);
      }
    };

    ws.onclose = () => {
      updateWsBadge("disconnected");
      setTimeout(() => {
        if (token) connectSeatmap();
      }, 3000);
    };

    ws.onerror = () => {
      updateWsBadge("disconnected");
    };
  } catch (e) {
    updateWsBadge("disconnected");
  }
}

async function login() {
  const usernameInput = document.getElementById("username");
  const passwordInput = document.getElementById("password");
  if (!usernameInput || !passwordInput) return;

  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  if (!username || !password) {
    alert("Please enter username and password");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      alert("Login failed. Check credentials or service connection.");
      return;
    }

    const data = await res.json();
    token = data.token;
    currentUsername = data.username || username;

    localStorage.setItem("token", token);
    localStorage.setItem("username", currentUsername);

    showApp();
  } catch (e) {
    alert("Network error connecting to auth service: " + e.message);
  }
}

function showApp() {
  document.getElementById("auth").hidden = true;
  document.getElementById("app").hidden = false;

  document.getElementById("user-nav").style.display = "flex";
  document.getElementById("user-display-name").textContent = `@${currentUsername}`;
  document.getElementById("avatar-initial").textContent = currentUsername.charAt(0).toUpperCase();

  loadShows();
  connectSeatmap();
  fetchBookings();
}

function logout() {
  token = null;
  currentUsername = null;
  localStorage.removeItem("token");
  localStorage.removeItem("username");
  if (ws) ws.close();

  document.getElementById("auth").hidden = false;
  document.getElementById("app").hidden = true;
  document.getElementById("user-nav").style.display = "none";
}

async function book() {
  if (selected.size === 0) {
    setStatus("Please select at least one seat to book.", "error");
    return;
  }

  setStatus("Processing your booking request...", "info");

  try {
    const res = await fetch(`${API_BASE}/book`, {
      method: "POST",
      headers: { 
        "content-type": "application/json", 
        "authorization": `Bearer ${token}` 
      },
      body: JSON.stringify({ showId: currentShowId, seats: [...selected] }),
    });

    const versionHeader = res.headers.get("x-app-version") ?? "v1.0.0";
    document.getElementById("version-badge").textContent = `version: ${versionHeader}`;

    const data = await res.json();

    if (res.ok) {
      setStatus(`🎉 <strong>Booking Confirmed!</strong> ID: <code>${data.bookingId}</code>. Payment worker queue dispatched.`, "success");
      selected.clear();
      renderGrid();
      renderSummary();
      setTimeout(fetchBookings, 1000);
    } else {
      setStatus(`❌ <strong>Booking Failed:</strong> ${data.error || "Conflict or server error"}`, "error");
    }
  } catch (e) {
    setStatus(`❌ <strong>Network Error:</strong> ${e.message}`, "error");
  }
}

async function fetchBookings() {
  if (!token) return;
  const listEl = document.getElementById("booking-list");
  if (!listEl) return;

  try {
    const res = await fetch(`${API_BASE}/bookings`, {
      headers: { authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      if (!data.bookings || data.bookings.length === 0) {
        listEl.innerHTML = `<div class="empty-seats-msg">No active bookings found</div>`;
        return;
      }
      listEl.innerHTML = "";
      data.bookings.reverse().forEach(b => {
        const item = document.createElement("div");
        item.className = "booking-item";
        const dateStr = b.created_at ? new Date(b.created_at).toLocaleTimeString() : "Just now";
        item.innerHTML = `
          <div class="booking-header">
            <span>Booking #${b.id}</span>
            <span class="booking-status">${b.status}</span>
          </div>
          <div>Seats: <span class="booking-seats">${b.seats.join(", ")}</span></div>
          <div class="booking-time">${dateStr} &bull; Show: ${b.show_id}</div>
        `;
        listEl.appendChild(item);
      });
    }
  } catch (e) {
    console.warn("Could not fetch user bookings:", e);
  }
}

// Event Listeners setup when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  const loginBtn = document.getElementById("login");
  const logoutBtn = document.getElementById("logout-btn");
  const bookBtn = document.getElementById("book");
  const refreshBookingsBtn = document.getElementById("refresh-bookings");
  const showSelect = document.getElementById("show-select");

  if (loginBtn) loginBtn.onclick = login;
  if (logoutBtn) logoutBtn.onclick = logout;
  if (bookBtn) bookBtn.onclick = book;
  if (refreshBookingsBtn) refreshBookingsBtn.onclick = fetchBookings;

  if (showSelect) {
    showSelect.onchange = (e) => {
      currentShowId = e.target.value;
      selected.clear();
      renderSummary();
      connectSeatmap();
    };
  }

  // Check stored auth session
  if (token && currentUsername) {
    showApp();
  } else {
    fetch(`${API_BASE}/healthz`).then(r => {
      const ver = r.headers.get("x-app-version") || "v1.0.0";
      document.getElementById("version-badge").textContent = `version: ${ver}`;
    }).catch(() => {
      document.getElementById("version-badge").textContent = "version: v1.0.0";
    });
  }
});
