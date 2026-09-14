/* The island you explore.

   Drag to orbit, wheel or pinch to zoom, click a landmark to fly to it. Each
   landmark opens the matching section of the page as a panel, so every word on
   the site is still ordinary HTML. At the workbench the arm is live again: drag
   the block and it carries it back to the pedestal. Framed scans open full size. */

import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { createBench } from "./bench.js";
import { buildIsland, GROUND } from "./island.js";

const canvas = document.getElementById("world");
const labelEl = document.getElementById("place-label");
const bar = document.getElementById("panel-bar");
const viewer = document.getElementById("viewer");

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const coarse = window.matchMedia("(pointer: coarse)").matches;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const damp = (k, dt) => 1 - Math.exp(-k * dt);

let renderer, scene, camera, bench, island, key;

/* ------------------------------------------------------------------- boot */

function boot() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: !coarse, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070d0c);
  scene.fog = new THREE.Fog(0x070d0c, 60, 150);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.22;
  pmrem.dispose();

  camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);

  lights();

  bench = createBench({ scene, camera, reduceMotion, readout: {
    j1: document.getElementById("j1"), j2: document.getElementById("j2"),
    j3: document.getElementById("j3"), j4: document.getElementById("j4"),
    claw: document.getElementById("claw"), mode: document.getElementById("mode")
  } });
  island = buildIsland(scene, { reduceMotion });

  resize();
  window.addEventListener("resize", resize, { passive: true });
  bindPointer();
  bindPanels();
  snapCamera();
  requestAnimationFrame(frame);
}

function lights() {
  scene.add(new THREE.HemisphereLight(0x9fbcae, 0x0a1210, 0.55));

  key = new THREE.DirectionalLight(0xfff0d8, 2.6);
  key.position.set(22, 34, 18);
  key.castShadow = true;
  const size = coarse ? 1024 : 2048;
  key.shadow.mapSize.set(size, size);
  Object.assign(key.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 5, far: 90 });
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.04;
  scene.add(key);

  const moon = new THREE.DirectionalLight(0x7fb0c4, 0.7);
  moon.position.set(-30, 18, -24);
  scene.add(moon);
}

/* ----------------------------------------------------------------- camera */

const ISLAND = new THREE.Vector3(0, GROUND + 1.5, 0);
const view = { theta: 0.75, phi: 1.02, radius: 52 };
const aim = { theta: 0.75, phi: 1.02, radius: 52 };

const eye = new THREE.Vector3();
const target = new THREE.Vector3();
const wantEye = new THREE.Vector3();
const wantTarget = new THREE.Vector3();

let current = null;          // the place in focus, or null for the overview
let orbitNudge = 0;          // how far the reader has turned while at a place
let lastInput = 0;

function desired() {
  const narrow = window.innerWidth < 992;

  if (!current) {
    wantTarget.copy(ISLAND);
    wantEye.set(
      Math.sin(view.phi) * Math.cos(view.theta),
      Math.cos(view.phi),
      Math.sin(view.phi) * Math.sin(view.theta)
    ).multiplyScalar(view.radius).add(ISLAND);
    return;
  }

  const p = current;
  const dir = p.dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), orbitNudge);
  const dist = p.dist * (narrow ? 1.25 : 1);
  wantTarget.copy(p.focus);
  wantEye.copy(p.focus).addScaledVector(dir, dist);
  wantEye.y += p.lift + 1.6;

  /* move the camera sideways so the landmark sits clear of the open panel */
  const forward = wantTarget.clone().sub(wantEye).normalize();
  const right = forward.clone().cross(new THREE.Vector3(0, 1, 0)).normalize();
  if (narrow) {
    wantEye.y -= dist * 0.2;
    wantTarget.y -= dist * 0.2;
  } else {
    wantEye.addScaledVector(right, dist * 0.3);
    wantTarget.addScaledVector(right, dist * 0.3);
  }
}

function snapCamera() {
  desired();
  eye.copy(wantEye);
  target.copy(wantTarget);
  camera.position.copy(eye);
  camera.lookAt(target);
}

function moveCamera(dt, t) {
  view.theta += (aim.theta - view.theta) * damp(6, dt);
  view.phi += (aim.phi - view.phi) * damp(6, dt);
  view.radius += (aim.radius - view.radius) * damp(5, dt);

  if (!current && !reduceMotion && t - lastInput > 4) aim.theta += dt * 0.04;

  desired();
  const k = damp(current ? 2.6 : 3.2, dt);
  eye.lerp(wantEye, k);
  target.lerp(wantTarget, k);
  camera.position.copy(eye);
  camera.lookAt(target);
}

/* ---------------------------------------------------------------- pointer */

const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let down = null;

function toNdc(e) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, 1 - ((e.clientY - r.top) / r.height) * 2);
  return ndc;
}

function pick(e) {
  ray.setFromCamera(toNdc(e), camera);
  const frameHit = ray.intersectObjects(island.frames, false)[0];
  const placeMeshes = island.places.flatMap((p) => p.hits);
  const placeHit = ray.intersectObjects(placeMeshes, false)[0];
  const skillHit = ray.intersectObjects(island.skillItems.map((i) => i.holder), true)[0];
  const best = [frameHit, skillHit, placeHit].filter(Boolean).sort((a, b) => a.distance - b.distance)[0];
  if (!best) return null;
  if (best === frameHit) return { kind: "frame", data: frameHit.object.userData };
  if (best === skillHit) {
    let o = skillHit.object;
    while (o && !o.userData.skill) o = o.parent;
    return o ? { kind: "skill", data: o.userData.skill } : null;
  }
  return { kind: "place", data: island.places.find((p) => p.key === placeHit.object.userData.place) };
}

function bindPointer() {
  canvas.style.touchAction = "none";
  const pointers = new Map();
  let pinch = 0;

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    lastInput = performance.now() / 1000;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = Math.hypot(a.x - b.x, a.y - b.y);
      down = null;
      return;
    }
    down = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, travel: 0, grab: "none" };
    if (current && current.key === "bench") {
      toNdc(e);
      down.grab = bench.pointerDown(ndc.x, ndc.y);
    }
  });

  canvas.addEventListener("pointermove", (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) aim.radius = clamp(aim.radius * (pinch / d), 24, 80);
      pinch = d;
      return;
    }

    if (!down) {
      if (coarse) return;
      const hit = pick(e);
      canvas.style.cursor = hit ? "pointer" : "grab";
      showLabel(hit);
      return;
    }

    const dx = e.clientX - down.lx, dy = e.clientY - down.ly;
    down.lx = e.clientX; down.ly = e.clientY;
    down.travel += Math.abs(dx) + Math.abs(dy);
    lastInput = performance.now() / 1000;

    if (down.grab !== "none") {
      toNdc(e);
      bench.pointerMove(ndc.x, ndc.y, Math.abs(dx) + Math.abs(dy));
      return;
    }
    if (current) {
      orbitNudge = clamp(orbitNudge - dx * 0.004, -0.9, 0.9);
    } else {
      aim.theta -= dx * 0.005;
      aim.phi = clamp(aim.phi - dy * 0.004, 0.45, 1.38);
    }
    canvas.style.cursor = "grabbing";
  });

  const up = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = 0;
    if (!down) return;
    const tap = down.travel < 8;
    if (down.grab !== "none") {
      toNdc(e);
      bench.pointerUp(ndc.x, ndc.y);
    } else if (tap) {
      const hit = pick(e);
      if (hit?.kind === "frame") openViewer(hit.data);
      else if (hit?.kind === "skill") { go("skills"); showLabel(hit); }
      else if (hit?.kind === "place") go(hit.data.key);
      else if (current?.key === "bench") { toNdc(e); bench.pointerDown(ndc.x, ndc.y); bench.pointerUp(ndc.x, ndc.y); }
    }
    down = null;
    canvas.style.cursor = coarse ? "" : "grab";
  };
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    lastInput = performance.now() / 1000;
    if (!current) aim.radius = clamp(aim.radius * (1 + Math.sign(e.deltaY) * 0.08), 24, 80);
  }, { passive: false });
}

function showLabel(hit) {
  if (!labelEl) return;
  if (!hit) { labelEl.textContent = ""; return; }
  labelEl.textContent = hit.kind === "place" ? hit.data.label
    : hit.kind === "skill" ? hit.data.label
    : hit.data.alt + " — open full size";
}

/* ----------------------------------------------------------------- panels */

const order = () => island.places;

function go(keyName, { replace = false } = {}) {
  const place = island.places.find((p) => p.key === keyName);
  if (!place) return;
  current = place;
  orbitNudge = 0;
  document.body.classList.add("is-exploring", "is-focused");
  document.body.dataset.place = place.key;

  document.querySelectorAll("[data-panel]").forEach((el) => el.classList.remove("is-open"));
  const panel = document.querySelector(place.panel);
  if (panel) {
    panel.classList.add("is-open");
    const anchor = place.anchor && document.querySelector(place.anchor);
    panel.scrollTop = anchor ? anchor.offsetTop - 16 : 0;
  }
  bar.hidden = false;
  document.querySelectorAll("[data-place]").forEach((a) => {
    if (a.dataset.place === place.key) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  const hash = (place.anchor || place.panel);
  if (location.hash !== hash) history[replace ? "replaceState" : "pushState"](null, "", hash);
  if (labelEl) labelEl.textContent = place.label;
}

function leave() {
  current = null;
  document.body.classList.remove("is-focused");
  delete document.body.dataset.place;
  document.querySelectorAll("[data-panel]").forEach((el) => el.classList.remove("is-open"));
  document.querySelectorAll("[data-place]").forEach((a) => a.removeAttribute("aria-current"));
  bar.hidden = true;
  if (location.hash) history.pushState(null, "", location.pathname);
  if (labelEl) labelEl.textContent = "";
}

function step(by) {
  const list = order();
  const i = current ? list.indexOf(current) : -1;
  go(list[(i + by + list.length) % list.length].key);
}

function fromHash() {
  const h = location.hash;
  if (!h || h === "#top" || h === "#bench") { if (current) leave(); return; }
  const place = island.places.find((p) => p.anchor === h) || island.places.find((p) => p.panel === h);
  if (place) go(place.key, { replace: true });
  else {
    /* a deep link into a section that is part of a panel */
    const el = document.querySelector(h);
    const panel = el && el.closest("[data-panel]");
    const owner = panel && island.places.find((p) => p.panel === "#" + panel.id);
    if (owner) { go(owner.key, { replace: true }); panel.scrollTop = el.offsetTop - 16; }
  }
}

function openViewer({ full, alt }) {
  if (!viewer) { window.open(full, "_blank", "noopener"); return; }
  document.getElementById("viewer-img").src = full;
  document.getElementById("viewer-img").alt = alt;
  document.getElementById("viewer-cap").textContent = alt;
  viewer.showModal();
}

function bindPanels() {
  document.querySelectorAll("[data-place]").forEach((a) => {
    a.addEventListener("click", (e) => { e.preventDefault(); go(a.dataset.place); });
  });
  document.getElementById("explore")?.addEventListener("click", () => {
    document.body.classList.add("is-exploring");
    lastInput = performance.now() / 1000;
  });
  document.getElementById("panel-close").addEventListener("click", leave);
  document.getElementById("panel-prev").addEventListener("click", () => step(-1));
  document.getElementById("panel-next").addEventListener("click", () => step(1));
  document.querySelector(".wordmark")?.addEventListener("click", (e) => {
    e.preventDefault();
    leave();
    document.body.classList.remove("is-exploring");
  });

  /* scans inside the panels open in the same viewer rather than a new tab */
  document.querySelectorAll(".evidence a, .wall a").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const img = a.querySelector("img");
      openViewer({ full: a.getAttribute("href"), alt: img ? img.alt : "" });
    });
  });

  window.addEventListener("keydown", (e) => {
    if (viewer?.open) return;
    if (e.key === "Escape" && current) leave();
    if (e.key === "ArrowRight" && current) step(1);
    if (e.key === "ArrowLeft" && current) step(-1);
  });
  window.addEventListener("popstate", fromHash);
  fromHash();
}

/* ------------------------------------------------------------------- loop */

let prev = performance.now();

function frame(nowMs) {
  requestAnimationFrame(frame);
  const raw = (nowMs - prev) / 1000;
  prev = nowMs;
  if (document.hidden) return;
  const dt = Math.min(raw, 0.05);
  const t = nowMs / 1000;

  moveCamera(Math.min(raw, 0.25), t);
  bench.update(nowMs, dt);
  island.update(dt, t);
  renderer.render(scene, camera);
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = clamp(42 + (1.3 - w / h) * 14, 42, 62);
  camera.updateProjectionMatrix();
}

function fail(err) {
  document.body.classList.add("no-world");
  console.error(err);
}

try { boot(); } catch (err) { fail(err); }
