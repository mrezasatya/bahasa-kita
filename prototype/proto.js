// ===== Khusus prototype (di-inline oleh scripts/build-prototype.mjs) =====
// Dua mode: DEMO (tanpa internet ke Claude, frasa cepat -> Inggris saja)
// dan CLAUDE API (memanggil Claude langsung dari browser dengan API key Anda sendiri).
const SDK_URL = "https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.3.0/+esm";
const norm = (t) => t.toLowerCase().replace(/[.,!?;:"'“”]/g, "").replace(/\s+/g, " ").trim();
const DEMO = Object.fromEntries(Object.entries(window.BK_DEMO_EN || {}).map(([k, v]) => [norm(k), v]));
const proto = { mode: "demo", apiKey: "", client: null };

function situationContext(id) {
  const s = (window.BK_DATA?.situations || []).find((x) => x.id === id);
  return s ? s.context : null;
}

async function demoTranslate({ text, source_lang, target_lang }) {
  await new Promise((r) => setTimeout(r, 450)); // simulasi latensi jaringan
  const hit = DEMO[norm(text)];
  if (hit && source_lang === "id" && target_lang === "en") {
    return { translation: hit[0], back_translation: hit[1] };
  }
  return {
    translation: `[DEMO] ${text}`,
    back_translation: `[DEMO] Mode demo hanya menerjemahkan frasa cepat ke Inggris. Aktifkan mode Claude API untuk ucapan bebas.`,
  };
}

async function claudeTranslate({ text, source_lang, target_lang, situation }) {
  if (!proto.apiKey) throw Object.assign(new Error("Masukkan API key Anthropic dulu (mode Claude API)."), { code: "api" });
  if (!proto.client) {
    let Anthropic;
    try {
      ({ default: Anthropic } = await import(SDK_URL));
    } catch {
      throw Object.assign(new Error("Gagal memuat SDK Anthropic dari CDN. Periksa koneksi."), { code: "network" });
    }
    proto.client = new Anthropic({ apiKey: proto.apiKey, dangerouslyAllowBrowser: true, timeout: 15000, maxRetries: 1 });
  }
  if (text.length > MAX_INPUT_CHARS) throw Object.assign(new Error(`Teks terlalu panjang (maks ${MAX_INPUT_CHARS} karakter).`), { code: "api" });
  let response;
  try {
    response = await proto.client.messages.create(
      buildRequestParams({ text, source_lang, target_lang, situationContext: situationContext(situation) })
    );
  } catch (err) {
    const msg = err?.status === 401 ? "API key tidak valid." : err?.status === 429 ? "Batas permintaan API tercapai. Tunggu sebentar." : "Panggilan ke Claude gagal: " + (err?.message || err);
    throw Object.assign(new Error(msg), { code: "api" });
  }
  try {
    return parseTranslationResponse(response);
  } catch (err) {
    throw Object.assign(new Error(err.message), { code: "api" });
  }
}

window.BK_TRANSLATOR = (req) => (proto.mode === "api" ? claudeTranslate(req) : demoTranslate(req));

function renderProtoBar() {
  const slot = document.getElementById("extSlot");
  if (!slot) return;
  slot.innerHTML = `
    <div class="proto-bar">
      <span class="proto-tag">🧪 PROTOTYPE</span>
      <label class="proto-mode">Mode
        <select id="protoMode">
          <option value="demo">Demo (tanpa API)</option>
          <option value="api">Claude API (pakai key)</option>
        </select>
      </label>
    </div>
    <div class="proto-key" id="protoKeyRow" hidden>
      <input id="protoKey" type="password" autocomplete="off" placeholder="sk-ant-… (hanya di memori, tidak disimpan)">
      <button id="protoKeyBtn" type="button">Pakai</button>
    </div>
    <p class="proto-note" id="protoNote">Mode demo: frasa cepat ➝ Inggris memakai contoh terjemahan statis. Mikrofon & suara tetap asli.</p>`;
  const modeSel = document.getElementById("protoMode");
  modeSel.addEventListener("change", () => {
    proto.mode = modeSel.value;
    document.getElementById("protoKeyRow").hidden = proto.mode !== "api";
    document.getElementById("protoNote").textContent =
      proto.mode === "api"
        ? (proto.apiKey ? "✅ Claude API aktif (claude-haiku-5-5)." : "Masukkan API key Anthropic Anda. Key hanya disimpan di memori tab ini.")
        : "Mode demo: frasa cepat ➝ Inggris memakai contoh terjemahan statis. Mikrofon & suara tetap asli.";
  });
  document.getElementById("protoKeyBtn").addEventListener("click", () => {
    proto.apiKey = document.getElementById("protoKey").value.trim();
    proto.client = null;
    document.getElementById("protoKey").value = "";
    document.getElementById("protoNote").textContent = proto.apiKey ? "✅ Claude API aktif (claude-haiku-5-5)." : "API key kosong.";
  });
}
renderProtoBar();
