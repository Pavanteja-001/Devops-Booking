import client from "prom-client";

const SERVICE = "booking-bff";
const TRACK = process.env.DEPLOYMENT_TRACK ?? "stable";
export const register = new client.Registry();
client.collectDefaultMetrics({ register });

const requests = new client.Counter({
  name: "http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["service", "method", "path", "status", "version"],
  registers: [register],
});

const latency = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "Request latency",
  labelNames: ["service", "method", "path", "version"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

export function registerMetrics(app) {
  app.use((req, res, next) => {
    const t0 = process.hrtime.bigint();
    res.on("finish", () => {
      const secs = Number(process.hrtime.bigint() - t0) / 1e9;
      const path = req.route?.path ?? "unmatched";
      requests.labels(SERVICE, req.method, path, String(res.statusCode), TRACK).inc();
      latency.labels(SERVICE, req.method, path, TRACK).observe(secs);
    });
    next();
  });

  app.get("/metrics", async (_req, res) => {
    res.set("Content-Type", register.contentType);
    res.end(await register.metrics());
  });
}
