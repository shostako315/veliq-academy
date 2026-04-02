/**
 * progress.js — 進捗・バッジ管理
 * URL: #/progress
 */
const ProgressModule = (() => {

  const BADGES = [
    { id: 'first-step', name: '第一歩', icon: '◈', description: '初めてのモジュール完了', condition: s => (s.completedModules || []).length >= 1 },
    { id: 'five-modules', name: '学びの道', icon: '→', description: '5つのモジュール完了', condition: s => (s.completedModules || []).length >= 5 },
    { id: 'ten-modules', name: '探求者', icon: '◎', description: '10のモジュール完了', condition: s => (s.completedModules || []).length >= 10 },
    { id: 'baroque-master', name: 'バロック通', icon: '♩', description: 'バロック問題10問正解', condition: s => countEraQuizCorrect(s, 'baroque') >= 10 },
    { id: 'classical-master', name: '古典派通', icon: '♪', description: '古典派問題10問正解', condition: s => countEraQuizCorrect(s, 'classical') >= 10 },
    { id: 'romantic-master', name: 'ロマン派通', icon: '♫', description: 'ロマン派問題10問正解', condition: s => countEraQuizCorrect(s, 'romantic') >= 10 },
    { id: 'quiz-streak-5', name: 'クイズ5連続正解', icon: '✦', description: 'クイズ5問連続正解', condition: s => (s.quizStreak || 0) >= 5 },
    { id: 'quiz-streak-10', name: 'クイズ10連続正解', icon: '★', description: 'クイズ10問連続正解', condition: s => (s.quizStreak || 0) >= 10 },
    { id: 'all-eras', name: '全時代制覇', icon: '◆', description: '全7時代のページを閲覧', condition: s => hasAllEras(s.completedModules || []) },
    { id: '1-hour', name: '1時間学習', icon: '⊙', description: '累計1時間の学習', condition: s => (s.totalStudySeconds || 0) >= 3600 },
    { id: '5-hours', name: '5時間学習', icon: '⊛', description: '累計5時間の学習', condition: s => (s.totalStudySeconds || 0) >= 18000 },
    { id: '10-hours', name: '10時間学習', icon: '✧', description: '累計10時間の学習', condition: s => (s.totalStudySeconds || 0) >= 36000 },
    { id: 'streak-3', name: '3日連続学習', icon: '◈', description: '3日連続で学習', condition: s => (s.streak || 0) >= 3 },
    { id: 'streak-7', name: '7日連続学習', icon: '◈', description: '7日連続で学習', condition: s => (s.streak || 0) >= 7 },
  ];

  const ERA_IDS = ['ancient', 'renaissance', 'baroque', 'classical', 'romantic', 'modern', 'contemporary'];

  function countEraQuizCorrect(progress, era) {
    const scores = progress.quizScores || {};
    const questions = window.VA_DATA?.quizQuestions || [];
    let count = 0;
    for (const q of questions) {
      if (q.era === era && scores[q.id]?.correct) count++;
    }
    return count;
  }

  function hasAllEras(completedModules) {
    return ERA_IDS.every(era => completedModules.some(m => m.startsWith('era-' + era)));
  }

  function render() {
    VeliqUI.setTitle('学習進捗');
    const stopTimer = VeliqUI.startStudyTimer();
    const progress = VeliqState.get('progress') || {};
    const earnedBadges = progress.badges || [];

    const html = `
      <div class="progress-page anim-fade-in">
        <section class="hero">
          <h1 class="hero-title">学習進捗</h1>
          <p class="hero-subtitle">あなたの学習の歩みを確認しましょう</p>
        </section>

        <!-- 統計 -->
        <section class="section">
          <div class="card-grid" style="grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));">
            <div class="card card--compact stat-card">
              <div class="stat-value">${VeliqUI.formatStudyTime(progress.totalStudySeconds || 0)}</div>
              <div class="stat-label">総学習時間</div>
            </div>
            <div class="card card--compact stat-card">
              <div class="stat-value">${(progress.completedModules || []).length}</div>
              <div class="stat-label">完了モジュール</div>
            </div>
            <div class="card card--compact stat-card">
              <div class="stat-value">${progress.streak || 0}日</div>
              <div class="stat-label">連続学習</div>
            </div>
            <div class="card card--compact stat-card">
              <div class="stat-value">${earnedBadges.length} / ${BADGES.length}</div>
              <div class="stat-label">獲得バッジ</div>
            </div>
          </div>
        </section>

        <!-- クイズ成績 -->
        <section class="section">
          <h2 class="section-title">クイズ成績</h2>
          ${renderQuizStats(progress)}
        </section>

        <!-- 時代別進捗 -->
        <section class="section">
          <h2 class="section-title">時代別学習進捗</h2>
          <div style="display:flex; flex-direction:column; gap:var(--space-4); margin-top:var(--space-4);">
            ${ERA_IDS.map(era => {
              const completed = (progress.completedModules || []).filter(m => m.startsWith('era-' + era)).length > 0;
              const quizCorrect = countEraQuizCorrect(progress, era);
              return `
                <div class="card card--compact" style="border-left:3px solid ${VeliqUI.eraColor(era)};">
                  <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div>
                      <span style="color:var(--color-text-primary); font-weight:var(--font-weight-medium);">${VeliqUI.eraName(era)}</span>
                      ${completed ? VeliqUI.badge('閲覧済', 'success') : ''}
                    </div>
                    <span style="font-size:var(--font-size-xs); color:var(--color-text-muted);">クイズ正解: ${quizCorrect}問</span>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </section>

        <!-- バッジコレクション -->
        <section class="section">
          <h2 class="section-title">バッジコレクション</h2>
          <div class="card-grid" style="grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); margin-top:var(--space-4);">
            ${BADGES.map(b => {
              const earned = earnedBadges.includes(b.id);
              return `
                <div class="card card--compact" style="text-align:center; ${earned ? '' : 'opacity:0.3; filter:grayscale(1);'}">
                  <div style="font-size:2rem; margin-bottom:var(--space-2); ${earned ? '' : ''}">${b.icon}</div>
                  <h4 style="color:${earned ? 'var(--color-gold-primary)' : 'var(--color-text-muted)'}; font-size:var(--font-size-sm);">
                    ${VeliqUI.escape(b.name)}
                  </h4>
                  <p style="font-size:var(--font-size-xs); color:var(--color-text-muted); margin-top:var(--space-1);">
                    ${VeliqUI.escape(b.description)}
                  </p>
                </div>
              `;
            }).join('')}
          </div>
        </section>

        <!-- データリセット -->
        <section class="section" style="text-align:center;">
          <button class="btn-ghost" id="reset-progress" style="color:var(--color-error);">
            学習データをリセット
          </button>
        </section>
      </div>
    `;

    VeliqUI.render(html);

    document.getElementById('reset-progress')?.addEventListener('click', () => {
      const modal = VeliqUI.modal({
        title: 'データリセット確認',
        content: `
          <p style="color:var(--color-text-secondary); margin-bottom:var(--space-6);">
            すべての学習データ（進捗・バッジ・クイズスコア）がリセットされます。この操作は取り消せません。
          </p>
          <div style="display:flex; gap:var(--space-4); justify-content:flex-end;">
            <button class="btn-ghost" id="cancel-reset">キャンセル</button>
            <button class="btn-gold" id="confirm-reset" style="background:var(--color-error);">リセット</button>
          </div>
        `
      });
      modal.querySelector('#cancel-reset')?.addEventListener('click', () => modal.remove());
      modal.querySelector('#confirm-reset')?.addEventListener('click', () => {
        VeliqState.reset();
        modal.remove();
        VeliqUI.toast('学習データをリセットしました', 'info');
        render();
      });
    });

    return stopTimer;
  }

  function renderQuizStats(progress) {
    const scores = progress.quizScores || {};
    const total = Object.keys(scores).length;
    if (total === 0) {
      return '<p style="color:var(--color-text-muted); margin-top:var(--space-4);">まだクイズに挑戦していません。</p>';
    }
    const correct = Object.values(scores).filter(s => s.correct).length;
    const pct = Math.round((correct / total) * 100);
    return `
      <div class="card-grid" style="grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); margin-top:var(--space-4);">
        <div class="card card--compact stat-card">
          <div class="stat-value">${total}</div>
          <div class="stat-label">回答数</div>
        </div>
        <div class="card card--compact stat-card">
          <div class="stat-value">${correct}</div>
          <div class="stat-label">正解数</div>
        </div>
        <div class="card card--compact stat-card">
          <div class="stat-value">${pct}%</div>
          <div class="stat-label">正答率</div>
        </div>
        <div class="card card--compact stat-card">
          <div class="stat-value">${progress.quizStreak || 0}</div>
          <div class="stat-label">最大連続正解</div>
        </div>
      </div>
    `;
  }

  function checkBadges() {
    const progress = VeliqState.get('progress') || {};
    const currentBadges = progress.badges || [];
    const newlyEarned = [];

    BADGES.forEach(badge => {
      if (!currentBadges.includes(badge.id) && badge.condition(progress)) {
        newlyEarned.push(badge.id);
      }
    });

    if (newlyEarned.length > 0) {
      VeliqState.set('progress.badges', [...currentBadges, ...newlyEarned]);
      newlyEarned.forEach(bid => {
        const badge = BADGES.find(b => b.id === bid);
        if (badge) {
          VeliqUI.toast(`${badge.icon} バッジ獲得：${badge.name}`, 'success', 4000);
        }
      });
    }

    return newlyEarned;
  }

  function updateSidebar() {
    const el = document.getElementById('progress-user-summary');
    if (!el) return;
    const progress = VeliqState.get('progress') || {};
    const name = VeliqState.get('user.name') || 'ゲスト';

    el.innerHTML = `
      <div style="font-size:var(--font-size-sm); color:var(--color-text-primary); margin-bottom:var(--space-1);">
        ${VeliqUI.escape(name)}
      </div>
      <div style="font-size:var(--font-size-xs); color:var(--color-text-muted);">
        ${VeliqUI.formatStudyTime(progress.totalStudySeconds || 0)} / バッジ ${(progress.badges || []).length}個
      </div>
    `;
  }

  return { render, checkBadges, updateSidebar };
})();

window.ProgressModule = ProgressModule;
