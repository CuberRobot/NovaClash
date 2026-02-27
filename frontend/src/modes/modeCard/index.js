import { getState, on } from '../../core/state.js';
import { TAG_LABELS } from '../../core/constants.js';

let container = null;
let initialized = false;

export function initModeCard(containerEl) {
  if (initialized) return;
  container = containerEl;
  initialized = true;

  container.innerHTML = `
    <div class="card-mode">
      <div class="card-battlefield">
        <div class="card-team card-team-opponent" id="card-opp-team">
          <div class="card-slot" data-pos="0"></div>
          <div class="card-slot" data-pos="1"></div>
          <div class="card-slot" data-pos="2"></div>
        </div>
        <div class="card-divider">VS</div>
        <div class="card-team card-team-player" id="card-player-team">
          <div class="card-slot" data-pos="0"></div>
          <div class="card-slot" data-pos="1"></div>
          <div class="card-slot" data-pos="2"></div>
        </div>
      </div>
      <div class="card-battle-log" id="card-battle-log"></div>
    </div>
  `;

  on('roundResult', (state) => {
    if (state.gameMode !== 'card' || !state.roundResult) return;
    renderBattleLog(state.roundResult, state);
  });
}

function renderBattleLog(result, state) {
  const logEl = container.querySelector('#card-battle-log');
  if (!logEl) return;

  const me = state.myName || '我方';
  const opp = state.opponent || '对方';
  const one = state.player === 1 ? me : opp;
  const two = state.player === 2 ? me : opp;

  logEl.innerHTML = (result.texts || [])
    .map((t) => {
      const text = t.replace(/玩家1/g, one).replace(/玩家2/g, two);
      return `<div class="card-log-line">${text}</div>`;
    })
    .join('');

  logEl.scrollTop = logEl.scrollHeight;
}

export function showModeCard() {
  if (container) container.style.display = '';
}

export function hideModeCard() {
  if (container) container.style.display = 'none';
}
