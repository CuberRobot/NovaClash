import * as THREE from 'three';

export const TEAM_POSITIONS = {
  // Player side: from our view left=1, center=2, right=3
  player: [
    new THREE.Vector3(-1.5, 0, 1.2),
    new THREE.Vector3(0, 0, 1.8),
    new THREE.Vector3(1.5, 0, 1.2),
  ],
  // Opponent side: reversed so 1-2-3 vs 3-2-1 (their slot 0 faces our right, their slot 2 faces our left)
  opponent: [
    new THREE.Vector3(-1.5, 0, -1.2),
    new THREE.Vector3(0, 0, -1.8),
    new THREE.Vector3(1.5, 0, -1.2),
  ],
};

export const OPPONENT_POSITION_INDEX = [2, 1, 0];

export function createBattlefield(scene) {
  const group = new THREE.Group();
  group.name = 'battlefield';
  const hexR = 3.8;

  // Base platform (thick dark layer)
  const platformShape = new THREE.Shape();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    const x = Math.cos(angle) * hexR;
    const z = Math.sin(angle) * hexR;
    if (i === 0) platformShape.moveTo(x, z);
    else platformShape.lineTo(x, z);
  }
  platformShape.closePath();

  const platformGeo = new THREE.ExtrudeGeometry(platformShape, {
    depth: 0.25,
    bevelEnabled: true,
    bevelThickness: 0.08,
    bevelSize: 0.06,
    bevelSegments: 2,
  });
  platformGeo.rotateX(-Math.PI / 2);
  platformGeo.translate(0, -0.25, 0);

  const platformMat = new THREE.MeshStandardMaterial({
    color: 0x181838,
    emissive: 0x080818,
    emissiveIntensity: 0.2,
    roughness: 0.4,
    metalness: 0.7,
  });
  const platform = new THREE.Mesh(platformGeo, platformMat);
  platform.receiveShadow = true;
  group.add(platform);

  // Top surface (thin glowing hex)
  const topShape = new THREE.Shape();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    const x = Math.cos(angle) * (hexR - 0.02);
    const z = Math.sin(angle) * (hexR - 0.02);
    if (i === 0) topShape.moveTo(x, z);
    else topShape.lineTo(x, z);
  }
  topShape.closePath();
  const topGeo = new THREE.ShapeGeometry(topShape);
  topGeo.rotateX(-Math.PI / 2);
  const topMat = new THREE.MeshStandardMaterial({
    color: 0x282858,
    emissive: 0x4040a0,
    emissiveIntensity: 0.15,
    roughness: 0.2,
    metalness: 0.8,
    transparent: true,
    opacity: 0.95,
  });
  const topSurface = new THREE.Mesh(topGeo, topMat);
  topSurface.position.y = 0.002;
  topSurface.receiveShadow = true;
  group.add(topSurface);

  // Glowing edge ring (thick tube-like feel via multiple lines)
  const edgePoints = [];
  for (let i = 0; i <= 6; i++) {
    const angle = (Math.PI / 3) * (i % 6) - Math.PI / 6;
    edgePoints.push(new THREE.Vector3(Math.cos(angle) * hexR, 0.02, Math.sin(angle) * hexR));
  }
  const edgeGeo = new THREE.BufferGeometry().setFromPoints(edgePoints);
  const edgeMat = new THREE.LineBasicMaterial({
    color: 0xe8c040,
    transparent: true,
    opacity: 0.95,
    linewidth: 2,
  });
  group.add(new THREE.Line(edgeGeo, edgeMat));

  const innerEdgePoints = [];
  for (let i = 0; i <= 6; i++) {
    const angle = (Math.PI / 3) * (i % 6) - Math.PI / 6;
    innerEdgePoints.push(new THREE.Vector3(Math.cos(angle) * (hexR - 0.06), 0.025, Math.sin(angle) * (hexR - 0.06)));
  }
  const innerEdgeGeo = new THREE.BufferGeometry().setFromPoints(innerEdgePoints);
  const innerEdgeMat = new THREE.LineBasicMaterial({
    color: 0xa080ff,
    transparent: true,
    opacity: 0.6,
  });
  group.add(new THREE.Line(innerEdgeGeo, innerEdgeMat));

  // Inner hex runes
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    const innerPoints = [
      new THREE.Vector3(0, 0.03, 0),
      new THREE.Vector3(Math.cos(angle) * hexR * 0.75, 0.03, Math.sin(angle) * hexR * 0.75),
    ];
    const lineGeo = new THREE.BufferGeometry().setFromPoints(innerPoints);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x7080e0,
      transparent: true,
      opacity: 0.5,
    });
    group.add(new THREE.Line(lineGeo, lineMat));
  }

  // Center dividing line (magical barrier)
  const divPoints = [
    new THREE.Vector3(-hexR * 0.88, 0.04, 0),
    new THREE.Vector3(hexR * 0.88, 0.04, 0),
  ];
  const divGeo = new THREE.BufferGeometry().setFromPoints(divPoints);
  const divMat = new THREE.LineBasicMaterial({
    color: 0xc8a0ff,
    transparent: true,
    opacity: 0.7,
  });
  group.add(new THREE.Line(divGeo, divMat));

  // Central crystal pillar
  const crystalGeo = new THREE.CylinderGeometry(0.15, 0.25, 0.6, 6);
  const crystalMat = new THREE.MeshStandardMaterial({
    color: 0x6080ff,
    emissive: 0x4060e0,
    emissiveIntensity: 0.6,
    transparent: true,
    opacity: 0.9,
    roughness: 0.2,
    metalness: 0.9,
  });
  const centralCrystal = new THREE.Mesh(crystalGeo, crystalMat);
  centralCrystal.position.set(0, 0.35, 0);
  centralCrystal.name = 'centralCrystal';
  group.add(centralCrystal);

  const tipGeo = new THREE.ConeGeometry(0.12, 0.25, 6);
  const tipMat = new THREE.MeshStandardMaterial({
    color: 0xa0c0ff,
    emissive: 0x6080ff,
    emissiveIntensity: 0.8,
    transparent: true,
    opacity: 0.95,
  });
  const tip = new THREE.Mesh(tipGeo, tipMat);
  tip.position.y = 0.55;
  tip.rotation.x = Math.PI;
  centralCrystal.add(tip);

  // Hex vertex pillars (small crystals)
  const pillarGeo = new THREE.CylinderGeometry(0.06, 0.1, 0.35, 6);
  const pillarMat = new THREE.MeshStandardMaterial({
    color: 0x5060c0,
    emissive: 0x3040a0,
    emissiveIntensity: 0.5,
    roughness: 0.3,
    metalness: 0.8,
  });
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.position.set(
      Math.cos(angle) * hexR * 0.92,
      0.2,
      Math.sin(angle) * hexR * 0.92
    );
    pillar.name = `vertexPillar_${i}`;
    group.add(pillar);
  }

  // Position markers (glowing crystals)
  const markerGeo = new THREE.OctahedronGeometry(0.1, 0);
  const playerMarkerMat = new THREE.MeshStandardMaterial({
    color: 0x6080ff,
    emissive: 0x4060ff,
    emissiveIntensity: 1,
    flatShading: true,
  });
  const opponentMarkerMat = new THREE.MeshStandardMaterial({
    color: 0xff6080,
    emissive: 0xff4060,
    emissiveIntensity: 1,
    flatShading: true,
  });

  TEAM_POSITIONS.player.forEach((pos) => {
    const marker = new THREE.Mesh(markerGeo, playerMarkerMat);
    marker.position.copy(pos);
    marker.position.y = 0.06;
    group.add(marker);
  });

  TEAM_POSITIONS.opponent.forEach((pos) => {
    const marker = new THREE.Mesh(markerGeo, opponentMarkerMat);
    marker.position.copy(pos);
    marker.position.y = 0.06;
    group.add(marker);
  });

  scene.add(group);

  // Background: star particles
  createStarfield(scene);

  // Floating crystals
  createFloatingCrystals(scene);

  return group;
}

function createStarfield(scene) {
  // Low-poly gradient sky dome
  const skyGeo = new THREE.IcosahedronGeometry(40, 2);
  const skyPositions = skyGeo.attributes.position;
  const skyColors = new Float32Array(skyPositions.count * 3);
  const colorTop = new THREE.Color(0x0a0a30);
  const colorMid = new THREE.Color(0x181848);
  const colorBot = new THREE.Color(0x100820);

  for (let i = 0; i < skyPositions.count; i++) {
    const y = skyPositions.getY(i);
    const t = (y / 40 + 1) / 2;
    const c = new THREE.Color();
    if (t > 0.5) c.lerpColors(colorMid, colorTop, (t - 0.5) * 2);
    else c.lerpColors(colorBot, colorMid, t * 2);
    c.r += (Math.random() - 0.5) * 0.02;
    c.g += (Math.random() - 0.5) * 0.02;
    c.b += (Math.random() - 0.5) * 0.03;
    skyColors[i * 3] = c.r;
    skyColors[i * 3 + 1] = c.g;
    skyColors[i * 3 + 2] = c.b;
  }

  skyGeo.setAttribute('color', new THREE.BufferAttribute(skyColors, 3));
  const skyMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
    flatShading: true,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.name = 'skyDome';
  scene.add(sky);

  // Star particles on top
  const count = 1200;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const r = 18 + Math.random() * 20;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(1 - Math.random() * 1.6);

    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi) + 2;
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

    const brightness = 0.5 + Math.random() * 0.5;
    const tint = Math.random();
    if (tint < 0.3) { colors[i*3]=brightness*0.7; colors[i*3+1]=brightness*0.8; colors[i*3+2]=brightness; }
    else if (tint < 0.6) { colors[i*3]=brightness; colors[i*3+1]=brightness*0.9; colors[i*3+2]=brightness*0.6; }
    else { colors[i*3]=brightness*0.9; colors[i*3+1]=brightness*0.7; colors[i*3+2]=brightness; }
    sizes[i] = 0.04 + Math.random() * 0.12;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const pointMat = new THREE.PointsMaterial({
    size: 0.1,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    sizeAttenuation: true,
  });

  const stars = new THREE.Points(geo, pointMat);
  stars.name = 'starfield';
  scene.add(stars);
}

function createFloatingCrystals(scene) {
  const colors = [0x6060c0, 0x8040a0, 0x4080c0, 0xa06080, 0x60a0c0, 0xc08060];
  const sizes = [0.12, 0.18, 0.15, 0.1, 0.2, 0.14];

  for (let i = 0; i < 18; i++) {
    const geo = new THREE.OctahedronGeometry(sizes[i % sizes.length], 0);
    const crystal = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        color: colors[i % colors.length],
        emissive: colors[i % colors.length],
        emissiveIntensity: 0.5,
        flatShading: true,
        transparent: true,
        opacity: 0.75,
      })
    );
    const angle = (Math.PI * 2 / 18) * i + Math.random() * 0.3;
    const r = 6 + Math.random() * 5;
    crystal.position.set(
      Math.cos(angle) * r,
      1.2 + Math.random() * 4,
      Math.sin(angle) * r
    );
    crystal.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    crystal.userData.floatSpeed = 0.25 + Math.random() * 0.6;
    crystal.userData.floatOffset = Math.random() * Math.PI * 2;
    crystal.userData.baseY = crystal.position.y;
    crystal.userData.rotSpeed = 0.002 + Math.random() * 0.004;
    crystal.name = `floatingCrystal_${i}`;
    scene.add(crystal);
  }
}

export function updateBattlefield(scene, time) {
  scene.children.forEach((child) => {
    if (child.name && child.name.startsWith('floatingCrystal_')) {
      child.position.y = child.userData.baseY + Math.sin(time * child.userData.floatSpeed + child.userData.floatOffset) * 0.35;
      child.rotation.y += child.userData.rotSpeed;
      child.rotation.x += 0.001;
    }
  });

  const central = scene.getObjectByName('centralCrystal');
  if (central && central.children.length) {
    central.rotation.y += 0.002;
    const tipMat = central.children[0].material;
    if (tipMat && tipMat.emissiveIntensity !== undefined) {
      tipMat.emissiveIntensity = 0.7 + Math.sin(time * 0.8) * 0.25;
    }
  }

  const stars = scene.getObjectByName('starfield');
  if (stars) {
    stars.rotation.y += 0.0002;
  }
}
