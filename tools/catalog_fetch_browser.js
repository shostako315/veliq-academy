// Veliq 作品目録の元データ取り込み（ブラウザ版）
// 作業環境・GitHub Actions から IMSLP・Wikidata に届かないときに、imslp.org を開いたブラウザのコンソールで動かす。
// tools/catalog_fetch.py と同じものを取り、同じ形で書き出す（解釈・整形は catalog_build_all.py）。
// 使い方：imslp.org のページで、COMPS = [[id, nameEn, born], ...] を定義してからこのファイルを貼り付ける。
// 進み具合は window.VJ.log、終わったら VJ.download() で数個のファイルにまとめて保存する。
(() => {
  const IMSLP = "/api.php";
  const WD_API = "https://www.wikidata.org/w/api.php";
  const SPARQL = "https://query.wikidata.org/sparql";
  const MAX_PAGES = 4000;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // 前回の実行を止め、作曲家の特定結果と Wikidata は引き継ぐ（取り直しを省く）
  const prevWd = window.VJ ? window.VJ.wd : {}, prevComps = window.VJ ? window.VJ.composers : [];
  if (window.VJ) window.VJ.stop = true;
  const VJ = (window.VJ = { log: [], composers: [], wd: {}, imslp: {}, done: false, current: "", stop: false, batch: 20, conc: 4 });
  const log = (...a) => { const s = a.join(" "); VJ.log.push(s); console.log("[VJ]", s); };

  async function get(url, params, accept = "application/json") {
    const u = url + (url.includes("?") ? "&" : "?") + new URLSearchParams(params);
    for (let i = 0; i < 5; i++) {
      try {
        const r = await fetch(u, { headers: { Accept: accept }, signal: AbortSignal.timeout(150000) });  // 応答が来ない通信で止まらないように
        if (r.status === 429 || r.status >= 500) throw new Error("HTTP " + r.status);
        return await r.json();
      } catch (e) {
        log("  retry", i + 1, String(e).slice(0, 100));
        await sleep(5000 * (i + 1));
      }
    }
    return null;
  }

  async function resolveComposer(id, name, born) {
    const terms = [name];
    if (name.includes(" ")) terms.push(name.split(" ").slice(-1)[0] + " " + name.split(" ")[0]);
    let cands = [];
    for (const t of terms) {
      const j = await get(WD_API, { origin: "*", action: "wbsearchentities", search: t, language: "en", type: "item", limit: 10, format: "json" });
      for (const e of (j && j.search) || []) if (!cands.includes(e.id)) cands.push(e.id);
      if (cands.length) break;
    }
    if (!cands.length) return null;
    const j = await get(WD_API, { origin: "*", action: "wbgetentities", ids: cands.slice(0, 10).join("|"), props: "claims|labels", languages: "en|ja", format: "json" });
    for (const q of cands.slice(0, 10)) {
      const e = ((j && j.entities) || {})[q] || {};
      const cl = e.claims || {};
      const vals = (p) => (cl[p] || []).map((s) => (s.mainsnak && s.mainsnak.datavalue && s.mainsnak.datavalue.value));
      if (!vals("P31").some((v) => v && v.id === "Q5")) continue;
      const years = vals("P569").map((v) => (v && v.time ? +((v.time.match(/[+-](\d{4})/) || [])[1]) : null)).filter(Boolean);
      if (born && years.length && Math.abs(years[0] - born) > 1) continue;
      const im = vals("P839").filter((v) => typeof v === "string");
      return { qid: q, imslp: im[0] || "", label: ((e.labels || {}).en || {}).value || "", labelJa: ((e.labels || {}).ja || {}).value || "", born: years[0] || null };
    }
    return null;
  }

  const WD_WORKS = `
SELECT ?w (SAMPLE(?en) AS ?en) (SAMPLE(?ja) AS ?ja)
  (GROUP_CONCAT(DISTINCT ?keyEn; separator="|") AS ?keys)
  (GROUP_CONCAT(DISTINCT CONCAT(?catno, "@", COALESCE(?catEn, "")); separator="|") AS ?cats)
  (SAMPLE(?inc) AS ?inc) (SAMPLE(?pub) AS ?pub) (SAMPLE(?imslp) AS ?imslp) (SAMPLE(?mb) AS ?mb)
  (GROUP_CONCAT(DISTINCT ?gEn; separator="|") AS ?genres) (GROUP_CONCAT(DISTINCT ?tEn; separator="|") AS ?types)
WHERE {
  ?w wdt:P86 wd:QID .
  OPTIONAL { ?w rdfs:label ?en FILTER(LANG(?en) = "en") }
  OPTIONAL { ?w rdfs:label ?ja FILTER(LANG(?ja) = "ja") }
  OPTIONAL { ?w wdt:P826 ?key . ?key rdfs:label ?keyEn FILTER(LANG(?keyEn) = "en") }
  OPTIONAL { ?w p:P528 ?cs . ?cs ps:P528 ?catno . OPTIONAL { ?cs pq:P972 ?cq . ?cq rdfs:label ?catEn FILTER(LANG(?catEn) = "en") } }
  OPTIONAL { ?w wdt:P571 ?inc } OPTIONAL { ?w wdt:P577 ?pub }
  OPTIONAL { ?w wdt:P839 ?imslp } OPTIONAL { ?w wdt:P435 ?mb }
  OPTIONAL { ?w wdt:P136 ?g . ?g rdfs:label ?gEn FILTER(LANG(?gEn) = "en") }
  OPTIONAL { ?w wdt:P31 ?t . ?t rdfs:label ?tEn FILTER(LANG(?tEn) = "en") }
}
GROUP BY ?w`;

  async function wdWorks(qid) {
    await sleep(1000);
    const j = await get(SPARQL, { query: WD_WORKS.replace("QID", qid), format: "json" }, "application/sparql-results+json");
    if (!j) return null;
    return j.results.bindings.map((b) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value || ""])));
  }

  async function imslpCategory(cat) {
    let titles = [], cont = {};
    for (;;) {
      const j = await get(IMSLP, { action: "query", list: "categorymembers", cmtitle: cat.startsWith("Category:") ? cat : "Category:" + cat, cmlimit: 500, cmnamespace: 0, format: "json", ...cont });
      if (!j) break;
      titles = titles.concat(((j.query || {}).categorymembers || []).map((m) => m.title));
      // IMSLP は旧形式の query-continue で続きを返す（新形式の continue だけ見ると500件で打ち切られる）
      const qc = j["query-continue"] && j["query-continue"].categorymembers;
      if (j.continue) cont = j.continue; else if (qc) cont = qc; else break;
      await sleep(500);
    }
    return titles;
  }

  // IMSLP の書式は「| *****WORK INFO*****」の後に「=」が無い（2026-11 確認）。有っても無くても読む
  const WI = /\|\s*\*+\s*WORK INFO\s*\*+\s*=?([\s\S]*?)(?:\n\|\s*\*+\s*COMMENTS\s*\*+|$)/;
  // 1回の要求に件数と関係なく約3秒かかるため、VJ.conc 本を並行して送る（2026-11 実測：1件3.4秒、5件4.9秒）
  async function imslpPages(titles) {
    const out = [], chunks = [];
    for (let i = 0; i < titles.length; i += VJ.batch) chunks.push(titles.slice(i, i + VJ.batch));
    let next = 0, doneN = 0;
    const worker = async () => {
      while (next < chunks.length && !VJ.stop) {
        const ch = chunks[next++];
        const j = await get(IMSLP, { action: "query", prop: "revisions", rvprop: "content", titles: ch.join("|"), format: "json" });
        await sleep(300);
        doneN += ch.length;
        VJ.progress = [doneN, titles.length];
        if (!j) continue;
        for (const pg of Object.values((j.query || {}).pages || {})) {
          const revs = pg.revisions || [];
          if (!revs.length) continue;
          const txt = revs[0]["*"] || "";
          const m = txt.match(WI);
          const info = m ? m[1] : "";
          const cats = [...txt.matchAll(/\[\[Category:([^\]|]+)/g)].map((x) => x[1]).slice(0, 40);
          out.push({ page: pg.title, info: info.slice(0, 12000), cats, len: txt.length });
        }
      }
    };
    await Promise.all(Array.from({ length: VJ.conc }, worker));
    return out;
  }
  VJ.run = async (comps) => {
    const t0 = Date.now();
    for (const [id, nameEn, born] of comps) {
      if (VJ.stop) break;
      if (VJ.imslp[id]) continue;
      VJ.current = id;
      let r = prevComps.find((c) => c.id === id);
      if (!r) { const w = await resolveComposer(id, nameEn, born); r = { id, nameEn, born, ...(w || {}) }; }
      VJ.composers.push(r);
      log(id, r.qid || "-", r.imslp || "-");
      if (prevWd[id]) VJ.wd[id] = prevWd[id];
      else if (r.qid) {
        const ww = await wdWorks(r.qid);
        if (ww) { VJ.wd[id] = ww; log("  wikidata", ww.length); }
      }
      if (r.imslp) {
        const ts = (await imslpCategory(r.imslp)).slice(0, MAX_PAGES);
        VJ.imslp[id] = await imslpPages(ts);
        log("  imslp", ts.length, "pages", VJ.imslp[id].length, "info", VJ.imslp[id].filter((x) => x.info.length > 20).length);
      }
      log("  elapsed", Math.round((Date.now() - t0) / 1000), "s");
    }
    VJ.done = true;
    VJ.current = "";
    log("done");
  };

  VJ.status = () => ({ done: VJ.done, current: VJ.current, progress: VJ.progress, composers: VJ.composers.length,
    imslpPages: Object.values(VJ.imslp).reduce((a, b) => a + b.length, 0),
    wdWorks: Object.values(VJ.wd).reduce((a, b) => a + b.length, 0), tail: VJ.log.slice(-4) });

  // 保存：composers と Wikidata を1ファイル、IMSLP はおよそ maxMB ごとに分ける（保存ダイアログの回数を減らすため）
  VJ.files = (maxMB = 25) => {
    const files = [{ name: "veliq-raw-meta.json", body: JSON.stringify({ composers: VJ.composers, wd: VJ.wd, log: VJ.log }) }];
    let part = {}, size = 0, n = 1;
    for (const [id, pages] of Object.entries(VJ.imslp)) {
      const s = JSON.stringify(pages).length;
      if (size && size + s > maxMB * 1e6) { files.push({ name: `veliq-raw-imslp-${n++}.json`, body: JSON.stringify(part) }); part = {}; size = 0; }
      part[id] = pages; size += s;
    }
    if (size) files.push({ name: `veliq-raw-imslp-${n}.json`, body: JSON.stringify(part) });
    return files;
  };
  VJ.download = (i, maxMB = 25) => {
    const f = VJ.files(maxMB)[i];
    if (!f) return null;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([f.body], { type: "application/json" }));
    a.download = f.name;
    document.body.appendChild(a);
    a.click();
    return { name: f.name, mb: +(f.body.length / 1e6).toFixed(1) };
  };
  log("ready");
})();
