// ===== Khusus prototype (di-inline oleh scripts/build-prototype.mjs) =====
// Dua mode terjemahan:
//  - GRATIS (default): tanpa API key. Frasa cepat ke Inggris memakai contoh terjemahan statis;
//    ucapan/ketikan bebas diterjemahkan oleh layanan publik MyMemory (kualitas dasar, tanpa konteks situasi).
//  - CLAUDE: memanggil Claude langsung dari browser dengan API key Anda (kualitas sesungguhnya).
// Aplikasi produksi selalu memakai Claude lewat server (/api/translate).
const SDK_URL = "https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.3.0/+esm";
const MYMEMORY_URL = "https://api.mymemory.translated.net/get";
const norm = (t) => t.toLowerCase().replace(/[.,!?;:"'“”]/g, "").replace(/\s+/g, " ").trim();
const DEMO = Object.fromEntries(Object.entries(window.BK_DEMO_EN || {}).map(([k, v]) => [norm(k), v]));
const proto = { mode: "free", apiKey: "", client: null };

const fail = (message, code = "api") => Object.assign(new Error(message), { code });

function situationContext(id) {
  const s = (window.BK_DATA?.situations || []).find((x) => x.id === id);
  return s ? s.context : null;
}

function decodeEntities(s) {
  const t = document.createElement("textarea");
  t.innerHTML = s;
  return t.value;
}

async function myMemory(text, from, to) {
  const code = (c) => (c === "zh" ? "zh-CN" : c);
  const url = `${MYMEMORY_URL}?q=${encodeURIComponent(text)}&langpair=${code(from)}|${code(to)}`;
  let data;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    data = await res.json();
  } catch {
    throw fail("Penerjemah gratis tidak bisa dihubungi. Periksa internet, atau pakai mode Claude di ⚙️.", "network");
  }
  const out = decodeEntities(String(data?.responseData?.translatedText || "")).trim();
  if (String(data?.responseStatus) !== "200" || !out || /MYMEMORY WARNING/i.test(out)) {
    throw fail("Kuota penerjemah gratis habis atau gagal. Pakai mode Claude di ⚙️.");
  }
  return out;
}

async function freeTranslate({ text, source_lang, target_lang }) {
  const hit = DEMO[norm(text)];
  if (hit && source_lang === "id" && target_lang === "en") {
    return { translation: hit[0], back_translation: hit[1] };
  }
  const translation = await myMemory(text, source_lang, target_lang);
  // Terjemahan balik dihitung dari HASIL terjemahan, bukan menyalin teks asli.
  const back_translation = await myMemory(translation, target_lang, source_lang);
  return { translation, back_translation };
}

async function claudeTranslate({ text, source_lang, target_lang, situation }) {
  if (!proto.apiKey) throw fail("Masukkan API key Anthropic dulu di ⚙️ Pengaturan.");
  if (!proto.client) {
    let Anthropic;
    try {
      ({ default: Anthropic } = await import(SDK_URL));
    } catch {
      throw fail("Gagal memuat SDK Anthropic dari CDN. Periksa koneksi.", "network");
    }
    proto.client = new Anthropic({ apiKey: proto.apiKey, dangerouslyAllowBrowser: true, timeout: 15000, maxRetries: 1 });
  }
  if (text.length > MAX_INPUT_CHARS) throw fail(`Teks terlalu panjang (maks ${MAX_INPUT_CHARS} karakter).`);
  let response;
  try {
    response = await proto.client.messages.create(
      buildRequestParams({ text, source_lang, target_lang, situationContext: situationContext(situation) })
    );
  } catch (err) {
    throw fail(err?.status === 401 ? "API key tidak valid." : err?.status === 429 ? "Batas permintaan API tercapai. Tunggu sebentar." : "Panggilan ke Claude gagal: " + (err?.message || err));
  }
  try {
    return parseTranslationResponse(response);
  } catch (err) {
    throw fail(err.message);
  }
}

window.BK_TRANSLATOR = (req) => (proto.mode === "claude" ? claudeTranslate(req) : freeTranslate(req));

function renderProtoSettings() {
  const slot = document.getElementById("extSlot");
  if (!slot) return;
  slot.innerHTML = `
    <label class="field">🧪 Mesin terjemahan (prototype)
      <select id="protoMode">
        <option value="free">Gratis — kualitas dasar, tanpa API key</option>
        <option value="claude">Claude — pakai API key Anda</option>
      </select>
    </label>
    <form class="type-row" id="protoKeyRow" hidden>
      <input id="protoKey" type="password" autocomplete="off" placeholder="sk-ant-…">
      <button class="primary-btn" type="submit" aria-label="Simpan key">✓</button>
    </form>
    <p class="small" id="protoNote"></p>`;
  const note = document.getElementById("protoNote");
  const sel = document.getElementById("protoMode");
  const update = () => {
    document.getElementById("protoKeyRow").hidden = proto.mode !== "claude";
    note.textContent = proto.mode === "claude"
      ? (proto.apiKey ? "✅ Claude aktif. Key hanya di memori tab ini." : "Tempel API key Anthropic. Key hanya di memori tab ini, tidak disimpan.")
      : "Mode gratis memakai layanan publik MyMemory: tanpa konteks situasi dan kualitas di bawah Claude. Cukup untuk mencoba alur.";
  };
  sel.addEventListener("change", () => { proto.mode = sel.value; update(); });
  document.getElementById("protoKeyRow").addEventListener("submit", (e) => {
    e.preventDefault();
    proto.apiKey = document.getElementById("protoKey").value.trim();
    proto.client = null;
    document.getElementById("protoKey").value = "";
    update();
  });
  update();
}
renderProtoSettings();
