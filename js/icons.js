/* Skills as three-dimensional objects.
   Every icon is built from primitives in the same material language as the rest
   of the island. None of them is anybody's logo: vendor marks may not be redrawn
   or restyled, and a board, a lens or a gear says the same thing more honestly. */

import * as THREE from "three";

const AMBER = 0xf0a31e;

/* Physical materials: clearcoated solder mask, anodised metal, glossy plastic,
   real glass, so the icons pick up the workshop HDRI like manufactured parts. */
function pcbTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const x = c.getContext("2d");
  x.fillStyle = "#1f5c47"; x.fillRect(0, 0, 512, 512);
  x.strokeStyle = "rgba(150, 210, 170, 0.35)"; x.lineWidth = 3;
  for (let i = 0; i < 46; i++) {
    let px = Math.random() * 512, py = Math.random() * 512;
    x.beginPath(); x.moveTo(px, py);
    for (let k = 0; k < 4; k++) {
      Math.random() < 0.5 ? (px += (Math.random() - 0.5) * 180) : (py += (Math.random() - 0.5) * 180);
      x.lineTo(px, py);
    }
    x.stroke();
    x.fillStyle = "rgba(210, 180, 110, 0.9)"; x.beginPath(); x.arc(px, py, 5, 0, Math.PI * 2); x.fill();
  }
  x.fillStyle = "rgba(235, 240, 235, 0.8)"; x.font = "bold 22px monospace";
  x.fillText("U1", 60, 90); x.fillText("GPIO", 360, 470); x.fillText("C12", 420, 120);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const mat = {
  amber: new THREE.MeshPhysicalMaterial({ color: AMBER, emissive: 0x3a2404, roughness: 0.32, metalness: 0.2, clearcoat: 0.7, clearcoatRoughness: 0.15 }),
  steel: new THREE.MeshPhysicalMaterial({ color: 0xc9d1cc, roughness: 0.24, metalness: 1, clearcoat: 0.25, clearcoatRoughness: 0.2 }),
  dark: new THREE.MeshPhysicalMaterial({ color: 0x1b2421, roughness: 0.38, metalness: 0.15, clearcoat: 0.8, clearcoatRoughness: 0.12 }),
  pcb: new THREE.MeshPhysicalMaterial({ map: pcbTexture(), roughness: 0.4, metalness: 0.05, clearcoat: 0.9, clearcoatRoughness: 0.18 }),
  gold: new THREE.MeshPhysicalMaterial({ color: 0xe2bf6c, roughness: 0.18, metalness: 1 }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0x06120f, roughness: 0.03, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02, ior: 1.52, reflectivity: 0.6 }),
  pale: new THREE.MeshPhysicalMaterial({ color: 0xe6ece7, roughness: 0.42, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.2, sheen: 0.3 }),
  glow: new THREE.MeshBasicMaterial({ color: AMBER })
};

const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
const cyl = (rt, rb, h, m, s = 48) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, s), m);
const ball = (r, m) => new THREE.Mesh(new THREE.SphereGeometry(r, 32, 24), m);

function board() {
  const g = new THREE.Group();
  g.add(box(1.2, 0.06, 0.8, mat.pcb));
  const soc = box(0.3, 0.08, 0.3, mat.dark); soc.position.set(-0.15, 0.07, 0); g.add(soc);
  const pins = box(0.9, 0.1, 0.07, mat.gold); pins.position.set(0, 0.08, -0.33); g.add(pins);
  for (let i = 0; i < 2; i++) { const usb = box(0.2, 0.14, 0.24, mat.steel); usb.position.set(0.5, 0.1, -0.12 + i * 0.3); g.add(usb); }
  const led = ball(0.03, mat.glow); led.position.set(-0.5, 0.06, 0.3); g.add(led);
  g.rotation.x = 0.5;
  return g;
}

function chip() {
  const g = new THREE.Group();
  g.add(box(0.7, 0.14, 0.7, mat.dark));
  for (let s = 0; s < 4; s++) {
    for (let i = 0; i < 6; i++) {
      const leg = box(0.05, 0.03, 0.16, mat.gold);
      const t = -0.25 + i * 0.1;
      const a = (s * Math.PI) / 2;
      leg.position.set(Math.cos(a) * 0.42 + -Math.sin(a) * t, -0.04, Math.sin(a) * 0.42 + Math.cos(a) * t);
      leg.rotation.y = -a;
      g.add(leg);
    }
  }
  const dot = cyl(0.05, 0.05, 0.02, mat.glow, 16); dot.position.set(-0.22, 0.08, -0.22); g.add(dot);
  g.rotation.x = 0.6;
  return g;
}

function lens() {
  const g = new THREE.Group();
  const body = cyl(0.42, 0.46, 0.4, mat.dark); body.rotation.x = Math.PI / 2; g.add(body);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.04, 10, 36), mat.steel); ring.position.z = 0.21; g.add(ring);
  const glass = cyl(0.33, 0.33, 0.05, mat.glass); glass.rotation.x = Math.PI / 2; glass.position.z = 0.2; g.add(glass);
  const iris = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 8, 28), mat.glow); iris.position.z = 0.24; g.add(iris);
  return g;
}

function neural() {
  const g = new THREE.Group();
  const layers = [[-0.55, 3], [0, 4], [0.55, 2]];
  const nodes = [];
  layers.forEach(([x, n]) => {
    const col = [];
    for (let i = 0; i < n; i++) {
      const b = ball(0.08, x === 0 ? mat.amber : mat.pale);
      b.position.set(x, (i - (n - 1) / 2) * 0.3, 0);
      g.add(b); col.push(b.position);
    }
    nodes.push(col);
  });
  const pts = [];
  for (let l = 0; l < nodes.length - 1; l++) for (const a of nodes[l]) for (const b of nodes[l + 1]) pts.push(a, b);
  g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: 0x9fb8ab, transparent: true, opacity: 0.55 })));
  return g;
}

function speech() {
  const g = new THREE.Group();
  const bub = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.55, 8, 20), mat.pale);
  bub.rotation.z = Math.PI / 2; g.add(bub);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.26, 12), mat.pale);
  tail.position.set(-0.3, -0.33, 0); tail.rotation.z = 0.5; g.add(tail);
  for (let i = 0; i < 5; i++) {
    const bar = box(0.06, 0.1 + [0.1, 0.25, 0.35, 0.2, 0.08][i], 0.06, mat.amber);
    bar.position.set(-0.24 + i * 0.12, 0, 0.3); g.add(bar);
  }
  return g;
}

function terminal() {
  const g = new THREE.Group();
  g.add(box(1.1, 0.75, 0.1, mat.dark));
  const scr = box(0.98, 0.62, 0.02, mat.glass); scr.position.z = 0.06; g.add(scr);
  const prompt = box(0.12, 0.05, 0.02, mat.glow); prompt.position.set(-0.36, 0.18, 0.08); g.add(prompt);
  [0.46, 0.3, 0.52].forEach((w, i) => { const l = box(w, 0.04, 0.02, mat.pale); l.position.set(-0.4 + w / 2, 0.05 - i * 0.12, 0.08); g.add(l); });
  const cursor = box(0.06, 0.1, 0.02, mat.glow); cursor.position.set(-0.36, -0.28, 0.08); cursor.name = "cursor"; g.add(cursor);
  return g;
}

function globe() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 14),
    new THREE.MeshStandardMaterial({ color: 0x1f3a33, roughness: 0.5, metalness: 0.3, wireframe: true })));
  for (let i = 0; i < 3; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.55 + i * 0.001, 0.015, 8, 48), i === 1 ? mat.amber : mat.steel);
    r.rotation.set(Math.PI / 2 + i * 0.6, i * 0.9, 0); g.add(r);
  }
  for (let i = 0; i < 4; i++) { const n = ball(0.05, mat.glow); const a = i * 1.6; n.position.set(Math.cos(a) * 0.42, Math.sin(a * 1.3) * 0.3, Math.sin(a) * 0.3); g.add(n); }
  return g;
}

function shield() {
  const g = new THREE.Group();
  const s = new THREE.Shape();
  s.moveTo(0, 0.5); s.quadraticCurveTo(0.42, 0.45, 0.42, 0.3); s.lineTo(0.42, 0);
  s.quadraticCurveTo(0.4, -0.35, 0, -0.55); s.quadraticCurveTo(-0.4, -0.35, -0.42, 0);
  s.lineTo(-0.42, 0.3); s.quadraticCurveTo(-0.42, 0.45, 0, 0.5);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 });
  geo.center();
  g.add(new THREE.Mesh(geo, mat.steel));
  const hole = ball(0.09, mat.glow); hole.position.set(0, 0.06, 0.1); g.add(hole);
  const slot = box(0.06, 0.18, 0.04, mat.glow); slot.position.set(0, -0.08, 0.1); g.add(slot);
  return g;
}

function gear(r, teeth, m) {
  const g = new THREE.Group();
  g.add(cyl(r, r, 0.14, m, 32));
  for (let i = 0; i < teeth; i++) {
    const t = box(0.12, 0.14, 0.14, m);
    const a = (i / teeth) * Math.PI * 2;
    t.position.set(Math.cos(a) * (r + 0.05), 0, Math.sin(a) * (r + 0.05)); t.rotation.y = -a; g.add(t);
  }
  const hubc = cyl(r * 0.3, r * 0.3, 0.18, mat.dark, 16); g.add(hubc);
  return g;
}

function gears() {
  const g = new THREE.Group();
  const a = gear(0.34, 10, mat.steel); a.position.x = -0.24; a.name = "gA";
  const b = gear(0.24, 7, mat.amber); b.position.set(0.37, 0.02, 0.1); b.name = "gB";
  g.add(a, b);
  g.rotation.x = Math.PI / 2 - 0.4;
  return g;
}

function joint() {
  const g = new THREE.Group();
  const base = cyl(0.3, 0.36, 0.12, mat.dark); base.position.y = -0.45; g.add(base);
  const l1 = box(0.12, 0.6, 0.12, mat.steel); l1.position.set(0, -0.15, 0); g.add(l1);
  const h = cyl(0.1, 0.1, 0.18, mat.amber); h.rotation.x = Math.PI / 2; h.position.y = 0.15; g.add(h);
  const l2 = box(0.5, 0.1, 0.1, mat.steel); l2.position.set(0.24, 0.26, 0); l2.rotation.z = 0.45; g.add(l2);
  const claw = box(0.1, 0.16, 0.12, mat.dark); claw.position.set(0.48, 0.38, 0); g.add(claw);
  return g;
}

function cloud() {
  const g = new THREE.Group();
  [[-0.3, 0, 0.26], [0, 0.12, 0.34], [0.32, 0, 0.24], [0.05, -0.1, 0.28]].forEach(([x, y, r]) => {
    const b = ball(r, mat.pale); b.position.set(x, y, 0); g.add(b);
  });
  const up = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.2, 12), mat.amber); up.position.set(0, -0.05, 0.3); g.add(up);
  return g;
}

function antenna() {
  const g = new THREE.Group();
  const mast = cyl(0.03, 0.05, 0.8, mat.steel, 12); g.add(mast);
  const tip = ball(0.07, mat.glow); tip.position.y = 0.42; g.add(tip);
  for (let i = 1; i <= 3; i++) {
    const w = new THREE.Mesh(new THREE.TorusGeometry(0.14 * i, 0.018, 8, 32, Math.PI * 0.6), i === 2 ? mat.amber : mat.steel);
    w.position.y = 0.42; w.rotation.z = Math.PI * 0.2; w.name = "wave" + i; g.add(w);
    const w2 = w.clone(); w2.rotation.z = Math.PI * 1.2; g.add(w2);
  }
  return g;
}

/* name shown on hover, and the section of the page it stands for */
export const SKILLS = [
  { key: "boards", label: "Single-board computers", make: board },
  { key: "embedded", label: "Embedded firmware", make: chip },
  { key: "vision", label: "Computer vision", make: lens },
  { key: "ml", label: "Machine learning", make: neural },
  { key: "speech", label: "Language and speech", make: speech },
  { key: "linux", label: "Linux and the shell", make: terminal },
  { key: "network", label: "Networking, CCNA", make: globe },
  { key: "security", label: "Security", make: shield },
  { key: "automation", label: "Automation", make: gears },
  { key: "robotics", label: "Robotics and kinematics", make: joint },
  { key: "cloud", label: "Cloud", make: cloud },
  { key: "iot", label: "IoT and wireless", make: antenna }
];

/* A ring of icons floating over a plinth, each turning slowly. */
export function makeSkillRing(reduceMotion) {
  const group = new THREE.Group();
  const items = SKILLS.map((s, i) => {
    const holder = new THREE.Group();
    const a = (i / SKILLS.length) * Math.PI * 2;
    holder.position.set(Math.cos(a) * 3.1, 1.6 + (i % 2) * 0.55, Math.sin(a) * 3.1);
    const icon = s.make();
    icon.scale.setScalar(0.9);
    holder.add(icon);
    holder.userData = { skill: s, phase: i * 0.7 };
    holder.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.skillHolder = holder; } });

    const pad = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.4, 32),
      new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0.25, side: THREE.DoubleSide }));
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(holder.position.x, 0.03, holder.position.z);
    group.add(pad, holder);
    return { holder, icon };
  });

  function update(dt, t) {
    items.forEach(({ holder, icon }, i) => {
      const p = holder.userData.phase;
      if (!reduceMotion) {
        icon.rotation.y += dt * 0.5;
        holder.position.y = 1.6 + (i % 2) * 0.55 + Math.sin(t * 1.1 + p) * 0.08;
      }
      const cursor = icon.getObjectByName("cursor");
      if (cursor) cursor.visible = reduceMotion || Math.floor(t * 2) % 2 === 0;
      const gA = icon.getObjectByName("gA"), gB = icon.getObjectByName("gB");
      if (gA && !reduceMotion) { gA.rotation.y += dt * 0.8; gB.rotation.y -= dt * 1.14; }
    });
  }

  return { group, items, update };
}
