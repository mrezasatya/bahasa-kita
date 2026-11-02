// Logika inti /api/translate, dipisah dari handler Vercel agar mudah diuji.
import { createRequire } from "node:module";
import Anthropic from "@anthropic-ai/sdk";
import { MAX_INPUT_CHARS, buildRequestParams, parseTranslationResponse } from "./prompt.js";

const require = createRequire(import.meta.url);
const { languages } = require("../public/data/languages.json");
const { situations } = require("../public/data/situations.json");

export const ALLOWED_LANGS = new Set(languages.map((l) => l.code));
export const SITUATIONS = new Map(situations.map((s) => [s.id, s]));

const MESSAGES = {
  method_not_allowed: "Gunakan metode POST.",
  invalid_json: "Format permintaan tidak valid.",
  empty_text: "Teks kosong. Silakan bicara atau ketik dulu.",
  text_too_long: `Teks terlalu panjang (maksimal ${MAX_INPUT_CHARS} karakter). Bagi menjadi kalimat yang lebih pendek.`,
  unsupported_language: "Bahasa tidak didukung.",
  same_language: "Bahasa asal dan tujuan tidak boleh sama.",
  unknown_situation: "Situasi tidak dikenal.",
  rate_limited: "Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.",
  server_misconfigured: "Server belum dikonfigurasi (API key belum diatur).",
  upstream_busy: "Layanan terjemahan sedang sibuk. Coba lagi beberapa detik lagi.",
  upstream_error: "Layanan terjemahan gagal merespons. Coba lagi.",
  refused: "Kalimat ini tidak dapat diterjemahkan. Coba ubah kalimatnya.",
  bad_model_output: "Hasil terjemahan tidak valid. Coba lagi.",
};

export function errorBody(code, message = MESSAGES[code] || "Terjadi kesalahan.") {
  return { error: { code, message } };
}

/** Rate limiter sliding-window sederhana, in-memory, per instance. */
export function createRateLimiter({ windowMs = 60_000, max = 20, now = Date.now } = {}) {
  const hits = new Map();
  return function check(key) {
    const t = now();
    const arr = (hits.get(key) || []).filter((x) => t - x < windowMs);
    if (arr.length >= max) {
      hits.set(key, arr);
      const retryAfter = Math.ceil((windowMs - (t - arr[0])) / 1000);
      return { ok: false, retryAfter };
    }
    arr.push(t);
    hits.set(key, arr);
    // Bersihkan kunci lama agar Map tidak tumbuh tanpa batas.
    if (hits.size > 5000) {
      for (const [k, v] of hits) if (!v.length || t - v[v.length - 1] >= windowMs) hits.delete(k);
    }
    return { ok: true };
  };
}

/** Validasi body request. Return {ok:true, value} atau {ok:false, code}. */
export function validateRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, code: "invalid_json" };
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return { ok: false, code: "empty_text" };
  if (text.length > MAX_INPUT_CHARS) return { ok: false, code: "text_too_long" };
  const { source_lang, target_lang } = body;
  if (!ALLOWED_LANGS.has(source_lang) || !ALLOWED_LANGS.has(target_lang)) {
    return { ok: false, code: "unsupported_language" };
  }
  if (source_lang === target_lang) return { ok: false, code: "same_language" };
  let situation = body.situation ?? null;
  if (situation === "" ) situation = null;
  if (situation !== null && !SITUATIONS.has(situation)) return { ok: false, code: "unknown_situation" };
  return { ok: true, value: { text, source_lang, target_lang, situation } };
}

let defaultClient = null;
function getDefaultClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!defaultClient) defaultClient = new Anthropic({ timeout: 15_000, maxRetries: 1 });
  return defaultClient;
}

/**
 * Membuat fungsi handle({method, body, ip}) -> {status, headers, body}.
 * Klien Anthropic dapat diinjeksi untuk pengujian.
 */
export function createTranslateService({
  getClient = getDefaultClient,
  rateLimiter = createRateLimiter(),
  log = console,
} = {}) {
  return async function handle({ method, body, ip }) {
    if (method !== "POST") {
      return { status: 405, headers: { Allow: "POST" }, body: errorBody("method_not_allowed") };
    }
    const v = validateRequest(body);
    if (!v.ok) return { status: 400, body: errorBody(v.code) };

    const rl = rateLimiter(ip || "unknown");
    if (!rl.ok) {
      return { status: 429, headers: { "Retry-After": String(rl.retryAfter) }, body: errorBody("rate_limited") };
    }

    const client = getClient();
    if (!client) return { status: 500, body: errorBody("server_misconfigured") };

    const { text, source_lang, target_lang, situation } = v.value;
    const params = buildRequestParams({
      text,
      source_lang,
      target_lang,
      situationContext: situation ? SITUATIONS.get(situation).context : null,
    });

    const t0 = Date.now();
    let response;
    try {
      response = await client.messages.create(params);
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError || err?.status === 429 || err?.status === 529) {
        log.warn?.("[translate] upstream busy", err?.status);
        return { status: 503, body: errorBody("upstream_busy") };
      }
      if (err instanceof Anthropic.APIConnectionError) {
        log.error?.("[translate] connection error", err?.message);
        return { status: 502, body: errorBody("upstream_error") };
      }
      if (err instanceof Anthropic.APIError) {
        log.error?.("[translate] API error", err?.status, err?.message);
        return { status: 502, body: errorBody("upstream_error") };
      }
      log.error?.("[translate] unexpected error", err);
      return { status: 502, body: errorBody("upstream_error") };
    }
    const modelMs = Date.now() - t0;

    try {
      const result = parseTranslationResponse(response);
      log.info?.(
        `[translate] ${source_lang}->${target_lang} situation=${situation ?? "-"} chars=${text.length} model_ms=${modelMs} in=${response.usage?.input_tokens} out=${response.usage?.output_tokens}`
      );
      return { status: 200, headers: { "Server-Timing": `model;dur=${modelMs}` }, body: result };
    } catch (err) {
      const code = err.code === "refused" ? "refused" : "bad_model_output";
      log.warn?.(`[translate] ${code}`, err.message);
      return { status: code === "refused" ? 422 : 502, body: errorBody(code) };
    }
  };
}
