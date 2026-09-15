# Styling

This document describes the visual system of the site: the colour tokens, the fonts and type
scale, the pieces of the on-screen instrument layer (the HUD) and where each one sits at desktop
and phone widths, the cut-corner pane, the fallback page used when the 3D world does not start,
reduced motion and focus styles. It also covers the colours and fonts drawn into canvas textures
inside the world. Read it before you change `css/styles.css`, add markup that shows over the
world, or draw text into a texture.

Sources: `css/styles.css`, `index.html`, `js/hud.js`, `js/world.js`, and the canvas drawing
functions in `js/bench.js`, `js/island.js`, `js/campus.js`, `js/icons.js` and `js/stations.js`. For how these modules
fit together see [Architecture](architecture.md); for the controls and body state changes in
motion see [World and controls](world-and-controls.md).

## Contents

1. [Design direction](#1-design-direction)
2. [Colour tokens](#2-colour-tokens)
3. [Fonts and type scale](#3-fonts-and-type-scale)
4. [Canvas textures](#4-canvas-textures)
5. [Body state classes](#5-body-state-classes)
6. [Island mode and the no-world fallback](#6-island-mode-and-the-no-world-fallback)
7. [The cut-corner pane](#7-the-cut-corner-pane)
8. [HUD layout reference](#8-hud-layout-reference)
9. [Stacking order](#9-stacking-order)
10. [Phones at 390 px](#10-phones-at-390-px)
11. [Reduced motion](#11-reduced-motion)
12. [Focus and hover](#12-focus-and-hover)
13. [Adding a HUD component](#13-adding-a-hud-component)
14. [Known limitations](#14-known-limitations)

## 1. Design direction

The comment on `:root` in `css/styles.css` states the direction: "2010s instrument glass at dusk:
slate ground, frosted panes, ice-cyan lines, amber kept for whatever is live or open". In practice:

- The ground is a dark slate blue (`--ground`). Everything over the world sits on translucent,
  blurred panes (`backdrop-filter: blur(...)`).
- Lines, rules, hairlines and the compass use ice cyan (`--line`, and `--rule` at reduced alpha).
- Amber (`--phosphor`) marks what is live, current or open: the current place on the compass and
  radar, the current masthead link, joint readings, the console prompt and error rows, primary
  buttons (Enter the campus, Stand up, Look closer).
- Panes have one corner cut at 45 degrees (section 7). Corners are otherwise square: no
  `border-radius` is used except on the thumb stick.
- Readings, labels and code are set in a monospace face; headings and buttons in a narrow
  technical sans; running text in a neutral sans (section 3).

The block comment at the very top of `css/styles.css` ("vellum on pine") describes an earlier
palette and is out of date.

## 2. Colour tokens

Defined on `:root` in `css/styles.css`.

| Token | Value | Role |
| --- | --- | --- |
| `--ground` | `#101c26` | Page background (`html`, `body`); dark text on amber in some rules is written as the literal `#101c26`. Also `<meta name="theme-color">` in `index.html`. |
| `--ink` | `#e9f1f4` | Primary text, button text, default borders of `.btn`. |
| `--muted` | `#93a8b2` | Secondary text: captions, notes, dates, console header, rig labels. |
| `--rule` | `rgba(154, 217, 238, 0.22)` | Borders of panes, buttons and section heads. |
| `--rule-sub` | `rgba(154, 217, 238, 0.1)` | Faint dividers inside panels (entries, timeline rows, console rows, image wells). |
| `--line` | `#9ad9ee` | Ice cyan: hairlines, compass ticks and cardinal letters, place label, focus outlines, hover state of secondary buttons, console command rows. |
| `--phosphor` | `#ffb43d` | Amber: live, current or primary (see section 1). |
| `--glass` | `rgba(16, 28, 38, 0.78)` | Background of the `<noscript>` notice. |
| `--pane` | `rgba(18, 31, 42, 0.72)` | Background of the intro card and the armctl console. |
| `--cut` | `0.9rem` | Size of the cut corner on panes. |

Layout tokens on the same rule:

| Token | Value | Role |
| --- | --- | --- |
| `--measure` | `34rem` | Maximum line length of body copy in the stacked page. |
| `--gutter` | `clamp(1.1rem, 4vw, 3.5rem)` | Side margin; the left edge for most desktop HUD pieces. |
| `--rail-w` | `11rem` | Width of the left rail column in the stacked page (at `min-width: 62rem`). |
| `--sans`, `--body`, `--mono` | see section 3 | Font stacks. |

Colours written as literals rather than tokens (search for them before adding a new one):

| Value | Where | Role |
| --- | --- | --- |
| `rgba(14, 24, 33, 0.78 to 0.98)` | `.masthead`, `.intro`, `.panel`, `.panel-bar`, `.closeup`, `.rig`, `.seat__actions button`, `.viewer__nav`, `.viewer__close` | Darker glass behind panes and bars. |
| `rgba(154, 217, 238, 0.06 to 0.35)` | `kbd`, `.stick`, `.stick__knob`, `.console__line:focus-within`, inset top highlight on panes | `--line` at low alpha. |
| `rgba(255, 180, 61, 0.35 to 0.55)` | `.evidence a:hover`, `.wall a:hover`, `.how` left border, `.repo a`, video badge | `--phosphor` at low alpha. |
| `#10202a` | `.btn--go`, `.seat__stand` | Dark text on amber or cyan buttons. |
| `#ffb940` | `.closeup__enter:hover` | Hover of the amber close-up button. |
| `#8aa3ae`, `#6d8793`, `#a9c1ca` | `.readout`, `.hud__line b`, `.hud__mode i`, `.world-hint`, `.station figcaption` | Dim instrument greys. |
| `#b9ccd4` | `.console__row` | Ordinary console output. |
| `#132330` | `.evidence a`, `.wall a`, `.viewer__thumbs button` | Well behind images while they load. |
| `#0f1c26` | `.viewer` | Viewer dialog background. |

## 3. Fonts and type scale

### Faces

`index.html` loads three families from Google Fonts in one stylesheet link:

| Token | Family and fallbacks | Weights loaded | Used for |
| --- | --- | --- | --- |
| `--sans` | "Titillium Web", "Segoe UI", "Helvetica Neue", Arial, sans-serif | 300, 400, 600, 700 | Wordmark, masthead nav, headings `h1` to `h3`, buttons, captions, compass place names, objective line, panel bar, notes. |
| `--body` | "IBM Plex Sans", "Segoe UI", "Helvetica Neue", Arial, sans-serif | 400, 500, 600, italic 400 | `body` default: paragraphs, `.hero__keys`, `.controls`, `.seat__hint`. |
| `--mono` | "Share Tech Mono", ui-monospace, "SFMono-Regular", Menlo, monospace | 400 only (no weights requested) | Readout, compass cardinals, place label, rig panel, close-up bar, seat and console, `kbd`, `.parts`, `.repo`, `.inv-group`, `.how h4`, evidence captions, viewer counter. |

Weight notes:

- Headings are declared `font-weight: 800` in the early blocks and overridden to 600 (700 for
  `.wordmark__name`) in the "2010s instrument layer" block further down the file. The later block
  wins; edit that one.
- `.masthead nav` asks for weight 500 of Titillium Web, and `.inv-group`, `.how h4` and
  `.closeup__text b` ask for 500 of Share Tech Mono. Neither weight is loaded, so the browser uses
  the nearest loaded face.

### Type scale

`body` is `1.0625rem` with `line-height: 1.62`. Sizes in use:

| Element | Size |
| --- | --- |
| `.hero h1` (stacked page) | `clamp(2rem, 4.3vw, 3.3rem)` |
| `.intro h1` (island mode) | `clamp(1.8rem, 3.4vw, 2.7rem)`; `1.6rem` at `max-width: 61.99rem` |
| `h2` | `clamp(1.5rem, 2.6vw, 2rem)` (`.prose h2` caps at `1.75rem`) |
| `.entry--lead h3` | `clamp(1.4rem, 2.6vw, 1.95rem)` |
| `.entry h3` | `clamp(1.16rem, 1.9vw, 1.4rem)` |
| `.lede` | `clamp(1.05rem, 1.5vw, 1.2rem)` |
| `.wordmark__name` | `1.12rem` |
| `.objective` | `1.02rem`; `0.92rem` at `max-width: 61.99rem` |
| `.btn`, `.masthead nav`, `.panel-bar button`, `.seat__actions button` | `0.84rem` to `0.9rem` |
| `.console__line input` | `0.86rem`; `16px` at `max-width: 61.99rem` (stops phone browsers zooming into the field) |
| `.compass__mark--cardinal` | `0.8rem` |
| `.controls`, `.seat__hint` | `0.78rem`, `0.8rem` |
| `.console__log` | `0.76rem`; `0.7rem` at `max-width: 61.99rem` |
| Instrument labels: `.readout`, `.rig`, `.closeup`, `.compass__mark`, `.inv-group`, `.how h4` | `0.72rem` |
| `.console__head` | `0.66rem` |
| `.rig__stats dt` | `0.64rem` |

Uppercase with open letter-spacing (`0.05em` to `0.12em`) is used only on mono labels: `.rig summary`,
`.rig__stats dt`, `.console__head b`, `.inv-group`, `.how h4`. Readings use
`font-variant-numeric: tabular-nums` (`.readout`, `.console__log`).

## 4. Canvas textures

Text inside the 3D world is drawn into `<canvas>` elements and used as three.js textures. These
do not read CSS custom properties, so every colour and font is written out in the JavaScript.

| Function (file) | What it draws | Background | Text | Fonts |
| --- | --- | --- | --- | --- |
| `drawRadar` inside `createHud` (`js/hud.js`) | The HUD radar (a DOM canvas, not a texture) | `rgba(12, 22, 30, 0.72)` disc | Constants `CYAN = "#9ad9ee"` and `SIGNAL = "#ffb43d"`, matching `--line` and `--phosphor` | none |
| `sign` (`js/island.js`) | Building signs, 2.4 m by 45 cm | `#0f1b25`, `#9ad9ee` border | `#eef4f6` | `600 46px 'Titillium Web'` |
| `groundLabel` (`js/campus.js`) | Zone names painted on the ground (`L.LABELS` in `js/layout.js`) | transparent | `#9ad9ee`, mesh opacity 0.8 | `600 108px 'Titillium Web'` |
| `plateTexture` (`js/island.js`) | Brass plates in the credentials hall | gradient `#b3955f` to `#8a6f43` | `#23180a` title, `#3b2c14` subtitle | `600 40px 'Titillium Web'`, `26px 'Share Tech Mono'` |
| `nameplate` (`js/island.js`) | 10 cm name plates in the skills showcase | `#0d1715`, `#f0a31e` bottom bar | `#e3eae4` | `500 44px 'Share Tech Mono'` |
| `nameTag` (`js/icons.js`) | Tags under the skill ring icons | `rgba(7, 13, 12, 0.82)`, `#f0a31e` bottom bar | `#e3eae4` | `500 44px 'Share Tech Mono'` |
| `makeSlideshow` (`js/bench.js`) | Left desk monitor, project photos | `#0b1412`, caption strip `#101b18` with `#f0a31e` rule, `#9fd8c6` scanlines | `#d7e2da` caption, `#7eceec` counter, `#6f867c` status | constants `MONO` (Share Tech Mono) 22 and 26 px, `SANS` (IBM Plex Sans) 23 px |
| `makeTerminal` (`js/bench.js`) | Right desk monitor, armctl terminal | `#0b1412`, `#9fd8c6` scanlines | `#7eceec` prompt and typed lines; `#d7e2da` command text (`./armctl --live`); labels `#6f867c` (`#8ea69b` for joints); values `#c3d2c9` (joint values J1 to J4 `#f0a31e`); output lines `#c3d2c9`; errors and cursor `#f0a31e` | `MONO` 22 px |
| `makeTerminal` (`js/stations.js`, reached through `RIGS.props` from `rig("props", ...)` in `shed()` in `js/island.js`) | Toolchain shed monitor, 512 by 288 px canvas | `#0b1412`, `#9fd8c6` scanlines | `#d7e2da` command lines, `#7d9086` output lines, `#f0a31e` cursor | `16px 'Share Tech Mono', ui-monospace, monospace` |

Two rules follow from the table:

- The HUD radar and the building signs and ground labels use the current palette. The desk
  monitors, the Toolchain shed monitor, nameplates and name tags use amber `#f0a31e`, cyan
  `#7eceec` and green-black grounds, which do not match `--phosphor` and `--line` (see
  [Known limitations](#14-known-limitations)).
- No module waits for `document.fonts`. A texture drawn once (sign, ground label, plate,
  nameplate, name tag) keeps whichever face was available when it was drawn. The desk terminal
  redraws at most every 140 ms, so it picks up the web font once it has loaded. The shed terminal
  redraws on every cursor blink, so it also picks up the web font, except under `reduceMotion`,
  where the cursor holds still and the canvas is drawn only once.

When you add canvas text, copy the hex values from the tokens in section 2 and use the same
family names and fallbacks as the CSS stacks.

## 5. Body state classes

The CSS switches the HUD on classes and attributes that `js/world.js` and `js/hud.js` set on
`<body>` and on individual elements.

| State | Set by | Meaning for styling |
| --- | --- | --- |
| `body.no-world` | `fail()` in `js/world.js`, called when `boot()` throws | The world did not start; show the stacked page (section 6). |
| `body.is-exploring` | `enterPlay()` in `js/world.js`; removed by the wordmark click handler | The intro card is dismissed and the reader walks. |
| `body.is-focused` | `go()`; removed by `closePanel()` | A panel is open. |
| `body[data-place="..."]` | `go()`; removed by `closePanel()` | Key of the open place: `bench`, `research`, `stage`, `lab`, `hall`, `skills`, `shed`, `mast`. |
| `body.is-seated` | `syncSeat()` in `js/world.js` | The hacker sits at the workbench. |
| `.hud.is-on`, `.stick.is-on` | `show()` in `createHud` (`js/hud.js`) | Fades the walking instruments in. |
| `.stick` `hidden` removed | `createHud` in `js/hud.js` when its `coarse` parameter is true; `js/world.js` evaluates `matchMedia("(pointer: coarse)")` and passes the result | The thumb stick exists only on coarse pointers. |
| `#seat` `hidden` | `setSeated()` in `js/hud.js` | Seat bar and console visible only while seated. |
| `#panel-bar` `hidden` | `go()` and `closePanel()` | Panel bar visible only with a panel open. |
| `.panel.is-open` | `go()` | The panel that slides in. |
| `.viewer.is-single` | `js/world.js` gallery code | Hides arrows and thumbnails for a one-item gallery. |
| `.compass__mark.is-current` | `update()` in `js/hud.js` | The open or seated place turns amber on the compass. |
| `--kb` on `#seat` | `fit()` in `js/hud.js`, from `window.visualViewport` | Pixels covered by a phone keyboard; the seat bar's `bottom` adds it. |

## 6. Island mode and the no-world fallback

Everything specific to the walkable world is scoped under `body:not(.no-world)`. With the world
running:

- `body` has `overflow: hidden`; the canvas `#world` is fixed full screen at `z-index: 0`.
- The masthead is fixed at the top with a gradient fading to transparent.
- The first section, `section.hero.intro`, becomes a fixed card on the left, vertically centred.
- Each `section.panel[data-panel]` becomes a fixed sheet, `width: min(36rem, 100vw)`, moved off
  screen with `transform: translateX(104%)` and `visibility: hidden` until `.is-open`.
- The footer is hidden (`body:not(.no-world) > footer`).
- Inside a panel every grid collapses to one column and `.station` figures are hidden.

With `body.no-world` the page reads top to bottom as an ordinary document:

- None of the island-mode rules apply; the masthead is `position: sticky`, sections stack.
- `.hud`, `.stick`, `.rig`, `.closeup` and `.seat` are `display: none` by default and are only
  shown by `body:not(.no-world)` rules, so they stay hidden.
- Explicit `body.no-world` rules also hide `.readout`, `.world-hint`, `.world-grab`, `.station`,
  `.panel-bar`, `.place-label` and `#explore`.
- At `min-width: 62rem`, `.prose`, `.entry` and `.timeline li` gain a `--rail-w` rail column
  (`.entry` also caps its body at `--measure`), and `.contact` splits into text and an auto-width
  link column.

`body.no-world` is added only from JavaScript. See [Known limitations](#14-known-limitations) for
what that means without JavaScript.

## 7. The cut-corner pane

Panes have their top-left corner cut at 45 degrees. The pattern has three parts:

1. **Shape.** A `clip-path` removes a `--cut` sized triangle from the top-left corner:

   ```css
   clip-path: polygon(var(--cut) 0, 100% 0, 100% 100%, 0 100%, 0 var(--cut));
   ```

2. **Hairline.** The clip also removes the border along the cut, so a `::before` pseudo-element
   draws a 1 px `--line` diagonal back in:

   ```css
   .console::before {
     content: "";
     position: absolute;
     left: 0; top: 0;
     width: calc(var(--cut) * 1.42);
     height: 1px;
     background: var(--line);
     transform-origin: 0 0;
     transform: translate(0, var(--cut)) rotate(-45deg);
     opacity: 0.8;
   }
   ```

3. **Glass.** `background: var(--pane)` (or a darker `rgba(14, 25, 34, 0.86)` on panels),
   `border: 1px solid var(--rule)`, `backdrop-filter: blur(12px to 16px) saturate(1.15 to 1.2)`,
   and on the intro and console an inset top highlight
   `box-shadow: inset 0 1px 0 rgba(154, 217, 238, 0.18)`.

Where it is applied:

| Element | Clip | Hairline |
| --- | --- | --- |
| `body:not(.no-world) .intro` | yes, removed under `body.is-exploring` | yes |
| `body:not(.no-world) .panel` | yes | yes |
| `.console` | yes | yes |
| `body:not(.no-world) .rig` | yes | no |
| `body:not(.no-world)[data-place="skills"] .closeup` | yes | no |

Two consequences to respect:

- **A clip-path clips every descendant, including `position: fixed` ones and their clicks.** The
  readout, the rig panel and the place label live inside the intro's markup, so the intro's
  clip-path is removed once the reader is exploring (the comment above
  `body.is-exploring:not(.no-world) .intro { clip-path: none; }` explains this). Do not add a
  clip-path to an element that contains fixed-position HUD children.
- **A focus outline outside the pane is clipped at the corner.** `.rig summary:focus-visible`
  uses `outline-offset: -3px` to draw the ring inside.

## 8. HUD layout reference

All HUD pieces are `position: fixed`. The only width breakpoint for the HUD is
`@media (max-width: 61.99rem)` (992 px at a 16 px root size); `js/world.js` uses the matching test
`window.innerWidth < 992` (`narrow`) for camera framing. Other breakpoints in the file are
`max-width: 44rem` (certificate list to one column) and `max-width: 40rem` (compact viewer).

Distances below are from the viewport edge. "Gutter" is `var(--gutter)`.

| Piece | Markup | Desktop | At `max-width: 61.99rem` | Visible when |
| --- | --- | --- | --- | --- |
| Masthead | `header.masthead` | Top, full width, `z-index: 20` | Nav does not wrap; scrolls sideways with the scrollbar hidden; `0.8rem` | Always in island mode |
| Intro card | `section.hero.intro#bench` | Left gutter, vertically centred, `max-width: 34rem` | Bottom sheet: `left`/`right` `0.75rem`, `bottom: 4.2rem`; `.hero__meta` hidden | Until `is-exploring` |
| Compass | `.hud > .compass` | Top `5.2rem`, centred, `width: min(34rem, 62vw)`, height `1.9rem`, edges faded by `mask-image` | Top `4.9rem`, `width: 86vw` | `.hud.is-on`, not seated |
| Radar | `canvas.radar#radar` | Left gutter, bottom `1.2rem`, `10rem` square | Right `0.9rem`, bottom `1.4rem`, `7rem` square; hidden while `is-focused` | `.hud.is-on`, not seated |
| Objective | `p.objective#objective` | Left gutter + `11rem`, bottom `5.1rem`, `max-width: 18rem` | Centred, top `7.3rem`, `max-width: 80vw` | `.hud.is-on`, hidden while `is-focused` or seated |
| Controls hint | `p.controls` | Left gutter + `11rem`, bottom `2.3rem` | Hidden | `.hud.is-on`, hidden while `is-focused` or seated |
| Place label | `p.place-label#place-label` (inside the intro) | Left gutter + `11rem`, bottom `3.8rem`, `--line`, mono | Centred, top `8.9rem` | Text set by `go()`; hidden while seated |
| Thumb stick | `div.stick#stick` | Left `1.4rem`, bottom `1.6rem`, `7.5rem` circle | Same; hidden while `is-focused` | Coarse pointer and `.is-on`; hidden while seated |
| Readout | `.readout` (inside the intro) | Left gutter, top `6.5rem`, `0.72rem` | Top `10.4rem`, `0.58rem` | `data-place="bench"` or seated (opacity) |
| Rig panel | `details.rig#rig` (inside the intro) | Left gutter, top `15.5rem`, `width: 17rem`; seated: `max-height: calc(100vh - 15.5rem - 19.5rem)` | Top `10.4rem`, right `0.75rem`, `width: min(16rem, calc(100vw - 1.5rem))`, hint hidden. Seated and closed: width of its summary. Seated, open, no panel: bottom sheet at `bottom: 4.8rem`, `max-height: min(19rem, 40vh)`, four stat columns, and the console is hidden (`:has(#rig[open])`) | `data-place="bench"` or seated |
| Close-up bar | `div.closeup#closeup` | Left gutter, bottom `12.2rem` (above the radar) | Centred, top `10.4rem`, `max-width: calc(100vw - 2rem)` | `data-place="skills"` |
| Seat bar and console | `div.seat#seat` containing `.seat__bar` and `.console` | Left gutter, bottom `calc(1.2rem + var(--kb, 0px))`, `width: min(31rem, calc(100vw - 2 * var(--gutter)))`; log `max-height: 8rem` | `left`/`right` `0.6rem`, bottom `calc(0.6rem + var(--kb, 0px))`; `.console__head` hidden; log `4.4rem`, `9.5rem` while the console has focus | `#seat` not `hidden` (seated) |
| Panel | `section.panel.is-open` | Right edge, full height, `width: min(36rem, 100vw)`, slides from the right | Bottom sheet, full width, `height: 58vh`, slides from the bottom | `.is-open` |
| Panel bar | `div.panel-bar#panel-bar` | Right edge, bottom, same width as the panel; Previous, Close (flexes), Next | Full width | Not `hidden` (a panel is open) |
| Viewer | `dialog.viewer#viewer` | Modal (`showModal()`), `width: min(94vw, 72rem)`, `max-height: 96vh`, backdrop `rgba(3, 6, 5, 0.9)` | At `max-width: 40rem`: less padding, arrow buttons `2.3rem` | Opened from `.evidence a` and `.wall a` clicks |

Console rows are coloured by kind, set by the second argument of `print()` in `js/hud.js`
(`"out"`, `"cmd"` or `"err"`, as called from `js/world.js`). Ordinary output takes the base
`.console__row` colour `#b9ccd4`; `.console__row--cmd` is `--line` and `.console__row--err` is
`--phosphor`. While seated, `body.is-seated` hides the compass, radar, objective, controls hint,
place label and stick with `opacity: 0 !important; pointer-events: none !important`.

## 9. Stacking order

There is no single global order. `body > header, body > main, body > footer, .skip` are
`position: relative; z-index: 2` in `css/styles.css`, and no later rule changes `main`, so `<main>`
is a stacking context at level 2 of the root. The intro card, every panel and the panel bar are
inside `<main id="top">` in `index.html`; `#hud`, `#stick`, `#closeup` and `#seat` come before
`<main>` at body level. A `z-index` therefore only compares elements within the same context.

**Root stacking context** (body-level elements):

| `z-index` | Element |
| --- | --- |
| 0 | `#world` canvas |
| 1 | `.scrim` (rule only; no such element in `index.html`) |
| 2 | `main` (and everything inside it, see the next table); `body > header` and `body > footer` in the stacked page; `.noscript` |
| 12 | `.compass`, `.radar`, `.objective`, `.controls` (children of `#hud`) |
| 13 | `.stick` |
| 14 | `.closeup`, `.seat` |
| 20 | `.masthead` in island mode (`position: fixed`) |
| 50 | `.skip` link |
| top layer | `dialog.viewer` (opened with `showModal()`) |

**Inside `main`** (all drawn at level 2 of the root):

| `z-index` | Element |
| --- | --- |
| 10 | `.intro` in island mode |
| 15 | `.panel` |
| 16 | `.panel-bar` |

Inside the intro, which is its own stacking context at 10, sit `.place-label` and `.world-hint`
(11), `.rig` (12) and the readout.

Consequences:

- **Body-level HUD elements draw over open panels and the panel bar, whatever their `z-index`.**
  The CSS works around this by hiding them: the rule
  `body.is-focused .objective, body.is-focused .controls { opacity: 0; }`, and inside
  `@media (max-width: 61.99rem)` the rule
  `body.is-focused .radar, body.is-focused .stick { opacity: 0 !important; pointer-events: none !important; }`.
  The seat bar
  and console (14) are not hidden and stay visible over a panel, so the About button in the seat
  bar remains usable while the About sheet is open (section 12). The phone comment "with the About
  sheet open (58vh from the bottom) an open rig stops above it" describes the same seated,
  panel-open state.
- **Children of the intro cannot rise above the intro.** The readout, rig panel and place label
  are ordered only inside the intro's context, so an open panel (15) covers them. The comment in
  the phone rules for the seated rig records that the rig "cannot be drawn over the console" for
  this reason.
- **The `#hud` wrapper briefly forms its own context.** `body:not(.no-world) .hud` fades with
  `opacity`; while its opacity is below 1 the wrapper is a stacking context painted at level 0, so
  its instruments sit under `main` until `.hud.is-on` reaches opacity 1.

## 10. Phones at 390 px

At 390 px wide every `max-width: 61.99rem` rule applies, plus the `44rem` and `40rem` ones.

- **Intro:** a card along the bottom; the meta paragraph is hidden; heading `1.6rem`.
- **Masthead:** the seven building links sit on one line and scroll sideways.
- **Walking:** compass across the top at `86vw`; objective and place label centred below it;
  radar bottom right at `7rem`; thumb stick bottom left, only on a coarse pointer. The keyboard
  controls hint is hidden.
- **Panels:** bottom sheets of `58vh` with the panel bar below. While one is open the radar and
  stick are hidden.
- **Seated:** seat bar and console span the width with `0.6rem` margins and rise above an
  on-screen keyboard through `--kb`. The console header is hidden, the log is short until the
  input has focus, and the input is `16px`. The rig panel starts at the top right; opened while no
  panel is up it becomes a sheet above Stand up and the console steps aside.
- **Viewer:** less padding, smaller arrow buttons.

Two different tests decide phone behaviour. Layout follows width (`61.99rem` in CSS, `992` px in
`js/world.js`). The thumb stick and the "Tap the desk" hint text follow pointer type
(`matchMedia("(pointer: coarse)")` in `js/world.js`, passed to `createHud` in `js/hud.js` as
`coarse`). A narrow desktop window gets the phone layout without a stick; a wide touch screen gets
the desktop layout with one. `bindRig()` in `js/world.js` combines both tests: the rig panel starts
open only when the pointer is fine and `window.innerWidth >= 992`.

Grids that must fit at 390 px use `minmax(min(Xrem, 100%), 1fr)` (`.inventory`, `.tools`, `.wall`),
so a column floor never exceeds the screen.

## 11. Reduced motion

CSS rules for `prefers-reduced-motion`:

| Rule | Effect |
| --- | --- |
| `@media (prefers-reduced-motion: reduce)` on `html` | `scroll-behavior: auto` instead of `smooth`. |
| `@media (prefers-reduced-motion: no-preference)` around `.hero__text > *` | The staggered `rise` entrance runs only when motion is allowed. |
| `@media (prefers-reduced-motion: reduce)` in the HUD block | No transition on `.hud`, `.stick` and `.panel`: they appear and panels open without sliding. |

JavaScript reads the same preference as `reduceMotion` (`js/world.js`, `js/stations.js`) and
passes it to `createBench` and `buildIsland`. With it set: the intro camera does not orbit, the
walking camera does not swing in behind the hacker, sitting down, standing up, close-ups and
teleports cut instead of gliding (`js/world.js`); the slideshow shows the next photo without
sliding, the idle arm demonstration does not start and the tower fans stop (`js/bench.js`); the
skill ring, circuit traces, rim tiles, mast lights and stage animations hold still
(`js/island.js`, `js/campus.js`, `js/icons.js`).

Motion not covered by a reduced-motion rule is listed under
[Known limitations](#14-known-limitations).

## 12. Focus and hover

- **Global focus ring.** `:focus-visible` is first set to `2px solid var(--phosphor)` with
  `outline-offset: 3px`; a later rule changes `outline-color` to `var(--line)`. The effective ring
  is 2 px cyan, 3 px out.
- **Seat buttons.** `.seat__actions button:focus-visible` is `2px solid var(--line)`, offset `2px`.
- **Rig summary.** Offset `-3px`, inside the cut corner (section 7).
- **Console input.** The input has `outline: none`; instead `.console__line:focus-within` tints the
  whole prompt line (`rgba(154, 217, 238, 0.07)`) and draws an inset 1 px `--line` border.
- **Skip link.** `.skip` sits off screen and moves to `left: 0` on `:focus`.
- **Hover and focus pairs.** Secondary buttons (`.panel-bar button`, `.closeup button`,
  `.viewer__nav`) change border and text to `--line` or `--phosphor` on both `:hover` and
  `:focus-visible`. Primary amber buttons (`.btn--go`, `.seat__stand`) turn cyan on hover. Image
  links in `.evidence` and `.wall` get an amber border and their colour back on both states.
- **Pressed state.** `.seat__actions button[aria-pressed="true"]` (the About button while its panel
  is open) is amber. The current masthead link (`a[aria-current]`) is amber with an amber underline.

## 13. Adding a HUD component

Follow these steps for a new piece of instrument UI that sits over the world.

1. **Markup.** Add the element at body level beside `#hud`, `#stick`, `#closeup` and `#seat` in
   `index.html` (after `</header>`, before `<main>`). Do not put it inside `section.intro`: that
   card has a clip-path and a backdrop filter before the reader starts exploring, and its
   children share its stacking context (sections 7 and 9). Give it a block class and an `id`. Add
   `aria-hidden="true"` if it only repeats information available elsewhere (as `.hud` does), or a
   `role` and `aria-label` if it is interactive (as `.closeup` and `.console` do).
2. **Hidden by default.** Write `.block { display: none; }`, then show it only inside island mode:
   `body:not(.no-world) .block { display: ...; position: fixed; z-index: ...; }`. This keeps it out
   of the no-world page without a separate rule. If JavaScript toggles the `hidden` attribute and
   your display rule is more specific than the browser's, add a guard as `.seat[hidden]` does.
3. **Pick a layer.** A body-level element's `z-index` orders it only among the root-level pieces
   in section 9: 12 for walking instruments, 13 like the stick, 14 for controls the reader
   operates, and below the masthead at 20. Panels live inside `main` (level 2 of the root), so the
   element draws over any open panel whatever value you choose. If it must not cover a panel, hide
   it under `body.is-focused` with `opacity: 0` and `pointer-events: none`. `.objective` and
   `.controls` set only `opacity: 0` there, because they already inherit `pointer-events: none`
   from `body:not(.no-world) .hud`; the phone rule for `.radar` and `.stick` sets both.
4. **Tie visibility to state.** Use the classes in section 5 rather than new global flags. Hide
   with `opacity: 0` plus `pointer-events: none` and a `transition: opacity 300ms ease`, as `.rig`
   does. Decide whether it hides under `body.is-seated` and `body.is-focused`; add it to the
   seated hide list if it would cover the desk.
5. **Build the pane.** Use the tokens: background `var(--pane)`, `border: 1px solid var(--rule)`,
   a backdrop blur, and the cut-corner clip-path with the `::before` hairline (section 7). If a
   focusable element sits in the top-left corner, give its focus ring a negative offset.
6. **Type.** Readings and labels in `var(--mono)` at `0.72rem`; buttons in `var(--sans)`, weight
   600, `letter-spacing: 0.02em`; sentences in `var(--body)`. Amber only for live, current or
   primary content.
7. **Buttons.** Copy the `.closeup button` pattern: transparent background, `1px solid var(--rule)`,
   and one rule covering both `:hover` and `:focus-visible`. Add the selector to the shared
   `font-family` rule `.panel-bar button, .closeup button, ...` in the instrument block.
8. **Desktop position.** Check the table in section 8 for free space. The left column is taken by
   the radar (bottom), the objective, controls hint and place label (gutter + `11rem`), the
   close-up bar (`bottom: 12.2rem`), and the readout and rig panel (top `6.5rem` and `15.5rem`).
9. **Phone position.** Add a rule inside a `@media (max-width: 61.99rem)` block. Occupied slots at
   that width: compass top `4.9rem`, objective top `7.3rem`, place label top `8.9rem`, readout, rig
   and close-up top `10.4rem`, radar bottom right, stick bottom left, seat bar along the bottom,
   panels over the bottom `58vh`. Keep any text input at `16px`.
10. **Reduced motion and print.** `css/styles.css` has two blocks of each kind; edit these ones.
    If the element has a transition or animation, add it to the `@media (prefers-reduced-motion:
    reduce)` block in the HUD section that already lists `body:not(.no-world) .hud`, `.stick` and
    `.panel` (not the one near the top that only sets `html { scroll-behavior: auto; }`). If it
    should not print, add it to the first `@media print` block, whose `display: none` list starts
    `#world, .scrim`. If the element's island-mode display rule is more specific than that
    selector, add `!important`, as the separate `@media print { .seat { display: none !important; } }`
    rule on the last line of the file does.
11. **Drive it from JavaScript.** Follow `createHud` in `js/hud.js`: look the element up by `id`,
    toggle a class (`is-on`) or the `hidden` attribute, and expose a small function for
    `js/world.js` to call.
12. **Canvas text.** If the component draws into a canvas, use the token hex values and font
    stacks (section 4), and scale the backing store by `devicePixelRatio` as `drawRadar` does.
13. **Hand over for testing.** Do not serve or test the site yourself (`AGENTS.md`). Give the owner
    the commands in [Testing and release](testing-and-release.md) and ask them to check the
    screenshots at 1440 by 900 and 390 by 844.

## 14. Known limitations

- **No JavaScript means no content.** `body.no-world` is only added by `fail()` in `js/world.js`.
  With JavaScript disabled, or if the module graph fails to load (for example the three.js import
  from the jsDelivr import map), the class is never set, so island-mode rules apply: `body` has
  `overflow: hidden` and every panel stays `visibility: hidden` off screen. The `<noscript>` text
  ("it reads as a normal page below") does not hold. The `@media print` block does not reset
  these rules either, so a printout made from island mode leaves out the closed panels.
- **HUD pieces cover open panels.** Panels and the panel bar are inside `main`, a stacking context
  at `z-index: 2`, so every body-level HUD element (levels 12 to 14) draws over them regardless of
  the panel's 15 and 16. Each piece has to be hidden under `body.is-focused` individually; the seat
  bar and console are left showing over the panel (section 9).
- **Canvas colours drift from the tokens.** The desk monitors, the Toolchain shed monitor
  (`makeTerminal` in `js/stations.js`, which also uses `#7d9086` and `#d7e2da` text), skill
  nameplates and skill name tags use `#f0a31e` amber, `#7eceec` cyan and green-black grounds (`#0b1412`, `#0d1715`,
  `rgba(7, 13, 12, 0.82)`) from an earlier palette, not `--phosphor` `#ffb43d` and `--line`
  `#9ad9ee`. The favicon in `index.html` (`#0E1917`, `#F0A31E`) is from the same earlier palette.
  So are two CSS literals: `rgba(9, 17, 15, 0.8)` on `.world-grab` and `rgba(15, 26, 23, 0.9)` on
  `.panel-bar button`.
- **Canvas fonts are not awaited.** Textures drawn once can show the fallback face if Titillium Web
  or Share Tech Mono has not loaded yet (section 4). Under `reduceMotion` the Toolchain shed
  terminal is also drawn only once.
- **Overrides are appended, not merged.** Several selectors are redefined further down the file
  rather than edited in place: heading weights, `.btn`, `:focus-visible`, `.panel` background,
  `.masthead` background, `.world-hint` (positioned, then `display: none`), the close-up bar's
  `bottom` (`5.5rem`, then `12.2rem`) and phone `top` (`7.2rem`, then `10.4rem`), and the phone
  `top` of the readout (`7.5rem`, then `10.4rem`). Search the whole file for a selector before
  changing it.
- **Dead rules.** `.scrim` and `.stage-catch` have no matching elements in `index.html`.
  `.world-grab` is `display: none` in both island mode and the no-world page, and its button
  carries `hidden`, so its styles (including `body.is-controlling .world-grab`) never show.
- **Motion outside the reduced-motion rules.** The viewer's `slide-in-right` and `slide-in-left`
  animations run whenever `showSlide()` in `js/world.js` is given a direction, whatever the
  preference. The intro card's opacity and transform transitions, the readout and rig opacity
  transitions, and the image filter transitions in `.evidence` and `.wall` are also not disabled.
- **Unloaded weights.** Weight 500 is requested from Titillium Web and Share Tech Mono in CSS and
  in canvas font strings, but neither is loaded at that weight (section 3).
