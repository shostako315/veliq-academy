#!/usr/bin/env python3
"""画家の目録：Wikidata（CC0）から日本語ラベル・生没年・出生地・流派・師弟を取る

2026-11-18 時点で、この作業環境（と GitHub Actions を止めているアカウント）からは query.wikidata.org に届かない。
Wikidata に届く手元の PC で動かし、できた data-src/art-catalog/wikidata.json をコミットする。
art_catalog_build.py はこのファイルがあれば使う（無ければ使わない）。

使い方
  python3 tools/art_catalog_wikidata.py                # 目録に入っている人（index.json の QID）
  python3 tools/art_catalog_wikidata.py --candidates   # 条件を満たす人すべて（_people.json の QID。5,000人に広げる前に）

出力の形  {QID: {"ja", "en", "born", "died", "birthPlace", "deathPlace", "movements": [{qid, ja, en}],
                 "teachers": [...], "students": [...], "ulan", "retrieved"}}
build での使い方
- ja：ja-names.tsv の候補と一致すれば「確かめた表記」。候補が無ければ「日本語表記は仮」として出す
- movements・teachers・students：そのまま出す（師弟は目録に居る人ならリンク）
- born・died：所蔵館の値と並べ、食い違いを注記する
"""
import datetime, json, sys, time, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data-src" / "art-catalog" / "wikidata.json"
SPARQL = "https://query.wikidata.org/sparql"
UA = "VeliqArtCatalog/0.1 (https://veliq-academy.com)"

Q = """SELECT ?p ?ja ?en ?born ?died ?bp ?bpJa ?bpEn ?dp ?dpJa ?dpEn ?mv ?mvJa ?mvEn ?t ?tJa ?tEn ?s ?sJa ?sEn ?ulan WHERE {
  VALUES ?p { %s }
  OPTIONAL { ?p rdfs:label ?ja FILTER(lang(?ja) = "ja") }
  OPTIONAL { ?p rdfs:label ?en FILTER(lang(?en) = "en") }
  OPTIONAL { ?p wdt:P569 ?born } OPTIONAL { ?p wdt:P570 ?died } OPTIONAL { ?p wdt:P245 ?ulan }
  OPTIONAL { ?p wdt:P19 ?bp . OPTIONAL { ?bp rdfs:label ?bpJa FILTER(lang(?bpJa) = "ja") } OPTIONAL { ?bp rdfs:label ?bpEn FILTER(lang(?bpEn) = "en") } }
  OPTIONAL { ?p wdt:P20 ?dp . OPTIONAL { ?dp rdfs:label ?dpJa FILTER(lang(?dpJa) = "ja") } OPTIONAL { ?dp rdfs:label ?dpEn FILTER(lang(?dpEn) = "en") } }
  OPTIONAL { ?p wdt:P135 ?mv . OPTIONAL { ?mv rdfs:label ?mvJa FILTER(lang(?mvJa) = "ja") } OPTIONAL { ?mv rdfs:label ?mvEn FILTER(lang(?mvEn) = "en") } }
  OPTIONAL { ?p wdt:P1066 ?t . OPTIONAL { ?t rdfs:label ?tJa FILTER(lang(?tJa) = "ja") } OPTIONAL { ?t rdfs:label ?tEn FILTER(lang(?tEn) = "en") } }
  OPTIONAL { ?p wdt:P802 ?s . OPTIONAL { ?s rdfs:label ?sJa FILTER(lang(?sJa) = "ja") } OPTIONAL { ?s rdfs:label ?sEn FILTER(lang(?sEn) = "en") } }
}"""


def qids():
    if "--candidates" in sys.argv:
        people = json.loads((ROOT / "data-src" / "art-catalog" / "raw" / "_people.json").read_text(encoding="utf-8"))
        return sorted({r["qid"] for p in people for r in p["recs"] if r.get("qid")})
    idx = json.loads((ROOT / "veliq-academy" / "data" / "art-catalog" / "index.json").read_text(encoding="utf-8"))
    out = set()
    for f in (ROOT / "veliq-academy" / "data" / "art-catalog" / "e").glob("*.json"):
        out |= {e["wikidata"] for e in json.loads(f.read_text(encoding="utf-8")).values() if e.get("wikidata")}
    return sorted(out)


def run(batch):
    body = urllib.parse.urlencode({"query": Q % " ".join("wd:" + q for q in batch), "format": "json"}).encode()
    for i in range(5):
        try:
            req = urllib.request.Request(SPARQL, data=body, headers={"User-Agent": UA, "Accept": "application/sparql-results+json"})
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.loads(r.read().decode("utf-8"))["results"]["bindings"]
        except Exception as e:  # noqa
            print("  retry", i + 1, e, flush=True)
            time.sleep(10 * (i + 1))
    raise SystemExit("Wikidata に届きません")


def main():
    today = datetime.date.today().isoformat()
    out = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    ids = qids()
    v = lambda b, k: b.get(k, {}).get("value")
    yr = lambda s: int(s[:5].lstrip("+")) if s and s[:5].lstrip("+-").isdigit() else None
    for i in range(0, len(ids), 50):
        batch = ids[i:i + 50]
        print(f"{i}/{len(ids)}", flush=True)
        acc = {q: {"movements": {}, "teachers": {}, "students": {}, "born": set(), "died": set()} for q in batch}
        for b in run(batch):
            q = v(b, "p").rsplit("/", 1)[1]
            a = acc[q]
            for k in ("ja", "en", "ulan"):
                if v(b, k):
                    a[k] = v(b, k)
            for k, s in (("born", "born"), ("died", "died")):
                if yr(v(b, s)):
                    a[k].add(yr(v(b, s)))
            for k, s in (("birthPlace", "bp"), ("deathPlace", "dp")):
                if v(b, s):
                    a[k] = {"qid": v(b, s).rsplit("/", 1)[1], "ja": v(b, s + "Ja"), "en": v(b, s + "En")}
            for k, s in (("movements", "mv"), ("teachers", "t"), ("students", "s")):
                if v(b, s):
                    x = v(b, s).rsplit("/", 1)[1]
                    a[k][x] = {"qid": x, "ja": v(b, s + "Ja"), "en": v(b, s + "En")}
        for q, a in acc.items():
            for k in ("movements", "teachers", "students"):
                a[k] = list(a[k].values())
            for k in ("born", "died"):
                a[k] = sorted(a[k])
            a["retrieved"] = today
            out[q] = a
        time.sleep(1)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=0) + "\n", encoding="utf-8")
    print(len(out), "->", OUT)


if __name__ == "__main__":
    main()
