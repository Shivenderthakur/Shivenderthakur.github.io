# Testing and release

This document covers how to check a change and how to ship a version. It covers the checks a
coding agent may run, the browser tests only the owner runs, a manual browser checklist for
Version 8, the release checklist, known pitfalls and the open backlog. Read it before you
finish any change and before every release. The rules it enforces come from
[AGENTS.md](../AGENTS.md) and section 1 of the [handbook](HANDBOOK.md).

All distances are in metres unless stated. Ground positions are given as (x, z) on the floor
at `GROUND = -1.4`. Inside the workbench (`bench.root`) one unit is 10 cm.

## Contents

1. [Who may run what](#1-who-may-run-what)
2. [Agent checks](#2-agent-checks)
3. [Owner checks: the browser tests](#3-owner-checks-the-browser-tests)
4. [Manual browser checklist for Version 8](#4-manual-browser-checklist-for-version-8)
5. [Release checklist](#5-release-checklist)
6. [Known pitfalls](#6-known-pitfalls)
7. [Open issues and backlog](#7-open-issues-and-backlog)

---

## 1. Who may run what

AGENTS.md rule 8 forbids agents from launching any browser, headless or visible, and from
running `tools/test/*.mjs`. This holds until the owner explicitly enables browser use. Agents
commit locally (AGENTS.md rule 2) and never push; the owner pushes.

| Check | Command | Agent | Owner |
| --- | --- | --- | --- |
| Syntax of every module | `for f in js/*.js; do node --check "$f" \|\| echo "FAIL $f"; done` | yes | yes |
| Campus layout | `node tools/checks/zones.mjs` | yes | yes |
| GLB sizes, triangles, extensions | `node tools/models/glb-audit.mjs assets/models` | yes | yes |
| Character rig and measure report | `blender -b --python tools/character/rig.py -- ...` (section 2.4) | yes | yes |
| Other headless Blender renders | `blender -b ...` | yes | yes |
| Serve the site | `python3 -m http.server 8000` | no | yes |
| Headless Chromium | `chromium --headless=new --remote-debugging-port=9234 ...` | no | yes |
| Browser tests | `node tools/test/v6.mjs`, `drag.mjs`, `skills.mjs` | no | yes |
| Manual browser checklist | section 4 | no | yes |
| Push | `git push && git push --tags` | no | yes |

At the end of a change, an agent reports what it ran and hands the owner the commands in
section 3 and the checklist in section 4.

---

## 2. Agent checks

None of these needs a browser or a network connection.

### 2.1 Syntax

`node --check` parses a file without running it. It checks **only the first file** it is
given; any further names become arguments to that script. `node --check js/*.js` therefore
checks `js/bench.js` alone and exits 0 even if a later file is broken. Loop instead:

```bash
for f in js/*.js; do node --check "$f" || echo "FAIL $f"; done
```

Expected output: nothing. There are currently 11 modules: `bench.js`, `campus.js`, `hud.js`,
`icons.js`, `island.js`, `layout.js`, `player.js`, `realism.js`, `site.js`, `stations.js` and
`world.js`.

This is a parse check only. The modules import `three` through the import map in
`index.html`, which Node cannot resolve, so they cannot be run under Node. The exception is
`js/layout.js`, which has no imports; `tools/checks/zones.mjs` imports it.

### 2.2 Campus layout

```bash
node tools/checks/zones.mjs
```

The script imports `js/layout.js` and checks the layout for a walker of radius
`PLAYER_RADIUS`. It prints every door (spawn) with the zones that contain it, the start point,
the overlapping zone pairs, the collider and platform counts, and then one of these results:

- `PASS: N checks`, exit code 0;
- `FAIL: N of M checks`, followed by one line per failure naming the zone, collider or
  landmark at fault, exit code 1.

Current output (15 September 2026, working tree):

```
doors:
  bench     spawn ( -0.45,   1.35)  heading 3.14  in zones: bench
  research  spawn ( -7.00, -11.40)  heading 3.14  in zones: research
  stage     spawn ( 11.20,  -6.00)  heading 1.57  in zones: stage
  lab       spawn ( 10.40,   7.00)  heading 1.57  in zones: lab
  hall      spawn (  0.00,  11.65)  heading -0.00  in zones: hall
  skills    spawn ( -8.30,   2.00)  heading -1.57  in zones: skills
  shed      spawn ( -9.10, -10.00)  heading -1.57  in zones: shed
  mast      spawn (  8.00, -12.40)  heading 3.14  in zones: mast
start (0, 4.2) heading 3.14
overlapping zones: research/shed, stage/mast
colliders 41 (+3 workbench footprints), platforms 10

PASS: 662 checks
```

The script checks that:

- every door is inside its own zone, clear of every collider (including the desk, tower and
  chair), on the ground (no raised floor) and within `ISLAND.walk` of the centre;
- where zones overlap, the nearest zone centre wins and every door resolves to its own place;
- the start is in no zone and clear of everything;
- the workbench zone and door equal the numbers `bench.js` uses;
- nothing on the campus overlaps the desk, tower or chair, and no collider stands in the
  workbench zone;
- planters (`PLANTERS`) and lamps (`LAMPS`) are at least `WALKWAY_CLEAR` from every walkway
  (`BUSES`);
- every landmark faces the plaza.

Run it after any change to `js/layout.js` or to the desk, chair or seat constants in
`js/bench.js`. The workbench numbers are copied into the script by hand (see
[section 6](#6-known-pitfalls)). For the layout itself, see [Campus](campus.md) and
[World and controls](world-and-controls.md).

### 2.3 GLB audit

```bash
node tools/models/glb-audit.mjs assets/models
```

The script uses only `node:fs` and `node:path`, so it needs no `npm install`. It walks the
folder for `.glb` files and prints one line per file, then a total:

```
  1854 KB    32k tris  ext:meshopt_compression+texture_webp+mesh_quantization img:webp,webp,webp character/hacker.glb
...
TOTAL 15.8 MB in 34 files
```

The columns are size in KB, triangles in thousands, the glTF extensions used (with the `KHR_`
or `EXT_` prefix removed) and the image types embedded. Every one of the 34 files currently
uses `EXT_meshopt_compression`. Compare the total and any changed line with the budgets in
[Assets and pipelines](assets-and-pipelines.md).

### 2.4 Character rig and measure report

`tools/character/rig.py` rigs and animates the hacker in headless Blender and measures every
clip. Usage, from the script's docstring:

```
blender -b --python tools/character/rig.py -- SRC.glb OUT.glb RENDER_DIR [TARGET_TRIS]
```

`SHEETS=Walk,Sit` in the environment renders only those contact sheets. The source sculpt and
the outputs live under `data/`, which is gitignored:

```bash
(cd data && blender -b --python ../tools/character/rig.py -- raw-character/source/Hacker.glb \
  "$PWD/tmp/char/hacker-rigged.glb" "$PWD/tmp/char/sheet" 32000 | grep '^MEASURE')
```

Expected output: `MEASURE OK []`. A failure prints `MEASURE FAILED` followed by the list of
reasons. Next to `OUT.glb`, the script writes:

| File | Contents |
| --- | --- |
| `OUT.json` | `height`, `walkSpeed`, `runSpeed`, `seatHeight`, `keyboardReach`, `clips`, `clipSeconds` |
| `OUT-measure.json` | `ok`, `fails`, and per clip the measured numbers (for example `edge_growth_max_m`, `sole_slip_m_L`, `ground_speed_mps`) |
| `RENDER_DIR` | front and side contact sheets |

`rig.py` does **not** stop when a measure fails. It prints the line, writes both JSON files
and exports the GLB anyway. Always read the `MEASURE` line, or read the report from the
repository root:

```bash
node -e 'const r = require(process.argv[1]); console.log("ok", r.ok, "fails", r.fails); for (const [c, v] of Object.entries(r.clips)) console.log(c, "edge growth", v.edge_growth_max_m, "m")' \
  "$PWD/data/tmp/char/hacker-rigged-measure.json"
```

The current report (`data/tmp/char/hacker-rigged-measure.json`) gives `ok true fails []` for
Idle, Walk, Run, Point, Sit and SitType. The largest edge growth is 0.0754 m, in SitType.

The web GLB comes from `tools/character/optimise-character.mjs SRC.glb OUT.glb`, which also
writes `OUT.json`. `assets/models/character/` holds only `hacker.glb` and `hacker.json`; the
measure report is not committed. For the full pipeline, see [Character](character.md).

### 2.5 Other Blender renders

Agents may use `blender -b` for renders. The only committed script that renders is `rig.py`
(its contact sheets). Blender 5.2 as installed on the owner's machine cannot import
meshopt-compressed GLBs. The import fails with `Meshopt decoder library not found at
/usr/lib/blender/5.2/scripts/addons_core/io_scene_gltf2/libbf_intern_meshopt_bridge.so`, so none of
the 34 files in `assets/models/` can be opened directly. Render an uncompressed file instead, such as
the GLB `rig.py` exports (its `export_scene.gltf` call applies no meshopt compression), or decode the
file with gltf-transform first. No committed tool does that decoding.

---

## 3. Owner checks: the browser tests

### 3.1 Requirements

- The site served on port 8000. Every test loads `http://127.0.0.1:8000/index.html`.
- Chromium listening for DevTools on port 9234 (`HOST` in each test) with at least one page
  open. Each test picks the first target of type `page` from `/json/list`.
- A Node with global `fetch` and `WebSocket` (Node 22 or later). The owner's machine has
  v26.7.0.

### 3.2 Commands

The tests write their PNG screenshots to the **current directory**, and `.gitignore` does not
ignore `*.png`. Run them from a folder outside the repository so `git add -A` cannot pick them
up.

```bash
# terminal 1, in the repository root
python3 -m http.server 8000

# terminal 2
chromium --headless=new --remote-debugging-port=9234 --user-data-dir=/tmp/cdp about:blank &
REPO="/run/media/deadpirate/New Volume/portfolio"
mkdir -p ~/portfolio-shots && cd ~/portfolio-shots
node "$REPO/tools/test/v6.mjs" 1440 900
node "$REPO/tools/test/v6.mjs" 390 844
node "$REPO/tools/test/drag.mjs"
node "$REPO/tools/test/skills.mjs" 1440 900
```

Each test first navigates to `about:blank` and then to the page with `?v=<timestamp>`, so a
changed file is always reloaded. Look at every screenshot; the printed values are not
assertions.

### 3.3 What each test does

| Script | Viewport | Loads | Steps | Screenshots | Printed |
| --- | --- | --- | --- | --- | --- |
| `v6.mjs [w] [h]` | argument; mobile emulation when width < 600 | `#about` (teleports to the workbench and sits) | reads `#rig-reach`, `#rig-top`, `#rig-area`, `#rig-volume`; sets `#rig-l1` and `#rig-claw` to maximum, then all four sliders to minimum; clicks `#rig-reset`; drags from (20 %, 75 %) to (5 %, 60 %) of the screen; clicks `[data-place="hall"]`; opens the first `#experience .wall a` in the viewer and steps once; clicks `#panel-next`; sets the hash to `#work-attendance` | `v6-d-*.png` or `v6-m-*.png`: `bench`, `long`, `short`, `orbit`, `hall`, `viewer`, `lab` | rig stats three times, `hud:` (`#mode`, `#claw`, `#hgt`), `viewer:` (open, count, thumbnail count), `overflow:` (expect `false`), `problems:` (expect `none`) |
| `drag.mjs` | 1440 × 900 | `?debug#about` | sends a keydown for `x`; waits until `#mode` reads `AT REST`; uses `window.__blockScreen()` to find the block, drags it up the screen and releases | `drag-air.png`, `drag-fetch.png` | block world position before, during and after the drag; `arm:`; `problems:` |
| `skills.mjs [w] [h]` | argument | `#stack` (teleports to the Skills lab) | waits 25 s | `skills-d.png` or `skills-m.png` | `models fetched:` (every `boards/` and `sensors/` GLB with its HTTP status; expect 200), `problems:` |

`problems` collects uncaught exceptions. `v6.mjs` and `skills.mjs` also collect console errors
and failed network requests, and `v6.mjs` adds console warnings.

### 3.4 What the tests cover in Version 8

The three tests were written for the Version 6 and 7 interface. They were last changed in the
`Version 7` commit (b328cb3, 14 September 2026) and are unchanged in the Version 8 working tree.
They load the page through deep links and element IDs that still exist, so they still check:

- the page loads without exceptions, console errors or failed requests;
- `#about` teleports the hacker into the chair (`go()` calls `sitDown({ instant: true })`);
- the arm tuning sliders rebuild the arm and update the readouts;
- the header link to the hall teleports there;
- the gallery viewer opens and steps;
- a deep link to an entry (`#work-attendance`) opens its panel;
- the hardware cabinet loads its models when the Skills lab is visited (`island.visit("skills")`
  calls `hardware.load()`);
- the block can still be dragged in the seated view;
- a 390 px viewport has no horizontal overflow.

They do **not** exercise anything new in Version 8:

- walking, running, collisions or floor heights (no movement key is ever pressed);
- entry zones opening and closing panels, or the dismissed state;
- walking into the workbench zone to sit, or standing up;
- tapping the desk so the hacker points and the arm places the block;
- the armctl console and its commands;
- the two desk monitors;
- the hardware close-up (`#closeup-enter` is never clicked);
- the compass, radar, objective line or thumb stick;
- `prefers-reduced-motion`.

Parts of the tests no longer mean what their names say:

- The `orbit` step in `v6.mjs` drags while seated. From the chair a drag only leans the view,
  within `SEAT_NUDGE` (yaw ±0.45 rad).
- The `x` keydown in `drag.mjs` does nothing in Version 8. The window `keydown` handler in
  `world.js` `bindKeys()` responds only to the movement keys, Shift and Escape. The other
  `keydown` listeners are on the console input (`hud.js`) and the gallery viewer
  (`bindViewer()` in `world.js`, arrow keys only); none handles `x`.
- `drag.mjs` still needs its wait for `AT REST`: left alone for 4.2 s, the arm moves the block by
  itself (the `STATE.REST` branch in `bench.js`, skipped under reduced motion).

Until the tests are updated ([section 7](#7-open-issues-and-backlog)), Version 8 behaviour is
checked by hand with section 4.

---

## 4. Manual browser checklist for Version 8

Serve the site (`python3 -m http.server 8000`) and open `http://127.0.0.1:8000/`. Go through
the list once at 1440 × 900 on a desktop browser and once at 390 × 844. The thumb stick is
created only when `(pointer: coarse)` matches, so use a real phone or device emulation with
touch enabled for the phone pass. Keep the developer console open throughout; it should show
no errors and no failed requests.

For what each control is meant to do, see [World and controls](world-and-controls.md),
[Workbench](workbench.md) and [Campus](campus.md).

### 4.1 Intro and walking

| # | Do | Expect |
| --- | --- | --- |
| 1 | Load the page with no hash | Intro card; the camera circles the hacker; no HUD |
| 2 | Click Explore (`#explore`), or press W | Play mode: the HUD appears (compass, radar, objective) |
| 3 | WASD or the arrow keys | The hacker walks relative to the camera; the Walk clip's feet do not slide |
| 4 | Hold Shift while walking | The hacker runs |
| 5 | Drag the view, then stop | The camera turns; about 1.6 s after the drag, walking swings it back behind the hacker |
| 6 | Mouse wheel | Zooms between the standing near and far limits |
| 7 | Walk into a wall, planter or lamp | The hacker stops at it; it does not pass through |
| 8 | Walk onto a raised floor (lab, shed, hall) | The feet follow the floor height |
| 9 | Click the wordmark | Back to the intro card; the HUD hides |

### 4.2 Zones, panels and links

| # | Do | Expect |
| --- | --- | --- |
| 1 | Walk into each building's entry zone | Its panel opens and the address bar shows its hash; walking out closes it |
| 2 | Close a panel by hand while still inside the zone | It stays closed until you walk out and back in |
| 3 | Stand at the research and toolchain doors, then the stage and contact doors (the overlapping pairs) | Each door opens its own panel, with no flicker |
| 4 | Click each header link (`[data-place]`) | The hacker teleports to that building's door and its panel opens |
| 5 | Panel arrows (`#panel-prev`, `#panel-next`) | Teleport to the previous or next place |
| 6 | Load `/#work-attendance` directly | The hacker is at the lab and the Work panel is scrolled to that entry |
| 7 | Browser back and forward | The panel and position follow the hash |
| 8 | Escape with a panel open | The panel closes |

### 4.3 Workbench: sitting

| # | Do | Expect |
| --- | --- | --- |
| 1 | Walk into the workbench zone, centre (-0.35, 0.75) | The hacker walks round to the spot behind the chair, (-0.45, 1.35), and sits facing the desk; the seat bar shows; About does not open |
| 2 | First time seated | The console prints `armctl console. Type help for the commands.` |
| 3 | About on the seat bar (`#seat-about`) | The About panel opens and closes; the view moves clear of it |
| 4 | Header Workbench link from elsewhere | Teleports straight into the chair with About open |
| 5 | Drag in the seated view | The view leans only a little (yaw ±0.45 rad); the wheel zooms 0.7 to 1.45 times |
| 6 | Stand up (`#seat-stand`), Escape with no panel open, or a fresh press of a movement key | The hacker steps back and stands; walking away and back sits again |

### 4.4 Workbench: pointing, placing and dragging

| # | Do | Expect |
| --- | --- | --- |
| 1 | Tap a spot on the desk top | The hacker points at it; the arm picks up the block and sets it there; the console prints `armctl> ` with the equivalent command and the result |
| 2 | Tap far out on the desk | The block goes to the edge of the reach envelope and the console gives the reason (for example `out of reach, clamped to N cm`) |
| 3 | Tap the pedestal | The reason reads `on the pedestal` |
| 4 | Tap a monitor, the tower or the chair where it covers the desk | The block does not move (these are the `blockers` in `bench.js`) |
| 5 | Drag the block, then its amber ring | The block follows the pointer; on release the arm fetches it back to the pedestal |
| 6 | Wait about 5 s without touching anything | The arm moves the block by itself (not under reduced motion) |
| 7 | Tuning sliders in `#rig`, then `#rig-reset` | The arm rebuilds and the readouts update; reset restores the defaults |

### 4.5 armctl console

| # | Do | Expect |
| --- | --- | --- |
| 1 | Click the console input and type | The hacker's hands move to the keyboard (SitType); letters never walk |
| 2 | `help` (or an empty line) | The command list |
| 3 | `status`, `reach` | State, claw, block position; reach figures |
| 4 | `place 12 8`, then `armctl place 12 8 3` | The block moves; the leading `armctl` is accepted; the answer says if the target was moved onto the envelope |
| 5 | `home` | The block returns to the pedestal |
| 6 | `set l1 12`, then `set l1 99` | The arm rebuilds and the reach line updates; the second answer reads `clamped to N cm (range lo to hi cm)` |
| 7 | `reset` | Default links and the block home |
| 8 | `home` while dragging the block | `home: the block is being dragged, let go first` |
| 9 | ArrowUp and ArrowDown in the input | Earlier lines come back |
| 10 | Right monitor | Shows the telemetry and the latest console lines |

### 4.6 Monitors, close-up and gallery

| # | Do | Expect |
| --- | --- | --- |
| 1 | Watch the left monitor while seated | A project still every 5 s, sliding in over 0.8 s |
| 2 | Walk to the Skills lab | The hardware box (`#closeup`) shows `Hardware cabinet` and the board and sensor count |
| 3 | Enter the close-up (`#closeup-enter`) | The camera moves to the first model; the label and `1 of N` update |
| 4 | Arrow keys or the prev and next buttons, then Escape or exit | Steps along the shelves, then back out to the cabinet |
| 5 | Tap a certificate frame in the hall | The viewer opens with every frame on that wall |
| 6 | Click a picture link in a panel's evidence strip | The viewer opens with that strip; arrow keys step; thumbnails select; a video item plays |
| 7 | Press a movement key with the viewer open | The hacker does not move |

### 4.7 Reduced motion

Turn on `prefers-reduced-motion: reduce` (in the operating system, or through the browser's
rendering emulation) and reload.

| # | Do | Expect |
| --- | --- | --- |
| 1 | Walk | The camera does not swing behind by itself |
| 2 | Sit, stand, teleport, enter a close-up | The camera cuts to the new view instead of gliding |
| 3 | Sit and wait | The arm does not move the block by itself; the tower fans are still |
| 4 | Left monitor | Slides change without the slide animation |
| 5 | Campus | No pulses travelling along the circuit traces; rim tiles and the skill icon ring are static |

### 4.8 Phone pass (390 × 844)

| # | Do | Expect |
| --- | --- | --- |
| 1 | Thumb stick | Walks; a full push (over 0.85) runs |
| 2 | Pinch in the seated view | Zooms within 0.7 to 1.45 |
| 3 | Sit at the workbench | The console runs along the bottom and the desk sits in the upper part of the frame |
| 4 | Every panel and the viewer | Readable; `document.documentElement.scrollWidth > innerWidth` in the console returns `false` |

---

## 5. Release checklist

Tags are `vN.0.0` (annotated) and the release commit subject is `Version N`. Existing tags run
from `v1.0.0` to `v7.0.0`; list them with
`git log --tags --simplify-by-decoration --format='%d %ad %s' --date=short`.

1. Run the agent checks in section 2: the syntax loop prints nothing, `zones.mjs` ends in
   `PASS`, and the GLB audit total is within budget.
2. The owner runs the browser tests (section 3) and the manual checklist (section 4), and looks
   at every screenshot.
3. [README.md](../README.md) has no version paragraph. Check that its "What a visitor can do"
   and "Controls" sections still match the release.
4. Add the version's entry to [CHANGELOG.md](../CHANGELOG.md), and update the version table in
   the [handbook](HANDBOOK.md) (the `v8 (in progress, not committed)` row).
5. Set `<lastmod>` in `sitemap.xml` to the release date.
6. Every new claim on the site must trace to `data/`, `assets/press/`, `assets/certs/` or a
   public repository ([Content and facts](content-and-facts.md)).
7. Review what will be committed:

   ```bash
   git status --short
   git ls-files -co --exclude-standard -z | xargs -0 du -k | sort -n | tail -5
   ```

   Nothing from `3d models/` or `data/` may appear, and no stray screenshots (`*.png` from the
   tests). No file may approach GitHub's 100 MB limit. Every `??` (untracked) entry in
   `git status --short` must be included. For Version 8 these are `CHANGELOG.md`,
   `assets/models/character/`, the new `docs/*.md` files (`architecture.md`,
   `assets-and-pipelines.md`, `campus.md`, `character.md`, `content-and-facts.md`,
   `styling.md`, `testing-and-release.md`, `workbench.md`, `world-and-controls.md`),
   `js/hud.js`, `js/layout.js`, `js/player.js`, `tools/character/`, `tools/checks/`,
   `tools/models/glb-audit.mjs` and `tools/models/optimise-icons.mjs`.
8. Commit and tag with plain messages and no trailers:

   ```bash
   git add -A
   git commit -m "Version 8"
   git tag -a v8.0.0 -m "Version 8"
   ```

9. Confirm there is no attribution:

   ```bash
   git log -1 --format=%B                # exactly: Version 8
   git cat-file -p v8.0.0 | tail -n +6   # exactly: Version 8
   git log --format=%B | grep -ciE 'co-authored-by|claude|generated with'   # 0
   ```

   If a trailer appears, amend the commit (`git commit --amend -m "Version 8"`) and recreate
   the tag (`git tag -d v8.0.0` and tag again) before anything is pushed.
10. The owner pushes: `git push && git push --tags`.

---

## 6. Known pitfalls

| Symptom | Cause and fix |
| --- | --- |
| A syntax error ships although `node --check js/*.js` passed | `node --check` checks only its first argument. Use the loop in section 2.1. |
| `Cannot access X before initialization` on load | A `let` or `const` that `boot()` uses is declared below the call. `world.js` calls `boot()` at the end of the file (`try { boot(); } catch (err) { fail(err); }`); keep it there. |
| A test screenshot shows old code | Navigating to the same URL with only a new hash does not reload the page. The tests go to `about:blank` first and add `?v=<timestamp>`; do the same by hand. |
| Screenshots end up in a commit | The tests write PNGs to the current directory, and `.gitignore` has no rule for them. Run the tests outside the repository (section 3.2). |
| Push rejected | A file over 100 MB, usually from the raw archives. `3d models/` and `data/` are in `.gitignore`; keep them there. |
| Framed scans glow white | The bloom threshold in `realism.js` (`UnrealBloomPass`, 0.97) was lowered. Only true emitters should pass it. |
| The whole desk looks dirty or dark | The GTAO radius is in metres. `realism.js` uses `AO_NEAR` (radius 0.06, thickness 0.12) seated or in a close-up and `AO_FAR` (0.35, 0.7) while walking; a walking-sized radius at the desk shades everything next to a 2.4 cm block. |
| Something on the desk is ten times too big or too small | The world is in metres, but `bench.root` has `ROOT_SCALE = 0.1`, so inside it one unit is 10 cm. Convert only at the root, as `bench.js` does. |
| A door, planter or panel is in the wrong place after a layout change | Run `node tools/checks/zones.mjs`; it names the zone or collider at fault. |
| `zones.mjs` passes but the hacker sits in the wrong place | `bench.js` imports three, so `zones.mjs` cannot import it. The desk, tower, chair, `BENCH_ZONE` and `APPROACH` numbers are copied into the check by hand. After changing `DESK`, `SEAT`, `APPROACH_Z` or `TOWER` in `bench.js`, update the copy in `zones.mjs` and `BENCH` in `layout.js`. |
| Walk or run speed, or the typing reach, is wrong after re-rigging | `player.js` fetches `hacker.json` and falls back silently to `FALLBACK` (`walkSpeed: 1.1591`, `runSpeed: 3.1298`, `seatHeight: 0.46`, `keyboardReach: 0.46`) for any value that is missing or not positive. Regenerate `hacker.json` with the GLB, and update `FALLBACK` when the measured numbers change. |
| A broken character GLB was exported | `rig.py` exports even after `MEASURE FAILED`. Check the `MEASURE` line or `ok` in the measure report before optimising. |
| A bone lookup returns `undefined` | GLTFLoader strips dots from node names, so `UpperArm.R` is `UpperArmR` at runtime. `player.js` looks bones up with the dot removed first. |
| Blender cannot open a GLB from `assets/models/` | Every shipped GLB uses `EXT_meshopt_compression`, and the installed Blender 5.2 lacks its meshopt bridge library. Render an uncompressed source instead (section 2.5). |
| `Cannot find package '@gltf-transform/core'` running the character optimiser | Node resolves packages from the script's own folder and its parents, not the working directory, and `NODE_PATH` does not help. Copy the script from `tools/character/` into a folder with a `node_modules` link to `data/tools/node_modules` (for example `data/tmp/anim/`) and run the copy there; see [Character](character.md#where-its-packages-come-from). |
| Converted model washed out | sRGB colours written into a linear colour factor. `convert.mjs` converts them with `lin()`. |
| Horizontal overflow on phones | A grid `minmax` floor wider than the screen. `css/styles.css` uses `minmax(min(Xrem, 100%), 1fr)`. |

---

## 7. Open issues and backlog

Each item was checked against the working tree on 15 September 2026.

| Item | Detail |
| --- | --- |
| Browser tests do not cover Version 8 | `tools/test/` has no test for walking, zones, sitting, pointing and placing, armctl, the monitors, the close-up, the HUD or reduced motion (section 3.4). With `?debug`, `window.__world` exposes `scene`, `camera`, `renderer`, `island`, `bench`, `player`, `hud` and `composer`, which a new test can use. |
| Stale steps in the old tests | Remove the `x` keydown from `drag.mjs`, and rename or rework the `orbit` step in `v6.mjs`, which only leans the seated view. |
| `rig.py` exits 0 on a failed measure | It prints `MEASURE FAILED` and still exports. It should exit non-zero before exporting. |
| No committed GLB decoder for Blender | The shipped GLBs cannot be imported by the installed Blender (section 2.5). |
| Tower footprint in `zones.mjs` differs from `bench.js` | The check uses 0.25 m in x × 0.5 m in z. `makeColliders()` in `bench.js` gives 0.205 m in x × 0.425 m in z (0.82 × 1.7 units × `TOWER.scale` 2.5 × `ROOT_SCALE`). The copy is larger, so the check errs on the safe side, but the two should match. |
| Stale comment in `world.js` `checkZones()` | It names "stage and lab" as an overlapping pair. `zones.mjs` reports `research/shed` and `stage/mast`. |
| Handbook command | `docs/HANDBOOK.md` section 4 gives `node --check js/*.js`, which checks only `js/bench.js` (section 2.1). |
| Legacy code | Nothing imports `js/site.js`. `js/stations.js` still exports `PLACES` and `makeStations`, but `island.js` imports only `RIGS` from it. |
| MQ-2 colours | `sensors/mq2-gas-smoke.glb` has no textures (the audit shows `img:-`), so its colours come from the converter's shape classification. Check it after any change to `tools/models/convert.mjs`. |
| Largest skin stretch | The measure report's largest `edge_growth_max_m` is 0.0754 m in SitType. See [Character](character.md) for the cause. |
