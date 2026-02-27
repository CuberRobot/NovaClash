import * as THREE from 'three';
import { TEAM_POSITIONS } from './battlefield.js';
import {
  showDamageNumber, showHealNumber,
} from './characters.js';
import {
  flashTrail, impactParticles, explosionEffect,
  reviveEffect, aoeWave, projectile, shieldFlash,
  poisonBubbles,
} from './effects.js';
import { TAG_IDS, RANGED_TAGS } from '../../core/constants.js';

/**
 * Plays the battle animation sequence from an events list.
 * Returns a promise that resolves when all animations are done.
 */
export class BattleAnimator {
  constructor(scene, playerChars, opponentChars, playerIndex) {
    this.scene = scene;
    this.playerIndex = playerIndex; // 0 or 1 (which team is "me")
    this.chars = [playerChars, opponentChars]; // [team0, team1]
    this.queue = [];
    this.playing = false;
    this.skipped = false;
    this.speedMultiplier = 1.0;
    this.onEventPlayed = null;
  }

  getChar(teamI, name) {
    const team = this.chars[teamI];
    if (!team) return null;
    return team.find((c) => c && c.roleData.name === name) || null;
  }

  getCharByIndex(teamI, posIndex) {
    const team = this.chars[teamI];
    return team ? team[posIndex] : null;
  }

  getPosition(teamI, posIndex) {
    const side = teamI === this.playerIndex ? 'player' : 'opponent';
    return TEAM_POSITIONS[side][posIndex];
  }

  getCharPosition(char) {
    if (char && char.model) return char.model.position.clone();
    return new THREE.Vector3(0, 0, 0);
  }

  async playEvents(events) {
    this.queue = [...events];
    this.playing = true;
    this.skipped = false;

    for (let i = 0; i < this.queue.length; i++) {
      if (this.skipped) break;
      const evt = this.queue[i];
      try {
        await this.playEvent(evt);
      } catch (e) {
        console.warn('Animation error for event:', evt, e);
      }
      if (this.onEventPlayed) this.onEventPlayed(evt, i, this.queue.length);
    }

    this.playing = false;
  }

  skip() {
    this.skipped = true;
  }

  wait(ms) {
    if (this.skipped) return Promise.resolve();
    return new Promise((r) => setTimeout(r, ms / this.speedMultiplier));
  }

  async playEvent(evt) {
    const type = evt[0];

    switch (type) {
      case 'FIRST_STRIKE':
        await this.wait(300);
        break;

      case 'ROUND':
        await this.wait(500);
        break;

      case 'HIT':
        await this.animateHit(evt);
        break;

      case 'SELF_DESTRUCT':
        await this.animateSelfDestruct(evt);
        break;

      case 'SHIELD_TRANSFER':
        await this.animateShieldTransfer(evt);
        break;

      case 'ARMOR_REDUCE':
        await this.animateArmorReduce(evt);
        break;

      case 'PIERCE':
        await this.animatePierce(evt);
        break;

      case 'AOE_HIT':
        await this.animateAoeHit(evt);
        break;

      case 'POISON_APPLY':
        await this.animatePoisonApply(evt);
        break;

      case 'POISON_TICK':
        await this.animatePoisonTick(evt);
        break;

      case 'DIE':
        await this.animateDie(evt);
        break;

      case 'REVIVE':
        await this.animateRevive(evt);
        break;

      case 'CURSE_REMOVE_TAG':
        await this.animateCurse(evt);
        break;

      case 'SKIP_DEAD':
        await this.wait(100);
        break;

      default:
        await this.wait(200);
    }
  }

  isRanged(char) {
    if (!char || !char.roleData) return false;
    return (char.roleData.tags || []).some((t) => RANGED_TAGS.includes(t));
  }

  async animateHit(evt) {
    const [, atkTeam, atkName, defTeam, defName, dmg, hpAfter] = evt;
    const attacker = this.getChar(atkTeam, atkName);
    const defender = this.getChar(defTeam, defName);
    if (!attacker || !defender) { await this.wait(300); return; }

    const atkPos = this.getCharPosition(attacker);
    const defPos = this.getCharPosition(defender);

    const faceDir = new THREE.Vector3().subVectors(defPos, atkPos).normalize();
    const faceY = Math.atan2(faceDir.x, -faceDir.z);

    if (this.isRanged(attacker)) {
      attacker.model.rotation.y = faceY;
      attacker.playAnimation('attack');
      await this.wait(200);
      const color = (attacker.roleData.tags || []).includes(TAG_IDS.AOE) ? 0xe8c040 : 0x40d0e0;
      await projectile(this.scene, atkPos, defPos, color);
      defender.playAnimation('hit');
      showDamageNumber(this.scene, defPos, dmg);
      impactParticles(this.scene, defPos, color, 10);
    } else {
      const origPos = attacker.model.position.clone();
      const origRotY = attacker.model.rotation.y;
      const attackPos = defPos.clone().sub(faceDir.multiplyScalar(0.4));
      attackPos.y = attacker.model.userData.groundY ?? origPos.y;

      attacker.playAnimation('attack');
      await this.wait(80);

      attacker.model.visible = false;
      await this.wait(50);
      attacker.model.position.copy(attackPos);
      attacker.model.rotation.y = faceY;
      attacker.model.visible = true;

      flashTrail(this.scene, atkPos, defPos, 0xffcc44, 0.12);
      defender.playAnimation('hit');
      showDamageNumber(this.scene, defPos, dmg);
      impactParticles(this.scene, defPos, 0xffcc44, 12);
      await this.wait(320);

      attacker.model.visible = false;
      await this.wait(40);
      attacker.model.position.copy(origPos);
      attacker.model.rotation.y = origRotY;
      attacker.model.visible = true;
      attacker.playAnimation('idle', true);
    }

    defender.updateHP(hpAfter);
    await this.wait(200);
    defender.playAnimation('idle', true);
  }

  async animateSelfDestruct(evt) {
    const [, teamI, name] = evt;
    const bomber = this.getChar(teamI, name);
    if (!bomber) { await this.wait(300); return; }

    const bomberPos = this.getCharPosition(bomber);

    // Find target (opposite team, first alive)
    const otherTeam = 1 - teamI;
    const target = this.chars[otherTeam]?.find((c) => c && c.alive);

    if (target) {
      const targetPos = this.getCharPosition(target);
      // Rush toward target
      const steps = 10;
      const groundY = bomber.model.userData.groundY ?? bomberPos.y;
      for (let i = 0; i < steps; i++) {
        if (this.skipped) break;
        const t = (i + 1) / steps;
        bomber.model.position.lerpVectors(bomberPos, targetPos, t);
        bomber.model.position.y = groundY;
        await this.wait(30);
      }
    }

    // Explosion
    explosionEffect(this.scene, bomber.model.position.clone(), 0xff6020, 1.5);
    bomber.setDead();
    if (bomber.model) bomber.model.visible = false;
    await this.wait(600);
  }

  async animateShieldTransfer(evt) {
    const [, teamI, shieldName, protectedName, transfer, left] = evt;
    const shielder = this.getChar(teamI, shieldName);
    const protected_ = this.getChar(teamI, protectedName);
    if (protected_) {
      shieldFlash(this.scene, this.getCharPosition(protected_));
    }
    await this.wait(400);
  }

  async animateArmorReduce(evt) {
    const [, teamI, name, before, after] = evt;
    const char = this.getChar(teamI, name);
    if (char && char.model) {
      // Flash the model with blue-white to show armor activation
      impactParticles(this.scene, this.getCharPosition(char), 0x7080d8, 6);
    }
    await this.wait(300);
  }

  async animatePierce(evt) {
    const [, atkTeam, atkName, defTeam, defName, dmg] = evt;
    const attacker = this.getChar(atkTeam, atkName);
    const defender = this.getChar(defTeam, defName);
    if (!defender) { await this.wait(300); return; }

    const atkPos = attacker ? this.getCharPosition(attacker) : new THREE.Vector3();
    const defPos = this.getCharPosition(defender);

    await projectile(this.scene, atkPos, defPos, 0x60e8f0, 10);
    defender.playAnimation('hit');
    showDamageNumber(this.scene, defPos, dmg, '#60e8f0');
    impactParticles(this.scene, defPos, 0x60e8f0, 8);
    await this.wait(300);
    defender.playAnimation('idle', true);
  }

  async animateAoeHit(evt) {
    const [, atkTeam, atkName, defTeam, defName, dmg] = evt;
    const attacker = this.getChar(atkTeam, atkName);
    const defender = this.getChar(defTeam, defName);

    if (attacker) {
      attacker.playAnimation('attack');
      await this.wait(200);
      aoeWave(this.scene, this.getCharPosition(attacker), 0xe8c040);
    }

    if (defender) {
      defender.playAnimation('hit');
      const defPos = this.getCharPosition(defender);
      showDamageNumber(this.scene, defPos, dmg, '#e8c040');
      impactParticles(this.scene, defPos, 0xe8c040, 8);
    }

    await this.wait(400);
    if (attacker) attacker.playAnimation('idle', true);
    if (defender) defender.playAnimation('idle', true);
  }

  async animatePoisonApply(evt) {
    const [, atkTeam, atkName, defTeam, defName, pdmg, turns] = evt;
    const attacker = this.getChar(atkTeam, atkName);
    const defender = this.getChar(defTeam, defName);

    if (attacker) {
      attacker.playAnimation('attack');
      await this.wait(200);
    }

    if (defender) {
      const defPos = this.getCharPosition(defender);
      if (attacker) {
        await projectile(this.scene, this.getCharPosition(attacker), defPos, 0x40c060, 6);
      }
      poisonBubbles(this.scene, defPos, 1.5);
    }

    await this.wait(500);
    if (attacker) attacker.playAnimation('idle', true);
  }

  async animatePoisonTick(evt) {
    const [, teamI, name, dmg, hpAfter] = evt;
    const char = this.getChar(teamI, name);
    if (char) {
      const pos = this.getCharPosition(char);
      poisonBubbles(this.scene, pos, 0.8);
      showDamageNumber(this.scene, pos, dmg, '#40c060');
      char.updateHP(hpAfter);
    }
    await this.wait(400);
  }

  async animateDie(evt) {
    const [, teamI, name, cause] = evt;
    const char = this.getChar(teamI, name);
    if (char) {
      char.setDead();
      const pos = this.getCharPosition(char);
      const color = cause === 'poison' ? 0x40c060 : 0xffcc44;
      impactParticles(this.scene, pos, color, 20);
    }
    await this.wait(600);
  }

  async animateRevive(evt) {
    const [, teamI, name, hpAfter, left] = evt;
    const char = this.getChar(teamI, name);
    if (char) {
      const pos = this.getCharPosition(char);
      reviveEffect(this.scene, pos);
      await this.wait(800);
      char.setRevived(hpAfter);
    } else {
      await this.wait(500);
    }
  }

  async animateCurse(evt) {
    const [, teamI, casterName, enemyI, targetName] = evt;
    const caster = this.getChar(teamI, casterName);
    const target = this.getChar(enemyI, targetName);

    if (caster) {
      caster.playAnimation('attack');
      await this.wait(300);
    }

    if (target) {
      const tPos = this.getCharPosition(target);
      const cPos = caster ? this.getCharPosition(caster) : tPos;
      flashTrail(this.scene, cPos, tPos, 0x9040c0, 0.3);
      impactParticles(this.scene, tPos, 0x9040c0, 10);
    }

    await this.wait(500);
    if (caster) caster.playAnimation('idle', true);
  }
}
