# Fase 6 — Checklist QA

Uji di HP Android + Chrome (catat model HP dan versi Android). Centang bila lulus.

## Alur inti
- [ ] Layar awal (disclaimer & privasi) muncul pada kunjungan pertama, dan bisa dibuka lagi lewat ⚙️ → "Cara pakai, privasi & disclaimer"
- [ ] Izin mikrofon diminta, dan setelah diizinkan alur berjalan
- [ ] Tahan-bicara-lepas: transkrip → terjemahan teks besar (atas, tidak terbalik) → suara → terjemahan balik (bawah)
- [ ] ⚙️ Mode berhadapan: panel atas terbalik 180°, dan pilihan tersimpan setelah halaman dimuat ulang
- [ ] Ketuk sekali: mendengar sampai jeda sekitar 2 detik lalu berhenti otomatis. Ketuk lagi untuk berhenti manual
- [ ] Tombol 🔊 memutar ulang suara terjemahan
- [ ] Pilihan bahasa (bilah tengah & ⚙️) tersimpan setelah halaman dimuat ulang
- [ ] Lawan bicara menekan tombol 🎤 di panel atas → terjemahan ke Bahasa Indonesia tampil besar di bawah dan diucapkan
- [ ] Kolom ketik di sheet 💬 berjalan

## Situasi & frasa cepat (semua 6 situasi)
- [ ] Bandara & Imigrasi  - [ ] Hotel  - [ ] Restoran  - [ ] Transportasi  - [ ] Belanja  - [ ] Darurat & Kesehatan
- [ ] Setiap frasa cepat menghasilkan terjemahan + suara + terjemahan balik

## Bahasa final (isi sesuai hasil Fase 0)
| Bahasa | STT | TTS / label teks saja | Terjemahan masuk akal | Catatan |
|---|---|---|---|---|
| | | | | |

## Kondisi error (aplikasi tidak boleh macet)
- [ ] Izin mikrofon ditolak → pesan cara mengizinkan
- [ ] Tidak bicara sama sekali → "Tidak ada suara terdeteksi"
- [ ] Mode pesawat / jaringan putus → pesan koneksi
- [ ] Koneksi lambat (DevTools: *Slow 3G*) → hasil tetap muncul, atau pesan "koneksi lambat" setelah ±12 detik
- [ ] API gagal (mis. key salah di Preview) → pesan "Layanan terjemahan gagal"
- [ ] Bahasa tanpa voice → label "teks saja" + peringatan 🔇
- [ ] Kalimat > 500 karakter (kolom ketik) → dibatasi

## Lingkungan nyata
- [ ] Ruangan bising (kafe, jalan raya): akurasi STT dicatat
- [ ] Satu tangan: semua tombol mudah dijangkau
- [ ] Layar di bawah sinar matahari: kontras cukup

## Latensi
Lakukan minimal 20 percakapan, lalu jalankan `bkLatency()` di console (Chrome remote debugging: `chrome://inspect`).
- Median `total_ms` (lepas tombol → suara mulai): ______ ms (target < 3000)
- Bila > 3000 ms: cek `api_ms` vs `stt_finalize_ms` vs `tts_start_ms` untuk menemukan tahap yang lambat.
