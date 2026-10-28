# works.json 調・作品番号の補完ログ（2026-10-29）

対象：`veliq-academy/data/works.json`（全88作品）。変更は `key`・`opus` の2フィールドの追加のみで、既存値・他フィールドは触っていない（追加位置は既存エントリと同じく `era` の直後）。

## 表記ルール（既存データに合わせた）

- `key`：既存エントリの形式に合わせて英字コードで記載（長調は大文字＋`-major`、短調は小文字＋`-minor`、♭は`b`、♯は`#`）。例：`Eb-major`＝変ホ長調、`c#-minor`＝嬰ハ短調、`bb-minor`＝変ロ短調。
- `opus`：既存の `Op. 67` / `K. 550` / `BWV 1048` / `HWV 56` / `Op. 8, Nos. 1-4` の書式に合わせた。
- 注意：サイト（`js/modules/works-catalog.js` 163行）は `work.key` をそのままバッジ表示しており、和名（ホ短調など）への変換はない。`opus` は現状どこにも表示されていない。

## 追加した作品（52件：調34件・作品番号49件）

| 作品 | 追加した調 | 作品番号 | 出典URL |
|---|---|---|---|
| バッハ 平均律クラヴィーア曲集 第1巻 | ― | BWV 846-869 | https://en.wikipedia.org/wiki/The_Well-Tempered_Clavier |
| バッハ 無伴奏ヴァイオリン・パルティータ第2番 | d-minor（ニ短調） | BWV 1004 | https://en.wikipedia.org/wiki/Partita_for_Violin_No._2_(Bach) |
| バッハ ミサ曲ロ短調 | b-minor（ロ短調） | BWV 232 | https://en.wikipedia.org/wiki/Mass_in_B_minor |
| ヘンデル 水上の音楽 | ― | HWV 348-350 | https://en.wikipedia.org/wiki/Water_Music |
| パーセル ディドとエネアス | ― | Z. 626 | https://en.wikipedia.org/wiki/Dido_and_Aeneas |
| ハイドン 天地創造 | ― | Hob. XXI:2 | https://en.wikipedia.org/wiki/The_Creation_(Haydn) |
| ハイドン 交響曲第94番「驚愕」 | G-major（ト長調） | Hob. I:94 | https://en.wikipedia.org/wiki/Symphony_No._94_(Haydn) |
| モーツァルト フィガロの結婚 | ― | K. 492 | https://en.wikipedia.org/wiki/The_Marriage_of_Figaro |
| モーツァルト アイネ・クライネ・ナハトムジーク | G-major（ト長調） | K. 525 | https://en.wikipedia.org/wiki/Eine_kleine_Nachtmusik |
| モーツァルト 魔笛 | ― | K. 620 | https://en.wikipedia.org/wiki/The_Magic_Flute |
| モーツァルト ピアノ協奏曲第21番 | C-major（ハ長調） | K. 467 | https://en.wikipedia.org/wiki/Piano_Concerto_No._21_(Mozart) |
| ベートーヴェン 月光ソナタ | c#-minor（嬰ハ短調） | Op. 27, No. 2 | https://en.wikipedia.org/wiki/Piano_Sonata_No._14_(Beethoven) |
| ベートーヴェン ピアノ協奏曲第5番「皇帝」 | Eb-major（変ホ長調） | Op. 73 | https://en.wikipedia.org/wiki/Piano_Concerto_No._5_(Beethoven) |
| ベートーヴェン ピアノソナタ第8番「悲愴」 | c-minor（ハ短調） | Op. 13 | https://en.wikipedia.org/wiki/Piano_Sonata_No._8_(Beethoven) |
| シューベルト 冬の旅 | ― | D. 911 | https://en.wikipedia.org/wiki/Winterreise |
| シューベルト 未完成交響曲 | b-minor（ロ短調） | D. 759 | https://en.wikipedia.org/wiki/Symphony_No._8_(Schubert) |
| シューベルト ピアノ五重奏曲「ます」 | A-major（イ長調） | D. 667 | https://en.wikipedia.org/wiki/Trout_Quintet |
| ショパン ノクターン第2番 | Eb-major（変ホ長調） | Op. 9, No. 2 | https://en.wikipedia.org/wiki/Nocturnes,_Op._9_(Chopin) |
| ショパン ピアノ協奏曲第1番 | e-minor（ホ短調） | Op. 11 | https://en.wikipedia.org/wiki/Piano_Concerto_No._1_(Chopin) |
| ショパン 練習曲集 Op.10 | ― | Op. 10 | https://en.wikipedia.org/wiki/Études_(Chopin) |
| リスト ピアノソナタ ロ短調 | b-minor（ロ短調） | S. 178 | https://en.wikipedia.org/wiki/Piano_Sonata_in_B_minor_(Liszt) |
| リスト ハンガリー狂詩曲第2番 | c#-minor（嬰ハ短調） | S. 244/2 | https://en.wikipedia.org/wiki/Hungarian_Rhapsody_No._2 |
| ブラームス 交響曲第1番 | c-minor（ハ短調） | Op. 68 | https://en.wikipedia.org/wiki/Symphony_No._1_(Brahms) |
| ブラームス ピアノ協奏曲第1番 | d-minor（ニ短調） | Op. 15 | https://en.wikipedia.org/wiki/Piano_Concerto_No._1_(Brahms) |
| ワーグナー トリスタンとイゾルデ | ― | WWV 90 | https://en.wikipedia.org/wiki/Tristan_und_Isolde |
| ベルリオーズ 幻想交響曲 | ― | Op. 14 | https://en.wikipedia.org/wiki/Symphonie_fantastique |
| メンデルスゾーン ヴァイオリン協奏曲 | e-minor（ホ短調） | Op. 64 | https://en.wikipedia.org/wiki/Violin_Concerto_(Mendelssohn) |
| メンデルスゾーン 真夏の夜の夢 序曲 | E-major（ホ長調） | Op. 21 | https://en.wikipedia.org/wiki/A_Midsummer_Night%27s_Dream_(Mendelssohn) |
| シューマン ピアノ協奏曲 | a-minor（イ短調） | Op. 54 | https://en.wikipedia.org/wiki/Piano_Concerto_(Schumann) |
| シューマン 詩人の恋 | ― | Op. 48 | https://en.wikipedia.org/wiki/Dichterliebe |
| ドヴォルザーク 新世界より | e-minor（ホ短調） | Op. 95 | https://en.wikipedia.org/wiki/Symphony_No._9_(Dvořák) |
| ドヴォルザーク チェロ協奏曲 | b-minor（ロ短調） | Op. 104 | https://en.wikipedia.org/wiki/Cello_Concerto_(Dvořák) |
| チャイコフスキー ピアノ協奏曲第1番 | bb-minor（変ロ短調） | Op. 23 | https://en.wikipedia.org/wiki/Piano_Concerto_No._1_(Tchaikovsky) |
| チャイコフスキー 白鳥の湖 | ― | Op. 20 | https://en.wikipedia.org/wiki/List_of_compositions_by_Pyotr_Ilyich_Tchaikovsky |
| チャイコフスキー 序曲「1812年」 | Eb-major（変ホ長調） | Op. 49 | https://en.wikipedia.org/wiki/1812_Overture |
| グリーグ ピアノ協奏曲 | a-minor（イ短調） | Op. 16 | https://en.wikipedia.org/wiki/Piano_Concerto_(Grieg) |
| グリーグ ペール・ギュント組曲 | ― | Op. 46（第1組曲） | https://en.wikipedia.org/wiki/Peer_Gynt_(Grieg) |
| サン＝サーンス 交響曲第3番「オルガン付き」 | c-minor（ハ短調） | Op. 78 | https://en.wikipedia.org/wiki/Symphony_No._3_(Saint-Saëns) |
| ブルックナー 交響曲第7番 | E-major（ホ長調） | WAB 107 | https://en.wikipedia.org/wiki/Symphony_No._7_(Bruckner) |
| ラヴェル ボレロ | C-major（ハ長調） | ― | https://en.wikipedia.org/wiki/Boléro |
| ドビュッシー 月の光 | Db-major（変ニ長調） | ― | https://en.wikipedia.org/wiki/Clair_de_lune_(Debussy) |
| R.シュトラウス ツァラトゥストラはかく語りき | ― | Op. 30 | https://en.wikipedia.org/wiki/Also_sprach_Zarathustra_(Strauss) |
| R.シュトラウス ばらの騎士 | ― | Op. 59 | https://en.wikipedia.org/wiki/Der_Rosenkavalier |
| シェーンベルク 浄夜 | d-minor（ニ短調） | Op. 4 | https://en.wikipedia.org/wiki/Verklärte_Nacht |
| バルトーク 弦楽器、打楽器とチェレスタのための音楽 | ― | Sz. 106 | https://en.wikipedia.org/wiki/Music_for_Strings,_Percussion_and_Celesta |
| プロコフィエフ ピアノ協奏曲第3番 | C-major（ハ長調） | Op. 26 | https://en.wikipedia.org/wiki/Piano_Concerto_No._3_(Prokofiev) |
| プロコフィエフ ロミオとジュリエット | ― | Op. 64 | https://en.wikipedia.org/wiki/Romeo_and_Juliet_(Prokofiev) |
| ショスタコーヴィチ 交響曲第5番 | d-minor（ニ短調） | Op. 47 | https://en.wikipedia.org/wiki/Symphony_No._5_(Shostakovich) |
| ショスタコーヴィチ 弦楽四重奏曲第8番 | c-minor（ハ短調） | Op. 110 | https://en.wikipedia.org/wiki/String_Quartet_No._8_(Shostakovich) |
| シベリウス フィンランディア | ― | Op. 26 | https://en.wikipedia.org/wiki/Finlandia |
| シベリウス ヴァイオリン協奏曲 | d-minor（ニ短調） | Op. 47 | https://en.wikipedia.org/wiki/Violin_Concerto_(Sibelius) |
| ペルト 鏡の中の鏡 | F-major（ヘ長調） | ― | https://en.wikipedia.org/wiki/Spiegel_im_Spiegel |

## 意図的に空欄のままにしたもの

### 調・作品番号とも空欄（20件）

| 作品 | 理由 |
|---|---|
| テレマン ターフェルムジーク | 3集・複数のTWV番号にまたがり単一番号がない。調も複数 |
| グルック オルフェオとエウリディーチェ | オペラで調なし。Wq.番号は出典で確認できず |
| ヴェルディ 椿姫／アイーダ | オペラで調なし。作品番号の体系なし |
| プッチーニ ラ・ボエーム／蝶々夫人 | 同上 |
| ワーグナー ワルキューレの騎行 | 楽劇『ワルキューレ』（WWV 86B）からの抜粋で、抜粋自体の番号ではないため |
| サン＝サーンス 動物の謝肉祭 | 作品番号なし（死後出版）。組曲で調なし |
| ラヴェル ダフニスとクロエ | バレエで調なし。M.番号は出典で確認できず |
| ドビュッシー 海 | 調で括れない。L.番号は新旧2系統（L./CD）があり書式が定まらない |
| マーラー 交響曲第5番 | 出典に「嬰ハ短調とされることもあるが終楽章はニ長調」、マーラー自身が調表記を省くべきとした旨の記述があるため |
| マーラー 大地の歌 | 歌曲的交響曲で調なし。作品番号なし |
| ストラヴィンスキー 火の鳥 | バレエで調なし。作品番号なし |
| メシアン トゥーランガリーラ交響曲／世の終わりのための四重奏曲 | 調性で括れない。作品番号なし |
| リゲティ アトモスフェール／ペンデレツキ 広島の犠牲者に捧げる哀歌 | 無調・音群作品。作品番号なし |
| ペルト タブラ・ラサ | 作品番号なし。調も単一に定まらない |
| 武満徹 ノヴェンバー・ステップス／鳥は星形の庭に降りる | 調性で括れない。作品番号なし |

### 作品番号のみ追加し、調は空欄（18件）

オペラ・オラトリオ・バレエ・歌曲集・曲集・組曲のため（平均律第1巻、水上の音楽、ディドとエネアス、天地創造、フィガロの結婚、魔笛、冬の旅、練習曲集Op.10、トリスタンとイゾルデ、詩人の恋、白鳥の湖、ペール・ギュント組曲、ばらの騎士、ロミオとジュリエット）。加えて、出典が単一の調を与えていない幻想交響曲、ツァラトゥストラ（ハ長調とロ長調が対立し解決しない）、フィンランディア、弦楽器・打楽器とチェレスタのための音楽。

### 調のみ追加し、作品番号は空欄（3件）

- ボレロ：M.81（マルナ番号）は出典で確認できず。
- 月の光：『ベルガマスク組曲』L. 75 の第3曲で、新旧のレスュール番号（L./CD）が併存するため。
- 鏡の中の鏡：作品番号なし。

### 既存値（`various` や空文字）は変更していない

四季・メサイア・牧神の午後への前奏曲・春の祭典（key `various`）、牧神・春の祭典・マーラー第2番（opus 空文字）は、指示どおり既存データとしてそのまま残した。
