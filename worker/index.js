// Veliq Academy の Worker。静的ページはそのまま返し、/api/* と /mcp だけここで答える
// - GET /api/works?composer=&key=&mode=&genre=&number=&instrument=&opusFrom=&opusTo=&yearFrom=&yearTo=&exclude=&q=&limit=
// - GET /api/works/<id>
// - POST /mcp（MCP・読み取り専用。ツール search_works / get_work）
// 作品目録は静的ファイル /data/catalog/*.json（ビルドで作る）を読む。推測で作品を足さない

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version",
};
const SITE = "https://veliq-academy.com";

let CACHE = null;
async function catalog(env) {
  if (CACHE && Date.now() - CACHE.at < 300000) return CACHE;
  const get = async (p) => (await env.ASSETS.fetch(new Request(SITE + p))).json();
  const idx = await get("/data/catalog/index.json");
  const works = [];
  const parts = await Promise.all(idx.files.map((f) => get(new URL(f.url).pathname)));
  for (const ws of parts) works.push(...ws);
  let composers = [];
  try { composers = await get("/data/composers.json"); } catch (_) { /* 無くても検索はできる */ }
  CACHE = { at: Date.now(), idx, works, composers };
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
  symphony: "orchestral", "symphonic-poem": "orchestral", overture: "orchestral", "piano-concerto": "orchestral", "violin-concerto": "orchestral",
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

function search(cat, p) {
  const key = parseKey(p.key);
  const mode = modeOf(p.mode) || (p.key && !key ? modeOf(p.key) : null);
  const genre = genreOf(p.genre);
  const comps = composerIds(p.composer, cat.composers);
  const excl = composerIds(p.exclude, cat.composers);
  const inst = p.instrument ? String(p.instrument).toLowerCase() : null;
  const anyMov = p.movementKey === "1" || p.movementKey === true;
  const num = (v) => (v === undefined || v === null || v === "" ? null : +v);
  const of = num(p.opusFrom), ot = num(p.opusTo), yf = num(p.yearFrom), yt = num(p.yearTo), nb = num(p.number);
  const q = p.q ? String(p.q).toLowerCase() : null;
  const lim = Math.min(Math.max(num(p.limit) || 100, 1), 500);
  const out = [];
  for (const w of cat.works) {
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
    if (q && ![w.titleJa, w.titleEn, w.nicknameJa, ...(w.nicknames || []), ...(w.aliases || [])].some((x) => (x || "").toLowerCase().includes(q))) continue;
    out.push(enh ? { ...w, matchedEnharmonic: true } : w);
  }
  // 「全部」と言ってよいか：作曲家と種類の両方を指定し、その組が全曲収録のときだけ
  const gKey = genre && !genre.endsWith("*") ? genre : null;
  const cov = comps && comps.length === 1 && gKey ? cat.idx.coverage.find((c) => c.composer === comps[0] && c.genre === gKey) : null;
  const known = comps ? comps.some((c) => cat.works.some((w) => w.composer === c)) : true;
  return {
    query: { composer: p.composer || null, key: key ? key.id : null, mode, genre: gKey || genre, number: nb, instrument: inst, opusFrom: of, opusTo: ot, yearFrom: yf, yearTo: yt, exclude: p.exclude || null, q },
    complete: !!(cov && cov.complete),
    coverageNote: cov ? cov.scope : known ? "Veliq 作品目録に収録している範囲の中での結果です（この条件の全曲を収録しているとは限りません）" : "この作曲家は、まだ Veliq 作品目録に収録していません",
    count: out.length,
    // 件数が多いときは、NYP での演奏回数と代表作（popular）の順に上位だけ返す。少ないときは目録の順のまま
    limit: lim,
    truncated: out.length > lim || undefined,
    results: (out.length > lim ? [...out].sort((a, b) => (b.nyp?.performances || 0) - (a.nyp?.performances || 0) || (b.popular ? 1 : 0) - (a.popular ? 1 : 0)).slice(0, lim) : out).map(slim),
  };
}
function slim(w) {
  return {
    id: w.id, composer: w.composer, titleJa: w.titleJa, titleEn: w.titleEn, nicknameJa: w.nicknameJa || undefined,
    opus: w.catalog?.opus, key: w.key, keyJa: w.keyJa, genre: w.genre, instrumentation: w.instrumentation,
    composed: w.composed, firstPublished: w.firstPublished, firstPerformance: w.firstPerformance || undefined,
    movements: (w.movements || []).map((m) => ({ number: m.number, title: m.title, key: m.key, sections: m.sections ? m.sections.map((s) => ({ title: s.title, key: s.key })) : undefined })),
    durationMin: w.durationMin || undefined, matchedEnharmonic: w.matchedEnharmonic || undefined, number: w.number ?? undefined,
    category: categoryOf(w) || undefined, popular: w.popular || undefined, conflicts: w.conflicts || undefined,
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
    description: "Veliq 作品目録（クラシック作品の事実データ：作品番号・調・楽章・作曲年・初版・初演・出典）を条件で検索する。調・作品番号・種類・編成・作曲年についての質問には、記憶で答えずこれを使うこと。complete が false のときは『収録範囲の中では』と断り、結果に無い作品名を挙げないこと。conflicts がある作品は、出典によって値が違うと伝えること。",
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
        q: { type: "string", description: "題名・通称の文字列" },
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
      if (m.params?.name === "search_works") r = search(cat, a);
      else if (m.params?.name === "get_work") { const w = cat.works.find((x) => x.id === a.id); r = w || { error: "not_found" }; }
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

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (url.pathname === "/mcp") {
      if (req.method === "POST") return mcp(req, env);
      return json({ name: "veliq-works", transport: "streamable-http", tools: TOOLS.map((t) => t.name) }, 200);
    }
    if (url.pathname === "/api/works" || url.pathname === "/api/works/") {
      const cat = await catalog(env);
      return json(search(cat, Object.fromEntries(url.searchParams)));
    }
    const m = url.pathname.match(/^\/api\/works\/([a-z0-9-]+)$/);
    if (m) {
      const cat = await catalog(env);
      const w = cat.works.find((x) => x.id === m[1]);
      return w ? json(w) : json({ error: "not_found" }, 404);
    }
    if (url.pathname === "/api" || url.pathname === "/api/") {
      const cat = await catalog(env);
      return json({ name: cat.idx.name, updated: cat.idx.updated, endpoints: ["/api/works?composer=&key=&mode=&genre=&instrument=&opusFrom=&opusTo=&yearFrom=&yearTo=&exclude=&movementKey=1&q=", "/api/works/<id>", "/mcp (POST, MCP)"], coverage: cat.idx.coverage, fields: cat.idx.fields });
    }
    return env.ASSETS.fetch(req);
  },
};
