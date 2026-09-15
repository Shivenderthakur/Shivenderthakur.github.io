# Architecture

This document describes how the site's code is organised: which module imports which, what
each module exports and owns, the order of work at boot and in every frame, the state that
decides what the reader sees, and the data shapes passed between modules. Read it before you
change a module's interface, add a module, or move work from one module to another. For the
rules that govern all changes, start at the [Handbook](HANDBOOK.md). Details of individual
subsystems are in the documents linked from each section.

All facts here were checked against the working tree of Version 8 (15 September 2026).
Functions and constants are named rather than cited by line number.

## Contents

1. [Design constraints](#1-design-constraints)
2. [Module graph](#2-module-graph)
3. [Module reference](#3-module-reference)
4. [Boot sequence](#4-boot-sequence)
5. [Per-frame loop](#5-per-frame-loop)
6. [Modes and state](#6-modes-and-state)
7. [Data that crosses module boundaries](#7-data-that-crosses-module-boundaries)
8. [Import map and CDN](#8-import-map-and-cdn)
9. [Debug hooks](#9-debug-hooks)
10. [Legacy and unused code](#10-legacy-and-unused-code)
11. [Known limitations](#11-known-limitations)

---

## 1. Design constraints

| Constraint | How the code meets it |
|---|---|
| No build step | `index.html` loads one entry module with `<script type="module" src="js/world.js">`. Modules import each other by relative path (`./bench.js`). GitHub Pages serves the files as they are. |
| One runtime dependency | three.js 0.169.0, resolved through the import map in `index.html` ([section 8](#8-import-map-and-cdn)). No other script is loaded. The only other external resource in `<head>` is Google Fonts: two `preconnect` links and one stylesheet (see [Styling](styling.md)). AGENTS.md rule 7 forbids adding site dependencies. |
| Tool dependencies stay out of the site | `tools/models/package.json` lists Node packages (`@gltf-transform/core`, `@gltf-transform/extensions`, `@gltf-transform/functions`, `meshoptimizer`, `obj2gltf`, `sharp`) used only by the asset pipeline. The browser never loads them. See [Assets and pipelines](assets-and-pipelines.md). |
| Layout checkable under Node | `js/layout.js` has no imports and uses no browser globals, so `tools/checks/zones.mjs` imports it directly (`node tools/checks/zones.mjs`). The check imports no other site module. |
| Content stays HTML | Every word is ordinary HTML in `index.html`. The 3D world opens and closes existing `<section data-panel>` elements; it does not generate content. |
| Units | The world is in metres, with the ground at `GROUND = -1.4` (y). Positions on the ground are written (x, z). Inside the workbench group one unit is 10 cm ([Workbench](workbench.md)). |
| Graceful failure | `boot()` runs inside `try`/`catch`; on an error `fail()` adds `no-world` to `<body>` and `css/styles.css` falls back to the ordinary stacked page. `makeComposer` is also wrapped: on failure `composer` is `null` and the loop calls `renderer.render` directly. The loaders in `realism.js` resolve `null` instead of rejecting, and `player.js` falls back to built-in numbers if `hacker.json` cannot be read. |

## 2. Module graph

Arrows point from importer to imported module. Every import listed here was read from the
module's `import` statements.

```
index.html
 │  <script type="importmap">   three, three/addons/  ──>  cdn.jsdelivr.net three@0.169.0
 │  <link rel="stylesheet" href="css/styles.css">
 └─ <script type="module" src="js/world.js">

js/world.js                 boot, camera, input, panels and URL, close-up, viewer, arm tuning form, frame loop
 ├── js/player.js           the hacker: movement, collision, sitting, pointing
 │    └── js/realism.js
 ├── js/hud.js              compass, radar, thumb stick, seat bar, armctl console   (no imports)
 ├── js/bench.js            desk, chair, tower, monitors, arm, block, armctl
 │    └── js/realism.js
 ├── js/island.js           terrain, buildings, props, places, colliders
 │    ├── js/layout.js      every campus position and the walk geometry          (no imports)
 │    ├── js/campus.js      plaza, pads, walkway traces, planters, lamps, doors
 │    ├── js/icons.js       the floating skill ring
 │    │    └── js/realism.js
 │    ├── js/stations.js    RIGS: the small animated rigs placed in buildings
 │    │    └── js/bench.js  (roundedBox, hub)
 │    ├── js/bench.js       (roundedBox)
 │    └── js/realism.js
 └── js/realism.js          HDRI, PBR textures, glTF loading, post-processing

tools/checks/zones.mjs  ──>  js/layout.js      (plain Node, no browser)
js/site.js                   not loaded by anything (see section 10)
```

`bench.js` does not import `island.js` or `layout.js`. Its header explains that importing
`island.js` for `GROUND` would be circular, because `island.js` imports `bench.js` for
`roundedBox`; it declares its own `GROUND = -1.4` instead.

## 3. Module reference

### Exports

| Module | Imports | Exports |
|---|---|---|
| `js/world.js` | `three`, `three/addons/environments/RoomEnvironment.js`, `bench.js`, `island.js`, `realism.js`, `player.js`, `hud.js` | none (entry module; calls `boot()` on load) |
| `js/player.js` | `three`, `realism.js` (`loadGLTF`) | `inRect(r, x, z)`, `route(colliders, from, to)`, `createPlayer({ scene, ground, colliders, heightAt, start, bound = 21.5 })` |
| `js/hud.js` | none | `createHud({ places, coarse })` |
| `js/bench.js` | `three`, `realism.js` (`pbr`) | `AMBER`, `LIMITS`, `createBench(opts)`, `roundedBox(w, h, d, r)`, `hub(r, w, body, ring)` |
| `js/island.js` | `three`, `bench.js` (`roundedBox`), `stations.js` (`RIGS`), `icons.js` (`makeSkillRing`), `realism.js` (`pbr`, `loadProp`), `campus.js` (`MAT`, `plaza`, `pad`, `traces`, `planter`, `lamp`, `groundLabel`, `curtain`, `rimTiles`, `door`), `layout.js` (as `L`) | `GROUND` (re-export of `L.GROUND`), `buildIsland(scene, { reduceMotion })` |
| `js/layout.js` | none | constants `GROUND`, `PLAYER_RADIUS`, `ISLAND`, `PLAZA_RADIUS`, `PAD_TOP`, `TABLE_TOP`, `LANDMARKS`, `BENCH`, `SERIAL_LINK`, `BUSES`, `WALKWAY_CLEAR`, `LABELS`, `PLANTER_RADIUS`, `PLANTERS`, `LAMP_RADIUS`, `LAMPS`, `START`, `ORDER`, `SHORT`; tables filled at load `ZONES`, `SPAWNS`, `COLLIDERS`, `PLATFORMS`; functions `quarterTurn`, `frameOf`, `worldXZ`, `toWorld`, `inRect`, `gap`, `segmentDistance`, `heightAt(x, z, platforms = PLATFORMS)` |
| `js/campus.js` | `three` | `MAT`, `plaza`, `pad`, `traces`, `planter`, `lamp`, `groundLabel`, `door`, `curtain`, `rimTiles` |
| `js/icons.js` | `three`, `realism.js` (`loadProp`) | `SKILLS`, `makeSkillRing(reduceMotion, { radius, low, high, padY })` |
| `js/stations.js` | `three`, `bench.js` (`roundedBox`, `hub`) | `PLACES`, `makeStations(scene)`, `RIGS` |
| `js/realism.js` | `three` and seven addons ([section 8](#8-import-map-and-cdn)) | `loadEnvironment(renderer, scene, url)`, `pbr(name, options)`, `loadGLTF(url)`, `loadProp(name, size)`, `makeComposer(renderer, scene, camera, { coarse })` |

### What each module owns

| Module | Owns |
|---|---|
| `world.js` | The `WebGLRenderer` on `canvas#world`, the `Scene`, the `PerspectiveCamera`, the lights (`lights()`: hemisphere light, shadow-casting `sun`, blue fill) and the shader sky dome (`sky()`). The camera rig (`STAND`, `SEAT_VIEW`, `SEAT_NUDGE`, `desired`, `seatedView`, `moveCamera`) and the sun's shadow extent (`shadowSpan`). Keyboard, pointer, wheel and pinch input. Panel routing and the URL hash (`go`, `closePanel`, `step`, `checkZones`, `fromHash`). The hardware close-up (`setCloseup`, `renderCloseup`). The picture and video viewer on `dialog#viewer`. The arm tuning form `#rig` (`bindRig`). The link between the armctl console in `hud.js` and the arm in `bench.js` (`bindConsole`, `aimTap`). The frame loop (`frame`) and `resize`. See [World and controls](world-and-controls.md). |
| `player.js` | The hacker model `assets/models/character/hacker.glb` and its metadata `assets/models/character/hacker.json` (clip speeds and seat height, with `FALLBACK` values). The `AnimationMixer` and clip blending, the state machine, collision push-out against colliders, the island edge bound, the path to the chair (`route`), the pointing layers, and a contact-shadow disc. Constants `HEIGHT` 1.75 m, `RADIUS` 0.3 m, `WALK` 1.6 m/s, `RUN` 4.5 m/s. See [Character](character.md). |
| `hud.js` | The DOM instruments `#hud`, `#compass-strip`, `#radar` (2D canvas), `#objective` and the thumb stick `#stick` (shown only on coarse pointers). The seat bar `#seat` with `#seat-stand`, `#seat-about`, `#seat-hint`, and the console `#console-log`, `#console-form`, `#console-input` (40-line command history, log trimmed to 80 rows). It sets the `--kb` custom property on `#seat` from `visualViewport` so the console stays above a phone keyboard. |
| `bench.js` | Everything on the workbench, hung from one group `root` named `"workbench"` at world (0, `GROUND + 0.75`, 0) and scaled by `ROOT_SCALE = 0.1`: desk, chair, tower, the two monitors (slideshow and terminal), the parametric arm with its inverse kinematics, the block, the pedestal and the working volume. It writes the joint readout into the elements passed as `readout`. Its state is held in module-level variables. See [Workbench](workbench.md). |
| `island.js` | Terrain (`terrain`), the seven buildings (`tower`, `stage`, `lab`, `hall`, `skills`, `shed`, `mast`), the serial-link rig (`serialLink`), the hardware cabinet (`showcase`), the Poly Haven props, the campus dressing drawn with `campus.js` from positions in `layout.js`, the click box round the desk, the entry rings at each door, and the `places` list. See [Campus](campus.md). |
| `layout.js` | Numbers and ground geometry only. At load it walks `ORDER` and fills `ZONES`, `SPAWNS`, `COLLIDERS` and `PLATFORMS` from `LANDMARKS`, then adds the serial link, planters and lamps to `COLLIDERS`. |
| `campus.js` | Builders for campus pieces and their shared materials (`MAT`). Where the pieces stand is decided in `layout.js`. `traces` returns an object with an `update`; `rimTiles` returns an update function. |
| `icons.js` | The `SKILLS` list and the ring that shows it. |
| `stations.js` | The rig builders collected in `RIGS`. Each builder returns an object with `scene` (a group) and `update(dt, t)`; `island.js` scales them with its local `rig(name, scale, updaters)` helper. |
| `realism.js` | One shared `GLTFLoader` with `MeshoptDecoder`, a texture cache, the HDRI loader, and the post-processing chain. |

### `realism.js` in detail

| Function | Behaviour |
|---|---|
| `loadEnvironment(renderer, scene, url = "assets/hdri/workshop_1k.hdr")` | Loads the HDRI through `RGBELoader` and `PMREMGenerator`, sets `scene.environment` and `scene.environmentIntensity = 0.55`. Returns a promise of the texture, or `null` on failure. |
| `pbr(name, { repeat, color, metalness, roughness, normalScale })` | Returns a `MeshStandardMaterial` using `assets/tex/<name>_diff.webp`, `_nor.webp` and `_rough.webp`. Textures are cached by path and repeat. |
| `loadGLTF(url)` | Loads a glTF with animations. Resolves `null` on failure. |
| `loadProp(name, size)` | Loads `assets/models/<name>.glb`, scales it so its largest dimension is `size` metres, centres it on x and z, stands it on y = 0, enables shadows, and returns it inside a holder `Group`. Resolves `null` on failure. |
| `makeComposer(renderer, scene, camera, { coarse })` | Builds `RenderPass`, `GTAOPass` (fine pointers only), `UnrealBloomPass`, `OutputPass`, `SMAAPass` (fine pointers only). Returns `{ passes, render(), aoSpan(near), setSize(w, h) }`. `aoSpan(true)` switches ambient occlusion to `AO_NEAR` (radius 0.06 m) and `aoSpan(false)` to `AO_FAR` (radius 0.35 m). |

## 4. Boot sequence

`world.js` calls `boot()` once, when the module is evaluated. The steps, in order:

1. Create the `WebGLRenderer` on `canvas#world`. Antialiasing is off on coarse pointers; the pixel ratio is capped at 1.5 (coarse) or 1.75; PCF soft shadows; ACES filmic tone mapping at exposure 1.25.
2. Create the `Scene` with background `0x101c26` and `Fog` from 48 m to 140 m.
3. Set a provisional environment from `RoomEnvironment` through `PMREMGenerator` (intensity 0.22), then call `loadEnvironment`, which replaces it asynchronously when the HDRI arrives.
4. Create the camera: `PerspectiveCamera(50, 1, 0.02, 400)`.
5. `lights()` and `sky()`.
6. `createBench({ scene, camera, reduceMotion, slides, readout, onStats, onLine })`. `slides` comes from `projectSlides()`: the images inside `#work .evidence a` and `#research .evidence a`, excluding links with `data-video`. `readout` holds `#j1`–`#j4`, `#claw`, `#mode` and `#hgt`.
7. `buildIsland(scene, { reduceMotion })`, then find the place with key `"bench"` and keep it as `benchPlace`.
8. `createPlayer({ scene, ground: GROUND, colliders: island.colliders.concat(bench.colliders || []), heightAt: island.heightAt, start: island.start })`.
9. `createHud({ places: island.places, coarse })`.
10. Set the orbit yaw behind the start heading (`cam.yaw = island.start.heading + Math.PI`).
11. `bindRig()` (arm tuning form) and `bindConsole()` (console, Stand up and About buttons).
12. If the URL has `?debug`, install the hooks in [section 9](#9-debug-hooks).
13. Size the renderer, then `makeComposer` inside `try`/`catch`.
14. `resize()` and a passive `resize` listener.
15. `bindPointer()`, `bindKeys()`, `bindPanels()` and `bindCloseup()`. `bindPanels` also calls `bindViewer()`, adds the `popstate` listener and calls `fromHash()`, so a deep link such as `#research` teleports the hacker during boot.
16. `syncSeat()`, `snapCamera(0)` and the first `requestAnimationFrame(frame)`.

Assets that arrive later do not block boot: the HDRI, the hacker GLB and `hacker.json`, the
props, the skill icons and the hardware models. Modules check for them before use (for example
`player.js` skips animation while `mixer` is `null`). The hardware models are loaded only when
the skills place is opened (`island.visit("skills")` calls the cabinet's `load()`, which on
coarse pointers loads only the models in `PHONE_SET`) or when a close-up asks for one
(`island.showHardware(i)`). A model already requested is not requested again.

## 5. Per-frame loop

`frame(nowMs)` in `world.js` runs on every animation frame:

1. Request the next frame.
2. Compute `raw` seconds since the last frame. If `document.hidden`, stop here.
3. `dt = min(raw, 0.05)` for the simulation; `t = nowMs / 1000`.
4. `walking` is true when `mode === "play"`, no close-up is active and the viewer dialog is closed. If walking, `inputVector()` fills `move` from the held keys or `hud.stick`, turned into world x and z by the camera yaw, and returns whether to run (Shift, or the stick pushed past 0.85).
5. `player.setTyping(player.state === "seated" && typingNow())`.
6. `player.update(dt, walking ? move : still, running)`.
7. `syncSeat()`: react if the player's state changed.
8. If `composer` exists, `composer.aoSpan(closeup >= 0 || seatView())`.
9. `checkZones()`: open, close or sit down according to the zone the hacker stands in.
10. `moveCamera(min(raw, 0.25), t)`.
11. `bench.update(nowMs, dt)`: `nowMs` is in milliseconds, `dt` in seconds.
12. `island.update(dt, t)`: runs every registered updater and sets the entry-ring colours.
13. `hud.update(player, yaw, shownPlace())`, where `yaw` is `atan2(look.x, look.z) - π` from the camera's world direction.
14. `composer.render()`, or `renderer.render(scene, camera)` when there is no composer.

Input handlers (`keydown`, pointer events, wheel) change state between frames; they do not render.

## 6. Modes and state

### State variables in `world.js`

| Variable | Values | Meaning |
|---|---|---|
| `mode` | `"intro"`, `"play"` | Starts as `"intro"`: the camera circles the hacker behind the intro card and walking is off. `enterPlay()` switches to `"play"` on the first walking key, on `#explore`, or from `go()`. Clicking `.wordmark` returns to `"intro"`. |
| `current` | a place object or `null` | The place whose panel is open. |
| `dismissed` | a place key or `null` | A place closed or left by hand while the hacker still stands in its zone, so it does not reopen at the next step. Cleared once the hacker is outside that zone or `go()` runs. `standUp()` sets it to `"bench"` so the chair does not pull the hacker back in. |
| `closeup` | index or `-1` | The hardware stop being viewed, an index into `island.hardwareStops()`. Allowed only while `current.key === "skills"`; reset to `-1` when a different panel opens or the panel closes. |
| `cam` | `{ yaw, pitch, dist, wantDist }` | Standing third-person orbit. |
| `seatCam` | `{ yaw, pitch, zoom, wantZoom }` | Small drag and zoom offsets while seated, limited by `SEAT_NUDGE`. |
| `blendUntil` | seconds | Until this time the camera glides slowly after sitting down or standing up. |
| `jumped` | boolean | Set by a teleport; with reduced motion the camera cuts instead of gliding. |
| `lastState` | player state | Previous `player.state`, compared by `syncSeat()`. |
| `commandAt`, `greeted`, `lastDrag` | numbers, boolean | When the arm last got an order (drives the typing pose), whether the console greeting has been printed, when the reader last dragged the view. |
| `gallery` | `{ list, i }` | The viewer's current gallery and index. |

### Player states (owned by `player.js`, read through `player.state`)

| State | Meaning |
|---|---|
| `"walk"` | Free movement. |
| `"approach"` | Walking along the path from `route()` to the spot behind the chair. |
| `"sitting-down"` | Scripted move from that spot onto the seat (`SIT_TIME` 1.35 s). |
| `"seated"` | In the chair. |
| `"standing-up"` | Scripted move back to the spot behind the chair (`STAND_TIME` 1.15 s). |

`world.js` derives two helpers: `atDesk()` is true in `"approach"`, `"sitting-down"` and
`"seated"`; `seatView()` is true in `"sitting-down"` and `"seated"`. `shownPlace()` returns
`current`, or `benchPlace` while `atDesk()`.

### Transitions

| Trigger | Function | Effect |
|---|---|---|
| The hacker walks into a zone (only in `"play"`, no close-up, state `"walk"`) | `checkZones` | Where zones overlap, the zone whose centre is nearest wins. The bench zone closes any other panel and calls `sitDown()` unless `dismissed === "bench"`. Any other zone calls `go(key)` unless that key is dismissed. No zone closes the open panel with `fromWalk: true`. |
| Header link `[data-place]`, panel arrows, a click on a building, a deep link | `go(key, { teleport: true })` | For the bench, `player.sit(..., { instant: true })`; otherwise `player.teleport(place.spawn)`. Opens the panel, calls `island.visit(key)`, pushes or replaces the URL hash. |
| `#panel-close`, Escape with a panel open | `closePanel()` | Closes the panel and sets `dismissed` to its key. |
| Escape with no panel open while `atDesk()`, `#seat-stand`, a fresh press of a walking key while `atDesk()` | `standUp()` | `player.standUp()`, `dismissed = "bench"`. |
| `#seat-about` | callback from `hud.onAbout` | Toggles the About panel (`go("bench")` or `closePanel()`) without leaving the chair. |
| `popstate` | `fromHash` | Empty hash, `#top` or `#bench` closes the panel; a place's `anchor` or `panel` opens it; an id inside a `[data-panel]` opens the owning place and scrolls to that entry. |
| `#closeup-enter`, `#closeup-prev`, `#closeup-next`, `#closeup-exit`, ArrowLeft, ArrowRight and Escape during a close-up | `setCloseup(i)` | Moves between hardware stops; `island.showHardware(i)` loads the model. |
| Player state changes | `syncSeat` | Sitting down: reset `seatCam`, glide 1.6 s, `shadowSpan(3.2)`. Standing up: put `cam` behind the hacker, glide 1.4 s, `shadowSpan(30)`. Sets `body.is-seated` and `hud.setSeated()`, prints the console greeting on the first seat. |

### Classes and attributes written to the DOM

| Written by | Target | Class or attribute |
|---|---|---|
| `world.js` `fail` | `<body>` | `no-world` |
| `world.js` `enterPlay`, wordmark handler | `<body>` | `is-exploring` |
| `world.js` `go`, `closePanel` | `<body>` | `is-focused`, `data-place="<key>"` |
| `world.js` `syncSeat` | `<body>` | `is-seated` |
| `world.js` `renderCloseup` | `<body>` | `is-closeup` |
| `world.js` `go`, `closePanel` | `[data-panel]` sections | `is-open` |
| `world.js` `go`, `closePanel` | `[data-place]` links | `aria-current="page"` |
| `world.js` `go`, `closePanel` | `#panel-bar` | `hidden` |
| `world.js` `renderCloseup` | `#closeup-enter`, `#closeup-prev`, `#closeup-next`, `#closeup-exit` | `hidden` (the enter button is hidden during a close-up, the other three outside one) |
| `world.js` `showSlide` | `#viewer` | `is-single` (fewer than two items) |
| `world.js` `showSlide` | `#viewer-thumbs` buttons | `aria-current="true"` or `"false"` |
| `world.js` `showSlide` | `#viewer-img`, `#viewer-video` | `hidden` on the one not shown; `from-left` or `from-right` on the one shown |
| `world.js` `buildThumbs` | `#viewer-thumbs` buttons | `is-video` |
| `hud.js` `show` | `#hud`, `#stick` | `is-on` |
| `hud.js` `update` | compass marks | `is-current` |
| `hud.js` `createHud` | `#stick` | `hidden = false`, on coarse pointers only |
| `hud.js` `setSeated` | `#seat` | `hidden` while not seated |
| `hud.js` `setAbout` | `#seat-about` | `aria-pressed="true"` or `"false"` |
| `hud.js` `createHud` (`visualViewport` resize) | `#seat` | style property `--kb` (pixels covered by an on-screen keyboard) |

The table leaves out content writes (`src`, `alt`, `aria-label`, text) and inline styles that
only position elements: the canvas `cursor` and `touchAction` in `world.js`, and the stick
knob `transform` and compass mark `left` and `visibility` in `hud.js`. How these classes change
the layout is described in [Styling](styling.md).

## 7. Data that crosses module boundaries

### Ground shapes (defined in `layout.js`, consumed by `player.js`, `island.js`, `hud.js`, `world.js`)

| Shape | Fields | Notes |
|---|---|---|
| Circle | `{ x, z, r, tag? }` | Metres on the ground. |
| Oriented rectangle | `{ x, z, hw, hd, c, s, tag? }` | Centre, half width, half depth, and the cosine and sine of the rotation. Tested with `inRect(r, x, z)`. |
| Platform | oriented rectangle plus `top` | `top` is the floor height in metres above `GROUND`. |
| Spawn | `{ x, z, heading }` | A heading `h` faces the ground direction (sin h, cos h); `Math.PI` faces -z. |

A landmark's own shapes are written as `{ x, z, r }` or `{ x, z, w, d }` in its local frame and
turned into world shapes by `toWorld(frameOf(site), shape, extra)`.

### Places (`island.places`)

Eight objects in this order: `bench`, `research`, `stage`, `lab`, `hall`, `skills`, `shed`,
`mast`.

| Field | Type | Set from | Read by |
|---|---|---|---|
| `key` | string | `buildIsland` | `world.js`, `island.js` |
| `panel` | CSS selector of the section, e.g. `"#research"` | `buildIsland` | `world.js` (`go`, `fromHash`) |
| `anchor` | CSS selector, optional (`stage`: `"#work-robonari"`, `lab`: `"#work-attendance"`) | `buildIsland` | `world.js` |
| `label` | string | `buildIsland` | `world.js` (place label), `hud.js` (objective, compass fallback) |
| `short` | string | `L.SHORT` | `hud.js` (compass marks) |
| `zone` | oriented rectangle (copy of `L.ZONES[key]`) | `layout.js` | `world.js` (`checkZones`), `hud.js` (bearings and radar) |
| `spawn` | spawn (copy of `L.SPAWNS[key]`) | `layout.js` | `world.js` (`go` teleport), `island.js` (entry ring) |
| `hits` | `Mesh[]`, each with `userData.place = key` | building builders; `bench` uses the invisible box from `L.BENCH.hit` | `world.js` (`pick`) |
| `group` | `THREE.Group`, absent for `bench` | building builders | `island.js` |
| `focus`, `dist`, `lift`, `dir` | `Vector3`, numbers, `Vector3` | building builders, `L.BENCH` | not read outside `island.js` |
| `beacon` | ring `Mesh` | `buildIsland` | `island.js` (`update`) |

### Island API (`buildIsland` return value)

| Member | Shape | Used by |
|---|---|---|
| `places` | place objects above | `world.js`, `hud.js` |
| `frames` | `Mesh[]`, each with `userData = { full, alt, src }` | `world.js` (`pick`, viewer galleries grouped by parent) |
| `skillItems` | `{ holder, icon }[]`; `holder.userData.skill` is an entry of `SKILLS` (`key`, `label`, `tag`, `model` or `make`, `size`) | `world.js` (`pick`) |
| `colliders` | copies of `L.COLLIDERS` | `world.js` → `createPlayer` |
| `platforms` | copies of `L.PLATFORMS` | not read by any module |
| `heightAt(x, z)` | metres above `GROUND` of the highest platform under the point, else 0 | `player.js` |
| `start` | spawn, copy of `L.START` (`{ x: 0, z: 4.2, heading: Math.PI }`) | `world.js`, `player.js` |
| `setActive(key)` | key or `null` | `world.js` (`refreshPlaceUi`); the active entry ring turns amber |
| `hardwareStops()` | `{ label, focus: Vector3, dir: Vector3, dist, lift }[]` | `world.js` (close-up camera and labels) |
| `showHardware(i)` | loads one hardware model | `world.js` (`setCloseup`) |
| `visit(key)` | loads the hardware cabinet when `key === "skills"` | `world.js` (`go`) |
| `update(dt, t)` | per frame | `world.js` |

### Colliders and platforms

The player receives one collider list at creation: `island.colliders` (every landmark's
`solids` tagged with its key, the serial-link rig, planters and lamps) concatenated with
`bench.colliders` (the desk and the tower as oriented rectangles; the chair is left out so the
hacker can reach it). `player.js` pushes the body out of circles and rectangles, grown by its
0.3 m radius, and keeps it within `bound` (21.5 m by default) of the origin. Platforms are not
passed to the player; it calls `heightAt` instead. Positions and sizes are documented in
[Campus](campus.md); the rules that keep them consistent are checked by
`tools/checks/zones.mjs` ([Testing and release](testing-and-release.md)).

### Player API (`createPlayer` return value)

| Member | Shape | Notes |
|---|---|---|
| `position` | `Vector3` | Live reference; y is the feet. |
| `heading`, `speed`, `state` | getters | Radians, m/s, state string ([section 6](#player-states-owned-by-playerjs-read-through-playerstate)). |
| `height`, `radius`, `walkSpeed`, `runSpeed` | numbers | 1.75, 0.3, 1.6, 4.5. |
| `meta` | `{ walkSpeed, runSpeed, seatHeight, keyboardReach }` | Clip speeds from `hacker.json` or `FALLBACK`. |
| `update(dt, move, running)` | `move` is a `Vector2` whose `x` is world x and `y` is world z, length up to 1 | Returns `speed`. |
| `teleport({ x, z, heading })` | | Sets state `"walk"`. |
| `sit(seat, approach, { instant })` | `seat = { x, z, heading, height? }`, `approach = { x, z, heading }` | Returns `false` if not in `"walk"` (unless `instant`). |
| `standUp({ instant })` | | Returns `false` in `"walk"` or `"standing-up"`. |
| `point(target)` | world `Vector3` | Plays the pointing layers toward the target. |
| `setTyping(on)` | boolean | Seated clip becomes `SitType`. |
| `setColliders(list)` | collider array | Replaces the collider list. |

### Bench API (`createBench` return value)

Coordinates handed in or out are world metres unless stated. Pointer coordinates are
normalised device coordinates (-1 to 1).

| Member | Shape | Used by `world.js` for |
|---|---|---|
| `root`, `group` | the `"workbench"` group (same object) | `armBase()` origin of armctl coordinates |
| `update(now, dt)` | milliseconds, seconds | frame loop |
| `pointerDown(x, y)` | returns `"none"`, `"free"` (drag in the camera-facing plane) or `"depth"` (drag across the desk) | grabbing the block or its ring while seated |
| `pointerMove(x, y, travel)` | `travel` in pixels; returns boolean | dragging |
| `pointerUp(x, y, { cancel })` | | release; `cancel` stops it being read as a tap |
| `hoverAt(x, y)` | boolean | grab cursor |
| `aimFromNdc(x, y)` | world `Vector3` on the desk or pedestal top, or `null` | tap targets, crosshair cursor |
| `placeAt(p)` | returns `{ accepted, target: Vector3 or null, reason, line }` | tap-to-place (`aimTap`) |
| `command(text)` | returns `{ ok, lines: string[] }` | armctl console |
| `busy()` | `true` while a user order is running | typing pose (`typingNow`) |
| `getDims()` | `{ base, l1, l2, claw }` in bench units (10 cm) | tuning form reset |
| `setDims(partial)` | returns `stats()` | tuning form sliders |
| `stats()` | `{ reachCm, heightCm, areaCm2, litres, dims }` | tuning form readout |
| `LIMITS` | `{ base, l1, l2, claw }` as `[min, max]` in bench units | slider ranges |
| `block()` | world `Vector3` of the block centre | `?debug` hook |
| `colliders` | two oriented rectangles | player colliders |
| `seat` | `{ x: -0.45, z: 0.65, heading: π, height: 0.46 }` | `sitDown`, `seatedView` |
| `approach` | `{ x: -0.45, z: 1.35, heading: π }` | `sitDown` |
| `keyboard` | world `Vector3` | not read outside `bench.js` |
| `log()` | terminal lines as strings | not read outside `bench.js` |

Callbacks passed in `opts`: `onStats(stats)` is called when armctl changes the arm, so
`world.js` redraws the tuning form; `onLine(text)` is called when the arm finishes an order,
and `world.js` prints it to the console. The arm's behaviour and the armctl commands are in
[Workbench](workbench.md).

### HUD API (`createHud` return value)

| Member | Shape | Notes |
|---|---|---|
| `stick` | `{ active, x, y }`, x right and y forward, each -1 to 1 | Read by `inputVector` |
| `update(player, yaw, current)` | | Skipped while seated |
| `setPlace(place)` | place or `null` | Objective line |
| `show(on)` | boolean | Toggles `is-on` |
| `setSeated(on)` | boolean | Shows `#seat`, blurs the console when leaving |
| `setAbout(open)` | boolean | `aria-pressed` on `#seat-about` |
| `print(lines, kind = "out")` | string or string array; `world.js` uses kinds `"cmd"`, `"out"`, `"err"` | Adds `console__row--<kind>` rows |
| `onCommand(fn)`, `onStand(fn)`, `onAbout(fn)` | callbacks | `fn(line)` receives the trimmed console line |
| `typing` | getter | `true` while `#console-input` has focus |

## 8. Import map and CDN

`index.html` declares, in `<head>`:

```html
<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/"
  }
}
</script>
```

Modules import `"three"` and paths under `"three/addons/"` as bare specifiers, which the browser
resolves through this map. The addons in use are:

| Addon path | Imported by |
|---|---|
| `environments/RoomEnvironment.js` | `world.js` |
| `loaders/RGBELoader.js`, `loaders/GLTFLoader.js`, `libs/meshopt_decoder.module.js` | `realism.js` |
| `postprocessing/EffectComposer.js`, `RenderPass.js`, `GTAOPass.js`, `UnrealBloomPass.js`, `SMAAPass.js`, `OutputPass.js` | `realism.js` |

AGENTS.md rule 7 fixes the version at 0.169.0; change it only when the owner asks. If the owner
does, both URLs must change together. Import three.js in modules only through these bare
specifiers, so the version is set in this one place.

## 9. Debug hooks

When the page URL contains `?debug`, `boot()` installs two globals:

| Global | Returns | Used by |
|---|---|---|
| `window.__blockScreen()` | `{ x, y, world }`: the block's screen position in CSS pixels and its world position as an array. | `tools/test/drag.mjs`, which loads the page with `?debug` and calls it three times. |
| `window.__world` | `{ scene, camera, renderer, island, bench, player, hud, composer }` (`composer` is a getter). | No current test. It is exposed for manual inspection in the browser console. |

Agents must not run these tests (AGENTS.md rule 8); the procedure for the owner is in
[Testing and release](testing-and-release.md).

## 10. Legacy and unused code

| Item | Status |
|---|---|
| `js/site.js` | Not loaded by `index.html` and not imported by any module. It marks the masthead link of the section in view with an `IntersectionObserver`. Its only commit is `40b8e4c` (9 September 2026). |
| `stations.js` `PLACES` and `makeStations(scene)` | Not imported anywhere. `PLACES` gives each rig a position "in metres along the bench" (its own comment); `makeStations` builds them there. `island.js` imports only `RIGS` and places the rigs itself. |
| `RIGS.uart` and `RIGS.face` | Not used. `island.js` builds `sprint`, `roster`, `hand`, `trace`, `boards` and `props`. |
| `bench.js` export `AMBER` | Not imported; `campus.js`, `icons.js`, `island.js` and `stations.js` each declare their own `AMBER = 0xf0a31e`. |
| `island.platforms` | Returned but not read. |
| `player.setColliders`, `player.meta`, `player.height`, `player.radius`, `player.runSpeed` | Not read outside `player.js`. |
| `bench.keyboard`, `bench.log`, `bench.group` | Not read outside `bench.js`. |
| Place fields `focus`, `dist`, `lift`, `dir` | Not read outside `island.js`. |
| `composer.passes` | Not read. |

Before removing any of these, search `js/`, `tools/` and `index.html` again.

## 11. Known limitations

- **The bench is a singleton.** `bench.js` keeps its scene, camera, root group and arm state in
  module-level variables that `createBench` assigns, so a second call would reuse and overwrite
  the same state.
- **The workbench contract is written in three places.** The desk, tower, seat and approach
  positions live in `bench.js` constants (`DESK`, `TOWER`, `SEAT`, `APPROACH_Z`), the bench zone
  and door in `layout.js` (`BENCH.zone`, `BENCH.spawn`), and `tools/checks/zones.mjs` holds its
  own footprints for the workbench parts. Its `DESK` (centre (-0.25, 0), 1.4 m × 0.7 m),
  `BENCH_ZONE` and `APPROACH` (-0.45, 1.35) equal the `bench.js` and `layout.js` values. Its
  `TOWER` is a padded 0.25 m × 0.5 m box around the 0.205 m × 0.425 m collider that
  `bench.js` `makeColliders` builds, and its `CHAIR` is a 0.6 m square around `SEAT`; `bench.js`
  has no chair rectangle. The check imports only `layout.js`, not `bench.js`, so moving any part
  in `bench.js` still requires updating `zones.mjs` by hand.
- **`bench.seat` and `bench.approach` ignore the root position.** They are bench-local
  constants multiplied by `ROOT_SCALE`, so they are correct only while `root` stays at world
  x = 0, z = 0.
- **Repeated constants.** `GROUND = -1.4` is declared in both `layout.js` and `bench.js`.
  `AMBER = 0xf0a31e` is declared in `bench.js`, `campus.js`, `icons.js`, `island.js` and
  `stations.js`. The
  desk height appears as `TABLE_TOP` in `layout.js`, `FLOOR = -7.5` in `bench.js`, and the
  literal `GROUND + 0.75` in `world.js` (`seatedView`, `armBase`). `inRect` is implemented in
  both `player.js` and `layout.js`. The walkable radius 21.5 m is `L.ISLAND.walk` and also the
  default `bound` in `createPlayer`, which `world.js` does not pass. The radar draws the island
  rim at a literal 22 m.
- **Only `layout.js` has an automated check that runs without a browser.** Everything else is
  checked by the owner's browser tests.
