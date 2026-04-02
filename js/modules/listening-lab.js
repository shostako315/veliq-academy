/**
 * listening-lab.js — 鑑賞ラボ
 * URL: #/listening-lab
 */
const ListeningLabModule = (() => {

  function render() {
    VeliqUI.setTitle('鑑賞ラボ');
    const html = `
      <div class="anim-fade-in">
        <section class="hero">
          <h1 class="hero-title">鑑賞ラボ</h1>
          <p class="hero-subtitle">このモジュールは準備中です</p>
        </section>
        <div class="card card--gold" style="text-align:center; padding:var(--space-12);">
          <p style="font-size:var(--font-size-lg); color:var(--color-gold-primary);">Coming Soon</p>
          <p style="color:var(--color-text-muted); margin-top:var(--space-2);">鑑賞ラボは現在開発中です</p>
        </div>
      </div>
    `;
    VeliqUI.render(html);
  }

  return { render };
})();
window.ListeningLabModule = ListeningLabModule;
