import { navigateTo } from '../main.js';

export function initLore(container) {
  container.innerHTML = `
    <div class="lore-page">
      <div class="lore-header">
        <button class="crystal-btn small" id="btn-lore-back">返回</button>
        <h2>星陨 · 玩法与设定</h2>
      </div>
      <div class="lore-tabs">
        <button class="lore-tab active" data-tab="rules">基础玩法</button>
        <button class="lore-tab" data-tab="roles">角色图鉴</button>
        <button class="lore-tab" data-tab="world">世界观</button>
      </div>
      <div class="lore-content">
        <div class="lore-section active" id="lore-rules">
          <h3>游戏流程</h3>
          <div class="lore-text">
            <p><strong>1. 匹配对手</strong> — 随机匹配或创建/加入房间，等待另一位调停者。</p>
            <p><strong>2. 选择战士</strong> — 每回合从你的角色池（6名角色）中选出3名出战，顺序很重要。</p>
            <p><strong>3. 分配增益</strong> — 共4次增益机会，每次可选ATK+2或HP+4，分配给出战角色。</p>
            <p><strong>4. 观看战斗</strong> — 双方提交后，战斗自动进行，你将看到战斗动画或文字战报。</p>
            <p><strong>5. 三局两胜</strong> — 先赢两局的玩家获胜！</p>
          </div>
          <h3>特殊规则</h3>
          <div class="lore-text">
            <p>· 自爆步兵只能放在队伍第一位</p>
            <p>· 每局使用的角色池在整场对局中固定不变</p>
            <p>· 先手由增益后总属性（ATK+HP之和）较小的一方获得</p>
          </div>
        </div>
        <div class="lore-section" id="lore-roles">
          <div class="role-grid">
            ${generateRoleCards()}
          </div>
        </div>
        <div class="lore-section" id="lore-world">
          <h3>星陨界</h3>
          <div class="lore-text">
            <p>在无尽的宇宙深处，存在着一个由古老星能水晶构筑的次元——星陨界。这里没有恒星，也没有行星，只有无数漂浮的几何水晶碎片，它们反射着遥远星系的微光，构成了梦幻般的低多边形宇宙。</p>
            <p>每隔千年，星陨界会迎来一次"归寂潮"——宇宙暗物质周期性涌来，试图吞噬所有光芒。为了抵抗暗潮，十二枚本源水晶会召唤各自的星灵战士，在星核竞技场中进行战斗，通过战斗激发水晶的共鸣，凝聚足够的光能来驱散黑暗。</p>
            <p>玩家扮演的是一位"星痕调停者"，负责在归寂潮期间调配战士、制定策略，在璀璨的星云棋盘上展开三局两胜的博弈。</p>
          </div>
        </div>
      </div>
    </div>
  `;

  container.querySelector('#btn-lore-back').addEventListener('click', () => navigateTo('lobby'));

  container.querySelectorAll('.lore-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      container.querySelectorAll('.lore-tab').forEach((t) => t.classList.remove('active'));
      container.querySelectorAll('.lore-section').forEach((s) => s.classList.remove('active'));
      tab.classList.add('active');
      container.querySelector(`#lore-${tab.dataset.tab}`).classList.add('active');
    });
  });
}

function generateRoleCards() {
  const roles = [
    { name: '均衡战士A', atk: 8, hp: 19, tags: '', desc: '来自平衡星域的普通星灵，由稳定的三棱水晶构成。', color: '#7eb8d8' },
    { name: '均衡战士B', atk: 6, hp: 23, tags: '', desc: '平衡星域的防御型星灵，坚韧可靠。', color: '#7ed8a0' },
    { name: '均衡战士C', atk: 4, hp: 26, tags: '', desc: '平衡星域的耐久型星灵，最为坚固。', color: '#a07ed8' },
    { name: '自爆步兵', atk: 16, hp: 1, tags: '自爆', desc: '碎晶星域，体内封存不稳定爆炸水晶。目标HP≤24则必杀。', color: '#e85830' },
    { name: '诅咒巫师', atk: 6, hp: 20, tags: '剥夺', desc: '幽暗星域，开局剥夺对方一名有标签角色的全部标签。', color: '#6a2c91' },
    { name: '死灵法师', atk: 4, hp: 24, tags: '复活', desc: '重生星域，队友致死时可复活到一半血量，共2次。', color: '#5a1a7a' },
    { name: '铁甲卫士', atk: 4, hp: 30, tags: '重装', desc: '重装星域，受到≥8伤害时按60%结算。', color: '#4a5ab0' },
    { name: '护盾部署者', atk: 2, hp: 33, tags: '护盾', desc: '守护星域，为队友分担50%伤害，最多3次。', color: '#2898b8' },
    { name: '风行射手', atk: 7, hp: 21, tags: '穿透', desc: '迅流星域，目标原始HP≤24时，追加一半伤害给另一目标。', color: '#20b8c8' },
    { name: '狂战士', atk: 8, hp: 19, tags: '狂暴', desc: '怒火星域，自身HP≤14时伤害×1.4。', color: '#a02020' },
    { name: '毒药投手', atk: 6, hp: 21, tags: '中毒', desc: '蚀骨星域，可叠加DOT，每回合扣血。', color: '#208840' },
    { name: '重炮统领', atk: 5, hp: 25, tags: '群伤', desc: '毁灭星域，对敌方全体存活单位造成等量攻击伤害。', color: '#b89020' },
  ];

  return roles.map((r) => `
    <div class="role-card" style="border-color: ${r.color}">
      <div class="role-card-header" style="background: linear-gradient(135deg, ${r.color}40, ${r.color}10)">
        <span class="role-name">${r.name}</span>
        <span class="role-tag" style="color: ${r.color}">${r.tags || '无标签'}</span>
      </div>
      <div class="role-stats">
        <span class="stat">ATK ${r.atk}</span>
        <span class="stat">HP ${r.hp}</span>
      </div>
      <div class="role-desc">${r.desc}</div>
    </div>
  `).join('');
}
