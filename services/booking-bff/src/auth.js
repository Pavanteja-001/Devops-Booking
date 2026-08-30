import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET ?? "devsecret-change-me";

export function requireAuth(req, res, next) {
  const header = req.headers.authorization ?? "";
  if (!header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "missing bearer token" });
  }
  try {
    req.user = jwt.verify(header.slice("Bearer ".length), JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "invalid token" });
  }
}
