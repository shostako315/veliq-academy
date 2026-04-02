/**
 * concert-companion.js — コンサート準備
 * URL: #/concert-companion
 */
const ConcertCompanionModule = (() => {

  function render() {
    VeliqUI.setTitle('コンサート準備');
    const html = `
      <div class="anim-fade-in">
        <section class="hero">
          <h1 class="hero-title">コンサート準備</h1>
          <p class="hero-subtitle">このモジュールは準備中です</p>
        </section>
        <div class="card card--gold" style="text-align:center; padding:var(--space-12);">
          <p style="font-size:var(--font-size-lg); color:var(--color-gold-primary);">Coming Soon</p>
          <p style="color:var(--color-text-muted); margin-top:var(--space-2);">コンサート準備ガイドは現在開発中です</p>
        </div>
      </div>
    `;
    VeliqUI.render(html);
  }

  return { render };
})();
window.ConcertCompanionModule = ConcertCompanionModule;
