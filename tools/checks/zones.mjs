/* Checks the campus layout in js/layout.js under plain Node, no browser.

   The layout is where the hacker can stand, so a mistake in it shows up as a door
   inside a wall, a panel that opens for the wrong building, or a planter through
   the workbench. This asserts, for a walker 0.3 m in radius:
   - every door (spawn) is inside its own zone, clear of every collider (the
     campus's own and the workbench's desk, tower and chair), off any raised floor,
     and inside the island's walkable edge;
   - where zones overlap, the nearest zone centre wins, and every door resolves to
     its own place;
   - the start point is in no zone and clear of every collider;
   - the workbench zone and door match the shared contract with bench.js;
   - nothing the campus places overlaps the desk, the tower or the chair, and no
     campus collider stands inside the workbench zone;
   - planters and street lights keep clear of the walkways;
   - every landmark faces the plaza.

   usage: node tools/checks/zones.mjs   (exit code 1 on any failure) */

import * as L from "../../js/layout.js";

const R = L.PLAYER_RADIUS;
const EPS = 1e-6;
const failures = [];
let passed = 0;
const check = (ok, message) => { if (ok) passed++; else failures.push(message); };
const f2 = (v) => v.toFixed(2);

/* the workbench footprints from the contract; bench.js builds and owns them */
const rect = (tag, x, z, w, d) => ({ tag, x, z, hw: w / 2, hd: d / 2, c: 1, s: 0 });
const DESK = rect("desk", -0.25, 0, 1.4, 0.7);
const TOWER = rect("tower", -1.1, -0.1, 0.25, 0.5);
const CHAIR = rect("chair", -0.45, 0.65, 0.6, 0.6);
const BENCH_ZONE = { x: -0.35, z: 0.75, hw: 1.25, hd: 1.2, c: 1, s: 0 };
const APPROACH = { x: -0.45, z: 1.35, heading: Math.PI };
const BENCH_PARTS = [DESK, TOWER, CHAIR];
const BLOCKING = [...L.COLLIDERS, ...BENCH_PARTS];

/* ------------------------------------------------------------ shape overlap */

const corners = (k) => {
  /* local x runs along (c, -s) and local z along (s, c) on the ground */
  const ux = [k.c, -k.s], uz = [k.s, k.c];
  return [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([a, b]) =>
    [k.x + a * k.hw * ux[0] + b * k.hd * uz[0], k.z + a * k.hw * ux[1] + b * k.hd * uz[1]]);
};

function rectsOverlap(a, b) {
  const ca = corners(a), cb = corners(b);
  for (const k of [a, b]) {
    for (const axis of [[k.c, -k.s], [k.s, k.c]]) {
      const pa = ca.map(([x, z]) => x * axis[0] + z * axis[1]);
      const pb = cb.map(([x, z]) => x * axis[0] + z * axis[1]);
      if (Math.max(...pa) <= Math.min(...pb) + EPS || Math.max(...pb) <= Math.min(...pa) + EPS) return false;
    }
  }
  return true;
}

function overlaps(a, b) {
  if (a.r !== undefined && b.r !== undefined) return Math.hypot(a.x - b.x, a.z - b.z) < a.r + b.r - EPS;
  if (a.r !== undefined) return L.gap(b, a.x, a.z) < a.r - EPS;
  if (b.r !== undefined) return L.gap(a, b.x, b.z) < b.r - EPS;
  return rectsOverlap(a, b);
}

const describe = (k) => `${k.tag || "shape"} at (${f2(k.x)}, ${f2(k.z)})`;

/* the place whose zone contains the point and whose zone centre is nearest */
function resolve(x, z) {
  let here = null, best = Infinity;
  for (const key of L.ORDER) {
    const zone = L.ZONES[key];
    if (!L.inRect(zone, x, z)) continue;
    const d = Math.hypot(x - zone.x, z - zone.z);
    if (d < best) { best = d; here = key; }
  }
  return here;
}

/* ------------------------------------------------------------------- checks */

/* the workbench contract */
const bz = L.ZONES.bench, bs = L.SPAWNS.bench;
check(["x", "z", "hw", "hd", "c", "s"].every((k) => Math.abs(bz[k] - BENCH_ZONE[k]) < EPS),
  `bench zone ${JSON.stringify(bz)} differs from the contract ${JSON.stringify(BENCH_ZONE)}`);
check(Math.abs(bs.x - APPROACH.x) < EPS && Math.abs(bs.z - APPROACH.z) < EPS && Math.abs(bs.heading - APPROACH.heading) < EPS,
  `bench spawn ${JSON.stringify(bs)} differs from bench.approach ${JSON.stringify(APPROACH)}`);

/* every door */
const rows = [];
for (const key of L.ORDER) {
  const zone = L.ZONES[key], spawn = L.SPAWNS[key];
  check(zone && spawn, `${key}: missing zone or spawn`);
  if (!zone || !spawn) continue;
  check(L.inRect(zone, spawn.x, spawn.z), `${key}: spawn (${f2(spawn.x)}, ${f2(spawn.z)}) is outside its own zone`);
  for (const k of BLOCKING) {
    check(L.gap(k, spawn.x, spawn.z) >= R - EPS, `${key}: spawn (${f2(spawn.x)}, ${f2(spawn.z)}) is within ${R} m of ${describe(k)}`);
  }
  const edge = Math.hypot(spawn.x, spawn.z);
  check(edge <= L.ISLAND.walk - R, `${key}: spawn is ${f2(edge)} m from the centre, past the walkable edge ${L.ISLAND.walk - R}`);
  check(L.heightAt(spawn.x, spawn.z) === 0, `${key}: spawn stands on a raised floor (${L.heightAt(spawn.x, spawn.z)} m)`);
  const owner = resolve(spawn.x, spawn.z);
  check(owner === key, `${key}: spawn resolves to ${owner}`);
  const inside = L.ORDER.filter((k) => L.inRect(L.ZONES[k], spawn.x, spawn.z));
  rows.push(`  ${key.padEnd(9)} spawn (${f2(spawn.x).padStart(6)}, ${f2(spawn.z).padStart(6)})  heading ${f2(spawn.heading)}  in zones: ${inside.join(", ")}`);
}

/* overlapping zones are allowed between buildings, never with the workbench */
const overlapsSeen = [];
for (let i = 0; i < L.ORDER.length; i++) {
  for (let j = i + 1; j < L.ORDER.length; j++) {
    const a = L.ORDER[i], b = L.ORDER[j];
    if (!rectsOverlap(L.ZONES[a], L.ZONES[b])) continue;
    overlapsSeen.push(`${a}/${b}`);
    check(a !== "bench" && b !== "bench", `the workbench zone overlaps the ${a === "bench" ? b : a} zone`);
  }
}

/* the start */
const S = L.START;
check(resolve(S.x, S.z) === null, `start (${S.x}, ${S.z}) is inside the ${resolve(S.x, S.z)} zone`);
for (const k of BLOCKING) check(L.gap(k, S.x, S.z) >= R - EPS, `start is within ${R} m of ${describe(k)}`);
check(Math.hypot(S.x, S.z) <= L.ISLAND.walk - R, "start is past the walkable edge");

/* nothing the campus places overlaps the desk, tower or chair, or stands in the bench zone */
for (const k of [...L.COLLIDERS, ...L.PLATFORMS]) {
  for (const part of BENCH_PARTS) check(!overlaps(k, part), `${describe(k)} overlaps the ${part.tag}`);
}
for (const k of L.COLLIDERS) check(!overlaps(k, BENCH_ZONE), `${describe(k)} stands inside the workbench zone`);
check(L.heightAt(DESK.x, DESK.z) === 0 && L.heightAt(CHAIR.x, CHAIR.z) === 0, "a raised floor runs under the workbench");

/* planters and lamps off the walkways */
const onWalkway = (x, z) => L.BUSES.some((b) => b.slice(1).some((q, i) => L.segmentDistance(x, z, b[i], q) < L.WALKWAY_CLEAR));
for (const [x, z] of L.PLANTERS) check(!onWalkway(x, z), `planter at (${x}, ${z}) is on a walkway`);
for (const [x, z] of L.LAMPS) check(!onWalkway(x, z), `lamp at (${f2(x)}, ${f2(z)}) is on a walkway`);

/* each landmark faces the plaza: its +z points at the centre */
for (const [key, b] of Object.entries(L.LANDMARKS)) {
  const toCentre = [-b.x, -b.z], len = Math.hypot(...toCentre);
  const facing = (Math.sin(b.ry) * toCentre[0] + Math.cos(b.ry) * toCentre[1]) / len;
  check(facing > 0.7, `${key} faces away from the plaza (cos ${f2(facing)})`);
}

/* ------------------------------------------------------------------ report */

console.log("doors:");
console.log(rows.join("\n"));
console.log(`start (${S.x}, ${S.z}) heading ${f2(S.heading)}`);
console.log(`overlapping zones: ${overlapsSeen.length ? overlapsSeen.join(", ") : "none"}`);
console.log(`colliders ${L.COLLIDERS.length} (+${BENCH_PARTS.length} workbench footprints), platforms ${L.PLATFORMS.length}`);
if (failures.length) {
  console.log(`\nFAIL: ${failures.length} of ${passed + failures.length} checks`);
  failures.forEach((m) => console.log("  - " + m));
  process.exit(1);
}
console.log(`\nPASS: ${passed} checks`);
