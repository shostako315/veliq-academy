#!/usr/bin/env node
/* Veliq Club の語学コース（veliq-club/lingua-bank.js、window.VLQ_LINGUA）から
   Academy の語学学科の記事を書き出す。
     content/lingua/en/<unit-id>.md・content/lingua/it/<unit-id>.md
   学科トップ（/lingua/）と言語ごとの一覧（/lingua/en/・/lingua/it/）は tools/build.py が作る。

   使い方:
     node tools/lingua_export.js [lingua-bank.js のパス] [--date YYYY-MM-DD]
   パスを省くと、上の階層にある veliq-club/lingua-bank.js を探す（環境変数 VELIQ_CLUB_DIR でも指定できる）。
   書き出す内容はノートのとおり（新しい事実は足さない）。前回の .md は消してから書き直す。 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "content", "lingua");
const LANGS = { en: "英語", it: "イタリア語" };

// ---- 引数
const args = process.argv.slice(2);
let bankPath = null;
let date = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--date") date = args[++i];
  else bankPath = args[i];
}
if (!date) {
  const d = new Date(Date.now() + 9 * 3600 * 1000); // 日本時間の日付
  date = d.toISOString().slice(0, 10);
}
function findBank() {
  if (bankPath) return path.resolve(bankPath);
  if (process.env.VELIQ_CLUB_DIR) return path.join(process.env.VELIQ_CLUB_DIR, "lingua-bank.js");
  let p = ROOT;
  while (true) {
    const c = path.join(path.dirname(p), "veliq-club", "lingua-bank.js");
    if (fs.existsSync(c)) return c;
    if (path.dirname(p) === p) break;
    p = path.dirname(p);
  }
  console.error("lingua-bank.js が見つかりません。パスを引数で渡してください");
  process.exit(1);
}
const BANK = findBank();
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(BANK, "utf8"), ctx, { filename: BANK });
const B = ctx.window.VLQ_LINGUA;
if (!B || !B.en || !B.it) {
  console.error(`${BANK} に window.VLQ_LINGUA（en・it）がありません`);
  process.exit(1);
}

// ---- 文字列
// 穴埋めの [正解|誤1|...] は正解だけを残す（アプリの表示と同じ）
const plain = (t) => String(t == null ? "" : t).replace(/\[([^|\]]+)(?:\|[^\]]*)?\]/g, "$1");
const htmlEsc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// Markdown として解釈される記号を無効にする（表の | も含む）
const mdEsc = (t) => htmlEsc(String(t)).replace(/([\\`*_\[\]|])/g, "\\$1");
// 外国語の文・語：lang 属性つき
const fl = (t, l) => `<span lang="${l}">${mdEsc(plain(t))}</span>`;
// 日本語の文の中の外国語（ラテン文字の連なり）に lang 属性を付ける
const LAT = "A-Za-zÀ-ÖØ-öø-ÿ";
const RUN = new RegExp(`-?[${LAT}][${LAT}0-9'’ ,.!?¿¡\\-]*`, "g");
function ja(t, l) {
  t = plain(t);
  let out = "", pos = 0, m;
  RUN.lastIndex = 0;
  while ((m = RUN.exec(t))) {
    let run = m[0].replace(/[\s,\-]+$/, "");
    out += mdEsc(t.slice(pos, m.index)) + `<span lang="${l}">${mdEsc(run)}</span>`;
    pos = m.index + run.length;
    RUN.lastIndex = pos;
  }
  return out + mdEsc(t.slice(pos));
}
const noMaru = (t) => String(t).replace(/[。．.]$/, "");
// 文に分ける（括弧・鉤括弧の中の。では分けない）
function sentences(t) {
  const out = [];
  let cur = "", depth = 0;
  for (const ch of String(t || "")) {
    cur += ch;
    if ("（(「『".includes(ch)) depth++;
    else if ("）)」』".includes(ch)) depth = Math.max(0, depth - 1);
    else if (ch === "。" && depth === 0) { out.push(cur.trim()); cur = ""; }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
const yq = (v) => JSON.stringify(String(v)); // YAML の二重引用符の文字列

// ---- 1ユニット → Markdown
function unitMd(l, u, order, group) {
  const LJ = LANGS[l];
  const isIt = l === "it";
  const ph = u.ph || [];
  const L = [];
  const title = `${u.title}（${LJ}）——${u.place}`;
  L.push("---");
  L.push(`title: ${yq(title)}`);
  L.push(`slug: ${u.id}`);
  L.push(`section: ${l}`);
  L.push(`summary: ${yq(u.lead)}`);
  L.push("aliases:");
  L.push(`  - ${yq(`${u.title}（${LJ}）`)}`);
  L.push(`lang: ${l}`);
  L.push(`group: ${yq(group)}`);
  L.push(`order: ${order}`);
  L.push(`updated: ${date}`);
  L.push("sources:");
  L.push(`  - ${yq(`Veliq Club 語学コース「場面ノート」${LJ}・${u.title}（veliq-club/lingua-bank.js、${date} 時点）`)}`);
  L.push("---", "");

  // 1 要点（最初の章は箱として目次の前に出る）
  L.push("## 要点", "");
  (u.pt || []).forEach((x, i) => L.push(i === 0 ? `- ==${ja(x, l)}==` : `- ${ja(x, l)}`));
  L.push("");

  // 2 キーフレーズ
  const gaps = ph.filter((p) => /\[/.test(p[0]) && p[3]);
  const boxed = new Set(gaps.slice(0, 3));
  L.push("## キーフレーズ", "", "> 要点", ">");
  if (boxed.size) {
    [...boxed].forEach((p, i) => {
      const s = `「${fl(p[0], l)}」${ja(p[3], l)}`;
      L.push(i === 0 ? `> - ==${s}==` : `> - ${s}`);
    });
  } else {
    ph.slice(0, 3).forEach((p, i) => {
      const s = `${mdEsc(p[2])}：「${fl(p[0], l)}」（${mdEsc(noMaru(p[1]))}）`;
      L.push(i === 0 ? `> - ==${s}==` : `> - ${s}`);
    });
  }
  L.push("");
  L.push(isIt ? `| ${LJ} | 読み | 日本語 | 使う場面 |` : `| ${LJ} | 日本語 | 使う場面 |`);
  L.push(isIt ? "|---|---|---|---|" : "|---|---|---|");
  ph.forEach((p) => {
    const c = [fl(p[0], l)];
    if (isIt) c.push(p[4] ? mdEsc(p[4]) : "—");
    c.push(mdEsc(p[1]), ja(p[2], l));
    L.push(`| ${c.join(" | ")} |`);
  });
  L.push("");
  const rest = ph.filter((p) => p[3] && !boxed.has(p));
  if (rest.length) {
    L.push("### 解説", "");
    rest.forEach((p) => L.push(`- **${fl(p[0], l)}**：${ja(p[3], l)}`));
    L.push("");
  }

  // 3 単語
  const vo = u.vo || [];
  const vnotes = vo.flatMap((g) => g[1].filter((w) => w[2]));
  L.push("## 単語", "", "> 要点", ">");
  if (vnotes.length) {
    vnotes.slice(0, 3).forEach((w, i) => {
      const s = `${fl(w[0], l)}（${mdEsc(w[1])}）：${ja(w[2], l)}`;
      L.push(i === 0 ? `> - ==${s}==` : `> - ${s}`);
    });
  } else {
    vo.forEach((g, i) => {
      const s = `${ja(g[0], l)}：${g[1].map((w) => fl(w[0], l)).join("・")}`;
      L.push(i === 0 ? `> - ==${s}==` : `> - ${s}`);
    });
  }
  L.push("");
  vo.forEach((g) => {
    const hasN = g[1].some((w) => w[2]);
    L.push(`### ${ja(g[0], l)}`, "");
    L.push(hasN ? `| ${LJ} | 日本語 | 補足 |` : `| ${LJ} | 日本語 |`);
    L.push(hasN ? "|---|---|---|" : "|---|---|");
    g[1].forEach((w) => {
      const c = [fl(w[0], l), ja(w[1], l)];
      if (hasN) c.push(w[2] ? ja(w[2], l) : "");
      L.push(`| ${c.join(" | ")} |`);
    });
    L.push("");
  });

  // 4 文法ポイント
  const gr = u.gr;
  if (gr) {
    const ex = gr.ex || [];
    L.push("## 文法ポイント", "", "> 要点", ">", `> - ==${ja(gr.h, l)}==`);
    ex.filter((e) => e[2]).slice(0, 2).forEach((e) => L.push(`> - 「${fl(e[0], l)}」${ja(e[2], l)}`));
    L.push("", ja(gr.p, l), "");
    const hasN = ex.some((e) => e[2]);
    L.push(hasN ? "| 例文 | 日本語 | ポイント |" : "| 例文 | 日本語 |");
    L.push(hasN ? "|---|---|---|" : "|---|---|");
    ex.forEach((e) => {
      const c = [fl(e[0], l), mdEsc(e[1])];
      if (hasN) c.push(e[2] ? ja(e[2], l) : "");
      L.push(`| ${c.join(" | ")} |`);
    });
    L.push("");
  }

  // 5 文化メモ（内容はノートのまま）
  if (u.cu) {
    const ss = sentences(u.cu);
    L.push("## 文化メモ", "", "> 要点", ">", `> - ==${ja(ss[0], l)}==`, "");
    if (ss.length > 1) L.push(ss.slice(1).map((s) => ja(s, l)).join(""), "");
  }

  // 6 よくある間違い
  const mi = u.mi || [];
  if (mi.length) {
    L.push("## よくある間違い", "", "> 要点", ">");
    mi.forEach((m, i) => {
      const s = `「${fl(m[0], l)}」ではなく「${fl(m[1], l)}」`;
      L.push(i === 0 ? `> - ==${s}==` : `> - ${s}`);
    });
    L.push("", "| 誤 | 正 | 理由 |", "|---|---|---|");
    mi.forEach((m) => L.push(`| ${fl(m[0], l)} | ${fl(m[1], l)} | ${ja(m[2], l)} |`));
    L.push("");
  }

  // 7 よくある質問（ノートの内容だけで答える）
  const kana = (p) => (isIt && p[4] ? `（${mdEsc(p[4])}）` : "");
  const say = (p) => `「${fl(p[0], l)}」${kana(p)}`;
  const faq = [];
  if (ph.length) {
    const p = ph[0];
    faq.push([`「${mdEsc(noMaru(p[1]))}」は${LJ}で何と言いますか`, `==${say(p)}==。${p[3] ? ja(p[3], l) : ""}`]);
  }
  if (ph.length > 1) {
    const p = ph[ph.length - 1];
    faq.push([`${ja(p[2], l)}は、何と言いますか`, `${say(p)}。意味は「${mdEsc(noMaru(p[1]))}」です。${p[3] ? ja(p[3], l) : ""}`]);
  }
  if (gr) faq.push([`「${ja(gr.h, l)}」では、何を押さえればよいですか`, sentences(gr.p).slice(0, 2).map((s) => ja(s, l)).join("")]);
  if (mi.length) {
    const m = mi[0];
    faq.push([`「${fl(m[0], l)}」はなぜ間違いですか`, `正しくは「${fl(m[1], l)}」です。${ja(m[2], l)}`]);
  }
  L.push("## よくある質問", "");
  faq.forEach(([q, a]) => L.push(`### ${q}`, "", a, ""));
  return L.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

// ---- 書き出し
let n = 0;
for (const l of Object.keys(LANGS)) {
  const dir = path.join(OUT, l);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) if (f.endsWith(".md")) fs.unlinkSync(path.join(dir, f));
  const units = B[l];
  const u0 = units.filter((u) => u.u0);
  const sc = units.filter((u) => !u.u0);
  [...u0, ...sc].forEach((u, i) => {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(u.id)) {
      console.error(`警告: ${l}/${u.id} は URL に使えない id です。飛ばします`);
      return;
    }
    const group = u.u0 ? "はじめの一歩" : "場面";
    fs.writeFileSync(path.join(dir, `${u.id}.md`), unitMd(l, u, i + 1, group), "utf8");
    n++;
  });
  console.log(`${LANGS[l]}: ${units.length}本（はじめの一歩 ${u0.length}・場面 ${sc.length}）→ ${path.relative(ROOT, dir)}/`);
}
console.log(`計 ${n}本（${path.relative(ROOT, BANK) || BANK} から、${date}）`);
