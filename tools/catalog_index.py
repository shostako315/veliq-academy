#!/usr/bin/env python3
"""作品目録の検索用の軽い索引を作る（作曲家を指定しない検索のため。Worker の処理時間・メモリを抑える）

出力: veliq-academy/data/catalog/_search/all.json      … 全作品の検索に要る項目だけ（約5MB）
      veliq-academy/data/catalog/_search/key-<0..11>-<major|minor>.json … 調ごと（作品の調・楽章の調のどちらかが一致）
catalog_build_all.py の後に実行する。目録の中身は変えない。
"""
import json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CAT = ROOT / "veliq-academy" / "data" / "catalog"
OUT = CAT / "_search"
PC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def pc_of(k):
    m = re.fullmatch(r"([A-Ga-g])(b|#)?-(major|minor)", k or "")
    if not m:
        return None
    return (PC[m.group(1).upper()] + {"b": -1, "#": 1}.get(m.group(2), 0)) % 12, m.group(3)


def row(w):
    r = {k: w[k] for k in ("id", "composer", "genre", "category", "number", "key", "instrumentation", "composed",
                           "titleJa", "titleEn", "nicknameJa", "nicknames", "popular") if w.get(k) not in (None, "", [], False)}
    if (w.get("catalog") or {}).get("opus"):
        r["catalog"] = {"opus": w["catalog"]["opus"]}
    mv = [{k: m[k] for k in ("key", "keys") if m.get(k)} for m in (w.get("movements") or [])]
    mv = [m for m in mv if m]
    if mv:
        r["movements"] = mv
    if (w.get("nyp") or {}).get("performances"):
        r["nyp"] = {"performances": w["nyp"]["performances"]}
    return r


def main():
    rows = []
    for f in sorted(CAT.glob("*.json")):
        if f.name == "index.json":
            continue
        rows += [row(w) for w in json.loads(f.read_text())]
    OUT.mkdir(exist_ok=True)
    for old in OUT.glob("*.json"):
        old.unlink()
    (OUT / "all.json").write_text(json.dumps(rows, ensure_ascii=False, separators=(",", ":")))
    shards = {}
    for r in rows:
        ks = {r.get("key")} | {m.get("key") for m in r.get("movements", [])} | {k for m in r.get("movements", []) for k in m.get("keys", [])}
        for k in {pc_of(k) for k in ks if k} - {None}:
            shards.setdefault(k, []).append(r)
    for (pc, mode), rs in shards.items():
        (OUT / f"key-{pc}-{mode}.json").write_text(json.dumps(rs, ensure_ascii=False, separators=(",", ":")))
    print(len(rows), "件", len(shards), "調", round((OUT / "all.json").stat().st_size / 1e6, 1), "MB")


if __name__ == "__main__":
    main()
