import { getState, on } from '../../core/state.js';

let container = null;
let initialized = false;

export function initModeButton(containerEl) {
  if (initialized) return;
  container = containerEl;
  initialized = true;

  container.innerHTML = `
    <div class="button-mode">
      <div class="button-battle-log" id="button-battle-log">
        <div class="log-placeholder">等待战斗结果...</div>
      </div>
      <div class="button-events" id="button-events">
        <div class="events-title">原始事件数据</div>
        <pre class="events-raw" id="button-events-raw">-</pre>
      </div>
    </div>
  `;

  on('roundResult', (state) => {
    if (state.gameMode !== 'button' || !state.roundResult) return;
    renderTextReport(state.roundResult, state);
  });
}

function renderTextReport(result, state) {
  const logEl = container.querySelector('#button-battle-log');
  const evtEl = container.querySelector('#button-events-raw');
  if (!logEl) return;

  const me = state.myName || '我方';
  const opp = state.opponent || '对方';
  const one = state.player === 1 ? me : opp;
  const two = state.player === 2 ? me : opp;

  logEl.innerHTML = (result.texts || [])
    .map((t) => {
      const text = t.replace(/玩家1/g, one).replace(/玩家2/g, two);
      return `<div class="text-log-line">${text}</div>`;
    })
    .join('');

  logEl.scrollTop = logEl.scrollHeight;

  if (evtEl) {
    evtEl.textContent = JSON.stringify(result.events, null, 2);
  }
}

export function showModeButton() {
  if (container) container.style.display = '';
}

export function hideModeButton() {
  if (container) container.style.display = 'none';
}
