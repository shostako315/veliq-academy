// 画家の目録（/art/catalog/）の手元試験：node tools/art_catalog_smoke.mjs [--serve 8787]
// worker/index.js を、veliq-academy/ 以下の静的ファイルを返す偽の ASSETS で動かす。
// --serve を付けると、その Worker をローカルの HTTP サーバーで公開する（Playwright で画面を確かめる用）
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import worker from "../worker/index.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "veliq-academy");
const TYPES = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };
const env = {
  ASSETS: {
    fetch: async (req) => {
      let p = decodeURIComponent(new URL(req.url).pathname);
      let f = path.join(ROOT, p);
      try { if ((await stat(f)).isDirectory()) f = path.join(f, "index.html"); } catch { /* 下で 404 */ }
      try { return new Response(await readFile(f), { headers: { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" } }); }
      catch { return new Response(await readFile(path.join(ROOT, "404.html")).catch(() => "not found"), { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } }); }
    },
  },
};
const get = (p) => worker.fetch(new Request("https://veliq-academy.com" + p), env);

const idx = JSON.parse(await readFile(path.join(ROOT, "data/art-catalog/index.json"), "utf-8"));
const first = idx.rows[0][0], t2 = idx.rows.find((r) => r[11]);
const CASES = [
  ["一覧", "/art/catalog/", (r, t) => r.status === 200 && t.includes("画家の目録") && t.includes(`/art/catalog/${first}/`)],
  ["一覧：名前で探す（北斎）", "/art/catalog/?q=" + encodeURIComponent("北斎"), (r, t) => r.status === 200 && t.includes("/art/catalog/katsushika-hokusai/")],
  ["一覧：英語・アクセントなしで探す（monet）", "/art/catalog/?q=monet", (r, t) => t.includes("/art/catalog/claude-monet/")],
  ["一覧：国で絞る（日本）", "/art/catalog/?country=" + encodeURIComponent("日本"), (r, t) => t.includes("katsushika-hokusai") && !t.includes("/art/catalog/claude-monet/")],
  ["一覧：世紀で絞る（17世紀）", "/art/catalog/?era=" + encodeURIComponent("17世紀"), (r, t) => t.includes("rembrandt-van-rijn") && !t.includes("/art/catalog/claude-monet/")],
  ["項目", `/art/catalog/${first}/`, (r, t) => r.status === 200 && t.includes("<h1>") && t.includes("出典")],
  ["画家ページのある項目に「詳しく読む」", `/art/catalog/${t2[0]}/`, (r, t) => t.includes(`href="/art/artists/${t2[11]}/"`) && t.includes("詳しく読む")],
  ["無い id は 404", "/art/catalog/no-such-painter/", (r) => r.status === 404],
  ["末尾の / なしはリダイレクト", "/art/catalog", (r) => r.status === 301],
  ["インラインの style を使わない", `/art/catalog/${first}/`, (r, t) => !/<style|style="/.test(t.split("<main")[1] || "")],
];
let ng = 0;
for (const [name, p, ok] of CASES) {
  const r = await get(p);
  const t = await r.text();
  const pass = ok(r, t);
  if (!pass) ng++;
  console.log(pass ? "OK " : "NG ", name, p, r.status);
}
console.log(ng ? `${ng} 件失敗` : "すべて OK");

const i = process.argv.indexOf("--serve");
if (i > 0) {
  const port = Number(process.argv[i + 1] || 8787);
  createServer(async (req, res) => {
    const r = await worker.fetch(new Request("https://veliq-academy.com" + req.url), env);
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(Buffer.from(await r.arrayBuffer()));
  }).listen(port, () => console.log("serving on", port));
} else if (ng) process.exit(1);
