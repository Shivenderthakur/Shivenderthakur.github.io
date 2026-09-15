# Instructions for coding agents

Read `docs/HANDBOOK.md` before changing anything. It has the architecture, the version
history, the verified facts, recipes and the test procedure.

Non-negotiable:

1. Never add AI attribution to commits, tags or PRs (no `Co-Authored-By: Claude`, no
   `Claude-Session`, no "Generated with"). Commit subject for releases: `Version N`, tag `vN.0.0`.
2. Commit locally; the owner pushes.
3. Every claim on the site must trace to `data/` (LinkedIn export), `assets/press/`, a
   certificate in `assets/certs/`, or a public repo. Do not invent facts.
4. Never publish private documents or LinkedIn post screenshots. Photos of schoolchildren
   from the owner's own classes and demonstrations are allowed (owner's decision,
   15 Sep 2026). Never redraw vendor logos in 3D.
5. The workbench (arm, computer, props) stays matte.
6. Never commit `3d models/` (1.9 GB, files over GitHub's 100 MB limit).
7. No build step and no site dependencies beyond three.js 0.169.0 from the import map.
8. No browser use: never launch Chromium, Chrome, Playwright, Puppeteer or any other browser,
   headless or visible, and never run `tools/test/*.mjs`, until the owner explicitly enables it.

Before finishing: do not serve or test the site yourself. Give the owner the commands
(`python3 -m http.server 8000`, then `tools/test/v6.mjs` at 1440×900 and 390×844 and
`tools/test/drag.mjs`) and ask them to look at the screenshots.
