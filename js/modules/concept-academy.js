/**
 * concept-academy.js — 概念アカデミー
 * URL: #/concepts, #/concepts/:id
 */
const ConceptAcademyModule = (() => {

  function render() {
    VeliqUI.setTitle('概念アカデミー');
    const html = `
      <div class="anim-fade-in">
        <section class="hero">
          <h1 class="hero-title">概念アカデミー</h1>
          <p class="hero-subtitle">このモジュールは準備中です</p>
        </section>
        <div class="card card--gold" style="text-align:center; padding:var(--space-12);">
          <p style="font-size:var(--font-size-lg); color:var(--color-gold-primary);">Coming Soon</p>
          <p style="color:var(--color-text-muted); margin-top:var(--space-2);">音楽の概念学習は現在開発中です</p>
        </div>
      </div>
    `;
    VeliqUI.render(html);
  }

  function renderDetail(id) {
    VeliqUI.setTitle('概念アカデミー');
    const html = `
      <div class="anim-fade-in">
        <section class="hero">
          <h1 class="hero-title">概念詳細</h1>
          <p class="hero-subtitle">ID: ${VeliqUI.escape(String(id))}</p>
        </section>
        <div class="card card--gold" style="text-align:center; padding:var(--space-12);">
          <p style="font-size:var(--font-size-lg); color:var(--color-gold-primary);">Coming Soon</p>
          <p style="color:var(--color-text-muted); margin-top:var(--space-2);">概念の詳細ページは現在開発中です</p>
        </div>
      </div>
    `;
    VeliqUI.render(html);
  }

  return { render, renderDetail };
})();
window.ConceptAcademyModule = ConceptAcademyModule;
