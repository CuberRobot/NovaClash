import { getState, setState, saveNameToStorage, pushMatchToHistory, resetRound, resetMatch } from './state.js';

let ws = null;
let messageHandlers = [];
let pendingRoundStart = null;
let pendingLeftRoom = false;

export function onMessage(handler) {
  messageHandlers.push(handler);
  return () => {
    messageHandlers = messageHandlers.filter((h) => h !== handler);
  };
}

function notifyHandlers(msg) {
  for (const handler of messageHandlers) {
    handler(msg);
  }
}

export function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${protocol}://${location.host}/ws`);

  ws.onopen = () => {
    setState({ connected: true });
  };

  ws.onclose = () => {
    setState({ connected: false });
    setTimeout(() => connect(), 3000);
  };

  ws.onerror = () => {};

  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      handleServerMessage(msg);
      notifyHandlers(msg);
    } catch (e) {
      console.error('WS message parse error:', e);
    }
  };
}

export function send(payload) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(payload));
}

export function joinRandom(name) {
  send({ type: 'join_random', name });
}

export function joinRoom(name, room) {
  send({ type: 'join_room', name, room });
}

export function submitRound(selection, gains, strategy) {
  const state = getState();
  send({
    type: 'submit_round',
    round: state.round,
    selection,
    gains,
    strategy,
  });
}

export function leaveRoom() {
  send({ type: 'leave_room' });
}

function handleServerMessage(msg) {
  const state = getState();

  switch (msg.type) {
    case 'match_wait': {
      setState({ room: msg.room });
      const name = state.myName || '玩家';
      send({ type: 'join_room', name, room: msg.room });
      break;
    }

    case 'match_found': {
      setState({ room: msg.room });
      const name = state.myName || '玩家';
      send({ type: 'join_room', name, room: msg.room });
      break;
    }

    case 'waiting':
      setState({ waiting: true, inRoom: false });
      break;

    case 'joined':
      saveNameToStorage(state.myName);
      setState({
        room: msg.room,
        player: msg.player,
        waiting: true,
        inRoom: false,
      });
      break;

    case 'matched':
      saveNameToStorage(state.myName);
      setState({
        room: msg.room,
        player: msg.player,
        opponent: msg.opponent,
        waiting: false,
        inRoom: true,
      });
      break;

    case 'round_start': {
      // #region agent log
      fetch('http://127.0.0.1:7555/ingest/46b5b799-f3b7-421a-9d0d-c25dc6853cad',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2ec97e'},body:JSON.stringify({sessionId:'2ec97e',location:'ws.js:round_start',message:'round_start received',data:{msgRound:msg.round,currentRound:state.round,hasRoundResult:!!state.roundResult,buffered:!!state.roundResult},timestamp:Date.now(),hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      if (state.roundResult || state.matchEnd) {
        pendingRoundStart = msg;
        break;
      }
      processRoundStart(msg);
      break;
    }

    case 'submitted':
      setState({ submitted: true });
      break;

    case 'opponent_submitted':
      break;

    case 'round_result': {
      // #region agent log
      fetch('http://127.0.0.1:7555/ingest/46b5b799-f3b7-421a-9d0d-c25dc6853cad',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2ec97e'},body:JSON.stringify({sessionId:'2ec97e',location:'ws.js:150',message:'round_result received',data:{round:msg.round,eventsCount:(msg.events||[]).length,winner:msg.winner,currentRoundResult:state.roundResult},timestamp:Date.now(),hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      const cm = state.currentMatch;
      if (cm) {
        cm.rounds.push({
          round: msg.round,
          winner: msg.winner,
          texts: (msg.texts || []).slice(0, 40),
        });
        cm.score = (msg.score || state.score).slice();
      }
      setState({
        score: msg.score || state.score,
        roundResult: {
          round: msg.round,
          events: msg.events || [],
          texts: msg.texts || [],
          winner: msg.winner,
        },
        submitted: false,
        currentMatch: cm,
      });
      break;
    }

    case 'match_end': {
      const cm = state.currentMatch;
      const myWin = Number(msg.winner) === Number(state.player);
      if (cm) {
        cm.result = myWin ? 'win' : 'loss';
        cm.score = (msg.score || state.score).slice();
        cm.at = Date.now();
        pushMatchToHistory(cm);
      }
      setState({
        matchEnd: {
          winner: msg.winner,
          score: msg.score,
          myWin,
        },
        currentMatch: null,
      });
      break;
    }

    case 'left_room':
      if (state.matchEnd || state.roundResult) {
        pendingLeftRoom = true;
        break;
      }
      resetMatch();
      setState({ currentView: 'lobby' });
      break;

    case 'opponent_left':
      break;

    case 'error':
      console.error('Server error:', msg.message);
      break;
  }
}

function processRoundStart(msg) {
  const state = getState();
  const currentMatch = state.round === 0
    ? {
        rounds: [],
        score: [0, 0],
        myName: state.myName || '我方',
        opponent: state.opponent || '对方',
      }
    : state.currentMatch;

  resetRound();
  setState({
    round: msg.round,
    pool: msg.pool || [],
    score: msg.score || [0, 0],
    waiting: false,
    inRoom: true,
    currentMatch,
    currentView: 'game',
  });
}

export function flushPendingRoundStart() {
  if (pendingRoundStart) {
    // #region agent log
    fetch('http://127.0.0.1:7555/ingest/46b5b799-f3b7-421a-9d0d-c25dc6853cad',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2ec97e'},body:JSON.stringify({sessionId:'2ec97e',location:'ws.js:flushPendingRoundStart',message:'flushing buffered round_start',data:{round:pendingRoundStart.round},timestamp:Date.now(),hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    const msg = pendingRoundStart;
    pendingRoundStart = null;
    processRoundStart(msg);
  }
}

export function flushPendingLeftRoom() {
  if (pendingLeftRoom) {
    // #region agent log
    fetch('http://127.0.0.1:7555/ingest/46b5b799-f3b7-421a-9d0d-c25dc6853cad',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2ec97e'},body:JSON.stringify({sessionId:'2ec97e',location:'ws.js:flushPendingLeftRoom',message:'flushing buffered left_room',data:{},timestamp:Date.now(),hypothesisId:'G'})}).catch(()=>{});
    // #endregion
    pendingLeftRoom = false;
    resetMatch();
    setState({ currentView: 'lobby' });
  }
}
