# Portfolio — Shivender Singh Thakur

**Version 3.** Repositioned around research practice, with press evidence, structured data
and eight stations along the bench. Version 2 moved the whole page inside one 3D workshop;
version 1 was a light editorial layout with the 3D boxed into panels.

A single static page with a 3D workshop running behind the writing. No build step and
nothing to install. Three.js is the only external library and it loads from a CDN.

```
index.html          the whole page
css/styles.css      type, colour and layout
js/world.js         the scene, the room, and the camera path the page scrolls along
js/bench.js         the arm: inverse kinematics, claw, pick and place, the monitor
js/stations.js      the eight rigs standing along the bench
js/site.js          marks the section you are reading in the masthead
assets/             portrait
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

## The workshop

The canvas is fixed to the viewport and the page scrolls over it. Each section of the
writing is anchored to a station on one long bench, and scrolling dollies the camera from
one to the next: the arm, the serial link, the three project rigs, the boards, and finally
a long shot down the whole bench. Each shot aims a little to the left of its subject so the
rig lands in the right of the frame, clear of the text, and a gradient scrim keeps the
writing legible over whatever is behind it.

Anchors are measured from the DOM and measured again once web fonts land and whenever the
page height changes, because a late font shifts every one of them. The camera eases on real
elapsed time rather than a capped frame delta, so a slow device keeps up with the scroll
instead of trailing a station behind.

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
