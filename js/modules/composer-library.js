/**
 * composer-library.js — 作曲家図鑑
 * URL: #/composers, #/composers/:id
 */
const ComposerLibraryModule = (() => {

  function renderList() {
    VeliqUI.setTitle('作曲家図鑑');
    const html = `
      <div class="anim-fade-in">
        <section class="hero">
          <h1 class="hero-title">作曲家図鑑</h1>
          <p class="hero-subtitle">このモジュールは準備中です</p>
        </section>
        <div class="card card--gold" style="text-align:center; padding:var(--space-12);">
          <p style="font-size:var(--font-size-lg); color:var(--color-gold-primary);">Coming Soon</p>
          <p style="color:var(--color-text-muted); margin-top:var(--space-2);">作曲家の一覧は現在開発中です</p>
        </div>
      </div>
    `;
    VeliqUI.render(html);
  }

  function renderDetail(id) {
    VeliqUI.setTitle('作曲家図鑑');
    const html = `
      <div class="anim-fade-in">
        <section class="hero">
          <h1 class="hero-title">作曲家詳細</h1>
          <p class="hero-subtitle">ID: ${VeliqUI.escape(String(id))}</p>
        </section>
        <div class="card card--gold" style="text-align:center; padding:var(--space-12);">
          <p style="font-size:var(--font-size-lg); color:var(--color-gold-primary);">Coming Soon</p>
          <p style="color:var(--color-text-muted); margin-top:var(--space-2);">作曲家の詳細ページは現在開発中です</p>
        </div>
      </div>
    `;
    VeliqUI.render(html);
  }

  return { renderList, renderDetail };
})();
window.ComposerLibraryModule = ComposerLibraryModule;
