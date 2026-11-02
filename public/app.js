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
  stt_unsupported: "Browser ini tidak mendukung pengenalan suara. Gunakan Chrome di Android, atau ketik dengan tombol ⌨️.",
  mic_denied: "Izin mikrofon ditolak. Ketuk ikon di samping alamat situs → Izin → Mikrofon → Izinkan, lalu muat ulang halaman.",
  no_mic: "Mikrofon tidak ditemukan atau sedang dipakai aplikasi lain.",
  no_speech: "Tidak ada suara terdeteksi. Dekatkan HP ke mulut, lalu coba lagi.",
  lang_unsupported: "Pengenalan suara untuk bahasa ini tidak tersedia di HP ini. Gunakan tombol ⌨️ untuk mengetik.",
  network: "Koneksi internet terputus. Periksa data seluler/Wi-Fi, lalu coba lagi.",
  timeout: "Koneksi lambat sehingga terjemahan tidak selesai. Coba lagi.",
  api: "Layanan terjemahan gagal. Coba lagi beberapa saat lagi.",
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
  turn: "me",
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
  updateVoiceWarning();
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
    // Tanpa teks: pakai error fatal bila ada, selain itu anggap tidak ada suara.
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
function setTurn(turn) {
  state.turn = turn;
  $("app").dataset.turn = turn;
  $("turnBtn").textContent = turn === "partner" ? "↩️ Giliran saya" : "🔄 Giliran lawan bicara";
  if (!state.busy && !state.listening) {
    $("partnerStatus").textContent = turn === "partner" ? "👇 " + ui(state.partnerLang).speak : "";
    $("meStatus").textContent = turn === "partner" ? "Lawan bicara menjawab…" : "Siap";
  }
}

function setBusy(busy, speaker) {
  state.busy = busy;
  for (const id of ["meMic", "partnerMic"]) $(id).classList.toggle("busy", busy);
  $("partnerStatus").textContent = busy ? ui(state.partnerLang).processing : "";
  $("meStatus").textContent = busy ? "Menerjemahkan…" : "Siap";
  if (!busy) setTurn(state.turn);
  void speaker;
}

function clearMessages() {
  for (const id of ["meBig", "meSmall", "partnerBig", "partnerSmall"]) $(id).textContent = "";
  $("meHint").hidden = true;
  $("meCheck").hidden = true;
  $("partnerCheck").hidden = true;
  $("meError").hidden = true;
  $("meWarn").hidden = true;
  $("partnerWarn").hidden = true;
}

function showError(err, speaker = "me") {
  const msg = err instanceof AppError ? err.message : ERRORS[err] || String(err?.message || err);
  $("meError").textContent = "⚠️ " + msg;
  $("meError").hidden = false;
  if (speaker === "partner") $("partnerStatus").textContent = "⚠️";
}

function showInterim(speaker, text) {
  if (speaker === "me") {
    $("meHint").hidden = true;
    $("meSmall").textContent = "🗣 " + text;
  } else {
    $("partnerSmall").textContent = "🗣 " + text;
  }
}

function setBig(el, text) {
  el.textContent = text;
  el.classList.toggle("long", text.length > 90);
}

function renderResult({ speaker, text, from, to, result }) {
  clearMessages();
  if (speaker === "me") {
    $("partnerHeading").textContent = ui(to).heading;
    setBig($("partnerBig"), result.translation);
    $("meSmall").textContent = `🗣 Anda (${lang(from).name}): ${text}`;
    $("meCheckText").textContent = result.back_translation;
    $("meCheck").querySelector(".check-label").textContent =
      `✅ Terjemahan balik ke ${lang(from).name} — apakah maksud Anda sudah benar?`;
    $("meCheck").hidden = false;
  } else {
    $("partnerHeading").textContent = "🗣";
    $("partnerSmall").textContent = text;
    $("partnerCheck").textContent = `${ui(from).check}: ${result.back_translation}`;
    $("partnerCheck").hidden = false;
    setBig($("meBig"), result.translation);
    $("meSmall").textContent = `Lawan bicara (${lang(from).name}): ${text}`;
  }
  $("meReplay").disabled = false;
  $("partnerReplay").disabled = false;
}

function showVoiceWarning(code) {
  const msg = `🔇 Suara ${lang(code).name} tidak tersedia di HP ini. Tunjukkan teks di layar kepada lawan bicara.`;
  $("meWarn").textContent = msg;
  $("meWarn").hidden = false;
}

function updateVoiceWarning() {
  if (state.busy || state.listening) return;
  if (voiceStatus(state.partnerLang) === "none" && !$("meHint").hidden) {
    $("meWarn").textContent = `ℹ️ ${lang(state.partnerLang).name}: mode teks saja (suara tidak tersedia di HP ini).`;
    $("meWarn").hidden = false;
  }
}

// ---------------------------------------------------------------- alur utama
async function runTranslation(text, speaker, { from, to, origin = "speech", releasedAt } = {}) {
  from = from || (speaker === "me" ? state.myLang : state.partnerLang);
  to = to || (speaker === "me" ? state.partnerLang : state.myLang);
  if (from === to) {
    showError(new AppError("api", "Bahasa asal dan tujuan sama. Pilih bahasa lawan bicara yang berbeda."));
    return;
  }
  setBusy(true, speaker);
  $("meError").hidden = true;
  showInterim(speaker, text);
  const t0 = performance.now();
  let result;
  try {
    result = await translate({ text, source_lang: from, target_lang: to, situation: state.situation });
  } catch (err) {
    setBusy(false, speaker);
    clearMessages();
    showInterim(speaker, text); // tetap tampilkan kalimat yang gagal diterjemahkan
    showError(err instanceof AppError ? err : new AppError("api"), speaker);
    return;
  }
  const t1 = performance.now();
  setBusy(false, speaker);
  renderResult({ speaker, text, from, to, result });
  state.lastSpoken = { text: result.translation, lang: to };
  if (speaker === "partner") setTurn("me");

  const tts = await speak(result.translation, to);
  if (!tts.ok) showVoiceWarning(to);
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
  setTurn(speaker);
  const code = speaker === "me" ? state.myLang : state.partnerLang;
  const btn = $(speaker === "me" ? "meMic" : "partnerMic");
  const session = { speaker, holding: true, downAt: Date.now() };
  state.listening = session;

  clearMessages();
  btn.classList.add("listening");
  $(speaker === "me" ? "meMicLabel" : "partnerMicLabel").textContent = ui(code).listening;
  if (speaker === "me") $("meStatus").textContent = "🎙 Mendengarkan…";
  else $("partnerStatus").textContent = "🎙 " + ui(code).listening;

  const ctl = startRecognition(lang(code).stt, {
    keepAlive: () => session.holding,
    onText: (t) => showInterim(speaker, t),
  });
  session.ctl = ctl;

  const watchdog = setInterval(() => {
    const elapsed = Date.now() - session.downAt;
    if (elapsed > MAX_LISTEN_MS) ctl.stop();
    else if (!session.holding && ctl.text() && Date.now() - ctl.lastResultAt > SILENCE_STOP_MS) ctl.stop();
  }, 250);

  const { text, error } = await ctl.done;
  const releasedAt = performance.now();
  clearInterval(watchdog);
  btn.classList.remove("listening");
  state.listening = null;
  renderMicLabels();
  setTurn(state.turn);

  if (!text) {
    clearMessages();
    showError(new AppError(error || "no_speech"), speaker);
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
  const fill = (sel, value) => {
    sel.innerHTML = "";
    for (const l of state.languages) {
      const opt = document.createElement("option");
      opt.value = l.code;
      const textOnly = voiceStatus(l.code) === "none" ? " · teks saja" : "";
      opt.textContent = (l.code === "id" ? "Indonesia" : l.name) + textOnly;
      sel.appendChild(opt);
    }
    sel.value = value;
  };
  fill($("myLang"), state.myLang);
  fill($("partnerLang"), state.partnerLang);
}

function renderMicLabels() {
  $("meMicLabel").textContent = ui(state.myLang).speak;
  $("partnerMicLabel").textContent = ui(state.partnerLang).speak;
  $("myLangBadge").textContent = lang(state.myLang).native;
  $("partnerLangBadge").textContent = lang(state.partnerLang).native;
  $("partnerHeading").textContent = ui(state.partnerLang).heading;
  $("partnerPanel").setAttribute("lang", state.partnerLang);
}

function setLanguages(myLang, partnerLang) {
  state.myLang = myLang;
  state.partnerLang = partnerLang;
  store.set("bk_my", myLang);
  store.set("bk_partner", partnerLang);
  $("myLang").value = myLang;
  $("partnerLang").value = partnerLang;
  renderMicLabels();
  setTurn(state.turn);
  $("meWarn").hidden = true;
  updateVoiceWarning();
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
    });
    row.appendChild(b);
  }
}

function openSheet(id) { $(id).hidden = false; }
function closeSheet(id) { $(id).hidden = true; }

function openPhrases() {
  const list = $("phraseList");
  list.innerHTML = "";
  const groups = state.situation
    ? state.situations.filter((s) => s.id === state.situation)
    : state.situations;
  const target = state.partnerLang !== "id" ? state.partnerLang : state.myLang;
  $("phrasesSub").textContent = state.situation
    ? `Ketuk frasa untuk menerjemahkan ke ${lang(target).name}.`
    : `Pilih situasi agar frasa lebih relevan. Ketuk frasa untuk menerjemahkan ke ${lang(target).name}.`;
  for (const g of groups) {
    if (groups.length > 1) {
      const h = document.createElement("li");
      h.className = "phrase-group";
      h.textContent = `${g.icon} ${g.name}`;
      list.appendChild(h);
    }
    for (const p of g.phrases) {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = p;
      b.addEventListener("click", () => {
        closeSheet("phrasesSheet");
        if (state.busy || state.listening) return;
        const prev = state.situation;
        state.situation = g.id; // frasa membawa konteks situasinya sendiri
        runTranslation(p, "me", { from: "id", to: target, origin: "phrase" }).finally(() => {
          state.situation = prev;
        });
      });
      li.appendChild(b);
      list.appendChild(li);
    }
  }
  openSheet("phrasesSheet");
}

function openType() {
  const speaker = state.turn;
  const from = speaker === "me" ? state.myLang : state.partnerLang;
  const to = speaker === "me" ? state.partnerLang : state.myLang;
  $("typeSub").textContent = `${lang(from).name} → ${lang(to).name}`;
  $("typeForm").dataset.speaker = speaker;
  openSheet("typeSheet");
  setTimeout(() => $("typeInput").focus(), 50);
}

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
  $("myLang").addEventListener("change", (e) => {
    const v = e.target.value;
    setLanguages(v, v === state.partnerLang ? state.myLang : state.partnerLang);
  });
  $("partnerLang").addEventListener("change", (e) => {
    const v = e.target.value;
    setLanguages(v === state.myLang ? state.partnerLang : state.myLang, v);
  });
  $("swapBtn").addEventListener("click", () => setLanguages(state.partnerLang, state.myLang));
  $("turnBtn").addEventListener("click", () => setTurn(state.turn === "me" ? "partner" : "me"));
  $("phrasesBtn").addEventListener("click", openPhrases);
  $("typeBtn").addEventListener("click", openType);
  $("infoBtn").addEventListener("click", () => openSheet("introSheet"));
  const replay = () => {
    if (state.lastSpoken) speak(state.lastSpoken.text, state.lastSpoken.lang).then((r) => { if (!r.ok) showVoiceWarning(state.lastSpoken.lang); });
  };
  $("meReplay").addEventListener("click", replay);
  $("partnerReplay").addEventListener("click", replay);

  $("typeInput").addEventListener("input", (e) => { $("typeCounter").textContent = `${e.target.value.length}/500`; });
  $("typeForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const text = $("typeInput").value.trim();
    if (!text || state.busy) return;
    closeSheet("typeSheet");
    $("typeInput").value = "";
    $("typeCounter").textContent = "0/500";
    runTranslation(text, e.target.dataset.speaker || "me", { origin: "typed" });
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

  renderLanguageOptions();
  renderSituations();
  bindControls();
  setLanguages(state.myLang, state.partnerLang);

  if (synth) {
    refreshVoices();
    synth.addEventListener?.("voiceschanged", refreshVoices);
  }
  if (!SR) {
    $("meWarn").textContent = "ℹ️ Pengenalan suara tidak didukung di browser ini. Gunakan Chrome di Android, atau tombol ⌨️ untuk mengetik.";
    $("meWarn").hidden = false;
  }
  if (store.get("bk_intro_ok") !== "1") openSheet("introSheet");

  window.BK = { state, runTranslation, setLanguages };
  document.dispatchEvent(new CustomEvent("bk:ready"));
}

init().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML(
    "afterbegin",
    '<p class="error" style="margin:16px">Gagal memuat aplikasi. Periksa koneksi lalu muat ulang halaman.</p>'
  );
});
