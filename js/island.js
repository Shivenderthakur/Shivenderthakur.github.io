/* The island, laid out as a small tech campus in metres, for a reader 1.75 m tall:
   a plaza with the workbench at its centre, one building per part of the page, and
   walkways drawn as circuit traces between them. The workbench itself (desk, chair,
   computer and arm) is built by bench.js at the plaza centre; this module builds
   everything round it.

   Where each thing stands, its pad, its solids and floors, the zones, doors and the
   start point all come from layout.js, which tools/checks/zones.mjs checks under
   Node. The sizes of the things inside the buildings are here, and follow the real
   objects: tables 75 cm high, certificates printed about A4, boards and sensors at
   their true size. */

import * as THREE from "three";
import { roundedBox } from "./bench.js";
import { RIGS } from "./stations.js";
import { makeSkillRing } from "./icons.js";
import { pbr, loadProp } from "./realism.js";
import { MAT, plaza, pad, traces, planter, lamp, groundLabel, curtain, rimTiles, door } from "./campus.js";
import * as L from "./layout.js";

export const GROUND = L.GROUND;
const coarseDevice = window.matchMedia("(pointer: coarse)").matches;
const AMBER = 0xf0a31e;

const M = {
  ground: MAT.ground,
  rock: pbr("rocky_terrain_02", { repeat: [7, 3], color: 0x8a8f8a, normalScale: 1.5 }),
  wood: pbr("wood_table_worn", { repeat: [0.35, 0.35], color: 0xc9b9a0 }),
  wall: MAT.glass,
  trim: pbr("metal_plate", { repeat: [2, 2], color: 0x7d8a84, metalness: 0.8, roughness: 1 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x9aa6a0, roughness: 0.4, metalness: 0.7 }),
  roof: new THREE.MeshStandardMaterial({ color: 0x1c2523, roughness: 0.55, metalness: 0.6 }),
  cloth: new THREE.MeshStandardMaterial({ color: 0xb8372a, roughness: 0.8 }),
  skin: new THREE.MeshStandardMaterial({ color: 0xc89a7a, roughness: 0.7 }),
  glow: new THREE.MeshBasicMaterial({ color: AMBER }),
  frame: new THREE.MeshStandardMaterial({ color: 0x151d1b, roughness: 0.6, metalness: 0.3 }),
  hit: new THREE.MeshBasicMaterial({ visible: false })
};

const loader = new THREE.TextureLoader();
const shadows = (o) => o.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/* ---------------------------------------------------------------- terrain */

function terrain(scene) {
  const top = new THREE.CylinderGeometry(L.ISLAND.radius, 21, 2.4, 72, 3);
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
  const land = new THREE.Mesh(top, M.ground);
  land.position.y = GROUND - 1.2;
  land.receiveShadow = true;
  scene.add(land);

  const under = new THREE.Mesh(new THREE.ConeGeometry(21, 16, 40, 4), M.rock);
  under.rotation.x = Math.PI;
  under.position.y = GROUND - 2.4 - 8;
  scene.add(under);

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

/* ----------------------------------------------------------------- frames */

/* A real scan hung in the world, `width` metres wide in a thin dark frame.
   Clicking it opens the full-size image. */
function frame(parent, { src, full, w, h, alt }, width, x, y, z, ry = 0, frames) {
  const fw = width, fh = width * (h / w);
  const border = clamp(Math.min(fw, fh) * 0.07, 0.02, 0.045);
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  const back = new THREE.Mesh(new THREE.BoxGeometry(fw + border * 2, fh + border * 2, 0.025), M.frame);
  g.add(back);
  const tex = loader.load(src);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(fw, fh), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0, envMapIntensity: 0.4 }));
  pic.position.z = 0.0135;
  pic.userData = { full, alt, src };
  g.add(pic);
  parent.add(g);
  frames.push(pic);
  return g;
}

/* the width that makes a picture's longer side `long` metres */
const widthForLongSide = (item, long) => long / Math.max(1, item.h / item.w);

/* ---------------------------------------------------------------- helpers */

/* A RIGS builder at `scale`. The rigs were drawn a few metres across with their own
   fill lights; at desk size each light's reach and strength shrink with the rig, so
   it lights its rig rather than the building round it. */
function rig(name, scale, updaters) {
  const built = RIGS[name]();
  built.scene.scale.setScalar(scale);
  built.scene.traverse((o) => {
    if (o.isPointLight) {
      o.distance *= scale * 1.5;
      o.intensity *= scale * scale * 1.5;
    }
  });
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

function hitBox(group, w, h, d, y, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M.hit);
  m.position.set(0, y, z);
  group.add(m);
  return m;
}

/* a building sign, 2.4 m by 45 cm */
function sign(text) {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 96;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#0f1b25"; ctx.fillRect(0, 0, 512, 96);
  ctx.strokeStyle = "#9ad9ee"; ctx.lineWidth = 4; ctx.strokeRect(6, 6, 500, 84);
  ctx.fillStyle = "#eef4f6"; ctx.font = "600 46px 'Titillium Web', Arial, sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(text, 256, 50);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.45), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.55, roughness: 0.6, side: THREE.DoubleSide }));
  return m;
}

/* a landmark's group, placed and turned as layout.js says, standing on its pad */
function landmark(scene, key) {
  const site = L.LANDMARKS[key];
  const g = new THREE.Group();
  g.position.set(site.x, GROUND, site.z);
  g.rotation.y = site.ry;
  g.userData.key = key;
  scene.add(g);
  const [cx, cz, w, d] = site.pad;
  pad(g, cx, cz, w, d, 0, 0);
  return { g, site };
}

/* A table or lab bench whose top is TABLE_TOP above the floor at floorY: a 4 cm top,
   four square legs and a low shelf between them. */
function table(parent, x, z, w, d, floorY) {
  const legH = L.TABLE_TOP - 0.04;
  const top = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, d), M.wood);
  top.position.set(x, floorY + L.TABLE_TOP - 0.02, z);
  parent.add(top);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, legH, 0.05), M.trim);
    leg.position.set(x + sx * (w / 2 - 0.06), floorY + legH / 2, z + sz * (d / 2 - 0.06));
    parent.add(leg);
  }
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(w - 0.12, 0.02, d - 0.12), M.trim);
  shelf.position.set(x, floorY + 0.18, z);
  parent.add(shelf);
  return floorY + L.TABLE_TOP;
}

/* ---------------------------------------------------------------- landmarks */

function tower(scene, updaters) {
  const { g, site } = landmark(scene, "research");
  let y = 0;
  site.drums.forEach(([r, h], i) => {
    /* ten sides, turned so a flat face looks at the plaza */
    const s = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.92, r, h, 10, 1, false, Math.PI / 10), i % 2 ? M.trim : M.wall);
    s.position.y = y + h / 2;
    g.add(s);
    const band = new THREE.Mesh(new THREE.TorusGeometry(r * 0.94, 0.05, 6, 30), M.glow);
    band.rotation.x = Math.PI / 2;
    band.position.y = y + h;
    g.add(band);
    y += h;
  });

  /* the door, on the front face of the lowest drum and leaning with it */
  const [r0, h0] = site.drums[0];
  const apothem = Math.cos(Math.PI / 10);
  const lean = Math.atan((r0 * 0.08 * apothem) / h0);
  const d = door(site.door.w, site.door.h);
  d.position.z = r0 * apothem - 0.02;
  d.rotation.x = -lean;
  g.add(d);
  const s = sign("RESEARCH");
  const signY = site.door.h + 0.45;
  s.position.set(0, signY, (r0 - (signY / h0) * r0 * 0.08) * apothem + 0.04);
  s.rotation.x = -lean;
  g.add(s);

  const deck = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 0.2, 32), M.trim);
  deck.position.y = y + 0.1;
  g.add(deck);
  const sprint = rig("sprint", 0.55, updaters);
  sprint.position.y = y + 0.25;
  g.add(sprint);
  shadows(g);
  const hit = hitBox(g, 5, y + 1.5, 5, (y + 1.5) / 2);
  return { group: g, focus: new THREE.Vector3(0, 3.5, 0), dist: 12, lift: 0, hits: [hit] };
}

function stage(scene, reduceMotion, updaters, frames) {
  const { g, site } = landmark(scene, "stage");
  const { w: DW, d: DD, h: DH } = site.deck;
  const deck = new THREE.Mesh(roundedBox(DW, DH, DD, 0.05), M.trim);
  deck.position.y = DH / 2;
  g.add(deck);
  /* steps up the front at one side: 20 cm risers */
  const st = site.steps;
  for (let k = 1; k <= st.count; k++) {
    const top = DH - st.rise * k, depth = st.run * k;
    const step = new THREE.Mesh(new THREE.BoxGeometry(st.w, top, depth), M.trim);
    step.position.set(st.x, top / 2, DD / 2 + depth / 2);
    g.add(step);
  }
  const back = curtain(9.4, 5.2, 0.3);
  back.position.set(0, DH + 2.6, -2.6);
  g.add(back);
  const truss = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.5, 0.5), M.roof);
  truss.position.set(0, 6.1, -2.4);
  const trussLed = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.05, 0.05), MAT.led);
  trussLed.position.set(0, 5.82, -2.14);
  g.add(truss, trussLed);

  /* the humanoid, as a stand-in: the real one is in the photographs behind it.
     Built 2.82 units tall and stood on the deck at 1.6 m. */
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
  bot.scale.setScalar(1.6 / 2.82);
  bot.position.set(0, DH, 0.4);
  g.add(bot);
  updaters.push((dt, t) => {
    if (reduceMotion) return;
    armL.rotation.z = 2.6 + Math.sin(t * 1.4) * 0.2;
    armR.rotation.z = -2.6 - Math.sin(t * 1.4) * 0.2;
    head.rotation.y = Math.sin(t * 0.6) * 0.4;
  });

  /* the photograph and the four clippings, long side 60 to 80 cm, hung on the
     backdrop with their centres 1.8 m above the deck */
  const P = "assets/press/", E = "assets/events/";
  const items = [
    { src: E + "robonari-on-stage-bheenmal-2024.webp", full: E + "robonari-on-stage-bheenmal-2024-full.webp", w: 480, h: 778, alt: "The humanoid on stage at Bheenmal", long: 0.8 },
    { src: P + "robonari-marudhar-aaina-2024.webp", full: P + "robonari-marudhar-aaina-2024-full.webp", w: 400, h: 809, alt: "Marudhar Aaina", long: 0.8 },
    { src: P + "robonari-dainik-nirala-2024.webp", full: P + "robonari-dainik-nirala-2024-full.webp", w: 400, h: 643, alt: "Dainik Nirala Rajasthan News", long: 0.7 },
    { src: P + "robonari-sach-media-2024.webp", full: P + "robonari-sach-media-2024-full.webp", w: 400, h: 400, alt: "Sach Media News Network", long: 0.6 },
    { src: P + "robonari-jagruk-times-2024.webp", full: P + "robonari-jagruk-times-2024-full.webp", w: 400, h: 733, alt: "Jagruk Times", long: 0.75 }
  ];
  items.forEach((it, i) => frame(g, it, widthForLongSide(it, it.long), -2.6 + i * 1.3, DH + 1.8, -2.42, 0, frames));

  const s = sign("BHEENMAL 2024"); s.position.set(0, DH + 2.75, -2.43); g.add(s);
  const spot = new THREE.PointLight(0xffe2b0, 18, 12, 2);
  spot.position.set(0, 5, 2);
  g.add(spot);
  shadows(g);
  const hit = hitBox(g, 10, 7, 6, 3.3);
  return { group: g, focus: new THREE.Vector3(0, DH + 1.2, -0.6), dist: 8, lift: 0, hits: [hit] };
}

function lab(scene, updaters) {
  const { g, site } = landmark(scene, "lab");
  const FL = site.floor.top;
  const floor = new THREE.Mesh(new THREE.BoxGeometry(site.floor.w, FL, site.floor.d), M.trim);
  floor.position.y = FL / 2;
  g.add(floor);
  /* glass walls 4 m tall on three sides; the room is 3.9 m to the roof and open to the plaza */
  const wallB = curtain(10, 4, 0.25); wallB.position.set(0, 2.1, -3.4); g.add(wallB);
  const wallL = curtain(7, 4, 0.25); wallL.rotation.y = Math.PI / 2; wallL.position.set(-5, 2.1, 0); g.add(wallL);
  const wallR = curtain(7, 4, 0.25); wallR.rotation.y = -Math.PI / 2; wallR.position.set(5, 2.1, 0); g.add(wallR);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(10.6, 0.28, 7.6), M.roof);
  roof.position.y = 4.25;
  const eave = new THREE.Mesh(new THREE.BoxGeometry(10.6, 0.05, 0.05), MAT.led);
  eave.position.set(0, 4.08, 3.82);
  g.add(roof, eave);

  /* three lab benches along the back wall, a rig on each at desk size */
  const b = site.benches;
  let top = FL;
  b.xs.forEach((x) => { top = table(g, x, b.z, b.w, b.d, FL); });
  [["roster", b.xs[0] + 0.35, 0.36], ["hand", b.xs[1], 0.33], ["trace", b.xs[2], 0.27]].forEach(([name, x, up]) => {
    const r = rig(name, 0.3, updaters);
    r.position.set(x, top + up, b.z);
    g.add(r);
  });
  /* the turntable for the arm; the arm itself loads in buildIsland */
  const tt = site.turntable;
  const turntable = new THREE.Group();
  turntable.position.set(tt.x, FL, tt.z);
  turntable.add(plinth(tt.r, tt.h));
  g.add(turntable);

  const s = sign("ROBOTICS LAB"); s.position.set(0, 2.9, -3.25); g.add(s);
  const lampLight = new THREE.PointLight(0xcfe8dd, 14, 12, 2);
  lampLight.position.set(0, 3.4, 0.5);
  g.add(lampLight);
  shadows(g);
  const hit = hitBox(g, 10.5, 4.4, 7.5, 2.2);
  return { group: g, focus: new THREE.Vector3(0, 1.3, -1.5), dist: 7, lift: 0.3, hits: [hit], turntable };
}

/* A certificate hung the way a hall of fame hangs one: a matte brass moulding,
   a cream mount, an engraved plate below and, on the upper row, a picture lamp.
   The picture is printed about A4: at most 30 cm on either side, so a landscape
   certificate is 30 x 21 cm and a portrait one 21 x 30 cm. The mount adds 1.5 cm
   round it and the moulding another 1.5 cm, so the widest frame is 36 cm. */
const BRASS = new THREE.MeshStandardMaterial({ color: 0xa88a58, roughness: 0.62, metalness: 0.45 });
const MOUNT = new THREE.MeshStandardMaterial({ color: 0xe6e0cf, roughness: 0.95, metalness: 0 });
const LAMP = new THREE.MeshStandardMaterial({ color: 0x1b2321, roughness: 0.8, metalness: 0.2 });
const HONOUR = { wide: 0.3, tall: 0.3, plate: 0.2, mount: 0.015, moulding: 0.015 };

function plateTexture(title, sub) {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 112;
  const ctx = c.getContext("2d");
  const grad = ctx.createLinearGradient(0, 0, 0, 112);
  grad.addColorStop(0, "#b3955f"); grad.addColorStop(1, "#8a6f43");
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 512, 112);
  ctx.strokeStyle = "rgba(40,28,10,0.55)"; ctx.lineWidth = 3; ctx.strokeRect(6, 6, 500, 100);
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillStyle = "#23180a"; ctx.font = "600 40px 'Titillium Web', Arial, sans-serif";
  ctx.fillText(title, 256, 42, 480);
  ctx.fillStyle = "#3b2c14"; ctx.font = "26px 'Share Tech Mono', monospace";
  ctx.fillText(sub, 256, 82, 480);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function honour(parent, item, x, y, z, frames, withLamp) {
  const aspect = item.h / item.w;
  const fw = Math.min(HONOUR.wide, HONOUR.tall / aspect), fh = fw * aspect;
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);

  const mw = fw + 2 * HONOUR.mount, mh = fh + 2 * HONOUR.mount;
  const mount = new THREE.Mesh(new THREE.BoxGeometry(mw, mh, 0.01), MOUNT);
  g.add(mount);
  const t = HONOUR.moulding, ow = mw + 2 * t, oh = mh + 2 * t;
  const bar = (w, h, px, py) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.02), BRASS); b.position.set(px, py, 0.01); g.add(b); };
  bar(ow, t, 0, oh / 2 - t / 2); bar(ow, t, 0, -oh / 2 + t / 2);
  bar(t, oh, ow / 2 - t / 2, 0); bar(t, oh, -ow / 2 + t / 2, 0);

  const tex = loader.load(item.src);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(fw, fh), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, metalness: 0, envMapIntensity: 0.35 }));
  pic.position.z = 0.0115;
  pic.userData = { full: item.full, alt: item.alt, src: item.src };
  g.add(pic);
  frames.push(pic);

  const plateH = HONOUR.plate * (112 / 512);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(HONOUR.plate, plateH),
    new THREE.MeshStandardMaterial({ map: plateTexture(item.title, item.sub), roughness: 0.55, metalness: 0.3 }));
  plate.position.set(0, -oh / 2 - 0.008 - plateH / 2, 0.006);
  g.add(plate);

  if (withLamp) {
    /* picture lamp: a short arm off the wall, a hood, and a warm strip under it */
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.1, 8), LAMP);
    arm.rotation.x = Math.PI / 2;
    arm.position.set(0, oh / 2 + 0.04, 0.05);
    const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, 0.2, 16), LAMP);
    hood.rotation.z = Math.PI / 2;
    hood.position.set(0, oh / 2 + 0.04, 0.1);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.004, 0.01), new THREE.MeshBasicMaterial({ color: 0xffd9a0 }));
    strip.position.set(0, oh / 2 + 0.028, 0.1);
    g.add(arm, hood, strip);
  }
  return g;
}

function hall(scene, frames) {
  const { g, site } = landmark(scene, "hall");
  const W = site.width, FL = site.floor.top;
  const floor = new THREE.Mesh(new THREE.BoxGeometry(W, FL, site.floor.d), M.trim);
  floor.position.y = FL / 2;
  g.add(floor);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(W, 6.2, 0.3), new THREE.MeshStandardMaterial({ color: 0x22302c, roughness: 0.92 }));
  wall.position.set(0, FL + 3.1, site.wallZ);
  g.add(wall);
  const face = site.wallZ + 0.15;
  const dado = new THREE.Mesh(new THREE.BoxGeometry(W, 0.05, 0.05), BRASS);
  dado.position.set(0, FL + 0.7, face + 0.025);
  g.add(dado);
  const runner = new THREE.Mesh(new THREE.PlaneGeometry(W - 1.5, 1.6), new THREE.MeshStandardMaterial({ color: 0x5a1f1a, roughness: 1 }));
  runner.rotation.x = -Math.PI / 2;
  runner.position.set(0, FL + 0.01, -0.6);
  g.add(runner);
  for (const [x, z] of site.columns) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 6.2, 16), M.steel);
    col.position.set(x, FL + 3.1, z);
    g.add(col);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(W + 0.4, 0.55, 6), M.roof);
  lintel.position.y = FL + 6.45;
  g.add(lintel);

  const C = "assets/certs/";
  const certs = [
    ["nptel-deep-learning-iit-ropar-2025", 280, 200, "NPTEL Elite certificate in Deep Learning, IIT Ropar, 2025", "DEEP LEARNING", "NPTEL Elite · IIT Ropar"],
    ["cadd-autofina-robotics-360h-2023", 280, 198, "Advanced certificate in Robotics and Automation, CADD Centre and Autofina Robotics, 360 hours, 2023", "ROBOTICS & AUTOMATION", "CADD Centre · 360 h"],
    ["roboai-hub-180-day-internship-2024", 280, 384, "RoboAI Hub certificate for a 180-day AI internship programme, 2024", "AI INTERNSHIP", "RoboAI Hub · 180 days"],
    ["roboai-hub-robotics-internship-2025", 280, 397, "RoboAI Hub certificate of internship in robotics, November 2023 to August 2025", "ROBOTICS INTERNSHIP", "RoboAI Hub · 2023–25"],
    ["itk-ai-internship-2023", 280, 198, "ITK (Ingenious Tech Key) certificate of internship in artificial intelligence, June to August 2023", "AI INTERNSHIP", "ITK · 2023"],
    ["ccna-enterprise-networking-2023", 280, 189, "Cisco CCNAv7 Enterprise Networking, Security and Automation, 2023", "CCNAv7 ENTERPRISE", "Cisco · 2023"],
    ["ccna-switching-routing-2023", 280, 189, "Cisco CCNAv7 Switching, Routing and Wireless Essentials, 2023", "CCNAv7 SWITCHING", "Cisco · 2023"],
    ["cisco-intro-to-networks-2023", 280, 190, "Cisco CCNAv7 Introduction to Networks, 2023", "CCNAv7 INTRODUCTION", "Cisco · 2023"],
    ["cisco-networking-essentials-2022", 280, 190, "Cisco Networking Essentials, 2022", "NETWORKING ESSENTIALS", "Cisco · 2022"],
    ["straightarc-cyber-security-2024", 280, 157, "StraightArc certificate in Cyber Security Fundamentals, 12 hours, 2024", "CYBER SECURITY", "StraightArc · 12 h"],
    ["pm-shri-kv-mount-abu-2025", 280, 406, "Certificate for training delivered at PM SHRI Kendriya Vidyalaya, Mount Abu, 2025", "TRAINING DELIVERED", "PM SHRI KV · Mount Abu"],
    ["academor-2023", 280, 217, "Academor certificate of outstanding performance, 2023", "OUTSTANDING PERFORMANCE", "Academor · 2023"],
    ["academor-flutura-ml-internship-2023", 280, 216, "Academor internship completion certificate in machine learning, with Flutura, 2023", "ML INTERNSHIP", "Academor · 2023"],
    ["academor-kshitij-ml-course-2023", 280, 216, "Academor course completion certificate in machine learning, with Kshitij, 2023", "MACHINE LEARNING COURSE", "Academor · 2023"],
    ["linkedin-linux-cli-2025", 280, 217, "LinkedIn Learning certificate, Learning Linux Command Line, 2025", "LINUX COMMAND LINE", "LinkedIn Learning"],
    ["linkedin-ecmascript-2025", 280, 217, "LinkedIn Learning certificate, Learning ECMAScript 6+, 2025", "ECMASCRIPT 6+", "LinkedIn Learning"],
    ["devtown-python-ai-2023", 280, 208, "devTown certificate, seven-day Python and AI bootcamp, 2023", "PYTHON & AI", "devTown · 2023"],
    ["aws-community-builders-devtown-python-ai", 280, 203, "AWS Community Builders and devTown certificate of completion, seven-day Python and AI bootcamp", "PYTHON & AI BOOTCAMP", "AWS CB · devTown"]
  ];
  /* two rows at eye level, heights and spacing from layout.js (site.rows, site.step);
     the widest frame with its moulding is 36 cm */
  const PER_ROW = Math.ceil(certs.length / 2);
  const rowSpan = (PER_ROW - 1) * site.step + 0.36;
  certs.forEach(([n, w, h, alt, title, sub], i) => {
    const row = i < PER_ROW ? 0 : 1;
    const col = row === 0 ? i : i - PER_ROW;
    const count = row === 0 ? PER_ROW : certs.length - PER_ROW;
    honour(g, { src: C + n + ".webp", full: C + n + "-full.webp", w, h, alt, title, sub },
      -((count - 1) * site.step) / 2 + col * site.step, FL + site.rows[row], face + 0.006, frames, row === 0);
  });
  const s = sign("HALL OF FAME"); s.position.set(0, FL + 2.9, face + 0.02); g.add(s);
  for (const x of [-5, 0, 5]) {
    const light = new THREE.SpotLight(0xffe6c0, 16, 14, 0.75, 0.6, 1.6);
    light.position.set(x, FL + 5.2, 1.8);
    light.target.position.set(x, FL + 1.6, site.wallZ);
    g.add(light, light.target);
  }
  shadows(g);
  const hit = hitBox(g, W + 0.5, 7, 6.5, 3.4);
  /* The close-up stands back just far enough to fit a whole row with 20 cm to
     spare each side. At the 50 degree camera on a 16:10 screen the view is about
     1.49 times as wide as it is far away, and the wall is 75 cm behind the focus.
     With frames 60 cm apart that is 3 m; never closer than that. */
  const dist = Math.max(3, (rowSpan + 0.4) / 1.49 - 0.75);
  return { group: g, focus: new THREE.Vector3(0, FL + 1.6, -1.8), dist, lift: 0, hits: [hit] };
}

function skills(scene, reduceMotion, updaters) {
  const { g, site } = landmark(scene, "skills");
  const top = L.PAD_TOP + site.plinth.h;
  g.add(plinth(site.plinth.r, top));
  const boards = rig("boards", 0.3, updaters);
  boards.position.y = top + 0.25;
  g.add(boards);
  const ring = makeSkillRing(reduceMotion, { radius: site.ring.radius, low: site.ring.low, high: site.ring.high, padY: site.plinth.h });
  ring.group.position.y = L.PAD_TOP;
  g.add(ring.group);
  updaters.push((dt, t) => {
    ring.update(dt, t);
    if (!reduceMotion) ring.group.rotation.y += dt * 0.08;
  });
  /* a glass wall behind the hardware showcase, with the sign on it */
  const bd = site.backdrop;
  const back = curtain(bd.w, bd.h, 0.2);
  back.position.set(0, L.PAD_TOP + bd.h / 2, bd.z);
  g.add(back);
  const s = sign("SKILLS"); s.position.set(0, L.PAD_TOP + 2.75, bd.z + 0.12); g.add(s);
  shadows(g);
  const sc = site.showcase;
  const hits = [
    hitBox(g, site.plinth.r * 2 + 0.6, 2.1, site.plinth.r * 2 + 0.6, L.PAD_TOP + 1.05),
    hitBox(g, sc.w + 0.2, sc.h, sc.d + 0.2, L.PAD_TOP + sc.h / 2, sc.z)
  ];
  return { group: g, focus: new THREE.Vector3(0, 1.4, -2.2), dist: 6.5, lift: 0.2, hits, ring, signMesh: s };
}

function shed(scene, updaters, frames) {
  const { g, site } = landmark(scene, "shed");
  const FL = site.floor.top;
  const floor = new THREE.Mesh(new THREE.BoxGeometry(site.floor.w, FL, site.floor.d), M.trim); floor.position.y = FL / 2; g.add(floor);
  const back = curtain(5.4, 3.4, 0.2); back.position.set(0, 1.8, -1.9); g.add(back);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(6, 0.2, 4.6), M.roof); roof.position.set(0, 3.6, 0); roof.rotation.x = -0.12; g.add(roof);
  const t = site.table;
  const top = table(g, t.x, t.z, t.w, t.d, FL);
  /* the bench of tools at desk size: a monitor about 55 cm wide, keyboard, breadboard */
  const props = rig("props", 0.34, updaters);
  props.position.set(t.x + 0.15, top - 0.02, t.z);
  g.add(props);
  /* photographs of the real bench, 40 by 53 cm at eye level */
  const B = "assets/bench/";
  [["workstation", "The desk"], ["raspberry-pi", "The Pi"], ["motor-driver-bench", "The motor bench"]].forEach(([n, alt], i) => {
    frame(g, { src: B + n + ".webp", full: B + n + "-full.webp", w: 480, h: 640, alt }, 0.4, -0.6 + i * 0.6, FL + 1.6, -1.77, 0, frames);
  });
  const s = sign("TOOLCHAIN"); s.position.set(0, FL + 2.6, -1.78); g.add(s);
  shadows(g);
  const hit = hitBox(g, 6, 4, 4.6, 2);
  return { group: g, focus: new THREE.Vector3(0, 1.3, -1.0), dist: 4.5, lift: 0.3, hits: [hit] };
}

function mast(scene, reduceMotion, updaters) {
  const { g, site } = landmark(scene, "mast");
  const base = plinth(site.plinth.r, site.plinth.h); g.add(base);
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
  /* the sign hangs between two posts in front of the mast, 3 m tall, so it reads
     at a person's height and you walk up to the mast underneath it */
  const gate = site.gate;
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, gate.h, 12), M.steel);
    post.position.set(side * gate.x, gate.h / 2, gate.z);
    g.add(post);
  }
  const s = sign("SAY HELLO"); s.position.set(0, gate.h - 0.25, gate.z); g.add(s);
  shadows(g);
  const hit = hitBox(g, 3.4, 11, 3.4, 5.4);
  return { group: g, focus: new THREE.Vector3(0, 4.2, 0), dist: 14, lift: 0, hits: [hit] };
}

/* The serial-link rig beside the workbench, part of the About panel: the link
   between an Arduino Nano and a Raspberry Pi, both at their true size, on a matte
   mat on a 90 cm plinth. Their centres are 20 cm apart, joined by a lead 5 mm
   thick with a pulse running along it, and above them a 20 cm scope trace shows
   the frame on the line: start bit low, eight data bits, stop bit high. The rig
   faces the start point, so the local +z side is the one the reader sees. */
function serialLink(scene, reduceMotion, updaters) {
  const at = L.SERIAL_LINK;
  const g = new THREE.Group();
  g.position.set(at.x, GROUND, at.z);
  g.rotation.y = Math.atan2(L.START.x - at.x, L.START.z - at.z);
  scene.add(g);
  g.add(plinth(at.r, at.h));

  /* a 46 x 24 cm mat, inside the amber ring on the plinth top */
  const matTop = at.h + 0.004;
  const mat = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.004, 0.24),
    new THREE.MeshStandardMaterial({ color: 0x1d2a27, roughness: 0.95, metalness: 0 }));
  mat.position.y = at.h + 0.002;
  g.add(mat);

  /* the boards lie flat, component side up, turned the way the showcase turns them */
  const boards = [
    { file: "boards/raspberry-pi-4b", size: 0.0853, turn: [0, 0, Math.PI], x: -0.1 },
    { file: "boards/arduino-nano-every", size: 0.0455, turn: [-Math.PI / 2, 0, 0], x: 0.1 }
  ];
  boards.forEach((b) => {
    loadProp(b.file, b.size).then((prop) => {
      if (!prop) return;
      prop.rotation.set(b.turn[0], b.turn[1], b.turn[2]);
      const box = new THREE.Box3().setFromObject(prop);
      const mid = box.getCenter(new THREE.Vector3());
      prop.position.set(-mid.x, -box.min.y, -mid.z);
      const seat = new THREE.Group();
      seat.position.set(b.x, matTop, 0);
      seat.add(prop);
      g.add(seat);
    });
  });

  /* the lead from the Pi's inner edge to the Nano's, rising 2.5 cm off the mat */
  const lead = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.055, matTop + 0.01, 0),
    new THREE.Vector3(-0.025, matTop + 0.025, 0.02),
    new THREE.Vector3(0.04, matTop + 0.025, 0.02),
    new THREE.Vector3(0.075, matTop + 0.01, 0)
  ]);
  g.add(new THREE.Mesh(
    new THREE.TubeGeometry(lead, 32, 0.0025, 8, false),
    new THREE.MeshStandardMaterial({ color: 0x46584f, roughness: 0.8, metalness: 0.1 })
  ));
  const pulse = new THREE.Mesh(new THREE.SphereGeometry(0.005, 12, 10), M.glow);
  g.add(pulse);

  /* the scope trace, 20 cm wide and 3 cm from low to high, 16 cm above the mat */
  const BITS = 10, STEPS = 8, N = BITS * STEPS + 1;
  const WIDE = 0.2, SWING = 0.015, traceY = matTop + 0.16;
  const trace = new Float32Array(N * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(trace, 3));
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: AMBER }));
  line.position.y = traceY;
  g.add(line);
  const rail = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(WIDE + 0.01, SWING * 2 + 0.012)),
    new THREE.LineBasicMaterial({ color: 0x7f9189, transparent: true, opacity: 0.35 })
  );
  rail.position.y = traceY;
  g.add(rail);

  let word = 0b10110010, lastFrame = -1;
  const draw = () => {
    for (let i = 0; i < N; i++) {
      const bit = Math.min(Math.floor(i / STEPS), BITS - 1);
      const high = bit === 0 ? 0 : bit === 9 ? 1 : (word >> (bit - 1)) & 1;
      trace[i * 3] = -WIDE / 2 + (i / (N - 1)) * WIDE;
      trace[i * 3 + 1] = high ? SWING : -SWING;
      trace[i * 3 + 2] = 0;
    }
    geo.attributes.position.needsUpdate = true;
  };
  draw();
  pulse.position.copy(lead.getPointAt(0.3));
  updaters.push((dt, t) => {
    if (reduceMotion) return;
    const nth = Math.floor(t * 0.35);
    if (nth !== lastFrame) { lastFrame = nth; word = Math.floor(Math.random() * 256); draw(); }
    pulse.position.copy(lead.getPointAt((t * 0.35) % 1));
  });

  shadows(g);
  return g;
}

/* ------------------------------------------------------ hardware showcase */

/* Every board and sensor from the owner's CAD archives at its true size, on small
   stands in a lit wall case behind the skills plinth, each with a name plate.
   size is the model's largest dimension in metres, worked out from the board's
   real length; turn is the rotation that puts the component side up (the CAD
   exports do not agree on an up axis); upright models stand in a foam block
   facing the room instead of lying on an angled stand. The case is built at once;
   the models (about 12 MB together) load the first time Skills is visited. */
const HARDWARE = [
  [
    { file: "boards/arduino-uno", label: "Arduino Uno", size: 0.073, turn: [0, Math.PI / 2, 0] },
    { file: "boards/arduino-mega-2560", label: "Arduino Mega 2560", size: 0.108, turn: [0, Math.PI / 2, 0] },
    { file: "boards/arduino-nano-every", label: "Arduino Nano Every", size: 0.0455, turn: [-Math.PI / 2, 0, 0] },
    { file: "boards/esp32-nodemcu", label: "ESP32 NodeMCU", size: 0.0523 },
    { file: "boards/raspberry-pi-5", label: "Raspberry Pi 5", size: 0.0865, turn: [-Math.PI / 2, 0, 0] },
    { file: "boards/raspberry-pi-4b", label: "Raspberry Pi 4B", size: 0.0853, turn: [0, 0, Math.PI] },
    { file: "boards/raspberry-pi-zero", label: "Raspberry Pi Zero", size: 0.065 }
  ],
  [
    { file: "sensors/hc-sr04-ultrasonic", label: "HC-SR04 ultrasonic", size: 0.045, upright: true },
    { file: "sensors/pir-motion", label: "PIR motion", size: 0.032, upright: true },
    { file: "sensors/ir-sensor", label: "IR obstacle", size: 0.0378 },
    { file: "sensors/dht11-temperature-humidity", label: "DHT11 temp and humidity", size: 0.025, upright: true },
    { file: "sensors/imu-accelerometer-gyroscope", label: "IMU accel and gyro", size: 0.021, upright: true }
  ],
  [
    { file: "sensors/mq135-air-quality", label: "MQ-135 air quality", size: 0.0376, upright: true },
    { file: "sensors/mq2-gas-smoke", label: "MQ-2 gas and smoke", size: 0.0355, turn: [0, 0, Math.PI] },
    { file: "sensors/ldr-light-sensor", label: "LDR light", size: 0.039, turn: [0, 0, Math.PI] },
    { file: "sensors/rain-sensor", label: "Rain", size: 0.1047, turn: [0, Math.PI / 2, Math.PI] },
    { file: "sensors/touch-sensor", label: "Capacitive touch", size: 0.0241 }
  ]
];
/* phones get one of each kind rather than 17 downloads */
const PHONE_SET = new Set(["boards/arduino-uno", "boards/esp32-nodemcu", "boards/raspberry-pi-5", "sensors/hc-sr04-ultrasonic", "sensors/pir-motion", "sensors/dht11-temperature-humidity"]);
/* flat models lean back 52 degrees so the component side faces a standing reader */
const TILT = 0.9;

/* a name plate 10 cm wide */
function nameplate(text) {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 112;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#0d1715"; ctx.fillRect(0, 0, 512, 112);
  ctx.fillStyle = "#f0a31e"; ctx.fillRect(0, 106, 512, 6);
  ctx.fillStyle = "#e3eae4"; ctx.font = "500 44px 'Share Tech Mono', monospace";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(text, 256, 54, 490);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.1 * (112 / 512)), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }));
}

function showcase(parent) {
  const spec = L.LANDMARKS.skills.showcase;
  const { w: W, h: H, d: D } = spec;
  const g = new THREE.Group();
  g.position.set(0, L.PAD_TOP, spec.z);
  parent.add(g);

  /* a wall case 2.4 m wide and 2 m tall: a closed cupboard to 90 cm, then open
     shelves at 0.9, 1.3 and 1.7 m, each lit from under the shelf above */
  const body = new THREE.MeshStandardMaterial({ color: 0x1a2320, roughness: 0.85 });
  const standMat = new THREE.MeshStandardMaterial({ color: 0x101615, roughness: 0.75, metalness: 0.05 });
  const back = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.02), body);
  back.position.set(0, H / 2, -D / 2 + 0.01);
  g.add(back);
  for (const side of [-1, 1]) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.03, H, D), body);
    panel.position.set(side * (W / 2 - 0.015), H / 2, 0);
    g.add(panel);
  }
  const lid = new THREE.Mesh(new THREE.BoxGeometry(W, 0.04, D), body);
  lid.position.y = H - 0.02;
  g.add(lid);
  const low = Math.min(...spec.shelves);
  const cupboard = new THREE.Mesh(new THREE.BoxGeometry(W - 0.06, low - 0.018, D), body);
  cupboard.position.y = (low - 0.018) / 2;
  g.add(cupboard);

  const strip = new THREE.MeshBasicMaterial({ color: AMBER });
  const ceilings = [...spec.shelves.map((y) => y - 0.018), H - 0.04];
  spec.shelves.forEach((y) => {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(W - 0.06, 0.018, D - 0.04), M.wood);
    plank.position.set(0, y - 0.009, 0);
    g.add(plank);
    const above = Math.min(...ceilings.filter((c) => c > y + 0.01));
    const led = new THREE.Mesh(new THREE.BoxGeometry(W - 0.1, 0.006, 0.012), strip);
    led.position.set(0, above - 0.004, D / 2 - 0.05);
    g.add(led);
  });
  const glow = new THREE.PointLight(0xffe3b8, 0.9, 2.4, 2);
  glow.position.set(0, 1.45, 0.6);
  g.add(glow);
  shadows(g);

  const slots = [];
  HARDWARE.forEach((row, r) => {
    const span = W - 0.12, step = span / row.length, y = spec.shelves[r];
    row.forEach((item, i) => {
      const x = -span / 2 + step * (i + 0.5);
      const plate = nameplate(item.label);
      plate.position.set(x, y + 0.012, D / 2 - 0.045);
      plate.rotation.x = -0.6;
      g.add(plate);
      /* where the model's middle will be, refined once it has loaded */
      slots.push({ ...item, x, y, centre: new THREE.Vector3(x, y + (item.upright ? 0.02 : 0.03), 0) });
    });
  });

  let stops = null;
  const loadSlot = (s, k) => {
    if (s.requested) return;
    s.requested = true;
    loadProp(s.file, s.size).then((prop) => {
      if (!prop) return;
      if (s.turn) prop.rotation.set(s.turn[0], s.turn[1], s.turn[2]);
      /* re-seat the turned model: middle on x and z, bottom on y = 0 */
      const box = new THREE.Box3().setFromObject(prop);
      const size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
      prop.position.set(-mid.x, -box.min.y, -mid.z);
      const mount = new THREE.Group();
      if (s.upright) {
        /* a foam block the pins push into, the board leaning back a touch */
        const foam = new THREE.Mesh(new THREE.BoxGeometry(size.x + 0.012, 0.008, size.z + 0.012), standMat);
        foam.position.set(s.x, s.y + 0.004, 0);
        g.add(foam);
        mount.position.set(s.x, s.y + 0.006, 0);
        mount.rotation.x = -0.12;
        s.centre.set(s.x, s.y + 0.006 + size.y / 2, 0);
      } else {
        /* an angled stand: a plate at TILT with its front edge on the shelf, a leg behind */
        const sw = size.x + 0.016, sd = size.z + 0.016;
        const sinT = Math.sin(TILT), cosT = Math.cos(TILT);
        mount.position.set(s.x, s.y + (sd / 2) * sinT + 0.004, 0);
        mount.rotation.x = TILT;
        const plate = new THREE.Mesh(new THREE.BoxGeometry(sw, 0.004, sd), standMat);
        plate.position.y = -0.002;
        mount.add(plate);
        const legH = sd * sinT + 0.004;
        const leg = new THREE.Mesh(new THREE.BoxGeometry(sw * 0.5, legH, 0.004), standMat);
        leg.position.set(s.x, s.y + legH / 2, -(sd / 2) * cosT);
        g.add(leg);
        s.centre.set(s.x, s.y + (sd / 2) * sinT + 0.004 + (size.y / 2) * cosT, (size.y / 2) * sinT);
      }
      mount.add(prop);
      g.add(mount);
      if (stops) stops[k].focus.copy(g.localToWorld(s.centre.clone()));
    });
  };

  return {
    load() {
      slots.forEach((s, k) => { if (!coarseDevice || PHONE_SET.has(s.file)) loadSlot(s, k); });
    },
    /* one model on demand, for the close-up; phones start with only six */
    loadOne(i) { if (slots[i]) loadSlot(slots[i], i); },
    /* Where the close-up camera stands for each model, as the world uses it:
       eye = focus + dir * dist, then raised by lift, looking at focus. The eye is
       20 to 35 cm from the model, square in front of the case; for a model on an
       angled stand it rises to look down its tilt. */
    stops() {
      if (!stops) {
        g.updateWorldMatrix(true, false);
        const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(g.getWorldQuaternion(new THREE.Quaternion())).setY(0).normalize();
        stops = slots.map((s) => {
          const dist = s.upright ? clamp(s.size * 5.5, 0.18, 0.3) : clamp(s.size * 3, 0.2, 0.35);
          return { label: s.label, focus: g.localToWorld(s.centre.clone()), dir: dir.clone(), dist, lift: dist * (s.upright ? 0.12 : 0.5) };
        });
      }
      return stops;
    }
  };
}

/* ------------------------------------------------------------------ build */

export function buildIsland(scene, { reduceMotion }) {
  const updaters = [];
  const frames = [];
  const LS = L.LANDMARKS;

  terrain(scene);

  const research = tower(scene, updaters);
  const press = stage(scene, reduceMotion, updaters, frames);
  const builds = lab(scene, updaters);
  const creds = hall(scene, frames);
  const skill = skills(scene, reduceMotion, updaters);
  const tools = shed(scene, updaters, frames);
  const contact = mast(scene, reduceMotion, updaters);
  serialLink(scene, reduceMotion, updaters);

  const hardware = showcase(skill.group);

  /* Poly Haven props at their true size: the size given is the model's largest dimension */
  const place = (group, name, size, x, y, z, ry = 0) =>
    loadProp(name, size).then((prop) => {
      if (!prop) return;
      prop.position.set(x, y, z);
      prop.rotation.y = ry;
      group.add(prop);
    });
  const shedTop = LS.shed.floor.top + L.TABLE_TOP, st = LS.shed.table;
  place(tools.group, "desk_lamp_arm_01", 0.55, st.x - 0.95, shedTop, st.z - 0.25, -0.6);   // 55 cm tall
  place(tools.group, "classic_laptop", 0.34, st.x - 0.72, shedTop, st.z + 0.15, 0.25);     // 34 cm wide
  place(tools.group, "metal_toolbox", 0.45, LS.shed.toolbox.x, LS.shed.floor.top, LS.shed.toolbox.z, 0.3);
  const labTop = LS.lab.floor.top + L.TABLE_TOP, lb = LS.lab.benches;
  /* the microscope is longer than it is tall; 48 cm long stands it about 45 cm high */
  place(builds.group, "industrial_microscope", 0.48, lb.xs[0] - 0.72, labTop, lb.z + 0.05, 0.4);
  place(press.group, "Television_01", 0.6, 3.4, LS.stage.deck.h, 0.7, -0.35);           // 60 cm wide, as authored
  const ped = LS.hall.pedestal;
  const board = new THREE.Group();
  board.position.set(ped.x, LS.hall.floor.top, ped.z);
  creds.group.add(board);
  board.add(plinth(ped.r, ped.h));
  place(board, "circuit_board", 0.25, 0, ped.h + 0.005, 0, 0.3);

  /* the arm itself, converted from its CAD export, 50 cm long, turning on its plinth in the lab */
  loadProp("robotics/robotic-arm", 0.5).then((arm) => {
    if (!arm) return;
    arm.position.y = LS.lab.turntable.h;
    builds.turntable.add(arm);
    updaters.push((dt) => { if (!reduceMotion) arm.rotation.y += dt * 0.35; });
  });

  /* the campus: a plaza round the workbench, a bus of traces out to each zone ending
     at the front edge of the building's pad, zone names, planters and street lights */
  plaza(scene, GROUND, L.PLAZA_RADIUS);
  updaters.push(rimTiles(scene, GROUND, reduceMotion));
  L.BUSES.forEach((b) => { const t = traces(scene, b, GROUND, reduceMotion); updaters.push(t.update); });
  L.LABELS.forEach(([text, x, z, ux, uz]) => groundLabel(scene, text, x, z, GROUND, ux, uz));
  L.PLANTERS.forEach(([x, z]) => planter(scene, x, z, GROUND));
  L.LAMPS.forEach(([x, z, ry]) => lamp(scene, x, z, GROUND, ry));

  /* world-space focus for each place */
  const toWorld = (l) => l.group.localToWorld(l.focus.clone());
  scene.updateMatrixWorld(true);

  /* a box round the desk and chair, so clicking the workbench goes there */
  const bh = L.BENCH.hit;
  const benchHit = new THREE.Mesh(new THREE.BoxGeometry(bh.w, bh.h, bh.d), M.hit);
  benchHit.position.set(bh.x, GROUND + bh.h / 2, bh.z);
  scene.add(benchHit);

  const bf = L.BENCH.focus;
  const places = [
    { key: "bench", panel: "#about", label: "The workbench", focus: new THREE.Vector3(bf.x, GROUND + bf.y, bf.z), dist: L.BENCH.dist, lift: L.BENCH.lift, dir: new THREE.Vector3(...L.BENCH.dir).normalize(), hits: [benchHit] },
    { key: "research", panel: "#research", label: "Research tower", group: research.group, focus: toWorld(research), dist: research.dist, lift: research.lift, hits: research.hits },
    { key: "stage", panel: "#work", anchor: "#work-robonari", label: "Bheenmal stage", group: press.group, focus: toWorld(press), dist: press.dist, lift: press.lift, hits: press.hits },
    { key: "lab", panel: "#work", anchor: "#work-attendance", label: "Robotics lab", group: builds.group, focus: toWorld(builds), dist: builds.dist, lift: builds.lift, hits: builds.hits },
    { key: "hall", panel: "#experience", label: "Credentials hall", group: creds.group, focus: toWorld(creds), dist: creds.dist, lift: creds.lift, hits: creds.hits },
    { key: "skills", panel: "#stack", label: "Skills lab", group: skill.group, focus: toWorld(skill), dist: skill.dist, lift: skill.lift, hits: skill.hits },
    { key: "shed", panel: "#toolchain", label: "Toolchain", group: tools.group, focus: toWorld(tools), dist: tools.dist, lift: tools.lift, hits: tools.hits },
    { key: "mast", panel: "#contact", label: "Say hello", group: contact.group, focus: toWorld(contact), dist: contact.dist, lift: contact.lift, hits: contact.hits }
  ];

  /* ---------------------------------------------------- where the hacker can walk
     Colliders, platforms, zones and doors come from layout.js. Standing in a zone
     opens that place's panel; the door is just in front of the pad, facing in,
     marked by a glowing ring half a metre across the radius. */
  const ringMat = () => new THREE.MeshBasicMaterial({ color: 0x9ad9ee, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
  places.forEach((p) => {
    /* every building faces the plaza, so the camera arrives square in front of it */
    if (!p.dir) p.dir = new THREE.Vector3(0, 0, 1).applyQuaternion(p.group.quaternion);
    p.hits.forEach((h) => { h.userData.place = p.key; });
    p.zone = { ...L.ZONES[p.key] };
    p.spawn = { ...L.SPAWNS[p.key] };
    p.short = L.SHORT[p.key];
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 48), ringMat());
    ring.rotation.x = -Math.PI / 2;
    /* 8 cm up, above the walkway traces (top 5.75 cm) and their vias (7.2 cm) that
       run under several doors, so the lanes never cut the ring */
    ring.position.set(p.spawn.x, GROUND + L.heightAt(p.spawn.x, p.spawn.z) + 0.08, p.spawn.z);
    scene.add(ring);
    p.beacon = ring;
  });

  let activeKey = null;

  return {
    places,
    frames,
    skillItems: skill.ring.items,
    colliders: L.COLLIDERS.map((k) => ({ ...k })),
    platforms: L.PLATFORMS.map((k) => ({ ...k })),
    heightAt: (x, z) => L.heightAt(x, z),
    /* the hacker starts on the plaza, facing the workbench */
    start: { ...L.START },
    setActive(key) { activeKey = key; },
    hardwareStops: () => hardware.stops(),
    showHardware: (i) => hardware.loadOne(i),
    /* called by the world whenever a place opens */
    visit(key) {
      if (key === "skills") hardware.load();
    },
    update(dt, t) {
      updaters.forEach((u) => u(dt, t));
      /* entry rings breathe in cyan; the open building's ring holds steady in amber */
      for (const p of places) {
        const on = p.key === activeKey;
        p.beacon.material.color.setHex(on ? 0xffb43d : 0x9ad9ee);
        p.beacon.material.opacity = on ? 0.85 : 0.35 + (reduceMotion ? 0.1 : 0.2 * (0.5 + 0.5 * Math.sin(t * 2 + p.spawn.x)));
      }
    }
  };
}
