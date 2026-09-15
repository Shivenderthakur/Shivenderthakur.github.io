# Campus layout

This document describes the walkable campus round the workbench: where every building,
walkway, planter and lamp stands, how the ground a walker can use is described, how entry
zones and doors work, what is inside each building and at what real size, what loads late,
and how `tools/checks/zones.mjs` checks the layout. Read it before you move, add or resize
anything on the island. The workbench itself (desk, chair, arm, monitors) is covered in
[Workbench](workbench.md); walking, the camera and the HUD in
[World and controls](world-and-controls.md).

## Contents

1. [Conventions](#1-conventions)
2. [js/layout.js, the single source of truth](#2-jslayoutjs-the-single-source-of-truth)
3. [Landmarks](#3-landmarks)
4. [Walking geometry: colliders, platforms and heightAt](#4-walking-geometry-colliders-platforms-and-heightat)
5. [Zones, doors and the start point](#5-zones-doors-and-the-start-point)
6. [The plaza and the grounds](#6-the-plaza-and-the-grounds)
7. [The buildings](#7-the-buildings)
8. [Real-size reference](#8-real-size-reference)
9. [Lazy loading and the phone subset](#9-lazy-loading-and-the-phone-subset)
10. [The layout check](#10-the-layout-check)
11. [Recipes](#11-recipes)
12. [Open issues](#12-open-issues)

---

## 1. Conventions

| Item | Rule |
| --- | --- |
| Units | Metres, sized for a reader 1.75 m tall. The workbench's own model uses bench-local units of 10 cm (`ROOT_SCALE = 0.1` in `js/bench.js`); nothing on the campus does. |
| Axes | x to the right as you face the workbench from the start, z towards you, y up. |
| Ground | `GROUND = -1.4` (exported by `js/layout.js` and re-exported by `js/island.js`). Coordinates in this document are (x, z) on that ground. The plaza centre is (0, 0). |
| Heights | "Above the pad" or "above the floor" means above that surface; `heightAt` values are above `GROUND`. |
| Heading | A heading h faces the ground direction (sin h, cos h), so `Math.PI` faces -z. |
| Landmark frame | A landmark stands at (x, z), turned by `ry`. In its own frame +z points at the plaza. |
| Shapes | In a landmark frame: circles `{ x, z, r }` and rectangles `{ x, z, w, d }`. In the world: circles `{ x, z, r }` and oriented rectangles `{ x, z, hw, hd, c, s }` (half-width, half-depth, cosine and sine of the turn). |

A point (x, z) in a landmark frame becomes the world point
(px + x·c + z·s, pz − x·s + z·c), where (px, pz) is the landmark position and c, s are
cos and sin of `ry` (`worldXZ` in `js/layout.js`).

---

## 2. js/layout.js, the single source of truth

`js/layout.js` holds the campus layout as plain numbers and a little geometry. It has no
imports, so the same module builds the island in the browser (`js/island.js`) and runs under
plain Node in `tools/checks/zones.mjs`.

What lives where:

- **In `js/layout.js`:** landmark sites, pads, solids, floors, zones, doors, walkways, labels,
  planters, lamps and the start point. Change these here, never in `island.js`.
- **In `js/island.js`:** decoration inside a building (props, frames, signs, lights, rig
  offsets, the stage pictures). Each is placed as literal numbers in its building's builder
  (for example the `place(tools.group, "desk_lamp_arm_01", …)` call in `buildIsland`), and
  `tools/checks/zones.mjs` does not check it. To move such an item, edit its builder. Anything
  that blocks walking must still be added to the landmark's `solids` in `js/layout.js`.

### Constants

| Export | Value | Meaning |
| --- | --- | --- |
| `GROUND` | -1.4 | The ground height. |
| `PLAYER_RADIUS` | 0.3 m | The walker's radius, used by the check. |
| `ISLAND` | `{ radius: 24, walk: 21.5 }` | Island top radius and the walkable radius the check uses. |
| `PLAZA_RADIUS` | 7.5 m | The paved disc round the workbench. |
| `PAD_TOP` | 0.14 m | Top of the lit slab under each building. |
| `TABLE_TOP` | 0.75 m | A table or lab bench top above the floor it stands on. |
| `WALKWAY_CLEAR` | 1.8 m | Half the width a walkway keeps clear of planters and lamps. |
| `PLANTER_RADIUS` | 0.95 m | Collider radius of a planter. |
| `LAMP_RADIUS` | 0.25 m | Collider radius of a street light. |

### Data

| Export | Contents |
| --- | --- |
| `LANDMARKS` | One entry per building (`research`, `stage`, `lab`, `hall`, `skills`, `shed`, `mast`): position and turn, `pad`, `solids`, `floors` and the dimensions its builder needs. See [section 3](#3-landmarks). |
| `BENCH` | The workbench's zone, spawn (door), click box `hit`, camera `focus`, `dist`, `lift` and `dir`. The desk, chair, tower and arm belong to `js/bench.js`. |
| `SERIAL_LINK` | `{ x: 2.4, z: -1.8, r: 0.35, h: 0.9 }`, the plinth beside the workbench. |
| `BUSES` | Seven walkway polylines from the plaza rim to the front edge of a pad. |
| `LABELS` | Zone names painted inside the plaza rim: `[text, x, z, ux, uz]`. |
| `PLANTERS` | Nine planter positions `[x, z]`. |
| `LAMPS` | Nine street lights `[x, z, ry]`. |
| `START` | `{ x: 0, z: 4.2, heading: Math.PI }`. |
| `ORDER` | `["bench", "research", "stage", "lab", "hall", "skills", "shed", "mast"]`. |
| `SHORT` | Short names for the HUD: Workbench, Research, Stage, Lab, Credentials, Skills, Toolchain, Contact. |

### Derived at import time

A loop over `ORDER` fills these from `LANDMARKS`, then appends the serial link, planters and
lamps:

| Export | Contents |
| --- | --- |
| `COLLIDERS` | World circles and oriented rectangles the walker is pushed out of, each with a `tag`. |
| `PLATFORMS` | World rectangles with a `top` height: each pad and each raised floor. |
| `ZONES` | One world rectangle per place; `ZONES.bench` is `BENCH.zone`. |
| `SPAWNS` | One door per place `{ x, z, heading }`; `SPAWNS.bench` is `BENCH.spawn`. |

### Geometry helpers

| Function | Purpose |
| --- | --- |
| `quarterTurn(x, z)` | The turn that faces the plaza from (x, z), squared to the nearest quarter turn so the campus reads as a grid. |
| `frameOf(site)` | `{ px, pz, c, s }` for a landmark. |
| `worldXZ(f, x, z)` | A landmark-frame point on the world ground. |
| `toWorld(f, shape, extra)` | A landmark-frame circle or rectangle as a world shape; extra fields are copied. |
| `inRect(r, x, z)` | Whether a ground point is inside a world oriented rectangle. |
| `gap(k, x, z)` | How far a ground point is outside a world shape; 0 or less means inside. |
| `segmentDistance(x, z, a, b)` | Ground distance from a point to a segment. |
| `heightAt(x, z, platforms)` | The highest platform `top` under a point, or 0. |

A module-private helper `site(x, z)` returns `{ x, z, ry: quarterTurn(x, z) }`, so each
landmark starts `...site(x, z)`.

---

## 3. Landmarks

World positions below are the output of `js/layout.js`. `ry` is in degrees. The pad is
`[cx, cz, w, d]` in the landmark frame. Zones and doors are in world metres, and zone sizes are
world extents along x and z (at `ry` 90 or 270 the pad's local width runs along world z). "Opens"
is the `panel` (and `anchor`) of the place in `buildIsland` in `js/island.js`.

| Key | Building (label) | Position (x, z) | ry | Pad `[cx, cz, w, d]` | Opens | Door (x, z), heading | Zone centre, size (x × z) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `bench` | The workbench | (0, 0) | – | – | `#about` (the workbench seats the hacker instead; see [Workbench](workbench.md)) | (-0.45, 1.35), 180° | (-0.35, 0.75), 2.5 × 2.4 |
| `research` | Research tower | (-7, -16) | 0 | `[0, 0, 7, 7]` | `#research` | (-7.00, -11.40), 180° | (-7.00, -16.00), 8.5 × 10.0 |
| `stage` | Bheenmal stage | (16, -6) | 270 | `[0, -0.1, 11, 7.6]` | `#work`, anchor `#work-robonari` | (11.20, -6.00), 90° | (16.10, -6.00), 10.6 × 12.5 |
| `lab` | Robotics lab | (16, 7) | 270 | `[0, 0, 12, 9]` | `#work`, anchor `#work-attendance` | (10.40, 7.00), 90° | (16.00, 7.00), 12.0 × 13.5 |
| `hall` | Credentials hall | (0, 16.5) | 180 | `[0, 0, 18, 7.5]` | `#experience` | (0.00, 11.65), 0° | (0.00, 16.50), 19.5 × 10.5 |
| `skills` | Skills lab | (-14, 2) | 90 | `[0, -1.6, 13, 12.4]` | `#stack` | (-8.30, 2.00), -90° | (-15.60, 2.00), 15.4 × 14.5 |
| `shed` | Toolchain | (-13, -10) | 90 | `[0, 0, 7, 5.6]` | `#toolchain` | (-9.10, -10.00), -90° | (-13.00, -10.00), 8.6 × 8.5 |
| `mast` | Say hello | (8, -16) | 360 (same as 0) | `[0, 0, 5, 5]` | `#contact` | (8.00, -12.40), 180° | (8.00, -16.00), 6.5 × 8.0 |

Each place in `buildIsland` also carries a camera `focus`, `dist`, `lift` and `dir` (see
[World and controls](world-and-controls.md)), invisible `hits` boxes built by `hitBox`, and
`zone`, `spawn` and `short` copied from `ZONES`, `SPAWNS` and `SHORT`. Clicking a hit box
calls `go(key, { teleport: true })` in `js/world.js`, which puts the hacker at the door (for
the workbench it seats the hacker instead; see [Doors](#doors)).
The header links in `index.html` carry `data-place` for every key except `lab`; the lab is
reached by walking in or through the `#work-attendance` anchor.

---

## 4. Walking geometry: colliders, platforms and heightAt

### Colliders

Each landmark lists `solids` in its own frame; `toWorld` turns them into `COLLIDERS` tagged
with the landmark key. After the landmarks the loop adds the serial-link plinth
(radius `SERIAL_LINK.r + 0.1` = 0.45 m), every planter (radius 0.95 m) and every lamp
(radius 0.25 m).

| Tag | Count | Shapes (landmark frame) |
| --- | --- | --- |
| `research` | 1 | Circle r 2.45 round the tower. |
| `stage` | 2 | Deck rectangle 9.6 × 5.9 at z -0.15; the steps, 1.3 × 0.9 at (3.4, 3.17). |
| `lab` | 7 | Back wall 10.4 × 0.45; two side walls 0.45 × 7.2 at x ±5; three benches 2.1 × 0.9; turntable circle r 0.4. |
| `hall` | 4 | Back wall 16 × 0.45 at z -2.7; two columns r 0.35 at (±7.6, 2.5); pedestal circle r 0.35. |
| `skills` | 2 | Plinth circle r 1.9; backdrop and showcase rectangle 6.2 × 0.7 at z -4.75. |
| `shed` | 3 | Back wall 5.4 × 0.35 at z -1.9; table 2.3 × 0.9; toolbox circle r 0.35. |
| `mast` | 3 | Plinth circle r 1.75; two gate posts r 0.12 at (±1.3, 1.95). |
| `serial link` | 1 | Circle r 0.45 at (2.4, -1.8). |
| `planter` | 9 | Circles r 0.95. |
| `lamp` | 9 | Circles r 0.25. |

That is 41 campus colliders. `buildIsland` returns copies as `colliders`; `js/world.js`
passes `island.colliders.concat(bench.colliders)` to `createPlayer`, so the desk and tower
from `makeColliders` in `js/bench.js` join them. The stage deck has no floor entry, so it is
a solid block, not a platform.

### Platforms and heightAt

Every pad becomes a platform with `top: PAD_TOP` and tag `<key> pad`. Every entry in
`floors` becomes a platform with its own `top`. Sizes are world extents along x and z; for the
stage, lab, skills lab and shed (`ry` 90 or 270) they are the local width and depth swapped.

| Tag | World centre (x, z) | Size (x × z) | Top above ground |
| --- | --- | --- | --- |
| `research pad` | (-7.00, -16.00) | 7.0 × 7.0 | 0.14 m |
| `stage pad` | (16.10, -6.00) | 7.6 × 11.0 | 0.14 m |
| `lab` | (16.00, 7.00) | 7.0 × 10.0 | 0.20 m |
| `lab pad` | (16.00, 7.00) | 9.0 × 12.0 | 0.14 m |
| `hall` | (0.00, 16.50) | 16.0 × 6.0 | 0.30 m |
| `hall pad` | (0.00, 16.50) | 18.0 × 7.5 | 0.14 m |
| `skills pad` | (-15.60, 2.00) | 12.4 × 13.0 | 0.14 m |
| `shed` | (-13.00, -10.00) | 4.0 × 5.4 | 0.20 m |
| `shed pad` | (-13.00, -10.00) | 5.6 × 7.0 | 0.14 m |
| `mast pad` | (8.00, -16.00) | 5.0 × 5.0 | 0.14 m |

`heightAt(x, z)` returns the highest `top` of any platform whose rectangle contains the
point, or 0 on open ground. `buildIsland` returns it as `island.heightAt`; the player places
its feet at `GROUND + heightAt(x, z)`. The workbench and plaza are at height 0.

---

## 5. Zones, doors and the start point

### Zones

A building's zone is its pad grown 1.5 m across (0.75 m each side) and 3 m deep (1.5 m in
front and 1.5 m behind), turned with the building (`ZONE_ACROSS` and `ZONE_DEEP` in
`js/layout.js`). The workbench zone is fixed in `BENCH.zone`: a 2.5 × 2.4 m rectangle centred
on (-0.35, 0.75).

`checkZones` in `js/world.js` runs while walking: a building whose zone contains the hacker
opens its panel, and walking out closes it. Entering the workbench zone sits the hacker at
the desk instead of opening a panel. The HUD radar in `js/hud.js` draws each place's zone
rectangle, and the compass marks point at each zone centre.

### The overlap rule

Zones of neighbouring buildings may overlap. Where they do, the place whose zone centre is
nearest the hacker wins (`checkZones` in `js/world.js`; the same rule is `resolve` in
`tools/checks/zones.mjs`). The workbench zone must never overlap another zone. Today the
check reports two overlaps: `research/shed` and `stage/mast`.

### Doors

A building's door (`SPAWNS[key]`) is 1.1 m in front of the front edge of its pad
(`DOOR_OUT`), with heading `ry + π` so it faces into the building. The workbench door is
`BENCH.spawn`, (-0.45, 1.35) facing -z, which must equal `approach` in `js/bench.js`.
Teleports from the header, panel arrows, deep links and building clicks land on the door,
except the workbench, where a teleport seats the hacker at once (`sitDown({ instant: true })`
in `go()` in `js/world.js`) and falls back to the door only if that fails.

`buildIsland` marks each door with an entry ring (inner radius 0.42 m, outer 0.5 m) 8 cm
above `GROUND + heightAt`, clear of the walkway traces (top 5.75 cm) and vias (7.2 cm). The
ring breathes in cyan and holds amber while its place is open (`update` in `buildIsland`).

### The start point

`START` is (0, 4.2) with heading π: on the plaza, facing the workbench, inside no zone and
clear of every collider. The check asserts all three.

---

## 6. The plaza and the grounds

Builders for everything in this section are in `js/campus.js`; `buildIsland` places them from
`js/layout.js`. Street lights are static. When reduced motion is requested, `buildIsland`
passes `reduceMotion` down and this motion stops: walkway pulses (`traces`), rim tiles
(`rimTiles`), entry-ring breathing (`update` in `buildIsland`), the mast beacon blink and
rings, the stage humanoid, the skill ring, the serial-link pulse and scope, and the lab arm.

### Terrain and plaza

- `terrain` in `js/island.js`: a 72-sided cylinder 24 m across the radius at the top
  (`ISLAND.radius`), with a rock cone beneath and a star field.
- `plaza`: a paved disc of radius 7.5 m (`PLAZA_RADIUS`) 3 cm above the ground, a cyan rim
  ring 10 cm wide and a faint amber inner ring.
- `rimTiles`: twelve hexagonal glass tiles drifting 30 to 38 m from the centre.

### Walkways

`traces` draws each `BUSES` polyline as three parallel lanes 34 cm wide and 75 cm apart
(about 1.8 m overall), with vias of radius 22 cm at both ends of each lane and a light pulse
along the middle.

| Walkway | Polyline (x, z) |
| --- | --- |
| Work: stage | (7.4, -1.2) → (10.5, -1.2) → (10.5, -6) → (12.2, -6) |
| Work: lab | (7.4, 1.2) → (10.5, 1.2) → (10.5, 7) → (11.3, 7) |
| Credentials hall | (0, 7.5) → (0, 12.5) |
| Skills lab | (-7.23, 2) → (-9.2, 2) |
| Toolchain | (-7.0, -2.7) → (-8.2, -2.7) → (-8.2, -9.2) → (-10.0, -9.2) |
| Research tower | (-2.2, -7.2) → (-2.2, -11.4) → (-7, -11.4) → (-7, -12.3) |
| Contact mast | (2.2, -7.2) → (2.2, -11.4) → (8, -11.4) → (8, -13.3) |

### Ground labels

`groundLabel` paints each `LABELS` entry 4.2 m wide, its top edge pointing along (ux, uz).

| Text | Position (x, z) | Direction |
| --- | --- | --- |
| WORK | (6.1, 0) | (1, 0) |
| CREDENTIALS | (0, 6.1) | (0, 1) |
| SKILLS | (-6.1, 1.7) | (-1, 0) |
| TOOLCHAIN | (-5.2, -3.3) | (-0.85, -0.53) |
| RESEARCH | (-2.4, -6.0) | (0, -1) |
| CONTACT | (2.4, -6.0) | (0, -1) |

### Planters

Nine planters at `PLANTERS`: (6.2, 6.2), (-6.2, 6.2), (6.3, -6.3), (-5.7, -6.0),
(10.2, 13.4), (-10.2, 13.4), (13, -13.5), (-13.5, 12.5), (-14, -16.5). Each is a concrete
box 1.5 × 1.5 m and 55 cm tall with a tree whose crown reaches about 2.9 m.

### Street lights

`LAMPS` puts a light every 30° at 8.7 m from the centre, at angles
30, 60, 120, 150, 180, 240, 270, 300 and 330°, where angle a means (8.7 cos a, 8.7 sin a).
The 0°, 90° and 210° positions are left out because walkways leave there. Each light's turn
`ry = π − a` puts its head over the plaza. The pole is 3.2 m tall with a 70 cm head.

### The serial-link plinth

`serialLink` in `js/island.js` builds the rig beside the workbench, part of the About panel,
at `SERIAL_LINK` (2.4, -1.8), turned to face `START`:

- a plinth of radius 35 cm and 90 cm tall;
- a matte mat 46 × 24 cm on top;
- `boards/raspberry-pi-4b` at 8.53 cm and `boards/arduino-nano-every` at 4.55 cm, lying flat,
  centres 20 cm apart;
- a lead 5 mm thick with a pulse along it;
- a scope trace 20 cm wide, 16 cm above the mat, drawing a start bit, eight data bits and a
  stop bit.

---

## 7. The buildings

Each builder in `js/island.js` calls `landmark(scene, key)`, which makes a group at the
landmark's position and turn on `GROUND` and adds its lit pad (`pad` in `js/campus.js`). All
positions below are in the landmark frame (+z towards the plaza). Signs are 2.4 × 0.45 m
(`sign`). Doors are 1.0 × 2.1 m (`door` in `js/campus.js`).

### Research tower (`tower`)

- Three ten-sided drums, `[radius, height]` from `LANDMARKS.research.drums`: [2.4, 2.8],
  [2.0, 2.2], [1.7, 2.0], 7.0 m in all, each topped by an amber band.
- A door (1.0 × 2.1 m) on the front face of the lowest drum, leaning with its taper, with the
  RESEARCH sign above it.
- A roof deck of radius 1.9 m carrying the `sprint` rig from `RIGS` in `js/stations.js` at
  scale 0.55.

### Bheenmal stage (`stage`)

- Deck 9 × 5.5 m and 80 cm high (`LANDMARKS.stage.deck`).
- Three steps at x 3.4, 1.2 m wide, with 20 cm risers on 28 cm treads (`STAGE_STEPS`).
- A glass backdrop 9.4 × 5.2 m and a truss with a light line at 6.1 m.
- A humanoid stand-in 1.6 m tall on the deck at z 0.4.
- Five framed pictures on the backdrop, centres 1.8 m above the deck and 1.3 m apart:
  - the photograph `assets/events/robonari-on-stage-bheenmal-2024`;
  - four clippings from `assets/press/`: `robonari-marudhar-aaina-2024`,
    `robonari-dainik-nirala-2024`, `robonari-sach-media-2024` and
    `robonari-jagruk-times-2024`.
  Each is sized by its long side (60 to 80 cm) through `widthForLongSide`.
- The sign BHEENMAL 2024.
- The Poly Haven prop `Television_01` at 60 cm wide.

### Robotics lab (`lab`)

- A raised floor 10 × 7 m, 20 cm high (`LANDMARKS.lab.floor`).
- Glass walls 4 m tall on the back and both sides, open to the plaza, and a roof at 4.25 m.
- Three lab benches at x -3.2, 0 and 3.2, z -2.7, each 2.0 × 0.8 m with its top 75 cm above
  the floor (`table`). The rigs `roster`, `hand` and `trace` from `js/stations.js` stand on
  them at scale 0.3.
- An `industrial_microscope` prop 48 cm long on the first bench.
- A turntable plinth of radius 30 cm and 90 cm tall at (3.4, 1.0), on which
  `robotics/robotic-arm` loads at 50 cm and turns at 0.35 rad/s.
- The sign ROBOTICS LAB.

### Credentials hall, the hall of fame (`hall`)

- A raised floor 16 × 6 m, 30 cm high.
- A back wall 16 m wide and 6.2 m tall at z -2.7 with a brass dado rail 70 cm above the floor.
- A red runner 14.5 × 1.6 m, two steel columns at (±7.6, 2.5) and a lintel.
- Three spotlights at x -5, 0 and 5.
- A pedestal plinth (radius 22 cm, 95 cm tall) at (6.6, 1.6) carrying the `circuit_board`
  prop at 25 cm.
- The sign HALL OF FAME.

The eighteen certificates in the `certs` array of `hall` hang in two rows on the wall face
(`wallZ + 0.15`), each through `honour`:

| Parameter | Value | Source |
| --- | --- | --- |
| Row centre heights above the hall floor | 1.6 m (upper, with picture lamps) and 1.15 m | `LANDMARKS.hall.rows` |
| Spacing along the wall | 0.6 m | `LANDMARKS.hall.step` |
| Frames per upper row | `Math.ceil(certs.length / 2)`, nine today | `PER_ROW` |
| Picture | At most 30 cm on either side (`HONOUR.wide`, `HONOUR.tall`), so about A4 | `HONOUR` |
| Mount and moulding | 1.5 cm each, so the widest frame is 36 cm | `HONOUR.mount`, `HONOUR.moulding` |
| Engraved plate | 20 cm wide, below the frame, with `title` and `sub` | `HONOUR.plate`, `plateTexture` |

The close-up distance is `max(3, (rowSpan + 0.4) / 1.49 − 0.75)`, where
`rowSpan = (PER_ROW − 1) × step + 0.36`. With nine frames per row that is 3 m.

### Skills lab (`skills`)

The skills pad is set back (`pad` centre at local z -1.6) to make room for the showcase.

- A plinth of radius 1.8 m, 30 cm above the pad (`LANDMARKS.skills.plinth`), carrying the
  `boards` rig from `js/stations.js` at scale 0.3.
- A glass backdrop 6 × 3.4 m at z -4.95 with the SKILLS sign.
- Two hit boxes: one round the plinth and one round the showcase.

**Skill ring** (`makeSkillRing` in `js/icons.js`). Ten objects stand on a ring of radius
1.45 m, alternating between centre heights of 1.25 m and 1.6 m above the pad
(`LANDMARKS.skills.ring`). Each object turns at 0.5 rad/s and bobs ±3 cm; the whole ring turns
at 0.08 rad/s. Each has an amber mark on the plinth top and a name tag 50 cm wide.

| Key | Tag | Model | Largest dimension |
| --- | --- | --- | --- |
| `c` | C / C++ | `icons/computer` | 0.42 m |
| `python` | Python | `icons/snake` | 0.44 m |
| `ai` | AI | `icons/brain` | 0.40 m |
| `ml` | ML / DL | built in code (`neural`) | 0.40 m |
| `agentic` | Agentic AI | `icons/robot` | 0.44 m |
| `llm` | LLMs | `icons/speech-bubble` | 0.38 m |
| `slm` | SLMs | `icons/books` | 0.38 m |
| `vlm` | VLMs | `icons/eye` | 0.35 m |
| `linux` | Linux | `icons/penguin` | 0.40 m |
| `rnd` | R&D | `icons/flask` | 0.40 m |

The icon models are credited in `README.md`. They are generic objects, not vendor logos.

**Hardware showcase** (`showcase` in `js/island.js`). A wall case 2.4 m wide, 2.0 m tall and
45 cm deep at z -4.6 (`LANDMARKS.skills.showcase`), standing on the pad. It has a closed
cupboard below 0.9 m and open shelves lit from under the shelf above. `HARDWARE` row r goes on
`showcase.shelves[r]`, so the seven boards sit at 1.3 m, the first five sensors at 1.7 m and
the last five at 0.9 m above the pad. Items in a row share 2.28 m of shelf equally, each with
a 10 cm name plate. Flat models lie on an angled stand tilted 52° (`TILT = 0.9` rad); upright
models stand in a foam block leaning back 0.12 rad.

| Shelf | File (`assets/models/…`) | Label | Size |
| --- | --- | --- | --- |
| 1.3 m | `boards/arduino-uno` | Arduino Uno | 7.30 cm |
| 1.3 m | `boards/arduino-mega-2560` | Arduino Mega 2560 | 10.80 cm |
| 1.3 m | `boards/arduino-nano-every` | Arduino Nano Every | 4.55 cm |
| 1.3 m | `boards/esp32-nodemcu` | ESP32 NodeMCU | 5.23 cm |
| 1.3 m | `boards/raspberry-pi-5` | Raspberry Pi 5 | 8.65 cm |
| 1.3 m | `boards/raspberry-pi-4b` | Raspberry Pi 4B | 8.53 cm |
| 1.3 m | `boards/raspberry-pi-zero` | Raspberry Pi Zero | 6.50 cm |
| 1.7 m | `sensors/hc-sr04-ultrasonic` | HC-SR04 ultrasonic | 4.50 cm, upright |
| 1.7 m | `sensors/pir-motion` | PIR motion | 3.20 cm, upright |
| 1.7 m | `sensors/ir-sensor` | IR obstacle | 3.78 cm |
| 1.7 m | `sensors/dht11-temperature-humidity` | DHT11 temp and humidity | 2.50 cm, upright |
| 1.7 m | `sensors/imu-accelerometer-gyroscope` | IMU accel and gyro | 2.10 cm, upright |
| 0.9 m | `sensors/mq135-air-quality` | MQ-135 air quality | 3.76 cm, upright |
| 0.9 m | `sensors/mq2-gas-smoke` | MQ-2 gas and smoke | 3.55 cm |
| 0.9 m | `sensors/ldr-light-sensor` | LDR light | 3.90 cm |
| 0.9 m | `sensors/rain-sensor` | Rain | 10.47 cm |
| 0.9 m | `sensors/touch-sensor` | Capacitive touch | 2.41 cm |

`size` is the model's largest dimension in metres; `turn` is the rotation that puts the
component side up, because the CAD exports do not agree on an up axis.

**Close-up stops.** `showcase().stops()` builds one stop per slot, in `HARDWARE` order, the
first time it is called:

- `label`;
- `focus`, the model's middle in world coordinates;
- `dir`, straight out of the case;
- `dist`, `clamp(size × 5.5, 0.18, 0.3)` for upright models and
  `clamp(size × 3, 0.2, 0.35)` for flat ones;
- `lift`, `dist × 0.12` for upright models and `dist × 0.5` for flat ones.

Until a model loads its focus is an estimate; `loadSlot` refines it once the model is seated.
In `js/world.js`:

- `setCloseup(i)` allows a close-up only while the Skills panel is open.
- `desired()` places the eye at `focus + dir × dist`, raised by `lift`. Below 992 px wide it
  moves 25 % further back and lowers the view; on wider screens it shifts the view right.
- In the `#closeup` controls in `index.html`, "Look closer" (`#closeup-enter`) enters at the
  first stop. The left and right arrow keys, or `#closeup-prev` and `#closeup-next`, step
  through the stops. Escape, or Back (`#closeup-exit`), leaves the close-up.

### Toolchain (`shed`)

- A raised floor 5.4 × 4 m, 20 cm high.
- A glass back wall 5.4 × 3.4 m and a sloping roof.
- A table 2.2 × 0.8 m at (0, -1.2) carrying the `props` rig at scale 0.34.
- The Poly Haven props `desk_lamp_arm_01` (55 cm) and `classic_laptop` (34 cm) on the
  table, and `metal_toolbox` (45 cm) on the floor at (-2.05, 1.05).
- Three photographs from `assets/bench/` (`workstation`, `raspberry-pi`,
  `motor-driver-bench`), each 40 cm wide, 1.6 m above the floor.
- The sign TOOLCHAIN.

### Contact mast (`mast`)

- A plinth of radius 1.6 m and 40 cm tall.
- A steel pole 9 m long rising from the plinth, with four cross bars.
- An amber beacon sphere of radius 30 cm at 9.6 m with a blinking point light and three
  expanding rings.
- A gate of two posts 3 m tall at (±1.3, 1.95) (`MAST_GATE`), with the SAY HELLO sign hung
  between them at 2.75 m so you walk under it to the mast.

---

## 8. Real-size reference

Sizes as used in code. "Size" for a loaded model is its largest dimension, applied by
`loadProp` in `js/realism.js`.

| Object | Size used | Where |
| --- | --- | --- |
| Reader (hacker) | 1.75 m tall | Comment in `js/layout.js`; see [Character](character.md) |
| Workbench desk | 1.40 × 0.70 m, top 75 cm | `DESK`, `FLOOR` in `js/bench.js` |
| Workbench chair | Seat top 46 cm | `SEAT` in `js/bench.js` |
| Tables and lab benches | Top 75 cm above their floor, 4 cm thick | `TABLE_TOP`, `table` |
| Building pads | 14 cm slabs | `PAD_TOP`, `pad` |
| Raised floors | Lab and shed 20 cm, hall 30 cm | `floors` in `LANDMARKS` |
| Doors | 1.0 × 2.1 m | `door` in `js/campus.js`, `LANDMARKS.research.door` |
| Building signs | 2.4 × 0.45 m | `sign` |
| Stage steps | 20 cm risers, 28 cm treads | `STAGE_STEPS` |
| Certificates | Picture at most 30 cm a side; frame at most 36 cm; plate 20 cm wide | `HONOUR` |
| Press clippings and stage photo | Long side 0.6 to 0.8 m | `items` in `stage` |
| Bench photographs | 40 cm wide (portrait, about 53 cm tall) | `shed` |
| Boards and sensors | True size, 2.10 to 10.80 cm | `HARDWARE` |
| Showcase name plates | 10 cm wide | `nameplate` |
| Skill objects | 35 to 44 cm; name tag 50 cm wide | `SKILLS`, `TAG_W` in `js/icons.js` |
| Lab robotic arm | 50 cm | `buildIsland` |
| Humanoid stand-in | 1.6 m | `stage` |
| Props | Desk lamp 55 cm, laptop 34 cm, toolbox 45 cm, microscope 48 cm, television 60 cm, circuit board 25 cm | `place` calls in `buildIsland` |
| Serial-link rig | Plinth 90 cm; mat 46 × 24 cm; Pi 4B 8.53 cm; Nano Every 4.55 cm | `serialLink` |
| Planters | 1.5 × 1.5 m box, 55 cm tall; tree about 2.9 m | `planter` |
| Street lights | 3.2 m pole | `lamp` |
| Walkways | Three 34 cm lanes 75 cm apart | `traces` |
| Entry rings (door beacons) | Radius 0.42 to 0.5 m, 8 cm up | `buildIsland` |
| Mast beacon | Sphere radius 30 cm at 9.6 m | `mast` |
| Research tower | 7.0 m to the roof deck | `LANDMARKS.research.drums` |
| Hall wall | 16 m wide, 6.2 m tall | `hall` |
| Lab walls | 4 m tall | `lab` |

---

## 9. Lazy loading and the phone subset

Built at start (`buildIsland`):
- every building, sign, frame and rig;
- the skill-ring icons;
- the Poly Haven props;
- the lab arm;
- the two serial-link boards;
- the empty hardware showcase.

Picture textures load through `THREE.TextureLoader` as the frames are built.

The seventeen showcase models load late:

1. `go()` in `js/world.js` calls `island.visit(key)` whenever a place opens.
2. `visit("skills")` calls `showcase().load()`, which requests every slot once.
3. On a coarse pointer (`matchMedia("(pointer: coarse)")`, `coarseDevice` in
   `js/island.js`) it requests only the six files in `PHONE_SET`:
   - `boards/arduino-uno`
   - `boards/esp32-nodemcu`
   - `boards/raspberry-pi-5`
   - `sensors/hc-sr04-ultrasonic`
   - `sensors/pir-motion`
   - `sensors/dht11-temperature-humidity`
4. Stepping the close-up to a model that has not loaded calls `island.showHardware(i)`
   (`loadOne`), which requests just that model.

On disk the seventeen showcase GLBs total 10.2 MB. The phone set is 4.2 MB.

---

## 10. The layout check

`tools/checks/zones.mjs` imports `js/layout.js` under plain Node, with no browser and no
dependencies.

```bash
node tools/checks/zones.mjs
```

It prints:
- every door with its heading and the zones it stands in;
- the start point;
- the overlapping zone pairs;
- the collider and platform counts;
- `PASS: N checks` (exit code 0), or `FAIL` with a list of messages (exit code 1).

Today it reports 41 colliders (plus three workbench footprints), 10 platforms and
`PASS: 662 checks`.

The check keeps its own copy of the workbench contract, because `js/bench.js` needs three.js:

| Copy in the check | Value |
| --- | --- |
| `DESK` | 1.4 × 0.7 m at (-0.25, 0) |
| `TOWER` | 0.25 × 0.5 m at (-1.1, -0.1) |
| `CHAIR` | 0.6 × 0.6 m at (-0.45, 0.65) |
| `BENCH_ZONE` | `{ x: -0.35, z: 0.75, hw: 1.25, hd: 1.2 }` |
| `APPROACH` | (-0.45, 1.35), heading π |

For a walker of radius `PLAYER_RADIUS` (0.3 m), it asserts:

1. `ZONES.bench` and `SPAWNS.bench` equal `BENCH_ZONE` and `APPROACH`.
2. Every door:
   - is inside its own zone;
   - is at least 0.3 m from every campus collider and from the desk, tower and chair;
   - is within `ISLAND.walk − 0.3` of the centre;
   - stands at `heightAt` 0, not on a pad or floor;
   - resolves to its own place under the nearest-centre rule.
3. No zone overlaps the workbench zone. Overlaps between buildings are reported, not failed.
4. The start point is in no zone, at least 0.3 m from every collider and footprint, and
   inside the walkable edge.
5. No campus collider or platform overlaps the desk, tower or chair, no campus collider
   stands inside the workbench zone, and no raised floor runs under the desk or chair.
6. No planter or lamp centre is within `WALKWAY_CLEAR` (1.8 m) of any walkway segment.
7. Every landmark faces the plaza: the cosine between its +z and the direction to the centre
   is above 0.7.

It does not check:
- labels;
- whether a walkway ends at its pad;
- click hit boxes;
- building geometry against the island edge;
- campus colliders overlapping each other;
- anything built inside `js/island.js`.

---

## 11. Recipes

Follow the rules in [AGENTS.md](../AGENTS.md) and the [Handbook](HANDBOOK.md) throughout.
When you have finished, do not serve or test the site yourself. Give the owner the test
commands in [Testing and release](testing-and-release.md).

### Move something safely

1. Change the numbers in `js/layout.js` only. For a building, change its `site(x, z)` (the
   turn follows from `quarterTurn`); for grounds, edit `BUSES`, `LABELS`, `PLANTERS` or the
   angle list in `LAMPS`.
2. If you move a building, move its walkway end in `BUSES` to the new front edge of the pad
   and its label in `LABELS` if needed.
3. Run `node --check js/layout.js`.
4. Run `node tools/checks/zones.mjs`. Read the door list, then fix every failure it names
   (door inside a wall, planter on a walkway, zone overlapping the workbench) in
   `js/layout.js`.
5. If you change `BENCH.zone` or `BENCH.spawn`, update `BENCH_ZONE` and `APPROACH` in
   `tools/checks/zones.mjs` to match. `BENCH.spawn` must also equal the workbench's `approach`,
   which `js/bench.js` does not store as a value; it derives it as
   (`SEAT.x` × 0.1, `APPROACH_Z` × 0.1) in world metres, because `ROOT_SCALE` is 0.1. To move
   the workbench door, change `APPROACH_Z` (bench-local, 10 cm units), or `SEAT.x`, which also
   moves the chair and the seated pose. See [Workbench](workbench.md).

### Add a building

1. In `js/layout.js`, add a `LANDMARKS` entry with:
   - `...site(x, z)`;
   - `pad: [cx, cz, w, d]`;
   - `solids` (circles and rectangles in the landmark frame);
   - `floors` (rectangles with `top`, or `[]`);
   - any dimensions the builder will read.
2. Add the key to `ORDER` and a short name to `SHORT`. The loop builds its colliders,
   platforms, zone and door.
3. Add a walkway to `BUSES` from the plaza rim to the front edge of the pad and, if wanted, a
   `LABELS` entry. If the walkway leaves the plaza at a lamp angle, remove that angle from
   `LAMPS`.
4. In `js/island.js`, write a builder that starts `const { g, site } = landmark(scene, key)`,
   reads every dimension from `site`, pushes any animation into `updaters`, and returns
   `{ group, focus, dist, lift, hits }`, with `focus` in the group's own frame. Call it in
   `buildIsland` (as `const b = …`) and add a `places` entry by copying an existing line:
   `{ key, panel, anchor?, label, group: b.group, focus: toWorld(b), dist: b.dist, lift: b.lift, hits: b.hits }`.
   `toWorld` here is the local helper in `buildIsland` that turns `focus` into world
   coordinates. `group` is required: `buildIsland` derives the camera `dir` from
   `p.group.quaternion`. The order of `places` is the order the panel arrows step through.
5. In `index.html`, add a panel `<section>` with an `id` and `data-panel`, and a header link
   with `data-place="<key>"` if it should appear in the navigation. Every fact in the panel
   must trace to the sources listed in [Content and facts](content-and-facts.md).
6. Run `node tools/checks/zones.mjs` and fix any failure.

### Add a certificate

A certificate must be a real document the owner has provided (rule 3 in
[AGENTS.md](../AGENTS.md)).

1. Save two WebP files in `assets/certs/`, named in kebab-case with the year where known:
   - `<slug>.webp`, the thumbnail. Existing thumbnails are 280 or 560 px wide.
     `tools/assets/place.py` writes certificate thumbnails at 560 px (`THUMB_WIDTH`).
   - `<slug>-full.webp`, the full image for the viewer. `place.py` caps it at 4.2 megapixels
     (`MAX_PIXELS`).
   `place.py` only knows the IDs in its own map (C01 to C18). A new certificate needs a new
   entry there, and a row in [the asset map](ASSETS.md), which is the owner's document: ask
   the owner to add it.
2. In `index.html`, add a `<figure>` inside the first `.wall` in `#experience`, under the
   Certification heading (not `.wall--wide`, which holds event photos), by copying a neighbour. Set
   `width="280"` and `height` to 280 × (image height ÷ image width), and write real alt text
   and caption.
3. In `hall()` in `js/island.js`, add `[slug, 280, h, alt, TITLE, sub]` to `certs`. `w` and
   `h` only give the aspect ratio; `honour` fits the picture within 30 cm.
4. The rows rebalance themselves: the first `Math.ceil(n / 2)` frames go on the upper row,
   and the close-up distance follows the row length. A row spans
   `(PER_ROW − 1) × 0.6 + 0.36` m on a 16 m wall. No layout numbers change, so the zones
   check is unaffected.

### Add a hardware model

1. Convert the source with `tools/models/convert.mjs`, following
   [Assets and pipelines, section 6](assets-and-pipelines.md#6-hardware-converter-toolsmodelsconvertmjs)
   (where to run it from and which install to use are in its section 4). In short:
   - The extracted sources are in `data/raw/<source-folder>/`.
   - With the install in `tools/models`, the command is
     `node convert.mjs ../../data/raw ../../assets/models <source-folder>`, where
     `<source-folder>` is the folder name (for example `nodemcu-esp32`), not the output id.
   - A new model needs new entries in the `CATEGORY` and `NICE` constants in
     `tools/models/convert.mjs`; folders not in `CATEGORY` are skipped silently.
   - Never commit `3d models/`.
2. Find the real board's longest side in metres. That is `size`.
3. Add `{ file: "<category>/<id>", label, size }` to a row of `HARDWARE` in `js/island.js`.
   Add `turn: [x, y, z]` if the component side is not up, or `upright: true` for a sensor
   that stands facing the room. A row shares 2.28 m of shelf, so a long row narrows every
   slot.
4. To load it on phones too, add its `file` to `PHONE_SET`.
5. Nothing else is needed. The close-up stops and the "N boards and sensors" count come from
   `HARDWARE`. Keep the model matte, and never model or restyle a vendor logo.

---

## 12. Open issues

All verified against the current code.

1. **Stale overlap comment.** The comment in `checkZones` in `js/world.js` names stage and lab
   as an overlapping pair; the check reports `stage/mast`. Its other pair, research and
   toolchain (`research/shed`), is correct.
2. **Layout constants copied by hand.** Three values in `js/layout.js` are not read by the
   runtime code that uses them, so each must be changed by hand in both places:
   - `createPlayer` in `js/player.js` defaults `bound = 21.5`, and `js/world.js` does not pass
     `ISLAND.walk`. Changing `ISLAND.walk` moves the edge the check uses, but not the edge the
     hacker is held to.
   - `js/player.js` pushes the walker out of colliders with its own `RADIUS = 0.3`, not
     `PLAYER_RADIUS`, which the check uses.
   - `js/bench.js` keeps its own `GROUND = -1.4`, so changing `GROUND` in `js/layout.js`
     separates the workbench from the campus.
3. **The workbench contract is copied by hand.** `tools/checks/zones.mjs` keeps its own desk,
   tower, chair, zone and approach.
   - `makeColliders` in `js/bench.js` gives the tower a 0.205 × 0.425 m footprint; the check
     uses 0.25 × 0.5 m, which is stricter.
   - `js/bench.js` leaves the chair out of the walk colliders; the check treats it as
     blocking.
   A change in `js/bench.js` is not caught unless the copy is updated.
4. **Planter corners.** A planter's collider is a circle of radius 0.95 m, but its concrete box
   is 1.5 m square, with corners 1.06 m from the centre. The hacker can clip a corner by
   about 11 cm.
5. **Showcase front.** The skills collider for the backdrop and showcase ends at local
   z -4.4, while the showcase front is at z -4.375, 2.5 cm further out.
6. **Showcase size comment.** The comment above `HARDWARE` gives the models as about 12 MB
   together; the files on disk total 10.2 MB.
7. **Stale file references elsewhere.**
   - `docs/ASSETS.md` says `place.py` writes `.jpg`; the script writes `.webp`.
   - The `source` field in `assets/models/catalog.json` names `data/tools/convert.mjs`; the
     script is `tools/models/convert.mjs`. The string is hard-coded as `catalog.source` in
     `tools/models/convert.mjs` and rewritten on every run, so it must be corrected in the
     script, not in `catalog.json`.
   `docs/ASSETS.md` is the owner's document, so its error is noted here rather than changed.
