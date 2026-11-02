// Fase 2: uji endpoint terjemahan dengan kalimat contoh, ukur validitas JSON dan latensi.
// Pakai: ANTHROPIC_API_KEY=... npm run eval -- --target ja [--limit 10]
// Hasil: docs/hasil-eval/eval-<target>-<tanggal>.md (penilaian makna diisi manual).
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createTranslateService, createRateLimiter } from "../lib/translate-core.js";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => (a.startsWith("--") ? [...acc, [a.slice(2), arr[i + 1]]] : acc), [])
);
const target = args.target || "en";
const limit = Number(args.limit || Infinity);

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY belum diatur.");
  process.exit(1);
}

const { sentences } = JSON.parse(await readFile(new URL("../tests/fixtures/eval-sentences.json", import.meta.url), "utf8"));
const handle = createTranslateService({ rateLimiter: createRateLimiter({ max: 1e9 }), log: { info() {}, warn: console.warn, error: console.error } });

const rows = [];
for (const s of sentences.slice(0, limit)) {
  const t0 = Date.now();
  const out = await handle({ method: "POST", body: { text: s.text, source_lang: "id", target_lang: target, situation: s.situation }, ip: "eval" });
  const ms = Date.now() - t0;
  rows.push({ ...s, status: out.status, ms, ...(out.status === 200 ? out.body : { error: out.body.error?.code }) });
  process.stdout.write(out.status === 200 ? "." : "x");
}
console.log();

const ok = rows.filter((r) => r.status === 200);
const lat = ok.map((r) => r.ms).sort((a, b) => a - b);
const pct = (p) => (lat.length ? lat[Math.min(lat.length - 1, Math.floor(p * lat.length))] : "-");
const esc = (x) => String(x ?? "").replace(/\|/g, "/").replace(/\n/g, " ");
const date = new Date().toISOString().slice(0, 10);
const md = [
  `# Hasil eval terjemahan id → ${target} (${date})`,
  "",
  `- Kalimat: ${rows.length} · JSON valid: ${ok.length}/${rows.length}`,
  `- Latensi API (server→Claude→server): median ${pct(0.5)} ms · p90 ${pct(0.9)} ms · maks ${lat.at(-1) ?? "-"} ms`,
  "",
  "Isi kolom **Makna OK?** secara manual (ya/tidak) dan catat masalah.",
  "",
  "| # | Situasi | Teks | Terjemahan | Terjemahan balik | ms | Ambigu? | Makna OK? |",
  "|---|---|---|---|---|---|---|---|",
  ...rows.map((r, i) =>
    `| ${i + 1} | ${r.situation ?? "umum"} | ${esc(r.text)} | ${esc(r.translation ?? "ERROR " + r.error)} | ${esc(r.back_translation)} | ${r.ms} | ${esc(r.ambigu)} |  |`
  ),
].join("\n");
await mkdir(new URL("../docs/hasil-eval/", import.meta.url), { recursive: true });
const file = new URL(`../docs/hasil-eval/eval-${target}-${date}.md`, import.meta.url);
await writeFile(file, md);
console.log(`Selesai. JSON valid ${ok.length}/${rows.length}, median ${pct(0.5)} ms. Laporan: ${file.pathname}`);
