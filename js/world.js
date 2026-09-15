/* The campus you roam.

   You are the hacker. WASD or the arrow keys walk, Shift runs, dragging turns the
   camera, and on a phone a thumb stick walks. Walking into a building opens its
   part of the page as a panel; walking out closes it. The header still takes you
   straight to any building. Every word on the site stays ordinary HTML.

   Walking up to the workbench sits the hacker down at the desk, and from the chair
   the reader operates the arm: click a spot on the desk and the hacker points at
   it while the arm picks the block up and sets it down there, drag the block by
   hand, or type armctl commands into the console. Stand up, Escape or any walking
   key gets up again. Framed pictures open in the gallery viewer. At the skills lab
   the camera can leave the hacker and slide along the hardware cabinet.

   World units are metres. */

import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { createBench } from "./bench.js";
import { buildIsland, GROUND } from "./island.js";
import { loadEnvironment, makeComposer } from "./realism.js";
import { createPlayer, inRect } from "./player.js";
import { createHud } from "./hud.js";

const canvas = document.getElementById("world");
const labelEl = document.getElementById("place-label");
const bar = document.getElementById("panel-bar");
const viewer = document.getElementById("viewer");
const modeEl = document.getElementById("mode");

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const coarse = window.matchMedia("(pointer: coarse)").matches;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const damp = (k, dt) => 1 - Math.exp(-k * dt);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

let renderer, scene, camera, bench, island, player, hud, composer, sun, benchPlace;
let showRig = null;           // redraws the tuning panel; set by bindRig, called when armctl changes the arm

/* ------------------------------------------------------------------- boot */

function boot() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: !coarse, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x101c26);
  scene.fog = new THREE.Fog(0x1b2c38, 48, 140);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.22;
  pmrem.dispose();
  loadEnvironment(renderer, scene);

  /* near enough for a 2.4 cm block seen from a chair, far enough for the sky dome */
  camera = new THREE.PerspectiveCamera(50, 1, 0.02, 400);

  lights();
  sky();

  bench = createBench({
    scene, camera, reduceMotion, slides: projectSlides(),
    readout: {
      j1: document.getElementById("j1"), j2: document.getElementById("j2"),
      j3: document.getElementById("j3"), j4: document.getElementById("j4"),
      claw: document.getElementById("claw"), mode: modeEl,
      height: document.getElementById("hgt")
    },
    /* armctl set and reset change the arm from the console: the sliders follow */
    onStats: (s) => { if (showRig) showRig(s); },
    /* the arm reports when it has finished an order it was given */
    onLine: (text) => { if (hud) hud.print(text, "out"); }
  });
  island = buildIsland(scene, { reduceMotion });
  benchPlace = island.places.find((p) => p.key === "bench") || null;
  player = createPlayer({
    scene, ground: GROUND,
    colliders: island.colliders.concat(bench.colliders || []),
    heightAt: island.heightAt, start: island.start
  });
  hud = createHud({ places: island.places, coarse });
  cam.yaw = island.start.heading + Math.PI;
  bindRig();
  bindConsole();

  /* ?debug exposes the world for the owner's headless interaction tests */
  if (new URLSearchParams(location.search).has("debug")) {
    window.__blockScreen = () => {
      const v = bench.block().project(camera);
      return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight, world: bench.block().toArray() };
    };
    window.__world = { scene, camera, renderer, island, bench, player, hud, get composer() { return composer; } };
  }

  renderer.setSize(window.innerWidth, window.innerHeight, false);
  try { composer = makeComposer(renderer, scene, camera, { coarse }); } catch (err) { console.warn(err); composer = null; }
  resize();
  window.addEventListener("resize", resize, { passive: true });
  bindPointer();
  bindKeys();
  bindPanels();
  bindCloseup();
  syncSeat();
  snapCamera(0);
  requestAnimationFrame(frame);
}

/* the left monitor on the desk runs a slideshow of the project photographs the
   page already shows, the stills only, never the video posters */
function projectSlides() {
  return [...document.querySelectorAll("#work .evidence a, #research .evidence a")]
    .filter((a) => !a.hasAttribute("data-video"))
    .map((a) => a.querySelector("img"))
    .filter(Boolean)
    .map((img) => ({ src: img.getAttribute("src"), alt: img.alt }));
}

function lights() {
  /* dusk: a cool sky above, warm low sun, a blue fill from the other side */
  scene.add(new THREE.HemisphereLight(0x9ec4d8, 0x1a1512, 0.8));

  sun = new THREE.DirectionalLight(0xffc9a0, 2.6);
  sun.position.set(-26, 22, 20);
  sun.castShadow = true;
  const size = coarse ? 1024 : 2048;
  sun.shadow.mapSize.set(size, size);
  sun.shadow.camera.near = 5;
  sun.shadow.camera.far = 90;
  shadowSpan(30);
  scene.add(sun);

  const fill = new THREE.DirectionalLight(0x6fa8d0, 0.9);
  fill.position.set(28, 16, -24);
  scene.add(fill);
}

/* The sun's shadow map covers the whole campus while you walk, about 3 cm a texel.
   Seated, it closes in on the workbench at the origin, a few millimetres a texel,
   so the 23 cm arm and its block cast shadows that keep their shape. The normal
   offset follows the texel size, or small parts lose their shadow altogether.
   The depth bias is a distance along the sun's rays spread over the whole depth
   range of the shadow camera: 5 cm suits the campus, but at the desk it would
   swallow the shadow of anything shorter than about 3 cm (the resting block, the
   keyboard, the arm's base plate, a board), so seated it drops to 2 mm and the
   normal offset keeps the surfaces free of acne. */
function shadowSpan(half) {
  const c = sun.shadow.camera;
  if (c.right === half) return;
  Object.assign(c, { left: -half, right: half, top: half, bottom: -half });
  c.updateProjectionMatrix();
  sun.shadow.normalBias = ((2 * half) / sun.shadow.mapSize.x) * 1.4;
  sun.shadow.bias = -(half < 5 ? 0.002 : 0.051) / (c.far - c.near);
}

/* a gradient dome: deep slate overhead, a teal haze and a thin warm band at the horizon */
function sky() {
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(360, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x09121b) },
        haze: { value: new THREE.Color(0x24414f) },
        band: { value: new THREE.Color(0xc9774a) }
      },
      vertexShader: "varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `uniform vec3 top; uniform vec3 haze; uniform vec3 band; varying vec3 vDir;
        void main() {
          float h = vDir.y;
          vec3 c = mix(haze, top, smoothstep(0.02, 0.55, h));
          c = mix(c, band, exp(-abs(h - 0.015) * 38.0) * 0.55);
          c = mix(c, haze * 0.6, smoothstep(0.0, -0.3, h));
          gl_FragColor = vec4(c, 1.0);
        }`
    })
  );
  dome.renderOrder = -1;
  scene.add(dome);
}

/* ----------------------------------------------------------------- camera */

/* standing: a third-person camera for a 1.75 m body, looking at head height */
const STAND = { dist: 3.6, near: 1.8, far: 9, look: 1.5, pitch: 0.32 };
/* seated: over the right shoulder, framed on the desk between the monitors and
   the arm. yaw swings the eye to the operator's right, pitch lifts it, dist is
   from the framed point. Drag and pinch nudge these within the limits below. */
const SEAT_VIEW = { yaw: 0.28, pitch: 0.38, dist: 1.7, phoneYaw: 0.16, phonePitch: 0.55, width: 0.62 };
const SEAT_NUDGE = { yaw: 0.45, pitchLo: -0.22, pitchHi: 0.4, zoomLo: 0.7, zoomHi: 1.45 };

const cam = { yaw: 0, pitch: STAND.pitch, dist: STAND.dist, wantDist: STAND.dist };
const seatCam = { yaw: 0, pitch: 0, zoom: 1, wantZoom: 1 };
let mode = "intro";           // intro: the camera circles the hacker behind the intro card; play: you walk
let current = null;           // the place whose panel is open
let dismissed = null;         // a place closed or left by hand while standing in it, until you walk out
let closeup = -1;             // the hardware model in close-up at the skills lab, or -1
let lastDrag = -10;
let blendUntil = 0;           // until then the camera glides, after sitting down or getting up
let jumped = false;           // the hacker was just teleported; with reduced motion the camera cuts there

const eye = new THREE.Vector3();
const target = new THREE.Vector3();
const wantEye = new THREE.Vector3();
const wantTarget = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

const atDesk = () => player && ["approach", "sitting-down", "seated"].includes(player.state);
const seatView = () => player && (player.state === "sitting-down" || player.state === "seated");

/* move both ends of the view sideways along the camera's right, by k metres */
function shiftRight(k) {
  const r = wantTarget.clone().sub(wantEye).normalize().cross(UP).normalize();
  wantEye.addScaledVector(r, k);
  wantTarget.addScaledVector(r, k);
}

function desired(t) {
  const narrow = window.innerWidth < 992;

  if (closeup >= 0) {
    const p = island.hardwareStops()[closeup];
    const dist = p.dist * (narrow ? 1.25 : 1);
    wantTarget.copy(p.focus);
    wantEye.copy(p.focus).addScaledVector(p.dir, dist);
    wantEye.y += p.lift;
    if (narrow) { wantEye.y -= dist * 0.2; wantTarget.y -= dist * 0.2; }
    else shiftRight(dist * 0.3);
    return;
  }

  const head = player.position;
  if (mode === "intro") {
    const a = (reduceMotion ? 0 : t * 0.08) + island.start.heading + 0.5;
    wantTarget.set(head.x, head.y + 1.1, head.z);
    wantEye.set(head.x + Math.sin(a) * 4.5, head.y + 1.75, head.z + Math.cos(a) * 4.5);
    /* the intro card covers the left of a desktop screen, so the hacker stands right of centre */
    if (!narrow) shiftRight(-1.45);
    return;
  }

  if (seatView() && bench.seat) { seatedView(narrow); return; }

  const cp = Math.cos(cam.pitch);
  wantTarget.set(head.x, head.y + STAND.look, head.z);
  wantEye.set(
    wantTarget.x + Math.sin(cam.yaw) * cp * cam.dist,
    wantTarget.y + Math.sin(cam.pitch) * cam.dist,
    wantTarget.z + Math.cos(cam.yaw) * cp * cam.dist
  );
  if (current) {
    if (narrow) {
      /* the panel is a sheet from the bottom: keep the hacker in the top of the frame */
      wantEye.y -= cam.dist * 0.3; wantTarget.y -= cam.dist * 0.3;
    } else {
      /* the panel covers the right: keep the hacker left of it */
      const rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw), k = cam.dist * 0.34;
      wantEye.x += rx * k; wantEye.z += rz * k; wantTarget.x += rx * k; wantTarget.z += rz * k;
    }
  }
  wantEye.y = Math.max(wantEye.y, GROUND + 0.25);
}

/* From the chair: the eye stands behind and above the operator's right shoulder,
   looking at a point on the desk between the two monitors and the arm, so the
   hand, the arm, the slideshow and the terminal are all in one frame. On a tall
   phone screen it stands back until the desk from the left monitor to the arm
   fits across, and looks down more steeply so the desk top is easy to tap. */
function seatedView(narrow) {
  const s = bench.seat;
  const top = GROUND + 0.75;
  const fx = Math.sin(s.heading), fz = Math.cos(s.heading);   // the way the chair faces
  const rx = -fz, rz = fx;                                     // the operator's right
  const yaw = (narrow ? SEAT_VIEW.phoneYaw : SEAT_VIEW.yaw) + seatCam.yaw;
  const pitch = (narrow ? SEAT_VIEW.phonePitch : SEAT_VIEW.pitch) + seatCam.pitch;
  const half = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const fit = SEAT_VIEW.width / (half * Math.max(camera.aspect, 0.3));
  const dist = Math.max(SEAT_VIEW.dist, fit) * seatCam.zoom;

  wantTarget.set(s.x + fx * 0.72 + rx * 0.15, top + 0.2, s.z + fz * 0.72 + rz * 0.15);
  const hx = -fx * Math.cos(yaw) + rx * Math.sin(yaw);
  const hz = -fz * Math.cos(yaw) + rz * Math.sin(yaw);
  wantEye.set(
    wantTarget.x + hx * Math.cos(pitch) * dist,
    wantTarget.y + Math.sin(pitch) * dist,
    wantTarget.z + hz * Math.cos(pitch) * dist
  );

  if (current) {
    /* the About panel is open: keep the desk clear of it */
    if (narrow) { wantEye.y -= dist * 0.3; wantTarget.y -= dist * 0.3; }
    else shiftRight(dist * 0.22);
  } else if (narrow) {
    /* the console runs along the bottom of a phone: lift the desk into the upper part of the frame */
    wantEye.y -= dist * 0.12; wantTarget.y -= dist * 0.12;
  } else {
    /* the readout and the tuning panel sit on the left */
    shiftRight(-dist * 0.06);
  }
  wantEye.y = Math.max(wantEye.y, GROUND + 0.3);
}

function snapCamera(t) {
  desired(t);
  eye.copy(wantEye);
  target.copy(wantTarget);
  camera.position.copy(eye);
  camera.lookAt(target);
}

function moveCamera(dt, t) {
  cam.dist += (cam.wantDist - cam.dist) * damp(8, dt);
  seatCam.zoom += (seatCam.wantZoom - seatCam.zoom) * damp(8, dt);

  /* while walking, and not while the reader is steering the view, swing in behind.
     A reader who asked for reduced motion keeps the view where they left it. */
  if (!reduceMotion && mode === "play" && closeup < 0 && player.state === "walk" && player.speed > 0.3 && t - lastDrag > 1.6) {
    const behind = player.heading + Math.PI;
    cam.yaw += wrap(behind - cam.yaw) * damp(1.3, dt) * Math.min(1, player.speed / player.walkSpeed);
  }

  desired(t);
  const slow = mode === "intro" || closeup >= 0 || t < blendUntil;
  if (reduceMotion && (slow || jumped)) {
    /* no long glides with reduced motion: sitting down, getting up, a close-up or a
       teleport cuts straight to the new view, which then holds still or follows the hacker */
    eye.copy(wantEye);
    target.copy(wantTarget);
  } else {
    eye.lerp(wantEye, damp(slow ? 2.6 : 10, dt));
    target.lerp(wantTarget, damp(slow ? 2.6 : 14, dt));
  }
  jumped = false;
  camera.position.copy(eye);
  camera.lookAt(target);
}

/* ------------------------------------------------------------------ input */

const keys = new Set();
const MOVE = { w: [1, 0], arrowup: [1, 0], s: [-1, 0], arrowdown: [-1, 0], d: [0, 1], arrowright: [0, 1], a: [0, -1], arrowleft: [0, -1] };
const move = new THREE.Vector2();

function inputVector() {
  let f = 0, r = 0;
  for (const k of keys) if (MOVE[k]) { f += MOVE[k][0]; r += MOVE[k][1]; }
  const stick = hud.stick;
  if (stick.active) { f = stick.y; r = stick.x; }
  const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
  move.set(fx * f - fz * r, fz * f + fx * r);
  if (move.length() > 1) move.normalize();
  return keys.has("shift") || (stick.active && Math.hypot(stick.x, stick.y) > 0.85);
}

/* inputs that take no typed text: a focused slider or checkbox keeps the arrows, but not the letters or Escape */
const CONTROL_INPUTS = new Set(["range", "checkbox", "radio", "button", "submit", "reset", "color"]);

function bindKeys() {
  window.addEventListener("keydown", (e) => {
    if (viewer?.open) return;
    const k = e.key.toLowerCase();
    const el = e.target;
    const control = el.tagName === "INPUT" && CONTROL_INPUTS.has(el.type);
    /* typing in the console, or any other field, never moves the hacker */
    if (!control && el.closest?.("input, textarea, select, [contenteditable]")) return;
    /* a slider of the arm tuning panel moves with the arrows; Escape lets go of it and gets up as usual */
    if (control && k.startsWith("arrow")) return;
    if (control && k === "escape") el.blur();

    /* in close-up the arrows move along the shelves and Escape backs out to the cabinet */
    if (closeup >= 0 && ["escape", "arrowleft", "arrowright"].includes(k)) {
      e.preventDefault();
      setCloseup(k === "escape" ? -1 : closeup + (k === "arrowright" ? 1 : -1));
      return;
    }
    if (k === "escape") {
      /* a panel open over the desk closes first; the next Escape gets up */
      if (current) closePanel();
      else if (atDesk()) standUp();
      return;
    }
    /* arrows scroll a panel the reader has focused; letters always walk */
    if (k.startsWith("arrow") && el.closest?.(".panel")) return;
    if (MOVE[k] || k === "shift") {
      if (MOVE[k]) e.preventDefault();
      keys.add(k);
      if (mode === "intro" && MOVE[k]) enterPlay();
      /* a fresh press of a walking key gets up from the desk; a key still held from the walk in does not */
      if (MOVE[k] && !e.repeat && atDesk()) standUp();
    }
  });
  window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
  window.addEventListener("blur", () => keys.clear());
  document.addEventListener("focusin", (e) => { if (e.target.closest?.("input, textarea, select")) keys.clear(); });
}

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
  const placeHit = ray.intersectObjects(island.places.flatMap((p) => p.hits), false)[0];
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
  let hoverAt = 0;

  /* End a hold on the block or its ring when it is not a real release: a second
     finger arrived to pinch, or the browser took the gesture over. Without this
     the bench would think the block is still held, and refuse every place and
     home order. The small travel pushes the hold past the bench's tap threshold,
     so it is not read as a tap on the ring, which would lift or lower the block.
     It is sent from where the finger was last seen, since a cancelled pointer
     often reports (0, 0), and there the block does not move. */
  const letGo = () => {
    toNdc({ clientX: down.lx, clientY: down.ly });
    bench.pointerMove(ndc.x, ndc.y, 9);
    bench.pointerUp(ndc.x, ndc.y, { cancel: true });
  };

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      pinch = Math.hypot(a.x - b.x, a.y - b.y);
      if (down && down.grab !== "none") letGo();
      down = null;
      return;
    }
    down = { lx: e.clientX, ly: e.clientY, travel: 0, grab: "none" };
    /* from the chair the block and its ring can be taken by hand */
    if (player.state === "seated" && closeup < 0) {
      toNdc(e);
      down.grab = bench.pointerDown(ndc.x, ndc.y) || "none";
    }
  });

  canvas.addEventListener("pointermove", (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch && d) {
        if (seatView()) seatCam.wantZoom = clamp(seatCam.wantZoom * (pinch / d), SEAT_NUDGE.zoomLo, SEAT_NUDGE.zoomHi);
        else cam.wantDist = clamp(cam.wantDist * (pinch / d), STAND.near, STAND.far);
      }
      pinch = d;
      return;
    }

    if (!down) {
      /* hover picking walks every frame and skill model, so it runs at most every 90 ms */
      if (coarse || performance.now() - hoverAt < 90) return;
      hoverAt = performance.now();
      if (player.state === "seated") {
        toNdc(e);
        canvas.style.cursor = bench.hoverAt(ndc.x, ndc.y) ? "grab"
          : typeof bench.aimFromNdc === "function" && bench.aimFromNdc(ndc.x, ndc.y) ? "crosshair" : "default";
        return;
      }
      const hit = pick(e);
      canvas.style.cursor = hit ? "pointer" : "grab";
      showLabel(hit);
      return;
    }

    const dx = e.clientX - down.lx, dy = e.clientY - down.ly;
    down.lx = e.clientX; down.ly = e.clientY;
    down.travel += Math.abs(dx) + Math.abs(dy);

    if (down.grab !== "none") {
      toNdc(e);
      bench.pointerMove(ndc.x, ndc.y, Math.abs(dx) + Math.abs(dy));
      return;
    }
    if (seatView()) {
      /* from the chair a drag only leans the view a little */
      seatCam.yaw = clamp(seatCam.yaw - dx * 0.0035, -SEAT_NUDGE.yaw, SEAT_NUDGE.yaw);
      seatCam.pitch = clamp(seatCam.pitch + dy * 0.0028, SEAT_NUDGE.pitchLo, SEAT_NUDGE.pitchHi);
    } else {
      cam.yaw -= dx * 0.0055;
      cam.pitch = clamp(cam.pitch + dy * 0.0042, -0.08, 1.15);
    }
    lastDrag = performance.now() / 1000;
    canvas.style.cursor = "grabbing";
  });

  const up = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = 0;
    if (!down) return;
    const tap = down.travel < 8 && e.type !== "pointercancel";
    if (down.grab !== "none") {
      if (e.type === "pointercancel") letGo();
      else { toNdc(e); bench.pointerUp(ndc.x, ndc.y); }
    } else if (tap) {
      if (player.state === "seated" && closeup < 0 && aimTap(e)) {
        /* the hacker points and the arm has its order */
      } else {
        const hit = pick(e);
        if (hit?.kind === "frame") {
          /* the gallery is every frame hung on the same wall */
          const wall = island.frames.filter((f) => f.parent === hit.object.parent).map((f) => f.userData);
          openViewer(hit.data, wall);
        } else if (hit?.kind === "skill") {
          showLabel(hit);
        } else if (hit?.kind === "place" && hit.data !== current && !(hit.data.key === "bench" && atDesk())) {
          go(hit.data.key, { teleport: true });
        }
      }
    }
    down = null;
    canvas.style.cursor = coarse ? "" : "grab";
  };
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const by = 1 + Math.sign(e.deltaY) * (seatView() ? 0.06 : 0.08);
    if (seatView()) seatCam.wantZoom = clamp(seatCam.wantZoom * by, SEAT_NUDGE.zoomLo, SEAT_NUDGE.zoomHi);
    else cam.wantDist = clamp(cam.wantDist * by, STAND.near, STAND.far);
  }, { passive: false });
}

function showLabel(hit) {
  if (!labelEl) return;
  if (!hit) { labelEl.textContent = ""; return; }
  labelEl.textContent = hit.kind === "place" ? hit.data.label
    : hit.kind === "skill" ? hit.data.label
    : hit.data.alt + ", open full size";
}

/* ------------------------------------------------------------ the desk */

let commandAt = -1e9;         // when the arm was last given an order, from the console or a tap
let greeted = false;
let lastState = null;

/* where the arm's base stands, the origin of every armctl coordinate */
const armBase = () => (bench.root ? bench.root.position : new THREE.Vector3(0, GROUND + 0.75, 0));
const cm = (metres) => (metres * 100).toFixed(1);

/* A tap on the desk from the chair: the hacker points at the spot and the arm is
   told to carry the block there. The console shows the same order as the line
   you could have typed, and what the arm made of it. */
function aimTap(e) {
  if (typeof bench.aimFromNdc !== "function" || typeof bench.placeAt !== "function") return false;
  toNdc(e);
  const spot = bench.aimFromNdc(ndc.x, ndc.y);
  if (!spot) return false;
  const res = bench.placeAt(spot) || { accepted: false, reason: "no reply from the arm" };
  const goal = res.target || spot;
  player.point(res.accepted ? goal : spot);
  const o = armBase();
  hud.print(`armctl> ${res.line || `place ${cm(spot.x - o.x)} ${cm(spot.z - o.z)}`}`, "cmd");
  if (res.accepted) {
    hud.print([`ok, block to x ${cm(goal.x - o.x)} z ${cm(goal.z - o.z)} cm`].concat(res.reason ? [res.reason] : []), "out");
  } else {
    hud.print(`refused: ${res.reason || "out of reach"}`, "err");
  }
  commandAt = performance.now();
  return true;
}

/* the console hands every line to the arm and prints whatever comes back */
function bindConsole() {
  hud.onCommand((line) => {
    hud.print(`armctl> ${line}`, "cmd");
    let res;
    try {
      res = typeof bench.command === "function" ? bench.command(line) : { ok: false, lines: ["armctl is not available"] };
    } catch (err) {
      console.warn(err);
      res = { ok: false, lines: [`error: ${err?.message || err}`] };
    }
    if (res?.lines?.length) hud.print(res.lines, res.ok ? "out" : "err");
    commandAt = performance.now();
  });
  hud.onStand(standUp);
  hud.onAbout(() => {
    if (!benchPlace) return;
    if (current === benchPlace) closePanel();
    else go("bench");
  });
}

/* Seated, the hands are on the keyboard while the console has focus, and for as
   long as the arm is still carrying out the last order (bounded, since the arm
   also moves the block by itself when left alone). */
function typingNow() {
  if (hud.typing) return true;
  const since = performance.now() - commandAt;
  if (since < 1600) return true;
  if (since > 15000) return false;
  if (typeof bench.busy === "function") return bench.busy();
  return !!modeEl && modeEl.textContent.trim() !== "AT REST";
}

function sitDown({ instant = false } = {}) {
  if (!bench.seat || !bench.approach) return false;
  return player.sit(bench.seat, bench.approach, { instant });
}

function standUp() {
  if (!atDesk()) return;
  player.standUp();
  /* the chair does not pull you back in until you have walked away from the bench */
  dismissed = "bench";
}

/* react to the hacker sitting down or getting up: controls, camera, shadows */
function syncSeat() {
  const s = player.state;
  if (s === lastState) return;
  const was = lastState;
  lastState = s;
  const seated = s === "seated";
  document.body.classList.toggle("is-seated", seated);
  hud.setSeated(seated);
  const now = performance.now() / 1000;

  if (s === "sitting-down" || (seated && was !== "sitting-down")) {
    Object.assign(seatCam, { yaw: 0, pitch: 0, zoom: 1, wantZoom: 1 });
    blendUntil = now + 1.6;
    shadowSpan(3.2);
  }
  if (s === "standing-up" || (s === "walk" && (was === "seated" || was === "sitting-down"))) {
    cam.yaw = player.heading + Math.PI;
    cam.pitch = STAND.pitch;
    cam.wantDist = STAND.dist;
    blendUntil = now + 1.4;
    shadowSpan(30);
  }
  if (seated && !greeted) {
    greeted = true;
    hud.print("armctl console. Type help for the commands.", "out");
  }
  refreshPlaceUi();
}

/* ----------------------------------------------------------------- panels */

function enterPlay() {
  if (mode === "play") return;
  mode = "play";
  document.body.classList.add("is-exploring");
  hud.show(true);
  if (!seatView()) cam.yaw = player.heading + Math.PI;
}

/* the place the instruments show: the open panel, or the workbench while at the desk */
const shownPlace = () => current || (atDesk() ? benchPlace : null);

function refreshPlaceUi() {
  const p = shownPlace();
  island.setActive(p ? p.key : null);
  hud.setPlace(p);
  hud.setAbout(!!current && current === benchPlace);
}

/* Open a place's panel. Walking in calls this with no options; the header,
   the panel arrows and deep links teleport the hacker to the building's door,
   and for the workbench straight into the chair. */
function go(keyName, { replace = false, teleport = false, hash = null } = {}) {
  const place = island.places.find((p) => p.key === keyName);
  if (!place) return;
  enterPlay();
  if (teleport) {
    if (place.key !== "bench" || !sitDown({ instant: true })) {
      player.teleport(place.spawn);
      cam.yaw = place.spawn.heading + Math.PI;
      cam.pitch = STAND.pitch;
    }
    jumped = true;
  }
  dismissed = null;
  const wasOpen = current === place;
  current = place;
  if (!wasOpen) closeup = -1;
  island.visit(place.key);
  document.body.classList.add("is-focused");
  document.body.dataset.place = place.key;

  document.querySelectorAll("[data-panel]").forEach((el) => el.classList.toggle("is-open", el.matches(place.panel)));
  const panel = document.querySelector(place.panel);
  const anchorSel = hash || place.anchor;
  if (panel && (!wasOpen || hash)) {
    const anchor = anchorSel && document.querySelector(anchorSel);
    panel.scrollTop = anchor ? anchorTop(panel, anchor) : 0;
  }
  bar.hidden = false;
  document.querySelectorAll("[data-place]").forEach((a) => {
    if (a.dataset.place === place.key) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  const want = hash || place.anchor || place.panel;
  if (location.hash !== want) history[replace ? "replaceState" : "pushState"](null, "", location.pathname + location.search + want);
  if (labelEl) labelEl.textContent = place.label;
  refreshPlaceUi();
  renderCloseup();
}

/* Close the open panel. Walking out passes fromWalk; closing by hand while still
   inside the building remembers it, so the panel does not reopen on the next step. */
function closePanel({ fromWalk = false } = {}) {
  if (!current) return;
  if (!fromWalk) dismissed = current.key;
  current = null;
  closeup = -1;
  document.body.classList.remove("is-focused");
  delete document.body.dataset.place;
  document.querySelectorAll("[data-panel]").forEach((el) => el.classList.remove("is-open"));
  document.querySelectorAll("[data-place]").forEach((a) => a.removeAttribute("aria-current"));
  bar.hidden = true;
  if (location.hash) history.pushState(null, "", location.pathname + location.search);
  if (labelEl) labelEl.textContent = "";
  refreshPlaceUi();
  renderCloseup();
}

function step(by) {
  const list = island.places;
  const i = current ? list.indexOf(current) : -1;
  go(list[(i + by + list.length) % list.length].key, { teleport: true });
}

/* The building whose entry zone the hacker is standing in opens; walking out
   closes it. The workbench does not open a panel: walking into it sits the
   hacker down at the desk, and the About panel waits for its button. */
function checkZones() {
  if (mode !== "play" || closeup >= 0 || player.state !== "walk") return;
  /* zones of neighbouring buildings touch at a few corners (research and toolchain,
     stage and lab); where they overlap, the building whose zone centre is nearest wins */
  const { x, z } = player.position;
  let here = null, best = Infinity;
  for (const p of island.places) {
    if (!inRect(p.zone, x, z)) continue;
    const d = Math.hypot(x - p.zone.x, z - p.zone.z);
    if (d < best) { best = d; here = p; }
  }
  if (dismissed && (!here || here.key !== dismissed)) dismissed = null;
  if (here && here.key === "bench") {
    if (current && current !== here) closePanel({ fromWalk: true });
    if (dismissed !== "bench" && sitDown()) refreshPlaceUi();
    return;
  }
  if (here && here !== current && here.key !== dismissed) go(here.key);
  else if (!here && current) closePanel({ fromWalk: true });
}

function fromHash() {
  const h = location.hash;
  if (!h || h === "#top" || h === "#bench") { if (current) closePanel({ fromWalk: true }); return; }
  const place = island.places.find((p) => p.anchor === h) || island.places.find((p) => p.panel === h);
  if (place) { go(place.key, { replace: true, teleport: true }); return; }
  /* a deep link into an entry inside a panel keeps its own address */
  const el = document.querySelector(h);
  const panel = el && el.closest("[data-panel]");
  const owner = panel && island.places.find((p) => p.panel === "#" + panel.id);
  if (owner) go(owner.key, { replace: true, teleport: true, hash: h });
}

/* scroll so an entry starts where the panel's content starts, below the fixed masthead */
function anchorTop(panel, el) {
  return Math.max(0, el.offsetTop - parseFloat(getComputedStyle(panel).paddingTop) + 8);
}

/* --------------------------------------------------------------- close-up */

function setCloseup(i) {
  const stops = island.hardwareStops();
  if (i < 0 || !current || current.key !== "skills" || !stops.length) closeup = -1;
  else {
    closeup = (i + stops.length) % stops.length;
    island.showHardware(closeup);
  }
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
  document.getElementById("closeup-count").textContent = on ? `${closeup + 1} of ${stops.length}` : `${stops.length} boards and sensors`;
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
  keys.clear();
  buildThumbs();
  showSlide(0);
  if (!viewer.open) viewer.showModal();
}

function unloadVideo(video) {
  video.pause();
  if (video.getAttribute("src")) { video.removeAttribute("src"); video.load(); }
}

function showSlide(dir) {
  const { list, i } = gallery;
  const it = list[i];
  const img = document.getElementById("viewer-img");
  const video = document.getElementById("viewer-video");
  const shown = it.video ? video : img;
  if (it.video) video.pause(); else unloadVideo(video);
  img.hidden = !!it.video;
  video.hidden = !it.video;
  shown.classList.remove("from-left", "from-right");
  void shown.offsetWidth;
  if (dir) shown.classList.add(dir > 0 ? "from-right" : "from-left");
  if (it.video) {
    video.poster = it.src || "";
    video.src = it.full;
    video.setAttribute("aria-label", it.alt || "Video");
  } else {
    img.src = it.full;
    img.alt = it.alt || "";
  }
  document.getElementById("viewer-cap").textContent = it.alt || "";
  document.getElementById("viewer-count").textContent = list.length > 1 ? `${i + 1} of ${list.length}` : "";
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
  viewer.addEventListener("click", (e) => { if (e.target === viewer) viewer.close(); });
  viewer.addEventListener("close", () => unloadVideo(document.getElementById("viewer-video")));

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

/* The arm's dimensions are kept in the bench's own units, 10 cm each, and shown in cm. */
function bindRig() {
  const form = document.getElementById("rig");
  if (!form) return;
  const names = ["base", "l1", "l2", "claw"];
  const start = bench.getDims();
  if (!coarse && window.innerWidth >= 992) form.open = true;

  const show = (s) => {
    names.forEach((k) => {
      const input = document.getElementById("rig-" + k);
      input.value = (s.dims[k] * 10).toFixed(1);
      input.nextElementSibling.textContent = (s.dims[k] * 10).toFixed(1) + " cm";
    });
    document.getElementById("rig-reach").textContent = s.reachCm.toFixed(1) + " cm";
    document.getElementById("rig-top").textContent = s.heightCm.toFixed(1) + " cm";
    document.getElementById("rig-area").textContent = Math.round(s.areaCm2).toLocaleString("en-IN") + " cm²";
    document.getElementById("rig-volume").textContent = s.litres.toFixed(1) + " L";
  };
  showRig = show;

  names.forEach((k) => {
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
    a.addEventListener("click", (e) => { e.preventDefault(); go(a.dataset.place, { teleport: true }); });
  });
  document.getElementById("explore")?.addEventListener("click", () => {
    enterPlay();
    canvas.focus?.();
  });
  document.getElementById("panel-close").addEventListener("click", () => closePanel());
  document.getElementById("panel-prev").addEventListener("click", () => step(-1));
  document.getElementById("panel-next").addEventListener("click", () => step(1));
  document.querySelector(".wordmark")?.addEventListener("click", (e) => {
    e.preventDefault();
    closePanel({ fromWalk: true });
    if (atDesk()) { player.standUp({ instant: true }); dismissed = "bench"; }
    mode = "intro";
    hud.show(false);
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

  window.addEventListener("popstate", fromHash);
  fromHash();
}

/* ------------------------------------------------------------------- loop */

let prev = performance.now();
const still = new THREE.Vector2();
const look = new THREE.Vector3();

function frame(nowMs) {
  requestAnimationFrame(frame);
  const raw = (nowMs - prev) / 1000;
  prev = nowMs;
  if (document.hidden) return;
  const dt = Math.min(raw, 0.05);
  const t = nowMs / 1000;

  const walking = mode === "play" && closeup < 0 && !viewer?.open;
  const running = walking ? inputVector() : false;
  player.setTyping(player.state === "seated" && typingNow());
  player.update(dt, walking ? move : still, running);
  syncSeat();
  /* the occlusion radius follows the shadow span: small at the desk and in a
     close-up, campus-sized while walking; unchanged spans cost nothing */
  if (composer && composer.aoSpan) composer.aoSpan(closeup >= 0 || seatView());
  checkZones();
  moveCamera(Math.min(raw, 0.25), t);
  bench.update(nowMs, dt);
  island.update(dt, t);
  camera.getWorldDirection(look);
  hud.update(player, Math.atan2(look.x, look.z) - Math.PI, shownPlace());
  if (composer) composer.render(); else renderer.render(scene, camera);
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  if (composer) composer.setSize(w, h);
  camera.aspect = w / h;
  camera.fov = clamp(50 + (1.3 - w / h) * 12, 50, 66);
  camera.updateProjectionMatrix();
}

function fail(err) {
  document.body.classList.add("no-world");
  console.error(err);
}

try { boot(); } catch (err) { fail(err); }
