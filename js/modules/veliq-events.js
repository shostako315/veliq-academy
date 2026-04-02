/**
 * veliq-events.js — Veliq Events サイドバーバナー
 * サイドバーにイベント情報を表示
 */
const VeliqEventsModule = (() => {

  function init() {
    const container = document.getElementById('sidebar-events');
    if (!container) return;

    const html = `
      <div class="sidebar-events-banner card card--compact" style="padding:var(--space-4);">
        <h4 style="margin:0 0 var(--space-2) 0; color:var(--color-gold-primary);">Veliq Events</h4>
        <p style="margin:0; font-size:var(--font-size-sm); color:var(--color-text-muted);">
          イベント情報は準備中です
        </p>
      </div>
    `;
    container.innerHTML = html;
  }

  return { init };
})();
window.VeliqEventsModule = VeliqEventsModule;
