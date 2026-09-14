# Portfolio — Shivender Singh Thakur

**Version 4.** The portfolio is a floating island you explore. Drag to look around, click a
landmark to fly to it, and its part of the page opens beside it. Version 3 was a scrolling
page with a workshop behind it.

```
index.html          every word on the site, as ordinary HTML: an intro card and one panel per place
css/styles.css      type, colour, the panels, and a stacked-page fallback without WebGL
js/world.js         renderer, orbit camera, flying between places, panels, the scan viewer
js/island.js        terrain and the eight landmarks, with real scans framed on their walls
js/bench.js         the arm at the centre: inverse kinematics, claw, pick and place, the monitor
js/stations.js      the smaller rigs the landmarks stand up
js/icons.js         skills as hand-built 3D objects
assets/             portrait, press clippings, event photos, certificates, bench photos, link card
```

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
| Robotics lab, three rigs on tables | Work, from the attendance system |
| Credentials hall, eleven certificates on its wall | Experience and certification |
| Skills ring, twelve floating 3D icons | Skills |
| Toolchain shed, a bench vignette and photos of the real bench | Where I work |
| Radio mast | Contact |

Every place is also in the header, and every panel has a URL (`#research`, `#work-robonari`
and so on), so a link can open straight into a place. Arrow keys step between places and
Escape returns to the island. Any framed scan, in the world or in a panel, opens full size.

At the workbench the arm is live: click the bench to send the block somewhere, or drag it, and
the arm fetches it back to the pedestal. The pick-and-place details below still apply.

The skill icons are built from primitives: a board, a chip, a lens, a neural knot, a
terminal, a globe, a shield, gears, an arm joint, a cloud and an antenna. Vendor logos are
deliberately not reproduced; their owners do not permit them to be redrawn or restyled.

Without WebGL the island is skipped and the same HTML reads as an ordinary page.

## The arm

- **Drag the block** anywhere on the bench, or click the bench to send it there.
- **Drag the amber ring** above it to lift it into the air, or tap the ring on a touch
  screen, where a vertical drag scrolls the page instead. A dashed line to the bench shows
  how high it is, and the block stays exactly where you leave it.
- **Let go** and the arm comes for it, in mid air if that is where it is: approach, descend,
  close the claw, lift, carry it across the bench, set it down on the pedestal, then clear
  away and return to rest.
- **On a touch screen**, tap "Take control" first. Until then the hero lets a vertical swipe
  scroll the page rather than swallowing it.

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

The monitor beside the arm is a terminal drawn frame by frame onto a canvas texture, showing
the same joint angles and state as the readout in the corner of the page.

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
