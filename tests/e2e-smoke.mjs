// Smoke test UI di Chromium headless (Playwright) dengan SpeechRecognition palsu.
// Aplikasi:   BK_MOCK=1 PORT=3123 node scripts/dev-server.mjs &   lalu   NODE_PATH=$(npm root -g) node tests/e2e-smoke.mjs
// Prototype:  NODE_PATH=$(npm root -g) node tests/e2e-smoke.mjs --prototype
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const { chromium } = createRequire(import.meta.url)("playwright"); // memakai Playwright terpasang global

const isProto = process.argv.includes("--prototype");
const url = isProto
  ? "file://" + fileURLToPath(new URL("../prototype/prototype.html", import.meta.url))
  : process.argv.find((a) => a.startsWith("http")) || "http://localhost:3123/";
const shotDir = process.env.SHOT_DIR || ".";
const tag = isProto ? "proto" : "app";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
await page.addInitScript(() => {
  class FakeSR {
    start() {
      setTimeout(() => this.onresult?.({ results: [Object.assign([{ transcript: window.__say || "Saya mau check-in atas nama Reza" }], { isFinal: true })] }), 150);
    }
    stop() { setTimeout(() => this.onend?.(), 50); }
    abort() { this.stop(); }
  }
  window.SpeechRecognition = FakeSR;
  window.webkitSpeechRecognition = FakeSR;
});
if (isProto) {
  // Tiruan layanan MyMemory (jaringan uji tidak bisa keluar).
  const fake = { "id|en:Saya mau check-in atas nama Reza": "I want to check in under the name Reza", "en|id:I want to check in under the name Reza": "Saya ingin check-in atas nama Reza", "en|id:Yes, all our food is halal": "Ya, semua makanan kami halal", "id|en:Ya, semua makanan kami halal": "Yes, all our food is halal" };
  await page.route("https://api.mymemory.translated.net/**", (route) => {
    const u = new URL(route.request().url());
    const key = `${u.searchParams.get("langpair")}:${u.searchParams.get("q")}`;
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ responseStatus: 200, responseData: { translatedText: fake[key] || "UNMOCKED " + key } }) });
  });
}

async function hold(selector, ms = 700) {
  const b = await page.locator(selector).boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}
const text = (id) => page.evaluate((i) => document.getElementById(i).innerText, id);

await page.goto(url);
await page.waitForFunction(() => window.BK);
await page.screenshot({ path: `${shotDir}/${tag}-01-intro.png` });
await page.click("#introStart");
await page.screenshot({ path: `${shotDir}/${tag}-02-awal.png` });

// 1) Saya bicara (ID -> EN)
await hold("#meMic");
await page.waitForFunction(() => document.getElementById("partnerBig").textContent.length > 0, null, { timeout: 8000 });
const r1 = { atas: await text("partnerBig"), artinya: await text("meCheckText") };
console.log("Bicara:", r1);
if (isProto && !/check in/i.test(r1.atas)) errors.push("Prototype tidak menerjemahkan ucapan bebas: " + r1.atas);
await page.screenshot({ path: `${shotDir}/${tag}-03-hasil-saya.png` });

// 2) Frasa cepat dengan situasi
await page.click("#phrasesBtn");
await page.getByRole("radio", { name: /Restoran/ }).click();
await page.screenshot({ path: `${shotDir}/${tag}-04-frasa.png` });
await page.getByRole("button", { name: "Apakah makanan ini halal?" }).click();
await page.waitForFunction(() => /halal/i.test(document.getElementById("partnerBig").textContent));
console.log("Frasa:", await text("partnerBig"));

// 3) Lawan bicara menjawab lewat tombol di sisinya
await page.evaluate(() => { window.__say = "Yes, all our food is halal"; });
await hold("#partnerMic");
await page.waitForFunction(() => document.getElementById("meBig").textContent.length > 0, null, { timeout: 8000 });
console.log("Lawan bicara:", { bawah: await text("meBig"), atas: await text("partnerSmall") });
await page.screenshot({ path: `${shotDir}/${tag}-05-hasil-lawan.png` });

// 4) Ketik
await page.click("#phrasesBtn");
await page.fill("#typeInput", "Saya mau check-in atas nama Reza");
await page.click("#typeForm button[type=submit]");
await page.waitForFunction(() => document.getElementById("partnerBig").textContent.length > 0);
console.log("Ketik:", await text("partnerBig"));

// 5) Pengaturan: default tidak terbalik; mode berhadapan memutar panel atas
const rot = () => page.evaluate(() => getComputedStyle(document.getElementById("partnerPanel")).transform);
if ((await rot()) !== "none") errors.push("Panel lawan bicara terbalik secara default");
await page.click("#settingsBtn");
await page.screenshot({ path: `${shotDir}/${tag}-06-pengaturan.png` });
await page.check("#facingToggle");
if ((await rot()) === "none") errors.push("Mode berhadapan tidak memutar panel");
await page.uncheck("#facingToggle");
await page.click("#settingsSheet [data-close]");
console.log("Mode berhadapan: default normal, opsi berfungsi");

// 6) Error jaringan
await page.route(isProto ? "https://api.mymemory.translated.net/**" : "**/api/translate", (r) => r.abort());
await page.click("#phrasesBtn");
await page.fill("#typeInput", "Halo apa kabar");
await page.click("#typeForm button[type=submit]");
await page.waitForSelector("#meNote.error:not([hidden])");
console.log("Error jaringan:", await text("meNote"));

console.log(errors.length ? "GAGAL: " + errors.join(" | ") : "Tidak ada error.");
await browser.close();
if (errors.length) process.exit(1);
