/**
 * listening-lab.js — 鑑賞ラボ
 * URL: #/listening-lab
 */
const ListeningLabModule = (() => {

  let activeWorkId = null;
  let youtubeLoaded = {};

  function getWorksWithGuide() {
    const works = window.VA_DATA?.works || [];
    return works.filter(w => w.listeningGuide && w.listeningGuide.checkpoints && w.listeningGuide.checkpoints.length > 0);
  }

  function render() {
    VeliqUI.setTitle('鑑賞ラボ');
    const stopTimer = VeliqUI.startStudyTimer();
    const guidedWorks = getWorksWithGuide();
    const composers = window.VA_DATA?.composers || [];

    const html = `
      <div class="anim-fade-in">
        <section class="hero">
          <h1 class="hero-title">鑑賞ラボ</h1>
          <p class="hero-subtitle">ガイド付きリスニングで名曲を深く味わう</p>
        </section>

        <section class="section">
          <h2 class="section-title">ガイド付き鑑賞プログラム</h2>
          <p style="color:var(--color-text-secondary); margin-bottom:var(--space-6);">
            聴きどころをチェックポイントで確認しながら、名曲を体系的に鑑賞できます。
          </p>

          <div id="listening-works-list">
            ${guidedWorks.length === 0
              ? '<div class="empty-state"><p class="empty-state-text">ガイド付き作品がありません</p></div>'
              : guidedWorks.map(w => {
                const composer = composers.find(c => c.id === w.composerId);
                const composerName = composer ? composer.name : '';
                const isActive = activeWorkId === w.id;
                const guide = w.listeningGuide;
                return `
                  <div class="card" style="margin-bottom:var(--space-4); border-left:3px solid ${VeliqUI.eraColor(w.era)};">
                    <div class="listening-work-header" data-work-id="${VeliqUI.escape(w.id)}" style="cursor:pointer;">
                      <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div>
                          <div style="display:flex; align-items:center; gap:var(--space-2); margin-bottom:var(--space-2);">
                            ${VeliqUI.badge(VeliqUI.eraName(w.era), 'era-' + w.era)}
                            ${VeliqUI.badge(VeliqUI.escape(w.genre || ''), 'default')}
                            ${w.duration ? `<span style="font-size:var(--font-size-xs); color:var(--color-text-muted);">${VeliqUI.escape(String(w.duration))}分</span>` : ''}
                          </div>
                          <h3 style="color:var(--color-text-primary); margin:0;">${VeliqUI.escape(w.title)}</h3>
                          <p style="font-size:var(--font-size-sm); color:var(--color-text-muted); margin-top:var(--space-1);">
                            ${VeliqUI.escape(composerName)}
                          </p>
                        </div>
                        <span style="font-size:var(--font-size-xl); color:var(--color-text-muted); transition:transform 0.2s;">
                          ${isActive ? '&#9660;' : '&#9654;'}
                        </span>
                      </div>
                    </div>

                    ${isActive ? `
                      <div class="listening-work-detail" style="margin-top:var(--space-6); border-top:1px solid var(--color-border); padding-top:var(--space-4);">
                        ${guide.youtubeId ? renderYouTubeFacade(guide.youtubeId, w.id) : ''}

                        ${guide.recommendedVersion ? `
                          <p style="font-size:var(--font-size-sm); color:var(--color-text-muted); margin-bottom:var(--space-4);">
                            推奨録音: ${VeliqUI.escape(guide.recommendedVersion)}
                          </p>
                        ` : ''}

                        <div style="margin-top:var(--space-4);">
                          <h4 style="color:var(--color-gold-primary); margin-bottom:var(--space-3);">チェックポイント</h4>
                          <div style="position:relative; padding-left:var(--space-6);">
                            <div style="position:absolute; left:8px; top:0; bottom:0; width:2px; background:var(--color-border);"></div>
                            ${guide.checkpoints.map((cp, idx) => `
                              <div style="position:relative; margin-bottom:var(--space-4);">
                                <div style="position:absolute; left:-22px; top:4px; width:12px; height:12px; border-radius:50%; background:var(--color-gold-primary); border:2px solid var(--color-bg-primary);"></div>
                                <div style="display:flex; align-items:baseline; gap:var(--space-3);">
                                  <span style="font-family:var(--font-mono); font-size:var(--font-size-sm); color:var(--color-gold-primary); min-width:3rem;">
                                    ${VeliqUI.escape(cp.time)}
                                  </span>
                                  <p style="color:var(--color-text-secondary); font-size:var(--font-size-sm); margin:0;">
                                    ${VeliqUI.escape(cp.description)}
                                  </p>
                                </div>
                              </div>
                            `).join('')}
                          </div>
                        </div>

                        ${w.emotionalJourney ? `
                          <div style="margin-top:var(--space-4);">
                            <h4 style="color:var(--color-gold-primary); margin-bottom:var(--space-2);">感情の旅</h4>
                            <p style="color:var(--color-text-secondary); font-size:var(--font-size-sm);">${VeliqUI.escape(w.emotionalJourney)}</p>
                          </div>
                        ` : ''}

                        <div style="margin-top:var(--space-4); text-align:right;">
                          <a href="#/works/${VeliqUI.escape(w.id)}" style="color:var(--color-gold-primary); font-size:var(--font-size-sm);">
                            作品の詳細を見る →
                          </a>
                        </div>
                      </div>
                    ` : ''}
                  </div>
                `;
              }).join('')}
          </div>
        </section>
      </div>
    `;

    VeliqUI.render(html);
    const pageContent = document.getElementById('page-content');

    pageContent?.addEventListener('click', e => {
      const header = e.target.closest('.listening-work-header');
      if (header) {
        const workId = header.dataset.workId;
        activeWorkId = activeWorkId === workId ? null : workId;
        render();
        return;
      }

      const facade = e.target.closest('.yt-facade');
      if (facade) {
        const ytId = facade.dataset.youtubeId;
        if (ytId) {
          loadYouTubeIframe(facade, ytId);
        }
      }
    });

    return stopTimer;
  }

  function renderYouTubeFacade(youtubeId, workId) {
    if (youtubeLoaded[workId]) {
      return `
        <div style="position:relative; padding-bottom:56.25%; height:0; overflow:hidden; margin-bottom:var(--space-4); border-radius:var(--radius-md);">
          <iframe src="https://www.youtube-nocookie.com/embed/${VeliqUI.escape(youtubeId)}"
                  style="position:absolute; top:0; left:0; width:100%; height:100%; border:0; border-radius:var(--radius-md);"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowfullscreen></iframe>
        </div>
      `;
    }
    return `
      <div class="yt-facade" data-youtube-id="${VeliqUI.escape(youtubeId)}" data-work-id="${VeliqUI.escape(workId)}"
           style="position:relative; padding-bottom:56.25%; height:0; overflow:hidden; cursor:pointer; margin-bottom:var(--space-4); border-radius:var(--radius-md); background:var(--color-bg-tertiary);">
        <img src="https://img.youtube.com/vi/${VeliqUI.escape(youtubeId)}/hqdefault.jpg"
             alt="YouTube thumbnail"
             style="position:absolute; top:0; left:0; width:100%; height:100%; object-fit:cover; border-radius:var(--radius-md);">
        <div style="position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); width:68px; height:48px; background:rgba(0,0,0,0.7); border-radius:var(--radius-md); display:flex; align-items:center; justify-content:center;">
          <div style="width:0; height:0; border-style:solid; border-width:12px 0 12px 20px; border-color:transparent transparent transparent #fff; margin-left:4px;"></div>
        </div>
      </div>
    `;
  }

  function loadYouTubeIframe(facade, youtubeId) {
    const workId = facade.dataset.workId;
    if (workId) youtubeLoaded[workId] = true;
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:relative; padding-bottom:56.25%; height:0; overflow:hidden; margin-bottom:var(--space-4); border-radius:var(--radius-md);';
    wrapper.innerHTML = `
      <iframe src="https://www.youtube-nocookie.com/embed/${VeliqUI.escape(youtubeId)}?autoplay=1"
              style="position:absolute; top:0; left:0; width:100%; height:100%; border:0; border-radius:var(--radius-md);"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowfullscreen></iframe>
    `;
    facade.replaceWith(wrapper);
  }

  return { render };
})();
window.ListeningLabModule = ListeningLabModule;
