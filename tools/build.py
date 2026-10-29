#!/usr/bin/env python3
"""Veliq Academy の静的サイトを組み立てる。

入力
  veliq-academy/data/*.json         作曲家・作品・時代・概念・年表・公演
  content/music/<section>/<slug>.md 記事（YAML の前付け＋Markdown）
  ../veliq-club/quiz-bank.js         アプリの4択のテーマ（あれば）
出力
  veliq-academy/ 以下の index.html 群、sitemap.xml、llms.txt、robots.txt、assets/legacy.js

使い方
  python3 tools/build.py                 # 通常
  python3 tools/build.py --content DIR   # 記事の置き場所を変える（確認用）
"""
import argparse
import datetime as dt
import html
import json
import os
import re
import shutil
import sys
from pathlib import Path
from urllib.parse import quote

try:
    import yaml
    import markdown
except ImportError:  # pragma: no cover
    sys.exit("pip install --break-system-packages pyyaml markdown が必要です")

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "veliq-academy"
DATA = OUT / "data"
SITE = "https://veliq-academy.com"
QUIZ_BANK = ROOT.parent / "veliq-club" / "quiz-bank.js"
APP = "https://veliqclub.com/app.html"
CLUB = "https://veliqclub.com/"
VO = "https://variorchestra.com/"
CSS_V = "2"

SUPERVISOR = "佐藤瑛吾"
SUPERVISOR_ROLE = "指揮者・VariOrchestra 音楽監督"
PUBLISHER = "一般社団法人VariOrchestra"

# 分野（URL の section → 表示名）。並びは音楽学科トップの並び
SECTIONS = [
    ("works", "作品"),
    ("composers", "作曲家"),
    ("eras", "時代"),
    ("timeline", "年表"),
    ("history", "音楽史"),
    ("orchestra", "オーケストラ史"),
    ("conductors", "指揮者の歴史と役割"),
    ("instruments", "楽器"),
    ("opera", "オペラ"),
    ("early", "古楽"),
    ("theory", "楽典と理論"),
    ("concepts", "形式と概念"),
]
SEC_NAME = dict(SECTIONS)
DATA_SECTIONS = {"works", "composers", "eras", "concepts", "timeline"}
ARTICLE_SECTIONS = [s for s, _ in SECTIONS if s not in ("timeline",)]

GENRE = {"symphony": "交響曲", "concerto": "協奏曲", "piano": "ピアノ曲", "keyboard": "鍵盤曲", "chamber": "室内楽",
         "opera": "オペラ", "orchestral": "管弦楽", "vocal": "声楽", "sonata": "ソナタ", "choral": "合唱"}
TL_CAT = {"birth": "誕生", "death": "没", "premiere": "初演", "political": "政治・社会", "scientific": "科学",
          "founding": "設立", "publication": "出版", "cultural": "文化"}
CONCEPT_CAT = {"form": "形式", "genre": "ジャンル", "technique": "技法", "theory": "理論", "ensemble": "編成"}
WEEK = "月火水木金土日"

# 時代 → アプリの4択テーマ（その時代を広く扱うもの）
ERA_QUIZ = {"ancient": "m-early-chant", "renaissance": "m-early-renaissance", "baroque": "m-baroque-forms",
            "classical": "m-classical-haydn-forms", "romantic": "m-romantic-dawn",
            "modern": "m-modern-vienna-bartok", "contemporary": "m-modern-cage"}

WARN = []


def warn(msg):
    WARN.append(msg)
    print("警告:", msg, file=sys.stderr)


def esc(s):
    return html.escape(str(s if s is not None else ""), quote=True)


def jload(name):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def key_name(k):
    m = re.match(r"^([A-Ga-g])(b|#)?-(major|minor)$", str(k or ""))
    if not m:
        return "" if (not k or k == "various") else str(k)
    J = {"C": "ハ", "D": "ニ", "E": "ホ", "F": "ヘ", "G": "ト", "A": "イ", "B": "ロ"}
    return ("変" if m.group(2) == "b" else "嬰" if m.group(2) == "#" else "") + J[m.group(1).upper()] + \
        ("長調" if m.group(3) == "major" else "短調")


def jdate(s):
    try:
        d = dt.date.fromisoformat(str(s)[:10])
    except ValueError:
        return esc(s)
    return f"{d.year}年{d.month}月{d.day}日（{WEEK[d.weekday()]}）"


def norm_cat(s):
    return re.sub(r"[\s.．]", "", str(s or "")).lower()


# ---------------------------------------------------------------- データ読み込み
class Site:
    def __init__(self, content_dir):
        self.composers = jload("composers.json")
        self.works = jload("works.json")
        eras = jload("eras.json")
        self.eras = list(eras.values()) if isinstance(eras, dict) else eras
        self.eras.sort(key=lambda e: e.get("startYear", 0))
        self.concepts = jload("concepts.json")
        self.timeline = sorted(jload("timeline-events.json"), key=lambda t: t["year"])
        self.events = sorted(jload("veliq-events.json"), key=lambda e: e.get("date", ""))
        self.C = {c["id"]: c for c in self.composers}
        self.W = {w["id"]: w for w in self.works}
        self.E = {e["id"]: e for e in self.eras}
        self.K = {k["id"]: k for k in self.concepts}
        self.EV = {e["id"]: e for e in self.events}
        self.data_mtime = dt.date.fromtimestamp(max(p.stat().st_mtime for p in DATA.glob("*.json"))).isoformat()
        self.articles = self.load_articles(content_dir)
        self.quiz = self.load_quiz()
        self.pages = []  # (path, lastmod, title)

    # ---- 記事
    def load_articles(self, content_dir):
        arts = {}
        base = Path(content_dir) / "music"
        if not base.is_dir():
            return arts
        mdconv = markdown.Markdown(extensions=["tables", "sane_lists", "fenced_code"])
        for p in sorted(base.glob("*/*.md")):
            raw = p.read_text(encoding="utf-8")
            m = re.match(r"^---\s*\n(.*?)\n---\s*\n?(.*)$", raw, re.S)
            if not m:
                warn(f"{p}: 前付け（--- で囲んだ YAML）がありません。飛ばします")
                continue
            try:
                fm = yaml.safe_load(m.group(1)) or {}
            except yaml.YAMLError as e:
                warn(f"{p}: 前付けの YAML が読めません（{e}）。飛ばします")
                continue
            if not isinstance(fm, dict):
                warn(f"{p}: 前付けの形が違います。飛ばします")
                continue
            sec = str(fm.get("section") or p.parent.name)
            slug = str(fm.get("slug") or p.stem)
            if sec != p.parent.name:
                warn(f"{p}: section「{sec}」がフォルダ名と違います。フォルダ名「{p.parent.name}」を使います")
                sec = p.parent.name
            if sec not in ARTICLE_SECTIONS:
                warn(f"{p}: section「{sec}」は使えません（{', '.join(ARTICLE_SECTIONS)}）。飛ばします")
                continue
            if not re.match(r"^[a-z0-9][a-z0-9-]*$", slug):
                warn(f"{p}: slug「{slug}」は英小文字・数字・ハイフンにしてください。飛ばします")
                continue
            if not fm.get("title"):
                warn(f"{p}: title がありません。飛ばします")
                continue
            for k, v in list(fm.items()):
                if isinstance(v, (dt.date, dt.datetime)):
                    fm[k] = v.isoformat()[:10]
            mdconv.reset()
            body = mdconv.convert(m.group(2))
            body = re.sub(r"<h1>.*?</h1>\s*", "", body, flags=re.S)  # 題名は前付けから出す
            body = re.sub(r"(<table>.*?</table>)", r'<div class="va-tbl">\1</div>', body, flags=re.S)
            srcs = fm.get("sources") or []
            if isinstance(srcs, str):
                srcs = [srcs]
            fm["sources"] = [str(s) for s in srcs]
            if not fm["sources"]:
                warn(f"{p}: sources（出典）がありません")
            conc = fm.get("concert")
            fm["concert"] = [conc] if isinstance(conc, str) else list(conc or [])
            for cid in fm["concert"]:
                if cid not in self.EV:
                    warn(f"{p}: concert「{cid}」は data/veliq-events.json にありません")
            if fm.get("composer") and fm["composer"] not in self.C:
                warn(f"{p}: composer「{fm['composer']}」は data/composers.json にありません")
            fm.update(section=sec, slug=slug, html=body, file=str(p))
            arts[(sec, slug)] = fm
        return arts

    def arts_in(self, sec):
        a = [v for (s, _), v in self.articles.items() if s == sec]
        return sorted(a, key=lambda x: (str(x.get("updated", "")), x["slug"]), reverse=True)

    # ---- アプリの4択
    def load_quiz(self):
        q = {"topics": {}, "composer": {}}
        if not QUIZ_BANK.exists():
            warn(f"{QUIZ_BANK} がありません。4択への導線は出しません")
            return q
        s = QUIZ_BANK.read_text(encoding="utf-8")
        m = re.search(r"VLQ_QBANK\s*=\s*(\{.*\})\s*;?\s*$", s, re.S)
        try:
            bank = json.loads(m.group(1))
        except Exception as e:  # noqa
            warn(f"quiz-bank.js が読めません（{e}）")
            return q
        topics = [t for t in bank.get("topics", []) if t.get("field") == "music"]
        q["topics"] = {t["key"]: t for t in topics}
        for c in self.composers:
            nm = self.surname(c)
            best, best_n = None, 0
            titled = next((t["key"] for t in topics if nm in t.get("title", "")), None)
            if titled:
                q["composer"][c["id"]] = titled
                continue
            for t in topics:
                n = (t.get("title", "") + json.dumps(t.get("qs", []), ensure_ascii=False)).count(nm)
                era = self.E.get(c.get("era"), {}).get("name", "")
                if n > best_n or (n == best_n and n and era and t.get("label") in era):
                    best, best_n = t["key"], n
            if best and best_n >= 1:
                q["composer"][c["id"]] = best
        return q

    def quiz_for(self, composer_id=None, era_id=None):
        t = self.quiz["composer"].get(composer_id) if composer_id else None
        if not t and era_id:
            t = ERA_QUIZ.get(era_id)
        return self.quiz["topics"].get(t) if t else None

    # ---- 表記
    def surname(self, c):
        n = c["name"]
        if re.match(r"^[一-龥]", n):
            return n[:2]
        if c["id"] == "bartok":
            return "バルトーク"
        if c["id"] == "bach-cpe":
            return "エマヌエル"
        return re.split(r"[・]", n)[-1]

    def short(self, c):
        if not c:
            return ""
        if re.match(r"^[一-龥]", c["name"]):
            return c["name"]
        if c["id"] == "bach-cpe":
            return "C.P.E.バッハ"
        return self.surname(c)

    def life(self, c):
        b, d = c.get("born"), c.get("died")
        return f"{b}–{d}" if d else f"{b}–"


# ---------------------------------------------------------------- ページの部品
def url_of(path):
    return SITE + path


def head(title, desc, path, ld, og_type="article", noindex=False):
    full = f"{title}｜Veliq Academy" if title != "Veliq Academy" else "Veliq Academy｜音楽の作品・作曲家・時代の解説"
    lds = "".join('<script type="application/ld+json">' + json.dumps(x, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/") +
                  "</script>\n" for x in ld)
    return f"""<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{esc(full)}</title>
<meta name="description" content="{esc(desc)}">
{'<meta name="robots" content="noindex">' if noindex else f'<link rel="canonical" href="{url_of(path)}">'}
<meta property="og:type" content="{og_type}">
<meta property="og:site_name" content="Veliq Academy">
<meta property="og:title" content="{esc(full)}">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:url" content="{url_of(path)}">
<meta property="og:locale" content="ja_JP">
<meta name="twitter:card" content="summary">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 32 32%27%3E%3Crect width=%2732%27 height=%2732%27 fill=%27%23FFFFFF%27/%3E%3Ctext x=%2716%27 y=%2723%27 font-family=%27-apple-system,Helvetica,sans-serif%27 font-weight=%27700%27 font-size=%2722%27 text-anchor=%27middle%27 fill=%27%238A6A2A%27%3EV%3C/text%3E%3C/svg%3E">
<link rel="stylesheet" href="/assets/vq-ui.css?v={CSS_V}">
{lds}</head>
"""


def header(S, cur):
    nav = [("/music/works/", "作品", "works"), ("/music/composers/", "作曲家", "composers"),
           ("/music/eras/", "時代", "eras"), ("/music/timeline/", "年表", "timeline")]
    g = "".join(f'<a href="{h}"{" class=\"on\"" if c == cur else ""}>{t}</a>' for h, t, c in nav)
    g += f'<a class="pill" href="/concerts/">演奏会</a>'
    music = [("/music/", "音楽学科のトップ", "music")] + [
        (f"/music/{s}/", n, s) for s, n in SECTIONS
        if s in DATA_SECTIONS or S.arts_in(s)]
    ml = "".join(f'<a href="{h}"{" class=\"on\"" if c == cur else ""}>{esc(t)}</a>' for h, t, c in music)
    cl = "".join(f'<a href="/concerts/{esc(e["id"])}/">{esc(e["title"])}</a>' for e in S.events)
    return f"""<body>
<a class="va-skip" href="#main">本文へ</a>
<header class="gh">
  <div class="wrap gh-in">
    <a class="brand" href="/">Veliq <b>Academy</b></a>
    <nav class="gnav" aria-label="サイト内">{g}</nav>
    <button class="burger" id="navBurger" type="button" aria-expanded="false" aria-controls="navMenu" aria-label="メニュー"><span></span><span></span></button>
  </div>
</header>
<div class="menu" id="navMenu">
  <div class="mg"><div class="mh">音楽</div><div class="ml">{ml}</div></div>
  <div class="mg"><div class="mh">演奏会</div><div class="ml"><a href="/concerts/">演奏会の一覧</a>{cl}</div></div>
  <a class="mcta" href="{CLUB}">Veliq Club に入会する</a>
  <div class="mfoot">運営：{PUBLISHER}<br>監修：{SUPERVISOR}</div>
</div>
"""


def footer(S, extra_js=""):
    music = "".join(f'<a href="/music/{s}/">{esc(n)}</a>' for s, n in SECTIONS if s in DATA_SECTIONS or S.arts_in(s))
    conc = "".join(f'<a href="/concerts/{esc(e["id"])}/">{esc(e["title"])}</a>' for e in S.events)
    return f"""<footer class="gf">
  <div class="wrap">
    <div class="gf-cols">
      <div><div class="gf-brand">Veliq <b>Academy</b></div><p class="va-gfp">運営：{PUBLISHER}<br>監修：{SUPERVISOR}（{SUPERVISOR_ROLE}）</p></div>
      <div><h4>音楽</h4><a href="/music/">音楽学科のトップ</a>{music}</div>
      <div><h4>演奏会</h4><a href="/concerts/">演奏会の一覧</a>{conc}<a href="{VO}">VariOrchestra</a></div>
      <div><h4>Veliq</h4><a href="{CLUB}">Veliq Club</a><a href="https://veliq.jp/">VELIQ</a><a href="/privacy.html">プライバシーポリシー</a><a href="mailto:info@variorchestra.com">お問い合わせ</a></div>
    </div>
    <div class="gf-copy"><span>© {PUBLISHER}</span></div>
  </div>
</footer>
<script src="/assets/vq.js?v={CSS_V}" defer></script>{extra_js}
</body>
</html>
"""


def crumbs(items):
    """items: [(name, path or None)] 先頭はトップ"""
    li = []
    for i, (n, p) in enumerate(items):
        if i == len(items) - 1:
            li.append(f'<li><span aria-current="page">{esc(n)}</span></li>')
        else:
            li.append(f'<li><a href="{p}">{esc(n)}</a></li>')
    html_ = f'<nav class="va-bc" aria-label="パンくず"><ol>{"".join(li)}</ol></nav>'
    ld = {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": i + 1, "name": n, "item": url_of(p or items[-1][1] or "/")}
        for i, (n, p) in enumerate(items)]}
    return html_, ld


def article_ld(title, desc, path, modified=None, about=None):
    d = {"@context": "https://schema.org", "@type": "Article", "headline": title[:110], "description": desc,
         "inLanguage": "ja", "mainEntityOfPage": url_of(path), "url": url_of(path),
         "reviewedBy": {"@type": "Person", "name": SUPERVISOR, "jobTitle": SUPERVISOR_ROLE},
         "publisher": {"@type": "Organization", "name": PUBLISHER, "url": VO}}
    if modified:
        d["dateModified"] = modified
    if about:
        d["about"] = about
    return d


def meta_dl(rows):
    rows = [(k, v) for k, v in rows if v]
    if not rows:
        return ""
    return '<dl class="va-meta">' + "".join(f"<div><dt>{esc(k)}</dt><dd>{v}</dd></div>" for k, v in rows) + "</dl>"


def rows(items):
    """items: [(href, title, sub)] → 一覧（押せる行）"""
    if not items:
        return ""
    return '<ul class="va-list">' + "".join(
        f'<li><a href="{h}"><span><b>{esc(t)}</b>{f"<small>{esc(s)}</small>" if s else ""}</span></a></li>'
        for h, t, s in items) + "</ul>"


def sec(title, inner, cls=""):
    if not inner:
        return ""
    return f'<section class="va-sec {cls}"><h2>{esc(title)}</h2>{inner}</section>'


# ---------------------------------------------------------------- 書き出し
def write(S, path, html_, lastmod=None, title=""):
    p = OUT / path.strip("/") / "index.html" if path.endswith("/") else OUT / path.lstrip("/")
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(html_, encoding="utf-8")
    S.pages.append((path, lastmod or S.data_mtime, title))


def page(S, path, title, desc, body, ld, cur="", lastmod=None, og="article", extra_js=""):
    write(S, path, head(title, desc, path, ld, og) + header(S, cur) +
          f'<main id="main" class="va-main"><div class="wrap">{body}</div></main>\n' + footer(S, extra_js),
          lastmod, title)


# ---- 作品の情報を一つの形にまとめる
def work_view(S, wid):
    w = S.W.get(wid)
    a = S.articles.get(("works", wid))
    if not w and not a:
        return None
    v = {"id": wid, "path": f"/music/works/{wid}/", "data": w, "art": a}
    cid = (a or {}).get("composer") or (w or {}).get("composerId")
    v["composer"] = S.C.get(cid)
    v["composerId"] = cid
    v["title"] = (a or {}).get("title") or w["title"]
    v["era"] = (w or {}).get("era") or (v["composer"] or {}).get("era")
    yr = (a or {}).get("year") or (w or {}).get("year")
    v["year_str"] = str(yr).replace("-", "–") if yr else ""
    m = re.search(r"\d{4}", str(yr or ""))
    v["year_n"] = int(m.group(0)) if m else 9999
    v["key"] = (a or {}).get("key") or key_name((w or {}).get("key"))
    op = (a or {}).get("catalog") or (w or {}).get("opus")
    v["catalog"] = "" if op in (None, "various") else str(op)
    v["scoring"] = (a or {}).get("scoring") or ""
    du = (a or {}).get("duration") or ((f"約{w['duration']}分" if w and w.get("duration") else ""))
    v["duration"] = str(du)
    v["desc"] = (a or {}).get("summary") or (w or {}).get("shortDescription") or ""
    v["genre"] = GENRE.get((w or {}).get("genre"), "")
    v["updated"] = (a or {}).get("updated")
    # 演奏会
    evs = list((a or {}).get("concert") or [])
    for e in S.events:
        for it in e.get("program", []):
            if program_work(S, e, it) == wid and e["id"] not in evs:
                evs.append(e["id"])
    v["events"] = [S.EV[x] for x in evs if x in S.EV]
    return v


def all_work_ids(S):
    ids = [w["id"] for w in S.works]
    ids += [slug for (s, slug) in S.articles if s == "works" and slug not in S.W]
    return ids


def program_work(S, ev, it):
    """公演の曲目 → 作品ページの id（無ければ None）"""
    if it.get("workId") and (it["workId"] in S.W or ("works", it["workId"]) in S.articles):
        return it["workId"]
    title = norm_cat(it.get("title"))
    # 記事の前付け（concert と作品番号）で対応づける
    for (s, slug), a in S.articles.items():
        if s != "works":
            continue
        if a.get("composer") and it.get("composerId") and a["composer"] != it["composerId"]:
            continue
        cat = norm_cat(a.get("catalog"))
        if cat and re.search(re.escape(cat) + r"(?!\d)", title):
            return slug
    for w in S.works:
        if w["composerId"] != it.get("composerId"):
            continue
        cat = norm_cat(w.get("opus"))
        if cat and cat != "various" and re.search(re.escape(cat) + r"(?!\d)", title):
            return w["id"]
    return None


def ticket_url(ev):
    for k, val in ev.items():
        if isinstance(val, str) and "teket" in val and val.startswith("http"):
            return val, "チケット（teket）"
    return VO, "VariOrchestra の公演案内"


# 出典の中の URL は押せるリンクにする（外部へは新しいタブ・nofollow なし・noopener）
_URL = re.compile(r"https?://[^\s<>（）「」『』、。　]+")
def src_html(s):
    out, i = "", 0
    for m in _URL.finditer(str(s)):
        u = m.group(0).rstrip(".,;)")
        out += esc(str(s)[i:m.start()]) + f'<a href="{esc(u)}" target="_blank" rel="noopener">{esc(u)}</a>'
        i = m.start() + len(u)
    return out + esc(str(s)[i:])


# ---- 記事末尾（出典 → 監修 → 関連 → 演奏会 → 4択 → 入会）
def tail(S, path, sources, related, events, quiz):
    h = ""
    if sources:
        h += sec("出典", '<ol class="va-src">' + "".join(f"<li>{src_html(s)}</li>" for s in sources) + "</ol>")
        # 監修の表示は、出典つきで書いた記事だけ（データだけのページは未検証の文を含むため）
        h += f'<p class="va-sup">監修：{SUPERVISOR}（{SUPERVISOR_ROLE}）</p>'
    for t, items in related:
        h += sec(t, rows(items))
    if events:
        inner = ""
        for e in events:
            tu, tl = ticket_url(e)
            inner += f"""<div class="va-box"><h3>{esc(e['title'])}</h3>{meta_dl([('日付', jdate(e.get('date'))), ('会場', esc(e.get('venue'))), ('指揮', esc(e.get('conductor')))])}
<div class="va-acts"><a class="va-btn" href="{esc(tu)}">{esc(tl)}</a><a class="va-btn ln" href="/concerts/{esc(e['id'])}/">曲目と予習</a></div></div>"""
        h += sec("演奏会の案内", inner)
    if quiz:
        q = f"{APP}?quiz={quote(quiz['key'])}&from=academy&ret={quote(url_of(path), safe='')}"
        h += sec("アプリで4択に挑戦", f'<div class="va-box"><p class="va-boxp">{esc(quiz["title"])}（{esc(quiz.get("label", ""))}・{len(quiz.get("qs", []))}問）</p><div class="va-acts"><a class="va-btn" href="{esc(q)}">4択を解く</a></div></div>')
    h += sec("Veliq Club", f'<div class="va-acts"><a class="va-btn ln" href="{CLUB}">Veliq Club に入会する</a></div>')
    return h


# ---------------------------------------------------------------- 各ページ
def build_work(S, wid):
    v = work_view(S, wid)
    w, a, c = v["data"], v["art"], v["composer"]
    era = S.E.get(v["era"])
    bc, bld = crumbs([("トップ", "/"), ("音楽", "/music/"), ("作品", "/music/works/"), (v["title"], v["path"])])
    cname = f'<a href="/music/composers/{esc(c["id"])}/">{esc(c["name"])}</a>' if c else ""
    meta = meta_dl([("作曲家", cname), ("作曲年", esc(v["year_str"] + "年") if v["year_str"] else ""),
                    ("調", esc(v["key"])), ("作品番号", esc(v["catalog"])), ("編成", esc(v["scoring"])),
                    ("演奏時間", esc(v["duration"])),
                    ("ジャンル", esc(v["genre"]) if not a else ""),
                    ("時代", f'<a href="/music/eras/{esc(era["id"])}/">{esc(era["name"])}</a>' if era else "")])
    body = ""
    if a:
        body += f'<div class="va-body">{a["html"]}</div>'
    else:
        if w.get("historicalBackground"):
            body += sec("歴史的背景", f'<p>{esc(w["historicalBackground"])}</p>', "va-body")
    # 楽章（記事があるときは補助の表）
    mv = [m for m in (w or {}).get("movements", []) if (m.get("title") or m.get("description"))]
    if mv:
        many = len(w["movements"]) > 1 or w.get("genre") in ("symphony", "concerto", "chamber")
        items = ""
        for m in mv:
            lab = (f'第{m["number"]}楽章 ' if many and m.get("number") else "") + (m.get("title") or "")
            sub = "・".join(x for x in [m.get("tempo") if m.get("tempo") and m.get("tempo") != m.get("title") else "",
                                        key_name(m.get("key")), f'約{m["duration"]}分' if m.get("duration") and len(w["movements"]) > 1 or (m.get("duration") and many) else ""] if x)
            hl = "／".join(m.get("highlights") or [])
            if a:
                items += f'<tr><th>{esc(lab.strip())}</th><td>{esc(sub)}</td></tr>'
            else:
                items += f'<h3>{esc(lab.strip())}</h3>' + (f'<p class="va-note">{esc(sub)}</p>' if sub else "") + \
                    (f'<p>{esc(m["description"])}</p>' if m.get("description") else "") + \
                    (f'<p class="va-note">聴きどころ：{esc(hl)}</p>' if hl else "")
        if a:
            body += sec("楽章の一覧（データ）", f'<div class="va-tbl"><table class="va-mt">{items}</table></div>', "va-body")
        else:
            body += sec("楽章と聴きどころ", items, "va-body")
    if w and not a:
        if w.get("musicalAnalysis"):
            body += sec("音楽の特徴", f'<p>{esc(w["musicalAnalysis"])}</p>', "va-body")
        lg = w.get("listeningGuide") or {}
        cps = [cp for cp in lg.get("checkpoints") or [] if cp.get("description")]
        inner = ""
        if lg.get("recommendedVersion"):
            inner += f'<p>録音の例：{esc(lg["recommendedVersion"])}</p>'
        if cps:
            inner += '<ul class="va-cp">' + "".join(
                f'<li><span class="va-t">{esc(cp.get("time"))}</span><span>{esc(cp["description"])}</span></li>' for cp in cps) + "</ul>"
        body += sec("聴き方", inner, "va-body")
    # 関連
    rel = []
    if c:
        rel.append(("作曲家", [(f'/music/composers/{c["id"]}/', c["name"], S.life(c))]))
    rw = []
    for rid in (w or {}).get("relatedWorks", []):
        x = work_view(S, rid)
        if x:
            rw.append(x)
    same_c = [work_view(S, i) for i in all_work_ids(S) if i != wid and i not in [x["id"] for x in rw]]
    same_c = [x for x in same_c if x["composerId"] == v["composerId"]]
    rw += sorted(same_c, key=lambda x: x["year_n"])
    if rw:
        rel.append((f"{S.short(c)}のほかの作品" if c else "関連する作品",
                    [(x["path"], x["title"], f'{x["year_str"]}年' if x["year_str"] else "") for x in rw[:8]]))
    if v["era"]:
        se = [work_view(S, i) for i in all_work_ids(S) if i != wid]
        se = [x for x in se if x["era"] == v["era"] and x["composerId"] != v["composerId"]]
        se.sort(key=lambda x: abs(x["year_n"] - v["year_n"]))
        if se:
            rel.append(("同じ時代の作品", [(x["path"], x["title"], f'{S.short(x["composer"])}・{x["year_str"]}年')
                                     for x in se[:6]]))
    quiz = S.quiz_for(v["composerId"], v["era"])
    t = tail(S, v["path"], (a or {}).get("sources"), rel, v["events"], quiz)
    sub = (w or {}).get("titleEn") if w else ""
    hd = f'<header class="va-hd"><h1>{esc(v["title"])}</h1>' + (f'<p class="va-en" lang="en">{esc(sub)}</p>' if sub else "") + \
        (f'<p class="va-lede">{esc(v["desc"])}</p>' if v["desc"] else "") + '</header>'
    comp = {"@context": "https://schema.org", "@type": "MusicComposition", "name": v["title"], "url": url_of(v["path"]),
            "inLanguage": "ja"}
    if c:
        comp["composer"] = {"@type": "Person", "name": c["name"], "alternateName": c.get("nameEn"),
                            "url": url_of(f'/music/composers/{c["id"]}/')}
    if v["year_str"]:
        comp["dateCreated"] = v["year_str"].split("–")[0]
    if v["key"]:
        comp["musicalKey"] = v["key"]
    if v["catalog"]:
        comp["identifier"] = v["catalog"]
    if sub:
        comp["alternateName"] = sub
    ld = [article_ld(v["title"], v["desc"], v["path"], v["updated"], {"@id": url_of(v["path"]) + "#work"}), bld,
          dict(comp, **{"@id": url_of(v["path"]) + "#work"})]
    page(S, v["path"], f'{S.short(c)} {v["title"]}' if c else v["title"], v["desc"] or v["title"],
         bc + f'<article class="va-art">{hd}{meta}{body}{t}</article>', ld, "works", v["updated"])


def build_composer(S, c):
    path = f'/music/composers/{c["id"]}/'
    a = S.articles.get(("composers", c["id"]))
    era = S.E.get(c.get("era"))
    bc, bld = crumbs([("トップ", "/"), ("音楽", "/music/"), ("作曲家", "/music/composers/"), (c["name"], path)])
    meta = meta_dl([("生年", f'{c["born"]}年' if c.get("born") else ""), ("没年", f'{c["died"]}年' if c.get("died") else ""),
                    ("出身", esc(c.get("birthplace"))),
                    ("時代", f'<a href="/music/eras/{esc(era["id"])}/">{esc(era["name"])}</a>' if era else ""),
                    ("主な分野", esc("・".join(c.get("style") or [])))])
    if a:
        body = f'<div class="va-body">{a["html"]}</div>'
    else:
        body = sec("経歴", f'<p>{esc(c.get("longBio"))}</p>' if c.get("longBio") else "", "va-body")
    ws = [work_view(S, i) for i in all_work_ids(S)]
    ws = sorted([x for x in ws if x["composerId"] == c["id"]], key=lambda x: x["year_n"])
    body += sec("作品", rows([(x["path"], x["title"], f'{x["year_str"]}年' if x["year_str"] else "") for x in ws]))
    tl = [t for t in S.timeline if any(r.get("id") == c["id"] for r in t.get("relatedIds", []))]
    if tl:
        body += sec("年表", '<ul class="va-tl">' + "".join(
            f'<li><span class="va-y">{t["year"]}年</span><span><b>{esc(t["title"])}</b>{esc(t.get("description"))}</span></li>' for t in tl) + "</ul>")
    rel = []
    for key, label in [("teachers", "師"), ("students", "弟子"), ("influencedBy", "影響を受けた作曲家"), ("influenced", "影響を与えた作曲家")]:
        its = [S.C[i] for i in c.get(key, []) if i in S.C]
        if its:
            rel.append((label, [(f'/music/composers/{x["id"]}/', x["name"], S.life(x)) for x in its]))
    same = [x for x in S.composers if x.get("era") == c.get("era") and x["id"] != c["id"]]
    if same:
        rel.append(("同じ時代の作曲家", [(f'/music/composers/{x["id"]}/', x["name"], S.life(x)) for x in sorted(same, key=lambda x: x["born"])]))
    evs = [e for e in S.events if any(it.get("composerId") == c["id"] for it in e.get("program", []))]
    evs = [S.EV[x] for x in (a or {}).get("concert", []) if x in S.EV and S.EV[x] not in evs] + evs
    quiz = S.quiz_for(c["id"], c.get("era"))
    t = tail(S, path, (a or {}).get("sources"), rel, evs, quiz)
    desc = (a or {}).get("summary") or c.get("shortBio") or c["name"]
    hd = f'<header class="va-hd"><h1>{esc((a or {}).get("title") or c["name"])}</h1><p class="va-en" lang="en">{esc(c.get("nameEn"))}（{S.life(c)}）</p>' + \
        f'<p class="va-lede">{esc(desc)}</p></header>'
    person = {"@context": "https://schema.org", "@type": "Person", "@id": url_of(path) + "#person", "name": c["name"],
              "alternateName": c.get("nameEn"), "url": url_of(path)}
    if c.get("born"):
        person["birthDate"] = str(c["born"])
    if c.get("died"):
        person["deathDate"] = str(c["died"])
    ld = [article_ld(c["name"], desc, path, (a or {}).get("updated"), {"@id": url_of(path) + "#person"}), bld, person]
    page(S, path, c["name"], desc, bc + f'<article class="va-art">{hd}{meta}{body}{t}</article>', ld, "composers",
         (a or {}).get("updated"))


def build_era(S, e, i):
    path = f'/music/eras/{e["id"]}/'
    a = S.articles.get(("eras", e["id"]))
    bc, bld = crumbs([("トップ", "/"), ("音楽", "/music/"), ("時代", "/music/eras/"), (e["name"], path)])
    meta = meta_dl([("年代", esc(e.get("period"))), ("主なジャンル", esc("・".join(e.get("keyGenres") or []))),
                    ("演奏の場", esc("・".join(e.get("venues") or []))), ("楽器", esc("・".join(e.get("instruments") or [])))])
    if a:
        body = f'<div class="va-body">{a["html"]}</div>'
    else:
        body = sec("概要", f'<p>{esc(e.get("overview"))}</p>' if e.get("overview") else "", "va-body")
        mc = "".join(f'<h3>{esc(x["title"])}</h3><p>{esc(x["description"])}</p>' for x in e.get("musicalCharacteristics") or [])
        body += sec("音楽の特徴", mc, "va-body")
        hc = e.get("historicalContext") or {}
        hct = "".join(f'<h3>{lab}</h3><p>{esc(hc[k])}</p>' for k, lab in [("political", "政治・社会"), ("philosophical", "思想"), ("artistic", "美術・建築")] if hc.get(k))
        body += sec("時代の背景", hct, "va-body")
        ss = "".join(f'<h3>{esc(x["title"])}</h3>' + (f'<p class="va-note">{esc(x["years"])}</p>' if x.get("years") else "") + f'<p>{esc(x["body"])}</p>' for x in e.get("subsections") or [])
        body += sec("主な動き", ss, "va-body")
    comps = [S.C[x] for x in e.get("keyComposers", []) if x in S.C]
    comps += [x for x in S.composers if x.get("era") == e["id"] and x not in comps]
    body += sec("この時代の作曲家", rows([(f'/music/composers/{x["id"]}/', x["name"], S.life(x)) for x in sorted(comps, key=lambda x: x["born"])]))
    ws = [work_view(S, x) for x in all_work_ids(S)]
    ws = sorted([x for x in ws if x["era"] == e["id"]], key=lambda x: x["year_n"])
    body += sec("この時代の作品", rows([(x["path"], x["title"], f'{S.short(x["composer"])}・{x["year_str"]}年') for x in ws]))
    rel = []
    nav = []
    if i > 0:
        p = S.eras[i - 1]
        nav.append((f'/music/eras/{p["id"]}/', f'前の時代：{p["name"]}', p.get("period")))
    if i < len(S.eras) - 1:
        n = S.eras[i + 1]
        nav.append((f'/music/eras/{n["id"]}/', f'次の時代：{n["name"]}', n.get("period")))
    if nav:
        rel.append(("前後の時代", nav))
    if any(t.get("era") == e["id"] for t in S.timeline):
        rel.append(("年表", [("/music/timeline/#" + e["id"], f'年表（{e["name"]}）', "")]))
    t = tail(S, path, (a or {}).get("sources"), rel, [S.EV[x] for x in (a or {}).get("concert", []) if x in S.EV],
             S.quiz_for(None, e["id"]))
    desc = (a or {}).get("summary") or e.get("shortDescription") or e["name"]
    hd = f'<header class="va-hd"><h1>{esc((a or {}).get("title") or e["name"])}</h1><p class="va-lede">{esc(desc)}</p></header>'
    ld = [article_ld(e["name"], desc, path, (a or {}).get("updated")), bld]
    page(S, path, f'{e["name"]}（{e.get("period", "")}）', desc, bc + f'<article class="va-art">{hd}{meta}{body}{t}</article>', ld, "eras",
         (a or {}).get("updated"))


def build_concept(S, k):
    path = f'/music/concepts/{k["id"]}/'
    a = S.articles.get(("concepts", k["id"]))
    bc, bld = crumbs([("トップ", "/"), ("音楽", "/music/"), ("形式と概念", "/music/concepts/"), (k["title"], path)])
    meta = meta_dl([("分類", esc(CONCEPT_CAT.get(k.get("category"), "")))])
    body = f'<div class="va-body">{a["html"]}</div>' if a else sec("解説", f'<p>{esc(k.get("body"))}</p>' if k.get("body") else "", "va-body")
    rel = []
    rc = [S.K[x] for x in k.get("relatedConcepts", []) if x in S.K]
    if rc:
        rel.append(("関連する概念", [(f'/music/concepts/{x["id"]}/', x["title"], x.get("titleEn")) for x in rc]))
    rp = [S.C[x] for x in k.get("relatedComposers", []) if x in S.C]
    if rp:
        rel.append(("関連する作曲家", [(f'/music/composers/{x["id"]}/', x["name"], S.life(x)) for x in rp]))
    t = tail(S, path, (a or {}).get("sources"), rel, [S.EV[x] for x in (a or {}).get("concert", []) if x in S.EV], None)
    desc = (a or {}).get("summary") or k.get("shortDescription") or k["title"]
    hd = f'<header class="va-hd"><h1>{esc((a or {}).get("title") or k["title"])}</h1>' + \
        (f'<p class="va-en" lang="en">{esc(k["titleEn"])}</p>' if k.get("titleEn") else "") + f'<p class="va-lede">{esc(desc)}</p></header>'
    ld = [article_ld(k["title"], desc, path, (a or {}).get("updated")), bld]
    page(S, path, k["title"], desc, bc + f'<article class="va-art">{hd}{meta}{body}{t}</article>', ld, "concepts",
         (a or {}).get("updated"))


def build_article(S, a):
    """作品・作曲家・時代・概念以外の分野の記事"""
    sec_ = a["section"]
    path = f'/music/{sec_}/{a["slug"]}/'
    bc, bld = crumbs([("トップ", "/"), ("音楽", "/music/"), (SEC_NAME[sec_], f"/music/{sec_}/"), (a["title"], path)])
    c = S.C.get(a.get("composer"))
    era = S.E.get(a.get("era"))
    meta = meta_dl([("作曲家", f'<a href="/music/composers/{esc(c["id"])}/">{esc(c["name"])}</a>' if c else ""),
                    ("時代", f'<a href="/music/eras/{esc(era["id"])}/">{esc(era["name"])}</a>' if era else ""),
                    ("更新", esc(a.get("updated")))])
    body = f'<div class="va-body">{a["html"]}</div>'
    rel = []
    if c:
        rel.append(("作曲家", [(f'/music/composers/{c["id"]}/', c["name"], S.life(c))]))
    others = [x for x in S.arts_in(sec_) if x["slug"] != a["slug"]]
    if others:
        rel.append((f"{SEC_NAME[sec_]}のほかの記事", [(f'/music/{sec_}/{x["slug"]}/', x["title"], x.get("summary", "")) for x in others[:8]]))
    quiz = S.quiz_for(a.get("composer"), a.get("era") or (c or {}).get("era"))
    t = tail(S, path, a.get("sources"), rel, [S.EV[x] for x in a.get("concert", []) if x in S.EV], quiz)
    desc = a.get("summary") or a["title"]
    hd = f'<header class="va-hd"><h1>{esc(a["title"])}</h1>' + (f'<p class="va-lede">{esc(a["summary"])}</p>' if a.get("summary") else "") + '</header>'
    ld = [article_ld(a["title"], desc, path, a.get("updated")), bld]
    page(S, path, a["title"], desc, bc + f'<article class="va-art">{hd}{meta}{body}{t}</article>', ld, sec_, a.get("updated"))


def build_indexes(S):
    # 作品
    path = "/music/works/"
    bc, bld = crumbs([("トップ", "/"), ("音楽", "/music/"), ("作品", path)])
    ws = [work_view(S, i) for i in all_work_ids(S)]
    h = ""
    for e in S.eras:
        x = sorted([w for w in ws if w["era"] == e["id"]], key=lambda w: w["year_n"])
        h += sec(f'{e["name"]}（{e.get("period", "")}）', rows([(w["path"], w["title"], f'{S.short(w["composer"])}・{w["year_str"]}年') for w in x]))
    rest = [w for w in ws if w["era"] not in S.E]
    h += sec("そのほか", rows([(w["path"], w["title"], S.short(w["composer"])) for w in rest]))
    desc = f"作品{len(ws)}曲の解説。作曲年・調・作品番号・楽章・成立の経緯。時代順に並べています。"
    page(S, path, "作品", desc, bc + f'<header class="va-hd"><h1>作品</h1><p class="va-lede">{esc(desc)}</p></header>' + h,
         [bld], "works")
    # 作曲家
    path = "/music/composers/"
    bc, bld = crumbs([("トップ", "/"), ("音楽", "/music/"), ("作曲家", path)])
    h = ""
    for e in S.eras:
        x = sorted([c for c in S.composers if c.get("era") == e["id"]], key=lambda c: c["born"])
        h += sec(f'{e["name"]}（{e.get("period", "")}）', rows([(f'/music/composers/{c["id"]}/', c["name"], S.life(c)) for c in x]))
    desc = f"作曲家{len(S.composers)}人の生没年・出身・経歴・作品。時代ごと、生年順に並べています。"
    page(S, path, "作曲家", desc, bc + f'<header class="va-hd"><h1>作曲家</h1><p class="va-lede">{esc(desc)}</p></header>' + h,
         [bld], "composers")
    # 時代
    path = "/music/eras/"
    bc, bld = crumbs([("トップ", "/"), ("音楽", "/music/"), ("時代", path)])
    desc = "古代・中世から現代までの7つの時代区分。各時代の音楽の特徴・背景・作曲家・作品。"
    page(S, path, "時代", desc, bc + f'<header class="va-hd"><h1>時代</h1><p class="va-lede">{esc(desc)}</p></header>' +
         rows([(f'/music/eras/{e["id"]}/', e["name"], e.get("period")) for e in S.eras]), [bld], "eras")
    # 概念
    path = "/music/concepts/"
    bc, bld = crumbs([("トップ", "/"), ("音楽", "/music/"), ("形式と概念", path)])
    desc = "ソナタ形式・フーガ・対位法・調性など、楽曲の形式と音楽の基本的な概念。"
    page(S, path, "形式と概念", desc, bc + f'<header class="va-hd"><h1>形式と概念</h1><p class="va-lede">{esc(desc)}</p></header>' +
         rows([(f'/music/concepts/{k["id"]}/', k["title"], k.get("shortDescription")) for k in S.concepts]), [bld], "concepts")
    # 記事だけの分野
    for s, n in SECTIONS:
        if s in DATA_SECTIONS:
            continue
        arts = S.arts_in(s)
        if not arts:
            continue
        path = f"/music/{s}/"
        bc, bld = crumbs([("トップ", "/"), ("音楽", "/music/"), (n, path)])
        page(S, path, n, f"{n}の記事の一覧。", bc + f'<header class="va-hd"><h1>{esc(n)}</h1></header>' +
             rows([(f'/music/{s}/{a["slug"]}/', a["title"], a.get("summary")) for a in arts]), [bld], s,
             max(str(a.get("updated", "")) for a in arts) or None)


def build_timeline(S):
    path = "/music/timeline/"
    bc, bld = crumbs([("トップ", "/"), ("音楽", "/music/"), ("年表", path)])
    h = ""
    for e in S.eras:
        ev = [t for t in S.timeline if t.get("era") == e["id"]]
        if not ev:
            continue
        li = ""
        for t in ev:
            links = []
            for r in t.get("relatedIds", []):
                if r.get("type") == "composer" and r.get("id") in S.C:
                    links.append(f'<a href="/music/composers/{r["id"]}/">{esc(S.C[r["id"]]["name"])}</a>')
                elif r.get("type") == "work" and (r.get("id") in S.W):
                    links.append(f'<a href="/music/works/{r["id"]}/">{esc(S.W[r["id"]]["title"])}</a>')
            li += f'<li><span class="va-y">{t["year"]}年</span><span><b>{esc(t["title"])}</b><small>{esc(TL_CAT.get(t.get("category"), ""))}</small>{esc(t.get("description"))}' + \
                (f'<span class="va-tlk">{"".join(links)}</span>' if links else "") + "</span></li>"
        h += f'<section class="va-sec" id="{esc(e["id"])}"><h2>{esc(e["name"])}（{esc(e.get("period"))}）</h2><ul class="va-tl">{li}</ul></section>'
    desc = f"音楽史と世界史の出来事{len(S.timeline)}件を年代順に並べた年表。作曲家の生没・初演・政治や科学の出来事。"
    ld = [bld, {"@context": "https://schema.org", "@type": "WebPage", "name": "年表", "url": url_of(path), "inLanguage": "ja",
                "publisher": {"@type": "Organization", "name": PUBLISHER}}]
    page(S, path, "年表", desc, bc + f'<header class="va-hd"><h1>年表</h1><p class="va-lede">{esc(desc)}</p></header>' + h, ld, "timeline")


def build_concerts(S):
    path = "/concerts/"
    bc, bld = crumbs([("トップ", "/"), ("演奏会", path)])
    desc = "VariOrchestra の演奏会。日付・会場・曲目と、曲目の作品ページ。"
    page(S, path, "演奏会", desc, bc + f'<header class="va-hd"><h1>演奏会</h1><p class="va-lede">{esc(desc)}</p></header>' +
         rows([(f'/concerts/{e["id"]}/', e["title"], f'{jdate(e.get("date"))}・{e.get("venue", "")}') for e in S.events]),
         [bld], "concerts")
    for e in S.events:
        p = f'/concerts/{e["id"]}/'
        bc, bld = crumbs([("トップ", "/"), ("演奏会", "/concerts/"), (e["title"], p)])
        prog = []
        for it in e.get("program", []):
            wid = program_work(S, e, it)
            if wid:
                prog.append((f"/music/works/{wid}/", it.get("title"), "作品の解説"))
            else:
                prog.append((None, it.get("title"), ""))
        pl = '<ul class="va-list va-prog">' + "".join(
            (f'<li><a href="{h}"><span><b>{esc(t)}</b><small>{esc(s)}</small></span></a></li>' if h else
             f'<li><div><span><b>{esc(t)}</b></span></div></li>') for h, t, s in prog) + "</ul>"
        tu, tl = ticket_url(e)
        arts = [a for a in S.articles.values() if e["id"] in a.get("concert", [])]
        prep = rows([(f'/music/{a["section"]}/{a["slug"]}/', a["title"], SEC_NAME[a["section"]]) for a in arts])
        comps = []
        for it in e.get("program", []):
            c = S.C.get(it.get("composerId"))
            if c and c not in comps:
                comps.append(c)
        body = f'<header class="va-hd"><h1>{esc(e["title"])}</h1></header>' + \
            meta_dl([("日付", jdate(e.get("date"))), ("会場", esc(e.get("venue"))), ("指揮", esc(e.get("conductor")))]) + \
            f'<div class="va-acts va-top-acts"><a class="va-btn" href="{esc(tu)}">{esc(tl)}</a></div>' + \
            sec("曲目", pl) + sec("予習の記事", prep) + \
            sec("作曲家", rows([(f'/music/composers/{c["id"]}/', c["name"], S.life(c)) for c in comps])) + \
            sec("Veliq Club", f'<div class="va-acts"><a class="va-btn ln" href="{CLUB}">Veliq Club に入会する</a></div>')
        ev_ld = {"@context": "https://schema.org", "@type": "MusicEvent", "name": e["title"], "startDate": e.get("date"),
                 "eventStatus": "https://schema.org/EventScheduled",
                 "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
                 "location": {"@type": "Place", "name": e.get("venue"), "address": e.get("venue")},
                 "organizer": {"@type": "Organization", "name": PUBLISHER, "url": VO},
                 "offers": {"@type": "Offer", "url": tu}, "url": url_of(p)}
        if e.get("conductor"):
            ev_ld["performer"] = {"@type": "Person", "name": e["conductor"]}
        page(S, p, e["title"], f'{e["title"]}（{jdate(e.get("date"))}・{e.get("venue", "")}）の曲目と作品の解説。',
             bc + f'<article class="va-art">{body}</article>', [bld, ev_ld], "concerts", og="website")


def section_preview(S, s):
    """音楽学科トップの分野ごとの一覧（最大6件）"""
    arts = S.arts_in(s)
    items = []
    if s == "works":
        for a in arts:
            v = work_view(S, a["slug"])
            items.append((v["path"], v["title"], S.short(v["composer"])))
        for w in S.works:
            if len(items) >= 6:
                break
            if not any(i[0] == f'/music/works/{w["id"]}/' for i in items):
                items.append((f'/music/works/{w["id"]}/', w["title"], S.short(S.C.get(w["composerId"]))))
    elif s == "composers":
        ids = [a["slug"] for a in arts if a["slug"] in S.C]
        ids += [c["id"] for c in sorted(S.composers, key=lambda c: c["born"]) if c["id"] not in ids]
        items = [(f"/music/composers/{i}/", S.C[i]["name"], S.life(S.C[i])) for i in ids]
    elif s == "eras":
        items = [(f'/music/eras/{e["id"]}/', e["name"], e.get("period")) for e in S.eras]
    elif s == "concepts":
        items = [(f'/music/concepts/{k["id"]}/', k["title"], k.get("shortDescription")) for k in S.concepts]
    elif s == "timeline":
        items = [("/music/timeline/", f"年表（{len(S.timeline)}件）", "作曲家の生没・初演・政治や科学の出来事")]
    else:
        items = [(f'/music/{s}/{a["slug"]}/', a["title"], a.get("summary")) for a in arts]
    return items


def build_music(S):
    path = "/music/"
    bc, bld = crumbs([("トップ", "/"), ("音楽", path)])
    h = ""
    news = sorted(S.articles.values(), key=lambda a: (str(a.get("updated", "")), a["title"]), reverse=True)[:8]
    if news:
        h += sec("新着", rows([(f'/music/{a["section"]}/{a["slug"]}/', a["title"],
                              f'{SEC_NAME[a["section"]]}・{a.get("updated", "")}' if a.get("updated") else SEC_NAME[a["section"]])
                             for a in news]))
    for s, n in SECTIONS:
        if s not in DATA_SECTIONS and not S.arts_in(s):
            continue
        items = section_preview(S, s)
        limit = 7 if s in ("eras",) else 8 if s == "concepts" else 6
        more = f'<a class="va-more" href="/music/{s}/">すべて見る</a>' if s != "timeline" and len(items) > limit or s in ("works", "composers") else ""
        h += f'<section class="va-sec"><div class="va-shd"><h2>{esc(n)}</h2>{more}</div>{rows(items[:limit])}</section>'
    desc = "作品・作曲家・時代・形式と概念・年表。記事の末尾に出典を付けています。監修：佐藤瑛吾（指揮者・VariOrchestra 音楽監督）。"
    ld = [bld, {"@context": "https://schema.org", "@type": "CollectionPage", "name": "音楽", "url": url_of(path), "inLanguage": "ja",
                "publisher": {"@type": "Organization", "name": PUBLISHER}}]
    page(S, path, "音楽", desc, bc + f'<header class="va-hd"><h1>音楽</h1><p class="va-lede">{esc(desc)}</p></header>' + h,
         ld, "music", og="website")


def build_home(S):
    path = "/"
    nw = len(all_work_ids(S))
    na = len(S.articles)
    sub = f"作曲家{len(S.composers)}人・作品{nw}曲・時代・形式と概念・年表" + (f"・記事{na}本" if na else "")
    h = '<header class="va-hd va-home"><h1>Veliq <span class="va-gold">Academy</span></h1>' + \
        f'<p class="va-lede">音楽の作品・作曲家・時代を解説する学習サイトです。監修：{SUPERVISOR}（{SUPERVISOR_ROLE}）。運営：{PUBLISHER}。</p></header>'
    h += sec("学科", rows([("/music/", "音楽", sub)]))
    if S.events:
        h += sec("演奏会", rows([(f'/concerts/{e["id"]}/', e["title"], f'{jdate(e.get("date"))}・{e.get("venue", "")}') for e in S.events]))
    h += sec("アプリと会員", f'<div class="va-acts"><a class="va-btn" href="{APP}?from=academy">Veliq アプリで4択</a><a class="va-btn ln" href="{CLUB}">Veliq Club に入会する</a></div>')
    ld = [{"@context": "https://schema.org", "@type": "WebSite", "name": "Veliq Academy", "url": SITE + "/", "inLanguage": "ja",
           "publisher": {"@type": "Organization", "name": PUBLISHER, "url": VO, "email": "info@variorchestra.com"}}]
    page(S, path, "Veliq Academy", f"音楽の作品・作曲家・時代を、出典つきで解説する学習サイト。{sub}。監修：{SUPERVISOR}。運営：{PUBLISHER}。",
         h, ld, "", og="website", extra_js=f'\n<script src="/assets/legacy.js?v={CSS_V}" defer></script>')


def build_legacy(S):
    """旧 SPA の #/... → 新しい URL の対応表と、トップで移すスクリプト"""
    m = {"/": "/", "/dashboard": "/", "/progress": "/", "/timeline": "/music/timeline/",
         "/composers": "/music/composers/", "/graph": "/music/composers/", "/works": "/music/works/",
         "/listening": "/music/works/", "/eras": "/music/eras/", "/concepts": "/music/concepts/",
         "/score": "/music/concepts/", "/paths": "/music/", "/quiz": "/music/", "/concert": "/concerts/"}
    for c in S.composers:
        m[f'/composers/{c["id"]}'] = f'/music/composers/{c["id"]}/'
    for i in all_work_ids(S):
        m[f"/works/{i}"] = f"/music/works/{i}/"
    for e in S.eras:
        m[f'/eras/{e["id"]}'] = f'/music/eras/{e["id"]}/'
    for k in S.concepts:
        m[f'/concepts/{k["id"]}'] = f'/music/concepts/{k["id"]}/'
    js = ("/* 旧 Veliq Academy（#/composers/... 等）から来た人を新しい URL へ移す。tools/build.py が生成 */\n"
          "(function(){var M=" + json.dumps(m, ensure_ascii=False, separators=(",", ":")) + ";\n"
          "var h=(location.hash||'').replace(/^#!?/,'');if(h.charAt(0)!=='/')return;\n"
          "h=h.split('?')[0].replace(/\\/+$/,'')||'/';var t=M[h];\n"
          "if(!t){var p=h.split('/');t=M['/'+p[1]];}\n"
          "if(t&&t!==location.pathname)location.replace(t);})();\n")
    (OUT / "assets" / "legacy.js").write_text(js, encoding="utf-8")
    return m


def wrap_static(S, name, title, cur=""):
    """privacy.html・404.html：本文（<main>）はそのままにして、ヘッダー・フッター・見た目を揃える"""
    p = OUT / name
    s = p.read_text(encoding="utf-8")
    m = re.search(r"<main[^>]*>(.*?)</main>", s, re.S)
    inner = m.group(1) if m else ""
    inner = re.sub(r'<p class="crumb">.*?</p>', "", inner, flags=re.S)
    inner = re.sub(r'<div class="va-bc-wrap">.*?</div><!--/bc-->', "", inner, flags=re.S)
    desc_m = re.search(r'<meta name="description" content="([^"]*)"', s)
    desc = html.unescape(desc_m.group(1)) if desc_m else title
    noindex = name == "404.html"
    if not noindex:
        bc, bld = crumbs([("トップ", "/"), (title, "/" + name)])
        ld = [bld]
        inner_wrapped = f'<div class="va-bc-wrap">{bc}</div><!--/bc-->' + inner.strip()
    else:
        ld = []
        inner_wrapped = inner.strip()
    out = head(title, desc, "/" + name, ld, "article", noindex=noindex) + header(S, cur) + \
        f'<main id="main" class="va-main va-doc"><div class="wrap"><div class="va-art va-body">\n{inner_wrapped}\n</div></div></main>\n' + footer(S)
    p.write_text(out, encoding="utf-8")
    if not noindex:
        S.pages.append(("/" + name, S.data_mtime, title))


def unwrap_static_main(name):
    """前回のビルドで包んだ privacy/404 から本文だけを取り出して <main> に戻す（何度ビルドしても入れ子にしない）"""
    p = OUT / name
    s = p.read_text(encoding="utf-8")
    m = re.search(r'<main id="main" class="va-main va-doc"><div class="wrap"><div class="va-art va-body">\n(.*?)\n</div></div></main>', s, re.S)
    if m:
        s = re.sub(r"<main[^>]*>.*?</main>", lambda _: "<main>" + m.group(1) + "</main>", s, count=1, flags=re.S)
        p.write_text(s, encoding="utf-8")


def build_meta_files(S):
    urls = "".join(f"  <url><loc>{url_of(p)}</loc><lastmod>{lm}</lastmod></url>\n" for p, lm, _ in S.pages)
    (OUT / "sitemap.xml").write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls + "</urlset>\n", encoding="utf-8")
    (OUT / "robots.txt").write_text("User-agent: *\nAllow: /\n\nUser-agent: GPTBot\nAllow: /\n\nUser-agent: ClaudeBot\nAllow: /\n\n"
                                    "User-agent: Claude-Web\nAllow: /\n\nUser-agent: PerplexityBot\nAllow: /\n\n"
                                    "User-agent: Google-Extended\nAllow: /\n\n" + f"Sitemap: {SITE}/sitemap.xml\n", encoding="utf-8")
    L = ["# Veliq Academy", "",
         f"> 音楽の作品・作曲家・時代を解説する日本語の学習サイト。1記事1ページ。監修:{SUPERVISOR}({SUPERVISOR_ROLE})。運営:{PUBLISHER}(info@variorchestra.com)。", "",
         "## 音楽", f"- [音楽学科のトップ]({SITE}/music/)"]
    for s, n in SECTIONS:
        if s in DATA_SECTIONS or S.arts_in(s):
            L.append(f"- [{n}]({SITE}/music/{s}/)")
    if S.articles:
        L += ["", "## 記事"]
        for a in sorted(S.articles.values(), key=lambda a: (a["section"], a["slug"])):
            L.append(f'- [{a["title"]}]({SITE}/music/{a["section"]}/{a["slug"]}/): {a.get("summary", "")}'.rstrip(": "))
    L += ["", "## 作曲家"] + [f'- [{c["name"]}]({SITE}/music/composers/{c["id"]}/): {S.life(c)}' for c in sorted(S.composers, key=lambda c: c["born"])]
    L += ["", "## 作品"] + [f'- [{v["title"]}]({SITE}{v["path"]}): {S.short(v["composer"])}' + (f'・{v["year_str"]}年' if v["year_str"] else "")
                           for v in sorted((work_view(S, i) for i in all_work_ids(S)), key=lambda v: v["year_n"])]
    L += ["", "## 時代"] + [f'- [{e["name"]}]({SITE}/music/eras/{e["id"]}/): {e.get("period", "")}' for e in S.eras]
    L += ["", "## 形式と概念"] + [f'- [{k["title"]}]({SITE}/music/concepts/{k["id"]}/)' for k in S.concepts]
    L += ["", "## 演奏会"] + [f'- [{e["title"]}]({SITE}/concerts/{e["id"]}/): {e.get("date", "")}・{e.get("venue", "")}' for e in S.events]
    L += ["", "## データ(JSON)", f"- [作曲家]({SITE}/data/composers.json) / [作品]({SITE}/data/works.json) / [時代]({SITE}/data/eras.json) / "
          f"[年表]({SITE}/data/timeline-events.json) / [概念]({SITE}/data/concepts.json)",
          "", "## 運営", f"- [プライバシーポリシー]({SITE}/privacy.html)", f"- 姉妹サイト: [VELIQ](https://veliq.jp/) / [Veliq Club]({CLUB})", ""]
    (OUT / "llms.txt").write_text("\n".join(L), encoding="utf-8")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--content", default=str(ROOT / "content"), help="記事の置き場所（既定: content/）")
    args = ap.parse_args()
    S = Site(args.content)
    # 前回の生成物を消す（消した記事のページが残らないように）
    for d in ("music", "concerts"):
        shutil.rmtree(OUT / d, ignore_errors=True)
    for c in S.composers:
        build_composer(S, c)
    for i in all_work_ids(S):
        build_work(S, i)
    for i, e in enumerate(S.eras):
        build_era(S, e, i)
    for k in S.concepts:
        build_concept(S, k)
    for (s, slug), a in S.articles.items():
        if s == "composers" and slug not in S.C or s == "eras" and slug not in S.E or s == "concepts" and slug not in S.K:
            warn(f'{a["file"]}: {s} の id「{slug}」はデータにありません。ページは作りません')
            continue
        if s not in ("works", "composers", "eras", "concepts"):
            build_article(S, a)
    build_indexes(S)
    build_timeline(S)
    build_concerts(S)
    build_music(S)
    build_home(S)
    build_legacy(S)
    for n, t in (("privacy.html", "プライバシーポリシー"), ("404.html", "お探しのページは見つかりませんでした")):
        unwrap_static_main(n)
        wrap_static(S, n, t)
    S.pages.sort(key=lambda x: (x[0] != "/", x[0]))
    build_meta_files(S)
    print(f"ページ {len(S.pages)}（sitemap に載せた数）・記事 {len(S.articles)}・警告 {len(WARN)}")


if __name__ == "__main__":
    main()
