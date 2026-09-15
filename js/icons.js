/* Software skills as three-dimensional objects in a ring over the skills plinth.
   The objects are free glTF models (CC0 and CC-BY, credited in README.md and on
   the Skills panel), chosen as generic things rather than anybody's logo: vendor
   marks may not be redrawn or restyled. Machine learning has no light model worth
   using, so it keeps a small hand-built network. Each carries a name tag.

   Sizes are metres for a reader 1.75 m tall: each object is 35 to 45 cm across,
   floating between about 1.1 and 1.8 m, with a 50 cm tag under it. */

import * as THREE from "three";
import { loadProp } from "./realism.js";

const AMBER = 0xf0a31e;

const mat = {
  amber: new THREE.MeshStandardMaterial({ color: AMBER, emissive: 0x3a2404, roughness: 0.4, metalness: 0.2 }),
  pale: new THREE.MeshStandardMaterial({ color: 0xe6ece7, roughness: 0.5, metalness: 0 })
};

/* a three-layer network about 40 cm wide */
function neural() {
  const g = new THREE.Group();
  const layers = [[-0.18, 3], [0, 4], [0.18, 2]];
  const nodes = [];
  layers.forEach(([x, n]) => {
    const col = [];
    for (let i = 0; i < n; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.026, 24, 16), x === 0 ? mat.amber : mat.pale);
      b.position.set(x, (i - (n - 1) / 2) * 0.1, 0);
      g.add(b);
      col.push(b.position);
    }
    nodes.push(col);
  });
  const pts = [];
  for (let l = 0; l < nodes.length - 1; l++) for (const a of nodes[l]) for (const b of nodes[l + 1]) pts.push(a, b);
  g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: 0x9fb8ab, transparent: true, opacity: 0.55 })));
  return g;
}

/* label: hover text and panel wording; tag: the short name floating under the object;
   size: the object's largest dimension in metres */
export const SKILLS = [
  { key: "c", label: "C and C++", tag: "C / C++", model: "icons/computer", size: 0.42 },
  { key: "python", label: "Python", tag: "Python", model: "icons/snake", size: 0.44 },
  { key: "ai", label: "Artificial intelligence", tag: "AI", model: "icons/brain", size: 0.4 },
  { key: "ml", label: "Machine learning and deep learning", tag: "ML / DL", make: neural, size: 0.4 },
  { key: "agentic", label: "Agentic AI", tag: "Agentic AI", model: "icons/robot", size: 0.44 },
  { key: "llm", label: "Large language models", tag: "LLMs", model: "icons/speech-bubble", size: 0.38 },
  { key: "slm", label: "Small language models", tag: "SLMs", model: "icons/books", size: 0.38 },
  { key: "vlm", label: "Vision language models", tag: "VLMs", model: "icons/eye", size: 0.35 },
  { key: "linux", label: "Linux: Gentoo, Arch, Debian", tag: "Linux", model: "icons/penguin", size: 0.4 },
  { key: "rnd", label: "Research and development", tag: "R&D", model: "icons/flask", size: 0.4 }
];

const TAG_W = 0.5;

function nameTag(text) {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 96;
  const x = c.getContext("2d");
  x.fillStyle = "rgba(7, 13, 12, 0.82)"; x.fillRect(0, 0, 512, 96);
  x.fillStyle = "#f0a31e"; x.fillRect(0, 92, 512, 4);
  x.fillStyle = "#e3eae4"; x.font = "500 44px 'Share Tech Mono', monospace";
  x.textAlign = "center"; x.textBaseline = "middle";
  x.fillText(text, 256, 48, 490);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, toneMapped: false, depthWrite: false }));
  s.scale.set(TAG_W, TAG_W * (96 / 512), 1);
  return s;
}

const mark = (holder, root) => root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.skillHolder = holder; } });

/* A ring of skills floating over the plinth, each turning slowly.
   radius: the ring on the ground; low and high: the two alternating centre heights
   above the group's origin; padY: the plinth top, where each skill's amber mark sits. */
export function makeSkillRing(reduceMotion, { radius = 1.45, low = 1.25, high = 1.6, padY = 0.3 } = {}) {
  const group = new THREE.Group();
  const heightOf = (i) => (i % 2 ? high : low);
  const items = SKILLS.map((s, i) => {
    const holder = new THREE.Group();
    const a = (i / SKILLS.length) * Math.PI * 2;
    holder.position.set(Math.cos(a) * radius, heightOf(i), Math.sin(a) * radius);
    holder.userData = { skill: s, phase: i * 0.7 };

    const icon = new THREE.Group();
    holder.add(icon);
    if (s.make) {
      const built = s.make();
      icon.add(built);
      mark(holder, built);
    } else {
      loadProp(s.model, s.size).then((prop) => {
        if (!prop) return;
        prop.position.y -= s.size / 2;   // loadProp stands a model on y = 0; hang it from its middle
        icon.add(prop);
        mark(holder, prop);
      });
    }
    const tag = nameTag(s.tag);
    tag.position.y = -s.size / 2 - 0.09;
    holder.add(tag);

    const pad = new THREE.Mesh(new THREE.RingGeometry(0.14, 0.17, 32),
      new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0.25, side: THREE.DoubleSide }));
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(holder.position.x, padY + 0.005, holder.position.z);
    group.add(pad, holder);
    return { holder, icon };
  });

  function update(dt, t) {
    if (reduceMotion) return;
    items.forEach(({ holder, icon }, i) => {
      icon.rotation.y += dt * 0.5;
      holder.position.y = heightOf(i) + Math.sin(t * 1.1 + holder.userData.phase) * 0.03;
    });
  }

  return { group, items, update };
}
