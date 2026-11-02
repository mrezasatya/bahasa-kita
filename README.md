# Bahasa Kita 🗣️🌏

Penerjemah ucapan untuk turis Indonesia di luar negeri. Bicara dalam Bahasa Indonesia, lalu lawan bicara **membaca dan mendengar** terjemahannya. Anda melihat **terjemahan balik** untuk memastikan maksud Anda tersampaikan.

**Pembeda:** (a) terjemahan balik untuk verifikasi makna, (b) mode situasi + frasa cepat sekali tap.

## Coba prototype (tanpa server)
Buka **`prototype/prototype.html`** di Chrome (desktop atau Android). File ini mandiri:
- **Mode Gratis (default):** tidak perlu API key. Ucapan dan ketikan diterjemahkan oleh layanan publik MyMemory (kualitas dasar, tanpa konteks situasi). Frasa cepat ke Inggris memakai contoh terjemahan siap pakai.
- **Mode Claude:** buka ⚙️, pilih Claude, lalu tempel API key Anthropic Anda. Key hanya disimpan di memori tab, dan Claude dipanggil langsung dari browser. Mode ini **khusus prototype pribadi**. Versi produksi selalu memakai Claude lewat server, dengan key tersimpan di server.

> Mikrofon butuh konteks aman. Membuka file lokal di Chrome desktop berfungsi. Di Android, lebih mudah memakai URL HTTPS, misalnya Preview Deployment Vercel.

## Cara pakai
Layar utama hanya berisi: bahasa lawan bicara, satu tombol 🎤 besar, 🔊 (putar ulang), dan 💬 (frasa cepat, situasi, ketik).
1. Pilih **bahasa lawan bicara** di bilah tengah.
2. **Tahan** tombol 🎤, bicara, lalu lepas. Atau **ketuk sekali**, dan aplikasi berhenti otomatis saat Anda jeda.
3. Tunjukkan teks di **bagian atas** ke lawan bicara. Suara diputar otomatis. Bila HP diletakkan di meja di antara dua orang, aktifkan **Mode berhadapan** di ⚙️ agar bagian atas terbaca dari seberang.
4. Periksa kotak hijau **"Artinya"** (terjemahan balik): sudah sesuai maksud Anda?
5. Giliran lawan bicara: ia menekan tombol di sisinya (atas) untuk menjawab.
6. **💬** membuka situasi + frasa cepat + kolom ketik. **⚙️** berisi bahasa saya dan info privasi.

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
| — | Revisi 1: tampilan disederhanakan; prototype mode gratis kini benar-benar menerjemahkan | ✅ |
| — | Revisi 2: teks lawan bicara tidak lagi terbalik secara default; rotasi 180° jadi opsi "Mode berhadapan" di ⚙️ | ✅ |
| 4 | Layar terbagi, giliran, situasi, frasa cepat | ✅ Kode selesai (uji E2E headless) |
| 5 | Error ramah, fallback TTS, disclaimer & privasi, UI besar | ✅ Kode selesai |
| 6 | [Checklist QA](docs/qa-checklist.md) di HP, deploy final | ⏳ Butuh HP Android |
| 7 | [Protokol uji pengguna](docs/uji-pengguna.md) | ⏳ Butuh penguji |
