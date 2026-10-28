# Veliq Academy

クラシック音楽史の学習サイト — https://veliq-academy.com/

- 運営: 一般社団法人VariOrchestra（info@variorchestra.com）
- 配信: Cloudflare Workers（静的アセット）。`main` への push で自動デプロイ
- 公開されるのは `veliq-academy/` フォルダの中だけ（`wrangler.jsonc` の `assets.directory`）

## 構成
- `veliq-academy/index.html` — 1ページのアプリ本体（ハッシュルーティング `#/...`）
- `veliq-academy/js/` `css/` — スクリプトとスタイル
- `veliq-academy/data/*.json` — 作曲家・作品・時代・年表・概念・学習パス・クイズ・公演
- `veliq-academy/privacy.html` — プライバシーポリシー
- `veliq-academy/robots.txt` `sitemap.xml` `llms.txt` `_headers`

## ローカル確認
```
cd veliq-academy && python3 -m http.server 8080
```
