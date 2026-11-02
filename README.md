# Bahasa Kita 🗣️🌏

Penerjemah ucapan untuk turis Indonesia di luar negeri. Bicara dalam Bahasa Indonesia, lalu lawan bicara **membaca dan mendengar** terjemahannya. Anda melihat **terjemahan balik** untuk memastikan maksud Anda tersampaikan.

**Pembeda:** (a) terjemahan balik untuk verifikasi makna, (b) mode situasi + frasa cepat sekali tap.

## Coba prototype (tanpa server)
Buka **`prototype/prototype.html`** di Chrome (desktop atau Android). File ini mandiri:
- **Mode Demo:** tidak perlu API key. Frasa cepat diterjemahkan ke Inggris dengan contoh statis, sementara mikrofon, suara, dan alur UI asli.
- **Mode Claude API:** tempel API key Anthropic Anda sendiri. Key hanya disimpan di memori tab, lalu Claude dipanggil langsung dari browser. Mode ini **khusus prototype pribadi**. Versi produksi menyimpan key di server.

> Mikrofon butuh konteks aman. Membuka file lokal di Chrome desktop berfungsi. Di Android, lebih mudah memakai URL HTTPS, misalnya Preview Deployment Vercel.

## Cara pakai
1. Pilih **Bahasa lawan bicara** (dan situasi bila perlu).
2. **Tahan** tombol 🎤, bicara, lalu lepas. Atau **ketuk sekali**, dan aplikasi berhenti otomatis saat Anda jeda.
3. Tunjukkan layar **bagian atas** (sudah diputar 180°) ke lawan bicara. Suara diputar otomatis, dan 🔊 memutarnya ulang.
4. Periksa kotak hijau **terjemahan balik**.
5. Tekan **🔄 Giliran lawan bicara**, lalu lawan bicara menekan tombol di sisinya untuk menjawab.
6. Alternatif: **💬 Frasa cepat** atau **⌨️ ketik**.

## Stack
| Komponen | Pilihan |
|---|---|
| Frontend | HTML + CSS + JavaScript vanilla (tanpa build) |
| Speech-to-text | Web Speech API (`SpeechRecognition`) |
| Terjemahan | Claude `claude-haiku-5-5` via `@anthropic-ai/sdk`, structured outputs JSON |
| Text-to-speech | `SpeechSynthesis` (voice bawaan HP) |
| Backend & hosting | Satu Vercel Function `/api/translate`, statis dari `public/` |

## Pengembangan lokal
```bash
npm install
npm test                                   # unit test backend
BK_MOCK=1 npm run dev                      # UI + API palsu → http://localhost:3000
ANTHROPIC_API_KEY=sk-ant-... npm run dev   # dengan Claude sungguhan
npm run build:prototype                    # bangun ulang prototype/prototype.html
```
Deploy: lihat [docs/deploy-vercel.md](docs/deploy-vercel.md).

## Batasan (MVP)
- Hanya **Chrome di Android** yang ditargetkan. Safari/iPhone belum didukung.
- Butuh internet (STT Chrome dan Claude berjalan online).
- Kualitas suara bergantung pada voice yang terpasang di HP. Bila tidak ada, aplikasi beralih ke mode **teks saja**.
- Rate limit server sederhana (in-memory per instance), jadi bukan perlindungan penuh. Pasang spend limit di Console Anthropic.
- Bahasa Thai: partikel sopan berbasis gender (ครับ/ค่ะ) sengaja dihindari karena gender penutur tidak diketahui.
- **Bukan untuk keperluan medis atau hukum yang kritis.**

## Privasi
Audio diproses oleh layanan pengenalan suara browser (Google untuk Chrome). Teks dikirim ke Claude (Anthropic) untuk diterjemahkan. Aplikasi tidak menyimpan riwayat percakapan. Log server hanya mencatat metadata: pasangan bahasa, panjang teks, dan latensi, tanpa isi teks.

## Status fase
| Fase | Isi | Status |
|---|---|---|
| 0 | Spike teknis: `public/spike.html` + [template hasil](docs/fase-0-hasil-uji.md) | 🟡 Halaman siap, **menunggu uji di HP Android** |
| 1 | Struktur repo, `CLAUDE.md`, `vercel.json` | 🟡 Siap, **menunggu koneksi Vercel + API key** |
| 2 | `/api/translate`, prompt, validasi, rate limit, error, eval 64 kalimat | 🟡 Kode + unit test selesai, **eval dengan API key belum dijalankan** |
| 3 | Alur inti satu arah + pengukuran latensi | ✅ Kode selesai (uji E2E headless) |
| 4 | Layar terbagi, giliran, situasi, frasa cepat | ✅ Kode selesai (uji E2E headless) |
| 5 | Error ramah, fallback TTS, disclaimer & privasi, UI besar | ✅ Kode selesai |
| 6 | [Checklist QA](docs/qa-checklist.md) di HP, deploy final | ⏳ Butuh HP Android |
| 7 | [Protokol uji pengguna](docs/uji-pengguna.md) | ⏳ Butuh penguji |
