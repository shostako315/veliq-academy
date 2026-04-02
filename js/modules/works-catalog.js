/**
 * works-catalog.js — 作品カタログ
 * URL: #/works, #/works/:id
 */
const WorksCatalogModule = (() => {

  function renderList() {
    VeliqUI.setTitle('作品カタログ');
    const html = `
      <div class="anim-fade-in">
        <section class="hero">
          <h1 class="hero-title">作品カタログ</h1>
          <p class="hero-subtitle">このモジュールは準備中です</p>
        </section>
        <div class="card card--gold" style="text-align:center; padding:var(--space-12);">
          <p style="font-size:var(--font-size-lg); color:var(--color-gold-primary);">Coming Soon</p>
          <p style="color:var(--color-text-muted); margin-top:var(--space-2);">作品の一覧は現在開発中です</p>
        </div>
      </div>
    `;
    VeliqUI.render(html);
  }

  function renderDetail(id) {
    VeliqUI.setTitle('作品カタログ');
    const html = `
      <div class="anim-fade-in">
        <section class="hero">
          <h1 class="hero-title">作品詳細</h1>
          <p class="hero-subtitle">ID: ${VeliqUI.escape(String(id))}</p>
        </section>
        <div class="card card--gold" style="text-align:center; padding:var(--space-12);">
          <p style="font-size:var(--font-size-lg); color:var(--color-gold-primary);">Coming Soon</p>
          <p style="color:var(--color-text-muted); margin-top:var(--space-2);">作品の詳細ページは現在開発中です</p>
        </div>
      </div>
    `;
    VeliqUI.render(html);
  }

  return { renderList, renderDetail };
})();
window.WorksCatalogModule = WorksCatalogModule;
