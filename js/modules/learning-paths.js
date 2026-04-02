/**
 * learning-paths.js — 学習パス
 * URL: #/learning-paths, #/learning-paths/:id
 */
const LearningPathsModule = (() => {

  const levelLabels = {
    beginner: '初級',
    intermediate: '中級',
    advanced: '上級',
  };

  const lessonTypeLabels = {
    article: '記事',
    composer: '作曲家',
    'multi-composer': '作曲家',
    era: '時代',
    listening: '鑑賞',
    concept: '概念',
    quiz: 'クイズ',
  };

  function getEnrolledPaths() {
    return VeliqState.get('paths.enrolledPaths') || [];
  }

  function isEnrolled(pathId) {
    return getEnrolledPaths().includes(pathId);
  }

  function enrollPath(pathId) {
    VeliqState.update('paths.enrolledPaths', list => {
      const arr = list || [];
      return arr.includes(pathId) ? arr : [...arr, pathId];
    });
  }

  function unenrollPath(pathId) {
    VeliqState.update('paths.enrolledPaths', list => {
      return (list || []).filter(id => id !== pathId);
    });
  }

  function getLessonCompletions(pathId) {
    return VeliqState.get('progress.completedLessons') || {};
  }

  function isLessonComplete(lessonId) {
    const completions = getLessonCompletions();
    return !!completions[lessonId];
  }

  function markLessonComplete(lessonId) {
    VeliqState.update('progress.completedLessons', obj => {
      const o = obj || {};
      o[lessonId] = Date.now();
      return o;
    });
  }

  function getPathProgress(path) {
    const completions = getLessonCompletions();
    const total = path.lessons.length;
    const done = path.lessons.filter(l => completions[l.id]).length;
    return { done, total };
  }

  function getLessonHref(lesson) {
    switch (lesson.type) {
      case 'era':
        return lesson.eraId ? `#/eras/${lesson.eraId}` : '';
      case 'composer':
        return lesson.composerId ? `#/composers/${lesson.composerId}` : '';
      case 'multi-composer':
        return lesson.composerIds && lesson.composerIds[0] ? `#/composers/${lesson.composerIds[0]}` : '';
      case 'listening':
        return lesson.workId ? `#/works/${lesson.workId}` : '';
      case 'concept':
        return lesson.contentId ? `#/concepts/${lesson.contentId}` : '';
      case 'quiz':
        return '#/quiz';
      default:
        return '';
    }
  }

  function render() {
    VeliqUI.setTitle('学習パス');
    const stopTimer = VeliqUI.startStudyTimer();
    const paths = window.VA_DATA?.learningPaths || [];
    const enrolled = getEnrolledPaths();

    const html = `
      <div class="anim-fade-in">
        <section class="hero">
          <h1 class="hero-title">学習パス</h1>
          <p class="hero-subtitle">目的に合わせた体系的な学習コースを選びましょう</p>
        </section>

        ${enrolled.length > 0 ? `
          <section class="section">
            <h2 class="section-title">受講中のパス</h2>
            <div class="card-grid stagger-children" style="margin-top:var(--space-4);">
              ${paths.filter(p => enrolled.includes(p.id)).map(p => {
                const prog = getPathProgress(p);
                return `
                  <div class="card card--clickable card--gold" data-href="#/learning-paths/${VeliqUI.escape(p.id)}">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--space-2);">
                      ${VeliqUI.badge(levelLabels[p.level] || p.level, 'default')}
                      <span style="font-size:var(--font-size-xs); color:var(--color-text-muted);">${VeliqUI.escape(String(p.estimatedHours))}時間</span>
                    </div>
                    <h3 class="card-title">${VeliqUI.escape(p.title)}</h3>
                    <p class="card-subtitle">${VeliqUI.escape(p.subtitle)}</p>
                    ${VeliqUI.progressBar(prog.done, prog.total, prog.done + '/' + prog.total + ' レッスン完了')}
                  </div>
                `;
              }).join('')}
            </div>
          </section>
        ` : ''}

        <section class="section">
          <h2 class="section-title">すべての学習パス</h2>
          <div class="card-grid stagger-children" style="margin-top:var(--space-4);">
            ${paths.map(p => {
              const prog = getPathProgress(p);
              const enrolledFlag = enrolled.includes(p.id);
              return `
                <div class="card card--clickable" data-href="#/learning-paths/${VeliqUI.escape(p.id)}"
                     style="border-left:3px solid var(--color-gold-primary);">
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--space-2);">
                    <div style="display:flex; gap:var(--space-2); align-items:center;">
                      <span style="font-size:var(--font-size-xl);">${VeliqUI.escape(p.icon)}</span>
                      ${VeliqUI.badge(levelLabels[p.level] || p.level, 'default')}
                    </div>
                    <span style="font-size:var(--font-size-xs); color:var(--color-text-muted);">
                      ${VeliqUI.escape(String(p.estimatedHours))}時間 / ${VeliqUI.escape(String(p.lessons.length))}レッスン
                    </span>
                  </div>
                  <h3 class="card-title">${VeliqUI.escape(p.title)}</h3>
                  <p class="card-subtitle">${VeliqUI.escape(p.subtitle)}</p>
                  ${enrolledFlag ? VeliqUI.progressBar(prog.done, prog.total) : ''}
                  ${enrolledFlag ? VeliqUI.badge('受講中', 'success') : ''}
                </div>
              `;
            }).join('')}
          </div>
        </section>
      </div>
    `;

    VeliqUI.render(html);
    VeliqUI.initCardLinks(document.getElementById('page-content'));
    return stopTimer;
  }

  function renderDetail(id) {
    const paths = window.VA_DATA?.learningPaths || [];
    const path = paths.find(p => p.id === id);
    if (!path) {
      VeliqUI.render('<div class="empty-state"><p class="empty-state-text">学習パスが見つかりません。</p></div>');
      return;
    }

    VeliqUI.setTitle(path.title);
    const stopTimer = VeliqUI.startStudyTimer();
    const enrolled = isEnrolled(id);
    const prog = getPathProgress(path);
    const completions = getLessonCompletions();

    const html = `
      <div class="anim-fade-in">
        <a href="#/learning-paths" style="display:inline-flex; align-items:center; gap:var(--space-2); color:var(--color-text-muted); font-size:var(--font-size-sm); margin-bottom:var(--space-6);">
          ← 学習パス一覧に戻る
        </a>

        <section class="section" style="border-bottom:2px solid var(--color-gold-primary); padding-bottom:var(--space-8);">
          <div style="display:flex; align-items:center; gap:var(--space-3); margin-bottom:var(--space-4);">
            <span style="font-size:var(--font-size-3xl);">${VeliqUI.escape(path.icon)}</span>
            ${VeliqUI.badge(levelLabels[path.level] || path.level, 'default')}
            <span style="font-size:var(--font-size-sm); color:var(--color-text-muted);">
              約${VeliqUI.escape(String(path.estimatedHours))}時間
            </span>
          </div>
          <h1 style="font-family:var(--font-serif); font-size:var(--font-size-3xl); color:var(--color-text-primary); margin-bottom:var(--space-2);">
            ${VeliqUI.escape(path.title)}
          </h1>
          <p style="font-size:var(--font-size-lg); color:var(--color-text-secondary); margin-bottom:var(--space-6);">
            ${VeliqUI.escape(path.subtitle)}
          </p>
          ${VeliqUI.progressBar(prog.done, prog.total, prog.done + '/' + prog.total + ' レッスン完了')}
          <div style="margin-top:var(--space-4);">
            <button class="btn-gold" id="enroll-btn">
              ${enrolled ? '受講を取り消す' : 'このパスを受講する'}
            </button>
          </div>
        </section>

        <section class="section">
          <h2 class="section-title">レッスン一覧</h2>
          <div style="margin-top:var(--space-4);">
            ${path.lessons.map((lesson, idx) => {
              const done = !!completions[lesson.id];
              const href = getLessonHref(lesson);
              const typeLabel = lessonTypeLabels[lesson.type] || lesson.type;
              return `
                <div class="card card--compact ${href ? 'card--clickable' : ''}" ${href ? `data-href="${VeliqUI.escape(href)}"` : ''}
                     style="margin-bottom:var(--space-3); border-left:3px solid ${done ? 'var(--color-success)' : 'var(--color-border)'};">
                  <div style="display:flex; align-items:center; gap:var(--space-3);">
                    <span style="font-size:var(--font-size-lg); font-weight:700; color:${done ? 'var(--color-success)' : 'var(--color-text-muted)'}; min-width:2rem; text-align:center;">
                      ${done ? '&#10003;' : VeliqUI.escape(String(lesson.order))}
                    </span>
                    <div style="flex:1;">
                      <div style="display:flex; align-items:center; gap:var(--space-2); margin-bottom:var(--space-1);">
                        ${VeliqUI.badge(typeLabel, 'default')}
                        ${lesson.required ? '' : VeliqUI.badge('任意', 'info')}
                        <span style="font-size:var(--font-size-xs); color:var(--color-text-muted);">
                          約${VeliqUI.escape(String(lesson.estimatedMinutes))}分
                        </span>
                      </div>
                      <h4 style="color:var(--color-text-primary); margin:0;">${VeliqUI.escape(lesson.title)}</h4>
                    </div>
                    <button class="btn-icon lesson-complete-btn" data-lesson-id="${VeliqUI.escape(lesson.id)}" title="${done ? '完了済み' : '完了にする'}">
                      ${done ? '&#9733;' : '&#9734;'}
                    </button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </section>
      </div>
    `;

    VeliqUI.render(html);
    const pageContent = document.getElementById('page-content');
    VeliqUI.initCardLinks(pageContent);

    document.getElementById('enroll-btn')?.addEventListener('click', () => {
      if (isEnrolled(id)) {
        unenrollPath(id);
      } else {
        enrollPath(id);
      }
      renderDetail(id);
    });

    pageContent?.addEventListener('click', e => {
      const btn = e.target.closest('.lesson-complete-btn');
      if (!btn) return;
      e.stopPropagation();
      const lessonId = btn.dataset.lessonId;
      if (lessonId && !isLessonComplete(lessonId)) {
        markLessonComplete(lessonId);
        VeliqUI.toast('レッスンを完了しました', 'success');
        renderDetail(id);
      }
    });

    return stopTimer;
  }

  return { render, renderDetail };
})();
window.LearningPathsModule = LearningPathsModule;
