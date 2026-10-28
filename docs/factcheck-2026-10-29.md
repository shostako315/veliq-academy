# Veliq Academy 音楽データ ファクトチェック記録（2026-10-29）

対象：`veliq-academy/data/*.json`（公開前チェック。AIコンシェルジュの知識ベースにも流用されるため、出典の取れない記述は削除または検証できる範囲に書き換えた）。コミット・プッシュは未実施。

## 1. 件数サマリー

| ファイル | 確認件数 | 修正件数 | 備考 |
|---|---|---|---|
| composers.json | 49 | 24レコード | 出生地3、師弟・経歴3、出典不明・誤帰属の名言の削除22（うち4件は経歴修正と重複） |
| works.json | 92（重複除去後88） | 20レコード修正＋重複4件削除 | `year` を「作曲完成年」に統一（後述） |
| timeline-events.json | 100 | 3 | |
| concepts.json | 8 | 1 | |
| eras.json | 7時代 | 3 | |
| quiz-questions.json | 115 | 0 | 正解の一意性もスクリプトで確認（全問1つ） |
| learning-paths.json | 4コース・26レッスン | 0 | 参照IDはすべて有効 |
| veliq-events.json | 1 | 0 | 実在公演（Vol.3 2027-03-13）のみ。作り話の公演はなし |

確認の方法
- スクリプトによる整合性確認（`id` の重複、参照IDの有効性、作品年と作曲家の生没年、年表の生没年と作曲家データの一致、クイズの正解数）。
- 生年・没年・出生地は Britannica の人物項目を優先し、取得できない人物は Wikipedia（英語版の項目・作曲家一覧）で照合した。作品の年・初演・委嘱は Wikipedia の作品項目と Britannica で照合した。

`works.json` の `year` の定義
- UIには「作曲年」「初演年」の表示がなく、大半が作曲（完成）年だった。一方でオペラ・バレエ・序曲「1812年」だけ初演年が入っていた。**作曲完成年に統一**し、初演年は `historicalBackground` に書いた。
- 完成年がはっきりしないものは、最も早い記録の年（出版・献呈）のままにした：ブランデンブルク協奏曲 1721（献呈）、ゴルトベルク変奏曲 1741（出版）、「四季」1725（出版）、ディドとエネアス 1689（初演の記録）、「月の光」1905（出版。作曲は1890年頃）、アイーダ 1871（初演。完成年は一次確認できず）。

## 2. 修正一覧

### composers.json

| レコード | 誤り | 修正 | 出典 |
|---|---|---|---|
| boccherini | 出生地「ルッカ（トスカーナ大公国）」。1743年のルッカは独立のルッカ共和国 | 「ルッカ（ルッカ共和国）」 | https://en.wikipedia.org/wiki/Luigi_Boccherini |
| schubert | 出生地「ウィーン（オーストリア帝国）」。オーストリア帝国の成立は1804年で、1797年の時点では時代が合わない | 「ウィーン（神聖ローマ帝国）」（ハイドン・モーツァルトの表記にそろえた） | https://www.britannica.com/biography/Franz-Schubert |
| liszt | 出生地「ライディング（オーストリア帝国）」 | 「ライディング（ハンガリー王国）」。Britannica は「Doborján, Kingdom of Hungary（現 Raiding）」 | https://www.britannica.com/biography/Franz-Liszt |
| messiaen | `students` と longBio に武満徹。武満はほぼ独学（清瀬保二に短期間師事）で、メシアンの門下生ではない | `students` から takemitsu を外し、本文を「ブーレーズ、シュトックハウゼンなど」に | https://en.wikipedia.org/wiki/T%C5%8Dru_Takemitsu |
| yamada-kosaku | 「日本交響楽協会（現NHK交響楽団）を設立」。N響の前身は、1926年に近衛秀麿らが分裂して結成した新交響楽団 | 「1925年に近衛秀麿とともに日本交響楽協会を設立…（翌年分裂し、近衛らが結成した新交響楽団が現在のNHK交響楽団の前身）」 | https://kotobank.jp/word/近衛秀麿 / https://en.wikipedia.org/wiki/NHK_Symphony_Orchestra |
| hosokawa | 「『蓮の花のための風景』シリーズ」という作品群は存在しない（実在するのは「ランドスケープ」I〜V と「月夜の蓮」） | 「『ランドスケープ』シリーズ」 | https://en.wikipedia.org/wiki/Toshio_Hosokawa |
| wagner | 名言「想像力が世界を支配する」はナポレオンの言葉として知られ、ワーグナーの言葉ではない | `quotes` を空に | https://quoteinvestigator.com/2021/01/03/imagine/ |
| schumann-r | 名言「言葉にできない、しかし沈黙することもできないもの」はヴィクトル・ユゴーの言葉 | `quotes` を空に | https://psaudio.com/blogs/pauls-posts/impossible-silence |
| stravinsky | 「良い作曲家は借りる。偉大な作曲家は盗む」は本人の発言として確認できない（Quote Investigator） | `quotes` を空に | https://quoteinvestigator.com/2013/03/06/artists-steal/ |
| debussy | 「音楽とは音と音の間の沈黙である」は一次出典がない | `quotes` を空に | https://barrypopik.com/blog/music_is_the_space_between_the_notes |
| handel, vivaldi, telemann, haydn, liszt, dvorak, puccini, grieg, bruckner, bartok, prokofiev, shostakovich, messiaen, ligeti, penderecki, takemitsu, yamada-kosaku, hosokawa | 名言の出典（書簡・著作・記録された発言）を確認できなかった。創作の可能性がある | `quotes` を空に（削除した文言は §4 に記載） | — |

名言を残した人物（出典あり、または広く記録された帰属）：バッハ、モーツァルト（1781年の書簡）、ベートーヴェン（1801年ヴェーゲラー宛書簡）、グルック（「アルチェステ」序文）、シューベルト（日記）、ショパン、ブラームス、メンデルスゾーン（1842年スーショイ宛書簡）、ベルリオーズ、チャイコフスキー、ヴェルディ、ラヴェル、マーラー、R.シュトラウス、シェーンベルク、シベリウス、ペルト。

生没年・出生地を照合して誤りがなかった人物（49人中、上記を除く全員）：Britannica で照合したのはバッハ、ヘンデル、ヴィヴァルディ、ラモー（受洗日）、ショパン、ワーグナー、シューマン、メンデルスゾーン、ベルリオーズ、チャイコフスキー、ドヴォルザーク、ヴェルディ、プッチーニ、グリーグ、サン＝サーンス、ブルックナー、ドビュッシー、マーラー、R.シュトラウス、シベリウス、ショスタコーヴィチ、メシアン、ペンデレツキ、ラヴェル、ストラヴィンスキー、バルトーク、プロコフィエフ、シェーンベルク。Wikipedia で照合したのはテレマン、ブラームス、リゲティ、武満、團、細川、ペルト（存命。2025年に90歳）、山田耕筰、パーセル、クープラン、ブクステフーデ（c.1637）、ハイドン、クレメンティ、グルック、C.P.E.バッハ、サリエリ、ボッケリーニ。

### works.json

| レコード | 誤り | 修正 | 出典 |
|---|---|---|---|
| bach-wtc1, bach-bwv1004, bach-mass-b, handel-water | 同じ `id` のレコードが2件ずつあった（2件目は中身の薄い版） | 2件目を削除（92→88件） | （データ整合性） |
| bach-goldberg | 「カノン（1度〜10度）」。カノンは1度〜9度で、第30変奏はクオドリベット | 「1度から9度までのカノン…第30変奏はクオドリベット」 | https://en.wikipedia.org/wiki/Goldberg_Variations |
| mozart-symphony-40 | 「生涯最後の夏の奇跡」。1788年はモーツァルト最後の夏ではない（1791年没） | その一文を削除 | https://en.wikipedia.org/wiki/Symphony_No._40_(Mozart) |
| beethoven-symphony-9 | 「交響曲に初めて声楽を導入」は言い過ぎ | 「大作曲家として初めて交響曲に声楽（独唱と合唱）を導入」 | https://en.wikipedia.org/wiki/Symphony_No._9_(Beethoven) |
| debussy-prelude-afternoon | ブーレーズの発言を「近代音楽はこの作品のフルートから始まった」と言い換えていた | 「牧神のフルートが音楽芸術に新しい息吹をもたらした」 | https://en.wikipedia.org/wiki/Pr%C3%A9lude_%C3%A0_l%27apr%C3%A8s-midi_d%27un_faune |
| brahms-pc1 | 「1858年初演は失敗」。初演は1859年1月22日ハノーファー（冷淡な反応）、不評だったのは5日後のライプツィヒ | 1858年完成、1859年のハノーファー初演とライプツィヒ公演に書き換え | https://en.wikipedia.org/wiki/Piano_Concerto_No._1_(Brahms) |
| wagner-tristan | year 1865（初演年） | 1859（1859年8月完成）。初演年1865は本文に残した | https://en.wikipedia.org/wiki/Tristan_und_Isolde |
| wagner-ring-walkure | year 1870（初演年） | 1856（1856年3月に総譜完成）。本文に1870年ミュンヘン初演 | https://en.wikipedia.org/wiki/Die_Walk%C3%BCre |
| puccini-boheme | year 1896（初演年） | 1895（1893〜95年作曲）。本文に1896年トリノ初演（指揮トスカニーニ） | https://en.wikipedia.org/wiki/La_boh%C3%A8me |
| puccini-butterfly | 「1904年ミラノ初演（改訂版1904年）」では2つの上演が区別できない | 1904年2月スカラ座の初演は失敗、同年5月ブレシアで改訂版が成功（year 1904はそのまま） | https://en.wikipedia.org/wiki/Madama_Butterfly |
| strauss-rosenkavalier | year 1911（初演年） | 1910（1910年9月26日完成）。本文に1911年ドレスデン初演 | https://en.wikipedia.org/wiki/Der_Rosenkavalier |
| tchaikovsky-swan | year 1877（初演年） | 1876（1876年4月完成）。本文に初演の不評と1895年版での復活 | https://en.wikipedia.org/wiki/Swan_Lake |
| tchaikovsky-1812 | year 1882（初演年） | 1880（1880年作曲）。本文に1882年モスクワ初演 | https://en.wikipedia.org/wiki/1812_Overture |
| tchaikovsky-pc1 | 「師に酷評」。酷評したニコライ・ルビンシテインはチャイコフスキーの師ではない | 「ニコライ・ルビンシテインに酷評されたが、1875年ボストンでのビューローの独奏による初演で成功」 | https://en.wikipedia.org/wiki/Piano_Concerto_No._1_(Tchaikovsky) |
| verdi-aida | 「スエズ運河開通記念」は俗説。ヴェルディは運河の祝典曲の依頼を断っている | 副王の依頼でカイロの歌劇場のために作曲、1871年初演、運河記念作品ではない旨 | https://en.wikipedia.org/wiki/Aida / https://it.wikipedia.org/wiki/Aida |
| bruckner-sym7 | 「第2楽章はワーグナーの死を悼んで書かれた」。アダージョは1883年1月、ワーグナーの死（2月）より前に書き始められた | 「1883年1〜4月に作曲、死を予感して書き始められた」 | https://en.wikipedia.org/wiki/Symphony_No._7_(Bruckner) |
| sibelius-vc | year 1903・「1903年作曲」 | 1904（1903〜04年に作曲し1904年2月に初演、1905年改訂） | https://en.wikipedia.org/wiki/Violin_Concerto_(Sibelius) |
| prokofiev-pc3 | 「10年間のスケッチ」。スケッチの開始は1913年なので約8年 | 「1913年に始めたスケッチを基に1921年完成」 | https://en.wikipedia.org/wiki/Piano_Concerto_No._3_(Prokofiev) |
| messiaen-turangalila | 「1948年委嘱」。委嘱はクーセヴィツキーで、1946〜48年に作曲 | 委嘱者・作曲期間・1949年ボストン初演（バーンスタイン）に書き換え | https://en.wikipedia.org/wiki/Turangal%C3%AEla-Symphonie |
| bach-bwv1004 | 題名「無伴奏Vnパルティータ第2番」が略記で、標準的な邦題ではない | 「無伴奏ヴァイオリン・パルティータ第2番 ニ短調 BWV1004」（英題も整えた） | — |
| liszt-hungarian2 | 「ハンガリーの民族音楽に基づく」。素材は農民の民謡ではなく、ロマの楽団が演奏したヴェルブンコシュ | 「ハンガリーのロマ（ジプシー）楽団の音楽（ヴェルブンコシュ）に基づく」 | https://www.britannica.com/biography/Franz-Liszt |

指定された要注意項目の確認結果：「ボレロ」1928、「運命」Op.67 ハ短調 1808、「英雄」Op.55 変ホ長調 1804、K.525 1787、メンデルスゾーンのヴァイオリン協奏曲 1844、チャイコフスキーのピアノ協奏曲第1番 1875（1874〜75年作曲）はすべて正しかった。BWV1068 は収録されていない。「新世界より」は調・作品番号の欄がないため誤りは生じていない（§3参照）。

### timeline-events.json

| レコード | 誤り | 修正 | 出典 |
|---|---|---|---|
| te-021 | relatedIds の作曲家IDが `couperin` で、存在しないID（正しくは `couperin-f`）。リンクが切れていた | `couperin-f` | （データ整合性） |
| te-050 | 「英雄」完成を1803年としていた。作曲は1803〜04年で、完成は1804年（works.json とも不一致） | year 1804 | https://en.wikipedia.org/wiki/Symphony_No._3_(Beethoven) |
| te-071 | 「カリシュト」で composers.json の「カリシュテ」と表記が違った | 「カリシュテ」に統一 | https://www.britannica.com/biography/Gustav-Mahler |

### concepts.json

| レコード | 誤り | 修正 | 出典 |
|---|---|---|---|
| concept-counterpoint | 「ルネサンスのパレストリーナが（対位法を）確立」。多声音楽は中世から続いており、パレストリーナの書法は後に厳格対位法の手本とされた | 「中世の多声音楽に始まり、パレストリーナの書法は後に厳格対位法の手本とされ…」 | https://en.wikipedia.org/wiki/Counterpoint （Fux の規則はパレストリーナ様式の研究に由来）/ https://www.britannica.com/art/organum （多声音楽は9世紀に始まる） |

ソナタ形式・交響曲・フーガ・調性・オーケストラ・オペラ・協奏曲の定義に、明らかな誤りはなかった。

### eras.json

| 箇所 | 誤り | 修正 | 出典 |
|---|---|---|---|
| baroque.keyComposers | 存在しないID `couperin` | `couperin-f` | （データ整合性） |
| ancient.musicalCharacteristics「オルガヌム」 | 「パリのノートルダム大聖堂を中心に発展」とだけ書かれていた。オルガヌムは9世紀に始まる | 「9世紀頃に始まり、12〜13世紀にノートルダム楽派で大きく発展」 | https://www.britannica.com/art/organum |
| contemporary.musicalCharacteristics「電子音楽」 | 「シュトックハウゼンのスタジオから始まり」。WDRスタジオ（1953年開設）の創設者はアイメルト、マイヤー＝エップラー、バイヤーで、パリのミュジック・コンクレート（1948年〜）のほうが早い | 「1950年代のケルンWDR電子音楽スタジオでのシュトックハウゼンらの実験や、パリのミュジック・コンクレートなどを経て」 | https://en.wikipedia.org/wiki/Electronic_music |

## 3. オーナーの判断が必要な事項（未修正）

1. **削除した名言22件**：一次出典（書簡・著作・録音された発言）が見つかれば、出典を付けて戻せる（§4）。
2. **nameEn の発音記号**：Dvorak / Bartok / Saint-Saens / Part / Gyorgy Ligeti / Frederic Chopin / Francois Couperin は、正式な綴り（Dvořák, Bartók, Saint-Saëns, Pärt, György, Frédéric, François）から記号を落としている。検索（`includes`）に影響するため変えていない。表示用の別フィールドを作るかどうか判断が必要。
3. **composers.json の参照切れ167件**：`keyWorks`（`work-…` 形式のIDで、works.json の実際のIDと一致しない）、`influencedBy`/`influenced`/`teachers`/`students` に未収録の人物（corelli, lully, berg, webern, boulez など）。UIでは表示されないだけで済むが、AIの知識ベースにそのまま取り込まれる。`dvorak.influenced` の "sukuk" は Suk の誤記とみられる。
4. **作品データの欠け**：76件の作品に調・作品番号の欄がない（例：「新世界より」はホ短調 Op.95 が未記載）。追加するかどうか。
5. **作品年の定義**：作曲完成年に統一した。初演年で揃える方針にするなら、オペラなど8件を戻す必要がある。
6. **veliq-events.json に開演時刻の欄がない**（13:30 がデータに入っていない）。表示が必要ならフィールドの追加が要る。
7. 表記上の注意：ショスタコーヴィチ第5番の「革命」は日本だけの通称。バッハの `teachers: buxtehude` は1705年のリューベック訪問による私淑で、正式な師弟関係ではない。ヴェルディの出生地（1813年のロンコレは当時フランス帝国領）は Britannica の「パルマ公国」表記に従ってそのままにした。武満の「レクイエム」をストラヴィンスキーが評価した年は、日本語資料の1959年と英語版Wikipediaの1958年で食い違うが、1959年のままにした。

## 4. 削除した名言（復元用）

| id | 削除した文言 |
|---|---|
| handel | 私が音楽を作曲する時、全能の神の前にいると感じる。 |
| vivaldi | 音楽とは、言葉で表現できないものを伝える手段である。 |
| telemann | 音楽は万人のものでなければならない。 |
| haydn | 芸術には法則がないが、芸術そのものが法則である。 |
| liszt | 天才とは、努力する才能のことである。 |
| wagner | 想像力が世界を支配する。（ナポレオンの言葉として知られる） |
| schumann-r | 音楽とは、言葉にできない、しかし沈黙することもできないものの表現である。（ユゴーの言葉） |
| dvorak | 音楽は全人類のためのものだ。 |
| puccini | 神は私にメロディを与えた。それだけが私の全てだ。 |
| grieg | 芸術家は時代の先を歩かなければならない。 |
| bruckner | 彼らは私を理解してくれない。いつか理解される時が来る。 |
| debussy | 音楽とは音と音の間の沈黙である。 |
| stravinsky | 良い作曲家は借りる。偉大な作曲家は盗む。 |
| bartok | 民俗音楽の研究から学んだことは、最高の簡潔さと単純さこそが最も困難であるということだ。 |
| prokofiev | 音楽において最も大切なのは、人間の心に語りかけることだ。 |
| shostakovich | 音楽が多くのことを変えられると信じるのは愚かだが、何も変えられないと信じるのはもっと愚かだ。 |
| messiaen | 音楽は真実を表現する。それは最初で最後の、時間の外にあるものだ。 |
| ligeti | 私は常に、聴いたことのない音楽を夢見ている。 |
| penderecki | 前衛は手段であって目的ではない。 |
| takemitsu | 一つの音を聴くことから全ては始まる。 |
| yamada-kosaku | 日本語の美しさを音楽で世界に伝えたい。 |
| hosokawa | 音楽は呼吸であり、自然そのものの営みである。 |
