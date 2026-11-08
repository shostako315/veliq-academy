// 作品目録 API の手元試験：node tools/catalog_smoke.mjs
// worker/index.js を、veliq-academy/ 以下の静的ファイルを返す偽の ASSETS で動かし、代表的な質問を投げる
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import worker from "../worker/index.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "veliq-academy");
const env = {
  ASSETS: {
    fetch: async (req) => {
      const p = new URL(req.url).pathname;
      try { return new Response(await readFile(path.join(ROOT, p)), { headers: { "Content-Type": "application/json" } }); }
      catch { return new Response("not found", { status: 404 }); }
    },
  },
};
const api = async (qs) => (await worker.fetch(new Request("https://veliq-academy.com/api/works?" + new URLSearchParams(qs)), env)).json();

const CASES = [
  ["変ホ長調のベートーヴェンのピアノソナタ（第4・13・18・26番の4件）", { composer: "ベートーヴェン", key: "変ホ長調", genre: "ピアノ・ソナタ" }, (r) => r.count === 4],
  ["ブラームスの短調の交響曲", { composer: "brahms", mode: "minor", genre: "交響曲" }, (r) => r.count >= 2],
  ["ショパンの嬰ハ短調", { composer: "ショパン", key: "嬰ハ短調" }, (r) => r.count >= 1],
  ["モーツァルトの交響曲第40番", { composer: "mozart", genre: "交響曲", number: 40 }, (r) => r.count === 1 && r.results[0].key === "g-minor"],
  ["ドヴォルザークの室内楽", { composer: "dvorak", genre: "室内楽" }, (r) => r.count >= 10],
  ["シューベルトの声楽（上限で切れる）", { composer: "schubert", genre: "声楽" }, (r) => r.truncated && r.results.length === 100],
  ["コレッリ 作品6-8《クリスマス協奏曲》", { composer: "corelli", key: "ト短調" }, (r) => r.results.some((x) => x.opus === "Op.6 No.8")],
  ["目録に無い作曲家（久石譲）", { composer: "hisaishi" }, (r) => r.count === 0 && /まだ/.test(r.coverageNote)],
  ["ショパンの嬰ハ短調の夜想曲（第7番 Op.27-1 を含む）", { composer: "chopin", key: "嬰ハ短調", genre: "夜想曲" }, (r) => r.results.some((x) => x.opus === "Op.27 No.1")],
  ["モーツァルト K.172 は変ロ長調（Open Opus の誤記は調べて解消）", { composer: "mozart", q: "K.172" }, (r) => r.results.some((x) => x.key === "Bb-major" && x.keyStatus === "stated")],
  ["ショパン 作品22 は前後半で調が違うと注記", { composer: "chopin", q: "spianato" }, (r) => r.results.some((x) => x.keyStatus === "disputed" && /ト長調/.test(x.keyNote || ""))],
  ["ルネサンスの作品は旋法の注記", { composer: "palestrina", limit: 3 }, (r) => r.results.every((x) => x.keyStatus === "modal" || x.key)],
  ["メンデルスゾーンの交響曲は5曲（弦楽のための交響曲は別）", { composer: "mendelssohn", genre: "交響曲" }, (r) => r.count === 5],
];
let ng = 0;
for (const [label, qs, ok] of CASES) {
  const r = await api(qs);
  const pass = ok(r);
  if (!pass) ng++;
  console.log(`${pass ? "OK " : "NG "} ${label}：${r.count}件`, r.results.slice(0, 4).map((x) => `${x.titleJa}${x.nyp ? `［NYP ${x.nyp.performances}回］` : ""}${x.conflicts ? "［食い違い］" : ""}`).join(" / "));
}
process.exit(ng ? 1 : 0);
