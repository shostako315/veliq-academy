#!/usr/bin/env python3
"""画家の目録（/art/catalog/）のデータを作る：人の束（art_catalog_extract.py）から N 人を選び、公開用の JSON にする

入力
- data-src/art-catalog/raw/_people.json   tools/art_catalog_extract.py の出力
- data-src/art-catalog/sources.json       取得日・URL・ライセンス（tools/art_catalog_fetch.py）
- data-src/art-catalog/ja-names.tsv       日本語表記の対応表（手で作る。リポジトリ内の記事の表記と照合できたものだけ使う）
- data-src/art-catalog/wikidata.json      あれば：Wikidata の日本語ラベル・流派・師弟（tools/art_catalog_wikidata.py）
- content/art/artists/*.md                手書きの画家ページ（前付けの aliases で照合して「詳しく読む」を出す。読むだけ）
出力
- veliq-academy/data/art-catalog/index.json      一覧（全員の1行分）と、項目を持たない画家の名前・生没年
- veliq-academy/data/art-catalog/e/<n>.json      項目の本体（約100人ずつ）
- data-src/art-catalog/report/build.txt          選んだ人・年の食い違い・照合できなかった日本語表記

使い方  python3 tools/art_catalog_build.py [--limit 300]

決まり
- 値は出典に書かれていることだけ。推測で埋めない。文章は生成しない
- 生没年は、その数字が出典の略歴欄（「French, 1840–1926」など）に書かれているときだけ採る（活動期の年・仮の範囲を拾わない）
- 出典で生没年が食い違うときは、多い方を出し、出典ごとの値を注記する
- 日本語表記は ① 手書きの画家ページの表記 ② 対応表のうちリポジトリ内の記事に同じ表記があるもの ③ 日本・中国の画家は所蔵館が記載した漢字。
  どれも無ければ出さない（カタカナを作らない）
"""
import argparse, datetime, hashlib, json, math, re, sys, unicodedata
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data-src" / "art-catalog"
OUT = ROOT / "veliq-academy" / "data" / "art-catalog"
CONTENT = ROOT / "content"
SHARD_SIZE = 50
MAX_WORKS = 60

MUSEUM = {
    "met": ("メトロポリタン美術館", "met-objects.csv"),
    "nga": ("ナショナル・ギャラリー・オブ・アート（ワシントン）", "nga-objects.csv"),
    "cma": ("クリーブランド美術館", "cma-data.json"),
    "aic": ("シカゴ美術館", "aic-artworks.jsonl"),
    "moma": ("ニューヨーク近代美術館（MoMA）", "moma-artists.json"),
    "wd": ("Wikidata", None),
}
KIND = {"painting": "絵画", "drawing": "素描", "print": "版画", "other": ""}
# 所蔵館の国籍の書き方 → 日本語（国・地域名。記載がこの表に無いときは原文のまま出す）
NAT = {
    "French": "フランス", "Dutch": "オランダ", "Flemish": "フランドル", "Netherlandish": "ネーデルラント", "Italian": "イタリア",
    "Spanish": "スペイン", "German": "ドイツ", "British": "イギリス", "English": "イングランド", "Scottish": "スコットランド",
    "Irish": "アイルランド", "Welsh": "ウェールズ", "American": "アメリカ", "Japanese": "日本", "Chinese": "中国", "Korean": "朝鮮",
    "Austrian": "オーストリア", "Belgian": "ベルギー", "Swiss": "スイス", "Russian": "ロシア", "Norwegian": "ノルウェー",
    "Danish": "デンマーク", "Swedish": "スウェーデン", "Finnish": "フィンランド", "Polish": "ポーランド", "Czech": "チェコ",
    "Bohemian": "ボヘミア", "Hungarian": "ハンガリー", "Greek": "ギリシャ", "Portuguese": "ポルトガル", "Mexican": "メキシコ",
    "Canadian": "カナダ", "Venetian": "ヴェネツィア", "Florentine": "フィレンツェ", "Sienese": "シエナ", "Bolognese": "ボローニャ",
    "Romanian": "ルーマニア", "Croatian": "クロアチア", "Lithuanian": "リトアニア", "Ukrainian": "ウクライナ", "Indian": "インド",
    "Australian": "オーストラリア", "New Zealander": "ニュージーランド", "Haitian": "ハイチ", "Peruvian": "ペルー", "Colombian": "コロンビア",
    "Venezuelan": "ベネズエラ", "Uruguayan": "ウルグアイ", "Puerto Rican": "プエルトリコ", "Turkish": "トルコ", "Persian": "ペルシア",
    "Iranian": "イラン", "Egyptian": "エジプト", "Israeli": "イスラエル", "Estonian": "エストニア", "Latvian": "ラトビア", "Slovak": "スロバキア",
    "Slovenian": "スロベニア", "Serbian": "セルビア", "Bulgarian": "ブルガリア", "Icelandic": "アイスランド", "Luxembourgish": "ルクセンブルク", "Argentine": "アルゼンチン", "Brazilian": "ブラジル", "Cuban": "キューバ", "Chilean": "チリ",
}
JP_PERIOD = [("Heian", "平安時代"), ("Kamakura", "鎌倉時代"), ("Nanbokuch", "南北朝時代"), ("Muromachi", "室町時代"),
             ("Momoyama", "桃山時代"), ("Edo", "江戸時代"), ("Meiji", "明治時代"), ("Taish", "大正時代"), ("Shōwa", "昭和時代"), ("Showa", "昭和時代")]
PERIOD_YEARS = {"平安時代": (794, 1185), "鎌倉時代": (1185, 1333), "南北朝時代": (1336, 1392), "室町時代": (1336, 1573), "桃山時代": (1573, 1615),
                "江戸時代": (1615, 1868), "明治時代": (1868, 1912), "大正時代": (1912, 1926), "昭和時代": (1926, 1989)}
GENERIC = re.compile(r"\b(unidentified|unknown|anonymous|school|workshop|follower|circle of|style of|painter|master of|artist|century|"
                     r"manufactur|company|studio|factory)\b", re.I)
CJK = re.compile(r"[぀-ヿ㐀-鿿豈-﫿]")


TRANS = str.maketrans({"ø": "o", "Ø": "O", "æ": "ae", "Æ": "AE", "ß": "ss", "ł": "l", "Ł": "L", "đ": "d", "ð": "d", "þ": "th", "œ": "oe", "’": "", "'": ""})


def norm(s):
    s = unicodedata.normalize("NFKD", str(s or "").translate(TRANS))
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def slug(s):
    return re.sub(r"-+", "-", norm(s).replace(" ", "-")).strip("-")


def latin(name):
    """「Maruyama Ōkyo 円山応挙」→「Maruyama Ōkyo」。閉じていない括弧は閉じる"""
    s = re.sub(r"\s+", " ", CJK.sub("", name or "")).strip()
    s = re.sub(r"\(\s*\)", "", s).strip()
    if s.count("(") > s.count(")"):
        s += ")"
    return s


KANA = "\u30a0-\u30ff\uff65-\uff9f"


def found_in(texts, ja):
    """記事の本文に同じ表記があるか（前後がカタカナ・長音・中黒・漢字でつながっていないこと）"""
    if not ja:
        return None
    pat = re.compile(r"(?<![" + KANA + r"\u3400-\u9fff])" + re.escape(ja) + r"(?![" + KANA + r"ー\u3400-\u9fff])")
    return next((f for f, t in texts.items() if pat.search(t)), None)


def kanji(name):
    m = re.findall(r"[぀-ヿ㐀-鿿豈-﫿々〆]+(?:\s[㐀-鿿々]+)?", name or "")
    return m[0].replace(" ", "") if m else ""


def frontmatter(p):
    t = p.read_text(encoding="utf-8")
    if not t.startswith("---"):
        return {}
    import yaml
    return yaml.safe_load(t.split("---", 2)[1]) or {}


def years_of(rec):
    """出典の略歴欄に書かれている生没年だけ採る。活動期（active）・世紀の範囲は採らない"""
    bio = str(rec.get("bio") or "")
    if re.search(r"\bactive\b|\bact\.|\bfl\.|\bflourished\b|\bcentury\b", bio, re.I):
        return None, None, False
    approx = bool(re.search(r"\bca\.|\bc\.\s*\d|\babout\b|\bcirca\b", bio, re.I))
    by, dy = rec.get("by"), rec.get("dy")
    if rec["src"] != "moma":
        by = by if by and str(by) in bio else None
        dy = dy if dy and str(dy) in bio else None
    return by or None, dy or None, approx


def places_of(rec):
    """メトロポリタンの略歴「French, Paris 1840–1926 Giverny」から出生地・死没地（原文のまま）"""
    if rec["src"] != "met":
        return None, None
    m = re.match(r"^[^,]+,\s*(?P<bp>[^\d]*?)\s*(?:ca\.\s*)?(?P<by>\d{3,4})\s*[–-]\s*(?:ca\.\s*)?(?P<dy>\d{3,4})\s*(?P<dp>[^\d]*)$", rec.get("bio") or "")
    if not m or (rec.get("by") and int(m.group("by")) != rec["by"]):
        return None, None
    return (m.group("bp").strip(" ,") or None), (m.group("dp").strip(" ,") or None)


def content_text():
    """日本語表記の照合に使う、リポジトリ内の記事の本文（画家の目録の出力は含めない）"""
    out = {}
    for p in CONTENT.rglob("*.md"):
        out[str(p.relative_to(ROOT))] = p.read_text(encoding="utf-8")
    return out


def load_ja_table():
    p = SRC / "ja-names.tsv"
    rows = {}
    if p.exists():
        for line in p.read_text(encoding="utf-8").splitlines():
            if not line.strip() or line.startswith("#"):
                continue
            k, ja, *_ = line.split("\t")
            rows[k.strip()] = ja.strip()
    return rows


def tier2_pages():
    pages = []
    for p in sorted((CONTENT / "art" / "artists").glob("*.md")):
        fm = frontmatter(p)
        if fm.get("slug"):
            title = str(fm.get("title") or "").split("——")[0].strip()
            pages.append({"slug": fm["slug"], "title": title, "aliases": [str(a) for a in fm.get("aliases") or []]})
    return pages


class Person:
    def __init__(self, raw):
        self.raw = raw
        self.recs = raw["recs"]
        self.works = raw["works"]
        self.counts = raw["counts"]
        self.qid = next((r["qid"] for r in self.recs if r.get("qid")), None)
        self.ulan = next((r["ulan"] for r in self.recs if r.get("ulan")), None)
        by_src = {}
        for r in self.recs:
            by_src.setdefault(r["src"], r)
        self.by_src = by_src
        # 表記はクリーブランド → メトロポリタン（括弧の外）→ NGA → MoMA の順に採る（NGA は「Sir」などの称号付き）
        r0 = by_src.get("cma") or by_src.get("met") or by_src.get("nga") or by_src.get("moma")
        nm = latin(r0["name"])
        if r0["src"] == "met":
            nm = re.sub(r"\s*\(.*?\)\s*$", "", nm) or nm
        self.name_en = nm
        self.names = {norm(latin(r["name"])) for r in self.recs} | {norm(m) for r in self.recs for m in re.findall(r"\((.*?)\)", r["name"] or "")}
        nats = Counter(n.split(",")[0].strip() for r in self.recs for n in re.split(r"[|/;]| and ", r.get("nat") or "") if n.split(",")[0].strip())
        self.nats = [n for n, _ in nats.most_common()]
        self.paint = sum(v for k, v in self.counts.items() if k.endswith(":painting"))
        self.n = raw["n"]
        self.museums = sorted({k.split(":")[0] for k in self.counts})
        self.hl = sum(1 for w in self.works if w.get("hl"))
        self.japanese = any(n == "Japanese" for n in self.nats)
        self.cjk = any(n in ("Japanese", "Chinese", "Korean") for n in self.nats)
        # 生没年（出典ごと）
        self.yr = {}
        for r in self.recs:
            if r["src"] in self.yr:
                continue
            b, d, a = years_of(r)
            if b or d:
                self.yr[r["src"]] = (b, d, a)
        self.by = self._pick(0)
        self.dy = self._pick(1)
        self.approx = any(v[2] for v in self.yr.values())

    def _pick(self, i):
        c = Counter(v[i] for v in self.yr.values() if v[i])
        if not c:
            return None
        top = c.most_common()
        # 同数なら メトロポリタン → NGA → クリーブランド → MoMA の順
        best = [y for y, n in top if n == top[0][1]]
        for s in ("met", "nga", "cma", "moma"):
            if s in self.yr and self.yr[s][i] in best:
                return self.yr[s][i]
        return best[0]

    def drop_outliers(self):
        """生年・没年がどちらも多数の値と10年を超えて違う（片方だけなら30年を超えて違う）出典は、別人の記録が混ざったとみなし、その館の作品と年を外す"""
        out = []
        for s_, (b, d, _) in list(self.yr.items()):
            db = abs(b - self.by) if b and self.by else 0
            dd = abs(d - self.dy) if d and self.dy else 0
            if (db > 10 and dd > 10) or db > 30 or dd > 30:
                out.append((s_, b, d))
                del self.yr[s_]
                self.works = [w for w in self.works if w["m"] != s_]
                self.counts = {k: v for k, v in self.counts.items() if not k.startswith(s_ + ":")}
                self.n = sum(self.counts.values())
                self.museums = sorted({k.split(":")[0] for k in self.counts})
                self.paint = sum(v for k, v in self.counts.items() if k.endswith(":painting"))
        self.dropped = out
        return out

    def conflicts(self):
        out = []
        for i, lab in ((0, "生年"), (1, "没年")):
            vals = {s: v[i] for s, v in self.yr.items() if v[i]}
            if len(set(vals.values())) > 1:
                out.append(lab + "：" + "、".join(f"{MUSEUM[s][0]} {y}" for s, y in vals.items()))
        return out

    def eligible(self):
        """自分の項目を持てるか：ID（Wikidata か ULAN）があり、作者と確かめられる所蔵作品が3点以上"""
        if not (self.qid or self.ulan) or GENERIC.search(self.name_en) or not (self.by or self.dy):
            return False
        return self.n >= 3 and (self.paint >= 2 or self.japanese and self.paint + self.n >= 3)

    def score(self):
        return (3 * len(self.museums) + 2 * math.log2(1 + self.paint) + 1.5 * min(self.hl, 10) + 0.5 * math.log2(1 + self.n))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=300)
    ap.add_argument("--japanese", type=int, default=0, help="日本の画家（生年1920年まで）を少なくともこの人数入れる（既定は limit の 1/4）")
    ap.add_argument("--minor", type=int, default=0, help="項目を持たない画家を一覧に何人まで載せるか（既定は limit と同じ）")
    ap.add_argument("--born-max", type=int, default=1900, help="この年までに生まれた人だけ（既定 1900。生年が無ければ没年−30）")
    a = ap.parse_args()
    jp_quota = a.japanese or a.limit // 4
    minor_n = a.minor or a.limit
    srcs = json.loads((SRC / "sources.json").read_text(encoding="utf-8"))
    raw = json.loads((SRC / "raw" / "_people.json").read_text(encoding="utf-8"))
    people = [Person(r) for r in raw]
    wd = json.loads((SRC / "wikidata.json").read_text(encoding="utf-8")) if (SRC / "wikidata.json").exists() else {}
    for p in people:  # Wikidata の生没年も並べる（値が1つのときだけ）
        w = wd.get(p.qid or "")
        if w and (len(w.get("born", [])) == 1 or len(w.get("died", [])) == 1):
            p.yr["wd"] = ((w.get("born") or [None])[0] if len(w.get("born", [])) == 1 else None,
                          (w.get("died") or [None])[0] if len(w.get("died", [])) == 1 else None, False)
            p.by, p.dy = p._pick(0), p._pick(1)
    texts = content_text()
    ja_table = load_ja_table()
    report = []
    for p in people:
        for s_, b, d in p.drop_outliers():
            report.append(f"別人の記録とみなして外した：{p.name_en} の {MUSEUM[s_][0]}（{b}–{d}）")

    # 手書きの画家ページ → 人
    pages = tier2_pages()
    tier2 = {}
    for pg in pages:
        latin_aliases = {norm(x) for x in pg["aliases"] if re.search(r"[A-Za-z]", x) and " " in x.strip()}
        hits = [p for p in people if (p.qid or p.ulan) and p.names & latin_aliases]
        hits.sort(key=lambda p: -p.n)
        if hits:
            tier2[id(hits[0])] = pg
            report.append(f"画家ページ {pg['slug']} → {hits[0].name_en}（{hits[0].qid} / ULAN {hits[0].ulan}）")
        else:
            report.append(f"警告：画家ページ {pg['slug']} に当たる人が見つかりません（aliases：{pg['aliases']}）")

    born = lambda p: p.by or (p.dy - 30 if p.dy else 9999)
    elig = [p for p in people if p.eligible() and born(p) <= a.born_max]
    elig.sort(key=lambda p: -p.score())
    # 手書きの画家ページがある人は、絵画の点数の条件を外して入れる（ID と所蔵3点以上は必要）
    chosen = sorted([p for p in people if id(p) in tier2 and (p.qid or p.ulan) and p.n >= 3], key=lambda p: -p.score())
    jp = [p for p in elig if p.japanese and (p.by or p.dy or 9999) <= 1920 and p not in chosen][:jp_quota]
    chosen += jp
    for p in elig:
        if len(chosen) >= a.limit:
            break
        if p not in chosen:
            chosen.append(p)
    chosen = chosen[: max(a.limit, len([p for p in chosen if id(p) in tier2]))]
    chosen_ids = {id(p) for p in chosen}

    # id
    used, ids = set(), {}
    for p in sorted(chosen, key=lambda p: (p.by or 9999, p.name_en)):
        base = slug(re.sub(r"\(.*?\)", "", p.name_en)) or "artist"
        i = base if base not in used else f"{base}-{p.by or p.dy}"
        used.add(i)
        ids[id(p)] = i

    # 日本語表記
    def ja_name(p):
        if id(p) in tier2:
            return tier2[id(p)]["title"], "page", "Veliq Academy の画家ページ"
        w = wd.get(p.qid or "", {})
        if p.cjk:
            k = museum_kanji(p)
            if k:
                hit = found_in(texts, k)
                return k, "museum", ("所蔵館の記載。Veliq Academy の記事と同じ表記" if hit else "所蔵館の記載（漢字）")
        for key in (f"ulan:{p.ulan}", f"qid:{p.qid}", f"name:{p.name_en}"):
            ja = ja_table.get(key)
            if ja:
                hit = found_in(texts, ja)
                if hit:
                    return ja, "checked", f"Veliq Academy の記事（{hit}）と同じ表記"
                if w.get("ja") == ja:
                    return ja, "checked", "Wikidata の日本語ラベルと一致"
                report.append(f"日本語表記の候補を照合できず出さない：{p.name_en} → {ja}")
        if w.get("ja"):
            return w["ja"], "wikidata", "Wikidata の日本語ラベル（日本語表記は仮）"
        return "", "none", ""

    def museum_kanji(p):
        return kanji(p.by_src.get("met", {}).get("name")) or next((r.get("orig").replace(" ", "") for r in p.recs if r.get("orig") and CJK.search(r["orig"])), "")

    entries, rows = {}, []
    retrieved = {k: v["retrieved"] for k, v in srcs.items()}
    for p in chosen:
        eid = ids[id(p)]
        ja, jst, jsrc = ja_name(p)
        orig = ""
        if p.cjk:
            orig = museum_kanji(p) or (ja if jst == "checked" and CJK.search(ja) else "")
        orig_differs = sorted({x for x in [kanji(p.by_src.get("met", {}).get("name"))] + [(r.get("orig") or "").replace(" ", "") for r in p.recs] if x and CJK.search(x)})
        bp = dp = None
        if "met" in p.by_src:
            bp, dp = places_of(p.by_src["met"])
        periods = Counter()
        life = (p.by or (p.dy or 0) - 60, p.dy or (p.by or 0) + 60)
        for w in p.works:
            for k, v in JP_PERIOD:
                # 所蔵館が作品に付けた時代区分。生きていた期間と重ならない区分（後摺りなど）は採らない
                if p.japanese and k in (w.get("per") or "") and PERIOD_YEARS[v][0] <= life[1] and PERIOD_YEARS[v][1] >= life[0]:
                    periods[v] += 1
        works = []
        for w in p.works[:MAX_WORKS]:
            works.append({"t": w["t"] or "", "d": w.get("d") or "", "m": w["m"], "k": KIND[w["k"]], "u": w["u"]})
        counts = {}
        for k, v in p.counts.items():
            m, kind = k.split(":")
            counts.setdefault(m, {})[KIND[kind] or "種類の記載なし"] = v
        used_src = sorted({r["src"] for r in p.recs} | set(p.museums), key=list(MUSEUM).index)
        sources = []
        w = wd.get(p.qid or "", {})
        if w:
            sources.append({"name": "Wikidata " + p.qid, "url": f"https://www.wikidata.org/wiki/{p.qid}", "license": "CC0 1.0",
                            "retrieved": w.get("retrieved", ""), "fields": "日本語ラベル・生没年・流派・師弟"})
        for s in used_src:
            fields = []
            if s in p.yr:
                fields.append("生没年")
            if s == "met" and (bp or dp):
                fields.append("出生地・死没地")
            if any(r["src"] == s and r.get("nat") for r in p.recs):
                fields.append("国籍")
            if s in counts:
                fields.append("所蔵作品")
            if s in ("met", "nga", "moma") and any(r["src"] == s and (r.get("qid") or r.get("ulan")) for r in p.recs):
                fields.append("Wikidata・ULAN の ID")
            if s == "cma" and any(r["src"] == "cma" and r.get("orig") for r in p.recs):
                fields.append("原語の名前")
            f = MUSEUM[s][1]
            sources.append({"name": srcs[f]["name"] if f in srcs else MUSEUM[s][0], "url": srcs.get(f, {}).get("home", ""),
                            "license": srcs.get(f, {}).get("license", ""), "retrieved": retrieved.get(f, ""), "fields": "・".join(fields)})
        w = wd.get(p.qid or "", {})
        e = {
            "id": eid, "nameJa": ja, "nameJaStatus": jst, "nameJaSource": jsrc, "nameEn": p.name_en, "nameOrig": orig,
            "nameOrigVariants": orig_differs if len(orig_differs) > 1 else [],
            "born": p.by, "died": p.dy, "approx": p.approx, "birthPlace": bp, "deathPlace": dp,
            "yearsNote": p.conflicts() + [f"{MUSEUM[s_][0]}の記録（{b or '？'}–{d or ''}）は別人の可能性があるため使っていません" for s_, b, d in p.dropped], "nationality": p.nats[:3], "country": [NAT.get(n, n) for n in p.nats[:2]],
            "jpPeriods": [k for k, _ in periods.most_common(3)], "movement": w.get("movements") or [],
            "teachers": w.get("teachers") or [], "students": w.get("students") or [],
            "kinds": dict(Counter(KIND[k.split(":")[1]] for k in p.counts for _ in range(p.counts[k]) if KIND[k.split(":")[1]])),
            "counts": counts, "workCount": p.n, "works": works,
            "wikidata": p.qid, "ulan": p.ulan, "tier2": tier2[id(p)]["slug"] if id(p) in tier2 else None,
            "sources": sources,
        }
        entries[eid] = e
        if e["yearsNote"]:
            report.append(f"生没年の食い違い：{p.name_en}（{eid}）：" + "／".join(e["yearsNote"]))

    # 師弟は目録に居る人だけリンク（Wikidata の QID で引く）
    by_qid = {e["wikidata"]: e["id"] for e in entries.values() if e["wikidata"]}
    for e in entries.values():
        for k in ("teachers", "students"):
            e[k] = [dict(x, id=by_qid.get(x.get("qid"))) for x in e[k]]

    order = sorted(entries.values(), key=lambda e: (e["born"] or e["died"] or 9999, e["nameEn"]))
    n_shards = max(1, math.ceil(len(order) / SHARD_SIZE))
    shard_of = {e["id"]: int(hashlib.md5(e["id"].encode()).hexdigest(), 16) % n_shards for e in order}
    shards = defaultdict(dict)
    for e in order:
        shards[shard_of[e["id"]]][e["id"]] = e
    century = lambda y: f"{(y - 1) // 100 + 1}世紀" if y else ""
    for e in order:
        y = e["born"] or (e["died"] - 50 if e["died"] else None)
        rows.append([e["id"], e["nameJa"], e["nameEn"], e["nameOrig"], e["born"], e["died"], e["country"], century(y),
                     e["movement"], shard_of[e["id"]], e["nameJaStatus"], e["tier2"], e["workCount"], e["approx"]])

    # 項目を持たない画家（所蔵作品が1〜2点で、ID のある人。名前と生没年だけ）
    minor = []
    for p in sorted(people, key=lambda p: -p.score()):
        if len(minor) >= minor_n:
            break
        if id(p) in chosen_ids or not (p.qid or p.ulan) or GENERIC.search(p.name_en) or p.n >= 3 or not (p.by or p.dy) or born(p) > a.born_max:
            continue
        if p.paint < 1 and not p.japanese:
            continue
        k = ""
        if p.cjk:
            k = kanji(p.by_src.get("met", {}).get("name")) or next((r.get("orig").replace(" ", "") for r in p.recs if r.get("orig") and CJK.search(r["orig"])), "")
        minor.append([p.name_en, k, p.by, p.dy, [NAT.get(n, n) for n in p.nats[:1]], p.n, p.approx])
    minor.sort(key=lambda r: (r[2] or r[3] or 9999, r[0]))

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "e").mkdir(exist_ok=True)
    for f in (OUT / "e").glob("*.json"):
        f.unlink()
    for s, es in shards.items():
        (OUT / "e" / f"{s}.json").write_text(json.dumps(es, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    idx = {
        "name": "Veliq 画家の目録", "updated": datetime.date.today().isoformat(), "count": len(order), "shards": n_shards,
        "row": ["id", "nameJa", "nameEn", "nameOrig", "born", "died", "country", "era", "movement", "shard", "nameJaStatus", "tier2", "workCount", "approx"],
        "rows": rows,
        "minorRow": ["nameEn", "nameOrig", "born", "died", "country", "workCount", "approx"], "minor": minor,
        "sources": [{"file": k, **{x: v[x] for x in ("name", "url", "license", "home", "retrieved")}} for k, v in srcs.items()],
        "unreachable": "Wikidata・Getty ULAN・各館の API・ColBase・ジャパンサーチ・文化遺産オンライン・アムステルダム国立美術館（2026-11-18、作業環境から接続不可）",
    }
    (OUT / "index.json").write_text(json.dumps(idx, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (SRC / "report").mkdir(exist_ok=True)
    stats = Counter(e["nameJaStatus"] for e in order)
    head = [f"{datetime.date.today()} 項目 {len(order)}（画家ページあり {sum(1 for e in order if e['tier2'])}）、名前だけ {len(minor)}、シャード {n_shards}",
            f"日本語表記：{dict(stats)}", f"条件を満たす人 {len(elig)}"]
    (SRC / "report" / "build.txt").write_text("\n".join(head + report + ["", "選んだ人："] +
                                                     [f"{e['id']}\t{e['nameJa']}\t{e['nameEn']}\t{e['born']}–{e['died']}\t{e['workCount']}" for e in order]) + "\n", encoding="utf-8")
    print("\n".join(head))


if __name__ == "__main__":
    main()
