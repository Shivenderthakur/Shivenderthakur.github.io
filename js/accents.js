/* Small live pieces beside the writing: the face pipeline, the gesture link,
   the two-plane servo trace, and the boards themselves.

   All four share a single WebGL context. The renderer draws each one into a
   corner of one offscreen canvas and the result is blitted into the 2D canvas
   on the page, so four moving pictures cost one GPU context, not four. */

import * as THREE from "three";

const INK = 0x44584f;
const STEEL = 0xa7b3ab;
const AMBER = 0xf0a31e;

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const nodes = Array.from(document.querySelectorAll("[data-accent]"));

function start() {
  const gl = document.createElement("canvas");
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: gl, antialias: true, alpha: true });
  } catch (err) {
    nodes.forEach((n) => {
      const note = n.nextElementSibling;
      if (note && note.classList.contains("accent__note")) note.remove();
      n.remove();
    });
    console.error(err);
    return;
  }

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  renderer.setClearAlpha(0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;

  const makers = { face: makeFace, hand: makeHand, trace: makeTrace, boards: makeBoards };
  const views = [];
  let maxW = 1;
  let maxH = 1;

  for (const el of nodes) {
    const make = makers[el.dataset.accent];
    if (!make) continue;
    const ctx = el.getContext("2d");
    if (!ctx) continue;
    const view = make();
    view.el = el;
    view.ctx = ctx;
    view.visible = false;
    views.push(view);

    if (typeof IntersectionObserver === "function") {
      new IntersectionObserver(([e]) => { view.visible = e.isIntersecting; }, { rootMargin: "80px" })
        .observe(el);
    } else {
      view.visible = true;
    }
  }
  if (!views.length) return;

  function measure() {
    maxW = 1;
    maxH = 1;
    for (const v of views) {
      const r = v.el.getBoundingClientRect();
      v.w = Math.max(1, Math.round(r.width));
      v.h = Math.max(1, Math.round(r.height));
      v.el.width = Math.round(v.w * dpr);
      v.el.height = Math.round(v.h * dpr);
      maxW = Math.max(maxW, v.w);
      maxH = Math.max(maxH, v.h);
      v.camera.aspect = v.w / v.h;
      v.camera.updateProjectionMatrix();
    }
    renderer.setSize(maxW, maxH, false);
  }

  measure();
  if (typeof ResizeObserver === "function") new ResizeObserver(measure).observe(document.body);
  else window.addEventListener("resize", measure);

  let prev = performance.now();
  requestAnimationFrame(function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - prev) / 1000, 0.05);
    prev = now;
    if (document.hidden) return;

    for (const v of views) {
      if (!v.visible) continue;
      v.update(dt, now / 1000);

      renderer.setViewport(0, maxH - v.h, v.w, v.h);
      renderer.setScissor(0, maxH - v.h, v.w, v.h);
      renderer.setScissorTest(true);
      renderer.clear(true, true, true);
      renderer.render(v.scene, v.camera);

      v.ctx.clearRect(0, 0, v.el.width, v.el.height);
      v.ctx.drawImage(gl, 0, 0, Math.round(v.w * dpr), Math.round(v.h * dpr),
                          0, 0, v.el.width, v.el.height);
    }
  });
}

/* ------------------------------------------------------------- shared bits */

function stage(fov, dist, y) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 40);
  camera.position.set(0, y, dist);
  camera.lookAt(0, y * 0.55, 0);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a968f, 2.1));
  const key = new THREE.DirectionalLight(0xffffff, 2.6);
  key.position.set(2, 3.5, 3);
  scene.add(key);
  const rim = new THREE.DirectionalLight(AMBER, 1.1);
  rim.position.set(-3, 1, -2);
  scene.add(rim);

  return { scene, camera };
}

function dots(points, size, color) {
  const g = new THREE.BufferGeometry().setFromPoints(points);
  return new THREE.Points(g, new THREE.PointsMaterial({ color, size, sizeAttenuation: true }));
}

function wires(points, pairs, color, opacity) {
  const list = [];
  for (const [a, b] of pairs) list.push(points[a], points[b]);
  const g = new THREE.BufferGeometry().setFromPoints(list);
  return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
}

/* ------------------------------------------------- 1. the face pipeline */

function makeFace() {
  const { scene, camera } = stage(34, 4.2, 0.35);
  const group = new THREE.Group();
  scene.add(group);

  const head = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1, 2),
    new THREE.MeshStandardMaterial({ color: 0x5b6f66, roughness: 0.6, metalness: 0.2, flatShading: true })
  );
  head.scale.set(0.78, 1, 0.82);
  group.add(head);

  const shell = new THREE.LineSegments(
    new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(1.03, 2)),
    new THREE.LineBasicMaterial({ color: STEEL, transparent: true, opacity: 0.22 })
  );
  shell.scale.copy(head.scale);
  group.add(shell);

  /* the landmarks a face recogniser actually keys on */
  const plan = [
    [-0.34, 0.26], [-0.22, 0.32], [-0.1, 0.28],          // left brow
    [0.1, 0.28], [0.22, 0.32], [0.34, 0.26],             // right brow
    [-0.24, 0.1], [-0.16, 0.14], [-0.08, 0.1],           // left eye
    [0.08, 0.1], [0.16, 0.14], [0.24, 0.1],              // right eye
    [0, 0.02], [0, -0.1], [-0.09, -0.18], [0.09, -0.18], // nose
    [-0.2, -0.36], [-0.08, -0.32], [0.08, -0.32], [0.2, -0.36],
    [-0.1, -0.44], [0.1, -0.44],                         // mouth
    [-0.42, -0.06], [-0.36, -0.34], [-0.24, -0.56], [0, -0.66],
    [0.24, -0.56], [0.36, -0.34], [0.42, -0.06]          // jaw
  ];
  const marks = plan.map(([x, y]) => {
    const px = x * 1.55;
    const py = y * 1.5;
    const r = Math.max(0.15, 1 - px * px * 1.5 - py * py * 0.9);
    return new THREE.Vector3(px * 0.78, py, Math.sqrt(r) * 0.84);
  });

  const cloud = dots(marks, 0.095, AMBER);
  group.add(cloud);

  const jaw = [];
  for (let i = 22; i < marks.length - 1; i++) jaw.push([i, i + 1]);
  group.add(wires(marks, jaw, AMBER, 0.4));

  /* the box a detector would draw */
  const box = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1.55, 1.85, 1.55)),
    new THREE.LineBasicMaterial({ color: AMBER, transparent: true, opacity: 0.35 })
  );
  group.add(box);

  const scan = new THREE.Mesh(
    new THREE.PlaneGeometry(1.2, 0.016),
    new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0.55 })
  );
  scan.position.z = 0.95;
  group.add(scan);

  return {
    scene, camera,
    update(dt, t) {
      const sway = reduceMotion ? 0.35 : Math.sin(t * 0.42) * 0.55;
      group.rotation.y = sway;
      group.rotation.x = Math.sin(t * 0.31) * 0.09;
      scan.position.y = reduceMotion ? 0.2 : (((t * 0.5) % 1) - 0.5) * 1.85;
      cloud.material.size = 0.088 + Math.sin(t * 3) * 0.012;
    }
  };
}

/* ------------------------------------------- 2. the gesture link, KineLink */

const HAND_BONES = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17]
];

/* an open hand and the same hand pinched: the demo interpolates between them */
const HAND_OPEN = [
  [0, -1.05], [-0.36, -0.78], [-0.62, -0.5], [-0.8, -0.24], [-0.92, 0.02],
  [-0.34, -0.12], [-0.42, 0.28], [-0.46, 0.56], [-0.5, 0.8],
  [-0.1, -0.06], [-0.12, 0.38], [-0.14, 0.7], [-0.15, 0.96],
  [0.14, -0.08], [0.18, 0.32], [0.2, 0.62], [0.22, 0.86],
  [0.36, -0.16], [0.46, 0.14], [0.52, 0.38], [0.56, 0.58]
];
const HAND_PINCH = [
  [0, -1.05], [-0.34, -0.78], [-0.5, -0.46], [-0.44, -0.18], [-0.3, 0.06],
  [-0.32, -0.12], [-0.34, 0.26], [-0.3, 0.46], [-0.22, 0.6],
  [-0.1, -0.06], [-0.12, 0.3], [-0.06, 0.46], [0.02, 0.52],
  [0.14, -0.08], [0.18, 0.24], [0.22, 0.4], [0.28, 0.44],
  [0.36, -0.16], [0.44, 0.08], [0.46, 0.24], [0.48, 0.34]
];

function makeHand() {
  const { scene, camera } = stage(34, 5.1, 0.3);
  const group = new THREE.Group();
  group.position.x = -0.55;
  scene.add(group);

  const pts = HAND_OPEN.map(([x, y]) => new THREE.Vector3(x, y, 0));
  const cloud = dots(pts, 0.13, AMBER);
  group.add(cloud);

  const bones = wires(pts, HAND_BONES, INK, 0.85);
  group.add(bones);

  /* the gripper the hand is driving */
  const rig = new THREE.Group();
  rig.position.set(1.0, 0.05, 0);
  scene.add(rig);

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.3, 0.3),
    new THREE.MeshStandardMaterial({ color: INK, roughness: 0.4, metalness: 0.6 })
  );
  rig.add(body);

  const jaws = [-1, 1].map((side) => {
    const jaw = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.09, 0.09),
      new THREE.MeshStandardMaterial({ color: STEEL, roughness: 0.3, metalness: 0.8 })
    );
    jaw.position.set(0.4, side * 0.2, 0);
    rig.add(jaw);
    return jaw;
  });

  const held = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.22, 0.22),
    new THREE.MeshStandardMaterial({ color: AMBER, roughness: 0.5, metalness: 0.2 })
  );
  held.position.set(0.62, 0, 0);
  rig.add(held);

  const link = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0.25, 0.32, 0), new THREE.Vector3(1.32, 0.12, 0)]),
    new THREE.LineDashedMaterial({ color: AMBER, dashSize: 0.09, gapSize: 0.07, transparent: true, opacity: 0.55 })
  );
  link.computeLineDistances();
  group.add(link);

  const pos = cloud.geometry.attributes.position;
  const bonePos = bones.geometry.attributes.position;

  return {
    scene, camera,
    update(dt, t) {
      const k = reduceMotion ? 0.55 : (Math.sin(t * 1.5) * 0.5 + 0.5);
      for (let i = 0; i < 21; i++) {
        const x = HAND_OPEN[i][0] + (HAND_PINCH[i][0] - HAND_OPEN[i][0]) * k;
        const y = HAND_OPEN[i][1] + (HAND_PINCH[i][1] - HAND_OPEN[i][1]) * k;
        pts[i].set(x, y, 0);
        pos.setXYZ(i, x, y, 0);
      }
      pos.needsUpdate = true;
      HAND_BONES.forEach(([a, b], i) => {
        bonePos.setXYZ(i * 2, pts[a].x, pts[a].y, 0);
        bonePos.setXYZ(i * 2 + 1, pts[b].x, pts[b].y, 0);
      });
      bonePos.needsUpdate = true;

      const open = 0.2 - k * 0.075;
      jaws[0].position.y = -open;
      jaws[1].position.y = open;
      held.scale.setScalar(0.9 + k * 0.12);
      rig.rotation.y = Math.sin(t * 0.5) * 0.3;
      group.rotation.y = Math.sin(t * 0.5) * 0.18;
    }
  };
}

/* ------------------------------------- 3. servo control in two planes */

function makeTrace() {
  const { scene, camera } = stage(36, 3.5, 0.35);
  const group = new THREE.Group();
  scene.add(group);

  const steel = new THREE.MeshStandardMaterial({ color: STEEL, roughness: 0.3, metalness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: INK, roughness: 0.45, metalness: 0.6 });

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.14, 24), dark);
  base.position.y = -1;
  group.add(base);

  const A = 0.95, B = 0.8;
  const j1 = new THREE.Group();
  j1.position.y = -0.9;
  group.add(j1);

  const arm1 = new THREE.Mesh(new THREE.BoxGeometry(A, 0.13, 0.13), steel);
  arm1.position.x = A / 2;
  j1.add(arm1);

  const j2 = new THREE.Group();
  j2.position.x = A;
  j1.add(j2);
  const arm2 = new THREE.Mesh(new THREE.BoxGeometry(B, 0.1, 0.1), steel);
  arm2.position.x = B / 2;
  j2.add(arm2);

  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12),
    new THREE.MeshBasicMaterial({ color: AMBER }));
  tip.position.x = B;
  j2.add(tip);

  /* the two planes the arm works in */
  for (const [rot, tint] of [[0, 0.3], [Math.PI / 2, 0.16]]) {
    const frame = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(2.5, 2.1)),
      new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: tint })
    );
    frame.position.set(0.55, -0.02, 0);
    frame.rotation.y = rot;
    group.add(frame);
  }

  const N = 120;
  const trail = new Float32Array(N * 3);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute("position", new THREE.BufferAttribute(trail, 3));
  const trailLine = new THREE.Line(trailGeo,
    new THREE.LineBasicMaterial({ color: AMBER }));
  group.add(trailLine);

  let filled = 0;
  const world = new THREE.Vector3();

  return {
    scene, camera,
    update(dt, t) {
      /* a target sweeping a figure that uses both planes */
      const tx = 0.55 + Math.cos(t * 0.85) * 0.72;
      const ty = -0.05 + Math.sin(t * 1.3) * 0.72;
      group.rotation.y = Math.sin(t * 0.28) * 0.75;

      const px = tx;
      const py = ty;
      const dist = Math.min(Math.max(Math.hypot(px, py), Math.abs(A - B) + 0.05), A + B - 0.02);
      const c2 = (dist * dist - A * A - B * B) / (2 * A * B);
      const a2 = -Math.acos(Math.max(-1, Math.min(1, c2)));
      const a1 = Math.atan2(py, px) - Math.atan2(B * Math.sin(a2), A + B * Math.cos(a2));
      j1.rotation.z = a1;
      j2.rotation.z = a2;

      tip.getWorldPosition(world);
      group.worldToLocal(world);
      trail.copyWithin(0, 3);
      trail[(N - 1) * 3] = world.x;
      trail[(N - 1) * 3 + 1] = world.y;
      trail[(N - 1) * 3 + 2] = world.z;
      filled = Math.min(filled + 1, N);
      trailGeo.setDrawRange(N - filled, filled);
      trailGeo.attributes.position.needsUpdate = true;
    }
  };
}

/* ---------------------------------------------- 4. the boards themselves */

function makeBoards() {
  const { scene, camera } = stage(26, 5.0, 0.3);
  /* look down on the boards so the sockets, headers and LEDs are the story */
  camera.position.set(0, 1.55, 4.5);
  camera.lookAt(0, 0.02, 0);
  const group = new THREE.Group();
  scene.add(group);

  const specs = [
    { w: 1.9, d: 1.2 },
    { w: 1.35, d: 0.78 },
    { w: 0.95, d: 0.55 }
  ];

  const pcb = new THREE.MeshStandardMaterial({ color: 0x2b6553, roughness: 0.64, metalness: 0.2 });
  const chip = new THREE.MeshStandardMaterial({ color: 0x27302d, roughness: 0.5, metalness: 0.45 });
  const pin = new THREE.MeshStandardMaterial({ color: 0xc8ab63, roughness: 0.35, metalness: 0.9 });
  const led = new THREE.MeshBasicMaterial({ color: AMBER });

  specs.forEach((s, i) => {
    const card = new THREE.Group();
    card.position.set((i - 1) * 1.02, (i - 1) * -0.2 + 0.12, (i - 1) * 0.16);
    card.rotation.set(0.16, i * 0.3 - 0.34, 0.04);

    const board = new THREE.Mesh(new THREE.BoxGeometry(s.w, 0.045, s.d), pcb);
    card.add(board);

    const soc = new THREE.Mesh(new THREE.BoxGeometry(s.w * 0.34, 0.085, s.d * 0.4), chip);
    soc.position.set(-s.w * 0.06, 0.062, 0);
    card.add(soc);

    const header = new THREE.Mesh(new THREE.BoxGeometry(s.w * 0.76, 0.1, 0.075), pin);
    header.position.set(0, 0.072, -s.d / 2 + 0.09);
    card.add(header);

    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.042, 10, 8), led);
    dot.position.set(s.w / 2 - 0.12, 0.06, s.d / 2 - 0.1);
    card.add(dot);

    group.add(card);
  });

  return {
    scene, camera,
    update(dt, t) {
      group.rotation.y = reduceMotion ? -0.25 : Math.sin(t * 0.22) * 0.38 - 0.08;
      group.children.forEach((c, i) => {
        c.position.y = (i - 1) * -0.2 + 0.12 + (reduceMotion ? 0 : Math.sin(t * 0.7 + i) * 0.04);
      });
    }
  };
}

/* Declarations are all in place, so build the pieces. */
if (nodes.length) start();
