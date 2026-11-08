#!/usr/bin/env python3
"""ブラウザ版の取り込み（tools/catalog_fetch_browser.js）が保存したファイルを、data-src/catalog/raw/ の形に並べ直す

使い方  python3 tools/catalog_import_browser.py <保存したファイルのあるフォルダ>
入力    veliq-raw-meta.json（composers, wd, log）、veliq-raw-imslp-*.json（{作曲家id: [ページ...]}）
出力    raw/composers.json、raw/wd/<id>.json、raw/imslp/<id>.jsonl、raw/_log.txt（tools/catalog_fetch.py と同じ形）
"""
import json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data-src" / "catalog" / "raw"


def main(src):
    src = Path(src)
    meta = json.loads((src / "veliq-raw-meta.json").read_text(encoding="utf-8"))
    (OUT / "wd").mkdir(parents=True, exist_ok=True)
    (OUT / "imslp").mkdir(parents=True, exist_ok=True)
    (OUT / "composers.json").write_text(json.dumps(meta["composers"], ensure_ascii=False, indent=1), encoding="utf-8")
    for cid, rows in meta["wd"].items():
        (OUT / "wd" / f"{cid}.json").write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
    pages = 0
    for f in sorted(src.glob("veliq-raw-imslp-*.json")):
        for cid, rows in json.loads(f.read_text(encoding="utf-8")).items():
            with open(OUT / "imslp" / f"{cid}.jsonl", "w", encoding="utf-8") as fh:
                for r in rows:
                    fh.write(json.dumps(r, ensure_ascii=False) + "\n")
            pages += len(rows)
    (OUT / "_log.txt").write_text("\n".join(meta.get("log", [])) + "\n", encoding="utf-8")
    print(f"作曲家 {len(meta['composers'])}人／Wikidata {sum(len(v) for v in meta['wd'].values())}件／IMSLP {pages}ページ")


if __name__ == "__main__":
    main(sys.argv[1])
