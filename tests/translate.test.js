import { test } from "node:test";
import assert from "node:assert/strict";
import Anthropic from "@anthropic-ai/sdk";
import { createTranslateService, createRateLimiter, validateRequest } from "../lib/translate-core.js";
import { buildRequestParams, parseTranslationResponse, MODEL } from "../lib/prompt.js";

const quietLog = { info() {}, warn() {}, error() {} };

function fakeClient(responseOrError, calls = []) {
  return {
    messages: {
      async create(params) {
        calls.push(params);
        if (responseOrError instanceof Error) throw responseOrError;
        return responseOrError;
      },
    },
  };
}

const okResponse = {
  stop_reason: "end_turn",
  content: [
    { type: "thinking", thinking: "", signature: "x" },
    { type: "text", text: JSON.stringify({ translation: "チェックインしたいです。", back_translation: "Saya ingin check-in." }) },
  ],
  usage: { input_tokens: 300, output_tokens: 40 },
};

const validBody = { text: "Saya mau check-in", source_lang: "id", target_lang: "ja", situation: "hotel" };

test("respons sukses mengikuti kontrak", async () => {
  const calls = [];
  const handle = createTranslateService({ getClient: () => fakeClient(okResponse, calls), log: quietLog });
  const out = await handle({ method: "POST", body: validBody, ip: "1.1.1.1" });
  assert.equal(out.status, 200);
  assert.deepEqual(out.body, { translation: "チェックインしたいです。", back_translation: "Saya ingin check-in." });
  assert.equal(calls[0].model, MODEL);
  assert.equal(calls[0].output_config.format.type, "json_schema");
  assert.match(calls[0].system, /hotel/i);
  assert.match(calls[0].messages[0].content, /<utterance>/);
});

test("validasi input", () => {
  assert.equal(validateRequest(null).code, "invalid_json");
  assert.equal(validateRequest({ ...validBody, text: "   " }).code, "empty_text");
  assert.equal(validateRequest({ ...validBody, text: "a".repeat(501) }).code, "text_too_long");
  assert.equal(validateRequest({ ...validBody, target_lang: "xx" }).code, "unsupported_language");
  assert.equal(validateRequest({ ...validBody, target_lang: "id" }).code, "same_language");
  assert.equal(validateRequest({ ...validBody, situation: "pantai" }).code, "unknown_situation");
  assert.equal(validateRequest({ ...validBody, situation: null }).ok, true);
  assert.equal(validateRequest({ ...validBody, situation: undefined }).ok, true);
});

test("metode selain POST ditolak", async () => {
  const handle = createTranslateService({ getClient: () => fakeClient(okResponse), log: quietLog });
  const out = await handle({ method: "GET", body: null, ip: "x" });
  assert.equal(out.status, 405);
});

test("tanpa API key -> server_misconfigured", async () => {
  const handle = createTranslateService({ getClient: () => null, log: quietLog });
  const out = await handle({ method: "POST", body: validBody, ip: "x" });
  assert.equal(out.status, 500);
  assert.equal(out.body.error.code, "server_misconfigured");
});

test("rate limit per IP", async () => {
  let t = 0;
  const rateLimiter = createRateLimiter({ windowMs: 1000, max: 2, now: () => t });
  const handle = createTranslateService({ getClient: () => fakeClient(okResponse), rateLimiter, log: quietLog });
  assert.equal((await handle({ method: "POST", body: validBody, ip: "a" })).status, 200);
  assert.equal((await handle({ method: "POST", body: validBody, ip: "a" })).status, 200);
  const third = await handle({ method: "POST", body: validBody, ip: "a" });
  assert.equal(third.status, 429);
  assert.ok(Number(third.headers["Retry-After"]) >= 1);
  assert.equal((await handle({ method: "POST", body: validBody, ip: "b" })).status, 200);
  t = 1500;
  assert.equal((await handle({ method: "POST", body: validBody, ip: "a" })).status, 200);
});

test("refusal -> 422 refused", async () => {
  const handle = createTranslateService({
    getClient: () => fakeClient({ stop_reason: "refusal", content: [] }),
    log: quietLog,
  });
  const out = await handle({ method: "POST", body: validBody, ip: "x" });
  assert.equal(out.status, 422);
  assert.equal(out.body.error.code, "refused");
});

test("output bukan JSON -> 502 bad_model_output", async () => {
  const handle = createTranslateService({
    getClient: () => fakeClient({ stop_reason: "end_turn", content: [{ type: "text", text: "Halo!" }] }),
    log: quietLog,
  });
  const out = await handle({ method: "POST", body: validBody, ip: "x" });
  assert.equal(out.status, 502);
  assert.equal(out.body.error.code, "bad_model_output");
});

test("error koneksi upstream -> 502 upstream_error", async () => {
  const err = new Anthropic.APIConnectionError({ message: "boom" });
  const handle = createTranslateService({ getClient: () => fakeClient(err), log: quietLog });
  const out = await handle({ method: "POST", body: validBody, ip: "x" });
  assert.equal(out.status, 502);
  assert.equal(out.body.error.code, "upstream_error");
});

test("parseTranslationResponse menolak field kosong", () => {
  assert.throws(
    () => parseTranslationResponse({ stop_reason: "end_turn", content: [{ type: "text", text: '{"translation":"","back_translation":"x"}' }] }),
    (e) => e.code === "bad_model_output"
  );
});

test("prompt tanpa situasi tetap valid", () => {
  const p = buildRequestParams({ text: "Halo", source_lang: "id", target_lang: "en", situationContext: null });
  assert.match(p.system, /general travel conversation/);
  assert.match(p.system, /Indonesian/);
  assert.match(p.system, /English/);
});
