#!/usr/bin/env python3
"""英語の題しかない作品に、日本語の題を機械的に組み立てる（tools/catalog_build_all.py から呼ぶ）

決まり
- 題名の全部の語が「種類・楽器・番号・調・作品番号」の語彙で読み切れるときだけ組む（例：Sonata for Clarinet and Piano no. 1 in F minor）。
  1語でも読めない語（固有の題・歌詞の題・地名など）があれば何もしない＝原題のまま。歌詞のある作品の題は訳さない
- 調は記録の key（調べた結果を含む）を使う。題名の調と記録の調が食い違うときは組まない
- 調の長短が書かれていない題（Symphony in C）は、記録の調の主音と一致するときだけ記録の調を使う
- 番号・作品番号は記録と題名にあるものだけ。足さない
"""
import re, unicodedata

NOTE_JA = {"C": "ハ", "D": "ニ", "E": "ホ", "F": "ヘ", "G": "ト", "A": "イ", "B": "ロ"}

# 種類（単数形, 複数形）→ 和名。複数形は「〜集」（数があれば「6つの〜」）
GENRES = {
    "symphony": "交響曲", "symphonie": "交響曲", "sinfonie": "交響曲", "sinfonia": "シンフォニア",
    "sonata": "ソナタ", "sonate": "ソナタ", "sonatina": "ソナチネ", "sonatine": "ソナチネ",
    "concerto": "協奏曲", "concerto grosso": "合奏協奏曲", "concertino": "コンチェルティーノ",
    "duo": "二重奏曲", "duet": "二重奏曲", "trio": "三重奏曲", "quartet": "四重奏曲", "quintet": "五重奏曲",
    "sextet": "六重奏曲", "septet": "七重奏曲", "octet": "八重奏曲", "nonet": "九重奏曲",
    "overture": "序曲", "ouverture": "序曲", "mass": "ミサ曲", "messe": "ミサ曲", "missa brevis": "ミサ・ブレヴィス",
    "missa solemnis": "ミサ・ソレムニス", "requiem": "レクイエム",
    "suite": "組曲", "partita": "パルティータ", "prelude": "前奏曲", "praeludium": "前奏曲", "preludium": "前奏曲",
    "fugue": "フーガ", "fuga": "フーガ", "fughetta": "フゲッタ", "etude": "練習曲", "study": "練習曲",
    "nocturne": "夜想曲", "notturno": "ノットゥルノ", "waltz": "ワルツ", "valse": "ワルツ", "mazurka": "マズルカ",
    "polonaise": "ポロネーズ", "ballade": "バラード", "scherzo": "スケルツォ", "impromptu": "即興曲",
    "variations": "変奏曲", "serenade": "セレナード", "divertimento": "ディヴェルティメント", "cassation": "カッサシオン",
    "fantasia": "幻想曲", "fantasy": "幻想曲", "fantaisie": "幻想曲", "fantasie": "幻想曲", "toccata": "トッカータ",
    "chaconne": "シャコンヌ", "ciaccona": "シャコンヌ", "passacaglia": "パッサカリア", "rondo": "ロンド", "rondeau": "ロンドー",
    "minuet": "メヌエット", "menuet": "メヌエット", "menuetto": "メヌエット", "march": "行進曲", "marche": "行進曲",
    "romance": "ロマンス", "romanze": "ロマンス", "bagatelle": "バガテル", "capriccio": "カプリッチョ", "caprice": "カプリス",
    "canon": "カノン", "invention": "インヴェンション", "gigue": "ジーグ", "sarabande": "サラバンド", "allemande": "アルマンド",
    "courante": "クーラント", "gavotte": "ガヴォット", "bourree": "ブーレ", "ecossaise": "エコセーズ", "landler": "レントラー",
    "german dance": "ドイツ舞曲", "contredanse": "コントルダンス", "dance": "舞曲", "rhapsody": "狂詩曲",
    "hungarian rhapsody": "ハンガリー狂詩曲", "intermezzo": "間奏曲", "berceuse": "子守歌", "barcarolle": "舟歌",
    "elegy": "エレジー", "elegie": "エレジー", "humoresque": "ユーモレスク", "song": "歌曲", "lied": "歌曲",
    "polka": "ポルカ", "galop": "ギャロップ", "tarantella": "タランテラ", "fanfare": "ファンファーレ", "chorale": "コラール",
    "chorale prelude": "コラール前奏曲", "choral prelude": "コラール前奏曲", "symphonic poem": "交響詩", "tone poem": "交響詩", "piece": "小品",
    "introduction": "序奏", "theme": "主題", "aria": "アリア", "air": "エア", "pastorale": "パストラール",
    "sinfonia concertante": "協奏交響曲", "symphonie concertante": "協奏交響曲", "double concerto": "二重協奏曲",
    "triple concerto": "三重協奏曲", "concert etude": "演奏会用練習曲", "church sonata": "教会ソナタ", "trio sonata": "トリオ・ソナタ",
    "english suite": "イギリス組曲", "french suite": "フランス組曲", "orchestral suite": "管弦楽組曲",
    "adagio": "アダージョ", "adagietto": "アダージェット", "andante": "アンダンテ", "andantino": "アンダンティーノ",
    "allegro": "アレグロ", "allegretto": "アレグレット", "largo": "ラルゴ", "larghetto": "ラルゲット", "presto": "プレスト",
    "lento": "レント", "moderato": "モデラート", "vivace": "ヴィヴァーチェ", "grave": "グラーヴェ",
}
PLURAL = {"symphonies": "symphony", "sonatas": "sonata", "sonates": "sonata", "sonatinas": "sonatina", "concertos": "concerto",
          "concerti": "concerto", "concerti grossi": "concerto grosso", "duos": "duo", "duets": "duet", "trios": "trio", "quartets": "quartet",
          "quintets": "quintet", "overtures": "overture", "masses": "mass", "suites": "suite", "partitas": "partita",
          "preludes": "prelude", "fugues": "fugue", "etudes": "etude", "studies": "study", "nocturnes": "nocturne", "waltzes": "waltz",
          "valses": "valse", "mazurkas": "mazurka", "polonaises": "polonaise", "ballades": "ballade", "scherzos": "scherzo",
          "scherzi": "scherzo", "impromptus": "impromptu", "serenades": "serenade", "divertimenti": "divertimento",
          "divertimentos": "divertimento", "fantasias": "fantasia", "fantasies": "fantasy", "toccatas": "toccata", "rondos": "rondo",
          "minuets": "minuet", "menuets": "menuet", "marches": "march", "romances": "romance", "bagatelles": "bagatelle",
          "caprices": "caprice", "capriccios": "capriccio", "canons": "canon", "inventions": "invention", "ecossaises": "ecossaise",
          "landlers": "landler", "german dances": "german dance", "contredanses": "contredanse", "dances": "dance",
          "rhapsodies": "rhapsody", "hungarian rhapsodies": "hungarian rhapsody", "intermezzos": "intermezzo", "intermezzi": "intermezzo",
          "songs": "song", "lieder": "lied", "polkas": "polka", "galops": "galop", "pieces": "piece", "chorales": "chorale",
          "chorale preludes": "chorale prelude", "symphonic poems": "symphonic poem", "concert etudes": "concert etude",
          "church sonatas": "church sonata", "trio sonatas": "trio sonata", "english suites": "english suite",
          "french suites": "french suite", "orchestral suites": "orchestral suite", "sinfonias": "sinfonia", "arias": "aria"}
# 楽器名の前置きと直結する種類（ピアノ協奏曲・弦楽四重奏曲・ヴァイオリン・ソナタ）
DIRECT = {"sonata", "sonate", "sonatina", "sonatine", "concerto", "duo", "duet", "trio", "quartet", "quintet", "sextet", "septet",
          "octet", "nonet", "suite", "partita", "symphony", "concertino"}
# 楽器（単数, 複数）→ 和名
INST = {
    "piano": "ピアノ", "pianoforte": "ピアノ", "fortepiano": "フォルテピアノ", "violin": "ヴァイオリン", "viola": "ヴィオラ",
    "cello": "チェロ", "violoncello": "チェロ", "double bass": "コントラバス", "contrabass": "コントラバス", "flute": "フルート",
    "piccolo": "ピッコロ", "oboe": "オーボエ", "oboe d'amore": "オーボエ・ダモーレ", "english horn": "イングリッシュ・ホルン",
    "clarinet": "クラリネット", "bassoon": "ファゴット", "horn": "ホルン", "trumpet": "トランペット", "trombone": "トロンボーン",
    "tuba": "テューバ", "harp": "ハープ", "organ": "オルガン", "harpsichord": "チェンバロ", "cembalo": "チェンバロ",
    "keyboard": "鍵盤楽器", "clavier": "鍵盤楽器", "guitar": "ギター", "lute": "リュート", "recorder": "リコーダー", "mandolin": "マンドリン",
    "viola da gamba": "ヴィオラ・ダ・ガンバ", "timpani": "ティンパニ", "percussion": "打楽器", "saxophone": "サクソフォーン",
    "strings": "弦楽", "string orchestra": "弦楽合奏", "orchestra": "管弦楽", "chamber orchestra": "室内管弦楽", "winds": "管楽器",
    "wind instruments": "管楽器", "wind band": "吹奏楽", "brass": "金管楽器", "voice": "声", "chorus": "合唱", "choir": "合唱",
    "soprano": "ソプラノ", "alto": "アルト", "tenor": "テノール", "baritone": "バリトン", "bass": "バス", "soloists": "独唱",
    "continuo": "通奏低音", "basso continuo": "通奏低音", "piano 4-hands": "ピアノ連弾", "piano four hands": "ピアノ連弾",
    "piano duet": "ピアノ連弾", "string quartet": "弦楽四重奏", "wind ensemble": "管楽合奏", "violone": "ヴィオローネ",
}
INST_PL = {"pianos": "piano", "violins": "violin", "violas": "viola", "cellos": "cello", "flutes": "flute", "oboes": "oboe",
           "clarinets": "clarinet", "bassoons": "bassoon", "horns": "horn", "trumpets": "trumpet", "trombones": "trombone",
           "harps": "harp", "organs": "organ", "harpsichords": "harpsichord", "keyboards": "keyboard", "guitars": "guitar",
           "lutes": "lute", "recorders": "recorder", "mandolins": "mandolin", "sopranos": "soprano", "altos": "alto",
           "tenors": "tenor", "baritones": "baritone", "basses": "bass", "voices": "voice", "string orchestras": "string orchestra",
           "orchestras": "orchestra", "violas da gamba": "viola da gamba", "choirs": "choir"}
# 楽器の集まり（「〜・ソナタ」「〜協奏曲」と直結させない）
GROUPS = {"voice", "strings", "string orchestra", "orchestra", "chamber orchestra", "winds", "wind instruments", "wind band", "brass",
          "chorus", "choir", "soloists", "continuo", "basso continuo", "string quartet", "wind ensemble", "percussion"}
# 「弦楽四重奏曲」の「弦楽」・「管弦楽組曲」のように、種類の前に置く語（楽器名以外）
PREFIX = {"string": "弦楽", "wind": "木管", "woodwind": "木管", "brass": "金管", "keyboard": "鍵盤", "clavier": "鍵盤",
          "organ": "オルガン", "solo": "無伴奏"}
NUMW = {"two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10, "eleven": 11,
        "twelve": 12, "thirteen": 13, "fourteen": 14, "fifteen": 15, "sixteen": 16, "eighteen": 18, "twenty": 20,
        "twenty-four": 24, "deux": 2, "trois": 3, "quatre": 4, "six ": 6, "douze": 12, "drei": 3, "sechs": 6, "zwolf": 12}
COUNT_JA = {2: "2つ", 3: "3つ", 4: "4つ", 5: "5つ", 6: "6つ", 7: "7つ", 8: "8つ", 9: "9つ"}

# 目録番号の一切れ（題名の中の BWV 1009・K. 460・Op. 120, No. 1・TWV 51:d1・Hob. XVI:23・KK Ve/10 など）
CAT_TOKEN = re.compile(
    r"(?i)\b(?:op(?:us)?\.?\s*posth\.?(?:\s*\d+[a-z]?(?:\s*,?\s*(?:no|nr|n°|n)\.?\s*\d+[a-z]?)?)?|op(?:us)?\.?\s*\d+[a-z]?(?:\s*,?\s*(?:no|nr|n°|n)\.?\s*\d+[a-z]?)?"
    r"|(?:bwv|hwv|rv|woo|twv|buxwv|wwv|trv|swv|sv|lwv|wab|bb|sz|fs|jw|js|eg|th|fp|av|cd|tn|mb|ms|qr|hess|kk|wq|hob|anh|bv|zwv|[kdslbmhrgjpz])"
    r"\.?\s*(?:anh\.?\s*)?[ivxlc]*[a-z]?[:./]?\s*\d+[a-z]?(?:[:/.]\s*[a-z]?\d*[a-z]?\d*)?(?:\s*,?\s*(?:no|nr|n°|n)\.?\s*\d+[a-z]?)?"
    r"|kk\s+[ivx]+[a-z]?/\d+)")
NO_TOKEN = re.compile(r"(?i)\b(?:no|nr|n°|nº|n)\.?\s*(\d+)\b|n°\s*(\d+)")
KEY_FULL = re.compile(r"(?i)\bin\s+([a-g])(?:[\s-]?(flat|sharp|♭|♯|b(?=[\s-])|#))?[\s-]+(major|minor|dur|moll)\b")
KEY_BARE = re.compile(r"(?i)\bin\s+([a-g])(?:[\s-]?(flat|sharp|♭|♯|#))?\b(?![\s-]*(?:major|minor))")


def fold(s):
    s = unicodedata.normalize("NFKD", s or "")
    return "".join(ch for ch in s if not unicodedata.combining(ch)).replace("’", "'").lower()


def key_code(note, acc, mode):
    a = {"flat": "b", "♭": "b", "b": "b", "sharp": "#", "♯": "#", "#": "#"}.get((acc or "").lower(), "")
    minor = (mode or "").lower() in ("minor", "moll")
    return f"{note.lower() if minor else note.upper()}{a}-{'minor' if minor else 'major'}"


def _inst(phrase):
    """「2 violins」「piano 4-hands」「solo violin」→ 和名。読めなければ None"""
    p = phrase.strip()
    p = re.sub(r"^(?:an?|the)\s+", "", p)
    n = 1
    m = re.match(r"^(\d+|two|three|four|five|six)\s+(.+)$", p)
    if m:
        n = int(m.group(1)) if m.group(1).isdigit() else NUMW[m.group(1)]
        p = m.group(2)
    solo = False
    if p.startswith("solo "):
        solo, p = n == 1, p[5:]
    base = INST_PL.get(p, p)
    if base not in INST:
        return None
    ja = INST[base]
    if solo and base == "voice":
        solo, ja = False, "独唱"
    if n > 1:
        if base == "voice":
            ja = f"{n}声"
        else:
            ja = (f"{n}台の" if base in ("piano", "harpsichord", "organ") else f"{n}つの") + ja
    return ("無伴奏" if solo else "") + ja, base, n


def _inst_list(s):
    parts = [x for x in re.split(r"\s*,\s*|\s+and\s+|\s*&\s*|\s+with\s+", s) if x]
    out = []
    for x in parts:
        r = _inst(x if len(parts) == 1 else re.sub(r"\bsolo\s+", "", x))  # 「無伴奏」は楽器が1つのときだけ
        if not r:
            return None
        out.append(r)
    return out


def _join(names):
    if len(names) == 1:
        return names[0]
    return "、".join(names[:-1]) + "と" + names[-1]


def _kana_end(s):
    return bool(s) and ("゠" <= s[-1] <= "ヿ")


def _genre(g):
    """種類の句（単数・複数）→ (和名, 単数形, 複数か)"""
    if g in GENRES:
        return GENRES[g], g, False
    if g in PLURAL:
        b = PLURAL[g]
        return GENRES[b], b, b != "variations"
    return None


def _count(n):
    return f"{n}つの" if n < 10 else f"{n}の"


# 「〜の主題による変奏曲」の作曲者名（veliq-academy/data/composers.json の英語の姓 → 日本語の姓）
COMPOSER_JA = {}
try:
    import json as _json
    from pathlib import Path as _P
    for _c in _json.loads((_P(__file__).resolve().parent.parent / "veliq-academy" / "data" / "composers.json").read_text(encoding="utf-8")):
        if _c.get("nameEn") and _c.get("name"):
            COMPOSER_JA.setdefault(fold(_c["nameEn"].split(" ")[-1]), _c["name"].split("・")[-1])
except Exception:  # noqa: BLE001
    pass
THEME = re.compile(r"^(?:(\d+|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+)?variations\s+on\s+(?:an?\s+)?(original theme|theme\s+(?:by|of)\s+([a-z' -]+?)|([a-z' -]+?)'s theme)$")


def _theme(t):
    """Variations on an Original Theme → 創作主題による変奏曲、Variations on a Theme by Schumann → シューマンの主題による変奏曲"""
    m = THEME.match(t)
    if not m:
        return None
    who = (m.group(3) or m.group(4) or "").strip()
    if m.group(2) == "original theme":
        head = "創作主題による"
    elif fold(who.split(" ")[-1]) in COMPOSER_JA:
        head = COMPOSER_JA[fold(who.split(" ")[-1])] + "の主題による"
    else:
        return None
    cnt = m.group(1)
    if cnt:
        cnt = int(cnt) if cnt.isdigit() else NUMW[cnt]
        return head + _count(cnt) + "変奏曲", False
    return head + "変奏曲", False


def _head(text):
    """「Clarinet Sonata」「Sonata for clarinet and piano」「Prelude and Fugue」「6 Sonatas」→ (和名, 曲集か)。読めなければ None"""
    t = text.strip(" ,;:-")
    if not t:
        return None
    th = _theme(t)
    if th:
        return th
    cnt = None
    m = re.match(r"^(\d+|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty-four)\s+(.+)$", t)
    if m:
        cnt = int(m.group(1)) if m.group(1).isdigit() else NUMW[m.group(1)]
        t = m.group(2)
    left = ""
    forp = None
    m = re.match(r"^(.+?),?\s+for\s+(.+)$", t)
    if m:
        t, forp = m.group(1).strip(), m.group(2).strip()
        if re.match(r"^(?:the\s+)?left hand(?: alone| only)?$", forp):
            left, forp = "左手のための", None
    # 「A and B」（前奏曲とフーガ・序奏とアレグロ）
    m = re.match(r"^(.+?)\s+(?:and|&|et|und)\s+(.+)$", t)
    if m and not forp and not cnt and _genre(m.group(1)) and _genre(m.group(2)):
        a, b = _genre(m.group(1)), _genre(m.group(2))
        if a[2] or b[2]:
            return None
        ja = "主題と変奏" if (a[1], b[1]) == ("theme", "variations") else f"{a[0]}と{b[0]}"
        return left + ja, False
    g = _genre(t)
    pre = None
    if not g:
        # 前置き（Violin Sonata, String Quartet, Keyboard Concerto, Piano Trio）
        words = t.split(" ")
        for i in range(len(words) - 1, 0, -1):
            gg = _genre(" ".join(words[i:]))
            if gg:
                p = " ".join(words[:i])
                pi = _inst(p)
                if gg[1] not in DIRECT:
                    return None
                if p in PREFIX and p != "solo":
                    pre = PREFIX[p]
                elif pi and pi[2] == 1 and not pi[0].startswith("無伴奏"):
                    pre = "鍵盤" if p in ("keyboard", "clavier") else pi[0]
                else:
                    return None
                g = gg
                break
    if not g:
        return None
    gja, gbase, plural = g
    if gbase == "piece" and not forp:
        return None  # 「Piece」だけでは題にならない
    inst = None
    if forp:
        inst = _inst_list(forp)
        if inst is None or pre:
            return None  # 読めない編成、または「Violin Concerto, for …」のような重なりは組まない
    sonata = gbase in ("sonata", "sonate", "sonatina", "sonatine")
    if inst:
        names = [x[0] for x in inst]
        bases = [x[1] for x in inst]
        single = [x for x in inst if x[2] == 1 and not x[0].startswith("無伴奏")]
        if sonata and len(inst) == 1 and inst[0][2] == 1 and bases[0] not in GROUPS:
            head = f"{names[0]}{'・' if _kana_end(names[0]) else ''}{gja}"
        elif sonata and len(inst) == 2 and len(single) == 2 and "piano" in bases and bases[0] != bases[1]:
            other = names[1] if bases[0] == "piano" else names[0]
            head = f"{other}{'・' if _kana_end(other) else ''}{gja}"
        elif gbase == "concerto" and len(inst) <= 2 and inst[0] in single and inst[0][1] not in GROUPS \
                and all(b == "orchestra" for b in bases[1:]):
            head = f"{names[0]}{gja}"
        else:
            head = f"{_join(names)}のための" + (_count(cnt) if cnt else "") + gja
            if cnt:
                if not plural and gbase != "variations":
                    return None
                return left + head, True
    elif pre:
        head = f"{pre}{'・' if (_kana_end(pre) and sonata) else ''}{gja}"
    else:
        head = gja
    head = left + head
    if cnt:
        if not plural and gbase != "variations":
            return None
        return _count(cnt) + head, True
    if plural:
        return head + "集", True
    return head, False


def cat_ja(c):
    m = re.match(r"(?i)Op\.\s*(\d+[a-z]?)(?:\s*No\.\s*(\d+[a-z]?))?$", c or "")
    if m:
        return f"作品{m.group(1)}" + (f"-{m.group(2)}" if m.group(2) else "")
    return c or ""


def _cat_tok_norm(s):
    s = fold(s)
    s = re.sub(r"\b(?:opus|op)\b\.?\s*(?:posth\b\.?)?", "op", s)
    s = re.sub(r"\b(?:no|nr|n°|n)\.?\s*", "/", s)
    s = re.sub(r"\bkv\b", "k", s)
    return re.sub(r"[\s.,:]+", "", s).replace("//", "/")


def _cat_tok_fmt(tok):
    """題名の目録番号の一切れを Veliq の書き方に（Op. 120, no. 1 → 作品120-1、K. 460 → K.460、BWV 1009 はそのまま）"""
    t = re.sub(r"\s+", " ", tok.strip(" ,"))
    m = re.match(r"(?i)op(?:us)?\.?\s*(\d+[a-z]?)(?:\s*,?\s*(?:no|nr|n°|n)\.?\s*(\d+[a-z]?))?$", t)
    if m:
        return f"作品{m.group(1)}" + (f"-{m.group(2)}" if m.group(2) else "")
    m = re.match(r"(?i)op(?:us)?\.?\s*posth\.?\s*(\d+[a-z]?)(?:\s*,?\s*(?:no|nr|n°|n)\.?\s*(\d+[a-z]?))?$", t)
    if m:
        return f"作品{m.group(1)}" + (f"-{m.group(2)}" if m.group(2) else "")
    if re.match(r"(?i)op\.?\s*posth", t):
        return "Op.posth."
    m = re.match(r"(?i)^(BWV|HWV|RV|TWV|WoO|BuxWV|WWV|TrV|SWV|SV|LWV|WAB|BB|JS|FS|JW|FP|TH|AV|CD|KK|Anh|Hess|MS|QR|EG|TN|MB)\.?\s*(.+)$", t)
    if m:
        pre = {"woo": "WoO", "buxwv": "BuxWV", "trv": "TrV", "anh": "Anh.", "hess": "Hess"}.get(m.group(1).lower(), m.group(1).upper())
        return f"{pre} {m.group(2)}" if not pre.endswith(".") else f"{pre}{m.group(2)}"
    m = re.match(r"(?i)^(Wq|Hob|Sz)\.?\s*(.+)$", t)
    if m:
        pre = {"wq": "Wq.", "hob": "Hob. ", "sz": "Sz. "}[m.group(1).lower()]
        return pre + m.group(2)
    m = re.match(r"^([KDSLBMHGJPRZ])\.?\s*(.+)$", t)  # 小文字の一文字（TWV 42:h6 の h6 など）は目録の略号ではないので触らない
    if m:
        return f"{m.group(1).upper()}.{m.group(2)}"
    return t


def ja_title(r, nick_map):
    """記録 r の英語の題から和題を組む。組めなければ None"""
    raw = r.get("titleEn") or ""
    t = raw
    nicks = re.findall(r"[\"“]([^\"”]+)[\"”]", t)
    t = re.sub(r"\s*,?\s*[\"“][^\"”]*[\"”]", "", t)
    t = re.sub(r"\s*\((?:[^()]*)\)", lambda m: m.group(0) if not re.search(r"\d|for |op\.", m.group(0), re.I) else "", t)
    if "(" in t or "[" in t or ":" in re.sub(CAT_TOKEN, "", t):
        return None
    rec_key = r.get("key") or ""
    rec_kja = r.get("keyJa") or ""
    # 調
    if not KEY_FULL.search(t):
        t = re.sub(r"(?i),?\s+(?=[A-G](?:[\s-]?(?:flat|sharp))?[\s-]+(?:major|minor)\s*(?:,|$))", " in ", t)  # 「…, No. 5 G Minor」の in の無い調
    keys = KEY_FULL.findall(t)
    if keys:
        for note, acc, mode in keys:
            if key_code(note, acc, mode) != rec_key:
                return None
        t = KEY_FULL.sub(" ", t)
    m = KEY_BARE.search(t)
    if m:
        k = rec_key
        if not k or k[0].upper() != m.group(1).upper():
            return None
        acc = {"flat": "b", "♭": "b", "sharp": "#", "♯": "#", "#": "#"}.get((m.group(2) or "").lower(), "")
        if (k[1:2] if k[1:2] in ("b", "#") else "") != acc:
            return None
        t = KEY_BARE.sub(" ", t)
    # 目録番号
    cats = [c.strip(" ,") for c in CAT_TOKEN.findall(t)]
    t = CAT_TOKEN.sub(" ", t)
    # 番号（第○番）
    no = None
    m = NO_TOKEN.search(t)
    if m:
        no = int(m.group(1) or m.group(2))
        t = NO_TOKEN.sub(" ", t, count=1)
        if NO_TOKEN.search(t):
            return None
    if r.get("number") and no and r["number"] != no:
        return None
    no = no or (r.get("number") if r.get("genre") not in ("other",) else None)
    t = re.sub(r"\s+", " ", re.sub(r"\s*,\s*", ", ", t)).strip(" ,;-")
    t = re.sub(r",\s*$", "", t)
    hd = _head(fold(t).replace(" ,", ","))
    if not hd:
        return None
    head, is_set = hd
    if is_set:
        no, rec_kja = None, ""  # 曲集の題には番号・調を付けない（調は記録の key に残る）
    # 作品番号：記録の catalog.opus を先に、題名にある別の目録番号を後に
    out_c = []
    seen = set()
    op = (r.get("catalog") or {}).get("opus") or ""
    if op:
        out_c.append(_cat_tok_fmt(op))
        seen.add(_cat_tok_norm(op))
    for c in cats:
        n = _cat_tok_norm(c)
        if not n or any(s.startswith(n) or n.startswith(s) for s in seen):
            continue
        seen.add(n)
        out_c.append(_cat_tok_fmt(c))
    ja = head + (f"第{no}番" if no else "") + (f" {rec_kja}" if rec_kja else "") + "".join(f" {c}" for c in out_c if c)
    nj = r.get("nicknameJa") or ""
    if nj:
        ja += f"《{nj}》"
    else:
        for n in nicks:
            v = nick_map.get(n.lower())
            if v == "":
                continue
            if not v and not re.fullmatch(r"[\w .,!’'&-]{1,40}", n):
                return None  # 読めない通称が付いた題は組まない
            ja += f"《{v or n}》"
            break
    return ja


# ---- 重複の判定に使う題の正規化 ----
STOP = {"the", "a", "an", "in", "for", "and", "of", "no", "nr", "op", "et", "und", "de", "la", "le", "der", "die", "das"}


def base_title(s):
    """題の芯：引用の通称・調・目録番号・番号・括弧を外し、記号と大文字小文字とアクセントをそろえる"""
    t = re.sub(r"\s*,?\s*[\"“][^\"”]*[\"”]", "", s or "")
    t = re.sub(r"\s*[\(\[][^()\[\]]*[\)\]]", "", t)
    t = KEY_FULL.sub(" ", t)
    t = CAT_TOKEN.sub(" ", t)
    t = NO_TOKEN.sub(" ", t)
    t = fold(t)
    t = re.sub(r"[^a-z0-9' ]+", " ", t)
    return re.sub(r"\s+", " ", t).strip()


GENERIC_WORDS = set()
for _k in list(GENRES) + list(PLURAL) + list(INST) + list(INST_PL) + list(PREFIX) + list(NUMW):
    GENERIC_WORDS.update(_k.split())
GENERIC_WORDS |= STOP | {"major", "minor", "flat", "sharp", "with", "solo", "hands", "4-hands", "left", "hand", "orchestral",
                         "concert", "church", "english", "french", "german", "hungarian", "double", "triple", "string", "wind",
                         "c", "d", "e", "f", "g", "a", "b", "posth", "op", "opus", "i", "ii", "iii", "iv", "v"}


def is_generic(base):
    """題の芯が種類・楽器・数の語だけでできている（固有の題が無い）"""
    ws = [w for w in base.split() if not w.isdigit()]
    return all(w in GENERIC_WORDS for w in ws)
