# CLAUDE.md — Konteks proyek Bahasa Kita

## Ringkasan
Web app penerjemah ucapan untuk **turis Indonesia** (HP Android + Chrome, online, tanpa login). Aplikasi ini tidak bersaing pada kecepatan atau jumlah bahasa dengan Google Translate. Fokusnya satu masalah: **pengguna tidak yakin terjemahannya benar, tepat konteks, dan sopan.**

Pembeda MVP (final):
- **(a) Terjemahan balik:** hasil diterjemahkan kembali ke bahasa pengguna untuk verifikasi makna.
- **(b) Mode situasi + frasa cepat:** Bandara & Imigrasi, Hotel, Restoran, Transportasi, Belanja, Darurat & Kesehatan.
- (c) Catatan budaya/kesopanan: **ditunda**.

Non-goals MVP: login, riwayat, offline, iPhone/Safari, deteksi bahasa otomatis, pembayaran, catatan budaya.

## Arsitektur
```
HP (Chrome) → Web Speech API (STT) → POST /api/translate (Vercel Function, Node)
            → Claude claude-haiku-5-5 (JSON) → teks besar + SpeechSynthesis (TTS)
```
- Frontend: HTML/CSS/JS vanilla di `public/` (tanpa build step).
- Backend: `api/translate.js` → logika di `lib/translate-core.js`, prompt di `lib/prompt.js`.
- Data: `public/data/languages.json`, `public/data/situations.json`. **Deviasi dari brief:** data diletakkan di `public/data/`, bukan `/data`, karena Vercel menyajikan folder `public/` sebagai statis dan fungsi API membaca file yang sama, sehingga cukup satu sumber data.
- Rahasia: `ANTHROPIC_API_KEY` hanya di environment Vercel. **Tidak pernah** dikirim ke browser.

## Kontrak API
`POST /api/translate`
```json
{ "text": "...", "source_lang": "id", "target_lang": "ja", "situation": "hotel" }
→ 200 { "translation": "...", "back_translation": "..." }
→ 4xx/5xx { "error": { "code": "...", "message": "pesan untuk pengguna" } }
```
Kode error: `invalid_json`, `empty_text`, `text_too_long` (>500), `unsupported_language`, `same_language`, `unknown_situation`, `rate_limited` (429, 20/menit/IP, in-memory per instance), `server_misconfigured`, `upstream_busy`, `upstream_error`, `refused`, `bad_model_output`.

## Aturan prompt (brief §7.2)
Terjemahkan hanya makna (jangan menjawab, menambah, atau menjelaskan). Gunakan konteks situasi. Register netral-sopan. `back_translation` adalah terjemahan harfiah-natural dari `translation`, bukan salinan teks asli. Output memakai structured outputs (`output_config.format` JSON schema). Effort `low` demi latensi.

## Struktur
```
public/            index.html, style.css, app.js, spike.html (Fase 0), data/*.json
api/translate.js   handler Vercel
lib/               prompt.js (dipakai server & prototype), translate-core.js
prototype/         prototype.html (HASIL BUILD, satu file), proto.js, proto.css, demo-en.json
scripts/           dev-server.mjs, build-prototype.mjs, eval-translate.mjs
tests/             translate.test.js (unit), e2e-smoke.mjs (Playwright), fixtures/eval-sentences.json
docs/              hasil uji Fase 0, deploy, QA, protokol uji pengguna
```

## Perintah
- `npm test`: unit test backend (tanpa API key, memakai klien palsu).
- `BK_MOCK=1 npm run dev`: server lokal dengan terjemahan palsu → http://localhost:3000
- `ANTHROPIC_API_KEY=... npm run dev`: server lokal dengan Claude sungguhan.
- `npm run build:prototype`: membangun ulang `prototype/prototype.html`. **Wajib dijalankan setelah mengubah `public/`, `lib/prompt.js`, atau `prototype/*`.**
- `ANTHROPIC_API_KEY=... npm run eval -- --target ja`: eval Fase 2 → `docs/hasil-eval/`.
- E2E: `BK_MOCK=1 PORT=3123 node scripts/dev-server.mjs &` lalu `NODE_PATH=$(npm root -g) node tests/e2e-smoke.mjs`.

## Konvensi
- Bahasa UI dan pesan error: Bahasa Indonesia yang sederhana (literasi digital pengguna beragam).
- Teks UI untuk lawan bicara berasal dari `languages.json → ui`.
- Jangan menambah dependensi frontend atau build step tanpa alasan kuat.
- Latensi per tahap dicatat di console (`[latensi]`). `bkLatency()` menampilkan median.
- Status fase ada di README.md, bagian "Status fase".
