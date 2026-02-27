import * as THREE from 'three';

const activeEffects = [];

export function updateEffects(delta) {
  for (let i = activeEffects.length - 1; i >= 0; i--) {
    const effect = activeEffects[i];
    effect.elapsed += delta;
    effect.update(delta, effect.elapsed);
    if (effect.elapsed >= effect.duration) {
      effect.dispose();
      activeEffects.splice(i, 1);
    }
  }
}

function addEffect(scene, duration, update, dispose) {
  const effect = { elapsed: 0, duration, update, dispose };
  activeEffects.push(effect);
  return effect;
}

export function flashTrail(scene, from, to, color = 0xffcc44, duration = 0.2) {
  const points = [from.clone(), to.clone()];
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 1,
    linewidth: 2,
  });
  const line = new THREE.Line(geo, mat);
  scene.add(line);

  // Glow sphere at tip
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 6, 4),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 })
  );
  glow.position.copy(to);
  scene.add(glow);

  addEffect(scene, duration, (dt, elapsed) => {
    const t = elapsed / duration;
    mat.opacity = 1 - t;
    glow.material.opacity = 0.8 * (1 - t);
    glow.scale.setScalar(1 + t * 2);
  }, () => {
    scene.remove(line);
    scene.remove(glow);
    geo.dispose();
    mat.dispose();
  });
}

export function impactParticles(scene, position, color = 0xffcc44, count = 15) {
  const particles = [];
  const geo = new THREE.TetrahedronGeometry(0.04, 0);
  const material = new THREE.MeshBasicMaterial({ color, transparent: true });

  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(geo, material.clone());
    mesh.position.copy(position);
    mesh.userData.velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 3,
      Math.random() * 3 + 1,
      (Math.random() - 0.5) * 3
    );
    mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    scene.add(mesh);
    particles.push(mesh);
  }

  addEffect(scene, 1.0, (dt, elapsed) => {
    const t = elapsed / 1.0;
    particles.forEach((p) => {
      p.position.add(p.userData.velocity.clone().multiplyScalar(dt));
      p.userData.velocity.y -= 5 * dt;
      p.material.opacity = 1 - t;
      p.rotation.x += dt * 3;
      p.rotation.y += dt * 2;
    });
  }, () => {
    particles.forEach((p) => {
      scene.remove(p);
      p.material.dispose();
    });
    geo.dispose();
  });
}

export function shieldFlash(scene, position, color = 0x40c8e0) {
  const shape = new THREE.Shape();
  const r = 0.4;
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i;
    if (i === 0) shape.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
    else shape.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
  }
  shape.closePath();
  const geo = new THREE.ShapeGeometry(shape);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(position);
  mesh.position.y += 0.6;
  mesh.position.z += 0.3;
  scene.add(mesh);

  addEffect(scene, 0.6, (dt, elapsed) => {
    const t = elapsed / 0.6;
    mat.opacity = 0.7 * (1 - t);
    mesh.scale.setScalar(1 + t * 0.5);
  }, () => {
    scene.remove(mesh);
    geo.dispose();
    mat.dispose();
  });
}

export function poisonBubbles(scene, position, duration = 2.0) {
  const bubbles = [];
  const geo = new THREE.SphereGeometry(0.03, 4, 3);
  const mat = new THREE.MeshBasicMaterial({ color: 0x40c060, transparent: true });

  for (let i = 0; i < 8; i++) {
    const bubble = new THREE.Mesh(geo, mat.clone());
    bubble.position.copy(position);
    bubble.position.x += (Math.random() - 0.5) * 0.4;
    bubble.position.z += (Math.random() - 0.5) * 0.4;
    bubble.userData.delay = Math.random() * duration * 0.5;
    bubble.userData.speed = 0.5 + Math.random() * 0.5;
    bubble.visible = false;
    scene.add(bubble);
    bubbles.push(bubble);
  }

  addEffect(scene, duration, (dt, elapsed) => {
    bubbles.forEach((b) => {
      if (elapsed > b.userData.delay) {
        b.visible = true;
        b.position.y += b.userData.speed * dt;
        const t = (elapsed - b.userData.delay) / (duration - b.userData.delay);
        b.material.opacity = Math.max(0, 1 - t);
      }
    });
  }, () => {
    bubbles.forEach((b) => {
      scene.remove(b);
      b.material.dispose();
    });
    geo.dispose();
  });
}

export function explosionEffect(scene, position, color = 0xff6020, size = 1.0) {
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.1 * size, 6, 4),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 })
  );
  sphere.position.copy(position);
  sphere.position.y += 0.5;
  scene.add(sphere);

  impactParticles(scene, position, color, 25);

  addEffect(scene, 0.8, (dt, elapsed) => {
    const t = elapsed / 0.8;
    sphere.scale.setScalar(1 + t * 4 * size);
    sphere.material.opacity = 0.9 * (1 - t);
  }, () => {
    scene.remove(sphere);
    sphere.geometry.dispose();
    sphere.material.dispose();
  });
}

export function reviveEffect(scene, position) {
  // Green light pillar
  const pillarGeo = new THREE.CylinderGeometry(0.15, 0.15, 3, 6);
  const pillarMat = new THREE.MeshBasicMaterial({
    color: 0x40d890,
    transparent: true,
    opacity: 0.4,
  });
  const pillar = new THREE.Mesh(pillarGeo, pillarMat);
  pillar.position.copy(position);
  pillar.position.y += 1.5;
  scene.add(pillar);

  // Rising particles
  const particles = [];
  const pGeo = new THREE.TetrahedronGeometry(0.03, 0);
  for (let i = 0; i < 12; i++) {
    const p = new THREE.Mesh(pGeo, new THREE.MeshBasicMaterial({ color: 0x40d890, transparent: true }));
    const angle = (Math.PI * 2 / 12) * i;
    p.position.copy(position);
    p.position.x += Math.cos(angle) * 0.3;
    p.position.z += Math.sin(angle) * 0.3;
    p.userData.angle = angle;
    scene.add(p);
    particles.push(p);
  }

  addEffect(scene, 1.5, (dt, elapsed) => {
    const t = elapsed / 1.5;
    pillarMat.opacity = 0.4 * (1 - t * 0.7);
    pillar.scale.x = 1 + t * 0.5;
    pillar.scale.z = 1 + t * 0.5;

    particles.forEach((p, i) => {
      p.position.y = position.y + t * 2;
      const r = 0.3 * (1 - t * 0.5);
      p.position.x = position.x + Math.cos(p.userData.angle + elapsed * 3) * r;
      p.position.z = position.z + Math.sin(p.userData.angle + elapsed * 3) * r;
      p.material.opacity = 1 - t;
    });
  }, () => {
    scene.remove(pillar);
    pillarGeo.dispose();
    pillarMat.dispose();
    particles.forEach((p) => {
      scene.remove(p);
      p.material.dispose();
    });
    pGeo.dispose();
  });
}

export function aoeWave(scene, position, color = 0xe8c040) {
  const ringGeo = new THREE.RingGeometry(0.1, 0.2, 12);
  const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.copy(position);
  ring.position.y = 0.05;
  scene.add(ring);

  addEffect(scene, 1.0, (dt, elapsed) => {
    const t = elapsed / 1.0;
    ring.scale.setScalar(1 + t * 8);
    ringMat.opacity = 0.6 * (1 - t);
  }, () => {
    scene.remove(ring);
    ringGeo.dispose();
    ringMat.dispose();
  });
}

export function projectile(scene, from, to, color = 0x40d0e0, speed = 8) {
  const mesh = new THREE.Mesh(
    new THREE.ConeGeometry(0.04, 0.12, 4),
    new THREE.MeshBasicMaterial({ color, transparent: true })
  );
  mesh.position.copy(from);
  mesh.position.y += 0.8;
  mesh.lookAt(to.x, to.y + 0.8, to.z);
  mesh.rotateX(Math.PI / 2);
  scene.add(mesh);

  const dir = new THREE.Vector3().subVectors(to, from);
  dir.y = 0;
  const dist = dir.length();
  const duration = dist / speed;

  return new Promise((resolve) => {
    addEffect(scene, duration, (dt, elapsed) => {
      const t = Math.min(1, elapsed / duration);
      mesh.position.lerpVectors(
        new THREE.Vector3(from.x, from.y + 0.8, from.z),
        new THREE.Vector3(to.x, to.y + 0.8, to.z),
        t
      );
      // Arc upward
      mesh.position.y += Math.sin(t * Math.PI) * 0.5;
    }, () => {
      scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
      impactParticles(scene, to, color, 10);
      resolve();
    });
  });
}
