/* A robotic cell you can operate.
   Drag the block anywhere on the floor, or lift it into the air by its handle.
   Let go and the arm comes for it: approach, descend, close the claw, lift,
   carry it across the cell and set it down on the pedestal, then return to rest.
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
const L1 = 1.12;
const L2 = 0.95;
const CLAW_LEN = 0.34;

const BLOCK = 0.24;
const HALF = BLOCK / 2;

const REACH_MIN = 0.62;
const REACH_MAX = L1 + L2 + CLAW_LEN - 0.2;
const LIFT_MAX = 1.55;

const GAP_OPEN = 0.46;
const GAP_SHUT = BLOCK - 0.014;

const PED_TOP = 0.44;
const HOME = new THREE.Vector3(-0.89, PED_TOP + HALF, 1.27);
const REST = new THREE.Vector3(1.05, 1.18, -0.62);
const CARRY_Y = 1.06;
const HOVER = 0.4;

const AMBER = 0xf0a31e;
const STEEL = 0xa8b3ac;
const DARK = 0x33443f;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const damp = (cur, to, k, dt) => cur + (to - cur) * (1 - Math.exp(-k * dt));

let renderer, scene, camera;
let turret, shoulder, elbow, wrist, fingerL, fingerR, padAnchor;
let payload, payloadGlow, blockShadow, stem, handle, reachRing, pedestalRing;

/* ------------------------------------------------------------------ boot */

function fail(err) {
  figure.classList.add("is-broken");
  const p = document.createElement("p");
  p.className = "viewport__fallback";
  p.textContent = "This panel runs a live 3D robotic cell, and your browser could not start WebGL.";
  figure.appendChild(p);
  if (hint) hint.remove();
  console.error(err);
}

function boot() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.75 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;

  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0a1310, 9, 22);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.24;
  pmrem.dispose();

  camera = new THREE.PerspectiveCamera(42, 1, 0.1, 90);

  buildRoom();
  buildLights();
  buildArm();
  buildPedestal();
  buildPayload();

  resize();
  if (typeof ResizeObserver === "function") new ResizeObserver(resize).observe(figure);
  else window.addEventListener("resize", resize);

  if (hint && coarse) {
    hint.textContent = "Drag the block anywhere, or drag the ring above it to lift it. Let go and the arm fetches it back to the pedestal.";
  }

  bindInput();
  startLoop();
}

/* ------------------------------------------------------------------ room */

function blobTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(64, 64, 3, 64, 64, 62);
  g.addColorStop(0, "rgba(0,0,0,0.6)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/* A cyclorama with light falling down it, so the cell reads as a room from any
   angle instead of a dark void with a horizon line across it. */
function wallTexture() {
  const c = document.createElement("canvas");
  c.width = 4; c.height = 256;
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, "#050a09");
  g.addColorStop(0.42, "#0c1614");
  g.addColorStop(0.8, "#1e2f2a");
  g.addColorStop(1, "#25382f");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildRoom() {
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(9.5, 9.5, 9, 56, 1, true),
    new THREE.MeshBasicMaterial({ map: wallTexture(), side: THREE.BackSide, fog: true })
  );
  wall.position.y = 4.1;
  scene.add(wall);

  /* a horizon glow where the wall meets the floor */
  const skirt = new THREE.Mesh(
    new THREE.CylinderGeometry(9.45, 9.45, 0.5, 56, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x2c4239, side: THREE.BackSide, transparent: true, opacity: 0.55, fog: true })
  );
  skirt.position.y = 0.25;
  scene.add(skirt);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(9.4, 64),
    new THREE.MeshStandardMaterial({ color: 0x111e1b, roughness: 0.68, metalness: 0.24 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const grid = new THREE.GridHelper(16, 32, 0x2f4a44, 0x1b2a26);
  grid.position.y = 0.002;
  grid.material.transparent = true;
  grid.material.opacity = 0.5;
  scene.add(grid);

  reachRing = new THREE.Mesh(
    new THREE.RingGeometry(REACH_MAX - 0.014, REACH_MAX, 96),
    new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0.28, side: THREE.DoubleSide })
  );
  reachRing.rotation.x = -Math.PI / 2;
  reachRing.position.y = 0.004;
  scene.add(reachRing);

  /* an overhead light bar: gives the upper half of the frame something to hold */
  const bar = new THREE.Mesh(
    new THREE.BoxGeometry(3.9, 0.075, 0.16),
    new THREE.MeshBasicMaterial({ color: 0xffe9c2 })
  );
  bar.position.set(0.25, 2.02, -0.95);
  bar.rotation.y = -0.35;
  scene.add(bar);

  const housing = new THREE.Mesh(
    new THREE.BoxGeometry(4.15, 0.14, 0.28),
    new THREE.MeshStandardMaterial({ color: 0x1d2c28, roughness: 0.6, metalness: 0.5 })
  );
  housing.position.set(0.25, 2.12, -0.95);
  housing.rotation.y = -0.35;
  scene.add(housing);

  for (const dx of [-1.6, 1.6]) {
    const rod = new THREE.Mesh(
      new THREE.CylinderGeometry(0.014, 0.014, 5.2, 8),
      new THREE.MeshStandardMaterial({ color: 0x2a3a35, roughness: 0.5, metalness: 0.7 })
    );
    rod.position.set(0.25 + dx * Math.cos(0.35), 4.75, -0.95 + dx * Math.sin(0.35));
    scene.add(rod);
  }
}

function buildLights() {
  scene.add(new THREE.HemisphereLight(0x8ea79b, 0x05100d, 0.3));

  const key = new THREE.DirectionalLight(0xfff2dc, 3.2);
  key.position.set(2.6, 5.4, 2.2);
  key.castShadow = true;
  key.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 16;
  key.shadow.camera.left = -3.8;
  key.shadow.camera.right = 3.8;
  key.shadow.camera.top = 3.8;
  key.shadow.camera.bottom = -3.8;
  key.shadow.bias = -0.0009;
  key.shadow.normalBias = 0.022;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0x7fc4b4, 0.65);
  fill.position.set(-4.2, 2.4, -2.4);
  scene.add(fill);

  const warm = new THREE.PointLight(AMBER, 12, 7, 2);
  warm.position.set(-1.5, 1.4, 1.8);
  scene.add(warm);
}

/* ------------------------------------------------------------------ parts */

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

function buildArm() {
  const steel = new THREE.MeshStandardMaterial({ color: STEEL, roughness: 0.34, metalness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: DARK, roughness: 0.42, metalness: 0.7 });
  const pad = new THREE.MeshStandardMaterial({ color: 0x14201d, roughness: 0.95, metalness: 0 });
  const glow = new THREE.MeshBasicMaterial({ color: AMBER });

  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.56, 0.11, 48), dark);
  plate.position.y = 0.055;
  plate.castShadow = plate.receiveShadow = true;
  scene.add(plate);

  for (let i = 0; i < 6; i++) {
    const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.022, 6), steel);
    bolt.position.set(Math.cos(i / 6 * Math.PI * 2) * 0.42, 0.115, Math.sin(i / 6 * Math.PI * 2) * 0.42);
    scene.add(bolt);
  }

  turret = new THREE.Group();
  scene.add(turret);

  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.11, 40), dark);
  collar.position.y = 0.16;
  collar.castShadow = true;
  turret.add(collar);

  const column = new THREE.Mesh(roundedBox(0.34, SHOULDER_Y - 0.2, 0.42, 0.05), steel);
  column.position.y = 0.22 + (SHOULDER_Y - 0.2) / 2;
  column.castShadow = true;
  turret.add(column);

  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.022, 0.06), glow);
  stripe.position.set(0, SHOULDER_Y - 0.13, 0.21);
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

  /* exactly where the pads meet: the arm's business end */
  padAnchor = new THREE.Object3D();
  padAnchor.position.x = CLAW_LEN;
  wrist.add(padAnchor);
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

function buildPedestal() {
  const col = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.25, PED_TOP, 32),
    new THREE.MeshStandardMaterial({ color: 0x354842, roughness: 0.5, metalness: 0.55 })
  );
  col.position.set(HOME.x, PED_TOP / 2, HOME.z);
  col.castShadow = col.receiveShadow = true;
  scene.add(col);

  const top = new THREE.Mesh(
    new THREE.CylinderGeometry(0.26, 0.26, 0.03, 32),
    new THREE.MeshStandardMaterial({ color: STEEL, roughness: 0.46, metalness: 0.42 })
  );
  top.position.set(HOME.x, PED_TOP + 0.015, HOME.z);
  top.castShadow = top.receiveShadow = true;
  scene.add(top);

  pedestalRing = new THREE.Mesh(
    new THREE.RingGeometry(0.2, 0.225, 40),
    new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
  );
  pedestalRing.rotation.x = -Math.PI / 2;
  pedestalRing.position.set(HOME.x, PED_TOP + 0.033, HOME.z);
  scene.add(pedestalRing);

  const base = new THREE.Mesh(
    new THREE.RingGeometry(0.31, 0.335, 44),
    new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0.3, side: THREE.DoubleSide })
  );
  base.rotation.x = -Math.PI / 2;
  base.position.set(HOME.x, 0.005, HOME.z);
  scene.add(base);
}

function buildPayload() {
  payload = new THREE.Mesh(
    roundedBox(BLOCK, BLOCK, BLOCK, 0.028),
    new THREE.MeshStandardMaterial({ color: 0xbcc5bd, roughness: 0.28, metalness: 0.6 })
  );
  payload.castShadow = payload.receiveShadow = true;
  scene.add(payload);

  payloadGlow = new THREE.Mesh(
    new THREE.BoxGeometry(BLOCK * 1.006, 0.022, BLOCK * 1.006),
    new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0 })
  );
  payload.add(payloadGlow);

  blockShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.66, 0.66),
    new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, opacity: 0.7 })
  );
  blockShadow.rotation.x = -Math.PI / 2;
  scene.add(blockShadow);

  /* the drop line makes the block's height in the room readable */
  stem = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
    new THREE.LineDashedMaterial({ color: AMBER, dashSize: 0.06, gapSize: 0.05, transparent: true, opacity: 0 })
  );
  scene.add(stem);

  /* grab this ring to lift the block off the floor */
  handle = new THREE.Mesh(
    new THREE.TorusGeometry(0.115, 0.014, 10, 28),
    new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0.85 })
  );
  handle.rotation.x = -Math.PI / 2;
  scene.add(handle);
}

/* ----------------------------------------------------------------- state */

const block = new THREE.Vector3(1.62, HALF, -0.35);
const blockVel = new THREE.Vector3();
const angles = { yaw: 0, a1: 0.5, a2: -1.2, a3: 0.7, gap: GAP_OPEN };
const orbit = { theta: 0.7, phi: 1.12, radius: 5, tTheta: 0.7, tPhi: 1.12 };

const goal = new THREE.Vector3().copy(REST);
const padWorld = new THREE.Vector3();

const STATE = {
  REST: "AT REST",
  WATCH: "TRACKING",
  APPROACH: "APPROACH",
  DESCEND: "DESCEND",
  GRIP: "CLOSING",
  LIFT: "LIFTING",
  CARRY: "CARRYING",
  PLACE: "PLACING",
  RELEASE: "RELEASING",
  RETRACT: "CLEARING"
};

let state = STATE.REST;
let stateAt = 0;
let held = false;
let wantShut = false;
let lastTouch = performance.now();
let autoAt = 0;

function setState(s, now) { state = s; stateAt = now; }

function onPedestal(p) {
  return Math.hypot(p.x - HOME.x, p.z - HOME.z) < 0.27;
}

function clampBlock() {
  const r = Math.hypot(block.x, block.z);
  if (r > REACH_MAX) { block.x *= REACH_MAX / r; block.z *= REACH_MAX / r; }
  else if (r < REACH_MIN && r > 1e-4) { block.x *= REACH_MIN / r; block.z *= REACH_MIN / r; }
  block.y = clamp(block.y, HALF, LIFT_MAX);
}

/* ----------------------------------------------------------------- input */

const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const flat = new THREE.Plane();
const upright = new THREE.Plane();
const hit = new THREE.Vector3();
const grabOffset = new THREE.Vector3();

let mode = "none";     // none | slide | lift | orbit
let moved = 0;
let lastX = 0, lastY = 0;

function toNdc(e) {
  const r = figure.getBoundingClientRect();
  ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  ndc.y = 1 - ((e.clientY - r.top) / r.height) * 2;
  return ndc;
}

function bindInput() {
  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    figure.classList.add("is-driven");
    moved = 0;
    lastX = e.clientX;
    lastY = e.clientY;
    lastTouch = performance.now();
    held = false;
    wantShut = false;

    ray.setFromCamera(toNdc(e), camera);

    if (ray.intersectObject(handle, false).length) {
      mode = "lift";
      upright.setFromNormalAndCoplanarPoint(
        new THREE.Vector3(camera.position.x - block.x, 0, camera.position.z - block.z).normalize(),
        block
      );
      canvas.style.cursor = "grabbing";
      return;
    }

    if (ray.intersectObject(payload, false).length) {
      mode = "slide";
      flat.set(new THREE.Vector3(0, 1, 0), -block.y);
      if (ray.ray.intersectPlane(flat, hit)) grabOffset.copy(block).sub(hit);
      else grabOffset.set(0, 0, 0);
      canvas.style.cursor = "grabbing";
      return;
    }

    mode = "orbit";
  });

  canvas.addEventListener("pointermove", (e) => {
    moved += Math.abs(e.clientX - lastX) + Math.abs(e.clientY - lastY);
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;

    if (mode === "slide") {
      ray.setFromCamera(toNdc(e), camera);
      flat.set(new THREE.Vector3(0, 1, 0), -block.y);
      if (ray.ray.intersectPlane(flat, hit)) {
        block.x = hit.x + grabOffset.x;
        block.z = hit.z + grabOffset.z;
        clampBlock();
      }
      blockVel.set(0, 0, 0);
      lastTouch = performance.now();
    } else if (mode === "lift") {
      ray.setFromCamera(toNdc(e), camera);
      if (ray.ray.intersectPlane(upright, hit)) {
        block.y = clamp(hit.y, HALF, LIFT_MAX);
      }
      blockVel.set(0, 0, 0);
      lastTouch = performance.now();
    } else if (mode === "orbit") {
      orbit.tTheta -= dx * 0.006;
      orbit.tPhi = clamp(orbit.tPhi - dy * 0.005, 0.42, 1.4);
      lastTouch = performance.now();
    } else if (!coarse) {
      ray.setFromCamera(toNdc(e), camera);
      const over = ray.intersectObject(payload, false).length || ray.intersectObject(handle, false).length;
      canvas.style.cursor = over ? "grab" : "move";
    }
  });

  const release = (e) => {
    if (mode === "orbit" && moved < 9) {
      /* a tap on the floor throws the block there */
      ray.setFromCamera(toNdc(e), camera);
      flat.set(new THREE.Vector3(0, 1, 0), -HALF);
      if (ray.ray.intersectPlane(flat, hit)) {
        block.set(hit.x, HALF, hit.z);
        clampBlock();
      }
    }
    if (mode !== "none") {
      setState(STATE.WATCH, performance.now());
    }
    mode = "none";
    if (!coarse) canvas.style.cursor = "move";
    lastTouch = performance.now();
  };

  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
  canvas.style.cursor = coarse ? "" : "move";
}

/* ----------------------------------------------------------------- solve */

/* Two links and a claw held level. The wrist stops one claw length short so the
   finger pads, and not the wrist, arrive around the target. */
function solveTo(p) {
  const r = Math.hypot(p.x, p.z);
  const yaw = Math.atan2(-p.z, p.x);
  const dx = Math.max(r - CLAW_LEN, 0.1);
  const dy = p.y - SHOULDER_Y;

  let d = Math.hypot(dx, dy);
  d = clamp(d, Math.abs(L1 - L2) + 0.06, L1 + L2 - 0.02);

  const c2 = (d * d - L1 * L1 - L2 * L2) / (2 * L1 * L2);
  const a2 = -Math.acos(clamp(c2, -1, 1));
  const a1 = Math.atan2(dy, dx) - Math.atan2(L2 * Math.sin(a2), L1 + L2 * Math.cos(a2));
  return { yaw, a1, a2, a3: -(a1 + a2) };
}

function reached(tol) {
  return padWorld.distanceTo(goal) < tol;
}

/* -------------------------------------------------------------- sequence */

function sequence(now) {
  const t = now - stateAt;
  const settled = block.y <= HALF + 0.002 || onPedestal(block);

  switch (state) {
    case STATE.REST:
      goal.copy(REST);
      wantShut = false;
      if (!reduceMotion && now - lastTouch > 4200 && now > autoAt) {
        /* unattended: toss the block somewhere new and go fetch it */
        const a = Math.random() * Math.PI * 2;
        const r = 1.0 + Math.random() * 0.7;
        block.set(Math.cos(a) * r, HALF + 0.55, -Math.sin(a) * r);
        blockVel.set(0, 0, 0);
        autoAt = now + 9000;
        setState(STATE.WATCH, now);
      }
      break;

    case STATE.WATCH:
      goal.set(block.x, Math.min(block.y + HOVER + 0.1, LIFT_MAX + 0.35), block.z);
      wantShut = false;
      if (mode === "none" && settled && t > 450) setState(STATE.APPROACH, now);
      break;

    case STATE.APPROACH:
      goal.set(block.x, block.y + HOVER, block.z);
      wantShut = false;
      if (reached(0.06) || t > 3200) setState(STATE.DESCEND, now);
      break;

    case STATE.DESCEND:
      goal.copy(block);
      wantShut = false;
      if (reached(0.035) || t > 2200) setState(STATE.GRIP, now);
      break;

    case STATE.GRIP:
      goal.copy(block);
      wantShut = true;
      if (t > 420) { held = true; setState(STATE.LIFT, now); }
      break;

    case STATE.LIFT:
      goal.set(block.x, CARRY_Y, block.z);
      wantShut = true;
      if (reached(0.07) || t > 2200) setState(STATE.CARRY, now);
      break;

    case STATE.CARRY:
      goal.set(HOME.x, CARRY_Y, HOME.z);
      wantShut = true;
      if (reached(0.07) || t > 3600) setState(STATE.PLACE, now);
      break;

    case STATE.PLACE:
      goal.copy(HOME);
      wantShut = true;
      if (reached(0.03) || t > 2200) setState(STATE.RELEASE, now);
      break;

    case STATE.RELEASE:
      goal.copy(HOME);
      wantShut = false;
      if (t > 340) {
        held = false;
        block.copy(HOME);
        blockVel.set(0, 0, 0);
        setState(STATE.RETRACT, now);
      }
      break;

    case STATE.RETRACT:
      goal.set(HOME.x, CARRY_Y + 0.1, HOME.z);
      wantShut = false;
      if (reached(0.09) || t > 2000) setState(STATE.REST, now);
      break;
  }

  /* an operator grabbing the block always wins */
  if (mode === "slide" || mode === "lift") {
    held = false;
    if (state !== STATE.WATCH) setState(STATE.WATCH, now);
  }
}

/* ------------------------------------------------------------------ loop */

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

  padAnchor.getWorldPosition(padWorld);
  sequence(now);

  /* block: carried by the claw, dragged by the operator, or falling */
  if (held) {
    block.copy(padWorld);
  } else if (mode !== "slide" && mode !== "lift") {
    const restY = onPedestal(block) ? PED_TOP + HALF : HALF;
    if (block.y > restY + 0.001 || blockVel.y !== 0) {
      blockVel.y -= 7.5 * dt;
      block.y += blockVel.y * dt;
      if (block.y <= restY) { block.y = restY; blockVel.y = 0; }
    }
  }
  clampBlock();

  payload.position.copy(block);
  payload.rotation.y = damp(payload.rotation.y, Math.atan2(-block.z, block.x), 6, dt);

  const floorY = onPedestal(block) ? PED_TOP + 0.035 : 0.006;
  blockShadow.position.set(block.x, floorY, block.z);
  const drop = clamp(1 - (block.y - HALF) / 1.3, 0.18, 1);
  blockShadow.scale.setScalar(0.7 + (1 - drop) * 1.1);
  blockShadow.material.opacity = 0.7 * drop;

  const air = block.y > HALF + 0.05 && !held;
  handle.position.set(block.x, block.y + 0.28, block.z);
  handle.rotation.z += dt * 0.9;
  handle.material.opacity = damp(handle.material.opacity, mode === "orbit" ? 0.35 : 0.85, 6, dt);

  stem.material.opacity = damp(stem.material.opacity, air ? 0.75 : 0, 8, dt);
  const pts = stem.geometry.attributes.position;
  pts.setXYZ(0, block.x, floorY, block.z);
  pts.setXYZ(1, block.x, block.y - HALF, block.z);
  pts.needsUpdate = true;
  stem.geometry.computeBoundingSphere();
  stem.computeLineDistances();

  /* joints */
  const want = solveTo(goal);
  const k = 1 - Math.exp(-6.2 * dt);
  angles.yaw += wrap(want.yaw - angles.yaw) * k;
  angles.a1 = damp(angles.a1, want.a1, 6.2, dt);
  angles.a2 = damp(angles.a2, want.a2, 6.2, dt);
  angles.a3 = damp(angles.a3, want.a3, 6.2, dt);

  const gap = wantShut ? GAP_SHUT : GAP_OPEN;
  angles.gap = damp(angles.gap, gap, 12, dt);

  turret.rotation.y = angles.yaw;
  shoulder.rotation.z = angles.a1;
  elbow.rotation.z = angles.a2;
  wrist.rotation.z = angles.a3;
  fingerL.position.z = angles.gap / 2;
  fingerR.position.z = -angles.gap / 2;

  payloadGlow.material.opacity = damp(payloadGlow.material.opacity, held ? 0.6 : 0, 9, dt);
  pedestalRing.material.opacity = damp(pedestalRing.material.opacity, onPedestal(block) ? 0.22 : 0.6, 5, dt);

  orbit.theta = damp(orbit.theta, orbit.tTheta, 6, dt);
  orbit.phi = damp(orbit.phi, orbit.tPhi, 6, dt);
  placeCamera();

  readout();
  renderer.render(scene, camera);
}

function placeCamera() {
  const r = orbit.radius;
  camera.position.set(
    r * Math.sin(orbit.phi) * Math.cos(orbit.theta),
    r * Math.cos(orbit.phi),
    r * Math.sin(orbit.phi) * Math.sin(orbit.theta)
  );
  camera.lookAt(0, 0.82, 0);
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
  if (out.claw) out.claw.textContent = held ? "HOLDING" : wantShut ? "CLOSING" : "OPEN";
  if (out.mode) out.mode.textContent = mode === "orbit" ? "CAMERA" : state;
}

function deg(el, rad) {
  if (!el) return;
  const v = (rad * 180) / Math.PI;
  el.textContent = (v < 0 ? "-" : "+") + Math.abs(v).toFixed(1).padStart(5, "0");
}

/* ------------------------------------------------------------------ size */

/* Fit the cell to whatever shape the panel happens to be. */
function resize() {
  const w = figure.clientWidth;
  const h = figure.clientHeight;
  if (!w || !h) return;

  renderer.setSize(w, h, false);
  const a = w / h;
  camera.aspect = a;
  camera.fov = clamp(42 + (1.4 - a) * 9, 42, 52);

  const fovY = (camera.fov * Math.PI) / 180;
  const tanY = Math.tan(fovY / 2);
  const tanX = tanY * a;
  const need = Math.max(1.98 / tanX, 1.42 / tanY);
  orbit.radius = clamp(need * 1.04, 4.1, 8);

  camera.updateProjectionMatrix();
  placeCamera();
  renderer.render(scene, camera);
}

/* Declarations are all in place, so start the cell. */
try { boot(); } catch (err) { fail(err); }
