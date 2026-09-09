/* A five-axis arm that solves its own joint angles to reach the pointer.
   Two-link inverse kinematics in the vertical plane, base yaw on top. */

import * as THREE from "three";

const figure = document.getElementById("viewport");
const canvas = document.getElementById("arm-canvas");
const hint = document.getElementById("viewport-hint");
const out = {
  j1: document.getElementById("j1"),
  j2: document.getElementById("j2"),
  j3: document.getElementById("j3"),
  j4: document.getElementById("j4"),
  mode: document.getElementById("mode")
};

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

const SHOULDER_Y = 0.62;
const BASE_CAM = { x: 3.05, y: 2.15, z: 3.9 };
const L1 = 1.15;
const L2 = 0.98;

let renderer, scene, camera, turret, shoulder, elbow, wrist, marker;

try {
  boot();
} catch (err) {
  figure.classList.add("is-broken");
  const p = document.createElement("p");
  p.className = "viewport__fallback";
  p.textContent = "This panel runs a live 3D arm, and your browser could not start WebGL.";
  figure.appendChild(p);
  if (hint) hint.remove();
  console.error(err);
}

function boot() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0e1917);
  scene.fog = new THREE.Fog(0x0e1917, 5.5, 13);

  camera = new THREE.PerspectiveCamera(42, 1, 0.1, 60);
  camera.lookAt(0, 0.86, 0);
  frameCamera(1.6);

  buildLights();
  buildFloor();
  buildArm();

  resize();
  if (typeof ResizeObserver === "function") {
    new ResizeObserver(resize).observe(figure);
  } else {
    window.addEventListener("resize", resize);
  }

  if (hint && window.matchMedia("(pointer: coarse)").matches) {
    hint.textContent = "Drag across the panel. The arm solves its own joint angles to reach you.";
  }

  bindPointer();
  startLoop();
}

function buildLights() {
  scene.add(new THREE.HemisphereLight(0x8fa89c, 0x0a1211, 0.55));

  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(3.2, 5.2, 2.6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 14;
  key.shadow.camera.left = -4;
  key.shadow.camera.right = 4;
  key.shadow.camera.top = 4;
  key.shadow.camera.bottom = -4;
  key.shadow.bias = -0.0012;
  scene.add(key);

  const rim = new THREE.DirectionalLight(0xf0a31e, 0.45);
  rim.position.set(-3.4, 1.6, -2.8);
  scene.add(rim);
}

function buildFloor() {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(24, 24),
    new THREE.MeshStandardMaterial({ color: 0x14201d, roughness: 0.95, metalness: 0.05 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const grid = new THREE.GridHelper(16, 32, 0x2c4038, 0x1e2c28);
  grid.position.y = 0.002;
  grid.material.transparent = true;
  grid.material.opacity = 0.55;
  scene.add(grid);
}

function buildArm() {
  const steel = new THREE.MeshStandardMaterial({ color: 0x9ba7a1, metalness: 0.55, roughness: 0.42 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b3a35, metalness: 0.7, roughness: 0.34 });
  const amber = new THREE.MeshBasicMaterial({ color: 0xf0a31e });

  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.58, 0.12, 40), dark);
  plinth.position.y = 0.06;
  plinth.castShadow = plinth.receiveShadow = true;
  scene.add(plinth);

  turret = new THREE.Group();
  scene.add(turret);

  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, SHOULDER_Y - 0.12, 32), steel);
  column.position.y = 0.12 + (SHOULDER_Y - 0.12) / 2;
  column.castShadow = true;
  turret.add(column);

  shoulder = new THREE.Group();
  shoulder.position.y = SHOULDER_Y;
  turret.add(shoulder);
  shoulder.add(joint(0.17, dark, amber));

  const upper = new THREE.Mesh(new THREE.BoxGeometry(L1, 0.17, 0.2), steel);
  upper.position.x = L1 / 2;
  upper.castShadow = true;
  shoulder.add(upper);

  elbow = new THREE.Group();
  elbow.position.x = L1;
  shoulder.add(elbow);
  elbow.add(joint(0.13, dark, amber));

  const fore = new THREE.Mesh(new THREE.BoxGeometry(L2, 0.13, 0.155), steel);
  fore.position.x = L2 / 2;
  fore.castShadow = true;
  elbow.add(fore);

  wrist = new THREE.Group();
  wrist.position.x = L2;
  elbow.add(wrist);
  wrist.add(joint(0.095, dark, amber));

  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.11, 0.13), dark);
  palm.position.x = 0.1;
  palm.castShadow = true;
  wrist.add(palm);

  for (const side of [-1, 1]) {
    const finger = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.035, 0.035), steel);
    finger.position.set(0.27, 0, side * 0.05);
    finger.castShadow = true;
    wrist.add(finger);
  }

  marker = new THREE.Mesh(
    new THREE.TorusGeometry(0.062, 0.006, 8, 24),
    new THREE.MeshBasicMaterial({ color: 0xf0a31e, transparent: true, opacity: 0 })
  );
  marker.visible = false;
  scene.add(marker);
}

function joint(r, body, ring) {
  const g = new THREE.Group();
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(r, r, r * 1.5, 28), body);
  hub.rotation.x = Math.PI / 2;
  hub.castShadow = true;
  g.add(hub);

  const band = new THREE.Mesh(new THREE.TorusGeometry(r * 1.02, r * 0.09, 8, 28), ring);
  g.add(band);
  return g;
}

/* ---------- input ---------- */

const aim = { x: 0, y: 0 };       // pointer in normalised panel coords
const angles = { yaw: 0, a1: 0.5, a2: -1.2, a3: 0.6 };
let tracking = false;
let lastInput = -Infinity;

function bindPointer() {
  figure.addEventListener("pointermove", (e) => {
    const r = figure.getBoundingClientRect();
    aim.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    aim.y = 1 - ((e.clientY - r.top) / r.height) * 2;
    lastInput = performance.now();
    figure.classList.add("is-driven");
  }, { passive: true });

  figure.addEventListener("pointerleave", () => { lastInput = -Infinity; }, { passive: true });
}

/* ---------- solve ---------- */

function targetFromAim(t) {
  const idle = performance.now() - lastInput > 2200;
  let ax = aim.x;
  let ay = aim.y;

  if (idle) {
    if (reduceMotion) { ax = 0.25; ay = 0.15; }
    else {
      ax = Math.sin(t * 0.00035) * 0.75;
      ay = Math.sin(t * 0.00052 + 1.1) * 0.55;
    }
  }
  if (out.mode) out.mode.textContent = idle ? (reduceMotion ? "HOLD" : "IDLE SWEEP") : "TRACKING";
  tracking = !idle;

  return {
    yaw: -ax * 1.05,
    radius: 1.62 - Math.abs(ay) * 0.42,
    height: SHOULDER_Y + ay * 1.15 + 0.35
  };
}

function solve(target) {
  const dx = target.radius;
  const dy = target.height - SHOULDER_Y;
  let d = Math.hypot(dx, dy);
  const max = L1 + L2 - 0.03;
  const min = Math.abs(L1 - L2) + 0.08;
  d = Math.min(Math.max(d, min), max);

  const c2 = (d * d - L1 * L1 - L2 * L2) / (2 * L1 * L2);
  const a2 = -Math.acos(clamp(c2, -1, 1));
  const a1 = Math.atan2(dy, dx) - Math.atan2(L2 * Math.sin(a2), L1 + L2 * Math.cos(a2));

  return { yaw: target.yaw, a1, a2, a3: -(a1 + a2) * 0.8 };
}


/* ---------- loop ---------- */

let running = true;
let prev = performance.now();

function startLoop() {
  if (typeof IntersectionObserver === "function") {
    new IntersectionObserver(([e]) => { running = e.isIntersecting; }).observe(figure);
  }
  document.addEventListener("visibilitychange", () => { prev = performance.now(); });
  requestAnimationFrame(frame);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - prev) / 1000, 0.1);
  prev = now;
  if (!running || document.hidden) return;

  const target = targetFromAim(now);
  const want = solve(target);
  const k = 1 - Math.exp(-6.5 * dt);

  let moved = 0;
  for (const key of ["yaw", "a1", "a2", "a3"]) {
    const delta = want[key] - angles[key];
    angles[key] += delta * k;
    moved = Math.max(moved, Math.abs(delta));
  }

  if (reduceMotion && moved < 0.0006) return;

  turret.rotation.y = angles.yaw;
  shoulder.rotation.z = angles.a1;
  elbow.rotation.z = angles.a2;
  wrist.rotation.z = angles.a3;

  marker.visible = tracking;
  if (tracking) {
    marker.material.opacity = Math.min(marker.material.opacity + dt * 3, 0.7);
    marker.position.set(
      Math.cos(angles.yaw) * target.radius,
      target.height,
      -Math.sin(angles.yaw) * target.radius
    );
    marker.lookAt(camera.position);
  } else {
    marker.material.opacity = 0;
  }

  readout();
  renderer.render(scene, camera);
}

let hudAt = 0;
function readout() {
  const now = performance.now();
  if (now - hudAt < 90) return;
  hudAt = now;
  write(out.j1, angles.yaw);
  write(out.j2, angles.a1);
  write(out.j3, angles.a2);
  write(out.j4, angles.a3);
}

function write(el, rad) {
  if (!el) return;
  const deg = (rad * 180) / Math.PI;
  el.textContent = (deg < 0 ? "-" : "+") + Math.abs(deg).toFixed(1).padStart(5, "0");
}

/* Narrow panels need the camera further back or the arm reaches out of frame. */
function frameCamera(aspect) {
  const pull = clamp(1.15 / aspect, 1, 1.7);
  camera.position.set(
    BASE_CAM.x * pull,
    BASE_CAM.y * (1 + (pull - 1) * 0.45),
    BASE_CAM.z * pull
  );
  camera.lookAt(0, 0.86, 0);
}

function resize() {
  const w = figure.clientWidth;
  const h = figure.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  frameCamera(camera.aspect);
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
}
