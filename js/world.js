/* The island you explore.

   Drag to orbit, wheel or pinch to zoom, click a landmark to fly to it. Each
   landmark opens the matching section of the page as a panel, so every word on
   the site is still ordinary HTML. At the workbench the arm is live again: drag
   the block and it carries it back to the pedestal. Framed scans open full size. */

import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { createBench } from "./bench.js";
import { buildIsland, GROUND } from "./island.js";
import { loadEnvironment, makeComposer } from "./realism.js";

const canvas = document.getElementById("world");
const labelEl = document.getElementById("place-label");
const bar = document.getElementById("panel-bar");
const viewer = document.getElementById("viewer");

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const coarse = window.matchMedia("(pointer: coarse)").matches;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const damp = (k, dt) => 1 - Math.exp(-k * dt);

let renderer, scene, camera, bench, island, key, composer;

/* ------------------------------------------------------------------- boot */

function boot() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: !coarse, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.4;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070d0c);
  scene.fog = new THREE.Fog(0x070d0c, 60, 150);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.22;
  pmrem.dispose();
  loadEnvironment(renderer, scene);

  camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);

  lights();

  bench = createBench({ scene, camera, reduceMotion, readout: {
    j1: document.getElementById("j1"), j2: document.getElementById("j2"),
    j3: document.getElementById("j3"), j4: document.getElementById("j4"),
    claw: document.getElementById("claw"), mode: document.getElementById("mode"),
    height: document.getElementById("hgt")
  } });
  island = buildIsland(scene, { reduceMotion });
  bindRig();
  /* ?debug exposes the block's screen position, for the headless interaction tests */
  if (new URLSearchParams(location.search).has("debug")) {
    window.__blockScreen = () => {
      const v = bench.block().project(camera);
      return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight, world: bench.block().toArray() };
    };
    window.__world = { scene, camera, renderer, island, bench, get composer() { return composer; }, setPost: (on) => { if (!on) composer = null; } };
  }

  renderer.setSize(window.innerWidth, window.innerHeight, false);
  try { composer = makeComposer(renderer, scene, camera, { coarse }); } catch (err) { console.warn(err); composer = null; }
  resize();
  window.addEventListener("resize", resize, { passive: true });
  bindPointer();
  bindPanels();
  bindCloseup();
  snapCamera();
  requestAnimationFrame(frame);
}

function lights() {
  scene.add(new THREE.HemisphereLight(0xb8d0c4, 0x141c18, 0.9));

  key = new THREE.DirectionalLight(0xfff0d8, 3.4);
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
let closeup = -1;            // the hardware model in close-up at the skills lab, or -1
let orbitNudge = 0;          // how far the reader has turned while at a place
let orbitTilt = 0;           // and how far they have looked up or down
let zoomNudge = 1;
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

  /* at the skills lab the camera can slide along the cabinet, model by model */
  const p = closeup >= 0 ? island.hardwareStops()[closeup] : current;
  const dir = p.dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), orbitNudge);
  const dist = p.dist * (narrow ? 1.25 : 1) * zoomNudge;
  wantTarget.copy(p.focus);
  wantEye.copy(p.focus).addScaledVector(dir, dist);
  wantEye.y += p.lift + 1.6 + orbitTilt * dist;

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
  if (best === frameHit) return { kind: "frame", data: frameHit.object.userData, object: frameHit.object };
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
      /* at the workbench the view goes all the way round and over the arm,
         because turning the view is what turns the plane the block is dragged in */
      const free = current.key === "bench";
      orbitNudge = free ? orbitNudge - dx * 0.005 : clamp(orbitNudge - dx * 0.004, -0.9, 0.9);
      orbitTilt = clamp(orbitTilt + dy * 0.003, free ? -0.25 : -0.12, free ? 0.9 : 0.3);
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
      if (hit?.kind === "frame") {
        /* the gallery is every frame hung on the same wall */
        const wall = island.frames.filter((f) => f.parent === hit.object.parent).map((f) => f.userData);
        openViewer(hit.data, wall);
      }
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
    else zoomNudge = clamp(zoomNudge * (1 + Math.sign(e.deltaY) * 0.07), 0.55, 1.6);
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
  closeup = -1;
  orbitNudge = 0;
  orbitTilt = 0;
  zoomNudge = 1;
  island.visit(place.key);
  document.body.classList.add("is-exploring", "is-focused");
  document.body.dataset.place = place.key;

  document.querySelectorAll("[data-panel]").forEach((el) => el.classList.remove("is-open"));
  const panel = document.querySelector(place.panel);
  if (panel) {
    panel.classList.add("is-open");
    const anchor = place.anchor && document.querySelector(place.anchor);
    panel.scrollTop = anchor ? anchorTop(panel, anchor) : 0;
  }
  bar.hidden = false;
  document.querySelectorAll("[data-place]").forEach((a) => {
    if (a.dataset.place === place.key) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  const hash = (place.anchor || place.panel);
  if (location.hash !== hash) history[replace ? "replaceState" : "pushState"](null, "", hash);
  if (labelEl) labelEl.textContent = place.label;
  renderCloseup();
}

function leave() {
  current = null;
  closeup = -1;
  document.body.classList.remove("is-focused");
  delete document.body.dataset.place;
  document.querySelectorAll("[data-panel]").forEach((el) => el.classList.remove("is-open"));
  document.querySelectorAll("[data-place]").forEach((a) => a.removeAttribute("aria-current"));
  bar.hidden = true;
  if (location.hash) history.pushState(null, "", location.pathname);
  if (labelEl) labelEl.textContent = "";
  renderCloseup();
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
    if (owner) { go(owner.key, { replace: true }); panel.scrollTop = anchorTop(panel, el); }
  }
}

/* scroll so an entry starts where the panel's content starts, below the fixed masthead */
function anchorTop(panel, el) {
  return Math.max(0, el.offsetTop - parseFloat(getComputedStyle(panel).paddingTop) + 8);
}

/* --------------------------------------------------------------- close-up */

/* At the skills lab the camera can leave the view of the whole cabinet and slide
   from board to board along its shelves: buttons, arrow keys, Escape to back out. */

function setCloseup(i) {
  const stops = island.hardwareStops();
  if (i < 0 || !current || current.key !== "skills" || !stops.length) closeup = -1;
  else {
    closeup = (i + stops.length) % stops.length;
    island.showHardware(closeup);
  }
  orbitNudge = 0;
  orbitTilt = 0;
  zoomNudge = 1;
  renderCloseup();
}

function renderCloseup() {
  const box = document.getElementById("closeup");
  if (!box || !island) return;
  const stops = island.hardwareStops();
  const on = closeup >= 0;
  document.body.classList.toggle("is-closeup", on);
  document.getElementById("closeup-enter").hidden = on;
  ["closeup-prev", "closeup-next", "closeup-exit"].forEach((id) => { document.getElementById(id).hidden = !on; });
  document.getElementById("closeup-label").textContent = on ? stops[closeup].label : "Hardware cabinet";
  document.getElementById("closeup-count").textContent = on ? `${closeup + 1} / ${stops.length}` : `${stops.length} boards and sensors`;
}

function bindCloseup() {
  if (!document.getElementById("closeup")) return;
  document.getElementById("closeup-enter").addEventListener("click", () => setCloseup(0));
  document.getElementById("closeup-prev").addEventListener("click", () => setCloseup(closeup - 1));
  document.getElementById("closeup-next").addEventListener("click", () => setCloseup(closeup + 1));
  document.getElementById("closeup-exit").addEventListener("click", () => setCloseup(-1));
  renderCloseup();
}

/* ----------------------------------------------------------------- viewer */

/* One viewer for every picture and clip on the site. It always opens on a
   gallery, the wall or evidence strip the item belongs to, and moves through it
   by swipe, arrow keys, the side buttons or the thumbnail strip. */

const gallery = { list: [], i: 0 };

function openViewer(item, list = [item]) {
  if (!viewer) { window.open(item.full, "_blank", "noopener"); return; }
  gallery.list = list.length ? list : [item];
  gallery.i = Math.max(0, gallery.list.findIndex((x) => x.full === item.full));
  buildThumbs();
  showSlide(0);
  if (!viewer.open) viewer.showModal();
}

function showSlide(dir) {
  const { list, i } = gallery;
  const it = list[i];
  const img = document.getElementById("viewer-img");
  const video = document.getElementById("viewer-video");
  const shown = it.video ? video : img;
  video.pause();
  img.hidden = !!it.video;
  video.hidden = !it.video;
  shown.classList.remove("from-left", "from-right");
  void shown.offsetWidth;
  if (dir) shown.classList.add(dir > 0 ? "from-right" : "from-left");
  if (it.video) {
    video.poster = it.src || "";
    video.src = it.full;
  } else {
    img.src = it.full;
    img.alt = it.alt || "";
  }
  document.getElementById("viewer-cap").textContent = it.alt || "";
  document.getElementById("viewer-count").textContent = list.length > 1 ? `${i + 1} / ${list.length}` : "";
  viewer.classList.toggle("is-single", list.length < 2);
  document.querySelectorAll("#viewer-thumbs button").forEach((b, k) => {
    b.setAttribute("aria-current", k === i ? "true" : "false");
    if (k === i) b.scrollIntoView({ block: "nearest", inline: "center" });
  });
  /* warm the neighbours so a swipe never waits */
  [i - 1, i + 1].forEach((k) => { const n = list[(k + list.length) % list.length]; if (n && !n.video) new Image().src = n.full; });
}

function stepSlide(by) {
  const n = gallery.list.length;
  if (n < 2) return;
  gallery.i = (gallery.i + by + n) % n;
  showSlide(by);
}

function buildThumbs() {
  const strip = document.getElementById("viewer-thumbs");
  strip.replaceChildren(...gallery.list.map((it, k) => {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("aria-label", it.alt || `Picture ${k + 1}`);
    if (it.video) b.classList.add("is-video");
    const t = document.createElement("img");
    t.src = it.src || it.full;
    t.alt = "";
    t.loading = "lazy";
    b.append(t);
    b.addEventListener("click", () => { const by = k - gallery.i; gallery.i = k; showSlide(by); });
    return b;
  }));
}

function bindViewer() {
  if (!viewer) return;
  document.getElementById("viewer-prev").addEventListener("click", () => stepSlide(-1));
  document.getElementById("viewer-next").addEventListener("click", () => stepSlide(1));
  viewer.addEventListener("keydown", (e) => {
    if (e.target.closest?.("video")) return; /* arrows seek inside a focused clip */
    if (e.key === "ArrowRight") { e.preventDefault(); stepSlide(1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); stepSlide(-1); }
  });
  /* a click on the dimmed backdrop closes */
  viewer.addEventListener("click", (e) => { if (e.target === viewer) viewer.close(); });
  viewer.addEventListener("close", () => document.getElementById("viewer-video").pause());

  const stage = document.getElementById("viewer-stage");
  let sx = 0, sy = 0, id = null;
  /* a drag that starts on a clip is scrubbing its timeline, not a swipe */
  stage.addEventListener("pointerdown", (e) => { if (e.target.closest("video")) return; id = e.pointerId; sx = e.clientX; sy = e.clientY; });
  stage.addEventListener("pointerup", (e) => {
    if (e.pointerId !== id) return;
    id = null;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) stepSlide(dx < 0 ? 1 : -1);
  });
  stage.addEventListener("pointercancel", () => { id = null; });
}

/* ------------------------------------------------------------ arm tuning */

function bindRig() {
  const form = document.getElementById("rig");
  if (!form) return;
  const keys = ["base", "l1", "l2", "claw"];
  const start = bench.getDims();
  if (!coarse && window.innerWidth >= 992) form.open = true;

  const show = (s) => {
    keys.forEach((k) => {
      const input = document.getElementById("rig-" + k);
      input.value = (s.dims[k] * 10).toFixed(1);
      input.nextElementSibling.textContent = (s.dims[k] * 10).toFixed(1) + " cm";
    });
    document.getElementById("rig-reach").textContent = s.reachCm.toFixed(1) + " cm";
    document.getElementById("rig-top").textContent = s.heightCm.toFixed(1) + " cm";
    document.getElementById("rig-area").textContent = Math.round(s.areaCm2).toLocaleString("en-IN") + " cm²";
    document.getElementById("rig-volume").textContent = s.litres.toFixed(1) + " L";
  };

  keys.forEach((k) => {
    const input = document.getElementById("rig-" + k);
    const [lo, hi] = bench.LIMITS[k];
    input.min = (lo * 10).toFixed(1);
    input.max = (hi * 10).toFixed(1);
    input.step = "0.1";
    input.addEventListener("input", () => show(bench.setDims({ [k]: +input.value / 10 })));
  });
  document.getElementById("rig-reset").addEventListener("click", () => show(bench.setDims(start)));
  show(bench.stats());
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

  /* scans inside the panels open in the same viewer, as a gallery of their strip */
  const asItem = (a) => {
    const img = a.querySelector("img");
    return { full: a.getAttribute("href"), src: img ? img.getAttribute("src") : "", alt: img ? img.alt : "", video: a.hasAttribute("data-video") };
  };
  document.querySelectorAll(".evidence a, .wall a").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const group = a.closest(".evidence, .wall");
      const list = group ? [...group.querySelectorAll("a")].filter((x) => x.querySelector("img")).map(asItem) : [];
      openViewer(asItem(a), list);
    });
  });
  bindViewer();

  window.addEventListener("keydown", (e) => {
    if (viewer?.open) return;
    /* in close-up the arrows move along the shelves and Escape backs out to the cabinet */
    if (closeup >= 0 && ["Escape", "ArrowLeft", "ArrowRight"].includes(e.key)) {
      setCloseup(e.key === "Escape" ? -1 : closeup + (e.key === "ArrowRight" ? 1 : -1));
      return;
    }
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
  if (composer) composer.render(); else renderer.render(scene, camera);
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  if (composer) composer.setSize(w, h);
  camera.aspect = w / h;
  camera.fov = clamp(42 + (1.3 - w / h) * 14, 42, 62);
  camera.updateProjectionMatrix();
}

function fail(err) {
  document.body.classList.add("no-world");
  console.error(err);
}

try { boot(); } catch (err) { fail(err); }
