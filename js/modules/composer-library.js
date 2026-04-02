/**
 * composer-library.js — 作曲家ライブラリ
 * URL: #/composers, #/composers/:id
 */
const ComposerLibraryModule = (() => {

  let currentFilter = 'all';
  let searchQuery = '';

  function renderList() {
    VeliqUI.setTitle('作曲家図鑑');
    const stopTimer = VeliqUI.startStudyTimer();
    const composers = window.VA_DATA?.composers || [];

    const html = `
      <div class="composers-list anim-fade-in">
        <section class="hero">
          <h1 class="hero-title">作曲家図鑑</h1>
          <p class="hero-subtitle">${composers.length}名の偉大な作曲家たちの世界</p>
        </section>

        <div class="tab-filter" id="era-filter">
          <button class="tab-filter-btn active" data-era="all">すべて</button>
          <button class="tab-filter-btn" data-era="baroque">バロック</button>
          <button class="tab-filter-btn" data-era="classical">古典派</button>
          <button class="tab-filter-btn" data-era="romantic">ロマン派</button>
          <button class="tab-filter-btn" data-era="modern">近代</button>
          <button class="tab-filter-btn" data-era="contemporary">現代</button>
        </div>

        <div style="margin-bottom:var(--space-6);">
          <input type="text" id="composer-search" class="form-input" placeholder="作曲家名で検索..."
                 style="max-width:400px;" value="${VeliqUI.escape(searchQuery)}">
        </div>

        <div class="card-grid stagger-children" id="composer-grid">
          ${renderComposerCards(composers, currentFilter, searchQuery)}
        </div>
      </div>
    `;

    VeliqUI.render(html);
    const pageContent = document.getElementById('page-content');
    VeliqUI.initCardLinks(pageContent);

    document.getElementById('era-filter')?.addEventListener('click', e => {
      const btn = e.target.closest('.tab-filter-btn');
      if (!btn) return;
      currentFilter = btn.dataset.era;
      document.querySelectorAll('.tab-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateGrid();
    });

    const searchInput = document.getElementById('composer-search');
    if (searchInput) {
      let timer;
      searchInput.addEventListener('input', e => {
        clearTimeout(timer);
        timer = setTimeout(() => { searchQuery = e.target.value; updateGrid(); }, 200);
      });
    }

    return stopTimer;
  }

  function updateGrid() {
    const composers = window.VA_DATA?.composers || [];
    const grid = document.getElementById('composer-grid');
    if (grid) {
      grid.innerHTML = renderComposerCards(composers, currentFilter, searchQuery);
      VeliqUI.initCardLinks(grid);
    }
  }

  function renderComposerCards(composers, filter, query) {
    let filtered = composers;
    if (filter !== 'all') filtered = filtered.filter(c => c.era === filter);
    if (query && query.length >= 1) {
      const q = query.toLowerCase();
      filtered = filtered.filter(c =>
        c.name.toLowerCase().includes(q) || c.nameEn.toLowerCase().includes(q)
      );
    }
    if (filtered.length === 0) {
      return '<div class="empty-state"><p class="empty-state-text">該当する作曲家が見つかりません</p></div>';
    }
    return filtered.map(c => `
      <div class="card card--clickable" data-href="#/composers/${VeliqUI.escape(c.id)}"
           style="border-left:3px solid ${VeliqUI.eraColor(c.era)};">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--space-2);">
          ${VeliqUI.badge(VeliqUI.eraName(c.era), 'era-' + c.era)}
          <span style="font-size:var(--font-size-xs); color:var(--color-text-muted);">${c.born}–${c.died || ''}</span>
        </div>
        <h3 class="card-title">${VeliqUI.escape(c.name)}</h3>
        <p style="font-size:var(--font-size-xs); color:var(--color-text-muted); margin-bottom:var(--space-2);">
          ${VeliqUI.escape(c.nameEn)}
        </p>
        <p class="card-subtitle">${VeliqUI.escape(c.shortBio)}</p>
        ${c.style && c.style.length > 0 ? `
          <div class="tag-list" style="margin-top:var(--space-3);">
            ${c.style.slice(0, 3).map(s => `<span class="tag">${VeliqUI.escape(s)}</span>`).join('')}
          </div>
        ` : ''}
      </div>
    `).join('');
  }

  function renderDetail(id) {
    const composers = window.VA_DATA?.composers || [];
    const composer = composers.find(c => c.id === id);
    if (!composer) {
      VeliqUI.render('<div class="empty-state"><p class="empty-state-text">作曲家が見つかりません。</p></div>');
      return;
    }

    VeliqUI.setTitle(composer.name);
    const stopTimer = VeliqUI.startStudyTimer();
    const works = (window.VA_DATA?.works || []).filter(w => w.composerId === id);
    const relatedComposers = composers.filter(c => c.id !== composer.id && c.era === composer.era).slice(0, 4);

    VeliqState.update('history.recentlyViewed', items => {
      const filtered = (items || []).filter(i => !(i.type === 'composer' && i.id === id));
      return [{ type: 'composer', id, title: composer.name, viewedAt: Date.now() }, ...filtered].slice(0, 20);
    });

    const html = `
      <div class="composer-detail anim-fade-in">
        <a href="#/composers" style="display:inline-flex; align-items:center; gap:var(--space-2); color:var(--color-text-muted); font-size:var(--font-size-sm); margin-bottom:var(--space-6);">
          ← 作曲家図鑑に戻る
        </a>

        <section class="section" style="border-bottom:2px solid ${VeliqUI.eraColor(composer.era)}; padding-bottom:var(--space-8);">
          <div style="display:flex; align-items:center; gap:var(--space-3); margin-bottom:var(--space-4);">
            ${VeliqUI.badge(VeliqUI.eraName(composer.era), 'era-' + composer.era)}
            ${composer.nationality ? VeliqUI.badge(composer.nationality, 'default') : ''}
          </div>
          <h1 style="font-family:var(--font-serif); font-size:var(--font-size-4xl); color:var(--color-text-primary); margin-bottom:var(--space-2);">
            ${VeliqUI.escape(composer.name)}
          </h1>
          <p style="font-size:var(--font-size-lg); color:var(--color-text-muted); margin-bottom:var(--space-4);">
            ${VeliqUI.escape(composer.nameEn)} (${composer.born}–${composer.died || ''})
          </p>
          <p style="font-size:var(--font-size-lg); color:var(--color-text-secondary); line-height:var(--line-height-base);">
            ${VeliqUI.escape(composer.shortBio)}
          </p>
          ${composer.birthplace ? `<p style="font-size:var(--font-size-sm); color:var(--color-text-muted); margin-top:var(--space-3);">出身地: ${VeliqUI.escape(composer.birthplace)}</p>` : ''}
        </section>

        ${composer.longBio ? `
          <section class="section">
            <h2 class="section-title">バイオグラフィ</h2>
            <div style="font-size:var(--font-size-base); color:var(--color-text-secondary); line-height:var(--line-height-base); margin-top:var(--space-4);">
              ${VeliqUI.renderMarkdown(composer.longBio)}
            </div>
          </section>
        ` : ''}

        ${composer.style && composer.style.length > 0 ? `
          <section class="section">
            <h2 class="section-title">スタイル・技法</h2>
            <div class="tag-list" style="margin-top:var(--space-4);">
              ${composer.style.map(s => `<span class="tag">${VeliqUI.escape(s)}</span>`).join('')}
            </div>
          </section>
        ` : ''}

        ${composer.quotes && composer.quotes.length > 0 ? `
          <section class="section">
            <h2 class="section-title">名言</h2>
            ${composer.quotes.map(q => `
              <div class="quote-block" style="margin-top:var(--space-4);">
                ${VeliqUI.escape(q)}
                <span class="quote-author">— ${VeliqUI.escape(composer.name)}</span>
              </div>
            `).join('')}
          </section>
        ` : ''}

        ${composer.businessQuote ? `
          <section class="section">
            <div class="business-insight">
              <div class="business-insight-label">◆ ビジネスインサイト</div>
              <p class="business-insight-text">${VeliqUI.escape(composer.businessQuote)}</p>
            </div>
          </section>
        ` : ''}

        ${works.length > 0 ? `
          <section class="section">
            <h2 class="section-title">主要作品</h2>
            <div class="card-grid stagger-children" style="margin-top:var(--space-4);">
              ${works.slice(0, 6).map(w => `
                <div class="card card--compact card--clickable" data-href="#/works/${VeliqUI.escape(w.id)}">
                  <span class="card-tag">${VeliqUI.escape(w.genre || '')}</span>
                  <h4 style="color:var(--color-text-primary); margin-top:var(--space-2);">${VeliqUI.escape(w.title)}</h4>
                  <p style="font-size:var(--font-size-xs); color:var(--color-text-muted);">${w.year || ''}</p>
                </div>
              `).join('')}
            </div>
          </section>
        ` : ''}

        ${(composer.influencedBy?.length > 0) || (composer.influenced?.length > 0) ? `
          <section class="section">
            <h2 class="section-title">影響関係</h2>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-4); margin-top:var(--space-4);">
              ${composer.influencedBy?.length > 0 ? `
                <div class="card card--compact">
                  <h4 style="color:var(--color-gold-primary); margin-bottom:var(--space-3);">影響を受けた</h4>
                  ${composer.influencedBy.map(cid => {
                    const c = composers.find(x => x.id === cid);
                    return c ? `<a href="#/composers/${VeliqUI.escape(cid)}" style="display:block; color:var(--color-text-secondary); font-size:var(--font-size-sm); padding:var(--space-1) 0;">${VeliqUI.escape(c.name)}</a>` : '';
                  }).join('')}
                </div>
              ` : '<div></div>'}
              ${composer.influenced?.length > 0 ? `
                <div class="card card--compact">
                  <h4 style="color:var(--color-gold-primary); margin-bottom:var(--space-3);">影響を与えた</h4>
                  ${composer.influenced.map(cid => {
                    const c = composers.find(x => x.id === cid);
                    return c ? `<a href="#/composers/${VeliqUI.escape(cid)}" style="display:block; color:var(--color-text-secondary); font-size:var(--font-size-sm); padding:var(--space-1) 0;">${VeliqUI.escape(c.name)}</a>` : '';
                  }).join('')}
                </div>
              ` : '<div></div>'}
            </div>
          </section>
        ` : ''}

        ${relatedComposers.length > 0 ? `
          <section class="section">
            <h2 class="section-title">同時代の作曲家</h2>
            <div class="card-grid stagger-children" style="margin-top:var(--space-4);">
              ${relatedComposers.map(c => `
                <div class="card card--compact card--clickable" data-href="#/composers/${VeliqUI.escape(c.id)}">
                  <h4 style="color:var(--color-text-primary);">${VeliqUI.escape(c.name)}</h4>
                  <p style="font-size:var(--font-size-xs); color:var(--color-text-muted);">(${c.born}–${c.died || ''})</p>
                </div>
              `).join('')}
            </div>
          </section>
        ` : ''}

        <section class="section" style="text-align:center;">
          <button class="btn-gold btn-lg" id="composer-ai-cta">
            ✦ AI Maestroに${VeliqUI.escape(composer.name)}について聞く
          </button>
        </section>
      </div>
    `;

    VeliqUI.render(html);
    VeliqUI.initCardLinks(document.getElementById('page-content'));

    document.getElementById('composer-ai-cta')?.addEventListener('click', () => {
      if (typeof AIMaestroModule !== 'undefined') {
        AIMaestroModule.openPanel();
        AIMaestroModule.setContext(`ユーザーは作曲家「${composer.name}」のページを閲覧中です。`);
      }
    });

    VeliqState.update('progress.completedModules', m => {
      const list = m || [];
      const mid = 'composer-' + id;
      return list.includes(mid) ? list : [...list, mid];
    });

    return stopTimer;
  }

  return { renderList, renderDetail };
})();

window.ComposerLibraryModule = ComposerLibraryModule;
