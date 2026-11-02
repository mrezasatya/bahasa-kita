// Server lokal: menyajikan /public dan meneruskan POST /api/translate ke handler.
// Pakai:  ANTHROPIC_API_KEY=... npm run dev     (terjemahan sungguhan)
//         BK_MOCK=1 npm run dev                 (terjemahan palsu, tanpa API key)
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createTranslateService } from "../lib/translate-core.js";

const root = fileURLToPath(new URL("../public/", import.meta.url));
const port = Number(process.env.PORT || 3000);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };

const mockClient = {
  messages: {
    async create(params) {
      await new Promise((r) => setTimeout(r, 400));
      const text = params.messages[0].content.replace(/<\/?utterance>/g, "").trim();
      const target = /into ([A-Za-z ]+?)[,.(]/.exec(params.system)?.[1] || "?";
      return {
        stop_reason: "end_turn",
        content: [{ type: "text", text: JSON.stringify({ translation: `[MOCK ${target}] ${text}`, back_translation: `[MOCK balik] ${text}` }) }],
        usage: { input_tokens: 0, output_tokens: 0 },
      };
    },
  },
};

const handle = process.env.BK_MOCK === "1" ? createTranslateService({ getClient: () => mockClient }) : createTranslateService();

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/api/translate") {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      let body = null;
      try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
      const out = await handle({ method: req.method, body, ip: req.socket.remoteAddress });
      res.writeHead(out.status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...(out.headers || {}) });
      return res.end(JSON.stringify(out.body));
    }
    const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "") || "index.html";
    if (rel.startsWith("..")) { res.writeHead(403); return res.end(); }
    try {
      const file = join(root, rel.endsWith("/") ? rel + "index.html" : rel);
      const buf = await readFile(file);
      res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream" });
      res.end(buf);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
    }
  })
  .listen(port, () => {
    console.log(`Bahasa Kita dev server: http://localhost:${port}  (mode: ${process.env.BK_MOCK === "1" ? "MOCK" : "Claude API"})`);
  });
