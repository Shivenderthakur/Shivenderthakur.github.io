/* The island. Terrain, paths, and one landmark per part of the page.
   The workbench with the arm stands at the centre, its desk top at y = 0,
   because the arm's inverse kinematics are written around the world origin.
   Everything else stands on the ground below it. */

import * as THREE from "three";
import { roundedBox } from "./bench.js";
import { RIGS } from "./stations.js";
import { makeSkillRing } from "./icons.js";
import { pbr, loadProp } from "./realism.js";

export const GROUND = -1.4;
const coarseDevice = window.matchMedia("(pointer: coarse)").matches;
const AMBER = 0xf0a31e;

const M = {
  grass: pbr("forest_ground_04", { repeat: [9, 9], color: 0x9aa89a, normalScale: 1.2 }),
  rock: pbr("rocky_terrain_02", { repeat: [7, 3], color: 0x8a8f8a, normalScale: 1.5 }),
  path: pbr("rocky_terrain_02", { repeat: [1, 12], color: 0xb8ab90 }),
  wood: pbr("wood_table_worn", { repeat: [0.35, 0.35], color: 0xc9b9a0 }),
  wall: pbr("metal_plate", { repeat: [3, 2], color: 0x5f6f69, metalness: 0.6, roughness: 1 }),
  trim: pbr("metal_plate", { repeat: [2, 2], color: 0x7d8a84, metalness: 0.8, roughness: 1 }),
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
  const needles = new THREE.MeshStandardMaterial({ color: 0x1f3d2c, roughness: 0.92, metalness: 0 });
  const bark = pbr("wood_table_worn", { repeat: [0.4, 1.4], color: 0x6b5a48 });
  for (let i = 0; i < 70; i++) {
    const a = Math.random() * Math.PI * 2, d = 6 + Math.random() * 16.5;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (avoid.some(([ax, az, ar]) => Math.hypot(x - ax, z - az) < ar)) continue;
    /* distance from the tree to the line between the island centre and each landmark */
    const inPath = avoid.some(([ax, az]) => {
      const len2 = ax * ax + az * az;
      if (len2 < 1) return false;
      const k = Math.max(0, Math.min(1, (x * ax + z * az) / len2));
      return Math.hypot(x - ax * k, z - az * k) < 3.2;
    });
    if (inPath) continue;
    const t = new THREE.Group();
    const h = 2.2 + Math.random() * 2.2;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.16, h * 0.55, 10), bark);
    trunk.position.y = h * 0.27;
    t.add(trunk);
    const tiers = 4 + Math.floor(Math.random() * 2);
    for (let k = 0; k < tiers; k++) {
      const f = 1 - k / tiers;
      const r = (0.45 + Math.random() * 0.12) * (0.55 + f * 0.9);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h * 0.34, 14, 1, true), needles);
      cone.position.y = h * 0.3 + k * h * 0.17;
      cone.rotation.y = Math.random() * Math.PI;
      cone.rotation.z = (Math.random() - 0.5) * 0.08;
      t.add(cone);
    }
    t.rotation.y = Math.random() * Math.PI;
    t.scale.setScalar(0.85 + Math.random() * 0.35);
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
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(fw, fh), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0, envMapIntensity: 0.4 }));
  pic.position.z = 0.035;
  pic.userData = { full, alt, src };
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
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.52), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.55, roughness: 0.6, side: THREE.DoubleSide }));
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
  const fabric = new THREE.MeshPhysicalMaterial({ color: 0xa8281f, roughness: 0.78, sheen: 1, sheenColor: 0xff8a6a, sheenRoughness: 0.5 });
  const shell = new THREE.MeshPhysicalMaterial({ color: 0xd9dcd6, roughness: 0.3, metalness: 0.1, clearcoat: 0.8, clearcoatRoughness: 0.15 });
  const joint = new THREE.MeshPhysicalMaterial({ color: 0x2a302d, roughness: 0.35, metalness: 0.8 });
  const lathe = (pts, m, seg = 36) => new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg), m);
  const dress = lathe([[0.05, 0], [0.62, 0.02], [0.5, 0.6], [0.34, 1.25], [0.26, 1.62], [0.0, 1.64]], fabric);
  const chest = lathe([[0.0, 1.55], [0.3, 1.58], [0.36, 1.9], [0.27, 2.18], [0.1, 2.24], [0.0, 2.24]], fabric);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.16, 20), joint);
  neck.position.y = 2.3;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 40, 30), shell);
  head.scale.set(0.92, 1.08, 1);
  head.position.y = 2.58;
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.206, 40, 20, Math.PI / 2 - 1.05, 2.1, 1.2, 0.6),
    new THREE.MeshPhysicalMaterial({ color: 0x07100e, roughness: 0.05, clearcoat: 1, metalness: 0.2 }));
  visor.position.y = 2.58;
  const eyes = [-0.07, 0.07].map((ex) => {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), new THREE.MeshBasicMaterial({ color: 0x9fe6ff }));
    e.position.set(ex, 2.6, 0.2);
    return e;
  });
  const limb = () => {
    const g = new THREE.Group();
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.34, 8, 16), shell);
    upper.position.y = -0.22;
    const elbowJ = new THREE.Mesh(new THREE.SphereGeometry(0.07, 20, 14), joint);
    elbowJ.position.y = -0.44;
    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.052, 0.3, 8, 16), shell);
    fore.position.y = -0.64;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.07, 20, 14), joint);
    hand.scale.set(0.8, 1.2, 0.6);
    hand.position.y = -0.86;
    g.add(upper, elbowJ, fore, hand);
    return g;
  };
  const armL = limb(); armL.position.set(-0.38, 2.12, 0); armL.rotation.z = 2.6;
  const armR = limb(); armR.position.set(0.38, 2.12, 0); armR.rotation.z = -2.6;
  const shoulderL = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 14), joint); shoulderL.position.set(-0.38, 2.12, 0);
  const shoulderR = shoulderL.clone(); shoulderR.position.x = 0.38;
  bot.add(dress, chest, neck, head, visor, ...eyes, armL, armR, shoulderL, shoulderR);
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
  return { group: g, focus: new THREE.Vector3(0, 2.2, -0.8), dist: 13.5, lift: -0.4, hits: [hit], panelAnchor: "#work-attendance" };
}

/* A certificate hung the way a hall of fame hangs one: a matte brass moulding,
   a cream mount, a lamp above and an engraved plate below. */
const BRASS = new THREE.MeshStandardMaterial({ color: 0xa88a58, roughness: 0.62, metalness: 0.45 });
const MOUNT = new THREE.MeshStandardMaterial({ color: 0xe6e0cf, roughness: 0.95, metalness: 0 });
const LAMP = new THREE.MeshStandardMaterial({ color: 0x1b2321, roughness: 0.8, metalness: 0.2 });

function plateTexture(title, sub) {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 112;
  const ctx = c.getContext("2d");
  const grad = ctx.createLinearGradient(0, 0, 0, 112);
  grad.addColorStop(0, "#b3955f"); grad.addColorStop(1, "#8a6f43");
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 512, 112);
  ctx.strokeStyle = "rgba(40,28,10,0.55)"; ctx.lineWidth = 3; ctx.strokeRect(6, 6, 500, 100);
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillStyle = "#23180a"; ctx.font = "600 38px Archivo, Arial, sans-serif";
  ctx.fillText(title, 256, 42, 480);
  ctx.fillStyle = "#3b2c14"; ctx.font = "26px 'IBM Plex Mono', monospace";
  ctx.fillText(sub, 256, 82, 480);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function honour(parent, item, x, y, z, frames) {
  const aspect = item.h / item.w;
  const fw = Math.min(1.7, 1.3 / aspect), fh = fw * aspect;
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);

  const mount = new THREE.Mesh(new THREE.BoxGeometry(fw + 0.26, fh + 0.26, 0.04), MOUNT);
  g.add(mount);
  const bar = (w, h, px, py) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.09), BRASS); b.position.set(px, py, 0.02); g.add(b); };
  const ow = fw + 0.38, oh = fh + 0.38;
  bar(ow, 0.08, 0, oh / 2 - 0.04); bar(ow, 0.08, 0, -oh / 2 + 0.04);
  bar(0.08, oh, ow / 2 - 0.04, 0); bar(0.08, oh, -ow / 2 + 0.04, 0);

  const tex = loader.load(item.src);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(fw, fh), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, metalness: 0, envMapIntensity: 0.35 }));
  pic.position.z = 0.03;
  pic.userData = { full: item.full, alt: item.alt, src: item.src };
  g.add(pic);
  frames.push(pic);

  const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 0.3),
    new THREE.MeshStandardMaterial({ map: plateTexture(item.title, item.sub), roughness: 0.55, metalness: 0.3 }));
  plate.position.set(0, -oh / 2 - 0.22, 0.02);
  g.add(plate);

  /* picture lamp: an arm off the wall, a hood, and a warm strip under it */
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.34, 8), LAMP);
  arm.rotation.x = Math.PI / 2;
  arm.position.set(0, oh / 2 + 0.16, 0.17);
  const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.5, 16), LAMP);
  hood.rotation.z = Math.PI / 2;
  hood.position.set(0, oh / 2 + 0.16, 0.34);
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.012, 0.03), new THREE.MeshBasicMaterial({ color: 0xffd9a0 }));
  strip.position.set(0, oh / 2 + 0.125, 0.34);
  g.add(arm, hood, strip);
  return g;
}

function hall(scene, frames) {
  const g = landmark(scene, "hall", 1, 16);
  const W = 16;
  const floor = new THREE.Mesh(new THREE.BoxGeometry(W, 0.3, 6), M.trim);
  floor.position.y = 0.15;
  g.add(floor);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(W, 6.2, 0.3), new THREE.MeshStandardMaterial({ color: 0x22302c, roughness: 0.92 }));
  wall.position.set(0, 3.4, -2.7);
  g.add(wall);
  const dado = new THREE.Mesh(new THREE.BoxGeometry(W, 0.12, 0.12), BRASS);
  dado.position.set(0, 0.95, -2.5);
  g.add(dado);
  const runner = new THREE.Mesh(new THREE.PlaneGeometry(W - 1.5, 1.6), new THREE.MeshStandardMaterial({ color: 0x5a1f1a, roughness: 1 }));
  runner.rotation.x = -Math.PI / 2;
  runner.position.set(0, 0.31, -0.6);
  g.add(runner);
  for (const x of [-W / 2 + 0.4, W / 2 - 0.4]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 6.2, 16), M.steel);
    col.position.set(x, 3.4, 2.5);
    g.add(col);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(W + 0.4, 0.55, 6), M.roof);
  lintel.position.y = 6.75;
  g.add(lintel);

  const C = "assets/certs/";
  const certs = [
    ["nptel-deep-learning-iit-ropar-2025", 280, 200, "NPTEL Elite certificate in Deep Learning, IIT Ropar, 2025", "DEEP LEARNING", "NPTEL Elite · IIT Ropar"],
    ["cadd-autofina-robotics-360h-2023", 280, 198, "Advanced certificate in Robotics and Automation, CADD Centre and Autofina Robotics, 360 hours, 2023", "ROBOTICS & AUTOMATION", "CADD Centre · 360 h"],
    ["roboai-hub-180-day-internship-2024", 280, 384, "RoboAI Hub certificate for a 180-day AI internship programme, 2024", "AI INTERNSHIP", "RoboAI Hub · 180 days"],
    ["ccna-enterprise-networking-2023", 280, 189, "Cisco CCNAv7 Enterprise Networking, Security and Automation, 2023", "CCNAv7 ENTERPRISE", "Cisco · 2023"],
    ["ccna-switching-routing-2023", 280, 189, "Cisco CCNAv7 Switching, Routing and Wireless Essentials, 2023", "CCNAv7 SWITCHING", "Cisco · 2023"],
    ["straightarc-cyber-security-2024", 280, 157, "StraightArc certificate in Cyber Security Fundamentals, 12 hours, 2024", "CYBER SECURITY", "StraightArc · 12 h"],
    ["pm-shri-kv-mount-abu-2025", 280, 406, "Certificate for training delivered at PM SHRI Kendriya Vidyalaya, Mount Abu, 2025", "TRAINING DELIVERED", "PM SHRI KV · Mount Abu"],
    ["academor-2023", 280, 217, "Academor certificate of outstanding performance, 2023", "OUTSTANDING PERFORMANCE", "Academor · 2023"],
    ["linkedin-linux-cli-2025", 280, 217, "LinkedIn Learning certificate, Learning Linux Command Line, 2025", "LINUX COMMAND LINE", "LinkedIn Learning"],
    ["linkedin-ecmascript-2025", 280, 217, "LinkedIn Learning certificate, Learning ECMAScript 6+, 2025", "ECMASCRIPT 6+", "LinkedIn Learning"],
    ["devtown-python-ai-2023", 280, 208, "devTown certificate, seven-day Python and AI bootcamp, 2023", "PYTHON & AI", "devTown · 2023"]
  ];
  const STEP = 2.45;
  certs.forEach(([n, w, h, alt, title, sub], i) => {
    const row = i < 6 ? 0 : 1;
    const col = row === 0 ? i : i - 6;
    const count = row === 0 ? 6 : 5;
    honour(g, { src: C + n + ".jpg", full: C + n + "-full.jpg", w, h, alt, title, sub },
      -((count - 1) * STEP) / 2 + col * STEP, row === 0 ? 4.55 : 2.2, -2.5, frames);
  });
  const s = sign("HALL OF FAME"); s.position.set(0, 6.75, 3.02); g.add(s);
  for (const x of [-5, 0, 5]) {
    const light = new THREE.SpotLight(0xffe6c0, 16, 14, 0.75, 0.6, 1.6);
    light.position.set(x, 6.2, 1.8);
    light.target.position.set(x, 3.2, -2.5);
    g.add(light, light.target);
  }
  shadows(g);
  const hit = hitBox(g, W + 0.5, 7, 6.5, 3.4);
  return { group: g, focus: new THREE.Vector3(0, 3.2, -1.6), dist: 18.5, lift: -0.8, hits: [hit] };
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

  const place = (group, name, size, x, y, z, ry = 0) =>
    loadProp(name, size).then((prop) => {
      if (!prop) return;
      prop.position.set(x, y, z);
      prop.rotation.y = ry;
      group.add(prop);
    });
  place(tools.group, "desk_lamp_arm_01", 1.3, 1.45, 1.06, -0.75, -0.6);
  place(tools.group, "classic_laptop", 0.85, -1.15, 1.06, 0.05, 0.25);
  place(tools.group, "metal_toolbox", 1.0, -2.05, 0.2, 1.05, 0.3);
  place(builds.group, "industrial_microscope", 0.95, -3.9, 1.06, -0.25, 0.4);
  place(press.group, "Television_01", 1.2, 3.4, 0.8, 0.7, -0.35);
  const board = new THREE.Group();
  board.position.set(6.6, 0.3, 1.6);
  creds.group.add(board);
  board.add(plinth(0.7, 1.0));
  place(board, "circuit_board", 1.1, 0, 1.02, 0, 0.3);

  /* the hardware shelf in the lab: the boards and sensors the work ran on,
     converted from their CAD exports, and the arm itself on a turntable */
  const shelf = (y) => {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.08, 0.6), M.wood);
    plank.position.set(0, y, -3.0);
    builds.group.add(plank);
    for (const x of [-4.2, 0, 4.2]) {
      const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 0.5), M.steel);
      bracket.position.set(x, y - 0.18, -3.02);
      builds.group.add(bracket);
    }
  };
  shelf(2.3); shelf(3.05);
  const hw = coarseDevice
    ? [["boards/arduino-uno", 1.1, -1.4, 3.09, -0.7], ["sensors/hc-sr04-ultrasonic", 0.8, 1.4, 3.09, -0.3]]
    : [
        ["boards/arduino-uno", 1.15, -3.3, 3.09, -0.7],
        ["boards/raspberry-pi-5", 1.15, -1.1, 3.09, -0.7],
        ["boards/raspberry-pi-4b", 1.15, 1.1, 3.09, -0.7],
        ["boards/arduino-nano-every", 1.0, 3.3, 3.09, -0.7],
        ["sensors/hc-sr04-ultrasonic", 0.8, -3.8, 2.34, -0.3],
        ["sensors/pir-motion", 0.5, -2.55, 2.34, 0],
        ["sensors/ir-sensor", 0.75, -1.3, 2.34, -0.5],
        ["sensors/dht11-temperature-humidity", 0.48, -0.1, 2.34, 0],
        ["sensors/imu-accelerometer-gyroscope", 0.62, 1.1, 2.34, -0.6],
        ["sensors/mq135-air-quality", 0.62, 2.35, 2.34, -0.3],
        ["sensors/touch-sensor", 0.7, 3.65, 2.34, -0.6]
      ];
  hw.forEach(([name, size, x, y, tilt]) =>
    loadProp(name, size).then((prop) => {
      if (!prop) return;
      prop.position.set(x, y, -3.0);
      prop.rotation.x = tilt;
      builds.group.add(prop);
    }));
  loadProp("robotics/robotic-arm", 1.7).then((arm) => {
    if (!arm) return;
    const turntable = new THREE.Group();
    turntable.position.set(3.7, 0.2, 1.7);
    turntable.add(plinth(0.75, 0.5));
    arm.position.y = 0.5;
    turntable.add(arm);
    builds.group.add(turntable);
    updaters.push((dt) => { if (!reduceMotion) arm.rotation.y += dt * 0.35; });
  });
  place(scene, "desk_lamp_arm_01", 1.6, 2.3, 0, -1.9, -2.3);
  all.forEach((l) => { const p = l.group.position; path(scene, p.x, p.z); });

  /* the last three keep the hall's camera line clear: it stands well back so the
     whole wall of certificates fits, offset to the side of the open panel */
  trees(scene, [[0, 0, 7], [-12, -10, 4.5], [11, -11, 7], [15, 3, 7.5], [1, 16, 8], [-15, 5, 6], [-9, -1.5, 4.5], [9, 12, 3.5], [4.3, -4.6, 2.5],
    [-3.2, 3.5, 3.4], [-1.6, 8.2, 3.6], [-0.2, 11.8, 3.4], [3.2, 12.4, 2.8]]);

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
    /* approach the shed at an angle: straight from the centre the camera passes the workbench monitor */
    { key: "shed", panel: "#toolchain", label: "Toolchain", focus: toWorld(tools), dist: tools.dist, lift: tools.lift, hits: tools.hits, dir: new THREE.Vector3(0.58, 0, 0.81).normalize() },
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
