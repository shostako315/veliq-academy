/**
 * quiz.js — クイズエンジン
 * URL: #/quiz
 */
const QuizModule = (() => {

  let currentQuestions = [];
  let currentIndex = 0;
  let score = 0;
  let streak = 0;
  let answered = false;

  function render() {
    VeliqUI.setTitle('クイズ');
    const stopTimer = VeliqUI.startStudyTimer();

    const html = `
      <div class="quiz-page anim-fade-in">
        <section class="hero">
          <h1 class="hero-title">クイズ</h1>
          <p class="hero-subtitle">知識を試して理解を深めよう</p>
        </section>

        <div id="quiz-setup">
          <div class="card-grid" style="margin-bottom:var(--space-6);">
            <div class="card card--compact">
              <h4 style="color:var(--color-gold-primary); margin-bottom:var(--space-3);">時代を選ぶ</h4>
              <div class="tab-filter" id="quiz-era-filter" style="margin-bottom:0;">
                <button class="tab-filter-btn active" data-era="all">すべて</button>
                <button class="tab-filter-btn" data-era="baroque">バロック</button>
                <button class="tab-filter-btn" data-era="classical">古典派</button>
                <button class="tab-filter-btn" data-era="romantic">ロマン派</button>
                <button class="tab-filter-btn" data-era="modern">近代</button>
                <button class="tab-filter-btn" data-era="contemporary">現代</button>
              </div>
            </div>
          </div>

          <div style="text-align:center;">
            <button class="btn-gold btn-lg" id="quiz-start">クイズを始める（10問）</button>
          </div>

          <!-- 過去のスコア -->
          ${renderPastScores()}
        </div>

        <div id="quiz-area" hidden></div>
        <div id="quiz-result" hidden></div>
      </div>
    `;

    VeliqUI.render(html);

    let selectedEra = 'all';
    document.getElementById('quiz-era-filter')?.addEventListener('click', e => {
      const btn = e.target.closest('.tab-filter-btn');
      if (!btn) return;
      selectedEra = btn.dataset.era;
      document.querySelectorAll('#quiz-era-filter .tab-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });

    document.getElementById('quiz-start')?.addEventListener('click', () => {
      startQuiz(selectedEra);
    });

    return stopTimer;
  }

  function startQuiz(era) {
    const allQuestions = window.VA_DATA?.quizQuestions || [];
    let pool = era === 'all' ? allQuestions : allQuestions.filter(q => q.era === era);

    if (pool.length === 0) {
      VeliqUI.toast('この時代の問題がまだありません', 'warning');
      return;
    }

    currentQuestions = shuffle(pool).slice(0, 10);
    currentIndex = 0;
    score = 0;
    streak = 0;
    answered = false;

    document.getElementById('quiz-setup').hidden = true;
    document.getElementById('quiz-result').hidden = true;
    const area = document.getElementById('quiz-area');
    area.hidden = false;

    renderQuestion();
  }

  function renderQuestion() {
    const area = document.getElementById('quiz-area');
    if (!area) return;

    const q = currentQuestions[currentIndex];
    answered = false;

    area.innerHTML = `
      <div class="anim-fade-in">
        <!-- 進捗 -->
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--space-4);">
          <span style="font-size:var(--font-size-sm); color:var(--color-text-muted);">
            問題 ${currentIndex + 1} / ${currentQuestions.length}
          </span>
          <span style="font-size:var(--font-size-sm); color:var(--color-gold-primary);">
            正解: ${score} / ${currentIndex}
          </span>
        </div>
        ${VeliqUI.progressBar(currentIndex, currentQuestions.length)}

        <!-- 問題 -->
        <div class="card card--gold" style="margin-top:var(--space-6); margin-bottom:var(--space-6);">
          <div style="display:flex; gap:var(--space-2); margin-bottom:var(--space-3);">
            ${VeliqUI.badge(VeliqUI.eraName(q.era), 'era-' + q.era)}
            ${VeliqUI.badge('難易度 ' + q.difficulty, 'default')}
          </div>
          <h3 style="font-family:var(--font-serif); font-size:var(--font-size-xl); color:var(--color-text-primary); line-height:var(--line-height-base);">
            ${VeliqUI.escape(q.question)}
          </h3>
        </div>

        <!-- 選択肢 -->
        <div class="quiz-options" style="display:flex; flex-direction:column; gap:var(--space-3);">
          ${q.options.map(opt => `
            <button class="card card--clickable quiz-option" data-id="${VeliqUI.escape(opt.id)}" data-correct="${opt.correct}"
                    style="text-align:left; padding:var(--space-4) var(--space-6); border:2px solid var(--color-border-primary);">
              <span style="color:var(--color-gold-muted); font-weight:var(--font-weight-bold); margin-right:var(--space-3);">
                ${VeliqUI.escape(opt.id.toUpperCase())}.
              </span>
              <span style="color:var(--color-text-primary);">${VeliqUI.escape(opt.text)}</span>
            </button>
          `).join('')}
        </div>

        <!-- フィードバック -->
        <div id="quiz-feedback" hidden style="margin-top:var(--space-6);"></div>

        <!-- 次の問題ボタン -->
        <div style="text-align:center; margin-top:var(--space-6);">
          <button id="quiz-next" class="btn-gold btn-lg" hidden>
            ${currentIndex < currentQuestions.length - 1 ? '次の問題 →' : '結果を見る'}
          </button>
        </div>
      </div>
    `;

    area.querySelectorAll('.quiz-option').forEach(btn => {
      btn.addEventListener('click', () => handleAnswer(btn));
    });

    document.getElementById('quiz-next')?.addEventListener('click', () => {
      currentIndex++;
      if (currentIndex < currentQuestions.length) {
        renderQuestion();
      } else {
        showResult();
      }
    });
  }

  function handleAnswer(btn) {
    if (answered) return;
    answered = true;

    const isCorrect = btn.dataset.correct === 'true';
    const q = currentQuestions[currentIndex];

    if (isCorrect) {
      score++;
      streak++;
      btn.style.borderColor = 'var(--color-success)';
      btn.style.background = 'rgba(74,139,92,0.15)';
      btn.classList.add('anim-correct');
    } else {
      streak = 0;
      btn.style.borderColor = 'var(--color-error)';
      btn.style.background = 'rgba(139,74,74,0.15)';
      btn.classList.add('anim-incorrect');

      document.querySelectorAll('.quiz-option').forEach(opt => {
        if (opt.dataset.correct === 'true') {
          opt.style.borderColor = 'var(--color-success)';
          opt.style.background = 'rgba(74,139,92,0.1)';
        }
      });
    }

    document.querySelectorAll('.quiz-option').forEach(opt => {
      opt.style.pointerEvents = 'none';
    });

    VeliqState.update('progress.quizScores', scores => {
      const s = scores || {};
      s[q.id] = { correct: isCorrect, answeredAt: Date.now() };
      return s;
    });

    const maxStreak = Math.max(streak, VeliqState.get('progress.quizStreak') || 0);
    VeliqState.set('progress.quizStreak', maxStreak);

    const feedback = document.getElementById('quiz-feedback');
    if (feedback) {
      feedback.hidden = false;
      feedback.innerHTML = `
        <div class="card ${isCorrect ? 'anim-correct' : 'anim-incorrect'}" style="border-left:3px solid ${isCorrect ? 'var(--color-success)' : 'var(--color-error)'};">
          <h4 style="color:${isCorrect ? 'var(--color-success)' : 'var(--color-error)'}; margin-bottom:var(--space-2);">
            ${isCorrect ? '正解！' : '不正解'}
          </h4>
          <p style="font-size:var(--font-size-sm); color:var(--color-text-secondary); line-height:var(--line-height-base);">
            ${VeliqUI.escape(q.explanation || '')}
          </p>
        </div>
      `;
    }

    document.getElementById('quiz-next').hidden = false;
  }

  function showResult() {
    const area = document.getElementById('quiz-area');
    const result = document.getElementById('quiz-result');
    if (area) area.hidden = true;
    if (!result) return;
    result.hidden = false;

    const pct = Math.round((score / currentQuestions.length) * 100);
    let message = '';
    if (pct >= 90) message = '素晴らしい！音楽史の教養は申し分ありません。';
    else if (pct >= 70) message = 'よくできました！さらに深く学んでいきましょう。';
    else if (pct >= 50) message = '基礎は身についています。復習で知識を固めましょう。';
    else message = '学びの旅はまだ始まったばかり。各時代のページで復習しましょう。';

    result.innerHTML = `
      <div class="anim-scale-in" style="text-align:center;">
        <div class="card card--hero" style="margin-bottom:var(--space-6);">
          <h2 style="font-family:var(--font-serif); font-size:var(--font-size-3xl); color:var(--color-gold-primary); margin-bottom:var(--space-4);">
            クイズ結果
          </h2>
          <div class="stat-value" style="font-size:4rem;">${score} / ${currentQuestions.length}</div>
          <div style="font-size:var(--font-size-2xl); color:var(--color-text-secondary); margin:var(--space-3) 0;">${pct}%</div>
          <p style="font-size:var(--font-size-base); color:var(--color-text-secondary); line-height:var(--line-height-base);">
            ${VeliqUI.escape(message)}
          </p>
        </div>

        <div style="display:flex; gap:var(--space-4); justify-content:center; flex-wrap:wrap;">
          <button class="btn-gold btn-lg" id="quiz-retry">もう一度挑戦</button>
          <a href="#/dashboard" class="btn-outline btn-lg" style="text-decoration:none;">ダッシュボードに戻る</a>
        </div>
      </div>
    `;

    document.getElementById('quiz-retry')?.addEventListener('click', () => {
      result.hidden = true;
      document.getElementById('quiz-setup').hidden = false;
    });

    if (typeof ProgressModule !== 'undefined') {
      ProgressModule.checkBadges();
    }
  }

  function renderPastScores() {
    const scores = VeliqState.get('progress.quizScores') || {};
    const total = Object.keys(scores).length;
    if (total === 0) return '';

    const correct = Object.values(scores).filter(s => s.correct).length;
    return `
      <div class="card card--compact" style="margin-top:var(--space-6); text-align:center;">
        <h4 style="color:var(--color-text-secondary); margin-bottom:var(--space-3);">これまでの成績</h4>
        <div style="display:flex; justify-content:center; gap:var(--space-8);">
          <div>
            <div class="stat-value" style="font-size:var(--font-size-2xl);">${total}</div>
            <div class="stat-label">回答数</div>
          </div>
          <div>
            <div class="stat-value" style="font-size:var(--font-size-2xl);">${correct}</div>
            <div class="stat-label">正解数</div>
          </div>
          <div>
            <div class="stat-value" style="font-size:var(--font-size-2xl);">${total > 0 ? Math.round((correct / total) * 100) : 0}%</div>
            <div class="stat-label">正答率</div>
          </div>
        </div>
      </div>
    `;
  }

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  return { render };
})();

window.QuizModule = QuizModule;
