#!/usr/bin/env python3
"""作品目録の後処理（tools/catalog_build_all.py から呼ぶ）

1. 未完・断片・消失の作品に status を付ける（flag_status）
   出典に書かれている印だけを使う：Wikidata の種類（unfinished creative work / fragment / lost work）、
   Open Opus の副題（Version completed by …）、IMSLP の作品情報欄（(fragment)・(incomplete)・Music lost.）、
   題名そのものの (fragment)・inachevée・unvollendet。通称の「Unfinished」（シューベルトの交響曲第8番など）は使わない
2. 同じ作品の重複を1件にまとめる（dedupe）
   - 作品番号が同じ（枝番まで同じ）で、調・番号・曲集かどうか・題が食い違わないもの
   - Wikidata が指す IMSLP のページ名にある作品番号が、別の記録の作品番号と同じもの
   - 題の芯が同じで、片方に目録番号が無いもの（固有の題があるときだけ。「Symphony」のような種類だけの題では結ばない）
   - 劇付随音楽の序曲（Egmont Overture）は劇付随音楽（Egmont, Op.84）に含める
   残すのは情報の多い記録（手で確かめた記録・NYP・作品番号・出典の数の順）。消える記録の id は aliases に、題は otherTitles に残す
3. 英語の題しかない作品に和題を組む（apply_ja_titles。組み方は tools/catalog_titles.py）
"""
import json, re
from pathlib import Path
from catalog_titles import ja_title, base_title, is_generic, CAT_TOKEN, _cat_tok_norm, fold

JP = re.compile(r"[぀-ヿ一-鿿]")

_ex = Path(__file__).resolve().parent.parent / "data-src" / "catalog" / "curated" / "merge-exclude.json"
EXCLUDE = {frozenset(p[:2]) for p in (json.loads(_ex.read_text(encoding="utf-8"))["pairs"] if _ex.exists() else [])}


def excluded(a, b):
    return frozenset((a["id"], b["id"])) in EXCLUDE


# ---- 1. 未完・断片・消失 ----
WD_FRAG = {"unfinished creative work": "未完成の作品", "fragment": "断片"}
WD_LOST = {"lost work": "消失した作品", "lost musical work": "消失した作品"}
OO_COMPLETION = re.compile(r"(?i)\b(completed by|completion by|reconstruct\w*|realized by|performing version)\b")
OO_FRAG = re.compile(r"(?i)\b(unfinished|incomplete|fragment)\b")
TITLE_FRAG = re.compile(r"(?i)[\(\[]\s*fragment\s*[\)\]]|\binachev[ée]e?\b|\bunvollendet\w*")


def flag_status(r):
    """(status, 注記, 根拠) を返す。印が無ければ None"""
    types = [t for t in (r.get("_wdtypes") or "").split("|") if t]
    for t in types:
        if t in WD_FRAG:
            return "fragment", f"未完成・断片の作品（Wikidata の分類「{t}」）", f"Wikidata: {t}"
    for t in types:
        if t in WD_LOST:
            return "lost", f"消失した作品（Wikidata の分類「{t}」）", f"Wikidata: {t}"
    sub = r.get("_sub") or ""
    if OO_COMPLETION.search(sub):
        return "fragment", f"作曲者の未完の草稿・スケッチを他者が補筆・再構成した版（Open Opus の副題「{sub}」）", f"Open Opus: {sub}"
    if OO_FRAG.search(sub):
        return "fragment", f"未完成・断片の作品（Open Opus の副題「{sub}」）", f"Open Opus: {sub}"
    f = r.get("_imslpf") or {}
    if f:
        ex = f.get("Extra Information", "")
        if re.match(r"(?i)\s*music lost\b", ex):
            return "lost", "楽譜が失われた作品（IMSLP の作品情報「Music lost」）", "IMSLP: Extra Information"
        alts = [a.strip(" ()") for a in re.split(r"<br>|;|/", f.get("Alternative Title", ""))]
        mv = (f.get("Number of Movements/Sections", "") + " " + f.get("Movements Header", "")).split("\n")[0]
        if re.search(r"(?i)[\(\[]\s*fragment\s*[\)\]]", f.get("Work Title", "")) or any(re.fullmatch(r"(?i)fragment|.*\(fragment", a) for a in alts if a) \
                or re.search(r"(?i)\((?:incomplete|fragment only)", mv) or re.search(r"(?i)^\s*incomplete\.|left incomplete by the composer", ex):
            return "fragment", "未完成・断片の作品（IMSLP の作品情報）", "IMSLP"
    t = re.sub(r"\s*,?\s*[\"“][^\"”]*[\"”]", "", r.get("titleEn") or "")
    m = TITLE_FRAG.search(t)
    if m:
        return "fragment", f"未完成・断片の作品（題名「{m.group(0).strip()}」）", f"題名: {m.group(0).strip()}"
    return None


# ---- 2. 重複 ----
SET_RX = re.compile(r"(?i)^(\d+|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty-four)\s|\b(collection|complete|works for|book|cycle|set)\b"
                    r"|^(?:[a-z]+ )?(sonatas|quartets|trios|quintets|concertos|concerti|symphonies|nocturnes|etudes|études|preludes|préludes|waltzes|valses|"
                    r"mazurkas|polonaises|impromptus|ballades|lieder|songs|bagatelles|dances|pieces|minuets|marches|rhapsodies|chorales|anthems|duets|duos)\b")
CAT_RANGE = re.compile(r"(?i)\b(?:op|bwv|hwv|rv|k|d|s|twv|woo|hob|wq)\.?\s*[ivxlc:]*\s*\d+[a-z]?\s*[-–]\s*\d+")


def is_set(r):
    t = r.get("titleEn") or ""
    return bool(SET_RX.search(t.strip()) or CAT_RANGE.search(t))


def spec_cat(r):
    """枝番まで入れた作品番号（Op.41 の記録でも題名に op. 41 nr. 2 とあれば op41/2）"""
    op = (r.get("catalog") or {}).get("opus") or ""
    if not op or re.search(r"(?i)posth", op):
        return ""  # Op.posth. は作品を特定しない
    n = _cat_tok_norm(op)
    m = re.search(re.escape(op.split()[-1].split(".")[-1]) + r"\s+([IVX]+)\b", r.get("titleEn") or "")
    if m:
        n += "/" + m.group(1).lower()  # BWV 232 I（ロ短調ミサの1733年稿）のような版の番号
    for tok in CAT_TOKEN.findall(r.get("titleEn") or ""):
        tn = _cat_tok_norm(tok)
        if tn.startswith(n) and len(tn) > len(n):
            n = tn
    return n


def head_no(r):
    if r.get("number"):
        return r["number"]
    t = re.sub(r"\s*,?\s*[\"“][^\"”]*[\"”]", "", r.get("titleEn") or "")
    head = re.split(r",|\s+in\s+[A-G]\b|\s+(?:Op|BWV|K|D|Hob|RV|HWV|WoO)\.?\s*\d", t, maxsplit=1)[0]
    m = re.search(r"(?i)\b(?:no|nr|n°)\.?\s*(\d+)", head)
    return int(m.group(1)) if m else None


def genre_ok(a, b):
    ga, gb = a.get("genre") or "other", b.get("genre") or "other"
    if ga == gb or "other" in (ga, gb):
        return True
    if ga.endswith("concerto") and gb.endswith("concerto"):
        return True
    if ga.endswith("sonata") and gb.endswith("sonata"):
        return True
    return False


def compatible(a, b):
    """同じ作品として結んでよいか（調・番号・曲集・種類が食い違わない）"""
    if excluded(a, b):
        return False
    ka, kb = eff_key(a), eff_key(b)
    if ka and kb and ka != kb:
        return False
    na, nb = head_no(a), head_no(b)
    if na and nb and na != nb:
        return False
    if is_set(a) != is_set(b):
        return False
    ca, cb = set_count(a), set_count(b)
    if ca and cb and ca != cb:
        return False
    return genre_ok(a, b)


def toks(base):
    return {w for w in base.split() if w not in ("the", "a", "an", "in", "for", "and", "of", "et", "und", "de", "la", "le", "der", "die", "das")}


PART_RX = re.compile(r"(?i)^\s*(?:the\s+)?(sarabande|air|aria|minuet|menuet|gigue|chorus|movement|overture|prelude|fugue|finale|adagio|andante|allegro|"
                     r"scherzo|march|dance|intermezzo|excerpts?|selections?|suite|étude|etude|no\.\s*\d+)\b[^,]*?\b(of|from|aus)\b")


def title_close(a, b):
    """題が同じ作品を指していると言えるか（語の重なり・つづりの近さ）。部分（〜 of / from 〜）と全体は結ばない"""
    import difflib
    ta_, tb_ = a.get("titleEn") or "", b.get("titleEn") or ""
    if bool(PART_RX.search(ta_)) != bool(PART_RX.search(tb_)):
        return False
    ba, bb = base_title(ta_), base_title(tb_)
    ta, tb = toks(ba), toks(bb)
    if not ta or not tb:
        return True
    ga, gb = is_generic(ba), is_generic(bb)
    if ga and gb:
        return bool(ta & tb)
    if ga != gb and not (ta <= tb or tb <= ta):
        return False
    if ta <= tb or tb <= ta:
        return True
    if len(ta & tb) / len(ta | tb) >= 0.5:
        return True
    if difflib.SequenceMatcher(None, ba, bb).ratio() >= 0.8:
        return True
    ja_a, ja_b = a.get("titleJa", ""), b.get("titleJa", "")
    return bool(a.get("_jaSrc") and b.get("_jaSrc") and ja_a == ja_b)


def set_count(r):
    m = re.match(r"(?i)^\s*(\d+|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty-four)\s", r.get("titleEn") or "")
    if not m:
        return None
    from catalog_titles import NUMW
    return int(m.group(1)) if m.group(1).isdigit() else NUMW.get(m.group(1).lower())


def years_agree(a, b):
    ya, yb = (a.get("composed") or [None])[0], (b.get("composed") or [None])[0]
    return bool(ya and yb and abs(ya - yb) <= 1)


def richness(r, curated_ids):
    srcs = {s.get("name") for s in r.get("sources", [])}
    op = (r.get("catalog") or {}).get("opus") or ""
    return (r["id"] in curated_ids, (r.get("nyp") or {}).get("performances", 0) > 0, op.startswith("Op."), bool(op), "IMSLP" in srcs,
            len(srcs), (r.get("nyp") or {}).get("performances", 0), bool(r.get("movements")), -len(r["id"]))


def incidental(r):
    return bool(re.search(r"(?i)incidental music", r.get("_sub") or ""))


def nick_bases(r):
    return {base_title(n) for n in (r.get("nicknames") or []) if n}


def merge_into(s, o):
    """o を s に統合する。s の値は上書きせず、空のところだけ埋める"""
    for k in ("key", "keyJa", "composed", "instrumentation", "movements", "firstPublished", "firstPerformance", "dedication",
              "durationMin", "category", "popular", "nicknameJa", "number", "articleId"):
        if s.get(k) in (None, "", [], {}, False) and o.get(k) not in (None, "", [], {}, False):
            s[k] = o[k]
    if not (s.get("catalog") or {}).get("opus") and (o.get("catalog") or {}).get("opus"):
        s["catalog"] = dict(o["catalog"])
    s["nicknames"] = list(dict.fromkeys((s.get("nicknames") or []) + (o.get("nicknames") or [])))
    ids = s.setdefault("ids", {})
    for k, v in (o.get("ids") or {}).items():
        if k == "also":
            for kk, vv in v.items():
                ids.setdefault("also", {}).setdefault(kk, [])
                ids["also"][kk] = list(dict.fromkeys(ids["also"][kk] + vv))
        elif v and not ids.get(k):
            ids[k] = v
        elif v and ids.get(k) != v:
            al = ids.setdefault("also", {}).setdefault(k, [])
            if v not in al:
                al.append(v)
    have = {(x.get("name"), x.get("url")) for x in s.get("sources", [])}
    s["sources"] = s.get("sources", []) + [x for x in o.get("sources", []) if (x.get("name"), x.get("url")) not in have]
    if o.get("nyp"):
        if not s.get("nyp") or (o["nyp"].get("performances", 0) > s["nyp"].get("performances", 0)):
            sc = (s.get("nyp") or {}).get("scores", [])
            s["nyp"] = dict(o["nyp"])
            if sc:
                s["nyp"]["scores"] = sc + [x for x in s["nyp"].get("scores", []) if x["id"] not in {y["id"] for y in sc}]
        elif o["nyp"].get("scores"):
            ids_ = {x["id"] for x in s["nyp"].get("scores", [])}
            s["nyp"].setdefault("scores", []).extend([x for x in o["nyp"]["scores"] if x["id"] not in ids_])
    for c in o.get("conflicts") or []:
        s.setdefault("conflicts", [])
        if c not in s["conflicts"]:
            s["conflicts"].append(c)
    s["aliases"] = list(dict.fromkeys((s.get("aliases") or []) + [o["id"]] + (o.get("aliases") or [])))
    ot = [t for t in [o.get("titleJa"), o.get("titleEn")] + (o.get("otherTitles") or []) if t and t not in (s.get("titleJa"), s.get("titleEn"))]
    if ot:
        s["otherTitles"] = list(dict.fromkeys((s.get("otherTitles") or []) + ot))
    if o.get("_sub") and not s.get("_sub"):
        s["_sub"] = o["_sub"]
    if o.get("_jaSrc") and base_title(o.get("titleEn")) in nick_bases(s):
        # 統合した記録が通称の題（Christmas Concerto → クリスマス協奏曲）なら、日本語名は通称として持つ
        if not s.get("nicknameJa"):
            s["nicknameJa"] = o["titleJa"]
            if base_has_jp(s.get("titleJa")) and "《" not in s["titleJa"]:
                s["titleJa"] += f"《{o['titleJa']}》"
    elif o.get("_jaSrc") and not base_has_jp(s.get("titleJa")):
        s["_jaLabel"] = s.get("_jaLabel") or o["titleJa"]
    if o.get("status") and not s.get("status"):
        pass  # 完成した記録に断片の印は移さない（どちらかが完成稿の記録なら完成稿として残す）


def eff_key(r):
    """記録の調。空なら調査結果（data-src/catalog/curated/keys.jsonl）で確定した調"""
    return r.get("key") or r.get("_rkey") or ""


def ja_core(r):
    """「クラリネット・ソナタ第1番」と調の組（番号と調の両方があるときだけ）"""
    k = eff_key(r)
    if not k:
        return None
    j = ja_title({**r, "key": k, "keyJa": "", "catalog": {}, "nicknameJa": "", "titleEn": CAT_TOKEN.sub("", r.get("titleEn") or "")}, {})
    if not j or "第" not in j:
        return None
    return re.split(r" (?:変|嬰)?[ハニホヘトイロ][長短]調", j)[0].strip(), k


def uniq(rs):
    seen, out = set(), []
    for r in rs:
        if id(r) not in seen:
            seen.add(id(r))
            out.append(r)
    return out


def dedupe(cid, recs, curated_ids, log):
    """同じ作品の記録を1件にまとめる。log には (残した id, 消した id, 理由) を足す"""
    pos = {id(r): i for i, r in enumerate(recs)}
    order = sorted(recs, key=lambda r: richness(r, curated_ids), reverse=True)
    survivors, by_spec = [], {}
    gone = set()
    # (a) 作品番号が同じもの
    for r in order:
        sc = spec_cat(r)
        if not sc:
            survivors.append(r)
            continue
        cands = [s for s in by_spec.get(sc, []) if compatible(s, r) and title_close(s, r)]
        if len(cands) == 1 and not (r.get("status") and not cands[0].get("status")) and not (cands[0].get("status") and not r.get("status")):
            merge_into(cands[0], r)
            gone.add(r["id"])
            log.append((cands[0]["id"], r["id"], "同じ作品番号", cands[0]["titleEn"], r["titleEn"]))
            continue
        if by_spec.get(sc) and not cands:
            log.append((by_spec[sc][0]["id"], r["id"], "保留：作品番号は同じだが調・番号・題が食い違う", by_spec[sc][0]["titleEn"], r["titleEn"]))
        survivors.append(r)
        by_spec.setdefault(sc, []).append(r)
    # (b) Wikidata が指す IMSLP ページの作品番号・(c) 題の芯が同じで片方に目録番号が無いもの
    with_op = [r for r in survivors if spec_cat(r)]
    by_base = {}
    for r in with_op:
        b = base_title(r["titleEn"])
        by_base.setdefault(b, []).append(r)
        for nb in nick_bases(r):
            by_base.setdefault(nb, []).append(r)
        if incidental(r):
            by_base.setdefault(("overture", b), []).append(r)
    out = []
    for r in survivors:
        if r["id"] in gone or r.get("_dead"):
            continue
        target, why = None, ""
        io = r.get("_imslpOp")
        own = spec_cat(r)
        if io and _cat_tok_norm(io) != own and not (own and re.match(r"[a-z]+", own).group(0) == re.match(r"[a-z]+", _cat_tok_norm(io)).group(0)):
            # 自分の目録番号と同じ目録で番号が違うもの（K.196 の記録が K.121 のページを指す など）は結ばない
            n = _cat_tok_norm(io)
            c = [s for s in with_op if s is not r and s["id"] not in gone and not s.get("_dead") and spec_cat(s) == n and compatible(s, r) and title_close(s, r)]
            if len(c) == 1:
                target, why = c[0], f"Wikidata の IMSLP ページ名の作品番号（{io}）"
        if not target and spec_cat(r):
            out.append(r)
            continue
        if not target and not (r.get("catalog") or {}).get("opus") and not CAT_TOKEN.search(r["titleEn"]):
            b = base_title(r["titleEn"])
            if b and not is_generic(b):
                c = [s for s in uniq(by_base.get(b, [])) if s is not r and s["id"] not in gone and not s.get("_dead") and compatible(s, r)]
                # 題だけで結ぶのは、相手の通称と一致するか、作曲年が両方にあって一致するときだけ（同名の別の歌曲などを避ける）
                if len(c) == 1 and (b in nick_bases(c[0]) or years_agree(c[0], r)):
                    target, why = c[0], "題が同じ（片方に目録番号なし。" + ("相手の通称と一致" if b in nick_bases(c[0]) else "作曲年も一致") + "）"
                else:
                    m = re.fullmatch(r"(?:overture to |ouverture )?(.+?)(?: overture| ouverture)?", b)
                    ob = m.group(1) if m and m.group(1) != b else None
                    if ob and (r.get("genre") == "overture"):
                        c = [s for s in uniq(by_base.get(("overture", ob), [])) if s["id"] not in gone and not s.get("_dead") and (not s.get("key") or not r.get("key") or s["key"] == r["key"])]
                        if len(c) == 1:
                            target, why = c[0], "劇付随音楽の序曲（劇付随音楽に含める）"
        if target and not r.get("status") and not target.get("status"):
            if richness(r, curated_ids) > richness(target, curated_ids):
                # 統合される側の方が情報が多い（作品番号 Op. がある など）ときは、そちらを残す。target はすでに out にあるので中身を入れ替える
                old_t = dict(target)
                target.clear()
                target.update(r)
                merge_into(target, old_t)
                gone.add(old_t["id"])
                log.append((target["id"], old_t["id"], why, target["titleEn"], old_t["titleEn"]))
                r["_dead"] = True  # 中身は target に移した
                continue
            merge_into(target, r)
            gone.add(r["id"])
            log.append((target["id"], r["id"], why, target["titleEn"], r["titleEn"]))
            continue
        out.append(r)
    # (d) 目録番号の無い記録で、「種類＋番号＋調」が目録番号のある記録とまったく同じもの（Sonata for Clarinet and Piano no. 1 in F minor と Clarinet Sonata no. 1, op. 120 no. 1）
    core = {}
    for r in out:
        k = ja_core(r)
        if k and spec_cat(r):
            core.setdefault(k, []).append(r)
    keep = []
    for r in out:
        k = ja_core(r)
        if k and not (r.get("catalog") or {}).get("opus") and not CAT_TOKEN.search(r["titleEn"]) and not r.get("status"):
            c = [s for s in core.get(k, []) if s is not r and compatible(s, r) and not s.get("status")]
            if len(c) == 1:
                merge_into(c[0], r)
                log.append((c[0]["id"], r["id"], "種類・番号・調が同じ（片方に目録番号なし）", c[0]["titleEn"], r["titleEn"]))
                continue
        keep.append(r)
    out = sorted(keep, key=lambda r: pos[id(r)])  # 目録の順（作曲家ごとの元の並び）に戻す
    # 統合した記録の和題：英語の題だけなら、統合した Wikidata の日本語名を使う
    for r in out:
        lab = r.pop("_jaLabel", None)
        if not lab:
            continue
        lab = re.sub(r"\s*(作品\S+|Op\.\S+)$", "", lab).strip()
        op = (r.get("catalog") or {}).get("opus") or ""
        from catalog_titles import cat_ja
        cj = cat_ja(op) if op else ""
        r["_jaSrc"] = "wikidata"
        if incidental(r):
            r["titleJa"] = f"劇付随音楽《{lab}》{cj}"
        else:
            r["titleJa"] = lab + (f" {cj}" if cj and cj not in lab else "")
        if r.get("nicknameJa") and "《" not in r["titleJa"]:
            r["titleJa"] += f"《{r['nicknameJa']}》"
    return out


def ja_label_collisions(cid, recs, log):
    """同じ Wikidata の日本語名が、全体（A et B）とその部分（A・B）の記録に付いているとき
    （ショパン 作品22 の名前がアンダンテ・スピアナート単独の記録にも付いている など）、全体にだけ残し、部分は原題に戻す。
    それ以外の同名（歌劇と同名の組曲など）は、どちらが名前の持ち主か決められないので触らない"""
    groups = {}
    for r in recs:
        if r.get("_jaSrc") == "wikidata":
            groups.setdefault(re.sub(r"\s*(作品\S+)$", "", r["titleJa"]).split("《")[0].strip(), []).append(r)
    for r in recs:
        for t in r.get("otherTitles") or []:
            if t in groups and r not in groups[t]:
                groups[t].append(r)
    for lab, rs in groups.items():
        if len(rs) < 2:
            continue
        bases = {base_title(r["titleEn"]) for r in rs}
        if len(bases) < 2:
            continue
        keep = max(rs, key=lambda r: (len(toks(base_title(r["titleEn"]))), bool((r.get("nyp") or {}).get("performances"))))
        kb = base_title(keep["titleEn"])
        halves = [h.strip() for h in re.split(r"\s+(?:et|and|und|e)\s+", kb) if h.strip()]
        if len(halves) < 2:
            continue  # 「A と B」の形の全体でなければ、どちらが名前の持ち主か決められないので触らない
        for r in rs:
            if r is keep:
                continue
            rb = base_title(r["titleEn"])
            if not any(rb == h or rb in h.split(" ", 1)[-1:] or (toks(rb) <= toks(h)) for h in halves):
                continue  # 全体の片方（部分）でなければ触らない
            old = r["titleJa"]
            r["titleJa"] = en_fallback(r)
            r["_jaSrc"] = ""
            r.setdefault("otherTitles", [])
            log.append((keep["id"], r["id"], f"日本語名「{lab}」は全体の名前のため、部分の記録は原題に戻した（{old} → {r['titleJa']}）", keep["titleEn"], r["titleEn"]))


def en_fallback(r):
    """原題＋和の調＋作品番号（catalog_build_all.make と同じ組み方）"""
    t = re.sub(r"\s+in [A-G](?:[ -](?:flat|sharp))? (?:major|minor)\b", "", r["titleEn"])
    t = re.sub(r",\s*" + re.escape((r.get("catalog") or {}).get("opus") or "@@") + r"$", "", t)
    from catalog_titles import cat_ja
    op = (r.get("catalog") or {}).get("opus") or ""
    return t + (f" {r['keyJa']}" if r.get("keyJa") else "") + (f" {cat_ja(op)}" if op else "")


# ---- 3. 和題 ----
def base_has_jp(t):
    b = re.sub(r"《.*", "", t or "")
    b = re.sub(r"\s*(変|嬰)?[ハニホヘトイロ](長調|短調).*$", "", b)
    b = re.sub(r"\s*作品\S+.*$", "", b)
    return bool(JP.search(b))


def apply_ja_titles(recs, curated_ids, nick_map, log):
    n = 0
    for r in recs:
        if r["id"] in curated_ids:
            continue
        if base_has_jp(r.get("titleJa")):
            # 種類だけで機械的に組んだ和題（Prelude and Fugue → 前奏曲）が題の一部を落としているときだけ組み直す
            if r.get("_jaSrc") == "wikidata":
                continue
            j = ja_title(r, nick_map)
            oh, nh = re.split(r"第|\s|《", r["titleJa"])[0], re.split(r"第|\s|《", j or "")[0]
            if j and nh != oh and nh.startswith(oh):
                log.append((r["id"], r["titleJa"], j))
                r["titleJa"] = j
                n += 1
            continue
        j = ja_title(r, nick_map)
        if j and j != r["titleJa"]:
            log.append((r["id"], r["titleJa"], j))
            r["titleJa"] = j
            n += 1
    return n
