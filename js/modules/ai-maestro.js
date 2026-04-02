/**
 * ai-maestro.js — AI Maestro パネル管理
 * AI アシスタントパネルの開閉・コンテキスト管理
 */
const AIMaestroModule = (() => {

  let currentContext = '';

  function _getPanel() {
    return document.getElementById('ai-maestro-panel');
  }

  function openPanel() {
    const panel = _getPanel();
    if (!panel) return;
    panel.hidden = false;
    panel.classList.add('open');
  }

  function closePanel() {
    const panel = _getPanel();
    if (!panel) return;
    panel.hidden = true;
    panel.classList.remove('open');
  }

  function setContext(ctx) {
    currentContext = ctx || '';
  }

  function getContext() {
    return currentContext;
  }

  return { openPanel, closePanel, setContext, getContext };
})();
window.AIMaestroModule = AIMaestroModule;
