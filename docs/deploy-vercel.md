# Fase 1 — Menghubungkan repo ke Vercel

Langkah ini perlu dilakukan pemilik akun, karena melibatkan API key rahasia.

1. Buka https://vercel.com/new, lalu **Import** repo `mrezasatya/bahasa-kita`.
2. Pengaturan proyek:
   - **Framework Preset:** Other
   - **Build Command:** kosongkan
   - **Output Directory:** `public` (sudah diatur di `vercel.json`)
   - **Root Directory:** `./`
3. **Environment Variables:** tambahkan `ANTHROPIC_API_KEY` = key dari https://console.anthropic.com untuk *Production* dan *Preview*.
   - Disarankan membuat key khusus proyek ini dan memasang **batas pengeluaran bulanan** (spend limit) di Console Anthropic. Ini pengaman biaya yang paling efektif, karena rate limit di server hanya per instance.
4. Klik **Deploy**. Cek:
   - `https://<proyek>.vercel.app/` → aplikasi tampil
   - `https://<proyek>.vercel.app/spike.html` → halaman uji Fase 0
   - Uji API:
     ```bash
     curl -s -X POST https://<proyek>.vercel.app/api/translate \
       -H 'Content-Type: application/json' \
       -d '{"text":"Saya mau check-in atas nama Reza","source_lang":"id","target_lang":"ja","situation":"hotel"}'
     ```
5. Buka URL di HP Android (Definisi Selesai Fase 1).

Setiap push ke branch akan membuat **Preview Deployment**. Merge ke `main` akan memperbarui Production.
