/**
 * veliq-events.js — Veliq Club連携
 * サイドバーにイベントバナーを表示
 */
const VeliqEventsModule = (() => {

  function init() {
    const container = document.getElementById('events-banner');
    if (!container) return;

    const events = window.VA_DATA?.veliqEvents || [];
    const upcoming = events
      .filter(e => new Date(e.date) >= new Date())
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    if (upcoming.length === 0) {
      container.innerHTML = '';
      return;
    }

    const event = upcoming[0];
    container.innerHTML = `
      <div style="padding:var(--space-3); background:linear-gradient(135deg, rgba(201,168,76,0.08), rgba(201,168,76,0.02)); border:1px solid var(--color-border-gold); border-radius:var(--radius-md);">
        <div style="font-size:var(--font-size-xs); color:var(--color-gold-muted); text-transform:uppercase; letter-spacing:1px; margin-bottom:var(--space-1);">次回公演</div>
        <div style="font-size:var(--font-size-sm); color:var(--color-gold-primary); font-weight:var(--font-weight-medium); margin-bottom:var(--space-1);">
          ${VeliqUI.escape(event.title)}
        </div>
        <div style="font-size:var(--font-size-xs); color:var(--color-text-muted);">
          ${VeliqUI.escape(event.date)} / ${VeliqUI.escape(event.venue || '')}
        </div>
        ${event.ticketUrl ? `
          <a href="${VeliqUI.escape(event.ticketUrl)}" target="_blank" rel="noopener"
             style="display:inline-block; margin-top:var(--space-2); font-size:var(--font-size-xs); color:var(--color-gold-primary); text-decoration:underline;">
            詳細 →
          </a>
        ` : ''}
      </div>
    `;
  }

  return { init };
})();

window.VeliqEventsModule = VeliqEventsModule;
