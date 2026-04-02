/**
 * progress.js — 学習進捗
 * URL: #/progress
 */
const ProgressModule = (() => {

  function render() {
    VeliqUI.setTitle('学習進捗');
    const progress = VeliqState.get('progress') || {};
    const totalStudy = progress.totalStudySeconds || 0;
    const completed = (progress.completedModules || []).length;
    const badges = progress.badges || [];

    const html = `
      <div class="anim-fade-in">
        <section class="hero">
          <h1 class="hero-title">学習進捗</h1>
          <p class="hero-subtitle">あなたの学習の歩みを確認しましょう</p>
        </section>

        <div class="card-grid" style="grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));">
          <div class="card card--compact stat-card">
            <div class="stat-value">${VeliqUI.formatStudyTime(totalStudy)}</div>
            <div class="stat-label">総学習時間</div>
          </div>
          <div class="card card--compact stat-card">
            <div class="stat-value">${completed}</div>
            <div class="stat-label">完了モジュール</div>
          </div>
          <div class="card card--compact stat-card">
            <div class="stat-value">${badges.length}</div>
            <div class="stat-label">獲得バッジ</div>
          </div>
        </div>

        <div class="card card--gold" style="text-align:center; padding:var(--space-12); margin-top:var(--space-6);">
          <p style="font-size:var(--font-size-lg); color:var(--color-gold-primary);">詳細ビュー Coming Soon</p>
          <p style="color:var(--color-text-muted); margin-top:var(--space-2);">詳細な進捗レポートは現在開発中です</p>
        </div>
      </div>
    `;
    VeliqUI.render(html);
  }

  function checkBadges() {
    const progress = VeliqState.get('progress') || {};
    const badges = progress.badges || [];
    const earned = [];

    // First login badge
    if (!badges.includes('first-login')) {
      earned.push('first-login');
    }

    // Study streak badge
    if ((progress.streak || 0) >= 7 && !badges.includes('week-streak')) {
      earned.push('week-streak');
    }

    // Completed first module badge
    if ((progress.completedModules || []).length >= 1 && !badges.includes('first-module')) {
      earned.push('first-module');
    }

    // Study time milestones
    const hours = (progress.totalStudySeconds || 0) / 3600;
    if (hours >= 1 && !badges.includes('one-hour')) {
      earned.push('one-hour');
    }
    if (hours >= 10 && !badges.includes('ten-hours')) {
      earned.push('ten-hours');
    }

    if (earned.length > 0) {
      VeliqState.set('progress.badges', [...badges, ...earned]);
    }

    return earned;
  }

  function updateSidebar() {
    const container = document.getElementById('sidebar-progress');
    if (!container) return;

    const progress = VeliqState.get('progress') || {};
    const totalStudy = progress.totalStudySeconds || 0;
    const completed = (progress.completedModules || []).length;

    container.innerHTML = `
      <div class="sidebar-progress-summary" style="padding:var(--space-2) 0;">
        <div style="font-size:var(--font-size-sm); color:var(--color-text-muted);">
          学習時間: ${VeliqUI.formatStudyTime(totalStudy)}
        </div>
        <div style="font-size:var(--font-size-sm); color:var(--color-text-muted);">
          完了: ${completed} モジュール
        </div>
      </div>
    `;
  }

  return { render, checkBadges, updateSidebar };
})();
window.ProgressModule = ProgressModule;
