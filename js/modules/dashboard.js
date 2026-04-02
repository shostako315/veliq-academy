/**
 * dashboard.js — ダッシュボード
 * URL: #/dashboard
 */
const DashboardModule = (() => {

  function render() {
    VeliqUI.setTitle('ダッシュボード');
    const stopTimer = VeliqUI.startStudyTimer();
    const userName = VeliqState.get('user.name') || 'ゲスト';
    const progress = VeliqState.get('progress');
    const composers = window.VA_DATA?.composers || [];
    const todayComposer = getTodayComposer(composers);
    const recentlyViewed = VeliqState.get('history.recentlyViewed') || [];

    const html = `
      <div class="dashboard anim-fade-in">

        <!-- ウェルカムヒーロー -->
        <section class="dashboard-hero card card--hero">
          <h1 class="hero-title">ようこそ、${VeliqUI.escape(userName)}さん</h1>
          <p class="hero-subtitle">${getDailyGreeting()}</p>
        </section>

        <!-- 学習統計 -->
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
              <div class="stat-value">${(progress.badges || []).length}</div>
              <div class="stat-label">獲得バッジ</div>
            </div>
          </div>
        </section>

        <!-- 今日の作曲家 -->
        ${todayComposer ? renderTodayComposer(todayComposer) : ''}

        <!-- 続きを読む -->
        ${recentlyViewed.length > 0 ? renderRecentlyViewed(recentlyViewed) : ''}

        <!-- おすすめコンテンツ -->
        <section class="section">
          <div class="section-header">
            <div>
              <h2 class="section-title">おすすめコンテンツ</h2>
              <p class="section-subtitle">あなたのレベルに合わせた学習コンテンツ</p>
            </div>
          </div>
          <div class="card-grid stagger-children">
            ${renderRecommendations()}
          </div>
        </section>

        <!-- Veliq Events -->
        ${renderEventsSection()}
      </div>
    `;

    VeliqUI.render(html);
    const pageContent = document.getElementById('page-content');
    VeliqUI.initCardLinks(pageContent);

    return stopTimer;
  }

  /**
   * 今日の作曲家を決定論的に選択
   * @param {Array} composers
   * @returns {Object|null}
   */
  function getTodayComposer(composers) {
    if (!composers || composers.length === 0) return null;
    const dayIndex = Math.floor(Date.now() / 86400000) % composers.length;
    return composers[dayIndex];
  }

  function renderTodayComposer(composer) {
    return `
      <section class="section">
        <div class="section-header">
          <div>
            <h2 class="section-title">今日の作曲家</h2>
            <p class="section-subtitle">毎日一人ずつ、偉大な作曲家を知る</p>
          </div>
        </div>
        <div class="card card--gold card--clickable" data-href="#/composers/${VeliqUI.escape(composer.id)}">
          <span class="card-tag">${VeliqUI.badge(VeliqUI.eraName(composer.era), 'era-' + composer.era)}</span>
          <h3 class="card-title" style="font-size:var(--font-size-2xl); margin-top:var(--space-3);">
            ${VeliqUI.escape(composer.name)}
          </h3>
          <p style="color:var(--color-text-muted); font-size:var(--font-size-sm); margin-bottom:var(--space-3);">
            ${VeliqUI.escape(composer.nameEn)} (${composer.born}–${composer.died || ''})
          </p>
          <p class="card-subtitle">${VeliqUI.escape(composer.shortBio)}</p>
          ${composer.businessQuote ? `
            <div class="business-insight" style="margin-top:var(--space-4);">
              <div class="business-insight-label">◆ ビジネスインサイト</div>
              <p class="business-insight-text">${VeliqUI.escape(composer.businessQuote)}</p>
            </div>
          ` : ''}
        </div>
      </section>
    `;
  }

  function renderRecentlyViewed(items) {
    const recent = items.slice(0, 3);
    return `
      <section class="section">
        <div class="section-header">
          <h2 class="section-title">続きを読む</h2>
        </div>
        <div class="card-grid stagger-children">
          ${recent.map(item => {
            const label = item.type === 'composer' ? '作曲家' : item.type === 'work' ? '作品' : item.type === 'era' ? '時代' : 'コンテンツ';
            const route = item.type === 'composer' ? `#/composers/${item.id}` :
                          item.type === 'work' ? `#/works/${item.id}` :
                          item.type === 'era' ? `#/eras/${item.id}` : '#/dashboard';
            return `
              <div class="card card--compact card--clickable" data-href="${VeliqUI.escape(route)}">
                <span class="card-tag">${VeliqUI.escape(label)}</span>
                <h3 class="card-title" style="font-size:var(--font-size-base);">${VeliqUI.escape(item.title || item.id)}</h3>
              </div>
            `;
          }).join('')}
        </div>
      </section>
    `;
  }

  function renderRecommendations() {
    const level = VeliqState.get('user.level') || 'beginner';
    const recommendations = [
      {
        title: '時代を知る：バロック',
        subtitle: '対位法と通奏低音の黄金時代を学ぶ',
        tag: 'バロック',
        href: '#/eras/baroque'
      },
      {
        title: 'ベートーヴェン入門',
        subtitle: '交響曲の革命児の生涯と代表作',
        tag: '作曲家',
        href: '#/composers/beethoven'
      },
      {
        title: 'クイズに挑戦',
        subtitle: '知識を試して理解を深める',
        tag: 'クイズ',
        href: '#/quiz'
      },
    ];

    if (level === 'intermediate' || level === 'advanced') {
      recommendations.push({
        title: 'ロマン派の世界',
        subtitle: '感情表現の革命を体験する',
        tag: 'ロマン派',
        href: '#/eras/romantic'
      });
    }

    if (level === 'advanced') {
      recommendations.push({
        title: '近代音楽の冒険',
        subtitle: '調性の崩壊と新しい音の世界',
        tag: '近代',
        href: '#/eras/modern'
      });
    }

    return recommendations.map(r => `
      <div class="card card--clickable" data-href="${VeliqUI.escape(r.href)}">
        <span class="card-tag">${VeliqUI.escape(r.tag)}</span>
        <h3 class="card-title">${VeliqUI.escape(r.title)}</h3>
        <p class="card-subtitle">${VeliqUI.escape(r.subtitle)}</p>
      </div>
    `).join('');
  }

  function renderEventsSection() {
    const events = window.VA_DATA?.veliqEvents || [];
    if (events.length === 0) return '';

    const upcoming = events
      .filter(e => new Date(e.date) >= new Date())
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    if (upcoming.length === 0) return '';
    const event = upcoming[0];

    return `
      <section class="section">
        <div class="section-header">
          <h2 class="section-title">Veliq Events</h2>
        </div>
        <div class="card card--gold">
          <span class="card-tag">次回公演</span>
          <h3 class="card-title">${VeliqUI.escape(event.title)}</h3>
          <p class="card-subtitle">${VeliqUI.escape(event.subtitle || '')}</p>
          <div class="card-footer">
            <span>${VeliqUI.escape(event.date)} / ${VeliqUI.escape(event.venue || '')}</span>
            ${event.ticketUrl ? `<a href="${VeliqUI.escape(event.ticketUrl)}" target="_blank" rel="noopener" class="btn-outline btn-sm" style="text-decoration:none;">詳細を見る</a>` : ''}
          </div>
        </div>
      </section>
    `;
  }

  function getDailyGreeting() {
    const greetings = [
      '音楽は時間の芸術。今日も新しい発見を。',
      '偉大な作曲家たちの世界へようこそ。',
      '知識は最高の教養。今日の学びを楽しんでください。',
      '音楽を知ることは、人間を知ること。',
      'クラシック音楽の旅を続けましょう。',
      '音の向こうに広がる歴史を探求しよう。',
      '今日も素晴らしい音楽体験を。',
    ];
    const dayIndex = Math.floor(Date.now() / 86400000) % greetings.length;
    return greetings[dayIndex];
  }

  /**
   * 初回セットアップウィザード
   */
  function showSetupWizard() {
    const content = `
      <div class="setup-wizard">
        <p style="color:var(--color-text-secondary); margin-bottom:var(--space-6); line-height:var(--line-height-base);">
          Veliq Academyへようこそ。あなたに合った学習体験を提供するため、いくつかお聞かせください。
        </p>

        <div class="form-group">
          <label class="form-label" for="setup-name">お名前（ニックネーム可）</label>
          <input type="text" id="setup-name" class="form-input" placeholder="例: 田中太郎" maxlength="20">
        </div>

        <div class="form-group">
          <label class="form-label">クラシック音楽の知識レベル</label>
          <div style="display:flex; flex-direction:column; gap:var(--space-2); margin-top:var(--space-2);">
            <label style="display:flex; align-items:center; gap:var(--space-3); padding:var(--space-3); background:var(--color-bg-tertiary); border-radius:var(--radius-md); cursor:pointer;">
              <input type="radio" name="setup-level" value="beginner" checked style="accent-color:var(--color-gold-primary);">
              <div>
                <div style="color:var(--color-text-primary); font-weight:var(--font-weight-medium);">初心者</div>
                <div style="color:var(--color-text-muted); font-size:var(--font-size-xs);">クラシック音楽をこれから知りたい</div>
              </div>
            </label>
            <label style="display:flex; align-items:center; gap:var(--space-3); padding:var(--space-3); background:var(--color-bg-tertiary); border-radius:var(--radius-md); cursor:pointer;">
              <input type="radio" name="setup-level" value="intermediate" style="accent-color:var(--color-gold-primary);">
              <div>
                <div style="color:var(--color-text-primary); font-weight:var(--font-weight-medium);">中級者</div>
                <div style="color:var(--color-text-muted); font-size:var(--font-size-xs);">主要な作曲家や作品はある程度知っている</div>
              </div>
            </label>
            <label style="display:flex; align-items:center; gap:var(--space-3); padding:var(--space-3); background:var(--color-bg-tertiary); border-radius:var(--radius-md); cursor:pointer;">
              <input type="radio" name="setup-level" value="advanced" style="accent-color:var(--color-gold-primary);">
              <div>
                <div style="color:var(--color-text-primary); font-weight:var(--font-weight-medium);">上級者</div>
                <div style="color:var(--color-text-muted); font-size:var(--font-size-xs);">音楽史に詳しく、より深い知識を求めている</div>
              </div>
            </label>
          </div>
        </div>

        <button id="setup-submit" class="btn-gold btn-lg" style="width:100%; margin-top:var(--space-4);">
          学習を始める
        </button>
      </div>
    `;

    const modal = VeliqUI.modal({
      title: 'Veliq Academy へようこそ',
      content: content,
    });

    modal.querySelector('#setup-submit').addEventListener('click', () => {
      const name = modal.querySelector('#setup-name').value.trim() || 'ゲスト';
      const level = modal.querySelector('input[name="setup-level"]:checked')?.value || 'beginner';

      VeliqState.set('user.name', name);
      VeliqState.set('user.level', level);
      VeliqState.set('user.setupComplete', true);
      VeliqState.set('user.createdAt', Date.now());

      modal.remove();
      VeliqUI.toast('セットアップ完了！学習を始めましょう。', 'success');
      render();
    });
  }

  return { render, showSetupWizard };
})();

window.DashboardModule = DashboardModule;
