/**
 * score-literacy.js — 楽譜入門
 * URL: #/score
 */
const ScoreLiteracyModule = (() => {

  const SECTIONS = [
    {
      id: 'staff', title: '五線譜の読み方',
      content: '五線譜は5本の平行線で構成され、音の高さと長さを視覚的に表します。線と間（線と線の間）にそれぞれ音名が割り当てられます。ト音記号（高音部）では下から「ミ・ソ・シ・レ・ファ」、間は「ファ・ラ・ド・ミ」です。ヘ音記号（低音部）では下から「ソ・シ・レ・ファ・ラ」となります。'
    },
    {
      id: 'notes', title: '音符の種類',
      content: '全音符（○）= 4拍、二分音符（♩棒付き白丸）= 2拍、四分音符（♩）= 1拍、八分音符（♪）= 0.5拍、十六分音符 = 0.25拍。付点が付くと元の長さの1.5倍になります（例：付点四分音符 = 1.5拍）。休符もそれぞれ対応する長さがあります。'
    },
    {
      id: 'time', title: '拍子記号',
      content: '楽譜の冒頭に書かれる分数のような記号です。上の数字が「1小節の拍数」、下の数字が「1拍の音符」を示します。4/4拍子（四分音符が4つ）は最も一般的で、行進曲やポップスに多用されます。3/4拍子はワルツ、6/8拍子は舞曲によく使われます。'
    },
    {
      id: 'key-sig', title: '調号',
      content: '楽譜の最初（拍子記号の前）に書かれるシャープ（♯）やフラット（♭）の集まりです。♯が1つならト長調（G-dur）、♭が1つならヘ長調（F-dur）。調号は曲全体の雰囲気を決める重要な要素で、長調は明るく、短調は暗い印象を与えます。'
    },
    {
      id: 'dynamics', title: '強弱記号',
      content: 'pp（ピアニッシモ）= とても弱く、p（ピアノ）= 弱く、mp（メッゾピアノ）= やや弱く、mf（メッゾフォルテ）= やや強く、f（フォルテ）= 強く、ff（フォルティッシモ）= とても強く。クレッシェンド（<）は徐々に強く、デクレッシェンド（>）は徐々に弱く。ベートーヴェンはffからppへの急変を多用しました。'
    },
    {
      id: 'tempo', title: 'テンポ記号',
      content: 'Largo（ラルゴ）= 非常にゆっくり（40-60 BPM）、Adagio（アダージョ）= ゆっくり（66-76）、Andante（アンダンテ）= 歩くような速さ（76-108）、Moderato（モデラート）= 中くらい（108-120）、Allegro（アレグロ）= 速く（120-156）、Presto（プレスト）= 非常に速く（168-200）。コンサートプログラムの楽章表記に頻出します。'
    },
    {
      id: 'expression', title: '表現記号',
      content: 'legato（レガート）= 滑らかに、staccato（スタッカート）= 短く切って、cantabile（カンタービレ）= 歌うように、espressivo（エスプレッシーヴォ）= 表情豊かに、dolce（ドルチェ）= 甘く柔らかく、maestoso（マエストーソ）= 荘厳に。これらのイタリア語は音楽の「感情指示」であり、同じ音符でも全く異なる印象を生みます。'
    },
    {
      id: 'structure', title: '楽譜の構造記号',
      content: 'リピート記号（繰り返し）、ダ・カーポ（D.C. = 最初に戻る）、ダル・セーニョ（D.S. = 記号に戻る）、コーダ（Coda = 終結部へ）、フェルマータ（音を伸ばす）。これらは楽曲の構造を理解する鍵です。ソナタ形式の「提示部反復」もリピート記号で指示されます。'
    }
  ];

  function render() {
    VeliqUI.setTitle('楽譜入門');
    const stopTimer = VeliqUI.startStudyTimer();

    const html = `
      <div class="score-literacy anim-fade-in">
        <section class="hero">
          <h1 class="hero-title">楽譜入門</h1>
          <p class="hero-subtitle">コンサートプログラムを読み解くための基礎知識</p>
        </section>

        <p style="color:var(--color-text-secondary); line-height:var(--line-height-base); margin-bottom:var(--space-8);">
          楽譜を完全に読めなくても、基本的な記号の意味を知っているだけで、コンサートの楽しみ方は格段に変わります。
          ここではプログラムノートに頻出する用語と記号を解説します。
        </p>

        <div style="display:flex; flex-direction:column; gap:var(--space-4);">
          ${SECTIONS.map((sec, i) => `
            <div class="card" id="score-section-${sec.id}">
              <button class="score-section-toggle" data-section="${sec.id}"
                      style="width:100%; display:flex; justify-content:space-between; align-items:center; background:none; border:none; color:var(--color-text-primary); cursor:pointer; padding:0;">
                <h3 style="font-family:var(--font-serif); font-size:var(--font-size-xl); color:var(--color-gold-primary);">
                  ${i + 1}. ${VeliqUI.escape(sec.title)}
                </h3>
                <span class="score-toggle-icon" style="font-size:var(--font-size-lg); color:var(--color-text-muted); transition:transform var(--transition-fast);">▼</span>
              </button>
              <div class="score-section-body" data-section="${sec.id}" style="display:none; margin-top:var(--space-4);">
                <p style="font-size:var(--font-size-base); color:var(--color-text-secondary); line-height:var(--line-height-base);">
                  ${VeliqUI.escape(sec.content)}
                </p>
              </div>
            </div>
          `).join('')}
        </div>

        <section class="section" style="margin-top:var(--space-10); text-align:center;">
          <button class="btn-gold btn-lg" id="score-ai-cta">
            ✦ AI Maestroに楽譜について聞く
          </button>
        </section>
      </div>
    `;

    VeliqUI.render(html);

    document.querySelectorAll('.score-section-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const sectionId = btn.dataset.section;
        const body = document.querySelector(`.score-section-body[data-section="${sectionId}"]`);
        const icon = btn.querySelector('.score-toggle-icon');
        if (body) {
          const isOpen = body.style.display !== 'none';
          body.style.display = isOpen ? 'none' : 'block';
          if (icon) icon.style.transform = isOpen ? '' : 'rotate(180deg)';
        }
      });
    });

    document.getElementById('score-ai-cta')?.addEventListener('click', () => {
      if (typeof AIMaestroModule !== 'undefined') {
        AIMaestroModule.openPanel();
        AIMaestroModule.setContext('ユーザーは「楽譜入門」ページを閲覧中です。');
      }
    });

    return stopTimer;
  }

  return { render };
})();

window.ScoreLiteracyModule = ScoreLiteracyModule;
