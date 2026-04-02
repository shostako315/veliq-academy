/**
 * works-catalog.js — 作品カタログ
 * URL: #/works, #/works/:id
 */
const WorksCatalogModule = (() => {

  let currentGenre = 'all';
  let currentEra = 'all';
  let searchQuery = '';

  function renderList() {
    VeliqUI.setTitle('作品カタログ');
    const stopTimer = VeliqUI.startStudyTimer();
    const works = window.VA_DATA?.works || [];

    const html = `
      <div class="works-list anim-fade-in">
        <section class="hero">
          <h1 class="hero-title">作品カタログ</h1>
          <p class="hero-subtitle">${works.length}作品の名曲ガイド</p>
        </section>

        <div class="tab-filter" id="genre-filter">
          <button class="tab-filter-btn active" data-genre="all">すべて</button>
          <button class="tab-filter-btn" data-genre="symphony">交響曲</button>
          <button class="tab-filter-btn" data-genre="concerto">協奏曲</button>
          <button class="tab-filter-btn" data-genre="piano">ピアノ</button>
          <button class="tab-filter-btn" data-genre="chamber">室内楽</button>
          <button class="tab-filter-btn" data-genre="opera">オペラ</button>
          <button class="tab-filter-btn" data-genre="orchestral">管弦楽</button>
          <button class="tab-filter-btn" data-genre="vocal">声楽</button>
        </div>

        <div style="display:flex; gap:var(--space-4); margin-bottom:var(--space-6); flex-wrap:wrap;">
          <input type="text" id="work-search" class="form-input" placeholder="作品名・作曲家名で検索..."
                 style="max-width:400px; flex:1;" value="${VeliqUI.escape(searchQuery)}">
          <select id="era-select" class="form-select" style="max-width:200px;">
            <option value="all">全時代</option>
            <option value="baroque">バロック</option>
            <option value="classical">古典派</option>
            <option value="romantic">ロマン派</option>
            <option value="modern">近代</option>
            <option value="contemporary">現代</option>
          </select>
        </div>

        <div class="card-grid stagger-children" id="works-grid">
          ${renderWorkCards(works)}
        </div>
      </div>
    `;

    VeliqUI.render(html);
    const pageContent = document.getElementById('page-content');
    VeliqUI.initCardLinks(pageContent);

    document.getElementById('genre-filter')?.addEventListener('click', e => {
      const btn = e.target.closest('.tab-filter-btn');
      if (!btn) return;
      currentGenre = btn.dataset.genre;
      document.querySelectorAll('#genre-filter .tab-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateWorksGrid();
    });

    document.getElementById('era-select')?.addEventListener('change', e => {
      currentEra = e.target.value;
      updateWorksGrid();
    });

    const searchInput = document.getElementById('work-search');
    if (searchInput) {
      let timer;
      searchInput.addEventListener('input', e => {
        clearTimeout(timer);
        timer = setTimeout(() => { searchQuery = e.target.value; updateWorksGrid(); }, 200);
      });
    }

    return stopTimer;
  }

  function updateWorksGrid() {
    const works = window.VA_DATA?.works || [];
    const grid = document.getElementById('works-grid');
    if (grid) {
      grid.innerHTML = renderWorkCards(works);
      VeliqUI.initCardLinks(grid);
    }
  }

  function renderWorkCards(works) {
    const composers = window.VA_DATA?.composers || [];
    let filtered = works;

    if (currentGenre !== 'all') filtered = filtered.filter(w => w.genre === currentGenre);
    if (currentEra !== 'all') filtered = filtered.filter(w => w.era === currentEra);
    if (searchQuery && searchQuery.length >= 1) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(w => {
        const composer = composers.find(c => c.id === w.composerId);
        return w.title.toLowerCase().includes(q) ||
               (w.titleEn || '').toLowerCase().includes(q) ||
               (composer?.name || '').toLowerCase().includes(q) ||
               (composer?.nameEn || '').toLowerCase().includes(q);
      });
    }

    if (filtered.length === 0) {
      return '<div class="empty-state"><p class="empty-state-text">該当する作品が見つかりません</p></div>';
    }

    return filtered.map(w => {
      const composer = composers.find(c => c.id === w.composerId);
      const genreLabel = { symphony: '交響曲', concerto: '協奏曲', piano: 'ピアノ', chamber: '室内楽', opera: 'オペラ', orchestral: '管弦楽', vocal: '声楽', sonata: 'ソナタ', choral: '合唱' };
      return `
        <div class="card card--clickable" data-href="#/works/${VeliqUI.escape(w.id)}"
             style="border-left:3px solid ${VeliqUI.eraColor(w.era)};">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--space-2);">
            <span class="card-tag">${VeliqUI.escape(genreLabel[w.genre] || w.genre || '')}</span>
            <span style="font-size:var(--font-size-xs); color:var(--color-text-muted);">${w.year || ''}</span>
          </div>
          <h3 class="card-title" style="font-size:var(--font-size-base);">${VeliqUI.escape(w.title)}</h3>
          <p style="font-size:var(--font-size-xs); color:var(--color-gold-muted); margin-bottom:var(--space-2);">
            ${VeliqUI.escape(composer?.name || '')}
          </p>
          <p class="card-subtitle" style="font-size:var(--font-size-sm);">${VeliqUI.escape(w.shortDescription || '')}</p>
          ${w.duration ? `<span style="font-size:var(--font-size-xs); color:var(--color-text-muted);">約${w.duration}分</span>` : ''}
        </div>
      `;
    }).join('');
  }

  function renderDetail(id) {
    const works = window.VA_DATA?.works || [];
    const work = works.find(w => w.id === id);
    if (!work) {
      VeliqUI.render('<div class="empty-state"><p class="empty-state-text">作品が見つかりません。</p></div>');
      return;
    }

    const composers = window.VA_DATA?.composers || [];
    const composer = composers.find(c => c.id === work.composerId);
    VeliqUI.setTitle(work.title);
    const stopTimer = VeliqUI.startStudyTimer();

    VeliqState.update('history.recentlyViewed', items => {
      const filtered = (items || []).filter(i => !(i.type === 'work' && i.id === id));
      return [{ type: 'work', id, title: work.title, viewedAt: Date.now() }, ...filtered].slice(0, 20);
    });

    const html = `
      <div class="work-detail anim-fade-in">
        <a href="#/works" style="display:inline-flex; align-items:center; gap:var(--space-2); color:var(--color-text-muted); font-size:var(--font-size-sm); margin-bottom:var(--space-6);">
          ← 作品カタログに戻る
        </a>

        <!-- ヒーロー -->
        <section class="section" style="border-bottom:2px solid ${VeliqUI.eraColor(work.era)}; padding-bottom:var(--space-8);">
          <div style="display:flex; gap:var(--space-3); margin-bottom:var(--space-4); flex-wrap:wrap;">
            ${VeliqUI.badge(VeliqUI.eraName(work.era), 'era-' + work.era)}
            ${VeliqUI.badge(work.genre || '', 'default')}
            ${work.key ? VeliqUI.badge(work.key, 'default') : ''}
          </div>
          <h1 style="font-family:var(--font-serif); font-size:var(--font-size-3xl); color:var(--color-text-primary); margin-bottom:var(--space-2);">
            ${VeliqUI.escape(work.title)}
          </h1>
          ${work.titleEn ? `<p style="font-size:var(--font-size-base); color:var(--color-text-muted); margin-bottom:var(--space-3);">${VeliqUI.escape(work.titleEn)}</p>` : ''}
          ${composer ? `
            <p style="margin-bottom:var(--space-4);">
              <a href="#/composers/${VeliqUI.escape(composer.id)}" style="color:var(--color-gold-primary); font-size:var(--font-size-lg);">
                ${VeliqUI.escape(composer.name)}
              </a>
              <span style="color:var(--color-text-muted);"> (${work.year || ''})</span>
            </p>
          ` : ''}
          <p style="font-size:var(--font-size-lg); color:var(--color-text-secondary); line-height:var(--line-height-base);">
            ${VeliqUI.escape(work.shortDescription || '')}
          </p>
          ${work.duration ? `<p style="font-size:var(--font-size-sm); color:var(--color-text-muted); margin-top:var(--space-3);">演奏時間: 約${work.duration}分</p>` : ''}
        </section>

        <!-- 楽章 -->
        ${work.movements && work.movements.length > 0 ? `
          <section class="section">
            <h2 class="section-title">楽章構成</h2>
            <div style="display:flex; flex-direction:column; gap:var(--space-3); margin-top:var(--space-4);">
              ${work.movements.map(m => `
                <div class="card card--compact">
                  <div style="display:flex; justify-content:space-between; align-items:baseline;">
                    <h4 style="color:var(--color-text-primary);">
                      第${m.number}楽章: ${VeliqUI.escape(m.title)}
                    </h4>
                    ${m.duration ? `<span style="font-size:var(--font-size-xs); color:var(--color-text-muted);">約${m.duration}分</span>` : ''}
                  </div>
                  ${m.key ? `<p style="font-size:var(--font-size-xs); color:var(--color-gold-muted);">${VeliqUI.escape(m.key)}</p>` : ''}
                  ${m.description ? `<p style="font-size:var(--font-size-sm); color:var(--color-text-secondary); margin-top:var(--space-2); line-height:var(--line-height-base);">${VeliqUI.escape(m.description)}</p>` : ''}
                  ${m.highlights && m.highlights.length > 0 ? `
                    <div class="tag-list" style="margin-top:var(--space-2);">
                      ${m.highlights.map(h => `<span class="tag">${VeliqUI.escape(h)}</span>`).join('')}
                    </div>
                  ` : ''}
                </div>
              `).join('')}
            </div>
          </section>
        ` : ''}

        <!-- 歴史的背景 -->
        ${work.historicalBackground ? `
          <section class="section">
            <h2 class="section-title">歴史的背景</h2>
            <p style="font-size:var(--font-size-base); color:var(--color-text-secondary); line-height:var(--line-height-base); margin-top:var(--space-4);">
              ${VeliqUI.escape(work.historicalBackground)}
            </p>
          </section>
        ` : ''}

        <!-- 音楽分析 -->
        ${work.musicalAnalysis ? `
          <section class="section">
            <h2 class="section-title">音楽分析</h2>
            <p style="font-size:var(--font-size-base); color:var(--color-text-secondary); line-height:var(--line-height-base); margin-top:var(--space-4);">
              ${VeliqUI.escape(work.musicalAnalysis)}
            </p>
          </section>
        ` : ''}

        <!-- 鑑賞ガイド -->
        ${work.listeningGuide ? `
          <section class="section">
            <h2 class="section-title">鑑賞ガイド</h2>
            <div class="card card--gold" style="margin-top:var(--space-4);">
              ${work.listeningGuide.recommendedVersion ? `
                <p style="font-size:var(--font-size-sm); color:var(--color-gold-primary); margin-bottom:var(--space-3);">
                  推薦録音: ${VeliqUI.escape(work.listeningGuide.recommendedVersion)}
                </p>
              ` : ''}
              ${work.listeningGuide.totalTime ? `<p style="font-size:var(--font-size-sm); color:var(--color-text-muted);">総演奏時間: ${VeliqUI.escape(work.listeningGuide.totalTime)}</p>` : ''}
              ${work.listeningGuide.checkpoints && work.listeningGuide.checkpoints.length > 0 ? `
                <div style="margin-top:var(--space-4);">
                  <h4 style="color:var(--color-text-primary); margin-bottom:var(--space-3);">聴きどころチェックポイント</h4>
                  ${work.listeningGuide.checkpoints.map(cp => `
                    <div style="display:flex; gap:var(--space-3); padding:var(--space-2) 0; border-bottom:1px solid var(--color-border-primary);">
                      <span style="font-size:var(--font-size-sm); color:var(--color-gold-primary); min-width:50px; font-family:var(--font-mono);">${VeliqUI.escape(cp.time)}</span>
                      <span style="font-size:var(--font-size-sm); color:var(--color-text-secondary);">${VeliqUI.escape(cp.description)}</span>
                    </div>
                  `).join('')}
                </div>
              ` : ''}
            </div>
          </section>
        ` : ''}

        <!-- ビジネスインサイト -->
        ${work.businessInsight ? `
          <section class="section">
            <div class="business-insight">
              <div class="business-insight-label">◆ ビジネスインサイト</div>
              <p class="business-insight-text">${VeliqUI.escape(work.businessInsight)}</p>
            </div>
          </section>
        ` : ''}

        <!-- 関連作品 -->
        ${work.relatedWorks && work.relatedWorks.length > 0 ? `
          <section class="section">
            <h2 class="section-title">関連作品</h2>
            <div class="card-grid stagger-children" style="margin-top:var(--space-4);">
              ${work.relatedWorks.map(wid => {
                const rw = works.find(w => w.id === wid);
                if (!rw) return '';
                return `
                  <div class="card card--compact card--clickable" data-href="#/works/${VeliqUI.escape(rw.id)}">
                    <h4 style="color:var(--color-text-primary);">${VeliqUI.escape(rw.title)}</h4>
                    <p style="font-size:var(--font-size-xs); color:var(--color-text-muted);">${rw.year || ''}</p>
                  </div>
                `;
              }).join('')}
            </div>
          </section>
        ` : ''}

        <section class="section" style="text-align:center;">
          <button class="btn-gold btn-lg" id="work-ai-cta">
            ✦ AI Maestroにこの曲について聞く
          </button>
        </section>
      </div>
    `;

    VeliqUI.render(html);
    VeliqUI.initCardLinks(document.getElementById('page-content'));

    document.getElementById('work-ai-cta')?.addEventListener('click', () => {
      if (typeof AIMaestroModule !== 'undefined') {
        AIMaestroModule.openPanel();
        AIMaestroModule.setContext(`ユーザーは作品「${work.title}」（${composer?.name || ''}作曲、${work.year || ''}年）のページを閲覧中です。`);
      }
    });

    return stopTimer;
  }

  return { renderList, renderDetail };
})();

window.WorksCatalogModule = WorksCatalogModule;
