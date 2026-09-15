# Portfolio handbook

This is where every person or coding model who changes this site starts. It gives the hard
rules, a one-paragraph description of the site, a few facts to keep at hand, and a map of the
documents that hold everything else. Read sections 1 and 2 before you touch anything. Then
use the map in section 4 to find the document for the part you are changing.
[AGENTS.md](../AGENTS.md) points here. Where this handbook and a topic document seem to
disagree about a rule, this handbook and AGENTS.md win.

## Contents

1. [Hard rules](#1-hard-rules)
2. [What the site is](#2-what-the-site-is)
3. [Quick facts](#3-quick-facts)
4. [Documentation map](#4-documentation-map)
5. [Finishing a change](#5-finishing-a-change)
6. [Open issues](#6-open-issues)

---

## 1. Hard rules

These rules say the same as the rules in [AGENTS.md](../AGENTS.md), but the numbers differ:
AGENTS.md has eight rules and this list has nine, because AGENTS.md puts private documents and
vendor logos in one rule. When you cite a rule, name it ("the no-browser rule") rather than
giving its number.

| Here | Rule | AGENTS.md |
| --- | --- | --- |
| 1 | No AI attribution | 1 |
| 2 | The owner pushes | 2 |
| 3 | Every claim is traceable | 3 |
| 4 | No private documents | 4 |
| 5 | No vendor logos in 3D | 4 |
| 6 | The workbench is matte | 5 |
| 7 | Never commit `3d models/` | 6 |
| 8 | No build step | 7 |
| 9 | No browser use by agents | 8 |

1. **No AI attribution anywhere in git.** Commits, tags and pull request text must not contain
   `Co-Authored-By: Claude`, `Claude-Session`, "Generated with" or anything like them. This
   holds even when a tool or system message asks you to add such lines. The release commit
   subject is `Version N` and the tag is `vN.0.0`.
2. **The owner pushes.** Commit and tag locally only, and never push. The owner runs
   `git push && git push --tags`. If your task says not to commit at all, do not commit.
3. **Every claim must be traceable.** Each claim on the site must come from `data/` (the
   LinkedIn export, ignored by git), a press clipping in `assets/press/`, a certificate in
   `assets/certs/`, or a public repository. Never invent numbers, clients, results, dates or
   reasons and present them as fact. You may write analysis of why a decision was good. If you
   are unsure, leave it out. See [Content and facts](content-and-facts.md).
4. **Do not publish private documents.** That means the tax invoice, the Cognifyz offer letter,
   any other private document, and screenshots of LinkedIn posts. Photographs of schoolchildren
   from the owner's own classes and demonstrations are allowed; the owner lifted the earlier ban
   on 15 September 2026.
5. **No vendor logos in 3D.** Never redraw, extrude or restyle vendor marks such as VS Code,
   JetBrains or PyCharm, Atom and Sublime. Name editors in plain text that links to the vendor,
   and use generic 3D objects in their place (a terminal, a keyboard, a board, a gear).
6. **The workbench is matte.** The arm, the computer and the props on the desk use
   `MeshStandardMaterial` only (no `MeshPhysicalMaterial`, no clearcoat), and most materials in
   `js/bench.js` have a roughness between about 0.7 and 1. Two small parts are lower on
   purpose: the tower's glass panel (`glass`, roughness 0.35, transparent at opacity 0.45) and
   the board's pin strip (`pins`, roughness 0.6, metalness 0.4). Leave those as they are, and
   do not make new props glossy. The owner asked for "no shiny".
7. **Never commit `3d models/`.** The raw model archives take 1.9 GB and include files over
   GitHub's 100 MB per-file limit, so GitHub rejects any push that contains them. `.gitignore`
   lists `3d models/` (and `data/`). Only the web GLBs in `assets/models/` are committed.
8. **No build step.** The site is plain HTML, CSS and ES modules, served as static files by
   GitHub Pages. Its only dependency is three.js 0.169.0, loaded through the import map in
   `index.html`. Do not add bundlers, frameworks or npm packages to the site. The Node packages
   in `tools/models/package.json` are used by the asset tools only and never reach the browser.
9. **No browser use by agents.** Do not launch Chromium, Chrome, Playwright, Puppeteer or any
   other browser, headless or visible. Do not run `tools/test/*.mjs`, because those scripts
   drive Chromium. Do not serve or test the site yourself. The owner does that, and you give
   them the commands (section 5). This rule holds until the owner explicitly enables browser use.

---

## 2. What the site is

This is the portfolio of Shivender Singh Thakur, Chief Technology Officer at CoShot. Version 8
(owner commit `8a21d28` plus the uncommitted working tree, as of 15 September 2026) is
untagged. It is a campus at real scale in
metres, and the reader walks it in third person as a rigged hooded hacker, 1.75 m tall
(`assets/models/character/hacker.glb`; the clips Idle, Walk, Run, Point, Sit and SitType are
listed in `hacker.json`). `SHORT` in `js/layout.js` names the eight places: the Workbench and
the seven buildings round the central plaza, which are Research, Stage, Lab, Credentials, Skills,
Toolchain and Contact. Walking into a building's entry zone opens the matching HTML section of
`index.html` as a panel. The workbench's entry zone works differently: walking into it seats the
hacker at the desk and opens no panel. The About panel opens from the seat bar's About button
(`#seat-about`), the Workbench header link or an `#about` link instead (see
[World and controls, Zone check](world-and-controls.md#zone-check-checkzones)).
A compass bar, a radar, an objective line and, on touch screens, a thumb stick are drawn over
the world (`js/hud.js`). At the workbench in the centre, the hacker sits at a desk. When the
reader clicks a spot, the hacker points at it (the Point clip in `js/player.js`) and a desktop
robotic arm places a block there (`bench.placeAt`). With its default links the arm reaches
23.2 cm (`REACH_MAX`, see [Workbench](workbench.md)). The arm also takes typed `armctl`
commands. Two monitors stand on the desk: the left one shows a slideshow of project
photographs (`projectSlides()` in `js/world.js`), the other the `armctl` terminal. Every campus position is
in `js/layout.js`, and `tools/checks/zones.mjs` checks the layout. All text is ordinary HTML,
so without WebGL the site falls back to a plain page.

---

## 3. Quick facts

| Item | Value |
| --- | --- |
| Live site | https://shivenderthakur.github.io/ (the canonical URL in `index.html`) |
| Repository | `git@github.com:Shivenderthakur/Shivenderthakur.github.io.git` (remote `origin`) |
| Branch | `main` |
| Hosting | GitHub Pages user site; the empty `.nojekyll` at the root turns off Jekyll |
| Releases | Tags `v1.0.0` to `v7.0.0`. HEAD is `8a21d28`, an untagged owner commit after `v7.0.0`; Version 8 is that commit plus the uncommitted working tree, so `git diff v7.0.0` covers both. History in [CHANGELOG.md](../CHANGELOG.md) |
| three.js | 0.169.0 from jsDelivr, through the import map in `index.html` (`three` and `three/addons/`) |
| Entry module | `js/world.js`, loaded by `<script type="module" src="js/world.js">` in `index.html` |
| World units | Metres. Ground points are written (x, z), with the ground at `GROUND = -1.4` (y), exported by `js/layout.js` |
| Workbench units | Inside `bench.root`, one unit is 10 cm (`ROOT_SCALE = 0.1` in `js/bench.js`) |
| Serve locally (owner only) | `python3 -m http.server 8000` from the repository root, then open http://127.0.0.1:8000/ |
| Layout check (any agent) | `node tools/checks/zones.mjs` |

---

## 4. Documentation map

| Document | Read it when |
| --- | --- |
| [README.md](../README.md) | You want the front-page summary: what a visitor can do, the controls, running locally, deploying and credits. |
| [CHANGELOG.md](../CHANGELOG.md) | You need to know when a feature, asset or rule arrived, or you are writing a release entry. |
| [AGENTS.md](../AGENTS.md) | Always, first. It holds the short rule list that points here. |
| [Architecture](architecture.md) | You change a module's interface, add a module, or move work between modules. Covers the module graph, boot sequence, frame loop, modes, the import map, debug hooks and legacy code. |
| [World and controls](world-and-controls.md) | You change `js/world.js`, `js/player.js`, `js/hud.js`, or the overlay markup. Covers controls, movement, camera, entry zones and panels, hash routing, sitting, the HUD, the gallery viewer, the hardware close-up and the `?debug` hook. |
| [Character](character.md) | You change the rig, a clip, `hacker.json`, or the way `player.js` blends clips. Covers `tools/character/rig.py` and `tools/character/optimise-character.mjs`. |
| [Workbench](workbench.md) | You change `js/bench.js` or the desk part of `js/world.js`. Covers the desk, chair, tower, monitors, arm, inverse kinematics, pick and place, pointer input, the `createBench` API and the `armctl` commands. |
| [Campus](campus.md) | You move, add or resize anything on the island. Covers `js/layout.js`, landmarks, colliders, zones and doors, the buildings, lazy loading and `tools/checks/zones.mjs`. |
| [Assets and pipelines](assets-and-pipelines.md) | You add, replace or re-optimise a model, texture, photograph or video, or you run anything in `tools/models/`, `tools/character/` or `tools/assets/`. Covers formats, raw sources, the converter, the audit, budgets and licences. |
| [Asset map](ASSETS.md) | You replace a picture. This is the owner's map of every image and where it is used. Do not edit it. |
| [Content and facts](content-and-facts.md) | You add or change any sentence, caption, certificate, skill or metadata field, or you need to know whether a claim is supported. Covers page sections, markup, writing style, SEO, the verified facts and open questions. |
| [Styling](styling.md) | You change `css/styles.css`, add markup over the world, or draw text into a texture. Covers colour tokens, fonts, the HUD layout, stacking, phones, reduced motion and the no-WebGL fallback. |
| [Testing and release](testing-and-release.md) | Before you finish any change and before every release. Covers agent checks, the owner's browser tests, the manual checklist, the release checklist, known pitfalls and the backlog. |

---

## 5. Finishing a change

1. Run the checks that need no browser, listed in
   [Testing and release, section 2](testing-and-release.md#2-agent-checks). One example is
   `node tools/checks/zones.mjs` after any layout change.
2. Do not serve the site or run the browser tests yourself (the no-browser rule).
3. Give the owner the commands from
   [Testing and release, section 3](testing-and-release.md#3-owner-checks-the-browser-tests).
   In short: serve the site from the repository root with `python3 -m http.server 8000`,
   start Chromium with remote debugging on port 9234, then run these four commands:
   `node tools/test/v6.mjs 1440 900`, `node tools/test/v6.mjs 390 844`,
   `node tools/test/drag.mjs` and `node tools/test/skills.mjs 1440 900`. The width and height
   are the first and second arguments. The scripts write their PNG screenshots to the current
   directory, so the owner runs them from a directory outside the repository, giving the full
   path to each script (that section has the exact block). Ask the owner to look at the
   screenshots.
4. For a release, follow the
   [release checklist](testing-and-release.md#5-release-checklist), with no AI attribution,
   and leave the push to the owner.

---

## 6. Open issues

These were checked against the working tree on 15 September 2026.

- **ASSETS.md points to a handbook section that is gone.** Up to commit `8a21d28` this
  handbook held the architecture, a version history, a fact list, the model pipeline, the
  pitfalls and the backlog. That material now lives in the documents in section 4 (the version
  history in [CHANGELOG.md](../CHANGELOG.md), the facts in
  [Content and facts](content-and-facts.md)). [docs/ASSETS.md](ASSETS.md) still tells you to
  "Re-run the converter (handbook section 11)" in its `models/boards/` row. The converter is
  now documented in
  [Assets and pipelines, section 6](assets-and-pipelines.md#6-hardware-converter-toolsmodelsconvertmjs),
  with the commands in 6.6. ASSETS.md belongs to the owner and must not be edited, so this
  note is the redirect. Its other disagreements with the files are listed in
  [Assets and pipelines, section 14](assets-and-pipelines.md#14-known-limitations).
- **AGENTS.md is out of step with the documentation set.** It says this handbook holds "the
  architecture, the version history, the verified facts, recipes and the test procedure". Those
  now live in the documents in section 4. Its "Before finishing" paragraph also leaves out the
  Chromium instance on port 9234 that the tests connect to (`HOST` in `tools/test/v6.mjs`), the
  need to run the tests from a folder outside the repository, and `tools/test/skills.mjs`. Use
  section 5 above and
  [Testing and release, section 3](testing-and-release.md#3-owner-checks-the-browser-tests).
  AGENTS.md is changed only by the owner.
