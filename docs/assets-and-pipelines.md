# Assets and pipelines

This document describes every file under `assets/`, the raw material those files were made
from, and the Node and Python tools that turn raw material into web assets. Read it before you
add, replace or re-optimise a 3D model, a texture, a photograph or a video, and before you run
anything in `tools/models/`, `tools/character/` or `tools/assets/`. For the rules that govern
what may be published at all, read [the handbook](HANDBOOK.md) first. For what each picture
shows and where the page uses it, read the owner's [asset map](ASSETS.md).

All figures in this document were measured on the working tree of 15 September 2026
(Version 8, uncommitted). Sizes marked "du" are disk usage from `du -sh`, which rounds up to
whole blocks; byte counts come from `stat` or the audit tool.

## Contents

1. [Folder map](#1-folder-map)
2. [Formats and how the site loads them](#2-formats-and-how-the-site-loads-them)
3. [Raw sources that are never committed](#3-raw-sources-that-are-never-committed)
4. [Tool environment](#4-tool-environment)
5. [3D models at a glance](#5-3d-models-at-a-glance)
6. [Hardware converter: `tools/models/convert.mjs`](#6-hardware-converter-toolsmodelsconvertmjs)
7. [Skill icons: `tools/models/optimise-icons.mjs`](#7-skill-icons-toolsmodelsoptimise-iconsmjs)
8. [Poly Haven props, textures and HDRI](#8-poly-haven-props-textures-and-hdri)
9. [The character](#9-the-character)
10. [Auditing: `tools/models/glb-audit.mjs`](#10-auditing-toolsmodelsglb-auditmjs)
11. [Pictures and video](#11-pictures-and-video)
12. [Web budgets](#12-web-budgets)
13. [Licences](#13-licences)
14. [Known limitations](#14-known-limitations)

---

## 1. Folder map

Everything the site downloads lives in `assets/` (42 MB, du). Nothing else in the repository
is an asset.

| Path | Size (du) | Contents | Formats | Produced by |
| --- | --- | --- | --- | --- |
| `assets/shivender.jpg` | 56 KB | Portrait, 720 × 720 px | JPEG | `tools/assets/place.py` (ID P01) |
| `assets/og-card.jpg` | 72 KB | Link preview card, 1200 × 630 px | JPEG | `tools/assets/place.py` (ID P02) |
| `assets/press/` | 1.1 MB | 5 newspaper clippings, each a thumbnail and a `-full` image | WebP | `tools/assets/place.py` |
| `assets/events/` | 3.2 MB | 18 event and work photos, thumbnail plus `-full` | WebP | `tools/assets/place.py` |
| `assets/certs/` | 1.6 MB | 18 certificates, thumbnail plus `-full` | WebP | `tools/assets/place.py` |
| `assets/bench/` | 368 KB | 3 photos of the real workstation, thumbnail plus `-full` | WebP | `tools/assets/place.py` |
| `assets/video/` | 18 MB | 5 demo clips, each with a poster | MP4 (H.264), WebP posters | ffmpeg, by hand (see [section 11](#11-pictures-and-video)) |
| `assets/tex/` | 1.1 MB | 3 Poly Haven PBR sets: `metal_plate`, `rocky_terrain_02`, `wood_table_worn` | WebP | Downloaded; no script in the repository |
| `assets/hdri/` | 1.7 MB | `workshop_1k.hdr`, 1024 × 512 px | Radiance HDR | Downloaded; no script in the repository |
| `assets/models/*.glb` | 2.6 MB | 6 Poly Haven props | GLB, meshopt, WebP textures | No script in the repository |
| `assets/models/boards/` | 6.7 MB | 7 development boards | GLB, meshopt | `tools/models/convert.mjs` |
| `assets/models/sensors/` | 3.2 MB | 10 sensor modules | GLB, meshopt | `tools/models/convert.mjs` |
| `assets/models/robotics/` | 740 KB | `robotic-arm.glb` | GLB, meshopt | `tools/models/convert.mjs` |
| `assets/models/catalog.json` | 8 KB | One entry per converted model | JSON | `tools/models/convert.mjs` |
| `assets/models/icons/` | 300 KB | 9 skill icons | GLB, meshopt | `tools/models/optimise-icons.mjs` |
| `assets/models/character/` | 1.9 MB | `hacker.glb` and `hacker.json` | GLB, meshopt, WebP textures; JSON | `tools/character/rig.py`, then `tools/character/optimise-character.mjs` |

`assets/tmp/` is a gitignored drop folder for replacement pictures; it is not part of the site
and does not exist until someone creates it (see [section 11](#11-pictures-and-video)).

## 2. Formats and how the site loads them

| Kind | Format on disk | Loaded by | Notes |
| --- | --- | --- | --- |
| Photographs, clippings, certificates | WebP (`<slug>.webp` thumbnail, `<slug>-full.webp` for the gallery viewer) | `<img>` in `index.html`; framed in 3D by `js/island.js` from paths built from folder prefixes (`P`, `E`, `C`, `B`) | Every folder except the two single files uses WebP. |
| Portrait and link card | JPEG | `index.html` (`<img>` and `<meta>` tags) | Kept as JPEG; `place.py` writes single files as JPEG. |
| Video | MP4, H.264, `yuv420p`; poster `<slug>.webp` | Links with `data-video` in `index.html` (5 of them) | |
| PBR textures | WebP, 1024 × 1024 px | `pbr(name, options)` in `js/realism.js`, which builds `assets/tex/<name>_diff.webp`, `_nor.webp`, `_rough.webp` with `THREE.TextureLoader` | The colour map is tagged `SRGBColorSpace`; the normal and roughness maps get no colour space. All repeat, with anisotropy 8. |
| Environment light | Radiance `.hdr` | `loadEnvironment()` in `js/realism.js` (`RGBELoader`, then `PMREMGenerator`) | |
| Props, hardware, icons | GLB with `EXT_meshopt_compression` and `KHR_mesh_quantization`; some with `EXT_texture_webp` | `loadProp(name, size)` in `js/realism.js` | Loads `assets/models/<name>.glb`, scales it so its largest dimension equals `size` (metres), centres it on x and z and stands it on y = 0, then returns it inside a holder `THREE.Group`. |
| Character | GLB as above, with a skin and 6 animations | `loadGLTF(url)` in `js/realism.js`, called from `js/player.js` | Loaded as authored, with no fitting. |

One `GLTFLoader` instance in `js/realism.js` has `setMeshoptDecoder(MeshoptDecoder)` applied.
`MeshoptDecoder` comes from `three/addons/libs/meshopt_decoder.module.js`, the same three.js
0.169.0 import map as everything else, so meshopt compression adds no site dependency (rule 7
in [AGENTS.md](../AGENTS.md)). `GLTFLoader` reads `EXT_texture_webp` without extra code.

A Node check of every literal `assets/…` path in `index.html`, `css/styles.css` and `js/*.js`
found 103 distinct paths (93 WebP, 5 MP4, 2 JPEG, 1 GLB, 1 HDR, 1 JSON) and no missing file.
Paths built at run time are not covered by that check: the texture paths from `pbr()` and
the model paths from `loadProp()` in `js/realism.js`, and, in `js/island.js`, the press and
event frames, the certificate list and the bench photos. Those join a folder prefix
(`P = "assets/press/"`, `E = "assets/events/"`, `C = "assets/certs/"`,
`B = "assets/bench/"`) to a file name.

`assets/models/catalog.json` is not loaded by the site. Only `tools/models/preview.html` reads
it (see [section 6.8](#68-previewing-the-converted-models)).

## 3. Raw sources that are never committed

These folders hold originals and working files. `.gitignore` excludes all of them, and none
may ever be committed (rule 6 in [AGENTS.md](../AGENTS.md)). `media/` and `assets/tmp/` are
not present in this checkout; they exist only once someone creates them.

| Path | Size (du) | What it holds | Ignored by the `.gitignore` line |
| --- | --- | --- | --- |
| `3d models/` | 1.9 GB | 18 zip archives of CAD exports, one per board, sensor or arm | `3d models/` |
| `data/raw/` | 1.9 GB | The same 18 archives extracted, one folder per model, named in kebab case (`nodemcu-esp32`, `sensor-de-chuva`, …) | `data/` |
| `data/raw-character/` | 85 MB | `source/Hacker.glb` (the owner's sculpt) and `textures/` (its extracted PNGs) | `data/` |
| `data/tools/` | — | Working copies of the Node tools and the only installed `node_modules` (see [section 4](#4-tool-environment)) | `data/` |
| `data/tmp/` | — | Scratch output: screenshots, contact sheets, intermediate GLBs | `data/` |
| `media/` | Not present | When created: the owner's photo, certificate and video originals, mapped in [ASSETS.md section 9](ASSETS.md) | `media` |
| `assets/tmp/` | Not present | When created (`mkdir -p assets/tmp`): replacement pictures waiting for `place.py`, which exits if the folder is missing | `assets/tmp/` |

No script in the repository extracts the zips into `data/raw/`.

**GitHub's 100 MB limit.** GitHub rejects a push that contains any file over 100 MB. Six of
the archives in `3d models/` exceed it:

| Archive | Size |
| --- | --- |
| `Raspberry Pi 5.zip` | 363 MB |
| `NodeMCU ESP32.zip` | 332 MB |
| `Sensor de Chuva.zip` | 327 MB |
| `Arduino MEGA 2560 REV3.zip` | 264 MB |
| `Módulo LDR.zip` | 228 MB |
| `Raspberry Pi 4 Model B.zip` | 131 MB |

The repository has no `.gitattributes` and does not use Git LFS. The largest file under
`assets/` is `assets/video/robonari-audio-module.mp4` at 6.2 MB.

Contents of `data/raw/`, as the converter sees them (`.obj` part files and `.png` images per
folder):

| Folder | `.obj` files | `.png` files | Size (du) |
| --- | --- | --- | --- |
| `3-axis-accelerometer-and-gyroscope-sensor` | 1 | 4 | 6.5 MB |
| `arduino-mega-2560-rev3` | 33 | 0 | 253 MB |
| `arduino-nano-every` | 13 | 9 | 70 MB |
| `arduino-uno` | 5 | 26 | 57 MB |
| `infrared-sensor-ir-sensor` | 9 | 2 | 34 MB |
| `luchtkwaliteit-sensor-mq-135-gas-sensor-mq-135` | 12 | 3 | 7.6 MB |
| `modulo-ldr` | 416 | 0 | 219 MB |
| `mq2-lpg-co-smoke-gas-sensor` | 1 | 0 | 3.3 MB |
| `nodemcu-esp32` | 780 | 0 | 319 MB |
| `pir-sensor` | 2 | 1 | 3.4 MB |
| `raspberry-pi-4-model-b` | 34 | 13 | 125 MB |
| `raspberry-pi-5` | 38 | 4 | 347 MB |
| `raspberry-pi-zero` | 162 | 1 | 99 MB |
| `robotic-arm` | 13 | 0 | 53 MB |
| `sensor-de-chuva` | 390 | 0 | 313 MB |
| `temperature-and-humidity-sensor-dht11` | 3 | 0 | 440 KB |
| `touch-sensor` | 13 | 0 | 5.5 MB |
| `ultrasonic-sensor` | 6 | 0 | 18 MB |

## 4. Tool environment

The tools are Node ES modules (`.mjs`), `tools/assets/place.py` (Python 3 with Pillow) and
`tools/character/rig.py` (Python run inside Blender; see [Character](character.md)). None of
them is part of the site, and none runs a browser.

**Where the packages are.** `tools/models/package.json` declares the dependencies, but no
`node_modules` exists under `tools/`, and none exists at the repository root. The only
installed copy is `data/tools/node_modules`, beside `data/tools/package.json` (identical
dependency list) and `data/tools/package-lock.json`. Installed versions:

| Package | Version in `data/tools/node_modules` | Used by |
| --- | --- | --- |
| `@gltf-transform/core` | 4.5.0 | `convert.mjs`, `optimise-icons.mjs`, `optimise-character.mjs` |
| `@gltf-transform/extensions` | 4.5.0 | same |
| `@gltf-transform/functions` | 4.5.0 | same |
| `meshoptimizer` | 1.2.0 | same |
| `sharp` | 0.35.4 | same |
| `obj2gltf` | 3.2.0 | Declared but not imported by any tool in `tools/` |

The local Node is v26.7.0.

**Why the script's location matters.** Node resolves `import "@gltf-transform/core"` from the
folder that contains the script, walking up to parent folders. It ignores the current directory
and `NODE_PATH` for ES modules. So `node tools/models/convert.mjs` fails with a missing-package
error, while a copy of the script inside `data/tools/` finds `data/tools/node_modules`.

`data/tools/` already holds copies of `convert.mjs`, `glb-audit.mjs` and `optimise-icons.mjs`
that are byte-identical to the ones in `tools/models/` today. `data/tools/optimise-character.mjs`
and `data/tools/preview.html` differ from the repository copies
`tools/character/optimise-character.mjs` and `tools/models/preview.html`. The scripts in
`tools/` are the source of truth. Note that git tracks only some of them today:
`tools/assets/place.py`, `tools/models/convert.mjs`, `tools/models/package.json`,
`tools/models/preview.html` and `tools/test/*.mjs`. `tools/character/`,
`tools/models/glb-audit.mjs` and `tools/models/optimise-icons.mjs` are new in Version 8 and
not yet committed.

There are two ways to run a tool:

1. **Use the existing install (no network).** This is the route for the scripts in
   `tools/models/`. From the repository root, copy the script into `data/tools/`, then run it
   there:

   ```bash
   cp tools/models/convert.mjs data/tools/
   cd data/tools
   node convert.mjs
   ```

   The character optimiser uses a different folder. [Character](character.md#8-the-web-optimiser-optimise-charactermjs)
   copies it into `data/tmp/anim/`, which has a `node_modules` symlink to
   `data/tools/node_modules`. Do not copy it into `data/tools/`; that overwrites the older
   `data/tools/optimise-character.mjs`, which the Character document tells you not to run.
   The symlink route works for any of the Node tools: put a copy of the script in a folder
   under `data/tmp/` and create the link from the repository root with
   `ln -sfn "$PWD/data/tools/node_modules" data/tmp/<folder>/node_modules`.

2. **Install next to the script (network).** `npm install` writes two things into
   `tools/models/`: `node_modules/`, which is gitignored, and `package-lock.json`, which is
   **not** ignored. npm's `package-lock` setting is `true` here, and there is no `.npmrc` in the
   repository, in `tools/models/` or in the home folder to change it. Pass `--no-package-lock`
   so that no lock file is written, or delete `tools/models/package-lock.json` before you
   commit. Without a lock file, npm resolves the `^` ranges again and may install newer versions
   than the ones listed above. It also installs `obj2gltf` and its dependencies, which no tool
   uses.

   ```bash
   cd tools/models
   npm install --no-package-lock
   node convert.mjs ../../data/raw ../../assets/models
   ```

`tools/models/glb-audit.mjs` imports only `node:fs` and `node:path` and runs from anywhere
without packages.

`tools/assets/place.py` needs Python 3 and Pillow (it exits with `Pillow is required: pip
install Pillow` otherwise). PDF input also needs `pdftoppm` from poppler-utils.

## 5. 3D models at a glance

| Group | Files | Source | Tool | Loaded by |
| --- | --- | --- | --- | --- |
| Props | `circuit_board`, `classic_laptop`, `desk_lamp_arm_01`, `industrial_microscope`, `metal_toolbox`, `Television_01` in `assets/models/` | Poly Haven | None in the repository | `place()` in `js/island.js`, through `loadProp` |
| Boards | 7 in `assets/models/boards/` | `3d models/` via `data/raw/` | `tools/models/convert.mjs` | `showcase()` in `js/island.js`, which loads every entry of the `HARDWARE` constant into the wall case, and the `serialLink()` plinth in `js/island.js` |
| Sensors | 10 in `assets/models/sensors/` | same | same | `showcase()` (entries of `HARDWARE`) in `js/island.js` |
| Robotics | `robotic-arm.glb` | same | same | `loadProp("robotics/robotic-arm", 0.5)` in `js/island.js` |
| Skill icons | 9 in `assets/models/icons/` | Poly Pizza and Kenney | `tools/models/optimise-icons.mjs` | The skills list in `js/icons.js` (`model: "icons/<name>"`) |
| Character | `character/hacker.glb` | `data/raw-character/source/Hacker.glb` | `tools/character/rig.py`, `tools/character/optimise-character.mjs` | `loadGLTF` in `js/player.js` |

Where the models stand on the campus is covered in [Campus](campus.md); the desk arm on the
workbench is procedural geometry, not a GLB, and is covered in [Workbench](workbench.md).

## 6. Hardware converter: `tools/models/convert.mjs`

The converter turns each extracted CAD archive in `data/raw/<folder>/` into one categorised,
simplified, meshopt-compressed GLB and records it in `assets/models/catalog.json`. The
archives split each model into `model_N.obj` parts, reference material files that were never
included, and mostly carry no UVs, so the converter colours parts from their vertex colours or
their shape, and matches texture images by file name. All materials are matte or near matte.

### 6.1 Arguments

```text
node convert.mjs [ROOT] [OUT] [ONLY]
```

| Argument | Default | Meaning |
| --- | --- | --- |
| `ROOT` | `../raw` | Folder that contains one sub-folder per model. Resolved against the current directory. |
| `OUT` | `../../assets/models` | Output root. GLBs go to `OUT/<category>/`, the catalog to `OUT/catalog.json`. |
| `ONLY` | none | Convert a single model. This is the **source folder name** (for example `nodemcu-esp32`), not the output id (`esp32-nodemcu`). |

The defaults are correct when the current directory is `data/tools/`. Sub-folders whose names
are not keys of the `CATEGORY` constant are skipped silently.

A wrong `ONLY` value (a misspelling, or an output id instead of a source folder name) matches
no folder and prints no error. The converter still rewrites `catalog.json` (re-sorted, with
`source` reset) and prints `catalog: 18 models`, which looks like success. If no
`<category>/<id>.glb ... up=<axis>` summary line is printed, nothing was converted; check the
`ONLY` spelling against the Source folder column in [section 6.2](#62-models-the-converter-knows).

### 6.2 Models the converter knows

`CATEGORY` maps each source folder to a category and `NICE` maps it to an output id and a
display name. The Archive column names the zip in `3d models/` that the folder is extracted
from; the converter does not read the archives.

| Archive in `3d models/` | Source folder | Category | Output id | Name |
| --- | --- | --- | --- | --- |
| `Arduino MEGA 2560 REV3.zip` | `arduino-mega-2560-rev3` | boards | `arduino-mega-2560` | Arduino Mega 2560 Rev3 |
| `Arduino Nano Every.zip` | `arduino-nano-every` | boards | `arduino-nano-every` | Arduino Nano Every |
| `Arduino UNO.zip` | `arduino-uno` | boards | `arduino-uno` | Arduino Uno |
| `NodeMCU ESP32.zip` | `nodemcu-esp32` | boards | `esp32-nodemcu` | NodeMCU ESP32 |
| `Raspberry Pi 4 Model B.zip` | `raspberry-pi-4-model-b` | boards | `raspberry-pi-4b` | Raspberry Pi 4 Model B |
| `Raspberry Pi 5.zip` | `raspberry-pi-5` | boards | `raspberry-pi-5` | Raspberry Pi 5 |
| `Raspberry Pi Zero.zip` | `raspberry-pi-zero` | boards | `raspberry-pi-zero` | Raspberry Pi Zero |
| `3-Axis Accelerometer And Gyroscope Sensor.zip` | `3-axis-accelerometer-and-gyroscope-sensor` | sensors | `imu-accelerometer-gyroscope` | 3-axis accelerometer and gyroscope |
| `infrared sensor (IR sensor).zip` | `infrared-sensor-ir-sensor` | sensors | `ir-sensor` | Infrared sensor |
| `Luchtkwaliteit sensor MQ-135 _ Gas sensor MQ-135.zip` | `luchtkwaliteit-sensor-mq-135-gas-sensor-mq-135` | sensors | `mq135-air-quality` | MQ-135 air quality sensor |
| `MQ2 LPG CO Smoke Gas Sensor.zip` | `mq2-lpg-co-smoke-gas-sensor` | sensors | `mq2-gas-smoke` | MQ-2 gas and smoke sensor |
| `Módulo LDR.zip` | `modulo-ldr` | sensors | `ldr-light-sensor` | LDR light sensor module |
| `PIR sensor.zip` | `pir-sensor` | sensors | `pir-motion` | PIR motion sensor |
| `Sensor de Chuva.zip` | `sensor-de-chuva` | sensors | `rain-sensor` | Rain sensor |
| `Temperature and humidity sensor DHT11.zip` | `temperature-and-humidity-sensor-dht11` | sensors | `dht11-temperature-humidity` | DHT11 temperature and humidity |
| `TOUCH SENSOR.zip` | `touch-sensor` | sensors | `touch-sensor` | Capacitive touch sensor |
| `Ultrasonic sensor.zip` | `ultrasonic-sensor` | sensors | `hc-sr04-ultrasonic` | Ultrasonic distance sensor |
| `Robotic arm.zip` | `robotic-arm` | robotics | `robotic-arm` | Robotic arm |

### 6.3 Steps

`convert(dir)` runs these steps for each model, in order.

1. **Collect parts.** Walk the folder for `.obj` files and sort them by name with numeric
   ordering.
2. **Parse each part** with `parseObj(file)`, a line-by-line reader (`node:readline`) that
   reads positions, optional per-vertex colours (`v x y z r g b`), normals and UVs. It
   triangulates polygons as fans and flips the V coordinate, because OBJ counts V from the
   bottom of the image and glTF from the top. A part keeps UVs only if every corner has one.
3. **Drop duplicate parts.** `signature(p)` combines the triangle count, the bounding box and
   12 sampled vertex positions, each to 6 significant figures. A part whose signature has
   already been seen is dropped. Only when at least one part was dropped, the converter logs
   `<folder>: dropped N duplicate parts, M left`. That line is printed after step 4, so M
   counts the parts after the single-mesh split.
4. **Split single-mesh models.** If 3 parts or fewer remain and the folder has no colour image
   (a `.png` whose name does not match `normal`, `rough`, `metal`, `_ao`, `ao_`,
   `displacement`, `emissive` or start with `img_`), each part under 600,000 triangles is split
   into connected components by `splitComponents(p)`. That function joins corners whose
   quantised positions coincide and groups triangles by union-find.
5. **Split component bundles** (boards and sensors only). Take the up axis as the model's
   smallest overall extent. Any part that is not flat, has no UVs, covers more than half the
   model's footprint and has under 400,000 triangles is split into connected components. Such
   parts bundle every component on the board into one mesh and would otherwise paint the board
   one colour.
6. **Find the board** (boards and sensors only). A part is flat when its height along the up
   axis is under 12 % of its longest horizontal side. Every flat part whose footprint is at
   least 85 % of the widest flat part counts as board, because a PCB is often exported as
   several flat layers.
7. **Assign texture images by name** (there are no `.mtl` files). Only colour images count
   (the same name filter as step 4). Board layers with UVs are sorted from highest to lowest
   along the up axis.

   | File name matches | Goes on |
   | --- | --- |
   | `top` or `front` | Every board layer with UVs, except the lowest one when a bottom image exists and there is more than one such layer |
   | `bottom`, `botom`, `buttom` or `back` | The lowest board layer with UVs, only when a top image also exists and there is more than one such layer |
   | `board_albedo` or `basecolor` | Every board layer with UVs when there is no top image; or, when no board layer has UVs, the only non-board part with UVs |
   | `comp_albedo` or `fabric` | The non-board part with UVs that has the most triangles |

   Each image used is resized to fit inside 1024 × 1024 px for boards and 512 × 512 px for
   every other category, never enlarged, flattened over the board colour (which removes
   alpha), and encoded as WebP at quality 82, effort 6. The document gains `EXT_texture_webp`
   and a material with metallic 0 and roughness 0.72.
8. **Colour untextured parts.** A part with vertex colours gets one shared material with a
   white base colour, metallic 0 and roughness 0.66, so `COLOR_0` supplies the colour.
   Otherwise `classify(part, model, slug, isBoard)` picks from the `PAL` palette:

   | Result | Rule (sizes relative to the model's largest extent) | Base colour (sRGB), metallic, roughness |
   | --- | --- | --- |
   | Robotic arm, light | Arm parts in the larger 45 % by bounding-box volume (`volRank < 0.45`) | 0.90 0.90 0.88, 0, 0.60 |
   | Robotic arm, dark | Other arm parts | 0.16 0.17 0.19, 0.2, 0.58 |
   | Board | Board parts from step 6 | `BOARD_COLOUR(slug)`: Raspberry Pi green, Arduino blue, ESP32 or NodeMCU near black, DHT11 blue, otherwise dark blue; 0, 0.72 |
   | Pin | Horizontal span under 3.5 % and height over 1.8 × the span | 0.78 0.63 0.30, 0.6, 0.5 |
   | Plastic (speck) | Horizontal span under 2 % | 0.10 0.10 0.11, 0, 0.68 |
   | Metal (ultrasonic) | Ultrasonic sensor parts with span over 15 % | 0.72 0.74 0.76, 0.55, 0.55 |
   | Ivory | PIR parts taller than 25 % | 0.86 0.85 0.80, 0, 0.65 |
   | DHT11 housing | DHT11 parts taller than 20 % | 0.12 0.35 0.70, 0, 0.70 |
   | Metal | Span and height both over 12 % | as metal above |
   | Plastic | Everything else | as plastic above |

   `matFor()` converts the sRGB palette colours to linear with the standard sRGB transfer
   function before writing them as base colour factors, and shares one material per distinct
   specification.
9. **Build the document.** One scene named after the display name, one root node named after
   the output id, and one node and mesh per part (`part_<i>`).
10. **Simplify per part.** `ratio = min(1, BUDGET[category] / source triangles)`. The error
    bound is 0.02 when the ratio is under 0.08, 0.01 when it is under 0.3, and 0.004 otherwise.
    The transform is `flatten()`, `weld()`, then `simplify()` with `MeshoptSimplifier` and
    `lockBorder: false`. Because each part is still its own mesh, the error bound is relative
    to that part, so small pins keep their shape.
11. **Widen the error bound if still over budget.** While the model has more than 1.25 × its
    budget, double the error (starting at twice the first value) and simplify again towards the
    budget, stopping once the error would exceed 0.16.
12. **Finish.** `join()`, `normals({ overwrite: true })`, `dedup()`, `prune()`,
    `reorder({ encoder: MeshoptEncoder })`, `quantize()`, then `EXT_meshopt_compression`
    marked required with the `QUANTIZE` method.
13. **Write** `OUT/<category>/<id>.glb` and print a summary line:
    `<category>/<id>.glb  N parts  X.XXM -> Nk tris  X.XX MB  up=<axis>`.

After all folders, the catalog is merged, sorted and written. A model that throws prints
`FAILED <folder>: <message>` and the run continues with the next one.

### 6.4 Triangle budgets

`BUDGET` in `convert.mjs`:

| Category | Budget (triangles) | Widening loop runs while above (1.25 × budget) | Output now (from `catalog.json`) |
| --- | --- | --- | --- |
| boards | 45,000 | 56,250 | 29,942 to 52,262; 319,932 in total for 7 boards |
| sensors | 18,000 | 22,500 | 3,595 to 18,505; 155,662 in total for 10 sensors |
| robotics | 45,000 | 56,250 | 46,738 |

A model whose source is already under budget is not reduced: the Raspberry Pi Zero
(29,942 triangles) and the DHT11 (3,595) keep their source counts.

### 6.5 `catalog.json`

The file has two top-level keys: `models` (an array) and `source` (a string the converter
rewrites on every run). Each run replaces the entries whose `id` it converted, keeps the rest,
and sorts by `category`, then `name`.

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | Output id, also the GLB file name |
| `name` | string | Display name from `NICE` |
| `category` | string | `boards`, `sensors` or `robotics` |
| `file` | string | Repository-relative path, `assets/models/<category>/<id>.glb` |
| `parts` | number | Parts after duplicate removal and splitting |
| `sourceTriangles` | number | Triangles before simplification |
| `triangles` | number | Triangles written |
| `bytes` | number | GLB file size in bytes |
| `upAxis` | string | `x`, `y` or `z`: the axis of the model's smallest extent |
| `size` | array of 3 numbers | Bounding-box extent on x, y and z, in the **source file's units** (not metres; the Nano Every reports 4404.7 × 1778.7 × 352.8, the Uno 1.42 × 0.41 × 2.02) |

Today the catalog has 18 entries, and every `bytes` value matches the file on disk. The site
ignores `size`: `loadProp` rescales from the loaded bounding box, and the display sizes in
metres are written in `js/island.js`.

### 6.6 Commands

From the repository root, with the packages in `data/tools/node_modules` (see
[section 4](#4-tool-environment)):

1. Make sure the source folder exists under `data/raw/`. If it does not, extract its archive
   (the Archive column in [section 6.2](#62-models-the-converter-knows)) into that folder:

   ```bash
   unzip "3d models/<Archive>.zip" -d data/raw/<source-folder>
   ```

   The 18 archives are flat (no sub-folders), which the converter relies on: it finds `.obj`
   files in sub-folders too, but reads texture `.png` files only from the top level of the
   source folder. Textures that end up in a nested folder are skipped without any message.
2. Copy the repository converter next to the packages:

   ```bash
   cp tools/models/convert.mjs data/tools/
   ```

3. Convert everything, or one model by its source folder name:

   ```bash
   cd data/tools
   node convert.mjs                                  # all 18
   node convert.mjs ../raw ../../assets/models arduino-uno
   ```

4. Audit the result (from the repository root): `node tools/models/glb-audit.mjs assets/models`.
5. Check `git diff --stat assets/models` to see which GLBs and catalog entries changed.
6. Ask the owner to look at the models (see [section 6.8](#68-previewing-the-converted-models)
   and [Testing and release](testing-and-release.md)). Agents do not open a browser.

### 6.7 Adding a new board or sensor

Adding a model requires a code change to the converter and to the scene, so do it only when the
owner asks.

1. Extract the archive into `data/raw/<source-folder>/` as in step 1 of
   [section 6.6](#66-commands), with any texture images directly in that folder.
2. Add the folder to `CATEGORY` and to `NICE` (`[output id, display name]`) in
   `tools/models/convert.mjs`.
3. Run the converter for that folder only, as in [section 6.6](#66-commands).
4. Add an entry to one of the existing rows of the `HARDWARE` constant in `js/island.js`.
   `showcase()` in the same file calls `loadProp(s.file, s.size)` for every entry, so do not
   add a separate `loadProp` call. The entry has this shape:

   ```js
   { file: "<category>/<id>", label: "Name plate text", size: 0.045, turn: [0, Math.PI / 2, 0], upright: true }
   ```

   | Field | Required | Meaning |
   | --- | --- | --- |
   | `file` | yes | Model path under `assets/models/`, without `.glb` |
   | `label` | yes | Text on the name plate in front of the model |
   | `size` | yes | The model's largest real dimension, in metres |
   | `turn` | no | `[x, y, z]` rotation in radians that puts the component side up (the CAD exports do not agree on an up axis) |
   | `upright` | no | `true` stands the model in a foam block facing the room instead of lying on an angled stand |

5. Keep to three rows. `HARDWARE` has one row per shelf, and `showcase()` reads the shelf
   height as `spec.shelves[r]` from `SHOWCASE.shelves` in `js/layout.js` (`[1.3, 1.7, 0.9]`,
   metres inside the case). A fourth row has no shelf, so its height is undefined. Models in a
   row are spaced evenly across the case width, so adding one to a row packs that row closer.
6. On touch devices (`(pointer: coarse)`, the `coarseDevice` constant) `showcase()` loads only
   files listed in `PHONE_SET` in `js/island.js`. Add the file there only if phones should
   download it.
7. Never redraw a vendor logo on the model (rule 4 in [AGENTS.md](../AGENTS.md)).

### 6.8 Previewing the converted models

`tools/models/preview.html` fetches `../../assets/models/catalog.json`, loads every listed GLB
with `GLTFLoader` and `MeshoptDecoder` from the same three.js 0.169.0 CDN build, and draws
them in a grid. The `only` query parameter filters by category or by id. With the site served
from the repository root (`python3 -m http.server 8000`), the owner opens
`http://localhost:8000/tools/models/preview.html?only=boards`. It is a browser page, so agents
must not open it (rule 8 in [AGENTS.md](../AGENTS.md)).

## 7. Skill icons: `tools/models/optimise-icons.mjs`

The nine skill icons are third-party GLBs (see [section 13](#13-licences)).
`optimise-icons.mjs` compresses them without simplifying their geometry.

```text
node optimise-icons.mjs SRC_DIR OUT_DIR
```

For every `.glb` in `SRC_DIR` it reads the file (all glTF extensions registered, meshopt
decoder included, so compressed input is accepted), runs `dedup()`, `flatten()`, `join()`,
`weld()`, `prune()`, `textureCompress()` to WebP resized to fit 512 × 512 px at quality 82,
`reorder()` and `quantize()`, applies `EXT_meshopt_compression` with the `QUANTIZE` method,
writes `OUT_DIR/<name>.glb`, and prints the size before and after in KB. It creates `OUT_DIR`
if needed.

The versions before compression are in git at commit `8a21d28`. To rebuild from them, from the
repository root:

```bash
mkdir -p data/tmp/icons-src
for n in books brain computer eye flask penguin robot snake speech-bubble; do
  git show 8a21d28:assets/models/icons/$n.glb > data/tmp/icons-src/$n.glb
done
cp tools/models/optimise-icons.mjs data/tools/
cd data/tools
node optimise-icons.mjs ../tmp/icons-src ../../assets/models/icons
```

Use separate source and output folders. Quantisation loses precision, so run the tool on the
originals, not on its own output.

| Icon | Size at `8a21d28` | Size now | Used for (`js/icons.js`) |
| --- | --- | --- | --- |
| `books.glb` | 32 KB | 11 KB | SLMs |
| `brain.glb` | 199 KB | 59 KB | AI |
| `computer.glb` | 33 KB | 13 KB | C and C++ |
| `eye.glb` | 22 KB | 8 KB | VLMs |
| `flask.glb` | 44 KB | 17 KB | R&D |
| `penguin.glb` | 138 KB | 45 KB | Linux |
| `robot.glb` | 245 KB | 46 KB | Agentic AI |
| `snake.glb` | 212 KB | 73 KB | Python |
| `speech-bubble.glb` | 4 KB | 2 KB | LLMs |

## 8. Poly Haven props, textures and HDRI

These are CC0 downloads from Poly Haven. No script in the repository produced or compresses
them. The props are already GLBs with `EXT_meshopt_compression`, `KHR_mesh_quantization` and
`EXT_texture_webp`, each with three 1024 × 1024 WebP textures.

| File | Size | Triangles | Placed by (`js/island.js`) |
| --- | --- | --- | --- |
| `assets/models/circuit_board.glb` | 673 KB | 14k | `place(board, "circuit_board", 0.25, …)` |
| `assets/models/classic_laptop.glb` | 335 KB | 13k | `place(tools.group, "classic_laptop", 0.34, …)` |
| `assets/models/desk_lamp_arm_01.glb` | 490 KB | 20k | `place(tools.group, "desk_lamp_arm_01", 0.55, …)` |
| `assets/models/industrial_microscope.glb` | 415 KB | 16k | `place(builds.group, "industrial_microscope", 0.48, …)` |
| `assets/models/metal_toolbox.glb` | 440 KB | 12k | `place(tools.group, "metal_toolbox", 0.45, …)` |
| `assets/models/Television_01.glb` | 212 KB | 2k | `place(press.group, "Television_01", 0.6, …)` |

The third argument to `place` is the prop's largest dimension in metres.

| Texture set (`assets/tex/`) | Maps | Used by |
| --- | --- | --- |
| `metal_plate` | `_diff`, `_nor`, `_rough`, 1024 × 1024 WebP | `pbr("metal_plate", …)` in `js/island.js` |
| `rocky_terrain_02` | same | `pbr("rocky_terrain_02", …)` in `js/island.js` |
| `wood_table_worn` | same | `pbr("wood_table_worn", …)` in `js/island.js` and `js/bench.js` |

`assets/hdri/workshop_1k.hdr` is 1024 × 512 px (the header reads `-Y 512 +X 1024`). The
default `url` of `loadEnvironment()` in `js/realism.js` points at it. To replace a prop,
texture or HDRI, keep the file name, or change the name in the code at the same time.

## 9. The character

`assets/models/character/hacker.glb` (1.9 MB, 32k triangles, one material, textures of
2048 × 2048 and two 1024 × 1024 WebP, 6 animations) and `hacker.json` come from
`data/raw-character/source/Hacker.glb`. `tools/character/rig.py` (Blender, run headless)
rigs and animates it, and `tools/character/optimise-character.mjs` compresses it. Like the
other Node tools, the optimiser cannot run where it lives. [Character](character.md#8-the-web-optimiser-optimise-charactermjs)
runs a copy in `data/tmp/anim/`, whose `node_modules` is a symlink to `data/tools/node_modules`
(see [section 4](#4-tool-environment)).

The rig, the clips, the measurement checks and the exact commands are in
[Character](character.md). Do not duplicate them here.

## 10. Auditing: `tools/models/glb-audit.mjs`

```bash
node tools/models/glb-audit.mjs assets/models
```

The script walks the folder for `.glb` files. For each one it reads the JSON chunk directly
(no packages) and prints one line with the size in KB, the triangle count in thousands, the
extensions used (with `KHR_` and `EXT_` stripped), the MIME types of embedded images and the
path. A final line gives the total in MB (10^6 bytes) and the file count. It sums one count per
mesh primitive (index count / 3, or vertex count / 3 without indices), so a mesh used by
several nodes is counted once. It accepts only binary `.glb`, not `.gltf`.

**Audit summary, 15 September 2026:** 34 files, 15.8 MB.

| Group | Files | Size | Triangles | Extensions | Textures |
| --- | --- | --- | --- | --- | --- |
| Boards | 7 | 7.0 MB | 320k | meshopt, quantisation; WebP on 4 | Nano Every 1024 × 256, Uno and Pi 4B 1024 × 1024, Pi 5 1024 × 512; Mega, ESP32 and Pi Zero untextured |
| Sensors | 10 | 3.2 MB | 156k | meshopt, quantisation; WebP on 3 | IMU 512 × 512; IR 256 × 128; MQ-135 up to 512 × 512; the rest untextured |
| Robotics | 1 | 758 KB | 47k | meshopt, quantisation | none |
| Props | 6 | 2.6 MB | 77k | meshopt, quantisation, WebP | 3 × 1024 × 1024 each |
| Skill icons | 9 | 281 KB | about 9k | meshopt, quantisation; WebP on 3; `KHR_texture_transform` on `penguin.glb` | `books` 128 × 128, `penguin` and `robot` 512 × 512 |
| Character | 1 | 1.9 MB | 32k | meshopt, quantisation, WebP | 2048 × 2048 and 2 × 1024 × 1024 |

Sizes in this table are the byte counts of each group in the same unit as the audit's total
line: MB is 10^6 bytes and KB is 10^3 bytes (boards 6,968,496 bytes, sensors 3,241,080,
robotics 757,752, props 2,626,432, icons 281,064, character 1,898,732; 15,773,556 in total).
Texture dimensions were read from the embedded images with `sharp`.

**Compared with commit `8a21d28`,** the committed `assets/models/` totalled 28.5 MB in 34
files. The converter re-run and the icon compression changed these files:

| Files changed | Bytes at `8a21d28` | Bytes now |
| --- | --- | --- |
| 6 boards (all except `raspberry-pi-zero.glb`) | 16,520,048 | 6,577,492 |
| 9 sensors (all except `dht11-temperature-humidity.glb`) | 6,631,252 | 3,196,704 |
| `robotic-arm.glb` | 1,362,212 | 757,752 |
| 9 skill icons | 950,952 | 281,064 |

The same change moved `convert.mjs` from budgets of 140,000 / 45,000 / 90,000 triangles and
JPEG textures (quality 84) to the budgets in [section 6.4](#64-triangle-budgets) and WebP
textures (quality 82).

## 11. Pictures and video

### 11.1 Relationship to `docs/ASSETS.md`

[ASSETS.md](ASSETS.md) belongs to the owner and must not be edited by agents. It gives every
picture and clip a short ID (P01, R01, E01, B01, C01, V01), says what each file shows (checked
by eye), where the code uses it, and the shape its thumbnail must keep. It also records the
owner's `media/` source folder. This document does not repeat that map. It covers only the
files, formats and tools.

### 11.2 `tools/assets/place.py`

`place.py` replaces a picture with a better original while keeping the official file name and
thumbnail shape, so `index.html` and `js/island.js` need no edits. The procedure is in
[ASSETS.md, "Replacing a picture with a better one"](ASSETS.md#replacing-a-picture-with-a-better-one).
Its behaviour, from the code:

| Item | Value in `place.py` |
| --- | --- |
| Commands | `python3 tools/assets/place.py --list`; `python3 tools/assets/place.py` (dry run); `--apply`; `--fit pad` or `--fit crop`; `--root DIR` (defaults to the repository root, two levels above the script) |
| Input folder | `assets/tmp/`, files named by ID or slug; sources move to `assets/tmp/done/` on `--apply`. The folder is not in the checkout: create it with `mkdir -p assets/tmp`, or the script exits with `... does not exist; create it and put the downloads there` |
| Accepted input | `.jpg`, `.jpeg`, `.png`, `.webp`, `.tif`, `.tiff`, `.bmp`, `.pdf` (first page, rendered by `pdftoppm` at 300 dpi) |
| ID table | `IDS`, commented "Keep in step with docs/ASSETS.md" |
| Outputs for folder pictures | `<slug>.webp` (thumbnail, WebP quality 82) and `<slug>-full.webp` (WebP quality 80), both with `method=6` |
| Outputs for P01 and P02 | One JPEG each at its existing size, quality 86, progressive, no chroma subsampling |
| Thumbnail width | `THUMB_WIDTH`: 560 px for `certs`; other folders keep the current thumbnail's width |
| Full-image cap | `MAX_PIXELS = 4_200_000`, never enlarged. `cap()` scales an image to that area and then rounds each side with `round()`, so a result can be slightly over the cap |
| Shape tolerance | `TOLERANCE = 0.02` (2 %); beyond that the picture is skipped unless `--fit` is given |
| Transparency | Flattened onto white |
| Orientation | EXIF rotation applied (`ImageOps.exif_transpose`) |

Measured today: event photos have thumbnails 384 to 480 px wide and full images up to
4,198,401 pixels; certificate thumbnails are 560 px wide for 12 files and 280 px wide for 6
(`academor-2023`, `ccna-switching-routing-2023`, `linkedin-ecmascript-2025`,
`linkedin-linux-cli-2025`, `nptel-deep-learning-iit-ropar-2025`,
`straightarc-cyber-security-2024`), and the largest certificate full image,
`roboai-hub-robotics-internship-2025-full.webp`, is 1722 × 2440 px (4,201,680 pixels, just
over `MAX_PIXELS`); press thumbnails are 400 px wide with 1400 px full images;
bench thumbnails are 480 × 640 px with 1200 × 1600 px full images.

### 11.3 Video

No script in the repository processes video. [ASSETS.md section 8](ASSETS.md#8-video-assetsvideo)
gives the owner's ffmpeg commands. The clips on disk:

| File | Video | Length | Audio | Size | Poster |
| --- | --- | --- | --- | --- | --- |
| `kinelink-demo-2025.mp4` | H.264, 1280 × 720 | 51.4 s | none | 3.0 MB | 480 × 270 WebP |
| `labour-law-chatbot-demo.mp4` | H.264, 960 × 720 | 26.2 s | AAC | 4.8 MB | 480 × 360 WebP |
| `robonari-audio-module.mp4` | H.264, 720 × 960 | 56.5 s | AAC | 6.2 MB | 480 × 640 WebP |
| `servo-arm-hand-tracking.mp4` | H.264, 848 × 480 | 46.5 s | AAC | 3.2 MB | 480 × 272 WebP |
| `servo-arm-pick-and-place.mp4` | H.264, 540 × 960 | 9.9 s | AAC | 1.3 MB | 480 × 854 WebP |

All five use the `yuv420p` pixel format (read with `ffprobe`). Each poster's size matches the
`width` and `height` on its `<img>` in `index.html`.

## 12. Web budgets

These are the limits that the tools actually enforce, with today's measured values. No tool
enforces a byte limit per file; check sizes with the audit.

| Asset | Limit | Set in | Today |
| --- | --- | --- | --- |
| Board triangles | 45,000 target; simplification stops at 56,250 or error 0.16 | `BUDGET`, `convert.mjs` | 29,942 to 52,262 |
| Sensor triangles | 18,000 target; stops at 22,500 | `BUDGET`, `convert.mjs` | 3,595 to 18,505 |
| Arm triangles | 45,000 target | `BUDGET`, `convert.mjs` | 46,738 |
| Board textures | Fit inside 1024 px, WebP quality 82 | `convert()` | up to 1024 × 1024 |
| Sensor and arm textures | Fit inside 512 px, WebP quality 82 | `convert()` | up to 512 × 512 |
| Skill icons | No simplification; textures fit inside 512 px, WebP quality 82 | `optimise-icons.mjs` | 2 KB to 73 KB per file |
| Character textures | Base colour 2048 px, WebP quality 84; normal and metal/rough 1024 px, quality 86 | `optimise-character.mjs` | as the limits |
| Full-size pictures | 4.2 megapixels, WebP quality 80 | `place.py` | up to 4,201,680 px (`certs/roboai-hub-robotics-internship-2025-full.webp`, just over the cap; see [section 11.2](#112-toolsassetsplacepy)) |
| Thumbnails | Certificates 560 px wide; other folders keep their width; WebP quality 82 | `place.py` | see [section 11.2](#112-toolsassetsplacepy) |
| Any committed file | Under 100 MB (GitHub hard limit) | GitHub | largest 6.2 MB |

Current download totals (du): models 16 MB, video 18 MB, events 3.2 MB, HDRI 1.7 MB,
certificates 1.6 MB, press 1.1 MB, textures 1.1 MB, bench 368 KB. How many of the models load
up front, and which load only when a landmark is visited, is covered in
[Campus](campus.md) and [Architecture](architecture.md).

## 13. Licences

| Assets | Source | Licence | Attribution |
| --- | --- | --- | --- |
| HDRI (`aircraft_workshop_01`), 3 texture sets, 6 props | Poly Haven | CC0 | Not required; credited in the README |
| `brain`, `flask`, `computer`, `speech-bubble`, `eye` icons | Poly Pizza | CC-BY 3.0 | **Required.** Given in the README and in the `tools__note` paragraph of the `#stack` panel in `index.html` |
| `snake`, `robot`, `books` icons | Poly Pizza | CC0 | Credited in the README and `index.html` |
| `penguin` icon | Kenney, Cube Pets | CC0 | Credited in the README and `index.html` |
| Hacker character | The owner's sculpt | Not stated | — |
| Boards, sensors, robotic arm | CAD archives in `3d models/` | Not recorded in the repository | — |
| Photos, clippings, certificates, videos | The owner's own material | Not stated; see [Content and facts](content-and-facts.md) for what may be published | — |

The full list with links is in [the README's credits](../README.md#credits-and-licences). If
you replace or add a CC-BY icon, update both the README and the attribution paragraph in
`index.html`.

## 14. Known limitations

- **The Node tools cannot run where they live.** `tools/models/` and `tools/character/` have
  no `node_modules`, and `data/tools/node_modules` is outside git. A fresh clone has neither
  `data/` nor an install, so `npm install` in `tools/models/` is the only way to run the
  converter there. `tools/models/` has no lock file, so versions can drift, and a plain
  `npm install` writes a `tools/models/package-lock.json` that `.gitignore` does not exclude.
- **Some tools are not yet in git.** `tools/character/`, `tools/models/glb-audit.mjs` and
  `tools/models/optimise-icons.mjs` are untracked in the Version 8 working tree.
- **`catalog.json` names the wrong script.** The converter writes
  `"source": "Converted from the OBJ archives in '3d models/' by data/tools/convert.mjs"`. The
  repository script is `tools/models/convert.mjs`, and the input it reads is `data/raw/`.
- **The full-image cap in `place.py` is not exact.** `cap()` rounds each scaled side, so a
  `-full` image can be slightly over `MAX_PIXELS`; one certificate on disk is 4,201,680 px.
- **`convert.mjs` does not report a wrong `ONLY` value.** It converts nothing, still rewrites
  `catalog.json` and prints `catalog: 18 models` (see [section 6.1](#61-arguments)).
- **Misleading names in `convert.mjs`.** The variable holding each encoded texture is called
  `jpg` but contains WebP. The comment at the end of `splitComponents()` says stray specks are
  "merged back as plastic", but the function returns every component unchanged.
- **`obj2gltf` is declared but unused** by the tools in `tools/`, yet `npm install` still
  fetches it and its dependencies.
- **The catalog's `size` is in source units**, which differ by orders of magnitude between
  archives (the Nano Every's longest extent is about 4,405, the Uno's about 2), so it cannot be
  used to place models without per-model scaling.
- **The robotic arm is 4 % over budget** (46,738 triangles against 45,000). The loop allows up
  to 25 % over, so this is expected rather than a fault.
- **The source and licence of the CAD archives and of the character sculpt are not recorded**
  anywhere in the repository.
- **`docs/ASSETS.md` and the files disagree in places** (owner to update; agents must not edit
  it): it says `place.py` writes `<slug>-full.jpg` and `<slug>.jpg`, but the code and the files
  use `.webp`; its video recipe writes a `.jpg` poster, but the site uses `.webp` posters; it
  lists a `forest_ground_04` texture set, which is not in `assets/tex/` and not referenced by
  any code; and it says all certificate thumbnails are 560 px wide, but 6 are 280 px.
- **Six raw archives exceed 100 MB.** Committing `3d models/` or `data/` would make every push
  fail; both stay ignored.
