import * as THREE from 'three';
import { initScene, getScene, startRenderLoop, stopRenderLoop, addUpdateCallback } from './scene.js';
import { createBattlefield, updateBattlefield, TEAM_POSITIONS, OPPONENT_POSITION_INDEX } from './battlefield.js';
import { BattleCharacter, showDamageNumber, roleIdFromName } from './characters.js';
import { updateEffects } from './effects.js';
import { BattleAnimator } from './animations.js';
import { getState, on } from '../../core/state.js';

let initialized = false;
let container = null;
let sceneRef = null;
let clockTime = 0;

// Character instances on the battlefield
let playerChars = [null, null, null];
let opponentChars = [null, null, null];
let animator = null;
let onBattleComplete = null;

export function setOnBattleComplete(cb) { onBattleComplete = cb; }

export function initMode3D(containerEl) {
  if (initialized) return;
  container = containerEl;
  initialized = true;

  const { scene } = initScene(container);
  sceneRef = scene;

  createBattlefield(scene);

  addUpdateCallback((delta) => {
    clockTime += delta;
    updateBattlefield(scene, clockTime);
    updateEffects(delta);

    // Update character animations
    [...playerChars, ...opponentChars].forEach((c) => {
      if (c) c.update(delta);
    });
  });

  startRenderLoop();

  // Listen for round results to trigger battle animation
  on('roundResult', async (state) => {
    // #region agent log
    fetch('http://127.0.0.1:7555/ingest/46b5b799-f3b7-421a-9d0d-c25dc6853cad',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2ec97e'},body:JSON.stringify({sessionId:'2ec97e',location:'mode3d/index.js:43',message:'mode3d roundResult listener',data:{hasRoundResult:!!state.roundResult,gameMode:state.gameMode,hasScene:!!sceneRef,playerCharsLoaded:playerChars.filter(Boolean).length,opponentCharsLoaded:opponentChars.filter(Boolean).length},timestamp:Date.now(),hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    if (!state.roundResult || state.gameMode !== '3d') return;
    // #region agent log
    fetch('http://127.0.0.1:7555/ingest/46b5b799-f3b7-421a-9d0d-c25dc6853cad',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2ec97e'},body:JSON.stringify({sessionId:'2ec97e',location:'mode3d/index.js:46',message:'calling playBattle',data:{eventsCount:(state.roundResult.events||[]).length},timestamp:Date.now(),hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    try {
      await playBattle(state.roundResult, state);
    } catch(err) {
      // #region agent log
      fetch('http://127.0.0.1:7555/ingest/46b5b799-f3b7-421a-9d0d-c25dc6853cad',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2ec97e'},body:JSON.stringify({sessionId:'2ec97e',location:'mode3d/index.js:playBattleError',message:'playBattle error',data:{error:String(err),stack:err?.stack?.slice(0,300)},timestamp:Date.now(),hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      console.error('Battle animation error:', err);
    }
    // #region agent log
    fetch('http://127.0.0.1:7555/ingest/46b5b799-f3b7-421a-9d0d-c25dc6853cad',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2ec97e'},body:JSON.stringify({sessionId:'2ec97e',location:'mode3d/index.js:battleDone',message:'battle done, calling onBattleComplete',data:{hasCallback:!!onBattleComplete},timestamp:Date.now(),hypothesisId:'F'})}).catch(()=>{});
    // #endregion
    if (onBattleComplete) onBattleComplete();
  });
}

export function showMode3D() {
  if (container) container.style.display = '';
}

export function hideMode3D() {
  if (container) container.style.display = 'none';
}

export async function placeTeams(pool, selected, gains, opponentData) {
  if (!sceneRef) return;

  // Clear existing characters
  clearCharacters();

  const state = getState();
  const myTeamIndex = (state.player || 1) - 1; // 0 or 1
  const oppTeamIndex = 1 - myTeamIndex;

  // Build player team from selection
  for (let i = 0; i < 3; i++) {
    const poolIdx = selected[i] - 1;
    if (poolIdx < 0 || poolIdx >= pool.length) continue;

    const roleData = { ...pool[poolIdx] };
    // Apply gains
    gains.forEach(([slot, type]) => {
      if (slot === i + 1) {
        if (type === 1) roleData.atk += 2;
        else if (type === 2) roleData.hp += 4;
      }
    });

    const char = new BattleCharacter(roleData, myTeamIndex, i);
    await char.load(sceneRef, TEAM_POSITIONS.player[i]);
    playerChars[i] = char;
  }

  // For opponent, we might not have their data yet until round_result
  // They'll be placed when battle starts
}

export async function placeOpponentTeam(events) {
  // Extract opponent team info from events
  // This is a simplification - in a full implementation, the server would
  // send opponent team data as part of round_result
}

function extractOpponentNames(events, oppTeamIndex) {
  const names = new Set();
  for (const evt of events) {
    const type = evt[0];
    if (type === 'HIT' || type === 'AOE_HIT' || type === 'PIERCE') {
      if (evt[1] === oppTeamIndex) names.add(evt[2]);
      if (evt[3] === oppTeamIndex) names.add(evt[4]);
    } else if (type === 'DIE' || type === 'SKIP_DEAD' || type === 'POISON_TICK') {
      if (evt[1] === oppTeamIndex) names.add(evt[2]);
    } else if (type === 'SELF_DESTRUCT' || type === 'ARMOR_REDUCE') {
      if (evt[1] === oppTeamIndex) names.add(evt[2]);
    } else if (type === 'REVIVE') {
      if (evt[1] === oppTeamIndex) names.add(evt[2]);
    } else if (type === 'POISON_APPLY') {
      if (evt[1] === oppTeamIndex) names.add(evt[2]);
      if (evt[3] === oppTeamIndex) names.add(evt[4]);
    } else if (type === 'SHIELD_TRANSFER') {
      if (evt[1] === oppTeamIndex) { names.add(evt[2]); names.add(evt[3]); }
    } else if (type === 'CURSE_REMOVE_TAG') {
      if (evt[3] === oppTeamIndex) names.add(evt[4]);
    }
  }
  return [...names].slice(0, 3);
}

export async function playBattle(roundResult, state) {
  if (!sceneRef) return;

  clearCharacters();

  const myTeamIndex = (state.player || 1) - 1;
  const oppTeamIndex = 1 - myTeamIndex;
  const pool = state.pool || [];
  const selected = state.selected || [];
  const gains = state.buffs || [];

  for (let i = 0; i < 3; i++) {
    const poolIdx = (selected[i] || 1) - 1;
    if (poolIdx < 0 || poolIdx >= pool.length) continue;
    const roleData = { ...pool[poolIdx] };
    gains.forEach(([slot, type]) => {
      if (slot === i + 1) {
        if (type === 1) roleData.atk += 2;
        else if (type === 2) roleData.hp += 4;
      }
    });
    const char = new BattleCharacter(roleData, myTeamIndex, i);
    await char.load(sceneRef, TEAM_POSITIONS.player[i]);
    playerChars[i] = char;
  }

  const oppNames = extractOpponentNames(roundResult.events, oppTeamIndex);
  for (let i = 0; i < Math.min(oppNames.length, 3); i++) {
    const name = oppNames[i];
    const roleData = { id: roleIdFromName(name), name, atk: 6, hp: 20, tags: [] };
    const char = new BattleCharacter(roleData, oppTeamIndex, i);
    const posIdx = OPPONENT_POSITION_INDEX[i];
    await char.load(sceneRef, TEAM_POSITIONS.opponent[posIdx]);
    opponentChars[i] = char;
  }

  const team0 = myTeamIndex === 0 ? playerChars : opponentChars;
  const team1 = myTeamIndex === 0 ? opponentChars : playerChars;

  // #region agent log
  fetch('http://127.0.0.1:7555/ingest/46b5b799-f3b7-421a-9d0d-c25dc6853cad',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2ec97e'},body:JSON.stringify({sessionId:'2ec97e',location:'mode3d/index.js:playBattle',message:'BattleAnimator ready',data:{team0Names:team0.filter(Boolean).map(c=>c.roleData.name),team1Names:team1.filter(Boolean).map(c=>c.roleData.name),eventsCount:(roundResult.events||[]).length,firstEvents:(roundResult.events||[]).slice(0,3)},timestamp:Date.now(),hypothesisId:'D'})}).catch(()=>{});
  // #endregion

  animator = new BattleAnimator(sceneRef, team0, team1, myTeamIndex);

  if (state.settings?.animationSpeed === 'fast') animator.speedMultiplier = 2;
  else if (state.settings?.animationSpeed === 'slow') animator.speedMultiplier = 0.5;

  await animator.playEvents(roundResult.events);
}

export function skipAnimation() {
  if (animator) animator.skip();
}

export function clearCharacters() {
  if (!sceneRef) return;
  [...playerChars, ...opponentChars].forEach((c) => {
    if (c) c.dispose(sceneRef);
  });
  playerChars = [null, null, null];
  opponentChars = [null, null, null];
  animator = null;
}
