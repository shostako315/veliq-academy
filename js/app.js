/**
 * app.js — アプリケーションエントリーポイント
 */

async function initApp() {
  const loadingBar = document.querySelector('.loading-bar-fill');

  try {
    const updateProgress = (pct) => { if (loadingBar) loadingBar.style.width = pct + '%'; };
    updateProgress(10);

    const [composers, works, eras, timelineEvents, quizQuestions, learningPaths, veliqEvents, concepts] =
      await Promise.all([
        VeliqUI.loadData('composers.json'),
        VeliqUI.loadData('works.json'),
        VeliqUI.loadData('eras.json'),
        VeliqUI.loadData('timeline-events.json'),
        VeliqUI.loadData('quiz-questions.json'),
        VeliqUI.loadData('learning-paths.json'),
        VeliqUI.loadData('veliq-events.json'),
        VeliqUI.loadData('concepts.json'),
      ]);

    updateProgress(60);

    window.VA_DATA = { composers, works, eras, timelineEvents, quizQuestions, learningPaths, veliqEvents, concepts };

    buildSearchIndex();
    updateProgress(80);

    VeliqRouter.register('/dashboard',         () => DashboardModule.render());
    VeliqRouter.register('/timeline',          () => TimelineModule.render());
    VeliqRouter.register('/composers',         () => ComposerLibraryModule.renderList());
    VeliqRouter.register('/composers/:id',     (p) => ComposerLibraryModule.renderDetail(p.id));
    VeliqRouter.register('/graph',             () => ComposerGraphModule.render());
    VeliqRouter.register('/works',             () => WorksCatalogModule.renderList());
    VeliqRouter.register('/works/:id',         (p) => WorksCatalogModule.renderDetail(p.id));
    VeliqRouter.register('/eras',              () => EraDeepDiveModule.renderList());
    VeliqRouter.register('/eras/:id',          (p) => EraDeepDiveModule.renderDetail(p.id));
    VeliqRouter.register('/concepts',          () => ConceptAcademyModule.render());
    VeliqRouter.register('/concepts/:id',      (p) => ConceptAcademyModule.renderDetail(p.id));
    VeliqRouter.register('/listening',         () => ListeningLabModule.render());
    VeliqRouter.register('/paths',             () => LearningPathsModule.render());
    VeliqRouter.register('/paths/:id',         (p) => LearningPathsModule.renderDetail(p.id));
    VeliqRouter.register('/quiz',              () => QuizModule.render());
    VeliqRouter.register('/concert',           () => ConcertCompanionModule.render());
    VeliqRouter.register('/score',             () => ScoreLiteracyModule.render());
    VeliqRouter.register('/progress',          () => ProgressModule.render());
    VeliqRouter.onNotFound(() => DashboardModule.render());

    initGlobalEvents();
    updateProgress(95);

    await new Promise(r => setTimeout(r, 300));
    document.getElementById('loading-screen').style.opacity = '0';
    document.getElementById('app').style.display = 'grid';
    setTimeout(() => {
      document.getElementById('loading-screen').remove();
    }, 500);

    VeliqRouter.init();
    updateProgress(100);

    if (!VeliqState.get('user.setupComplete')) {
      setTimeout(() => DashboardModule.showSetupWizard(), 800);
    }

    if (typeof ProgressModule !== 'undefined') {
      ProgressModule.checkBadges();
      ProgressModule.updateSidebar();
    }

    if (typeof VeliqEventsModule !== 'undefined') {
      VeliqEventsModule.init();
    }

    updateStreak();

  } catch (error) {
    console.error('App init failed:', error);
    document.getElementById('loading-screen').innerHTML =
      '<p style="color:#C9A84C;text-align:center;padding:2rem;">読み込みに失敗しました。ページを更新してください。</p>';
  }
}

function initGlobalEvents() {
  document.getElementById('open-ai-maestro')?.addEventListener('click', () => {
    if (typeof AIMaestroModule !== 'undefined') AIMaestroModule.openPanel();
  });
  document.getElementById('close-ai-maestro')?.addEventListener('click', () => {
    if (typeof AIMaestroModule !== 'undefined') AIMaestroModule.closePanel();
  });

  document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });

  const searchInput = document.getElementById('global-search');
  if (searchInput) {
    let debounceTimer;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => globalSearch(e.target.value), 200);
    });
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        searchInput.value = '';
        document.getElementById('search-results').hidden = true;
      }
    });
    searchInput.addEventListener('focus', () => {
      if (searchInput.value.length >= 2) {
        document.getElementById('search-results').hidden = false;
      }
    });
  }

  document.addEventListener('click', (e) => {
    const searchArea = document.querySelector('.header-search');
    if (searchArea && !searchArea.contains(e.target)) {
      document.getElementById('search-results').hidden = true;
    }
  });
}

function buildSearchIndex() {
  const { composers, works } = window.VA_DATA;
  window.VA_SEARCH_INDEX = [
    ...(composers || []).map(c => ({
      type: 'composer', id: c.id,
      text: `${c.name} ${c.nameEn}`,
      route: `#/composers/${c.id}`,
      era: c.era
    })),
    ...(works || []).map(w => ({
      type: 'work', id: w.id,
      text: `${w.title} ${w.titleEn || ''}`,
      route: `#/works/${w.id}`,
      composerId: w.composerId
    }))
  ];
}

function globalSearch(query) {
  if (!query || query.length < 2) {
    document.getElementById('search-results').hidden = true;
    return;
  }
  const q = query.toLowerCase();
  const results = (window.VA_SEARCH_INDEX || [])
    .filter(item => item.text.toLowerCase().includes(q))
    .slice(0, 8);

  const container = document.getElementById('search-results');
  if (!container) return;

  if (results.length === 0) {
    container.hidden = true;
    return;
  }

  container.innerHTML = results.map(r => `
    <a href="${VeliqUI.escape(r.route)}" class="search-result-item">
      <span class="search-type-badge">${r.type === 'composer' ? '作曲家' : '作品'}</span>
      <span class="search-title">${VeliqUI.escape(r.text)}</span>
    </a>
  `).join('');
  container.hidden = false;
}

function updateStreak() {
  const lastStudy = VeliqState.get('progress.lastStudyAt');
  if (!lastStudy) return;

  const now = new Date();
  const last = new Date(lastStudy);
  const diffDays = Math.floor((now.setHours(0,0,0,0) - last.setHours(0,0,0,0)) / 86400000);

  if (diffDays > 1) {
    VeliqState.set('progress.streak', 0);
  } else if (diffDays === 1) {
    VeliqState.update('progress.streak', s => (s || 0) + 1);
  }
}

window.addEventListener('DOMContentLoaded', initApp);
