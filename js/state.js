/**
 * state.js — グローバル状態管理
 * localStorageと双方向同期するシングルトンストア
 */

const STORAGE_KEY = 'veliq_academy_v1';

/** @type {AppState} */
const defaultState = {
  user: {
    name: '',
    level: 'beginner',
    setupComplete: false,
    createdAt: null,
  },

  progress: {
    completedModules: [],
    completedLessons: {},
    quizScores: {},
    badges: [],
    totalStudySeconds: 0,
    lastStudyAt: null,
    streak: 0,
    quizStreak: 0,
  },

  paths: {
    active: null,
    enrolledPaths: [],
  },

  history: {
    recentlyViewed: [],
    bookmarks: [],
    notes: {},
  },

  aiMaestro: {
    history: [],
    sessionContext: null,
    apiKey: '',
  },

  ui: {
    sidebarOpen: true,
    currentRoute: 'dashboard',
    aiPanelOpen: false,
    theme: 'dark',
  }
};

const VeliqState = (() => {
  let state = {};

  function load() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      state = saved ? deepMerge(defaultState, JSON.parse(saved)) : deepCopy(defaultState);
    } catch {
      state = deepCopy(defaultState);
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error('State save failed:', e);
    }
  }

  function get(path) {
    return path.split('.').reduce((obj, key) => obj?.[key], state);
  }

  function set(path, value) {
    const keys = path.split('.');
    let obj = state;
    for (let i = 0; i < keys.length - 1; i++) {
      if (obj[keys[i]] === undefined) obj[keys[i]] = {};
      obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;
    save();
    emitChange(path, value);
  }

  function update(path, updater) {
    set(path, updater(get(path)));
  }

  const listeners = {};
  function on(path, callback) {
    if (!listeners[path]) listeners[path] = [];
    listeners[path].push(callback);
    return () => { listeners[path] = listeners[path].filter(cb => cb !== callback); };
  }

  function emitChange(path, value) {
    (listeners[path] || []).forEach(cb => cb(value));
    (listeners['*'] || []).forEach(cb => cb(path, value));
  }

  function deepCopy(obj) { return JSON.parse(JSON.stringify(obj)); }

  function deepMerge(base, override) {
    const result = deepCopy(base);
    for (const key of Object.keys(override || {})) {
      if (typeof override[key] === 'object' && !Array.isArray(override[key]) && override[key] !== null) {
        result[key] = deepMerge(result[key] || {}, override[key]);
      } else {
        result[key] = override[key];
      }
    }
    return result;
  }

  function reset() {
    state = deepCopy(defaultState);
    save();
  }

  load();
  return { get, set, update, on, save, reset, _state: () => state };
})();

window.VeliqState = VeliqState;
