import * as THREE from 'three';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

let renderer, css2dRenderer, scene, camera;
let animationFrameId = null;
let updateCallbacks = [];

export function initScene(container) {
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a0a20, 0.025);

  // Camera - pulled back to see full arena and decorations
  camera = new THREE.PerspectiveCamera(42, container.clientWidth / container.clientHeight, 0.1, 100);
  camera.position.set(0, 6, 9);
  camera.lookAt(0, 0.3, 0);

  // WebGL renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.6;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  // CSS2D renderer for UI overlays (health bars, damage numbers)
  css2dRenderer = new CSS2DRenderer();
  css2dRenderer.setSize(container.clientWidth, container.clientHeight);
  css2dRenderer.domElement.style.position = 'absolute';
  css2dRenderer.domElement.style.top = '0';
  css2dRenderer.domElement.style.left = '0';
  css2dRenderer.domElement.style.pointerEvents = 'none';
  container.appendChild(css2dRenderer.domElement);

  // Lighting — bright enough to clearly see characters
  const ambient = new THREE.AmbientLight(0x6070a0, 1.2);
  scene.add(ambient);

  const mainLight = new THREE.DirectionalLight(0xccccff, 2.0);
  mainLight.position.set(3, 8, 4);
  mainLight.castShadow = true;
  mainLight.shadow.mapSize.set(1024, 1024);
  mainLight.shadow.camera.near = 0.5;
  mainLight.shadow.camera.far = 20;
  mainLight.shadow.camera.left = -5;
  mainLight.shadow.camera.right = 5;
  mainLight.shadow.camera.top = 5;
  mainLight.shadow.camera.bottom = -5;
  scene.add(mainLight);

  const warmLight = new THREE.PointLight(0xffcc66, 1.0, 20);
  warmLight.position.set(-2, 4, 2);
  scene.add(warmLight);

  const coolLight = new THREE.PointLight(0x6080ff, 0.8, 20);
  coolLight.position.set(2, 3, -3);
  scene.add(coolLight);

  const fillLight = new THREE.DirectionalLight(0xa080d0, 0.6);
  fillLight.position.set(-3, 5, -2);
  scene.add(fillLight);

  const bottomFill = new THREE.PointLight(0x404080, 0.5, 15);
  bottomFill.position.set(0, -1, 0);
  scene.add(bottomFill);

  // Handle resize
  const onResize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    css2dRenderer.setSize(w, h);
  };
  window.addEventListener('resize', onResize);

  return { scene, camera, renderer, css2dRenderer };
}

export function getScene() { return scene; }
export function getCamera() { return camera; }
export function getRenderer() { return renderer; }

export function addUpdateCallback(fn) {
  updateCallbacks.push(fn);
  return () => { updateCallbacks = updateCallbacks.filter(f => f !== fn); };
}

export function startRenderLoop() {
  if (animationFrameId) return;
  const clock = new THREE.Clock();
  function loop() {
    animationFrameId = requestAnimationFrame(loop);
    const delta = clock.getDelta();
    for (const cb of updateCallbacks) cb(delta);
    renderer.render(scene, camera);
    css2dRenderer.render(scene, camera);
  }
  loop();
}

export function stopRenderLoop() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}
