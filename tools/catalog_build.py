#!/usr/bin/env python3
"""Veliq 作品目録（事実だけの1作品1レコード）を作る。

入力: data-src/catalog/ の取り込み済みファイル（IMSLP の作品情報欄・Wikidata の値。取得日つき）
出力: veliq-academy/data/catalog/<composer>.json と veliq-academy/data/catalog/index.json

決まり
- 値は取り込んだ出典に書かれていることだけ。推測で埋めない（無ければ空）
- 独自の記事（data/works.json・content/）は上書きしない。対応する記事の id を articleId に持つ
- 出典が食い違うときは両方を conflicts に残す
"""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data-src" / "catalog"
OUT = ROOT / "veliq-academy" / "data" / "catalog"
FETCHED = "2026-11-08"

NOTE_JA = {"C": "ハ", "D": "ニ", "E": "ホ", "F": "ヘ", "G": "ト", "A": "イ", "B": "ロ"}
NOTE_EN = {"C": "C", "D": "D", "E": "E", "F": "F", "G": "G", "A": "A", "B": "B"}


def key_norm(code):
    """IMSLP の調の書き方（f, Eb, c#, bb）→ Veliq の形（f-minor, Eb-major, c#-minor）"""
    code = (code or "").strip()
    m = re.fullmatch(r"([A-Ga-g])(b|#)?", code)
    if not m:
        return ""
    n, acc = m.group(1), m.group(2) or ""
    minor = n.islower()
    return n.upper() if not minor else n.lower(), acc, minor


def key_id(code):
    k = key_norm(code)
    if not k:
        return ""
    n, acc, minor = k
    return f"{n}{acc}-{'minor' if minor else 'major'}"


def key_ja(code):
    k = key_norm(code)
    if not k:
        return ""
    n, acc, minor = k
    pre = {"b": "変", "#": "嬰"}.get(acc, "")
    return f"{pre}{NOTE_JA[n.upper()]}{'短調' if minor else '長調'}"


def key_en(code):
    k = key_norm(code)
    if not k:
        return ""
    n, acc, minor = k
    a = {"b": "-flat", "#": "-sharp"}.get(acc, "")
    return f"{n.upper()}{a} {'minor' if minor else 'major'}"


def strip_wiki(s):
    s = s.replace("&ndash;", "–").replace("<br>", " / ")
    s = re.sub(r"\{\{(?:half|halfd|quarter|eighth|sixteenth|whole)\|(\d+)\}\}", "", s)
    s = re.sub(r"\{\{More\}\}|\{\{MoreEnd\}\}", "", s)
    s = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]*)\]\]", r"\1", s)
    s = re.sub(r"''+", "", s)
    s = re.sub(r"\(\s*\)", "", s)
    s = re.sub(r"\s+\.(?=\s|$)", "", s)
    s = re.sub(r"\s*;\s*/\s*", " / ", s)
    s = re.sub(r"\s*-\s*/\s*", " / ", s)
    s = re.sub(r"\s+", " ", s)
    return s.strip(" ;-")


def ded_clean(s):
    s = s or ""
    if s.strip().lower() in ("", "none"):
        return ""
    s = re.sub(r"\{\{LinkDed\|([^|}]*)\|([^|}]*)(?:\|[^}]*)?\}\}", r"\1 \2", s)
    s = re.sub(r"\{\{LinkName\|t=ded\|[^|}]*\|[^|}]*\|([^}]*)\}\}", r"\1", s)
    s = re.sub(r"\s*\(\d{4}[–-]\d{4}\)", "", s)
    return strip_wiki(s)


def years(s):
    ys = re.findall(r"1[6-9]\d\d", s or "")
    m = re.match(r"\s*(1[6-9]\d\d)\s*[-–]\s*(\d{2,4})", s or "")
    if m:
        a, b = m.group(1), m.group(2)
        b = a[: 4 - len(b)] + b
        return [int(a), int(b)]
    return [int(ys[0]), int(ys[0])] if ys else []


def movements(lines):
    out = []
    for raw in lines:
        sub = raw.startswith(":")
        t = raw.lstrip(":").strip()
        keys = re.findall(r"\{\{K\|\s*([A-Ga-g][b#]?)\s*\}\}", t)
        bars = re.search(r"(\d+) bars(?: total)?", t)
        title = re.sub(r"\(\{\{K\|[^}]*\}\}[^)]*\)", "", t)
        title = re.sub(r"\{\{K\|[^}]*\}\}", "", title)
        title = re.sub(r"\(\s*\)", "", title)
        title = strip_wiki(title).rstrip(" -–(")
        title = re.sub(r"\(attacca\)", "", title).strip()
        rec = {"title": title, "key": key_id(keys[0]) if keys else "", "keys": [key_id(k) for k in dict.fromkeys(keys)]}
        if bars and "bars 1-" not in t and "bars 29-" not in t:
            rec["bars"] = int(bars.group(1))
        if sub and out:
            out[-1].setdefault("sections", []).append(rec)
        else:
            rec["number"] = len(out) + 1
            out.append(rec)
    for m in out:
        if not m["keys"] or m["keys"] == [m["key"]]:
            m.pop("keys", None)
    return out


def minutes(s):
    m = re.match(r"\s*(\d+)(?:\s*-\s*(\d+))?\s*minutes", s or "")
    if not m:
        return None
    return [int(m.group(1)), int(m.group(2) or m.group(1))]


def first_perf(s):
    if not s:
        return None
    s = strip_wiki(s.split("\n")[0])
    m = re.match(r"(\d{4})[-/](\d{2})(?:[-/](\d{2}))?\*?\s+in\s+([^,]+),?\s*(.*)", s)
    if not m:
        return {"text": strip_wiki(s)}
    date = "-".join(x for x in m.groups()[:3] if x)
    venue = m.group(5).strip() if m.group(5) else ""
    return {"date": date, "place": m.group(4).strip(), "venue": venue}


NUM_JA = {"piano-sonata": "ピアノ・ソナタ", "symphony": "交響曲"}
ALT_JA = {  # IMSLP の Alternative Title に書かれている通称の、日本で通っている表記
    "Pathétique": "悲愴", "Moonlight Sonata": "月光", "Pastoral": "田園", "The Tempest": "テンペスト",
    "Waldstein sonata": "ワルトシュタイン", "Appassionata": "熱情", "Les Adieux/Das Lebewohl": "告別",
    "Hammerklavier, Große Sonate für das Hammerklavier": "ハンマークラヴィーア", "Eroica": "英雄", "Choral": "合唱",
    "The Hunt": "狩", "À Thérèse": "テレーゼ", "Cuckoo ; Sonatina alla Tedesca": "かっこう",
}
ARTICLE = {  # 既存の Veliq 記事（data/works.json の id）
    ("piano-sonata", 8): "beethoven-pathetique", ("piano-sonata", 14): "beethoven-moonlight",
    ("piano-sonata", 32): "beethoven-sonata-op111", ("symphony", 3): "beethoven-symphony-3",
    ("symphony", 5): "beethoven-symphony-5", ("symphony", 9): "beethoven-symphony-9",
}


def opus_ja(op):
    m = re.match(r"Op\.(\d+)([a-z]?)(?: No\.(\d+))?", op)
    if not m:
        return op
    return f"作品{m.group(1)}{m.group(2)}" + (f"-{m.group(3)}" if m.group(3) else "")


def build_beethoven():
    wd = {}
    for line in (SRC / "wikidata-beethoven.psv").read_text().splitlines():
        q, en, ja, key, inc, pub, imslp, mb, cats = (line.split("|") + [""] * 9)[:9]
        wd[imslp.replace("_", " ")] = {"qid": q, "key": key, "inc": inc[:4], "pub": pub[:4], "mb": mb}
    im = json.loads((SRC / "imslp-beethoven.json").read_text())
    recs = []
    for r in im:
        genre = "piano-sonata" if r["title"].startswith("Piano Sonata") else "symphony"
        no = int(re.search(r"No\.(\d+)", r["title"]).group(1))
        kcode = re.search(r"\{\{[Kk]ey\|([^}]*)\}\}", r["key"]).group(1)
        w = wd.get(r["page"], {})
        nick_src = r["alt"].split(" ; ")[-1] if r["alt"] else ""
        nick = ALT_JA.get(r["alt"]) or ALT_JA.get(nick_src) or ""
        alt = [a.strip() for a in re.split(r"\s*;\s*", r["alt"].strip("()")) if a.strip()]
        op = r["op"]
        rid = "beethoven-" + re.sub(r"[^a-z0-9]+", "-", op.lower().replace("op.", "op").replace(" no.", "-")).strip("-")
        title_ja = f"{NUM_JA[genre]}第{no}番 {key_ja(kcode)} {opus_ja(op)}" + (f"《{nick}》" if nick else "")
        title_en = f"{'Piano Sonata' if genre == 'piano-sonata' else 'Symphony'} No. {no} in {key_en(kcode)}, {op.replace('Op.', 'Op. ').replace(' No.', ', No. ')}"
        comp = years(r["comp"])
        pub = years(r["pub"])
        conflicts = []
        if w.get("key") and w["key"] != key_en(kcode).replace("-flat", "-flat").replace(" ", " "):
            if w["key"].replace("-", " ").lower() != key_en(kcode).replace("-", " ").lower():
                conflicts.append({"field": "key", "imslp": key_id(kcode), "wikidata": w["key"]})
        if w.get("pub") and pub and int(w["pub"]) != pub[0]:
            conflicts.append({"field": "firstPublished", "imslp": pub[0], "wikidata": int(w["pub"])})
        inst = {"piano": ["ピアノ"], "orchestra": ["管弦楽"]}.get(r["inst"])
        if r["inst"].startswith("soprano"):
            inst = ["ソプラノ", "アルト", "テノール", "バス", "混声合唱", "管弦楽"]
        rec = {
            "id": rid,
            "composer": "beethoven",
            "genre": genre,
            "number": no,
            "catalog": {"opus": op},
            "titleJa": title_ja,
            "titleEn": title_en,
            "nicknames": alt,
            "nicknameJa": nick,
            "key": key_id(kcode),
            "keyJa": key_ja(kcode),
            "instrumentation": inst or [r["inst"]],
            "movements": movements(r["mv"]),
            "composed": comp,
            "firstPublished": pub[0] if pub else None,
            "firstPerformance": first_perf(r["first"]),
            "dedication": ded_clean(r["ded"]),
            "durationMin": minutes(r["dur"]),
            "articleId": ARTICLE.get((genre, no), ""),
            "ids": {"wikidata": w.get("qid", ""), "imslp": r["page"].replace(" ", "_"), "musicbrainz": w.get("mb", "")},
            "sources": [
                {"name": "IMSLP", "url": "https://imslp.org/wiki/" + r["page"].replace(" ", "_"), "fields": "調・作品番号・楽章・作曲年・初版・初演・献呈・平均演奏時間", "fetched": FETCHED},
                {"name": "Wikidata", "url": f"https://www.wikidata.org/wiki/{w.get('qid', '')}", "fields": "ID の照合・調（P826）", "fetched": FETCHED},
            ],
        }
        if w.get("inc") and comp and not (comp[0] <= int(w["inc"]) <= comp[1]):
            conflicts.append({"field": "composed", "imslp": comp, "wikidata": int(w["inc"])})
        if conflicts:
            rec["conflicts"] = conflicts
        recs.append(rec)
    recs.sort(key=lambda x: (x["genre"] != "symphony", x["number"]))
    return recs


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    recs = build_beethoven()
    (OUT / "beethoven.json").write_text(json.dumps(recs, ensure_ascii=False, indent=1) + "\n")
    idx = {
        "name": "Veliq 作品目録",
        "updated": FETCHED,
        "license": "事実データ。出典は各レコードの sources",
        "fields": "id, composer, genre, number, catalog.opus, titleJa, titleEn, nicknames, key（例 Eb-major, c#-minor）, keyJa, instrumentation, movements[number,title,key,bars,sections], composed[from,to], firstPublished, firstPerformance, dedication, durationMin[min,max], articleId, ids{wikidata,imslp,musicbrainz}, sources",
        "files": [{"composer": "beethoven", "url": "https://veliq-academy.com/data/catalog/beethoven.json", "count": len(recs)}],
        "coverage": [
            {"composer": "beethoven", "genre": "piano-sonata", "complete": True, "count": sum(r["genre"] == "piano-sonata" for r in recs),
             "scope": "作品番号の付いたピアノ・ソナタ第1〜32番。作品番号の無いソナタ（WoO 47 など）は含まない"},
            {"composer": "beethoven", "genre": "symphony", "complete": True, "count": sum(r["genre"] == "symphony" for r in recs),
             "scope": "交響曲第1〜9番"},
        ],
    }
    (OUT / "index.json").write_text(json.dumps(idx, ensure_ascii=False, indent=1) + "\n")
    bad = [r["id"] for r in recs if not r["key"] or not r["movements"]]
    print(len(recs), "件", "欠け:", bad, "食い違い:", [(r["id"], r["conflicts"]) for r in recs if r.get("conflicts")])


if __name__ == "__main__":
    main()
