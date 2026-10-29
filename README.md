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
