/**
 * concert-companion.js — コンサート準備
 * URL: #/concert-companion
 */
const ConcertCompanionModule = (() => {

  let searchQuery = '';

  function render() {
    VeliqUI.setTitle('コンサート準備');
    const stopTimer = VeliqUI.startStudyTimer();
    const events = window.VA_DATA?.veliqEvents || [];
    const works = window.VA_DATA?.works || [];

    const now = new Date();
    const upcoming = events
      .filter(ev => new Date(ev.date) >= now)
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    const html = `
      <div class="anim-fade-in">
        <section class="hero">
          <h1 class="hero-title">コンサート準備</h1>
          <p class="hero-subtitle">コンサートをより深く楽しむための事前ブリーフィング</p>
        </section>

        <section class="section">
          <h2 class="section-title">プログラムからブリーフィングを生成</h2>
          <p style="color:var(--color-text-secondary); margin-bottom:var(--space-4);">
            コンサートのプログラムをペーストすると、AI Maestroが聴きどころや背景知識をまとめます。
          </p>
          <div style="margin-bottom:var(--space-4);">
            <textarea id="concert-program-input" class="form-input"
              rows="6" placeholder="例：&#10;ベートーヴェン：交響曲第5番ハ短調 Op.67&#10;ブラームス：交響曲第1番ハ短調 Op.68"
              style="width:100%; resize:vertical;"></textarea>
          </div>
          <button class="btn-gold" id="generate-brief-btn">ブリーフィングを生成</button>
          <div id="brief-result" style="margin-top:var(--space-6);"></div>
        </section>

        <section class="section">
          <h2 class="section-title">作品を検索</h2>
          <div style="margin-bottom:var(--space-4);">
            <input type="text" id="work-search-input" class="form-input"
              placeholder="作品名で検索..." style="max-width:400px;" value="${VeliqUI.escape(searchQuery)}">
          </div>
          <div id="work-search-results" class="card-grid stagger-children">
            ${searchQuery ? renderWorkResults(works, searchQuery) : '<p style="color:var(--color-text-muted);">作品名を入力して検索してください</p>'}
          </div>
        </section>

        ${upcoming.length > 0 ? `
          <section class="section">
            <h2 class="section-title">Veliq Events - 今後の公演</h2>
            <div class="card-grid stagger-children" style="margin-top:var(--space-4);">
              ${upcoming.map(ev => {
                const d = new Date(ev.date);
                const dateStr = d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate();
                return `
                  <div class="card card--gold">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--space-2);">
                      ${VeliqUI.badge(dateStr, 'default')}
                    </div>
                    <h3 class="card-title">${VeliqUI.escape(ev.title)}</h3>
                    <p class="card-subtitle">${VeliqUI.escape(ev.subtitle)}</p>
                    <p style="font-size:var(--font-size-sm); color:var(--color-text-muted); margin-top:var(--space-2);">
                      ${VeliqUI.escape(ev.venue)}
                    </p>
                    <div style="margin-top:var(--space-3);">
                      <h4 style="font-size:var(--font-size-sm); color:var(--color-gold-primary); margin-bottom:var(--space-2);">プログラム</h4>
                      ${ev.program.map(item => `
                        <div class="card card--compact card--clickable" data-href="#/works/${VeliqUI.escape(item.workId || '')}"
                             style="margin-bottom:var(--space-2);">
                          <p style="color:var(--color-text-primary); font-size:var(--font-size-sm);">${VeliqUI.escape(item.title)}</p>
                        </div>
                      `).join('')}
                    </div>
                    ${ev.ticketUrl ? `
                      <div style="margin-top:var(--space-4);">
                        <a href="${VeliqUI.escape(ev.ticketUrl)}" target="_blank" rel="noopener noreferrer"
                           class="btn-gold" style="display:inline-block; text-decoration:none;">
                          チケット情報
                        </a>
                      </div>
                    ` : ''}
                  </div>
                `;
              }).join('')}
            </div>
          </section>
        ` : ''}
      </div>
    `;

    VeliqUI.render(html);
    const pageContent = document.getElementById('page-content');
    VeliqUI.initCardLinks(pageContent);

    document.getElementById('generate-brief-btn')?.addEventListener('click', () => {
      const textarea = document.getElementById('concert-program-input');
      const resultDiv = document.getElementById('brief-result');
      if (!textarea || !resultDiv) return;
      const text = textarea.value.trim();
      if (!text) {
        VeliqUI.toast('プログラムを入力してください', 'warning');
        return;
      }
      resultDiv.innerHTML = VeliqUI.skeleton(6);

      if (typeof AIMaestroModule !== 'undefined' && AIMaestroModule.generateConcertBrief) {
        AIMaestroModule.generateConcertBrief(text).then(() => {
          resultDiv.innerHTML = `
            <div class="card card--gold">
              <p style="color:var(--color-text-secondary);">ブリーフィングがAI Maestroパネルに表示されます。パネルをご確認ください。</p>
            </div>
          `;
        }).catch(() => {
          resultDiv.innerHTML = `
            <div class="card">
              <p style="color:var(--color-text-muted);">ブリーフィングの生成に失敗しました。AI Maestroの設定を確認してください。</p>
            </div>
          `;
        });
      } else {
        resultDiv.innerHTML = `
          <div class="card">
            <p style="color:var(--color-text-muted);">AI Maestroモジュールが利用できません。</p>
          </div>
        `;
      }
    });

    const searchInput = document.getElementById('work-search-input');
    if (searchInput) {
      let timer;
      searchInput.addEventListener('input', e => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          searchQuery = e.target.value;
          const resultsDiv = document.getElementById('work-search-results');
          if (resultsDiv) {
            resultsDiv.innerHTML = searchQuery
              ? renderWorkResults(works, searchQuery)
              : '<p style="color:var(--color-text-muted);">作品名を入力して検索してください</p>';
            VeliqUI.initCardLinks(resultsDiv);
          }
        }, 200);
      });
    }

    return stopTimer;
  }

  function renderWorkResults(works, query) {
    if (!query || query.length < 1) return '';
    const q = query.toLowerCase();
    const filtered = works.filter(w =>
      w.title.toLowerCase().includes(q) ||
      (w.titleEn && w.titleEn.toLowerCase().includes(q))
    ).slice(0, 12);

    if (filtered.length === 0) {
      return '<div class="empty-state"><p class="empty-state-text">該当する作品が見つかりません</p></div>';
    }

    return filtered.map(w => `
      <div class="card card--compact card--clickable" data-href="#/works/${VeliqUI.escape(w.id)}">
        <span class="card-tag">${VeliqUI.escape(w.genre || '')}</span>
        <h4 style="color:var(--color-text-primary); margin-top:var(--space-2);">${VeliqUI.escape(w.title)}</h4>
        <p style="font-size:var(--font-size-xs); color:var(--color-text-muted);">
          ${VeliqUI.escape(w.titleEn || '')} ${w.year ? '(' + VeliqUI.escape(String(w.year)) + ')' : ''}
        </p>
      </div>
    `).join('');
  }

  return { render };
})();
window.ConcertCompanionModule = ConcertCompanionModule;
