# Workbench

This document describes the workbench at the centre of the campus: the desk, chair, tower
and monitors, the parametric desktop arm, its inverse kinematics and pick-and-place
sequence, pointer handling under the scaled root, the two desk monitors, lighting at desk
scale, the complete public API of `createBench` and the `armctl` console. Read it before
changing `js/bench.js`, the desk part of `js/world.js`, or the workbench entries in
`js/layout.js`. Walking, sitting and the camera are covered in
[World and controls](world-and-controls.md) and [Character](character.md). The rest of the
campus is in [Campus](campus.md). The rules for the whole project are in the
[Handbook](HANDBOOK.md).

All facts here were checked against `js/bench.js`, `js/world.js`, `js/layout.js`,
`js/island.js`, `js/stations.js`, `js/player.js`, `js/realism.js`, `index.html`,
`tools/checks/zones.mjs` and `tools/character/rig.py` on 15 September 2026 (version 8
working tree). Where default numbers are quoted, they were computed from the formulas in
`js/bench.js` at the default link lengths.

## Contents

1. [Files and responsibilities](#1-files-and-responsibilities)
2. [Units and the scaled root](#2-units-and-the-scaled-root)
3. [Desk layout](#3-desk-layout)
4. [Colliders and the layout contract](#4-colliders-and-the-layout-contract)
5. [The parametric arm](#5-the-parametric-arm)
6. [Inverse kinematics](#6-inverse-kinematics)
7. [Pick and place](#7-pick-and-place)
8. [Pointer input](#8-pointer-input)
9. [Monitors, readout and tuning panel](#9-monitors-readout-and-tuning-panel)
10. [Lights and shadows at desk scale](#10-lights-and-shadows-at-desk-scale)
11. [Public API](#11-public-api)
12. [armctl command reference](#12-armctl-command-reference)
13. [Procedures](#13-procedures)
14. [Known limitations](#14-known-limitations)

## 1. Files and responsibilities

| File | What it does for the workbench |
| --- | --- |
| `js/bench.js` | Builds everything on and around the desk, owns the arm parameters, IK, the pick-and-place state machine, pointer maths, both monitor textures and the `armctl` interpreter. It has no render loop of its own. |
| `js/world.js` | Calls `createBench`, forwards pointer events in normalised device coordinates (NDC), turns desk taps into orders (`aimTap`), connects the HUD console (`bindConsole`), connects the tuning panel (`bindRig`), switches the sun's shadow span when seated (`syncSeat`, `shadowSpan`) and calls `bench.update` every frame (`frame`). |
| `js/layout.js` | `BENCH`: the workbench zone, door (spawn), click box and camera focus. It does not place any desk part. |
| `js/island.js` | Imports `roundedBox` from `bench.js`. Builds the invisible click box round desk and chair from `BENCH.hit` and the `bench` place entry. |
| `js/stations.js` | Imports `roundedBox` and `hub` from `bench.js`. It calls `roundedBox` for several station parts; the import is its only reference to `hub`. A change to either signature breaks this module. |
| `js/player.js` | `sit(seatSpot, approachSpot, { instant })` and `point(target)`, fed with `bench.seat`, `bench.approach` and `placeAt` targets. |
| `tools/checks/zones.mjs` | A plain Node check that repeats the workbench footprints and door by hand and asserts the campus keeps clear of them. |
| `index.html` | The readout elements (`#j1`–`#j4`, `#claw`, `#hgt`, `#mode`) and the tuning panel `#rig`. |

## 2. Units and the scaled root

The world is in metres. Everything in `bench.js` hangs from one group, `root`:

- `root.name` is `"workbench"`.
- `root.position` is `(0, GROUND + 0.75, 0)`, with `GROUND = -1.4`. The origin is the centre
  of the arm's base on the desk top, above ground point (0, 0), 0.75 m above `GROUND`
  (world y = -0.65).
- `root.scale` is `ROOT_SCALE = 0.1`. One bench-local unit is 10 cm.
- `root` has no rotation, so local axes are parallel to world axes: x to the seated
  operator's right, z toward the operator, y up. The desk top is local y = 0 and the floor
  is `FLOOR = -7.5`.

The canonical `GROUND` is `export const GROUND = -1.4` in `js/layout.js`, a module with no
imports; `js/island.js` re-exports it as `GROUND = L.GROUND`. `bench.js` keeps a hand copy,
`const GROUND = -1.4`, which must match it. The comment above that copy says importing from
`island.js` would be circular (`island.js` imports `roundedBox` from `bench.js`); that
applies to `island.js` only, since `layout.js` imports nothing. `tools/checks/zones.mjs`
does not compare the two values, so a change to `GROUND` in `layout.js` must be copied to
`bench.js` by hand.

Conversions:

| From | To | Rule |
| --- | --- | --- |
| Bench-local (x, y, z) | World metres | `(0, -0.65, 0) + 0.1 × (x, y, z)` |
| Bench-local (x, z) | Ground (x, z) | multiply by 0.1 |
| Bench-local y | Height above `GROUND` | `0.75 + 0.1 × y` metres |
| Bench-local length | Centimetres | multiply by 10 (`cm(u)` in `bench.js` formats with one decimal) |
| World offset from `root.position` | Centimetres | multiply by 100 (`cm(metres)` in `world.js`) |

Everything inside (arm maths, the block, the pedestal, the readouts, `armctl`) works in
local units. Values that cross the border are pointer rays, the claw pad's position,
`block()`, `aimFromNdc`, `placeAt`, `colliders`, `seat`, `approach` and `keyboard`. They
cross it in three ways:

- **Points** go through `toWorld(v)` and `toLocal(v)`; both refresh the root's world
  matrix first. `keyboard`, `colliders`, `block()`, `aimFromNdc`, `placeAt` and the claw
  pad use them.
- **The pointer ray** does not: `castFrom` inverts `root.matrixWorld` itself and transforms
  the ray with that inverse (see [section 8.1](#81-world-rays-and-local-planes)).
- **`seat` and `approach`** are the local constants multiplied by `ROOT_SCALE`, with no
  matrix. They are correct only because `root.position` x and z are 0. Moving the root off
  the ground origin in x or z needs these two members in the `createBench` return changed
  as well, together with the door and zone copies in
  [section 4](#4-colliders-and-the-layout-contract).

## 3. Desk layout

The layout constants sit at the top of `bench.js`. World coordinates are ground (x, z) in
metres; heights are above `GROUND`.

| Part | Constant or builder | Local (x, z) | World (x, z) m | Size and height |
| --- | --- | --- | --- | --- |
| Arm base | local origin, `buildArm` | (0, 0) | (0, 0) | base plate 5.6 cm radius at the foot, 1.1 cm high, on the desk top (0.75 m) |
| Desk top | `DESK = { x: -2.5, z: 0, w: 14, d: 7, t: 0.3 }`, `buildDeskFrame` | (-2.5, 0) | (-0.25, 0) | 1.40 × 0.70 m, 3 cm thick, top at 0.75 m; steel frame and legs, cable grommet at local (-0.9, -2.8) |
| Chair | `SEAT = { x: -4.5, z: 6.5, top: -2.9 }`, `buildChair` | (-4.5, 6.5) | (-0.45, 0.65) | seat top 46 cm above the floor, cushion 48 × 46 cm, five-star base, no armrests, back on the +z side |
| Approach spot | `APPROACH_Z = 13.5` | (-4.5, 13.5) | (-0.45, 1.35) | where the walker stands before sitting, heading π |
| Keyboard | `KEYBOARD = { x: -4.5, y: 0, z: 1.9 }`, `buildKeyboard` | (-4.5, 1.9) | (-0.45, 0.19) | 42 × 13.5 cm, 120 instanced keys |
| Left monitor | `MONITORS[0] = { x: -7.1, z: -2.6 }`, `buildMonitors` | (-7.1, -2.6) | (-0.71, -0.26) | turned 0.278 rad toward `EYE`; screen 38 × 21.4 cm, centre 32.5 cm above the desk, tipped back 0.08 rad; project photo slideshow |
| Right monitor | `MONITORS[1] = { x: -3.0, z: -2.6 }` | (-3.0, -2.6) | (-0.30, -0.26) | turned -0.163 rad toward `EYE`; same size; `armctl` terminal |
| Tower | `TOWER = { x: -11, z: -1, scale: 2.5 }`, `buildTower` | (-11, -1) | (-1.10, -0.10) | on the floor; built 1.7 × 1.85 × 0.82 local and scaled 2.5 (about 43 cm long, 46 cm tall, 20 cm wide); front panel faces +z, side window faces the desk (+x) |
| Pedestal | `HOME`, `buildPedestal`, `placePedestal` | (-0.890, 1.269) at default links | (-0.089, 0.127) | column 4.4 cm (`PED_TOP = 0.44`), top radius 2.6 cm (`PED_R = 0.26`); moves when the links change |
| Block | `block`, `buildPayload` | starts at (1.62, -0.35) | (0.162, -0.035) | 2.4 cm cube (`BLOCK = 0.24`), resting centre 1.2 cm above the desk (`HALF = 0.12`) |
| Mouse pad and mouse | `buildDesk` | pad (-1.35, 2.65), mouse (-1.5, 2.7) | (-0.135, 0.265) | pad 20 × 17 cm |
| Mug | `buildDesk` | (3.3, -2.3) | (0.33, -0.23) | 9.5 cm tall |
| Board | `buildDesk` | (3.0, 1.8), turned -0.5 rad | (0.30, 0.18) | 6.2 × 4.2 cm |

`EYE` is the seat position; both monitor rigs turn with
`rotation.y = atan2(EYE.x - m.x, EYE.z - m.z)`. Cables run as tubes from the grommet and
from each monitor, along the floor, to the back of the tower.

The chair, the tower and both monitor rigs are pushed onto `blockers`, the list that stops
a desk tap from passing through (see [section 8](#8-pointer-input)).

The lit surfaces are `MeshStandardMaterial` with high roughness (0.7 to 1), with two
exceptions: the tower's side window glass (`buildTower`: roughness 0.35, opacity 0.45) and
the board's header pins (`buildDesk`: roughness 0.6, metalness 0.4). The desk top uses
`pbr("wood_table_worn", …)` from `js/realism.js` with roughness 1. The monitor screens, the
LEDs and the amber marks (`MAT.glow`, `reachRing`, `pedestalRing`, the ring `handle`) are
unlit `MeshBasicMaterial`. The workbench must stay matte (rule 5 in `AGENTS.md`).

## 4. Colliders and the layout contract

`makeColliders()` returns the walker's ground footprints in metres as rectangles
`{ x, z, hw, hd, c, s }` (half width, half depth, cosine and sine of the turn; both are
unrotated). The chair is left out so the operator can reach it.

| Footprint | x, z (m) | hw × hd (m) |
| --- | --- | --- |
| Desk | (-0.25, 0) | 0.70 × 0.35 |
| Tower | (-1.10, -0.10) | 0.1025 × 0.2125 |

`world.js` passes `island.colliders.concat(bench.colliders)` to `createPlayer`.

The workbench's position is repeated by hand in three places. `tools/checks/zones.mjs` does
not import `bench.js`; it keeps its own copy.

| Item | `js/bench.js` | `js/layout.js` `BENCH` | `tools/checks/zones.mjs` |
| --- | --- | --- | --- |
| Door | `approach` (-0.45, 1.35, π) | `spawn` (-0.45, 1.35, π) | `APPROACH`, asserted equal to `L.SPAWNS.bench` |
| Zone | none | `zone` centre (-0.35, 0.75), hw 1.25, hd 1.2 | `BENCH_ZONE`, asserted equal to `L.ZONES.bench` |
| Desk footprint | collider above | none | `DESK` rect (-0.25, 0), 1.4 × 0.7 m |
| Tower footprint | collider above | none | `TOWER` rect (-1.1, -0.1), 0.25 × 0.5 m (slightly larger than the collider) |
| Chair | not a collider | none | `CHAIR` rect (-0.45, 0.65), 0.6 × 0.6 m |
| Click box and camera | none | `hit` (-0.375, 0.3), 1.8 × 1.35 × 1.4 m; `focus` (-0.25, 0.95 m up, 0); `dist` 2.4; `lift` 0.9; `dir` [0.55, 0, 1] | none |

To move any of these, follow [Changing the desk layout](#132-changing-the-desk-layout).

## 5. The parametric arm

### 5.1 Parameters

The arm is four numbers in `dims`, in local units, bounded by the exported `LIMITS`.
`NAMES` gives the words used in messages.

| Key | `NAMES` | Default (local) | Default (cm) | `LIMITS` (cm) |
| --- | --- | --- | --- | --- |
| `base` | base height | 0.66 | 6.6 | 4.5 to 10.0 |
| `l1` | upper arm | 1.12 | 11.2 | 7.0 to 13.5 |
| `l2` | forearm | 0.95 | 9.5 | 6.0 to 11.5 |
| `claw` | claw | 0.34 | 3.4 | 2.6 to 4.4 |

`DEFAULTS` is a copy of the starting `dims`.

### 5.2 derive()

`derive()` runs at module load and after every change. It sets:

| Name | Formula | Default |
| --- | --- | --- |
| `SHOULDER_Y` | `dims.base` | 0.66 (6.6 cm) |
| `L1`, `L2`, `CLAW_LEN` | `dims.l1`, `dims.l2`, `dims.claw` | 1.12, 0.95, 0.34 |
| `D_MAX` | `L1 + L2 - 0.02` (longest shoulder-to-wrist distance) | 2.05 (20.5 cm) |
| `D_MIN` | `abs(L1 - L2) + 0.06` (shortest) | 0.23 (2.3 cm) |
| `REACH_MAX` | `floorSpan(HALF).outer` | 2.318 (23.2 cm) |
| `HOME` | on `HOME_DIR = normalise(-0.89, 1.27)` in (x, z), at height `PED_TOP + HALF`, radius `clamp(1.55, inner + 0.3, outer - 0.22)` of `floorSpan` at that height | (-0.890, 0.56, 1.269), radius 15.5 cm |

`floorSpan(y)` gives the inner and outer radius the claw can touch at height `y` with the
claw held level. The wrist stays `CLAW_LEN` short of the target:

```
dy    = y - SHOULDER_Y
outer = sqrt(max(D_MAX² - dy², 0)) + CLAW_LEN
inner = max(RP_MIN, sqrt(max(D_MIN² - dy², 0))) + CLAW_LEN      RP_MIN = 0.06
```

At block height (`HALF`) and default links: inner 0.40 (4.0 cm), outer 2.318 (23.2 cm).

Other fixed constants: `GAP_OPEN = 0.46` and `GAP_SHUT = BLOCK - 0.014 = 0.226` (finger
gap); `HOVER = 0.4` (4 cm); `PLATE_TOP = 0.11`; `BASE_CLEAR = 0.74` and
`COLUMN_CLEAR = 0.46` (the closest a block may be set down beside the base plate and the
column).

### 5.3 Geometry and rebuild

`buildArm()` puts everything that depends on the four numbers in one group, `armRig`. A
change removes the group, disposes its geometry (and materials marked
`userData.ownMaterial`, plus the volume's two materials) and builds it again. The hierarchy:

```
armRig
 ├─ base plate, six bolts
 ├─ turret              rotation.y = yaw
 │   ├─ collar, column (height SHOULDER_Y - 0.2), amber stripe
 │   ├─ envelope        dashed outer reach arc in the arm's plane
 │   └─ shoulder        y = SHOULDER_Y, rotation.z = a1
 │       ├─ upper link (L1), rib
 │       └─ elbow       x = L1, rotation.z = a2
 │           ├─ forearm (L2)
 │           └─ wrist   x = L2, rotation.z = a3
 │               ├─ palm
 │               ├─ claw group, scale.x = CLAW_LEN / 0.34, fingers at z = ±gap/2
 │               └─ padAnchor   x = CLAW_LEN (the point that carries the block)
 └─ volume              working-volume dome
```

`reachRing` (a flat ring on the desk from `inner` to `outer` at block height) lives on
`root` and gets new geometry on each rebuild. `applyPose()` carries the joint angles
across the rebuild.

### 5.4 Working envelope and statistics

`envelopeProfile()` returns the boundary of the reachable set in the arm's own
(radius, height) plane:

1. 41 points on the outer arc, radius `D_MAX` about the shoulder, from angle
   `asin((HALF - SHOULDER_Y) / D_MAX)` to `acos(RP_MIN / D_MAX)`, each shifted out by
   `CLAW_LEN`.
2. If `D_MIN > RP_MIN`, 21 points back along the inner arc of radius `D_MIN`.
3. A closing point `(CLAW_LEN + RP_MIN, HALF)` where the inner arc does not reach the desk.

`buildVolume()` turns the closed profile into a `LatheGeometry` with 96 segments, plus 16
meridians and 4 parallels on the outer arc.

`stats()` returns:

| Field | Formula | Default |
| --- | --- | --- |
| `reachCm` | `floorSpan(HALF).outer × 10` | 23.2 |
| `heightCm` | `(SHOULDER_Y + D_MAX) × 10` | 27.1 |
| `areaCm2` | `π (outer² - inner²) × 100` at `HALF` | 1637 |
| `litres` | Pappus: `abs(2π × Σ(xa + xb)(xa·yb - xb·ya) / 6)` over the profile, in local units³ (one 10 cm cube is 1 L) | 33.9 |
| `dims` | `getDims()` | defaults |

### 5.5 setDims(next)

1. Each key present in `next` (not `undefined`) is converted with unary plus and clamped to
   `LIMITS`. A value that converts to `NaN` is ignored, while `Infinity` and `-Infinity` are
   clamped to the nearest limit and applied, and `null` converts to 0 and is clamped to
   the lower limit.
2. If nothing changed, it returns `stats()` without rebuilding.
3. Otherwise it records whether the block rests on the pedestal, runs `derive()`,
   `buildArm()` and `placePedestal()`, moves a resting block with the pedestal, clamps the
   block to the new envelope, and refits a running job's destination (`HOME` for a home
   job, `planTarget` otherwise).
4. It sets `tunedAt`, which brightens the volume for 2.6 s, clears the cached terminal
   statistics and returns `stats()`.

`setDims` does not call `onStats`; the `set` and `reset` commands do.

## 6. Inverse kinematics

`solveTo(p)` takes a local point and returns `{ yaw, a1, a2, a3 }`. It solves two links with
the claw held level:

```
r   = hypot(p.x, p.z)
yaw = atan2(-p.z, p.x)                     turret about y; the arm points along its local +x
dx  = max(r - CLAW_LEN, 0.1)               the wrist stops one claw length short
dy  = p.y - SHOULDER_Y
d   = clamp(hypot(dx, dy), D_MIN, D_MAX)
c2  = (d² - L1² - L2²) / (2 L1 L2)
a2  = -acos(clamp(c2, -1, 1))              elbow
a1  = atan2(dy, dx) - atan2(L2 sin a2, L1 + L2 cos a2)
a3  = -(a1 + a2)                           keeps the claw level
```

Each frame `update` clamps `goal` to the envelope, solves, and eases the joints with
`damp(cur, to, k, dt) = cur + (to - cur)(1 - e^(-k·dt))`:

| Joint | Rate k (1/s) | Note |
| --- | --- | --- |
| yaw | 8.5 | eased along the wrapped difference, so it takes the short way round |
| a1, a2, a3 | 8.5 | |
| finger gap | 12 | toward `GAP_SHUT` when `wantShut`, else `GAP_OPEN` |

The readouts show J1 = `wrap(yaw)`, J2 = `a1`, J3 = `a2`, J4 = `a3` in degrees, formatted
by `degText` as a sign and five characters, e.g. `+012.3`.

## 7. Pick and place

### 7.1 Fitting targets

`clampToEnvelope(v)` pushes a local point onto the working envelope: it takes `CLAW_LEN`
off the radius, scales the (radius, height) offset from the shoulder into
`[D_MIN, D_MAX]`, never lets the height fall below `HALF` (sliding along the desk ring
instead) and returns `true` when it had to scale. It is applied to the block every frame
(`clampBlock`, which sets `atLimit`) and to every goal.

`planTarget(v)` fits a requested set-down point. It keeps the requested height where it
can and returns `{ far, near, high, pedestal, raised }`:

1. Within `PED_R + 1.42 × HALF` (4.3 cm) of `HOME` in plan and below `HOME.y + 0.01`: snap
   to `HOME`, set `pedestal`, stop.
2. Below `HALF`: raise to `HALF` (`raised` when the request was below -0.01).
3. Clamp the radius to `[lo, hi]`, where `hi = outer - 0.01` and
   `lo = max(inner, BASE_CLEAR)` below a height of `PLATE_TOP + HALF + 0.02` (2.5 cm), or
   `max(inner, COLUMN_CLEAR)` above it. Set `far` or `near` when it moved. At default links
   on the desk this band is 7.4 to 23.1 cm.
4. If that band is narrower than 0.02 (the height is out of the arm's reach), fall back to
   `clampToEnvelope`; set `high` when the height came down, otherwise `far`.
5. Apply `clampToEnvelope` once more.

### 7.2 Jobs

A job is one pick-and-place. `job` is `null`, `"user"` (a tap or a command) or `"demo"`
(the arm keeping itself busy). `dest` is the destination and `destHome` marks a home job.

`startJob(point, kind, home)`:

1. For a user job, sets `lastTouch` and `quietUntil = now + 45000` ms (no demo for 45 s).
2. If a job is running, the state is not `REST` and `point` is within 0.03 (3 mm) of
   `dest`, it changes nothing (a demo job becomes a user job). This keeps a tap that reaches
   both `pointerUp` and `placeAt` from restarting the arm.
3. Otherwise sets `dest`, `destHome` and `job`, then goes to `CARRY` if the block is held,
   stays put in `DESCEND` or `GRIP`, or goes to `APPROACH`.

`busy()` is `job === "user"`. `world.js` uses it (`typingNow`) to keep the hacker's hands on
the keyboard while an order runs.

### 7.3 State machine

`sequence(now)` runs once per frame. `t` is milliseconds since the state was entered.
`reached(tol)` compares the claw pad (`padLocal`) with the clamped goal in local units
(0.06 is 6 mm). A state also leaves when `t` passes its timeout.

| State (`STATE` key) | Label in MODE and on the terminal | Goal | Claw | Leaves when | Next |
| --- | --- | --- | --- | --- | --- |
| `REST` | AT REST | `restPoint`: (0.45 `REACH_MAX`, `SHOULDER_Y` + 0.55 `D_MAX`, -0.2 `REACH_MAX`) | open | `startJob` | `APPROACH` or `CARRY` |
| `WATCH` | TRACKING | 5 cm above the block (`HOVER + 0.1`) | open | no grab and `t` > 450 | `APPROACH` |
| `APPROACH` | APPROACH | 4 cm above the block | open | within 0.06, or 3200 ms | `DESCEND` |
| `DESCEND` | DESCEND | block centre | open | within 0.035, or 2200 ms | `GRIP` |
| `GRIP` | CLOSING | block centre | shut | `t` > 420, then `held = true` | `LIFT` |
| `LIFT` | LIFTING | above the block at `max(block.y, carryY())` | shut | within 0.07, or 2200 ms | `CARRY` |
| `CARRY` | CARRYING | above `dest` at `max(dest.y, carryY())` | shut | within 0.07, or 3600 ms | `PLACE` |
| `PLACE` | PLACING | `dest` | shut | within 0.03, or 2200 ms | `RELEASE` |
| `RELEASE` | RELEASING | `dest` | open | `t` > 340, then `held = false`, block set to `dest` | `RETRACT` |
| `RETRACT` | CLEARING | 0.1 above `max(dest.y, carryY())` | open | within 0.09, or 2000 ms | `REST` |

`carryY()` is `min(HOME.y + 0.6, SHOULDER_Y + 0.45 × D_MAX)`, 11.6 cm at default links.

On leaving `RETRACT` after a user job, the arm writes
`done: block at x <x> z <z> h <h> cm` (plus `, on the pedestal` when it is there) to the
terminal and calls `onLine` with the same text. `world.js` prints it in the HUD console.

Two rules apply after every step:

- **Operator override.** While a grab is active (`mode !== "none"`), `held` and `job` are
  cleared and the state is forced to `WATCH`.
- **No gravity.** The block follows `padLocal` while held; otherwise it stays exactly where
  it was last put, clamped to the envelope.

**Demo.** In `REST`, when motion is not reduced, there is no job and no grab,
`now - lastTouch > 4200` ms, `now > autoAt` and `now > quietUntil`, the arm starts a demo
job and sets `autoAt = now + 9000`. If the block is on the pedestal it picks a random desk
spot between `max(inner, BASE_CLEAR) + 0.1` and `outer - 0.2`, retrying up to six times to
avoid the pedestal; otherwise it takes the block home.

### 7.4 update(now, dt)

Called by `world.js` `frame` after the camera moves, with the frame timestamp in
milliseconds and `dt` in seconds (capped at 0.05 s). In order it:

1. Reads the pad's world position and converts it to local (`padLocal`).
2. Runs `sequence(now)`, then moves the held block to the pad and clamps the block.
3. Places the block, eases its yaw toward `atan2(-z, x)` (rate 6), and places its blob
   shadow on the pedestal top or the desk, larger and fainter with height.
4. Places the amber ring 2.8 cm above the block (hidden while held, spinning 0.9 rad/s) and
   fades in the dashed drop line when the block is in the air off the pedestal.
5. Solves and eases the joints (section 6). Spins the tower fans unless motion is reduced.
6. Brightens the volume, reach ring and envelope arc while "loud": a grab is active, the
   links changed in the last 2.6 s, or the block is at its reach limit.
7. Updates the DOM readout, the slideshow and the terminal.

### 7.5 placeAt(p) and place(local, options)

`placeAt(p)` takes a world point:

1. Returns `{ accepted: false, target: null, reason: "no target" }` if `p` is missing or
   not finite.
2. Converts to local and calls `place(local, { home: false })`.
3. Echoes `armctl> <line>` and the answer lines to the terminal, unless the same line was
   echoed in the last 300 ms.
4. Returns `{ accepted, target, reason, line }`, with `target` converted back to world.

`place(local, { home, asked })`, shared with the `place` command:

1. Builds `line`: `asked` if given, else `place <x> <z>` in cm, with the height appended when
   it is at least `HALF + 0.001` (a tap on the pedestal top, for example, gives a height of
   4.7).
2. While a grab is active, refuses: `accepted: false`, `reason: "the block is being dragged"`,
   line `<line>: the block is being dragged, let go first`.
3. Otherwise runs `planTarget`, chooses a reason, starts a user job (a home job if `home`
   or the target snapped to the pedestal) and returns `accepted: true` with the lines
   `<line>: ok` or `<line>: <reason>`, then `moving block to x <x> z <z> h <h> cm`.

| Note from `planTarget` | Reason text |
| --- | --- |
| `pedestal` | `on the pedestal` |
| `far` | `out of reach, clamped to <r> cm` |
| `near` | `too close to the base, pushed out to <r> cm` |
| `high` | `above the arm's reach, clamped to <h> cm up` |

## 8. Pointer input

### 8.1 World rays and local planes

`world.js` passes pointer positions in NDC. `castFrom(x, y)` builds two rays:

- `ray`, a `THREE.Raycaster` set from the camera in world space. Object raycasts use it
  (the pick stand-ins and `blockers`), and their hit distances are world metres.
- `lray`, a copy of `ray.ray` transformed by the inverse of `root.matrixWorld`. Plane maths
  uses it (drag planes and the desk and pedestal planes), so plane hits are already in the
  block's local units.

When a plane hit has to be compared with an object hit (`aimFromNdc`), the plane hit is
converted back to world and measured from `ray.ray.origin`.

`castFrom` also calls `sizePicks()` before every cast.

### 8.2 Pick stand-ins

At real size the block is 2.4 cm and the ring's tube is under 3 mm. Invisible meshes
(`MeshBasicMaterial({ visible: false })`) take the rays instead; the visible block and ring
keep their true size.

| Stand-in | Parent | Geometry (local) | At scale 1 |
| --- | --- | --- | --- |
| `blockPick` | `payload` | box, edge `PICK_BLOCK = 0.34` | 3.4 cm cube |
| `handlePick` | `handle` | solid disc, diameter `PICK_RING = 2 × (0.115 + 0.032) = 0.294`, 0.064 thick, turned axis up | 2.94 cm across |

`sizePicks()` scales each stand-in to
`clamp(PICK_PX × metresPerPixel(position) / (size × rootScale), 1, PICK_MAX_SCALE)`:

- `PICK_PX` is 44 CSS px when `matchMedia("(pointer: coarse)")` matches, otherwise 30.
- `PICK_MAX_SCALE` is 10.
- `metresPerPixel(p)` is `2 d tan(fov / 2) / (zoom × innerHeight)` for a perspective camera
  at distance `d`, or `(top - bottom) / zoom / innerHeight` for an orthographic one.

`grabbable()` returns `"free"` for the block, `"depth"` for the ring (only while the ring
is visible) or `"none"`. Where both stand-ins are hit, the one whose centre is nearer the
pointer on screen wins (`screenGap`), so the upper part of the shared zone takes the ring.

### 8.3 Grabs and taps

| Call | Behaviour |
| --- | --- |
| `pointerDown(x, y)` | Resets the travel count. On a grab, drops a held block and cancels the job. A `"free"` grab drags in the plane through the block facing the camera (normal = minus the camera direction, turned into local space); a `"depth"` grab drags in the horizontal plane through the block. The grab offset is kept so the block does not jump. Returns the grab mode. |
| `pointerMove(x, y, travel)` | Adds `travel` (CSS px) to the count. With a grab, moves the block to the plane hit plus offset, clamps it, and returns `true`; without one returns `false`. |
| `pointerUp(x, y, { cancel })` | Without a grab: a tap (count below 9, not cancelled) calls `aimFromNdc` and `placeAt`. After a `"depth"` grab that was a tap, toggles the block between resting height (`HALF`) and `SHOULDER_Y + 0.5 × D_MAX` (about 16.9 cm at default links). After any grab, starts a demo job to take the block back to `HOME` and enters `WATCH`. |
| `hoverAt(x, y)` | `true` when the pointer is over either stand-in. |

`world.js` (`bindPointer`) calls `pointerDown` only while the player is seated and no
hardware close-up is open. It uses its own tap threshold (travel below 8 CSS px). A desk
tap without a grab goes through `aimTap`, which calls `aimFromNdc` and `placeAt` directly,
so `pointerUp`'s own tap branch is not used by `world.js`. A second finger or a
`pointercancel` ends a grab through `letGo`, which sends `pointerMove(…, 9)` and then
`pointerUp(…, { cancel: true })`, so the release is never read as a tap. On a fine pointer
the canvas cursor is `grab` over the block or ring and `crosshair` over a valid desk target,
checked at most every 90 ms.

### 8.4 aimFromNdc(x, y)

Returns the world point a tap would send the block to, or `null`:

1. Cast both rays.
2. Intersect the pedestal top plane at local y = `PED_TOP + 0.03` (4.7 cm). A hit within
   `PED_R` of `HOME` in plan is the candidate.
3. Otherwise intersect the desk plane y = 0. A hit inside the desk rectangle shrunk by
   `HALF` on every side (`|x - DESK.x| < 6.88`, `|z - DESK.z| < 3.38`) is the candidate.
4. If there is no candidate, return `null`.
5. Raycast `blockers` (chair, tower, both monitor rigs, recursively). If one is nearer
   than the candidate, return `null`, so a tap on a screen never moves the block.
6. Return the candidate in world coordinates.

The arm, the block, the keyboard, the mouse, the mug and the board do not stop the ray.

After `placeAt`, `aimTap` in `world.js` calls `player.point` with the fitted target (or the
tapped spot when refused), and prints in the HUD console `armctl> <line>` followed by
`ok, block to x <x> z <z> cm` and the reason, or `refused: <reason>`. Its coordinates are
centimetres from `bench.root.position`.

## 9. Monitors, readout and tuning panel

### 9.1 Slideshow (left monitor)

`makeSlideshow(slides)` draws to a 1024 × 576 canvas used as an sRGB `CanvasTexture` on a
`MeshBasicMaterial` with `toneMapped: false`.

- `world.js` `projectSlides()` supplies `{ src, alt }` for every image link in
  `#work .evidence` and `#research .evidence`, leaving out links marked `data-video`.
- Each picture holds for 5000 ms (`HOLD`), then the next slides in from the right over
  800 ms (`SLIDE`) with quadratic in-out easing. With reduced motion the change is instant.
  Redraws during a slide are at most every 33 ms.
- An image starts loading when it becomes the current or the next picture. A failed image
  is skipped.
- The photo is fitted whole over a dimmed cover crop of itself. A 66 px caption strip shows
  the alt text (truncated by `fitText`) and a counter such as `01 / 12`.
- Placeholder texts: `loading`, `image unavailable`, `no project photos`.

### 9.2 Terminal (right monitor)

`makeTerminal()` draws to a 1024 × 576 canvas, at most every 140 ms (`touch()` forces the
next draw).

- Header: `[shivender@archbox ~]$ ./armctl --live`, with an outlined arch mark at the top
  right.
- Left column: `links` (`<l1> + <l2> + <claw> cm`), `reach` (`<reach> cm   floor <area> cm2`),
  `volume` (`<litres> L swept`), `block` (`x … z … h … cm`), `claw` (OPEN, CLOSING or
  HOLDING), `state` (the state label, or `AT REACH LIMIT` while dragging at the limit).
- Right column: J1 to J4 in amber.
- Below a divider, the last 8 entries of `termLog` (which keeps 40), coloured by kind:
  `in` cyan, `out` light grey, `err` amber.
- A prompt `armctl> ` with an amber cursor blinking every 520 ms.

The statistics are cached and recomputed only while the links are being tuned. Entries
reach `termLog` from `command`, from `placeAt` echoes, and from the done message.

### 9.3 DOM readout

`readout()` runs at most every 100 ms and writes to the elements in `opts.readout`; missing
elements are skipped.

| Key | Element in `index.html` | Content |
| --- | --- | --- |
| `j1`–`j4` | `#j1`–`#j4` | joint angles, `degText` format |
| `claw` | `#claw` | OPEN, CLOSING or HOLDING |
| `mode` | `#mode` | state label, or AT REACH LIMIT while dragging at the limit |
| `height` | `#hgt` | block centre height, e.g. `001.2 cm` |

### 9.4 Tuning panel

`world.js` `bindRig()` connects `#rig`: range inputs `#rig-base`, `#rig-l1`, `#rig-l2` and
`#rig-claw` in centimetres (step 0.1, bounds from `bench.LIMITS × 10`). Each input calls
`bench.setDims({ [key]: value / 10 })`. `#rig-reset` restores the dims read at start-up.
The results are shown in `#rig-reach`, `#rig-top`, `#rig-area` and `#rig-volume`. The panel
starts open on a fine pointer at a window width of 992 px or more. The `onStats` callback
keeps the sliders in step when `armctl set` or `reset` changes the arm.

## 10. Lights and shadows at desk scale

| Light | Where | Values |
| --- | --- | --- |
| Warm desk lamp (`buildMarks`) | local (1.2, 5.5, 3.5); world (0.12, 0.35), 0.55 m above the desk top | `PointLight(AMBER, 0.35, 1.6, 2)`; the code comment notes that distance and falloff are in world metres whatever the parent's scale |
| Screen spill (`buildMonitors`) | local (-5, 3.2, -1.2); world (-0.50, -0.12), 0.32 m above the desk top | `PointLight(0x8fd6c4, 0.12, 2.0, 2)` |

Neither point light casts shadows. Shadows come from the sun in `world.js`:

- `lights()` creates the sun as a `DirectionalLight` with `castShadow`, a shadow map of
  2048 px (1024 on a coarse pointer), and a shadow camera near 5 and far 90.
- `shadowSpan(half)` sets the shadow camera to a square of side `2 × half` metres,
  `normalBias = (2 × half / mapSize) × 1.4`, and `bias = -(half < 5 ? 0.002 : 0.051) / (far - near)`.
- `syncSeat()` calls `shadowSpan(3.2)` when the hacker starts sitting down (texels of about
  3.1 mm at 2048 px) and `shadowSpan(30)` when standing up (about 29 mm).
- `frame()` calls `composer.aoSpan(near)` (in `js/realism.js`) with `near` true while seated
  or in a close-up, which switches ambient occlusion to `AO_NEAR { radius: 0.06, thickness: 0.12 }`
  from `AO_FAR { radius: 0.35, thickness: 0.7 }`.

Arm parts, desk top and legs, chair, monitor bezels, keyboard, mug, board, cables and the
block set `castShadow`. The shadow receivers are the desk top, the arm's base plate, the
pedestal column and top, the block, the mouse pad, the chair cushion, the tower body, the
monitor feet, the keyboard slab, the mug and the board's PCB.
The block also has its own blob shadow, a radial-gradient plane (`blobTexture`).

## 11. Public API

### 11.1 Module exports of `js/bench.js`

| Export | Kind | Meaning |
| --- | --- | --- |
| `AMBER` | `number` `0xf0a31e` | the accent colour for live elements |
| `LIMITS` | object | `{ base, l1, l2, claw }`, each `[lo, hi]` in local units |
| `createBench(opts)` | function | builds the workbench into `opts.scene` and returns the API below |
| `roundedBox(w, h, d, r)` | function returning `ExtrudeGeometry` | a box centred on the origin with bevelled edges of radius `r` (capped below half of each side); imported by `js/island.js` and `js/stations.js` |
| `hub(r, w, body, ring)` | function returning `Group` | a joint cylinder of radius `r` and width `w` along z in material `body`, with a torus band in material `ring` on each face; imported by `js/stations.js`, which does not call it |

The bench's state lives at module scope, so a page has one workbench.

### 11.2 createBench options

| Option | Type | Meaning |
| --- | --- | --- |
| `scene` | `THREE.Scene` | required; `root` is added to it |
| `camera` | `THREE.Camera` | required; used for every ray, the free-drag plane and pick sizing |
| `reduceMotion` | boolean | turns off the unattended demo jobs started from `REST`, the tower fans and the slide animation; the arm still fetches the block home after a drag (see [8.3](#83-grabs-and-taps)) |
| `slides` | `Array<{ src, alt }>` | left monitor pictures; anything that is not an array counts as empty |
| `readout` | `{ j1, j2, j3, j4, claw, mode, height }` of elements | optional; see [9.3](#93-dom-readout) |
| `onStats` | `(stats) => void` | called by `armctl set` and `reset` |
| `onLine` | `(text) => void` | called with the done message when a user job finishes |

`world.js` passes `scene`, `camera`, `reduceMotion`, `slides: projectSlides()`, the readout
elements, `onStats` (updates the tuning panel) and `onLine` (prints to the HUD console).

### 11.3 Returned members

Coordinates are world metres unless marked local. `x, y` arguments are NDC (-1 to 1).

| Member | Signature | Meaning |
| --- | --- | --- |
| `root` | `THREE.Group` | the scaled root, named `workbench`, at (0, `GROUND` + 0.75, 0), scale 0.1 |
| `group` | `THREE.Group` | the same object as `root` |
| `update` | `update(now, dt)` | advances the bench one frame; `now` in ms, `dt` in s |
| `pointerDown` | `pointerDown(x, y) → "free" \| "depth" \| "none"` | starts a grab of the block or its ring |
| `pointerMove` | `pointerMove(x, y, travel) → boolean` | moves a grabbed block; `travel` in CSS px; `true` while a grab is active |
| `pointerUp` | `pointerUp(x, y, { cancel = false } = {})` | ends a grab or handles a tap; `cancel` means the hold ended without a real release |
| `hoverAt` | `hoverAt(x, y) → boolean` | whether the block or ring is under the pointer |
| `setDims` | `setDims(next) → stats` | `next` is a partial `{ base, l1, l2, claw }` in local units; see [5.5](#55-setdimsnext) |
| `getDims` | `getDims() → { base, l1, l2, claw }` | a copy of the current dims, local units |
| `stats` | `stats() → { reachCm, heightCm, areaCm2, litres, dims }` | see [5.4](#54-working-envelope-and-statistics) |
| `LIMITS` | object | the exported `LIMITS` |
| `block` | `block() → THREE.Vector3` | a new vector at the block centre in world coordinates |
| `colliders` | `Array<{ x, z, hw, hd, c, s }>` | desk and tower footprints, computed once; see [section 4](#4-colliders-and-the-layout-contract) |
| `seat` | `{ x: -0.45, z: 0.65, heading: π, height: 0.46 }` | the seat in ground coordinates; `height` is the seat top above the floor in metres |
| `approach` | `{ x: -0.45, z: 1.35, heading: π }` | the spot behind the chair where sitting starts and ends |
| `keyboard` | `THREE.Vector3` (-0.45, -0.65, 0.19) | the keyboard's origin on the desk top, computed once |
| `aimFromNdc` | `aimFromNdc(x, y) → THREE.Vector3 \| null` | the desk or pedestal point under the pointer; see [8.4](#84-aimfromndcx-y) |
| `placeAt` | `placeAt(p) → { accepted, target, reason, line }` | orders the block to world point `p`; see [7.5](#75-placeatp-and-placelocal-options) |
| `command` | `command(input) → { ok, lines }` | runs one `armctl` line; see [section 12](#12-armctl-command-reference) |
| `busy` | `busy() → boolean` | `true` while a user job runs |
| `log` | `log() → string[]` | the terminal's stored lines (up to 40) |

`world.js` uses every member except `group`, `keyboard` and `log`. With `?debug` in the
URL, `world.js` exposes the bench as `window.__world.bench` and defines
`window.__blockScreen()`, which returns the block's screen position and world coordinates
(used by `tools/test/drag.mjs`; see [Testing and release](testing-and-release.md)).

## 12. armctl command reference

### 12.1 Conventions

- Input reaches `command(input)` from the HUD console (`bindConsole` in `world.js`). An empty
  line returns `{ ok: true, lines: [] }` and echoes nothing.
- Every other line is echoed to the terminal as `armctl> <input>`, then run by `run(text)`.
  Answer lines go to the terminal as `out` when `ok` is `true`, else `err`. `world.js`
  prints the same lines in the HUD console.
- A leading word `armctl` is dropped. The command name is not case-sensitive. Arguments
  are split on whitespace. A number is anything JavaScript's unary plus reads as a finite
  number.
- Distances are centimetres from the centre of the arm's base: `x` to the operator's right,
  `z` toward the operator, `h` the height of the block's centre above the desk top (the
  number HGT shows). Coordinates in answers use one decimal.

### 12.2 Commands

| Command | Arguments | Effect | Answer lines (from the code) |
| --- | --- | --- | --- |
| `help` (or the word `armctl` alone) | none | lists the commands | the seven lines of the help list, e.g. `place <x> <z> [h]           move the block, cm from the base: x right, z toward you, h up` |
| `status` | none (extra words are ignored) | reports | `state <STATE>, claw <OPEN\|CLOSING\|HOLDING>` plus `, moving to x <x> z <z> h <h>` during a user job; `block x <x> z <z> h <h> cm, <r> cm out` plus `, on the pedestal`; `links base <b> l1 <l1> l2 <l2> claw <c> cm` |
| `place <x> <z> [h]` | `x`, `z` in cm; optional `h` in cm, omitted means on the desk | fits the target (section 7.1) and starts a user job | `place <args>: ok` or `place <args>: <reason>`, then `moving block to x <x> z <z> h <h> cm` |
| `home` | none | starts a user job to `HOME` | `home: returning the block to the pedestal at x <x> z <z>` |
| `reach` | none (extra words are ignored) | reports | `reach <r> cm on the desk, from <lo> cm clear of the base`; `widest <w> cm at shoulder height (<s> cm), top <t> cm`; `floor area <a> cm2, working volume <v> L` |
| `set <key> <cm>` | `key` one of `base`, `l1`, `l2`, `claw`; value in cm | `setDims`, then `onStats` | `set <key> <value>: <name> <cm> cm` or `set <key> <value>: clamped to <cm> cm (range <lo> to <hi> cm)`, then `reach now <r> cm, top <t> cm` |
| `reset` | none | `setDims(DEFAULTS)`, `onStats`; if no grab is active and the block is held or off the pedestal, starts a user job home | `reset: base <b>, upper arm <l1>, forearm <l2>, claw <c> cm` plus `, block going home` |

### 12.3 Refusals and errors

All of these return `ok: false`.

| Condition | Answer |
| --- | --- |
| unknown command | `armctl: unknown command '<cmd>', try help` |
| `place` with fewer than 2 or more than 3 arguments | `place: usage: place <x_cm> <z_cm> [height_cm]` |
| `place` with a non-number | `place: '<arg>' is not a number; usage: place <x_cm> <z_cm> [height_cm]` |
| `place` while the block is dragged | `place <args>: the block is being dragged, let go first` |
| `home` with arguments | `home: takes no arguments` |
| `home` while the block is dragged | `home: the block is being dragged, let go first` |
| `set` with a wrong argument count or key | `set: usage: set <base\|l1\|l2\|claw> <cm>` |
| `set` with a non-number | `set: '<arg>' is not a number; usage: set <base\|l1\|l2\|claw> <cm>` |
| `reset` with arguments | `reset: takes no arguments` |

`home` with the block already resting on the pedestal and no job returns `ok: true` with
`home: the block is already on the pedestal`.

### 12.4 Examples at default links

Each answer below was computed from the `planTarget`, `floorSpan` and message code at the
default dims, with no job running, no grab, and the block resting on the desk off the
pedestal (it starts at local (1.62, -0.35)). Two answers depend on where the block is: with
the block resting on the pedestal, `home` answers `home: the block is already on the
pedestal`, and `reset` leaves out `, block going home`.

```
armctl> place 15 5
place 15 5: ok
moving block to x 15.0 z 5.0 h 1.2 cm

armctl> place 30 0
place 30 0: out of reach, clamped to 23.1 cm
moving block to x 23.1 z 0.0 h 1.2 cm

armctl> place 3 0
place 3 0: too close to the base, pushed out to 7.4 cm
moving block to x 7.4 z 0.0 h 1.2 cm

armctl> place -9 13
place -9 13: on the pedestal
moving block to x -8.9 z 12.7 h 5.6 cm

armctl> place 10 0 40
place 10 0 40: above the arm's reach, clamped to 26.7 cm up
moving block to x 7.4 z 0.0 h 26.7 cm

armctl> home
home: returning the block to the pedestal at x -8.9 z 12.7

armctl> reach
reach 23.2 cm on the desk, from 7.4 cm clear of the base
widest 23.9 cm at shoulder height (6.6 cm), top 27.1 cm
floor area 1637 cm2, working volume 33.9 L

armctl> set l1 12
set l1 12: upper arm 12.0 cm
reach now 24.0 cm, top 27.9 cm

armctl> set l1 20
set l1 20: clamped to 13.5 cm (range 7.0 to 13.5 cm)
reach now 25.6 cm, top 29.4 cm

armctl> reset
reset: base 6.6, upper arm 11.2, forearm 9.5, claw 3.4 cm, block going home
```

When a user job finishes, a further line arrives, for example
`done: block at x 15.0 z 5.0 h 1.2 cm`.

## 13. Procedures

### 13.1 Adding an armctl command

1. In `js/bench.js`, add a `case "<name>":` to the `switch` in `run(text)`. The name must be
   lower case, because `run` lower-cases the typed name. `parts` holds the arguments after
   the name. Parse numbers with the local `num(s)`, which returns `NaN` for anything that
   is not a finite number.
2. Convert centimetre arguments to local units by dividing by 10. Format local lengths in
   answers with `cm(u)`.
3. Return `{ ok, lines }`. `ok: false` shows the lines as errors. Start each line with the
   command name, as the existing commands do, and check the argument count explicitly, as
   `home` and `reset` do.
4. If the command moves the block, refuse while `mode !== "none"` with the existing
   `let go first` wording, and prefer `place(local, { home: false, asked })`. `place`
   fits a copy of the point with `planTarget` (pedestal snap, base and column clearance,
   the far, near and high notes) before it calls `startJob`. `startJob(point, "user", home)`
   on its own only copies `point` into `dest`: it gives the done message and `busy()` but
   no reach fitting, and the per-frame `clampToEnvelope` does not apply `BASE_CLEAR` or
   `COLUMN_CLEAR`, so an unfitted point can set the block down inside the arm's base. If
   you call `startJob` directly, first fit the point with `planTarget(point)`, which
   changes it in place and returns the notes, or pass a point that is already valid, as
   `home` and `reset` do with `HOME`.
5. If the command changes the links, call `setDims(...)` and then `onStats(stats())`, so the
   tuning panel follows.
6. Add a line to the `help` list, with the description in the same column as the others.
7. Add the command to the tables in [section 12](#12-armctl-command-reference).
8. None of the scripts in `tools/test/` mentions `armctl`, so nothing checks commands
   automatically. Do not serve or test the site yourself. Give the owner the browser test
   commands in [Testing and release](testing-and-release.md) and ask them to try the
   command at the desk.

### 13.2 Changing the desk layout

1. Edit the constants at the top of `js/bench.js` (`DESK`, `SEAT`, `APPROACH_Z`,
   `KEYBOARD`, `MONITORS`, `TOWER`). They are local units: ground metres are the local
   (x, z) times 0.1.
2. Move by hand the parts that do not follow those constants. Their positions are literal
   local coordinates:

   | Builder | Hard-coded local positions |
   | --- | --- |
   | `buildDesk` | the arm lead's waypoints `[-0.2, 0.03, -0.52]`, `[-0.5, 0.03, -1.7]`, `[-0.85, 0.04, -2.6]`, `[-0.9, -0.1, -2.8]`, `[-0.92, -1.2, -2.85]`, `[-1.2, -4.0, -3.7]`, `[-1.6, lie + 0.5, -3.9]`, `[-2.4, lie, -3.95]`, `[-4.5, lie, -3.9]`, `[-8.0, lie, -3.75]`, `[-9.6, lie + 0.4, -3.6]` |
   | `buildDesk` | each monitor cable's fixed z values -3.4, -3.62, -3.9 and -3.95, and its floor point `[-9.4, lie, -3.8]` |
   | `buildDesk` | mouse pad (-1.35, 0.015, 2.65), mouse (-1.5, 0.03 + 0.17, 2.7), mug (3.3, 0.475, -2.3), board (3.0, 0.02, 1.8) |
   | `buildDeskFrame` | cable grommet (-0.9, 0.004, -2.8) |
   | `buildMarks` | warm desk lamp (1.2, 5.5, 3.5) |
   | `buildMonitors` | screen spill light (-5, 3.2, -1.2) |

   `lie` is `FLOOR + 0.05`. Only the tower end of each cable (`TOWER.x`, `back`) and the
   start of each monitor cable (`m.x`, `m.z`, and x offsets from `m.x`) follow the
   constants.
3. If `SEAT`, `KEYBOARD`, `DESK` or `FLOOR` changes, update the matching constants in
   `tools/character/rig.py` and rebuild `assets/models/character/hacker.glb` and
   `hacker.json` as described in
   [Rebuilding the character](character.md#9-rebuilding-the-character). The seated typing
   clip `SitType` is posed offline for today's spacing. `rig.py` measures in metres from
   the floor point under the seat centre:

   | `rig.py` constant | Value | Matches in `js/bench.js` |
   | --- | --- | --- |
   | `SEAT` | 0.46 | `(SEAT.top - FLOOR) × 0.1`, seat top above the floor |
   | `DESK["top"]` | 0.75 | `-FLOOR × 0.1`, desk top above the floor |
   | `DESK["front"]` | 0.30 | `(SEAT.z - (DESK.z + DESK.d / 2)) × 0.1`, seat centre to the desk's front edge |
   | `KEYS["forward"]` | 0.46 | `(SEAT.z - KEYBOARD.z) × 0.1`, seat centre to the keyboard origin |
   | `KEYS["width"]`, `KEYS["depth"]` | 0.42, 0.135 | the keyboard's 42 × 13.5 cm |

   `rig.py` fails the build with `SitType: gloves in the keyboard` when its keyboard
   clearance check fails. It writes `seatHeight` and `keyboardReach` to `hacker.json`, but
   `js/player.js` uses only `seatHeight` (`keyboardReach` appears in its `FALLBACK` object
   and is never read). `seatFloor` raises or lowers the whole seated body by
   `seat.height - meta.seatHeight`, which keeps the character on a seat of a different
   height but moves the hands by the same amount relative to the keyboard. Nothing
   corrects a different keyboard distance.
4. If `SEAT.x` or `APPROACH_Z` changes, set `BENCH.spawn` in `js/layout.js` and `APPROACH`
   in `tools/checks/zones.mjs` to the new `bench.approach`.
5. If the desk, tower or chair footprint changes, update the `DESK`, `TOWER` and `CHAIR`
   rects in `tools/checks/zones.mjs`. Check that `BENCH.zone`, `BENCH.hit` and
   `BENCH.focus` in `js/layout.js` still cover the desk and chair; if `BENCH.zone` changes,
   copy it to `BENCH_ZONE` in `zones.mjs`.
6. Run the layout check:
   ```
   node tools/checks/zones.mjs
   ```
   It prints `PASS: <n> checks` and exits with code 0, or lists the failures and exits
   with code 1.
7. Update the tables in [section 3](#3-desk-layout) and [section 4](#4-colliders-and-the-layout-contract).
8. Give the owner the browser test commands in [Testing and release](testing-and-release.md).

## 14. Known limitations

- **The layout contract is copied by hand.** The door, zone and footprints are in
  `js/bench.js`, `js/layout.js` and `tools/checks/zones.mjs`, and only the door and zone
  are compared automatically. A change to the desk, tower or chair in `bench.js` is not
  detected by `zones.mjs` until its rects are edited too.
- **`GROUND` is copied by hand.** `js/bench.js` has its own `const GROUND = -1.4`. The
  canonical value is in `js/layout.js`, and no check compares the two.
- **The typing pose is fixed to today's desk.** `tools/character/rig.py` repeats the seat
  height, desk top, desk front edge and keyboard spacing. `js/player.js` corrects only a
  different seat height, so moving the keyboard, seat or desk in `bench.js` without
  rebuilding the character leaves the hands off or inside the keyboard.
- **Several desk parts ignore the layout constants.** The cable waypoints, grommet, mouse
  pad, mouse, mug, board and both point lights are literal local coordinates and stay
  behind when the desk, tower or monitors move (see
  [Changing the desk layout](#132-changing-the-desk-layout)).
- **A height below the desk is raised silently.** `planTarget` sets `raised`, but `place`
  never reports it: `place 15 5 -3` answers `place 15 5 -3: ok` and sets the block down at
  h 1.2 cm.
- **`set` accepts inherited object keys.** `run` checks the key with `!LIMITS[key]`, so
  `set constructor 5` and `set __proto__ 5` pass the check and then throw while unpacking
  `LIMITS[key]`, before `setDims` runs. The terminal shows only the echoed input.
  `bindConsole` in `world.js` catches the exception and prints `error: <message>` in the HUD
  console. Checking the key with `Object.hasOwn(LIMITS, key)` would give the usage error
  instead.
- **One bench per page.** `createBench` stores its scene, root, arm and state in
  module-level variables, so a second call would take over the first bench's state.
- **Unused members.** `group`, `keyboard` and `log` are not read by any module in `js/` or
  script in `tools/`; they are reachable only through `window.__world.bench` with `?debug`.
