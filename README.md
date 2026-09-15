# Shivender Singh Thakur: portfolio campus

This is the portfolio site of Shivender Singh Thakur, Chief Technology Officer at CoShot. It is a
static site built on three.js 0.169.0 with no build step, published on GitHub Pages. You explore it
as a hooded hacker, 1.75 m tall, walking round a tech campus built to real scale in metres. Walk
into a building and its part of the page opens as an HTML panel. At the central workbench the
hacker sits at a desk, and from the chair you drive a desktop robotic arm. All the text on the site
is ordinary HTML in `index.html`, so without WebGL it reads as a normal page.

This file is the front page for the repository. If you are going to change the code, read
[docs/HANDBOOK.md](docs/HANDBOOK.md) and [AGENTS.md](AGENTS.md) first.

## Contents

1. [What a visitor can do](#what-a-visitor-can-do)
2. [Controls](#controls)
3. [Run it locally](#run-it-locally)
4. [Deploy](#deploy)
5. [Project structure](#project-structure)
6. [Documentation](#documentation)
7. [Tech stack](#tech-stack)
8. [Credits and licences](#credits-and-licences)
9. [Known limitations](#known-limitations)

## What a visitor can do

- **Walk the campus.** The intro card has an "Enter the campus" button, and pressing any walking
  key also starts play. A compass bar and a radar (`js/hud.js`) show the bearing to every building.
- **Enter buildings.** Each building has an entry zone. Walking into it opens that building's
  panel, and walking out closes it. The header links and a click on a building take the hacker
  straight to its door. Every panel has a URL (`#research`, `#work-robonari` and so on), so a link
  can open directly into a place.
- **Sit at the desk.** Walking into the workbench zone, or picking Workbench in the header, sits the
  hacker in the chair. From there the seat bar offers About, Stand up and the armctl console.
- **Point and place.** Click or tap a spot on the desk. The hacker points at it, and the arm picks
  up the block and sets it down there. The console prints the equivalent armctl line. You can also
  drag the block itself, or the ring above it.
- **Use armctl.** Type commands into the console (see the table below). The right-hand desk monitor
  shows the terminal. The left-hand monitor is a slideshow of the project photos from the Work and
  Research panels.
- **Open the gallery.** A click on a framed picture in the world, or on a picture in a panel, opens
  one viewer that holds the rest of that wall or evidence strip. It includes the demo videos.
- **Look at the hardware up close.** At the Skills lab, "Look closer" moves the camera along the
  hardware cabinet one board or sensor at a time.

### Places

The keys, building labels and panels are defined in the `places` array in `js/island.js`. That
array also sets the visiting order that the panel arrows follow (`step` in `js/world.js`). `ORDER`
in `js/layout.js` lists the same keys and drives the entry zones, the door positions and the zone
check in `tools/checks/zones.mjs`. Nothing ties the two lists together, so when you reorder one,
reorder the other too.

| Key | Building | Header link | Panel it opens |
| --- | --- | --- | --- |
| `bench` | The workbench | Workbench | `#about` (walking into the zone only sits the hacker; the seat bar's About button, the header link, a `#about` link, the panel arrows or a click on the workbench opens the panel) |
| `research` | Research tower | Research | `#research` |
| `stage` | Bheenmal stage | Work | `#work`, at `#work-robonari` |
| `lab` | Robotics lab | none | `#work`, at `#work-attendance` |
| `hall` | Credentials hall | Credentials | `#experience` |
| `skills` | Skills lab | Skills | `#stack` |
| `shed` | Toolchain | Toolchain | `#toolchain` |
| `mast` | Say hello | Contact | `#contact` |

## Controls

Keyboard input is handled by `bindKeys` in `js/world.js`, pointer input by `bindPointer` in
`js/world.js`, and the thumb stick and console keys by `createHud` in `js/hud.js`. The thumb stick
appears only on devices with a coarse pointer.

| Action | Keyboard and mouse | Touch |
| --- | --- | --- |
| Walk | `W` `A` `S` `D` or the arrow keys | Thumb stick |
| Run | Hold `Shift` | Push the stick past 85 % of its radius |
| Look around | Drag on the scene | Drag on the scene |
| Camera distance | Mouse wheel | Two-finger pinch |
| Go to a building | Click it, or use a header link | Tap it, or use a header link |
| Previous or next place | Arrow buttons on the panel bar | Same |
| Close a panel | `Escape` or the Close button | Close button |
| Sit at the desk | Walk into the workbench, or use the Workbench link | Same |
| Stand up | Stand up button, `Escape` with no panel open, or a new press of a walking key | Stand up button |
| Point and place the block | Click the desk | Tap the desk |
| Move the block | Drag the block (moves in the plane facing the camera) or its ring (slides at the same height) | Same |
| Lean the seated view | Drag empty space | Same |
| Console history | `ArrowUp` and `ArrowDown` in the console input | |
| Leave the console input | `Escape` (a second `Escape` stands up) | |
| Hardware close-up | "Look closer" at the Skills lab, `ArrowLeft` and `ArrowRight` to move, `Escape` or Back to leave | Buttons |
| Gallery viewer | `ArrowLeft` and `ArrowRight`, side buttons, thumbnails; close with `Escape`, the × button or a click on the backdrop | Swipe, thumbnails; close with the × button or a tap on the backdrop |
| Back to the intro | Click the name in the header | Tap the name |

### armctl commands

These are the commands listed by `help` in `run()`, which `command()` calls, in `js/bench.js`.
A command may start with the word `armctl`, which is ignored. Coordinates are centimetres from the
arm's base: x to your right, z toward you, h up.

| Command | Effect |
| --- | --- |
| `help` | List the commands |
| `status` | State, claw, and where the block is |
| `place <x> <z> [h]` | Move the block to that point |
| `home` | Put the block back on the pedestal |
| `reach` | How far the arm reaches with its current links |
| `set <base\|l1\|l2\|claw> <cm>` | Change one link, for example `set l1 12`; out-of-range values are clamped |
| `reset` | Restore the default links and send the block home |

## Run it locally

The browser blocks ES module imports from a `file://` page, so serve the folder instead.

1. From the repository root, start a static server:

   ```bash
   python3 -m http.server 8000
   ```

2. Open http://localhost:8000.

To check the campus layout without a browser, run the zone check under Node. It exits with code 1
if any check fails:

```bash
node tools/checks/zones.mjs
```

The model tools `tools/models/convert.mjs` and `tools/models/optimise-icons.mjs` need the Node
packages listed in `tools/models/package.json`, and the repository has none installed. Install them
next to the scripts before you run either tool:

```bash
npm install --prefix tools/models
```

`tools/models/glb-audit.mjs` uses only Node built-ins and needs no install. For how to use each
tool, and for the copy of the packages already installed under `data/tools/`, see
[docs/assets-and-pipelines.md](docs/assets-and-pipelines.md#4-tool-environment).

The screenshot tests in `tools/test/` need a Chromium instance with remote debugging on port 9234
and the site on port 8000. The owner runs them; see
[docs/testing-and-release.md](docs/testing-and-release.md).

## Deploy

The `origin` remote is `git@github.com:Shivenderthakur/Shivenderthakur.github.io.git`, a GitHub
Pages user site. `sitemap.xml` and `robots.txt` give the address as
https://shivenderthakur.github.io/.

1. Commit locally. Release commits use the subject `Version N` and the tag `vN.0.0`, with no AI
   attribution (see [AGENTS.md](AGENTS.md)).
2. The owner pushes. GitHub Pages serves the files as they are.

The empty `.nojekyll` file at the root stops GitHub Pages running Jekyll over the folder. There is
nothing to build.

## Project structure

These are the main paths in the site and its tooling. `data/` (the LinkedIn export),
`3d models/` (the raw CAD archives) and `assets/tmp/` are listed in `.gitignore` and are never
committed.

```
index.html                  all site text: intro card, masthead, one panel per place, the viewer
css/styles.css              type, colour, HUD, panels, and the stacked page used without WebGL
js/world.js                 entry module: renderer, intro and play modes, cameras, input, zones,
                            panels, deep links, console wiring, hardware close-up, gallery viewer
js/player.js                the hacker: clips, walking, collisions, sitting, pointing
js/hud.js                   compass, radar, thumb stick, seat bar and armctl console
js/layout.js                every campus position in metres; no imports, so Node can check it
js/island.js                terrain, buildings and places, built from layout.js
js/campus.js                ground, plaza, pads, walkways, planters, street lights, doors
js/bench.js                 desk, chair, tower, arm (inverse kinematics), block, armctl, monitors
js/stations.js              the smaller rigs at the buildings
js/icons.js                 the skill objects in a ring at the Skills lab
js/realism.js               HDRI lighting, PBR surfaces, GLB prop loading, post-processing
js/site.js                  legacy, not loaded by index.html
assets/
  shivender.jpg, og-card.jpg
  press/ events/ certs/ bench/   WebP images, each with a -full version for the viewer
  video/                    demo clips (.mp4) with WebP posters
  hdri/workshop_1k.hdr      environment lighting
  tex/                      PBR texture sets (WebP)
  models/                   GLB models: boards/ sensors/ robotics/ icons/ character/,
                            Poly Haven props, and catalog.json
tools/
  checks/zones.mjs          layout check under Node
  character/rig.py          Blender script that rigs and animates the hacker
  character/optimise-character.mjs   compresses the rigged GLB and writes its JSON
  models/convert.mjs        OBJ archives to compressed GLBs, recorded in catalog.json
  models/optimise-icons.mjs compresses the skill icon GLBs
  models/glb-audit.mjs      lists size, triangles, extensions and image types of GLBs
  models/preview.html       previews the models in catalog.json
  models/package.json       Node dependencies for the model tools
  assets/place.py           places replacement pictures under their official names
  test/v6.mjs, test/drag.mjs, test/skills.mjs   screenshot tests over Chrome DevTools Protocol
docs/                       see Documentation below
AGENTS.md, CLAUDE.md        rules for coding agents
robots.txt, sitemap.xml, .nojekyll
```

## Documentation

| Document | Covers |
| --- | --- |
| [docs/HANDBOOK.md](docs/HANDBOOK.md) | Entry point: rules, overview and a map of the other documents |
| [docs/architecture.md](docs/architecture.md) | Modules, boot sequence and how they connect |
| [docs/world-and-controls.md](docs/world-and-controls.md) | Modes, cameras, input, zones and panels |
| [docs/character.md](docs/character.md) | The rigged hacker, its clips and the rig pipeline |
| [docs/workbench.md](docs/workbench.md) | Desk, arm, pick and place, armctl and the monitors |
| [docs/campus.md](docs/campus.md) | Layout in metres, buildings and the zone check |
| [docs/assets-and-pipelines.md](docs/assets-and-pipelines.md) | GLB, texture and image pipelines |
| [docs/content-and-facts.md](docs/content-and-facts.md) | Site text and where each claim is sourced |
| [docs/styling.md](docs/styling.md) | CSS, HUD look and the no-WebGL page |
| [docs/testing-and-release.md](docs/testing-and-release.md) | Checks, screenshot tests and releases |
| [docs/ASSETS.md](docs/ASSETS.md) | The owner's map of every picture and how to replace one |
| [CHANGELOG.md](CHANGELOG.md) | Changes by version |

## Tech stack

| Part | Detail |
| --- | --- |
| Rendering | three.js 0.169.0, loaded from `cdn.jsdelivr.net` through the import map in `index.html` (`three` and `three/addons/`) |
| three.js add-ons used | `js/world.js`: `RoomEnvironment`. `js/realism.js`: `RGBELoader`, `GLTFLoader`, `MeshoptDecoder` (`libs/meshopt_decoder.module.js`), and the post-processing add-ons `EffectComposer`, `RenderPass`, `GTAOPass`, `UnrealBloomPass`, `SMAAPass`, `OutputPass`. No other module imports from `three/addons/` |
| Fonts | IBM Plex Sans, Share Tech Mono and Titillium Web, from Google Fonts |
| Build | None. The site is plain HTML, CSS and ES modules with no package manager or bundler. The only external resources at runtime are three.js from jsDelivr and the fonts from Google Fonts |
| Model tools (not shipped) | Node with `@gltf-transform/core`, `@gltf-transform/extensions`, `@gltf-transform/functions`, `meshoptimizer`, `obj2gltf`, `sharp` (`tools/models/package.json`) |
| Character rig (not shipped) | Blender, run headless: `blender -b --python tools/character/rig.py -- SRC.glb OUT.glb RENDER_DIR [TARGET_TRIS]` |
| Picture tool (not shipped) | Python 3 with Pillow; PDFs also need `pdftoppm` |

## Credits and licences

### Poly Haven

HDRI, textures and 3D models are from [Poly Haven](https://polyhaven.com), released under
CC0. Attribution is not required, but credit is given here anyway:
`aircraft_workshop_01` (HDRI); `rocky_terrain_02`, `wood_table_worn`, `metal_plate`
(textures); `circuit_board`, `classic_laptop`, `desk_lamp_arm_01`, `metal_toolbox`,
`industrial_microscope`, `Television_01` (models).

In the repository the HDRI is `assets/hdri/workshop_1k.hdr`, and [docs/ASSETS.md](docs/ASSETS.md)
records it as `aircraft_workshop_01`. The textures are `assets/tex/<name>_diff.webp`, `_nor.webp`
and `_rough.webp`. The models are `assets/models/<name>.glb`.

### Poly Pizza and Kenney

The software-skill objects in `assets/models/icons/` come from [Poly Pizza](https://poly.pizza)
and [Kenney](https://kenney.nl). The CC-BY 3.0 ones require attribution, which is also shown
on the Skills panel:

- `brain.glb`: [Brain](https://poly.pizza/m/5mPRPZkI3qt) by Poly by Google, CC-BY 3.0
- `flask.glb`: [Erlenmeyer flask](https://poly.pizza/m/eqIGxcsBe1V) by Poly by Google, CC-BY 3.0
- `computer.glb`: [Computer 90s](https://poly.pizza/m/Bw55oYsbp8) by Charlie, CC-BY 3.0
- `speech-bubble.glb`: [Speech Bubble](https://poly.pizza/m/0WCt1EUGaAv) by Zoe XR, CC-BY 3.0
- `eye.glb`: [eye](https://poly.pizza/m/5k9K6C4nQPw) by Minh Nguyen Tri, CC-BY 3.0
- `snake.glb`: [Snake](https://poly.pizza/m/x9x0viZs8V) by Quaternius, CC0
- `robot.glb`: [Robot](https://poly.pizza/m/ejDr8lRglP) by Polygonal Mind, CC0
- `books.glb`: [Books](https://poly.pizza/m/dxt7dETAy9) by CreativeTrio, CC0
- `penguin.glb`: penguin from [Cube Pets](https://kenney.nl/assets/cube-pets) by Kenney, CC0

### Other assets

- The hacker (`assets/models/character/hacker.glb`) is the owner's sculpt, rigged and animated by
  `tools/character/rig.py`.
- The boards, sensors and robotic arm in `assets/models/boards/`, `sensors/` and `robotics/` were
  converted by `tools/models/convert.mjs` from CAD archives kept outside the repository.
- Vendor logos are not reproduced or redrawn anywhere in the 3D scene.

### Site licence

No licence is declared for the site's code or content. The repository has no licence file.

## Known limitations

- `js/site.js` is tracked in git but `index.html` does not load it.
- `index.html` has a hidden "Take control" button (`#world-grab`) that no script references.
- `tools/character/optimise-character.mjs` imports `@gltf-transform/*`, `meshoptimizer` and
  `sharp` but has no `package.json` of its own. Node looks for packages in parent directories of
  `tools/character/`, and `tools/models/node_modules` is not one of them, so the packages have to
  be installed somewhere on that path before the script runs.
