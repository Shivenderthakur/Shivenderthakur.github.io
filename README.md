# Portfolio — Shivender Singh Thakur

A single static page. No build step, no dependencies to install. Three.js is the only
external library and it loads from a CDN at runtime.

```
index.html          the whole page
css/styles.css      type, colour and layout
js/arm.js           the 3D work cell: arm, claw, draggable payload, orbit camera
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

The panel in the hero is a robotic cell solved in real time.

- **Drag the block** anywhere on the floor, or tap the floor to send it there. The amber
  circle is the arm's working radius and the block is clamped to it.
- **Drag the empty floor** to walk the camera around the cell.
- Leave it alone for five seconds and it runs its own pick-and-place cycle.

The turret yaw comes from the block's bearing and interpolates the short way round, so the
arm can travel through a full circle without unwinding. Shoulder and elbow angles come from
a two-link inverse kinematics solution using the law of cosines, aimed at a point one claw
length short of the block so the finger pads, not the wrist, end up around it. The wrist
counter-rotates to keep the claw level. The claw opens in proportion to how far the pads
still are from the block and shuts once they are around it.

Reflections come from a generated room environment through `PMREMGenerator`, with ACES
filmic tone mapping. Pixel ratio, shadow map size, field of view and camera distance all
scale with the panel size, so the cell stays framed from a phone to a wide desktop.

With `prefers-reduced-motion` set, the unattended cycle never starts and the arm only moves
when you drive it.
