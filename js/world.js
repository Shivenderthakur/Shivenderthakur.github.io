/* One workshop behind the whole page.

   The canvas is fixed to the viewport and the page scrolls over it. Each section
   of the writing is anchored to a station on the bench, and scrolling dollies the
   camera from one to the next: the arm, the serial link, the three project rigs,
   the boards, and finally a long shot down the whole bench. */

import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { createBench, AMBER } from "./bench.js";
import { makeStations } from "./stations.js";

const canvas = document.getElementById("world");
const stage = document.getElementById("stage-catch");
const grabButton = document.getElementById("world-grab");
const hint = document.getElementById("world-hint");

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const coarse = window.matchMedia("(pointer: coarse)").matches;

const BENCH_FROM = 5.2;
const BENCH_TO = -41.5;
const BENCH_Z = -0.15;
const BENCH_D = 5.0;
const FLOOR_Y = -2.55;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const smooth = (t) => t * t * (3 - 2 * t);

let renderer, scene, camera, bench, stations;

/* Where the camera sits for each anchored section. The target is set left of the
   subject so the rig lands in the right half, clear of the writing. */
const SHOTS = [
  { sel: "#bench",      target: [-1.3, 0.86, 0.1],  offset: [3.0, 1.5, 5.3] },
  { sel: "#about",      target: [-9.7, 0.95, 0],    offset: [2.2, 1.0, 4.1] },
  { sel: "#work-face",  target: [-16.9, 1.05, 0],   offset: [2.2, 0.9, 4.0] },
  { sel: "#work-hand",  target: [-23.9, 1.0, 0],    offset: [2.2, 0.9, 4.0] },
  { sel: "#work-trace", target: [-30.9, 1.15, 0],   offset: [2.2, 0.9, 4.0] },
  { sel: "#stack",      target: [-38.5, 0.9, 0],    offset: [2.2, 1.1, 4.4] },
  { sel: "#contact",    target: [-19.0, 1.2, 0],    offset: [1.0, 7.6, 19.0] }
];

function fail(err) {
  document.body.classList.add("no-world");
  console.error(err);
}

function boot() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: !coarse, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070d0c);
  scene.fog = new THREE.Fog(0x070d0c, 11, 30);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.22;
  pmrem.dispose();

  camera = new THREE.PerspectiveCamera(42, 1, 0.1, 90);

  buildRoom();
  buildLights();

  bench = createBench({ scene, camera, reduceMotion, readout: {
    j1: document.getElementById("j1"),
    j2: document.getElementById("j2"),
    j3: document.getElementById("j3"),
    j4: document.getElementById("j4"),
    claw: document.getElementById("claw"),
    mode: document.getElementById("mode")
  } });

  stations = makeStations(scene);

  measure();
  resize();
  window.addEventListener("resize", () => { resize(); measure(); }, { passive: true });

  /* The page is still settling when this runs: web fonts land late and move
     every anchor, so measure again once the layout stops changing. */
  window.addEventListener("load", measure, { once: true });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
  if (typeof ResizeObserver === "function") {
    let last = 0;
    new ResizeObserver(() => {
      const h = document.body.scrollHeight;
      if (Math.abs(h - last) > 2) { last = h; measure(); }
    }).observe(document.body);
  }
  window.addEventListener("scroll", () => { scrolled = true; }, { passive: true });

  if (coarse) setUpTouchControl();
  bindStage();
  placeCamera(0, true);
  requestAnimationFrame(frame);
}

/* ------------------------------------------------------------------ room */

function buildRoom() {
  const len = BENCH_FROM - BENCH_TO;
  const mid = (BENCH_FROM + BENCH_TO) / 2;

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(len + 26, 34),
    new THREE.MeshStandardMaterial({ color: 0x0c1513, roughness: 0.74, metalness: 0.2 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(mid, FLOOR_Y, 0);
  floor.receiveShadow = true;
  scene.add(floor);

  const grid = new THREE.GridHelper(64, 64, 0x2a423c, 0x182622);
  grid.position.set(mid, FLOOR_Y + 0.002, 0);
  grid.material.transparent = true;
  grid.material.opacity = 0.4;
  scene.add(grid);

  const back = new THREE.Mesh(
    new THREE.PlaneGeometry(len + 26, 14),
    new THREE.MeshStandardMaterial({ color: 0x111c19, roughness: 0.95 })
  );
  back.position.set(mid, 4.4, -8.5);
  scene.add(back);

  /* the bench itself, one slab the whole page runs along */
  const wood = new THREE.MeshStandardMaterial({ color: 0x3a3831, roughness: 0.78, metalness: 0.06 });
  const under = new THREE.MeshStandardMaterial({ color: 0x23231e, roughness: 0.92 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x66716b, roughness: 0.42, metalness: 0.72 });

  const top = new THREE.Mesh(new THREE.BoxGeometry(len, 0.16, BENCH_D), wood);
  top.position.set(mid, -0.08, BENCH_Z);
  top.castShadow = top.receiveShadow = true;
  scene.add(top);

  const apron = new THREE.Mesh(new THREE.BoxGeometry(len - 0.5, 0.24, BENCH_D - 0.5), under);
  apron.position.set(mid, -0.28, BENCH_Z);
  scene.add(apron);

  for (let x = BENCH_FROM - 1.4; x > BENCH_TO; x -= 7.4) {
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.35, 0.18), steel);
      leg.position.set(x, -1.36, BENCH_Z + sz * (BENCH_D / 2 - 0.35));
      leg.castShadow = true;
      scene.add(leg);
    }
    const brace = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, BENCH_D - 0.7), steel);
    brace.position.set(x, -2.1, BENCH_Z);
    scene.add(brace);
  }

  /* a run of shop lights over the bench, which is also where the key light comes from */
  for (let x = BENCH_FROM - 3; x > BENCH_TO; x -= 9.2) {
    const housing = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.16, 0.32),
      new THREE.MeshStandardMaterial({ color: 0x1d2c28, roughness: 0.6, metalness: 0.5 }));
    housing.position.set(x, 3.72, BENCH_Z - 0.6);
    scene.add(housing);

    const tube = new THREE.Mesh(new THREE.BoxGeometry(4.3, 0.08, 0.18),
      new THREE.MeshBasicMaterial({ color: 0xffeccb }));
    tube.position.set(x, 3.62, BENCH_Z - 0.6);
    scene.add(tube);

    for (const dx of [-1.9, 1.9]) {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 2.6, 8),
        new THREE.MeshStandardMaterial({ color: 0x2a3a35, roughness: 0.5, metalness: 0.7 }));
      rod.position.set(x + dx, 5.05, BENCH_Z - 0.6);
      scene.add(rod);
    }
  }
}

let key;

function buildLights() {
  scene.add(new THREE.HemisphereLight(0x8ea79b, 0x05100d, 0.34));

  key = new THREE.DirectionalLight(0xfff2dc, 3.0);
  key.castShadow = true;
  key.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 20;
  key.shadow.camera.left = -6;
  key.shadow.camera.right = 6;
  key.shadow.camera.top = 6;
  key.shadow.camera.bottom = -6;
  key.shadow.bias = -0.0009;
  key.shadow.normalBias = 0.022;
  scene.add(key);
  scene.add(key.target);

  const fill = new THREE.DirectionalLight(0x7fc4b4, 0.6);
  fill.position.set(-4, 3, -3);
  scene.add(fill);
}

/* ------------------------------------------------------------ scroll path */

const anchors = [];
const target = new THREE.Vector3();
const eye = new THREE.Vector3();
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();

function measure() {
  anchors.length = 0;
  for (const shot of SHOTS) {
    const el = document.querySelector(shot.sel);
    if (!el) continue;
    const box = el.getBoundingClientRect();
    const mid = box.top + window.scrollY + box.height / 2;
    anchors.push({
      at: Math.max(0, mid - window.innerHeight / 2),
      target: new THREE.Vector3(...shot.target),
      offset: new THREE.Vector3(...shot.offset)
    });
  }
  anchors.sort((a, b) => a.at - b.at);
  if (anchors.length) anchors[0].at = 0;
}

/* which station the camera is nearest, as a fractional index */
function station() {
  const y = window.scrollY;
  if (anchors.length < 2) return 0;
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    if (y <= b.at) {
      const span = Math.max(b.at - a.at, 1);
      return i + clamp((y - a.at) / span, 0, 1);
    }
  }
  return anchors.length - 1;
}

function placeCamera(dt, snap) {
  const f = station();
  const i = Math.floor(f);
  const a = anchors[Math.min(i, anchors.length - 1)];
  const b = anchors[Math.min(i + 1, anchors.length - 1)];
  const k = smooth(f - i);

  tmpA.copy(a.target).lerp(b.target, k);
  tmpB.copy(a.offset).lerp(b.offset, k);

  const ease = snap ? 1 : 1 - Math.exp(-5 * dt);
  target.lerp(tmpA, ease);
  eye.lerp(tmpA.clone().add(tmpB), ease);

  camera.position.copy(eye);
  camera.lookAt(target);

  /* keep the shadow volume where the camera is looking */
  key.position.set(target.x + 2.4, 6.4, target.z + 3.4);
  key.target.position.copy(target);
  key.target.updateMatrixWorld();
}

/* ---------------------------------------------------------------- pointer */

let dragging = false;
let lastX = 0;
let lastY = 0;

const ndcOf = (e) => [
  (e.clientX / window.innerWidth) * 2 - 1,
  1 - (e.clientY / window.innerHeight) * 2
];

function bindStage() {
  if (!stage) return;

  stage.addEventListener("pointerdown", (e) => {
    stage.setPointerCapture(e.pointerId);
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    const [x, y] = ndcOf(e);
    const got = bench.pointerDown(x, y);
    stage.style.cursor = got === "none" ? "crosshair" : "grabbing";
  });

  stage.addEventListener("pointermove", (e) => {
    const [x, y] = ndcOf(e);
    if (dragging) {
      bench.pointerMove(x, y, Math.abs(e.clientX - lastX) + Math.abs(e.clientY - lastY));
      lastX = e.clientX;
      lastY = e.clientY;
    } else if (!coarse) {
      stage.style.cursor = bench.hoverAt(x, y) ? "grab" : "crosshair";
    }
  });

  const release = (e) => {
    if (!dragging) return;
    dragging = false;
    const [x, y] = ndcOf(e);
    bench.pointerUp(x, y);
    if (!coarse) stage.style.cursor = "crosshair";
  };

  stage.addEventListener("pointerup", release);
  stage.addEventListener("pointercancel", release);
  if (!coarse) stage.style.cursor = "crosshair";
}

/* A vertical drag scrolls the page on a touch screen, so the stage only takes
   the gesture once the reader asks it to. */
function setUpTouchControl() {
  if (!grabButton) return;
  grabButton.hidden = false;

  const apply = (on) => {
    if (stage) stage.style.touchAction = on ? "none" : "pan-y";
    document.body.classList.toggle("is-controlling", on);
    grabButton.textContent = on ? "Release" : "Take control";
    grabButton.setAttribute("aria-pressed", String(on));
    if (hint) {
      hint.textContent = on
        ? "Drag the block anywhere the arm reaches, into the air included. Release to scroll again."
        : "Take control to move the block in three dimensions.";
    }
  };

  grabButton.addEventListener("click", () => apply(!document.body.classList.contains("is-controlling")));
  apply(false);
}

/* ------------------------------------------------------------------ loop */

let prev = performance.now();
let scrolled = true;

function frame(now) {
  requestAnimationFrame(frame);
  const raw = (now - prev) / 1000;
  const dt = Math.min(raw, 0.05);
  /* the camera eases on real elapsed time, so a slow device still keeps up
     with the scroll instead of trailing a station behind */
  const camDt = Math.min(raw, 0.5);
  prev = now;
  if (document.hidden) return;

  placeCamera(camDt, false);

  /* only the rigs near the camera are worth stepping */
  const near = target.x;
  if (Math.abs(near) < 20) bench.update(now, dt);
  for (const s of stations) {
    if (Math.abs(s.x - near) < 14) s.update(dt, now / 1000);
  }

  renderer.render(scene, camera);
  scrolled = false;
}

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  /* narrow screens need a wider lens or the rig falls out of the right half */
  camera.fov = clamp(42 + (1.4 - w / h) * 11, 42, 58);
  camera.updateProjectionMatrix();
}

/* Declarations are all in place, so open the workshop. */
try { boot(); } catch (err) { fail(err); }
