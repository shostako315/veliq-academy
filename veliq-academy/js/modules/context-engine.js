/**
 * context-engine.js — 歴史文脈クロスリファレンス
 * URL: (timeline内で使用、単独ルートなし)
 */
const ContextEngineModule = (() => {

  function render() {
    VeliqUI.setTitle('歴史文脈');
    const stopTimer = VeliqUI.startStudyTimer();
    const events = window.VA_DATA?.timelineEvents || [];

    const musicEvents = events.filter(e => e.type === 'music' || e.type === 'birth' || e.type === 'death');
    const historyEvents = events.filter(e => e.type === 'history');

    const centuries = {};
    events.forEach(e => {
      const cent = Math.floor(e.year / 100) * 100;
      if (!centuries[cent]) centuries[cent] = { music: [], history: [] };
      if (e.type === 'history') centuries[cent].history.push(e);
      else centuries[cent].music.push(e);
    });

    const sortedCenturies = Object.keys(centuries).sort((a, b) => a - b);

    const html = `
      <div class="context-engine anim-fade-in">
        <section class="hero">
          <h1 class="hero-title">歴史文脈クロスリファレンス</h1>
          <p class="hero-subtitle">音楽史と世界史を並べて見る</p>
        </section>

        <div style="display:flex; flex-direction:column; gap:var(--space-8);">
          ${sortedCenturies.map(cent => {
            const c = centuries[cent];
            const label = `${cent}年代`;
            return `
              <div class="card">
                <h3 style="font-family:var(--font-serif); font-size:var(--font-size-xl); color:var(--color-gold-primary); margin-bottom:var(--space-4);">
                  ${VeliqUI.escape(label)}
                </h3>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-6);">
                  <div>
                    <h4 style="color:var(--color-gold-muted); font-size:var(--font-size-sm); text-transform:uppercase; letter-spacing:1px; margin-bottom:var(--space-3);">
                      ◆ 音楽史
                    </h4>
                    ${c.music.length > 0 ? c.music.sort((a, b) => a.year - b.year).map(e => `
                      <div style="padding:var(--space-2) 0; border-bottom:1px solid var(--color-border-primary);">
                        <span style="font-size:var(--font-size-xs); color:var(--color-gold-primary); font-family:var(--font-mono); margin-right:var(--space-2);">${e.year}</span>
                        <span style="font-size:var(--font-size-sm); color:var(--color-text-secondary);">${VeliqUI.escape(e.title)}</span>
                      </div>
                    `).join('') : '<p style="font-size:var(--font-size-sm); color:var(--color-text-muted);">データなし</p>'}
                  </div>
                  <div>
                    <h4 style="color:var(--color-info); font-size:var(--font-size-sm); text-transform:uppercase; letter-spacing:1px; margin-bottom:var(--space-3);">
                      ◇ 世界史
                    </h4>
                    ${c.history.length > 0 ? c.history.sort((a, b) => a.year - b.year).map(e => `
                      <div style="padding:var(--space-2) 0; border-bottom:1px solid var(--color-border-primary);">
                        <span style="font-size:var(--font-size-xs); color:var(--color-info); font-family:var(--font-mono); margin-right:var(--space-2);">${e.year}</span>
                        <span style="font-size:var(--font-size-sm); color:var(--color-text-secondary);">${VeliqUI.escape(e.title)}</span>
                      </div>
                    `).join('') : '<p style="font-size:var(--font-size-sm); color:var(--color-text-muted);">データなし</p>'}
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    VeliqUI.render(html);
    return stopTimer;
  }

  return { render };
})();

window.ContextEngineModule = ContextEngineModule;
