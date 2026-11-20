#!/usr/bin/env python3
"""Veliq メディア共通の後処理（2026-11-10）。何度実行しても同じ結果になる。

  python3 _net/vq_net.py <site> <配信ディレクトリ>        # 全 HTML に適用
  python3 _net/vq_net.py --refresh <リポジトリの親ディレクトリ>  # crosslinks.json の titles を作り直す

やること（全サイト同じ）
  1. 本文末の「Veliq の他メディアで読む」（_net/crosslinks.json の topic 表から 1〜3 本）
  2. メニューの「Veliq アプリ」を app.html?…&from=<site>&ret=<頁URL> の深いリンクに
  3. og:image（サイト既定の画像）・twitter:card・欠けた og:title / og:description
  4. フッター「Veliq のメディア」の並び・表記と © 2026 の行
  5. Veliq 各サイトへの .html 付きリンクを拡張子なしに
  6. パンくずの先頭「トップ」・区切り「›」、PR表記の文言、CSS/JS の版（内容のハッシュ）
各サイトの生成スクリプト（table: tools/build-articles.js、living: build.sh）の最後でも呼ぶ。
この _net/ は 8 リポジトリで同じ内容。直すときは全部に同じものを入れる。
"""
import hashlib, html, json, os, re, sys
from urllib.parse import quote

HERE = os.path.dirname(os.path.abspath(__file__))

SITES = {
    'finance': dict(domain='veliq-finance.com', name='Veliq Finance', og='/ogp.png', app='field=life&cat=money'),
    'table':   dict(domain='veliq-table.com',   name='Veliq Table',   og='/ogp.png', app='field=gourmet'),
    'living':  dict(domain='veliq-living.com',  name='Veliq Living',  og='/ogp.png', app='field=life&cat=home'),
    'vita':    dict(domain='veliq-vita.com',    name='Veliq Vita',    og='/ogp.png', app='field=life&cat=body'),
    'atelier': dict(domain='veliq-atelier.com', name='Veliq Atelier', og='/ogp.png', app='field=life&cat=wear'),
    'career':  dict(domain='veliq-career.com',  name='Veliq Career',  og='/ogp.png', app='field=life&cat=work'),
    # Works の中身は 2026-11-19 に Veliq Career の /toukei/ へ移した（veliq-works.com はウェブ制作のサイトになる）
    'works':   dict(domain='veliq-career.com/toukei', name='Veliq Career', og='/og/index.png', app='field=life&cat=work'),
    'academy': dict(domain='veliq-academy.com', name='Veliq Academy', og=None, app=None),
    'jp':      dict(domain='veliq.jp',          name='VELIQ',         og='/ogp.png', app=None),
}
# フッター「Veliq のメディア」— Veliq Finance の並びと表記が正
FAMILY = [('VELIQ', 'https://veliq.jp/'), ('Veliq Finance', 'https://veliq-finance.com/'),
          ('Veliq Table', 'https://veliq-table.com/'), ('Veliq Living', 'https://veliq-living.com/'),
          ('Veliq Vita', 'https://veliq-vita.com/'), ('Veliq Atelier', 'https://veliq-atelier.com/'),
          ('Veliq Career', 'https://veliq-career.com/'),
          ('Veliq Academy', 'https://veliq-academy.com/'), ('Veliq Club', 'https://veliqclub.com/')]
COPY = '© 2026 一般社団法人VariOrchestra'
# PR表記（アフィリエイトのリンクがあるサイト＝Finance の文言。予定・可能性の段階のサイトは「場合があります」）
PR_NOW = '本サイトには広告(PR)を含みます'
PR_MAY = '本サイトには広告(PR)を含む場合があります'
SKIP_DIRS = {'.git', 'node_modules', 'docs', 'pipeline', 'factory-src', 'tools-unify', '__pycache__',
             'setup', 'data-src', 'csv', '_net', 'tools-src'}
XL_H = 'Veliq の他メディアで読む'


def url_of(site, path):
    return 'https://%s/%s' % (SITES[site]['domain'], path)


def page_path(rel):
    """ファイルの相対パス → 拡張子なしのパス（'' はトップ）"""
    if rel == 'index.html':
        return ''
    if rel.endswith('/index.html'):
        return rel[:-len('index.html')]
    return rel[:-5] if rel.endswith('.html') else rel


# ---------------------------------------------------------------- 1. 相互リンク
def load_xl():
    p = os.path.join(HERE, 'crosslinks.json')
    return json.load(open(p, encoding='utf-8')) if os.path.exists(p) else None


def xl_targets(XL, site, path, page_html):
    out, seen = [], set()
    for t in XL['topics']:
        if path not in t['members'].get(site, []):
            continue
        for s2, paths in t['best'].items():
            if s2 == site or {s2, site} == {'career', 'works'}:
                continue  # 同じサイト（Career と、Career に移した Works）は「他メディア」に出さない
            for p2 in paths:
                u = url_of(s2, p2)
                if u in seen or u not in XL['titles']:
                    continue
                if re.search(r'href="%s(?:\.html)?(?:[#?"])' % re.escape(u.rstrip('/')), page_html):
                    continue  # 本文で既に張っている先は出さない
                seen.add(u)
                out.append((s2, u))
    # サイトが偏らないよう、サイトごとに順番に取る
    by = {}
    for s2, u in out:
        by.setdefault(s2, []).append(u)
    picked = []
    while len(picked) < 3 and any(by.values()):
        for s2 in list(by):
            if by[s2] and len(picked) < 3:
                picked.append((s2, by[s2].pop(0)))
    return picked


def xl_block(XL, picked):
    lis = ''.join('<li><a href="%s"><span class="vq-xl-s">%s</span>%s</a></li>' % (
        u, SITES[s2]['name'], html.escape(XL['titles'][u], quote=False)) for s2, u in picked)
    return ('<!--vq-xl--><aside class="vq-xl" aria-label="%s"><p class="vq-xl-h">%s</p><ul>%s</ul></aside><!--/vq-xl-->'
            % (XL_H, XL_H, lis))


XL_RE = re.compile(r'<!--vq-xl-->.*?<!--/vq-xl-->', re.S)


def insert_xl(t, block):
    """本文の列の最後に入れる。見つからなければ入れない（None を返す）"""
    m_main = re.search(r'<main\b[^>]*>', t)
    main_end = t.rfind('</main>')
    # (a) 2段組み（Finance のデータ頁など）：右の <aside class="side"> の直前の </div> の前
    m = re.search(r'</div>(\s*<aside class="side")', t)
    if m:
        return t[:m.start()] + block + t[m.start():]
    # (a2) Finance の計算機の頁：解説（.article）の閉じの前
    m = re.search(r'</div>(\s*</section>\s*<!-- 監修者)', t)
    if m:
        return t[:m.start()] + block + t[m.start():]
    # (b) <article>（教科書の章など）の閉じの前
    if main_end > 0:
        k = t.rfind('</article>', 0, main_end)
        if k > 0 and (not m_main or k > m_main.end()):
            return t[:k] + block + t[k:]
    # (c) 本文末の「関連」節（Vita・Works の百科・レポート）の前
    m = re.search(r'<section style="padding:[23]\dpx 0 5\dpx;border-top:1px solid var\(--line\)">', t) or re.search(r'<div style="padding-bottom:5\dpx"></div>', t)
    if m:
        return t[:m.start()] + block + t[m.start():]
    # (d) Finance 百科：引用の注記の前
    k = t.find('<p class="citepolicy">')
    if k > 0:
        return t[:k] + block + t[k:]
    # (e) 出典の見出し・出典の箱の前（Living・Career）
    k = t.find('<h2 id="sources">')
    if 0 < k:
        return t[:k] + block + t[k:]
    if main_end > 0:
        k = t.rfind('<div class="src">', 0, main_end)
        if k > 0:
            return t[:k] + block + t[k:]
    # (f) <main> の末尾：閉じタグの連なりの内側（一番内側の箱の最後）
    if main_end > 0:
        m = re.search(r'((?:</(?:div|section)>\s*)*)</main>', t[:main_end + 7])
        if m and m.group(1):
            j = m.start()
            return t[:j] + block + t[j:]
        # <main> 自体が本文の列（class に wrap）ならそのまま、違えばサイトの .wrap で包む
        if m_main and re.search(r'class="[^"]*\bwrap\b', m_main.group(0)):
            return t[:main_end] + block + t[main_end:]
        block = block.replace('<!--vq-xl--><aside', '<!--vq-xl--><div class="wrap"><aside').replace('</aside><!--/vq-xl-->', '</aside></div><!--/vq-xl-->')
        return t[:main_end] + block + t[main_end:]
    return None


# ---------------------------------------------------------------- 本体
def canon_of(t, site, rel):
    m = re.search(r'<link rel="canonical" href="([^"]+)"', t)
    return m.group(1) if m else url_of(site, page_path(rel))


def fix_head(t, site, canon):
    S = SITES[site]
    head_end = t.find('</head>')
    if head_end < 0:
        return t
    head = t[:head_end]
    add = []
    if 'property="og:title"' not in head:
        m = re.search(r'<title>(.*?)</title>', head, re.S)
        if m:
            add.append('<meta property="og:title" content="%s">' % m.group(1).strip().replace('"', '&quot;'))
    if 'property="og:description"' not in head:
        m = re.search(r'<meta name="description" content="([^"]*)"', head)
        if m:
            add.append('<meta property="og:description" content="%s">' % m.group(1))
    if 'property="og:url"' not in head:
        add.append('<meta property="og:url" content="%s">' % canon)
    if 'property="og:image"' not in head and S['og']:
        add.append('<meta property="og:image" content="https://%s%s">' % (S['domain'], S['og']))
    if 'name="twitter:card"' not in head:
        add.append('<meta name="twitter:card" content="summary_large_image">')
    else:
        head = re.sub(r'<meta name="twitter:card" content="summary">', '<meta name="twitter:card" content="summary_large_image">', head)
    if add:
        # og:* の並びの後ろ、無ければ </head> の直前
        ms = list(re.finditer(r'<meta property="og:[^>]*>\n?', head))
        k = ms[-1].end() if ms else len(head)
        ins = '\n'.join(add) + '\n'
        if ms and not head[k - 1:k] == '\n':
            ins = '\n' + ins
        head = head[:k] + ins + head[k:]
    return head + t[head_end:]


def fix_app(t, site, canon):
    S = SITES[site]
    if not S['app']:
        return t
    href = 'https://veliqclub.com/app.html?%s&from=%s&ret=%s' % (S['app'], site, quote(canon, safe=''))
    href = href.replace('&', '&amp;')
    return re.sub(r'<a class="mapp" href="https://veliqclub\.com/(?:home\.html|app\.html\?[^"]*)"(?: rel="noopener")?>[^<]*</a>',
                  '<a class="mapp" href="%s">Veliq アプリで学ぶ</a>' % href, t)


def fix_footer(t, site):
    i = t.find('<footer')
    if i < 0:
        return t
    j = t.find('</footer>', i)
    if j < 0:
        return t
    f = t[i:j]
    me = 'https://%s/' % SITES[site]['domain']
    fam = ''.join('<a href="%s"%s>%s</a>' % (u, ' aria-current="page"' if u == me else '', n) for n, u in FAMILY)
    f = re.sub(r'(Veliq のメディア</(?:h4|p)>\s*(?:<div class="gf-fam">|<ul>)?)((?:\s*(?:<li>)?<a\b[^>]*>[^<]*</a>(?:</li>)?)+)',
               lambda m: m.group(1) + (fam if '<li>' not in m.group(2) else ''.join('<li>%s</li>' % a for a in re.findall(r'<a\b.*?</a>', fam))),
               f, count=1)
    f = re.sub(r'(?:©|&copy;)\s*(?:20\d\d\s*)?一般社団法人VariOrchestra', COPY, f)
    return t[:i] + f + t[j:]


def fix_html_links(t):
    def rep(m):
        host, path, rest = m.group(1), m.group(2), m.group(3) or ''
        if path.endswith('404.html'):
            return m.group(0)
        if path == 'index.html' or path.endswith('/index.html'):
            path = path[:-len('index.html')]
        else:
            path = path[:-5]
        return 'href="https://%s/%s%s"' % (host, path, rest)
    return re.sub(r'href="https://((?:veliq-[a-z]+\.com)|veliq\.jp)/([^"#?]*\.html)([#?][^"]*)?"', rep, t)


def fix_crumbs(t):
    def inner(s):
        s = re.sub(r'<span>/</span>', '<span>›</span>', s)
        s = s.replace('&rsaquo;', '›')
        # 先頭（サイトのトップへのリンク）を「トップ」に
        s = re.sub(r'(<a href="(?:\./|\.\./|/|(?:\.\./)+|index\.html|\.\./index\.html|(?:\.\./)+index\.html)">)(?:ホーム|Veliq [A-Za-z]+|トップ)(</a>)', r'\1トップ\2', s, count=1)
        return s
    return re.sub(r'(<(nav|div|p|ol)\b[^>]*(?:class="[^"]*\b(?:bc|crumb|vb-crumb|vq-crumb|breadcrumb)\b[^"]*"|aria-label="パンくず[^"]*")[^>]*>)(.*?)(</\2>)',
                  lambda m: m.group(1) + inner(m.group(3)) + m.group(4), t, flags=re.S)


def fix_pr(t, site):
    if site == 'finance':
        return re.sub(r'(<div class="pr-bar">)[^<]*(</div>)', r'\g<1>%s\2' % PR_NOW, t)
    if site in ('living', 'table', 'atelier'):
        # 頁固有の注記（住所録の「掲載店との金銭関係はありません」など）は残す
        return re.sub(r'(<div class="pr-bar">)(?![^<]*(?:金銭関係|独立))[^<]*(</div>)', r'\g<1>%s\2' % PR_MAY, t)
    return t


def fix_gold(t):
    t = re.sub(r'(fill|stroke)="#8A6A2A"', r'\1="#9A7B3A"', t, flags=re.I)
    t = re.sub(r'background:#8A6A2A', 'background:#9A7B3A', t, flags=re.I)
    t = re.sub(r"(fillStyle=|strokeStyle=|\?)'#8A6A2A'", r"\1'#9A7B3A'", t, flags=re.I)
    return re.sub(r'--(gold|vq-gold|champ):#8A6A2A', r'--\1:#9A7B3A', t, flags=re.I)


def asset_ver(t, root, rel):
    """CSS/JS の ?v= を中身のハッシュに（キャッシュの取り違えを防ぐ）"""
    def rep(m):
        src = m.group(2)
        base = os.path.dirname(rel)
        p = os.path.normpath(os.path.join(root, src.lstrip('/')) if src.startswith('/') else os.path.join(root, base, src))
        if not os.path.exists(p):
            return m.group(0)
        h = hashlib.md5(open(p, 'rb').read()).hexdigest()[:8]
        return '%s="%s?v=%s"' % (m.group(1), src, h)
    return re.sub(r'(href|src)="((?:[./]*|/)(?:assets/)?(?:vq-ui\.css|ui\.css|vq-book\.js|vq-book\.css))(?:\?v=[^"]*)?"', rep, t)


# 表の数字の列：見出しも数字も右寄せにそろえる（class="n"）。4列以上で行見出しのある表はスマホで行ごとの段に組む（data-stack・data-label）。2026-11-20
NUM_RE = re.compile(r'^[約~〜+\-−▲△±]?\s*[0-9０-９][0-9０-９,，.．]*\s*[%％]?\s*(億|万|千)?\s*(円|ドル|人|件|倍|年|歳|時間|分|日|回|点|位|pt|kL|ml|L|℃|g|kg|本|杯)?\s*(以上|以下|未満|超|前後)?$')
TABLE_RE = re.compile(r'<table\b[^>]*>.*?</table>', re.S)
CELL_RE = re.compile(r'<(th|td)\b([^>]*)>(.*?)</\1>', re.S)


def _txt(h):
    return html.unescape(re.sub(r'<[^>]+>', '', h)).strip()


def _addcls(attrs, c):
    m = re.search(r'\sclass="([^"]*)"', attrs)
    if m:
        if c in m.group(1).split():
            return attrs
        return attrs[:m.start()] + ' class="%s %s"' % (m.group(1), c) + attrs[m.end():]
    return attrs + ' class="%s"' % c


def fix_table(tb):
    head = tb[:tb.index('>') + 1]
    if 'role="presentation"' in head or re.search(r'class="[^"]*\b(matrix|pr|pt|stack)\b', head) or re.search(r'(col|row)span', tb):
        return tb
    rows = re.findall(r'<tr\b[^>]*>.*?</tr>', tb, re.S)
    if not rows:
        return tb
    hdr = [r for r in rows if '<td' not in r]
    body = [r for r in rows if '<td' in r]
    if not body:
        return tb
    width = max(len(CELL_RE.findall(r)) for r in rows)
    numcols, symcols = set(), set()
    for ci in range(1, width):
        vals = []
        for r in body:
            cs = CELL_RE.findall(r)
            if ci < len(cs) and cs[ci][0] == 'td':
                v = _txt(cs[ci][2])
                if v and v not in ('-', '—', '―', '–'):
                    vals.append(v)
        if len(vals) >= 2 and sum(1 for v in vals if NUM_RE.match(v)) >= 0.8 * len(vals):
            numcols.add(ci)
        elif len(vals) >= 2 and all(len(v) <= 2 for v in vals) and sum(1 for v in vals if re.search(r'[○◎△×✓✔●▲−-]', v)) >= 0.5 * len(vals):
            symcols.add(ci)
    heads = [_txt(c[2]) for c in CELL_RE.findall(hdr[-1])] if hdr else []
    stack = (len(heads) >= 4 and 'class="vt' not in head and any(re.search(r'<tr\b[^>]*>\s*<th', r) for r in body))

    def mark(r, is_body):
        i = [-1]

        def cell(m):
            i[0] += 1
            tag, attrs, inner = m.group(1), m.group(2), m.group(3)
            if tag == 'td' and re.search(r'\sclass="[^"]*\bn\b', attrs) and not NUM_RE.match(_txt(inner)) and len(re.findall(r'[ぁ-んァ-ヶ一-龥]', _txt(inner))) >= 3:
                attrs = re.sub(r'(\sclass="[^"]*?)\s*\bn\b', r'\1', attrs).replace(' class=""', '')
            if i[0] in numcols:
                attrs = _addcls(attrs, 'n')
            elif i[0] in symcols:
                attrs = _addcls(attrs, 'c')
            if stack and is_body and tag == 'td' and i[0] < len(heads) and 'data-label' not in attrs:
                attrs += ' data-label="%s"' % html.escape(heads[i[0]], quote=True)
            return '<%s%s>%s</%s>' % (tag, attrs, inner, tag)
        return CELL_RE.sub(cell, r)
    out = tb
    for r in rows:
        out = out.replace(r, mark(r, '<td' in r), 1)
    if stack and 'data-stack' not in head:
        out = out.replace('<table', '<table data-stack', 1)
    return out


def fix_tables(t):
    if '<table' not in t:
        return t
    return TABLE_RE.sub(lambda m: fix_table(m.group(0)), t)


# 見出し(h1)を言葉の区切りで折り返す：句読点のあとと、助詞で終わるひらがなのあとに <wbr> を入れ、CSS は keep-all（2026-11-20）
_H1_RE = re.compile(r'(<h1\b[^>]*>)(.*?)(</h1>)', re.S)
_BRK = re.compile(r'([。、・?？!！」』）]|[をはがにでとのもへやか](?=[\ue000-\uf8ff]*[一-龥々〆ァ-ヺ0-9０-９A-Za-zＡ-Ｚ「『（(]))(?=[\ue000-\uf8ff]*[^\ue000-\uf8ff\s]{2})')


def fix_h1(t):
    def one(m):
        inner = m.group(2).replace('<wbr>', '')
        if 'data-nowbr' in m.group(1):
            return m.group(0)
        tags = []

        def hide(t):
            tags.append(t.group(0))
            return chr(0xE000 + len(tags) - 1)
        inner = re.sub(r'<[^>]+>', hide, inner)
        inner = _BRK.sub(lambda x: x.group(1) + '\uf8ff', inner)
        inner = re.sub(r'(?<=[^\s\ue000-\uf8ff])(?=[《「『（(])', '\uf8ff', inner)
        inner = re.sub(r'(?<=[ァ-ヺー一-龥])(?=とは)', '\uf8ff', inner)
        inner = inner.replace('\uf8ff', '<wbr>')
        return m.group(1) + re.sub(r'[\ue000-\uf8fe]', lambda x: tags[ord(x.group(0)) - 0xE000], inner) + m.group(3)
    return _H1_RE.sub(one, t, count=1)


def process(site, root):
    XL = load_xl()
    stats = dict(pages=0, changed=0, xl=0, xl_missing=[])
    for dp, dn, fn in os.walk(root):
        dn[:] = [d for d in dn if d not in SKIP_DIRS and not d.startswith('.') and not (site == 'career' and dp == root and d == 'toukei')]
        for f in fn:
            if not f.endswith('.html'):
                continue
            p = os.path.join(dp, f)
            rel = os.path.relpath(p, root).replace(os.sep, '/')
            t0 = t = open(p, encoding='utf-8').read()
            if '<html' not in t[:500].lower():
                continue
            stats['pages'] += 1
            canon = canon_of(t, site, rel)
            t = fix_head(t, site, canon)
            t = fix_app(t, site, canon)
            t = fix_footer(t, site)
            t = fix_html_links(t)
            t = fix_crumbs(t)
            t = fix_pr(t, site)
            t = fix_gold(t)
            t = fix_tables(t)
            t = fix_h1(t)
            t = asset_ver(t, root, rel)
            if XL:
                t = XL_RE.sub('', t)
                picked = xl_targets(XL, site, page_path(rel), t)
                if picked:
                    t2 = insert_xl(t, xl_block(XL, picked))
                    if t2:
                        t = t2
                        stats['xl'] += 1
                    else:
                        stats['xl_missing'].append(rel)
            if t != t0:
                open(p, 'w', encoding='utf-8').write(t)
                stats['changed'] += 1
    return stats


def refresh(base):
    """crosslinks.src.json → crosslinks.json（titles を各サイトの h1 から）"""
    src = json.load(open(os.path.join(HERE, 'crosslinks.src.json'), encoding='utf-8'))
    roots = {'finance': 'veliq-finance', 'table': 'veliq-table/veliq-table', 'living': 'veliq-living', 'vita': 'veliq-vita',
             'atelier': 'veliq-atelier', 'career': 'veliq-career', 'works': 'veliq-career/toukei', 'academy': 'veliq-academy/veliq-academy',
             'jp': 'veliq-jp'}
    titles, missing = {}, []
    for tp in src['topics']:
        for grp in ('best', 'members'):
            for s, paths in tp[grp].items():
                for p in paths:
                    r = os.path.join(base, roots[s])
                    f = os.path.join(r, p + 'index.html') if p.endswith('/') or p == '' else os.path.join(r, p + '.html')
                    if not os.path.exists(f):
                        missing.append('%s:%s' % (s, p))
                        continue
                    if grp == 'best':
                        t = open(f, encoding='utf-8').read()
                        m = re.search(r'<h1[^>]*>(.*?)</h1>', t, re.S)
                        h = re.sub(r'<[^>]+>', '', m.group(1)) if m else re.sub(r'[｜|].*$', '', re.search(r'<title>(.*?)</title>', t, re.S).group(1))
                        titles[url_of(s, p)] = html.unescape(re.sub(r'\s+', ' ', h)).strip()
    src['titles'] = titles
    json.dump(src, open(os.path.join(HERE, 'crosslinks.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('titles', len(titles), 'missing', missing)


if __name__ == '__main__':
    if sys.argv[1] == '--refresh':
        refresh(sys.argv[2])
    else:
        st = process(sys.argv[1], os.path.abspath(sys.argv[2]))
        print('vq_net %s: pages=%d changed=%d crosslinks=%d%s' % (sys.argv[1], st['pages'], st['changed'], st['xl'],
              (' 入れられなかった頁=' + ','.join(st['xl_missing'])) if st['xl_missing'] else ''))
