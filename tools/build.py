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
from urllib.parse import quote, unquote

try:
    import yaml
    import markdown
except ImportError:  # pragma: no cover
    sys.exit("pip install --break-system-packages pyyaml markdown が必要です")

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "veliq-academy"
DATA = OUT / "data"
SITE = "https://veliq-academy.com"
# アプリの4択（veliq-club/quiz-bank.js）。環境変数 VELIQ_CLUB_DIR で場所を指定できる（clone して別の場所で組むとき）
QUIZ_BANK = (Path(os.environ["VELIQ_CLUB_DIR"]) / "quiz-bank.js" if os.environ.get("VELIQ_CLUB_DIR") else
             next((p / "veliq-club" / "quiz-bank.js" for p in ROOT.parents if (p / "veliq-club" / "quiz-bank.js").exists()),
                  ROOT.parent / "veliq-club" / "quiz-bank.js"))
APP = "https://veliqclub.com/app.html"
CLUB = "https://veliqclub.com/"
VO = "https://variorchestra.com/"
CSS_V = "12"

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
    ("glossary", "用語集"),
    ("concepts", "形式と概念"),
]
SEC_NAME = dict(SECTIONS)
DATA_SECTIONS = {"works", "composers", "eras", "concepts", "timeline"}
ARTICLE_SECTIONS = [s for s, _ in SECTIONS if s not in ("timeline",)]

# 美術学科（記事だけ）。content/art/<section>/<slug>.md → /art/<section>/<slug>/（artists は画家ひとりにつき1本）
ART_SECTIONS = [
    ("western", "西洋美術"),
    ("japan", "日本美術"),
    ("artists", "画家"),
    ("sculpture-architecture", "彫刻と建築"),
    ("museums", "美術館"),
]
ART_SEC_NAME = dict(ART_SECTIONS)
# 語学学科（記事だけ）。content/lingua/<lang>/<unit-id>.md → /lingua/<lang>/<unit-id>/
# 記事は tools/lingua_export.js が veliq-club/lingua-bank.js（アプリの場面ノート）から書き出す
LINGUA_SECTIONS = [
    ("en", "英語"),
    ("it", "イタリア語"),
]
LINGUA_SEC_NAME = dict(LINGUA_SECTIONS)
LINGUA_GROUPS = ["はじめの一歩", "場面"]
FACULTIES = [("music", "音楽"), ("art", "美術"), ("lingua", "語学")]
FAC_NAME = dict(FACULTIES)
FAQ_TITLE = "よくある質問"


VQ_ORG = '<script type="application/ld+json" id="vq-org">{"@context":"https://schema.org","@type":"Organization","@id":"https://veliq-academy.com/#org","name":"Veliq Academy","url":"https://veliq-academy.com/","brand":{"@type":"Brand","name":"VELIQ"},"parentOrganization":{"@type":"Organization","@id":"https://veliq.jp/#org","name":"VELIQ","alternateName":"ヴェリーク","url":"https://veliq.jp/"},"sameAs":["https://veliq.jp/"]}</script>\n'

def sec_name(fac, s):
    return {"art": ART_SEC_NAME, "lingua": LINGUA_SEC_NAME}.get(fac, SEC_NAME).get(s, s)

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
        mdconv = markdown.Markdown(extensions=["tables", "sane_lists", "fenced_code"])
        for fac, _ in FACULTIES:
            base = Path(content_dir) / fac
            if not base.is_dir():
                continue
            self.load_faculty(arts, fac, base, mdconv)
        return arts

    def load_faculty(self, arts, fac, base, mdconv):
        allowed = {"music": ARTICLE_SECTIONS, "art": [s for s, _ in ART_SECTIONS],
                   "lingua": [s for s, _ in LINGUA_SECTIONS]}[fac]
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
            if sec not in allowed:
                warn(f"{p}: section「{sec}」は使えません（{', '.join(allowed)}）。飛ばします")
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
            md = re.sub(r"==(.+?)==", r'<mark class="hl">\1</mark>', m.group(2))  # ==語== → 金のマーカー
            # 「> 要点」の直後に「> - 」が続くと箇条書きにならないので、間に空の引用行を挟む
            md = re.sub(r"^(>\s*要点\s*)\n(>\s*[-*] )", r"\1\n>\n\2", md, flags=re.M)
            md = md_protect_urls(md)
            body = mdconv.convert(md)
            # 本文中の外部リンク（出典）は新しいタブで開く
            body = re.sub(r'<a href="(https?://[^"]+)">', r'<a href="\1" target="_blank" rel="noopener">', body)
            body = re.sub(r"<h1>.*?</h1>\s*", "", body, flags=re.S)  # 題名は前付けから出す
            body = re.sub(r"(<table>.*?</table>)", r'<div class="va-tbl tbl">\1</div>', body, flags=re.S)
            body, fm["cites"] = strip_citations(body)
            # 本文末尾に「## 参考文献」があれば本文から外し、前付けの sources に無い項目だけ足す（自動の節と二重にしない）
            body, extra = pop_references(body)
            if extra:
                fm["sources"] = list(fm.get("sources") or ([] if not isinstance(fm.get("sources"), str) else [fm["sources"]])) + extra
            # 「> 要点」で始まる引用は左罫線の要点の箱
            body = re.sub(r"<blockquote>\s*<p>要点</p>\s*(.*?)</blockquote>", r'<aside class="va-key"><p class="va-key-h">要点</p>\1</aside>', body, flags=re.S)
            body, toc = number_headings(body)
            fm["toc"] = toc
            fm["hero"] = figure(fm.get("image"), fm.get("image_alt") or hero_alt(fm), fm.get("image_credit"), hero=True) if fm.get("image") else ""
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
            fm.update(section=sec, slug=slug, html=body, file=str(p), faculty=fac,
                      path=f"/music/glossary/" if sec == "glossary" else f"/{fac}/{sec}/{slug}/", glossary=(sec == "glossary"))
            arts[(sec, slug)] = fm

    def arts_in(self, sec):
        a = [v for (s, _), v in self.articles.items() if s == sec]
        return sorted(a, key=lambda x: (str(x.get("updated", "")), x["slug"]), reverse=True)

    def arts_of(self, fac):
        return [v for v in self.articles.values() if v["faculty"] == fac]

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
        q["topics"] = {t["key"]: t for t in bank.get("topics", []) if t.get("key")}
        q["chapters"] = {}
        for c in self.composers:
            nm = self.surname(c)
            q["chapters"][c["id"]] = [t for t in topics if t.get("composer") == nm or nm in t.get("title", "")]
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

    def chapters_for(self, composer_id):
        return self.quiz.get("chapters", {}).get(composer_id, [])

    def quiz_for(self, composer_id=None, era_id=None, key=None):
        t = key or (self.quiz["composer"].get(composer_id) if composer_id else None)
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


# ---------------------------------------------------------------- 記事本文の整形
_HTAG = re.compile(r"<h([23])>(.*?)</h\1>", re.S)


def _plain(s):
    return html.unescape(re.sub(r"<[^>]+>", "", s)).strip()


def number_headings(body):
    """h2 に 1、h3 に 1-1 の番号と id を付け、目次の一覧を返す。「よくある質問」は番号なしで囲む。
    目次は最初の h2 の直前（＝リード文と要約表の後）に置く"""
    toc, n2, n3 = [], 0, 0
    out, pos, faq_start = [], 0, None
    seen_ids = set()

    def hid_of(text, fallback):
        t = re.split(r"——|：|:", text)[0]
        t = re.sub(r"[（(].*?[）)]", "", t)
        t = re.sub(r"[\s　「」『』《》、。・,.:;!?/]+", "-", t).strip("-")
        t = t or fallback
        base, i = t, 2
        while t in seen_ids:
            t = f"{base}-{i}"
            i += 1
        seen_ids.add(t)
        return t
    for m in _HTAG.finditer(body):
        lv, inner = m.group(1), m.group(2)
        inner = re.sub(r"^\s*\d+(?:[.\-－‐]\d+)*[.．]?\s*", "", inner)  # 手書きの「1.」「2-1」は外す（番号はここで付ける）
        text = _plain(inner)
        if lv == "2" and text == FAQ_TITLE:
            faq_start = len("".join(out)) + (m.start() - pos)
            out.append(body[pos:m.start()])
            out.append(f'<h2 id="faq">{inner}</h2>')
            pos = m.end()
            toc.append(("faq", "", text, 2))
            continue
        if faq_start is not None:
            continue
        if lv == "2":
            n2 += 1
            n3 = 0
            num, hid = f"{n2}", hid_of(text, f"s{n2}")
        else:
            if n2 == 0:
                continue
            n3 += 1
            num, hid = f"{n2}-{n3}", hid_of(text, f"s{n2}-{n3}")
        out.append(body[pos:m.start()])
        out.append(f'<h{lv} id="{hid}"><span class="va-n">{num}</span>{inner}</h{lv}>')
        pos = m.end()
        toc.append((hid, num, text, int(lv)))
    out.append(body[pos:])
    body = "".join(out)
    if faq_start is not None:
        body = body[:faq_start] + '<section class="va-faq">' + body[faq_start:] + "</section>"
        # 質問（h3）と答え
        body = re.sub(r'(<section class="va-faq">.*)', lambda m: re.sub(r"<h3>(.*?)</h3>", r'<h3 class="va-q">\1</h3>', m.group(1), flags=re.S), body, flags=re.S)
    if toc:
        heads = list(re.finditer(r'<h2 id="', body))
        if heads:
            at = heads[0].start()
            # 最初の章が「要点」なら箱として先に出し、目次はその後ろに置く
            if toc[0][2] == "要点" and toc[0][3] == 2:
                end = heads[1].start() if len(heads) > 1 else len(body)
                seg = body[at:end]
                # 「## 要点」の直下が「> 要点」の箱なら、箱を外して中身だけにする（罫線の二重を避ける）
                seg = re.sub(r'(</h2>\s*)<aside class="va-key"><p class="va-key-h">要点</p>(.*?)</aside>', r"\1\2", seg, count=1, flags=re.S)
                body = body[:at] + '<section class="va-key-sec">' + seg + "</section>" + body[end:]
                at = at + len('<section class="va-key-sec"></section>') + len(seg)
            body = body[:at] + toc_html(toc) + body[at:]
    return body, toc


def toc_html(toc):
    li = ""
    for hid, num, text, lv in toc:
        cls = ' class="l3"' if lv == 3 else ""
        nn = f'<span class="va-n">{num}</span>' if num else ""
        li += f'<li{cls}><a href="#{quote(hid)}">{nn}{esc(text)}</a></li>'
    return f'<details class="va-toc" open><summary>目次</summary><nav aria-label="目次"><ol>{li}</ol></nav></details>'


def tagline(fac, cat, updated):
    """題名の上：分野のタグと更新日（13px）"""
    h = f'<p class="va-tag"><a class="va-chip" href="/{fac}/{cat[0]}/">{esc(cat[1])}</a>' if cat else '<p class="va-tag">'
    if updated:
        h += f'<time datetime="{esc(updated)}">更新 {esc(updated)}</time>'
    return h + "</p>"


def hero_alt(fm):
    """image_alt が無いときの代わり：クレジットの先頭（「作者 作「題」」など）を絵の説明にする。題名と同じ alt にはしない"""
    c = re.split(r"[。]", str(fm.get("image_credit") or ""))[0]
    c = re.sub(r"（[^）]*）", "", c).strip()
    return c or "記事の図"


def figure(src, alt, credit, hero=False):
    """画像（Wikimedia Commons のパブリックドメイン画像など）。credit は「作者・所蔵・ライセンス」"""
    if not src:
        return ""
    cls = "fig va-hero" if hero else "fig"
    cap = f"<figcaption>{esc(credit)}</figcaption>" if credit else ""
    return f'<figure class="{cls}"><img src="{esc(src)}" alt="{esc(alt)}" loading="{"eager" if hero else "lazy"}" decoding="async">{cap}</figure>'


def listen_links(q):
    """聴く：Apple Music・Spotify・YouTube の検索リンク（ブランド色のピル）"""
    qq = quote(q)
    return ('<div class="va-listen">'
            f'<a class="va-pill am" href="https://music.apple.com/jp/search?term={qq}" target="_blank" rel="noopener">Apple Music</a>'
            f'<a class="va-pill sp" href="https://open.spotify.com/search/{qq}" target="_blank" rel="noopener">Spotify</a>'
            f'<a class="va-pill yt" href="https://www.youtube.com/results?search_query={qq}" target="_blank" rel="noopener">YouTube</a>'
            '</div>')


def quiz_rows(S, path, topics):
    """関連章：アプリの4択へのリンク（一覧の行）"""
    items = []
    for t in topics:
        q = f"{APP}?quiz={quote(t['key'])}&from=academy&ret={quote(url_of(path), safe='')}"
        items.append((q, t["title"], f'{t.get("label", "")}・{len(t.get("qs", []))}問'))
    return rows(items)


# ---------------------------------------------------------------- 本文中の出典リンク → 参考文献
LINKCHECK = ROOT / "tools" / "linkcheck.json"
_BAD_URL = re.compile(r"britannica\.com/(print/|EBchecked/)", re.I)
_BLOG_URL = re.compile(r"/blog|blog\.|wp-json", re.I)  # ブログは出典にしない


def url_clean(u):
    """本文・前付けから拾った URL の末尾の句読点と、対応の取れない閉じ括弧だけを落とす（「_(Mahler)」の「)」は残す）"""
    u = u.rstrip(".,;")
    while u.endswith(")") and u.count(")") > u.count("("):
        u = u[:-1].rstrip(".,;")
    return u


def url_enc(u):
    """URL の ( ) を %28 %29 にする（括弧で URL が切れないように）"""
    return u.replace("(", "%28").replace(")", "%29")


def md_protect_urls(md):
    """Markdown 変換の前に URL を守る：
    ・[文字](URL) の URL は括弧の対応を見て全体を取り出し、中の ( ) を %28 %29 に
    ・地の文の URL は「_」「*」が強調にならないよう \\ を付ける"""
    out, i = [], 0
    while True:
        j = md.find("](http", i)
        if j < 0:
            break
        k, depth = j + 2, 1
        while k < len(md) and md[k] not in "\n":
            if md[k] == "(":
                depth += 1
            elif md[k] == ")":
                depth -= 1
                if depth == 0:
                    break
            k += 1
        if depth != 0:
            out.append(md[i:j + 2])
            i = j + 2
            continue
        inner = md[j + 2:k]
        m = re.match(r"(\S+)(\s+\".*\")?$", inner)
        url, title = (m.group(1), m.group(2) or "") if m else (inner, "")
        out.append(md[i:j + 2] + url_enc(url) + title + ")")
        i = k + 1
    out.append(md[i:])
    md = "".join(out)

    def bare(m):
        return re.sub(r"(?<!\\)([_*])", r"\\\1", m.group(0))
    return re.sub(r"(?<![(<\"=\w])https?://[^\s<>（）「」『』、。　\]]+", bare, md)


def load_linkcheck():
    try:
        return json.loads(LINKCHECK.read_text(encoding="utf-8"))
    except Exception:  # noqa
        return {}


def url_ok(url, lc):
    """参考文献に残してよい URL か。britannica の print/EBchecked は無条件で捨てる。
    tools/linkcheck.py の結果（tools/linkcheck.json）があり 200 でなければ捨てる。未確認は残す"""
    if _BAD_URL.search(url) or _BLOG_URL.search(url):
        return False
    r = lc.get(url) or lc.get(url.rstrip("/")) or lc.get(unquote(url).replace("%28", "(").replace("%29", ")"))
    if r and r.get("status") != 200:
        return False
    return True


_CITE_A = re.compile(r'<a href="(https?://[^"]+)" target="_blank" rel="noopener">(.*?)</a>', re.S)


def strip_citations(body):
    """本文中の外部リンクを外す。「（出典名）」だけの文字列は丸ごと消し、ほかは文字だけ残す。
    返り値：(本文, [(出典名, URL)])"""
    cites = []

    def rep(m):
        url, text = m.group(1), m.group(2)
        plain = _plain(text)
        cites.append((plain.strip("（）()"), url))
        if re.fullmatch(r"（.*）|\(.*\)", plain.strip()):
            return ""
        return text
    body = _CITE_A.sub(rep, body)
    body = re.sub(r"(?<=[。、」』）])\s+(?=<)", "", body)
    return body, cites


def pop_references(body):
    """本文中の <h2>参考文献</h2> の節を取り出す。返り値：(節を除いた本文, 項目の文字列の一覧)"""
    m = re.search(r"<h2>参考文献</h2>\s*(.*?)(?=<h2>|\Z)", body, re.S)
    if not m:
        return body, []
    items = [_plain(x) for x in re.findall(r"<li>(.*?)</li>", m.group(1), re.S)]
    if not items:
        items = [_plain(x) for x in re.findall(r"<p>(.*?)</p>", m.group(1), re.S)]
    return body[:m.start()] + body[m.end():], [i for i in items if i]


def references(sources, cites, lc):
    """前付けの sources と本文中の引用を URL で重複排除して並べる。URL が死んでいる項目は落とす"""
    out, seen = [], set()
    for s_ in sources:
        urls = _URL.findall(s_)
        u = url_clean(urls[0]) if urls else ""
        if u and not url_ok(u, lc):
            continue
        k = u.rstrip("/") or s_
        if k in seen:
            continue
        seen.add(k)
        out.append(s_)
    for name, u in cites:
        k = u.rstrip("/")
        if k in seen or not url_ok(u, lc):
            continue
        seen.add(k)
        out.append(f"{name} {u}" if name else u)
    return out


# ---------------------------------------------------------------- 用語の自動相互リンク
TERM_STOP = {"世紀", "20世紀", "時代", "作品", "記譜と理論", "形式とジャンル", "声楽と教会音楽", "演奏と楽器", "要点", "よくある質問", "出典", "参考文献", "成立", "概要", "まとめ", "基本情報", "生涯", "作風", "代表作", "聴き方",
             "編成", "受容と録音", "時代と背景", "作家", "見方", "どこで見られるか", "用語", "作品", "作曲家", "時代", "社会と制度", "様式",
             "編成と演奏時間", "楽章ごとの聴きどころ", "演奏史と解釈", "もっと深く", "はじめに", "背景", "歴史", "特徴", "構成",
             # 一般語・紛れ語（文中にふつうに出る語はリンクしない）
             "音楽", "曲", "演奏", "楽器", "旋律", "和声", "リズム", "作曲", "歌", "声", "音", "ワイン", "酒", "料理", "香り",
             "味", "色", "絵", "美術", "画家", "建築", "彫刻", "拍", "主題", "形式", "楽章", "合唱", "独奏", "歌手",
             "オーケストラ", "指揮", "指揮者", "ピッチ", "ウード"}
# 別人・固有名：それ自体はリンクしないが、辞書には入れて中の短い語（バッハ・シューマン等）のリンクを防ぐ（最長一致）
TERM_EXCLUDE = {"J. C. バッハ", "J.C.バッハ", "J. C. Bach", "ヨハン・クリスティアン・バッハ", "ヴィルヘルム・フリーデマン・バッハ",
                "W. F. バッハ", "J. Ch. バッハ", "ヨハン・シュトラウス", "ヨハン・シュトラウス2世", "ヨハン・シュトラウス1世",
                "J. シュトラウス", "クララ・シューマン", "クララ・ヴィーク", "グスタフ・マーラー・ユーゲント管弦楽団",
                "マーラー・ユーゲント管弦楽団", "マーラー・チェンバー・オーケストラ", "ユーゲント管弦楽団",
                "ベートーヴェン・ハウス", "パリ・オペラ座", "イングリッシュ・ホルン", "ヴィオラ・ダ・ガンバ", "ヴィオラ・ダモーレ",
                "ボストン・バロック", "イングリッシュ・バロック・ソロイスツ", "ロンドン", "アリアドネ", "エラスバッハ"}
# 頭文字つきの表記（同じ人の別表記）
TERM_INITIALS = {"J. S. バッハ": "bach-js", "J.S.バッハ": "bach-js", "J. S. Bach": "bach-js", "J.S. Bach": "bach-js",
                 "C. P. E. バッハ": "bach-cpe", "C.P.E.バッハ": "bach-cpe", "C. P. E. Bach": "bach-cpe", "C.P.E. Bach": "bach-cpe",
                 "R. シュトラウス": "strauss-r", "R.シュトラウス": "strauss-r", "R. Strauss": "strauss-r"}
ALIAS_DENY = {"パート", "リスト", "山田", "團", "細川", "武満", "美術館", "博物館"}  # 一般語と紛れる姓
TERM_PIN = {"印象派": "/art/western/birth-of-impressionism/", "印象派展": "/art/western/birth-of-impressionism/"}
TERM_SECTIONS = {"theory", "instruments", "glossary"}  # 見出しを用語にする分野


def heading_terms(text):
    """見出し「通奏低音（バッソ・コンティヌオ）」→ ['通奏低音', 'バッソ・コンティヌオ']"""
    t = re.split(r"——|：|:", text)[0].strip()
    m = re.match(r"^(.+?)（(.+)）$", t)
    terms = [t]
    if m:
        terms = [m.group(1).strip()] + [x.strip() for x in re.split(r"[、，,／/]", m.group(2)) if x.strip()]
    # 「標題音楽（と絶対音楽）」→ 括弧内の先頭の助詞は外して語そのものにする
    terms = [re.sub(r"^[とやのおよび]+(?=[^ぁ-ん])", "", x) if i else x for i, x in enumerate(terms)]
    return [x for x in terms if 2 <= len(x) <= 14 and x not in TERM_STOP and not re.search(r"[。、]", x)
            and not re.match(r"^[ぁ-ん]", x)]


def build_terms(S):
    """全ページの題名・aliases・（用語の分野の）見出しから用語辞書を作る。term → (path, anchor)"""
    T = {}

    def add(term, path, anchor=""):
        term = (term or "").strip()
        if len(term) < 2 or term in TERM_STOP or term in ALIAS_DENY:
            return
        T.setdefault(term, (path, anchor))  # 先に登録したものが勝つ（頁 > 見出し）
    for c in S.composers:
        p = f'/music/composers/{c["id"]}/'
        add(c["name"], p)
        add(S.surname(c), p)
        for al in c.get("aliases") or []:
            add(al, p)
    for e in S.eras:
        p = f'/music/eras/{e["id"]}/'
        add(e["name"], p)
        for al in e.get("aliases") or []:
            add(al, p)
    for k in S.concepts:
        p = f'/music/concepts/{k["id"]}/'
        add(k["title"], p)
        for al in k.get("aliases") or []:
            add(al, p)
    for a in S.articles.values():
        if a["faculty"] == "lingua":
            continue
        p = a["path"]
        add(a["title"], p)
        add(re.split(r"——", a["title"])[0].strip(), p)
        m = re.search(r"《([^》]+)》", a["title"])
        if m and a["section"] == "works":
            add(f"《{m.group(1)}》", p)
        for al in a.get("aliases") or []:
            add(al, p)
    for a in S.articles.values():
        if a["section"] in TERM_SECTIONS or a.get("glossary"):
            for hid, num, text, lv in a.get("toc", []):
                if hid == "faq":
                    continue
                for t in heading_terms(text):
                    add(t, a["path"], hid)
    for t, cid in TERM_INITIALS.items():
        if cid in S.C:
            T.setdefault(t, (f"/music/composers/{cid}/", ""))
    for t, pth in TERM_PIN.items():
        T[t] = (pth, "")  # 行き先を固定する語（分野をまたいで紛れる語）
    for t in TERM_EXCLUDE:
        T[t] = None  # 除外語（リンクしない）
    S.terms = T
    terms = sorted(T, key=len, reverse=True)
    S.term_re = re.compile("|".join(re.escape(t) for t in terms)) if terms else None


_TAG = re.compile(r"<[^>]+>")
_SKIP_TAGS = {"a", "h1", "h2", "h3", "h4", "code", "pre", "summary", "nav", "figure", "th", "details", "script", "style"}


def autolink(S, body, self_path):
    """本文の用語の最初の出現1回だけを該当ページ（節）へリンクする。見出し・リンク・コード・目次・一覧の中は除外。
    語境界はインラインのタグ（a・strong・mark など）をまたいで前後の文字で判定する"""
    if not getattr(S, "term_re", None) or not body:
        return body
    toks, pos = [], 0  # ("t", 文字列) / ("g", タグ)
    for m in _TAG.finditer(body):
        if m.start() > pos:
            toks.append(("t", body[pos:m.start()]))
        toks.append(("g", m.group(0)))
        pos = m.end()
    if pos < len(body):
        toks.append(("t", body[pos:]))

    def is_inline(tag):
        tm = re.match(r"</?([a-zA-Z0-9]+)", tag)
        return bool(tm) and tm.group(1).lower() in _INLINE_TAGS

    def after_of(i):
        s_ = ""
        for k, v in toks[i + 1:]:
            if k == "g":
                if not is_inline(v):
                    break
                continue
            s_ += html.unescape(v)
            if len(s_) >= 2:
                break
        return s_[:2]
    out, used, skip, prev = [], set(), [], ""
    for i, (k, v) in enumerate(toks):
        if k == "t":
            out.append(_link_text(S, v, self_path, used, prev, after_of(i)) if not skip else v)
            prev = (prev + html.unescape(v))[-6:]
            continue
        tag = v
        tm = re.match(r"<(/?)([a-zA-Z0-9]+)", tag)
        if tm:
            closing, name = tm.group(1), tm.group(2).lower()
            if name not in _INLINE_TAGS:
                prev = ""
            is_list = name == "ul" and 'class="va-list' in tag
            if name in _SKIP_TAGS or is_list:
                if closing:
                    if skip and skip[-1] == name:
                        skip.pop()
                elif not tag.endswith("/>"):
                    skip.append(name)
        out.append(tag)
    return "".join(out)


_INLINE_TAGS = {"a", "mark", "em", "strong", "b", "i", "span", "small", "sup", "sub", "cite", "abbr", "time", "q"}
_KATA = r"\u30A0-\u30FF\uFF65-\uFF9F"  # カタカナ・長音「ー」・中黒「・」・半角カナ
_LAT = r"A-Za-z\u00C0-\u024F"
_KAN = r"\u4E00-\u9FFF\u3005"
_CAT = {"k": re.compile(f"[{_KATA}]"), "l": re.compile(f"[{_LAT}0-9]"), "h": re.compile(f"[{_KAN}]")}
_JOIN = {"k": re.compile(f"[{_KATA}{_LAT}]"), "l": re.compile(f"[{_LAT}0-9{_KATA}]"), "h": re.compile(f"[{_KAN}]")}
_INITIAL = re.compile(r"(?:^|[^A-Za-z])[A-Z]\.\s?$")


def _cat(ch):
    for k, r in _CAT.items():
        if r.match(ch):
            return k
    return ""


def term_boundary_ok(t, before, after):
    """日本語の語境界：カタカナ語は前後がカタカナ・ー・・・英字でない、漢字語は前後が漢字でない、英字語は前後が英数字でない"""
    c0, c1 = _cat(t[0]), _cat(t[-1])
    if before and c0 and _JOIN[c0].match(before[-1]):
        return False
    if after and c1 and _JOIN[c1].match(after[0]):
        return False
    if _INITIAL.search(before or ""):  # 「C. P. E. バッハ」の「バッハ」など、頭文字の後の姓は別人のことがある
        return False
    return True


def _link_text(S, text, self_path, used, prev="", nxt=""):
    def rep(m):
        t = m.group(0)
        hit = S.terms.get(t)
        if hit is None:
            return t
        before = (prev + text[:m.start()])[-6:]
        after = (text[m.end():] + nxt)[:2]
        if not term_boundary_ok(t, before, after):
            return t
        path, anchor = hit
        if path == self_path or (path, anchor) in used:
            return t
        used.add((path, anchor))
        href = path + (f"#{quote(anchor)}" if anchor else "")
        return f'<a class="tl" href="{href}">{t}</a>'
    return S.term_re.sub(rep, text)


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
<link rel="icon" href="/favicon.ico" sizes="any"><link rel="icon" href="/veliq-mark.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="stylesheet" href="/assets/vq-ui.css?v={CSS_V}">
{lds}{VQ_ORG if path in ("", "/", "index.html") else ""}</head>
"""


def fac_of(cur):
    """cur（分野の id）→ 学科"""
    if cur in ("art",) or cur in ART_SEC_NAME:
        return "art"
    if cur in ("lingua",) or cur in LINGUA_SEC_NAME:
        return "lingua"
    if cur in ("music",) or cur in SEC_NAME:
        return "music"
    return ""


def header(S, cur):
    """56px のヘッダー：左にワードマーク、「音楽」「美術」「語学」の文字タブ、右にメニュー"""
    fac = fac_of(cur)
    tabs = [("/music/", "音楽", "music")]
    if S.arts_of("art"):
        tabs.append(("/art/", "美術", "art"))
    if S.arts_of("lingua"):
        tabs.append(("/lingua/", "語学", "lingua"))
    g = "".join(f'<a href="{h}"{" class=\"on\" aria-current=\"page\"" if f == fac else ""}>{t}</a>' for h, t, f in tabs)
    music = [("/music/", "音楽学科のトップ", "music")] + [
        (f"/music/{s}/", n, s) for s, n in SECTIONS
        if s in DATA_SECTIONS or S.arts_in(s)]
    ml = "".join(f'<a href="{h}"{" class=\"on\"" if c == cur else ""}>{esc(t)}</a>' for h, t, c in music)
    art = [("/art/", "美術学科のトップ", "art")] + [(f"/art/{s}/", n, s) for s, n in ART_SECTIONS if S.arts_in(s)]
    al = "".join(f'<a href="{h}"{" class=\"on\"" if c == cur else ""}>{esc(t)}</a>' for h, t, c in art)
    ag = f'<div class="mg"><div class="mh">美術</div><div class="ml">{al}</div></div>\n  ' if S.arts_of("art") else ""
    lg = [("/lingua/", "語学学科のトップ", "lingua")] + [(f"/lingua/{s}/", n, s) for s, n in LINGUA_SECTIONS if S.arts_in(s)]
    ll = "".join(f'<a href="{h}"{" class=\"on\"" if c == cur else ""}>{esc(t)}</a>' for h, t, c in lg)
    ag += f'<div class="mg"><div class="mh">語学</div><div class="ml">{ll}</div></div>\n  ' if S.arts_of("lingua") else ""
    cl = "".join(f'<a href="/concerts/{esc(e["id"])}/">{esc(e["title"])}</a>' for e in S.events)
    return f"""<body>
<a class="va-skip" href="#main">本文へ</a>
<header class="gh">
  <div class="wrap gh-in">
    <a class="brand" href="/">Veliq <b>Academy</b></a>
    <nav class="gnav" aria-label="学科">{g}</nav>
    <button class="burger" id="navBurger" type="button" aria-expanded="false" aria-controls="navMenu" aria-label="メニュー"><span></span><span></span></button>
  </div>
</header>
<div class="menu" id="navMenu">
  <div class="mg"><div class="mh">音楽</div><div class="ml">{ml}</div></div>
  {ag}<div class="mg"><div class="mh">公演・Club</div><div class="ml"><a href="/concerts/">演奏会</a>{cl}<a href="{APP}?from=academy">Veliq アプリで学ぶ</a><a href="{CLUB}">Veliq Club に入会する</a></div></div>
  <div class="mfoot">運営：{PUBLISHER}・監修：{SUPERVISOR}</div>
</div>
"""


def footer(S, extra_js=""):
    """1列のフッター：4つの区分を折りたたみ（学科／公演・Club／運営／法的）。行は44px・15px"""
    def grp(title, links, open_=False):
        a = "".join(f'<a href="{h}">{esc(t)}</a>' for h, t in links)
        return f'<details class="gf-s"{" open" if open_ else ""}><summary>{esc(title)}</summary><div class="gf-l">{a}</div></details>'
    fac = [("/music/", "音楽")] + ([("/art/", "美術")] if S.arts_of("art") else []) + ([("/lingua/", "語学")] if S.arts_of("lingua") else [])
    conc = [("/concerts/", "演奏会")] + [(f'/concerts/{e["id"]}/', e["title"]) for e in S.events] + \
        [(f"{APP}?from=academy", "Veliq アプリで学ぶ"), (CLUB, "Veliq Club")]
    ops = [(VO, "VariOrchestra"), ("https://veliq.jp/", "VELIQ"), ("mailto:info@variorchestra.com", "お問い合わせ")]
    legal = [("/privacy.html", "プライバシーポリシー")]
    return f"""<footer class="gf">
  <div class="wrap">
    <div class="gf-brand">Veliq <b>Academy</b></div>
    {grp("学科", fac)}{grp("公演・Club", conc)}{grp("運営", ops)}{grp("法的", legal)}
    <nav class="vq-fam" aria-label="Veliq のメディア"><p class="vq-fam-h">Veliq のメディア</p><ul><li><a href="https://veliq.jp/">VELIQ</a></li><li><a href="https://veliq-finance.com/">Veliq Finance</a></li><li><a href="https://veliq-table.com/">Veliq Table</a></li><li><a href="https://veliq-living.com/">Veliq Living</a></li><li><a href="https://veliq-vita.com/">Veliq Vita</a></li><li><a href="https://veliq-atelier.com/">Veliq Atelier</a></li><li><a href="https://veliq-career.com/">Veliq Career</a></li><li><a href="https://veliq-works.com/">Veliq Works</a></li><li><a href="https://veliq-academy.com/" aria-current="page">Veliq Academy</a></li><li><a href="https://veliqclub.com/">Veliq Club</a></li></ul></nav>
    <p class="gf-line">運営：{PUBLISHER}・監修：{SUPERVISOR}（{SUPERVISOR_ROLE}）</p>
    <p class="gf-copy">© {PUBLISHER}</p>
  </div>
</footer>
<script src="/assets/vq.js?v={CSS_V}" defer></script>{extra_js}
<script src="/assets/vq-stack.js?v={CSS_V}" defer></script>
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
    """items: [(href, title, sub)] → 一覧（押せる行、56px）"""
    if not items:
        return ""
    return '<ul class="va-list">' + "".join(
        f'<li><a href="{h}"><span><b>{esc(t)}</b>{f"<small>{esc(s)}</small>" if s else ""}</span></a></li>'
        for h, t, s in items) + "</ul>"


def count_rows(items):
    """items: [(href, title, count)] → 右端に件数を出す行（学科・分野の一覧）"""
    if not items:
        return ""
    return '<ul class="va-list va-cnt">' + "".join(
        f'<li><a href="{h}"><span><b>{esc(t)}</b></span><span class="va-c">{esc(c)}</span></a></li>'
        for h, t, c in items) + "</ul>"


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


_KEEP = re.compile(r"(第\d+番|第\d+楽章|作品\d+[a-z]?|Op\.\s?\d+[a-z]?|BWV\s?\d+|K\.\s?\d+)")
def _h1_keep(body):
    # 見出しの中で「第1番」「作品55」などが途中で折れないようにする
    return re.sub(r"<h1([^>]*)>(.*?)</h1>", lambda m: f"<h1{m.group(1)}>" + _KEEP.sub(r'<span class="kn">\1</span>', m.group(2)) + "</h1>", body, count=1, flags=re.S)


def page(S, path, title, desc, body, ld, cur="", lastmod=None, og="article", extra_js=""):
    body = _h1_keep(body)
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
        u = url_clean(m.group(0))
        out += esc(str(s)[i:m.start()]) + f'<a href="{esc(url_enc(u))}" target="_blank" rel="noopener">{esc(u)}</a>'
        i = m.start() + len(u)
    return out + esc(str(s)[i:])


# ---- 記事末尾（出典 → 監修 → 関連 → 演奏会 → 4択 → 入会）
def tail(S, path, sources, related, events, quiz, supervised=True, cites=None, extra=""):
    h = ""
    sources = references(sources or [], cites or [], S.linkcheck)
    if sources:
        h += sec("参考文献", '<ol class="va-src">' + "".join(f"<li>{src_html(s)}</li>" for s in sources) + "</ol>")
        # 監修の表示は、出典つきで書いた記事だけ（データだけのページは未検証の文を含むため）
        if supervised:
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
        h += sec("アプリで学ぶ", f'<div class="va-box"><p class="va-boxp">{esc(quiz["title"])}（{esc(quiz.get("label", ""))}・{len(quiz.get("qs", []))}問）</p><div class="va-acts"><a class="va-btn" href="{esc(q)}">この章を解く（アプリ）</a></div></div>')
    h += extra
    h += sec("Veliq Club", f'<div class="va-acts"><a class="va-btn ln" href="{CLUB}">Veliq Club に入会する</a></div>')
    return h


# ---------------------------------------------------------------- 各ページ
def build_work(S, wid):
    v = work_view(S, wid)
    w, a, c = v["data"], v["art"], v["composer"]
    era = S.E.get(v["era"])
    bc, bld = crumbs([("トップ", "/"), ("音楽", "/music/"), ("作品", "/music/works/"), (v["title"], v["path"])])
    cname = f'<a href="/music/composers/{esc(c["id"])}/">{esc(c["name"])}</a>' if c else ""
    era_l = f'<a href="/music/eras/{esc(era["id"])}/">{esc(era["name"])}</a>' if era else ""
    meta = ""
    body = (a or {}).get("hero") or ""
    body += sec("基本情報", kv_table([("作曲家", cname), ("作曲年", esc(v["year_str"] + "年") if v["year_str"] else ""),
                                   ("調", esc(v["key"])), ("作品番号", esc(v["catalog"])), ("編成", esc(v["scoring"])),
                                   ("演奏時間", esc(v["duration"])), ("ジャンル", esc(v["genre"]) if not a else ""), ("時代", era_l)]))
    if a:
        body += f'<div class="va-body">{autolink(S, a["html"], v["path"])}</div>'
    else:
        if w.get("historicalBackground"):
            w = dict(w, historicalBackground=autolink(S, esc(w["historicalBackground"]), v["path"]))
            body += sec("成立", f'<p>{w["historicalBackground"]}</p>', "va-body")
    # 楽章の表（楽章｜速度｜調｜聴きどころ）
    mv = [m for m in (w or {}).get("movements", []) if (m.get("title") or m.get("description") or m.get("tempo") or m.get("key"))]
    if mv:
        many = len(w["movements"]) > 1 or w.get("genre") in ("symphony", "concerto", "chamber")
        tr = ""
        for m in mv:
            lab = (f'第{m["number"]}楽章' if many and m.get("number") else "") or (m.get("title") or "")
            tempo = m.get("tempo") or (m.get("title") if many and m.get("number") else "")
            hl = "／".join(m.get("highlights") or [])
            if a:
                tr += f'<tr><th>{esc(lab)}</th><td>{esc(tempo or "")}</td><td>{esc(key_name(m.get("key")))}</td><td>{esc(f"約{m["duration"]}分" if m.get("duration") else "")}</td></tr>'
            else:
                tr += f'<tr><th>{esc(lab)}</th><td>{esc(tempo or "")}</td><td>{esc(key_name(m.get("key")))}</td><td>{esc(m.get("description") or hl)}</td></tr>'
        head_ = "<tr><th>楽章</th><th>速度</th><th>調</th><th>時間</th></tr>" if a else "<tr><th>楽章</th><th>速度</th><th>調</th><th>聴きどころ</th></tr>"
        body += sec("楽章の一覧（データ）" if a else "楽章", f'<div class="va-tbl tbl"><table class="va-mt"><thead>{head_}</thead><tbody>{tr}</tbody></table></div>', "va-body")
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
    ch = S.chapters_for(v["composerId"]) if v["composerId"] else []
    ch = [t for t in ch if t["key"] == f"w-{wid}" or t["key"].startswith(f"w-{wid}-")] or ch[:3]
    if ch:
        body += sec("アプリで学ぶ章", quiz_rows(S, v["path"], ch))
    body += sec("聴く", listen_links(f'{S.short(c)} {v["title"]}' if c else v["title"]))
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
    t = tail(S, v["path"], (a or {}).get("sources") or [DATA_SRC], rel, v["events"], None, supervised=bool(a), cites=(a or {}).get("cites"))
    sub = (w or {}).get("titleEn") if w else ""
    hd = f'<header class="va-hd">' + tagline("music", ("works", SEC_NAME["works"]), v["updated"]) + \
        f'<h1>{esc(v["title"])}</h1>' + (f'<p class="va-en" lang="en">{esc(sub)}</p>' if sub else "") + \
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
    page(S, v["path"], f'{S.short(c)} {v["title"]}' if c and not v["title"].startswith(S.short(c)) else v["title"], v["desc"] or v["title"],
         bc + f'<article class="va-art">{hd}{meta}{body}{t}</article>', ld, "works", v["updated"])


DATA_SRC = "Veliq Academy のデータ（veliq-academy/data/*.json）。生没年・出身・作品の年は Britannica で照合した（2026-10-29）"


def kv_table(rows_):
    """基本情報の表（見出し列＋値）。空の値は出さない"""
    rows_ = [(k, v) for k, v in rows_ if v]
    if not rows_:
        return ""
    return '<div class="va-tbl tbl"><table class="va-kv">' + "".join(f"<tr><th>{esc(k)}</th><td>{v}</td></tr>" for k, v in rows_) + "</table></div>"


def build_composer(S, c):
    """作曲家：記事があれば記事、無ければデータから同じ骨組みの頁を組む
    基本情報 → 生涯（年表）→ 作風 → 代表作 → 関連章 → 聴く → 出典"""
    path = f'/music/composers/{c["id"]}/'
    a = S.articles.get(("composers", c["id"]))
    era = S.E.get(c.get("era"))
    bc, bld = crumbs([("トップ", "/"), ("音楽", "/music/"), ("作曲家", "/music/composers/"), (c["name"], path)])
    era_l = f'<a href="/music/eras/{esc(era["id"])}/">{esc(era["name"])}</a>' if era else ""
    basic = kv_table([("生没", esc(f'{c.get("born", "")}年 – {c.get("died", "")}年' if c.get("died") else f'{c.get("born", "")}年 –')),
                      ("出身", esc(c.get("birthplace"))), ("時代", era_l), ("分野", esc("・".join(c.get("style") or [])))])
    ws = [work_view(S, i) for i in all_work_ids(S)]
    ws = sorted([x for x in ws if x["composerId"] == c["id"]], key=lambda x: x["year_n"])
    tl = [t for t in S.timeline if any(r.get("id") == c["id"] for r in t.get("relatedIds", []))]
    body = ""
    if a:
        body += (a.get("hero") or "") + sec("基本情報", basic)
        body += f'<div class="va-body">{autolink(S, a["html"], path)}</div>'
    else:
        body += figure(c.get("portrait"), f'{c["name"]}の肖像', c.get("portraitCredit"), hero=True) if c.get("portrait") else ""
        body += sec("基本情報", basic)
        bio = ""
        if tl:
            bio += '<ul class="va-tl">' + "".join(
                f'<li><span class="va-y">{t["year"]}年</span><span><b>{esc(t["title"])}</b>{esc(t.get("description"))}</span></li>' for t in tl) + "</ul>"
        if c.get("longBio") and c["longBio"] != c.get("shortBio"):
            bio += f'<p>{esc(c["longBio"])}</p>'
        body += sec("生涯", autolink(S, bio, path), "va-body")
    if ws:
        tr = "".join(f'<tr><td><a href="{x["path"]}">{esc(x["title"])}</a></td><td>{esc(x["year_str"]) if x["year_str"] else "—"}</td><td>{esc(x["genre"] or "")}</td></tr>' for x in ws)
        body += sec("代表作", f'<div class="va-tbl tbl"><table><thead><tr><th>作品</th><th>年</th><th>ジャンル</th></tr></thead><tbody>{tr}</tbody></table></div>')
    ch = S.chapters_for(c["id"])
    if ch:
        body += sec("アプリで学ぶ章", quiz_rows(S, path, ch))
    body += sec("聴く", listen_links(c["name"]))
    rel = []
    for key, label in [("teachers", "師"), ("students", "弟子"), ("influencedBy", "影響を受けた作曲家"), ("influenced", "影響を与えた作曲家")]:
        its = [S.C[i] for i in c.get(key, []) if i in S.C]
        if its:
            rel.append((label, [(f'/music/composers/{x["id"]}/', x["name"], S.life(x)) for x in its]))
    same = [x for x in S.composers if x.get("era") == c.get("era") and x["id"] != c["id"]]
    if same:
        rel.append(("同じ時代の作曲家", [(f'/music/composers/{x["id"]}/', x["name"], S.life(x)) for x in sorted(same, key=lambda x: x["born"])[:8]]))
    evs = [e for e in S.events if any(it.get("composerId") == c["id"] for it in e.get("program", []))]
    evs = [S.EV[x] for x in (a or {}).get("concert", []) if x in S.EV and S.EV[x] not in evs] + evs
    srcs = (a or {}).get("sources") or [DATA_SRC]
    t = tail(S, path, srcs, rel, evs, None, supervised=bool(a), cites=(a or {}).get("cites"))
    desc = (a or {}).get("summary") or c.get("shortBio") or c["name"]
    hd = f'<header class="va-hd">' + tagline("music", ("composers", SEC_NAME["composers"]), (a or {}).get("updated")) + \
        f'<h1>{esc((a or {}).get("title") or c["name"])}</h1><p class="va-en" lang="en">{esc(c.get("nameEn"))}（{S.life(c)}）</p>' + \
        f'<p class="va-lede">{esc(desc)}</p></header>'
    person = {"@context": "https://schema.org", "@type": "Person", "@id": url_of(path) + "#person", "name": c["name"],
              "alternateName": c.get("nameEn"), "url": url_of(path)}
    if c.get("born"):
        person["birthDate"] = str(c["born"])
    if c.get("died"):
        person["deathDate"] = str(c["died"])
    if c.get("portrait"):
        person["image"] = c["portrait"]
    ld = [article_ld(c["name"], desc, path, (a or {}).get("updated"), {"@id": url_of(path) + "#person"}), bld, person]
    page(S, path, c["name"], desc, bc + f'<article class="va-art">{hd}{body}{t}</article>', ld, "composers",
         (a or {}).get("updated"))


def build_era(S, e, i):
    path = f'/music/eras/{e["id"]}/'
    a = S.articles.get(("eras", e["id"]))
    bc, bld = crumbs([("トップ", "/"), ("音楽", "/music/"), ("時代", "/music/eras/"), (e["name"], path)])
    meta = sec("基本情報", kv_table([("年代", esc(e.get("period"))), ("主なジャンル", esc("・".join(e.get("keyGenres") or []))),
                                   ("演奏の場", esc("・".join(e.get("venues") or []))), ("楽器", esc("・".join(e.get("instruments") or [])))]))
    if a:
        body = f'<div class="va-body">{autolink(S, a["html"], path)}</div>'
    else:
        body = sec("概要", f'<p>{esc(e.get("overview"))}</p>' if e.get("overview") else "", "va-body")
        mc = "".join(f'<h3>{esc(x["title"])}</h3><p>{esc(x["description"])}</p>' for x in e.get("musicalCharacteristics") or [])
        body += sec("音楽の特徴", mc, "va-body")
        hc = e.get("historicalContext") or {}
        hct = "".join(f'<h3>{lab}</h3><p>{esc(hc[k])}</p>' for k, lab in [("political", "政治・社会"), ("philosophical", "思想"), ("artistic", "美術・建築")] if hc.get(k))
        body += sec("時代の背景", hct, "va-body")
        ss = "".join(f'<h3>{esc(x["title"])}</h3>' + (f'<p class="va-note">{esc(x["years"])}</p>' if x.get("years") else "") + f'<p>{esc(x["body"])}</p>' for x in e.get("subsections") or [])
        body += sec("主な動き", ss, "va-body")
        body = autolink(S, body, path)
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
    hd = f'<header class="va-hd">' + tagline("music", ("eras", SEC_NAME["eras"]), (a or {}).get("updated")) + \
        f'<h1>{esc((a or {}).get("title") or e["name"])}</h1><p class="va-lede">{esc(desc)}</p></header>'
    ld = [article_ld(e["name"], desc, path, (a or {}).get("updated")), bld]
    page(S, path, f'{e["name"]}（{e.get("period", "")}）', desc, bc + f'<article class="va-art">{hd}{meta}{body}{t}</article>', ld, "eras",
         (a or {}).get("updated"))


def build_concept(S, k):
    path = f'/music/concepts/{k["id"]}/'
    a = S.articles.get(("concepts", k["id"]))
    bc, bld = crumbs([("トップ", "/"), ("音楽", "/music/"), ("形式と概念", "/music/concepts/"), (k["title"], path)])
    meta = sec("基本情報", kv_table([("分類", esc(CONCEPT_CAT.get(k.get("category"), "")))]))
    body = f'<div class="va-body">{a["html"]}</div>' if a else sec("解説", f'<p>{esc(k.get("body"))}</p>' if k.get("body") else "", "va-body")
    body = autolink(S, body, path)
    rel = []
    rc = [S.K[x] for x in k.get("relatedConcepts", []) if x in S.K]
    if rc:
        rel.append(("関連する概念", [(f'/music/concepts/{x["id"]}/', x["title"], x.get("titleEn")) for x in rc]))
    rp = [S.C[x] for x in k.get("relatedComposers", []) if x in S.C]
    if rp:
        rel.append(("関連する作曲家", [(f'/music/composers/{x["id"]}/', x["name"], S.life(x)) for x in rp]))
    t = tail(S, path, (a or {}).get("sources"), rel, [S.EV[x] for x in (a or {}).get("concert", []) if x in S.EV], None)
    desc = (a or {}).get("summary") or k.get("shortDescription") or k["title"]
    hd = f'<header class="va-hd">' + tagline("music", ("concepts", SEC_NAME["concepts"]), (a or {}).get("updated")) + \
        f'<h1>{esc((a or {}).get("title") or k["title"])}</h1>' + \
        (f'<p class="va-en" lang="en">{esc(k["titleEn"])}</p>' if k.get("titleEn") else "") + f'<p class="va-lede">{esc(desc)}</p></header>'
    ld = [article_ld(k["title"], desc, path, (a or {}).get("updated")), bld]
    page(S, path, k["title"], desc, bc + f'<article class="va-art">{hd}{meta}{body}{t}</article>', ld, "concepts",
         (a or {}).get("updated"))


def build_article(S, a):
    """作品・作曲家・時代・概念以外の分野の記事"""
    sec_, fac = a["section"], a["faculty"]
    path = a["path"]
    sn = sec_name(fac, sec_)
    bc, bld = crumbs([("トップ", "/"), (FAC_NAME[fac], f"/{fac}/")] + ([] if a.get("glossary") else [(sn, f"/{fac}/{sec_}/")]) + [(a["title"], path)])
    c = S.C.get(a.get("composer"))
    era = S.E.get(a.get("era"))
    meta = kv_table([("作曲家", f'<a href="/music/composers/{esc(c["id"])}/">{esc(c["name"])}</a>' if c else ""),
                     ("時代", f'<a href="/music/eras/{esc(era["id"])}/">{esc(era["name"])}</a>' if era else "")])
    if fac == "lingua":
        return build_lingua_unit(S, a, bc, bld)
    body = f'<div class="va-body">{autolink(S, a["html"], path)}</div>'
    rel = []
    if c:
        rel.append(("作曲家", [(f'/music/composers/{c["id"]}/', c["name"], S.life(c))]))
    others = [x for x in S.arts_in(sec_) if x["slug"] != a["slug"]]
    if others:
        rel.append((f"{sn}のほかの記事", [(x["path"], x["title"], x.get("summary", "")) for x in others[:8]]))
    quiz = S.quiz_for(a.get("composer"), a.get("era") or (c or {}).get("era"), a.get("quiz"))
    if a.get("quiz") and not quiz:
        warn(f'{a["file"]}: quiz「{a["quiz"]}」は quiz-bank.js にありません')
    t = tail(S, path, a.get("sources"), rel, [S.EV[x] for x in a.get("concert", []) if x in S.EV], quiz, cites=a.get("cites"))
    desc = a.get("summary") or a["title"]
    hd = (a.get("hero") or "") + f'<header class="va-hd">' + tagline(fac, (sec_, sn), a.get("updated")) + f'<h1>{esc(a["title"])}</h1>' + \
        (f'<p class="va-lede">{esc(a["summary"])}</p>' if a.get("summary") else "") + '</header>'
    ld = [article_ld(a["title"], desc, path, a.get("updated")), bld]
    page(S, path, a["title"], desc, bc + f'<article class="va-art">{hd}{meta}{body}{t}</article>', ld, sec_, a.get("updated"))


def lingua_name(a):
    """一覧の行の名前：「カフェで注文（英語）——…」→「カフェで注文」"""
    return re.sub(r"（(?:%s)）$" % "|".join(LINGUA_SEC_NAME.values()), "", re.split(r"——", a["title"])[0])


def lingua_units(S, s):
    """言語ごとのユニットを、はじめの一歩 → 場面、order の順に"""
    g = {n: i for i, n in enumerate(LINGUA_GROUPS)}
    return sorted(S.arts_in(s), key=lambda a: (g.get(a.get("group"), 9), int(a.get("order") or 999), a["slug"]))


def build_lingua_unit(S, a, bc, bld):
    """語学のユニット（場面ノート）。用語の自動リンクはかけない（外国語の語句が誤ってつながるため）"""
    s, path = a["section"], a["path"]
    sn = LINGUA_SEC_NAME[s]
    us = lingua_units(S, s)
    i = next(k for k, x in enumerate(us) if x["slug"] == a["slug"])
    nav = []
    if i > 0:
        nav.append((us[i - 1]["path"], us[i - 1]["title"], f"前のユニット・{us[i - 1].get('group', '')}"))
    if i + 1 < len(us):
        nav.append((us[i + 1]["path"], us[i + 1]["title"], f"次のユニット・{us[i + 1].get('group', '')}"))
    rel = [("続けて読む", nav)] if nav else []
    app = sec("アプリで練習する", '<div class="va-box"><p class="va-boxp">このノートのフレーズで10問（並び替え・穴埋め・聞き取りなど）と、場面の会話。</p>'
              f'<div class="va-acts"><a class="va-btn" href="{APP}?from=academy">アプリで練習する</a></div></div>')
    t = tail(S, path, a.get("sources"), rel, [], None, cites=a.get("cites"), extra=app)
    desc = a.get("summary") or a["title"]
    hd = f'<header class="va-hd">' + tagline("lingua", (s, sn), a.get("updated")) + f'<h1>{esc(a["title"])}</h1>' + \
        (f'<p class="va-lede">{esc(a["summary"])}</p>' if a.get("summary") else "") + '</header>'
    ld = [article_ld(a["title"], desc, path, a.get("updated"), about={"@type": "Language", "name": sn, "alternateName": s}), bld]
    page(S, path, a["title"], desc, bc + f'<article class="va-art">{hd}<div class="va-body">{a["html"]}</div>{t}</article>', ld, s, a.get("updated"))


def build_lingua(S):
    """語学学科のトップと言語ごとの一覧（はじめの一歩・場面）"""
    if not S.arts_of("lingua"):
        return
    for s, n in LINGUA_SECTIONS:
        us = lingua_units(S, s)
        if not us:
            continue
        path = f"/lingua/{s}/"
        bc, bld = crumbs([("トップ", "/"), ("語学", "/lingua/"), (n, path)])
        h, cnt = "", []
        for g in LINGUA_GROUPS:
            x = [a for a in us if a.get("group") == g]
            if x:
                cnt.append(f"{g} {len(x)}本")
                h += sec(g, rows([(a["path"], lingua_name(a), a.get("summary")) for a in x]))
        lede = f"{n}のユニット{len(us)}本（{'・'.join(cnt)}）。各ユニットは要点・キーフレーズ・単語・文法・文化メモ・よくある間違い。"
        page(S, path, n, lede, bc + f'<header class="va-hd"><h1>{esc(n)}</h1><p class="va-lede">{esc(lede)}</p></header>' + h,
             [bld], s, max(str(a.get("updated", "")) for a in us) or None)
    path = "/lingua/"
    bc, bld = crumbs([("トップ", "/"), ("語学", path)])
    h = sec("言語", count_rows([(f"/lingua/{s}/", n, f"{len(S.arts_in(s))}") for s, n in LINGUA_SECTIONS if S.arts_in(s)]))
    for s, n in LINGUA_SECTIONS:
        first = [a for a in lingua_units(S, s) if a.get("group") == LINGUA_GROUPS[0]]
        if first:
            h += sec(f"{n}・{LINGUA_GROUPS[0]}", rows([(a["path"], lingua_name(a), a.get("summary")) for a in first]))
    h += sec("アプリと会員", f'<div class="va-acts"><a class="va-btn" href="{APP}?from=academy">アプリで練習する</a><a class="va-btn ln" href="{CLUB}">Veliq Club に入会する</a></div>')
    desc = "英語とイタリア語を、旅先の場面ごとに要点・キーフレーズ・単語・文法・文化メモでまとめる。Veliq アプリの語学コースの場面ノートと同じ内容。"
    ld = [bld, {"@context": "https://schema.org", "@type": "CollectionPage", "name": "語学", "url": url_of(path), "inLanguage": "ja",
                "publisher": {"@type": "Organization", "name": PUBLISHER}}]
    page(S, path, "語学", desc, bc + f'<header class="va-hd"><h1>語学</h1><p class="va-lede">{esc(desc)}</p></header>' + h,
         ld, "lingua", max(str(a.get("updated", "")) for a in S.arts_of("lingua")) or None, og="website")


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
        if s in DATA_SECTIONS or s == "glossary":
            continue
        arts = S.arts_in(s)
        if not arts:
            continue
        path = f"/music/{s}/"
        bc, bld = crumbs([("トップ", "/"), ("音楽", "/music/"), (n, path)])
        page(S, path, n, f"{n}の記事{len(arts)}本。", bc + f'<header class="va-hd"><h1>{esc(n)}</h1><p class="va-lede">記事 {len(arts)}本。新しい順。</p></header>' +
             rows([(a["path"], a["title"], a.get("summary")) for a in arts]), [bld], s,
             max(str(a.get("updated", "")) for a in arts) or None)


def build_art(S):
    """美術学科のトップと分野の一覧（記事があるときだけ）"""
    if not S.arts_of("art"):
        return
    for s, n in ART_SECTIONS:
        arts = S.arts_in(s)
        if not arts:
            continue
        path = f"/art/{s}/"
        bc, bld = crumbs([("トップ", "/"), ("美術", "/art/"), (n, path)])
        page(S, path, n, f"{n}の記事{len(arts)}本。", bc + f'<header class="va-hd"><h1>{esc(n)}</h1><p class="va-lede">記事 {len(arts)}本。新しい順。</p></header>' +
             rows([(a["path"], a["title"], a.get("summary")) for a in arts]), [bld], s,
             max(str(a.get("updated", "")) for a in arts) or None)
    path = "/art/"
    bc, bld = crumbs([("トップ", "/"), ("美術", path)])
    h = sec("分野", count_rows([(f"/art/{s}/", n, f"{len(S.arts_in(s))}") for s, n in ART_SECTIONS if S.arts_in(s)]))
    news = sorted(S.arts_of("art"), key=lambda a: (str(a.get("updated", "")), a["title"]), reverse=True)[:6]
    if news:
        h += sec("新着", rows([(a["path"], a["title"], ART_SEC_NAME[a["section"]]) for a in news]))
    desc = "西洋美術・日本美術・彫刻と建築・美術館。作家・作品・所蔵館を出典つきで解説する。監修：佐藤瑛吾。"
    ld = [bld, {"@context": "https://schema.org", "@type": "CollectionPage", "name": "美術", "url": url_of(path), "inLanguage": "ja",
                "publisher": {"@type": "Organization", "name": PUBLISHER}}]
    page(S, path, "美術", desc, bc + f'<header class="va-hd"><h1>美術</h1><p class="va-lede">{esc(desc)}</p></header>' + h,
         ld, "art", max(str(a.get("updated", "")) for a in S.arts_of("art")) or None, og="website")


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
        prep = rows([(a["path"], a["title"], sec_name(a["faculty"], a["section"])) for a in arts])
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
    """音楽学科のトップ：短いリード＋分野の行（件数つき）＋新着"""
    path = "/music/"
    bc, bld = crumbs([("トップ", "/"), ("音楽", path)])
    nw = len(all_work_ids(S))
    counts = {"works": nw, "composers": len(S.composers), "eras": len(S.eras), "timeline": len(S.timeline), "concepts": len(S.concepts)}
    items = []
    for s, n in SECTIONS:
        if s in DATA_SECTIONS:
            items.append((f"/music/{s}/", n, f"{counts[s]}"))
        elif S.arts_in(s):
            items.append((f"/music/{s}/", n, f"{len(S.arts_in(s))}"))
    h = sec("分野", count_rows(items))
    news = sorted(S.arts_of("music"), key=lambda a: (str(a.get("updated", "")), a["title"]), reverse=True)[:6]
    if news:
        h += sec("新着", rows([(a["path"], a["title"], SEC_NAME[a["section"]]) for a in news]))
    desc = "作品・作曲家・時代・音楽史・楽器・楽典。記事の末尾に参考文献を付ける。監修：佐藤瑛吾（指揮者・VariOrchestra 音楽監督）。"
    ld = [bld, {"@context": "https://schema.org", "@type": "CollectionPage", "name": "音楽", "url": url_of(path), "inLanguage": "ja",
                "publisher": {"@type": "Organization", "name": PUBLISHER}}]
    page(S, path, "音楽", desc, bc + f'<header class="va-hd"><h1>音楽</h1><p class="va-lede">{esc(desc)}</p></header>' + h,
         ld, "music", og="website")


def build_home(S):
    """学校のトップ：学科の行（件数つき）＋演奏会＋アプリ"""
    path = "/"
    nw = len(all_work_ids(S))
    na = len(S.arts_of("music"))
    arts = S.arts_of("art")
    n_music = len(S.composers) + nw + len(S.eras) + len(S.concepts) + na
    lede = "音楽と美術の作品・作家・時代を、参考文献つきで解説する学習サイト。" if arts else "音楽の作品・作曲家・時代を、参考文献つきで解説する学習サイト。"
    if S.arts_of("lingua"):
        lede = lede.replace("学習サイト。", "学習サイト。英語とイタリア語は旅先の場面ごとにまとめる。")
    h = '<header class="va-hd va-home"><h1>Veliq <span class="va-gold">Academy</span></h1>' + \
        f'<p class="va-lede">{lede}</p></header>'
    fac_rows = [("/music/", "音楽", f"{n_music}")]
    if arts:
        fac_rows.append(("/art/", "美術", f"{len(arts)}"))
    if S.arts_of("lingua"):
        fac_rows.append(("/lingua/", "語学", f"{len(S.arts_of('lingua'))}"))
    h += sec("学科", count_rows(fac_rows))
    if S.events:
        h += sec("演奏会", rows([(f'/concerts/{e["id"]}/', e["title"], f'{jdate(e.get("date"))}・{e.get("venue", "")}') for e in S.events]))
    h += sec("アプリと会員", f'<div class="va-acts"><a class="va-btn" href="{APP}?from=academy">Veliq アプリで学ぶ</a><a class="va-btn ln" href="{CLUB}">Veliq Club に入会する</a></div>')
    ld = [{"@context": "https://schema.org", "@type": "WebSite", "name": "Veliq Academy", "url": SITE + "/", "inLanguage": "ja",
           "publisher": {"@type": "Organization", "name": PUBLISHER, "url": VO, "email": "info@variorchestra.com"}}]
    page(S, path, "Veliq Academy", f"{lede}監修：{SUPERVISOR}。運営：{PUBLISHER}。",
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
    if S.arts_of("music"):
        L += ["", "## 記事"]
        for a in sorted(S.arts_of("music"), key=lambda a: (a["section"], a["slug"])):
            L.append(f'- [{a["title"]}]({SITE}{a["path"]}): {a.get("summary", "")}'.rstrip(": "))
    if S.arts_of("art"):
        L += ["", "## 美術", f"- [美術学科のトップ]({SITE}/art/)"]
        L += [f"- [{n}]({SITE}/art/{s}/)" for s, n in ART_SECTIONS if S.arts_in(s)]
        L += ["", "## 美術の記事"]
        order = {s: i for i, (s, _) in enumerate(ART_SECTIONS)}
        for a in sorted(S.arts_of("art"), key=lambda a: (order.get(a["section"], 9), a["slug"])):
            L.append(f'- [{a["title"]}]({SITE}{a["path"]}): {a.get("summary", "")}'.rstrip(": "))
    if S.arts_of("lingua"):
        L += ["", "## 語学", f"- [語学学科のトップ]({SITE}/lingua/)"]
        L += [f"- [{n}]({SITE}/lingua/{s}/)" for s, n in LINGUA_SECTIONS if S.arts_in(s)]
        L += ["", "## 語学のユニット"]
        for s, _ in LINGUA_SECTIONS:
            for a in lingua_units(S, s):
                L.append(f'- [{a["title"]}]({SITE}{a["path"]}): {a.get("summary", "")}'.rstrip(": "))
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
    S.linkcheck = load_linkcheck()
    build_terms(S)
    # 前回の生成物を消す（消した記事のページが残らないように）
    for d in ("music", "art", "lingua", "concerts"):
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
    build_art(S)
    build_lingua(S)
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
    print(f"ページ {len(S.pages)}（sitemap に載せた数）・記事 {len(S.articles)}（音楽 {len(S.arts_of('music'))}・美術 {len(S.arts_of('art'))}・語学 {len(S.arts_of('lingua'))}）・警告 {len(WARN)}")


if __name__ == "__main__":
    main()
