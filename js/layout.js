/* Where everything on the campus stands, in metres, for a reader 1.75 m tall.

   This module is plain numbers and a little geometry with no imports, so the same
   layout builds the island in the browser (island.js) and is checked under Node
   (tools/checks/zones.mjs). World axes: x to the right as you face the workbench
   from the start, z toward you, y up; the ground is GROUND and the plaza centre is
   (0, GROUND, 0).

   A landmark stands at (x, z) on the ground, turned by ry to face the plaza. Its
   own frame has +z pointing at the plaza. Shapes on the ground are circles
   { x, z, r } or rectangles { x, z, w, d } in that frame; in the world they become
   circles or oriented rectangles { x, z, hw, hd, c, s }, the form player.js pushes
   the hacker out of. A heading h faces the ground direction (sin h, cos h), so
   Math.PI faces -z. */

export const GROUND = -1.4;
export const PLAYER_RADIUS = 0.3;
/* the island's top is 24 m across the radius; the hacker is kept inside 21.5 m */
export const ISLAND = { radius: 24, walk: 21.5 };
export const PLAZA_RADIUS = 7.5;
/* the lit slab under each building */
export const PAD_TOP = 0.14;
/* a table or lab bench top above the floor it stands on */
export const TABLE_TOP = 0.75;

/* ------------------------------------------------------------------ geometry */

/* face the plaza, squared to the nearest quarter turn so the campus reads as a grid */
export const quarterTurn = (x, z) => Math.round((Math.atan2(x, z) + Math.PI) / (Math.PI / 2)) * (Math.PI / 2);

export function frameOf(site) {
  return { px: site.x, pz: site.z, c: Math.cos(site.ry), s: Math.sin(site.ry) };
}

/* a point in a landmark's frame, on the world ground */
export function worldXZ(f, x, z) {
  return [f.px + x * f.c + z * f.s, f.pz - x * f.s + z * f.c];
}

/* a shape in a landmark's frame, as a world shape; extra fields are copied across */
export function toWorld(f, sh, extra = {}) {
  const [x, z] = worldXZ(f, sh.x, sh.z);
  return sh.r !== undefined
    ? { x, z, r: sh.r, ...extra }
    : { x, z, hw: sh.w / 2, hd: sh.d / 2, c: f.c, s: f.s, ...extra };
}

/* is a ground point inside a world oriented rectangle? */
export function inRect(r, x, z) {
  const dx = x - r.x, dz = z - r.z;
  return Math.abs(dx * r.c - dz * r.s) <= r.hw && Math.abs(dx * r.s + dz * r.c) <= r.hd;
}

/* how far a ground point is outside a world shape: 0 or less means inside */
export function gap(k, x, z) {
  if (k.r !== undefined) return Math.hypot(x - k.x, z - k.z) - k.r;
  const dx = x - k.x, dz = z - k.z;
  const lx = Math.abs(dx * k.c - dz * k.s) - k.hw, lz = Math.abs(dx * k.s + dz * k.c) - k.hd;
  return lx <= 0 && lz <= 0 ? Math.max(lx, lz) : Math.hypot(Math.max(lx, 0), Math.max(lz, 0));
}

/* distance on the ground from (x, z) to the segment a-b */
export function segmentDistance(x, z, [ax, az], [bx, bz]) {
  const dx = bx - ax, dz = bz - az;
  const k = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1e-6)));
  return Math.hypot(x - ax - dx * k, z - az - dz * k);
}

const site = (x, z) => ({ x, z, ry: quarterTurn(x, z) });

/* ----------------------------------------------------------------- landmarks */

const LAB_BENCHES = { xs: [-3.2, 0, 3.2], z: -2.7, w: 2.0, d: 0.8 };
const LAB_TURNTABLE = { x: 3.4, z: 1.0, r: 0.3, h: 0.9 };
const HALL_PEDESTAL = { x: 6.6, z: 1.6, r: 0.22, h: 0.95 };
const SHED_TABLE = { x: 0, z: -1.2, w: 2.2, d: 0.8 };
const SHED_TOOLBOX = { x: -2.05, z: 1.05 };
const SKILLS_PLINTH = { r: 1.8, h: 0.3 };
const SHOWCASE = { z: -4.6, w: 2.4, h: 2.0, d: 0.45, shelves: [1.3, 1.7, 0.9] };
const MAST_GATE = { x: 1.3, z: 1.95, h: 3.0 };
/* 20 cm risers on 28 cm treads, a comfortable domestic stair */
const STAGE_STEPS = { x: 3.4, w: 1.2, rise: 0.2, run: 0.28, count: 3 };

export const LANDMARKS = {
  research: {
    ...site(-7, -16),
    pad: [0, 0, 7, 7],
    /* three ten-sided drums, [radius, height]: the lowest is a storey with a door */
    drums: [[2.4, 2.8], [2.0, 2.2], [1.7, 2.0]],
    door: { w: 1.0, h: 2.1 },
    solids: [{ x: 0, z: 0, r: 2.45 }],
    floors: []
  },
  stage: {
    ...site(16, -6),
    /* the pad runs from 3.9 m behind the centre to 3.7 m in front, past the foot
       of the steps (the deck front 2.75 m plus three 28 cm treads, 3.59 m) */
    pad: [0, -0.1, 11, 7.6],
    deck: { w: 9, d: 5.5, h: 0.8 },
    steps: STAGE_STEPS,
    solids: [
      { x: 0, z: -0.15, w: 9.6, d: 5.9 },
      { x: STAGE_STEPS.x, z: 2.75 + (STAGE_STEPS.run * STAGE_STEPS.count) / 2, w: STAGE_STEPS.w + 0.1, d: STAGE_STEPS.run * STAGE_STEPS.count + 0.06 }
    ],
    floors: []
  },
  lab: {
    ...site(16, 7),
    pad: [0, 0, 12, 9],
    floor: { w: 10, d: 7, top: 0.2 },
    benches: LAB_BENCHES,
    turntable: LAB_TURNTABLE,
    solids: [
      { x: 0, z: -3.4, w: 10.4, d: 0.45 }, { x: -5, z: 0, w: 0.45, d: 7.2 }, { x: 5, z: 0, w: 0.45, d: 7.2 },
      ...LAB_BENCHES.xs.map((x) => ({ x, z: LAB_BENCHES.z, w: LAB_BENCHES.w + 0.1, d: LAB_BENCHES.d + 0.1 })),
      { x: LAB_TURNTABLE.x, z: LAB_TURNTABLE.z, r: LAB_TURNTABLE.r + 0.1 }
    ],
    floors: [{ x: 0, z: 0, w: 10, d: 7, top: 0.2 }]
  },
  hall: {
    ...site(0, 16.5),
    pad: [0, 0, 18, 7.5],
    width: 16,
    floor: { d: 6, top: 0.3 },
    wallZ: -2.7,
    columns: [[-7.6, 2.5], [7.6, 2.5]],
    /* certificate rows, centre heights above the hall floor, and the spacing along the wall */
    rows: [1.6, 1.15],
    step: 0.6,
    pedestal: HALL_PEDESTAL,
    solids: [
      { x: 0, z: -2.7, w: 16, d: 0.45 }, { x: -7.6, z: 2.5, r: 0.35 }, { x: 7.6, z: 2.5, r: 0.35 },
      { x: HALL_PEDESTAL.x, z: HALL_PEDESTAL.z, r: HALL_PEDESTAL.r + 0.13 }
    ],
    floors: [{ x: 0, z: 0, w: 16, d: 6, top: 0.3 }]
  },
  skills: {
    ...site(-14, 2),
    pad: [0, -1.6, 13, 12.4],
    plinth: SKILLS_PLINTH,
    /* the skill objects float round the plinth; heights above the pad */
    ring: { radius: 1.45, low: 1.25, high: 1.6 },
    showcase: SHOWCASE,
    backdrop: { z: -4.95, w: 6, h: 3.4 },
    solids: [{ x: 0, z: 0, r: SKILLS_PLINTH.r + 0.1 }, { x: 0, z: -4.75, w: 6.2, d: 0.7 }],
    floors: []
  },
  shed: {
    ...site(-13, -10),
    pad: [0, 0, 7, 5.6],
    floor: { w: 5.4, d: 4, top: 0.2 },
    table: SHED_TABLE,
    toolbox: SHED_TOOLBOX,
    solids: [
      { x: 0, z: -1.9, w: 5.4, d: 0.35 },
      { x: SHED_TABLE.x, z: SHED_TABLE.z, w: SHED_TABLE.w + 0.1, d: SHED_TABLE.d + 0.1 },
      { x: SHED_TOOLBOX.x, z: SHED_TOOLBOX.z, r: 0.35 }
    ],
    floors: [{ x: 0, z: 0, w: 5.4, d: 4, top: 0.2 }]
  },
  mast: {
    ...site(8, -16),
    pad: [0, 0, 5, 5],
    plinth: { r: 1.6, h: 0.4 },
    gate: MAST_GATE,
    solids: [{ x: 0, z: 0, r: 1.75 }, { x: -MAST_GATE.x, z: MAST_GATE.z, r: 0.12 }, { x: MAST_GATE.x, z: MAST_GATE.z, r: 0.12 }],
    floors: []
  }
};

/* The workbench belongs to bench.js, which builds the desk, chair, tower and arm
   and returns their colliders. The campus only knows where its zone and door are,
   and a box round desk and chair to click. */
export const BENCH = {
  zone: { x: -0.35, z: 0.75, hw: 1.25, hd: 1.2, c: 1, s: 0 },
  spawn: { x: -0.45, z: 1.35, heading: Math.PI },
  hit: { x: -0.375, z: 0.3, w: 1.8, d: 1.35, h: 1.4 },
  focus: { x: -0.25, y: 0.95, z: 0 },
  dist: 2.4,
  lift: 0.9,
  dir: [0.55, 0, 1]
};

/* the serial-link rig beside the workbench, part of the About panel */
export const SERIAL_LINK = { x: 2.4, z: -1.8, r: 0.35, h: 0.9 };

/* walkways from the plaza rim to the front edge of each building's pad */
export const BUSES = [
  [[7.4, -1.2], [10.5, -1.2], [10.5, -6], [12.2, -6]],        // work: the stage
  [[7.4, 1.2], [10.5, 1.2], [10.5, 7], [11.3, 7]],            // work: the lab
  [[0, 7.5], [0, 12.5]],                                      // credentials hall
  [[-7.23, 2], [-9.2, 2]],                                    // skills lab
  [[-7.0, -2.7], [-8.2, -2.7], [-8.2, -9.2], [-10.0, -9.2]],  // toolchain
  [[-2.2, -7.2], [-2.2, -11.4], [-7, -11.4], [-7, -12.3]],    // research tower
  [[2.2, -7.2], [2.2, -11.4], [8, -11.4], [8, -13.3]]         // contact mast
];
/* half the width a walkway keeps clear of planters and lamps */
export const WALKWAY_CLEAR = 1.8;

/* zone names painted just inside the plaza rim: [text, x, z, ux, uz] */
export const LABELS = [
  ["WORK", 6.1, 0, 1, 0],
  ["CREDENTIALS", 0, 6.1, 0, 1],
  ["SKILLS", -6.1, 1.7, -1, 0],
  ["TOOLCHAIN", -5.2, -3.3, -0.85, -0.53],
  ["RESEARCH", -2.4, -6.0, 0, -1],
  ["CONTACT", 2.4, -6.0, 0, -1]
];

export const PLANTER_RADIUS = 0.95;
export const PLANTERS = [[6.2, 6.2], [-6.2, 6.2], [6.3, -6.3], [-5.7, -6.0], [10.2, 13.4], [-10.2, 13.4], [13, -13.5], [-13.5, 12.5], [-14, -16.5]];

/* street lights round the plaza, every 30 degrees at 8.7 m except where a walkway
   leaves (0, 90 and 210 degrees): [x, z, ry] with the head over the plaza */
export const LAMP_RADIUS = 0.25;
export const LAMPS = [30, 60, 120, 150, 180, 240, 270, 300, 330].map((a) => {
  const r = (a * Math.PI) / 180;
  return [+(Math.cos(r) * 8.7).toFixed(3), +(Math.sin(r) * 8.7).toFixed(3), Math.PI - r];
});

/* the hacker starts on the plaza, facing the workbench, outside every zone */
export const START = { x: 0, z: 4.2, heading: Math.PI };

/* ------------------------------------------------------ zones, doors, colliders */

export const ORDER = ["bench", "research", "stage", "lab", "hall", "skills", "shed", "mast"];
export const SHORT = { bench: "Workbench", research: "Research", stage: "Stage", lab: "Lab", hall: "Credentials", skills: "Skills", shed: "Toolchain", mast: "Contact" };

/* a building's zone is its pad grown 1.5 m across and 3 m deep (half in front, half
   behind); its door is 1.1 m in front of the pad, facing in */
const ZONE_ACROSS = 1.5, ZONE_DEEP = 3, DOOR_OUT = 1.1;

export const ZONES = { bench: BENCH.zone };
export const SPAWNS = { bench: BENCH.spawn };
export const COLLIDERS = [];
export const PLATFORMS = [];

for (const key of ORDER) {
  const b = LANDMARKS[key];
  if (!b) continue;
  const f = frameOf(b);
  b.solids.forEach((sh) => COLLIDERS.push(toWorld(f, sh, { tag: key })));
  b.floors.forEach((sh) => PLATFORMS.push(toWorld(f, sh, { top: sh.top, tag: key })));
  const [cx, cz, w, d] = b.pad;
  PLATFORMS.push(toWorld(f, { x: cx, z: cz, w, d }, { top: PAD_TOP, tag: key + " pad" }));
  ZONES[key] = toWorld(f, { x: cx, z: cz, w: w + ZONE_ACROSS, d: d + ZONE_DEEP });
  const [sx, sz] = worldXZ(f, cx, cz + d / 2 + DOOR_OUT);
  const h = b.ry + Math.PI;
  SPAWNS[key] = { x: sx, z: sz, heading: Math.atan2(Math.sin(h), Math.cos(h)) };
}
COLLIDERS.push({ x: SERIAL_LINK.x, z: SERIAL_LINK.z, r: SERIAL_LINK.r + 0.1, tag: "serial link" });
PLANTERS.forEach(([x, z]) => COLLIDERS.push({ x, z, r: PLANTER_RADIUS, tag: "planter" }));
LAMPS.forEach(([x, z]) => COLLIDERS.push({ x, z, r: LAMP_RADIUS, tag: "lamp" }));

/* the highest platform under a ground point, above GROUND */
export function heightAt(x, z, platforms = PLATFORMS) {
  let top = 0;
  for (const p of platforms) if (p.top > top && inRect(p, x, z)) top = p.top;
  return top;
}
