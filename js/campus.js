/* The campus. Poured-concrete ground, a plaza round the workbench, lit pads under
   the buildings, walkways drawn as buses of copper traces, planters, street lights
   and glass curtain walls. Everything is built once; the only motion is a data
   pulse along each walkway and the tiles floating off the rim. */

import * as THREE from "three";

const AMBER = 0xf0a31e;

function canvasTexture(size, draw, repeat) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d"), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  return t;
}

function grain(ctx, s, base, amount) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, s, s);
  const img = ctx.getImageData(0, 0, s, s);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

/* large slabs with dark expansion joints */
function slabs(ctx, s) {
  grain(ctx, s, "#1c2322", 16);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.55)";
  ctx.lineWidth = 3;
  for (let k = 0; k <= 4; k++) {
    const p = (k / 4) * s;
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(s, p); ctx.stroke();
  }
}

/* smaller, lighter pavers for the plaza */
function pavers(ctx, s) {
  grain(ctx, s, "#2c3533", 12);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.45)";
  ctx.lineWidth = 2;
  for (let k = 0; k <= 8; k++) {
    const p = (k / 8) * s;
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(s, p); ctx.stroke();
  }
}

export const MAT = {
  ground: new THREE.MeshStandardMaterial({ map: canvasTexture(512, slabs, 5), roughness: 0.93, metalness: 0.05 }),
  plaza: new THREE.MeshStandardMaterial({ map: canvasTexture(512, pavers, 3), roughness: 0.85, metalness: 0.08 }),
  pad: new THREE.MeshStandardMaterial({ color: 0x2a3331, roughness: 0.86, metalness: 0.1 }),
  copper: new THREE.MeshStandardMaterial({ color: 0xb98a47, roughness: 0.4, metalness: 0.85, emissive: 0x3a2508, emissiveIntensity: 0.7 }),
  via: new THREE.MeshStandardMaterial({ color: 0xd9ad62, roughness: 0.45, metalness: 0.9 }),
  hole: new THREE.MeshBasicMaterial({ color: 0x050807 }),
  /* not too glossy: a near-mirror catching the key light blows past the bloom
     pass's half-float range and turns the whole frame black */
  glass: new THREE.MeshPhysicalMaterial({ color: 0x0c1a1d, roughness: 0.3, metalness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.28, envMapIntensity: 1.1 }),
  frame: new THREE.MeshStandardMaterial({ color: 0x46524f, roughness: 0.42, metalness: 0.85 }),
  led: new THREE.MeshBasicMaterial({ color: AMBER }),
  concrete: new THREE.MeshStandardMaterial({ color: 0x59625f, roughness: 0.95 }),
  soil: new THREE.MeshStandardMaterial({ color: 0x1d1813, roughness: 1 }),
  bark: new THREE.MeshStandardMaterial({ color: 0x4a3b2c, roughness: 0.95 }),
  leaf: new THREE.MeshStandardMaterial({ color: 0x2f5a3c, roughness: 0.9, flatShading: true })
};

const shade = (o) => o.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });

/* the round plaza the workbench stands in, with a lit rim */
export function plaza(scene, y, r) {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 72), MAT.plaza);
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = y + 0.03;
  disc.receiveShadow = true;
  const rim = new THREE.Mesh(new THREE.RingGeometry(r - 0.1, r, 128), MAT.led);
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = y + 0.05;
  const inner = new THREE.Mesh(new THREE.RingGeometry(r - 0.95, r - 0.88, 128),
    new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0.22, depthWrite: false }));
  inner.rotation.x = -Math.PI / 2;
  inner.position.y = y + 0.05;
  g.add(disc, rim, inner);
  scene.add(g);
  return g;
}

/* a slab under a building, its edges lit */
export function pad(scene, x, z, w, d, ry, y) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  const slab = new THREE.Mesh(new THREE.BoxGeometry(w, 0.14, d), MAT.pad);
  slab.position.y = 0.07;
  slab.receiveShadow = true;
  g.add(slab);
  const edge = (len, px, pz, rot) => {
    const e = new THREE.Mesh(new THREE.BoxGeometry(len, 0.03, 0.06), MAT.led);
    e.position.set(px, 0.15, pz);
    e.rotation.y = rot;
    g.add(e);
  };
  edge(w, 0, d / 2, 0); edge(w, 0, -d / 2, 0);
  edge(d, w / 2, 0, Math.PI / 2); edge(d, -w / 2, 0, Math.PI / 2);
  scene.add(g);
  return g;
}

function via(g, p, y, r = 0.22) {
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.05, 20), MAT.via);
  ring.position.set(p.x, y + 0.045, p.y);
  const hole = new THREE.Mesh(new THREE.CircleGeometry(r * 0.45, 16), MAT.hole);
  hole.rotation.x = -Math.PI / 2;
  hole.position.set(p.x, y + 0.072, p.y);
  g.add(ring, hole);
}

/* A walkway drawn as a bus of copper traces: parallel lanes that turn together,
   with vias where they start and end, and a data pulse running along the middle.
   pts is a polyline of [x, z] with right-angle turns. */
export function traces(scene, pts, y, reduceMotion, { lanes = 3, gap = 0.75, width = 0.34 } = {}) {
  const g = new THREE.Group();
  const P = pts.map(([x, z]) => new THREE.Vector2(x, z));
  const normals = [];
  for (let i = 0; i < P.length - 1; i++) {
    const d = P[i + 1].clone().sub(P[i]).normalize();
    normals.push(new THREE.Vector2(-d.y, d.x));
  }
  for (let l = 0; l < lanes; l++) {
    const o = (l - (lanes - 1) / 2) * gap;
    /* offset the polyline, mitring each turn so the lanes stay parallel */
    const line = P.map((p, i) => {
      if (i === 0) return p.clone().addScaledVector(normals[0], o);
      if (i === P.length - 1) return p.clone().addScaledVector(normals[i - 1], o);
      const a = normals[i - 1], b = normals[i];
      return p.clone().addScaledVector(a.clone().add(b), o / Math.max(1 + a.dot(b), 0.2));
    });
    for (let i = 0; i < line.length - 1; i++) {
      const s = line[i], e = line[i + 1];
      const len = s.distanceTo(e);
      if (len < 0.01) continue;
      const seg = new THREE.Mesh(new THREE.BoxGeometry(width, 0.035, len + width), MAT.copper);
      seg.position.set((s.x + e.x) / 2, y + 0.04, (s.y + e.y) / 2);
      seg.rotation.y = Math.atan2(e.x - s.x, e.y - s.y);
      seg.receiveShadow = true;
      g.add(seg);
    }
    via(g, line[0], y);
    via(g, line[line.length - 1], y);
  }

  const lengths = [];
  let total = 0;
  for (let i = 0; i < P.length - 1; i++) { const l = P[i].distanceTo(P[i + 1]); lengths.push(l); total += l; }
  const pulse = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.9), MAT.led);
  pulse.visible = !reduceMotion;
  g.add(pulse);
  const at = (u) => {
    let d = u * total;
    for (let i = 0; i < lengths.length; i++) {
      if (d <= lengths[i] || i === lengths.length - 1) {
        const k = Math.min(1, d / lengths[i]);
        const p = P[i].clone().lerp(P[i + 1], k);
        pulse.position.set(p.x, y + 0.08, p.y);
        pulse.rotation.y = Math.atan2(P[i + 1].x - P[i].x, P[i + 1].y - P[i].y);
        return;
      }
      d -= lengths[i];
    }
  };
  at(0);
  const phase = Math.random();
  scene.add(g);
  return {
    group: g,
    update(dt, t) { if (!reduceMotion) at(((t / (total * 0.35)) + phase) % 1); }
  };
}

export function planter(scene, x, z, y) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.55, 1.5), MAT.concrete);
  box.position.y = 0.275;
  const soil = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.04, 1.3), MAT.soil);
  soil.position.y = 0.56;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 1.3, 8), MAT.bark);
  trunk.position.y = 1.2;
  g.add(box, soil, trunk);
  [[0, 2.15, 0, 0.72], [0.32, 1.85, 0.2, 0.5], [-0.3, 1.9, -0.16, 0.52]].forEach(([px, py, pz, r]) => {
    const c = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), MAT.leaf);
    c.position.set(px, py, pz);
    c.rotation.set(px * 3, py, pz * 3);
    g.add(c);
  });
  shade(g);
  scene.add(g);
  return g;
}

export function lamp(scene, x, z, y, ry = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 3.2, 10), MAT.frame);
  pole.position.y = 1.6;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 0.22), MAT.frame);
  head.position.set(0.25, 3.2, 0);
  const light = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.02, 0.12), MAT.led);
  light.position.set(0.25, 3.15, 0);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(1.5, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd28a, transparent: true, opacity: 0.07, depthWrite: false }));
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(0.25, 0.07, 0);
  g.add(pole, head, light, pool);
  pole.castShadow = true;
  scene.add(g);
  return g;
}

/* a zone name painted on the ground, w wide, its top edge pointing along (ux, uz) */
export function groundLabel(scene, text, x, z, y, ux, uz, w = 4.2) {
  const c = document.createElement("canvas");
  c.width = 1024; c.height = 160;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#f0a31e";
  ctx.font = "600 104px Archivo, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 512, 84, 1000);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.16),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.8, depthWrite: false }));
  m.rotation.set(-Math.PI / 2, 0, Math.atan2(-ux, -uz));
  m.position.set(x, y + 0.09, z);
  scene.add(m);
  return m;
}

/* a glass wall between steel mullions, lit along the top */
export function curtain(w, h, d = 0.2) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), MAT.glass));
  const n = Math.max(2, Math.round(w / 1.4));
  for (let i = 0; i <= n; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.08, h, d + 0.06), MAT.frame);
    m.position.x = -w / 2 + (i / n) * w;
    g.add(m);
  }
  for (const y of [-h / 2, h / 2]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, 0.1, d + 0.08), MAT.frame);
    t.position.y = y;
    g.add(t);
  }
  const led = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, 0.05), MAT.led);
  led.position.set(0, h / 2 + 0.07, d / 2 + 0.03);
  g.add(led);
  return g;
}

/* hexagonal tiles drifting off the rim, in place of loose rocks */
export function rimTiles(scene, y, reduceMotion) {
  const tiles = [];
  for (let i = 0; i < 12; i++) {
    const t = new THREE.Group();
    const hex = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.18, 6), MAT.glass);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.03, 4, 6), MAT.led);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.1;
    t.add(hex, rim);
    const a = (i / 12) * Math.PI * 2 + 0.2, d = 30 + (i % 3) * 4;
    t.position.set(Math.cos(a) * d, y - 3 + (i % 4) * 2.2, Math.sin(a) * d);
    t.scale.setScalar(0.8 + (i % 3) * 0.35);
    t.userData.phase = i;
    scene.add(t);
    tiles.push(t);
  }
  return (dt, t) => {
    if (reduceMotion) return;
    tiles.forEach((m) => {
      m.position.y += Math.sin(t * 0.6 + m.userData.phase) * dt * 0.3;
      m.rotation.y += dt * 0.1;
    });
  };
}
