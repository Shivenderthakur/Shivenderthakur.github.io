# Portfolio — Shivender Singh Thakur

A single static page. No build step, no dependencies to install. Three.js is the only
external library and it loads from a CDN at runtime.

```
index.html          the whole page
css/styles.css      type, colour and layout
js/arm.js           the 3D arm: two-link inverse kinematics, base yaw, telemetry readout
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

## The arm

The panel in the hero is a five-axis arm solved in real time. Pointer position becomes a
target in the arm's workspace. Base yaw comes straight from the horizontal axis. The
shoulder and elbow angles come from a two-link inverse kinematics solution using the law of
cosines, clamped to the arm's reach. The wrist counter-rotates to keep the gripper level.
Joint angles are damped frame to frame and printed in the readout.

With `prefers-reduced-motion` set, the idle sweep is switched off and the arm only moves
when you drive it.
