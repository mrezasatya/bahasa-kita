// Menggabungkan public/ + lib/prompt.js + prototype/* menjadi SATU file:
// prototype/prototype.html — bisa dibuka langsung tanpa server.
import { readFile, writeFile } from "node:fs/promises";

const r = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");
const [html, css, app, prompt, langs, sits, demo, protoJs, protoCss] = await Promise.all([
  r("public/index.html"), r("public/style.css"), r("public/app.js"), r("lib/prompt.js"),
  r("public/data/languages.json"), r("public/data/situations.json"), r("prototype/demo-en.json"),
  r("prototype/proto.js"), r("prototype/proto.css"),
]);

const safe = (s) => s.replace(/<\/script/gi, "<\\/script");
const data = { languages: JSON.parse(langs).languages, situations: JSON.parse(sits).situations };
const promptInline = prompt.replace(/^export /gm, "");

const mustReplace = (src, find, repl) => {
  if (!src.includes(find)) throw new Error(`Penanda tidak ditemukan: ${find}`);
  return src.replace(find, () => repl);
};

let out = html;
out = mustReplace(out, "<title>Bahasa Kita</title>", "<title>Bahasa Kita — Prototype</title>");
out = mustReplace(out, '<link rel="stylesheet" href="style.css">', `<style>\n${css}\n${protoCss}</style>`);
out = mustReplace(
  out,
  '<script type="module" src="app.js"></script>',
  `<script>
window.BK_DATA = ${JSON.stringify(data)};
window.BK_DEMO_EN = ${JSON.stringify(JSON.parse(demo).pairs)};
</script>
<script type="module">
${safe(promptInline)}
${safe(protoJs)}
</script>
<script type="module">
${safe(app)}
</script>`
);
out = mustReplace(
  out,
  "<!doctype html>\n",
  "<!doctype html>\n<!-- FILE HASIL BUILD — jangan diedit langsung. Ubah sumbernya lalu jalankan: npm run build:prototype -->\n"
);
await writeFile(new URL("../prototype/prototype.html", import.meta.url), out);
console.log(`prototype/prototype.html dibuat (${(out.length / 1024).toFixed(1)} KB)`);
