/* A robotic work cell.
   Drag the block anywhere on the floor. The turret swings through a full circle,
   the shoulder and elbow solve two-link inverse kinematics, the wrist keeps the
   claw level, and the claw closes once the fingers are around the block.
   Drag the empty floor to walk the camera around the cell. */

import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const figure = document.getElementById("viewport");
const canvas = document.getElementById("arm-canvas");
const hint = document.getElementById("viewport-hint");
const out = {
  j1: document.getElementById("j1"),
  j2: document.getElementById("j2"),
  j3: document.getElementById("j3"),
  j4: document.getElementById("j4"),
  claw: document.getElementById("claw"),
  mode: document.getElementById("mode")
};

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const coarse = window.matchMedia("(pointer: coarse)").matches;

/* the machine, in metres */
const SHOULDER_Y = 0.66;
const L1 = 1.12;            // upper arm
const L2 = 0.95;            // forearm
const CLAW_LEN = 0.34;      // wrist pivot to the middle of the finger pads
const BLOCK = 0.24;         // the payload is a cube this wide
const BLOCK_Y = BLOCK / 2;
const REACH_MIN = 0.72;
const REACH_MAX = L1 + L2 + CLAW_LEN - 0.16;

const GAP_OPEN = 0.46;
const GAP_SHUT = BLOCK - 0.014;   // the pads squeeze very slightly into the block

const AMBER = 0xf0a31e;
const STEEL = 0xa8b3ac;
const DARK = 0x33443f;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const damp = (cur, to, lambda, dt) => cur + (to - cur) * (1 - Math.exp(-lambda * dt));

let renderer, scene, camera;
let turret, shoulder, elbow, wrist, fingerL, fingerR;
let payload, payloadGlow, blockShadow, reachRing;

function fail(err) {
  figure.classList.add("is-broken");
  const p = document.createElement("p");
  p.className = "viewport__fallback";
  p.textContent = "This panel runs a live 3D work cell, and your browser could not start WebGL.";
  figure.appendChild(p);
  if (hint) hint.remove();
  console.error(err);
}

/* ---------------------------------------------------------------- build */

function boot() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.75 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  scene = new THREE.Scene();
  scene.background = skyTexture();
  scene.fog = new THREE.Fog(0x080f0e, 9.5, 21);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.26;
  pmrem.dispose();

  camera = new THREE.PerspectiveCamera(40, 1, 0.1, 80);

  buildLights();
  buildFloor();
  buildArm();
  buildPayload();

  resize();
  if (typeof ResizeObserver === "function") new ResizeObserver(resize).observe(figure);
  else window.addEventListener("resize", resize);

  if (hint && coarse) {
    hint.textContent = "Tap the floor to send the block there, or drag it. The arm turns, reaches and closes its claw.";
  }

  bindInput();
  startLoop();
}

/* a vertical gradient standing in for a room */
function skyTexture() {
  const c = document.createElement("canvas");
  c.width = 4; c.height = 256;
  const g = c.getContext("2d").createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, "#13201c");
  g.addColorStop(0.5, "#0b1412");
  g.addColorStop(1, "#050a09");
  const ctx = c.getContext("2d");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* a soft round blob used for contact shadow under the payload */
function blobTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, "rgba(0,0,0,0.55)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function buildLights() {
  scene.add(new THREE.HemisphereLight(0x8ea79b, 0x05100d, 0.28));

  const key = new THREE.DirectionalLight(0xfff2dc, 3.4);
  key.position.set(3.4, 5.6, 2.9);
  key.castShadow = true;
  key.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 16;
  key.shadow.camera.left = -3.6;
  key.shadow.camera.right = 3.6;
  key.shadow.camera.top = 3.6;
  key.shadow.camera.bottom = -3.6;
  key.shadow.bias = -0.0009;
  key.shadow.normalBias = 0.02;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0x7fc4b4, 0.7);
  fill.position.set(-4.2, 2.4, -1.6);
  scene.add(fill);

  const warm = new THREE.PointLight(AMBER, 14, 7, 2);
  warm.position.set(-1.4, 1.5, 1.9);
  scene.add(warm);
}

function buildFloor() {
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(9, 64),
    new THREE.MeshStandardMaterial({ color: 0x0c1614, roughness: 0.72, metalness: 0.22 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const grid = new THREE.GridHelper(14, 28, 0x33514a, 0x1d2c28);
  grid.position.y = 0.002;
  grid.material.transparent = true;
  grid.material.opacity = 0.5;
  scene.add(grid);

  /* the working circle: everything inside it is reachable */
  reachRing = new THREE.Mesh(
    new THREE.RingGeometry(REACH_MAX - 0.012, REACH_MAX, 96),
    new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0.3, side: THREE.DoubleSide })
  );
  reachRing.rotation.x = -Math.PI / 2;
  reachRing.position.y = 0.004;
  scene.add(reachRing);

  const dais = new THREE.Mesh(
    new THREE.CylinderGeometry(0.62, 0.7, 0.07, 56),
    new THREE.MeshStandardMaterial({ color: 0x1b2b27, roughness: 0.5, metalness: 0.5 })
  );
  dais.position.y = 0.035;
  dais.castShadow = dais.receiveShadow = true;
  scene.add(dais);
}

/* a box with rounded edges: reads far better than a bare BoxGeometry */
function roundedBox(w, h, d, r) {
  const rr = Math.min(r, w / 2 - 0.002, h / 2 - 0.002, d / 2 - 0.002);
  const sw = w - 2 * rr;
  const sh = h - 2 * rr;
  const shape = new THREE.Shape();
  shape.moveTo(-sw / 2, -sh / 2);
  shape.lineTo(sw / 2, -sh / 2);
  shape.lineTo(sw / 2, sh / 2);
  shape.lineTo(-sw / 2, sh / 2);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: d - 2 * rr, bevelEnabled: true, bevelSize: rr, bevelThickness: rr,
    bevelSegments: 3, curveSegments: 2, steps: 1
  });
  geo.translate(0, 0, -(d - 2 * rr) / 2);
  geo.computeVertexNormals();
  return geo;
}

function buildArm() {
  const steel = new THREE.MeshStandardMaterial({ color: STEEL, roughness: 0.34, metalness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: DARK, roughness: 0.42, metalness: 0.7 });
  const pad = new THREE.MeshStandardMaterial({ color: 0x14201d, roughness: 0.95, metalness: 0.0 });
  const glow = new THREE.MeshBasicMaterial({ color: AMBER });

  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.54, 0.09, 48), dark);
  plate.position.y = 0.115;
  plate.castShadow = plate.receiveShadow = true;
  scene.add(plate);

  for (let i = 0; i < 6; i++) {
    const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.02, 6), steel);
    bolt.position.set(Math.cos(i / 6 * Math.PI * 2) * 0.41, 0.168, Math.sin(i / 6 * Math.PI * 2) * 0.41);
    scene.add(bolt);
  }

  turret = new THREE.Group();
  scene.add(turret);

  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.1, 40), dark);
  collar.position.y = 0.21;
  collar.castShadow = true;
  turret.add(collar);

  const column = new THREE.Mesh(roundedBox(0.34, SHOULDER_Y - 0.24, 0.42, 0.05), steel);
  column.position.y = 0.26 + (SHOULDER_Y - 0.24) / 2;
  column.castShadow = true;
  turret.add(column);

  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.022, 0.06), glow);
  stripe.position.set(0, SHOULDER_Y - 0.12, 0.21);
  turret.add(stripe);

  shoulder = new THREE.Group();
  shoulder.position.y = SHOULDER_Y;
  turret.add(shoulder);
  shoulder.add(hub(0.145, 0.27, dark, glow));

  const upper = new THREE.Mesh(roundedBox(L1, 0.2, 0.17, 0.045), steel);
  upper.position.x = L1 / 2;
  upper.castShadow = true;
  shoulder.add(upper);

  const rib = new THREE.Mesh(roundedBox(L1 * 0.6, 0.075, 0.2, 0.03), dark);
  rib.position.x = L1 / 2;
  rib.castShadow = true;
  shoulder.add(rib);

  elbow = new THREE.Group();
  elbow.position.x = L1;
  shoulder.add(elbow);
  elbow.add(hub(0.115, 0.215, dark, glow));

  const fore = new THREE.Mesh(roundedBox(L2, 0.155, 0.135, 0.04), steel);
  fore.position.x = L2 / 2;
  fore.castShadow = true;
  elbow.add(fore);

  wrist = new THREE.Group();
  wrist.position.x = L2;
  elbow.add(wrist);
  wrist.add(hub(0.09, 0.175, dark, glow));

  const palm = new THREE.Mesh(roundedBox(0.19, 0.13, 0.23, 0.035), dark);
  palm.position.x = 0.115;
  palm.castShadow = true;
  wrist.add(palm);

  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.4, 12), steel);
  rail.rotation.x = Math.PI / 2;
  rail.position.x = 0.2;
  wrist.add(rail);

  fingerL = buildFinger(steel, pad);
  fingerR = buildFinger(steel, pad);
  fingerR.scale.z = -1;
  wrist.add(fingerL, fingerR);
}

function buildFinger(steel, pad) {
  const g = new THREE.Group();

  const knuckle = new THREE.Mesh(roundedBox(0.1, 0.1, 0.075, 0.022), steel);
  knuckle.position.set(0.2, 0, 0);
  knuckle.castShadow = true;
  g.add(knuckle);

  const blade = new THREE.Mesh(roundedBox(0.23, 0.075, 0.055, 0.018), steel);
  blade.position.set(0.33, 0, 0);
  blade.castShadow = true;
  g.add(blade);

  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.062, 0.014), pad);
  grip.position.set(0.345, 0, -0.032);
  g.add(grip);

  return g;
}

function hub(r, w, body, ring) {
  const g = new THREE.Group();
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 30), body);
  cyl.rotation.x = Math.PI / 2;
  cyl.castShadow = true;
  g.add(cyl);

  for (const side of [-1, 1]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(r * 0.94, r * 0.08, 8, 28), ring);
    band.position.z = side * (w / 2 + 0.004);
    g.add(band);
  }
  return g;
}

function buildPayload() {
  payload = new THREE.Mesh(
    roundedBox(BLOCK, BLOCK, BLOCK, 0.028),
    new THREE.MeshStandardMaterial({ color: 0xb9c2ba, roughness: 0.3, metalness: 0.55 })
  );
  payload.castShadow = payload.receiveShadow = true;
  scene.add(payload);

  payloadGlow = new THREE.Mesh(
    new THREE.BoxGeometry(BLOCK * 1.005, 0.02, BLOCK * 1.005),
    new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0.0 })
  );
  payload.add(payloadGlow);

  blockShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.62, 0.62),
    new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, opacity: 0.7 })
  );
  blockShadow.rotation.x = -Math.PI / 2;
  blockShadow.position.y = 0.006;
  scene.add(blockShadow);

  setBlock(1.05, -1.24);
}

/* ---------------------------------------------------------------- state */

const block = new THREE.Vector3(1.05, BLOCK_Y, -1.24);
const angles = { yaw: 0, a1: 0.55, a2: -1.25, a3: 0.7, gap: GAP_OPEN };
const orbit = { theta: 0.68, phi: 1.03, radius: 4.15, tTheta: 0.68, tPhi: 1.03 };

let mode = "demo";        // demo | drag | orbit
let lastTouch = performance.now();   // hold the opening pose before the demo takes over
let wasIdle = false;
/* the unattended cycle: place the block, let the arm fetch it, place it again */
const DEMO_HOLD = 3300;
const DEMO_TRAVEL = 900;
let demoNext = 0, demoStart = 0;
let demoA0 = 0, demoA1 = 0, demoR0 = 0, demoR1 = 0;
let clamped = false;
let gripping = false;

function setBlock(x, z) {
  const r = Math.hypot(x, z);
  clamped = r > REACH_MAX || r < REACH_MIN;
  const rr = clamp(r, REACH_MIN, REACH_MAX);
  const s = r < 1e-4 ? 0 : rr / r;
  block.set(x * s, BLOCK_Y, z * s);
}

/* ---------------------------------------------------------------- input */

const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -BLOCK_Y);
const hitPoint = new THREE.Vector3();

let dragging = false;
let orbiting = false;
let moved = 0;
let lastX = 0, lastY = 0;

function toNdc(e) {
  const r = figure.getBoundingClientRect();
  ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  ndc.y = 1 - ((e.clientY - r.top) / r.height) * 2;
  return ndc;
}

function groundAt(e) {
  ray.setFromCamera(toNdc(e), camera);
  return ray.ray.intersectPlane(groundPlane, hitPoint) ? hitPoint : null;
}

function bindInput() {
  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    moved = 0;
    lastX = e.clientX;
    lastY = e.clientY;
    lastTouch = performance.now();

    ray.setFromCamera(toNdc(e), camera);
    if (ray.intersectObject(payload, false).length) {
      dragging = true;
      mode = "drag";
      canvas.style.cursor = "grabbing";
    } else {
      orbiting = true;
    }
  });

  canvas.addEventListener("pointermove", (e) => {
    moved += Math.abs(e.clientX - lastX) + Math.abs(e.clientY - lastY);

    if (dragging) {
      const p = groundAt(e);
      if (p) setBlock(p.x, p.z);
      lastTouch = performance.now();
    } else if (orbiting) {
      orbit.tTheta -= (e.clientX - lastX) * 0.006;
      orbit.tPhi = clamp(orbit.tPhi - (e.clientY - lastY) * 0.005, 0.34, 1.42);
      lastTouch = performance.now();
      if (moved > 8) mode = "orbit";
    } else if (!coarse) {
      ray.setFromCamera(toNdc(e), camera);
      canvas.style.cursor = ray.intersectObject(payload, false).length ? "grab" : "move";
    }

    lastX = e.clientX;
    lastY = e.clientY;
  });

  const release = (e) => {
    /* a tap on the floor sends the block there */
    if (orbiting && moved < 9) {
      const p = groundAt(e);
      if (p) { setBlock(p.x, p.z); mode = "drag"; }
    }
    dragging = false;
    orbiting = false;
    if (!coarse) canvas.style.cursor = "move";
    lastTouch = performance.now();
  };

  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
  canvas.style.cursor = coarse ? "" : "move";
}

/* ---------------------------------------------------------------- solve */

/* Two links plus a level claw. The wrist has to sit CLAW_LEN short of the block
   so that the finger pads, not the wrist, end up around it. */
function solve(target) {
  const r = Math.hypot(target.x, target.z);
  const yaw = Math.atan2(-target.z, target.x);

  const dx = Math.max(r - CLAW_LEN, 0.12);
  const dy = target.y - SHOULDER_Y;

  let d = Math.hypot(dx, dy);
  const max = L1 + L2 - 0.02;
  const min = Math.abs(L1 - L2) + 0.06;
  d = clamp(d, min, max);

  const c2 = (d * d - L1 * L1 - L2 * L2) / (2 * L1 * L2);
  const a2 = -Math.acos(clamp(c2, -1, 1));
  const a1 = Math.atan2(dy, dx) - Math.atan2(L2 * Math.sin(a2), L1 + L2 * Math.cos(a2));

  return { yaw, a1, a2, a3: -(a1 + a2) };
}

/* where the finger pads actually are, given the angles we have damped to */
function padRadius() {
  return L1 * Math.cos(angles.a1)
       + L2 * Math.cos(angles.a1 + angles.a2)
       + CLAW_LEN * Math.cos(angles.a1 + angles.a2 + angles.a3);
}
function padHeight() {
  return SHOULDER_Y
       + L1 * Math.sin(angles.a1)
       + L2 * Math.sin(angles.a1 + angles.a2)
       + CLAW_LEN * Math.sin(angles.a1 + angles.a2 + angles.a3);
}

/* ---------------------------------------------------------------- loop */

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
  const dt = Math.min((now - prev) / 1000, 0.05);
  prev = now;
  if (!running || document.hidden) return;

  const idle = now - lastTouch > 5000;
  if (idle && !reduceMotion) {
    mode = "demo";
    demoCycle(now);
  } else if (!idle) {
    wasIdle = false;
  }

  /* payload */
  payload.position.copy(block);
  payload.rotation.y = damp(payload.rotation.y, Math.atan2(-block.z, block.x), 5, dt);
  blockShadow.position.set(block.x, 0.006, block.z);

  /* joints */
  const want = solve(block);
  angles.yaw += wrap(want.yaw - angles.yaw) * (1 - Math.exp(-7 * dt));
  angles.a1 = damp(angles.a1, want.a1, 7, dt);
  angles.a2 = damp(angles.a2, want.a2, 7, dt);
  angles.a3 = damp(angles.a3, want.a3, 7, dt);

  /* claw: open while travelling, shut once the pads are around the block */
  const miss = Math.hypot(padRadius() - Math.hypot(block.x, block.z), padHeight() - block.y)
             + Math.abs(wrap(want.yaw - angles.yaw)) * 1.4;
  gripping = miss < 0.07;
  const gap = gripping ? GAP_SHUT : clamp(GAP_SHUT + miss * 1.5, GAP_SHUT, GAP_OPEN);
  angles.gap = damp(angles.gap, gap, 11, dt);

  turret.rotation.y = angles.yaw;
  shoulder.rotation.z = angles.a1;
  elbow.rotation.z = angles.a2;
  wrist.rotation.z = angles.a3;
  fingerL.position.z = angles.gap / 2;
  fingerR.position.z = -angles.gap / 2;

  payloadGlow.material.opacity = damp(payloadGlow.material.opacity, gripping ? 0.6 : 0, 9, dt);
  reachRing.material.opacity = damp(reachRing.material.opacity, clamped ? 0.75 : 0.26, 6, dt);

  /* camera */
  orbit.theta = damp(orbit.theta, orbit.tTheta, 6, dt);
  orbit.phi = damp(orbit.phi, orbit.tPhi, 6, dt);
  placeCamera();

  readout();
  renderer.render(scene, camera);
}

/* Move the block to a fresh spot, then leave it alone long enough for the arm to
   swing round, reach it and shut the claw before moving it again. */
function demoCycle(now) {
  if (!wasIdle) {
    wasIdle = true;
    demoA1 = demoA0 = Math.atan2(-block.z, block.x);
    demoR1 = demoR0 = Math.hypot(block.x, block.z);
    demoStart = now;
    demoNext = now + DEMO_HOLD;
  }

  if (now >= demoNext) {
    demoA0 = demoA1;
    demoR0 = demoR1;
    demoA1 = demoA0 + 0.95 + Math.random() * 0.85;
    demoR1 = 1.15 + Math.random() * 0.82;
    demoStart = now;
    demoNext = now + DEMO_HOLD;
  }

  const k = clamp((now - demoStart) / DEMO_TRAVEL, 0, 1);
  const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  const a = demoA0 + (demoA1 - demoA0) * e;
  const r = demoR0 + (demoR1 - demoR0) * e;
  setBlock(Math.cos(a) * r, -Math.sin(a) * r);
}

function placeCamera() {
  const r = orbit.radius;
  camera.position.set(
    r * Math.sin(orbit.phi) * Math.cos(orbit.theta),
    r * Math.cos(orbit.phi),
    r * Math.sin(orbit.phi) * Math.sin(orbit.theta)
  );
  camera.lookAt(0, 0.52, 0);
}

let hudAt = 0;
function readout() {
  const now = performance.now();
  if (now - hudAt < 100) return;
  hudAt = now;
  deg(out.j1, wrap(angles.yaw));
  deg(out.j2, angles.a1);
  deg(out.j3, angles.a2);
  deg(out.j4, angles.a3);
  if (out.claw) out.claw.textContent = gripping ? "CLOSED" : "OPEN";
  if (out.mode) {
    out.mode.textContent = clamped ? "AT REACH LIMIT"
      : mode === "drag" ? "OPERATOR"
      : mode === "orbit" ? "CAMERA"
      : reduceMotion ? "HOLD" : "DEMO CYCLE";
  }
}

function deg(el, rad) {
  if (!el) return;
  const v = (rad * 180) / Math.PI;
  el.textContent = (v < 0 ? "-" : "+") + Math.abs(v).toFixed(1).padStart(5, "0");
}

/* ---------------------------------------------------------------- size */

function resize() {
  const w = figure.clientWidth;
  const h = figure.clientHeight;
  if (!w || !h) return;

  renderer.setSize(w, h, false);
  camera.aspect = w / h;

  /* narrow panels need a wider lens and a longer lead or the cell falls out of frame */
  const a = camera.aspect;
  camera.fov = clamp(38 + (1.45 - a) * 12, 38, 54);
  orbit.radius = clamp(4.15 * clamp(1.35 / a, 1, 1.32), 4.15, 5.5);

  camera.updateProjectionMatrix();
  placeCamera();
  renderer.render(scene, camera);
}

/* Everything above is declaration only. Start the cell last, once it is all in place. */
try { boot(); } catch (err) { fail(err); }
