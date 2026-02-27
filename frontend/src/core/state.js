import { GAME_MODES, VIEWS, STORAGE_NAME, STORAGE_SETTINGS, STORAGE_HISTORY, HISTORY_MAX } from './constants.js';

const listeners = new Map();

const state = {
  currentView: VIEWS.LOBBY,
  gameMode: GAME_MODES.MODE_3D,

  connected: false,
  room: null,
  player: null,
  opponent: null,
  myName: '',
  round: 0,
  score: [0, 0],
  pool: [],
  selected: [],
  buffs: [],
  buffMode: null,
  submitted: false,
  waiting: false,
  inRoom: false,

  roundResult: null,
  matchEnd: null,
  currentMatch: null,

  settings: {
    animationSpeed: 'normal',
    soundEnabled: true,
    musicVolume: 50,
  },
};

export function getState() {
  return state;
}

export function setState(updates) {
  const changed = [];
  for (const key in updates) {
    if (state[key] !== updates[key]) {
      state[key] = updates[key];
      changed.push(key);
    }
  }
  if (changed.length > 0) {
    notify(changed);
  }
}

export function on(keys, callback) {
  const id = Symbol();
  const keyArr = Array.isArray(keys) ? keys : [keys];
  for (const key of keyArr) {
    if (!listeners.has(key)) listeners.set(key, []);
    listeners.get(key).push({ id, callback });
  }
  return () => {
    for (const key of keyArr) {
      const arr = listeners.get(key);
      if (arr) {
        const idx = arr.findIndex((l) => l.id === id);
        if (idx >= 0) arr.splice(idx, 1);
      }
    }
  };
}

function notify(changedKeys) {
  const called = new Set();
  for (const key of changedKeys) {
    const arr = listeners.get(key);
    if (arr) {
      for (const { id, callback } of arr) {
        if (!called.has(id)) {
          called.add(id);
          callback(state, changedKeys);
        }
      }
    }
  }
}

export function loadStoredName() {
  try {
    const name = localStorage.getItem(STORAGE_NAME);
    if (name && name.trim()) {
      setState({ myName: name.trim() });
      return name.trim();
    }
  } catch (e) { /* ignore */ }
  return '';
}

export function saveNameToStorage(name) {
  if (!name || typeof name !== 'string') return;
  try {
    localStorage.setItem(STORAGE_NAME, name.trim().slice(0, 32));
  } catch (e) { /* ignore */ }
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_SETTINGS);
    if (raw) {
      const parsed = JSON.parse(raw);
      setState({ settings: { ...state.settings, ...parsed } });
    }
  } catch (e) { /* ignore */ }
}

export function saveSettings(settings) {
  try {
    const merged = { ...state.settings, ...settings };
    setState({ settings: merged });
    localStorage.setItem(STORAGE_SETTINGS, JSON.stringify(merged));
  } catch (e) { /* ignore */ }
}

export function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_HISTORY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.slice(0, HISTORY_MAX) : [];
  } catch (e) {
    return [];
  }
}

export function saveHistory(list) {
  try {
    localStorage.setItem(STORAGE_HISTORY, JSON.stringify(list.slice(0, HISTORY_MAX)));
  } catch (e) { /* ignore */ }
}

export function pushMatchToHistory(record) {
  const list = loadHistory();
  list.unshift(record);
  saveHistory(list);
}

export function resetRound() {
  setState({
    selected: [],
    buffs: [],
    buffMode: null,
    submitted: false,
    roundResult: null,
  });
}

export function resetMatch() {
  setState({
    inRoom: false,
    waiting: false,
    round: 0,
    pool: [],
    opponent: null,
    currentMatch: null,
    roundResult: null,
    matchEnd: null,
  });
  resetRound();
}
