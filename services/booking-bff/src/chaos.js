export const chaos = {
  error_rate: Number(process.env.CHAOS_ERROR_RATE ?? 0),
  latency_ms: Number(process.env.CHAOS_LATENCY_MS ?? 0),
};

export function registerChaos(app) {
  app.use(async (req, res, next) => {
    if (
      req.path.startsWith("/healthz") ||
      req.path.startsWith("/readyz") ||
      req.path.startsWith("/metrics") ||
      req.path.startsWith("/admin")
    ) {
      return next();
    }
    if (chaos.latency_ms) await new Promise((r) => setTimeout(r, chaos.latency_ms));
    if (chaos.error_rate && Math.random() < chaos.error_rate) {
      return res.status(500).json({ error: "injected failure" });
    }
    next();
  });

  app.post("/admin/chaos", (req, res) => {
    Object.assign(chaos, req.body);
    res.json(chaos);
  });

  app.get("/admin/chaos", (_req, res) => res.json(chaos));
}
