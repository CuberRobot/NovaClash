import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

const MODEL_MAP = {
  1: 'warrior_a', 2: 'warrior_b', 3: 'warrior_c',
  4: 'bomber', 5: 'curse_mage', 6: 'necromancer',
  7: 'tank', 8: 'shield_deployer', 9: 'archer',
  10: 'berserker', 11: 'poison', 12: 'artillery',
};

const NAME_TO_ID = {
  '均衡战士A': 1, '均衡战士B': 2, '均衡战士C': 3,
  '自爆步兵': 4, '诅咒巫师': 5, '死灵法师': 6,
  '铁甲卫士': 7, '护盾部署者': 8, '风行射手': 9,
  '狂战士': 10, '毒药投手': 11, '重炮统领': 12,
};

export function roleIdFromName(name) {
  return NAME_TO_ID[name] || 1;
}

const loader = new GLTFLoader();
const modelCache = new Map();

export async function loadModel(roleId) {
  const filename = MODEL_MAP[roleId];
  if (!filename) return createFallbackModel(roleId);

  if (modelCache.has(roleId)) {
    const cached = modelCache.get(roleId);
    const instance = cached.scene.clone();
    instance.userData.animations = cached.animations;
    return instance;
  }

  return new Promise((resolve) => {
    loader.load(
      `/models/${filename}.glb`,
      (gltf) => {
        const model = gltf.scene;
        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        modelCache.set(roleId, { scene: model, animations: gltf.animations });

        const instance = model.clone();
        instance.userData.animations = gltf.animations;
        resolve(instance);
      },
      undefined,
      (err) => {
        console.warn(`Failed to load model for role ${roleId}:`, err);
        resolve(createFallbackModel(roleId));
      }
    );
  });
}

function createFallbackModel(roleId) {
  const group = new THREE.Group();
  const bodyGeo = new THREE.BoxGeometry(0.3, 0.6, 0.22);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x6070a0,
    flatShading: true,
    emissive: 0x303050,
    emissiveIntensity: 0.3,
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.5;
  group.add(body);

  const headGeo = new THREE.SphereGeometry(0.15, 5, 4);
  const head = new THREE.Mesh(headGeo, bodyMat);
  head.position.y = 0.95;
  group.add(head);

  group.userData.animations = [];
  return group;
}

export class BattleCharacter {
  constructor(roleData, teamIndex, positionIndex) {
    this.roleData = roleData;
    this.teamIndex = teamIndex;
    this.positionIndex = positionIndex;
    this.model = null;
    this.mixer = null;
    this.currentAction = null;
    this.hp = roleData.hp;
    this.maxHp = roleData.hp;
    this.atk = roleData.atk;
    this.alive = true;
    this.healthBarEl = null;
    this.healthBar = null;
    this.nameLabel = null;
  }

  async load(scene, position) {
    this.model = await loadModel(this.roleData.id);
    if (!this.model) return;

    if (this.model.parent) this.model.parent.remove(this.model);
    this.model.position.copy(position);
    this.model.userData.characterRef = this;
    this.model.visible = true;

    if (this.teamIndex === 1) this.model.rotation.y = Math.PI;

    scene.add(this.model);
    this.model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.model);
    const platformTop = 0;
    const feetClearance = 0.03;
    this.model.position.y = platformTop + feetClearance - box.min.y;
    this.model.userData.groundY = this.model.position.y;

    // Set up animation mixer
    const anims = this.model.userData.animations;
    if (anims && anims.length > 0) {
      this.mixer = new THREE.AnimationMixer(this.model);
      this.playAnimation('idle', true);
    }

    // Create health bar + name label
    this.createUI();
  }

  createUI() {
    if (!this.model) return;
    if (this.nameLabel) return;

    const container = document.createElement('div');
    container.className = 'char-ui';
    container.dataset.characterId = `${this.teamIndex}-${this.positionIndex}-${this.roleData.name}`;

    const name = document.createElement('div');
    name.className = 'char-name';
    name.textContent = this.roleData.name;
    container.appendChild(name);

    const hpBar = document.createElement('div');
    hpBar.className = 'char-hp-bar';
    const hpFill = document.createElement('div');
    hpFill.className = 'char-hp-fill';
    hpFill.style.width = '100%';
    hpBar.appendChild(hpFill);
    container.appendChild(hpBar);

    const hpText = document.createElement('div');
    hpText.className = 'char-hp-text';
    hpText.textContent = `${this.hp}/${this.maxHp}`;
    container.appendChild(hpText);

    this.healthBarEl = hpFill;
    this.hpTextEl = hpText;

    const label = new CSS2DObject(container);
    label.position.set(0, 1.6, 0);
    this.model.add(label);
    this.nameLabel = label;
  }

  updateHP(newHp) {
    this.hp = Math.max(0, newHp);
    if (this.healthBarEl) {
      const pct = Math.max(0, this.hp / this.maxHp * 100);
      this.healthBarEl.style.width = pct + '%';
      if (pct < 30) this.healthBarEl.style.background = '#e84040';
      else if (pct < 60) this.healthBarEl.style.background = '#e8a040';
      else this.healthBarEl.style.background = '#40d890';
    }
    if (this.hpTextEl) {
      this.hpTextEl.textContent = `${this.hp}/${this.maxHp}`;
    }
  }

  playAnimation(name, loop = false) {
    if (!this.mixer) return null;

    const anims = this.model.userData.animations;
    const clip = anims.find((a) => a.name === name);
    if (!clip) return null;

    if (this.currentAction) {
      this.currentAction.fadeOut(0.2);
    }

    const action = this.mixer.clipAction(clip);
    action.reset();
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce);
    action.clampWhenFinished = !loop;
    action.fadeIn(0.2);
    action.play();
    this.currentAction = action;
    return action;
  }

  setDead() {
    this.alive = false;
    this.hp = 0;
    this.updateHP(0);
    this.playAnimation('death');
  }

  setRevived(hp) {
    this.alive = true;
    this.hp = hp;
    this.updateHP(hp);
    if (this.model) this.model.visible = true;
    this.playAnimation('idle', true);
  }

  update(delta) {
    if (this.mixer) this.mixer.update(delta);
  }

  dispose(scene) {
    if (this.model) {
      if (this.model.parent) this.model.parent.remove(this.model);
      this.model = null;
    }
  }
}

export function showDamageNumber(scene, position, damage, color = '#ffcc44') {
  const div = document.createElement('div');
  div.className = 'damage-number';
  div.textContent = `-${damage}`;
  div.style.color = color;

  const label = new CSS2DObject(div);
  label.position.copy(position);
  label.position.y += 2;
  scene.add(label);

  let elapsed = 0;
  const duration = 1.2;

  function animate() {
    elapsed += 0.016;
    label.position.y += 0.02;
    div.style.opacity = String(Math.max(0, 1 - elapsed / duration));

    if (elapsed < duration) {
      requestAnimationFrame(animate);
    } else {
      scene.remove(label);
      div.remove();
    }
  }
  requestAnimationFrame(animate);
}

export function showHealNumber(scene, position, amount) {
  showDamageNumber(scene, position, -amount, '#40d890');
  const div = document.querySelector('.damage-number:last-child');
  if (div) div.textContent = `+${amount}`;
}
