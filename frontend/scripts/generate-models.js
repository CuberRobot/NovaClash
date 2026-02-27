/**
 * Low-Poly Character Model Generator for 星陨 CardGame
 * Generates 12 character .glb files with animations.
 * Uses named Object3D hierarchy for animation (not skeleton-based).
 */

import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Blob } from 'buffer';

// Polyfill browser APIs for Node.js
globalThis.Blob = Blob;
globalThis.FileReader = class FileReader {
  constructor() {
    this._listeners = {};
    this.result = null;
    this.onload = null;
    this.onloadend = null;
  }
  addEventListener(type, fn) {
    if (!this._listeners[type]) this._listeners[type] = [];
    this._listeners[type].push(fn);
  }
  removeEventListener(type, fn) {
    if (this._listeners[type]) {
      this._listeners[type] = this._listeners[type].filter((f) => f !== fn);
    }
  }
  _emit(type) {
    const evt = { target: this };
    if (this._listeners[type]) this._listeners[type].forEach((fn) => fn(evt));
    const prop = 'on' + type;
    if (this[prop]) this[prop](evt);
  }
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((ab) => {
      this.result = ab;
      this._emit('load');
      this._emit('loadend');
    });
  }
};
globalThis.document = { createElementNS: () => ({ style: {} }) };
globalThis.self = globalThis;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'models');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// ============================================================
// Helpers
// ============================================================

function makeFlat(geo) {
  if (geo.index) geo = geo.toNonIndexed();
  geo.computeVertexNormals();
  return geo;
}

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.55,
    metalness: opts.metalness ?? 0.25,
    flatShading: true,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.ei ?? 0,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1.0,
    side: opts.side ?? THREE.FrontSide,
  });
}

function box(w, h, d) { return makeFlat(new THREE.BoxGeometry(w, h, d)); }
function cyl(rT, rB, h, seg = 6) { return makeFlat(new THREE.CylinderGeometry(rT, rB, h, seg)); }
function sphere(r, ws = 5, hs = 4) { return makeFlat(new THREE.SphereGeometry(r, ws, hs)); }
function cone(r, h, seg = 5) { return makeFlat(new THREE.ConeGeometry(r, h, seg)); }
function octa(r) { return makeFlat(new THREE.OctahedronGeometry(r, 0)); }
function tetra(r) { return makeFlat(new THREE.TetrahedronGeometry(r, 0)); }

function q(euler) { return new THREE.Quaternion().setFromEuler(new THREE.Euler(...euler)).toArray(); }

// ============================================================
// Palettes
// ============================================================

const P = {
  wa: { body: 0x5a8ab0, armor: 0x7eb8d8, accent: 0xb0d4e8, wpn: 0xa0c8e0, eye: 0xeeff40 },
  wb: { body: 0x4a9a6a, armor: 0x7ed8a0, accent: 0xb0e8c8, wpn: 0x90d0b0, eye: 0xeeff40 },
  wc: { body: 0x7a5aa0, armor: 0xa07ed8, accent: 0xc8b0e8, wpn: 0xb098d0, eye: 0xeeff40 },
  bm: { body: 0xb04020, armor: 0xe85830, accent: 0xff9040, wpn: 0xff6020, eye: 0xff4040, crystal: 0xffaa30 },
  cu: { body: 0x4a1870, armor: 0x6a2c91, accent: 0x9040c0, wpn: 0x8030b0, eye: 0xc060ff },
  ne: { body: 0x3a1060, armor: 0x5a1a7a, accent: 0x40d890, wpn: 0x6020a0, eye: 0x40ff90 },
  tk: { body: 0x3a4090, armor: 0x4a5ab0, accent: 0x7080d8, wpn: 0x6070c0, eye: 0x80a0ff },
  sh: { body: 0x187898, armor: 0x2898b8, accent: 0x40c8e0, wpn: 0x30b0d0, eye: 0x60e8ff },
  ar: { body: 0x108898, armor: 0x20b8c8, accent: 0x60e8f0, wpn: 0x40d0e0, eye: 0x80ffff },
  be: { body: 0x801818, armor: 0xa02020, accent: 0xe84040, wpn: 0xc03030, eye: 0xff2020 },
  po: { body: 0x186830, armor: 0x208840, accent: 0x40c060, wpn: 0x30a050, eye: 0x40ff60 },
  at: { body: 0x907018, armor: 0xb89020, accent: 0xe8c040, wpn: 0xd0a830, eye: 0xffe040 },
};

// ============================================================
// Body Builder with named hierarchy
// ============================================================

function buildBody(pal, s = 1, opts = {}) {
  const bw = (opts.bodyW || 0.3) * s;
  const bd = (opts.bodyD || 0.22) * s;
  const th = (opts.torsoH || 0.6) * s;
  const lh = (opts.legH || 0.5) * s;
  const hr = (opts.headR || 0.16) * s;
  const sw = (opts.shoulderW || 0.35) * s;
  const aw = 0.08 * s;
  const lw = 0.1 * s;

  // Root (hip) - everything hangs off this
  const hip = new THREE.Group();
  hip.name = 'hip';
  hip.position.set(0, lh, 0);

  // Spine
  const spine = new THREE.Group();
  spine.name = 'spine';
  hip.add(spine);

  // Torso mesh
  const torso = new THREE.Mesh(box(bw, th, bd), mat(pal.armor));
  torso.position.y = th * 0.5;
  spine.add(torso);

  // Shoulder pads
  if (opts.shoulders !== false) {
    const padM = mat(pal.accent);
    const lPad = new THREE.Mesh(box(0.12 * s, 0.06 * s, 0.12 * s), padM);
    lPad.position.set(-sw * 0.9, th * 0.85, 0);
    spine.add(lPad);
    const rPad = new THREE.Mesh(box(0.12 * s, 0.06 * s, 0.12 * s), padM);
    rPad.position.set(sw * 0.9, th * 0.85, 0);
    spine.add(rPad);
  }

  // Belt
  const belt = new THREE.Mesh(box(bw * 1.1, 0.05 * s, bd * 1.1), mat(pal.accent));
  belt.position.y = 0.02 * s;
  spine.add(belt);

  // Neck + Head
  const neck = new THREE.Group();
  neck.name = 'neck';
  neck.position.y = th;
  spine.add(neck);

  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = hr * 0.3;
  neck.add(head);

  const headMesh = new THREE.Mesh(sphere(hr), mat(pal.body));
  headMesh.position.y = hr * 0.5;
  head.add(headMesh);

  // Helmet/crown decoration
  const helmet = new THREE.Mesh(box(hr * 1.3, 0.04 * s, hr * 1.3), mat(pal.accent));
  helmet.position.y = hr * 0.9;
  head.add(helmet);

  // Eyes
  const eyeM = mat(pal.eye, { emissive: pal.eye, ei: 2 });
  const lEye = new THREE.Mesh(box(0.03 * s, 0.02 * s, 0.02 * s), eyeM);
  lEye.position.set(-0.05 * s, hr * 0.55, hr * 0.75);
  head.add(lEye);
  const rEye = new THREE.Mesh(box(0.03 * s, 0.02 * s, 0.02 * s), eyeM);
  rEye.position.set(0.05 * s, hr * 0.55, hr * 0.75);
  head.add(rEye);

  // Left arm
  const lArm = new THREE.Group();
  lArm.name = 'lArm';
  lArm.position.set(-sw, th * 0.75, 0);
  spine.add(lArm);

  const lArmUpper = new THREE.Mesh(box(aw, 0.2 * s, aw), mat(pal.body));
  lArmUpper.position.y = -0.1 * s;
  lArm.add(lArmUpper);

  const lForearm = new THREE.Group();
  lForearm.name = 'lForearm';
  lForearm.position.y = -0.22 * s;
  lArm.add(lForearm);

  const lForearmMesh = new THREE.Mesh(box(aw * 0.85, 0.18 * s, aw * 0.85), mat(pal.accent));
  lForearmMesh.position.y = -0.09 * s;
  lForearm.add(lForearmMesh);

  // Right arm
  const rArm = new THREE.Group();
  rArm.name = 'rArm';
  rArm.position.set(sw, th * 0.75, 0);
  spine.add(rArm);

  const rArmUpper = new THREE.Mesh(box(aw, 0.2 * s, aw), mat(pal.body));
  rArmUpper.position.y = -0.1 * s;
  rArm.add(rArmUpper);

  const rForearm = new THREE.Group();
  rForearm.name = 'rForearm';
  rForearm.position.y = -0.22 * s;
  rArm.add(rForearm);

  const rForearmMesh = new THREE.Mesh(box(aw * 0.85, 0.18 * s, aw * 0.85), mat(pal.accent));
  rForearmMesh.position.y = -0.09 * s;
  rForearm.add(rForearmMesh);

  // Left leg
  const lLeg = new THREE.Group();
  lLeg.name = 'lLeg';
  lLeg.position.set(-0.12 * s, 0, 0);
  hip.add(lLeg);

  const lLegMesh = new THREE.Mesh(box(lw, lh * 0.48, lw), mat(pal.body));
  lLegMesh.position.y = -lh * 0.24;
  lLeg.add(lLegMesh);

  const lBoot = new THREE.Mesh(box(lw * 1.1, lh * 0.15, lw * 1.3), mat(pal.armor));
  lBoot.position.set(0, -lh * 0.5 + lh * 0.08, 0.02 * s);
  lLeg.add(lBoot);

  // Right leg
  const rLeg = new THREE.Group();
  rLeg.name = 'rLeg';
  rLeg.position.set(0.12 * s, 0, 0);
  hip.add(rLeg);

  const rLegMesh = new THREE.Mesh(box(lw, lh * 0.48, lw), mat(pal.body));
  rLegMesh.position.y = -lh * 0.24;
  rLeg.add(rLegMesh);

  const rBoot = new THREE.Mesh(box(lw * 1.1, lh * 0.15, lw * 1.3), mat(pal.armor));
  rBoot.position.set(0, -lh * 0.5 + lh * 0.08, 0.02 * s);
  rLeg.add(rBoot);

  return { root: hip, lForearm, rForearm, lArm, rArm, spine, head, neck };
}

// ============================================================
// Equipment
// ============================================================

function sword(pal, s = 1) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(box(0.03 * s, 0.45 * s, 0.01 * s),
    mat(pal.wpn, { metalness: 0.6, roughness: 0.3, emissive: pal.wpn, ei: 0.3 })));
  g.children[0].position.y = 0.23 * s;
  g.add(new THREE.Mesh(box(0.1 * s, 0.025 * s, 0.03 * s), mat(pal.accent, { metalness: 0.5 })));
  const h = new THREE.Mesh(cyl(0.012 * s, 0.012 * s, 0.1 * s, 5), mat(0x3a2820));
  h.position.y = -0.05 * s;
  g.add(h);
  return g;
}

function shield(pal, s = 1, large = false) {
  const sz = (large ? 0.32 : 0.2) * s;
  const g = new THREE.Group();
  g.add(new THREE.Mesh(box(sz, sz * 1.2, 0.03 * s), mat(pal.armor, { metalness: 0.5, roughness: 0.3 })));
  const e = new THREE.Mesh(octa(0.04 * s), mat(pal.accent, { emissive: pal.accent, ei: 0.5 }));
  e.position.z = 0.02 * s;
  g.add(e);
  return g;
}

function spear(pal, s = 1) {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(cyl(0.012 * s, 0.012 * s, 0.75 * s, 5), mat(0x5a4838));
  shaft.position.y = 0.12 * s;
  g.add(shaft);
  const tip = new THREE.Mesh(cone(0.035 * s, 0.12 * s, 4), mat(pal.wpn, { metalness: 0.6, emissive: pal.wpn, ei: 0.2 }));
  tip.position.y = 0.56 * s;
  g.add(tip);
  return g;
}

function dualDaggers(pal, s = 1) {
  const g = new THREE.Group();
  [-1, 1].forEach((side) => {
    const d = new THREE.Group();
    d.add(new THREE.Mesh(box(0.02 * s, 0.2 * s, 0.008 * s), mat(pal.wpn, { metalness: 0.6, emissive: pal.wpn, ei: 0.2 })));
    d.children[0].position.y = 0.1 * s;
    d.add(new THREE.Mesh(cyl(0.01 * s, 0.01 * s, 0.07 * s, 5), mat(0x3a2820)));
    d.position.set(side * 0.06 * s, -0.15 * s, 0);
    g.add(d);
  });
  return g;
}

function staff(pal, s = 1, orbCol = null) {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(cyl(0.015 * s, 0.012 * s, 0.85 * s, 5), mat(pal.wpn));
  shaft.position.y = 0.15 * s;
  g.add(shaft);
  const orb = new THREE.Mesh(octa(0.05 * s), mat(orbCol || pal.accent, { emissive: orbCol || pal.accent, ei: 1.0 }));
  orb.position.y = 0.62 * s;
  g.add(orb);
  return g;
}

function bow(pal, s = 1) {
  const g = new THREE.Group();
  const pts = [
    new THREE.Vector3(0, -0.28 * s, 0),
    new THREE.Vector3(-0.08 * s, -0.14 * s, -0.02 * s),
    new THREE.Vector3(-0.1 * s, 0, -0.03 * s),
    new THREE.Vector3(-0.08 * s, 0.14 * s, -0.02 * s),
    new THREE.Vector3(0, 0.28 * s, 0),
  ];
  const curve = new THREE.CatmullRomCurve3(pts);
  g.add(new THREE.Mesh(
    new THREE.TubeGeometry(curve, 8, 0.012 * s, 4, false),
    mat(pal.wpn, { emissive: pal.wpn, ei: 0.3 })
  ));
  g.add(new THREE.Mesh(cyl(0.003 * s, 0.003 * s, 0.54 * s, 3), mat(0xc0c0d0)));
  return g;
}

function dualAxes(pal, s = 1) {
  const g = new THREE.Group();
  [-1, 1].forEach((side) => {
    const a = new THREE.Group();
    const handle = new THREE.Mesh(cyl(0.014 * s, 0.012 * s, 0.45 * s, 5), mat(0x4a3828));
    handle.position.y = 0.05 * s;
    a.add(handle);
    const head = new THREE.Mesh(box(0.14 * s, 0.11 * s, 0.02 * s), mat(pal.wpn, { metalness: 0.5, emissive: pal.accent, ei: 0.3 }));
    head.position.set(0.05 * s * side, 0.28 * s, 0);
    a.add(head);
    a.position.set(side * 0.06 * s, -0.1 * s, 0);
    g.add(a);
  });
  return g;
}

function cannon(pal, s = 1) {
  const g = new THREE.Group();
  const barrel = new THREE.Mesh(cyl(0.055 * s, 0.07 * s, 0.45 * s, 6), mat(pal.wpn, { metalness: 0.6, roughness: 0.3 }));
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0, 0.12 * s);
  g.add(barrel);
  const muzzle = new THREE.Mesh(
    makeFlat(new THREE.TorusGeometry(0.065 * s, 0.015 * s, 4, 6)),
    mat(pal.accent, { emissive: pal.accent, ei: 0.8 })
  );
  muzzle.rotation.x = Math.PI / 2;
  muzzle.position.set(0, 0, 0.36 * s);
  g.add(muzzle);
  return g;
}

function hexShield(pal, s = 1) {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  const r = 0.18 * s;
  for (let i = 0; i < 6; i++) {
    const ang = (Math.PI / 3) * i - Math.PI / 6;
    if (i === 0) shape.moveTo(Math.cos(ang) * r, Math.sin(ang) * r);
    else shape.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
  }
  shape.closePath();
  const hex = new THREE.Mesh(
    makeFlat(new THREE.ExtrudeGeometry(shape, { depth: 0.02 * s, bevelEnabled: false })),
    mat(pal.accent, { transparent: true, opacity: 0.7, emissive: pal.accent, ei: 0.6 })
  );
  g.add(hex);
  return g;
}

function crystalCore(pal, s = 1) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(octa(0.11 * s), mat(pal.crystal || pal.accent, { emissive: pal.crystal || pal.accent, ei: 1.5, transparent: true, opacity: 0.85 })));
  for (let i = 0; i < 3; i++) {
    const ang = (Math.PI * 2 / 3) * i;
    const sm = new THREE.Mesh(octa(0.03 * s), mat(pal.accent, { emissive: pal.accent, ei: 1.0 }));
    sm.position.set(Math.cos(ang) * 0.15 * s, Math.sin(ang) * 0.05 * s, Math.sin(ang) * 0.15 * s);
    g.add(sm);
  }
  return g;
}

function cloak(pal, s = 1) {
  const c = new THREE.Mesh(
    box(0.34 * s, 0.48 * s, 0.04 * s),
    mat(pal.armor, { transparent: true, opacity: 0.85, side: THREE.DoubleSide })
  );
  c.position.set(0, 0.28 * s, -0.13 * s);
  return c;
}

function poisonBottle(pal, s = 1) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(sphere(0.045 * s), mat(pal.accent, { transparent: true, opacity: 0.8, emissive: pal.accent, ei: 0.5 })));
  const neck = new THREE.Mesh(cyl(0.013 * s, 0.018 * s, 0.035 * s, 5), mat(pal.wpn));
  neck.position.y = 0.055 * s;
  g.add(neck);
  return g;
}

// ============================================================
// Animations
// ============================================================

function idleAnim(dur = 2.0) {
  const t = [0, dur * 0.5, dur];
  return new THREE.AnimationClip('idle', dur, [
    new THREE.VectorKeyframeTrack('hip.position', t, [0, 0, 0, 0, 0.015, 0, 0, 0, 0]),
    new THREE.QuaternionKeyframeTrack('spine.quaternion', t, [...q([0, 0, 0]), ...q([0.02, 0, 0]), ...q([0, 0, 0])]),
    new THREE.QuaternionKeyframeTrack('lArm.quaternion', t, [...q([0, 0, 0.05]), ...q([0, 0, 0.08]), ...q([0, 0, 0.05])]),
    new THREE.QuaternionKeyframeTrack('rArm.quaternion', t, [...q([0, 0, -0.05]), ...q([0, 0, -0.08]), ...q([0, 0, -0.05])]),
  ]);
}

function attackMelee(dur = 0.8) {
  const t = [0, dur * 0.2, dur * 0.4, dur * 0.7, dur];
  return new THREE.AnimationClip('attack', dur, [
    new THREE.QuaternionKeyframeTrack('spine.quaternion', t,
      [...q([0, 0, 0]), ...q([-0.15, 0, 0]), ...q([0.3, 0, 0]), ...q([0.15, 0, 0]), ...q([0, 0, 0])]),
    new THREE.QuaternionKeyframeTrack('rArm.quaternion', t,
      [...q([0, 0, 0]), ...q([-1.2, 0, -0.3]), ...q([0.8, 0, 0.2]), ...q([0.3, 0, 0]), ...q([0, 0, 0])]),
  ]);
}

function attackRanged(dur = 0.8) {
  const t = [0, dur * 0.2, dur * 0.4, dur * 0.7, dur];
  return new THREE.AnimationClip('attack', dur, [
    new THREE.QuaternionKeyframeTrack('lArm.quaternion', t,
      [...q([0, 0, 0]), ...q([-0.8, 0, 0.3]), ...q([-1.2, 0, 0.2]), ...q([-0.6, 0, 0.1]), ...q([0, 0, 0])]),
    new THREE.QuaternionKeyframeTrack('rArm.quaternion', t,
      [...q([0, 0, 0]), ...q([-0.8, 0, -0.3]), ...q([-0.4, 0, -0.5]), ...q([-0.2, 0, -0.2]), ...q([0, 0, 0])]),
  ]);
}

function attackCast(dur = 0.8) {
  const t = [0, dur * 0.2, dur * 0.4, dur * 0.7, dur];
  return new THREE.AnimationClip('attack', dur, [
    new THREE.QuaternionKeyframeTrack('lArm.quaternion', t,
      [...q([0, 0, 0]), ...q([-1.0, 0, 0.5]), ...q([-1.5, 0, 0.3]), ...q([-0.8, 0, 0.2]), ...q([0, 0, 0])]),
    new THREE.QuaternionKeyframeTrack('rArm.quaternion', t,
      [...q([0, 0, 0]), ...q([-1.0, 0, -0.5]), ...q([-1.5, 0, -0.3]), ...q([-0.8, 0, -0.2]), ...q([0, 0, 0])]),
  ]);
}

function hitAnim(dur = 0.5) {
  const t = [0, dur * 0.2, dur * 0.5, dur];
  return new THREE.AnimationClip('hit', dur, [
    new THREE.VectorKeyframeTrack('hip.position', t, [0, 0, 0, 0, 0, -0.05, 0, 0, -0.02, 0, 0, 0]),
    new THREE.QuaternionKeyframeTrack('spine.quaternion', t,
      [...q([0, 0, 0]), ...q([-0.2, 0, 0.05]), ...q([-0.1, 0, -0.03]), ...q([0, 0, 0])]),
  ]);
}

function deathAnim(dur = 1.2) {
  const t = [0, dur * 0.3, dur * 0.6, dur];
  return new THREE.AnimationClip('death', dur, [
    new THREE.VectorKeyframeTrack('hip.position', t, [0, 0, 0, 0, -0.05, -0.02, 0, -0.2, -0.05, 0, -0.4, -0.08]),
    new THREE.QuaternionKeyframeTrack('spine.quaternion', t,
      [...q([0, 0, 0]), ...q([-0.3, 0, 0]), ...q([-0.8, 0, 0.2]), ...q([-1.4, 0, 0.3])]),
    new THREE.QuaternionKeyframeTrack('lArm.quaternion', t,
      [...q([0, 0, 0]), ...q([0, 0, 0.4]), ...q([0, 0, 0.8]), ...q([0, 0, 1.2])]),
    new THREE.QuaternionKeyframeTrack('rArm.quaternion', t,
      [...q([0, 0, 0]), ...q([0, 0, -0.4]), ...q([0, 0, -0.8]), ...q([0, 0, -1.2])]),
  ]);
}

// ============================================================
// Character Definitions
// ============================================================

const CHARS = [
  {
    id: 1, file: 'warrior_a', name: '均衡战士A', pal: P.wa, atkType: 'melee',
    body: { scale: 1 },
    equip: (p, s, parts) => {
      const sw = sword(p, s);
      sw.position.set(0, -0.18 * s, 0);
      parts.rForearm.add(sw);
      const sh = shield(p, s);
      sh.position.set(0, -0.12 * s, 0.05 * s);
      parts.lForearm.add(sh);
    },
  },
  {
    id: 2, file: 'warrior_b', name: '均衡战士B', pal: P.wb, atkType: 'melee',
    body: { scale: 1.05, bodyW: 0.33 },
    equip: (p, s, parts) => {
      const sp = spear(p, s);
      sp.position.set(0, -0.15 * s, 0);
      parts.rForearm.add(sp);
    },
  },
  {
    id: 3, file: 'warrior_c', name: '均衡战士C', pal: P.wc, atkType: 'melee',
    body: { scale: 0.95, bodyW: 0.27 },
    equip: (p, s, parts) => {
      const dd = dualDaggers(p, s);
      const left = dd.children[0];
      const right = dd.children[1];
      left.removeFromParent();
      right.removeFromParent();
      left.position.set(0, -0.15 * s, 0);
      parts.lForearm.add(left);
      right.position.set(0, -0.15 * s, 0);
      parts.rForearm.add(right);
    },
  },
  {
    id: 4, file: 'bomber', name: '自爆步兵', pal: P.bm, atkType: 'melee',
    body: { scale: 1.1, bodyW: 0.38, bodyD: 0.28 },
    equip: (p, s, parts) => {
      const core = crystalCore(p, s);
      core.position.set(0, 0.35 * s, 0.15 * s);
      parts.spine.add(core);
    },
  },
  {
    id: 5, file: 'curse_mage', name: '诅咒巫师', pal: P.cu, atkType: 'cast',
    body: { scale: 1, bodyW: 0.26 },
    equip: (p, s, parts) => {
      const st = staff(p, s, 0xc060ff);
      st.position.set(0, -0.15 * s, 0);
      parts.rForearm.add(st);
      parts.spine.add(cloak(p, s));
    },
  },
  {
    id: 6, file: 'necromancer', name: '死灵法师', pal: P.ne, atkType: 'cast',
    body: { scale: 1, bodyW: 0.28 },
    equip: (p, s, parts) => {
      const st = staff(p, s, 0x40ff90);
      st.position.set(0, -0.15 * s, 0);
      parts.rForearm.add(st);
      parts.spine.add(cloak(p, s));
      for (let i = 0; i < 4; i++) {
        const ang = (Math.PI * 2 / 4) * i;
        const frag = new THREE.Mesh(tetra(0.025 * s), mat(0x40d890, { emissive: 0x40d890, ei: 1.0 }));
        frag.position.set(Math.cos(ang) * 0.25 * s, 0.6 * s, Math.sin(ang) * 0.25 * s);
        parts.spine.add(frag);
      }
    },
  },
  {
    id: 7, file: 'tank', name: '铁甲卫士', pal: P.tk, atkType: 'melee',
    body: { scale: 1.2, bodyW: 0.4, bodyD: 0.3, shoulderW: 0.42 },
    equip: (p, s, parts) => {
      const sh = shield(p, s, true);
      sh.position.set(0, -0.12 * s, 0.06 * s);
      parts.lForearm.add(sh);
      const sw_ = sword(p, s);
      sw_.position.set(0, -0.18 * s, 0);
      parts.rForearm.add(sw_);
    },
  },
  {
    id: 8, file: 'shield_deployer', name: '护盾部署者', pal: P.sh, atkType: 'cast',
    body: { scale: 1, bodyW: 0.3 },
    equip: (p, s, parts) => {
      const hs = hexShield(p, s);
      hs.position.set(0, -0.1 * s, 0.1 * s);
      parts.lForearm.add(hs);
    },
  },
  {
    id: 9, file: 'archer', name: '风行射手', pal: P.ar, atkType: 'ranged',
    body: { scale: 0.95, bodyW: 0.25, bodyD: 0.2 },
    equip: (p, s, parts) => {
      const bw = bow(p, s);
      bw.position.set(0, -0.08 * s, 0.06 * s);
      parts.lForearm.add(bw);
    },
  },
  {
    id: 10, file: 'berserker', name: '狂战士', pal: P.be, atkType: 'melee',
    body: { scale: 1.1, bodyW: 0.36, shoulderW: 0.4 },
    equip: (p, s, parts) => {
      const da = dualAxes(p, s);
      const left = da.children[0];
      const right = da.children[1];
      left.removeFromParent();
      right.removeFromParent();
      left.position.set(0, -0.12 * s, 0);
      parts.lForearm.add(left);
      right.position.set(0, -0.12 * s, 0);
      parts.rForearm.add(right);
    },
  },
  {
    id: 11, file: 'poison', name: '毒药投手', pal: P.po, atkType: 'ranged',
    body: { scale: 0.95, bodyW: 0.28 },
    equip: (p, s, parts) => {
      const pb = poisonBottle(p, s);
      pb.position.set(0, -0.15 * s, 0);
      parts.rForearm.add(pb);
      parts.spine.add(cloak(p, s));
    },
  },
  {
    id: 12, file: 'artillery', name: '重炮统领', pal: P.at, atkType: 'ranged',
    body: { scale: 1.25, bodyW: 0.42, bodyD: 0.32, shoulderW: 0.45 },
    equip: (p, s, parts) => {
      const cn = cannon(p, s);
      cn.position.set(0.1 * s, 0.35 * s, 0);
      parts.spine.add(cn);
    },
  },
];

// ============================================================
// Assembly + Export
// ============================================================

async function buildAndExport(def) {
  const scene = new THREE.Scene();
  scene.name = def.name;

  const s = def.body.scale || 1;
  const parts = buildBody(def.pal, s, def.body);
  scene.add(parts.root);

  def.equip(def.pal, s, parts);

  // Build animation clips
  const atkFn = def.atkType === 'melee' ? attackMelee : def.atkType === 'ranged' ? attackRanged : attackCast;
  scene.animations = [idleAnim(), atkFn(), hitAnim(), deathAnim()];

  return new Promise((resolve, reject) => {
    const exporter = new GLTFExporter();
    exporter.parse(
      scene,
      (result) => {
        const buffer = Buffer.from(result);
        const outPath = path.join(OUTPUT_DIR, `${def.file}.glb`);
        fs.writeFileSync(outPath, buffer);
        console.log(`  ✓ ${def.file}.glb (${(buffer.length / 1024).toFixed(1)} KB)`);
        resolve();
      },
      (error) => reject(error),
      { binary: true, animations: scene.animations }
    );
  });
}

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  星陨 Low-Poly Character Model Generator');
  console.log('═══════════════════════════════════════════');
  console.log(`Output: ${OUTPUT_DIR}\n`);

  for (const def of CHARS) {
    console.log(`[${def.id}/12] ${def.name}...`);
    try {
      await buildAndExport(def);
    } catch (err) {
      console.error(`  ✗ ${err.message}`);
    }
  }

  console.log('\nDone!');
}

main().catch(console.error);
