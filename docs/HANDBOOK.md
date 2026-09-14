# Portfolio handbook

The single source of truth for anyone, human or model, who has to change this site.
Read sections 1 and 2 before touching anything. Everything else is reference.

---

## 1. Hard rules (never break these)

1. **No AI attribution anywhere in git.** Commits, tags and PR text must not contain
   `Co-Authored-By: Claude`, `Claude-Session`, "Generated with Claude" or anything similar.
   The repository history was rewritten once to remove them. Commit messages are plain,
   e.g. `Version 7`.
2. **The owner pushes.** Commit and tag locally; do not push unless explicitly asked.
   The owner runs `git push && git push --tags`.
3. **Every claim must be traceable** to `data/` (the LinkedIn export, gitignored), a press
   clipping in `assets/press/`, or a public GitHub repo. Never invent numbers, clients,
   results, dates or reasons presented as fact. If unsure, leave it out.
4. **Do not publish**: the tax invoice or the Cognifyz offer letter (private documents),
   LinkedIn post screenshots, or photos dominated by identifiable schoolchildren.
5. **No vendor logos in 3D.** VS Code, JetBrains/PyCharm, Atom and Sublime marks may not be
   redrawn, extruded or restyled. Editors are named as plain text linking to the vendor.
   3D stands in with generic objects (terminal, keyboard, board, gear).
6. **The workbench is matte.** The arm, computer, monitor, keyboard and pedestal use
   `MeshStandardMaterial` with high roughness and no clearcoat. The owner asked for "no shiny".
7. **Never commit the raw model archives.** `3d models/` is 1.9 GB and seven zips exceed
   GitHub's 100 MB per-file hard limit; a push containing them is rejected. Only the
   converted GLBs in `assets/models/` are committed.
8. **No build step.** Plain HTML, CSS and ES modules served as static files on GitHub Pages.
   Do not add bundlers, frameworks or npm dependencies to the site itself.

---

## 2. What this is

| | |
| --- | --- |
| Owner | Shivender Singh Thakur, Chief Technology Officer at CoShot, Jodhpur, Rajasthan |
| Positioning | A CTO who runs seven-day research sprints in industrial and manufacturing, IoT and AI, mostly under NDA. Not a junior developer. |
| Live site | https://shivenderthakur.github.io/ |
| Repository | `git@github.com:Shivenderthakur/Shivenderthakur.github.io.git`, branch `main` |
| Hosting | GitHub Pages, `.nojekyll` present |
| Contact channels | LinkedIn `linkedin.com/in/shivender-singh-thakur`, GitHub `Shivenderthakur` |

The site is a **floating island you explore in 3D** (three.js). Each landmark on the island
is a "place"; clicking it flies the camera there and opens the matching HTML section as a
side panel (bottom sheet on phones). All text is ordinary HTML in `index.html`, so it is
crawlable and still readable without WebGL.

---

## 3. Version history

Tags are `vN.0.0`, commit subject `Version N`.

| Version | What changed |
| --- | --- |
| v1 | Scrolling page with an interactive 3D robotic arm in the hero (drag a block, arm picks and places it). |
| v2 | Whole page set inside one 3D workshop; dark, immersive, reading layout kept. |
| v3 | Repositioned as CTO / research sprints. Research section, press clippings, corrected facts (68 students, team credit for the humanoid, three demo venues), SEO (canonical, OG, JSON-LD, robots, sitemap). |
| v4 | Explorable floating island hub world: landmarks, fly-to camera, panels, hash routing, framed scans, 3D skill icons. |
| v5 | Realism: Poly Haven HDRI lighting, scanned PBR textures, photoreal CC0 props, GTAO + bloom + SMAA post stack. |
| v6 | Parametric arm (base, upper arm, forearm, claw sliders), reach/area/volume dome, free 3D drag including mid-air, matte bench, desktop tower, Hall of Fame for certificates, swipe gallery viewer for all images, "how I did it" write-ups, OBJ to GLB pipeline and lab hardware shelf. |
| v7 | Converter fixes (duplicate parts dropped, silkscreen textures applied, bundle meshes split, per-part simplify); all 17 boards and sensors in a lit cabinet at Skills, loaded on first visit; lab shelf replaced by the arm on a plinth; this handbook, `AGENTS.md`, `CLAUDE.md`, tests in `tools/test/`. |

---

## 4. Run, test, release

```bash
# serve (module imports fail from file://)
python3 -m http.server 8000          # then open http://127.0.0.1:8000/

# headless checks (Chromium with a DevTools port)
chromium --headless=new --remote-debugging-port=9234 --user-data-dir=/tmp/cdp about:blank &
node tools/test/v6.mjs 1440 900      # desktop: rig sliders, orbit, hall, gallery, lab
node tools/test/v6.mjs 390 844       # phone
node tools/test/drag.mjs             # drags the block into mid-air, checks the arm follows
node tools/test/skills.mjs 1440 900  # opens Skills, loads the hardware cabinet, lists fetched models
```

The test scripts print `problems: none` when there are no exceptions, console errors or
failed requests, and write PNG screenshots to the working directory. **Look at the
screenshots**; most regressions here are visual.

To stop a headless browser without killing your own shell:
`pkill -f "remote-debugging-por[t]=9234"`.

Release checklist:

1. Run both viewport tests and the drag test; read the screenshots.
2. Update the version paragraph at the top of `README.md` and the table in section 3 here.
3. `git add -A && git commit -m "Version N" && git tag -a vN.0.0 -m "Version N"`.
4. Confirm the message has no trailers: `git log -1 --format=%B`.
5. Tell the owner to push.

---

## 5. Architecture

No build. `index.html` loads one module, `js/world.js`. three.js **0.169.0** comes from
jsDelivr through an import map:

```
"three"         -> https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js
"three/addons/" -> https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/
```

```
world.js ── boot(): renderer, scene, lights, camera, composer, input, panels, loop
 ├─ bench.js    the workbench at the world origin: arm, IK, drag, reach dome, computer
 ├─ island.js   terrain, trees, paths, the landmarks, framed pictures, GLB props, places[]
 │   ├─ stations.js  small animated "rigs" (RIGS map) that landmarks stand up
 │   ├─ icons.js     12 hand-built 3D skill icons in a ring
 │   └─ realism.js   HDRI, PBR textures, loadProp (GLB), post-processing composer
 └─ realism.js
```

| File | Lines | Responsibility |
| --- | --- | --- |
| `index.html` | ~850 | All text. Intro card, readout, arm tuning panel, one `<section class="panel" data-panel>` per place, panel bar, gallery `<dialog>`. SEO head. |
| `css/styles.css` | ~1010 | Tokens, island-mode layout, panels, viewer, rig panel, `.how` breakdowns, `body.no-world` fallback. |
| `js/world.js` | ~555 | Boot, camera, pointer routing, places/panels/hash routing, gallery viewer, arm tuning bindings, render loop. |
| `js/bench.js` | ~1185 | Parametric arm, IK, pick-and-place state machine, drag, reach dome, desk and computer, telemetry screen. Also exports `roundedBox`, `hub`, `AMBER`. |
| `js/island.js` | ~690 | `buildIsland(scene)` returns `{ places, frames, skillItems, update }`. |
| `js/stations.js` | ~880 | Rig builders. Only `RIGS` is used; `PLACES`/`makeStations` are legacy from v3. |
| `js/icons.js` | ~260 | `SKILLS`, `makeSkillRing()`. |
| `js/realism.js` | ~135 | `loadEnvironment`, `pbr`, `loadProp`, `makeComposer`. |
| `js/site.js` | 30 | **Legacy, not loaded.** Safe to delete. |
| `tools/models/convert.mjs` | ~390 | OBJ to GLB converter (Node, not part of the site). |

### 5.1 Boot sequence (`world.js`)

1. `WebGLRenderer` (ACES tone mapping, exposure 1.4, soft shadows). Pixel ratio capped at 1.75 (1.5 on touch).
2. `RoomEnvironment` as instant fallback, then `loadEnvironment()` swaps in the HDRI.
3. `lights()`: hemisphere, key directional with 2048 shadow map (1024 on touch), moon fill.
4. `createBench({ scene, camera, reduceMotion, readout })`.
5. `buildIsland(scene, { reduceMotion })`.
6. `bindRig()`, `makeComposer()` (falls back to plain render on failure), `bindPointer()`, `bindPanels()` (which calls `bindViewer()` and `fromHash()`), `snapCamera()`, `requestAnimationFrame(frame)`.
7. Any exception in boot adds `body.no-world`: the canvas hides and the page reads as a normal document.

Declare everything a function uses **above** the `boot()` call at the bottom of the module,
or you get a temporal-dead-zone error.

### 5.2 Places and panels

`island.places` is an array of:

```js
{ key, panel: "#id", anchor?: "#id", label, focus: Vector3, dist, lift, dir: Vector3, hits: [Mesh] }
```

| key | Landmark (world x, z) | Panel | Nav label |
| --- | --- | --- | --- |
| `bench` | workbench at origin, desk top y = 0 | `#about` | Workbench |
| `research` | tower (-12, -10) | `#research` | Research |
| `stage` | Bheenmal stage (11, -11) | `#work` anchor `#work-robonari` | Work |
| `lab` | robotics lab (15, 3) | `#work` anchor `#work-attendance` | (no nav link) |
| `hall` | Hall of Fame (1, 16) | `#experience` | Credentials |
| `skills` | skills plinth (-15, 5) with the hardware cabinet behind it | `#stack` | Skills |
| `shed` | toolchain shed (-9, -1.5) | `#toolchain` | Toolchain |
| `mast` | radio mast (9, 12) | `#contact` | Contact |

Landmarks are rotated to face the island centre; the ground is `GROUND = -1.4`.
`dir` defaults to "from the centre side"; the shed overrides it so the camera does not pass
through the bench monitor.

- `go(key)` sets `current`, opens the panel (`.is-open`), sets `body[data-place]`, pushes the hash.
- `leave()` closes. `step(±1)` cycles. `fromHash()` handles deep links, including ids *inside* a panel.
- Nav links carry `data-place="key"`. Escape leaves, arrow keys step (unless the viewer is open).

### 5.3 Camera (`desired()`)

- Overview: spherical orbit around `(0, GROUND + 1.5, 0)`; drag orbits, wheel/pinch zooms (24 to 80), slow auto-rotate after 4 s idle.
- At a place: `eye = focus + dir·dist·zoomNudge`, raised by `lift + 1.6 + orbitTilt·dist`,
  rotated by `orbitNudge`. On desktop both eye and target shift right by `dist·0.3` so the
  landmark sits left of the panel; below 992 px they shift down by `dist·0.2`.
- At `bench` the orbit is unlimited and tilt goes to 0.9, because turning the view turns the drag plane.
- If a landmark is hidden behind trees or walls, change `dist`/`lift`/`dir` in its builder,
  or add a circle `[x, z, r]` to the `trees(scene, avoid)` list in `buildIsland`.

### 5.4 Pointer routing

`pointerdown` on the canvas: if `current.key === "bench"`, `bench.pointerDown(ndc)` returns
`"free" | "depth" | "none"`. A grab sends moves to the bench; otherwise drags orbit. A tap
(< 8 px travel) picks, nearest first, a framed picture (opens the gallery of that wall), a
skill icon, or a landmark hit box.

### 5.5 Gallery viewer

`openViewer(item, list)` where items are `{ full, src, alt }`. A 3D frame opens the list of
all frames with the same parent group; a link in a panel opens every link in its closest
`.evidence` or `.wall`. Swipe (> 40 px horizontal), arrow keys, side buttons, thumbnails,
backdrop click closes. Markup ids: `viewer`, `viewer-stage`, `viewer-img`, `viewer-prev`,
`viewer-next`, `viewer-count`, `viewer-cap`, `viewer-thumbs`.

### 5.6 Debug hook

Add `?debug` to the URL and `window.__blockScreen()` returns the block's screen position and
world coordinates. Only the tests use it.

---

## 6. The arm (`bench.js`)

**Units:** 1 scene unit = 10 cm. The UI shows centimetres.

**Parameters** (`dims`, clamped by exported `LIMITS`):

| key | default | range (units) | meaning |
| --- | --- | --- | --- |
| `base` | 0.66 | 0.45 to 1.0 | shoulder height |
| `l1` | 1.12 | 0.7 to 1.35 | upper arm |
| `l2` | 0.95 | 0.6 to 1.15 | forearm |
| `claw` | 0.34 | 0.26 to 0.44 | wrist to pad centre |

`derive()` recomputes `SHOULDER_Y, L1, L2, CLAW_LEN, D_MAX = L1+L2-0.02, D_MIN = |L1-L2|+0.06,
REACH_MAX` and moves `HOME` (the pedestal) to a reachable radius. `setDims()` then rebuilds
the arm group (`buildArm()`, which disposes the old one) and keeps joint angles.

**Reachable set.** The claw is held level, so the wrist sits `CLAW_LEN` short of the target
horizontally. The target is reachable when the wrist-to-shoulder distance `d` is in
`[D_MIN, D_MAX]`, the radial offset `rp ≥ RP_MIN (0.06)`, and `y ≥ HALF` (block half-height
0.12). `clampToEnvelope(v)` projects any point onto that set, and **every goal and the block
are clamped before use**, so the arm never chases an unreachable point.

**IK** (`solveTo`): yaw `atan2(-z, x)`; law of cosines for elbow `a2 = -acos(...)`;
shoulder `a1 = atan2(dy, dx) - atan2(L2 sin a2, L1 + L2 cos a2)`; wrist `a3 = -(a1 + a2)`.
Angles are damped toward targets each frame; yaw wraps the short way.

**State machine** (`sequence`): `AT REST → TRACKING → APPROACH → DESCEND → CLOSING → LIFTING →
CARRYING → PLACING → RELEASING → CLEARING → AT REST`. Each step has a distance tolerance and a
timeout. When idle for 4.2 s (and motion is allowed) it places the block at a random
reachable spot, sometimes mid-air, and fetches it. A user grab always forces `TRACKING`.

**Dragging**: grabbing the block → `free` mode on a plane facing the camera through the block
(moves up/down/sideways); grabbing the amber ring → `depth` mode on a horizontal plane at the
block's height. Tap the ring toggles lift. Tap the desk sends the block there. No gravity.

**Stats** (`stats()`): reach and top in cm; floor area `π(R² − r²)` in cm²; working volume by
Pappus (profile polygon area × centroid path) in litres. The same profile
(`envelopeProfile()`) is lathed into the translucent dome.

**Desk**: `buildTower` (mid-tower with window and fans at x ≈ -4.55), `buildMonitor`
(canvas terminal via `makeScreen`, redrawn every 140 ms), `buildKeyboard`, mouse, mug, a small
board, cables. The desk top itself (wood, 8.6 × 5.2) is built in `island.js workbenchDesk`.

HTML hooks: readout `#j1..#j4 #claw #hgt #mode`; tuning `#rig` with `#rig-base #rig-l1
#rig-l2 #rig-claw #rig-reset` and outputs `#rig-reach #rig-top #rig-area #rig-volume`.

---

## 7. The island (`island.js`)

- `M` holds shared materials (PBR via `pbr(name, opts)`: `forest_ground_04`, `rocky_terrain_02`,
  `wood_table_worn`, `metal_plate`).
- `frame(parent, {src, full, w, h, alt}, size, x, y, z, ry, frames)`: a framed picture; pushes
  its picture mesh into `frames` (clickable).
- `honour(parent, item, x, y, z, frames)`: Hall of Fame frame (brass moulding, mount, lamp,
  engraved plate with `item.title` and `item.sub`).
- `rig(name, scale, reduceMotion, updaters)`: a `RIGS` builder; its `update` joins the loop.
- `plinth(r, h)`, `hitBox(group, w, h, d, y)`, `sign(text)`, `landmark(scene, key, x, z)`.
- `loadProp(name, size)` (realism.js) loads `assets/models/<name>.glb`, scales its largest
  dimension to `size`, centres it on x/z and stands it on y = 0. For converted models pass
  the category path, e.g. `loadProp("boards/raspberry-pi-5", 1.1)`.
- Anything animated must push a function `(dt, t) => {}` into `updaters`.
- `buildIsland` returns `visit(key)`; `world.go()` calls it every time a place opens. Use it
  for anything heavy that should load only when needed.

### 7.1 Hardware cabinet

`cabinet(skill.group, updaters, reduceMotion)` builds an open, lit display cabinet 5.2 units
behind the skills plinth (local z = -5.2, 11.4 wide, 4.9 tall) with three shelves:

| Shelf | Models (`assets/models/...`) |
| --- | --- |
| top | `boards/` arduino-uno, arduino-mega-2560, arduino-nano-every, esp32-nodemcu, raspberry-pi-5, raspberry-pi-4b, raspberry-pi-zero |
| middle | `sensors/` hc-sr04-ultrasonic, pir-motion, ir-sensor, dht11-temperature-humidity, imu-accelerometer-gyroscope |
| bottom | `sensors/` mq135-air-quality, mq2-gas-smoke, ldr-light-sensor, rain-sensor, touch-sensor |

Each slot has a canvas name plate. The list lives in the `HARDWARE` constant; edit it to add
or reorder models. Models load on the first visit to Skills (`visit("skills")`); phones load
only `PHONE_SET` (six models). Boards lean back (`rotation.x = 0.85`) so their silkscreen
faces the camera; sensors sway slowly. The robotic arm GLB is not in the cabinet; it turns on
a plinth in the robotics lab.

---

## 8. Content (`index.html`)

Section ids: `bench` (intro), `about`, `research`, `work` (`work-robonari`, `work-attendance`,
`work-kinelink`, `work-servo`, `work-camp`), `experience`, `stack`, `toolchain`, `contact`.

Writing style, established with the owner:

- Plain, specific, first person, British spelling. No hype words.
- Work entries follow **constraint → how I did it (numbered steps) → why it worked**, inside
  `<div class="how">` with `<h4>` headings and `<ol class="steps">`, each step starting with a
  bold short title.
- Analysis of *why* a decision was good is allowed; new facts are not.

**Verified facts** (source in brackets):

- Robonari humanoid: robot built by a team led by scientist Narayan Jangid over three years;
  he built the software layer in three months as a diploma student; Raspberry Pi 3B+ with 1 GB,
  headless over SSH (PuTTY) and VNC, `wpa_supplicant.conf` by hand; DLIB compiled from source
  with CMake on the Pi, four hours; recognition remembers who was greeted and treats team vs
  strangers differently; GPT-3.5-turbo streaming with persona by speaker; gTTS + ffmpeg;
  UART protocol Arduino Nano ↔ Pi with potentiometer feedback; 25 kg·cm metal-geared servos;
  Raspbian Lite kept ~70% RAM free; shown on stage in Bheenmal, March 2024; four regional
  papers: Marudhar Aaina, Dainik Nirala, Sach Media, Jagruk Times (clippings in
  `assets/press/`) [Projects.csv, clippings].
- Attendance system: led four people; fully local, no AI APIs; DLIB compiled from source
  because wheels failed; DLIB + OpenCV; Iriun Webcam over Wi-Fi; Tkinter offline GUI; Excel
  reports (name, timestamp, date); 1st prize, best CSE final-year project, Government
  Polytechnic College Jodhpur, Sep 2022 to May 2023 [Projects.csv].
- KineLink: studied DAWN / Avatar Robot Café; built in seven days, June 2025; zero-PCB, tape
  roller base; MediaPipe Pose (shoulder, elbow, wrist), arctan2 angles, MediaPipe Hands fist
  for gripper; serial protocol index/angle/terminator, Arduino or ESP32; Tkinter sliders +
  AI mode; repo `KINEMLINK_RELEASE` [Projects.csv].
- Servo arm: XY and XZ planes, own step interpolation, Bluetooth from a laptop, Arduino Mega
  → ESP32 migration after wireless ceiling, manual angle-to-duty-cycle, PWM 50 Hz; shown at
  PROMETEO 2025 (IIT Jodhpur), Taabar Mela Jodhpur, MBM faculty workshop; repo
  `SAC-SmartArmController` [Projects.csv].
- Mount Abu camp: PM SHRI Kendriya Vidyalaya, 13 to 18 January 2025, 68 students, co-trained
  with Neha; Python, core AI, computer vision, maths [Navjyoti clipping].
- Roles: CTO CoShot (Aug 2026–), CTO Basttl Media (Jun 2026–), DevOps Tech Lead EPIC
  (Oct 2024–Oct 2025), AI Systems and Robotics Intern RoboAI Hub (Nov 2023–Aug 2025), workshop
  trainer (Jan 2025), ML intern Academor (Nov–Dec 2023). Education: B.E. CSE MBM University
  2023–2026; Diploma CS Government Polytechnic College Jodhpur 2021–2023, grade 9.97.
  Twenty-four certifications in total.
- Public repos cited: `Enterprise-LLM-Chatbot-Admin`, `INDIAN_LABOR_LAW_ADVISOR`,
  `KINEMLINK_RELEASE`, `SAC-SmartArmController`, `StudyPods-v4.0`.

SEO lives in the `<head>`: title, description, canonical, Open Graph and Twitter tags with
`assets/og-card.jpg`, JSON-LD `@graph` (Person, WebSite, ProfilePage). Keep `sitemap.xml`
`lastmod` current when content changes. `robots.txt` disallows `/data/`.

---

## 9. Styling (`css/styles.css`)

- Tokens on `:root`: `--ground #070d0c`, `--ink #dfe6df`, `--muted`, `--rule`, `--phosphor
  #f0a31e` (amber, reserved for live or interactive things), fonts Archivo (sans), Newsreader
  (serif body), IBM Plex Mono.
- Island mode is everything under `body:not(.no-world)`: fixed masthead, intro card, panels
  that slide in from the right (`width: min(36rem, 100vw)`).
- **Breakpoint**: `max-width: 61.99rem` switches panels to a bottom sheet of `58vh`.
- `.readout` and `.rig` are only visible when `body[data-place="bench"]`.
- Do not put `transform` on `.intro`; it traps its fixed-position children.
- Grids use `minmax(min(Xrem, 100%), 1fr)` so nothing overflows at 390 px.
- Images need `width`/`height` attributes and `height: auto` or they stretch.

---

## 10. Assets

```
assets/
  shivender.jpg, og-card.jpg
  press/   newspaper clippings, <name>.jpg + <name>-full.jpg
  events/  event and work photos, same pairing
  certs/   certificates, same pairing (thumb ~280 px wide, full size for the viewer)
  bench/   photos of the real workstation
  hdri/    workshop_1k.hdr (Poly Haven, CC0)
  tex/     <set>_diff.webp, _nor.webp, _rough.webp (Poly Haven, CC0)
  models/  Poly Haven props (flat), plus boards/ sensors/ robotics/ from the converter,
           and catalog.json
```

File names are kebab-case with a year where known. Every picture has a thumbnail and a
`-full.jpg` for the viewer.

### Recipes

**Add a certificate**
1. Put `x.jpg` (≈280 px wide) and `x-full.jpg` in `assets/certs/`.
2. In `index.html`, add a `<figure>` inside `#experience .wall` (copy a neighbour; set real
   `width`/`height` and alt text).
3. In `island.js hall()`, add `[slug, w, h, alt, TITLE, sub]` to `certs`. The wall holds 6 + 5;
   for more, add a row or widen `W` and move `STEP`.

**Add a work entry**: copy an `<article class="entry">` in `#work`, give it an id, follow the
constraint → steps → why structure, attach evidence in `<figure class="evidence">`. To give it
its own place, add a landmark builder and a `places` entry with `anchor: "#your-id"`.

**Add a place**: write a builder returning `{ group, focus, dist, lift, hits }`, call it in
`buildIsland`, add it to `all` (for paths) and to `places`, add a panel section with
`data-panel`, and a nav link with `data-place`. Add a tree-avoid circle.

**Add a 3D model**: convert it (section 11), then `loadProp("category/id", size)` and add the
holder to a landmark group. Check the screenshot; tilt flat boards with `rotation.x` so they
read from the camera.

---

## 11. Model pipeline (`tools/models/convert.mjs`)

Input: `data/raw/<slug>/model_N.obj` (+ optional `.png` textures), extracted from the zips in
`3d models/`. Output: `assets/models/<category>/<id>.glb` and an entry in `catalog.json`
(`id, name, category, file, parts, sourceTriangles, triangles, bytes, upAxis, size`).

```bash
cd tools/models && npm install   # @gltf-transform/*, meshoptimizer, sharp
node convert.mjs ../../data/raw ../../assets/models            # all
node convert.mjs ../../data/raw ../../assets/models arduino-uno # one slug
```

Large models need `NODE_OPTIONS=--max-old-space-size=12000`.

Steps, in order:

1. **Streaming OBJ parse** per part: positions, optional vertex colours, normals, UVs (v flipped).
2. **Drop exact duplicate parts** (same triangle count, bounds and sampled vertices). The ESP32
   export repeats 30 real parts 780 times; Pi Zero 6 of 162; rain 15 of 390; LDR 16 of 416.
3. **Split single-mesh models** (≤ 3 parts, no UVs) into connected components so pieces can
   be coloured separately.
   Also split any non-flat part without UVs that covers more than half the board footprint:
   those are bundles of every component (the Pi 4B has several) and would otherwise paint
   the board one colour.
4. **Board detection**: every flat part whose footprint is ≥ 85% of the widest flat part.
5. **Textures** (there are no `.mtl` files): images named top/front go on the highest UV board
   layer, bottom/back on the lowest, `board_albedo`/`basecolor` on UV board layers,
   `comp_albedo`/`fabric` on the largest non-flat UV part. Resized, flattened over the board
   colour, JPEG.
6. **Colour by shape** (`classify`) for untextured parts: board, pin, metal, plastic, ivory;
   all matte; sRGB converted to linear.
7. **Simplify per part** (weld, meshopt simplify to a category budget: boards 140k,
   sensors 45k, robotics 90k triangles), widening the error bound if still over budget; then
   `join`, regenerate normals, dedup, prune, reorder, quantize, `EXT_meshopt_compression`.

Verify with `data/tools/preview.html?only=boards` (renders the catalog in a grid).
The site loads GLBs with `GLTFLoader` + `MeshoptDecoder`, so meshopt compression is required
and supported.

Budget guidance: keep any single GLB under ~3 MB; the lab and cabinet together should stay
under ~25 MB, and phones should load a reduced set.

---

## 12. Realism (`realism.js`)

- HDRI → PMREM → `scene.environment`, intensity 0.55.
- Post stack: `RenderPass`, `GTAOPass` (desktop only), `UnrealBloomPass` threshold **0.97**
  (only true emitters glow; lower it and framed scans wash out), `OutputPass`, `SMAAPass`
  (desktop only).
- Picture frames use `MeshStandardMaterial` (not Basic) so bloom does not blow them out.

---

## 13. Known pitfalls

| Symptom | Cause / fix |
| --- | --- |
| `Cannot access X before initialization` | A `let/const` used by `boot()` is declared below the boot call. Move the call to the end. |
| Test shows old code | Navigating to the same URL with only a new hash does not reload. Go to `about:blank` first and add `?v=timestamp`. |
| Fixed HUD elements misplaced | A `transform` on an ancestor (`.intro`). |
| Scans glow white | Bloom threshold lowered or frames switched to `MeshBasicMaterial`. |
| Camera arrives behind a landmark | `dir` points outward. It should point from the landmark toward the centre. |
| Tree in the shot | Add an avoid circle in `trees(...)`. |
| Push rejected | A file over 100 MB (raw zips). Keep `3d models/` ignored. |
| Converted model washed out | Colours written as sRGB into a linear factor; convert with `lin()`. |
| Pins turn into spikes | Simplifying the joined mesh with a large error; simplify per part. |
| Horizontal overflow on phones | A grid `minmax` floor wider than the screen. |

---

## 14. Backlog

- Watch the MQ-2 and Pi 4B colours after any converter change (both are coloured by shape,
  not texture).
- Delete legacy `js/site.js` and the unused `PLACES`/`makeStations` in `stations.js`.
- Update `sitemap.xml` `lastmod` on each content release.
- Consider WebP thumbnails for press and certificate images.
