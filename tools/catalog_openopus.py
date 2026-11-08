#!/usr/bin/env python3
"""Open Opus（CC0）の作品データを Veliq 作品目録のレコードに変換する

入力  data-src/catalog/openopus/dump.json
      … GitHub PaulLikesToCode/openopus-data の dump.json（Open Opus API の /work/dump.json の写し。CC0）
使い方 tools/catalog_build_all.py から oo_records(cid, nameEn) を呼ぶ

決まり（catalog_build_all.py と同じ）
- 値は Open Opus の題名・副題に書かれていることだけ。推測で埋めない
- Open Opus には誤りもある（例：モーツァルト K.172 を「B major」としている。正しくは変ロ長調）。
  そのため出典を必ず残し、NYP の題名にある調と食い違うものは catalog_build_all.py 側で conflicts に残す
"""
import json, re, unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DUMP = ROOT / "data-src" / "catalog" / "openopus" / "dump.json"
SNAPSHOT = "2026-05-22"  # openopus-data の最終コミット日（95d44b8）

# Academy の id → Open Opus の complete_name（名前の綴りが違うもの）
ALIAS = {"strauss-j2": "Johann Strauss Jr"}

KEY_RX = re.compile(r"\bin ([A-G])(?:[ -](flat|sharp))? (major|minor)\b", re.I)
NO_RX = re.compile(r"\bno\.\s*(\d+)", re.I)
NICK_RX = re.compile(r"[\"“]([^\"”]+)[\"”]")


def _n(s):
    s = (s or "").replace("ł", "l").replace("Ł", "L")
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z ]", "", s).strip()


_cache = None


def _composers():
    global _cache
    if _cache is None:
        _cache = json.loads(DUMP.read_text())["composers"] if DUMP.exists() else []
    return _cache


def find_composer(cid, name_en):
    cs = _composers()
    want = _n(ALIAS.get(cid, name_en))
    for c in cs:
        if _n(c["complete_name"]) == want:
            return c
    last = want.split()[-1] if want else ""
    hits = [c for c in cs if _n(c["complete_name"]).split()[-1:] == [last]]
    return hits[0] if len(hits) == 1 else None


def norm_catalog_text(t):
    """Open Opus の表記ゆれを catalog_build_all.cat_norm が読める形にそろえる"""
    t = re.sub(r"\bBWV\.\s*", "BWV ", t)
    t = re.sub(r"\bHWV\.\s*", "HWV ", t)
    t = re.sub(r"\bRV\.\s*", "RV ", t)
    t = re.sub(r"\bWoO\.\s*", "WoO ", t)
    t = re.sub(r"\bS(\d+[a-z]?)\b", r"S.\1", t)            # Liszt: S159 → S.159
    t = re.sub(r"\bop\.\s*posth\.\s*(\d+)", r"Op. \1", t, flags=re.I)
    t = re.sub(r"\bop\.\s*", "Op. ", t, flags=re.I)
    t = re.sub(r"\bno\.\s*", "No. ", t, flags=re.I)
    t = re.sub(r"\bHob\.\s*([IVXLC]+[a-z]?)\s*[:/]\s*", r"Hob. \1:", t)
    return t


def key_code(title):
    m = KEY_RX.search(title)
    if not m:
        return ""
    n = m.group(1)
    acc = {"flat": "b", "sharp": "#"}.get((m.group(2) or "").lower(), "")
    return (n.lower() if m.group(3).lower() == "minor" else n.upper()) + acc


def oo_records(cid, name_en):
    """Open Opus の1作曲家分 → [(title, subtitle, category, cat_text, key_code, number_text, nick_en, popular)]"""
    c = find_composer(cid, name_en)
    if not c:
        return None, []
    out = []
    for w in c.get("works", []):
        t = re.sub(r"\s+", " ", w.get("title", "")).strip()
        if not t:
            continue
        nick = NICK_RX.findall(t)
        base = NICK_RX.sub("", t).strip(" ,")
        # 「第○番」は題名の頭（最初のカンマと「in 調」より前）にある no. だけ。
        # op. 27 no. 1 の no. 1 は作品番号の枝番なので使わない（夜想曲 Op.27-1 は第7番）
        head = re.split(r",| in [A-G]\b", base, maxsplit=1)[0]
        mno = NO_RX.search(head)
        out.append({
            "title": base, "subtitle": (w.get("subtitle") or "").strip(), "category": w.get("genre") or "",
            "catText": norm_catalog_text(base), "key": key_code(base),
            "no": int(mno.group(1)) if mno else None,
            "nick": nick, "popular": w.get("popular") == "1" or w.get("recommended") == "1",
        })
    return c["complete_name"], out
