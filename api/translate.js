// Vercel Function: POST /api/translate
// Kontrak: { text, source_lang, target_lang, situation } -> { translation, back_translation }
import { createTranslateService, errorBody } from "../lib/translate-core.js";

const handle = createTranslateService();

function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd) return fwd.split(",")[0].trim();
  return req.headers["x-real-ip"] || req.socket?.remoteAddress || "unknown";
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json(errorBody("invalid_json"));
    }
  }
  const out = await handle({ method: req.method, body, ip: clientIp(req) });
  for (const [k, v] of Object.entries(out.headers || {})) res.setHeader(k, v);
  return res.status(out.status).json(out.body);
}
