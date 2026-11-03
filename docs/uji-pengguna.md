# Fase 7 — Protokol Uji Pengguna

## Desain
- **Penguji:** 3–5 orang Indonesia yang tidak fasih bahasa asing target. Variasikan usia dan literasi digital.
- **Lawan bicara:** 1 orang yang fasih bahasa target. Ia memerankan staf hotel/restoran dan tidak boleh membantu dalam Bahasa Indonesia.
- **Skenario:** (A) check-in hotel, (B) memesan makanan di restoran, dengan permintaan halal/alergi.
- **Kondisi:** setiap penguji memakai **Bahasa Kita** dan **Google Translate (mode percakapan)** untuk skenario yang sama.
- **Counterbalancing:** separuh penguji mulai dengan Bahasa Kita, separuh dengan Google Translate, untuk mengurangi efek belajar dan efek urutan.
- **Target tugas** per skenario (contoh hotel): sebut nama pemesanan, minta kamar bebas asap rokok, tanya jam sarapan, titip koper.

## Ukuran (brief §9)
| Indikator | Cara ukur | Target |
|---|---|---|
| Pesan dipahami tanpa diulang | Lawan bicara menandai tiap ucapan: dipahami pada percobaan pertama? (ya/tidak) | > 80% |
| Latensi median | `bkLatency()` di akhir sesi | < 3 detik |
| Rasa yakin "terjemahan saya benar" | Skala 1–5 setelah tiap skenario, untuk tiap aplikasi | Bahasa Kita > Google Translate |

Tambahan yang disarankan: jumlah ucapan per tugas, tugas selesai (ya/tidak), dan berapa kali penguji **mengoreksi** setelah melihat terjemahan balik (indikator manfaat pembeda a).

## Lembar per penguji
```
Penguji: P__  Usia: __  Bahasa target: __  Urutan: BK→GT / GT→BK
Skenario A  | Bahasa Kita | Google Translate
- Ucapan dipahami pertama kali  | __/__ | __/__
- Rasa yakin (1–5)              |  __   |  __
- Koreksi karena terjemahan balik | __  |  —
Skenario B  | (sama)
Pertanyaan terbuka:
1. Kapan Anda merasa ragu terjemahannya benar?
2. Apakah terjemahan balik membantu? Kapan?
3. Apakah mode situasi / frasa cepat dipakai? Mengapa?
4. Apa yang paling membingungkan?
```

## Analisis & batasan
- Dengan n = 3–5, laporkan **deskriptif** (median, rentang, per penguji), jangan uji signifikansi. Hasilnya indikatif, bukan bukti kausal.
- Waspadai bias: penguji tahu aplikasi mana buatan pemilik proyek (social desirability). Mitigasi: fasilitator netral, dan jangan sebut aplikasi mana yang "milik kita".
- Pisahkan efek pembeda: catat apakah rasa yakin naik **karena** terjemahan balik (tanyakan langsung dan lihat jumlah koreksi).

## Ringkasan (Definisi Selesai Fase 7)
- Apakah pembeda (a) dan (b) terbukti meningkatkan rasa yakin?
- 3 prioritas versi berikutnya, misalnya catatan budaya (pembeda c), iPhone/Safari, atau riwayat.
