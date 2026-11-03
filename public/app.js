// Bahasa Kita — frontend (vanilla JS, tanpa build step)
// Alur: SpeechRecognition -> /api/translate (Claude) -> teks besar + SpeechSynthesis

const $ = (id) => document.getElementById(id);
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const synth = "speechSynthesis" in window ? window.speechSynthesis : null;

const HOLD_THRESHOLD_MS = 400; // > ini = mode tahan; <= ini = mode ketuk
const SILENCE_STOP_MS = 1800; // mode ketuk: berhenti otomatis setelah jeda
const MAX_LISTEN_MS = 30_000;
const API_TIMEOUT_MS = 12_000;

const ERRORS = {
  stt_unsupported: "Browser ini tidak bisa mengenali suara. Pakai Chrome di Android, atau ketik lewat tombol 💬.",
  mic_denied: "Izin mikrofon ditolak. Ketuk ikon di samping alamat situs → Izin → Mikrofon → Izinkan, lalu muat ulang.",
  no_mic: "Mikrofon tidak ditemukan atau sedang dipakai aplikasi lain.",
  no_speech: "Suara tidak terdengar. Dekatkan HP ke mulut, lalu coba lagi.",
  lang_unsupported: "Pengenalan suara untuk bahasa ini tidak ada di HP ini. Ketik lewat tombol 💬.",
  network: "Internet terputus. Periksa data seluler/Wi-Fi, lalu coba lagi.",
  timeout: "Koneksi lambat, terjemahan tidak selesai. Coba lagi.",
  api: "Terjemahan gagal. Coba lagi sebentar lagi.",
};

class AppError extends Error {
  constructor(code, message) {
    super(message || ERRORS[code] || ERRORS.api);
    this.code = code;
  }
}

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* abaikan */ } },
};

const state = {
  languages: [],
  langMap: new Map(),
  situations: [],
  myLang: "id",
  partnerLang: "en",
  situation: null,
  busy: false,
  listening: null,
  lastSpoken: null, // {text, lang}
  voices: [],
  metrics: [],
};

// ---------------------------------------------------------------- data
async function loadData() {
  if (window.BK_DATA) return window.BK_DATA;
  const [l, s] = await Promise.all([
    fetch("data/languages.json").then((r) => r.json()),
    fetch("data/situations.json").then((r) => r.json()),
  ]);
  return { languages: l.languages, situations: s.situations };
}

const lang = (code) => state.langMap.get(code);
const ui = (code) => lang(code)?.ui || lang("en").ui;
const shortName = (code) => (code === "id" ? "Indonesia" : lang(code).name);

// ---------------------------------------------------------------- terjemahan
async function translate(req) {
  if (typeof window.BK_TRANSLATOR === "function") {
    // Penerjemah pengganti (dipakai prototype). Bungkus error-nya agar pesannya tampil.
    try {
      return await window.BK_TRANSLATOR(req);
    } catch (err) {
      throw err instanceof AppError ? err : new AppError(ERRORS[err?.code] ? err.code : "api", err?.message);
    }
  }
  if (navigator.onLine === false) throw new AppError("network");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), API_TIMEOUT_MS);
  let res;
  try {
    res = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
      signal: ctrl.signal,
    });
  } catch (err) {
    throw new AppError(err.name === "AbortError" ? "timeout" : "network");
  } finally {
    clearTimeout(timer);
  }
  let data = null;
  try { data = await res.json(); } catch { /* bukan JSON */ }
  if (!res.ok) throw new AppError("api", data?.error?.message);
  if (!data?.translation) throw new AppError("api");
  return data;
}

// ---------------------------------------------------------------- suara keluar (TTS)
function refreshVoices() {
  if (!synth) return;
  state.voices = synth.getVoices();
  renderLanguageOptions();
}

const normTag = (s) => String(s || "").replace("_", "-").toLowerCase();

function findVoice(tag) {
  const t = normTag(tag);
  const primary = t.split("-")[0];
  const accepted = primary === "zh" ? ["zh", "cmn", "yue"] : [primary];
  const exact = state.voices.filter((v) => normTag(v.lang) === t);
  if (exact.length) return exact.find((v) => v.localService) || exact[0];
  const near = state.voices.filter((v) => accepted.includes(normTag(v.lang).split("-")[0]));
  return near.find((v) => v.localService) || near[0] || null;
}

/** 'ok' | 'none' | 'unknown' (daftar voice belum termuat) */
function voiceStatus(code) {
  if (!synth) return "none";
  if (!state.voices.length) return "unknown";
  return findVoice(lang(code).tts) ? "ok" : "none";
}

function speak(text, code) {
  return new Promise((resolve) => {
    if (!synth) return resolve({ ok: false, reason: "unsupported" });
    if (voiceStatus(code) === "none") return resolve({ ok: false, reason: "no_voice" });
    const tag = lang(code).tts;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = tag;
    const v = findVoice(tag);
    if (v) u.voice = v;
    u.rate = 0.95;
    let settled = false;
    const done = (r) => { if (!settled) { settled = true; resolve(r); } };
    u.onstart = () => done({ ok: true, startedAt: performance.now() });
    u.onerror = (e) => done({ ok: false, reason: e.error || "error" });
    synth.speak(u);
    setTimeout(() => done({ ok: false, reason: "timeout" }), 5000);
  });
}

// ---------------------------------------------------------------- suara masuk (STT)
/** Gabungkan hasil, sekaligus menangani bug Android yang mengulang teks kumulatif. */
function joinResults(results) {
  const parts = [];
  for (let i = 0; i < results.length; i++) {
    const t = (results[i][0]?.transcript || "").trim();
    if (!t) continue;
    const prev = parts[parts.length - 1];
    if (prev && t.toLowerCase().startsWith(prev.toLowerCase())) parts[parts.length - 1] = t;
    else if (prev && prev.toLowerCase().startsWith(t.toLowerCase())) continue;
    else parts.push(t);
  }
  return parts.join(" ");
}

function startRecognition(sttTag, { keepAlive, onText }) {
  let committed = "";
  let current = "";
  let stopped = false;
  let fatal = null;
  let rec = null;
  let resolveDone;
  const startedAt = Date.now();
  const ctl = {
    lastResultAt: Date.now(),
    done: new Promise((r) => { resolveDone = r; }),
    text: () => [committed, current].filter(Boolean).join(" ").replace(/\s+/g, " ").trim(),
    stop() {
      if (stopped) return;
      stopped = true;
      try { rec?.stop(); } catch { finish(); }
      setTimeout(finish, 2000); // pengaman bila onend tidak terpanggil
    },
  };

  let finished = false;
  function finish() {
    if (finished) return;
    finished = true;
    const text = ctl.text();
    resolveDone({ text, error: text ? null : fatal || "no_speech" });
  }

  function spawn() {
    rec = new SR();
    rec.lang = sttTag;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      current = joinResults(e.results);
      ctl.lastResultAt = Date.now();
      onText(ctl.text());
    };
    rec.onerror = (e) => {
      const map = {
        "not-allowed": "mic_denied",
        "service-not-allowed": "mic_denied",
        "audio-capture": "no_mic",
        network: "network",
        "language-not-supported": "lang_unsupported",
      };
      if (e.error !== "no-speech" && e.error !== "aborted") fatal = map[e.error] || "api";
    };
    rec.onend = () => {
      committed = ctl.text();
      current = "";
      // Android sering mengakhiri sesi saat jeda; mulai lagi selama tombol masih ditahan.
      if (!stopped && !fatal && keepAlive() && Date.now() - startedAt < MAX_LISTEN_MS) {
        try { spawn(); return; } catch { /* jatuh ke finish */ }
      }
      finish();
    };
    rec.start();
  }

  try { spawn(); } catch { fatal = "api"; finish(); }
  return ctl;
}

// ---------------------------------------------------------------- render
function renderMicLabels() {
  const l = state.listening;
  $("meMicLabel").textContent = state.busy
    ? "Menerjemahkan…"
    : l?.speaker === "me" ? "Mendengarkan…" : "Tahan untuk bicara";
  $("partnerMicLabel").textContent = state.busy
    ? ui(state.partnerLang).processing
    : l?.speaker === "partner" ? ui(state.partnerLang).listening : ui(state.partnerLang).speak;
  $("meMic").classList.toggle("busy", state.busy);
  $("partnerMic").classList.toggle("busy", state.busy);
  $("meMic").classList.toggle("listening", l?.speaker === "me");
  $("partnerMic").classList.toggle("listening", l?.speaker === "partner");
}

function setBusy(busy) {
  state.busy = busy;
  renderMicLabels();
}

function clearMessages() {
  for (const id of ["meBig", "meSmall", "partnerBig", "partnerSmall"]) $(id).textContent = "";
  $("meHint").hidden = true;
  $("meCheck").hidden = true;
  $("meNote").hidden = true;
}

function showNote(text, { error = false } = {}) {
  $("meNote").textContent = text;
  $("meNote").classList.toggle("error", error);
  $("meNote").hidden = false;
}

function showError(err) {
  const msg = err instanceof AppError ? err.message : ERRORS[err] || String(err?.message || err);
  showNote("⚠️ " + msg, { error: true });
}

function showInterim(speaker, text) {
  $("meHint").hidden = true;
  $(speaker === "me" ? "meSmall" : "partnerSmall").textContent = text;
}

function setBig(el, text) {
  el.textContent = text;
  el.classList.toggle("long", text.length > 90);
}

function renderResult({ speaker, text, result }) {
  clearMessages();
  if (speaker === "me") {
    // Atas: terjemahan besar untuk lawan bicara. Bawah: ucapan saya + artinya.
    setBig($("partnerBig"), result.translation);
    $("meSmall").textContent = "🗣 " + text;
    $("meCheckText").textContent = result.back_translation;
    $("meCheck").hidden = false;
  } else {
    // Bawah: terjemahan besar untuk saya. Atas: ucapan lawan bicara + artinya (bahasanya sendiri).
    setBig($("meBig"), result.translation);
    $("partnerSmall").textContent = `${text}\n✓ ${result.back_translation}`;
  }
  $("replayBtn").disabled = false;
}

// ---------------------------------------------------------------- alur utama
async function runTranslation(text, speaker, { from, to, origin = "speech", releasedAt } = {}) {
  from = from || (speaker === "me" ? state.myLang : state.partnerLang);
  to = to || (speaker === "me" ? state.partnerLang : state.myLang);
  if (from === to) {
    showError(new AppError("api", "Bahasa Anda dan lawan bicara sama. Pilih bahasa lain."));
    return;
  }
  setBusy(true);
  clearMessages();
  showInterim(speaker, text);
  const t0 = performance.now();
  let result;
  try {
    result = await translate({ text, source_lang: from, target_lang: to, situation: state.situation });
  } catch (err) {
    setBusy(false);
    showError(err instanceof AppError ? err : new AppError("api"));
    return;
  }
  const t1 = performance.now();
  setBusy(false);
  renderResult({ speaker, text, result });
  state.lastSpoken = { text: result.translation, lang: to };

  const tts = await speak(result.translation, to);
  if (!tts.ok) showNote(`🔇 Suara ${shortName(to)} tidak tersedia di HP ini. Tunjukkan teksnya.`);
  const m = {
    when: new Date().toISOString(),
    origin,
    pair: `${from}->${to}`,
    situation: state.situation || "-",
    stt_finalize_ms: releasedAt ? Math.round(t0 - releasedAt) : null,
    api_ms: Math.round(t1 - t0),
    tts_start_ms: tts.ok ? Math.round(tts.startedAt - t1) : null,
    total_ms: tts.ok ? Math.round(tts.startedAt - (releasedAt || t0)) : null,
    tts: tts.ok ? "ok" : tts.reason,
  };
  state.metrics.push(m);
  console.info("[latensi]", m);
}

async function beginListening(speaker) {
  if (state.busy || state.listening) return;
  if (!SR) { showError(new AppError("stt_unsupported")); return; }
  synth?.cancel();
  const code = speaker === "me" ? state.myLang : state.partnerLang;
  const session = { speaker, holding: true, downAt: Date.now() };
  state.listening = session;
  clearMessages();
  renderMicLabels();

  const ctl = startRecognition(lang(code).stt, {
    keepAlive: () => session.holding,
    onText: (t) => showInterim(speaker, t),
  });
  session.ctl = ctl;

  const watchdog = setInterval(() => {
    if (Date.now() - session.downAt > MAX_LISTEN_MS) ctl.stop();
    else if (!session.holding && ctl.text() && Date.now() - ctl.lastResultAt > SILENCE_STOP_MS) ctl.stop();
  }, 250);

  const { text, error } = await ctl.done;
  const releasedAt = performance.now();
  clearInterval(watchdog);
  state.listening = null;
  renderMicLabels();

  if (!text) {
    clearMessages();
    showError(new AppError(error || "no_speech"));
    return;
  }
  await runTranslation(text, speaker, { releasedAt });
}

function bindMic(btn, speaker) {
  btn.addEventListener("contextmenu", (e) => e.preventDefault());
  btn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    const s = state.listening;
    if (s) {
      if (s.speaker === speaker) s.ctl?.stop(); // ketuk kedua = berhenti
      return;
    }
    beginListening(speaker);
  });
  const release = () => {
    const s = state.listening;
    if (!s || s.speaker !== speaker || !s.holding) return;
    s.holding = false;
    if (Date.now() - s.downAt > HOLD_THRESHOLD_MS) s.ctl?.stop();
    // Bila hanya diketuk: tetap mendengar sampai jeda bicara atau ketukan berikutnya.
  };
  btn.addEventListener("pointerup", release);
  btn.addEventListener("pointercancel", release);
  btn.addEventListener("pointerleave", release);
  // Akses keyboard (Enter/Spasi): toggle.
  btn.addEventListener("click", (e) => {
    if (e.detail !== 0) return;
    const s = state.listening;
    if (s) { if (s.speaker === speaker) s.ctl?.stop(); return; }
    beginListening(speaker); // state.listening diisi secara sinkron
    if (state.listening) state.listening.holding = false;
  });
}

// ---------------------------------------------------------------- kontrol
function renderLanguageOptions() {
  const fill = (sel, value, exclude) => {
    sel.innerHTML = "";
    for (const l of state.languages) {
      if (l.code === exclude) continue;
      const opt = document.createElement("option");
      opt.value = l.code;
      opt.textContent = shortName(l.code) + (voiceStatus(l.code) === "none" ? " (teks saja)" : "");
      sel.appendChild(opt);
    }
    sel.value = value;
  };
  fill($("partnerLang"), state.partnerLang, state.myLang);
  fill($("myLang"), state.myLang, null);
}

function setLanguages(myLang, partnerLang) {
  state.myLang = myLang;
  state.partnerLang = partnerLang;
  store.set("bk_my", myLang);
  store.set("bk_partner", partnerLang);
  renderLanguageOptions();
  $("myLangLabel").textContent = shortName(myLang);
  $("partnerPanel").setAttribute("lang", partnerLang);
  renderMicLabels();
}

function renderSituations() {
  const row = $("situationRow");
  row.innerHTML = "";
  const items = [{ id: null, name: "Umum", icon: "🌐" }, ...state.situations];
  for (const s of items) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String(state.situation === s.id));
    b.textContent = `${s.icon} ${s.name}`;
    b.addEventListener("click", () => {
      state.situation = s.id;
      store.set("bk_situation", s.id || "");
      renderSituations();
      renderPhrases();
    });
    row.appendChild(b);
  }
}

function renderPhrases() {
  const list = $("phraseList");
  list.innerHTML = "";
  const sit = state.situations.find((s) => s.id === state.situation);
  if (!sit) {
    const li = document.createElement("li");
    li.className = "small";
    li.textContent = "Pilih situasi di atas untuk melihat frasa siap pakai.";
    list.appendChild(li);
    return;
  }
  const target = state.partnerLang !== "id" ? state.partnerLang : state.myLang;
  for (const p of sit.phrases) {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = p;
    b.addEventListener("click", () => {
      closeSheet("phrasesSheet");
      if (state.busy || state.listening) return;
      runTranslation(p, "me", { from: "id", to: target, origin: "phrase" });
    });
    li.appendChild(b);
    list.appendChild(li);
  }
}

/** Mode berhadapan: panel lawan bicara diputar 180°. Default mati (teks tidak terbalik). */
function setFacing(on) {
  $("app").classList.toggle("facing", on);
  $("facingToggle").checked = on;
  store.set("bk_facing", on ? "1" : "0");
}

function openSheet(id) { $(id).hidden = false; }
function closeSheet(id) { $(id).hidden = true; }

function warmUpSpeech() {
  // Gestur pertama pengguna "membuka" SpeechSynthesis di beberapa versi Android.
  if (!synth) return;
  try {
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    synth.speak(u);
  } catch { /* abaikan */ }
}

function bindControls() {
  $("partnerLang").addEventListener("change", (e) => setLanguages(state.myLang, e.target.value));
  $("myLang").addEventListener("change", (e) => {
    const v = e.target.value;
    setLanguages(v, v === state.partnerLang ? state.myLang : state.partnerLang);
  });
  $("settingsBtn").addEventListener("click", () => openSheet("settingsSheet"));
  $("facingToggle").addEventListener("change", (e) => setFacing(e.target.checked));
  $("aboutBtn").addEventListener("click", () => { closeSheet("settingsSheet"); openSheet("introSheet"); });
  $("phrasesBtn").addEventListener("click", () => { renderPhrases(); openSheet("phrasesSheet"); });
  $("replayBtn").addEventListener("click", () => {
    const l = state.lastSpoken;
    if (l) speak(l.text, l.lang).then((r) => { if (!r.ok) showNote(`🔇 Suara ${shortName(l.lang)} tidak tersedia di HP ini. Tunjukkan teksnya.`); });
  });

  $("typeForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const text = $("typeInput").value.trim();
    if (!text || state.busy) return;
    closeSheet("phrasesSheet");
    $("typeInput").value = "";
    runTranslation(text, "me", { origin: "typed" });
  });

  for (const sheet of document.querySelectorAll(".sheet")) {
    sheet.addEventListener("click", (e) => {
      if (e.target === sheet && sheet.id !== "introSheet") sheet.hidden = true;
      if (e.target.closest("[data-close]")) sheet.hidden = true;
    });
  }
  $("introStart").addEventListener("click", () => {
    store.set("bk_intro_ok", "1");
    closeSheet("introSheet");
    warmUpSpeech();
  });

  bindMic($("meMic"), "me");
  bindMic($("partnerMic"), "partner");
}

// ---------------------------------------------------------------- latensi (untuk QA)
window.bkLatency = () => {
  const vals = state.metrics.map((m) => m.total_ms).filter((x) => typeof x === "number").sort((a, b) => a - b);
  const median = vals.length ? vals[Math.floor((vals.length - 1) / 2)] : null;
  console.table(state.metrics);
  return { n: vals.length, median_total_ms: median };
};

// ---------------------------------------------------------------- init
async function init() {
  const data = await loadData();
  state.languages = data.languages;
  state.situations = data.situations;
  state.langMap = new Map(data.languages.map((l) => [l.code, l]));

  const savedMy = store.get("bk_my");
  const savedPartner = store.get("bk_partner");
  if (savedMy && state.langMap.has(savedMy)) state.myLang = savedMy;
  if (savedPartner && state.langMap.has(savedPartner) && savedPartner !== state.myLang) state.partnerLang = savedPartner;
  const savedSit = store.get("bk_situation");
  if (savedSit && state.situations.some((s) => s.id === savedSit)) state.situation = savedSit;

  renderSituations();
  bindControls();
  setFacing(store.get("bk_facing") === "1");
  setLanguages(state.myLang, state.partnerLang);

  if (synth) {
    refreshVoices();
    synth.addEventListener?.("voiceschanged", refreshVoices);
  }
  if (!SR) showNote("ℹ️ Browser ini tidak bisa mengenali suara. Pakai Chrome di Android, atau ketik lewat tombol 💬.");
  if (store.get("bk_intro_ok") !== "1") openSheet("introSheet");

  window.BK = { state, runTranslation, setLanguages };
  document.dispatchEvent(new CustomEvent("bk:ready"));
}

init().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML(
    "afterbegin",
    '<p class="note error" style="margin:16px">Gagal memuat aplikasi. Periksa koneksi lalu muat ulang halaman.</p>'
  );
});
