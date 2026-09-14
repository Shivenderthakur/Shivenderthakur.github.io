/* The workbench: the arm, the computer it is programmed from, and the block you
   move around. It builds into a scene the world module owns, and is driven by
   that module's clock rather than running a loop of its own.

   The arm is a parameter set, not a fixed model. Change the base height or any
   link length and the geometry, the inverse kinematics, the reach limits and the
   drawn working volume are all rebuilt from the same four numbers. One scene unit
   is 10 cm, the scale of a desktop arm like the ones in the work section. */

import * as THREE from "three";

export const AMBER = 0xf0a31e;

/* ------------------------------------------------------------ parameters */

export const LIMITS = {
  base: [0.45, 1.0],
  l1: [0.7, 1.35],
  l2: [0.6, 1.15],
  claw: [0.26, 0.44]
};
const dims = { base: 0.66, l1: 1.12, l2: 0.95, claw: 0.34 };

let SHOULDER_Y, L1, L2, CLAW_LEN, D_MAX, D_MIN, REACH_MAX;
const RP_MIN = 0.06;

const BLOCK = 0.24;
const HALF = BLOCK / 2;

const GAP_OPEN = 0.46;
const GAP_SHUT = BLOCK - 0.014;

const PED_TOP = 0.44;
const HOME = new THREE.Vector3();
const HOME_DIR = new THREE.Vector2(-0.89, 1.27).normalize();
const HOVER = 0.4;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const damp = (cur, to, k, dt) => cur + (to - cur) * (1 - Math.exp(-k * dt));

/* The reachable set of a claw held level. The wrist sits CLAW_LEN short of the
   target, and two links can only put it between D_MIN and D_MAX from the
   shoulder, so the claw sweeps a thick dome around the base, not a circle. */
function derive() {
  SHOULDER_Y = dims.base;
  L1 = dims.l1;
  L2 = dims.l2;
  CLAW_LEN = dims.claw;
  D_MAX = L1 + L2 - 0.02;
  D_MIN = Math.abs(L1 - L2) + 0.06;
  REACH_MAX = floorSpan(HALF).outer;

  /* the pedestal sits where the arm can always reach it at a comfortable stretch */
  const y = PED_TOP + HALF;
  const span = floorSpan(y);
  const r = clamp(1.55, span.inner + 0.3, span.outer - 0.22);
  HOME.set(HOME_DIR.x * r, y, HOME_DIR.y * r);
}

/* inner and outer radius the claw can touch at a given height */
function floorSpan(y) {
  const dy = y - SHOULDER_Y;
  const outer = Math.sqrt(Math.max(D_MAX * D_MAX - dy * dy, 0)) + CLAW_LEN;
  const inner = Math.max(RP_MIN, Math.sqrt(Math.max(D_MIN * D_MIN - dy * dy, 0))) + CLAW_LEN;
  return { inner, outer };
}

derive();

/* ----------------------------------------------------------------- state */

let scene, camera, reduceMotion, out, onStats;
let armRig, turret, shoulder, elbow, wrist, fingerL, fingerR, padAnchor, envelope;
let payload, payloadGlow, blockShadow, stem, handle, reachRing, pedestal, pedestalRing, volume;
let MAT;

export function createBench(opts) {
  scene = opts.scene;
  camera = opts.camera;
  reduceMotion = opts.reduceMotion;
  out = opts.readout || {};
  onStats = opts.onStats || (() => {});

  MAT = {
    /* powder-coated shell and anodised joints: matte, no clearcoat */
    shell: new THREE.MeshStandardMaterial({ color: 0x9ea39c, roughness: 0.9, metalness: 0, envMapIntensity: 0.6 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x2c3532, roughness: 0.88, metalness: 0.05 }),
    bolt: new THREE.MeshStandardMaterial({ color: 0x8e9892, roughness: 0.7, metalness: 0.3 }),
    pad: new THREE.MeshStandardMaterial({ color: 0x14201d, roughness: 0.95, metalness: 0 }),
    glow: new THREE.MeshBasicMaterial({ color: AMBER })
  };

  buildMarks();
  buildDesk();
  buildPedestal();
  buildPayload();
  buildArm();

  return { update, pointerDown, pointerMove, pointerUp, hoverAt, setDims, getDims, stats, LIMITS, block: () => block.clone(), group: null };
}

/* ------------------------------------------------------------ parameters */

function getDims() {
  return { ...dims };
}

function setDims(next) {
  let changed = false;
  for (const k of Object.keys(LIMITS)) {
    if (next[k] === undefined) continue;
    const v = clamp(+next[k], LIMITS[k][0], LIMITS[k][1]);
    if (v !== dims[k]) { dims[k] = v; changed = true; }
  }
  if (!changed) return stats();
  derive();
  buildArm();
  placePedestal();
  clampBlock();
  tunedAt = performance.now();
  return stats();
}

/* Floor area and swept volume, from the same profile the dome is drawn with.
   Volume is Pappus: the profile's area times the distance its centroid travels. */
function stats() {
  const prof = envelopeProfile();
  let twice = 0;
  for (let i = 0; i < prof.length; i++) {
    const a = prof[i], b = prof[(i + 1) % prof.length];
    twice += (a.x + b.x) * (a.x * b.y - b.x * a.y);
  }
  const vol = Math.abs((2 * Math.PI * twice) / 6);
  const span = floorSpan(HALF);
  const area = Math.PI * (span.outer ** 2 - span.inner ** 2);
  return {
    reachCm: span.outer * 10,
    heightCm: (SHOULDER_Y + D_MAX) * 10,
    areaCm2: area * 100,
    litres: vol,
    dims: getDims()
  };
}

/* ----------------------------------------------------------------- marks */

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

function buildMarks() {
  reachRing = new THREE.Mesh(
    new THREE.BufferGeometry(),
    new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false })
  );
  reachRing.rotation.x = -Math.PI / 2;
  reachRing.position.y = 0.006;
  scene.add(reachRing);

  const warm = new THREE.PointLight(AMBER, 4, 7, 2);
  warm.position.set(0.9, 1.2, 1.9);
  scene.add(warm);
}

/* ------------------------------------------------------------------ parts */

export function roundedBox(w, h, d, r) {
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

export function hub(r, w, body, ring) {
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

function disposeTree(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material && o.userData.ownMaterial) o.material.dispose();
  });
}

/* Everything that depends on the four numbers lives in one group, so a change
   throws the group away and builds it again. Joint angles survive the rebuild. */
function buildArm() {
  if (armRig) {
    scene.remove(armRig);
    disposeTree(armRig);
    volume.userData.shellMat.dispose();
    volume.userData.lineMat.dispose();
  }
  armRig = new THREE.Group();
  scene.add(armRig);
  const { shell, dark, bolt, pad, glow } = MAT;

  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.56, 0.11, 48), dark);
  plate.position.y = 0.055;
  plate.castShadow = plate.receiveShadow = true;
  armRig.add(plate);

  for (let i = 0; i < 6; i++) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.022, 6), bolt);
    b.position.set(Math.cos(i / 6 * Math.PI * 2) * 0.42, 0.115, Math.sin(i / 6 * Math.PI * 2) * 0.42);
    armRig.add(b);
  }

  turret = new THREE.Group();
  armRig.add(turret);

  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.11, 40), dark);
  collar.position.y = 0.16;
  collar.castShadow = true;
  turret.add(collar);

  const colH = SHOULDER_Y - 0.2;
  const column = new THREE.Mesh(roundedBox(0.34, colH, 0.42, 0.05), shell);
  column.position.y = 0.22 + colH / 2;
  column.castShadow = true;
  turret.add(column);

  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.022, 0.06), glow);
  stripe.position.set(0, SHOULDER_Y - 0.13, 0.21);
  turret.add(stripe);

  shoulder = new THREE.Group();
  shoulder.position.y = SHOULDER_Y;
  turret.add(shoulder);
  shoulder.add(hub(0.145, 0.27, dark, glow));

  const upper = new THREE.Mesh(roundedBox(L1, 0.2, 0.17, 0.045), shell);
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

  const fore = new THREE.Mesh(roundedBox(L2, 0.155, 0.135, 0.04), shell);
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

  /* the claw is drawn for 0.34 and stretched to whatever length is set */
  const claw = new THREE.Group();
  claw.scale.x = CLAW_LEN / 0.34;
  wrist.add(claw);

  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.4, 12), bolt);
  rail.rotation.x = Math.PI / 2;
  rail.position.x = 0.2;
  claw.add(rail);

  fingerL = buildFinger(shell, pad);
  fingerR = buildFinger(shell, pad);
  fingerR.scale.z = -1;
  claw.add(fingerL, fingerR);

  /* the outer edge of what the arm can touch, in its own plane */
  const arc = [];
  const a0 = Math.asin(clamp((HALF - SHOULDER_Y) / D_MAX, -1, 1));
  const a1 = Math.acos(clamp(RP_MIN / D_MAX, -1, 1));
  for (let i = 0; i <= 56; i++) {
    const a = a0 + ((a1 - a0) * i) / 56;
    arc.push(new THREE.Vector3(D_MAX * Math.cos(a) + CLAW_LEN, SHOULDER_Y + D_MAX * Math.sin(a), 0));
  }
  envelope = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(arc),
    new THREE.LineDashedMaterial({ color: AMBER, dashSize: 0.09, gapSize: 0.07, transparent: true, opacity: 0 })
  );
  envelope.userData.ownMaterial = true;
  envelope.computeLineDistances();
  turret.add(envelope);

  padAnchor = new THREE.Object3D();
  padAnchor.position.x = CLAW_LEN;
  wrist.add(padAnchor);

  buildVolume();

  const span = floorSpan(HALF);
  reachRing.geometry.dispose();
  reachRing.geometry = new THREE.RingGeometry(span.inner, span.outer, 128, 1);

  /* carry the pose across the rebuild */
  applyPose();
}

function buildFinger(shell, pad) {
  const g = new THREE.Group();

  const knuckle = new THREE.Mesh(roundedBox(0.1, 0.1, 0.075, 0.022), shell);
  knuckle.position.set(0.2, 0, 0);
  knuckle.castShadow = true;
  g.add(knuckle);

  const blade = new THREE.Mesh(roundedBox(0.23, 0.075, 0.055, 0.018), shell);
  blade.position.set(0.33, 0, 0);
  blade.castShadow = true;
  g.add(blade);

  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.062, 0.014), pad);
  grip.position.set(0.345, 0, -0.032);
  g.add(grip);

  return g;
}

/* ------------------------------------------------------- working volume */

/* The boundary of the reachable set in the arm's own (radius, height) plane:
   out along the long-reach arc, in along the vertical the claw cannot cross,
   back along the short-reach arc, and closed along the desk. */
function envelopeProfile() {
  const pts = [];
  const V = (r, y) => pts.push(new THREE.Vector2(r, y));
  const N = 40;

  const aLo = Math.asin(clamp((HALF - SHOULDER_Y) / D_MAX, -1, 1));
  const aHi = Math.acos(clamp(RP_MIN / D_MAX, -1, 1));
  for (let i = 0; i <= N; i++) {
    const a = aLo + ((aHi - aLo) * i) / N;
    V(CLAW_LEN + D_MAX * Math.cos(a), SHOULDER_Y + D_MAX * Math.sin(a));
  }

  if (D_MIN > RP_MIN) {
    const bHi = Math.acos(RP_MIN / D_MIN);
    const bLo = Math.max(Math.asin(clamp((HALF - SHOULDER_Y) / D_MIN, -1, 1)), -bHi);
    for (let i = 0; i <= N / 2; i++) {
      const b = bHi + ((bLo - bHi) * i) / (N / 2);
      V(CLAW_LEN + D_MIN * Math.cos(b), SHOULDER_Y + D_MIN * Math.sin(b));
    }
    if (bLo === -bHi) V(CLAW_LEN + RP_MIN, HALF);
  } else {
    V(CLAW_LEN + RP_MIN, HALF);
  }
  return pts;
}

function buildVolume() {
  volume = new THREE.Group();
  armRig.add(volume);

  const prof = envelopeProfile();
  const closed = prof.concat([prof[0].clone()]);

  const shellMat = new THREE.MeshBasicMaterial({
    color: 0xffc670, transparent: true, opacity: 0.015, side: THREE.DoubleSide, depthWrite: false
  });
  const dome = new THREE.Mesh(new THREE.LatheGeometry(closed, 96), shellMat);
  dome.userData.ownMaterial = true;
  dome.renderOrder = 2;
  volume.add(dome);

  /* meridians and parallels make the dome read as a volume, not a haze */
  const lineMat = new THREE.LineBasicMaterial({ color: AMBER, transparent: true, opacity: 0.22, depthWrite: false });
  const outer = prof.slice(0, 41);
  const merid = new THREE.BufferGeometry().setFromPoints(outer.map((p) => new THREE.Vector3(p.x, p.y, 0)));
  for (let i = 0; i < 16; i++) {
    const l = new THREE.Line(merid, lineMat);
    l.rotation.y = (i / 16) * Math.PI * 2;
    volume.add(l);
  }
  for (const t of [0, 0.35, 0.62, 0.84]) {
    const p = outer[Math.round(t * 40)];
    const ring = [];
    for (let i = 0; i <= 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      ring.push(new THREE.Vector3(Math.cos(a) * p.x, p.y, Math.sin(a) * p.x));
    }
    volume.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ring), lineMat));
  }
  volume.userData = { shellMat, lineMat, ownMaterial: false };
}

/* ------------------------------------------------------------- pedestal */

function buildPedestal() {
  pedestal = new THREE.Group();
  scene.add(pedestal);

  const col = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.25, PED_TOP, 32),
    new THREE.MeshStandardMaterial({ color: 0x354842, roughness: 0.85, metalness: 0.05 })
  );
  col.position.y = PED_TOP / 2;
  col.castShadow = col.receiveShadow = true;
  pedestal.add(col);

  const top = new THREE.Mesh(
    new THREE.CylinderGeometry(0.26, 0.26, 0.03, 32),
    new THREE.MeshStandardMaterial({ color: 0x9aa59f, roughness: 0.8, metalness: 0.05 })
  );
  top.position.y = PED_TOP + 0.015;
  top.castShadow = top.receiveShadow = true;
  pedestal.add(top);

  pedestalRing = new THREE.Mesh(
    new THREE.RingGeometry(0.2, 0.225, 40),
    new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
  );
  pedestalRing.rotation.x = -Math.PI / 2;
  pedestalRing.position.y = PED_TOP + 0.033;
  pedestal.add(pedestalRing);

  const base = new THREE.Mesh(
    new THREE.RingGeometry(0.31, 0.335, 44),
    new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0.3, side: THREE.DoubleSide })
  );
  base.rotation.x = -Math.PI / 2;
  base.position.y = 0.005;
  pedestal.add(base);

  placePedestal();
}

function placePedestal() {
  pedestal.position.set(HOME.x, 0, HOME.z);
}

function buildPayload() {
  payload = new THREE.Mesh(
    roundedBox(BLOCK, BLOCK, BLOCK, 0.028),
    new THREE.MeshStandardMaterial({ color: 0xc9cfc8, roughness: 0.8, metalness: 0 })
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

  /* grab this ring to push the block across the desk at its current height */
  handle = new THREE.Mesh(
    new THREE.TorusGeometry(0.115, 0.014, 10, 28),
    new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0.85 })
  );
  handle.rotation.x = -Math.PI / 2;
  scene.add(handle);
}

/* ------------------------------------------------------------------ bench */

/* The arm stands on a workbench beside the computer it is programmed from: a
   tower, a monitor running the same telemetry the readout shows, a keyboard,
   and the board the firmware is flashed to. Everything is matte. */

let screen = null;

function buildDesk() {
  const shell = new THREE.MeshStandardMaterial({ color: 0x1c2422, roughness: 0.82, metalness: 0.05 });

  buildTower(shell);
  buildMonitor(shell);
  buildKeyboard(shell);

  const mouse = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 14), shell);
  mouse.scale.set(0.3, 0.17, 0.46);
  mouse.position.set(-1.95, 0.085, 1.95);
  mouse.rotation.y = 0.44;
  mouse.castShadow = true;
  scene.add(mouse);

  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.42, 24),
    new THREE.MeshStandardMaterial({ color: 0x3a4a45, roughness: 0.9 }));
  mug.position.set(1.95, 0.21, -2.05);
  mug.castShadow = mug.receiveShadow = true;
  scene.add(mug);

  /* the board the arm's firmware is flashed from */
  const board = new THREE.Group();
  board.position.set(2.2, 0.02, 1.55);
  board.rotation.y = -0.5;
  scene.add(board);

  const pcb = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.03, 0.42),
    new THREE.MeshStandardMaterial({ color: 0x27564a, roughness: 0.8 }));
  pcb.castShadow = pcb.receiveShadow = true;
  board.add(pcb);

  const soc = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.2),
    new THREE.MeshStandardMaterial({ color: 0x27302d, roughness: 0.85 }));
  soc.position.set(-0.06, 0.04, 0);
  board.add(soc);

  const pins = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.05, 0.045),
    new THREE.MeshStandardMaterial({ color: 0xa89464, roughness: 0.6, metalness: 0.4 }));
  pins.position.set(0, 0.04, -0.17);
  board.add(pins);

  const led = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), new THREE.MeshBasicMaterial({ color: AMBER }));
  led.position.set(0.25, 0.035, 0.16);
  board.add(led);

  /* one cable from the arm's base back to the tower */
  const cableMat = new THREE.MeshStandardMaterial({ color: 0x16201d, roughness: 0.9 });
  const run = (pts) => {
    const c = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z))), 48, 0.028, 8, false), cableMat);
    c.castShadow = true;
    scene.add(c);
  };
  run([[0.2, 0.02, 0.5], [-0.6, 0.03, 0.95], [-1.9, 0.03, 0.55], [-3.0, 0.03, -0.1], [-3.75, 0.25, -0.35]]);
  run([[-3.75, 1.2, -0.95], [-3.55, 0.6, -1.3], [-3.4, 0.03, -1.55]]);
}

/* A mid-tower on the desk, side panel toward the room. */
function buildTower(shell) {
  const rig = new THREE.Group();
  rig.position.set(-4.55, 0, -0.4);
  rig.rotation.y = 0.12;
  scene.add(rig);

  const W = 1.7, H = 1.85, D = 0.82;   // length along x, height, width along z
  const body = new THREE.Mesh(roundedBox(W, H, D, 0.03), shell);
  body.position.y = H / 2 + 0.06;
  body.castShadow = body.receiveShadow = true;
  rig.add(body);

  for (const x of [-0.65, 0.65]) for (const z of [-0.3, 0.3]) {
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.06, 12), MAT.dark);
    foot.position.set(x, 0.03, z);
    rig.add(foot);
  }

  /* tinted side window with the board and cooler visible behind it */
  const inside = new THREE.Group();
  inside.position.set(0, body.position.y, D / 2 - 0.12);
  rig.add(inside);

  const mobo = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.35, 0.02),
    new THREE.MeshStandardMaterial({ color: 0x1f2b27, roughness: 0.85 }));
  mobo.position.set(-0.08, 0.1, -0.18);
  inside.add(mobo);

  const cooler = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.42, 0.26),
    new THREE.MeshStandardMaterial({ color: 0x5b6461, roughness: 0.75, metalness: 0.2 }));
  cooler.position.set(-0.05, 0.3, -0.04);
  inside.add(cooler);

  const gpu = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.12, 0.34),
    new THREE.MeshStandardMaterial({ color: 0x252c2a, roughness: 0.8 }));
  gpu.position.set(-0.05, -0.22, -0.02);
  inside.add(gpu);

  const fanMat = new THREE.MeshBasicMaterial({ color: 0x7ecfbf, transparent: true, opacity: 0.55 });
  const fans = [];
  for (const y of [0.42, -0.02]) {
    const fan = new THREE.Group();
    fan.position.set(0.72, y, -0.06);
    fan.rotation.y = Math.PI / 2;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.012, 6, 36), fanMat);
    fan.add(ring);
    const blades = new THREE.Group();
    for (let i = 0; i < 7; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.14, 0.01), MAT.dark);
      b.position.y = 0.075;
      const arm = new THREE.Group();
      arm.rotation.z = (i / 7) * Math.PI * 2;
      b.rotation.y = 0.5;
      arm.add(b);
      blades.add(arm);
    }
    fan.add(blades);
    inside.add(fan);
    fans.push(blades);
  }
  towerFans = fans;

  const glass = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.22, H - 0.3),
    new THREE.MeshStandardMaterial({ color: 0x0c1412, roughness: 0.35, metalness: 0, transparent: true, opacity: 0.45 }));
  glass.position.set(0, body.position.y + 0.02, D / 2 + 0.004);
  rig.add(glass);

  /* front panel: power button and a status LED on the +x face */
  const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 20), MAT.dark);
  btn.rotation.z = Math.PI / 2;
  btn.position.set(W / 2 + 0.01, H - 0.12, 0);
  rig.add(btn);
  const ledT = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.012, 0.12), MAT.glow);
  ledT.position.set(W / 2 + 0.012, H - 0.22, 0);
  rig.add(ledT);
  for (let i = 0; i < 9; i++) {
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.02, 0.5), MAT.dark);
    slot.position.set(W / 2 + 0.008, 0.35 + i * 0.1, 0);
    rig.add(slot);
  }
}

let towerFans = [];

function buildMonitor(shell) {
  const rig = new THREE.Group();
  rig.position.set(-3.3, 0, -1.75);
  rig.rotation.y = 0.46;
  scene.add(rig);

  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.56, 0.06, 32), shell);
  foot.position.y = 0.03;
  foot.castShadow = foot.receiveShadow = true;
  rig.add(foot);

  const neck = new THREE.Mesh(roundedBox(0.16, 1.05, 0.18, 0.03), shell);
  neck.position.y = 0.58;
  neck.castShadow = true;
  rig.add(neck);

  const head = new THREE.Group();
  head.position.y = 1.85;
  head.rotation.x = -0.05;
  rig.add(head);

  const bezel = new THREE.Mesh(roundedBox(3.05, 1.8, 0.09, 0.03), shell);
  bezel.castShadow = true;
  head.add(bezel);

  screen = makeScreen();
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(2.88, 1.64),
    new THREE.MeshBasicMaterial({ map: screen.texture, toneMapped: false })
  );
  glass.position.z = 0.048;
  head.add(glass);

  const spill = new THREE.PointLight(0x8fd6c4, 3.2, 4.5, 2);
  spill.position.set(0, 0.1, 0.6);
  head.add(spill);
}

function buildKeyboard(shell) {
  const rig = new THREE.Group();
  rig.position.set(-2.95, 0, 0.95);
  rig.rotation.y = 0.46;
  scene.add(rig);

  const slab = new THREE.Mesh(roundedBox(2.3, 0.08, 0.82, 0.02), shell);
  slab.position.y = 0.04;
  slab.castShadow = slab.receiveShadow = true;
  rig.add(slab);

  const cols = 16;
  const rows = 5;
  const keys = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.108, 0.03, 0.108),
    new THREE.MeshStandardMaterial({ color: 0x39443f, roughness: 0.9 }),
    cols * rows
  );
  const m = new THREE.Matrix4();
  let i = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      m.makeTranslation(-1.02 + c * 0.136, 0.095, -0.28 + r * 0.135);
      keys.setMatrixAt(i++, m);
    }
  }
  keys.instanceMatrix.needsUpdate = true;
  keys.castShadow = true;
  rig.add(keys);
}

/* The monitor is a live terminal, redrawn a few times a second. */
function makeScreen() {
  const c = document.createElement("canvas");
  c.width = 768;
  c.height = 438;
  const ctx = c.getContext("2d");
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  let at = 0;

  function draw(now, info) {
    if (now - at < 140) return;
    at = now;

    ctx.fillStyle = "#0b1412";
    ctx.fillRect(0, 0, 768, 438);

    ctx.globalAlpha = 0.05;
    ctx.fillStyle = "#9fd8c6";
    for (let y = 0; y < 438; y += 3) ctx.fillRect(0, y, 768, 1);
    ctx.globalAlpha = 1;

    /* the distribution's arch, drawn rather than imported */
    ctx.strokeStyle = "rgba(126, 206, 236, 0.55)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(660, 60);
    ctx.lineTo(714, 150);
    ctx.lineTo(660, 128);
    ctx.lineTo(606, 150);
    ctx.closePath();
    ctx.stroke();

    ctx.font = "21px 'IBM Plex Mono', ui-monospace, monospace";
    ctx.textBaseline = "top";

    const rows = [
      ["prompt", "[shivender@archbox ~]$ ", "./armctl --live"],
      ["dim", "  links   ", info.links],
      ["dim", "  reach   ", info.reach],
      ["dim", "  volume  ", info.volume],
      ["gap", "", ""],
      ["val", "  J1 ", info.j1 + "    J2 " + info.j2],
      ["val", "  J3 ", info.j3 + "    J4 " + info.j4],
      ["gap", "", ""],
      ["dim", "  target  ", info.target],
      ["dim", "  claw    ", info.claw],
      ["dim", "  state   ", info.state]
    ];

    let y = 42;
    for (const [kind, head, tail] of rows) {
      if (kind === "gap") { y += 14; continue; }
      let x = 40;
      if (head) {
        ctx.fillStyle = kind === "prompt" ? "#7eceec" : kind === "val" ? "#8ea69b" : "#6f867c";
        ctx.fillText(head, x, y);
        x += ctx.measureText(head).width;
      }
      ctx.fillStyle = kind === "dim" ? "#c3d2c9" : kind === "val" ? "#f0a31e" : "#d7e2da";
      ctx.fillText(tail, x, y);
      y += 30;
    }

    if (Math.floor(now / 520) % 2 === 0) {
      ctx.fillStyle = "#f0a31e";
      ctx.fillRect(40, y + 8, 13, 22);
    }

    texture.needsUpdate = true;
  }

  return { texture, draw };
}

/* ----------------------------------------------------------------- state */

const block = new THREE.Vector3(1.62, HALF, -0.35);
const angles = { yaw: 0, a1: 0.5, a2: -1.2, a3: 0.7, gap: GAP_OPEN };

const goal = new THREE.Vector3(0.72, 1.58, -0.3);
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
let atLimit = false;
let wantShut = false;
let lastTouch = performance.now();
let autoAt = 0;
let tunedAt = -1e9;

function setState(s, now) { state = s; stateAt = now; }

function onPedestal(p) {
  return Math.hypot(p.x - HOME.x, p.z - HOME.z) < 0.27;
}

/* rest and carry heights scale with the arm, so a short arm is not asked to
   hold a pose only a long one can reach */
const restPoint = (v) => v.set(0.45 * REACH_MAX, SHOULDER_Y + 0.55 * D_MAX, -0.2 * REACH_MAX);
const carryY = () => Math.min(HOME.y + 0.6, SHOULDER_Y + 0.45 * D_MAX);

/* Push a point back onto the arm's real working envelope, wherever it is, in
   the air as much as on the desk. Goals get the same treatment as the block, or
   the arm chases a target it can never touch. */
function clampToEnvelope(v) {
  let y = Math.max(v.y, HALF);
  const r = Math.hypot(v.x, v.z);
  const ux = r < 1e-4 ? 1 : v.x / r;
  const uz = r < 1e-4 ? 0 : v.z / r;

  let rp = Math.max(r - CLAW_LEN, RP_MIN);
  let dy = y - SHOULDER_Y;
  const d = Math.hypot(rp, dy) || 1e-4;

  const k = d > D_MAX ? D_MAX / d : d < D_MIN ? D_MIN / d : 1;
  if (k !== 1) { rp *= k; dy *= k; }
  y = SHOULDER_Y + dy;

  if (y < HALF) {
    /* slide along the envelope rather than sinking through the desk */
    y = HALF;
    const span = floorSpan(y);
    rp = clamp(rp, span.inner - CLAW_LEN, span.outer - CLAW_LEN);
  }

  v.y = y;
  const o = Math.max(rp, RP_MIN) + CLAW_LEN;
  v.x = ux * o;
  v.z = uz * o;
  return k !== 1;
}

function clampBlock() {
  atLimit = clampToEnvelope(block);
}

function applyPose() {
  if (!turret) return;
  turret.rotation.y = angles.yaw;
  shoulder.rotation.z = angles.a1;
  elbow.rotation.z = angles.a2;
  wrist.rotation.z = angles.a3;
  fingerL.position.z = angles.gap / 2;
  fingerR.position.z = -angles.gap / 2;
}

/* ----------------------------------------------------------------- input */

/* The world forwards pointer events here in normalised device coordinates.
   Grab the block itself and it moves in the plane facing you, so it goes up,
   down and sideways into open air; orbit the view and that plane turns with
   you, which is how it reaches any point in the dome. Grab the ring above it
   to push it across the desk at the height it already has. */

const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const dragPlane = new THREE.Plane();
const hit = new THREE.Vector3();
const grabOffset = new THREE.Vector3();
const camDir = new THREE.Vector3();

let mode = "none";     // none | free | depth
let moved = 0;

function pointerDown(x, y) {
  moved = 0;
  lastTouch = performance.now();

  ndc.set(x, y);
  ray.setFromCamera(ndc, camera);

  const onRing = handle.visible && ray.intersectObject(handle, false).length;
  const onBlock = ray.intersectObject(payload, false).length;
  if (!onRing && !onBlock) { mode = "none"; return "none"; }

  held = false;
  wantShut = false;
  if (onRing && !onBlock) {
    mode = "depth";
    dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), block);
  } else {
    mode = "free";
    camera.getWorldDirection(camDir);
    dragPlane.setFromNormalAndCoplanarPoint(camDir.negate(), block);
  }
  if (ray.ray.intersectPlane(dragPlane, hit)) grabOffset.copy(block).sub(hit);
  else grabOffset.set(0, 0, 0);
  return mode;
}

function pointerMove(x, y, travel) {
  moved += travel;
  if (mode === "none") return false;

  ndc.set(x, y);
  ray.setFromCamera(ndc, camera);
  if (ray.ray.intersectPlane(dragPlane, hit)) {
    block.copy(hit).add(grabOffset);
    clampBlock();
  }
  lastTouch = performance.now();
  return true;
}

function pointerUp(x, y) {
  if (mode === "depth" && moved < 9) {
    /* tapping the ring lifts or lowers: on a touch screen that is quicker than a drag */
    block.y = block.y > HALF + 0.2 ? HALF : SHOULDER_Y + 0.5 * D_MAX;
    clampBlock();
  }
  if (mode === "none" && moved < 9) {
    /* a tap on the desk sends the block there */
    ndc.set(x, y);
    ray.setFromCamera(ndc, camera);
    dragPlane.set(new THREE.Vector3(0, 1, 0), -HALF);
    if (ray.ray.intersectPlane(dragPlane, hit) && hit.distanceTo(new THREE.Vector3(0, HALF, 0)) < REACH_MAX + 1.5) {
      block.set(hit.x, HALF, hit.z);
      clampBlock();
    } else {
      mode = "none";
      return;
    }
  }
  setState(STATE.WATCH, performance.now());
  mode = "none";
  lastTouch = performance.now();
}

function hoverAt(x, y) {
  ndc.set(x, y);
  ray.setFromCamera(ndc, camera);
  return ray.intersectObject(payload, false).length > 0 || ray.intersectObject(handle, false).length > 0;
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
  d = clamp(d, D_MIN, D_MAX);

  const c2 = (d * d - L1 * L1 - L2 * L2) / (2 * L1 * L2);
  const a2 = -Math.acos(clamp(c2, -1, 1));
  const a1 = Math.atan2(dy, dx) - Math.atan2(L2 * Math.sin(a2), L1 + L2 * Math.cos(a2));
  return { yaw, a1, a2, a3: -(a1 + a2) };
}

function reached(tol) {
  clampToEnvelope(goal);
  return padWorld.distanceTo(goal) < tol;
}

/* -------------------------------------------------------------- sequence */

function sequence(now) {
  const t = now - stateAt;

  switch (state) {
    case STATE.REST:
      restPoint(goal);
      wantShut = false;
      if (!reduceMotion && now - lastTouch > 4200 && now > autoAt) {
        /* unattended: put the block somewhere new, sometimes in mid-air, and fetch it */
        const a = Math.random() * Math.PI * 2;
        const span = floorSpan(HALF);
        const r = span.inner + 0.15 + Math.random() * (span.outer - span.inner - 0.4);
        const high = Math.random() < 0.45;
        block.set(Math.cos(a) * r, high ? HALF + 0.4 + Math.random() * 0.8 : HALF, -Math.sin(a) * r);
        clampBlock();
        autoAt = now + 9000;
        setState(STATE.WATCH, now);
      }
      break;

    case STATE.WATCH:
      goal.set(block.x, block.y + HOVER + 0.1, block.z);
      wantShut = false;
      if (mode === "none" && t > 450) setState(STATE.APPROACH, now);
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
      goal.set(block.x, Math.max(block.y, carryY()), block.z);
      wantShut = true;
      if (reached(0.07) || t > 2200) setState(STATE.CARRY, now);
      break;

    case STATE.CARRY:
      goal.set(HOME.x, carryY(), HOME.z);
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
        setState(STATE.RETRACT, now);
      }
      break;

    case STATE.RETRACT:
      goal.set(HOME.x, carryY() + 0.1, HOME.z);
      wantShut = false;
      if (reached(0.09) || t > 2000) setState(STATE.REST, now);
      break;
  }

  /* an operator grabbing the block always wins */
  if (mode !== "none") {
    held = false;
    if (state !== STATE.WATCH) setState(STATE.WATCH, now);
  }
}

/* ---------------------------------------------------------------- update */

let cached = null;

function update(now, dt) {
  padAnchor.getWorldPosition(padWorld);
  sequence(now);

  /* the block is either in the claw or exactly where it was last put: no gravity */
  if (held) block.copy(padWorld);
  clampBlock();

  payload.position.copy(block);
  payload.rotation.y = damp(payload.rotation.y, Math.atan2(-block.z, block.x), 6, dt);

  const floorY = onPedestal(block) ? PED_TOP + 0.035 : 0.006;
  blockShadow.position.set(block.x, floorY, block.z);
  const drop = clamp(1 - (block.y - HALF) / 1.3, 0.18, 1);
  blockShadow.scale.setScalar(0.7 + (1 - drop) * 1.1);
  blockShadow.material.opacity = 0.7 * drop;

  const air = block.y > HALF + 0.05 && !held;
  handle.visible = !held;
  handle.position.set(block.x, block.y + 0.28, block.z);
  handle.rotation.z += dt * 0.9;

  stem.material.opacity = damp(stem.material.opacity, air ? 0.75 : 0, 8, dt);
  const pts = stem.geometry.attributes.position;
  pts.setXYZ(0, block.x, floorY, block.z);
  pts.setXYZ(1, block.x, block.y - HALF, block.z);
  pts.needsUpdate = true;
  stem.geometry.computeBoundingSphere();
  stem.computeLineDistances();

  /* joints */
  clampToEnvelope(goal);
  const want = solveTo(goal);
  const k = 1 - Math.exp(-8.5 * dt);
  angles.yaw += wrap(want.yaw - angles.yaw) * k;
  angles.a1 = damp(angles.a1, want.a1, 8.5, dt);
  angles.a2 = damp(angles.a2, want.a2, 8.5, dt);
  angles.a3 = damp(angles.a3, want.a3, 8.5, dt);
  angles.gap = damp(angles.gap, wantShut ? GAP_SHUT : GAP_OPEN, 12, dt);
  applyPose();

  if (!reduceMotion) towerFans.forEach((f, i) => { f.rotation.z += dt * (9 + i * 2); });

  /* the working volume brightens while you drag or retune the arm */
  const dragging = mode !== "none";
  const tuning = now - tunedAt < 2600;
  const loud = dragging || tuning || atLimit;
  showingLimit = dragging;
  const vu = volume.userData;
  vu.shellMat.opacity = damp(vu.shellMat.opacity, loud ? 0.028 : 0.012, 6, dt);
  vu.lineMat.opacity = damp(vu.lineMat.opacity, loud ? 0.42 : 0.14, 6, dt);
  payloadGlow.material.opacity = damp(payloadGlow.material.opacity, held ? 0.6 : 0, 9, dt);
  pedestalRing.material.opacity = damp(pedestalRing.material.opacity, onPedestal(block) ? 0.22 : 0.6, 5, dt);
  reachRing.material.opacity = damp(reachRing.material.opacity, loud ? 0.12 : 0.04, 6, dt);
  envelope.material.opacity = damp(envelope.material.opacity, loud ? 0.5 : 0, 7, dt);

  readout();
  if (screen) {
    if (!cached || tuning) cached = stats();
    screen.draw(now, {
      links: `${(L1 * 10).toFixed(1)} + ${(L2 * 10).toFixed(1)} + ${(CLAW_LEN * 10).toFixed(1)} cm`,
      reach: `${cached.reachCm.toFixed(1)} cm   floor ${Math.round(cached.areaCm2)} cm2`,
      volume: `${cached.litres.toFixed(1)} L swept`,
      j1: degText(wrap(angles.yaw)), j2: degText(angles.a1),
      j3: degText(angles.a2), j4: degText(angles.a3),
      target: `x ${(block.x * 10).toFixed(1)}  y ${(block.y * 10).toFixed(1)}  z ${(block.z * 10).toFixed(1)}`,
      claw: held ? "HOLDING" : wantShut ? "CLOSING" : "OPEN",
      state: atLimit && dragging ? "AT REACH LIMIT" : state
    });
  }
}

let showingLimit = false;
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
  if (out.mode) out.mode.textContent = atLimit && showingLimit ? "AT REACH LIMIT" : state;
  if (out.height) out.height.textContent = (block.y * 10).toFixed(1).padStart(5, "0") + " cm";
}

function degText(rad) {
  const v = (rad * 180) / Math.PI;
  return (v < 0 ? "-" : "+") + Math.abs(v).toFixed(1).padStart(5, "0");
}

function deg(el, rad) {
  if (!el) return;
  el.textContent = degText(rad);
}
