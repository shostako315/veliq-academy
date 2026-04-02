/**
 * ai-maestro.js — Claude API統合
 * AI Maestroパネルの開閉・チャット・コンテキスト管理
 */
const AIMaestroModule = (() => {

  const AI_CONFIG = {
    model: 'claude-sonnet-4-20250514',
    maxTokens: 1500,
    apiEndpoint: 'https://api.anthropic.com/v1/messages',
  };

  const SYSTEM_PROMPT = `あなたはVeliq Academyの音楽史AIチューター「AI Maestro」です。

## あなたの役割
- クラシック音楽の歴史・作品・作曲家について、深く、かつわかりやすく解説する
- ターゲットは日本のビジネスエグゼクティブ（音楽専門家ではないが知的好奇心旺盛な層）
- 難解な音楽用語は必ず平易な言葉に言い換えるか説明を添える
- ビジネス・歴史・哲学との接点を積極的に見出す

## 会話スタイル
- 敬語（丁寧語）で話すが、堅苦しくなく、教養ある友人のような口調
- 一問一答ではなく、問いを重ねてユーザー自身の発見を促す場合がある
- 必要に応じて「もし今夜のディナーでこの話をするなら...」という実践的フレーズを提案する

## 現在のコンテキスト
{{CONTEXT}}

## 制約
- 音楽史・音楽理論以外の話題には応答しない
- 演奏録音の著作権に関わる直接的な提供はしない
- 回答は原則として800文字以内`;

  let currentContext = '';
  let isLoading = false;

  function openPanel() {
    const panel = document.getElementById('ai-maestro-panel');
    if (!panel) return;
    panel.hidden = false;
    requestAnimationFrame(() => panel.classList.add('open'));
    VeliqState.set('ui.aiPanelOpen', true);
    updateContextDisplay();
    updateQuickActions();
    initPanelEvents();
  }

  function closePanel() {
    const panel = document.getElementById('ai-maestro-panel');
    if (!panel) return;
    panel.classList.remove('open');
    setTimeout(() => { panel.hidden = true; }, 300);
    VeliqState.set('ui.aiPanelOpen', false);
  }

  function setContext(ctx) {
    currentContext = ctx || '';
    updateContextDisplay();
    updateQuickActions();
  }

  function getContext() {
    return currentContext;
  }

  function updateContextDisplay() {
    const el = document.getElementById('ai-context-info');
    if (el) {
      el.textContent = currentContext || 'ダッシュボードを閲覧中';
    }
  }

  function buildSystemPrompt() {
    const route = VeliqState.get('ui.currentRoute') || '';
    let context = currentContext || `ユーザーは現在「${route}」ページを閲覧中です。`;
    return SYSTEM_PROMPT.replace('{{CONTEXT}}', context);
  }

  function initPanelEvents() {
    const sendBtn = document.getElementById('ai-send');
    const input = document.getElementById('ai-input');

    if (sendBtn && !sendBtn._bound) {
      sendBtn.addEventListener('click', handleSend);
      sendBtn._bound = true;
    }

    if (input && !input._bound) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          handleSend();
        }
      });
      input._bound = true;
    }
  }

  async function handleSend() {
    const input = document.getElementById('ai-input');
    if (!input || isLoading) return;

    const message = input.value.trim();
    if (!message) return;

    input.value = '';
    await sendMessage(message);
  }

  async function sendMessage(userMessage) {
    const apiKey = VeliqState.get('aiMaestro.apiKey');

    appendMessage('user', userMessage);

    if (!apiKey) {
      appendMessage('assistant', 'AI Maestroを利用するには、Anthropic APIキーが必要です。\n\n設定方法：ダッシュボードの設定から、APIキーを入力してください。\n\nAPIキーは https://console.anthropic.com で取得できます。');
      showApiKeyPrompt();
      return;
    }

    isLoading = true;
    showTypingIndicator();

    try {
      const history = VeliqState.get('aiMaestro.history') || [];
      const messages = [
        ...history.slice(-10).map(({ role, content }) => ({ role, content })),
        { role: 'user', content: userMessage }
      ];

      const response = await fetch(AI_CONFIG.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: AI_CONFIG.model,
          max_tokens: AI_CONFIG.maxTokens,
          system: buildSystemPrompt(),
          messages,
        })
      });

      hideTypingIndicator();

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        const errMsg = err.error?.message || `APIエラー (${response.status})`;
        appendMessage('assistant', `エラーが発生しました: ${errMsg}`);
        isLoading = false;
        return;
      }

      const data = await response.json();
      const assistantMessage = data.content[0].text;

      VeliqState.update('aiMaestro.history', h => [
        ...(h || []),
        { role: 'user', content: userMessage, ts: Date.now() },
        { role: 'assistant', content: assistantMessage, ts: Date.now() }
      ]);

      appendMessage('assistant', assistantMessage);

    } catch (error) {
      hideTypingIndicator();
      console.error('AI Maestro error:', error);
      appendMessage('assistant', 'ネットワークエラーが発生しました。インターネット接続を確認してください。');
    }

    isLoading = false;
  }

  function appendMessage(role, content) {
    const container = document.getElementById('ai-messages');
    if (!container) return;

    const el = document.createElement('div');
    el.className = `ai-message ai-message--${role}`;

    if (role === 'assistant' && typeof marked !== 'undefined' && marked.parse) {
      el.innerHTML = VeliqUI.sanitize(marked.parse(content));
    } else {
      el.textContent = content;
    }

    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
  }

  function showTypingIndicator() {
    const container = document.getElementById('ai-messages');
    if (!container) return;
    const existing = container.querySelector('.typing-indicator');
    if (existing) return;

    const el = document.createElement('div');
    el.className = 'typing-indicator ai-message ai-message--assistant';
    el.innerHTML = '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>';
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
  }

  function hideTypingIndicator() {
    const container = document.getElementById('ai-messages');
    if (!container) return;
    const indicator = container.querySelector('.typing-indicator');
    if (indicator) indicator.remove();
  }

  function showApiKeyPrompt() {
    const container = document.getElementById('ai-messages');
    if (!container) return;

    const el = document.createElement('div');
    el.className = 'ai-message ai-message--assistant';
    el.innerHTML = `
      <div style="margin-top:var(--space-3);">
        <input type="password" id="ai-api-key-input" class="form-input" placeholder="sk-ant-api..." style="margin-bottom:var(--space-2);">
        <button id="ai-save-key" class="btn-gold btn-sm" style="width:100%;">APIキーを保存</button>
      </div>
    `;
    container.appendChild(el);

    el.querySelector('#ai-save-key')?.addEventListener('click', () => {
      const key = el.querySelector('#ai-api-key-input')?.value?.trim();
      if (key && key.startsWith('sk-')) {
        VeliqState.set('aiMaestro.apiKey', key);
        el.remove();
        appendMessage('assistant', 'APIキーを保存しました。何でもお聞きください！');
      } else {
        VeliqUI.toast('有効なAPIキーを入力してください', 'error');
      }
    });

    container.scrollTop = container.scrollHeight;
  }

  function updateQuickActions() {
    const container = document.getElementById('ai-quick-actions');
    if (!container) return;

    const route = VeliqState.get('ui.currentRoute') || '';
    let actions = [];

    if (route.includes('composers/')) {
      actions = [
        'この作曲家の代表作を教えて',
        '同時代の重要作曲家は？',
        'ビジネスとの接点を教えて',
      ];
    } else if (route.includes('works/')) {
      actions = [
        'この曲の聴きどころは？',
        '作曲の背景は？',
        '会食でこの曲を語るには？',
      ];
    } else if (route.includes('eras/')) {
      actions = [
        'この時代の特徴を3点で',
        '次の時代への変遷は？',
        'ビジネスへの教訓は？',
      ];
    } else {
      actions = [
        'クラシック音楽入門おすすめは？',
        '今夜のディナーで使える話題を教えて',
        'コンサートの楽しみ方を教えて',
      ];
    }

    container.innerHTML = actions.map(a =>
      `<button class="ai-quick-btn">${VeliqUI.escape(a)}</button>`
    ).join('');

    container.querySelectorAll('.ai-quick-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = document.getElementById('ai-input');
        if (input) {
          input.value = btn.textContent;
          handleSend();
        }
      });
    });
  }

  async function generateConcertBrief(programText) {
    const prompt = `以下のコンサートプログラムについて、初めてクラシックコンサートに行くビジネスパーソン向けの「コンサート前ブリーフィング」を作成してください。

プログラム：
${programText}

以下の構成でお願いします：
1. 今日聴く曲の概要（各曲2〜3行）
2. 注目すべき「聴きどころ」（曲ごとに2〜3ポイント）
3. 指揮者・演奏者のプロフィール（知っていれば）
4. コンサートマナーのワンポイント
5. 終演後の会話で使えるフレーズ例`;

    openPanel();
    return sendMessage(prompt);
  }

  return { openPanel, closePanel, setContext, getContext, generateConcertBrief };
})();

window.AIMaestroModule = AIMaestroModule;
