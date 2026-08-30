import http from "node:http";

import express from "express";
import Redis from "ioredis";
import client from "prom-client";
import { WebSocketServer } from "ws";

const SERVICE = "seatmap";
const INVENTORY = process.env.INVENTORY_URL ?? "http://localhost:8081";
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379/0";

const app = express();
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const connections = new client.Gauge({
  name: "seatmap_ws_connections",
  help: "Active WebSocket connections",
  registers: [register],
});

app.get("/healthz", (_req, res) => res.json({ status: "ok" }));
app.get("/readyz", (_req, res) => res.json({ status: "ready" }));
app.get("/metrics", async (_req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

const subscriber = new Redis(REDIS_URL);
const clientsByShow = new Map();

subscriber.on("message", (channel, message) => {
  const showId = channel.split(":")[1];
  const listeners = clientsByShow.get(showId);
  if (!listeners) return;
  const payload = JSON.stringify({ type: "update", ...JSON.parse(message) });
  for (const ws of listeners) {
    if (ws.readyState === ws.OPEN) ws.send(payload);
  }
});

wss.on("connection", (ws) => {
  connections.inc();
  let subscribedShowId = null;

  ws.on("message", async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    const { showId } = msg;
    if (!showId || subscribedShowId) return;

    subscribedShowId = showId;
    if (!clientsByShow.has(showId)) {
      clientsByShow.set(showId, new Set());
      await subscriber.subscribe(`seat-updates:${showId}`);
    }
    clientsByShow.get(showId).add(ws);

    try {
      const r = await fetch(`${INVENTORY}/shows/${showId}/seats`);
      const snapshot = await r.json();
      ws.send(JSON.stringify({ type: "snapshot", ...snapshot }));
    } catch (e) {
      ws.send(JSON.stringify({ type: "error", error: e.message }));
    }
  });

  ws.on("close", () => {
    connections.dec();
    if (subscribedShowId) clientsByShow.get(subscribedShowId)?.delete(ws);
  });
});

server.listen(8080, () => console.log(`${SERVICE} listening on 8080`));
