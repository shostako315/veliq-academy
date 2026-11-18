#!/usr/bin/env python3
"""画家の目録：各館のオープンデータから「人ごとの束」を作る（取り込み → 束ねる。選ぶのは art_catalog_build.py）

入力  data-src/art-catalog/raw/（tools/art_catalog_fetch.py が取ったもの）
出力  data-src/art-catalog/raw/_people.json（中間ファイル。大きいので git には入れない）

決まり
- 作品は、その人が「作者」として、但し書きなし（After・Workshop of・Attributed to などが付かない）で載っているものだけ数える
- 種類は 絵画・素描・版画 だけ（写真・工芸・書籍は数えない）。シカゴ美術館の一括データには種類が無いので「種類の記載なし」
- 人の同定：メトロポリタン・ナショナル・ギャラリー・MoMA は各館が付けた Wikidata の QID と Getty ULAN の ID で束ねる。
  クリーブランドは ID が無いので「名前（記号・アクセントを除く）＋生年＋没年」が一致する束が1つだけのときに足す。
  シカゴは名前しか無いので、名前が一致する束が1つだけのときに足す（同名の別人がいれば足さない）
- 値は書かれているまま持つ（解釈しない）。年の食い違いは build 側で出典ごとに並べる
"""
import csv, json, re, sys, unicodedata
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data-src" / "art-catalog" / "raw"
OUT = RAW / "_people.json"
csv.field_size_limit(10 ** 9)

KIND = {"painting": "絵画", "drawing": "素描", "print": "版画", "other": ""}
MAX_WORKS = 400  # 1人あたり中間ファイルに持つ作品の上限（数は別に全部数える）


def norm(s):
    s = unicodedata.normalize("NFKD", str(s or ""))
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def yr(s):
    m = re.search(r"-?\d{3,4}", str(s or ""))
    return int(m.group(0)) if m else None


class UF:
    def __init__(self):
        self.p = {}

    def find(self, x):
        self.p.setdefault(x, x)
        while self.p[x] != x:
            self.p[x] = self.p[self.p[x]]
            x = self.p[x]
        return x

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.p[max(ra, rb)] = min(ra, rb)


uf = UF()
REC = {}       # key -> 出典ごとの人の記録
WORKS = defaultdict(list)  # key -> 作品


def ids(key, qid, ulan):
    uf.find(key)
    if qid:
        uf.union(key, "qid:" + qid)
    if ulan:
        uf.union(key, "ulan:" + ulan)


def met():
    f = RAW / "met-objects.csv"
    pd = lambda s: [x.strip() for x in s.split("|")]
    n = 0
    for row in csv.DictReader(open(f, encoding="utf-8-sig")):
        cl = row["Classification"]
        kind = "painting" if cl.startswith("Paintings") else "drawing" if cl.startswith("Drawings") else "print" if cl.startswith("Prints") else None
        if not kind:
            continue
        cols = {k: pd(row[k]) for k in ("Constituent ID", "Artist Role", "Artist Prefix", "Artist Display Name", "Artist Display Bio",
                                       "Artist Nationality", "Artist Begin Date", "Artist End Date", "Artist ULAN URL", "Artist Wikidata URL")}
        for i, cid in enumerate(cols["Constituent ID"]):
            g = lambda k: cols[k][i] if i < len(cols[k]) else ""
            if not cid or g("Artist Role") not in ("Artist", "Artist and publisher") or g("Artist Prefix"):
                continue
            # Constituent ID は同じ番号が別の人に付いていることがある（例：10841 がフェルメールとファン・フェーレンダール）。
            # 人の鍵には Wikidata・ULAN の ID、無ければ名前＋略歴を使う
            q = re.search(r"Q\d+", g("Artist Wikidata URL"))
            u = re.search(r"ulan/(\d+)", g("Artist ULAN URL"))
            key = "met:" + (q.group(0) if q else "ulan" + u.group(1) if u else norm(g("Artist Display Name")) + "|" + g("Artist Display Bio"))
            if key not in REC:
                REC[key] = {"src": "met", "sid": cid, "name": g("Artist Display Name"), "bio": g("Artist Display Bio"),
                            "nat": g("Artist Nationality"), "by": yr(g("Artist Begin Date")), "dy": yr(g("Artist End Date")),
                            "qid": q.group(0) if q else None, "ulan": u.group(1) if u else None}
                ids(key, REC[key]["qid"], REC[key]["ulan"])
            title = " / ".join(x.strip() for x in row["Title"].split("|") if x.strip())
            WORKS[key].append({"m": "met", "id": row["Object ID"], "t": title, "d": row["Object Date"], "y": yr(row["Object Begin Date"]),
                               "k": kind, "u": row["Link Resource"].replace("http://", "https://"), "hl": row["Is Highlight"] == "True",
                               "per": row["Period"], "cul": row["Culture"]})
            n += 1
    print("met", n, "credits")


def nga():
    con = {r["constituentid"]: r for r in csv.DictReader(open(RAW / "nga-constituents.csv", encoding="utf-8"))}
    objs = {}
    for r in csv.DictReader(open(RAW / "nga-objects.csv", encoding="utf-8")):
        c = r["classification"]
        kind = {"Painting": "painting", "Drawing": "drawing", "Print": "print"}.get(c)
        if kind and r["accessioned"] == "1":
            objs[r["objectid"]] = (r, kind)
    n = 0
    for r in csv.DictReader(open(RAW / "nga-objects-constituents.csv", encoding="utf-8")):
        if r["roletype"] != "artist" or r["role"] not in ("artist", "painter") or r["prefix"] or r["objectid"] not in objs:
            continue
        c = con.get(r["constituentid"])
        if not c:
            continue
        key = "nga:" + r["constituentid"]
        if key not in REC:
            REC[key] = {"src": "nga", "sid": r["constituentid"], "name": c["forwarddisplayname"], "bio": c["displaydate"],
                        "nat": c["nationality"], "by": yr(c["beginyear"]), "dy": yr(c["endyear"]),
                        "qid": c["wikidataid"] or None, "ulan": c["ulanid"] or None}
            ids(key, REC[key]["qid"], REC[key]["ulan"])
        o, kind = objs[r["objectid"]]
        WORKS[key].append({"m": "nga", "id": o["objectid"], "t": o["title"], "d": o["displaydate"], "y": yr(o["beginyear"]), "k": kind,
                           "u": f"https://www.nga.gov/collection/art-object-page.{o['objectid']}.html", "hl": False})
        n += 1
    print("nga", n, "credits")


def moma():
    n = 0
    for a in json.load(open(RAW / "moma-artists.json", encoding="utf-8")):
        q, u = a.get("Wiki QID"), a.get("ULAN")
        if not (q or u):
            continue
        key = f"moma:{a['ConstituentID']}"
        REC[key] = {"src": "moma", "sid": str(a["ConstituentID"]), "name": a["DisplayName"], "bio": a.get("ArtistBio") or "",
                    "nat": a.get("Nationality") or "", "by": a.get("BeginDate") or None, "dy": a.get("EndDate") or None,
                    "qid": q, "ulan": str(u) if u else None}
        ids(key, q, REC[key]["ulan"])
        n += 1
    print("moma", n, "people (dates cross-check only)")


def variants(name):
    """「Rembrandt (Rembrandt van Rijn)」→ 全体・括弧の外・括弧の中"""
    v = {norm(name)}
    m = re.match(r"^(.*?)\s*\((.*)\)\s*$", name or "")
    if m:
        v |= {norm(m.group(1)), norm(m.group(2))}
    return {x for x in v if x}


def name_index():
    """名前＋生没年 → 束、名前 → 束（メトロポリタン・NGA・MoMA の記録から。ID のある人だけ）"""
    by_nyy, by_n = defaultdict(set), defaultdict(set)
    for k, r in REC.items():
        if r["src"] in ("met", "nga", "moma"):
            for v in variants(r["name"]):
                by_nyy[(v, r["by"], r["dy"])].add(uf.find(k))
                if r["qid"] or r["ulan"]:
                    by_n[v].add((uf.find(k), r["by"], r["dy"]))
    return by_nyy, by_n


def cma():
    data = json.load(open(RAW / "cma-data.json", encoding="utf-8"))
    by_nyy, by_n = name_index()
    n = linked = near = 0
    for o in data:
        kind = {"Painting": "painting", "Drawing": "drawing", "Print": "print"}.get(o.get("type"))
        if not kind:
            continue
        for c in o.get("creators") or []:
            if c.get("role") != "artist" or c.get("qualifier"):
                continue
            key = f"cma:{c['id']}"
            if key not in REC:
                d = c.get("description") or ""
                m = re.match(r"^(.*?)\s*\((.*)\)\s*$", d)
                name, bio = (m.group(1), m.group(2)) if m else (d, "")
                nat = bio.split(",")[0].strip() if bio else ""
                REC[key] = {"src": "cma", "sid": str(c["id"]), "name": name, "bio": bio, "nat": nat,
                            "by": yr(c.get("birth_year")), "dy": yr(c.get("death_year")),
                            "orig": c.get("name_in_original_language") or None, "qid": None, "ulan": None}
                uf.find(key)
                hit = by_nyy.get((norm(name), REC[key]["by"], REC[key]["dy"]))
                if hit and len(hit) == 1 and REC[key]["by"]:
                    uf.union(key, next(iter(hit)))
                    linked += 1
                else:
                    # 名前が同じで ID のある束が1つだけ、生没年の差がどちらも5年以内なら同じ人とみなす（差は build で注記）
                    cand = {c for c in by_n.get(norm(name), set())}
                    roots = {c[0] for c in cand}
                    b, d = REC[key]["by"], REC[key]["dy"]
                    if len(roots) == 1 and b and d and all(cb and cd and abs(cb - b) <= 5 and abs(cd - d) <= 5 for _, cb, cd in cand):
                        uf.union(key, next(iter(roots)))
                        near += 1
            cul = o.get("culture") or []
            WORKS[key].append({"m": "cma", "id": o.get("accession_number"), "t": o.get("title") or "", "to": o.get("title_in_original_language") or "",
                               "d": o.get("creation_date") or "", "y": o.get("creation_date_earliest"), "k": kind, "u": o.get("url") or "",
                               "hl": False, "per": cul[0] if cul else ""})
            n += 1
    print("cma", n, "credits;", linked, "people linked by name+years;", near, "by name + years within 5")


def aic(groups):
    """名前が一致する束が1つだけのとき足す"""
    by_n = defaultdict(set)
    for root, keys in groups.items():
        for k in keys:
            if REC[k]["src"] in ("met", "nga", "cma"):
                by_n[norm(REC[k]["name"])].add(root)
    n = 0
    for line in open(RAW / "aic-artworks.jsonl", encoding="utf-8"):
        o = json.loads(line)
        a = o.get("artist_title")
        hit = by_n.get(norm(a)) if a else None
        if not hit or len(hit) != 1:
            continue
        root = next(iter(hit))
        WORKS["aic:" + root].append({"m": "aic", "id": str(o["id"]), "t": o.get("title") or "", "d": "", "y": None, "k": "other",
                                     "u": f"https://www.artic.edu/artworks/{o['id']}", "hl": False, "dept": o.get("department_title") or ""})
        n += 1
    print("aic", n, "works matched by unique name")


def main():
    met(); nga(); moma(); cma()
    groups = defaultdict(list)
    for k in REC:
        groups[uf.find(k)].append(k)
    aic(groups)
    people = []
    for root, keys in groups.items():
        works = [w for k in keys for w in WORKS.get(k, [])] + WORKS.get("aic:" + root, [])
        if not works:
            continue
        cnt = defaultdict(int)
        for w in works:
            cnt[w["m"] + ":" + w["k"]] += 1
        order = {"painting": 0, "drawing": 1, "print": 2, "other": 3}
        works.sort(key=lambda w: (order[w["k"]], not w.get("hl"), w.get("y") or 9999, w["t"]))
        people.append({"root": root, "recs": [dict(REC[k], key=k) for k in keys], "counts": dict(cnt), "n": len(works),
                       "works": works[:MAX_WORKS]})
    people.sort(key=lambda p: -p["n"])
    OUT.write_text(json.dumps(people, ensure_ascii=False), encoding="utf-8")
    print("people", len(people), "->", OUT)


if __name__ == "__main__":
    main()
