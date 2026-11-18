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

// ---- 画家の目録（/art/catalog/ と /art/catalog/<id>/）----
// データは /data/art-catalog/index.json（全員の1行分）と e/<n>.json（本体を約100人ずつ）。tools/art_catalog_build.py で作る
// 見た目は作品目録と同じ（.wk）。型は /art/artists/ のページ。中身は出典の事実だけで、文章は足さない
const ART_HDR = { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https://commons.wikimedia.org https://upload.wikimedia.org; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests" };
let ART = null;
async function artCatalog(env) {
  if (ART && Date.now() - ART.at < 300000) return ART;
  const get = async (p) => (await env.ASSETS.fetch(new Request(SITE + p))).json();
  const idx = await get("/data/art-catalog/index.json");
  const col = Object.fromEntries(idx.row.map((k, i) => [k, i]));
  const rows = idx.rows.map((r) => Object.fromEntries(idx.row.map((k, i) => [k, r[i]])));
  const minor = idx.minor.map((r) => Object.fromEntries(idx.minorRow.map((k, i) => [k, r[i]])));
  const shards = {};
  ART = {
    at: Date.now(), idx, col, rows, minor,
    byId: Object.fromEntries(rows.map((r) => [r.id, r])),
    async entry(id) {
      const r = this.byId[id];
      if (!r) return null;
      if (!shards[r.shard]) shards[r.shard] = await get(`/data/art-catalog/e/${r.shard}.json`);
      return shards[r.shard][id] || null;
    },
  };
  return ART;
}
async function artShell(env, { title, desc, canon, crumbs, body, en, ld2 }) {
  const tpl = await (await env.ASSETS.fetch(new Request(SITE + "/art/artists/"))).text();
  const ld = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: crumbs.map(([n, u], i) => ({ "@type": "ListItem", position: i + 1, name: n, ...(u ? { item: SITE + u } : {}) })) };
  const bc = '<nav class="va-bc" aria-label="パンくず"><ol>' + crumbs.map(([n, u], i) => i < crumbs.length - 1 ? `<li><a href="${u}">${H(n)}</a></li>` : `<li><span aria-current="page">${H(n)}</span></li>`).join("") + "</ol></nav>";
  return tpl
    .replace('<a href="/art/artists/" class="on">画家</a>', '<a href="/art/artists/">画家</a>').replace('<a href="/art/catalog/">画家の目録</a>', '<a href="/art/catalog/" class="on">画家の目録</a>')
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${H(title)}｜Veliq Academy</title>`)
    .replace(/(<meta name="description" content=")[^"]*/, `$1${H(desc)}`)
    .replace(/(<meta property="og:description" content=")[^"]*/, `$1${H(desc)}`)
    .replace(/(<meta property="og:title" content=")[^"]*/, `$1${H(title)}｜Veliq Academy`)
    .replace(/(<link rel="canonical" href=")[^"]*/, `$1${SITE}${canon}`)
    .replace(/(<meta property="og:url" content=")[^"]*/, `$1${SITE}${canon}`)
    .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, `<script type="application/ld+json">${JSON.stringify(ld)}</script>`)
    .replace(/<main[\s\S]*<\/main>/, `<main id="main" class="va-main"><div class="wrap">${bc}${body}</div></main>`)
    .replace("</head>", (en ? `<link rel="alternate" hreflang="ja" href="${SITE}${canon}"><link rel="alternate" hreflang="en" href="${SITE}${en}"><link rel="alternate" hreflang="x-default" href="${SITE}${en}">` : "") + (ld2 ? `<script type="application/ld+json">${JSON.stringify(ld2).replace(/</g, "\\u003c")}</script>` : "") + "</head>");
}
const ART_MUSEUM = { met: "メトロポリタン美術館", nga: "ナショナル・ギャラリー・オブ・アート", cma: "クリーブランド美術館", aic: "シカゴ美術館", moma: "MoMA" };
const artYears = (b, d, approx) => (b || d ? `${b ? b + (approx ? "頃" : "") : "？"}–${d ? d + (approx ? "頃" : "") : ""}` : "");
const artName = (r) => r.nameJa || r.nameEn;
const artFold = (s) => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[・＝=\-\s.]/g, "");
async function artEntryPage(env, A, id) {
  const e = await A.entry(id);
  if (!e) return null;
  const row = (k, v) => (v ? `<dt>${k}</dt><dd>${v}</dd>` : "");
  const link = (x) => (x.id ? `<a href="/art/catalog/${H(x.id)}/">${H(x.ja || x.en || x.qid)}</a>` : H(x.ja || x.en || x.qid));
  const jaNote = { none: "日本語表記は未確認です。", wikidata: "日本語表記は仮（Wikidata の日本語ラベル）です。", museum: "漢字の表記は所蔵館の記載です。" }[e.nameJaStatus] || "";
  const sub = [e.nameJa ? e.nameEn : "", e.nameOrig && e.nameOrig !== e.nameJa ? e.nameOrig : ""].filter(Boolean).map(H).join("　");
  const counts = Object.entries(e.counts || {}).map(([m, c]) => `${H(ART_MUSEUM[m] || m)}：${Object.entries(c).map(([k, n]) => `${H(k)}${n}点`).join("、")}`).join("<br>");
  const kinds = Object.entries(e.kinds || {}).map(([k, n]) => `${H(k)} ${n}点`).join("、");
  const ids = [e.wikidata ? `<a href="https://www.wikidata.org/wiki/${H(e.wikidata)}" target="_blank" rel="noopener">Wikidata ${H(e.wikidata)}</a>` : "", e.ulan ? `<a href="https://vocab.getty.edu/page/ulan/${H(e.ulan)}" target="_blank" rel="noopener">ULAN ${H(e.ulan)}</a>` : ""].filter(Boolean).join("　");
  const more = e.tier2 ? `<p class="more"><a href="/art/artists/${H(e.tier2)}/">詳しく読む：${H(artName(e))}</a></p>` : "";
  const works = (e.works || []).length ? `<h2>公的なコレクションにある作品</h2><div class="rl">` + e.works.map((w) => `<a href="${H(w.u)}" target="_blank" rel="noopener">${H(w.t || "題の記載なし")}<small>${[w.d, ART_MUSEUM[w.m] || w.m, w.k].filter(Boolean).map(H).join("・")}</small></a>`).join("") + "</div>" +
    (e.workCount > e.works.length ? `<p class="nt">全${e.workCount}点のうち${e.works.length}点。絵画を先に、所蔵館が作品の年を書いた順に並べています。</p>` : "") : "";
  const src = (e.sources || []).length ? `<h2>出典</h2><ul class="src">${e.sources.map((s) => `<li><a href="${H(s.url)}" target="_blank" rel="noopener">${H(s.name)}</a>（${H(s.license)}、${H(s.retrieved)}取得）${s.fields ? `：${H(s.fields)}` : ""}</li>`).join("")}${e.nameJaSource ? `<li>日本語表記：${H(e.nameJaSource)}</li>` : ""}</ul>` : "";
  const fig = e.work && e.work.file ? `<figure class="awk"><img src="https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(e.work.file)}?width=960" alt="${H(e.work.title)}" loading="lazy" decoding="async"><figcaption>${H(e.work.title)}　<a href="https://commons.wikimedia.org/wiki/File:${encodeURIComponent(e.work.file)}" target="_blank" rel="noopener">画像：Wikimedia Commons</a></figcaption></figure>` : "";
  const body = `<article class="wk"><h1>${H(artName(e))}</h1>${sub ? `<p class="en">${sub}</p>` : ""}${jaNote ? `<p class="nt">${jaNote}</p>` : ""}${fig}${more}<dl>` +
    row("生年", e.born ? `${e.born}年${e.approx ? "頃" : ""}${e.birthPlace ? `　${H(e.birthPlace)}` : ""}` : "") +
    row("没年", e.died ? `${e.died}年${e.approx ? "頃" : ""}${e.deathPlace ? `　${H(e.deathPlace)}` : ""}` : "") +
    row("国籍・地域", (e.country || []).map(H).join("、")) + row("時代", (e.jpPeriods || []).map(H).join("、")) +
    row("流派・運動", (e.movement || []).map((m) => H(m.ja || m.en || m)).join("、")) + row("代表作", e.work ? H(e.work.title) : "") +
    row("師", (e.teachers || []).map(link).join("、")) + row("弟子", (e.students || []).map(link).join("、")) +
    row("作品の種類", kinds) + row("所蔵", counts) + row("ID", ids) + `</dl>` +
    ((e.yearsNote || []).length ? `<p class="nt">出典によって年が異なります。${e.yearsNote.map(H).join("。")}。</p>` : "") +
    (e.birthPlace || e.deathPlace ? `<p class="nt">出生地・死没地はメトロポリタン美術館の記載のままです。</p>` : "") +
    works + src + `<p class="nt">Veliq 画家の目録より。出典に書かれていることだけを載せています。<a href="/art/catalog/">画家の目録で探す</a>　<a href="/en/art/catalog/${H(e.id)}/" hreflang="en" lang="en">English</a></p></article>`;
  const desc = [artName(e), e.nameJa ? e.nameEn : "", artYears(e.born, e.died, e.approx), (e.country || []).join("・"), `公的なコレクションの所蔵作品${e.workCount}点`].filter(Boolean).join("。");
  return new Response(await artShell(env, { title: artName(e), desc, canon: `/art/catalog/${e.id}/`, en: `/en/art/catalog/${e.id}/`, ld2: artPersonLd(e, "ja"), crumbs: [["トップ", "/"], ["美術", "/art/"], ["画家の目録", "/art/catalog/"], [artName(e)]], body }), { headers: { ...ART_HDR, "Cache-Control": "public, max-age=600" } });
}
async function artIndexPage(env, A, params) {
  const q = String(params.get("q") || "").slice(0, 60), era = String(params.get("era") || ""), country = String(params.get("country") || ""), mv = String(params.get("movement") || "");
  const PER = 100, page = Math.max(1, parseInt(params.get("p") || "1", 10) || 1);
  const fq = artFold(q);
  const hitQ = (...xs) => !fq || xs.some((x) => artFold(x).includes(fq));
  const list = A.rows.filter((r) => hitQ(r.nameJa, r.nameEn, r.nameOrig) && (!era || r.era === era) && (!country || (r.country || []).includes(country)) && (!mv || (r.movement || []).some((m) => (m.ja || m.en || m) === mv)));
  const eraOf = (y) => (y ? `${Math.floor((y - 1) / 100) + 1}世紀` : "");
  const minor = A.minor.filter((r) => hitQ(r.nameEn, r.nameOrig) && (!era || eraOf(r.born || (r.died ? r.died - 50 : 0)) === era) && (!country || (r.country || []).includes(country)) && !mv);
  const opt = (name, label, vals, cur) => `<select name="${name}" aria-label="${label}"><option value="">${label}</option>${vals.map((v) => `<option${v === cur ? " selected" : ""}>${H(v)}</option>`).join("")}</select>`;
  const eras = [...new Set(A.rows.map((r) => r.era).filter(Boolean))].sort((a, b) => parseInt(a) - parseInt(b));
  const cc = {};
  A.rows.forEach((r) => (r.country || []).forEach((c) => (cc[c] = (cc[c] || 0) + 1)));
  const countries = Object.keys(cc).sort((a, b) => cc[b] - cc[a]);
  const mvs = [...new Set(A.rows.flatMap((r) => (r.movement || []).map((m) => m.ja || m.en || m)))].sort();
  const pages = Math.max(1, Math.ceil(list.length / PER));
  const shown = list.slice((page - 1) * PER, page * PER);
  const qs = (p) => "?" + new URLSearchParams(Object.entries({ q, era, country, movement: mv, p: p > 1 ? String(p) : "" }).filter(([, v]) => v)).toString();
  const nav = pages > 1 ? `<p class="pg">${page > 1 ? `<a href="/art/catalog/${qs(page - 1)}">前の${PER}人</a>` : ""}<span>${page} / ${pages}</span>${page < pages ? `<a href="/art/catalog/${qs(page + 1)}">次の${PER}人</a>` : ""}</p>` : "";
  const items = shown.map((r) => `<a href="/art/catalog/${H(r.id)}/">${H(artName(r))}<small>${[r.nameJa ? r.nameEn : "", r.nameOrig && r.nameOrig !== r.nameJa ? r.nameOrig : "", artYears(r.born, r.died, r.approx), (r.country || []).join("・"), `所蔵${r.workCount}点`, r.tier2 ? "画家ページあり" : ""].filter(Boolean).map(H).join("・")}</small></a>`).join("");
  const minorList = minor.length ? `<h2>所蔵作品が2点以下の画家</h2><p class="nt">項目はまだありません。名前と生没年だけ載せています。</p><details><summary>${minor.length}人を表示</summary><ul class="mnr">${minor.map((r) => `<li>${H(r.nameEn)}${r.nameOrig ? `（${H(r.nameOrig)}）` : ""}　${H(artYears(r.born, r.died, r.approx))}${(r.country || []).length ? `　${H(r.country.join("・"))}` : ""}</li>`).join("")}</ul></details>` : "";
  const srcs = `<h2>出典</h2><ul class="src">${A.idx.sources.filter((s, i, a) => a.findIndex((x) => x.home === s.home) === i).map((s) => `<li><a href="${H(s.home)}" target="_blank" rel="noopener">${H(s.name)}</a>（${H(s.license)}、${H(s.retrieved)}取得）</li>`).join("")}</ul><p class="nt">次の出典には接続できず、今回は使っていません：${H(A.idx.unreachable)}。</p>`;
  const body = `<article class="wk"><h1>画家の目録</h1><p>美術館が公開しているデータから、画家${A.rows.length}人の生没年・国籍と、公的なコレクションにある作品をまとめた目録です。出典に書かれていることだけを載せています。手書きの解説がある画家には「詳しく読む」を付けています。</p>` +
    `<form action="/art/catalog/" method="get" class="af"><input name="q" value="${H(q)}" placeholder="名前（例：北斎、Monet）" aria-label="名前">${opt("era", "生まれた世紀", eras, era)}${opt("country", "国籍・地域", countries, country)}${mvs.length ? opt("movement", "流派・運動", mvs, mv) : ""}<button>探す</button></form>` +
    `<p class="nt">${list.length}人${q || era || country || mv ? `（全${A.rows.length}人から）` : ""}。生まれた年の順。</p>${nav}<div class="rl">${items}</div>${nav}${minorList}${srcs}</article>`;
  const desc = `美術館の公開データから、画家${A.rows.length}人の生没年・国籍と公的なコレクションにある作品をまとめた目録。`;
  return new Response(await artShell(env, { title: "画家の目録", desc, canon: "/art/catalog/", en: "/en/art/catalog/", crumbs: [["トップ", "/"], ["美術", "/art/"], ["画家の目録"]], body }), { headers: { ...ART_HDR, "Cache-Control": "public, max-age=300" } });
}

// ---- 画家の目録の英語版（/en/art/catalog/）。中身は日本語版と同じデータ。訳した文は足さず、出典の英語表記をそのまま使う ----
const EN_MUSEUM = { met: "The Metropolitan Museum of Art", nga: "National Gallery of Art", cma: "Cleveland Museum of Art", aic: "Art Institute of Chicago", moma: "MoMA" };
const EN_KIND = { 絵画: "paintings", 版画: "prints", 素描: "drawings", 種類の記載なし: "unspecified" };
const EN_PERIOD = { 室町時代: "Muromachi period", 桃山時代: "Momoyama period", 江戸時代: "Edo period", 明治時代: "Meiji period", 大正時代: "Taishō period", 昭和時代: "Shōwa period" };
const EN_COUNTRY = { フランス: "France", 日本: "Japan", アメリカ: "United States", イタリア: "Italy", オランダ: "Netherlands", スペイン: "Spain", イギリス: "United Kingdom", ドイツ: "Germany", 中国: "China", スイス: "Switzerland", ネーデルラント: "Low Countries", メキシコ: "Mexico", ベルギー: "Belgium", フランドル: "Flanders", ギリシャ: "Greece", ロシア: "Russia", スコットランド: "Scotland", スウェーデン: "Sweden", オーストリア: "Austria" };
const enCentury = (y) => { if (!y) return ""; const c = Math.floor((y - 1) / 100) + 1; return `${c}${c % 10 === 1 && c !== 11 ? "st" : c % 10 === 2 && c !== 12 ? "nd" : c % 10 === 3 && c !== 13 ? "rd" : "th"} century`; };
const enYears = (b, d, approx) => (b || d ? `${b ? (approx ? "c. " : "") + b : "?"}–${d ? (approx ? "c. " : "") + d : ""}` : "");
function artPersonLd(e, lang) {
  const sameAs = [e.wikidata ? `https://www.wikidata.org/wiki/${e.wikidata}` : "", e.ulan ? `http://vocab.getty.edu/page/ulan/${e.ulan}` : ""].filter(Boolean);
  const alt = [...new Set([e.nameJa, e.nameOrig, e.nameEn].filter(Boolean))].filter((x) => x !== (lang === "en" ? e.nameEn : artName(e)));
  return { "@context": "https://schema.org", "@type": "Person", name: lang === "en" ? e.nameEn : artName(e), ...(alt.length ? { alternateName: alt } : {}),
    ...(e.born ? { birthDate: String(e.born) } : {}), ...(e.died ? { deathDate: String(e.died) } : {}),
    ...(e.birthPlace ? { birthPlace: e.birthPlace } : {}), ...(e.deathPlace ? { deathPlace: e.deathPlace } : {}),
    ...((e.nationality || []).length ? { nationality: e.nationality } : {}), hasOccupation: "artist",
    ...(e.work && e.work.titleEn ? { subjectOf: { "@type": "VisualArtwork", name: lang === "en" ? e.work.titleEn : e.work.title } } : {}),
    url: `${SITE}${lang === "en" ? "/en" : ""}/art/catalog/${e.id}/`, sameAs, inLanguage: lang };
}
function enShell({ title, desc, canon, ja, crumbs, body, ld2 }) {
  const ld = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: crumbs.map(([n, u], i) => ({ "@type": "ListItem", position: i + 1, name: n, ...(u ? { item: SITE + u } : {}) })) };
  const bc = '<nav class="va-bc" aria-label="Breadcrumb"><ol>' + crumbs.map(([n, u], i) => i < crumbs.length - 1 ? `<li><a href="${u}">${H(n)}</a></li>` : `<li><span aria-current="page">${H(n)}</span></li>`).join("") + "</ol></nav>";
  const j = (o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${H(title)} | Veliq Academy</title>
<meta name="description" content="${H(desc)}"><link rel="canonical" href="${SITE}${canon}">
<link rel="alternate" hreflang="en" href="${SITE}${canon}"><link rel="alternate" hreflang="ja" href="${SITE}${ja}"><link rel="alternate" hreflang="x-default" href="${SITE}${canon}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Veliq Academy"><meta property="og:title" content="${H(title)} | Veliq Academy"><meta property="og:description" content="${H(desc)}"><meta property="og:url" content="${SITE}${canon}"><meta property="og:locale" content="en_US">
<link rel="icon" href="/favicon.ico" sizes="any"><link rel="icon" href="/veliq-mark.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><link rel="stylesheet" href="/assets/vq-ui.css?v=17">${j(ld)}${ld2 ? j(ld2) : ""}</head>
<body><a class="va-skip" href="#main">Skip to content</a><header class="gh"><div class="wrap gh-in"><a class="brand" href="/en/art/catalog/">Veliq <b>Academy</b></a><nav class="gnav" aria-label="Language"><a href="${ja}" hreflang="ja" lang="ja">日本語</a></nav></div></header>
<main id="main" class="va-main"><div class="wrap">${bc}${body}</div></main>
<footer class="gf"><div class="wrap"><div class="gf-brand">Veliq <b>Academy</b></div><p class="nt">Published by VariOrchestra (Musashino, Tokyo). Editor: Eigo Sato. <a href="mailto:info@variorchestra.com">info@variorchestra.com</a></p></div></footer></body></html>`;
}
async function artEntryPageEn(env, A, id) {
  const e = await A.entry(id);
  if (!e) return null;
  const row = (k, v) => (v ? `<dt>${k}</dt><dd>${v}</dd>` : "");
  const link = (x) => (x.id ? `<a href="/en/art/catalog/${H(x.id)}/">${H(x.en || x.ja || x.qid)}</a>` : H(x.en || x.ja || x.qid));
  const jaName = e.nameJa && e.nameJa !== e.nameEn ? e.nameJa : "";
  const sub = [jaName ? `${jaName}${e.nameJaStatus === "wikidata" || e.nameJaStatus === "none" ? "" : ""}` : "", e.nameOrig && e.nameOrig !== jaName ? e.nameOrig : ""].filter(Boolean).map(H).join("　");
  const counts = Object.entries(e.counts || {}).map(([m, c]) => `${H(EN_MUSEUM[m] || m)}: ${Object.entries(c).map(([k, n]) => `${n} ${H(EN_KIND[k] || k)}`).join(", ")}`).join("<br>");
  const kinds = Object.entries(e.kinds || {}).map(([k, n]) => `${n} ${H(EN_KIND[k] || k)}`).join(", ");
  const ids = [e.wikidata ? `<a href="https://www.wikidata.org/wiki/${H(e.wikidata)}" target="_blank" rel="noopener">Wikidata ${H(e.wikidata)}</a>` : "", e.ulan ? `<a href="https://vocab.getty.edu/page/ulan/${H(e.ulan)}" target="_blank" rel="noopener">ULAN ${H(e.ulan)}</a>` : ""].filter(Boolean).join("　");
  const wt = e.work ? e.work.titleEn || "" : "";
  const fig = e.work && e.work.file ? `<figure class="awk"><img src="https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(e.work.file)}?width=960" alt="${H(wt || e.nameEn)}" loading="lazy" decoding="async"><figcaption>${H(wt)}　<a href="https://commons.wikimedia.org/wiki/File:${encodeURIComponent(e.work.file)}" target="_blank" rel="noopener">Image: Wikimedia Commons</a></figcaption></figure>` : "";
  const works = (e.works || []).length ? `<h2>Works in public collections</h2><div class="rl">` + e.works.map((w) => `<a href="${H(w.u)}" target="_blank" rel="noopener">${H(w.t || "Untitled")}<small>${[w.d, EN_MUSEUM[w.m] || w.m, EN_KIND[w.k] ? EN_KIND[w.k].replace(/s$/, "") : ""].filter(Boolean).map(H).join(" · ")}</small></a>`).join("") + "</div>" +
    (e.workCount > e.works.length ? `<p class="nt">${e.works.length} of ${e.workCount} works. Paintings first, then in order of the date given by the museum.</p>` : "") : "";
  const src = (e.sources || []).length ? `<h2>Sources</h2><ul class="src">${e.sources.map((s) => `<li><a href="${H(s.url)}" target="_blank" rel="noopener">${H(s.name)}</a> (${H(s.license)}, retrieved ${H(s.retrieved)})</li>`).join("")}</ul>` : "";
  const body = `<article class="wk" lang="en"><h1>${H(e.nameEn)}</h1>${sub ? `<p class="en" lang="ja">${sub}</p>` : ""}${fig}<dl>` +
    row("Born", e.born ? `${e.approx ? "c. " : ""}${e.born}${e.birthPlace ? `, ${H(e.birthPlace)}` : ""}` : "") +
    row("Died", e.died ? `${e.approx ? "c. " : ""}${e.died}${e.deathPlace ? `, ${H(e.deathPlace)}` : ""}` : "") +
    row("Nationality", (e.nationality || []).map(H).join(", ")) + row("Japanese name", jaName ? `<span lang="ja">${H(jaName)}</span>` : "") +
    row("Period", (e.jpPeriods || []).map((p) => H(EN_PERIOD[p] || p)).join(", ")) +
    row("Movement", (e.movementEn || []).map(H).join(", ")) + row("Notable work", H(wt)) +
    row("Teacher", (e.teachers || []).map(link).join(", ")) + row("Student", (e.students || []).map(link).join(", ")) +
    row("Works by type", kinds) + row("Collections", counts) + row("Identifiers", ids) + `</dl>` +
    works + src + `<p class="nt">From the Veliq Academy artist catalog, compiled only from the sources listed above. <a href="/en/art/catalog/">Search the catalog</a>　<a href="/art/catalog/${H(e.id)}/" hreflang="ja" lang="ja">日本語</a></p></article>`;
  const desc = [e.nameEn, jaName, enYears(e.born, e.died, e.approx), (e.nationality || []).join(", "), `${e.workCount} works in public collections`].filter(Boolean).join(". ");
  return new Response(enShell({ title: e.nameEn, desc, canon: `/en/art/catalog/${e.id}/`, ja: `/art/catalog/${e.id}/`, ld2: artPersonLd(e, "en"), crumbs: [["Artist catalog", "/en/art/catalog/"], [e.nameEn]], body }), { headers: { ...ART_HDR, "Cache-Control": "public, max-age=600" } });
}
async function artIndexPageEn(env, A, params) {
  const q = String(params.get("q") || "").slice(0, 60), country = String(params.get("country") || ""), era = String(params.get("century") || "");
  const PER = 100, page = Math.max(1, parseInt(params.get("p") || "1", 10) || 1);
  const fq = artFold(q);
  const cen = (r) => enCentury(r.born || (r.died ? r.died - 50 : 0));
  const list = A.rows.filter((r) => (!fq || [r.nameJa, r.nameEn, r.nameOrig].some((x) => artFold(x).includes(fq))) && (!country || (r.country || []).some((c) => (EN_COUNTRY[c] || c) === country)) && (!era || cen(r) === era));
  const cc = {};
  A.rows.forEach((r) => (r.country || []).forEach((c) => { const k = EN_COUNTRY[c] || c; cc[k] = (cc[k] || 0) + 1; }));
  const countries = Object.keys(cc).sort((a, b) => cc[b] - cc[a]);
  const eras = [...new Set(A.rows.map(cen).filter(Boolean))].sort((a, b) => parseInt(a) - parseInt(b));
  const opt = (name, label, vals, cur) => `<select name="${name}" aria-label="${label}"><option value="">${label}</option>${vals.map((v) => `<option${v === cur ? " selected" : ""}>${H(v)}</option>`).join("")}</select>`;
  const pages = Math.max(1, Math.ceil(list.length / PER));
  const shown = list.slice((page - 1) * PER, page * PER);
  const qs = (p) => "?" + new URLSearchParams(Object.entries({ q, country, century: era, p: p > 1 ? String(p) : "" }).filter(([, v]) => v)).toString();
  const nav = pages > 1 ? `<p class="pg">${page > 1 ? `<a href="/en/art/catalog/${qs(page - 1)}">Previous ${PER}</a>` : ""}<span>${page} / ${pages}</span>${page < pages ? `<a href="/en/art/catalog/${qs(page + 1)}">Next ${PER}</a>` : ""}</p>` : "";
  const items = shown.map((r) => `<a href="/en/art/catalog/${H(r.id)}/">${H(r.nameEn)}<small>${[r.nameJa && r.nameJa !== r.nameEn && /[\u3040-\u30ff\u4e00-\u9fff]/.test(r.nameOrig || "") ? r.nameOrig : "", enYears(r.born, r.died, r.approx), (r.country || []).map((c) => EN_COUNTRY[c] || c).join(", "), `${r.workCount} works`].filter(Boolean).map(H).join(" · ")}</small></a>`).join("");
  const srcs = `<h2>Sources</h2><ul class="src">${A.idx.sources.filter((s, i, a) => a.findIndex((x) => x.home === s.home) === i).map((s) => `<li><a href="${H(s.home)}" target="_blank" rel="noopener">${H(s.name)}</a> (${H(s.license)}, retrieved ${H(s.retrieved)})</li>`).join("")}<li><a href="https://www.wikidata.org/" target="_blank" rel="noopener">Wikidata</a> (CC0 1.0): Japanese names, movements, notable works</li></ul>`;
  const body = `<article class="wk" lang="en"><h1>Artist catalog</h1><p>${A.rows.length} artists, with dates, nationality and works held in public collections, compiled from museum open data. Japanese artists are listed with their names in kanji and the periods given by the museums.</p>` +
    `<form action="/en/art/catalog/" method="get" class="af"><input name="q" value="${H(q)}" placeholder="Name (e.g. Hokusai, 北斎, Monet)" aria-label="Name">${opt("century", "Century of birth", eras, era)}${opt("country", "Country", countries, country)}<button>Search</button></form>` +
    `<p class="nt">${list.length} artists${q || era || country ? ` (of ${A.rows.length})` : ""}, in order of birth.</p>${nav}<div class="rl">${items}</div>${nav}${srcs}</article>`;
  const desc = `${A.rows.length} artists with dates, nationality and works in public collections, compiled from museum open data. Includes ${A.rows.filter((r) => (r.country || []).includes("日本")).length} Japanese artists with kanji names.`;
  return new Response(enShell({ title: "Artist catalog", desc, canon: "/en/art/catalog/", ja: "/art/catalog/", crumbs: [["Artist catalog"]], body }), { headers: { ...ART_HDR, "Cache-Control": "public, max-age=300" } });
}
async function artSitemap(env) {
  const A = await artCatalog(env);
  const u = (p, alt) => `<url><loc>${SITE}${p}</loc><xhtml:link rel="alternate" hreflang="ja" href="${SITE}${alt[0]}"/><xhtml:link rel="alternate" hreflang="en" href="${SITE}${alt[1]}"/></url>`;
  const ps = [["/art/catalog/", "/en/art/catalog/"], ...A.rows.map((r) => [`/art/catalog/${r.id}/`, `/en/art/catalog/${r.id}/`])];
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` + ps.flatMap((x) => [u(x[0], x), u(x[1], x)]).join("\n") + "\n</urlset>\n";
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
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
  if (st.init && st.mig === "m7") {
    Object.assign(st.plans, {"p22": {"day": "11/12", "start": "10:00", "end": "12:30", "c": "v", "title": "チェックアウト → 1B → 荷物整理", "note": "【宿】Studioapartment 1B（Holochergasse 9, 1150）。鍵は玄関そばの上のキーボックス\n【夜】19:30 フランス放送フィル（ギャラリー右13列6番）"}, "p25": {"day": "11/12", "start": "12:45", "end": "13:45", "c": "v", "title": "ランチ（Café Sperl）", "note": "【場所】Gumpendorfer Straße 11（6区）。U2 Museumsquartier 徒歩5分\n【このあと】U2でMuseumsquartier → Schottentor（約5分）"}, "p4": {"day": "11/12", "start": "14:00", "end": "15:30", "c": "v", "title": "パスクァラティハウス → Doblinger", "note": "【14:00 パスクァラティハウス】Mölker Bastei 8。U2 Schottentor 徒歩3分。午後は14:00–17:00、大人約€6。エレベーターなし\n【15:00 Doblinger（楽譜）】Dorotheergasse 10。歩いて15分。平日18:30まで"}, "p34": {"day": "11/12", "start": "15:45", "end": "16:30", "c": "v", "title": "シュテファン大聖堂＋マーケット", "note": "【場所】Stephansplatz。Doblingerから歩いて5分\n【大聖堂】入口付近は無料。奥・塔・地下墓所は有料\n【マーケット】大聖堂前（11/6から開催中）"}, "p26": {"day": "11/12", "start": "16:45", "end": "18:45", "c": "v", "title": "美術史美術館（KHM）", "note": "【場所】Maria-Theresien-Platz。シュテファンからU3でVolkstheater、徒歩6分\n【時間】木曜は21:00まで\n【見どころ】ブリューゲルの部屋（『バベルの塔』『雪中の狩人』）、フェルメール『絵画芸術』。2階の丸天井のカフェ\n【このあと】18:45に出る。U2 Museumsquartier → Karlsplatz、徒歩7分でコンツェルトハウス"}});
    st.mig = "m8"; st.rev = (st.rev || 0) + 1;
    await env.TRIP.put(KEY, JSON.stringify(st));
  }
  if (st.init && st.mig === "m8") {
    for (const k of ["p31","p25"]) delete st.plans[k];
    Object.assign(st.plans, {"p4": {"day": "11/12", "start": "14:40", "end": "15:40", "c": "v", "title": "パスクァラティハウス", "note": "【場所】Mölker Bastei 8（1区）の4階。U2 Schottentor 徒歩3分\n【時間】14:00–17:00、大人約€6。エレベーターなし\n【中】ベートーヴェンが1804〜15年に何度も住んだ家。『運命』『フィデリオ』『エリーゼのために』の頃"}, "p35": {"day": "11/12", "start": "15:55", "end": "16:30", "c": "v", "title": "Doblinger（楽譜）", "note": "【場所】Dorotheergasse 10（1区）。パスクァラティから歩いて15分\n【時間】平日18:30まで"}, "p34": {"day": "11/12", "start": "16:35", "end": "17:15", "c": "v", "title": "シュテファン大聖堂＋マーケット", "note": "【場所】Stephansplatz。Doblingerから歩いて5分\n【大聖堂】入口付近は無料。奥・塔・地下墓所は有料\n【マーケット】大聖堂前（11/6から開催中）"}, "p36": {"day": "11/12", "start": "17:15", "end": "18:50", "c": "v", "title": "休憩（宿かカフェ）", "note": "【宿へ】U3 Stephansplatz → Schweglerstraße（約12分）、徒歩8分\n【カフェなら】Café Hawelka（Dorotheergasse 6）やCafé Bräunerhof（Stallburggasse 2）が大聖堂から歩いて5分\n【このあと】18:50に出る。宿からはU3 Stephansplatz → U1 Karlsplatz、徒歩7分でコンツェルトハウス"}, "p26": {"day": "11/13", "start": "13:30", "end": "17:30", "c": "v", "title": "美術史美術館（KHM）", "note": "【場所】Maria-Theresien-Platz（1区）。U2・U3 Volkstheater／U2 Museumsquartier 徒歩5分\n【時間】金曜は18:00まで\n【入場】時間指定の予約が必要（無料で予約でき、窓口でもできる）\n【見どころ】ブリューゲルの部屋（『バベルの塔』『雪中の狩人』）、フェルメール『絵画芸術』、ラファエロ、カラヴァッジョ、ベラスケスの王女マルガリータ。2階の丸天井のカフェで休憩"}, "p32": {"day": "11/13", "start": "17:30", "end": "18:30", "c": "v", "title": "宿で休む", "note": "【宿】Holochergasse 9。KHMからU3 Volkstheater → Schweglerstraße（約8分）\n【このあと】18:30に出て、19:00 国立歌劇場『連隊の娘』"}, "p29": {"day": "11/15", "start": "13:00", "end": "14:30", "c": "v", "title": "音楽の家（Haus der Musik）", "note": "【場所】Seilerstätte 30（1区）。楽友協会から歩いて7分\n【時間】毎日10:00–22:00\n【中】ウィーン・フィルの歴史、ベートーヴェン・モーツァルトの部屋、画面のウィーン・フィルを指揮できる「バーチャル指揮者」\n【このあと】15:30 楽友協会 トーンキュンストラー管（立見なら14:30には並ぶ）"}});
    st.mig = "m9"; st.rev = (st.rev || 0) + 1;
    await env.TRIP.put(KEY, JSON.stringify(st));
  }
  if (st.init && st.mig === "m9") {
    Object.assign(st.plans, {"p25": {"day": "11/12", "start": "12:45", "end": "14:30", "c": "v", "title": "ランチ（Café Sperl）", "note": "【食べたもの】Geröstete Knödel mit Ei＋サラダ（€11.2）、Gösser Märzen 0.5L（€4.9）、Melange（€4.9）\n【場所】Gumpendorfer Straße 11（6区）"}, "p4": {"day": "11/12", "start": "14:45", "end": "15:45", "c": "v", "title": "パスクァラティハウス", "note": "【場所】Mölker Bastei 8（1区）の4階。U2 Museumsquartier → Schottentor、徒歩3分\n【時間】14:00–17:00、大人約€6。エレベーターなし\n【中】ベートーヴェンが1804〜15年に何度も住んだ家。『運命』『フィデリオ』『エリーゼのために』の頃"}});
    st.mig = "m10"; st.rev = (st.rev || 0) + 1;
    await env.TRIP.put(KEY, JSON.stringify(st));
  }
  if (st.init && st.mig === "m10") {
    for (const k of ["p27","p28"]) delete st.plans[k];
    Object.assign(st.plans, {"p37": {"day": "11/13", "start": "10:00", "end": "11:30", "c": "v", "title": "朝寝坊・部屋で朝昼ごはん", "note": "【10:00】フォルクスオーパーのU30残券がウェブショップと窓口で発売。パスポート必要\n【だめなら】18:00から窓口でU30 €15（売り切れでなければ）\n【ごはん】部屋のキッチンで"}, "p26": {"day": "11/13", "start": "12:30", "end": "16:30", "c": "v", "title": "美術史美術館（KHM）", "note": "【場所】Maria-Theresien-Platz（1区）。U3 Schweglerstraße → Volkstheater、徒歩6分\n【時間】金曜は18:00まで\n【入場】時間指定の予約が必要（無料で予約でき、窓口でもできる）\n【見どころ】ブリューゲルの部屋（『バベルの塔』『雪中の狩人』『農民の婚宴』）、フェルメール『絵画芸術』、ラファエロ、カラヴァッジョ、ベラスケス。2階の丸天井のカフェで休憩"}, "p32": {"day": "11/13", "start": "16:45", "end": "18:20", "c": "v", "title": "宿で休む", "note": "【宿】Holochergasse 9。KHMからU3 Volkstheater → Schweglerstraße\n【このあと】18:20に出る。西駅からU6でWähringer Straße–Volksoper（約10分）"}, "p38": {"day": "11/13", "start": "19:00", "end": "22:15", "c": "v", "title": "フォルクスオーパー『こうもり』", "note": "【演目】J.シュトラウス『こうもり』（Die Fledermaus）\n【場所】Volksoper Wien, Währinger Straße 78（9区）。U6 Währinger Straße–Volksoper すぐ\n【券】U30：当日10:00から残券（ウェブショップ・窓口）、開演1時間前から窓口で€15。パスポート持参\n【帰り】U6でWestbahnhof → 宿まで徒歩"}});
    st.mig = "m11"; st.rev = (st.rev || 0) + 1;
    await env.TRIP.put(KEY, JSON.stringify(st));
  }
  if (st.init && st.mig === "m11") {
    Object.assign(st.plans, {"p30": {"day": "11/15", "start": "09:15", "end": "10:30", "c": "v", "title": "ホーフブルク礼拝堂のミサ", "note": "【場所】Hofburgkapelle（王宮、Schweizerhof）。U3 Herrengasse 徒歩5分\n【内容】シューベルト『ミサ曲 ト長調』。ウィーン少女合唱団がソプラノとアルト\n【メモ】日曜のミサとして行われる。座席は有料（culturallで予約）\n【このあと】同じ王宮の新王宮（Neue Burg）へ歩いて5分、古楽器コレクション"}, "p39": {"day": "11/15", "start": "10:45", "end": "12:30", "c": "v", "title": "古楽器コレクション（新王宮）", "note": "【場所】Neue Burg, Heldenplatz（ホーフブルク王宮）。礼拝堂から歩いて5分。U3 Herrengasse／U2 Volkstheater\n【時間】水〜日 10:00–18:00（月曜休み）\n【券】美術史美術館の券とは別。「Neue Hofburg」の券（民族学博物館・武器コレクションとのセット）\n【見どころ】ベートーヴェン、シューベルト、ハイドンゆかりのピアノ、ルネサンス〜バロックの楽器\n【このあと】昼ごはん → 13:00 音楽の家"}});
    st.picks = st.picks || {}; st.picks["k10vebo9"] = { dim: true };
    st.mig = "m12"; st.rev = (st.rev || 0) + 1;
    await env.TRIP.put(KEY, JSON.stringify(st));
  }
  if (st.init && st.mig === "m12") {
    Object.assign(st.plans, {"p40": {"day": "11/14", "start": "08:15", "end": "08:50", "c": "v", "title": "朝ごはん（中央駅）", "note": "【宿から】U3 Schweglerstraße → Westbahnhof、トラム18で中央駅（約25分）\n【中央駅】構内のパン屋（Anker、Ströckなど）でパンとコーヒー\n【このあと】歩いて10分でベルヴェデーレ上宮"}, "p20": {"day": "11/14", "start": "09:00", "end": "10:00", "c": "v", "title": "ベルヴェデーレ上宮（クリムト）", "note": "【場所】Prinz-Eugen-Straße 27（3区）。中央駅から歩いて10分\n【時間】毎日9:00–18:00（開館と同時に入る）\n【料金】大人€23。オンラインで時間指定の券を買っておくと早い\n【見どころ】クリムト『接吻』『ユディト』、シーレ、ダヴィッド『アルプス越えのナポレオン』。1時間なら2階のクリムトとシーレの部屋に絞る\n【このあと】10:00に出て、歩いて10分で中央駅。10:14の列車"}, "p21": {"day": "11/14", "start": "10:14", "end": "11:10", "c": "b", "title": "移動 ウィーン → ブラチスラヴァ", "note": "【列車】ウィーン中央駅 毎時14分発のREX、56分。Bratislava hlavná stanica 着\n【切符】片道€12.70（当日買える、予約不要）。ÖBBの「Bratislava Ticket」往復なら、その日のブラチスラヴァ市内交通も込み\n【メモ】乗り遅れたら次の11:14発でよい\n【天気】14日は雨の確率0%、最高9℃"}});
    st.mig = "m13"; st.rev = (st.rev || 0) + 1;
    await env.TRIP.put(KEY, JSON.stringify(st));
  }
  if (st.init && st.mig === "m13") {
    for (const k of ["p40", "p21", "p23", "p24"]) delete st.plans[k];
    Object.assign(st.plans, {"p41": {"day": "11/14", "start": "09:30", "end": "10:30", "c": "v", "title": "ゆっくり起きる・立見を買う", "note": "【10:00】国立歌劇場の立見をオンラインで買う（発売開始）。Stehparterre €18、1アカウント2枚まで\n【ページ】wiener-staatsoper.at/en/calendar/detail/lelisir-damore/2026-11-14/\n【10:30】宿を出る"}, "p20": {"day": "11/14", "start": "11:00", "end": "13:00", "c": "v", "title": "ベルヴェデーレ上宮（クリムト）", "note": "【行き方】U3 Schweglerstraße → Westbahnhof、トラム18で Quartier Belvedere、歩いて数分\n【時間】毎日9:00–18:00\n【料金】大人€23。オンラインで時間指定券を買うと早い\n【見どころ】クリムト『接吻』『ユディト』、シーレ、ダヴィッド『アルプス越えのナポレオン』"}, "p42": {"day": "11/14", "start": "13:15", "end": "14:30", "c": "v", "title": "昼ごはん（Café Goldegg）", "note": "【場所】Argentinierstraße 49（4区）。ベルヴェデーレから歩いて10分\n【時間】土曜9:00–20:00\n【メモ】古いウィーンのカフェ"}, "p43": {"day": "11/14", "start": "15:00", "end": "17:45", "c": "v", "title": "宿で休憩", "note": "夜は立ちっぱなしなので、ここでしっかり休む"}, "p44": {"day": "11/14", "start": "18:15", "end": "21:30", "c": "v", "title": "国立歌劇場『愛の妙薬』（立見）", "note": "【開演】19:00、終演21:30ごろ、休憩1回\n【行き方】U3 Schweglerstraße → Stephansplatz、U1で Karlsplatz（約20分）\n【買えなかったら】Operngasse側の立見窓口で開演80分前（17:40）から当日販売\n【代わり】19:30 楽友協会 ウィーン響／コパチンスカヤ（立見）"}});
    st.mig = "m14"; st.rev = (st.rev || 0) + 1;
    await env.TRIP.put(KEY, JSON.stringify(st));
  }
  if (st.init && st.mig === "m14") {
    for (const k of ["p20", "p42", "p43", "p44", "p29"]) delete st.plans[k];
    Object.assign(st.plans, {"p41": {"day": "11/14", "start": "09:30", "end": "10:30", "c": "v", "title": "ゆっくり起きる・立見を買う", "note": "【10:00】国立歌劇場の立見をオンラインで買う（発売開始）。Stehparterre €18、1アカウント2枚まで\n【ページ】wiener-staatsoper.at/en/calendar/detail/lelisir-damore/2026-11-14/\n【10:30】宿を出る"}, "p20": {"day": "11/14", "start": "11:00", "end": "13:30", "c": "v", "title": "シェーンブルン宮殿", "note": "【行き方】U3 Schweglerstraße → Westbahnhof、U6 Längenfeldgasse、U4 Schönbrunn（約20分）\n【時間】宮殿 8:30–17:00、庭園 6:30–17:30（庭園は無料）\n【券】時間指定。公式 imperialtickets.com で事前に買うと待たない。Grand Tour（皇帝・皇妃の私室まで）か、短い State Apartments\n【メモ】噴水は冬は止まっている。グロリエッテの丘まで登ると宮殿と街が見渡せる"}, "p42": {"day": "11/14", "start": "13:45", "end": "14:45", "c": "v", "title": "昼ごはん", "note": "宿に戻る途中で。Westbahnhof周辺なら店が多い"}, "p43": {"day": "11/14", "start": "15:00", "end": "16:30", "c": "v", "title": "宿で休憩", "note": "夜は立ちっぱなしなので、ここで休む"}, "p29": {"day": "11/14", "start": "17:00", "end": "18:20", "c": "v", "title": "音楽の家（Haus der Musik）", "note": "【場所】Seilerstätte 30（1区）。U3 Stephansplatz 徒歩7分（宿から約20分）\n【時間】毎日10:00–22:00\n【中】ウィーン・フィルの歴史、ベートーヴェン・モーツァルトの部屋、画面のウィーン・フィルを指揮できる「バーチャル指揮者」\n【このあと】国立歌劇場まで歩いて7分"}, "p44": {"day": "11/14", "start": "18:30", "end": "21:30", "c": "v", "title": "国立歌劇場『愛の妙薬』（立見）", "note": "【開演】19:00、終演21:30ごろ、休憩1回\n【買えなかったら】Operngasse側の立見窓口で開演80分前（17:40）から当日販売\n【代わり】19:30 楽友協会 ウィーン響／コパチンスカヤ（立見）"}, "p45": {"day": "11/15", "start": "13:00", "end": "14:30", "c": "v", "title": "昼ごはん", "note": "楽友協会の近くで。トーンキュンストラー管を立見で聴くなら14:30には並ぶ"}, "p46": {"day": "11/16", "start": "08:30", "end": "09:15", "c": "v", "title": "チェックアウト → 中央駅", "note": "【宿】早めにチェックアウト（期限11:00）\n【行き方】U3 Schweglerstraße → Westbahnhof、トラム18で中央駅（約25分）\n【荷物】中央駅のコインロッカーに預ける"}, "p47": {"day": "11/16", "start": "09:15", "end": "11:00", "c": "v", "title": "ベルヴェデーレ上宮（クリムト）", "note": "【場所】Prinz-Eugen-Straße 27（3区）。中央駅から歩いて10分\n【時間】毎日9:00–18:00\n【料金】大人€23。オンラインで時間指定券を買うと早い\n【見どころ】クリムト『接吻』『ユディト』、シーレ、ダヴィッド『アルプス越えのナポレオン』\n【このあと】11:00に出て中央駅へ。荷物を出して12:13の列車"}, "p7": {"day": "11/16", "start": "11:15", "end": "12:13", "c": "v", "title": "空港へ（12:13 中央駅発）", "note": "【荷物】中央駅のロッカーから出す\n【便】15:05 LH6335 ウィーン → フランクフルト"}});
    st.mig = "m15"; st.rev = (st.rev || 0) + 1;
    await env.TRIP.put(KEY, JSON.stringify(st));
  }
  if (st.init && st.mig === "m15") {
    Object.assign(st.plans, {"p45": {"day": "11/15", "start": "13:00", "end": "14:30", "c": "v", "title": "昼ごはん（Café Sperl）", "note": "【場所】Gumpendorfer Str. 11（6区）。11/12と同じ店\n【時間】日曜10:00–20:00\n【このあと】楽友協会まで歩いて15分。トーンキュンストラー管を立見で聴くなら14:30には並ぶ"}});
    st.mig = "m16"; st.rev = (st.rev || 0) + 1;
    await env.TRIP.put(KEY, JSON.stringify(st));
  }
  if (st.init && st.mig === "m16") {
    Object.assign(st.plans, {"p41": {"day": "11/14", "start": "11:00", "end": "12:00", "c": "v", "title": "ゆっくり準備", "note": "【12:00】宿を出る\n【立見】オンラインは10:08時点で売り切れ。戻りチケットを見張り中"}, "p20": {"day": "11/14", "start": "12:20", "end": "14:30", "c": "v", "title": "シェーンブルン宮殿", "note": "【行き方】U3 Schweglerstraße → Westbahnhof、U6 Längenfeldgasse、U4 Schönbrunn（約20分）\n【時間】宮殿 8:30–17:00（最終入場16:15）、庭園 6:30–17:30（無料）\n【券】時間指定。imperialtickets.com で事前に買うと待たない。Grand Tour（皇帝・皇妃の私室まで）か、短い State Apartments\n【メモ】噴水は冬は止まっている。グロリエッテの丘まで登ると宮殿と街が見渡せる"}, "p42": {"day": "11/14", "start": "14:45", "end": "15:45", "c": "v", "title": "昼ごはん", "note": "宿に戻る途中で。Westbahnhof周辺なら店が多い"}, "p43": {"day": "11/14", "start": "15:45", "end": "16:30", "c": "v", "title": "宿で休憩", "note": "【チケットがない場合】16:10に宿を出て、16:30から国立歌劇場の立見窓口（Operngasse側）に並ぶ。窓口は17:40から"}, "p29": {"day": "11/14", "start": "17:00", "end": "18:20", "c": "v", "title": "音楽の家（チケットが取れたら）", "note": "【場所】Seilerstätte 30（1区）。U3 Stephansplatz 徒歩7分（宿から約20分）\n【時間】毎日10:00–22:00\n【中】ウィーン・フィルの歴史、ベートーヴェン・モーツァルトの部屋、画面のウィーン・フィルを指揮できる「バーチャル指揮者」\n【このあと】国立歌劇場まで歩いて7分\n【チケットがない場合】ここは行かずに立見窓口に並ぶ"}});
    st.mig = "m17"; st.rev = (st.rev || 0) + 1;
    await env.TRIP.put(KEY, JSON.stringify(st));
  }
  if (st.init && st.mig === "m17") {
    for (const k of ["p29"]) delete st.plans[k];
    Object.assign(st.plans, {"p20": {"day": "11/14", "start": "12:20", "end": "14:00", "c": "v", "title": "シェーンブルン宮殿", "note": "【行き方】U3 Schweglerstraße → Westbahnhof、U6 Längenfeldgasse、U4 Schönbrunn（約20分）\n【時間】宮殿 8:30–17:00、庭園 6:30–17:30（無料）\n【券】時間指定。imperialtickets.com で事前に買うと待たない。短い State Apartments で十分\n【メモ】噴水は冬は止まっている"}, "p42": {"day": "11/14", "start": "14:00", "end": "14:45", "c": "v", "title": "昼ごはん（軽く）", "note": "シェーンブルン駅周辺か、移動途中のKarlsplatzで"}, "p47": {"day": "11/14", "start": "15:15", "end": "16:45", "c": "v", "title": "ベルヴェデーレ上宮（クリムト）", "note": "【行き方】U4 Schönbrunn → Karlsplatz、トラムD「Schloss Belvedere」（約25分）\n【時間】毎日9:00–18:00\n【料金】大人€23。オンラインで時間指定券を買うと早い\n【見どころ】クリムト『接吻』『ユディト』、シーレ、ダヴィッド『アルプス越えのナポレオン』\n【このあと】トラムDで国立歌劇場まで約10分"}, "p43": {"day": "11/14", "start": "17:00", "end": "18:30", "c": "v", "title": "立見窓口に並ぶ（チケットがなければ）", "note": "【場所】国立歌劇場 Operngasse側の立見窓口。17:40から販売\n【チケットが取れていたら】近くのカフェで休憩（Café Mozart、Sacherなど）"}, "p46": {"day": "11/16", "start": "10:00", "end": "11:00", "c": "v", "title": "チェックアウト", "note": "【宿】11:00までにチェックアウト\n【行き方】U3 Schweglerstraße → Westbahnhof、トラム18で中央駅（約25分）"}, "p7": {"day": "11/16", "start": "11:00", "end": "12:13", "c": "v", "title": "空港へ（12:13 中央駅発）", "note": "【便】15:05 LH6335 ウィーン → フランクフルト"}});
    st.mig = "m18"; st.rev = (st.rev || 0) + 1;
    await env.TRIP.put(KEY, JSON.stringify(st));
  }
  if (st.init && st.mig === "m18") {
    Object.assign(st.plans, {"p47": {"day": "11/14", "start": "15:15", "end": "17:15", "c": "v", "title": "ベルヴェデーレ上宮（クリムト）", "note": "【行き方】U4 Schönbrunn → Karlsplatz、トラムD「Schloss Belvedere」（約25分）\n【時間】毎日9:00–18:00\n【料金】大人€23\n【見どころ】クリムト『接吻』『ユディト』、シーレ、ダヴィッド『アルプス越えのナポレオン』\n【このあと】トラムDで国立歌劇場まで約10分"}, "p43": {"day": "11/14", "start": "17:30", "end": "18:40", "c": "v", "title": "カフェで休憩", "note": "国立歌劇場の近くで（Café Mozart、Sacherなど）。開演の15分前には劇場へ"}, "p44": {"day": "11/14", "start": "18:45", "end": "21:30", "c": "v", "title": "国立歌劇場『愛の妙薬』", "note": "【チケット】取得済み\n【開演】19:00、終演21:30ごろ、休憩1回\n【出演】ポゴレルツ、ヴォルコフ、マエストリ／指揮 シーニ\n【字幕】座席の画面で日本語が選べる"}});
    st.mig = "m19"; st.rev = (st.rev || 0) + 1;
    await env.TRIP.put(KEY, JSON.stringify(st));
  }
  if (st.init && st.mig === "m19") {
    Object.assign(st.plans, {"p43": {"day": "11/14", "start": "17:30", "end": "18:15", "c": "v", "title": "休憩（座る）", "note": "夜は立見なので、ここで座って休む。宿に戻るなら17:00にベルヴェデーレを出て30分、18:15に宿を出る。近くで済ますならオペラ座周辺のカフェ（Café Mozart、Sacherなど）"}, "p44": {"day": "11/14", "start": "18:45", "end": "21:30", "c": "v", "title": "国立歌劇場『愛の妙薬』（立見）", "note": "【チケット】立見（20番）取得済み。入口はOperngasse側の立見入口\n【開演】19:00、終演21:30ごろ、休憩1回（第1幕70分・休憩25分・第2幕50分）\n【出演】ポゴレルツ、ヴォルコフ、マエストリ／指揮 シーニ\n【字幕】手すりの画面で日本語が選べる"}});
    st.mig = "m20"; st.rev = (st.rev || 0) + 1;
    await env.TRIP.put(KEY, JSON.stringify(st));
  }
  if (st.init && st.mig === "m20") {
    Object.assign(st.plans, {"p47": {"day": "11/14", "start": "15:45", "end": "16:30", "c": "v", "title": "ベルヴェデーレの庭園（無料）", "note": "上宮は今日は売り切れ。庭園を下宮側へ下ると街並みが見える。日の入りは16:20ごろ\n【このあと】トラムD「Schloss Belvedere」→「Oper, Karlsplatz」約10分"}, "p43": {"day": "11/14", "start": "16:45", "end": "18:30", "c": "v", "title": "カフェで休憩・充電", "note": "オペラ座の周辺で座って休む（Café Mozart、Café Sacher、Café Tirolerhofなど）。スマホの充電もここで\n【別案】音楽の家（Seilerstätte 30、22:00まで、オペラ座から徒歩7分）"}, "p48": {"day": "11/16", "start": "08:30", "end": "10:15", "c": "v", "title": "ベルヴェデーレ上宮（クリムト）", "note": "【予約】9:00の時間指定枠（belvedere.at/en/tickets、€23）\n【行き方】宿から約30分（U3 → Westbahnhof、トラム18 → Quartier Belvedere）\n【このあと】宿に戻って11:00までにチェックアウト"}});
    st.mig = "m21"; st.rev = (st.rev || 0) + 1;
    await env.TRIP.put(KEY, JSON.stringify(st));
  }
  if (st.init && st.mig === "m21") {
    for (const k of ["p30", "p48"]) delete st.plans[k];
    Object.assign(st.plans, {"p39": {"day": "11/15", "start": "10:00", "end": "11:15", "c": "v", "title": "古楽器コレクション（ノイエ・ブルク）", "note": "【時間】10:00開館。時間が押したら外してよい\n【券】Neue Hofburg／Weltmuseumの共通券"}, "p45": {"day": "11/15", "start": "11:30", "end": "13:00", "c": "v", "title": "昼ごはん（Café Sperl）", "note": "【場所】Gumpendorfer Str. 11（6区）\n【時間】日曜10:00–20:00\n【このあと】ベルヴェデーレへ（トラムまたは徒歩）"}, "p47": {"day": "11/15", "start": "13:30", "end": "14:45", "c": "v", "title": "ベルヴェデーレ上宮（クリムト）", "note": "【予約済み】13:30の時間指定（注文番号 681932、€23）\n【見どころ】クリムト『接吻』『ユディト』、シーレ\n【このあと】トラムD「Schloss Belvedere」→ Karlsplatz方面で楽友協会へ（約10分）"}, "p49": {"day": "11/15", "start": "15:00", "end": "15:30", "c": "v", "title": "楽友協会へ", "note": "トーンキュンストラー管 15:30開演（指揮 ガベル、チェロ コベキナ）。席は楽友協会のサイトで（shop.musikverein.at）。立見なら最前列・柱の真後ろを避ける"}});
    st.mig = "m22"; st.rev = (st.rev || 0) + 1;
    await env.TRIP.put(KEY, JSON.stringify(st));
  }
  if (st.init && st.mig === "m22") {
    for (const k of ["p39"]) delete st.plans[k];
    Object.assign(st.plans, {"p41": {"day": "11/15", "start": "11:30", "end": "12:55", "c": "v", "title": "宿で洗濯・昼ごはん", "note": "今すぐ洗濯機を回す→昼ごはん（買い置き）→干してから出る\n【12:55】宿を出る（ベルヴェデーレまで約30分：U3 → Westbahnhof、トラム18 → Quartier Belvedere）"}, "p45": {"day": "11/15", "start": "17:45", "end": "18:40", "c": "v", "title": "Café Sperlで休憩", "note": "【場所】Gumpendorfer Str. 11。楽友協会から歩いて15分\n【時間】日曜10:00–20:00\n【このあと】国立歌劇場まで歩いて10分"}, "p50": {"day": "11/15", "start": "18:50", "end": "21:45", "c": "v", "title": "国立歌劇場『蝶々夫人』", "note": "【開演】19:00、終演21:45ごろ（第1幕55分・休憩25分・第2＋3幕85分）\n【出演】ヤホ（蝶々さん）、ゲレーロ／指揮 ビザンティ。ミンゲラ演出"}, "p51": {"day": "11/16", "start": "09:00", "end": "10:40", "c": "v", "title": "ドブリンガー（楽譜店）", "note": "【場所】Dorotheergasse 10（1区）\n【時間】月〜金9:30–18:30（日曜は休み）\n【行き方】宿から約25分。10:15に出て宿へ戻り、11:00までにチェックアウト"}});
    st.mig = "m23"; st.rev = (st.rev || 0) + 1;
    await env.TRIP.put(KEY, JSON.stringify(st));
  }
  if (st.init && st.mig === "m23") {
    delete st.plans["p33"];
    st.mig = "m24"; st.rev = (st.rev || 0) + 1;
    await env.TRIP.put(KEY, JSON.stringify(st));
  }
  if (st.init && st.mig === "m24") {
    Object.assign(st.plans, {"p41": {"day": "11/15", "start": "11:45", "end": "13:05", "c": "v", "title": "市庁舎のクリスマスマーケット＋昼ごはん", "note": "【行き方】U3 Schweglerstraße → Volkstheater、歩いて約7分（計20分）\n【時間】毎日10:00–22:00（11/13開幕）\n【昼】屋台で軽く（ソーセージ、Langos、Kartoffelpuffer など）\n【13:05】トラムD「Rathausplatz/Burgtheater」→ Hauptbahnhof方面「Schloss Belvedere」（約20分）\n【洗濯】今夜オペラ後に（乾燥機が空いていれば使う）"}});
    st.mig = "m25"; st.rev = (st.rev || 0) + 1;
    await env.TRIP.put(KEY, JSON.stringify(st));
  }
  if (st.init && st.mig === "m25") {
    Object.assign(st.plans, {"p46": {"day": "11/16", "start": "08:30", "end": "09:30", "c": "v", "title": "荷造り・チェックアウト → 中央駅", "note": "【荷造り】重いもの（楽譜・本・充電器）はリュックへ。スーツケースは23kg以内に\n【鍵】鍵ボックスに戻して閉め、暗証番号の数字をバラバラにする\n【行き方】U3 Schweglerstraße → Westbahnhof、トラム18で中央駅（約25分）\n【荷物】中央駅のコインロッカーに預ける"}, "p51": {"day": "11/16", "start": "09:50", "end": "11:10", "c": "v", "title": "Café Sperl で朝ごはん", "note": "【場所】Gumpendorfer Str. 11（6区）\n【行き方】中央駅からU1でKarlsplatz、歩いて約10分（計20分）\n【時間】月曜は朝7:00から\n【11:10】店を出て中央駅へ"}, "p7": {"day": "11/16", "start": "11:30", "end": "12:13", "c": "v", "title": "中央駅 → 空港（12:13発）", "note": "【中央駅】ロッカーから荷物を出す。駅のスーパーで会社用のお菓子（マナー、モーツァルトクーゲル）\n【列車】12:13 中央駅発 → 空港\n【便】15:05 LH6335 ウィーン → フランクフルト → NH224 羽田"}});
    st.mig = "m26"; st.rev = (st.rev || 0) + 1;
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
    const ap = url.pathname.match(/^\/art\/catalog(?:\/([a-z0-9-]+))?\/?$/);
    if (ap) {
      if (!url.pathname.endsWith("/")) return Response.redirect(`${SITE}${url.pathname}/${url.search}`, 301);
      const A = await artCatalog(env);
      if (ap[1]) { const r = await artEntryPage(env, A, ap[1]); if (r) return r; }
      else return artIndexPage(env, A, url.searchParams);
    }
    const ape = url.pathname.match(/^\/en\/art\/catalog(?:\/([a-z0-9-]+))?\/?$/);
    if (ape) {
      if (!url.pathname.endsWith("/")) return Response.redirect(`${SITE}${url.pathname}/${url.search}`, 301);
      const A = await artCatalog(env);
      if (ape[1]) { const r = await artEntryPageEn(env, A, ape[1]); if (r) return r; }
      else return artIndexPageEn(env, A, url.searchParams);
    }
    if (url.pathname === "/sitemap-art-catalog.xml") return artSitemap(env);
    // robots.txt と llms.txt はビルドが作る。目録（Worker が組むページ）の案内だけここで足す
    if (url.pathname === "/robots.txt" || url.pathname === "/llms.txt") {
      const r = await env.ASSETS.fetch(req);
      if (!r.ok) return r;
      const t = await r.text();
      const add = url.pathname === "/robots.txt" ? `Sitemap: ${SITE}/sitemap-art-catalog.xml\n`
        : `\n## Artist catalog (English)\n\n- [Artist catalog](${SITE}/en/art/catalog/): ${(await artCatalog(env)).rows.length} artists compiled from museum open data (The Met, National Gallery of Art, Cleveland Museum of Art, Art Institute of Chicago, MoMA) and Wikidata. Japanese artists include kanji names and periods. Each page: /en/art/catalog/<id>/ (Japanese: /art/catalog/<id>/).\n`;
      return new Response(t.replace(/\s*$/, "\n") + add, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
    }
    if (url.pathname === "/api" || url.pathname === "/api/") {
      const cat = await catalog(env);
      return json({ name: cat.idx.name, updated: cat.idx.updated, endpoints: ["/api/works?composer=&key=&mode=&genre=&instrument=&opusFrom=&opusTo=&yearFrom=&yearTo=&exclude=&movementKey=1&q=&includeFragments=1", "/api/works/<id>", "/mcp (POST, MCP)"], coverage: cat.idx.coverage, fields: cat.idx.fields });
    }
    return env.ASSETS.fetch(req);
  },
};
