# Portfolio — Shivender Singh Thakur

**Version 6.** The portfolio is a floating island you explore. Drag to look around, click a
landmark to fly to it, and its part of the page opens beside it.

Version 6 adds: an arm you can re-specify live (base height, upper arm, forearm, claw) with
its reach, floor area and working volume computed and drawn as a dome; free 3D dragging of
the block, into mid-air; a matte finish throughout the bench; a desktop tower beside the arm;
a hall of fame for the certificates; a swipeable gallery viewer for every picture on the
site; a hardware shelf of real boards and sensors converted from CAD; and longer write-ups
that explain how each piece of work was done.

```
index.html          every word on the site, as ordinary HTML: an intro card and one panel per place
css/styles.css      type, colour, the panels, and a stacked-page fallback without WebGL
js/world.js         renderer, orbit camera, flying between places, panels, the scan viewer
js/island.js        terrain and the eight landmarks, with real scans framed on their walls
js/bench.js         the arm at the centre: parametric geometry, inverse kinematics, reach dome,
                    pick and place, the computer and its monitor
js/stations.js      the smaller rigs the landmarks stand up
js/icons.js         skills as hand-built 3D objects with physical materials
js/realism.js       HDRI lighting, scanned PBR surfaces, photoreal props, the post-processing stack
assets/             portrait, press clippings, event photos, certificates, bench photos, link card,
                    models/ (GLB), tex/ (PBR sets), hdri/ (lighting)
tools/models/       the OBJ to GLB converter that produced assets/models/{boards,sensors,robotics}
```

## Hardware models

The boards, sensors and the robotic arm come from OBJ archives kept outside the repository in
`3d models/` (1.9 GB, gitignored), extracted one folder per model into `data/raw/`.
`tools/models/convert.mjs` turns each folder into one compressed GLB and records it in
`assets/models/catalog.json`:

- a streaming OBJ parser, so a 3-million-triangle export does not need its text in memory;
- each part classified from its geometry into a matte material (board, pins, metal, plastic,
  dome), with the source's sRGB colours converted to linear;
- parts flattened and joined, vertices welded, then meshoptimizer simplification to a
  per-category triangle budget, widening the error bound step by step when many small closed
  parts refuse to collapse;
- normals regenerated, then `EXT_meshopt_compression` with quantised attributes.

```bash
cd tools/models && npm install
node convert.mjs ../../data/raw ../../assets/models              # everything
node convert.mjs ../../data/raw ../../assets/models arduino-uno  # one model
```

| Category | Models |
| --- | --- |
| boards | Arduino Mega 2560, Arduino Nano Every, Arduino Uno, ESP32 NodeMCU, Raspberry Pi 4B, Raspberry Pi 5, Raspberry Pi Zero |
| sensors | HC-SR04 ultrasonic, PIR motion, IR, DHT11, IMU, MQ-135, MQ-2, LDR, rain, touch |
| robotics | robotic arm |

The lab shelf loads the lighter, cleaner ones (Uno, Pi 5, Pi 4B, Nano Every and seven
sensors) and the arm on a turntable; phones load two. The rest are catalogued for later use.

## Realism

- **Lighting** comes from a photographed workshop HDRI, so metal, glass and clearcoat reflect a
  real room rather than a flat colour.
- **Surfaces** are scanned PBR sets with colour, normal and roughness maps: forest ground on
  the island, rock on the cliffs and paths, worn table wood on the benches, metal plate on the
  buildings.
- **Tech props** are photoreal scans: a circuit board, a vintage laptop, an arm desk lamp, a
  metal toolbox, an industrial microscope and a television. Each is compressed to a meshopt
  GLB with WebP textures and fitted from its own measured bounds when it loads.
- **The workbench is matte**: the arm is powder-coat and anodised finishes with no clearcoat,
  and so are the tower, monitor, keyboard and props beside it. The skill icons keep physical
  materials.
- **Post-processing** adds ground-truth ambient occlusion, a bloom with a high threshold so
  only screens, LEDs and the beacon glow, and SMAA edges. Phones skip the occlusion and SMAA.

The whole realistic asset set is about 6 MB: 2.6 MB of models, 1.9 MB of textures and
1.8 MB of HDRI.

### Credits

HDRI, textures and 3D models are from [Poly Haven](https://polyhaven.com), released under
CC0. Attribution is not required, but credit is given here anyway:
`aircraft_workshop_01` (HDRI); `forest_ground_04`, `rocky_terrain_02`, `wood_table_worn`,
`metal_plate` (textures); `circuit_board`, `classic_laptop`, `desk_lamp_arm_01`,
`metal_toolbox`, `industrial_microscope`, `Television_01` (models).

## Run it locally

Open `index.html` directly and the browser blocks the ES module imports, so serve the
folder instead:

```bash
python3 -m http.server 8000
```

Then visit http://localhost:8000.

## Publish it on GitHub Pages

The repository `Shivenderthakur.github.io` is already served at
https://Shivenderthakur.github.io. Push to `main` and the site follows within a minute.

```bash
git push
```

`.nojekyll` is present, which stops GitHub running Jekyll over the folder.

## The island

Eight places, each a landmark facing the centre of the island:

| Landmark | Opens |
| --- | --- |
| The workbench, with the arm | About |
| Research tower, with the sprint dials | Research practice |
| Bheenmal stage, four newspaper clippings on its backdrop | Work, from the humanoid |
| Robotics lab, three rigs on tables, a shelf of real boards and sensors, the arm on a turntable | Work, from the attendance system |
| Hall of fame, eleven certificates in brass frames with lamps and engraved plates | Experience and certification |
| Skills ring, twelve floating 3D icons | Skills |
| Toolchain shed, a bench vignette and photos of the real bench | Where I work |
| Radio mast | Contact |

Every place is also in the header, and every panel has a URL (`#research`, `#work-robonari`
and so on), so a link can open straight into a place. Arrow keys step between places and
Escape returns to the island.

Any picture, framed in the world or in a panel, opens in one gallery viewer holding the rest of
its wall or evidence strip. Swipe, use the arrow keys or the side buttons, or pick from the
thumbnail strip; a click on the backdrop closes it.

The skill icons are built from primitives: a board, a chip, a lens, a neural knot, a
terminal, a globe, a shield, gears, an arm joint, a cloud and an antenna. Vendor logos are
deliberately not reproduced; their owners do not permit them to be redrawn or restyled.

Without WebGL the island is skipped and the same HTML reads as an ordinary page.

## The arm

- **Drag the block** and it moves in the plane facing the camera: up, down and sideways,
  into open air. Drag empty space to walk round the arm and look over it; the drag plane turns
  with the view, so any point inside the working dome can be reached.
- **Drag the amber ring** above it to slide it across the desk at the height it already has,
  or tap the ring to lift or lower it. A dashed line to the desk shows how high it is, the HGT
  readout gives the height in centimetres, and the block stays exactly where you leave it.
- **Click the desk** to send the block there.
- **Let go** and the arm comes for it, in mid-air if that is where it is: approach, descend,
  close the claw, lift, carry it across the bench, set it down on the pedestal, then clear
  away and return to rest.

### Tuning the arm

The "Tune the arm" panel sets four numbers: base height, upper arm, forearm and claw, in
centimetres (one scene unit is 10 cm). Changing any of them rebuilds the arm's geometry and
recomputes, from the same numbers:

- **Reach**, the furthest the claw can touch on the desk, and **top**, its highest point;
- **Floor area**, the annulus of the desk the claw can reach, π(R² − r²);
- **Working volume**, the volume swept by the reachable profile turned about the base,
  by Pappus's theorem on the profile polygon.

The same profile is drawn as a translucent dome with meridians and parallels, brightening
while you drag or retune. The pedestal moves to a point the new arm can comfortably reach,
and the rest and carry poses scale with it, so a short arm is never asked for a pose only a
long one can hold.

The turret yaw comes from the target's bearing and interpolates the short way round, so the
arm travels through a full circle without unwinding. Shoulder and elbow angles come from a
two-link inverse kinematics solution using the law of cosines, aimed one claw length short
of the target so the finger pads, not the wrist, arrive around it. The wrist counter-rotates
to keep the claw level.

The block can go anywhere the arm can physically reach, which is a 3-DOF envelope and not a
circle: the wrist must sit one claw length short of the target and the two links can only
span between their limits. The amber arc that appears while you drag is the real outer edge
in the arm's own plane. Both the block and every goal the sequence sets are pushed onto that
envelope before use, so the arm never chases a point it cannot touch and no step has to wait
out a timeout.

Beside the arm is the computer it is programmed from: a mid-tower with a side window and
turning fans, cabled to the arm's base, and a monitor whose terminal is drawn frame by frame
onto a canvas texture with the link lengths, reach, volume, joint angles, target position and
state.

## The rigs

Eight rigs stand along the bench, one per section: a UART frame travelling down a serial
line, two sprint dials geared at different speeds, the landmarks a face recogniser keys on,
a wall of name plates lighting one at a time, a hand pose driving a gripper, a two-link arm
tracing both of its working planes, the boards themselves, and a bench vignette of the
tools the work actually happens in. Each updates only while the camera is near it, and is
hidden entirely beyond 26 units.

The editors are named in the page's own type rather than reproduced as marks. Microsoft,
JetBrains and GitHub all forbid redrawing or restyling their logos, and Sublime HQ publishes
no permission at all, so the 3D stands in for them with generic bench objects instead.

## Evidence

Three newspaper clippings and an event photograph sit in the DOM, inside the claims they
support, rather than in the 3D world. They are desaturated at rest and return to colour on
hover, and each links to a larger scan. The raw LinkedIn export in `data/` is gitignored.

With `prefers-reduced-motion` set, nothing moves on its own. The arm only moves when you
drive it.
