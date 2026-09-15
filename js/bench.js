/* The workbench: a desk with the arm on it, the computer it is programmed from,
   the chair the operator sits in and the block the arm moves around. It builds
   into a scene the world module owns, and is driven by that module's clock
   rather than running a loop of its own.

   The world is in metres. Everything here hangs from one group, `root`, placed
   at the desk top and scaled by 0.1, so inside it one unit is 10 cm: the scale
   of a desktop arm like the ones in the work section. All the arm maths, the
   block, the pedestal and the readouts work in those local units. Anything that
   crosses to or from the world (pointer rays, the pad's world position, the
   block's position handed out, targets handed in) is converted at that border,
   and nowhere else.

   The arm is a parameter set, not a fixed model. Change the base height or any
   link length and the geometry, the inverse kinematics, the reach limits and the
   drawn working volume are all rebuilt from the same four numbers. */

import * as THREE from "three";
import { pbr } from "./realism.js";

export const AMBER = 0xf0a31e;

/* ---------------------------------------------------------------- layout */

/* The floor height. island.js exports the same GROUND, but island.js imports
   this module for roundedBox, so importing it back would be circular. */
const GROUND = -1.4;
const ROOT_SCALE = 0.1;

/* Bench-local units from here on: x to the operator's right, z toward the
   operator, y up, desk top at 0, arm base at the origin. */
const FLOOR = -7.5;                                  // the desk top is 75 cm up
const DESK = { x: -2.5, z: 0, w: 14, d: 7, t: 0.3 };  // 1.40 x 0.70 m
const SEAT = { x: -4.5, z: 6.5, top: -2.9 };          // seat top 46 cm above the floor
const APPROACH_Z = 13.5;                              // where the walker stands before sitting
const KEYBOARD = { x: -4.5, y: 0, z: 1.9 };
const MONITORS = [
  { x: -7.1, z: -2.6 },                               // left: project photos
  { x: -3.0, z: -2.6 }                                // right: the armctl terminal
];
const EYE = { x: SEAT.x, z: SEAT.z };                 // monitors turn in toward the seated head
const TOWER = { x: -11, z: -1, scale: 2.5 };          // a mid-tower on the floor beside the desk

/* ------------------------------------------------------------ parameters */

export const LIMITS = {
  base: [0.45, 1.0],
  l1: [0.7, 1.35],
  l2: [0.6, 1.15],
  claw: [0.26, 0.44]
};
const dims = { base: 0.66, l1: 1.12, l2: 0.95, claw: 0.34 };
const DEFAULTS = { ...dims };
const NAMES = { base: "base height", l1: "upper arm", l2: "forearm", claw: "claw" };

let SHOULDER_Y, L1, L2, CLAW_LEN, D_MAX, D_MIN, REACH_MAX;
const RP_MIN = 0.06;

const BLOCK = 0.24;
const HALF = BLOCK / 2;
/* unscaled sizes of the invisible pick stand-ins, in bench-local units: the
   block's box edge, and the diameter of the disc that covers the ring */
const PICK_BLOCK = 0.34;
const PICK_RING = 2 * (0.115 + 0.032);

const GAP_OPEN = 0.46;
const GAP_SHUT = BLOCK - 0.014;

const PED_TOP = 0.44;
const PED_R = 0.26;
const HOME = new THREE.Vector3();
const HOME_DIR = new THREE.Vector2(-0.89, 1.27).normalize();
const HOVER = 0.4;

/* the base plate is 0.56 across and 0.11 high, the column about 0.27 from the
   axis: a block set down closer than this would sit inside the arm */
const PLATE_TOP = 0.11;
const BASE_CLEAR = 0.74;
const COLUMN_CLEAR = 0.46;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const damp = (cur, to, k, dt) => cur + (to - cur) * (1 - Math.exp(-k * dt));
const cm = (u) => (u * 10).toFixed(1);
const tidy = (v) => Math.round(v * 1e4) / 1e4;

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

let scene, camera, reduceMotion, out, onStats, onLine;
let root;
let armRig, turret, shoulder, elbow, wrist, fingerL, fingerR, padAnchor, envelope;
let payload, payloadGlow, blockShadow, stem, handle, reachRing, pedestal, pedestalRing, volume;
let blockPick, handlePick;
let MAT;
let slideshow = null, terminal = null;
const blockers = [];      // tall things a tap on the desk should not fall through
let towerFans = [];

export function createBench(opts) {
  scene = opts.scene;
  camera = opts.camera;
  reduceMotion = opts.reduceMotion;
  out = opts.readout || {};
  onStats = opts.onStats || (() => {});
  onLine = opts.onLine || (() => {});

  root = new THREE.Group();
  root.name = "workbench";
  root.position.set(0, GROUND + 0.75, 0);
  root.scale.setScalar(ROOT_SCALE);
  scene.add(root);
  root.updateMatrixWorld(true);

  MAT = {
    /* powder-coated shell and anodised joints: matte, no clearcoat */
    shell: new THREE.MeshStandardMaterial({ color: 0x9ea39c, roughness: 0.9, metalness: 0, envMapIntensity: 0.6 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x2c3532, roughness: 0.88, metalness: 0.05 }),
    bolt: new THREE.MeshStandardMaterial({ color: 0x8e9892, roughness: 0.7, metalness: 0.3 }),
    pad: new THREE.MeshStandardMaterial({ color: 0x14201d, roughness: 0.95, metalness: 0 }),
    glow: new THREE.MeshBasicMaterial({ color: AMBER })
  };

  buildMarks();
  buildDesk(Array.isArray(opts.slides) ? opts.slides : []);
  buildPedestal();
  buildPayload();
  buildArm();

  return {
    root,
    group: root,
    update, pointerDown, pointerMove, pointerUp, hoverAt, setDims, getDims, stats, LIMITS,
    block: blockWorld,
    colliders: makeColliders(),
    seat: { x: tidy(SEAT.x * ROOT_SCALE), z: tidy(SEAT.z * ROOT_SCALE), heading: Math.PI, height: tidy((SEAT.top - FLOOR) * ROOT_SCALE) },
    approach: { x: tidy(SEAT.x * ROOT_SCALE), z: tidy(APPROACH_Z * ROOT_SCALE), heading: Math.PI },
    keyboard: toWorld(new THREE.Vector3(KEYBOARD.x, KEYBOARD.y, KEYBOARD.z)),
    aimFromNdc, placeAt, command, busy,
    log: () => termLog.map((l) => l.text)
  };
}

/* --------------------------------------------------- world <-> bench-local */

/* The only places the scale crosses. root never moves after it is built, but
   its matrix is refreshed first anyway so a caller running before the first
   render still gets the right answer. */
const rootInv = new THREE.Matrix4();

function toWorld(v) {
  root.updateWorldMatrix(true, false);
  return v.applyMatrix4(root.matrixWorld);
}

function toLocal(v) {
  root.updateWorldMatrix(true, false);
  rootInv.copy(root.matrixWorld).invert();
  return v.applyMatrix4(rootInv);
}

function blockWorld() {
  return toWorld(block.clone());
}

/* ground footprints for the walker, in metres: the desk and the tower. The
   chair is left out so the operator can reach it. */
function makeColliders() {
  const deskC = toWorld(new THREE.Vector3(DESK.x, 0, DESK.z));
  const towerC = toWorld(new THREE.Vector3(TOWER.x, FLOOR, TOWER.z));
  /* the tower is built 1.7 long and 0.82 wide, then scaled and turned front to +z */
  const tLen = 1.7 * TOWER.scale * ROOT_SCALE;
  const tWide = 0.82 * TOWER.scale * ROOT_SCALE;
  return [
    { x: tidy(deskC.x), z: tidy(deskC.z), hw: tidy(DESK.w / 2 * ROOT_SCALE), hd: tidy(DESK.d / 2 * ROOT_SCALE), c: 1, s: 0 },
    { x: tidy(towerC.x), z: tidy(towerC.z), hw: tidy(tWide / 2), hd: tidy(tLen / 2), c: 1, s: 0 }
  ];
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
    if (!Number.isFinite(v)) continue;
    if (v !== dims[k]) { dims[k] = v; changed = true; }
  }
  if (!changed) return stats();

  const wasHome = !held && onPedestal(block);
  derive();
  buildArm();
  placePedestal();
  /* a block resting on the pedestal moves with it */
  if (wasHome) block.copy(HOME);
  clampBlock();
  /* a job under way keeps a destination the new arm can still reach */
  if (job) {
    if (destHome) dest.copy(HOME);
    else planTarget(dest);
  }
  tunedAt = performance.now();
  cached = null;
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
  root.add(reachRing);

  /* A light's distance and falloff are in world metres whatever its parent's
     scale, so these are set for a real desk: a warm lamp about half a metre
     above the arm that dies out before the next building. */
  const warm = new THREE.PointLight(AMBER, 0.35, 1.6, 2);
  warm.position.set(1.2, 5.5, 3.5);
  root.add(warm);
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

function disposeTree(tree) {
  tree.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material && o.userData.ownMaterial) o.material.dispose();
  });
}

/* Everything that depends on the four numbers lives in one group, so a change
   throws the group away and builds it again. Joint angles survive the rebuild. */
function buildArm() {
  if (armRig) {
    root.remove(armRig);
    disposeTree(armRig);
    volume.userData.shellMat.dispose();
    volume.userData.lineMat.dispose();
  }
  armRig = new THREE.Group();
  root.add(armRig);
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
  root.add(pedestal);

  const col = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.25, PED_TOP, 32),
    new THREE.MeshStandardMaterial({ color: 0x354842, roughness: 0.85, metalness: 0.05 })
  );
  col.position.y = PED_TOP / 2;
  col.castShadow = col.receiveShadow = true;
  pedestal.add(col);

  const top = new THREE.Mesh(
    new THREE.CylinderGeometry(PED_R, PED_R, 0.03, 32),
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
  root.add(payload);

  payloadGlow = new THREE.Mesh(
    new THREE.BoxGeometry(BLOCK * 1.006, 0.022, BLOCK * 1.006),
    new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0 })
  );
  payload.add(payloadGlow);

  /* At real size the block is 2.4 cm and the ring's tube under 3 mm, too small
     to hit with a finger from a chair. Invisible stand-ins take the rays
     instead (a raycast does not care whether a mesh is drawn), and sizePicks()
     grows them before every cast so they never cover less than a fingertip on
     screen, however far the camera sits. The visible block and ring keep their
     true size. */
  const unseen = new THREE.MeshBasicMaterial({ visible: false });
  blockPick = new THREE.Mesh(new THREE.BoxGeometry(PICK_BLOCK, PICK_BLOCK, PICK_BLOCK), unseen);
  payload.add(blockPick);

  blockShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.66, 0.66),
    new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, opacity: 0.7 })
  );
  blockShadow.rotation.x = -Math.PI / 2;
  root.add(blockShadow);

  /* the drop line makes the block's height above the desk readable */
  stem = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
    new THREE.LineDashedMaterial({ color: AMBER, dashSize: 0.06, gapSize: 0.05, transparent: true, opacity: 0 })
  );
  root.add(stem);

  /* grab this ring to push the block across the desk at its current height */
  handle = new THREE.Mesh(
    new THREE.TorusGeometry(0.115, 0.014, 10, 28),
    new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0.85 })
  );
  handle.rotation.x = -Math.PI / 2;
  root.add(handle);

  /* a solid disc rather than a torus, so a grown stand-in covers the ring's
     hole as well and still sits over the ring the reader can see. The ring is
     turned flat by its own rotation; the disc undoes that turn so its axis
     points up. */
  handlePick = new THREE.Mesh(new THREE.CylinderGeometry(PICK_RING / 2, PICK_RING / 2, 0.064, 20), unseen);
  handlePick.rotation.x = Math.PI / 2;
  handle.add(handlePick);
}

/* ------------------------------------------------------------------ bench */

/* The arm stands on an ordinary office desk: a steel frame and a wooden top,
   two monitors on stands along the back edge, a keyboard and mouse in front of
   the chair, a mug, the board the firmware is flashed from, and a tower on the
   floor. The left monitor cycles through the project photos from the page, the
   right one is the armctl terminal. Everything is matte. */

function buildDesk(slides) {
  const shell = new THREE.MeshStandardMaterial({ color: 0x1c2422, roughness: 0.82, metalness: 0.05 });
  const frame = new THREE.MeshStandardMaterial({ color: 0x2a302e, roughness: 0.78, metalness: 0.15 });

  buildDeskFrame(frame);
  buildChair(frame);
  buildTower(shell);
  buildMonitors(shell, slides);
  buildKeyboard(shell);

  /* mouse on a cloth pad, to the right of the keyboard and just outside the
     arm's reach */
  const mat = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.03, 1.7), MAT.pad);
  mat.position.set(-1.35, 0.015, 2.65);
  mat.receiveShadow = true;
  root.add(mat);

  const mouse = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 14), shell);
  mouse.scale.set(0.62, 0.34, 1.1);
  mouse.position.set(-1.5, 0.03 + 0.17, 2.7);
  mouse.rotation.y = 0.12;
  mouse.castShadow = true;
  root.add(mouse);

  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.38, 0.95, 24),
    new THREE.MeshStandardMaterial({ color: 0x3a4a45, roughness: 0.9 }));
  mug.position.set(3.3, 0.475, -2.3);
  mug.castShadow = mug.receiveShadow = true;
  root.add(mug);
  const lug = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.06, 8, 18, Math.PI),
    new THREE.MeshStandardMaterial({ color: 0x3a4a45, roughness: 0.9 }));
  lug.position.set(3.72, 0.5, -2.3);
  lug.rotation.z = -Math.PI / 2;
  root.add(lug);

  /* the board the arm's firmware is flashed from, about 6 by 4 cm */
  const board = new THREE.Group();
  board.position.set(3.0, 0.02, 1.8);
  board.rotation.y = -0.5;
  root.add(board);

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

  /* cables: the arm's lead runs back off the desk and along the floor to the
     tower, and each monitor has one down the back */
  const cableMat = new THREE.MeshStandardMaterial({ color: 0x16201d, roughness: 0.9 });
  const run = (pts, r = 0.028) => {
    const curve = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
    const c = new THREE.Mesh(new THREE.TubeGeometry(curve, 72, r, 8, false), cableMat);
    c.castShadow = true;
    root.add(c);
  };
  const back = TOWER.z - 1.7 * TOWER.scale / 2;       // the tower's rear face
  /* down through the grommet, behind the rails, along the floor */
  /* extra points where a run meets the floor stop the curve dipping through it */
  const lie = FLOOR + 0.05;
  run([[-0.2, 0.03, -0.52], [-0.5, 0.03, -1.7], [-0.85, 0.04, -2.6], [-0.9, -0.1, -2.8], [-0.92, -1.2, -2.85],
    [-1.2, -4.0, -3.7], [-1.6, lie + 0.5, -3.9], [-2.4, lie, -3.95], [-4.5, lie, -3.9], [-8.0, lie, -3.75],
    [-9.6, lie + 0.4, -3.6], [TOWER.x + 0.3, FLOOR + 2.8, back - 0.08]]);
  for (const m of MONITORS) {
    run([[m.x, 1.1, m.z - 0.75], [m.x + 0.2, 0.35, -3.4], [m.x + 0.3, -0.2, -3.62], [m.x + 0.1, -4, -3.9],
      [m.x - 0.2, lie + 0.5, -3.95], [m.x - 0.9, lie, -3.95], [-9.4, lie, -3.8], [TOWER.x + 0.5, FLOOR + 2.2, back - 0.08]], 0.035);
  }
}

/* A steel-framed desk, 140 by 70 cm with its top 75 cm up. The rails sit high
   so a seated person's knees go under the front edge. */
function buildDeskFrame(frame) {
  const wood = pbr("wood_table_worn", { repeat: [2, 1], color: 0xc9b9a0, roughness: 1 });
  const top = new THREE.Mesh(new THREE.BoxGeometry(DESK.w, DESK.t, DESK.d), wood);
  top.position.set(DESK.x, -DESK.t / 2, DESK.z);
  top.receiveShadow = true;
  top.castShadow = true;
  root.add(top);

  const legX = [DESK.x - DESK.w / 2 + 0.45, DESK.x + DESK.w / 2 - 0.45];
  const legZ = [-DESK.d / 2 + 0.4, DESK.d / 2 - 0.4];
  const legTop = -DESK.t, legFoot = FLOOR + 0.15;
  for (const x of legX) {
    for (const z of legZ) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.5, legTop - legFoot, 0.5), frame);
      leg.position.set(x, (legTop + legFoot) / 2, z);
      leg.castShadow = true;
      root.add(leg);
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.15, 12), MAT.dark);
      foot.position.set(x, FLOOR + 0.075, z);
      root.add(foot);
    }
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, DESK.d - 0.8), frame);
    side.position.set(x, legTop - 0.25, DESK.z);
    root.add(side);
  }
  const span = legX[1] - legX[0];
  const rail = (z, h, y) => {
    const r = new THREE.Mesh(new THREE.BoxGeometry(span, h, 0.3), frame);
    r.position.set(DESK.x, y, z);
    r.castShadow = true;
    root.add(r);
  };
  rail(legZ[0], 0.5, legTop - 0.25);            // back, under the top
  rail(legZ[1], 0.35, legTop - 0.175);          // front, thin, clear of the knees
  rail(legZ[0], 0.3, FLOOR + 1.2);              // low stretcher at the back

  /* cable grommet behind the arm */
  const grommet = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.26, 20), MAT.dark);
  grommet.rotation.x = -Math.PI / 2;
  grommet.position.set(-0.9, 0.004, -2.8);
  root.add(grommet);
}

/* A task chair without armrests, so the operator's elbows are free: seat top
   46 cm up, five-star base on casters, a slightly reclined back. It faces the
   desk (-z); its back is on the +z side. */
function buildChair(frame) {
  const g = new THREE.Group();
  g.position.set(SEAT.x, FLOOR, SEAT.z);
  root.add(g);
  blockers.push(g);

  const fabric = new THREE.MeshStandardMaterial({ color: 0x2b3431, roughness: 0.95, metalness: 0 });
  const seatTop = SEAT.top - FLOOR;             // 4.6

  const cushion = new THREE.Mesh(roundedBox(4.8, 0.7, 4.6, 0.25), fabric);
  cushion.position.y = seatTop - 0.35;
  cushion.castShadow = cushion.receiveShadow = true;
  g.add(cushion);

  const pan = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.22, 3.8), MAT.dark);
  pan.position.y = seatTop - 0.81;
  g.add(pan);

  const mech = new THREE.Mesh(roundedBox(1.6, 0.5, 1.8, 0.1), MAT.dark);
  mech.position.y = seatTop - 1.17;
  g.add(mech);

  const hubY = 0.95;
  const lift = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, seatTop - 1.4 - hubY, 16), MAT.bolt);
  lift.position.y = (seatTop - 1.4 + hubY) / 2;
  g.add(lift);
  const shroud = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 1.3, 16), frame);
  shroud.position.y = hubY + 0.65;
  g.add(shroud);

  const centre = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 0.36, 20), frame);
  centre.position.y = hubY;
  centre.castShadow = true;
  g.add(centre);

  for (let i = 0; i < 5; i++) {
    /* one spoke points straight back (+z), so none aims at the operator's feet */
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    const spoke = new THREE.Group();
    spoke.rotation.y = a;
    g.add(spoke);
    const bar = new THREE.Mesh(roundedBox(2.7, 0.26, 0.42, 0.1), frame);
    bar.position.set(1.65, hubY - 0.12, 0);
    bar.rotation.z = -0.07;
    bar.castShadow = true;
    spoke.add(bar);
    const fork = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), MAT.dark);
    fork.position.set(3.0, 0.62, 0);
    spoke.add(fork);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.24, 14), MAT.dark);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(3.05, 0.26, 0);
    wheel.castShadow = true;
    spoke.add(wheel);
  }

  /* back: a bracket from under the seat up to a reclined cushion */
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 1.4), frame);
  arm.position.set(0, seatTop - 0.95, 2.1);
  g.add(arm);
  const upright = new THREE.Mesh(new THREE.BoxGeometry(0.55, 2.6, 0.22), frame);
  upright.position.set(0, seatTop + 0.3, 2.75);
  upright.rotation.x = 0.1;
  g.add(upright);
  const rest = new THREE.Mesh(roundedBox(4.4, 5.0, 0.6, 0.25), fabric);
  rest.position.set(0, seatTop + 3.2, 2.35);
  rest.rotation.x = 0.1;
  rest.castShadow = true;
  g.add(rest);
}

/* A mid-tower on the floor to the left of the desk: 43 cm long, 46 cm tall,
   20 cm wide. The front panel faces the room (+z) and the window faces the
   desk (+x). It is built at 1.7 by 1.85 by 0.82 and scaled, with z mirrored so
   the window lands on the desk side after the turn. */
function buildTower(shell) {
  const rig = new THREE.Group();
  rig.position.set(TOWER.x, FLOOR, TOWER.z);
  rig.rotation.y = -Math.PI / 2;
  rig.scale.set(TOWER.scale, TOWER.scale, -TOWER.scale);
  root.add(rig);
  blockers.push(rig);

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
      const spoke = new THREE.Group();
      spoke.rotation.z = (i / 7) * Math.PI * 2;
      b.rotation.y = 0.5;
      spoke.add(b);
      blades.add(spoke);
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

/* Two 17-inch class monitors (screens 38 by 21 cm) on stands along the back
   edge, each turned in toward the seated operator's head and tipped back a
   little. */
function buildMonitors(shell, slides) {
  slideshow = makeSlideshow(slides);
  terminal = makeTerminal();
  const feeds = [slideshow.texture, terminal.texture];

  MONITORS.forEach((m, i) => {
    const rig = new THREE.Group();
    rig.position.set(m.x, 0, m.z);
    rig.rotation.y = Math.atan2(EYE.x - m.x, EYE.z - m.z);
    root.add(rig);
    blockers.push(rig);

    const foot = new THREE.Mesh(roundedBox(1.9, 0.08, 1.3, 0.03), shell);
    foot.position.set(0, 0.04, -0.15);
    foot.castShadow = foot.receiveShadow = true;
    rig.add(foot);

    const neck = new THREE.Mesh(roundedBox(0.4, 3.1, 0.22, 0.06), shell);
    neck.position.set(0, 1.6, -0.55);
    neck.castShadow = true;
    rig.add(neck);

    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.2), shell);
    bracket.position.set(0, 2.95, -0.4);
    rig.add(bracket);

    const head = new THREE.Group();
    head.position.y = 3.25;
    head.rotation.x = -0.08;
    rig.add(head);

    const bezel = new THREE.Mesh(roundedBox(4.0, 2.4, 0.22, 0.05), shell);
    bezel.castShadow = true;
    head.add(bezel);

    const hump = new THREE.Mesh(roundedBox(1.6, 1.2, 0.3, 0.08), shell);
    hump.position.z = -0.24;
    head.add(hump);

    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(3.8, 3.8 * 9 / 16),
      new THREE.MeshBasicMaterial({ map: feeds[i], toneMapped: false })
    );
    glass.position.z = 0.115;
    head.add(glass);

    const led = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.02), MAT.glow);
    led.position.set(1.8, -1.12, 0.115);
    head.add(led);
  });

  /* screen spill on the keyboard and the operator's hands and face */
  const spill = new THREE.PointLight(0x8fd6c4, 0.12, 2.0, 2);
  spill.position.set(-5, 3.2, -1.2);
  root.add(spill);
}

/* A full-size keyboard, 42 by 13 cm and low, straight in front of the chair. */
function buildKeyboard(shell) {
  const rig = new THREE.Group();
  rig.position.set(KEYBOARD.x, KEYBOARD.y, KEYBOARD.z);
  root.add(rig);

  const slab = new THREE.Mesh(roundedBox(4.2, 0.14, 1.35, 0.05), shell);
  slab.position.y = 0.07;
  slab.castShadow = slab.receiveShadow = true;
  rig.add(slab);

  const cols = 20;
  const rows = 6;
  const keys = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.16, 0.06, 0.16),
    new THREE.MeshStandardMaterial({ color: 0x39443f, roughness: 0.9 }),
    cols * rows
  );
  const m = new THREE.Matrix4();
  let i = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      /* a gap between the main block and the number pad */
      const x = -1.9 + c * 0.19 + (c > 15 ? 0.12 : 0) - 0.06;
      m.makeTranslation(x, 0.17, -0.475 + r * 0.19);
      keys.setMatrixAt(i++, m);
    }
  }
  keys.instanceMatrix.needsUpdate = true;
  keys.castShadow = true;
  rig.add(keys);
}

/* ---------------------------------------------------------------- screens */

const MONO = "'Share Tech Mono', ui-monospace, monospace";
const SANS = "'IBM Plex Sans', 'Segoe UI', Arial, sans-serif";

function fitText(ctx, text, width) {
  if (ctx.measureText(text).width <= width) return text;
  let lo = 0, hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(text.slice(0, mid) + "...").width <= width) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo).trimEnd() + "...";
}

/* The left monitor: the page's own project photos, one every five seconds,
   each sliding in from the right. Pictures load only as they come up. */
function makeSlideshow(slides) {
  const W = 1024, H = 576, STRIP = 66, AREA = H - STRIP;
  const HOLD = 5000, SLIDE = 800;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;

  const items = slides.filter((s) => s && s.src).map((s) => ({ src: s.src, alt: s.alt || "", img: null, ok: false, bad: false }));
  const n = items.length;
  let index = 0, from = -1, shownAt = 0, drawnAt = 0, dirty = true;

  function load(i) {
    const it = items[i];
    if (!it || it.img) return;
    const img = new Image();
    img.decoding = "async";
    img.onload = () => { it.ok = true; dirty = true; };
    img.onerror = () => { it.bad = true; dirty = true; };
    img.src = it.src;
    it.img = img;
  }

  function picture(it, ox) {
    if (!it || !it.ok) {
      ctx.fillStyle = "#6f867c";
      ctx.font = `26px ${MONO}`;
      ctx.textAlign = "center";
      ctx.fillText(it && it.bad ? "image unavailable" : "loading", ox + W / 2, AREA / 2);
      ctx.textAlign = "left";
      return;
    }
    const iw = it.img.naturalWidth || 1, ih = it.img.naturalHeight || 1;
    /* the photo whole, over a dimmed crop of itself so no bars show */
    const cover = Math.max(W / iw, AREA / ih);
    ctx.globalAlpha = 0.2;
    ctx.drawImage(it.img, ox + (W - iw * cover) / 2, (AREA - ih * cover) / 2, iw * cover, ih * cover);
    ctx.globalAlpha = 1;
    const fit = Math.min(W / iw, AREA / ih);
    ctx.drawImage(it.img, ox + (W - iw * fit) / 2, (AREA - ih * fit) / 2, iw * fit, ih * fit);
  }

  function draw(a, b, e) {
    ctx.fillStyle = "#0b1412";
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, AREA);
    ctx.clip();
    if (a >= 0) picture(items[a], -e * W);
    picture(items[b], a >= 0 ? (1 - e) * W : 0);
    ctx.restore();

    /* caption strip */
    const cap = items[a >= 0 && e < 0.5 ? a : b];
    ctx.fillStyle = "#101b18";
    ctx.fillRect(0, AREA, W, STRIP);
    ctx.fillStyle = "#f0a31e";
    ctx.fillRect(0, AREA, W, 2);
    ctx.textBaseline = "middle";
    ctx.font = `22px ${MONO}`;
    const count = `${String((a >= 0 && e < 0.5 ? a : b) + 1).padStart(2, "0")} / ${String(n).padStart(2, "0")}`;
    const cw = ctx.measureText(count).width;
    ctx.fillStyle = "#7eceec";
    ctx.fillText(count, W - 28 - cw, AREA + STRIP / 2 + 1);
    ctx.font = `23px ${SANS}`;
    ctx.fillStyle = "#d7e2da";
    ctx.fillText(fitText(ctx, cap.alt, W - 90 - cw), 28, AREA + STRIP / 2 + 1);
    ctx.textBaseline = "alphabetic";

    /* scanlines, faint, like the terminal beside it */
    ctx.globalAlpha = 0.04;
    ctx.fillStyle = "#9fd8c6";
    for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
    ctx.globalAlpha = 1;

    texture.needsUpdate = true;
  }

  function drawEmpty() {
    ctx.fillStyle = "#0b1412";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#6f867c";
    ctx.font = `26px ${MONO}`;
    ctx.textAlign = "center";
    ctx.fillText("no project photos", W / 2, H / 2);
    ctx.textAlign = "left";
    texture.needsUpdate = true;
  }

  function update(now) {
    if (!n) {
      if (dirty) { drawEmpty(); dirty = false; }
      return;
    }
    if (!shownAt) shownAt = now;
    load(index);
    const next = (index + 1) % n;
    if (n > 1) load(next);

    /* a picture that failed is skipped rather than shown as an error for five seconds */
    if (items.every((it) => it.bad)) {
      if (dirty) { draw(-1, index, 1); dirty = false; }
      return;
    }
    if (items[index].bad && n > 1 && from < 0) {
      index = next;
      shownAt = now;
      dirty = true;
      return;
    }

    if (from < 0 && n > 1 && now - shownAt > HOLD && (items[next].ok || items[next].bad)) {
      from = index;
      index = next;
      shownAt = now;
    }

    if (from >= 0) {
      const p = reduceMotion ? 1 : clamp((now - shownAt) / SLIDE, 0, 1);
      if (p < 1 && now - drawnAt < 33) return;
      drawnAt = now;
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      draw(from, index, e);
      if (p >= 1) { from = -1; dirty = false; }
      return;
    }
    if (dirty) { draw(-1, index, 1); dirty = false; }
  }

  drawEmpty();
  return { texture, update };
}

/* The right monitor: the same telemetry the readout shows, then the last few
   armctl lines, typed or sent by tapping the desk. Redrawn a few times a second. */
const termLog = [];

function termPush(kind, text) {
  termLog.push({ kind, text });
  if (termLog.length > 40) termLog.splice(0, termLog.length - 40);
  if (terminal) terminal.touch();
}

function makeTerminal() {
  const W = 1024, H = 576;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  let at = 0;

  function draw(now, info) {
    if (now - at < 140) return;
    at = now;

    ctx.fillStyle = "#0b1412";
    ctx.fillRect(0, 0, W, H);

    ctx.globalAlpha = 0.05;
    ctx.fillStyle = "#9fd8c6";
    for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
    ctx.globalAlpha = 1;

    /* the distribution's arch, drawn rather than imported */
    ctx.strokeStyle = "rgba(126, 206, 236, 0.55)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(950, 26);
    ctx.lineTo(992, 96);
    ctx.lineTo(950, 79);
    ctx.lineTo(908, 96);
    ctx.closePath();
    ctx.stroke();

    ctx.font = `22px ${MONO}`;
    ctx.textBaseline = "top";

    const pair = (x, y, head, tail, tone) => {
      ctx.fillStyle = tone === "val" ? "#8ea69b" : "#6f867c";
      ctx.fillText(head, x, y);
      ctx.fillStyle = tone === "val" ? "#f0a31e" : "#c3d2c9";
      ctx.fillText(tail, x + ctx.measureText(head).width, y);
    };

    ctx.fillStyle = "#7eceec";
    ctx.fillText("[shivender@archbox ~]$ ", 34, 24);
    ctx.fillStyle = "#d7e2da";
    ctx.fillText("./armctl --live", 34 + ctx.measureText("[shivender@archbox ~]$ ").width, 24);

    pair(34, 66, "links   ", info.links);
    pair(34, 94, "reach   ", info.reach);
    pair(34, 122, "volume  ", info.volume);
    pair(34, 150, "block   ", info.target);
    pair(34, 178, "claw    ", info.claw);
    pair(34, 206, "state   ", info.state);

    pair(700, 66, "J1 ", info.j1, "val");
    pair(700, 94, "J2 ", info.j2, "val");
    pair(700, 122, "J3 ", info.j3, "val");
    pair(700, 150, "J4 ", info.j4, "val");

    ctx.fillStyle = "rgba(126, 206, 236, 0.35)";
    ctx.fillRect(34, 246, W - 68, 2);

    const lines = termLog.slice(-8);
    let y = 262;
    for (const l of lines) {
      ctx.fillStyle = l.kind === "in" ? "#7eceec" : l.kind === "err" ? "#f0a31e" : "#c3d2c9";
      ctx.fillText(fitText(ctx, l.text, W - 68), 34, y);
      y += 30;
    }

    ctx.fillStyle = "#7eceec";
    ctx.fillText("armctl> ", 34, 516);
    if (Math.floor(now / 520) % 2 === 0) {
      ctx.fillStyle = "#f0a31e";
      ctx.fillRect(34 + ctx.measureText("armctl> ").width, 516, 13, 24);
    }
    ctx.textBaseline = "alphabetic";

    texture.needsUpdate = true;
  }

  return { texture, draw, touch: () => { at = 0; } };
}

/* ----------------------------------------------------------------- state */

const block = new THREE.Vector3(1.62, HALF, -0.35);
const angles = { yaw: 0, a1: 0.5, a2: -1.2, a3: 0.7, gap: GAP_OPEN };

const goal = new THREE.Vector3(0.72, 1.58, -0.3);
const padLocal = new THREE.Vector3();

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

/* A job is one pick-and-place: where the block is going and who asked. "user"
   jobs come from a tap or a command and keep the demo away for a while after
   they finish; "demo" jobs are the arm keeping itself busy. */
const dest = new THREE.Vector3();
let job = null;             // null | "user" | "demo"
let destHome = true;
let quietUntil = 0;

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

/* Where a block asked to go at v can actually be set down, in bench-local
   units. Unlike clampToEnvelope, which projects toward the shoulder and would
   lift a desk target into the air, this keeps the requested height when it can
   and only pulls the radius in or out. It never goes below whatever surface is
   underneath, snaps onto the pedestal when it would land on it, and keeps
   clear of the arm's own base. Returns what it had to change. */
function planTarget(v) {
  const notes = { far: false, near: false, high: false, pedestal: false, raised: false };
  const askedY = v.y;

  const overPed = Math.hypot(v.x - HOME.x, v.z - HOME.z) < PED_R + HALF * 1.42;
  if (overPed && v.y < HOME.y + 0.01) {
    v.set(HOME.x, HOME.y, HOME.z);
    notes.pedestal = true;
    return notes;
  }
  if (v.y < HALF) { v.y = HALF; notes.raised = askedY < -0.01; }

  const r = Math.hypot(v.x, v.z);
  const ux = r < 1e-4 ? HOME_DIR.x : v.x / r;
  const uz = r < 1e-4 ? HOME_DIR.y : v.z / r;
  const span = floorSpan(v.y);
  const lo = Math.max(span.inner, v.y < PLATE_TOP + HALF + 0.02 ? BASE_CLEAR : COLUMN_CLEAR);
  const hi = span.outer - 0.01;

  if (hi - lo > 0.02) {
    const rr = clamp(r, lo, hi);
    if (r > hi + 1e-3) notes.far = true;
    if (r < lo - 1e-3) notes.near = true;
    v.x = ux * rr;
    v.z = uz * rr;
  } else {
    /* no ring at this height: too high for the arm, so fall back to the envelope */
    const before = v.y;
    clampToEnvelope(v);
    notes.high = v.y < before - 1e-3;
    notes.far = !notes.high;
  }
  clampToEnvelope(v);
  return notes;
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

/* Start (or retarget) a pick-and-place. If the block is already in the claw
   it goes straight to carrying; if the claw is closing on it, that finishes;
   otherwise the arm goes to fetch it from wherever it is. Asking again for
   the same spot while a job runs changes nothing, so a tap that reaches both
   pointerUp and placeAt does not restart the arm. */
function startJob(point, kind, home) {
  const now = performance.now();
  if (kind === "user") { lastTouch = now; quietUntil = now + 45000; }
  if (job && dest.distanceTo(point) < 0.03 && state !== STATE.REST) {
    job = kind === "user" ? "user" : job;
    return;
  }
  dest.copy(point);
  destHome = !!home;
  job = kind;
  if (held) setState(STATE.CARRY, now);
  else if (state === STATE.DESCEND || state === STATE.GRIP) { /* keep closing on the block */ }
  else setState(STATE.APPROACH, now);
}

function busy() {
  return job === "user";
}

/* ----------------------------------------------------------------- input */

/* The world forwards pointer events here in normalised device coordinates.
   Grab the block itself and it moves in the plane facing you, so it goes up,
   down and sideways into open air; orbit the view and that plane turns with
   you, which is how it reaches any point in the dome. Grab the ring above it
   to push it across the desk at the height it already has.

   Rays start in world space, which is what object raycasts need. Plane maths
   runs on a copy of the ray moved into bench-local space, so the planes and
   the points they give are in the same units as the block. */

const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const lray = new THREE.Ray();
const dragPlane = new THREE.Plane();
const hit = new THREE.Vector3();
const grabOffset = new THREE.Vector3();
const camDir = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const aimPlane = new THREE.Plane();
const aimHit = new THREE.Vector3();

let mode = "none";     // none | free | depth
let moved = 0;

/* world ray from the camera, and the same ray in bench-local units */
function castFrom(x, y) {
  ndc.set(x, y);
  ray.setFromCamera(ndc, camera);
  root.updateWorldMatrix(true, false);
  rootInv.copy(root.matrixWorld).invert();
  lray.copy(ray.ray).applyMatrix4(rootInv);
  sizePicks();
}

/* The smallest on-screen size of a pick stand-in, in CSS pixels: 44 px for a
   finger (the usual touch guideline), 30 px for a mouse, where a larger zone
   would swallow clicks meant for the desk right beside the block. */
const coarsePointer = (() => {
  try { return typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches; }
  catch { return false; }
})();
const PICK_PX = coarsePointer ? 44 : 30;
const PICK_MAX_SCALE = 10;
const pickAt = new THREE.Vector3();
const ringAt = new THREE.Vector3();

/* metres per CSS pixel at a world point, for the camera as it is now */
function metresPerPixel(p) {
  const h = (typeof innerHeight === "number" && innerHeight > 0) ? innerHeight : 800;
  if (camera.isOrthographicCamera) return (camera.top - camera.bottom) / (camera.zoom || 1) / h;
  const d = camera.position.distanceTo(p);
  return 2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / ((camera.zoom || 1) * h);
}

/* Grow the invisible stand-ins so each spans at least PICK_PX on screen. The
   size is measured at the stand-in's own distance from the camera, then turned
   into a scale on its bench-local size (the root is scaled, so one local unit
   is not one metre). World matrices are refreshed here because a raycast reads
   them and the renderer may not have run since the last change. */
function sizePicks() {
  const unit = root.matrixWorld.getMaxScaleOnAxis();

  payload.updateWorldMatrix(true, false);
  payload.getWorldPosition(pickAt);
  const wantBlock = PICK_PX * metresPerPixel(pickAt);
  blockPick.scale.setScalar(clamp(wantBlock / (PICK_BLOCK * unit), 1, PICK_MAX_SCALE));
  blockPick.updateWorldMatrix(false, false);

  handle.updateWorldMatrix(true, false);
  handle.getWorldPosition(ringAt);
  const wantRing = PICK_PX * metresPerPixel(ringAt);
  handlePick.scale.setScalar(clamp(wantRing / (PICK_RING * unit), 1, PICK_MAX_SCALE));
  handlePick.updateWorldMatrix(false, false);
}

/* squared CSS-pixel distance from the pointer to a world point on screen */
function screenGap(p) {
  const v = p.clone().project(camera);
  const w = (typeof innerWidth === "number" && innerWidth > 0) ? innerWidth : 800;
  const h = (typeof innerHeight === "number" && innerHeight > 0) ? innerHeight : 800;
  const dx = (v.x - ndc.x) * w / 2, dy = (v.y - ndc.y) * h / 2;
  return dx * dx + dy * dy;
}

/* The block or its ring under the pointer, world-space raycasts. The ring
   floats 2.8 cm above the block, so once both stand-ins are grown to a
   fingertip they overlap on screen; where the pointer is inside both, the one
   whose centre is nearer the pointer on screen wins, so the upper part of the
   shared zone takes the ring and the lower part the block. */
function grabbable() {
  const b = ray.intersectObject(blockPick, false)[0];
  const r = handle.visible ? ray.intersectObject(handlePick, false)[0] : undefined;
  if (!b && !r) return "none";
  if (!b) return "depth";
  if (!r) return "free";
  return screenGap(ringAt) < screenGap(pickAt) ? "depth" : "free";
}

function pointerDown(x, y) {
  moved = 0;
  lastTouch = performance.now();

  castFrom(x, y);
  const grab = grabbable();
  if (grab === "none") { mode = "none"; return "none"; }

  held = false;
  wantShut = false;
  job = null;
  mode = grab;
  if (mode === "depth") {
    dragPlane.setFromNormalAndCoplanarPoint(UP, block);
  } else {
    /* the camera's facing, turned into bench-local space */
    camera.getWorldDirection(camDir);
    camDir.transformDirection(rootInv);
    dragPlane.setFromNormalAndCoplanarPoint(camDir.negate(), block);
  }
  if (lray.intersectPlane(dragPlane, hit)) grabOffset.copy(block).sub(hit);
  else grabOffset.set(0, 0, 0);
  return mode;
}

function pointerMove(x, y, travel) {
  moved += travel;
  if (mode === "none") return false;

  castFrom(x, y);
  if (lray.intersectPlane(dragPlane, hit)) {
    block.copy(hit).add(grabOffset);
    clampBlock();
  }
  lastTouch = performance.now();
  return true;
}

/* cancel: the hold ended without a real release (a second finger, or the browser
   took the gesture), so it is never read as a tap */
function pointerUp(x, y, { cancel = false } = {}) {
  if (mode === "none") {
    /* a tap on the desk sends the block there, the same as placeAt */
    if (moved < 9 && !cancel) {
      const aim = aimFromNdc(x, y);
      if (aim) placeAt(aim);
    }
    return;
  }
  if (mode === "depth" && moved < 9 && !cancel) {
    /* tapping the ring lifts or lowers: on a touch screen that is quicker than a drag */
    block.y = block.y > HALF + 0.2 ? HALF : SHOULDER_Y + 0.5 * D_MAX;
    clampBlock();
  }
  /* after a drag the arm fetches the block back to its pedestal */
  dest.copy(HOME);
  destHome = true;
  job = "demo";
  setState(STATE.WATCH, performance.now());
  mode = "none";
  lastTouch = performance.now();
}

function hoverAt(x, y) {
  castFrom(x, y);
  return grabbable() !== "none";
}

/* A tap to world target: where the pointer's ray meets the pedestal top or the
   desk top inside the desk's rectangle. The pedestal wins where both lie under
   the ray, since the arm can always reach it. The arm itself, the block, the
   keyboard and other low things on the desk do not stop the ray; the monitors,
   the tower and the chair do, so tapping a screen never moves the block. */
function aimFromNdc(x, y) {
  castFrom(x, y);

  /* plane hits in bench-local space, measured back in world metres along the ray */
  const worldDist = (p) => toWorld(p.clone()).distanceTo(ray.ray.origin);
  let best = null;

  aimPlane.set(UP, -(PED_TOP + 0.03));
  if (lray.intersectPlane(aimPlane, aimHit) && Math.hypot(aimHit.x - HOME.x, aimHit.z - HOME.z) < PED_R) {
    best = aimHit.clone();
  } else {
    aimPlane.set(UP, 0);
    if (lray.intersectPlane(aimPlane, aimHit) &&
        Math.abs(aimHit.x - DESK.x) < DESK.w / 2 - HALF && Math.abs(aimHit.z - DESK.z) < DESK.d / 2 - HALF) {
      best = aimHit.clone();
    }
  }
  if (!best) return null;

  const wall = ray.intersectObjects(blockers, true)[0];
  if (wall && wall.distance < worldDist(best)) return null;

  return toWorld(best);
}

/* Place the block at a world point: pick it up from wherever it is and set it
   down there. The point is moved into bench-local space, fitted to what the arm
   can do, and handed back in world space. */
const scratch = new THREE.Vector3();
const lastEcho = { line: "", at: -1e9 };

function placeAt(p) {
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) {
    return { accepted: false, target: null, reason: "no target" };
  }
  const local = toLocal(scratch.copy(p));
  const res = place(local, { home: false });
  /* the same tap can arrive through pointerUp and placeAt; echo it once */
  const now = performance.now();
  if (res.line !== lastEcho.line || now - lastEcho.at > 300) {
    termPush("in", "armctl> " + res.line);
    res.lines.forEach((l) => termPush(res.accepted ? "out" : "err", l));
  }
  lastEcho.line = res.line;
  lastEcho.at = now;
  return { accepted: res.accepted, target: res.target ? toWorld(res.target.clone()) : null, reason: res.reason, line: res.line };
}

/* shared by placeAt and the place command; local is in bench-local units */
function place(local, { home, asked }) {
  const want = local.clone();
  const surface = want.y < HALF + 1e-3;
  const line = asked || `place ${cm(want.x)} ${cm(want.z)}` + (surface ? "" : ` ${cm(want.y)}`);

  if (mode !== "none") {
    return { accepted: false, target: null, reason: "the block is being dragged", line, lines: [`${line}: the block is being dragged, let go first`] };
  }

  const t = local.clone();
  const notes = planTarget(t);
  const r = Math.hypot(t.x, t.z);
  const where = `x ${cm(t.x)} z ${cm(t.z)} h ${cm(t.y)} cm`;

  let reason = "";
  if (notes.pedestal) reason = "on the pedestal";
  else if (notes.far) reason = `out of reach, clamped to ${cm(r)} cm`;
  else if (notes.near) reason = `too close to the base, pushed out to ${cm(r)} cm`;
  else if (notes.high) reason = `above the arm's reach, clamped to ${cm(t.y)} cm up`;

  startJob(t, "user", home || notes.pedestal);
  const lines = [reason ? `${line}: ${reason}` : `${line}: ok`, `moving block to ${where}`];
  return { accepted: true, target: t, reason, line, lines };
}

/* ---------------------------------------------------------------- armctl */

/* The console the reader types into. Every call echoes the line and its answer
   onto the terminal monitor, and returns the answer for the page's own log.
   Distances are centimetres from the centre of the arm's base: x to the
   operator's right, z toward the operator, height to the block's centre, the
   same number HGT shows. */
function command(input) {
  const text = String(input ?? "").trim();
  if (!text) return { ok: true, lines: [] };
  termPush("in", "armctl> " + text);
  const res = run(text);
  res.lines.forEach((l) => termPush(res.ok ? "out" : "err", l));
  return res;
}

function run(text) {
  const parts = text.split(/\s+/);
  if (parts[0].toLowerCase() === "armctl") parts.shift();
  const cmd = (parts.shift() || "").toLowerCase();
  const num = (s) => (s !== undefined && s !== "" && Number.isFinite(+s) ? +s : NaN);

  switch (cmd) {
    case "":
    case "help":
      return { ok: true, lines: [
        "help                        this list",
        "status                      state, claw and where the block is",
        "place <x> <z> [h]           move the block, cm from the base: x right, z toward you, h up",
        "home                        put the block back on the pedestal",
        "reach                       how far the arm reaches as set",
        "set <base|l1|l2|claw> <cm>  change one link, e.g. set l1 12",
        "reset                       default links, block home"
      ] };

    case "status": {
      const r = Math.hypot(block.x, block.z);
      return { ok: true, lines: [
        `state ${state}, claw ${held ? "HOLDING" : wantShut ? "CLOSING" : "OPEN"}` + (job === "user" ? `, moving to x ${cm(dest.x)} z ${cm(dest.z)} h ${cm(dest.y)}` : ""),
        `block x ${cm(block.x)} z ${cm(block.z)} h ${cm(block.y)} cm, ${cm(r)} cm out` + (onPedestal(block) && !held ? ", on the pedestal" : ""),
        `links base ${cm(dims.base)} l1 ${cm(dims.l1)} l2 ${cm(dims.l2)} claw ${cm(dims.claw)} cm`
      ] };
    }

    case "place": {
      const usage = "usage: place <x_cm> <z_cm> [height_cm]";
      if (parts.length < 2 || parts.length > 3) return { ok: false, lines: [`place: ${usage}`] };
      const [x, z, h] = parts.map(num);
      const badAt = [x, z, parts.length === 3 ? h : 0].findIndex((v) => Number.isNaN(v));
      if (badAt >= 0) return { ok: false, lines: [`place: '${parts[badAt]}' is not a number; ${usage}`] };
      const asked = `place ${parts.join(" ")}`;
      const res = place(new THREE.Vector3(x / 10, parts.length === 3 ? h / 10 : 0, z / 10), { home: false, asked });
      return { ok: res.accepted, lines: res.lines };
    }

    case "home": {
      if (parts.length) return { ok: false, lines: ["home: takes no arguments"] };
      if (mode !== "none") return { ok: false, lines: ["home: the block is being dragged, let go first"] };
      if (!held && !job && onPedestal(block)) return { ok: true, lines: ["home: the block is already on the pedestal"] };
      startJob(HOME, "user", true);
      return { ok: true, lines: [`home: returning the block to the pedestal at x ${cm(HOME.x)} z ${cm(HOME.z)}`] };
    }

    case "reach": {
      const s = stats();
      const span = floorSpan(HALF);
      return { ok: true, lines: [
        `reach ${s.reachCm.toFixed(1)} cm on the desk, from ${cm(Math.max(span.inner, BASE_CLEAR))} cm clear of the base`,
        `widest ${cm(D_MAX + CLAW_LEN)} cm at shoulder height (${cm(SHOULDER_Y)} cm), top ${s.heightCm.toFixed(1)} cm`,
        `floor area ${Math.round(s.areaCm2)} cm2, working volume ${s.litres.toFixed(1)} L`
      ] };
    }

    case "set": {
      const usage = "usage: set <base|l1|l2|claw> <cm>";
      const key = (parts[0] || "").toLowerCase();
      if (parts.length !== 2 || !LIMITS[key]) return { ok: false, lines: [`set: ${usage}`] };
      const v = num(parts[1]);
      if (Number.isNaN(v)) return { ok: false, lines: [`set: '${parts[1]}' is not a number; ${usage}`] };
      const [lo, hi] = LIMITS[key];
      setDims({ [key]: v / 10 });
      const got = dims[key];
      const s = stats();
      onStats(s);
      const first = Math.abs(got * 10 - v) > 0.05
        ? `set ${key} ${parts[1]}: clamped to ${cm(got)} cm (range ${cm(lo)} to ${cm(hi)} cm)`
        : `set ${key} ${parts[1]}: ${NAMES[key]} ${cm(got)} cm`;
      return { ok: true, lines: [first, `reach now ${s.reachCm.toFixed(1)} cm, top ${s.heightCm.toFixed(1)} cm`] };
    }

    case "reset": {
      if (parts.length) return { ok: false, lines: ["reset: takes no arguments"] };
      setDims(DEFAULTS);
      onStats(stats());
      let tail = "";
      if (mode === "none" && (held || !onPedestal(block))) { startJob(HOME, "user", true); tail = ", block going home"; }
      return { ok: true, lines: [`reset: base ${cm(dims.base)}, upper arm ${cm(dims.l1)}, forearm ${cm(dims.l2)}, claw ${cm(dims.claw)} cm${tail}`] };
    }

    default:
      return { ok: false, lines: [`armctl: unknown command '${cmd}', try help`] };
  }
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
  return padLocal.distanceTo(goal) < tol;
}

/* -------------------------------------------------------------- sequence */

function sequence(now) {
  const t = now - stateAt;

  switch (state) {
    case STATE.REST:
      restPoint(goal);
      wantShut = false;
      if (!reduceMotion && !job && mode === "none" && now - lastTouch > 4200 && now > autoAt && now > quietUntil) {
        /* unattended: move the block to a new spot on the desk, next time bring it home */
        autoAt = now + 9000;
        if (onPedestal(block)) {
          const span = floorSpan(HALF);
          const lo = Math.max(span.inner, BASE_CLEAR) + 0.1;
          const hi = span.outer - 0.2;
          const p = new THREE.Vector3();
          /* a few tries for a spot that is not the pedestal again */
          for (let i = 0; i < 6; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = lo + Math.random() * Math.max(hi - lo, 0);
            p.set(Math.cos(a) * r, HALF, -Math.sin(a) * r);
            if (!planTarget(p).pedestal) break;
          }
          startJob(p, "demo", false);
        } else {
          startJob(HOME, "demo", true);
        }
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
      goal.set(dest.x, Math.max(dest.y, carryY()), dest.z);
      wantShut = true;
      if (reached(0.07) || t > 3600) setState(STATE.PLACE, now);
      break;

    case STATE.PLACE:
      goal.copy(dest);
      wantShut = true;
      if (reached(0.03) || t > 2200) setState(STATE.RELEASE, now);
      break;

    case STATE.RELEASE:
      goal.copy(dest);
      wantShut = false;
      if (t > 340) {
        held = false;
        block.copy(dest);
        setState(STATE.RETRACT, now);
      }
      break;

    case STATE.RETRACT:
      goal.set(dest.x, Math.max(dest.y, carryY()) + 0.1, dest.z);
      wantShut = false;
      if (reached(0.09) || t > 2000) {
        if (job === "user") {
          const msg = `done: block at x ${cm(block.x)} z ${cm(block.z)} h ${cm(block.y)} cm` + (onPedestal(block) ? ", on the pedestal" : "");
          termPush("out", msg);
          onLine(msg);
        }
        job = null;
        setState(STATE.REST, now);
      }
      break;
  }

  /* an operator grabbing the block always wins */
  if (mode !== "none") {
    held = false;
    job = null;
    if (state !== STATE.WATCH) setState(STATE.WATCH, now);
  }
}

/* ---------------------------------------------------------------- update */

let cached = null;

function update(now, dt) {
  /* the pad's world position, brought back into bench-local units */
  padAnchor.getWorldPosition(padLocal);
  toLocal(padLocal);
  sequence(now);

  /* the block is either in the claw or exactly where it was last put: no gravity */
  if (held) block.copy(padLocal);
  clampBlock();

  payload.position.copy(block);
  payload.rotation.y = damp(payload.rotation.y, Math.atan2(-block.z, block.x), 6, dt);

  const floorY = onPedestal(block) ? PED_TOP + 0.035 : 0.006;
  blockShadow.position.set(block.x, floorY, block.z);
  const drop = clamp(1 - (block.y - HALF) / 1.3, 0.18, 1);
  blockShadow.scale.setScalar(0.7 + (1 - drop) * 1.1);
  blockShadow.material.opacity = 0.7 * drop;

  const air = block.y > HALF + 0.05 && !held && !onPedestal(block);
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
  if (slideshow) slideshow.update(now);
  if (terminal) {
    if (!cached || tuning) cached = stats();
    terminal.draw(now, {
      links: `${cm(L1)} + ${cm(L2)} + ${cm(CLAW_LEN)} cm`,
      reach: `${cached.reachCm.toFixed(1)} cm   floor ${Math.round(cached.areaCm2)} cm2`,
      volume: `${cached.litres.toFixed(1)} L swept`,
      j1: degText(wrap(angles.yaw)), j2: degText(angles.a1),
      j3: degText(angles.a2), j4: degText(angles.a3),
      target: `x ${cm(block.x)}  z ${cm(block.z)}  h ${cm(block.y)} cm`,
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
