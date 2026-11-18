#!/usr/bin/env python3
"""画家の目録の抜き取り確認：公開用 JSON の項目を、取り込んだ元データ（raw/）と突き合わせる

使い方  python3 tools/art_catalog_check.py [--n 30] [--seed 1]
確かめること（抽出・選定のコードを通さず、元ファイルを直接読む）
- 生年・没年：その数字が、その人の記録の略歴欄（MoMA は生年・没年欄）のどれかに書かれている
- 出生地・死没地：メトロポリタンの略歴欄にその文字列がある
- 作品：先頭3点と無作為の2点が、元データでその番号・題・作者（名前）で載っている。リンクの番号が元データの番号と一致する
- 「詳しく読む」：content/art/artists/<slug>.md がある
"""
import argparse, csv, json, random, re, unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data-src" / "art-catalog" / "raw"
DATA = ROOT / "veliq-academy" / "data" / "art-catalog"
csv.field_size_limit(10 ** 9)


def norm(s):
    s = unicodedata.normalize("NFKD", str(s or "").translate(str.maketrans({"ø": "o", "æ": "ae", "ß": "ss", "ł": "l", "’": "", "'": ""})))
    return re.sub(r"[^a-z0-9]+", " ", "".join(c for c in s if not unicodedata.combining(c)).lower()).strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=30)
    ap.add_argument("--seed", type=int, default=1)
    a = ap.parse_args()
    entries = {}
    for f in (DATA / "e").glob("*.json"):
        entries.update(json.loads(f.read_text(encoding="utf-8")))
    sample = random.Random(a.seed).sample(sorted(entries), min(a.n, len(entries)))
    picks = {}
    for eid in sample:
        e = entries[eid]
        ws = e["works"][:3] + random.Random(eid).sample(e["works"][3:], min(2, len(e["works"][3:])))
        picks[eid] = ws
    need = {m: {} for m in ("met", "nga", "cma", "aic")}
    for eid, ws in picks.items():
        for w in ws:
            key = {"met": lambda u: u.rsplit("/", 1)[1], "nga": lambda u: re.search(r"page\.(\d+)", u).group(1),
                   "cma": lambda u: u.rsplit("/", 1)[1], "aic": lambda u: u.rsplit("/", 1)[1]}[w["m"]](w["u"])
            need[w["m"]][key] = None
    ulans = {e["ulan"] for e in entries.values() if e["ulan"]}
    qids = {e["wikidata"] for e in entries.values() if e["wikidata"]}
    bios = {}  # ulan/qid -> 略歴の文字列
    for row in csv.DictReader(open(RAW / "met-objects.csv", encoding="utf-8-sig")):
        if row["Object ID"] in need["met"]:
            need["met"][row["Object ID"]] = (row["Title"], row["Artist Display Name"])
        for u, q, b in zip(row["Artist ULAN URL"].split("|"), row["Artist Wikidata URL"].split("|"), row["Artist Display Bio"].split("|")):
            for k in (u.rsplit("/", 1)[-1].strip(), q.rsplit("/", 1)[-1].strip()):
                if k in ulans or k in qids:
                    bios.setdefault(k, set()).add(b.strip())
    con = {r["constituentid"]: r for r in csv.DictReader(open(RAW / "nga-constituents.csv", encoding="utf-8"))}
    for r in con.values():
        for k in (r["ulanid"], r["wikidataid"]):
            if k in ulans or k in qids:
                bios.setdefault(k, set()).add(r["displaydate"])
    nga_t = {}
    for r in csv.DictReader(open(RAW / "nga-objects.csv", encoding="utf-8")):
        if r["objectid"] in need["nga"]:
            nga_t[r["objectid"]] = r["title"]
    for r in csv.DictReader(open(RAW / "nga-objects-constituents.csv", encoding="utf-8")):
        if r["objectid"] in nga_t and r["roletype"] == "artist":
            t, names = need["nga"].get(r["objectid"]) or (nga_t[r["objectid"]], "")
            need["nga"][r["objectid"]] = (t, names + "|" + con.get(r["constituentid"], {}).get("forwarddisplayname", ""))
    for a_ in json.load(open(RAW / "moma-artists.json", encoding="utf-8")):
        for k in (a_.get("Wiki QID"), str(a_.get("ULAN") or "")):
            if k and (k in ulans or k in qids):
                bios.setdefault(k, set()).add(f"{a_.get('ArtistBio')} {a_.get('BeginDate')} {a_.get('EndDate')}")
    cma_people = {}
    for o in json.load(open(RAW / "cma-data.json", encoding="utf-8")):
        names = "|".join(c.get("description") or "" for c in o.get("creators") or [])
        if o.get("accession_number") in need["cma"]:
            need["cma"][o["accession_number"]] = (o.get("title"), names)
        for c in o.get("creators") or []:
            cma_people.setdefault(norm(re.sub(r"\(.*", "", c.get("description") or "")), set()).add(c.get("description") or "")
    for line in open(RAW / "aic-artworks.jsonl", encoding="utf-8"):
        o = json.loads(line)
        if str(o["id"]) in need["aic"]:
            need["aic"][str(o["id"])] = (o.get("title"), o.get("artist_title") or "")

    ng = 0
    for eid in sample:
        e = entries[eid]
        notes = []
        texts = set()
        for k in (e["ulan"], e["wikidata"]):
            texts |= bios.get(k, set())
        texts |= cma_people.get(norm(e["nameEn"]), set())
        blob = " ".join(texts)
        for lab, y in (("生年", e["born"]), ("没年", e["died"])):
            if y and str(y) not in blob:
                notes.append(f"{lab}{y} が略歴に無い")
        for lab, pl in (("出生地", e["birthPlace"]), ("死没地", e["deathPlace"])):
            if pl and pl not in blob:
                notes.append(f"{lab}「{pl}」が略歴に無い")
        surname = norm(e["nameEn"]).split()[-1] if norm(e["nameEn"]) else ""
        for w in picks[eid]:
            key = {"met": lambda u: u.rsplit("/", 1)[1], "nga": lambda u: re.search(r"page\.(\d+)", u).group(1),
                   "cma": lambda u: u.rsplit("/", 1)[1], "aic": lambda u: u.rsplit("/", 1)[1]}[w["m"]](w["u"])
            got = need[w["m"]].get(key)
            if not got:
                notes.append(f"作品 {w['m']}:{key} が元データに無い")
                continue
            t, names = got
            title_ok = norm(w["t"]) == norm(" / ".join(x.strip() for x in (t or "").split("|") if x.strip())) or norm(w["t"]) == norm(t)
            if not title_ok:
                notes.append(f"作品 {w['m']}:{key} の題が違う（{w['t'][:30]} / {str(t)[:30]}）")
            if surname and surname not in norm(names):
                notes.append(f"作品 {w['m']}:{key} の作者名に {surname} が無い（{names[:60]}）")
        if e["tier2"] and not (ROOT / "content" / "art" / "artists" / f"{e['tier2']}.md").exists():
            notes.append("画家ページの md が無い")
        ng += bool(notes)
        print(("NG " if notes else "OK ") + f"{eid}\t{e['born']}–{e['died']}\t作品{len(picks[eid])}点を照合" + ("\t" + "；".join(notes) if notes else ""))
    print(f"{len(sample)}件中 {len(sample) - ng}件 OK")


if __name__ == "__main__":
    main()
