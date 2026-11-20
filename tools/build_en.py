#!/usr/bin/env python3
"""Veliq Academy の英語版（日本の美術）を組み立てる。build.py の最後から呼ばれる。

入力
  content-en/art/artworks/<slug>.md  名品（日本の美術館にあるもの）の英語版
  content-en/art/artists/<slug>.md   日本の画家の英語版
  （slug は日本語版と同じ。日本語版は /art/<section>/<slug>/）
出力
  veliq-academy/en/art/ 以下の index.html 群、sitemap-en.xml、llms.txt への追記

英語版の本文は、日本語版の記事を英語にしたもの。日本語版に無い事実は足さない。
"""
import importlib.util as _ilu
_spec = _ilu.spec_from_file_location("vq_net", str(__import__("pathlib").Path(__file__).resolve().parent.parent / "_net" / "vq_net.py"))
_vqt = _ilu.module_from_spec(_spec); _spec.loader.exec_module(_vqt)  # 表の数字の列・スマホの段組み（2026-11-20）
import datetime as dt
import html
import json
import re
from pathlib import Path

import markdown
import yaml

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "content-en" / "art"
OUT = ROOT / "veliq-academy"
SITE = "https://veliq-academy.com"
SECTIONS = [("artworks", "Masterpieces in Japanese museums"), ("artists", "Japanese artists"), ("japan", "Essays on Japanese art")]


def esc(s):
    return html.escape(str(s or ""), quote=True)


def load():
    arts = {}
    for sec, _ in SECTIONS:
        for f in sorted((SRC / sec).glob("*.md")) if (SRC / sec).exists() else []:
            t = f.read_text(encoding="utf-8")
            m = re.match(r"^---\n(.*?)\n---\n(.*)$", t, re.S)
            if not m:
                continue
            fm = yaml.safe_load(m.group(1)) or {}
            fm["section"], fm["slug"], fm["md"] = sec, f.stem, m.group(2)
            arts[(sec, f.stem)] = fm
    return arts


def en_map():
    """日本語版のパス → 英語版のパス（build.py の hreflang 用）"""
    return {f"/art/{s}/{slug}/": f"/en/art/{s}/{slug}/" for (s, slug) in load()}


def catalog():
    """画家の目録（data/art-catalog）の id → 項目。Wikidata・ULAN を sameAs に使う"""
    out = {}
    for f in (OUT / "data" / "art-catalog" / "e").glob("*.json"):
        out.update(json.loads(f.read_text(encoding="utf-8")))
    return out


def render(md):
    md = re.sub(r"==(.+?)==", r'<mark class="hl">\1</mark>', md)
    body = markdown.markdown(md, extensions=["tables", "sane_lists"])
    # 最初の「Key points」の章は要点の箱にする
    body = re.sub(r"<h2>Key points</h2>\s*(<ul>.*?</ul>)", r'<aside class="va-key"><p class="va-key-h">Key points</p>\1</aside>', body, count=1, flags=re.S)
    body = re.sub(r"<table>", '<div class="va-tw"><table>', body).replace("</table>", "</table></div>")
    return body


def shell(title, desc, path, ja, crumbs, body, lds):
    j = "".join('<script type="application/ld+json">' + json.dumps(x, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/") + "</script>" for x in lds)
    bc_ld = {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": i + 1, "name": n, **({"item": SITE + u} if u else {})} for i, (n, u) in enumerate(crumbs)]}
    bc = '<nav class="va-bc" aria-label="Breadcrumb"><ol>' + "".join(
        f'<li><a href="{u}">{esc(n)}</a></li>' if i < len(crumbs) - 1 else f'<li><span aria-current="page">{esc(n)}</span></li>'
        for i, (n, u) in enumerate(crumbs)) + "</ol></nav>"
    alt = (f'<link rel="alternate" hreflang="en" href="{SITE}{path}"><link rel="alternate" hreflang="ja" href="{SITE}{ja}">'
           f'<link rel="alternate" hreflang="x-default" href="{SITE}{path}">') if ja else ""
    lang = f'<a href="{ja}" hreflang="ja" lang="ja">日本語</a>' if ja else ""
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{esc(title)} | Veliq Academy</title>
<meta name="description" content="{esc(desc)}">
<link rel="canonical" href="{SITE}{path}">{alt}
<meta property="og:type" content="article"><meta property="og:site_name" content="Veliq Academy"><meta property="og:title" content="{esc(title)} | Veliq Academy"><meta property="og:description" content="{esc(desc)}"><meta property="og:url" content="{SITE}{path}"><meta property="og:locale" content="en_US">
<link rel="icon" href="/favicon.ico" sizes="any"><link rel="icon" href="/veliq-mark.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="stylesheet" href="/assets/vq-ui.css?v=23">
<script type="application/ld+json">{json.dumps(bc_ld, ensure_ascii=False, separators=(",", ":"))}</script>{j}
</head>
<body>
<a class="va-skip" href="#main">Skip to content</a>
<header class="gh"><div class="wrap gh-in"><a class="brand" href="/en/art/">Veliq <b>Academy</b></a><nav class="gnav" aria-label="Language">{lang}</nav></div></header>
<main id="main" class="va-main"><div class="wrap">{bc}{body}</div></main>
<footer class="gf"><div class="wrap"><div class="gf-brand">Veliq <b>Academy</b></div>
<p class="nt"><a href="/en/art/">Japanese art</a>　<a href="/en/art/catalog/">Artist catalog</a></p>
<p class="nt">Published by VariOrchestra, a general incorporated association in Musashino, Tokyo. Editor: Eigo Sato (conductor, music director of VariOrchestra). <a href="mailto:info@variorchestra.com">info@variorchestra.com</a></p></div></footer>
</body>
</html>
"""


def meta_dl(rows):
    return "<dl class=\"va-meta\">" + "".join(f"<dt>{esc(k)}</dt><dd>{v}</dd>" for k, v in rows if v) + "</dl>"


def build():
    arts, cat = load(), catalog()
    if not arts:
        return []
    shutil_rm(OUT / "en" / "art", keep={"catalog"})
    urls = []
    artists = {slug: a for (s, slug), a in arts.items() if s == "artists"}
    works_by = {}
    for (s, slug), a in arts.items():
        if s == "artworks":
            works_by.setdefault(a.get("artist"), []).append(a)

    def artist_link(slug, fallback=""):
        a = artists.get(slug)
        return f'<a href="/en/art/artists/{slug}/">{esc(a["name"])}</a>' if a else esc(fallback)

    for (s, slug), a in sorted(arts.items()):
        path, ja = f"/en/art/{s}/{slug}/", f"/art/{s}/{slug}/"
        body = render(a["md"])
        src = "".join(f"<li>{esc(x)}</li>" for x in a.get("sources") or [])
        if s == "artworks":
            head = meta_dl([
                ("Artist", artist_link(a.get("artist"), a.get("artist_name"))),
                ("Original title", f'<span lang="ja">{esc(a.get("original"))}</span>'),
                ("Date", esc(a.get("year"))), ("Medium", esc(a.get("medium"))), ("Dimensions", esc(a.get("size"))),
                ("Collection", f'<a href="{esc(a["collection_url"])}" target="_blank" rel="noopener">{esc(a.get("collection"))}</a>' if a.get("collection_url") else esc(a.get("collection"))),
                ("Designation", esc(a.get("designation")))])
            more = [x for x in works_by.get(a.get("artist"), []) if x["slug"] != slug]
            rel = ("<h2>More by this artist</h2><ul>" + "".join(f'<li><a href="/en/art/artworks/{x["slug"]}/">{esc(x["short"])}</a></li>' for x in more) + "</ul>") if more else ""
            ce = cat.get(a.get("catalog") or "")
            ld = {"@context": "https://schema.org", "@type": "VisualArtwork", "name": a["short"], "alternateName": a.get("original"),
                  "description": a["summary"], "dateCreated": str(a.get("year") or ""), "artMedium": a.get("medium"), "inLanguage": "en", "url": SITE + path,
                  "creator": {"@type": "Person", "name": a.get("artist_name"), **({"sameAs": [f"https://www.wikidata.org/wiki/{ce['wikidata']}"]} if ce and ce.get("wikidata") else {})},
                  **({"sameAs": [a["collection_url"]]} if a.get("collection_url") else {})}
        elif s == "japan":
            head, rel, ld = "", "", None
        else:
            ce = cat.get(a.get("catalog") or "")
            head = meta_dl([("Japanese name", f'<span lang="ja">{esc(a.get("name_ja"))}</span>'), ("Dates", esc(a.get("dates"))),
                            ("Catalog entry", f'<a href="/en/art/catalog/{esc(a["catalog"])}/">Collections and works in museum open data</a>' if ce else "")])
            mine = works_by.get(slug, [])
            rel = ("<h2>Masterpieces in Japanese museums</h2><ul>" + "".join(f'<li><a href="/en/art/artworks/{x["slug"]}/">{esc(x["short"])}</a> — {esc(x.get("collection"))}</li>' for x in mine) + "</ul>") if mine else ""
            sa = [u for u in [f"https://www.wikidata.org/wiki/{ce['wikidata']}" if ce and ce.get("wikidata") else "", f"http://vocab.getty.edu/page/ulan/{ce['ulan']}" if ce and ce.get("ulan") else ""] if u]
            ld = {"@context": "https://schema.org", "@type": "Person", "name": a["name"], "alternateName": a.get("name_ja"), "description": a["summary"],
                  "url": SITE + path, "inLanguage": "en", **({"sameAs": sa} if sa else {})}
        art_ld = {"@context": "https://schema.org", "@type": "Article", "headline": a["title"], "description": a["summary"], "inLanguage": "en",
                  "dateModified": str(a.get("updated") or ""), "mainEntityOfPage": SITE + path,
                  "author": {"@type": "Person", "name": "Eigo Sato"}, "publisher": {"@type": "Organization", "name": "VariOrchestra"}}
        page = (f'<article class="va-art" lang="en"><h1>{esc(a["title"])}</h1><p class="va-lede">{esc(a["summary"])}</p>{head}{body}{rel}'
                f'<h2>Sources</h2><ul class="src">{src}</ul>'
                f'<p class="nt">Translated from the Japanese edition, which is compiled only from the sources above. <a href="{ja}" hreflang="ja" lang="ja">日本語版</a></p></article>')
        crumbs = [("Japanese art", "/en/art/"), (dict(SECTIONS)[s], f"/en/art/#{s}"), (a.get("short") or a["name"], "")]
        write(path, shell(a["title"], a["summary"], path, ja, crumbs, page, [x for x in (ld, art_ld) if x]))
        urls.append((path, ja, str(a.get("updated") or "")))

    # 入口 /en/art/
    def li(sec):
        xs = sorted([a for (s, _), a in arts.items() if s == sec], key=lambda a: a.get("sort") or a["slug"])
        if sec == "artworks":
            return "".join(f'<a href="/en/art/artworks/{a["slug"]}/">{esc(a["short"])}<small>{esc(a.get("artist_name"))} · {esc(a.get("year"))} · {esc(a.get("collection"))}</small></a>' for a in xs)
        if sec == "japan":
            return "".join(f'<a href="/en/art/japan/{a["slug"]}/">{esc(a["short"])}<small>{esc(a["summary"][:90])}…</small></a>' for a in xs)
        return "".join(f'<a href="/en/art/artists/{a["slug"]}/">{esc(a["name"])}<small><span lang="ja">{esc(a.get("name_ja"))}</span> · {esc(a.get("dates"))}</small></a>' for a in xs)
    n_w = sum(1 for (s, _) in arts if s == "artworks")
    n_a = sum(1 for (s, _) in arts if s == "artists")
    desc = f"Where to see Japanese art and Western masterpieces in Japanese museums: {n_w} works with collection, dimensions and what to look at, and {n_a} Japanese artists."
    body = (f'<article class="va-art" lang="en"><h1>Japanese art</h1><p class="va-lede">{esc(desc)} Each page is translated from the Japanese edition and cites the museums\' own records.</p>'
            f'<h2 id="artworks">{SECTIONS[0][1]}</h2><div class="rl">{li("artworks")}</div>'
            f'<h2 id="artists">{SECTIONS[1][1]}</h2><div class="rl">{li("artists")}</div>'
            + (f'<h2 id="japan">{SECTIONS[2][1]}</h2><div class="rl">{li("japan")}</div>' if any(s == "japan" for (s, _) in arts) else "") +
            f'<h2>Artist catalog</h2><p><a href="/en/art/catalog/">300 artists</a> with dates, nationality and works held in public collections, from museum open data.</p></article>')
    write("/en/art/", shell("Japanese art", desc, "/en/art/", "/art/", [("Japanese art", "")], body, []))
    urls.insert(0, ("/en/art/", "/art/", ""))

    # サイトマップ（英語版）と llms.txt への追記
    sm = "".join(f'<url><loc>{SITE}{p}</loc><xhtml:link rel="alternate" hreflang="en" href="{SITE}{p}"/><xhtml:link rel="alternate" hreflang="ja" href="{SITE}{j}"/>'
                 + (f"<lastmod>{u}</lastmod>" if u else "") + "</url>\n" for p, j, u in urls)
    (OUT / "sitemap-en.xml").write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' + sm + "</urlset>\n", encoding="utf-8")
    L = ["", "## Japanese art (English)", "",
         f"- [Japanese art]({SITE}/en/art/): {n_w} masterpieces in Japanese museums and {n_a} Japanese artists, translated from the Japanese edition. Facts cite museum records (Tokyo National Museum, Kyoto National Museum, National Museum of Western Art and others)."]
    L += [f"- [{a.get('short') or a['name']}]({SITE}/en/art/{s}/{slug}/): {a['summary']}" for (s, slug), a in sorted(arts.items())]
    with (OUT / "llms.txt").open("a", encoding="utf-8") as f:
        f.write("\n".join(L) + "\n")
    return urls


def write(path, h):
    p = OUT / path.strip("/") / "index.html"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(_vqt.fix_tables(h) if "<table" in h else h, encoding="utf-8")


def shutil_rm(d, keep=()):
    import shutil
    if not d.exists():
        return
    for x in d.iterdir():
        if x.name in keep:
            continue
        shutil.rmtree(x) if x.is_dir() else x.unlink()


if __name__ == "__main__":
    print(f"英語版 {len(build())} ページ")
