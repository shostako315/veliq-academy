# Veliq Academy v2 仕様（2026-10-29 オーナー決定）

## 位置づけ
- 縦に学科が並ぶ教養の学校。学科：音楽 → 美術（西洋・日本・ほか）→ 世界史 → 地理（都市単位）。第1段階は音楽だけを公開し、中身の無い学科は出さない（「準備中」の空ページも作らない）
- 音楽の分野：音楽史／オーケストラ史／指揮者の歴史と役割／楽器／オペラ／古楽／楽典と理論／作品（1曲1ページ）／作曲家
- 水準：研究者・指揮者の蘊蓄レベル。全記事の末尾に出典（文献・一次資料・作品目録番号）
- 名義：「監修：佐藤瑛吾」（指揮者。VariOrchestra 音楽監督）
- 導線：演奏会（VariOrchestra、teket）／アプリの4択（veliqclub.com）／Veliq Club 入会

## URL（1記事1ページ。ハッシュでの画面切替は使わない）
- `/` 学校のトップ（学科の一覧。今は音楽のみ）
- `/music/` 音楽学科のトップ（分野の一覧＋新着）
- `/music/works/<id>/` 作品（作品データ＋記事があれば記事本文）
- `/music/composers/<id>/` 作曲家
- `/music/eras/<id>/` 時代、`/music/concepts/<id>/` 形式と概念
- `/music/history/<slug>/`（音楽史）、`/music/orchestra/<slug>/`（オーケストラ史）、`/music/conductors/<slug>/`（指揮者）、`/music/instruments/<slug>/`（楽器）、`/music/opera/<slug>/`、`/music/early/<slug>/`（古楽）、`/music/theory/<slug>/`（楽典と理論）
- `/music/timeline/` 年表、`/concerts/` 演奏会の予習（公演ごとに `/concerts/<id>/`）
- `/privacy.html` はそのまま

## 記事ファイル（書き手が置く。ビルドが読む）
- 置き場所：`content/music/<section>/<slug>.md`（section は上の works／history／orchestra／conductors／instruments／opera／early／theory）
- 作品記事の slug は `data/works.json` の id があればそれに合わせる。無ければ新しい id（例：`beethoven-symphony-1`、`brahms-violin-concerto`）。ビルドは works.json に無い作品記事も作品ページとして出す
- 先頭に YAML の前付け：
```
---
title: ベートーヴェン 交響曲第3番 変ホ長調 作品55《英雄》
slug: beethoven-symphony-3
section: works
summary: 検索結果に出る1〜2文の説明（事実だけ。宣伝文句にしない）
composer: beethoven        # data/composers.json の id
year: 1803-1804            # 作曲年
key: 変ホ長調
catalog: Op.55
scoring: 2fl, 2ob, 2cl, 2fg, 3hr, 2tp, timp, 弦五部
duration: 約50分
concert: vo-vol3-2027-03   # VariOrchestra で演奏する公演の id（data/veliq-events.json）。無ければ省略
updated: 2026-10-29
sources:
  - 著者『書名』出版社, 年, 該当頁
  - 原典版楽譜：Beethoven Werke（Henle）…
---
```
- 本文は Markdown。見出しは `##`（必要なら `###`）。表は Markdown の表でよい
- 作品記事の見出しの型（順序はこれに揃える）：
  1. `## 成立` 作曲の経緯・初演（日付・場所・指揮者）・献呈・出版
  2. `## 編成と演奏時間`
  3. `## 楽章ごとの聴きどころ` 楽章ごとに `###`。形式・調・主題の扱い・管弦楽法の要点。小節番号を書けるところは書く
  4. `## 演奏史と解釈` 版の問題、テンポ（メトロノーム表記など）、代表的な録音と解釈の違い（指揮者名・オーケストラ・録音年）
  5. `## もっと深く` 研究上の論点（成立史の異説、自筆譜・スケッチ、受容史など）
- 通史記事（指揮者の歴史など）は、時代順の `##` 見出しで書く

## 文章の決まり
- 事実だけを書く。雰囲気づけの一文、比喩、宣伝文句、「ビジネスに活かす」式の教訓は書かない
- 常体（である調）。形容詞を盛らない
- 年・日付・作品番号・小節番号・人名は出典で確かめたものだけ。確かめられないことは書かない（推測で埋めない）
- 人名の表記は日本で一般的なカナ表記＋初出に原綴（例：フルトヴェングラー（Wilhelm Furtwängler））
- 「指揮者の一言」は書かない（監修者が後で自分の言葉で足す）
- 出典へのリンク（2026-10-29 オーナー決定）：資料から取った小ネタ・逸話・発言・評（例：ラトルがファゴットに吹かせた件、批評家の言葉、楽団の解説）は、その文の直後に本文中のリンクを付ける。Markdown で `[（出典名）](URL)` の形。海外の一次メディア（楽団・歌劇場の公式、Gramophone・The Guardian・NYT などの新聞雑誌、Beethoven-Haus・Brahms-Institut などの研究機関、レーベル公式、作曲家の書簡の公開データベース）を優先し、なければ信頼できる二次資料。Wikipedia へのリンクは原則付けない（その先の典拠に当たって付ける）。sources の項目にも URL を書けば、出典欄で押せるリンクになる

## 画面（Finance と同じ見た目）
- `assets/vq-ui.css`（Finance の ui.css が元）を使う。白地・ゴシック1種・黒ピルのボタン・金 #8A6A2A はロゴの「Academy」と強調だけ
- 統計タイル・巨大な数字・横スクロールのカード群・五線や装飾・出現アニメーションは使わない
- 既存データの `businessInsight`／`businessQuote`／`emotionalJourney` は出さない（水準に合わない創作文のため）
- 記事ページ：パンくず → 題名 → 一覧情報（作曲年・調・作品番号・編成・演奏時間）→ 本文 → 出典 → 「監修：佐藤瑛吾」→ 関連（作曲家・同じ時代の作品）→ 演奏会の案内（concert があれば）→ アプリで4択（あれば）
- 構造化データ：Article（author ではなく reviewedBy に佐藤瑛吾、publisher は一般社団法人VariOrchestra）、BreadcrumbList。作品は MusicComposition も
- sitemap.xml・llms.txt・robots.txt を生成。canonical は https://veliq-academy.com/...
