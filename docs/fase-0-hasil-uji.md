# Fase 0 — Hasil Uji Kemampuan HP

**Status:** ⏳ Menunggu uji di HP Android (tidak bisa dilakukan dari server pengembangan).

## Cara menguji

1. Buka `spike.html` di **HP Android dengan Chrome**. Opsinya:
   - setelah deploy pratinjau: `https://<url-vercel>/spike.html`, atau
   - jalankan `npm run dev` di laptop, lalu buka dari HP lewat tunnel HTTPS. Mikrofon wajib memakai HTTPS atau `localhost`.
2. Untuk tiap bahasa: tekan **🎤 Uji STT** dan bacakan kalimat contoh. Lalu tekan **🔊 Uji TTS** dan isi penilaian.
3. Isi model HP, tekan **📋 Salin hasil**, lalu tempel tabelnya di bawah.
4. Ulangi di HP kedua bila ada. Voice TTS sangat bergantung pada merek dan engine TTS (Google vs Samsung).

> Tips: bila voice suatu bahasa tidak ada, cek *Setelan → Aksesibilitas → Output text-to-speech → Mesin Google → Instal data suara*. Catat apakah voice bisa diunduh. Pengguna awam kemungkinan tidak melakukannya.

## Aturan keputusan (dari brief §6)

| Hasil STT | Voice TTS | Keputusan | Nilai `status` di `languages.json` |
|---|---|---|---|
| Berhasil (kemiripan ≥ 60% dan dinilai "ya") | Ada | Tampilkan | `final` |
| Berhasil | Tidak ada | Tampilkan dengan label "teks saja" | `teks_saja` |
| Gagal | — | Jangan tampilkan (hapus dari `languages.json`) | — |

Aplikasi juga mendeteksi voice **saat runtime**. Bahasa yang voice-nya tidak ada di HP pengguna otomatis diberi label "teks saja", sehingga label statis di atas cukup menjadi acuan umum.

## Hasil

### HP uji 1

_(tempel tabel dari spike.html di sini)_

### HP uji 2 (opsional)

_(tempel tabel di sini)_

## Daftar bahasa final

_(diisi setelah uji — Definisi Selesai Fase 0: daftar ini disepakati)_
