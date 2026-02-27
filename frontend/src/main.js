import { getState, setState, on, loadStoredName, loadSettings } from './core/state.js';
import { connect } from './core/ws.js';
import { initLobby } from './views/lobby.js';
import { initGame } from './views/game.js';
import { initLore } from './views/lore.js';
import { initSettings } from './views/settings.js';
import './styles/main.css';

const viewModules = {
  lobby: { init: initLobby, el: null },
  game: { init: initGame, el: null },
  lore: { init: initLore, el: null },
  settings: { init: initSettings, el: null },
};

function switchView(viewName) {
  for (const [name, mod] of Object.entries(viewModules)) {
    if (mod.el) {
      mod.el.classList.toggle('active', name === viewName);
    }
  }
}

function boot() {
  loadStoredName();
  loadSettings();

  for (const [name, mod] of Object.entries(viewModules)) {
    mod.el = document.getElementById(`view-${name}`);
    if (mod.el) {
      mod.init(mod.el);
    }
  }

  on('currentView', (state) => {
    switchView(state.currentView);
  });

  switchView(getState().currentView);
  connect();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

export function navigateTo(view) {
  setState({ currentView: view });
}
