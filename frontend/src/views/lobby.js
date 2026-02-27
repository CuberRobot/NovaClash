import { getState, setState, on, loadHistory } from '../core/state.js';
import { joinRandom, joinRoom, leaveRoom } from '../core/ws.js';
import { TAG_LABELS, GAME_MODES } from '../core/constants.js';
import { navigateTo } from '../main.js';
import '../styles/lobby.css';

export function initLobby(container) {
  container.innerHTML = `
    <div class="lobby-bg"></div>
    <div class="lobby-content">
      <div class="lobby-header">
        <h1 class="lobby-title">
          <span class="title-glow">星陨</span>
          <span class="title-sub">星辰竞技场</span>
        </h1>
      </div>

      <div class="lobby-main">
        <div class="lobby-panel lobby-match-panel">
          <div class="panel-header">
            <div class="crystal-icon"></div>
            <span>进入竞技</span>
          </div>

          <div class="form-group">
            <label class="form-label">你的名字</label>
            <input type="text" id="lobby-name" class="crystal-input" placeholder="输入昵称" maxlength="32" />
          </div>

          <button id="btn-random-match" class="crystal-btn primary">
            <span class="btn-glow"></span>
            随机匹配
          </button>

          <div class="divider-line"></div>

          <div class="form-group">
            <label class="form-label">房间号</label>
            <div class="input-row">
              <input type="text" id="lobby-room" class="crystal-input" placeholder="如 A1B2" maxlength="4" />
              <button id="btn-join-room" class="crystal-btn">加入</button>
            </div>
          </div>

          <button id="btn-create-room" class="crystal-btn">创建房间</button>

          <div id="lobby-status" class="lobby-status"></div>
        </div>

        <div class="lobby-panel lobby-info-panel">
          <div class="panel-header">
            <div class="crystal-icon"></div>
            <span>对局信息</span>
          </div>
          <div class="info-grid">
            <div class="info-item">
              <span class="info-label">连接状态</span>
              <span class="info-value" id="lobby-conn-status">未连接</span>
            </div>
            <div class="info-item">
              <span class="info-label">房间</span>
              <span class="info-value" id="lobby-room-info">-</span>
            </div>
            <div class="info-item">
              <span class="info-label">对手</span>
              <span class="info-value" id="lobby-opponent">-</span>
            </div>
            <div class="info-item">
              <span class="info-label">比分</span>
              <span class="info-value" id="lobby-score">0 - 0</span>
            </div>
          </div>
          <button id="btn-leave" class="crystal-btn danger" style="display:none">离开房间</button>
        </div>
      </div>

      <div class="lobby-footer">
        <div class="mode-selector">
          <span class="mode-label">游戏模式</span>
          <div class="mode-buttons">
            <button class="mode-btn active" data-mode="3d">3D</button>
            <button class="mode-btn" data-mode="card">卡牌</button>
            <button class="mode-btn" data-mode="button">按钮</button>
          </div>
        </div>
        <div class="nav-buttons">
          <button id="btn-lore" class="crystal-btn small">玩法说明</button>
          <button id="btn-settings" class="crystal-btn small">设置</button>
        </div>
      </div>
    </div>

    <div class="lobby-particles" id="lobby-particles"></div>
  `;

  const nameInput = container.querySelector('#lobby-name');
  const storedName = getState().myName;
  if (storedName) nameInput.value = storedName;

  nameInput.addEventListener('input', () => {
    setState({ myName: nameInput.value.trim() });
  });

  container.querySelector('#btn-random-match').addEventListener('click', () => {
    const name = nameInput.value.trim();
    if (!name) { showStatus('请先输入昵称', 'error'); return; }
    if (getState().waiting || getState().inRoom) { showStatus('已在匹配中', 'error'); return; }
    setState({ myName: name, waiting: true });
    joinRandom(name);
    showStatus('正在寻找对手...', 'info');
  });

  container.querySelector('#btn-create-room').addEventListener('click', () => {
    const name = nameInput.value.trim();
    if (!name) { showStatus('请先输入昵称', 'error'); return; }
    if (getState().waiting || getState().inRoom) { showStatus('已在匹配中', 'error'); return; }
    setState({ myName: name, waiting: true });
    joinRoom(name, '');
    showStatus('正在创建房间...', 'info');
  });

  container.querySelector('#btn-join-room').addEventListener('click', () => {
    const name = nameInput.value.trim();
    const room = container.querySelector('#lobby-room').value.trim();
    if (!name) { showStatus('请先输入昵称', 'error'); return; }
    if (!room) { showStatus('请输入房间号', 'error'); return; }
    if (getState().waiting || getState().inRoom) { showStatus('已在匹配中', 'error'); return; }
    setState({ myName: name, waiting: true });
    joinRoom(name, room);
    showStatus(`正在加入房间 ${room}...`, 'info');
  });

  container.querySelector('#btn-leave').addEventListener('click', () => {
    leaveRoom();
  });

  container.querySelector('#btn-lore').addEventListener('click', () => navigateTo('lore'));
  container.querySelector('#btn-settings').addEventListener('click', () => navigateTo('settings'));

  container.querySelectorAll('.mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.mode-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      setState({ gameMode: btn.dataset.mode });
    });
  });

  on('connected', (state) => {
    container.querySelector('#lobby-conn-status').textContent = state.connected ? '已连接' : '未连接';
    container.querySelector('#lobby-conn-status').className = `info-value ${state.connected ? 'connected' : 'disconnected'}`;
  });

  on(['room', 'opponent', 'score', 'waiting', 'inRoom'], (state) => {
    container.querySelector('#lobby-room-info').textContent = state.room || '-';
    container.querySelector('#lobby-opponent').textContent = state.opponent || '-';
    container.querySelector('#lobby-score').textContent = `${state.score[0]} - ${state.score[1]}`;
    container.querySelector('#btn-leave').style.display = (state.waiting || state.inRoom) ? '' : 'none';

    if (state.waiting) showStatus('等待对手加入...', 'info');
    if (state.inRoom && state.opponent) showStatus(`匹配成功！对手: ${state.opponent}`, 'success');
  });

  function showStatus(text, type) {
    const el = container.querySelector('#lobby-status');
    el.textContent = text;
    el.className = `lobby-status status-${type}`;
  }

  initParticles(container.querySelector('#lobby-particles'));
}

function initParticles(container) {
  for (let i = 0; i < 30; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.left = Math.random() * 100 + '%';
    p.style.top = Math.random() * 100 + '%';
    p.style.animationDelay = Math.random() * 6 + 's';
    p.style.animationDuration = (4 + Math.random() * 6) + 's';
    const size = 2 + Math.random() * 4;
    p.style.width = size + 'px';
    p.style.height = size + 'px';
    container.appendChild(p);
  }
}
