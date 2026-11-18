#!/usr/bin/env python3
"""画家の目録（/art/catalog/）の元データを取り込む

美術館が自分で公開しているオープンデータ（GitHub の公式リポジトリ）をそのまま落とすだけ。解釈・整形は
tools/art_catalog_extract.py と tools/art_catalog_build.py で行う。

出力
- data-src/art-catalog/raw/<file>       取ったままのファイル（大きいので git には入れない）
- data-src/art-catalog/sources.json     どこから・いつ・何バイト取ったか（git に入れる）

使い方
  python3 tools/art_catalog_fetch.py            # 無いファイルだけ取る
  python3 tools/art_catalog_fetch.py --refresh  # 全部取り直す（月に1回くらい）

作業環境から各館の API（collectionapi.metmuseum.org・api.artic.edu など）と Wikidata・Getty には届かない
（2026-11-18 時点。プロキシで拒否）。届くのは raw.githubusercontent.com / media.githubusercontent.com だけなので、
各館が GitHub に置いている一括データを使う。Wikidata の日本語ラベル・流派・師弟は
tools/art_catalog_wikidata.py（Wikidata に届く環境で動かす）で足す。
"""
import datetime, hashlib, json, sys, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data-src" / "art-catalog" / "raw"
LOG = ROOT / "data-src" / "art-catalog" / "sources.json"
UA = "VeliqArtCatalog/0.1 (https://veliq-academy.com)"

# file, url, 出典名, ライセンス, 公式ページ
SOURCES = [
    ("met-objects.csv", "https://media.githubusercontent.com/media/metmuseum/openaccess/master/MetObjects.csv",
     "The Metropolitan Museum of Art Open Access", "CC0 1.0", "https://github.com/metmuseum/openaccess"),
    ("cma-data.json", "https://media.githubusercontent.com/media/ClevelandMuseumArt/openaccess/master/data.json",
     "The Cleveland Museum of Art Open Access", "CC0 1.0", "https://github.com/ClevelandMuseumArt/openaccess"),
    ("nga-constituents.csv", "https://raw.githubusercontent.com/NationalGalleryOfArt/opendata/main/data/constituents.csv",
     "National Gallery of Art Open Data", "CC0 1.0", "https://github.com/NationalGalleryOfArt/opendata"),
    ("nga-objects.csv", "https://raw.githubusercontent.com/NationalGalleryOfArt/opendata/main/data/objects.csv",
     "National Gallery of Art Open Data", "CC0 1.0", "https://github.com/NationalGalleryOfArt/opendata"),
    ("nga-objects-constituents.csv", "https://raw.githubusercontent.com/NationalGalleryOfArt/opendata/main/data/objects_constituents.csv",
     "National Gallery of Art Open Data", "CC0 1.0", "https://github.com/NationalGalleryOfArt/opendata"),
    ("aic-artworks.jsonl", "https://raw.githubusercontent.com/art-institute-of-chicago/api-data/master/getting-started/allArtworks.jsonl",
     "Art Institute of Chicago API data", "CC0 1.0（データ）", "https://github.com/art-institute-of-chicago/api-data"),
    ("moma-artists.json", "https://media.githubusercontent.com/media/MuseumofModernArt/collection/main/Artists.json",
     "The Museum of Modern Art Collection", "CC0 1.0", "https://github.com/MuseumofModernArt/collection"),
]


def sha(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def main():
    refresh = "--refresh" in sys.argv
    RAW.mkdir(parents=True, exist_ok=True)
    log = json.loads(LOG.read_text(encoding="utf-8")) if LOG.exists() else {}
    for fn, url, name, lic, home in SOURCES:
        p = RAW / fn
        if refresh or not p.exists():
            print("get", url, flush=True)
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=1800) as r, open(p, "wb") as f:
                while True:
                    b = r.read(1 << 20)
                    if not b:
                        break
                    f.write(b)
            if p.stat().st_size < 1000 and p.read_bytes().startswith(b"version https://git-lfs"):
                sys.exit(f"{fn}: LFS のポインタしか取れませんでした（{url}）")
            log[fn] = {"retrieved": datetime.date.today().isoformat()}
        log.setdefault(fn, {"retrieved": datetime.date.fromtimestamp(p.stat().st_mtime).isoformat()})
        log[fn].update({"url": url, "name": name, "license": lic, "home": home, "bytes": p.stat().st_size, "sha256": sha(p)})
        print(fn, log[fn]["retrieved"], log[fn]["bytes"])
    LOG.write_text(json.dumps(log, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
