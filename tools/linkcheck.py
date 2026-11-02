#!/usr/bin/env python3
"""記事の出典 URL が生きているかを調べ、結果を tools/linkcheck.json に書く。

対象：content/**/*.md の前付け sources と本文中の外部リンク、veliq-academy/data/composers.json の portrait
方法：HEAD → だめなら GET（リダイレクトは追う、30秒まで）。結果 {url: {"status": 200, "checked": "YYYY-MM-DD", "final": 最終URL}}
ビルド（tools/build.py）は、この結果が 200 以外の URL を参考文献から落とす。ネットワークの失敗（status "error"）は未確認として残す。
britannica.com/print/ と EBchecked/ はビルド側で無条件に落とすので、ここでは調べない。

使い方
  python3 tools/linkcheck.py            # 未確認の URL だけ調べる
  python3 tools/linkcheck.py --all      # 全部調べ直す
"""
import datetime as dt
import json
import re
import ssl
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "tools" / "linkcheck.json"
_URL = re.compile(r"https?://[^\s<>（）「」『』、。　\"')\]]+")
_BAD = re.compile(r"britannica\.com/(print/|EBchecked/)", re.I)
UA = "Mozilla/5.0 (compatible; VeliqAcademyLinkCheck/1.0; +https://veliq-academy.com/)"


def collect():
    urls = set()
    for p in (ROOT / "content").glob("**/*.md"):
        for u in _URL.findall(p.read_text(encoding="utf-8")):
            urls.add(u.rstrip(".,;)'"))
    comp = ROOT / "veliq-academy" / "data" / "composers.json"
    if comp.exists():
        for c in json.loads(comp.read_text(encoding="utf-8")):
            if c.get("portrait"):
                urls.add(c["portrait"])
    return sorted(u for u in urls if not _BAD.search(u))


def check(url):
    ctx = ssl.create_default_context()
    for method in ("HEAD", "GET"):
        req = urllib.request.Request(url, method=method, headers={"User-Agent": UA, "Accept": "*/*"})
        try:
            with urllib.request.urlopen(req, timeout=30, context=ctx) as r:
                return r.status, r.geturl()
        except urllib.error.HTTPError as e:
            if method == "HEAD" and e.code in (403, 405, 404, 501):
                continue
            return e.code, url
        except Exception as e:  # noqa
            if method == "HEAD":
                continue
            return "error", str(e)[:120]
    return "error", ""


def main():
    old = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    redo = "--all" in sys.argv
    today = dt.date.today().isoformat()
    urls = collect()
    todo = [u for u in urls if redo or u not in old or old[u].get("status") == "error"]
    print(f"URL {len(urls)}・調べる {len(todo)}")
    for i, u in enumerate(todo, 1):
        st, final = check(u)
        old[u] = {"status": st, "checked": today, "final": final}
        print(f"[{i}/{len(todo)}] {st} {u}")
    OUT.write_text(json.dumps(old, ensure_ascii=False, indent=1), encoding="utf-8")
    bad = [u for u in urls if old.get(u, {}).get("status") not in (200, "error", None)]
    print(f"200以外（参考文献から落ちる）: {len(bad)}")
    for u in bad:
        print(" ", old[u]["status"], u)


if __name__ == "__main__":
    main()
