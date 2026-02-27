import { getState, setState, on, resetRound } from '../core/state.js';
import { submitRound, onMessage, flushPendingRoundStart, flushPendingLeftRoom } from '../core/ws.js';
import { TAG_LABELS, TAG_IDS, GAME_MODES } from '../core/constants.js';
import { initMode3D, showMode3D, hideMode3D, placeTeams, skipAnimation, clearCharacters, setOnBattleComplete } from '../modes/mode3d/index.js';
import { initModeCard, showModeCard, hideModeCard } from '../modes/modeCard/index.js';
import { initModeButton, showModeButton, hideModeButton } from '../modes/modeButton/index.js';
import '../styles/game.css';

let currentMode = null;
let gameContainer = null;
let modesInitialized = false;
let pendingResult = null;
let isMatchOver = false;
let savedMatchEnd = null;

export function initGame(container) {
  gameContainer = container;

  container.innerHTML = `
    <div id="game-3d-container" class="game-mode-container"></div>
    <div id="game-card-container" class="game-mode-container"></div>
    <div id="game-button-container" class="game-mode-container"></div>

    <div id="game-select-overlay" class="game-overlay">
      <div class="select-panel">
        <div class="select-header">
          <div class="round-info">
            <span class="round-label">回合</span>
            <span class="round-number" id="game-round-num">1</span>
            <span class="score-display" id="game-score">0 - 0</span>
          </div>
        </div>

        <div class="pool-section">
          <h3 class="section-title">角色池</h3>
          <div class="pool-grid" id="game-pool-grid"></div>
        </div>

        <div class="team-section">
          <h3 class="section-title">出击队伍 <span class="hint">（顺序重要·自爆步兵必须首位）</span></h3>
          <div class="team-slots" id="game-team-slots">
            <div class="team-slot" data-slot="1"><span class="slot-label">第1位</span><span class="slot-content">-</span></div>
            <div class="team-slot" data-slot="2"><span class="slot-label">第2位</span><span class="slot-content">-</span></div>
            <div class="team-slot" data-slot="3"><span class="slot-label">第3位</span><span class="slot-content">-</span></div>
          </div>
        </div>

        <div class="buff-section">
          <h3 class="section-title">增益分配 <span class="buff-remain" id="game-buff-remain">剩余: 4</span></h3>
          <div class="buff-controls">
            <button class="crystal-btn small" id="btn-buff-atk">ATK +2</button>
            <button class="crystal-btn small" id="btn-buff-hp">HP +4</button>
          </div>
          <div class="buff-hint">选择增益类型后，点击队伍槽位分配</div>
          <div class="buff-list" id="game-buff-list"></div>
        </div>

        <div class="strategy-section">
          <h3 class="section-title">攻击策略</h3>
          <div class="strategy-row">
            <label class="radio-wrap"><input type="radio" name="game-strategy" value="low_hp" checked /> 优先血量低</label>
            <label class="radio-wrap"><input type="radio" name="game-strategy" value="high_atk" /> 优先攻击高</label>
          </div>
          <div class="strategy-tags" id="game-strategy-tags"></div>
        </div>

        <div class="action-buttons">
          <button class="crystal-btn primary" id="btn-submit" disabled>提交本回合</button>
          <button class="crystal-btn" id="btn-reset">重置选择</button>
        </div>

        <div class="game-error" id="game-error"></div>
      </div>
    </div>

    <div id="game-result-overlay" class="game-overlay result-overlay" style="display:none">
      <div class="result-card">
        <div class="result-title" id="result-title"></div>
        <div class="result-text" id="result-text"></div>
        <div class="result-log" id="result-log"></div>
        <button class="crystal-btn primary" id="btn-result-close">继续</button>
      </div>
    </div>

    <div class="battle-controls" id="battle-controls" style="display:none">
      <button class="crystal-btn small" id="btn-skip-anim">跳过动画</button>
    </div>
  `;

  initStrategyTags(container);
  bindSelectionLogic(container);
  bindStateListeners(container);

  // Initialize all modes
  if (!modesInitialized) {
    initMode3D(container.querySelector('#game-3d-container'));
    initModeCard(container.querySelector('#game-card-container'));
    initModeButton(container.querySelector('#game-button-container'));
    modesInitialized = true;
    switchGameMode(getState().gameMode);

    setOnBattleComplete(() => {
      // #region agent log
      fetch('http://127.0.0.1:7555/ingest/46b5b799-f3b7-421a-9d0d-c25dc6853cad',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2ec97e'},body:JSON.stringify({sessionId:'2ec97e',location:'game.js:onBattleComplete',message:'battle complete callback',data:{hasPendingResult:!!pendingResult,isMatchOver,hasSavedMatchEnd:!!savedMatchEnd},timestamp:Date.now(),hypothesisId:'F'})}).catch(()=>{});
      // #endregion
      if (pendingResult) {
        const { result, myWin, state: rState } = pendingResult;
        pendingResult = null;
        displayResult(container, result, myWin, rState);
      }
      container.querySelector('#battle-controls').style.display = 'none';
      if (isMatchOver && savedMatchEnd) {
        showMatchEnd(container, savedMatchEnd);
      }
    });
  }

  on('gameMode', (state) => switchGameMode(state.gameMode));
}

function switchGameMode(mode) {
  hideMode3D();
  hideModeCard();
  hideModeButton();
  if (mode === '3d') showMode3D();
  else if (mode === 'card') showModeCard();
  else showModeButton();
}

function initStrategyTags(container) {
  const tagsEl = container.querySelector('#game-strategy-tags');
  for (const [id, label] of Object.entries(TAG_LABELS)) {
    const lbl = document.createElement('label');
    lbl.className = 'checkbox-wrap';
    lbl.innerHTML = `<input type="checkbox" value="${id}" /> ${label}`;
    tagsEl.appendChild(lbl);
  }
}

function bindSelectionLogic(container) {
  container.querySelector('#btn-buff-atk').addEventListener('click', () => {
    setState({ buffMode: 1 });
    container.querySelector('#btn-buff-atk').classList.add('active');
    container.querySelector('#btn-buff-hp').classList.remove('active');
  });

  container.querySelector('#btn-buff-hp').addEventListener('click', () => {
    setState({ buffMode: 2 });
    container.querySelector('#btn-buff-hp').classList.add('active');
    container.querySelector('#btn-buff-atk').classList.remove('active');
  });

  container.querySelectorAll('.team-slot').forEach((slot) => {
    slot.addEventListener('click', () => {
      const state = getState();
      if (state.submitted || !state.buffMode || state.buffs.length >= 4) return;
      const slotNo = parseInt(slot.dataset.slot);
      if (state.selected.length < slotNo) return;
      const newBuffs = [...state.buffs, [slotNo, state.buffMode]];
      setState({ buffs: newBuffs });
      refreshBuffUI(container);
      validateSubmit(container);
    });
  });

  container.querySelector('#btn-reset').addEventListener('click', () => {
    resetRound();
    refreshPoolGrid(container);
    refreshTeamSlots(container);
    refreshBuffUI(container);
    validateSubmit(container);
    showGameError(container, '');
  });

  container.querySelector('#btn-submit').addEventListener('click', () => {
    const state = getState();
    if (state.selected.length !== 3 || state.buffs.length !== 4) return;

    const roles = state.selected.map((idx) => state.pool[idx - 1]);
    const anyBomb = roles.some((r) => (r.tags || []).includes(TAG_IDS.SELF_DESTRUCT));
    const firstBomb = roles[0] && (roles[0].tags || []).includes(TAG_IDS.SELF_DESTRUCT);
    if (anyBomb && !firstBomb) {
      showGameError(container, '自爆步兵只能放在队伍首位');
      return;
    }

    const basicEl = container.querySelector('input[name="game-strategy"]:checked');
    const basic = basicEl ? basicEl.value : 'low_hp';
    const priorityTags = [];
    container.querySelectorAll('#game-strategy-tags input:checked').forEach((cb) => {
      priorityTags.push(parseInt(cb.value));
    });

    submitRound(state.selected, state.buffs, { basic, priority_tags: priorityTags });

    // Place characters in 3D scene
    if (state.gameMode === '3d') {
      placeTeams(state.pool, state.selected, state.buffs, null);
    }
  });

  container.querySelector('#btn-result-close').addEventListener('click', () => {
    // #region agent log
    fetch('http://127.0.0.1:7555/ingest/46b5b799-f3b7-421a-9d0d-c25dc6853cad',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2ec97e'},body:JSON.stringify({sessionId:'2ec97e',location:'game.js:btn-result-close',message:'result close clicked',data:{matchEnd:!!getState().matchEnd,isMatchOver,inRoom:getState().inRoom},timestamp:Date.now(),hypothesisId:'G'})}).catch(()=>{});
    // #endregion
    container.querySelector('#game-result-overlay').style.display = 'none';
    container.querySelector('#battle-controls').style.display = 'none';
    pendingResult = null;
    const state = getState();
    if (state.matchEnd || isMatchOver) {
      isMatchOver = false;
      savedMatchEnd = null;
      clearCharacters();
      setState({ matchEnd: null, roundResult: null, currentView: 'lobby' });
      flushPendingLeftRoom();
      return;
    }
    setState({ roundResult: null });
    flushPendingRoundStart();
  });

  container.querySelector('#btn-skip-anim').addEventListener('click', () => {
    skipAnimation();
  });
}

function bindStateListeners(container) {
  on(['round', 'pool', 'score'], (state, changedKeys) => {
    if (state.currentView !== 'game') return;
    // #region agent log
    fetch('http://127.0.0.1:7555/ingest/46b5b799-f3b7-421a-9d0d-c25dc6853cad',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2ec97e'},body:JSON.stringify({sessionId:'2ec97e',location:'game.js:200',message:'round/pool/score listener fired',data:{changedKeys,hasRoundResult:!!state.roundResult,round:state.round},timestamp:Date.now(),hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    if (state.roundResult || state.matchEnd) return;

    container.querySelector('#game-round-num').textContent = state.round;
    container.querySelector('#game-score').textContent = `${state.score[0]} - ${state.score[1]}`;
    refreshPoolGrid(container);
    refreshTeamSlots(container);
    refreshBuffUI(container);
    validateSubmit(container);

    container.querySelector('#game-select-overlay').style.display = '';
    container.querySelector('#game-result-overlay').style.display = 'none';
    // #region agent log
    fetch('http://127.0.0.1:7555/ingest/46b5b799-f3b7-421a-9d0d-c25dc6853cad',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2ec97e'},body:JSON.stringify({sessionId:'2ec97e',location:'game.js:210',message:'select overlay SHOWN by score listener',data:{},timestamp:Date.now(),hypothesisId:'B'})}).catch(()=>{});
    // #endregion
  });

  on('submitted', (state) => {
    container.querySelector('#btn-submit').disabled = true;
    if (state.submitted) {
      container.querySelector('#btn-submit').textContent = '已提交，等待对手...';
    } else {
      container.querySelector('#btn-submit').textContent = '提交本回合';
      validateSubmit(container);
    }
  });

  on('roundResult', (state) => {
    // #region agent log
    fetch('http://127.0.0.1:7555/ingest/46b5b799-f3b7-421a-9d0d-c25dc6853cad',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2ec97e'},body:JSON.stringify({sessionId:'2ec97e',location:'game.js:223',message:'roundResult listener fired',data:{hasRoundResult:!!state.roundResult,player:state.player},timestamp:Date.now(),hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    if (!state.roundResult) return;
    const r = state.roundResult;
    const myWin = Number(r.winner) === Number(state.player);
    showRoundResult(container, r, myWin, state);
  });

  on('matchEnd', (state) => {
    if (!state.matchEnd) return;
    isMatchOver = true;
    savedMatchEnd = { ...state.matchEnd };
    if (state.gameMode === '3d' && pendingResult) {
      return;
    }
    showMatchEnd(container, state.matchEnd);
  });
}

function refreshPoolGrid(container) {
  const grid = container.querySelector('#game-pool-grid');
  const state = getState();
  grid.innerHTML = '';
  (state.pool || []).forEach((role, idx) => {
    const card = document.createElement('div');
    card.className = 'pool-card' + (state.selected.includes(idx + 1) ? ' selected' : '');
    card.innerHTML = `
      <div class="pool-card-name">${role.name}</div>
      <div class="pool-card-stats">
        <span class="stat-atk">ATK ${role.atk}</span>
        <span class="stat-hp">HP ${role.hp}</span>
      </div>
      <div class="pool-card-tags">${(role.tags || []).map((t) => TAG_LABELS[t] || t).join(' ') || '无标签'}</div>
    `;
    card.addEventListener('click', () => {
      if (state.submitted) return;
      toggleSelect(idx + 1, container);
    });
    grid.appendChild(card);
  });
}

function toggleSelect(index1, container) {
  const state = getState();
  const selected = [...state.selected];
  const i = selected.indexOf(index1);
  if (i >= 0) {
    selected.splice(i, 1);
  } else {
    if (selected.length >= 3) return;
    selected.push(index1);
  }

  if (selected.length > 0) {
    const roles = selected.map((idx) => state.pool[idx - 1]);
    const anyBomb = roles.some((r) => (r.tags || []).includes(TAG_IDS.SELF_DESTRUCT));
    const firstBomb = roles[0] && (roles[0].tags || []).includes(TAG_IDS.SELF_DESTRUCT);
    if (anyBomb && !firstBomb) {
      showGameError(container, '自爆步兵只能放在队伍首位');
    } else {
      showGameError(container, '');
    }
  } else {
    showGameError(container, '');
  }

  setState({ selected });
  refreshPoolGrid(container);
  refreshTeamSlots(container);
  validateSubmit(container);
}

function refreshTeamSlots(container) {
  const state = getState();
  const slots = container.querySelectorAll('.team-slot .slot-content');
  for (let i = 0; i < 3; i++) {
    const idx = state.selected[i];
    if (!idx) {
      slots[i].textContent = '-';
    } else {
      const role = state.pool[idx - 1];
      slots[i].textContent = `${role.name} (ATK ${role.atk} / HP ${role.hp})`;
    }
  }
}

function refreshBuffUI(container) {
  const state = getState();
  container.querySelector('#game-buff-remain').textContent = `剩余: ${4 - state.buffs.length}`;
  const list = container.querySelector('#game-buff-list');
  list.innerHTML = '';
  state.buffs.forEach((b, i) => {
    const item = document.createElement('div');
    item.className = 'buff-item';
    const typeText = b[1] === 1 ? 'ATK +2' : 'HP +4';
    item.innerHTML = `<span>第${b[0]}位: ${typeText}</span>`;
    const btn = document.createElement('button');
    btn.className = 'crystal-btn tiny';
    btn.textContent = '删除';
    btn.addEventListener('click', () => {
      const newBuffs = [...state.buffs];
      newBuffs.splice(i, 1);
      setState({ buffs: newBuffs });
      refreshBuffUI(container);
      validateSubmit(container);
    });
    item.appendChild(btn);
    list.appendChild(item);
  });
}

function validateSubmit(container) {
  const state = getState();
  const ok = state.selected.length === 3 && state.buffs.length === 4 && !state.submitted;
  container.querySelector('#btn-submit').disabled = !ok;
}

function showGameError(container, msg) {
  const el = container.querySelector('#game-error');
  el.textContent = msg;
  el.style.display = msg ? '' : 'none';
}

function replaceNames(text, state) {
  const me = state.myName || '我方';
  const other = state.opponent || '对方';
  const one = state.player === 1 ? me : other;
  const two = state.player === 2 ? me : other;
  return text.replace(/玩家1/g, one).replace(/玩家2/g, two);
}

function showRoundResult(container, result, myWin, state) {
  // #region agent log
  fetch('http://127.0.0.1:7555/ingest/46b5b799-f3b7-421a-9d0d-c25dc6853cad',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2ec97e'},body:JSON.stringify({sessionId:'2ec97e',location:'game.js:showRoundResult',message:'showRoundResult called',data:{gameMode:state.gameMode,round:result.round,eventsCount:(result.events||[]).length},timestamp:Date.now(),hypothesisId:'E'})}).catch(()=>{});
  // #endregion
  container.querySelector('#game-select-overlay').style.display = 'none';

  if (state.gameMode === '3d') {
    container.querySelector('#battle-controls').style.display = '';
    pendingResult = { result, myWin, state };
    return;
  }

  displayResult(container, result, myWin, state);
}

function displayResult(container, result, myWin, state) {
  // #region agent log
  fetch('http://127.0.0.1:7555/ingest/46b5b799-f3b7-421a-9d0d-c25dc6853cad',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2ec97e'},body:JSON.stringify({sessionId:'2ec97e',location:'game.js:displayResult',message:'displaying result overlay',data:{round:result.round},timestamp:Date.now(),hypothesisId:'F'})}).catch(()=>{});
  // #endregion
  const overlay = container.querySelector('#game-result-overlay');
  overlay.style.display = '';

  container.querySelector('#result-title').textContent = `回合 ${result.round} 结束`;
  container.querySelector('#result-text').textContent = myWin ? '你方胜利！' : '对方胜利';
  container.querySelector('#result-text').className = `result-text ${myWin ? 'win' : 'loss'}`;

  const logEl = container.querySelector('#result-log');
  logEl.innerHTML = (result.texts || [])
    .map((t) => `<div class="log-line">${replaceNames(t, state)}</div>`)
    .join('');
  container.querySelector('#btn-result-close').textContent = '继续';
}

function showMatchEnd(container, matchEnd) {
  container.querySelector('#game-select-overlay').style.display = 'none';
  const overlay = container.querySelector('#game-result-overlay');
  overlay.style.display = '';

  container.querySelector('#result-title').textContent = '对局结束';
  container.querySelector('#result-text').textContent = matchEnd.myWin ? '恭喜，你赢得了对局！' : '对方赢得了对局';
  container.querySelector('#result-text').className = `result-text ${matchEnd.myWin ? 'win' : 'loss'}`;
  container.querySelector('#result-log').innerHTML = `<div class="log-line">最终比分: ${matchEnd.score[0]} - ${matchEnd.score[1]}</div>`;
  container.querySelector('#btn-result-close').textContent = '返回大厅';
}
