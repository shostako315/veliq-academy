#!/usr/bin/env python3
"""Veliq 作品目録の元データを取り込む（GitHub Actions で動かす。作業環境からは IMSLP・Wikidata に届かないため）

出力（data-src/catalog/raw/）
- composers.json        Academy の作曲家 → Wikidata の QID・IMSLP のカテゴリ
- wd/<id>.json          Wikidata：その作曲家の作品（P86）と調・作品番号・作曲年・ID
- imslp/<id>.jsonl      IMSLP：作品ページごとの「WORK INFO」欄（原文のまま）
- _log.txt              取得の記録

決まり：取ったものをそのまま置くだけ。解釈・整形は tools/catalog_build.py で行う
"""
import json, os, re, sys, time, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data-src" / "catalog" / "raw"
UA = "VeliqCatalog/0.2 (https://veliq-academy.com; catalog of public-domain work metadata)"
LOG = []
ONLY = [x for x in os.environ.get("ONLY", "").split(",") if x]
MAX_PAGES = int(os.environ.get("MAX_PAGES", "4000"))


def log(*a):
    s = " ".join(str(x) for x in a)
    print(s, flush=True)
    LOG.append(s)


def get(url, params=None, tries=5, accept="application/json"):
    if params:
        url += ("&" if "?" in url else "?") + urllib.parse.urlencode(params)
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": accept})
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:  # noqa
            wait = 5 * (i + 1)
            log("  retry", i + 1, type(e).__name__, str(e)[:120], "wait", wait)
            time.sleep(wait)
    return None


WD_API = "https://www.wikidata.org/w/api.php"
SPARQL = "https://query.wikidata.org/sparql"
IMSLP = "https://imslp.org/api.php"


def sparql(q):
    time.sleep(1.0)
    return get(SPARQL, {"query": q, "format": "json"}, accept="application/sparql-results+json")


def resolve_composer(c):
    """英語名と生年で Wikidata の人物を特定し、IMSLP のカテゴリ（P839）を取る"""
    name = c.get("nameEn") or ""
    born = c.get("born")
    cands = []
    for term in [name, name.split(" ")[-1] + " " + name.split(" ")[0] if " " in name else name]:
        j = get(WD_API, {"action": "wbsearchentities", "search": term, "language": "en", "type": "item", "limit": 10, "format": "json"})
        for e in (j or {}).get("search", []):
            if e["id"] not in cands:
                cands.append(e["id"])
        if cands:
            break
    if not cands:
        return None
    j = get(WD_API, {"action": "wbgetentities", "ids": "|".join(cands[:10]), "props": "claims|labels", "languages": "en|ja", "format": "json"})
    best = None
    for qid in cands[:10]:
        e = (j or {}).get("entities", {}).get(qid, {})
        cl = e.get("claims", {})
        def vals(p):
            out = []
            for s in cl.get(p, []):
                dv = s.get("mainsnak", {}).get("datavalue", {})
                out.append(dv.get("value"))
            return out
        years = []
        for v in vals("P569"):
            m = re.match(r"[+-](\d{4})", (v or {}).get("time", "") if isinstance(v, dict) else "")
            if m:
                years.append(int(m.group(1)))
        human = any(isinstance(v, dict) and v.get("id") == "Q5" for v in vals("P31"))
        if not human:
            continue
        if born and years and abs(years[0] - int(born)) > 1:
            continue
        imslp = [v for v in vals("P839") if isinstance(v, str)]
        best = {"qid": qid, "imslp": imslp[0] if imslp else "", "label": e.get("labels", {}).get("en", {}).get("value", ""),
                "labelJa": e.get("labels", {}).get("ja", {}).get("value", ""), "born": years[0] if years else None}
        break
    return best


WD_WORKS = """
SELECT ?w (SAMPLE(?en) AS ?en) (SAMPLE(?ja) AS ?ja)
  (GROUP_CONCAT(DISTINCT ?keyEn; separator="|") AS ?keys)
  (GROUP_CONCAT(DISTINCT CONCAT(?catno, "@", COALESCE(?catEn, "")); separator="|") AS ?cats)
  (SAMPLE(?inc) AS ?inc) (SAMPLE(?pub) AS ?pub) (SAMPLE(?imslp) AS ?imslp) (SAMPLE(?mb) AS ?mb)
  (GROUP_CONCAT(DISTINCT ?gEn; separator="|") AS ?genres) (GROUP_CONCAT(DISTINCT ?tEn; separator="|") AS ?types)
WHERE {
  ?w wdt:P86 wd:%s .
  OPTIONAL { ?w rdfs:label ?en FILTER(LANG(?en) = "en") }
  OPTIONAL { ?w rdfs:label ?ja FILTER(LANG(?ja) = "ja") }
  OPTIONAL { ?w wdt:P826 ?key . ?key rdfs:label ?keyEn FILTER(LANG(?keyEn) = "en") }
  OPTIONAL { ?w p:P528 ?cs . ?cs ps:P528 ?catno . OPTIONAL { ?cs pq:P972 ?cq . ?cq rdfs:label ?catEn FILTER(LANG(?catEn) = "en") } }
  OPTIONAL { ?w wdt:P571 ?inc } OPTIONAL { ?w wdt:P577 ?pub }
  OPTIONAL { ?w wdt:P839 ?imslp } OPTIONAL { ?w wdt:P435 ?mb }
  OPTIONAL { ?w wdt:P136 ?g . ?g rdfs:label ?gEn FILTER(LANG(?gEn) = "en") }
  OPTIONAL { ?w wdt:P31 ?t . ?t rdfs:label ?tEn FILTER(LANG(?tEn) = "en") }
}
GROUP BY ?w
"""


def wd_works(qid):
    j = sparql(WD_WORKS % qid)
    if not j:
        return None
    out = []
    for b in j["results"]["bindings"]:
        out.append({k: v.get("value", "") for k, v in b.items()})
    return out


def imslp_category(cat):
    titles, cont = [], {}
    while True:
        p = {"action": "query", "list": "categorymembers", "cmtitle": cat if cat.startswith("Category:") else "Category:" + cat,
             "cmlimit": "500", "cmnamespace": "0", "format": "json"}
        p.update(cont)
        j = get(IMSLP, p)
        if not j:
            break
        titles += [m["title"] for m in j.get("query", {}).get("categorymembers", [])]
        if "continue" in j:
            cont = {k: v for k, v in j["continue"].items()}
            time.sleep(0.5)
        else:
            break
    return titles


WI = re.compile(r"\|\s*\*+\s*WORK INFO\s*\*+\s*=(.*?)(?:\n\|\s*\*+\s*COMMENTS\s*\*+|\n\}\}\s*$|\Z)", re.S)


def imslp_pages(titles, fh):
    n = 0
    for i in range(0, len(titles), 50):
        batch = titles[i:i + 50]
        j = get(IMSLP, {"action": "query", "prop": "revisions", "rvprop": "content", "titles": "|".join(batch), "format": "json"})
        time.sleep(0.6)
        if not j:
            continue
        for pg in j.get("query", {}).get("pages", {}).values():
            revs = pg.get("revisions") or []
            if not revs:
                continue
            txt = revs[0].get("*") or revs[0].get("slots", {}).get("main", {}).get("*", "")
            m = WI.search(txt)
            info = m.group(1) if m else ""
            cats = re.findall(r"\[\[Category:([^\]|]+)", txt)
            fh.write(json.dumps({"page": pg.get("title"), "info": info[:12000], "cats": cats[:40], "len": len(txt)}, ensure_ascii=False) + "\n")
            n += 1
    return n


def main():
    (OUT / "wd").mkdir(parents=True, exist_ok=True)
    (OUT / "imslp").mkdir(parents=True, exist_ok=True)
    comps = json.loads((ROOT / "veliq-academy" / "data" / "composers.json").read_text())
    known = {}
    kp = OUT / "composers.json"
    if kp.exists():
        known = {c["id"]: c for c in json.loads(kp.read_text())}
    res = []
    t0 = time.time()
    for c in comps:
        cid = c["id"]
        if ONLY and cid not in ONLY:
            if cid in known:
                res.append(known[cid])
            continue
        r = known.get(cid, {}).get("qid") and known[cid] or None
        if not r or not r.get("qid"):
            w = resolve_composer(c)
            r = {"id": cid, "nameEn": c.get("nameEn"), "born": c.get("born"), **(w or {})}
        res.append(r)
        log(cid, r.get("qid"), r.get("imslp"))
        kp.write_text(json.dumps(res, ensure_ascii=False, indent=1))
        if r.get("qid"):
            ww = wd_works(r["qid"])
            if ww is not None:
                (OUT / "wd" / f"{cid}.json").write_text(json.dumps(ww, ensure_ascii=False))
                log("  wikidata", len(ww))
        if r.get("imslp"):
            ts = imslp_category(r["imslp"])[:MAX_PAGES]
            with open(OUT / "imslp" / f"{cid}.jsonl", "w") as fh:
                n = imslp_pages(ts, fh)
            log("  imslp", len(ts), "pages", n)
        log("  elapsed", int(time.time() - t0), "s")
        if time.time() - t0 > 5.3 * 3600:
            log("time budget reached")
            break
    kp.write_text(json.dumps(res, ensure_ascii=False, indent=1))
    (OUT / "_log.txt").write_text("\n".join(LOG) + "\n")


if __name__ == "__main__":
    try:
        main()
    finally:
        OUT.mkdir(parents=True, exist_ok=True)
        (OUT / "_log.txt").write_text("\n".join(LOG) + "\n")
