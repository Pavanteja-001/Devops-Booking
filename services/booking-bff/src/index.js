import express from "express";

import { requireAuth } from "./auth.js";
import { registerChaos } from "./chaos.js";
import { bookingsForUser, completeBooking, createBooking, dbPing } from "./db.js";
import { registerMetrics } from "./metrics.js";
import { enqueuePayment } from "./queue.js";

const APP_VERSION = process.env.APP_VERSION ?? "v1";

const app = express();
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Expose-Headers", "x-app-version");
  res.header("X-App-Version", APP_VERSION);
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.use(express.json());
registerMetrics(app);
registerChaos(app);

const INVENTORY = process.env.INVENTORY_URL ?? "http://localhost:8081";
const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN ?? "internal-devsecret";
const TIMEOUT_MS = Number(process.env.INVENTORY_TIMEOUT_MS ?? 1500);

async function callInventory(path, options = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${INVENTORY}${path}`, { ...options, signal: ctl.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

app.get("/healthz", (_req, res) => res.json({ status: "ok" }));

app.get("/readyz", async (_req, res) => {
  try {
    await dbPing();
    res.json({ status: "ready" });
  } catch (e) {
    res.status(503).json({ status: "not-ready", error: e.message });
  }
});

app.post("/auth/login", async (req, res) => {
  try {
    const r = await callInventory("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req.body),
    });
    res.status(r.status).json(await r.json());
  } catch {
    res.status(504).json({ error: "inventory timeout" });
  }
});

app.get("/shows", async (_req, res) => {
  try {
    const r = await callInventory("/shows");
    res.status(r.status).json(await r.json());
  } catch {
    res.status(504).json({ error: "inventory timeout" });
  }
});

app.get("/shows/:id/seats", async (req, res) => {
  try {
    const r = await callInventory(`/shows/${req.params.id}/seats`);
    res.status(r.status).json(await r.json());
  } catch {
    res.status(504).json({ error: "inventory timeout" });
  }
});

app.post("/book", requireAuth, async (req, res) => {
  const { showId, seats } = req.body;
  try {
    const holdRes = await callInventory(`/shows/${showId}/hold`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: req.headers.authorization,
      },
      body: JSON.stringify({ seats }),
    });
    if (!holdRes.ok) return res.status(holdRes.status).json(await holdRes.json());
    const { hold_id: holdId } = await holdRes.json();

    const booking = await createBooking({
      userId: req.user.sub,
      username: req.user.username,
      showId,
      holdId,
      seats,
    });

    await enqueuePayment({ bookingId: booking.id, showId, holdId, seats });

    res.status(201).json({ bookingId: booking.id, holdId, status: booking.status });
  } catch (e) {
    res.status(504).json({ error: "booking failed", detail: e.message });
  }
});

app.post("/internal/bookings/:id/complete", async (req, res) => {
  if (req.headers["x-internal-token"] !== INTERNAL_TOKEN) {
    return res.status(403).json({ error: "forbidden" });
  }
  const booking = await completeBooking(req.params.id);
  if (!booking) return res.status(404).json({ error: "booking not found" });

  await callInventory(`/internal/shows/${booking.show_id}/finalize`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-internal-token": INTERNAL_TOKEN },
    body: JSON.stringify({ hold_id: booking.hold_id, seats: booking.seats }),
  });

  res.json({ bookingId: booking.id, status: booking.status });
});

app.get("/bookings", requireAuth, async (req, res) => {
  res.json({ bookings: await bookingsForUser(req.user.sub) });
});

app.listen(8080, () => console.log("booking-bff listening on 8080"));
