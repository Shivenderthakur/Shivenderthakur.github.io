# World and controls

This document covers how a reader moves around the campus and the interface drawn over it. That
includes the controls, player movement, camera modes, entry zones and panels, hash routing,
sitting at the workbench, the armctl console, the HUD, the gallery viewer, the hardware close-up,
reduced motion and phone behaviour, and the `?debug` hook. Read it before you change `js/world.js`,
`js/player.js`, `js/hud.js`, or the overlay markup and styles in `index.html` and `css/styles.css`.
The arm's internals are in [Workbench](workbench.md) and every campus position is in
[Campus](campus.md). Rigging and animation clips are in [Character](character.md).

World units are metres, angles are radians, and screen distances are CSS pixels. Ground
coordinates are written (x, z), with the ground plane at `GROUND = -1.4` (`js/layout.js`). The
compass treats -z as north.

## Contents

1. [Where the code lives](#where-the-code-lives)
2. [Modes, states and body classes](#modes-states-and-body-classes)
3. [Controls reference](#controls-reference)
4. [Player movement](#player-movement)
5. [Camera](#camera)
6. [Entry zones, doors and panels](#entry-zones-doors-and-panels)
7. [Hash routing and deep links](#hash-routing-and-deep-links)
8. [Sitting down and standing up](#sitting-down-and-standing-up)
9. [Working from the chair](#working-from-the-chair)
10. [HUD](#hud)
11. [Gallery viewer](#gallery-viewer)
12. [Hardware close-up](#hardware-close-up)
13. [Reduced motion](#reduced-motion)
14. [Touch devices and narrow screens](#touch-devices-and-narrow-screens)
15. [The ?debug hook](#the-debug-hook)
16. [Known limitations](#known-limitations)

## Where the code lives

| File | Responsibility for this topic |
| --- | --- |
| `js/world.js` | Boot, input (keys, pointer, wheel, pinch), camera, zone checks, panels, hash routing, seat sync, close-up, gallery viewer, arm tuning form, `?debug` hook, frame loop. |
| `js/player.js` | `createPlayer`: walking, gait clips, collisions, floors, the walk to the chair, sitting, standing, pointing, teleport. Also exports `inRect` and `route`. |
| `js/hud.js` | `createHud`: compass, radar, objective line, thumb stick, seat bar, armctl console input and log. |
| `js/layout.js` | Zones (`ZONES`), doors (`SPAWNS`), colliders, platforms, `START`, `ORDER`, `SHORT`. See [Campus](campus.md). |
| `js/island.js` | `buildIsland` returns `places` (one per building, with `zone`, `spawn`, `panel`, `anchor`, `label`, `short`, `hits`), `frames`, `skillItems`, `hardwareStops`, `showHardware`, `visit`, `setActive`. |
| `index.html` | Masthead nav, `#hud`, `#stick`, `#closeup`, `#seat` with the console, the intro card `#bench`, the readout and `#rig` form, `[data-panel]` sections, `#panel-bar`, `#viewer` dialog. |
| `css/styles.css` | Overlay placement, the 61.99rem breakpoint, state classes, reduced-motion rules. See [Styling](styling.md). |

The page loads one script, `js/world.js`, as a module (the last `<script>` in `index.html`). If
`boot()` throws, `fail()` adds `no-world` to `<body>`. The stylesheet then shows the ordinary
stacked page and hides the world overlays.

## Modes, states and body classes

`js/world.js` keeps a module-level `mode`:

| `mode` | Meaning | Entered by |
| --- | --- | --- |
| `intro` | The camera circles the hacker behind the intro card. Walking and zone checks are off. | Page load; clicking the wordmark. |
| `play` | The reader walks. | `enterPlay()`: the "Enter the campus" button (`#explore`), any movement key, or any call to `go()` (header link, tap on a building, hash). |

`player.state` (in `js/player.js`) is one of the following:

| State | Meaning |
| --- | --- |
| `walk` | Free movement under input. |
| `approach` | Walking the routed path to the spot behind the chair. |
| `sitting-down` | Scripted move from that spot onto the seat. |
| `seated` | In the chair. |
| `standing-up` | Scripted move from the seat back to the spot. |

Two helpers in `world.js` group these states. `atDesk()` is true for `approach`, `sitting-down`
and `seated`. `seatView()` is true for `sitting-down` and `seated`, and selects the seated camera.

These classes and attributes on `<body>` drive the overlay styles:

| Class or attribute | Set by | Effect in `css/styles.css` |
| --- | --- | --- |
| `is-exploring` | `enterPlay()`; removed by the wordmark | Hides the intro card text and removes its clip path. |
| `is-focused` | `go()`; removed by `closePanel()` | Hides the objective and controls line; on narrow screens also hides the radar and stick. |
| `data-place="<key>"` | `go()`; removed by `closePanel()` | `bench` shows the readout and `#rig`; `skills` shows `#closeup`. |
| `is-seated` | `syncSeat()` while `player.state === "seated"` | Hides compass, radar, objective, controls, place label and stick; shows readout and `#rig`. |
| `is-closeup` | `renderCloseup()` | No rule selects it (see [Known limitations](#known-limitations)). |
| `no-world` | `fail()` | Falls back to the ordinary page. |

## Controls reference

### Keyboard (window `keydown` in `bindKeys`)

| Key | Standing, `play` | Seated or walking to the chair | Hardware close-up |
| --- | --- | --- | --- |
| `W` / `ArrowUp` | Walk forward (camera-relative) | A fresh press (not `e.repeat`) stands up | No walking |
| `S` / `ArrowDown` | Walk back | Stands up, as above | No walking |
| `A` | Walk left | Stands up, as above | No effect (no walking) |
| `ArrowLeft` | Walk left | Stands up, as above | Previous model |
| `D` | Walk right | Stands up, as above | No effect (no walking) |
| `ArrowRight` | Walk right | Stands up, as above | Next model |
| `Shift` (held) | Run | None | None |
| `Escape` | Closes the open panel | Closes the open About panel first; the next press stands up | Leaves the close-up |
| Any movement key in `intro` | Enters `play` and starts walking | n/a | n/a |

The movement map is the constant `MOVE`. Key names are lower-cased, so Shift with a letter still
matches. `keyup` removes a key, and window `blur`, focus entering an `input`, `textarea` or
`select`, and opening the viewer each clear all held keys.

Focus changes which keys reach the world:

| Focus | Behaviour |
| --- | --- |
| Text field (including `#console-input`), `textarea`, `select`, `[contenteditable]` | The world ignores every key. |
| `input` of type range, checkbox, radio, button, submit, reset or color (`CONTROL_INPUTS`) | Arrow keys go to the control. `Escape` blurs it and then acts as usual. Letters still walk. |
| Anything inside a `.panel` | Arrow keys scroll the panel. Letters still walk. |
| `#viewer` open | The world handler returns at once, and walking is paused in `frame()`. |

### Pointer on the canvas (`bindPointer`)

The canvas has `touch-action: none` and captures each pointer. In the table, drag, wheel and pinch
use the seated values whenever `seatView()` is true. Tap, hover and grabbing the block need
`player.state === "seated"`.

| Gesture | Standing | Seated |
| --- | --- | --- |
| Drag with one pointer | `cam.yaw -= dx × 0.0055`; `cam.pitch += dy × 0.0042`, clamped to [-0.08, 1.15] | `seatCam.yaw -= dx × 0.0035`, clamped to ±0.45; `seatCam.pitch += dy × 0.0028`, clamped to [-0.22, 0.4] |
| Drag starting on the block or its ring | n/a | Forwarded to `bench.pointerDown/Move/Up` (see [Workbench](workbench.md)) |
| Wheel | Distance × (1 + sign(deltaY) × 0.08), clamped to [1.8, 9] m | Zoom × (1 + sign(deltaY) × 0.06), clamped to [0.7, 1.45] |
| Two-finger pinch | Distance × (previous span / new span), same clamp | Zoom × (previous span / new span), same clamp |
| Tap (total travel under 8 px, not `pointercancel`) | Picks the nearest hit among frames, skill items and building hit boxes | First tries the desk (see [Working from the chair](#working-from-the-chair)); if the ray misses the desk, picks as when standing |
| Hover (fine pointers only, at most every 90 ms) | Cursor `pointer` over a pickable, else `grab`; `#place-label` shows the hit | Cursor `grab` over the block or ring, `crosshair` over a desk spot, else `default` |

A tap on a pick does the following:

| Hit | Result |
| --- | --- |
| Framed picture | Opens the viewer on every frame with the same parent object (the same wall). |
| Skill item | Shows its label in `#place-label`. |
| Building hit box | `go(key, { teleport: true })`, unless that place is already open, or it is the workbench while `atDesk()`. |

When a second finger lands during a hold on the block, `letGo()` ends the hold. It sends 9 px of
travel and `pointerUp(..., { cancel: true })` from the last seen position, so the bench does not
read the release as a tap.

### Thumb stick (touch only)

`createHud` shows `#stick` only when `(pointer: coarse)` matches:
- **Radius:** half the stick's rendered width, 7.5rem in the stylesheet, measured on each `pointerdown`.
- **Output:** `stick.x` points right and `stick.y` points up, both from -1 to 1. The knob is clamped to the rim.
- **Priority:** while the stick is active, it replaces the keyboard direction in `inputVector()`.
- **Running:** a deflection above 0.85 runs.
- **Analogue speed:** a partial deflection walks more slowly, because the walk speed scales with the input length.

### Buttons and links

| Control | Action |
| --- | --- |
| Masthead nav links (`[data-place]`) | `go(place, { teleport: true })`. The default navigation is prevented. |
| Wordmark (`.wordmark`) | Closes the panel, stands up instantly if at the desk, returns to `intro`, hides the HUD. |
| `#explore` "Enter the campus" | `enterPlay()` and focuses the canvas. |
| `#panel-prev`, `#panel-next` | Previous or next place in `island.places` order, wrapping, with teleport. |
| `#panel-close` | `closePanel()` (counts as a dismissal). |
| `#seat-stand` "Stand up" | `standUp()`. |
| `#seat-about` "About" | Toggles the workbench panel (`#about`) without moving the hacker. |
| `#closeup-enter`, `#closeup-prev`, `#closeup-next`, `#closeup-exit` | Hardware close-up (see [Hardware close-up](#hardware-close-up)). |

## Player movement

All values are constants in `js/player.js` unless stated otherwise.

| Quantity | Value | Name |
| --- | --- | --- |
| Walk speed | 1.6 m/s | `WALK` |
| Run speed | 4.5 m/s | `RUN` |
| Body radius for collisions | 0.3 m | `RADIUS` (`PLAYER_RADIUS` in `layout.js` holds the same value) |
| Speed response | `damp(9, dt)` towards `push × (RUN or WALK)` | `walk()` |
| Turn response | `damp(11, dt)` towards the input direction | `walk()` |
| Walk bound | Position clamped to 21.5 m from (0, 0) | `createPlayer` parameter `bound = 21.5` |
| Start | (0, 4.2), heading π (facing -z, towards the workbench), in no zone | `START` in `layout.js` |
| Frame step | `dt` capped at 0.05 s for the player, 0.25 s for the camera | `frame()` in `world.js` |

`damp(k, dt)` is `1 - exp(-k × dt)` in both files. A heading `h` faces the ground direction
(sin h, cos h).

**Input direction.** `inputVector()` in `world.js` turns forward and right input into a ground
vector relative to `cam.yaw`. It normalises the vector when longer than 1 and returns `true` for
running (Shift held, or stick deflection above 0.85).

**Gait and clip rate.** `gaitClip()` picks the clip from the commanded speed (`speed`, eased
towards the input in `walk()`), which collisions do not reduce: `stride()` moves the body by
`speed × dt` and then calls `collide()`, but never recomputes `speed` from the displacement. It then
sets the clip's `timeScale` so the planted foot moves at that speed. Walking into a wall therefore
plays the Walk clip at full rate while the body stands still. The per-clip ground speeds come
from `assets/models/character/hacker.json`, which `tools/character/rig.py` writes.
`createPlayer` fetches that file. It keeps each of `walkSpeed`, `runSpeed`, `seatHeight` and
`keyboardReach` only when finite and positive, and otherwise uses `FALLBACK`, which holds the
same numbers.

| Speed | Clip | `timeScale` | Value at full speed |
| --- | --- | --- | --- |
| below 0.25 m/s | `Idle` | 1 | n/a |
| 0.25 to below 3.05 m/s (`(WALK + RUN) / 2`) | `Walk` | `speed / meta.walkSpeed`, clamped to [0.35, 2.2] | 1.6 / 1.1591 = 1.38 |
| 3.05 m/s and above | `Run` | `speed / meta.runSpeed`, clamped to [0.5, 2] | 4.5 / 3.1298 = 1.44 |

`player.js` does not use `keyboardReach` or `clipSeconds`.

**Collisions.** `collide()` makes two passes over every collider:
- **Circles** `{ x, z, r }`: the body is pushed out to `r + 0.3`.
- **Oriented rectangles** `{ x, z, hw, hd, c, s }`: the body is pushed to 0.3 m from the nearest point. If its centre is inside, it leaves along the shallower axis.
- **Bound:** after both passes, the position is clamped to the walk bound.

`world.js` passes the campus colliders from `island.colliders` together with the desk and tower
colliders from `bench.colliders` (`makeColliders()` in `js/bench.js`). The chair has no collider,
so the body can reach the seat. `tools/checks/zones.mjs` keeps its own chair footprint (`CHAIR`),
used only for its layout overlap checks. The camera has no collision.

**Floors.** Each step sets the target height to `GROUND + heightAt(x, z)`, the highest platform
top under the point (`heightAt` in `layout.js`). `pos.y` eases towards it with `damp(16, dt)`.
There is no step-height limit: anything the body must not climb is a collider rather than a
platform.

**Contact shadow.** A black disc 0.42 m in radius at 35 % opacity follows the body 2 cm above the
floor.

## Camera

`camera` is a `PerspectiveCamera` with near 0.02 m and far 400 m. `resize()` sets the vertical
field of view to `clamp(50 + (1.3 - aspect) × 12, 50, 66)` degrees. In the rows below, "narrow"
means `window.innerWidth < 992`, which matches the stylesheet breakpoint `max-width: 61.99rem`.

`desired(t)` computes `wantEye` and `wantTarget` from the first matching case below.
`moveCamera()` then eases towards them:

| Case | Eye factor | Target factor |
| --- | --- | --- |
| Normal | `damp(10, dt)` | `damp(14, dt)` |
| Slow (`intro`, close-up, or within a blend window) | `damp(2.6, dt)` | `damp(2.6, dt)` |
| Reduced motion, when slow or just teleported (`jumped`) | Cut: copied directly | Cut: copied directly |

`cam.dist` and `seatCam.zoom` ease to their wanted values with `damp(8, dt)`.

### Intro

- **Target:** 1.1 m above the hacker's feet.
- **Eye:** on a circle of radius 4.5 m, 1.75 m above the feet, at angle `t × 0.08 + start.heading + 0.5`, where `t` is page time in seconds. With reduced motion the time term is 0, so the camera holds still.
- **Offset on wide screens:** eye and target shift 1.45 m to the camera's left (`shiftRight(-1.45)`), which places the hacker right of centre, clear of the intro card.

### Standing third person

The parameters are in `STAND = { dist: 3.6, near: 1.8, far: 9, look: 1.5, pitch: 0.32 }`.
- **Target:** 1.5 m above the feet.
- **Eye:** placed from `cam.yaw`, `cam.pitch` and `cam.dist`, and never lower than `GROUND + 0.25`.
- **Distance limits:** 1.8 m to 9 m for the wheel and pinch.
- **Pitch limits:** -0.08 to 1.15 for dragging.
- **With a panel open, wide screens:** eye and target shift right by `cam.dist × 0.34`, which keeps the hacker left of the panel.
- **With a panel open, narrow screens:** eye and target drop by `cam.dist × 0.3`, which keeps the hacker above the bottom sheet.
- **Swing behind:** `cam.yaw` turns towards `player.heading + π` at `damp(1.3, dt)`, scaled by `min(1, speed / 1.6)`. It runs only when every condition below holds:
  - reduced motion is off;
  - `mode` is `play`;
  - no close-up is showing;
  - `player.state` is `walk`;
  - `player.speed` is above 0.3 m/s (the commanded speed, so this also holds while walking into a wall);
  - the last drag was more than 1.6 s ago.

### Seated over the shoulder

The parameters are in `SEAT_VIEW = { yaw: 0.28, pitch: 0.38, dist: 1.7, phoneYaw: 0.16,
phonePitch: 0.55, width: 0.62 }` and `SEAT_NUDGE = { yaw: 0.45, pitchLo: -0.22, pitchHi: 0.4,
zoomLo: 0.7, zoomHi: 1.45 }`. `seatedView()` builds the view from `bench.seat` (position and
heading of the chair):

- **Framed point:** 0.72 m ahead of the seat and 0.15 m to the operator's right, at height `GROUND + 0.95` (0.2 m above the 0.75 m desk top).
- **Eye direction:** behind the operator, swung to the right by yaw (0.28, or 0.16 when narrow) and lifted by pitch (0.38, or 0.55 when narrow). A drag adds `seatCam.yaw` and `seatCam.pitch`.
- **Distance:** `max(1.7, fit) × seatCam.zoom`, where `fit = 0.62 / (tan(fov / 2) × max(aspect, 0.3))`. On a tall screen this stands the eye back until 0.62 m either side of the framed point (1.24 m across) fits in the view.
- **Offsets:**

  | Situation | Offset |
  | --- | --- |
  | About panel open, wide | Shift right by `dist × 0.22` |
  | About panel open, narrow | Drop by `dist × 0.3` |
  | No panel, narrow | Drop by `dist × 0.12` |
  | No panel, wide | Shift left by `dist × 0.06` |

- **Eye floor:** `GROUND + 0.3`.

`syncSeat()` resets `seatCam` to zero yaw and pitch and zoom 1 whenever a sit begins.

### Blends and shadows on sitting and standing

`syncSeat()` runs every frame and acts only when `player.state` changes:

| Transition | Camera | Shadow span (`shadowSpan`) |
| --- | --- | --- |
| Enters `sitting-down`, or `seated` without passing through it (instant sit) | Blend window 1.6 s | Half-width 3.2 m |
| Enters `standing-up`, or `walk` straight from a seat (instant stand, teleport) | `cam.yaw = heading + π`, pitch 0.32, distance 3.6; blend window 1.4 s | Half-width 30 m |

Each frame also calls `composer.aoSpan(closeup >= 0 || seatView())`, which switches the ambient
occlusion radius. See [Architecture](architecture.md) for rendering.

### Hardware close-up

When `closeup >= 0`, the eye is `focus + dir × dist`, raised by `lift`, and looks at `focus`.
These values come from `island.hardwareStops()[closeup]`:

| Model mounting | `dist` | `lift` |
| --- | --- | --- |
| Upright | `clamp(size × 5.5, 0.18, 0.3)` m | `dist × 0.12` |
| On an angled stand | `clamp(size × 3, 0.2, 0.35)` m | `dist × 0.5` |

On narrow screens `dist` grows by 25 % and eye and target drop by `dist × 0.2`. On wide screens
both shift right by `dist × 0.3`.

## Entry zones, doors and panels

Each place in `island.places` has the following fields. Zone and door geometry are defined in
[Campus](campus.md).

| Field | Content |
| --- | --- |
| `zone` | An oriented rectangle from `layout.js` `ZONES`. |
| `spawn` | The door, from `SPAWNS`: position and heading facing the building. |
| `panel` | CSS selector of its `[data-panel]` section. |
| `anchor` | Optional entry to scroll to. |
| `label` | Name shown in the HUD. |
| `short` | Compass name, from `SHORT`. |

| Key (`ORDER`) | Panel | Anchor | Label | Compass |
| --- | --- | --- | --- | --- |
| `bench` | `#about` | none | The workbench | Workbench |
| `research` | `#research` | none | Research tower | Research |
| `stage` | `#work` | `#work-robonari` | Bheenmal stage | Stage |
| `lab` | `#work` | `#work-attendance` | Robotics lab | Lab |
| `hall` | `#experience` | none | Credentials hall | Credentials |
| `skills` | `#stack` | none | Skills lab | Skills |
| `shed` | `#toolchain` | none | Toolchain | Toolchain |
| `mast` | `#contact` | none | Say hello | Contact |

The masthead has no link for `lab`. Its Work link opens `stage`. The reader reaches the lab by
walking, by tapping it, with the panel arrows, or through `#work-attendance`.

**Door rings.** Each door has a flat ring, radius 0.42 m to 0.5 m, 8 cm above the floor. It
pulses in cyan, and turns steady amber for the place `island.setActive()` names (the open panel,
or the workbench while at the desk).

### Zone check (`checkZones`)

`checkZones` runs every frame, but only in `play`, with no close-up, and while `player.state` is
`walk`:

1. Collect every place whose zone contains the hacker's (x, z).
2. Where several zones contain the point, take the one whose zone centre is nearest.
3. If a place was dismissed and the chosen place (step 2) is not that place, or there is none, clear the dismissal. In an overlap this can happen while the hacker is still inside the dismissed zone.
4. If the winner is `bench`: close any other open panel (as a walk-out), then call `sitDown()` unless `bench` is dismissed. The workbench never opens its panel on entry.
5. Otherwise, if the winner is not the open place and is not dismissed, `go(key)` opens it.
6. If no zone contains the hacker and a panel is open, close it as a walk-out.

A computation from `layout.js` (Node, 15 September 2026) finds these overlaps:

| Pair | Overlap |
| --- | --- |
| `research` and `shed` | 2.55 m × 3.25 m, about 8.3 m², at x from -11.25 to -8.7 and z from -14.25 to -11 |
| `stage` and `mast` | 0.45 m × 0.25 m, about 0.11 m², at x from 10.8 to 11.25 and z from -12.25 to -12 |
| `stage` and `lab` | Only the edge z = 0.25 |

`tools/checks/zones.mjs` asserts that each door is inside its own zone and resolves to its own
place under the nearest-centre rule, so a teleport keeps its panel open. It does not assert that a
door lies in no other zone; it only prints the zones each door is in (on 15 September 2026 every
door is in its own zone alone). After changing `ZONES`, `SPAWNS` or the workbench door in
`js/layout.js`, run it under plain Node from the repository root:

1. `node tools/checks/zones.mjs`
2. Read the last line: `PASS: <n> checks`, or `FAIL: ...` followed by the failed checks and exit code 1.

### Opening (`go`)

`go(key, { replace, teleport, hash })`:

1. Calls `enterPlay()`.
2. With `teleport`, handles the move and then sets `jumped`:
   - **Workbench:** `sitDown({ instant: true })` puts the hacker straight in the chair.
   - **Any other place, or if the instant sit fails:** `player.teleport(spawn)` sets state `walk`, pushes the body out of colliders, and sets `cam.yaw = spawn.heading + π` and pitch 0.32, so the camera looks at the building from behind the hacker.
3. Clears any dismissal and sets `current`. A different place also ends any close-up.
4. Calls `island.visit(key)`. For `skills` this starts loading the hardware models.
5. Sets `is-focused` and `data-place` on `<body>`, adds `is-open` to the matching `[data-panel]` and removes it from the others, and unhides `#panel-bar`.
6. When the panel was not already open, or a `hash` is given, scrolls the panel so the anchor's (the `hash`, else `place.anchor`) top sits 8 px above the panel's content start, that is, the panel's top padding minus 8 px from its top edge (`anchorTop`). Without an anchor it scrolls to the top.
7. Sets `aria-current="page"` on every `[data-place]` element for this place and removes it from the others. This matches the masthead links and also `<body>`, whose `data-place` was set in step 5 (see [Known limitations](#known-limitations)).
8. Writes the address `hash || place.anchor || place.panel` with `history.pushState`, or `replaceState` when `replace` is set, keeping the path and query string.
9. Puts the label in `#place-label`, refreshes the HUD place and the About button state, and redraws the close-up bar.

**Panel layout.** On wide screens a panel is fixed to the right edge, `min(36rem, 100vw)` wide,
sliding in over 520 ms. On narrow screens it is a bottom sheet 58vh tall. `#panel-bar` sits at the
bottom of the panel.

### Closing (`closePanel`) and dismissal

`closePanel({ fromWalk })` does the following:
- Clears `current`, the close-up, `is-focused`, `data-place`, `is-open`, the masthead links' `aria-current` and the label.
- Hides `#panel-bar`.
- If the address has a hash, pushes the bare path and query string.

Without `fromWalk`, it sets `dismissed` to the place's key. This happens for the Close button,
Escape and the About toggle. A dismissed place does not reopen while `checkZones` keeps choosing it.
The dismissal clears as soon as another place, or no place, is chosen: normally on walking out of
the zone, but in an overlap also while still inside it (step 3 of [Zone check](#zone-check-checkzones)). `standUp()` sets `dismissed = "bench"` for the same
reason.

## Hash routing and deep links

`bindPanels()` calls `fromHash()` once at boot and on every `popstate`.

| Address | Result |
| --- | --- |
| empty, `#top`, `#bench` | Closes any open panel as a walk-out. |
| `#about` | Workbench: the hacker sits instantly and the About panel opens. |
| An `anchor` (`#work-robonari`, `#work-attendance`) | That place, with teleport; the address is replaced. |
| A `panel` (`#research`, `#work`, `#experience`, `#stack`, `#toolchain`, `#contact`) | The first place with that panel (`#work` gives `stage`), with teleport. The address is replaced with the place's anchor if it has one. |
| Any other id inside a `[data-panel]` section, for example `#work-kinelink` | The first place owning that panel, with teleport. The panel scrolls to the element and the address stays as given. |
| Any other value that is a valid selector and matches nothing inside a panel | No change. |
| A value that is not a valid CSS selector (for example `#2024`, or a percent-encoded non-ASCII fragment) | `document.querySelector` throws a `SyntaxError`. At load this switches the page to the `no-world` fallback; on `popstate` the handler throws. See [Known limitations](#known-limitations). |

Anchors are matched before panels. The query string (for example `?debug`) survives every
address change.

## Sitting down and standing up

The seat and approach spot come from the bench:
- **`bench.seat`:** position, heading π and seat height.
- **`bench.approach`:** the spot behind the chair, (-0.45, 1.35) m, heading π. The value is held in three places, which must change together:
  - `js/bench.js`: built as (`SEAT.x × ROOT_SCALE`, `APPROACH_Z × ROOT_SCALE`) = (-4.5 × 0.1, 13.5 × 0.1);
  - `js/layout.js`: `BENCH.spawn`, the workbench door (`SPAWNS.bench`);
  - `tools/checks/zones.mjs`: its own copy, `APPROACH`.

  `zones.mjs` cannot import `bench.js` (it needs three.js), so it only compares `SPAWNS.bench` with its `APPROACH` copy. A change to `SEAT.x` or `APPROACH_Z` in `bench.js` alone passes the check.

### Sitting (walking in)

1. `checkZones` sees the workbench zone and calls `player.sit(seat, approach)`. This only works from `walk`.
2. `route()` finds the path to the approach spot. It takes a straight line when clear, otherwise the shortest chain through the corners of nearby colliders grown by the body radius. State becomes `approach`.
3. `approach()` walks the path at up to 1.6 m/s, slowing within the last 0.6 m and while still turning. If it takes longer than 8 s, it places the body on the spot.
4. `beginSit()` takes one short step using the Walk clip at a reduced rate. State becomes `sitting-down`.
5. `sittingDown()` runs for `SIT_TIME = 1.35` s:

   | Share of the time | What changes |
   | --- | --- |
   | First 70 % | Position eases to the seat |
   | First 45 % | Heading eases to the seat heading |
   | From 40 % | Crossfade to the seated clip |
   | 100 % | State becomes `seated` |

6. The first time the hacker is seated, the console prints `armctl console. Type help for the commands.`

The seated clip is `SitType` while the reader is typing, otherwise `Sit`. `world.js` calls
`player.setTyping(seated && typingNow())` every frame. `typingNow()` is true under any of these
conditions:
- the console input has focus;
- less than 1.6 s has passed since the last order from the console or a tap;
- `bench.busy()` is true and less than 15 s has passed since that order.

**Instant sit.** `player.sit(..., { instant: true })` places the body in the chair at once. It is
used by the masthead Workbench link, a tap on the workbench, the panel arrows and `#about`.

### Standing up

The reader stands up in any of these ways:
- presses Stand up;
- presses Escape with no panel open;
- makes a fresh press of a movement key;
- clicks the wordmark, which stands up instantly.

`standUp()` calls `player.standUp()` and sets `dismissed = "bench"`, so the chair does not pull
the hacker back until they leave the workbench zone. `player.standUp()` then acts on the current
state:

| State | Result |
| --- | --- |
| `approach` | Stops walking to the chair and returns to `walk`. |
| `sitting-down` or `seated` | `beginStand()`, then `standingUp()` runs for `STAND_TIME = 1.15` s (see below). |
| `sitting-down` or `seated`, with `{ instant: true }` | Puts the body on the approach spot at once. |
| `walk` or `standing-up` | Nothing. |

During `standingUp()`, the Walk clip plays backwards at rate -0.5. Position eases from 15 % of
the time, heading eases to the approach heading, Idle fades in after 80 %, and the state returns
to `walk`.

A teleport to another building from the chair sets `walk` directly, with no stand-up motion.

## Working from the chair

The arm's behaviour, limits and command semantics are in [Workbench](workbench.md). This section
covers only the input and interface side.

### Tap to point and place

When `player.state === "seated"` and no close-up is showing, a tap calls `aimTap(e)`:

1. `bench.aimFromNdc(x, y)` casts the ray to the pedestal top or the desk top. The monitors, tower and chair block it. A miss returns `null`; `aimTap` then returns `false`, and the tap falls through to normal picking.
2. `bench.placeAt(spot)` returns `{ accepted, target, reason, line }`.
3. `player.point(target or spot)` raises the hacker's right arm at the spot. The right arm and the head turn towards it, eased in over 0.3 s, held until 2.4 s and eased out over 0.45 s (`POINT_IN`, `POINT_HOLD`, `POINT_OUT`). The chest mostly stays put: `aimTap` sets `commandAt`, so `typingNow()` is true for at least 1.6 s (longer while `bench.busy()`), the seated clip becomes `SitType`, and the chest turn and the `PointChest` layer are scaled by `aim.free`, which eases towards 0 while `SitType` plays. Standing, the body first turns to face the spot. The layering is covered in [Character](character.md).
4. The console prints lines in centimetres relative to the arm base (`bench.root.position`):
   - always: `armctl> <line>`, or `armctl> place <x> <z>` when the bench gives no line;
   - if accepted: `ok, block to x <x> z <z> cm`, followed by the reason if one is given;
   - if refused: `refused: <reason>`.

### Dragging the block

When seated with no close-up, `pointerdown` asks `bench.pointerDown`:

| Return value | Meaning | What happens |
| --- | --- | --- |
| `free` | The block itself | Moves and the release go to the bench. |
| `depth` | The ring above the block | Moves and the release go to the bench. |
| `none` | Neither | The drag leans the seated view instead. |

### armctl console

`#seat` is shown only while seated (`hud.setSeated`). It holds:

- **Seat bar:** the hint `#seat-hint`, the About button (its `aria-pressed` tracks whether the workbench panel is open) and Stand up.
  - Fine pointers see: "Click the desk to point, the arm places the block there, or type help".
  - Coarse pointers see: "Tap the desk to point, the arm places the block there, or type help".
- **Console head:** `armctl` and the command names `help, status, place, home, reach, set, reset`. It is hidden on narrow screens.
- **Log:** `#console-log`, an `<ol role="log" aria-live="polite">`.
  - `hud.print(lines, kind)` appends one `<li class="console__row console__row--<kind>">` per line.
  - The kinds are `cmd`, `out` and `err`.
  - It keeps at most 80 rows and scrolls to the bottom.
- **Prompt line:** `#console-form` with `#console-input`.

On submit, `hud.js` does the following:
1. Trims the line and ignores it if empty.
2. Stores it in a history of up to 40 lines, skipping a line identical to the previous one.
3. Calls the command handler.

`world.js` prints `armctl> <line>` as `cmd`, passes the line to `bench.command(line)`, and prints
the returned `lines` as `out` when `ok` and `err` otherwise. An exception prints
`error: <message>`. The arm also reports finished orders through the `onLine` callback, printed as
`out`.

The `help` reply lists these commands (units are centimetres from the arm base):

| Command | Purpose |
| --- | --- |
| `help` | This list |
| `status` | State, claw and where the block is |
| `place <x> <z> [h]` | Move the block: x right, z towards you, h up |
| `home` | Put the block back on the pedestal |
| `reach` | How far the arm reaches as set |
| `set <base\|l1\|l2\|claw> <cm>` | Change one link, for example `set l1 12` |
| `reset` | Default links, block home |

A leading `armctl` word is accepted and ignored.

Keys inside the input:

| Key | Action |
| --- | --- |
| `Enter` | Submit |
| `ArrowUp` / `ArrowDown` | Step through the history |
| `Escape` | Blur the input; the next Escape reaches the world |

**Phone keyboard.** `hud.js` listens to `visualViewport` resize and scroll and sets the CSS
variable `--kb` on `#seat` to the covered height. The seat's `bottom` adds it, which lifts the
console above an on-screen keyboard.

On narrow screens the input uses 16 px text, which stops phone browsers zooming. The log is
4.4rem tall and grows to 9.5rem while the console has focus. When `#rig` is open while seated and
no panel is open, `#rig` becomes a bottom sheet and the console is hidden (`:has(#rig[open])`).

### Readout and tuning panel

The readout (`#j1` to `#j4`, `#claw`, `#hgt`, `#mode`) and `#rig` "Tune the arm" are visible when
`data-place="bench"` or `is-seated`. `bindRig()` does the following:
- Opens `#rig` at boot on fine pointers when the window is at least 992 px wide.
- Sets each slider's range from `bench.LIMITS` × 10 in centimetres, with step 0.1.
- Redraws the sliders and stats whenever `set` or `reset` changes the arm from the console (`onStats`).

## HUD

`#hud` is `aria-hidden="true"`. `hud.show(on)` toggles `is-on` on `#hud` and `#stick`: `enterPlay()`
turns it on and the wordmark turns it off. `hud.update(player, yaw, place)` runs every frame and
returns immediately while seated, because the stylesheet hides the compass and radar then.

| Element | Behaviour |
| --- | --- |
| Compass `#compass-strip` | Marks N, E, S and W, plus one mark per place labelled with `short`. N is -z and E is +x. Each place mark uses the bearing from the hacker to the zone centre. A mark shows when within `HALF = 1.75` rad of the camera's ground direction, at `left = 50 - rel / HALF × 50` %. The shown place's mark gets `is-current` (amber). |
| Radar `#radar` | Canvas redrawn each frame at up to 2× device pixel ratio. `RANGE = 26` m from the centre to the edge. Oriented so the camera's view direction is up. It draws two range rings (at a third and two thirds of the radius), the island rim as a 22 m circle about (0, 0), and every zone outline. The shown place is filled amber. An amber arrow at the centre is rotated to the hacker's heading relative to the view. |
| Objective `#objective` | The shown place's `label`, or "Walk into a building to open it". Hidden while a panel is open. |
| Controls line `.controls` | Static key hint. Hidden on narrow screens and while a panel is open. |
| Place label `#place-label` | `aria-live="polite"`. Shows hover labels (the place label, the skill label, or "<alt>, open full size" for a frame), the opened place's label, and a tapped skill's label. Cleared on close. |
| Thumb stick `#stick` | See [Thumb stick](#thumb-stick-touch-only). Hidden while seated, and on narrow screens while a panel is open. |
| Seat bar and console `#seat` | See [armctl console](#armctl-console). |

"Shown place" means `current`, or the workbench while `atDesk()`.

## Gallery viewer

`#viewer` is one `<dialog>` for every picture and clip. `openViewer(item, list)` does the
following:
1. Clears held keys.
2. Builds thumbnails.
3. Shows the item within its gallery.
4. Calls `showModal()`.

If the dialog element is missing, it opens `item.full` in a new tab instead.

An item is `{ full, src, alt, video }`:

| Source | Gallery |
| --- | --- |
| A framed picture in the world | Every frame with the same parent object; items are the frames' `userData`. |
| A link in `.evidence` or `.wall` inside the page | Every link in that group containing an `<img>`. `full` is the link `href`, `src` the image `src`, `alt` the image `alt`, and `video` is true when the link has `data-video`. The page's default navigation is prevented. |

| Action | Input |
| --- | --- |
| Next or previous | `#viewer-next` / `#viewer-prev`; `ArrowRight` / `ArrowLeft` on the dialog, unless focus is inside the `<video>`; a swipe on `#viewer-stage` (see below). All wrap at the ends. |
| Jump | Click a thumbnail in `#viewer-thumbs`. |
| Close | The × button (`form method="dialog"`), `Escape`, or a click on the backdrop (a click whose target is the dialog itself). |

A swipe counts when the horizontal travel exceeds 40 px and 1.2 × the vertical travel. A pointer
that starts on the video is ignored, so it can scrub.

`showSlide(dir)` shows the item as follows:
- **Image:** sets `#viewer-img` to `full`.
- **Video:** sets `#viewer-video` to poster `src` and source `full`, with native controls, `playsinline` and `preload="metadata"`. Leaving a video pauses it and removes its source; closing the dialog unloads it too.
- **Animation:** a direction adds `from-right` or `from-left` for a 320 ms slide-in.
- **Caption and count:** `#viewer-cap` shows `alt`; `#viewer-count` shows "i of n" when there are two or more items.
- **Single item:** `is-single` on the dialog hides the arrows and thumbnails.
- **Thumbnails:** the current thumbnail gets `aria-current="true"` and scrolls into view. Video thumbnails carry `is-video`.
- **Preloading:** the neighbouring full-size images, but not videos.

While the viewer is open, the world ignores keys and pauses walking.

## Hardware close-up

The close-up bar `#closeup` is visible only when `data-place="skills"`. On wide screens it sits
above the radar; on narrow screens it sits near the top. `renderCloseup()` switches the bar
between two states:

| State | `#closeup-label` | `#closeup-count` | Buttons |
| --- | --- | --- | --- |
| Off | Hardware cabinet | "<n> boards and sensors" | Look closer |
| On | The model's label | "i of n" | ←, →, Back |

1. "Look closer" calls `setCloseup(0)`. `setCloseup` only enters a close-up when the Skills panel is open (`current.key === "skills"`) and `island.hardwareStops()` is not empty.
2. Each stop change calls `island.showHardware(i)`, which loads that model if it is not loaded.
3. ← / → or `ArrowLeft` / `ArrowRight` move through the stops and wrap. Back or `Escape` returns to the cabinet.
4. While a close-up shows, walking, zone checks and the swing-behind are off, and the camera uses the close-up framing with the slow blend.
5. Closing the panel, or opening another place, ends the close-up.

`island.visit("skills")` loads the cabinet models the first time Skills opens. On fine pointers it
loads every model. On coarse pointers it loads only the six in `PHONE_SET` (`js/island.js`); the
rest load one at a time as the close-up reaches them.

## Reduced motion

`reduceMotion` is `matchMedia("(prefers-reduced-motion: reduce)").matches`, read once at load.

| Area | With reduced motion |
| --- | --- |
| Intro camera | Holds still instead of circling. |
| Walking camera | No automatic swing behind the hacker. |
| Camera transitions | Cuts instead of gliding for the intro, close-up, the blend windows after sitting down or standing up, and teleports. Ordinary following still eases. |
| Door rings | Non-active rings hold a steady opacity (0.45) instead of pulsing. |
| Stylesheet | The intro card's entrance animation runs only under `no-preference`. `#hud`, `#stick` and `.panel` lose their transitions. `html` scroll behaviour is `auto`. |
| Bench and island | Both receive `reduceMotion`; see [Workbench](workbench.md) and [Campus](campus.md). |

## Touch devices and narrow screens

Two independent tests apply:
- **coarse:** `(pointer: coarse)`, read once in `world.js` (`coarse`, passed to `createHud` and `makeComposer`) and separately in `island.js` (`coarseDevice`). It decides input and rendering cost.
- **narrow:** `window.innerWidth < 992` in the camera code, and `max-width: 61.99rem` in the stylesheet. It decides framing and layout.

| Coarse pointer | Effect |
| --- | --- |
| Renderer | No antialiasing, pixel ratio capped at 1.5 instead of 1.75, sun shadow map 1024 instead of 2048. |
| Composer (`makeComposer` in `js/realism.js`) | No GTAO pass, no SMAA pass, bloom strength 0.28 instead of 0.35. |
| Input | Thumb stick shown; no hover picking or cursor changes. |
| Seat hint | "Tap the desk..." text. |
| Arm tuning panel | Not opened at boot. |
| Hardware cabinet | Only `PHONE_SET` loads up front. |

| Narrow screen | Effect |
| --- | --- |
| Intro camera | No left shift. |
| Standing and seated camera | Drops the view instead of shifting it sideways; seated uses `phoneYaw` and `phonePitch`. |
| Close-up camera | 25 % farther and lower. |
| Panels | Bottom sheet 58vh tall; `#panel-bar` full width. |
| HUD | Compass 86vw wide; radar 7rem at the bottom right; objective and place label centred near the top; controls line hidden; radar and stick hidden while a panel is open. |
| Seat | Full-width bar along the bottom; console head hidden; shorter log; 16 px input. |

## The ?debug hook

When the query string contains `debug` (`new URLSearchParams(location.search).has("debug")`),
`boot()` defines two globals:

| Global | Content |
| --- | --- |
| `window.__world` | `{ scene, camera, renderer, island, bench, player, hud, composer }`; `composer` is a getter because the composer is created after the hook. |
| `window.__blockScreen()` | Returns `{ x, y, world }`: the arm's block projected to viewport CSS pixels, and its world position as an `[x, y, z]` array. |

`tools/test/drag.mjs` loads `index.html?debug&v=<time>#about` and calls `__blockScreen()`. Coding
agents must not run the test scripts or a browser (`AGENTS.md`, rule 8). The owner's procedure is
in [Testing and release](testing-and-release.md).

## Known limitations

- **Walking adds browser history.** Walking into or out of a building calls `pushState`. Browser Back then steps through places visited on foot, and each step teleports the hacker to that door.
- **Stale overlap comment.** The comment in `checkZones` names research/toolchain and stage/lab as the overlapping zones. The layout gives research/toolchain (about 8.3 m²) and stage/mast (about 0.11 m²); stage and lab share only an edge. The rule itself is correct.
- **Viewer animation ignores reduced motion.** The viewer's 320 ms slide-in (`.from-left`, `.from-right`) has no reduced-motion override in `css/styles.css`.
- **No camera collision.** The third-person eye is only kept above `GROUND + 0.25` (seated `GROUND + 0.3`). It can pass into walls and buildings behind the hacker.
- **Walk bound hard-coded twice.** `createPlayer` has a literal default `bound = 21.5`, and `world.js` does not pass one. `ISLAND.walk` in `layout.js` holds the same number but is not used for it, and the radar draws the rim at a literal 22 m. Changing the island size means editing all three.
- **Only synchronous boot errors fall back.** Only an exception thrown synchronously inside `boot()` switches the page to the `no-world` fallback.
- **Invalid hash selectors throw.** `fromHash()` passes `location.hash` to `document.querySelector` with no `try`/`catch` and no `CSS.escape`. A hash that is not a valid selector (for example `#2024`) throws a `SyntaxError`. At load, `boot()` calls `bindPanels()`, which calls `fromHash()`, so the exception reaches `fail()`, the page switches to `no-world`, and `requestAnimationFrame(frame)` never runs. On `popstate` the handler throws and the address is ignored.
- **Stale `aria-current` on `<body>`.** `[data-place]` also matches `<body>` while a place is open, because `go()` sets `body.dataset.place` before its `aria-current` loop. Body receives `aria-current="page"`, and `closePanel()` removes `data-place` before its loop, so body keeps it after the panel closes.
- **Commanded speed drives gait and camera.** `gaitClip()` and the swing-behind test read `speed`, which collisions do not reduce, so walking into a wall plays the Walk clip and swings the camera while the body stands still.
- **Unused class, script and elements:**
  - `body.is-closeup` is toggled, but no stylesheet rule selects it.
  - `js/site.js` (a scroll-position highlighter for the masthead) is not loaded by `index.html`; `go()` sets `aria-current` instead.
  - `#world-grab` and `#world-hint` remain in `index.html`, but no script references them and the stylesheet hides both while the world runs.
