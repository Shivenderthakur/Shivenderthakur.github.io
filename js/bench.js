/* The workbench: the arm, the machine it is programmed from, and the block you
   move around. It builds into a scene the world module owns, and is driven by
   that module's clock rather than running a loop of its own. */

import * as THREE from "three";

export const AMBER = 0xf0a31e;
const STEEL = 0xa8b3ac;
const DARK = 0x33443f;

/* the machine, in metres */
const SHOULDER_Y = 0.66;
const L1 = 1.12;
const L2 = 0.95;
const CLAW_LEN = 0.34;

const BLOCK = 0.24;
const HALF = BLOCK / 2;

/* The reachable set of a claw held level: the wrist has to sit CLAW_LEN short of
   the target, and the two links can only span between these distances from the
   shoulder. That is a 3-DOF envelope, not a circle on the floor. */
const D_MAX = L1 + L2 - 0.02;
const D_MIN = Math.abs(L1 - L2) + 0.06;
const RP_MIN = 0.06;
const REACH_MAX = Math.sqrt(Math.max(D_MAX * D_MAX - (SHOULDER_Y - HALF) ** 2, 0)) + CLAW_LEN;

const GAP_OPEN = 0.46;
const GAP_SHUT = BLOCK - 0.014;

const PED_TOP = 0.44;
const HOME = new THREE.Vector3(-0.89, PED_TOP + HALF, 1.27);
const REST = new THREE.Vector3(0.72, 1.58, -0.3);
const CARRY_Y = 1.06;
const HOVER = 0.4;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const damp = (cur, to, k, dt) => cur + (to - cur) * (1 - Math.exp(-k * dt));

let scene, camera, reduceMotion, out;
let turret, shoulder, elbow, wrist, fingerL, fingerR, padAnchor;
let payload, payloadGlow, blockShadow, stem, handle, reachRing, pedestalRing, envelope;

export function createBench(opts) {
  scene = opts.scene;
  camera = opts.camera;
  reduceMotion = opts.reduceMotion;
  out = opts.readout || {};

  buildMarks();
  buildDesk();
  buildArm();
  buildPedestal();
  buildPayload();

  return { update, pointerDown, pointerMove, pointerUp, hoverAt, group: null };
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
    new THREE.RingGeometry(REACH_MAX - 0.014, REACH_MAX, 96),
    new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0.22, side: THREE.DoubleSide })
  );
  reachRing.rotation.x = -Math.PI / 2;
  reachRing.position.y = 0.006;
  scene.add(reachRing);

  const warm = new THREE.PointLight(AMBER, 11, 7, 2);
  warm.position.set(0.9, 1.2, 1.9);
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

  /* the outer edge of what the arm can actually touch, in its own plane */
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
  envelope.computeLineDistances();
  turret.add(envelope);

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


/* ------------------------------------------------------------------ bench */

/* The arm stands on a workbench, next to the machine it is programmed from.
   The monitor runs the same telemetry the panel readout shows. */

let screen = null;

function buildDesk() {
  const shell = new THREE.MeshStandardMaterial({ color: 0x1d2825, roughness: 0.52, metalness: 0.35 });

  buildMonitor(shell);
  buildKeyboard(shell);

  const mouse = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 14), shell);
  mouse.scale.set(0.3, 0.17, 0.46);
  mouse.position.set(-1.7, 0.085, 1.85);
  mouse.rotation.y = 0.44;
  mouse.castShadow = true;
  scene.add(mouse);

  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.42, 24), shell);
  mug.position.set(-4.0, 0.21, 0.15);
  mug.castShadow = mug.receiveShadow = true;
  scene.add(mug);

  const handleRing = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.028, 8, 20), shell);
  handleRing.position.set(-3.79, 0.23, 0.15);
  handleRing.rotation.y = Math.PI / 2;
  scene.add(handleRing);

  /* the board the arm's firmware is flashed from */
  const board = new THREE.Group();
  board.position.set(2.15, 0.02, 1.5);
  board.rotation.y = -0.5;
  scene.add(board);

  const pcb = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.03, 0.42),
    new THREE.MeshStandardMaterial({ color: 0x27564a, roughness: 0.66, metalness: 0.2 }));
  pcb.castShadow = pcb.receiveShadow = true;
  board.add(pcb);

  const soc = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.2),
    new THREE.MeshStandardMaterial({ color: 0x27302d, roughness: 0.5, metalness: 0.45 }));
  soc.position.set(-0.06, 0.04, 0);
  board.add(soc);

  const pins = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.05, 0.045),
    new THREE.MeshStandardMaterial({ color: 0xc8ab63, roughness: 0.35, metalness: 0.9 }));
  pins.position.set(0, 0.04, -0.17);
  board.add(pins);

  const led = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), new THREE.MeshBasicMaterial({ color: AMBER }));
  led.position.set(0.25, 0.035, 0.16);
  board.add(led);

  /* a cable from the arm's base off toward the machine */
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.2, 0.02, 0.5),
    new THREE.Vector3(-0.5, 0.03, 1.15),
    new THREE.Vector3(-1.6, 0.03, 1.05),
    new THREE.Vector3(-2.5, 0.03, 0.1),
    new THREE.Vector3(-2.75, 0.04, -0.85)
  ]);
  const cable = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 48, 0.028, 8, false),
    new THREE.MeshStandardMaterial({ color: 0x16201d, roughness: 0.75, metalness: 0.15 })
  );
  cable.castShadow = true;
  scene.add(cable);
}

function buildMonitor(shell) {
  const rig = new THREE.Group();
  rig.position.set(-2.75, 0, -1.5);
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
  rig.position.set(-2.6, 0, 1.0);
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
    new THREE.MeshStandardMaterial({ color: 0x39443f, roughness: 0.75, metalness: 0.1 }),
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
      ["#7eceec", "[shivender@archbox ~]$ ", "neofetch"],
      ["dim", "  os      ", "Arch Linux x86_64"],
      ["dim", "  kernel  ", "6.18.45-1-lts"],
      ["dim", "  shell   ", "bash 5.3"],
      ["gap", "", ""],
      ["prompt", "[shivender@archbox ~]$ ", "./armctl --live"],
      ["gap", "", ""],
      ["val", "  J1 ", info.j1 + "    J2 " + info.j2],
      ["val", "  J3 ", info.j3 + "    J4 " + info.j4],
      ["gap", "", ""],
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
const orbit = { theta: 0.72, phi: 1.16, radius: 6, tTheta: 0.72, tPhi: 1.16 };

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
let atLimit = false;
let wantShut = false;
let lastTouch = performance.now();
let autoAt = 0;

function setState(s, now) { state = s; stateAt = now; }

function onPedestal(p) {
  return Math.hypot(p.x - HOME.x, p.z - HOME.z) < 0.27;
}

/* Push a point back onto the arm's real working envelope, wherever it is.
   Goals get the same treatment as the block, or the arm chases a target it can
   never touch and every step of the sequence has to wait out its timeout. */
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
    const span = Math.sqrt(Math.max(D_MAX * D_MAX - (y - SHOULDER_Y) ** 2, 0.01));
    rp = clamp(rp, RP_MIN, span);
  }

  v.y = y;
  const out = Math.max(rp, RP_MIN) + CLAW_LEN;
  v.x = ux * out;
  v.z = uz * out;
  return k !== 1;
}

function clampBlock() {
  atLimit = clampToEnvelope(block);
}

/* ----------------------------------------------------------------- input */

/* The canvas is the whole viewport and the page scrolls over it, so the world
   forwards pointer events here with normalised device coordinates already. */

const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const flat = new THREE.Plane();
const upright = new THREE.Plane();
const hit = new THREE.Vector3();
const grabOffset = new THREE.Vector3();

let mode = "none";     // none | slide | lift
let moved = 0;

function pointerDown(x, y) {
  moved = 0;
  lastTouch = performance.now();
  held = false;
  wantShut = false;

  ndc.set(x, y);
  ray.setFromCamera(ndc, camera);

  if (ray.intersectObject(handle, false).length) {
    mode = "lift";
    upright.setFromNormalAndCoplanarPoint(
      new THREE.Vector3(camera.position.x - block.x, 0, camera.position.z - block.z).normalize(),
      block
    );
    return "lift";
  }

  if (ray.intersectObject(payload, false).length) {
    mode = "slide";
    flat.set(new THREE.Vector3(0, 1, 0), -block.y);
    if (ray.ray.intersectPlane(flat, hit)) grabOffset.copy(block).sub(hit);
    else grabOffset.set(0, 0, 0);
    return "slide";
  }

  mode = "none";
  return "none";
}

function pointerMove(x, y, travel) {
  moved += travel;
  if (mode === "none") return false;

  ndc.set(x, y);
  ray.setFromCamera(ndc, camera);

  if (mode === "slide") {
    flat.set(new THREE.Vector3(0, 1, 0), -block.y);
    if (ray.ray.intersectPlane(flat, hit)) {
      block.x = hit.x + grabOffset.x;
      block.z = hit.z + grabOffset.z;
      clampBlock();
    }
  } else if (mode === "lift") {
    if (ray.ray.intersectPlane(upright, hit)) block.y = hit.y;
  }
  lastTouch = performance.now();
  return true;
}

function pointerUp(x, y) {
  if (mode === "lift" && moved < 9) {
    /* vertical drags scroll the page on a touch screen, so tapping the ring
       is the way to lift the block there */
    block.y = block.y > HALF + 0.2 ? HALF : 1.15;
    clampBlock();
  }
  if (mode === "none" && moved < 9) {
    /* a tap on the bench sends the block there */
    ndc.set(x, y);
    ray.setFromCamera(ndc, camera);
    flat.set(new THREE.Vector3(0, 1, 0), -HALF);
    if (ray.ray.intersectPlane(flat, hit)) {
      block.set(hit.x, HALF, hit.z);
      clampBlock();
    }
  }
  setState(STATE.WATCH, performance.now());
  mode = "none";
  lastTouch = performance.now();
}

/* is the pointer over something grabbable? */
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
  d = clamp(d, Math.abs(L1 - L2) + 0.06, L1 + L2 - 0.02);

  const c2 = (d * d - L1 * L1 - L2 * L2) / (2 * L1 * L2);
  const a2 = -Math.acos(clamp(c2, -1, 1));
  const a1 = Math.atan2(dy, dx) - Math.atan2(L2 * Math.sin(a2), L1 + L2 * Math.cos(a2));
  return { yaw, a1, a2, a3: -(a1 + a2) };
}

/* Each step sets the goal and then asks whether it is there yet, so the goal has
   to be pulled onto the envelope here, before the comparison, not after. */
function reached(tol) {
  clampToEnvelope(goal);
  return padWorld.distanceTo(goal) < tol;
}

/* -------------------------------------------------------------- sequence */

function sequence(now) {
  const t = now - stateAt;

  switch (state) {
    case STATE.REST:
      goal.copy(REST);
      wantShut = false;
      if (!reduceMotion && now - lastTouch > 4200 && now > autoAt) {
        /* unattended: put the block somewhere new and go fetch it */
        const a = Math.random() * Math.PI * 2;
        const r = 0.85 + Math.random() * 0.95;
        const high = Math.random() < 0.45;
        block.set(Math.cos(a) * r, high ? 0.6 + Math.random() * 0.8 : HALF, -Math.sin(a) * r);
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

/* ---------------------------------------------------------------- update */

function update(now, dt) {
  padAnchor.getWorldPosition(padWorld);
  sequence(now);

  /* the block is either in the claw or exactly where it was last put */
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
  handle.material.opacity = damp(handle.material.opacity, 0.85, 6, dt);

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

  turret.rotation.y = angles.yaw;
  shoulder.rotation.z = angles.a1;
  elbow.rotation.z = angles.a2;
  wrist.rotation.z = angles.a3;
  fingerL.position.z = angles.gap / 2;
  fingerR.position.z = -angles.gap / 2;

  const showing = mode === "slide" || mode === "lift";
  showingLimit = showing;
  payloadGlow.material.opacity = damp(payloadGlow.material.opacity, held ? 0.6 : 0, 9, dt);
  pedestalRing.material.opacity = damp(pedestalRing.material.opacity, onPedestal(block) ? 0.22 : 0.6, 5, dt);
  reachRing.material.opacity = damp(reachRing.material.opacity, atLimit ? 0.7 : showing ? 0.36 : 0.18, 6, dt);
  envelope.material.opacity = damp(envelope.material.opacity, showing || atLimit ? 0.42 : 0, 7, dt);

  readout();
  if (screen) {
    screen.draw(now, {
      j1: degText(wrap(angles.yaw)), j2: degText(angles.a1),
      j3: degText(angles.a2), j4: degText(angles.a3),
      claw: held ? "HOLDING" : wantShut ? "CLOSING" : "OPEN",
      state
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
}

function degText(rad) {
  const v = (rad * 180) / Math.PI;
  return (v < 0 ? "-" : "+") + Math.abs(v).toFixed(1).padStart(5, "0");
}

function deg(el, rad) {
  if (!el) return;
  const v = (rad * 180) / Math.PI;
  el.textContent = (v < 0 ? "-" : "+") + Math.abs(v).toFixed(1).padStart(5, "0");
}
