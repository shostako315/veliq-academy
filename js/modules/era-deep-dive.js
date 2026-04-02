/**
 * era-deep-dive.js — 時代深掘り
 * URL: #/eras, #/eras/:eraId
 */
const EraDeepDiveModule = (() => {

  function renderList() {
    VeliqUI.setTitle('時代を学ぶ');
    const stopTimer = VeliqUI.startStudyTimer();
    const eras = window.VA_DATA?.eras || {};
    const eraOrder = ['ancient', 'renaissance', 'baroque', 'classical', 'romantic', 'modern', 'contemporary'];

    const html = `
      <div class="eras-list anim-fade-in">
        <section class="hero">
          <h1 class="hero-title">時代を学ぶ</h1>
          <p class="hero-subtitle">古代から現代まで、音楽史の壮大な物語を辿る</p>
        </section>

        <div class="card-grid stagger-children">
          ${eraOrder.map(eraId => {
            const era = eras[eraId];
            if (!era) return '';
            const completed = (VeliqState.get('progress.completedModules') || []).includes('era-' + eraId);
            return `
              <div class="card card--clickable" data-href="#/eras/${VeliqUI.escape(eraId)}"
                   style="border-left: 3px solid ${era.color};">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--space-2);">
                  ${VeliqUI.badge(era.period, 'era-' + eraId)}
                  ${completed ? VeliqUI.badge('完了', 'success') : ''}
                </div>
                <h3 class="card-title">${VeliqUI.escape(era.name)}</h3>
                <p class="card-subtitle">${VeliqUI.escape(era.shortDescription)}</p>
                <div class="card-footer">
                  <span style="color:${era.color};">${VeliqUI.escape(era.headline || '')}</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    VeliqUI.render(html);
    VeliqUI.initCardLinks(document.getElementById('page-content'));
    return stopTimer;
  }

  function renderDetail(eraId) {
    const eras = window.VA_DATA?.eras || {};
    const era = eras[eraId];
    if (!era) {
      VeliqUI.render('<div class="empty-state"><p class="empty-state-text">時代データが見つかりません。</p></div>');
      return;
    }

    VeliqUI.setTitle(era.name);
    const stopTimer = VeliqUI.startStudyTimer();
    const composers = window.VA_DATA?.composers || [];
    const eraComposers = composers.filter(c => c.era === eraId).slice(0, 12);

    addToHistory('era', eraId, era.name);

    const html = `
      <div class="era-detail anim-fade-in">

        <!-- ヒーロー -->
        <section class="section" style="border-bottom: 2px solid ${era.color}; padding-bottom:var(--space-8);">
          <div style="display:flex; align-items:center; gap:var(--space-3); margin-bottom:var(--space-4);">
            ${VeliqUI.badge(era.period, 'era-' + eraId)}
            ${era.prevEra ? `<a href="#/eras/${VeliqUI.escape(era.prevEra)}" class="btn-ghost btn-sm">← 前の時代</a>` : ''}
            ${era.nextEra ? `<a href="#/eras/${VeliqUI.escape(era.nextEra)}" class="btn-ghost btn-sm">次の時代 →</a>` : ''}
          </div>
          <h1 style="font-family:var(--font-serif); font-size:var(--font-size-4xl); color:${era.color}; margin-bottom:var(--space-3);">
            ${VeliqUI.escape(era.name)}
          </h1>
          <p style="font-family:var(--font-serif); font-size:var(--font-size-xl); color:var(--color-text-secondary); margin-bottom:var(--space-6);">
            ${VeliqUI.escape(era.headline)}
          </p>
          <p style="font-size:var(--font-size-base); color:var(--color-text-primary); line-height:var(--line-height-base);">
            ${VeliqUI.escape(era.overview)}
          </p>
        </section>

        <!-- この時代の空気（歴史文脈） -->
        ${era.historicalContext ? `
          <section class="section">
            <h2 class="section-title">この時代の空気</h2>
            <div class="card-grid" style="margin-top:var(--space-4);">
              <div class="card card--compact">
                <h4 style="color:var(--color-gold-primary); margin-bottom:var(--space-2);">政治・社会</h4>
                <p style="font-size:var(--font-size-sm); color:var(--color-text-secondary); line-height:var(--line-height-base);">
                  ${VeliqUI.escape(era.historicalContext.political)}
                </p>
              </div>
              <div class="card card--compact">
                <h4 style="color:var(--color-gold-primary); margin-bottom:var(--space-2);">思想・哲学</h4>
                <p style="font-size:var(--font-size-sm); color:var(--color-text-secondary); line-height:var(--line-height-base);">
                  ${VeliqUI.escape(era.historicalContext.philosophical)}
                </p>
              </div>
              <div class="card card--compact">
                <h4 style="color:var(--color-gold-primary); margin-bottom:var(--space-2);">芸術・文化</h4>
                <p style="font-size:var(--font-size-sm); color:var(--color-text-secondary); line-height:var(--line-height-base);">
                  ${VeliqUI.escape(era.historicalContext.artistic)}
                </p>
              </div>
            </div>
          </section>
        ` : ''}

        <!-- 音楽的特徴 -->
        ${era.musicalCharacteristics ? `
          <section class="section">
            <h2 class="section-title">音楽的特徴</h2>
            <div class="card-grid" style="margin-top:var(--space-4);">
              ${era.musicalCharacteristics.map(c => `
                <div class="card card--compact" style="border-left:3px solid ${era.color};">
                  <h4 style="color:var(--color-text-primary); margin-bottom:var(--space-2);">${VeliqUI.escape(c.title)}</h4>
                  <p style="font-size:var(--font-size-sm); color:var(--color-text-secondary); line-height:var(--line-height-base);">
                    ${VeliqUI.escape(c.description)}
                  </p>
                </div>
              `).join('')}
            </div>
          </section>
        ` : ''}

        <!-- サブセクション（詳細歴史） -->
        ${era.subsections ? `
          <section class="section">
            <h2 class="section-title">詳しく学ぶ</h2>
            ${era.subsections.map(sub => `
              <div class="card" style="margin-top:var(--space-4);">
                <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:var(--space-3);">
                  <h3 style="font-family:var(--font-serif); font-size:var(--font-size-lg); color:var(--color-text-primary);">
                    ${VeliqUI.escape(sub.title)}
                  </h3>
                  <span style="font-size:var(--font-size-xs); color:var(--color-text-muted);">${VeliqUI.escape(sub.years)}</span>
                </div>
                <p style="font-size:var(--font-size-sm); color:var(--color-text-secondary); line-height:var(--line-height-base);">
                  ${VeliqUI.escape(sub.body)}
                </p>
              </div>
            `).join('')}
          </section>
        ` : ''}

        <!-- 代表作曲家 -->
        ${eraComposers.length > 0 ? `
          <section class="section">
            <h2 class="section-title">代表的な作曲家</h2>
            <div class="card-grid stagger-children" style="margin-top:var(--space-4);">
              ${eraComposers.map(c => `
                <div class="card card--compact card--clickable" data-href="#/composers/${VeliqUI.escape(c.id)}">
                  <h4 style="color:var(--color-text-primary);">${VeliqUI.escape(c.name)}</h4>
                  <p style="font-size:var(--font-size-xs); color:var(--color-text-muted); margin-bottom:var(--space-2);">
                    ${VeliqUI.escape(c.nameEn)} (${c.born}–${c.died || ''})
                  </p>
                  <p style="font-size:var(--font-size-sm); color:var(--color-text-secondary);">
                    ${VeliqUI.escape(c.shortBio)}
                  </p>
                </div>
              `).join('')}
            </div>
          </section>
        ` : ''}

        <!-- キージャンル・楽器・会場 -->
        <section class="section">
          <div class="card-grid" style="grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));">
            ${era.keyGenres ? `
              <div class="card card--compact">
                <h4 style="color:var(--color-gold-primary); margin-bottom:var(--space-3);">主要ジャンル</h4>
                <div class="tag-list">
                  ${era.keyGenres.map(g => `<span class="tag">${VeliqUI.escape(g)}</span>`).join('')}
                </div>
              </div>
            ` : ''}
            ${era.instruments ? `
              <div class="card card--compact">
                <h4 style="color:var(--color-gold-primary); margin-bottom:var(--space-3);">主要楽器</h4>
                <div class="tag-list">
                  ${era.instruments.map(i => `<span class="tag">${VeliqUI.escape(i)}</span>`).join('')}
                </div>
              </div>
            ` : ''}
            ${era.venues ? `
              <div class="card card--compact">
                <h4 style="color:var(--color-gold-primary); margin-bottom:var(--space-3);">演奏の場</h4>
                <div class="tag-list">
                  ${era.venues.map(v => `<span class="tag">${VeliqUI.escape(v)}</span>`).join('')}
                </div>
              </div>
            ` : ''}
          </div>
        </section>

        <!-- ビジネスレッスン -->
        ${era.businessLesson ? `
          <section class="section">
            <div class="business-insight">
              <div class="business-insight-label">◆ ビジネスリーダーへの教訓</div>
              <p class="business-insight-text">${VeliqUI.escape(era.businessLesson)}</p>
            </div>
          </section>
        ` : ''}

        <!-- ナビゲーション -->
        <section class="section" style="display:flex; justify-content:space-between; gap:var(--space-4);">
          ${era.prevEra ? `
            <a href="#/eras/${VeliqUI.escape(era.prevEra)}" class="card card--clickable" style="flex:1; text-align:center;" data-href="#/eras/${VeliqUI.escape(era.prevEra)}">
              <span style="color:var(--color-text-muted);">← 前の時代</span>
              <h4 style="color:var(--color-gold-primary);">${VeliqUI.escape(eras[era.prevEra]?.name || '')}</h4>
            </a>
          ` : '<div style="flex:1;"></div>'}
          ${era.nextEra ? `
            <a href="#/eras/${VeliqUI.escape(era.nextEra)}" class="card card--clickable" style="flex:1; text-align:center;" data-href="#/eras/${VeliqUI.escape(era.nextEra)}">
              <span style="color:var(--color-text-muted);">次の時代 →</span>
              <h4 style="color:var(--color-gold-primary);">${VeliqUI.escape(eras[era.nextEra]?.name || '')}</h4>
            </a>
          ` : '<div style="flex:1;"></div>'}
        </section>

        <!-- AI Maestro CTA -->
        <section class="section" style="text-align:center;">
          <button class="btn-gold btn-lg" id="era-ai-cta">
            ✦ AI Maestroにこの時代について聞く
          </button>
        </section>
      </div>
    `;

    VeliqUI.render(html);
    VeliqUI.initCardLinks(document.getElementById('page-content'));

    document.getElementById('era-ai-cta')?.addEventListener('click', () => {
      if (typeof AIMaestroModule !== 'undefined') {
        AIMaestroModule.openPanel();
        AIMaestroModule.setContext(`ユーザーは「${era.name}（${era.period}）」のページを閲覧中です。`);
      }
    });

    markModuleCompleted('era-' + eraId);
    return stopTimer;
  }

  function addToHistory(type, id, title) {
    VeliqState.update('history.recentlyViewed', items => {
      const filtered = (items || []).filter(i => !(i.type === type && i.id === id));
      return [{ type, id, title, viewedAt: Date.now() }, ...filtered].slice(0, 20);
    });
  }

  function markModuleCompleted(moduleId) {
    VeliqState.update('progress.completedModules', modules => {
      const list = modules || [];
      if (list.includes(moduleId)) return list;
      return [...list, moduleId];
    });
  }

  return { renderList, renderDetail };
})();

window.EraDeepDiveModule = EraDeepDiveModule;
