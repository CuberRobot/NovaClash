import { getState, saveSettings } from '../core/state.js';
import { navigateTo } from '../main.js';

export function initSettings(container) {
  container.innerHTML = `
    <div class="settings-page">
      <div class="settings-header">
        <button class="crystal-btn small" id="btn-settings-back">返回</button>
        <h2>设置</h2>
      </div>
      <div class="settings-content">
        <div class="settings-group">
          <h3>通用</h3>
          <div class="setting-item">
            <label>动画速度</label>
            <select id="setting-anim-speed" class="crystal-select">
              <option value="slow">慢</option>
              <option value="normal" selected>中</option>
              <option value="fast">快</option>
            </select>
          </div>
          <div class="setting-item">
            <label>音效</label>
            <input type="checkbox" id="setting-sound" checked />
          </div>
          <div class="setting-item">
            <label>音乐音量</label>
            <input type="range" id="setting-music" min="0" max="100" value="50" />
          </div>
        </div>
        <div class="settings-group">
          <h3>关于</h3>
          <p class="about-text">星陨 v2.0 — 星辰竞技场</p>
          <p class="about-text">低多边形风格策略对战游戏</p>
        </div>
      </div>
    </div>
  `;

  const state = getState();
  const s = state.settings;
  container.querySelector('#setting-anim-speed').value = s.animationSpeed;
  container.querySelector('#setting-sound').checked = s.soundEnabled;
  container.querySelector('#setting-music').value = s.musicVolume;

  container.querySelector('#btn-settings-back').addEventListener('click', () => navigateTo('lobby'));

  container.querySelector('#setting-anim-speed').addEventListener('change', (e) => {
    saveSettings({ animationSpeed: e.target.value });
  });

  container.querySelector('#setting-sound').addEventListener('change', (e) => {
    saveSettings({ soundEnabled: e.target.checked });
  });

  container.querySelector('#setting-music').addEventListener('input', (e) => {
    saveSettings({ musicVolume: parseInt(e.target.value) });
  });
}
