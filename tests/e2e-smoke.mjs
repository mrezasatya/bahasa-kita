// Smoke test UI di Chromium headless (Playwright) dengan SpeechRecognition palsu.
// Jalankan: BK_MOCK=1 PORT=3123 node scripts/dev-server.mjs &  lalu  node tests/e2e-smoke.mjs [url]
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright"); // memakai Playwright terpasang global

const url = process.argv[2] || "http://localhost:3123/";
const shotDir = process.env.SHOT_DIR || ".";
const fakeSR = () => {
  class FakeSR {
    start() {
      setTimeout(() => {
        const r = [Object.assign([{ transcript: window.__say || "Saya mau check-in atas nama Reza" }], { isFinal: true })];
        this.onresult?.({ results: r });
      }, 150);
    }
    stop() { setTimeout(() => this.onend?.(), 50); }
    abort() { this.stop(); }
  }
  window.SpeechRecognition = FakeSR;
  window.webkitSpeechRecognition = FakeSR;
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
await page.addInitScript(fakeSR);
await page.goto(url);
await page.waitForFunction(() => window.BK);
await page.screenshot({ path: `${shotDir}/01-intro.png` });
await page.click("#introStart");

// 1) Bicara (tahan 700 ms)
const mic = page.locator("#meMic");
const box = await mic.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.waitForTimeout(700);
await page.mouse.up();
await page.waitForFunction(() => document.getElementById("partnerBig").textContent.length > 0, null, { timeout: 8000 });
const r1 = await page.evaluate(() => ({
  partnerBig: document.getElementById("partnerBig").textContent,
  meCheck: document.getElementById("meCheckText").textContent,
  meSmall: document.getElementById("meSmall").textContent,
}));
console.log("Alur bicara:", r1);
await page.screenshot({ path: `${shotDir}/02-hasil-saya.png` });

// 2) Situasi + frasa cepat
await page.getByRole("radio", { name: /Restoran/ }).click();
await page.click("#phrasesBtn");
await page.screenshot({ path: `${shotDir}/03-frasa.png` });
await page.getByRole("button", { name: "Apakah makanan ini halal?" }).click();
await page.waitForFunction(() => document.getElementById("partnerBig").textContent.includes("halal"));
console.log("Frasa:", await page.textContent("#partnerBig"));

// 3) Giliran lawan bicara
await page.click("#turnBtn");
await page.evaluate(() => { window.__say = "Yes, all our food is halal"; });
const pm = await page.locator("#partnerMic").boundingBox();
await page.mouse.move(pm.x + pm.width / 2, pm.y + pm.height / 2);
await page.mouse.down();
await page.waitForTimeout(700);
await page.mouse.up();
await page.waitForFunction(() => document.getElementById("meBig").textContent.length > 0, null, { timeout: 8000 });
console.log("Lawan bicara:", { meBig: await page.textContent("#meBig"), partnerCheck: await page.textContent("#partnerCheck"), turn: await page.getAttribute("#app", "data-turn") });
await page.screenshot({ path: `${shotDir}/04-hasil-lawan.png` });

// 4) Ketik
await page.click("#typeBtn");
await page.fill("#typeInput", "Berapa harga tiket ke Shibuya?");
await page.click("#typeForm button[type=submit]");
await page.waitForFunction(() => document.getElementById("partnerBig").textContent.includes("Shibuya"));
console.log("Ketik:", await page.textContent("#partnerBig"));

// 5) Error jaringan
await page.route("**/api/translate", (r) => r.abort());
await page.click("#typeBtn");
await page.fill("#typeInput", "Halo");
await page.click("#typeForm button[type=submit]");
await page.waitForSelector("#meError:not([hidden])");
console.log("Error jaringan:", await page.textContent("#meError"));
await page.screenshot({ path: `${shotDir}/05-error.png` });

console.log(errors.length ? "JS errors: " + errors.join(" | ") : "Tidak ada JS error.");
await browser.close();
if (errors.length) process.exit(1);
