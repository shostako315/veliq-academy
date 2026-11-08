#!/usr/bin/env python3
"""Veliq 作品目録を全作曲家に広げる（tools/catalog_build.py のベートーヴェン版を一般化したもの）

入力
- data-src/catalog/raw/composers.json, raw/imslp/<id>.jsonl, raw/wd/<id>.json   … tools/catalog_fetch.py の取り込み
- data-src/catalog/nyp/performances.json, nyp/scores.json                       … ニューヨーク・フィルの公開データ（CC0）と所蔵スコアの書誌
- data-src/catalog/curated/beethoven.json, curated/index.json                    … 手で確かめたベートーヴェンの41件と全曲収録の範囲（上書きしない）
- data-src/catalog/openopus/dump.json                                             … Open Opus（CC0）。IMSLP・Wikidata に無い作品を補う
出力
- veliq-academy/data/catalog/<composer>.json, index.json

決まり（tools/catalog_build.py と同じ）
- 値は出典に書かれていることだけ。推測で埋めない（無ければ空）
- 日本語の題は「種類＋番号＋調＋作品番号」の機械的な組み立てか、Wikidata の日本語ラベルだけ。通称は対応表にあるものだけ
- 出典が食い違うときは両方を conflicts に残す
"""
import json, re, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from catalog_build import key_id, key_ja, key_en, strip_wiki, ded_clean, years, movements, minutes, first_perf  # noqa: E402
from catalog_openopus import oo_records, SNAPSHOT as OO_SNAPSHOT  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data-src" / "catalog" / "raw"
NYP = ROOT / "data-src" / "catalog" / "nyp"
OUT = ROOT / "veliq-academy" / "data" / "catalog"
SITE = "https://veliq-academy.com"
FETCHED = "2026-11-08"

# ---- 種類（題名から機械的に決める。順番が大事：細かいものから） ----
G = [
    ("piano-concerto", r"^piano concerto|^concerto for piano|^klavierkonzert"),
    ("violin-concerto", r"^violin concerto|^concerto for violin(?! and)|^violinkonzert"),
    ("cello-concerto", r"^cello concerto|^concerto for cello|^violoncello concerto"),
    ("concerto", r"concerto|konzert(?!stück)"),
    ("piano-sonata", r"^piano sonata|^sonata for piano$|^klaviersonate|^sonata no\.\s*\d+.*\(piano\)"),
    ("violin-sonata", r"^violin sonata|^sonata for violin and piano|^sonata for piano and violin"),
    ("cello-sonata", r"^cello sonata|^sonata for cello and piano|^sonata for piano and cello"),
    ("sonata", r"^sonat[ae]"),
    ("string-quartet", r"^string quartet"),
    ("string-quintet", r"^string quintet"),
    ("piano-trio", r"^piano trio"),
    ("piano-quartet", r"^piano quartet"),
    ("piano-quintet", r"^piano quintet"),
    ("string-symphony", r"^(sinfonia|symphony)\b.*\bfor strings?( orchestra)?\b|^string symphon"),  # メンデルスゾーンの弦楽のための交響曲など。交響曲と番号が重なる
    ("symphonic-poem", r"symphonic poem|tone poem"),
    ("symphony", r"^symphon(y|ie)(?!.*concertante)|^sinfonia(?! concertante)"),
    ("overture", r"overture|ouverture"),
    ("requiem", r"requiem"),
    ("mass", r"^mass\b|^missa|^messe"),
    ("serenade", r"^serenade"),
    ("suite", r"\bsuite\b"),
    ("variations", r"variations"),
    ("prelude", r"^pr[eé]ludes?\b"),
    ("etude", r"^[eé]tudes?\b"),
    ("nocturne", r"^nocturnes?\b"),
    ("waltz", r"^waltz|^valses?\b"),
    ("mazurka", r"^mazurkas?\b"),
    ("polonaise", r"^polonaises?\b"),
    ("ballade", r"^ballades?\b"),
    ("scherzo", r"^scherzo\b"),
    ("impromptu", r"^impromptus?\b"),
    ("fugue", r"\bfugue\b"),
    ("cantata", r"^cantata|^kantate"),
    ("song", r"^songs?\b|^lieder\b"),
    ("oratorio", r"oratorio"),
]
G_JA = {
    "symphony": "交響曲", "piano-sonata": "ピアノ・ソナタ", "violin-sonata": "ヴァイオリン・ソナタ", "cello-sonata": "チェロ・ソナタ",
    "sonata": "ソナタ", "piano-concerto": "ピアノ協奏曲", "violin-concerto": "ヴァイオリン協奏曲", "cello-concerto": "チェロ協奏曲",
    "concerto": "協奏曲", "string-quartet": "弦楽四重奏曲", "string-quintet": "弦楽五重奏曲", "piano-trio": "ピアノ三重奏曲",
    "piano-quartet": "ピアノ四重奏曲", "piano-quintet": "ピアノ五重奏曲", "symphonic-poem": "交響詩", "string-symphony": "弦楽のための交響曲", "overture": "序曲",
    "requiem": "レクイエム", "mass": "ミサ曲", "serenade": "セレナード", "suite": "組曲", "variations": "変奏曲",
    "prelude": "前奏曲", "etude": "練習曲", "nocturne": "夜想曲", "waltz": "ワルツ", "mazurka": "マズルカ",
    "polonaise": "ポロネーズ", "ballade": "バラード", "scherzo": "スケルツォ", "impromptu": "即興曲", "fugue": "フーガ",
    "cantata": "カンタータ", "oratorio": "オラトリオ", "opera": "歌劇", "song": "歌曲", "other": "",
}
# 題名で種類が決まるものだけ「種類＋番号」の和題を組む（組曲・変奏曲などは固有の題が多いので組まない）
NUMBERED = {"symphony", "string-symphony", "piano-sonata", "violin-sonata", "cello-sonata", "piano-concerto", "violin-concerto", "cello-concerto",
            "string-quartet", "string-quintet", "piano-trio", "piano-quartet", "piano-quintet", "prelude", "etude", "nocturne",
            "waltz", "mazurka", "polonaise", "ballade", "scherzo", "impromptu"}
# 通称（IMSLP の Alternative Title・英語の通称 → 日本で通っている表記）。ここに無いものは英語のまま aliases に残す
NICK = {
    "eroica": "英雄", "pastoral": "田園", "choral": "合唱", "moonlight": "月光", "moonlight sonata": "月光", "pathétique": "悲愴",
    "pathetique": "悲愴", "appassionata": "熱情", "les adieux": "告別", "emperor": "皇帝", "unfinished": "未完成",
    "from the new world": "新世界より", "new world": "新世界より", "jupiter": "ジュピター", "surprise": "驚愕", "military": "軍隊",
    "the clock": "時計", "clock": "時計", "drumroll": "太鼓連打", "london": "ロンドン", "revolutionary": "革命", "raindrop": "雨だれ",
    "heroic": "英雄", "minute": "小犬", "titan": "巨人", "resurrection": "復活", "tragic": "悲劇的", "romantic": "ロマンティック",
    "rhenish": "ライン", "italian": "イタリア", "scottish": "スコットランド", "spring": "春", "kreutzer": "クロイツェル",
    "archduke": "大公", "trout": "ます", "death and the maiden": "死と乙女", "american": "アメリカ", "the lark": "ひばり",
    "lark": "ひばり", "great": "グレート", "the great": "グレート", "little russian": "小ロシア", "winter daydreams": "冬の日の幻想",
    "linz": "リンツ", "prague": "プラハ", "haffner": "ハフナー", "paris": "パリ", "farewell": "告別", "oxford": "オックスフォード",
    "the hunt": "狩", "tempest": "テンペスト", "the tempest": "テンペスト", "waldstein": "ワルトシュタイン", "hammerklavier": "ハンマークラヴィーア",
    "leningrad": "レニングラード", "turkish": "トルコ風", "coronation": "戴冠式", "elvira madigan": "",
}


def genre_of(title, types=""):
    t = title.lower().strip()
    if re.search(r"\bopera\b", types.lower()) and not re.search(r"overture|suite|excerpt", t):
        return "opera"
    for g, rx in G:
        if re.search(rx, t):
            return g
    return ""


CAT = re.compile(r"(Op\.\s*posth\.?|Op\.\s*\d+[a-z]?(?:\s*No\.\s*\d+)?|WoO\s*\d+[a-z]?|BWV\s*\d+[a-z]?|K\.\s*\d+[a-z]?(?:\s*\(\d+[a-z]?\))?|D\.\s*\d+[a-z]?|Hob\.\s*[IVXLC]+[a-z]?:\s*\d+[a-z]?|RV\s*\d+[a-z]?|HWV\s*\d+[a-z]?|S\.\s*\d+[a-z]?|B\.\s*\d+|TH\s*\d+|FP\s*\d+|L\.\s*\d+|M\.\s*\d+|BB\s*\d+|Sz\.\s*\d+|TWV\s*[\d:]+[a-z]?|Wq\.\s*\d+|H\s*\d+[a-z]?|JS\s*\d+|CD\s*\d+|AV\s*\d+|TrV\s*\d+)", re.I)


def cat_norm(s):
    s = (s or "").replace(" ", " ")
    s = re.sub(r"(?i)\b(op\.\s*\d+[a-z]?)\s*,\s*(no\.)", r"\1 \2", s)  # op. 6, no. 11 → op. 6 no. 11
    m = CAT.search(s)
    if not m:
        return ""
    c = re.sub(r"\s+", " ", m.group(1)).strip()
    c = re.sub(r"(?i)^op\.\s*", "Op.", c)
    c = re.sub(r"(?i)\s*no\.\s*", " No.", c)
    return c


def cat_key(c):
    """照合用：Op.27 No.2 → ('op','27','2')、K.550 → ('k','550','')"""
    m = re.match(r"([A-Za-z]+)\.?\s*([IVXLC]+:)?\s*(\d+[a-zA-Z]?)(?:.*?No\.(\d+))?", c or "")
    if not m:
        return None
    return (m.group(1).lower(), (m.group(2) or "") + m.group(3).lower(), m.group(4) or "")


def cat_ja(c):
    m = re.match(r"Op\.(\d+[a-z]?)(?: No\.(\d+))?$", c or "")
    if m:
        return f"作品{m.group(1)}" + (f"-{m.group(2)}" if m.group(2) else "")
    return c or ""


def parse_info(info):
    f, cur = {}, None
    for line in (info or "").split("\n"):
        m = re.match(r"^\|\s*([^=|{}]+?)\s*=(.*)$", line)
        if m:
            cur = m.group(1).strip()
            f[cur] = m.group(2).strip()
        elif cur:
            f[cur] += "\n" + line
    return f


def key_code(s):
    m = re.search(r"\{\{\s*[Kk]ey\s*\|\s*([A-Ga-g][b#]?)\s*\}\}", s or "")
    if m:
        return m.group(1)
    m = re.match(r"\s*([A-G])(?:[- ]?(flat|sharp|b|#))?\s+(major|minor)", s or "", re.I)
    if m:
        n = m.group(1)
        acc = "b" if (m.group(2) or "").lower() in ("flat", "b") else "#" if (m.group(2) or "").lower() in ("sharp", "#") else ""
        return (n.lower() if m.group(3).lower() == "minor" else n.upper()) + acc
    return ""


def mv_lines(f):
    raw = f.get("Movements/Sections") or f.get("Number of Movements/Sections") or f.get("Movements Header") or ""
    out = []
    for ln in raw.split("\n"):
        t = ln.strip()
        if re.match(r"^(#+|\*+|:+)", t):
            depth = len(re.match(r"^(#+|\*+|:+)", t).group(1))
            body = re.sub(r"^(#+|\*+|:+)\s*", "", t)
            out.append((":" if depth > 1 or t.startswith(":") else "") + body)
    return out


def wd_key_code(label):
    m = re.match(r"([A-G])(?:-(flat|sharp))?\s+(major|minor)", label or "")
    if not m:
        return ""
    n = m.group(1)
    return (n.lower() if m.group(3) == "minor" else n) + ({"flat": "b", "sharp": "#"}.get(m.group(2) or "", ""))


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:80]


# Wikidata の P86（作曲者）には映画・上演記録・録音・楽章単体・編曲版も入る。作品そのものだけを残す
WD_EXCL = re.compile(r"(?i)\b(film|television|production|album|single|audio track|movement|version, edition|arrangement|derivative work|"
                     r"printed sheet music|manuscript|literary work|series|episode|video game|recording)\b")


# Wikidata の作品番号（P528）は「番号@目録名」。Open Opus と同じ書き方（K.172、BWV 32 など）に読み替える
WD_CAT = {"Bach-Werke-Verzeichnis": "BWV ", "Ryom-Verzeichnis": "RV ", "Köchel catalogue": "K.", "Kirkpatrick catalogue": "K.",
          "Deutsch catalogue": "D.", "Hoboken-Verzeichnis": "Hob. ", "Händel-Werke-Verzeichnis": "HWV ", "Brown catalog": "B.",
          "Burghauser catalog": "B.", "Lesure catalog of Debussy compositions": "L.", "The Music of Liszt": "S.",
          "Richard-Strauss-Werkverzeichnis": "TrV ", "Wagner-Werk-Verzeichnis": "WWV ", "Telemann-Werke-Verzeichnis": "TWV ",
          "Wotquenne's Catalogue": "Wq.", "Buxtehude-Werke-Verzeichnis": "BuxWV ", "Szőllősy index": "Sz. ",
          "Werkverzeichnis Anton Bruckner": "WAB "}


def wd_cats(s):
    out = []
    for x in (s or "").split("|"):
        if "@" not in x:
            continue
        num, name = x.split("@", 1)
        if name in WD_CAT:
            n = re.sub(r"^[A-Za-zÁ-ž]+\.?\s*", "", num.strip()) if re.match(r"^[A-Za-z]", num.strip()) else num.strip()
            if re.match(r"\d|[IVXLC]+:", n):
                out.append(WD_CAT[name] + n)
        elif not name:
            c = cat_norm(num)
            if c.startswith("Op."):
                out.insert(0, c)  # 作品番号（Op.）を先に
    return out


def wd_is_work(types):
    ts = [t for t in (types or "").split("|") if t]
    return bool(ts) and not any(WD_EXCL.search(t) for t in ts)


def head_no(title):
    """「第○番」の番号。題名の頭（最初のカンマ・「in 調」・作品番号より前）にある No. だけを使う。
    Étude Op. 10, No. 11 の 11 は作品番号の枝番なので使わない"""
    head = re.split(r",|\s+in\s+[A-G]\b|\s+(?:Op|BWV|K|D|Hob|RV|HWV|WoO)\.?\s*\d", title or "", maxsplit=1)[0]
    return re.search(r"(?i)No\.\s*(\d+)", head)


def build_composer(c, comp_meta):
    cid = c["id"]
    wd = {}
    p = RAW / "wd" / f"{cid}.json"
    for r in (json.loads(p.read_text()) if p.exists() else []):
        wd[r.get("w", "").rsplit("/", 1)[-1]] = r
    by_imslp = {(r.get("imslp") or "").replace(" ", "_"): q for q, r in wd.items() if r.get("imslp")}
    recs, used_wd = [], set()
    p = RAW / "imslp" / f"{cid}.jsonl"
    for line in (p.read_text().splitlines() if p.exists() else []):
        x = json.loads(line)
        page = x["page"]
        f = parse_info(x.get("info", ""))
        title = strip_wiki(f.get("Work Title", "") or re.sub(r"\s*\([^()]*\)\s*$", "", page))
        if not title or re.search(r"(?i)\b(arrangement|transcription|collection|complete|selections?)\b", page):
            continue
        q = by_imslp.get(page.replace(" ", "_"), "")
        w = wd.get(q, {})
        if q:
            used_wd.add(q)
        cat = cat_norm(f.get("Opus/Catalogue Number", "")) or cat_norm(page)
        kc = key_code(f.get("Key", ""))
        wkeys = [wd_key_code(k) for k in (w.get("keys") or "").split("|") if k]
        conflicts = []
        if not kc and len(wkeys) == 1:
            kc = wkeys[0]
        elif kc and wkeys and kc not in wkeys:
            conflicts.append({"field": "key", "imslp": key_id(kc), "wikidata": [key_id(k) for k in wkeys]})
        genre = genre_of(title, w.get("types", "") + "|" + w.get("genres", ""))
        nm = head_no(title)
        no = int(nm.group(1)) if nm and genre in NUMBERED else None
        alt = [a.strip() for a in re.split(r"\s*;\s*", strip_wiki(f.get("Alternative Title", "")).strip("()")) if a.strip()]
        nick = next((NICK[a.lower()] for a in alt if a.lower() in NICK and NICK[a.lower()]), "")
        recs.append(make(cid, comp_meta, page, title, genre, no, cat, kc, f, w, q, alt, nick, conflicts))
    # Wikidata にだけある作品（IMSLP に無い近現代の作品など）
    for q, w in wd.items():
        if q in used_wd or not w.get("en"):
            continue
        en = w["en"]
        if re.search(r"(?i)\b(arrangement|transcription|catalogue|list of)\b", en):
            continue
        if not wd_is_work(w.get("types", "")):
            continue
        cats = wd_cats(w.get("cats"))
        cat = cat_norm(en) or (cats[0] if cats else "")
        wkeys = [wd_key_code(k) for k in (w.get("keys") or "").split("|") if k]
        kc = wkeys[0] if len(wkeys) == 1 else ""
        genre = genre_of(en, w.get("types", "") + "|" + w.get("genres", ""))
        nm = head_no(en)
        no = int(nm.group(1)) if nm and genre in NUMBERED else None
        rec = make(cid, comp_meta, "", re.sub(r"\s*\([^()]*\)\s*$", "", en), genre, no, cat, kc, {}, w, q, [], "", [])
        rec["_cats"] = cats  # 突き合わせ用（出力前に外す）
        recs.append(rec)
    # Open Opus（CC0）：既にある作品（作品番号か「種類＋番号」が同じもの）には作品番号・愛称・分類を足し、
    # 無い作品は新しく足す。Wikidata には作品番号の無い記録が多いので「種類＋番号」でも突き合わせる
    by_cat, by_gn = {}, {}
    for r in recs:
        for k in {cat_key(x) for x in [r["catalog"].get("opus", "")] + r.get("_cats", [])} - {None}:
            by_cat.setdefault(k, []).append(r)
        if r["genre"] in NUMBERED and r.get("number"):
            by_gn.setdefault((r["genre"], r["number"]), []).append(r)
    have_title = {r["titleEn"].lower() for r in recs}
    oo_name, oo = oo_records(cid, c.get("nameEn", ""))
    for x in oo:
        cat = cat_norm(x["catText"])
        o = make_oo(cid, comp_meta, x, cat)
        hit = by_cat.get(cat_key(cat)) if cat else None
        if not hit and o["genre"] in NUMBERED and o.get("number"):
            cand = by_gn.get((o["genre"], o["number"])) or []
            # 作品番号が両方にあって違うなら別の作品（同じ番号の別系列）として扱う
            hit = [r for r in cand if not (r["catalog"].get("opus") and cat and cat_key(r["catalog"]["opus"]) != cat_key(cat))]
        if hit and not (by_cat.get(cat_key(cat)) if cat else None):
            # 「種類＋番号」だけで当たったものは、調が両方にあって違えば別の作品とみなす（シンフォニアと交響曲など）
            hit = [r for r in hit if not (r.get("key") and o.get("key") and r["key"] != o["key"])]
        if hit and len(hit) == 1:
            merge_oo(hit[0], o)
            continue
        if hit or x["title"].lower() in have_title:
            continue  # 候補が複数あって決められないものは足さない（二重登録を避ける）
        recs.append(o)
        if cat:
            by_cat.setdefault(cat_key(cat), []).append(o)
        if o["genre"] in NUMBERED and o.get("number"):
            by_gn.setdefault((o["genre"], o["number"]), []).append(o)
    for r in recs:
        r.pop("_cats", None)
    # 重複（同じ作品番号・同じ題）を1件に
    seen, uniq = {}, []
    for r in recs:
        k = (r["catalog"].get("opus") or "", r["titleEn"].lower())
        if k in seen:
            continue
        seen[k] = 1
        uniq.append(r)
    return uniq


def make(cid, comp_meta, page, title, genre, no, cat, kc, f, w, q, alt, nick, conflicts):
    comp = years(f.get("Year/Date of Composition", "")) or ([int(w["inc"][:4])] * 2 if (w.get("inc") or "")[:4].isdigit() else [])
    pub = years(f.get("First Publication", ""))
    kj = key_ja(kc) if kc else ""
    if genre in NUMBERED and (no or kc):
        title_ja = G_JA[genre] + (f"第{no}番" if no else "") + (f" {kj}" if kj else "") + (f" {cat_ja(cat)}" if cat else "")
    elif w.get("ja"):
        title_ja = w["ja"]
    else:
        title_ja = title + (f" {kj}" if kj and kj not in title else "") + (f" {cat_ja(cat)}" if cat and cat not in title else "")
    if nick:
        title_ja += f"《{nick}》"
    rid = cid + "-" + (slug(cat) if cat else slug(title))
    srcs = []
    if page:
        srcs.append({"name": "IMSLP", "url": "https://imslp.org/wiki/" + page.replace(" ", "_"), "fields": "調・作品番号・楽章・作曲年・初版・初演・献呈・平均演奏時間", "fetched": FETCHED})
    if q:
        srcs.append({"name": "Wikidata", "url": f"https://www.wikidata.org/wiki/{q}", "fields": "ID・日本語名・調（P826）・作品番号（P528）", "fetched": FETCHED})
    inst = strip_wiki(f.get("Instrumentation", "")).split("\n")[0][:120]
    rec = {
        "id": rid, "composer": cid, "genre": genre or "other", "number": no, "catalog": {"opus": cat} if cat else {},
        "titleJa": title_ja, "titleEn": title + (f" in {key_en(kc)}" if kc and key_en(kc).lower() not in title.lower() else "") + (f", {cat}" if cat and cat not in title else ""),
        "nicknames": alt, "nicknameJa": nick, "key": key_id(kc) if kc else "", "keyJa": kj,
        "instrumentation": [inst] if inst else [],
        "movements": movements(mv_lines(f)) if f else [],
        "composed": comp, "firstPublished": pub[0] if pub else None,
        "firstPerformance": first_perf(f.get("First Performance", "")) if f.get("First Performance") else None,
        "dedication": ded_clean(f.get("Dedication", "")), "durationMin": minutes(f.get("Average Duration", "")),
        "articleId": "", "ids": {"wikidata": q, "imslp": page.replace(" ", "_"), "musicbrainz": w.get("mb", "")}, "sources": srcs,
    }
    if conflicts:
        rec["conflicts"] = conflicts
    return rec


CAT_SEG = re.compile(r"(?i)(op\.?\s*(posth\.?)?\s*[\d]+[a-z]?(\s*no\.\s*\d+[a-z]?)?|no\.\s*\d+[a-z]?|(bwv|hwv|rv|woo|twv|bb|th|fp|jw|wwv|trv|av|cd|js|sz|wq|hob|[kdslbmh])\.?\s*[ivxlc]*[:.]?\s*\d+[a-z]?(\s*/\s*r\s*\w+)?|anh\.?\s*\d+)")


# Open Opus の大分類 → Veliq の category（API の genre=ピアノ曲 などで絞れる）
OO_CAT = {"Keyboard": "keyboard", "Chamber": "chamber", "Orchestral": "orchestral", "Vocal": "vocal", "Stage": "stage"}


def compact(r):
    """空の項目を省く（API は欠けた項目を空として扱う）。手で確かめたレコードには使わない"""
    keep = {"id", "composer", "genre", "catalog", "titleJa", "titleEn", "key", "sources"}
    return {k: v for k, v in r.items() if k in keep or v not in ("", None, [], {})}


def make_oo(cid, comp_meta, x, cat):
    title, kc = x["title"], x["key"]
    genre = genre_of(title)
    sub = x["subtitle"].lower()
    if not genre and x["category"] == "Stage" and "opera" in sub:
        genre = "opera"
    if not genre and x["category"] == "Vocal" and sub in ("song", "lied", "songs", "song cycle"):
        genre = "song"
    no = x["no"] if genre in NUMBERED else None
    nicks = x["nick"]
    nick = next((NICK[a.lower()] for a in nicks if NICK.get(a.lower())), "")
    r = make(cid, comp_meta, "", title, genre, no, cat, kc, {}, {}, "", nicks, nick, [])
    r["titleEn"] = title + "".join(f', "{a}"' for a in nicks)
    if not (genre in NUMBERED and (no or kc)):
        # 種類で和題が組めないもの：原題から英語の調と作品番号の部分だけを外し、和の調と作品番号を付ける（題そのものは訳さない）
        head = re.sub(r"(?i)\s+in [A-G](?:[ -](?:flat|sharp))? (?:major|minor)\b", "", title)
        segs = [g for g in head.split(", ") if not CAT_SEG.fullmatch(g.strip())]
        r["titleJa"] = ", ".join(segs).strip() + (f" {key_ja(kc)}" if kc else "") + (f" {cat_ja(cat)}" if cat else "") + (f"《{nick}》" if nick else "")
    r["id"] = cid + "-" + (slug(cat) if cat else slug(title))
    if x["subtitle"].lower().startswith("for "):
        r["instrumentation"] = [x["subtitle"][4:]]
    if x["category"] in OO_CAT:
        r["category"] = OO_CAT[x["category"]]
    if x["popular"]:
        r["popular"] = True
    r["sources"] = [{"name": "Open Opus", "url": "https://github.com/PaulLikesToCode/openopus-data",
                     "fields": "題名・調・作品番号・番号・種類（題名から機械的に読み取り）", "fetched": OO_SNAPSHOT, "license": "CC0"}]
    return r


def merge_oo(r, o):
    """既存レコード r に Open Opus の o を足す。値は上書きせず、空のところだけ埋める。調が違えば両方を conflicts に残す"""
    if o.get("catalog") and not r["catalog"].get("opus"):
        r["catalog"] = dict(o["catalog"])
        cj = cat_ja(o["catalog"]["opus"])
        if cj and cj not in r["titleJa"]:
            r["titleJa"] = (r["titleJa"].split("《")[0] + f" {cj}" + ("《" + r["titleJa"].split("《", 1)[1] if "《" in r["titleJa"] else "")).strip()
    if o.get("key") and r.get("key") and o["key"] != r["key"]:
        r.setdefault("conflicts", []).append({"field": "key", r["sources"][0]["name"]: r["key"], "Open Opus": o["key"]})
    elif o.get("key") and not r.get("key"):
        r["key"], r["keyJa"] = o["key"], o["keyJa"]
    if o.get("nicknameJa") and not r.get("nicknameJa"):
        r["nicknameJa"] = o["nicknameJa"]
        if "《" not in r["titleJa"]:
            r["titleJa"] += f"《{o['nicknameJa']}》"
    r["nicknames"] = list(dict.fromkeys((r.get("nicknames") or []) + (o.get("nicknames") or [])))
    for k in ("category", "popular"):
        if o.get(k) and not r.get(k):
            r[k] = o[k]
    if not r.get("instrumentation") and o.get("instrumentation"):
        r["instrumentation"] = o["instrumentation"]
    r["sources"] = r["sources"] + [s for s in o["sources"] if s["name"] not in {x["name"] for x in r["sources"]}]


NYP_KEY = re.compile(r"\b([A-G])(?:[- ](FLAT|SHARP))?,? (MAJOR|MINOR)\b")


def nyp_key(title):
    m = NYP_KEY.search(title.upper())
    if not m:
        return ""
    n = m.group(1)
    acc = {"FLAT": "b", "SHARP": "#"}.get(m.group(2) or "", "")
    return key_id((n.lower() if m.group(3) == "MINOR" else n) + acc)


SUBCAT = re.compile(r"(?i)\b(G|HWV|BWV|RV|WoO|D|B|Hob|TWV|Wq|Sz|BB|FP|TH|L|S)\.?\s*((?:[IVXLC]+[a-z]?:)?\d+)")


def sub_cat_clash(a, b):
    """両方の題名に同じ種類の目録番号があって、番号が違うなら True"""
    ta = {}
    for m in SUBCAT.finditer(a):
        ta.setdefault(m.group(1).upper(), set()).add(m.group(2).upper())
    for m in SUBCAT.finditer(b):
        k = m.group(1).upper()
        if k in ta and m.group(2).upper() not in ta[k]:
            return True
    return False


# ---- ニューヨーク・フィル ----
def nyp_attach(recs_by_comp, comps):
    perf = json.loads((NYP / "performances.json").read_text())
    scores = json.loads((NYP / "scores.json").read_text())
    last = {}
    for c in comps:
        ln = (c.get("nameEn") or "").split(" ")[-1].lower()
        last.setdefault(ln, []).append(c["id"])
    def cid_of(nyp_name):
        ln = re.sub(r"\[.*?\]", "", nyp_name.split(",")[0]).strip().lower()
        ids = last.get(ln) or []
        return ids[0] if len(ids) == 1 else None
    def keyed(title):
        # NYP は新ケッヘル（K.186A (OLD K.201)）。Open Opus・IMSLP の旧番号に合わせる
        title = re.sub(r"K\.\s*\d+[A-Z]+\s*\((?:OLD\s*)?(K\.\s*\d+[A-Z]?)\)", r"\1", title)
        ck = cat_key(cat_norm(title.replace("OP. ", "Op.").replace("OP.", "Op.").replace("NO. ", "No.").title().replace("Op.", "Op.")))
        g = genre_of(re.sub(r"^CONCERTO, (\w+)", lambda m: m.group(1) + " concerto", title, flags=re.I).replace(",", " "))
        nm = re.search(r"NO\.\s*(\d+)", title, re.I)
        return ck, g, int(nm.group(1)) if nm else None
    hit = 0
    idx = {}
    for cid, recs in recs_by_comp.items():
        for r in recs:
            ck = cat_key(r["catalog"].get("opus", ""))
            if ck:
                idx.setdefault((cid, "cat", ck), []).append(r)
            if r["genre"] in NUMBERED and r.get("number"):
                idx.setdefault((cid, "gn", r["genre"], r["number"]), []).append(r)
    for p in perf:
        cid = cid_of(p["c"])
        if not cid or cid not in recs_by_comp:
            continue
        ck, g, n = keyed(p["t"])
        cands = (idx.get((cid, "cat", ck)) if ck else None) or (idx.get((cid, "gn", g, n)) if g and n else None) or []
        if len(cands) != 1:
            continue
        r = cands[0]
        if g and r["genre"] not in ("other", g) and not (g == "concerto" and r["genre"].endswith("concerto")):
            continue  # 種類が違う（スケルツォとソナタなど）ものは結合しない
        if sub_cat_clash(p["t"], r["titleEn"]):
            continue  # 第2の番号（ボッケリーニの G. など）が食い違うものは結合しない
        old = r.get("nyp")
        if old and old["performances"] >= p["n"]:
            continue
        r["nyp"] = {"workId": p["wid"], "title": p["t"], "performances": p["n"], "first": p["f"], "last": p["l"],
                    "conductors": [[re.sub(r"^(.+?),\s*(.+)$", r"\2 \1", a), b] for a, b in p["cd"]],
                    "source": "https://github.com/nyphilarchive/PerformanceHistory"}
        nk = nyp_key(p["t"])
        if nk and r["key"] and nk != r["key"] and not any(c.get("field") == "key" and c.get("nyp") for c in r.get("conflicts", [])):
            r.setdefault("conflicts", []).append({"field": "key", r["sources"][0]["name"]: r["key"], "nyp": nk, "nypTitle": p["t"]})
        hit += 1
    sc = 0
    for s in scores:
        cid = cid_of(s["c"])
        if not cid or cid not in recs_by_comp or "(EXCERPTS)" in s["t"].upper():
            continue
        ck, g, n = keyed(s["t"])
        cands = (idx.get((cid, "cat", ck)) if ck else None) or (idx.get((cid, "gn", g, n)) if g and n else None) or []
        if len(cands) != 1:
            continue
        r = cands[0]
        if g and r["genre"] not in ("other", g) and not (g == "concerto" and r["genre"].endswith("concerto")):
            continue
        r.setdefault("nyp", {"performances": 0}).setdefault("scores", []).append({
            "id": s["id"], "markedBy": s["markedBy"] if s["markedBy"] not in (None, "", "Unknown", "Other(s)") else None,
            "publisher": s["publisher"], "url": "https://archives.nyphil.org/"})
        sc += 1
    return hit, sc


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    comps = json.loads((ROOT / "veliq-academy" / "data" / "composers.json").read_text())
    rawc = {c["id"]: c for c in json.loads((RAW / "composers.json").read_text())} if (RAW / "composers.json").exists() else {}
    # 手で確かめたレコードと全曲収録の範囲は data-src/catalog/curated/ から読む（出力先を読むと前回の結果が混ざるため）
    CUR = ROOT / "data-src" / "catalog" / "curated"
    curated = json.loads((CUR / "beethoven.json").read_text()) if (CUR / "beethoven.json").exists() else []
    for r in curated:
        r.pop("nyp", None)
    old_idx = json.loads((CUR / "index.json").read_text()) if (CUR / "index.json").exists() else {"coverage": []}
    by = {}
    for c in comps:
        recs = build_composer(c, rawc.get(c["id"], {}))
        if c["id"] == "beethoven":
            have = {r["ids"].get("imslp") for r in curated} | {r["catalog"].get("opus") for r in curated}
            recs = curated + [r for r in recs if r["ids"].get("imslp") not in have and (r["catalog"].get("opus") or "~") not in have]
        if recs:
            by[c["id"]] = recs
    hit, sc = nyp_attach(by, comps)
    files = []
    for cid, recs in by.items():
        # 同じ id（同名の別作品）は末尾に -2, -3 を付けて一意にする
        cnt = {}
        for r in recs:
            n = cnt.get(r["id"], 0) + 1
            cnt[r["id"]] = n
            if n > 1:
                r["id"] = f'{r["id"]}-{n}'
        recs[:] = [r if any(s.get("name") != "Open Opus" for s in r["sources"]) else compact(r) for r in recs]
        (OUT / f"{cid}.json").write_text(json.dumps(recs, ensure_ascii=False, separators=(",", ":")) + "\n")
        files.append({"composer": cid, "url": f"{SITE}/data/catalog/{cid}.json", "count": len(recs)})
    total = sum(f["count"] for f in files)
    idx = {
        "name": "Veliq 作品目録", "updated": FETCHED, "license": "事実データ。出典は各レコードの sources。Wikidata（CC0）・Open Opus（CC0）・IMSLP の作品情報欄とニューヨーク・フィルの演奏記録（CC0, New York Philharmonic）を含む",
        "fields": old_idx.get("fields", "") + ", category（keyboard/chamber/orchestral/vocal/stage。Open Opus 由来）, popular, conflicts, nyp{performances,first,last,conductors,scores[id,markedBy,publisher]}",
        "files": files, "coverage": old_idx.get("coverage", []), "count": total,
    }
    (OUT / "index.json").write_text(json.dumps(idx, ensure_ascii=False, indent=1) + "\n")
    keyed = sum(1 for rs in by.values() for r in rs if r["key"])
    conf = sum(1 for rs in by.values() for r in rs if r.get("conflicts"))
    print(f"作曲家 {len(by)}人／作品 {total}件（調あり {keyed}）／NYP演奏記録 {hit}件・所蔵スコア {sc}冊を結合／出典の食い違い {conf}件")


if __name__ == "__main__":
    main()
