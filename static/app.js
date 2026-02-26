let ws = null;
let state = {
  connected: false,
  room: null,
  player: null,
  opponent: null,
  myName: "", // 本方昵称，用于战报中的名称替换
  round: 0,
  score: [0, 0],
  pool: [],
  selected: [], // indices (1-based in pool)
  buffs: [], // [slot, type]
  buffMode: null, // 1 atk, 2 hp
  submitted: false,
  waiting: false, // 是否在等待匹配结果
  inRoom: false, // 是否已经在某个房间/对局中
  currentMatch: null, // 当前对局记录，用于 match_end 时写入历史
};

let resultOverlayTimer = null;

const STORAGE_NAME = "cardgame_player_name";
const STORAGE_HISTORY = "cardgame_history";
const HISTORY_MAX = 8;
const HISTORY_TEXTS_PER_ROUND = 40;

const $ = (id) => document.getElementById(id);

function loadStoredName() {
  try {
    const name = localStorage.getItem(STORAGE_NAME);
    if (name != null && name.trim() !== "") {
      const input = $("nameInput");
      if (input) input.value = name.trim();
    }
  } catch (e) {}
}

function saveNameToStorage(name) {
  if (!name || typeof name !== "string") return;
  try {
    localStorage.setItem(STORAGE_NAME, name.trim().slice(0, 32));
  } catch (e) {}
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_HISTORY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.slice(0, HISTORY_MAX) : [];
  } catch (e) {
    return [];
  }
}

function saveHistory(list) {
  try {
    localStorage.setItem(STORAGE_HISTORY, JSON.stringify(list.slice(0, HISTORY_MAX)));
  } catch (e) {}
}

function pushMatchToHistory(record) {
  const list = loadHistory();
  list.unshift(record);
  saveHistory(list);
  renderHistory();
}

function formatHistoryTime(ts) {
  if (!ts) return "-";
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  if (sameDay) return "今天 " + d.toTimeString().slice(0, 5);
  return (d.getMonth() + 1) + "/" + d.getDate() + " " + d.toTimeString().slice(0, 5);
}

function renderHistory() {
  const container = $("historyList");
  if (!container) return;
  const list = loadHistory();
  if (list.length === 0) {
    container.innerHTML = '<div class="history-empty">暂无历史对局，完成对局后将显示最近 8 场。</div>';
    return;
  }
  container.innerHTML = list
    .map((rec, idx) => {
      const resultText = rec.result === "win" ? "胜" : "负";
      const resultClass = rec.result === "win" ? "history-win" : "history-loss";
      const scoreStr = (rec.score && rec.score.length >= 2) ? `${rec.score[0]} : ${rec.score[1]}` : "-";
      const roundsHtml =
        (rec.rounds || [])
          .map(
            (r) =>
              `<div class="history-round"><span class="history-round-title">回合 ${r.round}</span> 胜者：${r.winner === 1 ? (rec.myName || "我方") : (rec.opponent || "对方")}<pre class="history-round-log">${(r.texts || []).join("\n")}</pre></div>`
          )
          .join("") || "";
      return `
        <div class="history-item" data-idx="${idx}">
          <div class="history-item-head">
            <span class="history-time">${formatHistoryTime(rec.at)}</span>
            <span class="history-vs">vs ${(rec.opponent || "对方")}</span>
            <span class="history-score">${scoreStr}</span>
            <span class="history-result ${resultClass}">${resultText}</span>
            <button type="button" class="history-toggle" aria-label="展开">▼</button>
          </div>
          <div class="history-item-body" hidden>${roundsHtml}</div>
        </div>`;
    })
    .join("");

  container.querySelectorAll(".history-item").forEach((el) => {
    const head = el.querySelector(".history-item-head");
    const body = el.querySelector(".history-item-body");
    const btn = el.querySelector(".history-toggle");
    if (!head || !body || !btn) return;
    head.addEventListener("click", () => {
      const open = !body.hidden;
      body.hidden = open;
      btn.textContent = open ? "▼" : "▲";
      btn.setAttribute("aria-label", open ? "展开" : "收起");
    });
  });
}

const TAG_LABELS = {
  1: "自爆", 2: "群体治疗", 3: "标签剥夺", 4: "护盾", 5: "重装",
  6: "穿透", 7: "狂暴", 8: "中毒", 9: "群体伤害",
};

function hideResultOverlay() {
  if (resultOverlayTimer) {
    clearTimeout(resultOverlayTimer);
    resultOverlayTimer = null;
  }
  const overlay = $("resultOverlay");
  if (overlay) {
    overlay.hidden = true;
    overlay.style.display = "none";
  }
}

function showResultOverlay(title, text, isWin) {
  hideResultOverlay();
  const overlay = $("resultOverlay");
  const titleEl = $("resultTitle");
  const textEl = $("resultText");
  if (!overlay || !titleEl || !textEl) return;
  titleEl.textContent = title;
  textEl.textContent = text;
  if (isWin === true) textEl.style.color = "#7CFFB2";
  else if (isWin === false) textEl.style.color = "#FF9F9F";
  else textEl.style.color = "#E8D48B";
  overlay.hidden = false;
  overlay.style.display = "flex";
  resultOverlayTimer = setTimeout(hideResultOverlay, 5000);
}

function setPill(el, text, kind) {
  el.textContent = text;
  el.classList.remove("pill-muted");
  if (kind === "muted") el.classList.add("pill-muted");
}

function showError(msg) {
  const box = $("errorBox");
  box.hidden = !msg;
  box.textContent = msg || "";
}

function clearLog(placeholder) {
  const box = $("logBox");
  if (box) box.textContent = placeholder != null ? placeholder + "\n" : "";
  const ev = $("eventBox");
  if (ev) ev.textContent = "-";
}

function appendLog(line) {
  const box = $("logBox");
  if (box.textContent.includes("连接后开始匹配")) box.textContent = "";
  box.textContent += line + "\n";
  box.scrollTop = box.scrollHeight;
}

function setEventsRaw(events) {
  $("eventBox").textContent = JSON.stringify(events, null, 2);
}

function replacePlayerNames(text) {
  if (!text || typeof text !== "string") return text;
  const me = state.myName || "我方";
  const other = state.opponent || "对方";
  const one = state.player === 1 ? me : other;
  const two = state.player === 2 ? me : other;
  return text.replace(/玩家1/g, one).replace(/玩家2/g, two);
}

function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }
  ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
  ws.onopen = () => {
    state.connected = true;
    setPill($("connPill"), "已连接", "ok");
  };
  ws.onclose = () => {
    state.connected = false;
    setPill($("connPill"), "未连接", "muted");
  };
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    handleServer(msg);
  };
}

function send(payload) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(payload));
}

function refreshMatchButtons() {
  const disabled = state.waiting || state.inRoom;
  $("randomBtn").disabled = disabled;
  $("createRoomBtn").disabled = disabled;
  $("joinRoomBtn").disabled = disabled;
  $("roomInput").disabled = disabled;
}

function updateLayout() {
  const matchCard = $("matchCard");
  const battlePanel = $("battlePanel");
  const logPanel = $("logPanel");
  // 目前改回三个区域同时显示，不再做布局切换
  if (matchCard) matchCard.style.display = "";
  if (battlePanel) battlePanel.style.display = "";
  if (logPanel) logPanel.style.display = "";
}

function resetRoundUI() {
  state.selected = [];
  state.buffs = [];
  state.buffMode = null;
  state.submitted = false;
  $("slot1").textContent = "点击左侧角色卡片加入";
  $("slot2").textContent = "-";
  $("slot3").textContent = "-";
  $("buffList").innerHTML = "";
  $("buffLeft").textContent = "剩余：4";
  $("submitBtn").disabled = true;
  $("resetBtn").disabled = true;
  showError("");
  renderPool();
}

function tagLabels(tags) {
  const map = {
    1: "自爆",
    2: "复活",
    3: "剥夺",
    4: "护盾",
    5: "重装",
    6: "穿透",
    7: "狂暴",
    8: "中毒",
    9: "群伤",
  };
  return (tags || []).map((t) => map[t] || `T${t}`);
}

function renderPool() {
  const grid = $("poolGrid");
  grid.innerHTML = "";
  state.pool.forEach((role, idx) => {
    const card = document.createElement("div");
    card.className = "role" + (state.selected.includes(idx + 1) ? " selected" : "");
    card.onclick = () => toggleSelect(idx + 1);

    const name = document.createElement("div");
    name.className = "name";
    name.textContent = role.name;

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.innerHTML = `
      <span class="badge">ATK ${role.atk}</span>
      <span class="badge">HP ${role.hp}</span>
      <span class="badge">${tagLabels(role.tags).join(" / ") || "无标签"}</span>
    `;

    card.appendChild(name);
    card.appendChild(meta);
    grid.appendChild(card);
  });
}

function updateTeamSlots() {
  const slots = [$("slot1"), $("slot2"), $("slot3")];
  for (let i = 0; i < 3; i++) {
    const idx = state.selected[i];
    if (!idx) {
      slots[i].textContent = i === 0 ? "点击左侧角色卡片加入" : "-";
    } else {
      const role = state.pool[idx - 1];
      slots[i].textContent = `${role.name}（ATK ${role.atk} / HP ${role.hp}）`;
    }
  }
}

function refreshBuffUI() {
  $("buffLeft").textContent = `剩余：${Math.max(0, 4 - state.buffs.length)}`;
  const list = $("buffList");
  list.innerHTML = "";
  state.buffs.forEach((b, i) => {
    const item = document.createElement("div");
    item.className = "buff-item";
    const typeText = b[1] === 1 ? "ATK +2" : "HP +4";
    item.innerHTML = `<div>第${b[0]}位：${typeText}</div>`;
    const btn = document.createElement("button");
    btn.textContent = "删除";
    btn.onclick = () => {
      state.buffs.splice(i, 1);
      refreshBuffUI();
      validateSubmit();
    };
    item.appendChild(btn);
    list.appendChild(item);
  });
}

function validateSubmit() {
  const ok = state.selected.length === 3 && state.buffs.length === 4 && !state.submitted;
  $("submitBtn").disabled = !ok;
  $("resetBtn").disabled = state.selected.length === 0 && state.buffs.length === 0;
}

function toggleSelect(index1) {
  if (state.submitted) return;
  showError("");
  const i = state.selected.indexOf(index1);
  if (i >= 0) {
    state.selected.splice(i, 1);
  } else {
    if (state.selected.length >= 3) return;
    state.selected.push(index1);
  }

  // 自爆必须首位：如果已选自爆但不在第1位，直接提示（后端也会再校验）
  if (state.selected.length > 0) {
    const roles = state.selected.map((idx) => state.pool[idx - 1]);
    const anyBomb = roles.some((r) => (r.tags || []).includes(1));
    const firstBomb = roles[0] && (roles[0].tags || []).includes(1);
    if (anyBomb && !firstBomb) {
      showError("规则：自爆步兵只能放在队伍首位（第1位）。请调整选择顺序。");
    }
  }

  updateTeamSlots();
  refreshBuffUI();
  validateSubmit();
  renderPool();
}

function addBuffToSlot(slotNo) {
  if (state.submitted) return;
  if (!state.buffMode) return;
  if (state.buffs.length >= 4) return;
  if (slotNo < 1 || slotNo > 3) return;
  if (state.selected.length < slotNo) return; // 未选到该位置
  state.buffs.push([slotNo, state.buffMode]);
  refreshBuffUI();
  validateSubmit();
}

function handleServer(msg) {
  if (msg.type === "match_wait") {
    // 随机匹配：创建了新的随机房间，前端再通过 join_room 进入
    state.room = msg.room;
    const name = $("nameInput").value || "玩家";
    appendLog(`已创建随机房间 ${msg.room}，等待对手加入…`);
    send({ type: "join_room", name, room: msg.room });
    return;
  }
  if (msg.type === "match_found") {
    // 随机匹配：找到了已有的随机房间，立即加入
    state.room = msg.room;
    const name = $("nameInput").value || "玩家";
    appendLog(`为你找到随机房间 ${msg.room}，正在加入…`);
    send({ type: "join_room", name, room: msg.room });
    return;
  }
  if (msg.type === "waiting") {
    state.waiting = true;
    state.inRoom = false;
    refreshMatchButtons();
    appendLog("进入等待：%s".replace("%s", msg.mode === "random" ? "随机匹配" : `房间 ${msg.room}`));
    updateLayout();
    return;
  }
  if (msg.type === "joined") {
    hideResultOverlay();
    state.room = msg.room;
    state.player = msg.player;
    state.myName = ($("nameInput") && $("nameInput").value) || "玩家";
    saveNameToStorage(state.myName);
    state.waiting = true;
    state.inRoom = false;
    setPill($("roomPill"), `房间：${msg.room}`, "muted");
    $("playerNo").textContent = String(msg.player);
    refreshMatchButtons();
    clearLog("");
    appendLog(`已加入房间 ${msg.room}，你是玩家 ${msg.player}`);
    updateLayout();
    return;
  }
  if (msg.type === "matched") {
    hideResultOverlay();
    state.room = msg.room;
    state.player = msg.player;
    state.opponent = msg.opponent;
    state.myName = ($("nameInput") && $("nameInput").value) || "玩家";
    saveNameToStorage(state.myName);
    state.waiting = false;
    state.inRoom = true;
    setPill($("roomPill"), `房间：${msg.room}`, "muted");
    $("playerNo").textContent = String(msg.player);
    $("opponentName").textContent = msg.opponent || "-";
    refreshMatchButtons();
    clearLog("");
    appendLog(`匹配成功：房间 ${msg.room}，对手是 ${state.opponent}`);
    updateLayout();
    return;
  }
  if (msg.type === "round_start") {
    hideResultOverlay();
    state.round = msg.round;
    state.pool = msg.pool || [];
    state.score = msg.score || [0, 0];
    state.waiting = false;
    state.inRoom = true;
    if (state.round === 1) {
      state.currentMatch = {
        rounds: [],
        score: [0, 0],
        myName: state.myName || ($("nameInput") && $("nameInput").value) || "我方",
        opponent: state.opponent || "对方",
      };
    }
    $("roundNo").textContent = String(state.round);
    setPill($("scorePill"), `比分：${state.score[0]} - ${state.score[1]}`, "muted");
    appendLog(`\n回合 ${state.round} 开始：请选角并配置增益`);
    resetRoundUI();
    updateLayout();
    return;
  }
  if (msg.type === "submitted") {
    state.submitted = true;
    $("submitBtn").disabled = true;
    appendLog(`已提交回合 ${msg.round}。`);
    return;
  }
  if (msg.type === "opponent_submitted") {
    appendLog(`对手已提交回合 ${msg.round} 的出阵信息`);
    return;
  }
  if (msg.type === "round_result") {
    state.score = msg.score || state.score;
    setPill($("scorePill"), `比分：${state.score[0]} - ${state.score[1]}`, "muted");
    const texts = (msg.texts || []).slice(0, HISTORY_TEXTS_PER_ROUND);
    (msg.texts || []).forEach((t) => appendLog(replacePlayerNames(t)));
    setEventsRaw(msg.events || []);
    const winnerLabel = msg.winner == null ? "" : replacePlayerNames("玩家" + msg.winner);
    appendLog(`\n回合 ${msg.round} 结束：胜者 ${winnerLabel}`);
    if (state.currentMatch) {
      state.currentMatch.rounds.push({
        round: msg.round,
        winner: msg.winner,
        texts: texts.map((t) => replacePlayerNames(t)),
      });
      state.currentMatch.score = state.score.slice();
    }
    if (msg.round != null && msg.winner != null && state.player != null) {
      const myWin = Number(msg.winner) === Number(state.player);
      showResultOverlay(
        `回合 ${msg.round} 结束`,
        myWin ? "本局你方胜利！" : "本局对方胜利。",
        myWin
      );
    }
    state.submitted = false;
    return;
  }
  if (msg.type === "match_end") {
    appendLog(replacePlayerNames(`\n对局结束：最终胜者 玩家${msg.winner}（比分 ${msg.score[0]} - ${msg.score[1]}）`));
    if (msg.winner != null && state.player != null) {
      const myWin = Number(msg.winner) === Number(state.player);
      showResultOverlay("对局结束", myWin ? "你方胜利！" : "对方胜利。", myWin);
      if (state.currentMatch) {
        state.currentMatch.result = myWin ? "win" : "loss";
        state.currentMatch.score = (msg.score || state.score).slice();
        state.currentMatch.at = Date.now();
        pushMatchToHistory(state.currentMatch);
        state.currentMatch = null;
      }
    }
    return;
  }
  if (msg.type === "opponent_left") {
    appendLog("对手已离开房间。如需继续游戏，请点击“离开本局”返回匹配。");
    // 不自动重新匹配，保持在当前房间状态，交由玩家主动离开
    return;
  }
  if (msg.type === "left_room") {
    if (msg.reason !== "match_end") hideResultOverlay();
    clearLog("连接后开始匹配");
    if (msg.reason === "opponent_left") {
      showResultOverlay("对手已离开房间", "你已自动退出本局，请重新匹配。", null);
      appendLog("对手已离开，你已自动退出本局，可重新匹配。");
    } else if (msg.reason !== "match_end") {
      appendLog("你已离开本局，回到匹配界面。");
    } else if (msg.reason === "match_end") {
      appendLog("对局结束，已退出房间，可重新匹配。");
    }
    state.inRoom = false;
    state.waiting = false;
    state.round = 0;
    state.pool = [];
    state.opponent = null;
    state.myName = "";
    state.currentMatch = null;
    resetRoundUI();
    refreshMatchButtons();
    updateLayout();
    return;
  }
  if (msg.type === "error") {
    showError(msg.message || "发生错误");
    appendLog(`错误：${msg.message || "发生错误"}`);
    return;
  }
}

// UI bindings
function bind() {
  const overlay = $("resultOverlay");
  if (overlay) {
    overlay.setAttribute("hidden", "");
    overlay.style.display = "none";
  }
  loadStoredName();
  renderHistory();
  connect();

  const priorityTagsBox = $("priorityTagsBox");
  if (priorityTagsBox) {
    [1, 2, 3, 4, 5, 6, 7, 8, 9].forEach((tagId) => {
      const label = document.createElement("label");
      label.className = "checkbox-label";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = String(tagId);
      label.appendChild(cb);
      label.appendChild(document.createTextNode(" " + (TAG_LABELS[tagId] || "标签" + tagId)));
      priorityTagsBox.appendChild(label);
    });
  }

  function requirePlayerName() {
    const name = ($("nameInput") && $("nameInput").value || "").trim();
    if (!name) {
      showResultOverlay("请填写玩家名", "请先输入你的昵称后再进行匹配或加入房间。", null);
      return null;
    }
    return name;
  }

  $("randomBtn").onclick = () => {
    showError("");
    const name = requirePlayerName();
    if (name === null) return;
    if (state.waiting || state.inRoom) {
      showError("已在匹配或房间中，不能再次随机匹配。");
      return;
    }
    resetRoundUI();
    state.waiting = true;
    refreshMatchButtons();
    send({ type: "join_random", name });
  };

  $("createRoomBtn").onclick = () => {
    showError("");
    const name = requirePlayerName();
    if (name === null) return;
    if (state.waiting || state.inRoom) {
      showError("已在匹配或房间中，不能再次创建房间。");
      return;
    }
    resetRoundUI();
    state.waiting = true;
    refreshMatchButtons();
    send({ type: "join_room", name, room: "" });
  };

  $("joinRoomBtn").onclick = () => {
    showError("");
    const name = requirePlayerName();
    if (name === null) return;
    const room = ($("roomInput").value || "").trim();
    if (state.waiting || state.inRoom) {
      showError("已在匹配或房间中，不能再次加入房间。");
      return;
    }
    resetRoundUI();
    state.waiting = true;
    refreshMatchButtons();
    send({ type: "join_room", name, room });
  };

  $("buffAtkBtn").onclick = () => {
    state.buffMode = 1;
    appendLog("已选择增益：ATK +2（点击队伍槽位添加）");
  };
  $("buffHpBtn").onclick = () => {
    state.buffMode = 2;
    appendLog("已选择增益：HP +4（点击队伍槽位添加）");
  };

  document.querySelectorAll(".slot").forEach((el) => {
    el.onclick = () => {
      const slotNo = parseInt(el.getAttribute("data-slot"), 10);
      addBuffToSlot(slotNo);
    };
  });

  $("resetBtn").onclick = () => {
    resetRoundUI();
    appendLog("已重置本回合选择");
  };

  $("leaveBtn").onclick = () => {
    showError("");
    if (!state.inRoom && !state.waiting) {
      appendLog("当前不在任何房间，无需离开。");
      return;
    }
    send({ type: "leave_room" });
  };

  $("resultCloseBtn").onclick = () => hideResultOverlay();

  $("submitBtn").onclick = () => {
    showError("");
    if (state.selected.length !== 3) {
      showError("必须选择恰好 3 名角色。");
      return;
    }
    if (state.buffs.length !== 4) {
      showError("必须使用完 4 次增益才能提交。");
      return;
    }

    // 前端做一次自爆首位校验（后端会再次校验）
    const roles = state.selected.map((idx) => state.pool[idx - 1]);
    const anyBomb = roles.some((r) => (r.tags || []).includes(1));
    const firstBomb = roles[0] && (roles[0].tags || []).includes(1);
    if (anyBomb && !firstBomb) {
      showError("规则：自爆步兵只能放在队伍首位（第1位）。");
      return;
    }

    state.submitted = true;
    $("submitBtn").disabled = true;
    const basicEl = document.querySelector('input[name="basicStrategy"]:checked');
    const basic = (basicEl && basicEl.value) || "low_hp";
    const priorityTags = [];
    document.querySelectorAll('#priorityTagsBox input[type="checkbox"]:checked').forEach((cb) => {
      const v = parseInt(cb.value, 10);
      if (!isNaN(v)) priorityTags.push(v);
    });
    send({
      type: "submit_round",
      round: state.round,
      selection: state.selected,
      gains: state.buffs,
      strategy: { basic, priority_tags: priorityTags },
    });
  };
}

bind();

