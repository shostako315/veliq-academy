// Veliq Academy の Worker。静的ページはそのまま返し、/api/* と /mcp だけここで答える
// - GET /api/works?composer=&key=&mode=&genre=&number=&instrument=&opusFrom=&opusTo=&yearFrom=&yearTo=&exclude=&q=&limit=&includeFragments=
// - GET /api/works/<id>（統合して消えた記録の旧 id＝aliases でも引ける）
// 未完・断片・他者の補筆版・消失した作品（status あり）は、既定では結果と件数から除く（includeFragments=1 で含める。q で題を指定したときは含める）
// - POST /mcp（MCP・読み取り専用。ツール search_works / get_work）
// 作品目録は静的ファイル /data/catalog/*.json（ビルドで作る）を読む。推測で作品を足さない

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version",
};
const SITE = "https://veliq-academy.com";

// 目録は作曲家ごとのファイル（全部で十数MB）。必要な作曲家の分だけ読み、読んだものは5分間持つ
let CACHE = null;
async function catalog(env) {
  if (CACHE && Date.now() - CACHE.at < 300000) return CACHE;
  const get = async (p) => (await env.ASSETS.fetch(new Request(SITE + p))).json();
  const idx = await get("/data/catalog/index.json");
  let composers = [];
  try { composers = await get("/data/composers.json"); } catch (_) { /* 無くても検索はできる */ }
  const byComp = {};
  CACHE = {
    at: Date.now(), idx, composers, byComp,
    get works() { return Object.values(byComp).flat(); },
    async load(ids) {
      const want = idx.files.filter((f) => (!ids || ids.includes(f.composer)) && !byComp[f.composer]);
      const parts = await Promise.all(want.map((f) => get(new URL(f.url).pathname)));
      want.forEach((f, i) => { byComp[f.composer] = parts[i]; });
    },
    composerOfId(id) {
      const hit = idx.files.map((f) => f.composer).filter((c) => String(id).startsWith(c + "-")).sort((a, b) => b.length - a.length);
      return hit[0] || null;
    },
    // 作曲家を指定しない検索：全作曲家の本体（約16MB）を読まず、軽い索引（調ごと、または全体約5MB）だけを読む
    shards: {},
    async index(keyPc) {
      const name = keyPc ? `key-${keyPc.pc}-${keyPc.minor ? "minor" : "major"}` : "all";
      if (!this.shards[name]) {
        try { this.shards[name] = await get(`/data/catalog/_search/${name}.json`); } catch (_) { this.shards[name] = []; }
      }
      return this.shards[name];
    },
    async getWork(id) {
      const c = this.composerOfId(id);
      await this.load(c ? [c] : null);
      const pool = byComp[c] || this.works;
      return pool.find((x) => x.id === id) || pool.find((x) => (x.aliases || []).includes(id)) || null;
    },
  };
  return CACHE;
}

// ---- 調 ----
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const JA_NOTE = { "ハ": "C", "ニ": "D", "ホ": "E", "ヘ": "F", "ト": "G", "イ": "A", "ロ": "B" };
function parseKey(s) {
  if (!s) return null;
  let t = String(s).trim().replace(/♭/g, "b").replace(/♯/g, "#").replace(/[－―‐]/g, "-");
  // 日本語：変ホ長調・嬰ハ短調・ハ短調
  let m = t.match(/^(変|嬰)?([ハニホヘトイロ])(長調|短調)$/);
  if (m) return mk(JA_NOTE[m[2]], m[1] === "変" ? "b" : m[1] === "嬰" ? "#" : "", m[3] === "短調");
  // 英語・ドイツ式の略記：Eb-major, E-flat major, c#-minor, C# minor, Es-Dur は扱わない
  m = t.match(/^([A-Ga-g])\s*(b|#|-flat|-sharp| flat| sharp)?[\s-]*(major|minor|maj|min|m)?$/i);
  if (m) {
    const acc = /flat|^b$/i.test(m[2] || "") ? "b" : /sharp|#/.test(m[2] || "") ? "#" : "";
    const minor = m[3] ? /^min|^m$/i.test(m[3]) && !/^maj/i.test(m[3]) : m[1] === m[1].toLowerCase();
    return mk(m[1].toUpperCase(), acc, minor);
  }
  return null;
}
function mk(n, acc, minor) {
  const pc = (PC[n] + (acc === "#" ? 1 : acc === "b" ? -1 : 0) + 12) % 12;
  return { pc, minor, id: `${minor ? n.toLowerCase() : n}${acc}-${minor ? "minor" : "major"}` };
}
function modeOf(s) {
  if (!s) return null;
  if (/^(minor|短調|短)$/i.test(s)) return "minor";
  if (/^(major|長調|長)$/i.test(s)) return "major";
  return null;
}

// ---- 種類・作曲家 ----
const GENRE = [
  ["symphony", /^(symphon(y|ies)|交響曲|シンフォニー)$/],
  ["piano-sonata", /^(piano[- ]?sonatas?|ピアノ[・ ]?ソナタ)$/],
  ["violin-sonata", /^(violin[- ]?sonatas?|(ヴァ|バ)イオリン[・ ]?ソナタ)$/],
  ["cello-sonata", /^(cello[- ]?sonatas?|チェロ[・ ]?ソナタ)$/],
  ["piano-concerto", /^(piano[- ]?concertos?|ピアノ協奏曲)$/],
  ["violin-concerto", /^(violin[- ]?concertos?|(ヴァ|バ)イオリン協奏曲)$/],
  ["cello-concerto", /^(cello[- ]?concertos?|チェロ協奏曲)$/],
  ["string-quartet", /^(string[- ]?quartets?|弦楽四重奏曲?)$/],
  ["string-quintet", /^(string[- ]?quintets?|弦楽五重奏曲?)$/],
  ["piano-trio", /^(piano[- ]?trios?|ピアノ三重奏曲?)$/],
  ["piano-quartet", /^(piano[- ]?quartets?|ピアノ四重奏曲?)$/],
  ["piano-quintet", /^(piano[- ]?quintets?|ピアノ五重奏曲?)$/],
  ["overture", /^(overtures?|序曲)$/],
  ["symphonic-poem", /^(symphonic[- ]?poems?|tone[- ]?poems?|交響詩)$/],
  ["string-symphony", /^(string[- ]?symphon(y|ies)|弦楽のための交響曲|弦楽交響曲)$/],
  ["suite", /^(suites?|組曲)$/],
  ["variations", /^(variations?|変奏曲)$/],
  ["serenade", /^(serenades?|セレナー[デド])$/],
  ["mass", /^(mass(es)?|ミサ曲?)$/],
  ["requiem", /^(requiems?|レクイエム)$/],
  ["opera", /^(operas?|オペラ|歌劇)$/],
  ["oratorio", /^(oratorios?|オラトリオ)$/],
  ["cantata", /^(cantatas?|カンタータ)$/],
  ["song", /^(songs?|lieder|歌曲|リート)$/],
  ["prelude", /^(preludes?|前奏曲|プレリュード)$/],
  ["etude", /^([eé]tudes?|練習曲|エチュード)$/],
  ["nocturne", /^(nocturnes?|夜想曲|ノクターン)$/],
  ["waltz", /^(waltz(es)?|ワルツ|円舞曲)$/],
  ["mazurka", /^(mazurkas?|マズルカ)$/],
  ["polonaise", /^(polonaises?|ポロネーズ)$/],
  ["ballade", /^(ballades?|バラード)$/],
  ["scherzo", /^(scherz(o|os|i)|スケルツォ)$/],
  ["impromptu", /^(impromptus?|即興曲)$/],
  ["fugue", /^(fugues?|フーガ)$/],
];
const GENRE_FAMILY = [["concerto", /^(concertos?|協奏曲|コンチェルト)$/], ["sonata", /^(sonatas?|ソナタ)$/], ["quartet", /^(quartets?|四重奏曲?)$/], ["trio", /^(trios?|三重奏曲?)$/], ["quintet", /^(quintets?|五重奏曲?)$/]];
// 大分類（Open Opus 由来の category）。genre=ピアノ曲 などで使う。curated のレコードは種類から推す
const CATEGORY = [
  ["keyboard", /^(keyboard|piano( works?| music)?|ピアノ曲|ピアノ作品|鍵盤(楽器)?(曲|作品)?|オルガン曲)$/],
  ["chamber", /^(chamber( music)?|室内楽(曲)?)$/],
  ["orchestral", /^(orchestral( works?| music)?|管弦楽(曲)?|オーケストラ曲)$/],
  ["vocal", /^(vocal( works?| music)?|声楽(曲)?|合唱曲)$/],
  ["stage", /^(stage( works?)?|舞台作品|劇音楽)$/],
];
const CAT_OF_GENRE = {
  "piano-sonata": "keyboard", prelude: "keyboard", etude: "keyboard", nocturne: "keyboard", waltz: "keyboard", mazurka: "keyboard",
  polonaise: "keyboard", ballade: "keyboard", impromptu: "keyboard", "string-quartet": "chamber", "string-quintet": "chamber",
  "piano-trio": "chamber", "piano-quartet": "chamber", "piano-quintet": "chamber", "violin-sonata": "chamber", "cello-sonata": "chamber",
  symphony: "orchestral", "string-symphony": "orchestral", "symphonic-poem": "orchestral", overture: "orchestral", "piano-concerto": "orchestral", "violin-concerto": "orchestral",
  "cello-concerto": "orchestral", concerto: "orchestral", mass: "vocal", requiem: "vocal", cantata: "vocal", oratorio: "vocal", song: "vocal", opera: "stage",
};
const categoryOf = (w) => w.category || CAT_OF_GENRE[w.genre] || null;
function genreOf(s) {
  if (!s) return null;
  const t = String(s).trim().toLowerCase().replace(/・/g, "・");
  for (const [g, re] of GENRE) if (re.test(t)) return g;
  for (const [c, re] of CATEGORY) if (re.test(t)) return "@" + c;
  for (const [g, re] of GENRE_FAMILY) if (re.test(t)) return g + "*";
  return t;
}
function composerIds(q, composers) {
  if (!q) return null;
  const s = String(q).trim().toLowerCase().replace(/ベートーベン/g, "ベートーヴェン");
  const hits = composers.filter((c) => {
    const names = [c.id, c.name, c.nameEn, (c.nameEn || "").split(" ").pop(), (c.name || "").split("・").pop()]
      .filter(Boolean).map((x) => x.toLowerCase());
    return names.some((n) => n === s);
  }).map((c) => c.id);
  return hits.length ? hits : [s];
}
function opusNum(w) {
  const m = String(w.catalog?.opus || "").match(/(\d+)/);
  return m ? +m[1] : null;
}

async function search(cat, p) {
  const key = parseKey(p.key);
  const mode = modeOf(p.mode) || (p.key && !key ? modeOf(p.key) : null);
  const genre = genreOf(p.genre);
  const comps = composerIds(p.composer, cat.composers);
  const excl = composerIds(p.exclude, cat.composers);
  // 作曲家の指定があればその分だけ読む。無ければ索引だけを引き、最後に該当する作曲家の本体を読む
  const useIdx = !comps;
  let pool;
  if (useIdx) pool = await cat.index(key || null); else { await cat.load(comps); pool = cat.works; }
  const inst = p.instrument ? String(p.instrument).toLowerCase() : null;
  const anyMov = p.movementKey === "1" || p.movementKey === true;
  const num = (v) => (v === undefined || v === null || v === "" ? null : +v);
  const of = num(p.opusFrom), ot = num(p.opusTo), yf = num(p.yearFrom), yt = num(p.yearTo), nb = num(p.number);
  const q = p.q ? String(p.q).toLowerCase() : null;
  const lim = Math.min(Math.max(num(p.limit) || 100, 1), 500);
  // 未完・断片・消失の作品は、件数（「全9曲」など）に入れない。題で探したとき（q）と includeFragments=1 のときだけ含める
  const incFrag = p.includeFragments === "1" || p.includeFragments === "true" || p.includeFragments === true || !!q;
  const out = [];
  const skipped = [];
  for (const w of pool) {
    if (comps && !comps.includes(w.composer)) continue;
    if (excl && excl.includes(w.composer)) continue;
    if (genre && genre.startsWith("@")) { if (categoryOf(w) !== genre.slice(1)) continue; }
    else if (genre && !genre.endsWith("*") && w.genre !== genre) continue;
    if (genre && genre.endsWith("*") && !String(w.genre || "").includes(genre.slice(0, -1))) continue;
    if (nb !== null && w.number !== nb) continue;
    const keys = [w.key, ...(anyMov ? (w.movements || []).flatMap((m) => [m.key, ...(m.keys || [])]) : [])].filter(Boolean).map(parseKey).filter(Boolean);
    let enh = false;
    if (key) {
      const hit = keys.find((k) => k.pc === key.pc && k.minor === key.minor);
      if (!hit) continue;
      enh = hit.id !== key.id;
    }
    if (mode && !keys.some((k) => k.minor === (mode === "minor"))) continue;
    if (inst && !(w.instrumentation || []).some((i) => i.toLowerCase().includes(inst))) continue;
    const op = opusNum(w);
    if ((of !== null || ot !== null) && (op === null || (of !== null && op < of) || (ot !== null && op > ot))) continue;
    const y0 = w.composed?.[0], y1 = w.composed?.[1];
    if (yf !== null && (y1 ?? 0) < yf) continue;
    if (yt !== null && (y0 ?? 9999) > yt) continue;
    if (q && ![w.titleJa, w.titleEn, w.nicknameJa, ...(w.nicknames || []), ...(w.otherTitles || [])].some((x) => (x || "").toLowerCase().includes(q))) continue;
    if (w.status && !incFrag) { skipped.push(w); continue; }
    out.push(enh ? { ...w, matchedEnharmonic: true } : w);
  }
  // 題で探したときは、題の一致の強さ（完全一致 → 前方一致）、NYP の演奏回数の順に並べる（「エグモント」で Op.84 が先に来るように）
  if (q) {
    const rank = (w) => {
      const ts = [w.titleJa, w.titleEn, w.nicknameJa, ...(w.nicknames || []), ...(w.otherTitles || [])].map((x) => (x || "").toLowerCase().replace(/[《》「」"“”]/g, ""));
      if (ts.some((t) => t === q)) return 0;
      if (ts.some((t) => t.startsWith(q) || t.includes("《" + q))) return 1;
      return 2;
    };
    out.sort((a, b) => rank(a) - rank(b) || (b.nyp?.performances || 0) - (a.nyp?.performances || 0) || (a.status ? 1 : 0) - (b.status ? 1 : 0));
  }
  // 「全部」と言ってよいか：作曲家と種類の両方を指定し、その組が全曲収録のときだけ
  const gKey = genre && !genre.endsWith("*") ? genre : null;
  const cov = comps && comps.length === 1 && gKey ? cat.idx.coverage.find((c) => c.composer === comps[0] && c.genre === gKey) : null;
  const known = comps ? comps.some((c) => cat.works.some((w) => w.composer === c)) : true;
  return {
    query: { composer: p.composer || null, key: key ? key.id : null, mode, genre: gKey || genre, number: nb, instrument: inst, opusFrom: of, opusTo: ot, yearFrom: yf, yearTo: yt, exclude: p.exclude || null, q, includeFragments: incFrag },
    complete: !!(cov && cov.complete),
    coverageNote: cov ? cov.scope : known ? "Veliq 作品目録に収録している範囲の中での結果です（この条件の全曲を収録しているとは限りません）" : "この作曲家は、まだ Veliq 作品目録に収録していません",
    count: out.length,
    excludedFragments: skipped.length ? { count: skipped.length, note: "未完・断片・他者の補筆版・消失した作品は件数に含めていません（includeFragments=1 で含めます）", works: skipped.slice(0, 10).map((w) => ({ id: w.id, titleJa: w.titleJa, status: w.status, statusNote: w.statusNote })) } : undefined,
    // 件数が多いときは、NYP での演奏回数と代表作（popular）の順に上位だけ返す。少ないときは目録の順のまま
    limit: lim,
    truncated: out.length > lim || undefined,
    results: (await full(cat, useIdx, out.length > lim ? (q ? out.slice(0, lim) : [...out].sort((a, b) => (b.nyp?.performances || 0) - (a.nyp?.performances || 0) || (b.popular ? 1 : 0) - (a.popular ? 1 : 0)).slice(0, lim)) : out)).map(slim),
  };
}
// 索引の行を、作曲家ごとの本体の記録に置き換える（出典・注記・NYP などは本体にだけある）
async function full(cat, useIdx, rows) {
  if (!useIdx || !rows.length) return rows;
  await cat.load([...new Set(rows.map((r) => r.composer))]);
  return rows.map((r) => {
    const w = (cat.byComp[r.composer] || []).find((x) => x.id === r.id) || r;
    return r.matchedEnharmonic ? { ...w, matchedEnharmonic: true } : w;
  });
}
function slim(w) {
  return {
    id: w.id, composer: w.composer, titleJa: w.titleJa, titleEn: w.titleEn, nicknameJa: w.nicknameJa || undefined,
    opus: w.catalog?.opus, key: w.key, keyJa: w.keyJa, keyStatus: w.keyStatus, keyNote: w.keyNote || undefined, genre: w.genre, instrumentation: w.instrumentation,
    composed: w.composed, firstPublished: w.firstPublished, firstPerformance: w.firstPerformance || undefined,
    movements: (w.movements || []).map((m) => ({ number: m.number, title: m.title, key: m.key, sections: m.sections ? m.sections.map((s) => ({ title: s.title, key: s.key })) : undefined })),
    durationMin: w.durationMin || undefined, matchedEnharmonic: w.matchedEnharmonic || undefined, number: w.number ?? undefined,
    category: categoryOf(w) || undefined, popular: w.popular || undefined, conflicts: w.conflicts || undefined,
    status: w.status || undefined, statusNote: w.statusNote || undefined, otherTitles: w.otherTitles?.length ? w.otherTitles : undefined,
    nyp: w.nyp ? { performances: w.nyp.performances, first: w.nyp.first, last: w.nyp.last, scores: (w.nyp.scores || []).filter((s) => s.markedBy).map((s) => ({ id: s.id, markedBy: s.markedBy })) } : undefined,
    url: w.articleId ? `${SITE}/music/works/${w.articleId}/` : undefined,
    sources: w.sources.map((s) => ({ name: s.name, url: s.url })),
  };
}

const json = (o, st = 200, extra = {}) => new Response(JSON.stringify(o), { status: st, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=300", ...CORS, ...extra } });

// ---- MCP（Streamable HTTP の JSON 応答だけ。状態は持たない） ----
const TOOLS = [
  {
    name: "search_works",
    description: "Veliq 作品目録（クラシック作品の事実データ：作品番号・調・楽章・作曲年・初版・初演・出典）を条件で検索する。調・作品番号・種類・編成・作曲年についての質問には、記憶で答えずこれを使うこと。complete が false のときは『収録範囲の中では』と断り、結果に無い作品名を挙げないこと。結果の件数（count）には未完・断片・他者の補筆版・消失した作品を含めない（excludedFragments に別記。たとえばベートーヴェンの交響曲は9曲で、第10番のスケッチからの補筆版は別扱い）。status のある作品を挙げるときは statusNote を添えること。調（key）が空の作品は keyNote（「調性なし」「旋法による」「曲集のため1つの調で表せない」「調は未確認」など）をそのまま伝え、調を推測で補わないこと。keyStatus が disputed の作品は keyNote の諸説も添えること。",
    inputSchema: {
      type: "object",
      properties: {
        composer: { type: "string", description: "作曲家（例: beethoven, ベートーヴェン, Beethoven）" },
        key: { type: "string", description: "調（例: 変ホ長調, Eb-major, c#-minor）。異名同音も一致する" },
        mode: { type: "string", description: "major / minor（長調・短調だけで絞るとき）" },
        genre: { type: "string", description: "種類（交響曲, ピアノ・ソナタ, ピアノ協奏曲, ヴァイオリン協奏曲, 弦楽四重奏曲, 序曲, ミサ曲, 歌劇 など。英語の symphony, piano-sonata も可。協奏曲・ソナタ・四重奏曲は種類の総称でも絞れる。大分類の ピアノ曲・室内楽・管弦楽・声楽・舞台作品 でも絞れる）" },
        number: { type: "number", description: "番号（交響曲第3番なら 3）" },
        instrument: { type: "string", description: "編成に含む楽器（例: ピアノ, 合唱）" },
        opusFrom: { type: "number" }, opusTo: { type: "number" },
        yearFrom: { type: "number" }, yearTo: { type: "number" },
        exclude: { type: "string", description: "除く作曲家" },
        movementKey: { type: "boolean", description: "楽章の調も検索対象に含める" },
        q: { type: "string", description: "題名・通称の文字列（統合した別名 otherTitles も対象。題の一致が強いもの・NYP の演奏回数が多いものから並ぶ）" },
        includeFragments: { type: "boolean", description: "未完・断片・他者の補筆版・消失した作品（status あり）も含める。既定では件数から除く（q を指定したときは含める）" },
        limit: { type: "number", description: "返す件数（既定100、最大500）。多いときは NYP の演奏回数と代表作の順" },
      },
    },
  },
  {
    name: "get_work",
    description: "Veliq 作品目録の1作品を id で取得する（楽章ごとの調・小節数、献呈、初版、初演、出典 URL、Wikidata・IMSLP・MusicBrainz の ID、ニューヨーク・フィルの演奏記録と所蔵スコア）。",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
];
async function mcp(req, env) {
  let msg;
  try { msg = await req.json(); } catch (_) { return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }, 400); }
  const one = async (m) => {
    const id = m.id ?? null;
    if (m.method === "initialize") {
      return { jsonrpc: "2.0", id, result: { protocolVersion: m.params?.protocolVersion || "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "veliq-works", version: "0.1.0" }, instructions: "Veliq 作品目録（日本語）。クラシック作品の調・作品番号・楽章・作曲年を、出典つきで返す読み取り専用のサーバー。" } };
    }
    if (m.method === "notifications/initialized" || (m.method || "").startsWith("notifications/")) return null;
    if (m.method === "ping") return { jsonrpc: "2.0", id, result: {} };
    if (m.method === "tools/list") return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
    if (m.method === "tools/call") {
      const cat = await catalog(env);
      const a = m.params?.arguments || {};
      let r;
      if (m.params?.name === "search_works") r = await search(cat, a);
      else if (m.params?.name === "get_work") { const w = await cat.getWork(a.id); r = w || { error: "not_found" }; }
      else return { jsonrpc: "2.0", id, error: { code: -32602, message: "unknown tool" } };
      return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r, isError: !!r.error } };
    }
    return { jsonrpc: "2.0", id, error: { code: -32601, message: "method not found" } };
  };
  if (Array.isArray(msg)) {
    const rs = (await Promise.all(msg.map(one))).filter(Boolean);
    return rs.length ? json(rs, 200, { "Cache-Control": "no-store" }) : new Response(null, { status: 202, headers: CORS });
  }
  const r = await one(msg);
  return r ? json(r, 200, { "Cache-Control": "no-store" }) : new Response(null, { status: 202, headers: CORS });
}

// ---- 人が読む作品のページ（/music/catalog/ と /music/catalog/<id>/）----
// 見た目は既存のページ（作曲家の一覧）を型にして、title・説明・本文だけ差し替える。中身は目録の事実だけ
const H = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const KJ = { C: "ハ", D: "ニ", E: "ホ", F: "ヘ", G: "ト", A: "イ", B: "ロ" };
function keyJaOf(k) {
  const m = String(k || "").match(/^([A-Ga-g])(b|#)?-(major|minor)$/);
  return m ? (m[2] === "b" ? "変" : m[2] === "#" ? "嬰" : "") + KJ[m[1].toUpperCase()] + (m[3] === "minor" ? "短調" : "長調") : "";
}
async function shell(env, { title, desc, canon, crumbs, body }) {
  const tpl = await (await env.ASSETS.fetch(new Request(SITE + "/music/composers/"))).text();
  const ld = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: crumbs.map(([n, u], i) => ({ "@type": "ListItem", position: i + 1, name: n, ...(u ? { item: SITE + u } : {}) })) };
  const bc = '<nav class="va-bc" aria-label="パンくず"><ol>' + crumbs.map(([n, u], i) => i < crumbs.length - 1 ? `<li><a href="${u}">${H(n)}</a></li>` : `<li><span aria-current="page">${H(n)}</span></li>`).join("") + "</ol></nav>";
  return tpl
    .replace(' class="on">作曲家</a>', ">作曲家</a>").replace('href="/music/catalog/">', 'href="/music/catalog/" class="on">')
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${H(title)}｜Veliq Academy</title>`)
    .replace(/(<meta name="description" content=")[^"]*/, `$1${H(desc)}`)
    .replace(/(<meta property="og:description" content=")[^"]*/, `$1${H(desc)}`)
    .replace(/(<meta property="og:title" content=")[^"]*/, `$1${H(title)}｜Veliq Academy`)
    .replace(/(<link rel="canonical" href=")[^"]*/, `$1${SITE}${canon}`)
    .replace(/(<meta property="og:url" content=")[^"]*/, `$1${SITE}${canon}`)
    .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, `<script type="application/ld+json">${JSON.stringify(ld)}</script>`)
    .replace(/<main[\s\S]*<\/main>/, `<main id="main" class="va-main"><div class="wrap">${bc}${body}</div></main>`);
}
const CSS = "";  // 見た目は /assets/vq-ui.css（CSP で style 要素は使えない）
async function workPage(env, cat, id) {
  const w = await cat.getWork(id);
  if (!w) return null;
  if (w.id !== id) return Response.redirect(`${SITE}/music/catalog/${w.id}/`, 301);
  const comp = (cat.composers || []).find((c) => c.id === w.composer) || {};
  const row = (k, v) => (v ? `<dt>${k}</dt><dd>${v}</dd>` : "");
  const yr = (a) => (a && a[0] ? a[0] + (a[1] && a[1] !== a[0] ? "〜" + a[1] : "") + "年" : "");
  const fp = w.firstPerformance ? [w.firstPerformance.date, w.firstPerformance.venue, w.firstPerformance.place, w.firstPerformance.text].filter(Boolean).map(H).join("　") : "";
  const keyTxt = w.keyJa ? H(w.keyJa) + (w.keyNote ? `<br><span class="nt">${H(w.keyNote)}</span>` : "") : w.keyNote ? `<span class="nt">${H(w.keyNote)}</span>` : "";
  const cat0 = Object.values(w.catalog || {}).filter(Boolean).map(H).join("　");
  const mv = (w.movements || []).length ? `<h2>楽章</h2><ol class="mv">${w.movements.map((m) => `<li>${H(m.title)}${m.key ? `（${keyJaOf(m.key)}）` : ""}</li>`).join("")}</ol>` : "";
  const n = w.nyp;
  const nyp = n ? `<h2>ニューヨーク・フィルの記録</h2><dl>${row("演奏回数", n.performances + "回")}${row("初回", H(n.first))}${row("直近", H(n.last))}${row("多く振った指揮者", (n.conductors || []).slice(0, 5).map(([a, b]) => `${H(a)}（${b}回）`).join("、"))}</dl>` +
    ((n.scores || []).length ? `<table><thead><tr><th>所蔵スコア</th><th>書き込み</th><th>版元</th></tr></thead><tbody>${n.scores.map((s) => `<tr><td><a href="https://archives.nyphil.org/" target="_blank" rel="noopener">${H(s.id)}</a></td><td>${H(s.markedBy || "記載なし")}</td><td>${H(s.publisher || "")}</td></tr>`).join("")}</tbody></table><p class="nt">書き込みの中身は掲載していません。所蔵の所在までです。</p>` : "") +
    `<p class="nt">演奏記録・所蔵スコア：New York Philharmonic（CC0）</p>` : "";
  const art = w.articleId ? `<p><a href="/music/works/${H(w.articleId)}/">読みもの：${H(w.titleJa)}</a></p>` : "";
  const src = (w.sources || []).length ? `<h2>出典</h2><ul class="src">${w.sources.map((s) => `<li><a href="${H(s.url)}" target="_blank" rel="noopener">${H(s.name)}</a>${s.fields ? `：${H(s.fields)}` : ""}</li>`).join("")}</ul>` : "";
  const st = w.status ? `<p class="nt">${w.status === "lost" ? "消失した作品です。" : "未完・断片、または他の人の補筆による版です。"}${H(w.statusNote || "")}</p>` : "";
  const body = CSS + `<article class="wk"><h1>${H(w.titleJa)}</h1>${w.titleEn && w.titleEn !== w.titleJa ? `<p class="en">${H(w.titleEn)}</p>` : ""}${st}<dl>` +
    row("作曲家", comp.name ? `<a href="/music/composers/${H(comp.id)}/">${H(comp.name)}</a>` : H(w.composer)) + row("調", keyTxt) + row("作品番号", cat0) +
    row("作曲", yr(w.composed)) + row("初版", w.firstPublished ? w.firstPublished + "年" : "") + row("初演", fp) + row("献呈", H(w.dedication)) +
    row("編成", (w.instrumentation || []).map(H).join("、")) + row("演奏時間", w.durationMin && w.durationMin[0] ? "約" + w.durationMin[0] + (w.durationMin[1] !== w.durationMin[0] ? "〜" + w.durationMin[1] : "") + "分" : "") +
    `</dl>${art}${mv}${nyp}${src}<p class="nt">Veliq 作品目録より。出典に書かれていることだけを載せています。<a href="/music/catalog/">作品目録で探す</a></p></article>`;
  const desc = [w.titleJa, comp.name, w.keyJa, yr(w.composed) && "作曲" + yr(w.composed), n && `ニューヨーク・フィルで${n.performances}回演奏`].filter(Boolean).join("。");
  return new Response(await shell(env, { title: w.titleJa, desc, canon: `/music/catalog/${w.id}/`, crumbs: [["トップ", "/"], ["音楽", "/music/"], ["作品目録", "/music/catalog/"], [w.titleJa]], body }), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=600" } });
}
async function catalogPage(env, cat, params) {
  const q = String(params.get("q") || "").slice(0, 60), composer = String(params.get("composer") || "");
  let list = "";
  if (q || composer) {
    const r = await search(cat, { q, composer, limit: "100" });
    list = `<p class="nt">${r.count}件${r.count > (r.results || []).length ? `（先頭${r.results.length}件）` : ""}</p><div class="rl">` + (r.results || []).map((w) => `<a href="/music/catalog/${H(w.id)}/">${H(w.titleJa)}<small>${H(((cat.composers || []).find((c) => c.id === w.composer) || {}).name || w.composer)}${w.nyp ? `・ニューヨーク・フィルで${w.nyp.performances}回演奏` : ""}</small></a>`).join("") + "</div>";
  }
  const body = CSS + `<article class="wk"><h1>作品目録</h1><p>作曲家109人の作品の、調・作品番号・楽章・作曲年・初演と、ニューヨーク・フィルの演奏記録。出典に書かれていることだけを載せています。</p>` +
    `<form action="/music/catalog/" method="get"><input name="q" value="${H(q)}" placeholder="曲名・通称（例：英雄、エグモント）" aria-label="曲名"><button>探す</button></form>${list}</article>`;
  return new Response(await shell(env, { title: "作品目録", desc: "作曲家109人の作品の調・作品番号・楽章・作曲年・初演と、ニューヨーク・フィルの演奏記録。", canon: "/music/catalog/", crumbs: [["トップ", "/"], ["音楽", "/music/"], ["作品目録"]], body }), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}

async function trip(req, env) {
  const H = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
  if (!env.TRIP) return new Response(JSON.stringify({ error: "no_store" }), { status: 503, headers: H });
  const KEY = "vienna-2026";
  let st = (await env.TRIP.get(KEY, "json")) || { plans: {}, picks: {}, rev: 0, init: false };
  if (st.init && !st.mig) {
    for (const k of ["p5", "p6", "p8", "p9", "p12", "p13"]) delete st.plans[k];
    Object.assign(st.plans, {"p22": {"day": "11/12", "start": "10:00", "end": "11:00", "c": "v", "title": "チェックアウト・荷物", "note": "【ライプニッツ】10:00までにチェックアウト。荷物は預かり不可\n【荷物】次の宿に預けるか、中央駅のコインロッカー\n【夜】19:30 フランス放送フィル（コンツェルトハウス）"}, "p20": {"day": "11/13", "start": "10:00", "end": "11:00", "c": "v", "title": "朝カフェ（Café Goldegg）", "note": "【場所】Argentinierstraße 49（4区）。中央駅から歩いて10分\n【時間】平日8:00〜20:00\n【メモ】古いウィーンのカフェ。朝食あり。このあと中央駅の11:14の列車へ"}, "p21": {"day": "11/13", "start": "11:14", "end": "12:10", "c": "b", "title": "移動 ウィーン → ブラチスラヴァ", "note": "【列車】ウィーン中央駅 毎時14分発のREX、56分。Bratislava hlavná stanica 着\n【切符】片道€12.70（当日買える、予約不要）。ÖBBの「Bratislava Ticket」往復なら、その日のブラチスラヴァ市内交通も込み\n【着いたら】駅から旧市街まで歩いて15分"}, "p23": {"day": "11/13", "start": "12:10", "end": "15:35", "c": "b", "title": "ブラチスラヴァ観光", "note": "【昼ごはん】Slovak Pub（Obchodná 62、11〜22時）。スロバキアの家庭料理、ニンニクスープ、ハルシュキ\n【回る順】ミハエル門 → 中央広場（ローランドの噴水、マンホールから顔を出すチュミルの像）→ 聖マルティン大聖堂 → ブラチスラヴァ城 → UFO（橋の上の展望台）\n【城】庭は無料で8〜22時。博物館は10〜18時で約€14（火曜休み）\n【メモ】支払いはユーロ、カードが使える。物価はウィーンより安い"}, "p24": {"day": "11/13", "start": "15:50", "end": "16:46", "c": "b", "title": "移動 ブラチスラヴァ → ウィーン", "note": "【列車】Bratislava hlavná stanica 毎時50分発、56分でウィーン中央駅\n【着いたら】宿に寄って、19:00 国立歌劇場『連隊の娘』"}});
    st.mig = "m1"; st.rev = (st.rev || 0) + 1;
    await env.TRIP.put(KEY, JSON.stringify(st));
  }
  if (st.init && st.mig === "m1") {
    for (const k of ["p20", "p21", "p23", "p24", "p4", "p22"]) delete st.plans[k];
    Object.assign(st.plans, {"p22": {"day": "11/12", "start": "10:00", "end": "11:00", "c": "v", "title": "チェックアウト・荷物", "note": "【ライプニッツ】10:00までにチェックアウト。荷物は預かり不可\n【次の宿】Campanile Vienna South（Triester Str. 91）を仮予約。11/12 18:00まで無料キャンセル。フロント24時間なので荷物を先に預けられる\n【Airbnbにするなら】西駅のアパート。チェックイン15:00、荷物の預け可否はホストに確認中\n【夜】19:30 フランス放送フィル（コンツェルトハウス）"}, "p4": {"day": "11/12", "start": "11:30", "end": "13:30", "c": "v", "title": "パスクァラティハウス → Doblinger", "note": "【11:30 パスクァラティハウス】Mölker Bastei 8（1区）。ベートーヴェンが『運命』『フィデリオ』の頃に住んだ家。火〜日 10–13時・14–17時（13時で昼休み）、大人約€6。U2 Schottentor 徒歩3分。エレベーターなし\n【12:45 Doblinger（楽譜）】Dorotheergasse 10（1区）。平日9:30–18:30。パスクァラティから歩いて15分"}, "p25": {"day": "11/12", "start": "13:30", "end": "14:45", "c": "v", "title": "昼ごはん（Figlmüller）", "note": "【場所】Figlmüller Wollzeile 5（1区）。Doblingerから歩いて7分、シュテファン大聖堂の裏\n【メモ】皿からはみ出す大きなシュニッツェルの店。昼でも並ぶことがある。白ならGrüner Veltliner"}, "p26": {"day": "11/12", "start": "15:00", "end": "18:30", "c": "v", "title": "美術史美術館（KHM）", "note": "【場所】Maria-Theresien-Platz（1区）。U3 Volkstheater 徒歩6分\n【時間】木曜は10:00–21:00（夜間開館）\n【入場】時間指定の予約が必要（無料で予約でき、窓口でもできる）\n【見どころ】ブリューゲルの部屋（『バベルの塔』『雪中の狩人』）、フェルメール『絵画芸術』、ラファエロ、カラヴァッジョ。2階のカフェ（丸天井の下）も名物\n【このあと】コンツェルトハウスへは歩いて20分ほど。19:30 フランス放送フィル"}, "p27": {"day": "11/13", "start": "10:00", "end": "12:30", "c": "v", "title": "ベルヴェデーレ上宮", "note": "【場所】Prinz-Eugen-Straße 27（3区）。トラムD「Schloss Belvedere」すぐ。中央駅から歩いて10分\n【時間】毎日9:00–18:00\n【料金】大人€23\n【見どころ】クリムト『接吻』『ユディト』、シーレ、ダヴィッド『アルプス越えのナポレオン』。雨でも庭越しに街が見える"}, "p28": {"day": "11/13", "start": "12:45", "end": "14:00", "c": "v", "title": "昼ごはん（ナッシュマルクト）", "note": "【場所】Naschmarkt（Karlsplatz〜Kettenbrückengasse、U4）。ベルヴェデーレからトラムDとU4、または歩いて20分\n【メモ】屋台と小さな食堂が並ぶ市場。屋根の下で食べられる店が多い"}, "p29": {"day": "11/13", "start": "14:30", "end": "17:00", "c": "v", "title": "音楽の家（Haus der Musik）", "note": "【場所】Seilerstätte 30（1区）。U1・U2・U4 Karlsplatz／U1・U3 Stephansplatz 徒歩7分\n【時間】毎日10:00–22:00\n【中】ウィーン・フィルの歴史（ニューイヤーコンサートの資料）、ベートーヴェン・モーツァルトなどの部屋、画面のウィーン・フィルを指揮できる「バーチャル指揮者」\n【このあと】宿に寄って、19:00 国立歌劇場『連隊の娘』"}, "p20": {"day": "11/14", "start": "09:00", "end": "10:00", "c": "v", "title": "朝カフェ（Café Goldegg）", "note": "【場所】Argentinierstraße 49（4区）。中央駅から歩いて10分\n【時間】土曜9:00–20:00\n【メモ】古いウィーンのカフェ。朝食あり。このあと中央駅の10:14の列車へ"}, "p21": {"day": "11/14", "start": "10:14", "end": "11:10", "c": "b", "title": "移動 ウィーン → ブラチスラヴァ", "note": "【列車】ウィーン中央駅 毎時14分発のREX、56分。Bratislava hlavná stanica 着\n【切符】片道€12.70（当日買える、予約不要）。ÖBBの「Bratislava Ticket」往復なら、その日のブラチスラヴァ市内交通も込み\n【着いたら】駅から旧市街まで歩いて15分\n【天気】14日は雨の確率0%、最高9℃"}, "p23": {"day": "11/14", "start": "11:10", "end": "16:35", "c": "b", "title": "ブラチスラヴァ観光", "note": "【昼ごはん】Slovak Pub（Obchodná 62、11〜22時）。スロバキアの家庭料理、ニンニクスープ、ハルシュキ\n【回る順】ミハエル門 → 中央広場（ローランドの噴水、マンホールから顔を出すチュミルの像）→ 聖マルティン大聖堂 → ブラチスラヴァ城 → UFO（橋の上の展望台）\n【城】庭は無料で8〜22時。博物館は10〜18時で約€14（火曜休み）\n【UFO】日没は16時半ごろ。夕方に登ると街の灯りが見える\n【メモ】支払いはユーロ、カードが使える。物価はウィーンより安い"}, "p24": {"day": "11/14", "start": "16:50", "end": "17:46", "c": "b", "title": "移動 ブラチスラヴァ → ウィーン", "note": "【列車】Bratislava hlavná stanica 毎時50分発、56分でウィーン中央駅\n【夜】19:00 国立歌劇場『愛の妙薬』（立見）か、19:30 楽友協会 ウィーン響／コパチンスカヤ（立見€12）"}, "p30": {"day": "11/15", "start": "09:15", "end": "10:30", "c": "v", "title": "ホーフブルク礼拝堂のミサ", "note": "【場所】Hofburgkapelle（王宮、Schweizerhof）。U3 Herrengasse 徒歩5分\n【内容】シューベルト『ミサ曲 ト長調』。ウィーン少女合唱団がソプラノとアルト\n【メモ】日曜のミサとして行われる。座席は有料（culturallで予約）\n【このあと】11:00 楽友協会ブラームスザール スロバキア・シンフォニエッタまで歩いて15分"}});
    st.mig = "m2"; st.rev = (st.rev || 0) + 1;
    await env.TRIP.put(KEY, JSON.stringify(st));
  }
  if (st.init && st.mig === "m2") {
    Object.assign(st.plans, {"p22": {"day": "11/12", "start": "10:00", "end": "11:00", "c": "v", "title": "チェックアウト → 荷物", "note": "【ライプニッツ】10:00までにチェックアウト\n【次の宿】Studioapartment 1B（西駅の近く、U3 Schweglerstraße 徒歩8分）。チェックイン15:00、チェックアウト11:00。受付なしのセルフチェックイン\n【荷物】ホストに早めの預かりを依頼中。だめなら西駅のÖBBロッカー（ジャンボ€4.50/24時間）\n【移動】27kgなのでBolt/Uberが楽\n【夜】19:30 フランス放送フィル（ギャラリー右13列6番）"}, "p7": {"day": "11/16", "start": "10:45", "end": "12:13", "c": "v", "title": "空港へ（12:13 中央駅発）", "note": "【宿】11:00までにチェックアウト\n【行き方】西駅からトラム18番で中央駅まで乗り換えなし。またはU3でWien Mitteへ出て、S7かCATで空港\n【便】15:05 LH6335 ウィーン → フランクフルト"}});
    st.mig = "m3"; st.rev = (st.rev || 0) + 1;
    await env.TRIP.put(KEY, JSON.stringify(st));
  }
  if (st.init && st.mig === "m3") {
    Object.assign(st.plans, {"p22": {"day": "11/12", "start": "10:00", "end": "11:00", "c": "v", "title": "チェックアウト → 1Bへ", "note": "【ライプニッツ】10:00までにチェックアウト\n【次の宿】Studioapartment 1B（西駅の近く、U3 Schweglerstraße 徒歩8分）。ホストから「朝からチェックインOK」。部屋の情報は当日朝に届く\n【移動】27kgなのでBolt/Uberで直行（15〜20分）\n【夜】19:30 フランス放送フィル（ギャラリー右13列6番）"}});
    st.mig = "m4"; st.rev = (st.rev || 0) + 1;
    await env.TRIP.put(KEY, JSON.stringify(st));
  }
  if (st.init && st.mig === "m4") {
    Object.assign(st.plans, {"p27": {"day": "11/13", "start": "10:00", "end": "12:00", "c": "v", "title": "ベルヴェデーレ上宮", "note": "【場所】Prinz-Eugen-Straße 27（3区）。トラムD「Schloss Belvedere」すぐ。中央駅から歩いて10分\n【時間】毎日9:00–18:00\n【料金】大人€23\n【見どころ】クリムト『接吻』『ユディト』、シーレ、ダヴィッド『アルプス越えのナポレオン』"}, "p28": {"day": "11/13", "start": "12:15", "end": "13:15", "c": "v", "title": "昼ごはん（ナッシュマルクト）", "note": "【場所】Naschmarkt（Karlsplatz〜Kettenbrückengasse、U4）。ベルヴェデーレからトラムDとU4、または歩いて20分\n【メモ】屋台と小さな食堂が並ぶ市場。屋根の下で食べられる店が多い"}, "p31": {"day": "11/13", "start": "13:30", "end": "15:00", "c": "v", "title": "ホーフブルク王宮（皇帝の部屋）", "note": "【入口】Michaelerplatz（ミヒャエル門のドームの下）。U3 Herrengasse 徒歩3分\n【時間】毎日10:00–16:30（最終入場16:00）\n【料金】€20\n【注意】シシィ博物館の展示部分は改装中で11/19再開。フランツ・ヨーゼフとエリーザベトの居室は見学できる\n【このあと】音楽の家まで歩いて10分"}, "p29": {"day": "11/13", "start": "15:30", "end": "17:00", "c": "v", "title": "音楽の家（Haus der Musik）", "note": "【場所】Seilerstätte 30（1区）。王宮から歩いて10分\n【時間】毎日10:00–22:00\n【中】ウィーン・フィルの歴史（ニューイヤーコンサートの資料）、ベートーヴェン・モーツァルトなどの部屋、画面のウィーン・フィルを指揮できる「バーチャル指揮者」"}, "p32": {"day": "11/13", "start": "17:00", "end": "18:30", "c": "v", "title": "宿で休む", "note": "【宿】Holochergasse 9。U3でStephansplatz → Schweglerstraße\n【このあと】18:30に出て、19:00 国立歌劇場『連隊の娘』"}});
    st.mig = "m5"; st.rev = (st.rev || 0) + 1;
    await env.TRIP.put(KEY, JSON.stringify(st));
  }
  if (st.init && st.mig === "m5") {
    Object.assign(st.plans, {"p33": {"day": "11/15", "start": "17:30", "end": "20:00", "c": "v", "title": "クリスマスマーケット巡り", "note": "【17:30 カールス教会前】Art Advent（アート系の手作り市）。楽友協会から歩いて3分。11/13開始\n【18:15 市庁舎前】Wiener Christkindlmarkt。ウィーンで一番大きいマーケット、夜のライトアップ。U2 Karlsplatz → Rathaus。11/13開始\n【19:15 Freyung・Am Hof】市庁舎から歩いて10分。昔ながらの小さなマーケット（Freyungは11/14開始）\n【メモ】グリューワイン（ホットワイン）はカップ代のデポジット込み。カップを返すと数ユーロ戻る"}});
    st.mig = "m6"; st.rev = (st.rev || 0) + 1;
    await env.TRIP.put(KEY, JSON.stringify(st));
  }
  if (st.init && st.mig === "m6") {
    Object.assign(st.plans, {"p34": {"day": "11/12", "start": "14:45", "end": "15:30", "c": "v", "title": "シュテファン大聖堂＋マーケット", "note": "【場所】Stephansplatz（1区）。Figlmüllerから歩いて2分、U1・U3 Stephansplatz すぐ\n【大聖堂】入口付近は無料で入れる。身廊の奥・塔・地下墓所は有料。ミサの時間は見学が制限される\n【マーケット】大聖堂前のクリスマスマーケット（11/6から開催中）。グリューワインはカップのデポジット込み、返すと戻る"}, "p26": {"day": "11/12", "start": "15:30", "end": "18:30", "c": "v", "title": "美術史美術館（KHM）", "note": "【場所】Maria-Theresien-Platz（1区）。シュテファンからU3でVolkstheater、徒歩6分\n【時間】木曜は10:00–21:00（夜間開館）\n【入場】時間指定の予約が必要（無料で予約でき、窓口でもできる）\n【見どころ】ブリューゲルの部屋（『バベルの塔』『雪中の狩人』）、フェルメール『絵画芸術』、ラファエロ、カラヴァッジョ。2階のカフェ（丸天井の下）も名物\n【このあと】コンツェルトハウスへは歩いて20分ほど。19:30 フランス放送フィル"}});
    st.mig = "m7"; st.rev = (st.rev || 0) + 1;
    await env.TRIP.put(KEY, JSON.stringify(st));
  }
  if (req.method === "POST") {
    let b; try { b = await req.json(); } catch (e) { return new Response('{"error":"bad_json"}', { status: 400, headers: H }); }
    const ok = (s) => typeof s === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(s);
    if (b.op === "init" && !st.init) { st.plans = b.plans && typeof b.plans === "object" ? b.plans : {}; st.picks = b.picks && typeof b.picks === "object" ? b.picks : {}; st.init = true; }
    else if (b.op === "set" && ok(b.id) && b.data && typeof b.data === "object") { st.plans[b.id] = b.data; st.init = true; }
    else if (b.op === "del" && ok(b.id)) { delete st.plans[b.id]; }
    else if (b.op === "pick" && ok(b.id)) { const v = b.val || (b.on ? "go" : null); if (v === "go" || v === "dim" || v === "hide") st.picks[b.id] = { [v]: true }; else delete st.picks[b.id]; }
    if (JSON.stringify(st).length > 200000) return new Response('{"error":"too_big"}', { status: 413, headers: H });
    st.rev = (st.rev || 0) + 1;
    await env.TRIP.put(KEY, JSON.stringify(st));
  }
  return new Response(JSON.stringify(st), { headers: H });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === "/api/trip/vienna") return trip(req, env);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (url.pathname === "/mcp") {
      if (req.method === "POST") return mcp(req, env);
      return json({ name: "veliq-works", transport: "streamable-http", tools: TOOLS.map((t) => t.name) }, 200);
    }
    if (url.pathname === "/api/works" || url.pathname === "/api/works/") {
      const cat = await catalog(env);
      return json(await search(cat, Object.fromEntries(url.searchParams)));
    }
    const m = url.pathname.match(/^\/api\/works\/([a-z0-9-]+)$/);
    if (m) {
      const cat = await catalog(env);
      const w = await cat.getWork(m[1]);
      return w ? json(w) : json({ error: "not_found" }, 404);
    }
    const pg = url.pathname.match(/^\/music\/catalog\/(?:([a-z0-9-]+)\/?)?$/);
    if (pg) {
      const cat = await catalog(env);
      if (pg[1]) { const r = await workPage(env, cat, pg[1]); if (r) return r; }
      else return catalogPage(env, cat, url.searchParams);
    }
    if (url.pathname === "/api" || url.pathname === "/api/") {
      const cat = await catalog(env);
      return json({ name: cat.idx.name, updated: cat.idx.updated, endpoints: ["/api/works?composer=&key=&mode=&genre=&instrument=&opusFrom=&opusTo=&yearFrom=&yearTo=&exclude=&movementKey=1&q=&includeFragments=1", "/api/works/<id>", "/mcp (POST, MCP)"], coverage: cat.idx.coverage, fields: cat.idx.fields });
    }
    return env.ASSETS.fetch(req);
  },
};
