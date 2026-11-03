# Veliq Academy

音楽の作品・作曲家・時代を解説する学習サイト — https://veliq-academy.com/

- 運営: 一般社団法人VariOrchestra（info@variorchestra.com）／監修: 佐藤瑛吾
- 配信: Cloudflare Workers（静的アセット）。`main` への push で自動デプロイ
- 公開されるのは `veliq-academy/` フォルダの中だけ（`wrangler.jsonc` の `assets.directory`）
- 仕様: `docs/academy-v2-spec.md`

## 構成
- `tools/build.py` — データと記事から全ページを書き出すビルド（1記事1ページの静的 HTML）
- `content/music/<section>/<slug>.md` — 記事（書き手が置く）
- `veliq-academy/data/*.json` — 作曲家・作品・時代・年表・概念・公演（ビルドの入力。公開もされる）
- `veliq-academy/assets/vq-ui.css` — 見た目（前半は Veliq Finance の ui.css の写し）
- `veliq-academy/assets/vq.js` — スマホのメニュー
- 生成物（手で直さない）: `veliq-academy/index.html`、`music/`、`concerts/`、`sitemap.xml`、`llms.txt`、`robots.txt`、`assets/legacy.js`（旧 `#/...` の URL を新しい URL へ移す対応表）
- `privacy.html`・`404.html` — 本文（`<main>` の中）だけ手で直す。ヘッダー・フッターはビルドが付け直す

## 記事の足し方
1. `content/music/<section>/<slug>.md` を置く
   - section: `works`（作品）／`history`（音楽史）／`orchestra`（オーケストラ史）／`conductors`（指揮者）／`instruments`（楽器）／`opera`／`early`（古楽）／`theory`（楽典と理論）
   - 作品の slug は `data/works.json` の id があればそれに合わせる（同じ id なら記事本文が主になり、データの楽章表は補助になる）。無ければ新しい id でよい（作品ページと作曲家ページの作品一覧に載る）
   - 先頭の前付け（title・slug・section・summary・composer・year・key・catalog・scoring・duration・concert・updated・sources）の形は仕様書のとおり
2. ビルドする
   ```
   pip install --break-system-packages pyyaml markdown   # 初回だけ
   python3 tools/build.py
   ```
   前付けの誤り（無い作曲家 id・無い公演 id・出典なし など）は「警告:」として表示される
3. 記事は `/music/<section>/<slug>/`（作品は `/music/works/<slug>/`）に出る。記事を消して再実行すれば、そのページも消える

確認用に別の場所の記事で組むとき: `python3 tools/build.py --content /path/to/dir`（`dir/music/<section>/<slug>.md`）

## ローカル確認
```
cd veliq-academy && python3 -m http.server 8080
```

## 2026-11-03 の変更（美術学科・記事の型・用語リンク）
- 美術学科：`content/art/<section>/<slug>.md`（section は `western`／`japan`／`artists`（画家ひとりにつき1本）／`sculpture-architecture`／`museums`）→ `/art/<section>/<slug>/`。前付けに `quiz: a-...`（アプリの章 key）を書くと「関連章」の導線が出る。章→記事の対応は `docs/art-read-map.json`
- 記事の前付けに `aliases:`（用語リンクの別名）、`image:`／`image_credit:`／`image_alt:`（題名の上の全幅の図。Wikimedia Commons のパブリックドメイン画像のみ）を書ける
- 本文の `==語==` は金のマーカー、`> 要点` で始まる引用は左罫線の箱。見出しの番号（1／1-1）と目次はビルドが付けるので手で書かない。最初の `## 要点` は箱として目次の前に出る。`## よくある質問` の `###` は Q の見出しになる
- 本文中の外部リンク（`[（出典名）](URL)` など）はビルドで外し、末尾の「参考文献」に前付けの `sources` と重複排除してまとめる。本文末尾に `## 参考文献` を書いた記事も自動の節に統合される。britannica.com の `print/`・`EBchecked/` は無条件に落とす。`python3 tools/linkcheck.py` で URL を確認すると、200 以外の URL の項目も落ちる（結果は `tools/linkcheck.json`）
- 用語の自動相互リンク：作曲家・作品・時代・概念・記事の題名と `aliases`、楽典・楽器・用語集の見出しを辞書にして、本文の最初の出現1回だけを `a.tl` でリンクする。用語集は `content/music/glossary/music-glossary.md` → `/music/glossary/`
  - 語境界（2026-11-03）：カタカナ語は前後がカタカナ・ー・・・英字ならリンクしない（ロンドンの「ロンド」等）、漢字語は前後が漢字なら不可、頭文字（C. P. E. など）の後の姓も不可。別人・固有名は `TERM_EXCLUDE`（リンクしないが短い語も防ぐ）、一般語は `TERM_STOP` に足す
- 参考文献：URL の ( ) は %28 %29 にして出す。`/blog`・`blog.`・`wp-json` を含む URL は出典にしない
- 作曲家・作品のデータだけの頁は、基本情報の表・年表・代表作の表・関連章・聴く（Apple Music／Spotify／YouTube）・参考文献の順で組む。`data/composers.json` の `portrait`／`portraitCredit` があれば題名の上に出す
- 390px の確認は `docs/screens/`（Playwright で撮影）
