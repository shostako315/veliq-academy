/**
 * router.js — ハッシュベースSPAルーター
 */
const VeliqRouter = (() => {

  /** @type {Map<string, Function>} */
  const routes = new Map();

  /** @type {Function|null} */
  let notFoundHandler = null;

  /** @type {Function|null} */
  let currentCleanup = null;

  /**
   * ルート登録
   * @param {string} pattern - '/composers/:id' 形式
   * @param {Function} handler - (params) => void
   */
  function register(pattern, handler) {
    routes.set(pattern, handler);
  }

  function navigate(path) {
    window.location.hash = path;
  }

  function getCurrentPath() {
    return window.location.hash.replace(/^#/, '') || '/dashboard';
  }

  function matchRoute(path) {
    for (const [pattern, handler] of routes) {
      const result = matchPattern(pattern, path);
      if (result) return { handler, params: result };
    }
    return null;
  }

  function matchPattern(pattern, path) {
    const patternParts = pattern.split('/').filter(Boolean);
    const pathParts = path.split('/').filter(Boolean);
    if (patternParts.length !== pathParts.length) return null;
    const params = {};
    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i].startsWith(':')) {
        params[patternParts[i].slice(1)] = decodeURIComponent(pathParts[i]);
      } else if (patternParts[i] !== pathParts[i]) {
        return null;
      }
    }
    return params;
  }

  function dispatch() {
    if (currentCleanup) {
      currentCleanup();
      currentCleanup = null;
    }

    const path = getCurrentPath();
    const match = matchRoute(path);

    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.remove('active');
    });
    const routeBase = path.split('/')[1];
    const activeNavItem = document.querySelector(`.nav-item[data-route="${routeBase}"]`);
    if (activeNavItem) activeNavItem.classList.add('active');

    const content = document.getElementById('page-content');
    if (content) content.scrollTop = 0;

    VeliqState.set('ui.currentRoute', path);

    if (match) {
      const result = match.handler(match.params);
      if (typeof result === 'function') {
        currentCleanup = result;
      }
    } else if (notFoundHandler) {
      notFoundHandler(path);
    }
  }

  function onNotFound(handler) {
    notFoundHandler = handler;
  }

  function init() {
    window.addEventListener('hashchange', dispatch);
    dispatch();
  }

  return { register, navigate, init, onNotFound, getCurrentPath };
})();

window.VeliqRouter = VeliqRouter;
