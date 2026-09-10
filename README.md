# Portfolio — Shivender Singh Thakur

A single static page. No build step, no dependencies to install. Three.js is the only
external library and it loads from a CDN at runtime.

```
index.html          the whole page
css/styles.css      type, colour and layout
js/arm.js           the 3D cell: arm, claw, draggable payload, pick-and-place, orbit camera
js/accents.js       four small 3D pieces beside the writing, sharing one WebGL context
js/site.js          highlights the section you are reading in the masthead
assets/             portrait
```

## Run it locally

Open `index.html` directly and the ES module import will be blocked by the browser, so serve
the folder instead:

```bash
python3 -m http.server 8000
```

Then visit http://localhost:8000.

## Publish it on GitHub Pages

Create a repository named `Shivenderthakur.github.io` and push this folder to it. Pages
serves that repository at `https://Shivenderthakur.github.io` automatically.

```bash
git remote add origin git@github.com:Shivenderthakur/Shivenderthakur.github.io.git
git branch -M main
git push -u origin main
```

If you would rather use a normal repository name, push it there instead, then open
Settings, Pages, and set the source to the `main` branch and the `/ (root)` folder. The site
lands at `https://Shivenderthakur.github.io/<repository-name>/`.

The `.nojekyll` file is already present, which stops GitHub from running Jekyll over the
folder.

## The work cell

The panel in the hero is a robotic cell you operate.

- **Drag the block** anywhere on the floor, or tap the floor to send it there.
- **Drag the amber ring** above the block to lift it into the air, or tap the ring on a
  touch screen, where a vertical drag scrolls the page instead. A dashed line to the floor
  shows how high it is, and the block stays exactly where you leave it.
- **Let go** and the arm comes for it, in mid air if that is where it is: approach, descend,
  close the claw, lift, carry it across the cell, set it down on the pedestal, then clear
  away and return to rest.
- **Drag the empty floor** to walk the camera around the cell.
- Leave it alone and it throws the block somewhere new and fetches it again.

The turret yaw comes from the target's bearing and interpolates the short way round, so the
arm travels through a full circle without unwinding. Shoulder and elbow angles come from a
two-link inverse kinematics solution using the law of cosines, aimed one claw length short
of the target so the finger pads, not the wrist, arrive around it. The wrist counter-rotates
to keep the claw level. A small state machine drives the sequence and each step waits for
the pads to actually arrive rather than running on a timer.

The room is a lit cyclorama, so there is no horizon seam from any camera angle. Reflections
come from a generated room environment through `PMREMGenerator` with ACES filmic tone
mapping. Panel width, camera distance, field of view, pixel ratio and shadow map size all
scale together, so the cell stays framed from a phone to a wide desktop.

## The accents

Four smaller pieces sit beside the writing: the face landmarks a recogniser keys on, a hand
pose driving a gripper, a two-link arm tracing both of its working planes, and the boards
themselves. All four share a single WebGL context. The renderer draws each one into a corner
of one offscreen canvas and the frame is blitted into the 2D canvas on the page, so four
moving pictures cost one GPU context rather than four. Each one only runs while it is on
screen.

With `prefers-reduced-motion` set, the unattended cycle never starts and the arm only moves
when you drive it.
