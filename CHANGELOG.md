# Changelog

This file records what changed in each version of the portfolio site, newest first, in the
style of [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Read it to find out when a
feature, asset or rule arrived and which commit brought it. Each entry is written from the
commit messages and `git show --stat` of the tagged commit and the commits before it, the
version table in section 3 of [the handbook](docs/HANDBOOK.md), and the version paragraphs in
`README.md` as it stood at each tagged commit (for example `git show v7.0.0:README.md`).
Where a commit message has no body (Version 6, Version 7 and commit `8a21d28`), the entry
relies on the diffs of `README.md`, `docs/HANDBOOK.md` and the code in
that commit.

Releases are tagged `vN.0.0` with the commit subject `Version N` (see
[docs/testing-and-release.md](docs/testing-and-release.md)). Dates are the commit dates of
the tagged commits. To list them:

```bash
git log --tags --simplify-by-decoration --format='%d %ad %s' --date=short
```

Units: from Version 8 the world is in metres, with the ground at `GROUND = -1.4` and
positions given as (x, z). Inside the workbench group one unit is 10 cm. Versions 1 to 7
used unitless scene units, and the numbers quoted for them keep those units.

## Contents

- [Unreleased](#unreleased)
  - [Version 8 working tree (2026-09-15, uncommitted)](#version-8-working-tree-2026-09-15-uncommitted)
  - [Commit 8a21d28 (2026-09-15, untagged)](#commit-8a21d28-2026-09-15-untagged)
- [7.0.0 - 2026-09-14](#700---2026-09-14)
- [6.0.0 - 2026-09-14](#600---2026-09-14)
- [5.0.0 - 2026-09-14](#500---2026-09-14)
- [4.0.0 - 2026-09-14](#400---2026-09-14)
- [3.0.0 - 2026-09-12](#300---2026-09-12)
- [2.0.0 - 2026-09-11](#200---2026-09-11)
- [1.0.0 - 2026-09-11](#100---2026-09-11)
- [Open issues](#open-issues)

---

## Unreleased

Nothing after `v7.0.0` is tagged yet. Two sets of changes exist: one commit made by the owner
after Version 7, and the Version 8 working tree on top of it.

### Version 8 working tree (2026-09-15, uncommitted)

The campus becomes a walkable world at real scale. The reader plays a rigged hacker
character, and the workbench becomes a desk where the character sits and operates the arm.
Details: [docs/world-and-controls.md](docs/world-and-controls.md),
[docs/character.md](docs/character.md), [docs/workbench.md](docs/workbench.md),
[docs/campus.md](docs/campus.md).

#### Added

- A playable character, `assets/models/character/hacker.glb`, 1.75 m tall, with the clips
  `Idle`, `Walk`, `Run`, `Point`, `Sit` and `SitType`. `hacker.json` holds the measured
  numbers (`walkSpeed` 1.1591 m/s and `runSpeed` 3.1298 m/s at playback rate 1,
  `seatHeight` 0.46 m, `keyboardReach` 0.46 m) and the clip lengths.
- `tools/character/rig.py`, a headless Blender script that decimates the owner's static
  sculpt, corrects its stance, builds a 19-bone skeleton, computes skin weights, authors the
  six clips and measures each one. `tools/character/optimise-character.mjs` cleans the
  animation tracks and compresses the result for the web.
- `js/player.js` (`createPlayer()`, `inRect()`, `route()`): third-person walking with
  collisions, floor heights, sitting at the desk, standing up and a layered `Point`.
- `js/hud.js` (`createHud()`): a compass bar with a bearing for every building, a heading-up
  radar, an objective line, a thumb stick on touch screens, the seat bar and the armctl
  console.
- `js/layout.js`: every campus position in metres, with no imports (`LANDMARKS`, `BENCH`,
  `ZONES`, `SPAWNS`, `COLLIDERS`, `PLATFORMS`, `START` at (0, 4.2), `heightAt()`).
- `tools/checks/zones.mjs`, a plain Node check of `js/layout.js` (doors, zones, colliders,
  walkways, the workbench contract). Run it with `node tools/checks/zones.mjs`; it exits 1
  on any failure.
- Entry zones: standing in a building's zone opens its panel and leaving closes it.
- Controls: WASD or the arrow keys walk, Shift runs, dragging turns the camera, the wheel or
  a pinch zooms.
- Two modes in `js/world.js`: `intro` (the camera circles the character behind the intro
  card) and `play` (third-person follow camera).
- A desk and chair at the workbench. The character sits, points at a tapped spot, and the
  arm (about 23 cm of reach) places the block there. The seated camera is framed by
  `SEAT_VIEW` in `js/world.js`.
- The armctl console (`command()` in `js/bench.js`) with the commands `help`, `status`,
  `place`, `home`, `reach`, `set` and `reset`, in centimetres from the arm's base.
- Two desk monitors: the left one shows a slideshow of the project photos
  (`projectSlides()` in `js/world.js`), the right one is the armctl terminal.
- `loadGLTF()` in `js/realism.js`, which loads a glTF with its animations, and `aoSpan()` on
  the composer, which switches the ambient occlusion radius between the seated or close-up
  views (6 cm) and walking (35 cm).
- `tools/models/glb-audit.mjs`, which lists size, triangle count, extensions and image types
  for every GLB under a folder (`node tools/models/glb-audit.mjs assets/models`).
- `tools/models/optimise-icons.mjs`, which compresses the skill icons without simplifying
  them (512 px WebP textures, quantised attributes, meshopt).

#### Changed

- The world is in metres, and every object is sized next to a 1.75 m person: a 75 cm desk
  top, a 46 cm chair seat, certificate frames at most 36 cm across. The bench is built
  inside a group scaled by `ROOT_SCALE = 0.1` in `js/bench.js`, so one bench unit is 10 cm.
- Clicking a building, a header link, the panel arrows or a deep link teleports the
  character to that building's door. Before, the camera flew there.
- Restyle in a 2010s instrument look. Type moves from Archivo, Newsreader and IBM Plex Mono
  to Titillium Web, IBM Plex Sans and Share Tech Mono (`--sans`, `--body`, `--mono` in
  `css/styles.css`). The canvas terminal in `js/stations.js` also uses Share Tech Mono.
- `tools/models/convert.mjs`: triangle budgets drop from 140,000 to 45,000 for boards, from
  45,000 to 18,000 for sensors, and from 90,000 to 45,000 for the robotic arm. Silkscreen
  textures are 1024 px (boards) or 512 px (sensors) WebP instead of 2048 px or 1024 px JPEG.
- Re-optimised GLBs: six boards, nine sensors, the robotic arm, nine skill icons and
  `catalog.json`. `assets/models/` is 28.5 MB at `8a21d28` and 15.8 MB in the working tree,
  including the 1.9 MB character.
- `README.md` is rewritten as the project front page (what a visitor can do, controls,
  armctl commands, project structure, documentation map, credits, known limitations) and
  links to this changelog. `docs/HANDBOOK.md` gains section 5a on walking the campus.

### Commit 8a21d28 (2026-09-15, untagged)

"Tech campus, skills, hardware close-up, WebP images and demo videos", made by the owner
after Version 7. The commit message has no body; this entry is written from its diff.

#### Added

- `js/campus.js`: poured-concrete ground, a plaza round the workbench, lit pads under the
  buildings, walkways drawn as buses of copper traces, planters, street lights and glass
  curtain walls. `js/island.js` lays the landmarks out as a campus facing the plaza, each
  turned to the nearest quarter turn.
- Nine skill icons as free glTF models in `assets/models/icons/` (books, brain, computer,
  eye, flask, penguin, robot, snake, speech bubble), from Poly Pizza and Kenney, credited in
  `README.md` and on the Skills panel. Machine learning keeps a hand-built network.
- A hardware close-up at Skills: "Look closer", previous and next buttons, and Back step
  the camera through the cabinet's boards and sensors (`setCloseup()` in `js/world.js`,
  `#closeup` in `index.html`).
- Five demo videos in `assets/video/` (KineLink, the labour law chatbot, the RoboNari audio
  module, servo arm hand tracking, servo arm pick and place). They play in the gallery
  viewer through links marked `data-video`.
- Certificates: ITK AI internship (2023), RoboAI Hub robotics internship (2025), Cisco
  CCNAv7 Introduction to Networks (2023), Cisco Networking Essentials (2022), Academor
  machine learning internship with Flutura and course with Kshitij (2023), and AWS Community
  Builders with devTown Python and AI.
- New event photos: three from the Mount Abu camp (classroom, machine learning lesson,
  smartboard), the acrylic servo arm assembly and build, the Swavalamban Kaushal Mela 2025,
  and the Taabar mela stall and arm demo.
- [docs/ASSETS.md](docs/ASSETS.md), the owner's map of every picture, and
  `tools/assets/place.py`, which places replacement pictures from the gitignored
  `assets/tmp/` folder (a dry run by default, `--apply` to write).
- `AGENTS.md` rule 8 and handbook rule 9: agents do not launch a browser or run
  `tools/test/*.mjs`.

#### Changed

- Every picture under `assets/bench/`, `assets/certs/`, `assets/events/` and
  `assets/press/` is converted from JPEG to WebP (58 JPEG files replaced).
  `assets/og-card.jpg` and `assets/shivender.jpg` stay JPEG.
- The Hall of Fame puts its certificates in two rows that shrink to fit the wall once there
  are more than twelve.
- `AGENTS.md` rules 3 and 4: a certificate in `assets/certs/` counts as evidence, and photos
  of schoolchildren from the owner's own classes and demonstrations are allowed (owner's
  decision, 15 September 2026).
- `sitemap.xml` `lastmod` is 2026-09-15.

#### Removed

- The `forest_ground_04` PBR texture set from `assets/tex/`, and its credit in `README.md`.

---

## 7.0.0 - 2026-09-14

Commit `b328cb3`. The commit message has no body.

### Added

- A lit display cabinet behind the Skills plinth holding all seventeen boards and sensors,
  each with a name plate. They load the first time Skills is opened; phones load six.
- `docs/HANDBOOK.md`, `AGENTS.md` and `CLAUDE.md`.
- Test scripts `tools/test/v6.mjs`, `tools/test/drag.mjs` and `tools/test/skills.mjs`, and
  `tools/models/preview.html`.

### Changed

- `tools/models/convert.mjs` drops duplicate parts, applies the archives' silkscreen
  textures, splits bundled meshes and simplifies part by part. The ESP32 NodeMCU GLB goes
  from 7.6 MB to 1.6 MB and the Raspberry Pi Zero from 2.2 MB to 0.4 MB. All seven boards,
  seven of the ten sensors and the arm are re-converted, and `catalog.json` is updated.
- `sitemap.xml` `lastmod` is 2026-09-14.

### Removed

- The hardware shelf in the robotics lab; the arm on its plinth stays.

---

## 6.0.0 - 2026-09-14

Commit `544018d`. The commit message has no body.

### Added

- A parametric arm. The "Tune the arm" panel sets base height, upper arm, forearm and claw
  in centimetres (one scene unit is 10 cm) and rebuilds the geometry. From the same numbers
  it computes the reach and top, the floor area π(R² − r²), and the working volume (by
  Pappus's theorem on the reach profile), and draws that profile as a translucent dome. The
  pedestal and the rest and carry poses scale with the arm.
- Free 3D dragging: the block moves in the plane facing the camera, into mid-air. The amber
  ring slides it across the desk at its height, and a tap on the ring lifts or lowers it. An
  HGT readout gives the height in centimetres.
- A desktop computer beside the arm: a mid-tower with a side window and turning fans,
  cabled to the arm's base. Its monitor terminal shows link lengths, reach, volume, joint
  angles, target position and state.
- A Hall of Fame for the eleven certificates: brass frames, lamps and engraved plates.
- A gallery viewer for every picture on the site, with swipe, arrow keys, side buttons and a
  thumbnail strip.
- Longer write-ups explaining how each piece of work was done.
- `tools/models/convert.mjs` and `tools/models/package.json`: an OBJ to GLB converter with a
  streaming OBJ parser, per-part matte material classification, meshoptimizer
  simplification to a per-category triangle budget, and `EXT_meshopt_compression`.
- Converted models in `assets/models/`: seven boards, ten sensors, the robotic arm, and
  `catalog.json`.
- A hardware shelf in the robotics lab (Uno, Pi 5, Pi 4B, Nano Every and seven sensors) and
  the arm on a turntable; phones load two models.
- `3d models/` (the raw CAD and OBJ archives) added to `.gitignore`.

### Changed

- The workbench is matte: the arm uses powder-coat and anodised finishes with no clearcoat,
  and so do the tower, monitor, keyboard and props. The skill icons keep physical materials.
- The credentials hall becomes the Hall of Fame.

---

## 5.0.0 - 2026-09-14

Commit `214900b`.

### Added

- `js/realism.js`: lighting from a photographed workshop HDRI
  (`assets/hdri/workshop_1k.hdr`), scanned PBR texture sets in `assets/tex/`
  (`forest_ground_04`, `rocky_terrain_02`, `wood_table_worn`, `metal_plate`) and a
  post-processing stack of ground-truth ambient occlusion, SMAA and a high-threshold bloom.
  Phones skip the occlusion and SMAA.
- Six photoreal props as meshopt GLBs with WebP textures, fitted from their measured bounds
  on load: circuit board, classic laptop, arm desk lamp, metal toolbox, industrial
  microscope and television. All assets are CC0 from Poly Haven, credited in `README.md`
  (about 6 MB in total).

### Changed

- The arm, desk and skill icons move to physical materials: anodised metal, clearcoated
  solder mask with printed traces, glossy plastic and glass.
- Trees become layered pines with bark. The stage humanoid is rebuilt with lathed fabric, a
  clearcoat head, a forward visor and jointed arms.

### Fixed

- The toolchain shot approaches at an angle, so the workbench monitor no longer fills a
  phone screen.

---

## 4.0.0 - 2026-09-14

Commit `9f09be8`.

### Added

- `js/island.js`: a floating island you explore. Drag to orbit, the wheel or a pinch zooms,
  and clicking a landmark flies the camera to it and opens its section as a panel beside it.
- Eight landmarks facing the centre: the workbench with the live arm, a research tower with
  the sprint dials, the Bheenmal stage with four newspaper clippings on its backdrop, a
  robotics lab with three rigs, a credentials hall with eleven certificates, a ring of
  twelve 3D skill icons, a toolchain shed with photos of the real bench, and a radio mast
  for contact.
- `js/icons.js`: skill icons built from primitives rather than vendor logos.
- A URL for each place, arrow keys to step between places, and Escape to return to the
  island.
- Evidence from the LinkedIn media export: two more Bheenmal newspaper clippings (Jagruk
  Times, Sach Media), the attendance system poster, KineLink photos, the AI on Edge faculty
  workshop, other event photos, eleven certificates in `assets/certs/` and bench photos in
  `assets/bench/`.
- A fallback: without WebGL the island is skipped and the HTML reads as a normal page.

### Changed

- Navigation moves from scrolling along a bench to exploring an island. `js/world.js` is
  largely rewritten.
- The existing press thumbnails are recompressed.

---

## 3.0.0 - 2026-09-12

Commit `15514bc`. The site is repositioned from a student embedded developer to a CTO who
runs paid research sprints. Every claim now traces to the LinkedIn export, a newspaper scan
or a public repo (see [docs/content-and-facts.md](docs/content-and-facts.md)).

### Added

- A Research practice section: the seven-day sprint, and a note that fields far from tech
  take longer.
- The attendance system entry: a four-person team, led by the owner, that won first prize
  across all final-year CSE projects.
- A "Where I work" section naming the editors as text, with generic bench props in 3D
  instead of vendor marks.
- A Certifications section, including three CCNA tracks.
- Three newspaper clippings in `assets/press/` and an event photo in `assets/events/`,
  placed in the DOM next to the claims they support.
- SEO: canonical link, Open Graph and Twitter cards with a 1200 × 630 `assets/og-card.jpg`,
  a Person, WebSite and ProfilePage JSON-LD graph, `robots.txt` and `sitemap.xml`.
- 3D: the bench extended to -62.5 units, with the grid following its length, three new rigs,
  sprint dials, a roll-call plate wall and a tool bench.
- The LinkedIn export added to `.gitignore`.

### Changed

- Rigs beyond 26 units are hidden, not just left unstepped.
- Grid tracks use `minmax(min(...), 1fr)`, so a fixed floor cannot push the page wider than
  a phone.

### Fixed

- The Mount Abu camp taught 68 students from 13 to 18 January, not "more than fifty", as the
  Navjyoti clipping shows.
- The humanoid entry credits the team led by the scientist Narayan Jangid and claims only
  the software layer and the stage appearance.
- The servo arm is shown at three venues, not one.
- The newspaper count is no longer asserted; the page shows the clippings it has.

---

## 2.0.0 - 2026-09-11

Commit `4f35459`, with the work in `380c51c` ("Put the whole page inside one workshop").

### Added

- `js/world.js`: one fixed, dark 3D scene behind the whole page, with the text over it.
- A bench the length of the page, with a station per section. Scrolling moves the camera
  along the bench, from the arm, past the serial link, the three project rigs and the
  boards, to a long shot down the bench.
- Each shot places its rig to the right of the text, with a gradient scrim keeping the
  writing legible.
- A palette of vellum on pine, with amber for anything live.

### Changed

- `js/arm.js` is renamed to `js/bench.js` and `js/accents.js` to `js/stations.js`. Both now
  build into a scene they do not own and step on the world's clock.
- Station anchors are re-measured once web fonts load and whenever the page height changes.
- The camera eases on elapsed time rather than a capped frame delta, so slow devices keep
  up with scrolling.

### Removed

- The light editorial layout with the 3D in separate boxed panels.

---

## 1.0.0 - 2026-09-11

Commit `5aee124`, with the work in `40b8e4c` (2026-09-09), `305401e`, `a2114c1`, `f2e7220`,
`96baaae` (2026-09-10) and `bc9e13e` (2026-09-11). A light editorial page with the 3D in
boxed panels.

### Added

- A static single page with no build step: `index.html`, `css/styles.css`, `js/site.js`,
  the portrait `assets/shivender.jpg` and `.nojekyll`. The content (work, experience,
  education, hardware and software inventory) comes from the LinkedIn profile.
- A hero panel with a robotic arm in three.js that solves its own joint angles
  (`js/arm.js`). The idle motion is disabled under `prefers-reduced-motion`.
- A robotic work cell: a payload block to drag or tap into place, a turret that turns the
  short way round, a claw that opens and closes around the block, and a pick-and-place state
  machine (approach, descend, grip, lift, carry, place on a pedestal, clear, return).
- An amber lift ring and a dashed drop line, so the block can be raised into the air and
  stays where it is left.
- A lit room with a cyclorama, an overhead light bar and a pedestal; ACES tone mapping,
  room-environment reflections and a contact shadow.
- `js/accents.js`: live windows beside the writing (face landmarks, a hand pose driving a
  gripper, a two-link trace across two planes, the boards, and a UART frame on a serial
  line), all sharing one WebGL context.
- A workbench scene: the arm, a monitor with a terminal showing the telemetry, keyboard,
  mouse, mug, a dev board and a cable.
- A touch control mode: the panel takes gestures only after a tap, so a vertical swipe still
  scrolls the page.

### Changed

- The block and every goal the sequence sets are clamped to the arm's real 3-DOF reach
  envelope, shown as an amber arc while dragging. A full pick and place takes about five
  seconds instead of eight.
- Materials retuned for a dark background.

### Fixed

- The portrait no longer renders stretched (208 × 720 instead of 208 × 208), because image
  height is now `auto`.
- The wide inventory window no longer collapses to 300 px; the `justify-self` rule is scoped
  to the grid items that need it.
- The block no longer falls back to the floor after being placed in the air.
- The hero panel lands near 3:2 instead of about 1.1:1 on common laptop sizes.
- Accent captions are cleared when WebGL is unavailable.

---

## Open issues

- Version 8 is not committed or tagged; before release, follow the checklist in
  [docs/testing-and-release.md](docs/testing-and-release.md).
- The two rule lists are numbered differently (browser rule: `AGENTS.md` rule 8,
  `docs/HANDBOOK.md` rule 9); cite rules by name, not number.
- Commit `8a21d28` added three uncommented entries to `.gitignore` (`.gi`, `socketiogpt`
  and `media`) in place of blank lines. Their purpose is not recorded.
- `assets/models/boards/raspberry-pi-zero.glb` and
  `assets/models/sensors/dht11-temperature-humidity.glb` are unchanged in the Version 8
  working tree; the other boards, sensors and the arm were re-optimised.
- The character has known skinning limits (a largest edge stretch of 7.5 cm in `SitType`,
  and no finger bones). See [docs/character.md](docs/character.md).
