/**
 * ui.js — 共通UIユーティリティ
 */
const VeliqUI = (() => {

  /**
   * ページコンテンツエリアにHTMLを描画
   * @param {string} html
   */
  function render(html) {
    const el = document.getElementById('page-content');
    if (el) {
      el.innerHTML = sanitize(html);
      el.classList.add('page-enter');
      setTimeout(() => el.classList.remove('page-enter'), 300);
    }
  }

  /**
   * XSS対策：HTMLエスケープ（テキストコンテンツ用）
   * @param {string} str
   * @returns {string}
   */
  function escape(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  /**
   * 許可タグのみ通すサニタイザー（マークダウンレンダリング用）
   * @param {string} html
   * @returns {string}
   */
  function sanitize(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    doc.querySelectorAll('script,style,iframe,object,embed,form').forEach(el => el.remove());
    doc.querySelectorAll('*').forEach(el => {
      [...el.attributes].forEach(attr => {
        if (attr.name.startsWith('on')) {
          el.removeAttribute(attr.name);
        } else if (attr.name === 'href') {
          const v = attr.value;
          if (!v.startsWith('http') && !v.startsWith('#') && !v.startsWith('/')) {
            el.removeAttribute(attr.name);
          }
        } else if (attr.name === 'src') {
          const v = attr.value;
          if (!v.startsWith('http') && !v.startsWith('data:image') && !v.startsWith('assets/')) {
            el.removeAttribute(attr.name);
          }
        }
      });
    });
    return doc.body.innerHTML;
  }

  /**
   * ローディングスケルトン生成
   * @param {number} lines
   * @returns {string}
   */
  function skeleton(lines = 4) {
    return `<div class="skeleton-wrapper">
      ${Array.from({ length: lines }, (_, i) =>
        `<div class="skeleton-line" style="width:${80 - i * 8}%"></div>`
      ).join('')}
    </div>`;
  }

  /**
   * カードコンポーネント
   * @param {Object} options
   * @returns {string}
   */
  function card({ title = '', subtitle = '', body = '', footer = '', tag = '', href = '', cssClass = '' } = {}) {
    const clickable = href ? 'card--clickable' : '';
    const link = href ? `data-href="${escape(href)}"` : '';
    return `<div class="card ${clickable} ${cssClass}" ${link}>
      ${tag ? `<span class="card-tag">${escape(tag)}</span>` : ''}
      ${title ? `<h3 class="card-title">${escape(title)}</h3>` : ''}
      ${subtitle ? `<p class="card-subtitle">${escape(subtitle)}</p>` : ''}
      ${body ? `<div class="card-body">${body}</div>` : ''}
      ${footer ? `<div class="card-footer">${footer}</div>` : ''}
    </div>`;
  }

  /**
   * バッジコンポーネント
   * @param {string} text
   * @param {string} variant
   * @returns {string}
   */
  function badge(text, variant = 'default') {
    return `<span class="badge badge--${escape(variant)}">${escape(text)}</span>`;
  }

  /**
   * トースト通知
   * @param {string} message
   * @param {'success'|'error'|'info'|'warning'} type
   * @param {number} duration ms
   */
  function toast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.textContent = message;
    container.appendChild(el);
    requestAnimationFrame(() => el.classList.add('toast--visible'));
    setTimeout(() => {
      el.classList.remove('toast--visible');
      setTimeout(() => el.remove(), 300);
    }, duration);
  }

  /**
   * モーダル表示
   * @param {Object} options
   * @returns {HTMLElement}
   */
  function modal({ title = '', content = '', onClose = null } = {}) {
    const existing = document.getElementById('va-modal');
    if (existing) existing.remove();
    const el = document.createElement('div');
    el.id = 'va-modal';
    el.className = 'modal-overlay';
    el.innerHTML = `
      <div class="modal-box" role="dialog" aria-modal="true">
        <div class="modal-header">
          <h2 class="modal-title">${escape(title)}</h2>
          <button class="modal-close btn-icon" aria-label="閉じる">×</button>
        </div>
        <div class="modal-body">${content}</div>
      </div>
    `;
    document.body.appendChild(el);
    el.querySelector('.modal-close').addEventListener('click', () => {
      el.remove();
      if (onClose) onClose();
    });
    el.addEventListener('click', e => {
      if (e.target === el) { el.remove(); if (onClose) onClose(); }
    });
    return el;
  }

  /**
   * 進捗バー
   * @param {number} value
   * @param {number} max
   * @param {string} label
   * @returns {string}
   */
  function progressBar(value, max, label = '') {
    const pct = max > 0 ? Math.round((value / max) * 100) : 0;
    return `<div class="progress-bar-wrap" title="${escape(label)}">
      <div class="progress-bar-track">
        <div class="progress-bar-fill" style="width:${pct}%"></div>
      </div>
      <span class="progress-bar-label">${pct}%</span>
    </div>`;
  }

  /**
   * 時代カラー取得
   * @param {string} eraId
   * @returns {string}
   */
  function eraColor(eraId) {
    const map = {
      ancient:      'var(--color-era-ancient)',
      renaissance:  'var(--color-era-renaissance)',
      baroque:      'var(--color-era-baroque)',
      classical:    'var(--color-era-classical)',
      romantic:     'var(--color-era-romantic)',
      modern:       'var(--color-era-modern)',
      contemporary: 'var(--color-era-contemporary)',
    };
    return map[eraId] || 'var(--color-gold-primary)';
  }

  /**
   * 時代名取得
   * @param {string} eraId
   * @returns {string}
   */
  function eraName(eraId) {
    const map = {
      ancient: '古代',
      renaissance: 'ルネサンス',
      baroque: 'バロック',
      classical: '古典派',
      romantic: 'ロマン派',
      modern: '近代',
      contemporary: '現代',
    };
    return map[eraId] || eraId;
  }

  /**
   * ページタイトル設定
   * @param {string} title
   */
  function setTitle(title) {
    document.title = `${title} — Veliq Academy`;
    const headerTitle = document.getElementById('header-title');
    if (headerTitle) headerTitle.textContent = title;
  }

  /**
   * データロード（JSONファイル）
   * @param {string} filename data/以下のファイル名
   * @returns {Promise<any>}
   */
  async function loadData(filename) {
    const response = await fetch(`data/${filename}`);
    if (!response.ok) throw new Error(`Failed to load ${filename}`);
    return response.json();
  }

  /**
   * 学習時間記録（ページ離脱時に呼ぶ）
   * @returns {Function} ストップ関数
   */
  function startStudyTimer() {
    const startTime = Date.now();
    return () => {
      const seconds = Math.floor((Date.now() - startTime) / 1000);
      if (seconds > 5) {
        VeliqState.update('progress.totalStudySeconds', s => (s || 0) + seconds);
        VeliqState.set('progress.lastStudyAt', Date.now());
      }
    };
  }

  /**
   * 時間フォーマット
   * @param {number} totalSeconds
   * @returns {string}
   */
  function formatStudyTime(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    if (hours > 0) return `${hours}時間${minutes}分`;
    return `${minutes}分`;
  }

  /**
   * クリッカブルカードのイベント委譲
   * @param {HTMLElement} container
   */
  function initCardLinks(container) {
    if (!container) return;
    container.addEventListener('click', e => {
      const card = e.target.closest('[data-href]');
      if (card) {
        const href = card.getAttribute('data-href');
        if (href) window.location.hash = href;
      }
    });
  }

  /**
   * マークダウンレンダリング（marked.js使用）
   * @param {string} md
   * @returns {string}
   */
  function renderMarkdown(md) {
    if (!md) return '';
    if (typeof marked !== 'undefined' && marked.parse) {
      return sanitize(marked.parse(md));
    }
    return `<p>${escape(md)}</p>`;
  }

  return {
    render, escape, sanitize, skeleton, card, badge,
    toast, modal, progressBar, eraColor, eraName, setTitle,
    loadData, startStudyTimer, formatStudyTime, initCardLinks, renderMarkdown
  };
})();

window.VeliqUI = VeliqUI;
