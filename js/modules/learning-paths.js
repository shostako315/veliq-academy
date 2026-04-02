/**
 * learning-paths.js — 学習パス
 * URL: #/learning-paths, #/learning-paths/:id
 */
const LearningPathsModule = (() => {

  function render() {
    VeliqUI.setTitle('学習パス');
    const html = `
      <div class="anim-fade-in">
        <section class="hero">
          <h1 class="hero-title">学習パス</h1>
          <p class="hero-subtitle">このモジュールは準備中です</p>
        </section>
        <div class="card card--gold" style="text-align:center; padding:var(--space-12);">
          <p style="font-size:var(--font-size-lg); color:var(--color-gold-primary);">Coming Soon</p>
          <p style="color:var(--color-text-muted); margin-top:var(--space-2);">学習パスは現在開発中です</p>
        </div>
      </div>
    `;
    VeliqUI.render(html);
  }

  function renderDetail(id) {
    VeliqUI.setTitle('学習パス');
    const html = `
      <div class="anim-fade-in">
        <section class="hero">
          <h1 class="hero-title">学習パス詳細</h1>
          <p class="hero-subtitle">ID: ${VeliqUI.escape(String(id))}</p>
        </section>
        <div class="card card--gold" style="text-align:center; padding:var(--space-12);">
          <p style="font-size:var(--font-size-lg); color:var(--color-gold-primary);">Coming Soon</p>
          <p style="color:var(--color-text-muted); margin-top:var(--space-2);">学習パスの詳細は現在開発中です</p>
        </div>
      </div>
    `;
    VeliqUI.render(html);
  }

  return { render, renderDetail };
})();
window.LearningPathsModule = LearningPathsModule;
