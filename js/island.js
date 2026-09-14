/* The island. Terrain, paths, and one landmark per part of the page.
   The workbench with the arm stands at the centre, its desk top at y = 0,
   because the arm's inverse kinematics are written around the world origin.
   Everything else stands on the ground below it. */

import * as THREE from "three";
import { roundedBox } from "./bench.js";
import { RIGS } from "./stations.js";
import { makeSkillRing } from "./icons.js";

export const GROUND = -1.4;
const AMBER = 0xf0a31e;

const M = {
  grass: new THREE.MeshStandardMaterial({ color: 0x1d3a30, roughness: 0.95, flatShading: true }),
  rock: new THREE.MeshStandardMaterial({ color: 0x2a2f2c, roughness: 1, flatShading: true }),
  path: new THREE.MeshStandardMaterial({ color: 0x5a5140, roughness: 0.9 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x3a3831, roughness: 0.8 }),
  wall: new THREE.MeshStandardMaterial({ color: 0x1b2724, roughness: 0.85, metalness: 0.1 }),
  trim: new THREE.MeshStandardMaterial({ color: 0x33443f, roughness: 0.5, metalness: 0.5 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x9aa6a0, roughness: 0.4, metalness: 0.7 }),
  roof: new THREE.MeshStandardMaterial({ color: 0x2b3a35, roughness: 0.7, flatShading: true }),
  cloth: new THREE.MeshStandardMaterial({ color: 0xb8372a, roughness: 0.8 }),
  skin: new THREE.MeshStandardMaterial({ color: 0xc89a7a, roughness: 0.7 }),
  glow: new THREE.MeshBasicMaterial({ color: AMBER }),
  frame: new THREE.MeshStandardMaterial({ color: 0x151d1b, roughness: 0.6, metalness: 0.3 }),
  hit: new THREE.MeshBasicMaterial({ visible: false })
};

const loader = new THREE.TextureLoader();
const shadows = (o) => o.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });

/* ---------------------------------------------------------------- terrain */

function terrain(scene) {
  const top = new THREE.CylinderGeometry(24, 21, 2.4, 72, 3);
  const pos = top.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y > 1.1) {
      const x = pos.getX(i), z = pos.getZ(i);
      const r = Math.hypot(x, z);
      if (r > 20) pos.setY(i, y + Math.sin(x * 0.7) * Math.cos(z * 0.6) * 0.25);
    }
  }
  top.computeVertexNormals();
  const land = new THREE.Mesh(top, M.grass);
  land.position.y = GROUND - 1.2;
  land.receiveShadow = true;
  scene.add(land);

  const under = new THREE.Mesh(new THREE.ConeGeometry(21, 16, 40, 4), M.rock);
  under.rotation.x = Math.PI;
  under.position.y = GROUND - 2.4 - 8;
  scene.add(under);

  /* loose rocks drifting around the island */
  for (let i = 0; i < 14; i++) {
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6 + Math.random() * 1.2, 0), M.rock);
    const a = (i / 14) * Math.PI * 2 + Math.random() * 0.3;
    const d = 30 + Math.random() * 10;
    r.position.set(Math.cos(a) * d, GROUND - 4 + Math.random() * 8, Math.sin(a) * d);
    r.userData.bob = Math.random() * 6;
    scene.add(r);
  }

  /* stars */
  const n = 900, star = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(160 + Math.random() * 40);
    v.y = Math.abs(v.y) * 0.9 - 10;
    star.set([v.x, v.y, v.z], i * 3);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute("position", new THREE.BufferAttribute(star, 3));
  scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xcfe0d6, size: 0.6, sizeAttenuation: true, transparent: true, opacity: 0.7 })));
}

function trees(scene, avoid) {
  const cone = new THREE.MeshStandardMaterial({ color: 0x25493b, roughness: 0.9, flatShading: true });
  for (let i = 0; i < 70; i++) {
    const a = Math.random() * Math.PI * 2, d = 6 + Math.random() * 16.5;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (avoid.some(([ax, az, ar]) => Math.hypot(x - ax, z - az) < ar)) continue;
    const t = new THREE.Group();
    const h = 1.4 + Math.random() * 1.6;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.5, 6), M.wood);
    trunk.position.y = 0.25;
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.55 + Math.random() * 0.3, h, 7), cone);
    top.position.y = 0.5 + h / 2;
    t.add(trunk, top);
    t.position.set(x, GROUND, z);
    shadows(t);
    scene.add(t);
  }
}

function path(scene, x, z) {
  const len = Math.hypot(x, z);
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(1.1, len), M.path);
  strip.rotation.x = -Math.PI / 2;
  strip.rotation.z = -Math.atan2(x, z);
  strip.position.set(x / 2, GROUND + 0.02, z / 2);
  strip.receiveShadow = true;
  scene.add(strip);
}

/* ----------------------------------------------------------------- frames */

/* A real scan hung in the world. Clicking it opens the full-size image. */
function frame(parent, { src, full, w, h, alt }, size, x, y, z, ry = 0, frames) {
  const aspect = h / w;
  const fw = size, fh = size * aspect;
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  const back = new THREE.Mesh(new THREE.BoxGeometry(fw + 0.14, fh + 0.14, 0.06), M.frame);
  g.add(back);
  const tex = loader.load(src);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(fw, fh), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  pic.position.z = 0.035;
  pic.userData = { full, alt };
  g.add(pic);
  parent.add(g);
  frames.push(pic);
  return g;
}

/* ---------------------------------------------------------------- helpers */

function rig(name, scale, reduceMotion, updaters) {
  const built = RIGS[name]();
  built.scene.scale.setScalar(scale);
  updaters.push((dt, t) => built.update(dt, t));
  return built.scene;
}

function plinth(r, h) {
  const p = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.08, h, 40), M.trim);
  p.position.y = h / 2;
  const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.8, r * 0.86, 48),
    new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = h + 0.01;
  const g = new THREE.Group();
  g.add(p, ring);
  return g;
}

function hitBox(group, w, h, d, y) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M.hit);
  m.position.y = y;
  group.add(m);
  return m;
}

function sign(text) {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 96;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#0d1715"; ctx.fillRect(0, 0, 512, 96);
  ctx.strokeStyle = "#f0a31e"; ctx.lineWidth = 4; ctx.strokeRect(6, 6, 500, 84);
  ctx.fillStyle = "#e8eee8"; ctx.font = "600 44px Archivo, Arial, sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(text, 256, 50);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.52), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.DoubleSide }));
  return m;
}

function landmark(scene, key, x, z) {
  const g = new THREE.Group();
  g.position.set(x, GROUND, z);
  g.rotation.y = Math.atan2(x, z) + Math.PI;   // face the centre of the island
  g.userData.key = key;
  scene.add(g);
  return g;
}

/* ---------------------------------------------------------------- landmarks */

function workbenchDesk(scene) {
  const top = new THREE.Mesh(roundedBox(8.6, 0.16, 5.2, 0.04), M.wood);
  top.position.set(-1.1, -0.08, 0);
  scene.add(top);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.24, 0.2), M.steel);
    leg.position.set(-1.1 + sx * 4.0, GROUND / 2 - 0.08, sz * 2.3);
    scene.add(leg);
  }
  shadows(top);
  top.receiveShadow = true;
}

function tower(scene, reduceMotion, updaters) {
  const g = landmark(scene, "research", -12, -10);
  let y = 0;
  [[2.4, 1.6], [2.0, 1.8], [1.7, 1.8]].forEach(([r, h], i) => {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.92, r, h, 10), i % 2 ? M.trim : M.wall);
    s.position.y = y + h / 2;
    g.add(s);
    const band = new THREE.Mesh(new THREE.TorusGeometry(r * 0.94, 0.05, 6, 30), M.glow);
    band.rotation.x = Math.PI / 2;
    band.position.y = y + h;
    g.add(band);
    y += h;
  });
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.2, 32), M.trim);
  deck.position.y = y + 0.1;
  g.add(deck);
  const sprint = rig("sprint", 0.85, reduceMotion, updaters);
  sprint.position.y = y + 0.9;
  g.add(sprint);
  const s = sign("RESEARCH"); s.position.set(0, 2.2, 2.7); g.add(s);
  shadows(g);
  const hit = hitBox(g, 5, y + 3, 5, (y + 3) / 2);
  return { group: g, focus: new THREE.Vector3(0, y + 1.1, 0), dist: 9, lift: 1.5, hits: [hit] };
}

function stage(scene, reduceMotion, updaters, frames) {
  const g = landmark(scene, "stage", 11, -11);
  const deck = new THREE.Mesh(roundedBox(9, 0.8, 5.5, 0.1), M.wood);
  deck.position.y = 0.4;
  g.add(deck);
  const back = new THREE.Mesh(new THREE.BoxGeometry(9.4, 5.2, 0.3), M.wall);
  back.position.set(0, 3.4, -2.6);
  g.add(back);
  const valance = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.5, 0.5), M.cloth);
  valance.position.set(0, 6.1, -2.4);
  g.add(valance);

  /* the humanoid, as a stand-in: the real one is in the photographs behind it */
  const bot = new THREE.Group();
  const dress = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.7, 16), M.cloth);
  dress.position.y = 0.85;
  const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 0.6, 14), M.cloth);
  chest.position.y = 1.9;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 14), M.skin);
  head.position.y = 2.45;
  const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.8, 8), M.steel);
  armL.position.set(-0.42, 2.25, 0); armL.rotation.z = 2.6;
  const armR = armL.clone(); armR.position.x = 0.42; armR.rotation.z = -2.6;
  bot.add(dress, chest, head, armL, armR);
  bot.position.set(0, 0.8, 0.4);
  g.add(bot);
  updaters.push((dt, t) => {
    if (reduceMotion) return;
    armL.rotation.z = 2.6 + Math.sin(t * 1.4) * 0.2;
    armR.rotation.z = -2.6 - Math.sin(t * 1.4) * 0.2;
    head.rotation.y = Math.sin(t * 0.6) * 0.4;
  });

  const P = "assets/press/", E = "assets/events/";
  const items = [
    { src: E + "robonari-on-stage-bheenmal-2024.jpg", full: E + "robonari-on-stage-bheenmal-2024-full.jpg", w: 480, h: 778, alt: "The humanoid on stage at Bheenmal" },
    { src: P + "robonari-marudhar-aaina-2024.jpg", full: P + "robonari-marudhar-aaina-2024-full.jpg", w: 400, h: 809, alt: "Marudhar Aaina" },
    { src: P + "robonari-dainik-nirala-2024.jpg", full: P + "robonari-dainik-nirala-2024-full.jpg", w: 400, h: 643, alt: "Dainik Nirala Rajasthan News" },
    { src: P + "robonari-sach-media-2024.jpg", full: P + "robonari-sach-media-2024-full.jpg", w: 400, h: 400, alt: "Sach Media News Network" },
    { src: P + "robonari-jagruk-times-2024.jpg", full: P + "robonari-jagruk-times-2024-full.jpg", w: 400, h: 733, alt: "Jagruk Times" }
  ];
  items.forEach((it, i) => frame(g, it, 1.35, -3.6 + i * 1.8, 3.5, -2.42, 0, frames));

  const s = sign("BHEENMAL 2024"); s.position.set(0, 6.1, -2.1); g.add(s);
  const spot = new THREE.PointLight(0xffe2b0, 18, 12, 2);
  spot.position.set(0, 5, 2);
  g.add(spot);
  shadows(g);
  const hit = hitBox(g, 10, 7, 6, 3.3);
  return { group: g, focus: new THREE.Vector3(0, 2.8, -0.6), dist: 11, lift: 1.2, hits: [hit], panelAnchor: "#work-robonari" };
}

function lab(scene, reduceMotion, updaters) {
  const g = landmark(scene, "lab", 15, 3);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(10, 0.2, 7), M.trim);
  floor.position.y = 0.1;
  g.add(floor);
  const wallB = new THREE.Mesh(new THREE.BoxGeometry(10, 4, 0.25), M.wall); wallB.position.set(0, 2.1, -3.4); g.add(wallB);
  const wallL = new THREE.Mesh(new THREE.BoxGeometry(0.25, 4, 7), M.wall); wallL.position.set(-5, 2.1, 0); g.add(wallL);
  const wallR = wallL.clone(); wallR.position.x = 5; g.add(wallR);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(7.6, 2.2, 4), M.roof);
  roof.rotation.y = Math.PI / 4; roof.scale.set(1, 1, 0.72); roof.position.y = 5.2;
  g.add(roof);

  [["roster", -3, 0.55], ["hand", 0, 0.62], ["trace", 3, 0.6]].forEach(([name, x, sc]) => {
    const table = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 1.6), M.wood);
    table.position.set(x, 1.0, -0.6);
    g.add(table);
    const legs = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 1.4), M.trim);
    legs.position.set(x, 0.55, -0.6); legs.scale.set(1, 1, 1);
    g.add(legs);
    const r = rig(name, sc, reduceMotion, updaters);
    r.position.set(x, 1.75, -0.6);
    g.add(r);
  });
  const s = sign("ROBOTICS LAB"); s.position.set(0, 3.6, -3.2); g.add(s);
  const lamp = new THREE.PointLight(0xcfe8dd, 14, 12, 2);
  lamp.position.set(0, 3.4, 0.5);
  g.add(lamp);
  shadows(g);
  const hit = hitBox(g, 10.5, 6, 7.5, 3);
  return { group: g, focus: new THREE.Vector3(0, 2.0, -0.4), dist: 11, lift: 1.6, hits: [hit], panelAnchor: "#work-attendance" };
}

function hall(scene, frames) {
  const g = landmark(scene, "hall", 1, 16);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(13, 0.3, 5), M.trim);
  floor.position.y = 0.15;
  g.add(floor);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(13, 5, 0.3), M.wall);
  wall.position.set(0, 2.8, -2.2);
  g.add(wall);
  for (const x of [-6.3, 6.3]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 5, 12), M.steel);
    col.position.set(x, 2.8, 2.1);
    g.add(col);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(13.4, 0.5, 5), M.roof);
  lintel.position.y = 5.5;
  g.add(lintel);

  const C = "assets/certs/";
  const certs = [
    ["nptel-deep-learning-iit-ropar-2025", 280, 200, "NPTEL Deep Learning, IIT Ropar"],
    ["cadd-autofina-robotics-360h-2023", 280, 198, "Robotics and Automation, CADD Centre"],
    ["roboai-hub-180-day-internship-2024", 280, 384, "RoboAI Hub 180-day internship"],
    ["ccna-enterprise-networking-2023", 280, 189, "Cisco CCNAv7 Enterprise"],
    ["ccna-switching-routing-2023", 280, 189, "Cisco CCNAv7 Switching"],
    ["straightarc-cyber-security-2024", 280, 157, "Cyber Security Fundamentals"],
    ["pm-shri-kv-mount-abu-2025", 280, 406, "PM SHRI KV Mount Abu training"],
    ["academor-2023", 280, 217, "Academor"],
    ["linkedin-linux-cli-2025", 280, 217, "Linux command line"],
    ["linkedin-ecmascript-2025", 280, 217, "ECMAScript 6+"],
    ["devtown-python-ai-2023", 280, 208, "devTown Python and AI"]
  ];
  certs.forEach(([n, w, h, alt], i) => {
    const row = i < 6 ? 0 : 1;
    const col = row === 0 ? i : i - 6;
    const count = row === 0 ? 6 : 5;
    frame(g, { src: C + n + ".jpg", full: C + n + "-full.jpg", w, h, alt }, 1.5,
      -((count - 1) * 1.95) / 2 + col * 1.95, row === 0 ? 3.9 : 1.9, -2.03, 0, frames);
  });
  const s = sign("CREDENTIALS"); s.position.set(0, 5.5, 2.52); g.add(s);
  const light = new THREE.PointLight(0xffe9c8, 16, 14, 2);
  light.position.set(0, 4.2, 1.5);
  g.add(light);
  shadows(g);
  const hit = hitBox(g, 13.5, 6, 5.5, 3);
  return { group: g, focus: new THREE.Vector3(0, 2.9, -1.2), dist: 10.5, lift: 0.6, hits: [hit] };
}

function skills(scene, reduceMotion, updaters) {
  const g = landmark(scene, "skills", -15, 5);
  const base = plinth(4, 0.5);
  g.add(base);
  const boards = rig("boards", 0.9, reduceMotion, updaters);
  boards.position.y = 1.5;
  g.add(boards);
  const ring = makeSkillRing(reduceMotion);
  ring.group.position.y = 0.5;
  g.add(ring.group);
  updaters.push((dt, t) => {
    ring.update(dt, t);
    if (!reduceMotion) ring.group.rotation.y += dt * 0.08;
  });
  const s = sign("SKILLS"); s.position.set(0, 4.8, 3.2); g.add(s);
  shadows(g);
  const hits = [hitBox(g, 8.5, 5, 8.5, 2.4)];
  return { group: g, focus: new THREE.Vector3(0, 2.1, 0), dist: 11, lift: 3.2, hits, ring, signMesh: s };
}

function shed(scene, reduceMotion, updaters, frames) {
  const g = landmark(scene, "shed", -9, -1.5);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.2, 4), M.trim); floor.position.y = 0.1; g.add(floor);
  const back = new THREE.Mesh(new THREE.BoxGeometry(5.4, 3.4, 0.2), M.wall); back.position.set(0, 1.8, -1.9); g.add(back);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(6, 0.2, 4.6), M.roof); roof.position.set(0, 3.6, 0); roof.rotation.x = -0.12; g.add(roof);
  const table = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.12, 1.8), M.wood); table.position.set(0, 1.0, -0.4); g.add(table);
  const props = rig("props", 0.6, reduceMotion, updaters);
  props.position.set(0, 1.08, -0.4);
  g.add(props);
  const B = "assets/bench/";
  [["workstation", "The desk"], ["raspberry-pi", "The Pi"], ["motor-driver-bench", "The motor bench"]].forEach(([n, alt], i) => {
    frame(g, { src: B + n + ".jpg", full: B + n + "-full.jpg", w: 480, h: 640, alt }, 0.8, -1.5 + i * 1.5, 1.95, -1.78, 0, frames);
  });
  const s = sign("TOOLCHAIN"); s.position.set(0, 3.25, -1.76); s.scale.setScalar(0.8); g.add(s);
  shadows(g);
  const hit = hitBox(g, 6, 4, 4.6, 2);
  return { group: g, focus: new THREE.Vector3(0, 1.8, -0.4), dist: 7.5, lift: 1.1, hits: [hit] };
}

function mast(scene, reduceMotion, updaters) {
  const g = landmark(scene, "mast", 9, 12);
  const base = plinth(1.6, 0.4); g.add(base);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.22, 9, 10), M.steel);
  pole.position.y = 4.9; g.add(pole);
  for (let i = 0; i < 4; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.6 - i * 0.3, 0.06, 0.06), M.steel);
    bar.position.y = 3 + i * 1.6; bar.rotation.y = i * 0.8; g.add(bar);
  }
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), M.glow.clone());
  beacon.position.y = 9.6; g.add(beacon);
  const glow = new THREE.PointLight(AMBER, 10, 14, 2); glow.position.y = 9.6; g.add(glow);
  const waves = [];
  for (let i = 0; i < 3; i++) {
    const w = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.03, 8, 40),
      new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0.6 }));
    w.rotation.x = Math.PI / 2; w.position.y = 9.6; g.add(w); waves.push(w);
  }
  updaters.push((dt, t) => {
    const on = reduceMotion || Math.floor(t * 1.5) % 2 === 0;
    glow.intensity = on ? 10 : 2;
    waves.forEach((w, i) => {
      const k = reduceMotion ? 0.5 : ((t * 0.5 + i / 3) % 1);
      w.scale.setScalar(1 + k * 5);
      w.material.opacity = 0.6 * (1 - k);
    });
  });
  const s = sign("SAY HELLO"); s.position.set(0, 1.4, 1.8); g.add(s);
  shadows(g);
  const hit = hitBox(g, 3.4, 11, 3.4, 5.4);
  return { group: g, focus: new THREE.Vector3(0, 4.2, 0), dist: 19, lift: -0.5, hits: [hit] };
}

function aboutMarker(scene, reduceMotion, updaters) {
  /* the serial-link rig stands beside the bench and belongs to the About panel */
  const g = new THREE.Group();
  g.position.set(4.3, GROUND, -4.6);
  scene.add(g);
  g.add(plinth(1.1, 1.4));
  const u = rig("uart", 0.7, reduceMotion, updaters);
  u.position.y = 2.3;
  g.add(u);
  shadows(g);
  return g;
}

/* ------------------------------------------------------------------ build */

export function buildIsland(scene, { reduceMotion }) {
  const updaters = [];
  const frames = [];

  terrain(scene);
  workbenchDesk(scene);

  const research = tower(scene, reduceMotion, updaters);
  const press = stage(scene, reduceMotion, updaters, frames);
  const builds = lab(scene, reduceMotion, updaters);
  const creds = hall(scene, frames);
  const skill = skills(scene, reduceMotion, updaters);
  const tools = shed(scene, reduceMotion, updaters, frames);
  const contact = mast(scene, reduceMotion, updaters);
  aboutMarker(scene, reduceMotion, updaters);

  const all = [research, press, builds, creds, skill, tools, contact];
  all.forEach((l) => { const p = l.group.position; path(scene, p.x, p.z); });

  trees(scene, [[0, 0, 7], [-12, -10, 4.5], [11, -11, 7], [15, 3, 7.5], [1, 16, 8], [-15, 5, 6], [-9, -1.5, 4.5], [9, 12, 3.5], [4.3, -4.6, 2.5]]);

  /* world-space focus for each place */
  const toWorld = (l) => l.group.localToWorld(l.focus.clone());
  scene.updateMatrixWorld(true);

  const benchHit = new THREE.Mesh(new THREE.BoxGeometry(8.6, 3, 5.2), M.hit);
  benchHit.position.set(-1.1, 1, 0);
  scene.add(benchHit);

  const places = [
    { key: "bench", panel: "#about", label: "The workbench", focus: new THREE.Vector3(-0.6, 0.9, 0), dist: 7.5, lift: 2.2, dir: new THREE.Vector3(0.55, 0, 1), hits: [benchHit] },
    { key: "research", panel: "#research", label: "Research tower", focus: toWorld(research), dist: research.dist, lift: research.lift, hits: research.hits },
    { key: "stage", panel: "#work", anchor: "#work-robonari", label: "Bheenmal stage", focus: toWorld(press), dist: press.dist, lift: press.lift, hits: press.hits },
    { key: "lab", panel: "#work", anchor: "#work-attendance", label: "Robotics lab", focus: toWorld(builds), dist: builds.dist, lift: builds.lift, hits: builds.hits },
    { key: "hall", panel: "#experience", label: "Credentials hall", focus: toWorld(creds), dist: creds.dist, lift: creds.lift, hits: creds.hits },
    { key: "skills", panel: "#stack", label: "Skills", focus: toWorld(skill), dist: skill.dist, lift: skill.lift, hits: skill.hits },
    { key: "shed", panel: "#toolchain", label: "Toolchain", focus: toWorld(tools), dist: tools.dist, lift: tools.lift, hits: tools.hits },
    { key: "mast", panel: "#contact", label: "Say hello", focus: toWorld(contact), dist: contact.dist, lift: contact.lift, hits: contact.hits }
  ];

  /* every landmark faces the centre, so the camera arrives from the centre side */
  places.forEach((p) => {
    if (!p.dir) p.dir = new THREE.Vector3(-p.focus.x, 0, -p.focus.z).normalize();
    p.hits.forEach((h) => { h.userData.place = p.key; });
  });

  return {
    places,
    frames,
    skillItems: skill.ring.items,
    update(dt, t) {
      updaters.forEach((u) => u(dt, t));
    }
  };
}
