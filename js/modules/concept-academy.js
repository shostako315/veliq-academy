/**
 * concept-academy.js — 概念アカデミー
 * URL: #/concepts, #/concepts/:id
 */
const ConceptAcademyModule = (() => {

  let currentCategory = 'all';

  const categoryLabels = {
    form: '形式',
    genre: 'ジャンル',
    technique: '技法',
    theory: '理論',
    ensemble: 'アンサンブル',
  };

  const difficultyLabels = {
    1: '入門',
    2: '基礎',
    3: '応用',
    4: '発展',
    5: '専門',
  };

  function render() {
    VeliqUI.setTitle('概念アカデミー');
    const stopTimer = VeliqUI.startStudyTimer();
    const concepts = window.VA_DATA?.concepts || [];

    const categories = ['all', ...new Set(concepts.map(c => c.category).filter(Boolean))];

    const html = `
      <div class="anim-fade-in">
        <section class="hero">
          <h1 class="hero-title">概念アカデミー</h1>
          <p class="hero-subtitle">クラシック音楽の重要概念を体系的に学ぶ</p>
        </section>

        <div class="tab-filter" id="category-filter">
          ${categories.map(cat => `
            <button class="tab-filter-btn ${currentCategory === cat ? 'active' : ''}" data-category="${VeliqUI.escape(cat)}">
              ${cat === 'all' ? 'すべて' : VeliqUI.escape(categoryLabels[cat] || cat)}
            </button>
          `).join('')}
        </div>

        <div class="card-grid stagger-children" id="concepts-grid" style="margin-top:var(--space-4);">
          ${renderConceptCards(concepts, currentCategory)}
        </div>
      </div>
    `;

    VeliqUI.render(html);
    const pageContent = document.getElementById('page-content');
    VeliqUI.initCardLinks(pageContent);

    document.getElementById('category-filter')?.addEventListener('click', e => {
      const btn = e.target.closest('.tab-filter-btn');
      if (!btn) return;
      currentCategory = btn.dataset.category;
      document.querySelectorAll('#category-filter .tab-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const grid = document.getElementById('concepts-grid');
      if (grid) {
        const concepts = window.VA_DATA?.concepts || [];
        grid.innerHTML = renderConceptCards(concepts, currentCategory);
        VeliqUI.initCardLinks(grid);
      }
    });

    return stopTimer;
  }

  function renderConceptCards(concepts, category) {
    let filtered = concepts;
    if (category !== 'all') {
      filtered = filtered.filter(c => c.category === category);
    }

    if (filtered.length === 0) {
      return '<div class="empty-state"><p class="empty-state-text">該当する概念が見つかりません</p></div>';
    }

    return filtered.map(c => `
      <div class="card card--clickable" data-href="#/concepts/${VeliqUI.escape(c.id)}">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--space-2);">
          ${VeliqUI.badge(categoryLabels[c.category] || c.category, 'default')}
          ${VeliqUI.badge(difficultyLabels[c.difficulty] || '', 'info')}
        </div>
        <h3 class="card-title">${VeliqUI.escape(c.title)}</h3>
        <p style="font-size:var(--font-size-xs); color:var(--color-text-muted); margin-bottom:var(--space-2);">
          ${VeliqUI.escape(c.titleEn || '')}
        </p>
        <p class="card-subtitle">${VeliqUI.escape(c.shortDescription)}</p>
        ${c.tags && c.tags.length > 0 ? `
          <div class="tag-list" style="margin-top:var(--space-3);">
            ${c.tags.slice(0, 3).map(t => `<span class="tag">${VeliqUI.escape(t)}</span>`).join('')}
          </div>
        ` : ''}
      </div>
    `).join('');
  }

  function renderDetail(id) {
    const concepts = window.VA_DATA?.concepts || [];
    const concept = concepts.find(c => c.id === id);
    if (!concept) {
      VeliqUI.render('<div class="empty-state"><p class="empty-state-text">概念が見つかりません。</p></div>');
      return;
    }

    VeliqUI.setTitle(concept.title);
    const stopTimer = VeliqUI.startStudyTimer();
    const composers = window.VA_DATA?.composers || [];
    const relatedConcepts = concepts.filter(c => (concept.relatedConcepts || []).includes(c.id));
    const relatedComposers = composers.filter(c => (concept.relatedComposers || []).includes(c.id));

    VeliqState.update('history.recentlyViewed', items => {
      const filtered = (items || []).filter(i => !(i.type === 'concept' && i.id === id));
      return [{ type: 'concept', id, title: concept.title, viewedAt: Date.now() }, ...filtered].slice(0, 20);
    });

    const html = `
      <div class="anim-fade-in">
        <a href="#/concepts" style="display:inline-flex; align-items:center; gap:var(--space-2); color:var(--color-text-muted); font-size:var(--font-size-sm); margin-bottom:var(--space-6);">
          ← 概念アカデミーに戻る
        </a>

        <section class="section" style="border-bottom:2px solid var(--color-gold-primary); padding-bottom:var(--space-8);">
          <div style="display:flex; align-items:center; gap:var(--space-3); margin-bottom:var(--space-4);">
            ${VeliqUI.badge(categoryLabels[concept.category] || concept.category, 'default')}
            ${VeliqUI.badge(difficultyLabels[concept.difficulty] || '', 'info')}
          </div>
          <h1 style="font-family:var(--font-serif); font-size:var(--font-size-3xl); color:var(--color-text-primary); margin-bottom:var(--space-2);">
            ${VeliqUI.escape(concept.title)}
          </h1>
          <p style="font-size:var(--font-size-lg); color:var(--color-text-muted); margin-bottom:var(--space-4);">
            ${VeliqUI.escape(concept.titleEn || '')}
          </p>
          <p style="font-size:var(--font-size-lg); color:var(--color-text-secondary); line-height:var(--line-height-base);">
            ${VeliqUI.escape(concept.shortDescription)}
          </p>
        </section>

        ${concept.body ? `
          <section class="section">
            <h2 class="section-title">解説</h2>
            <div style="font-size:var(--font-size-base); color:var(--color-text-secondary); line-height:var(--line-height-base); margin-top:var(--space-4);">
              ${VeliqUI.renderMarkdown(concept.body)}
            </div>
          </section>
        ` : ''}

        ${concept.tags && concept.tags.length > 0 ? `
          <section class="section">
            <h2 class="section-title">タグ</h2>
            <div class="tag-list" style="margin-top:var(--space-4);">
              ${concept.tags.map(t => `<span class="tag">${VeliqUI.escape(t)}</span>`).join('')}
            </div>
          </section>
        ` : ''}

        ${relatedComposers.length > 0 ? `
          <section class="section">
            <h2 class="section-title">関連する作曲家</h2>
            <div class="card-grid stagger-children" style="margin-top:var(--space-4);">
              ${relatedComposers.map(c => `
                <div class="card card--compact card--clickable" data-href="#/composers/${VeliqUI.escape(c.id)}"
                     style="border-left:3px solid ${VeliqUI.eraColor(c.era)};">
                  <h4 style="color:var(--color-text-primary);">${VeliqUI.escape(c.name)}</h4>
                  <p style="font-size:var(--font-size-xs); color:var(--color-text-muted);">
                    ${VeliqUI.escape(c.nameEn)} (${c.born}–${c.died || ''})
                  </p>
                </div>
              `).join('')}
            </div>
          </section>
        ` : ''}

        ${relatedConcepts.length > 0 ? `
          <section class="section">
            <h2 class="section-title">関連する概念</h2>
            <div class="card-grid stagger-children" style="margin-top:var(--space-4);">
              ${relatedConcepts.map(c => `
                <div class="card card--compact card--clickable" data-href="#/concepts/${VeliqUI.escape(c.id)}">
                  <div style="display:flex; align-items:center; gap:var(--space-2); margin-bottom:var(--space-2);">
                    ${VeliqUI.badge(categoryLabels[c.category] || c.category, 'default')}
                  </div>
                  <h4 style="color:var(--color-text-primary);">${VeliqUI.escape(c.title)}</h4>
                  <p style="font-size:var(--font-size-xs); color:var(--color-text-muted);">${VeliqUI.escape(c.shortDescription)}</p>
                </div>
              `).join('')}
            </div>
          </section>
        ` : ''}

        <section class="section" style="text-align:center;">
          <button class="btn-gold btn-lg" id="concept-ai-cta">
            ✦ AI Maestroに${VeliqUI.escape(concept.title)}について聞く
          </button>
        </section>
      </div>
    `;

    VeliqUI.render(html);
    VeliqUI.initCardLinks(document.getElementById('page-content'));

    document.getElementById('concept-ai-cta')?.addEventListener('click', () => {
      if (typeof AIMaestroModule !== 'undefined') {
        AIMaestroModule.openPanel();
        AIMaestroModule.setContext('ユーザーは概念「' + concept.title + '」のページを閲覧中です。');
      }
    });

    VeliqState.update('progress.completedModules', m => {
      const list = m || [];
      const mid = 'concept-' + id;
      return list.includes(mid) ? list : [...list, mid];
    });

    return stopTimer;
  }

  return { render, renderDetail };
})();
window.ConceptAcademyModule = ConceptAcademyModule;
