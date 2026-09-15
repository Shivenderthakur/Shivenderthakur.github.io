# Content and facts

This document covers the words on the site: which HTML section holds which text, where in the
3D campus each section appears, the markup and writing conventions for entries, the SEO
metadata, and the register of facts with the source behind each one. Read it before you add
or change any sentence, caption, certificate, skill or metadata field, and before you answer
a question about whether a claim on the page is supported. The last part lists claims that
could not be traced to a source, for the owner to resolve.

All checks in this document were made against the working tree on 15 September 2026.

## Contents

1. [The evidence rule and the sources](#1-the-evidence-rule-and-the-sources)
2. [Page sections and where they appear](#2-page-sections-and-where-they-appear)
3. [Markup of an entry](#3-markup-of-an-entry)
4. [Text that lives outside index.html](#4-text-that-lives-outside-indexhtml)
5. [Writing style](#5-writing-style)
6. [SEO and metadata](#6-seo-and-metadata)
7. [Verified facts](#7-verified-facts)
8. [Open questions](#8-open-questions)
9. [Changing content](#9-changing-content)
10. [Known limitations](#10-known-limitations)

Related documents: [Handbook](HANDBOOK.md) (rules and map of the docs),
[Architecture](architecture.md), [World and controls](world-and-controls.md),
[Workbench](workbench.md), [Campus](campus.md), [Assets and pipelines](assets-and-pipelines.md),
[Styling](styling.md), [Testing and release](testing-and-release.md), and the owner's
[asset map](ASSETS.md).

---

## 1. The evidence rule and the sources

[AGENTS.md](../AGENTS.md) rule 3: every claim on the site must trace to `data/` (the LinkedIn
export), `assets/press/`, a certificate in `assets/certs/`, or a public repository. Do not
invent facts. You may write analysis of why a decision was good; you may not add new facts.

Rule 4 also applies to content: never publish private documents or screenshots of LinkedIn
posts. Photographs of schoolchildren from the owner's own classes and demonstrations are
allowed (owner's decision, 15 September 2026).

| Source | What it holds | Notes |
| --- | --- | --- |
| `data/Projects.csv` | Six projects with title, long description and dates: YOLOv3 minor project, attendance system, Robonari software phase, Robonari continued, servo arm, KineLink | The main source for the Work panel |
| `data/Education.csv` | MBM University (Sep 2023 to Jun 2026, B.E., notes on EPIC, PROMETEO and a faculty workshop); Government Polytechnic College Jodhpur (Sep 2021 to Aug 2023, Diploma) | No grades |
| `data/Certifications.csv` | 24 rows: LinkedIn Learning, Google Cloud Skills Boost badges, Cisco, StraightArc | See the count question in [section 8](#8-open-questions) |
| `data/Skills.csv` | The LinkedIn skills list, one per line | Contains duplicates and stray spaces |
| `data/Rich_Media.csv`, `data/Rich_Media.html` | Dates and text of uploaded posts and photos | Cite post text by date; never publish the post images |
| `assets/press/` | Five clippings: four on the Robonari launch (Marudhar Aaina, Dainik Nirala, Sach Media, Jagruk Times) and one Navjyoti clipping on the Mount Abu camp | All in Hindi |
| `assets/certs/` | 18 certificate documents, each as `name.webp` and `name-full.webp` | Listed in [section 7.8](#78-certificates-on-the-credentials-wall) |
| Public repositories under `github.com/Shivenderthakur` | Four are linked from the page | Status in [section 7.10](#710-public-repositories) |

`assets/events/`, `assets/bench/` and `assets/video/` hold photographs and videos shown as
evidence. They illustrate facts; under rule 3 they are not themselves a source of facts.

`data/` is ignored by git (`.gitignore` line `data/`), so a fresh clone does not contain the
LinkedIn export. The owner holds it. `robots.txt` also disallows `/data/`. The export in the
working tree has no `Positions.csv` or `Profile.csv`, so job titles, employers and dates of
roles cannot be checked against LinkedIn data.

---

## 2. Page sections and where they appear

`index.html` is one page. Each part of the portfolio is a `<section class="panel" data-panel>`
inside `<main id="top">`. In the 3D campus, a panel opens when the hacker walks into the entry
zone of its building. The mapping lives in the `places` array in `js/island.js`: each place has
a `key`, a `panel` selector, an optional `anchor` and a `label`.

| Section id | Heading | Header link text | Place key | Place `label` (shown by the HUD objective line) | Building sign (`sign()` in `js/island.js`) | Ground label (`LABELS` in `js/layout.js`) |
| --- | --- | --- | --- | --- | --- | --- |
| `bench` | `h1` "Seven days from a field I have not worked in to hardware that runs." | none (the wordmark links to `#top`) | none | none | none | none |
| `about` | The short version | Workbench | `bench` | The workbench | none | none |
| `research` | Research practice | Research | `research` | Research tower | RESEARCH | RESEARCH |
| `work` | Work | Work | `stage` (anchor `#work-robonari`) and `lab` (anchor `#work-attendance`) | Bheenmal stage; Robotics lab | BHEENMAL 2024; ROBOTICS LAB | WORK |
| `experience` | Experience | Credentials | `hall` | Credentials hall | HALL OF FAME | CREDENTIALS |
| `stack` | Skills | Skills | `skills` | Skills lab | SKILLS | SKILLS |
| `toolchain` | Where I work | Toolchain | `shed` | Toolchain | TOOLCHAIN | TOOLCHAIN |
| `contact` | Say hello | Contact | `mast` | Say hello | SAY HELLO | CONTACT |

Entries with their own ids inside `#work`: `work-robonari`, `work-attendance`, `work-kinelink`,
`work-servo`, `work-camp`.

How a panel opens (all in `js/world.js`):

- Walking: `checkZones()` opens the panel of the building whose zone the hacker stands in, and
  closes it when the hacker walks out. The workbench is the exception. Walking into its zone
  sits the hacker down at the desk and opens no panel. The About panel opens from the
  `#seat-about` button in the seat bar.
- Header links carry `data-place` with the place key. `go()` teleports the hacker to the
  building's door, or into the chair for the workbench, and opens the panel.
- The panel bar arrows (`#panel-prev`, `#panel-next`) call `step()`, which walks the `places`
  array in order: bench, research, stage, lab, hall, skills, shed, mast.
- Deep links go through `fromHash()`. `#top` and `#bench` close any open panel. A hash that
  equals a place's `anchor` or `panel` opens that place; `#work` matches the stage first. Any
  other id inside a panel (for example `#work-kinelink`) opens the panel that contains it and
  scrolls to the entry with `anchorTop()`.
- When the 3D world fails to start, `fail()` adds `body.no-world` and the sections read as an
  ordinary page. See [Styling](styling.md) and [Architecture](architecture.md).

The HUD objective line reads "Walk into a building to open it" when no place is shown
(`js/hud.js`).

---

## 3. Markup of an entry

The page follows these patterns. New content should use them as well, because the CSS and
`js/world.js` depend on the class names.

| Pattern | Markup | Used in |
| --- | --- | --- |
| Section head | `div.section-head` with `h2` and `p.section-note` | All panels except `about`; `#contact` has the `h2` only, with no `p.section-note` |
| Entry | `article.entry` (lead entry adds `entry--lead`) with `div.rail` (`span.rail__when`, `span.rail__where`) and `div.body` holding an `h3` | Research, Work |
| Method block | `div.how` with `h4` headings, paragraphs, and `ol.steps` whose `li` items start with a bold short title: `<li><b>Title.</b> text</li>` | Research, Work |
| Key figures | `ul.facts`, each `li` as `<span>Label</span> value` | Robonari, attendance |
| Repository link | `p.repo` with one link | KineLink, servo arm |
| Evidence strip | `figure.evidence` with `figcaption`, then `ul > li > a > img` plus a caption `span`; optional `p.evidence__note` | Research, Work, Toolchain |
| Certificate wall | `div.wall` of `figure > a > img` plus `figcaption` with a `b` title | Experience |
| Timeline | `ol.timeline` of `li` with `span.tl__when` and `span.tl__what` | Experience, Education |
| Inventory | `div.inventory > div.inv` with `h3` and `ul.parts` | Skills |
| Instrument caption | `figure.station` (`aria-hidden="true"`) with a `figcaption` | Research, Work, About, Skills; not visible, see [section 10](#10-known-limitations) |

Rules for evidence links, as the page applies them:

- The link `href` points at the large file (`name-full.webp`, or the `.mp4` for a video). The
  `img` shows the small file (`name.webp`) and has `width`, `height`, `loading="lazy"` and a
  descriptive `alt`.
- A video link has the `data-video` attribute, and its `img` is the poster (`.webp` with the same
  base name as the video). The caption gives the length in whole seconds, for example
  "Demo, 26 s".
- `js/world.js` binds every `.evidence a` and `.wall a` to the `#viewer` dialog, and shows the
  other links in the same group as a gallery.
- `projectSlides()` in `js/world.js` feeds the left desk monitor with the still images from
  `#work .evidence a` and `#research .evidence a`. Links with `data-video` are skipped. Adding a
  photograph to either section also adds it to the slideshow. See [Workbench](workbench.md).

---

## 4. Text that lives outside index.html

Some words appear only in the 3D scene and are written in JavaScript. Changing the page does not
change them.

| Text | Location | Duplicates |
| --- | --- | --- |
| Place labels ("The workbench", "Research tower", and so on) | `places` in `js/island.js` | Header link text in `index.html` differs (for example "Credentials" against "Credentials hall") |
| Short place names | `SHORT` in `js/layout.js` | |
| Building signs | `sign("...")` calls in `js/island.js` | |
| Ground labels | `LABELS` in `js/layout.js` | |
| Certificate frames: image, `alt`, engraved title and subtitle | `certs` array in `js/island.js` | The `.wall` in `#experience`; the two lists must be kept in step by hand |
| Bheenmal stage frames: photograph and four clippings | `items` array in `js/island.js` | The first `figure.evidence` in `#work-robonari` |
| Hardware cabinet name plates | `HARDWARE` in `js/island.js` | The Hardware inventory in `#stack` |
| Terminal prompt `[shivender@archbox ~]$` and armctl console lines | `js/bench.js` | See [Workbench](workbench.md) |
| Seat hint on touch screens | `js/hud.js` | `#seat-hint` in `index.html` holds the pointer version |

The two arrays in `js/island.js` that repeat page evidence have these entry shapes:

| Array | Entry shape | Fields |
| --- | --- | --- |
| `certs` (Credentials hall) | Positional array `[base name, width, height, alt, title, subtitle]`, read by `certs.forEach(([n, w, h, alt, title, sub], i) => ...)` | Base name: the file in `assets/certs/` without `.webp`; the code adds `.webp` for the frame and `-full.webp` for the viewer. Width and height: the pixel size of the thumbnail, the same numbers as the `img` `width` and `height` on the `.wall`. `honour()` fits the frame inside `HONOUR.wide` by `HONOUR.tall` (0.3 m by 0.3 m), so the two numbers only set the aspect ratio. Title: drawn on the brass plate by `plateTexture()` exactly as written; every entry uses upper case. Subtitle: short, parts joined with " · ", for example `"NPTEL Elite · IIT Ropar"` |
| `items` (Bheenmal stage) | Object `{ src, full, w, h, alt, long }` | `src` and `full`: full paths built from `P` (`assets/press/`) or `E` (`assets/events/`). `w`, `h`: thumbnail pixel size, the same as the `img` in the `#work-robonari` evidence strip. `long`: the frame's longer side in metres, turned into a width by `widthForLongSide()`. `frame()` places entry `i` with its centre at x = -2.6 + i × 1.3 m in the stage group, 1.8 m above the deck (`DH + 1.8`) |

Entries in the scene and on the page must agree in file, dates and meaning, not word for word.
The `alt` strings already differ: the wall says "NPTEL Elite certificate in Deep Learning from IIT
Ropar." where `certs` says "NPTEL Elite certificate in Deep Learning, IIT Ropar, 2025", and the
stage `items` use short names such as "Marudhar Aaina". On 15 September 2026 all 18 `certs` entries
and all 5 `items` entries matched their thumbnail sizes in `index.html`.

---

## 5. Writing style

These rules were set with the owner and are what the current text follows.

- Plain and specific, first person, British spelling ("labour", "modernise", "programme",
  "seventy per cent"). No hype words.
- Present the work as a problem that was solved: the constraint that bound, how it was
  removed, and why that worked. Work entries put this inside `div.how` with `h4` headings and
  numbered `ol.steps`.
- Analysis of why a decision was good is allowed. New facts are not.
- Name clients by field rather than by name where agreements do not allow names (Research panel,
  "The fields").
- Credit other people exactly as the source does. The Robonari entry says the robot was built
  by a team led by Narayan Jangid, and the evidence note says the owner's part was the software
  layer.

How each entry applies the pattern, taken from the current `h4` headings:

| Entry | `h4` headings | Steps |
| --- | --- | --- |
| Research, "The sprint" | How the week is spent; Why it holds up | `ol.steps`, three |
| `work-robonari` | The constraint that bound; How I did it; Why it worked | `ol.steps`, six |
| `work-attendance` | The problem; How we did it; What it shows | `ol.steps`, four |
| `work-kinelink` | The research step; How I did it | `ol.steps`, five; no closing heading |
| `work-servo` | The platform decision; How I did it; Where it ran | `ol.steps`, four |
| `work-camp` | What made it hard; How it was built | Paragraphs, no `ol.steps` |

---

## 6. SEO and metadata

All of it is in the `<head>` of `index.html`, plus two files in the site root.

### 6.1 Head tags

| Tag | Value |
| --- | --- |
| `html lang` | `en-IN` |
| `<title>` | Shivender Singh Thakur — CTO, applied AI research sprints |
| `meta description` | CTO at CoShot. I run seven-day research sprints that carry an unfamiliar domain from first reading to working hardware. Industrial, manufacturing, IoT and AI. |
| `meta author` | Shivender Singh Thakur |
| `meta robots` | `index, follow, max-image-preview:large` |
| `meta theme-color` | `#101c26` |
| `link rel="canonical"` | `https://shivenderthakur.github.io/` |
| `og:type` | `profile`, with `profile:first_name` Shivender, `profile:last_name` Singh Thakur, `profile:username` Shivenderthakur |
| `og:site_name`, `og:locale`, `og:url` | Shivender Singh Thakur; `en_IN`; the canonical URL |
| `og:title`, `twitter:title` | Same as `<title>` |
| `og:description`, `twitter:description` | Seven days from a field I have not worked in to hardware that runs. Industrial and manufacturing, IoT and AI. |
| `og:image`, `twitter:image` | `https://shivenderthakur.github.io/assets/og-card.jpg`, JPEG, 1200 by 630 pixels (confirmed with `file`) |
| `og:image:alt`, `twitter:image:alt` | A robotic arm on a workbench beside a monitor running its live telemetry. |
| `twitter:card` | `summary_large_image` |
| Favicon | Inline SVG data URI |

The meta description and the Open Graph description are different sentences. The four title
strings (`<title>`, `og:title`, `twitter:title`, and the JSON-LD `ProfilePage` name) are
identical and must stay identical.

### 6.2 JSON-LD graph

One `<script type="application/ld+json">` with `@context` `https://schema.org` and an `@graph`
of three nodes:

| Node | `@id` | Fields |
| --- | --- | --- |
| `Person` | `https://shivenderthakur.github.io/#person` | `name`; `url`; `image` (`assets/shivender.jpg`, 720 by 720 pixels); `jobTitle` Chief Technology Officer; `description`; `worksFor` CoShot and Basttl Media; `hasOccupation` with `occupationLocation` Jodhpur, Rajasthan, India; `alumniOf` Mugneeram Bangur Memorial University, Jodhpur and Government Polytechnic College, Jodhpur; `address` Jodhpur, Rajasthan, IN; `award` (first prize, best final-year computer science project, 2023); `knowsAbout` (19 topics); `sameAs` the LinkedIn and GitHub profile URLs |
| `WebSite` | `https://shivenderthakur.github.io/#website` | `url`, `name`, `inLanguage` `en-IN`, `publisher` pointing to the Person |
| `ProfilePage` | `https://shivenderthakur.github.io/#webpage` | `url`, `name`, `isPartOf` the WebSite, `about` the Person |

The `sameAs` URLs match the LinkedIn and GitHub links in the hero and in `#contact`, which carry
`rel="me noopener"`.

### 6.3 robots.txt and sitemap.xml

`robots.txt` allows everything except `/data/` and names the sitemap at
`https://shivenderthakur.github.io/sitemap.xml`.

`sitemap.xml` has one `url`: `loc` is the canonical URL, `lastmod` is `2026-09-15`, `changefreq`
is `monthly` and `priority` is `1.0`. Set `lastmod` to the date of any content change.

---

## 7. Verified facts

Each fact below was checked on 15 September 2026 against the source named. "Page" names the
section where the fact appears. Clippings were read in the `-full.webp` files.

The fact list in [Handbook](HANDBOOK.md) section 8, "Content (`index.html`)", still stands in
the working tree on 15 September 2026 and disagrees with the sources in three places:

- It names `StudyPods-v4.0` among the public repositories cited. `index.html` links no StudyPods
  repository.
- It cites the Navjyoti clipping for "computer vision, maths" at the Mount Abu camp. The
  clipping mentions Python and basic AI and machine learning only.
- It gives the degree as "B.E. CSE". `Education.csv` gives no subject.

Where the Handbook and this document disagree, this document is current.

### 7.1 Robonari humanoid (`#work-robonari`)

| Fact | Source |
| --- | --- |
| The robot was built by a team led by the scientist Narayan Jangid after three years of research | All four clippings in `assets/press/robonari-*` say this |
| Launched at Bheenmal (at an event marking the first anniversary of a temple consecration) | All four clippings |
| Shown in March 2024 | `Projects.csv` ("Bheenmal, Rajasthan (March 2024)"); the clippings carry no visible date |
| Software layer built in three months, as a diploma student, with no documentation | `Projects.csv`, Robonari software phase |
| Raspberry Pi 3B+ with 1 GB, headless: SSH through PuTTY, VNC, `wpa_supplicant.conf` edited by hand | `Projects.csv` |
| DLIB compiled from source with CMake on the Pi, a four-hour build | `Projects.csv` |
| Recognition remembers who was greeted and answers team members differently from strangers | `Projects.csv` |
| GPT-3.5-turbo streaming conversation engine with a persona by speaker; gTTS and ffmpeg voice | `Projects.csv` |
| UART protocol between Arduino Nano and Pi with potentiometer joint feedback; 25 kg·cm metal-geared servos; PWM tuning, duty-cycle mapping, movement sequencing | `Projects.csv`, Robonari continued |
| Raspbian Lite with a hand-installed lightweight desktop kept about 70% of RAM free | `Projects.csv` |
| On stage eight months later | `Projects.csv` |
| Dates Jun 2023 to Apr 2024 | `Projects.csv` (Jun to Aug 2023, then Sep 2023 to Apr 2024) |
| Four regional papers: Marudhar Aaina, Dainik Nirala, Sach Media, Jagruk Times | The four clippings (`Projects.csv` says three, see [section 10](#10-known-limitations)) |

### 7.2 Attendance system (`#work-attendance`)

| Fact | Source |
| --- | --- |
| Led a four-person team; fully local, real time, no AI APIs | `Projects.csv` |
| First prize at the college's annual project competition; best project across all CSE final-year teams; Government Polytechnic College Jodhpur | `Projects.csv` |
| DLIB wheels failed on the lab machines, so DLIB was compiled from source | `Projects.csv` |
| DLIB and OpenCV; Iriun Webcam over Wi-Fi; Tkinter offline interface; Excel reports with name, timestamp and date; facial-encoding database | `Projects.csv` |
| Sep 2022 to May 2023 | `Projects.csv` |

### 7.3 KineLink (`#work-kinelink`)

| Fact | Source |
| --- | --- |
| Studied the DAWN remote-pilot system of Japan's Avatar Robot Café and built a version in seven days | `Projects.csv` |
| Zero-PCB connections, a base made from an empty tape roller, no lab, no equipment budget | `Projects.csv` |
| MediaPipe Pose (shoulder, elbow, wrist); angles with arctan2; MediaPipe Hands fist closure drives the gripper | `Projects.csv` |
| Serial protocol of index, angle, terminator, parsed by Arduino or ESP32 | `Projects.csv` |
| Tkinter per-joint sliders and an AI mode | `Projects.csv` |
| June 2025 | `Projects.csv` |

### 7.4 Servo arm (`#work-servo`)

| Fact | Source |
| --- | --- |
| XY and XZ motion with self-written step interpolation; Bluetooth from a laptop | `Projects.csv` |
| Arduino Mega reached its wireless ceiling; codebase migrated to ESP32 | `Projects.csv` |
| Angle-to-duty-cycle conversion calculated by hand; PWM at 50 Hz; several joints coordinated | `Projects.csv` |
| Shown at PROMETEO 2025, IIT Jodhpur (a professor recommended advancing the system), Taabar Mela in Jodhpur, and an MBM University faculty workshop on intelligent embedded systems | `Projects.csv`; `Education.csv` notes also name PROMETEO 2025 and a CSE faculty workshop |
| November 2024 | `Projects.csv` |

### 7.5 Mount Abu camp (`#work-camp`)

| Fact | Source |
| --- | --- |
| Five-day AI and machine learning training camp at PM SHRI Kendriya Vidyalaya, 13 to 18 January, under the RoboAI Hub initiative, using Python | Navjyoti clipping (`assets/press/mount-abu-navjyoti-2025-full.webp`) |
| 68 students took part | Navjyoti clipping |
| The trainers were Neha and the owner (the clipping spells the name Shivendra) | Navjyoti clipping |
| Training from 13 Jan 2025 to 18 Jan 2025, for class 8 students, at PM SHRI KV ISA, Mount Abu | Certificate `pm-shri-kv-mount-abu-2025` |

### 7.6 Roles (`#experience`)

| Fact | Source |
| --- | --- |
| DevOps Tech Lead, EPIC (student developer community, GDSC), at MBM University | `Education.csv` notes (no dates) |
| Internship in robotics at RoboAI Hub, 20 November 2023 to 30 August 2025 | Certificate `roboai-hub-robotics-internship-2025` |
| 180-day AI Internship Program at RoboAI Hub, 1 April to 30 September 2024, project "Robot Interaction system - Voice and Image processing based" | Certificate `roboai-hub-180-day-internship-2024` |
| Trainer at PM SHRI KV Mount Abu, January 2025 | Navjyoti clipping; certificate `pm-shri-kv-mount-abu-2025` |
| Machine learning internship with Academor, 1 November to 31 December 2023 | Certificate `academor-flutura-ml-internship-2023` |
| Internship in artificial intelligence at ITK (Ingenious Tech Key), June to August 2023, signed by Narayan Jangid, Founder | Certificate `itk-ai-internship-2023` |

### 7.7 Education (`#experience`)

| Fact | Source |
| --- | --- |
| Bachelor of Engineering, Mugneeram Bangur Memorial University (MBM University), Sep 2023 to Jun 2026 | `Education.csv` (Degree Name "Bachelor of Engineering - BE"; no subject given). The page's "Computer Science and Engineering" is not sourced, see [section 8.2](#82-roles-and-education) |
| Diploma, Government Polytechnic College Jodhpur, Sep 2021 to Aug 2023 | `Education.csv` |

### 7.8 Certificates on the Credentials wall

The wall in `#experience` and the `certs` array in `js/island.js` show the same 18 documents.

| File base name in `assets/certs/` | Wall caption | Document says |
| --- | --- | --- |
| `nptel-deep-learning-iit-ropar-2025` | Deep Learning, NPTEL Elite, IIT Ropar, 2025 | NPTEL Online Certification, Elite, Deep Learning - IIT Ropar, Jul to Oct 2025, 12-week course, score 77% |
| `cadd-autofina-robotics-360h-2023` | Robotics & Automation, CADD Centre, 360 hours, 2023 | Advanced Certificate in course on Robotics & Automation, 10 Jul 2023 to 5 Oct 2023, 360 hours, CADD Centre Training Services, Jaipur, with Autofina Robotics; issued 22 Dec 2023 |
| `roboai-hub-180-day-internship-2024` | AI Internship, RoboAI Hub, 180 days, 2024 | See [7.6](#76-roles-experience) |
| `roboai-hub-robotics-internship-2025` | Robotics Internship, RoboAI Hub, 2023 to 2025 | See [7.6](#76-roles-experience) |
| `itk-ai-internship-2023` | AI Internship, ITK, 2023 | See [7.6](#76-roles-experience) |
| `ccna-enterprise-networking-2023` | CCNAv7 Enterprise, Cisco, 2023 | `Certifications.csv`: CCNA Enterprise Networking, Security, and Automation, Cisco, May 2023 |
| `ccna-switching-routing-2023` | CCNAv7 Switching, Cisco, 2023 | `Certifications.csv`: CCNA Switching, Routing, and Wireless Essentials, Cisco, May 2023 |
| `cisco-intro-to-networks-2023` | CCNAv7 Introduction, Cisco, 2023 | CCNAv7: Introduction to Networks, completed 15 May 2023 |
| `cisco-networking-essentials-2022` | Networking Essentials, Cisco, 2022 | Networking Essentials, completed 12 Dec 2022 |
| `straightarc-cyber-security-2024` | Cyber Security, StraightArc, 12 hours, 2024 | `Certifications.csv`: Cyber Security Fundamentals, 2-day workshop (12 hours), StraightArc Technologies, Mar 2024 |
| `pm-shri-kv-mount-abu-2025` | Training delivered, PM SHRI KV, Mount Abu, 2025 | See [7.5](#75-mount-abu-camp-work-camp) |
| `academor-2023` | Outstanding performance, Academor, 2023 | Certificate of outstanding performance during an internship with Academor; no date on the document |
| `academor-flutura-ml-internship-2023` | ML Internship, Academor, 2023 | Internship completion, Machine Learning, 2 months, 1 Nov 2023 to 31 Dec 2023, with Flutura; issued 13 Jan 2024 |
| `academor-kshitij-ml-course-2023` | Machine Learning course, Academor, 2023 | Course completion, Machine Learning, 1 Nov 2023 to 31 Dec 2023, with Kshitij; issued 13 Jan 2024 |
| `linkedin-linux-cli-2025` | Linux command line, LinkedIn Learning, 2025 | `Certifications.csv`: Learning Linux Command Line, May 2025 |
| `linkedin-ecmascript-2025` | ECMAScript 6+, LinkedIn Learning, 2025 | `Certifications.csv`: Learning ECMAScript 6+ (ES6+), Apr 2025 |
| `devtown-python-ai-2023` | Python and AI, devTown, 2023 | Certificate of participation, 7-day free bootcamp on Python and Artificial Intelligence, October 2023, issued 15 Oct 2023 |
| `aws-community-builders-devtown-python-ai` | Python and AI bootcamp, AWS Community Builders, devTown | Certificate of completion, 7-day bootcamp on Python and Artificial Intelligence; no date on the document |

### 7.9 Events and other panels

| Fact | Page | Source |
| --- | --- | --- |
| Tequity Hackathon 2025, "Build with AI", in Jodhpur | `#experience`, Out in the field | `Rich_Media.csv`, post of 14 September 2025 |
| INDIASOFT 2026 and the India Electronics Expo, New Delhi | `#experience`, Out in the field (caption and image `alt`) | `Rich_Media.csv`, post of 24 March 2026: hashtags `#IndiaSOFT2026`, `#IndiaElectronicsExpo` and `#NewDelhi`. The same post also carries `#BharatMandapam`, which the page does not mention |
| Enterprise-LLM-Chatbot-Admin is an LLM chatbot platform for corporate use that runs offline or over a network | `#research` | The repository README |
| Skills: Python, C++, Embedded C, JavaScript, ECMAScript, Machine Learning, Deep Learning, Artificial Intelligence, Computer Vision, MediaPipe, OpenCV, Dlib, YOLOv3, Ollama, RAG, UART, ESP32, Arduino, Raspberry Pi, Headless Linux, CMake, Google Cloud Platform, Internet of Things | `#stack`, `#toolchain`, JSON-LD | `Skills.csv` |
| GPT-3.5, gTTS (text to speech), PWM, Bluetooth, Raspberry Pi 3B+, Arduino Mega, Arduino Nano, Raspbian Lite, SSH, VNC | `#stack`, `#toolchain` | `Projects.csv` |
| Atom was discontinued by GitHub in 2022 | `#toolchain` | GitHub's announcement, linked on the page |

### 7.10 Public repositories

Checked with `git ls-remote` and a shallow clone on 15 September 2026.

| Repository | Linked from | Status |
| --- | --- | --- |
| `Enterprise-LLM-Chatbot-Admin` | `#research` | Public; README matches the page's description |
| `INDIAN_LABOR_LAW_ADVISOR` | `#research` | Public; README says it was developed for National Law University (NLU) Jodhpur, which the page does not mention |
| `KINEMLINK_RELEASE` | `#work-kinelink` | Public but empty: no branches, and a clone reports "You appear to have cloned an empty repository" |
| `SAC-SmartArmController` | `#work-servo` | Public; README describes an Android (Flutter and Kotlin) port that tracks a hand with the phone camera and sends angles to an ESP32 over WiFi. `esp32/README.md` refers to an earlier Bluetooth build |
| `StudyPods-v4.0` | Not linked from the page | Public. `index.html` does not link it. The fact list in `docs/HANDBOOK.md` still names it as cited, which is wrong (see [section 7](#7-verified-facts)) |

---

## 8. Open questions

These claims are on the page, in the JSON-LD, or in the page head, and could not be traced to
`data/`, a clipping, a certificate or a public repository. Some may be true and simply missing
from the export. Each needs a source added or the claim changed. The owner decides which.

### 8.1 Positioning and practice

| Claim | Where | What was found |
| --- | --- | --- |
| Runs seven-day research sprints as a practice for clients | `h1`, hero lede, `#about` ("Now I run that habit as a practice"), `#research`, `#work-camp` (closing paragraph), `#stack` (Research and development inventory), `#contact`, meta description, JSON-LD `Person` `description`, and the four title strings (`<title>`, `og:title`, `twitter:title`, JSON-LD `ProfilePage` `name`) | Only KineLink's "7 days" in `Projects.csv`; nothing on a sprint practice |
| Fields are industrial and manufacturing, IoT and AI | Hero, `#research`, meta and Open Graph descriptions | `Rich_Media.csv` post of 24 March 2026 lists "IoT" and "Industry 4.0" at an expo and uses `#SmartManufacturing`; no client work is recorded |
| Most of the work sits under NDA | Hero, `#research` | Not found |
| "The reading took longer than the code" for the labour law advisor | `#research` | Not found |
| "Industrial automation" in `knowsAbout` | JSON-LD | Not found |

### 8.2 Roles and education

| Claim | Where | What was found |
| --- | --- | --- |
| Chief Technology Officer, CoShot, Aug 2026 to present, and its description | Masthead, hero, `#experience`, meta description, JSON-LD `jobTitle` and `worksFor` | No `Positions.csv`; "CoShot" does not occur in `data/`; `Rich_Media.csv` has `#CTO` and `#CTOLife` hashtags only |
| Chief Technology Officer, Basttl Media, Jun 2026 to present, and its description | `#experience`, JSON-LD `worksFor` | "Basttl" does not occur in `data/` |
| EPIC term Oct 2024 to Oct 2025, "a full one-year term", workshops and member projects | `#experience` | `Education.csv` gives the role without dates or detail |
| The title "AI Systems and Robotics Intern" | `#experience` | The certificate says "Internship in Robotics" |
| Daily public demonstrations at Umaid Club and Nehru Park, Jodhpur | `#experience` | Not found |
| The title "AI and Machine Learning Workshop Trainer" and "Designed" the camp | `#experience` | The clipping names the two trainers; design of the camp is not stated |
| Built a loan-prediction system end to end at Academor | `#experience` | The two Academor certificates give domain and dates only |
| B.E. Computer Science and Engineering | `#experience`, Education timeline | `Education.csv` gives "Bachelor of Engineering - BE" with no subject. Its notes mention a "CSE faculty workshop", which does not name the degree's subject |
| Diploma grade 9.97 | `#experience` | Not in `Education.csv`; no diploma document in `assets/certs/` |
| Lives in Jodhpur | Portrait caption, footer, JSON-LD `address` and `occupationLocation` | No profile file; both institutions and RoboAI Hub are in Jodhpur |

### 8.3 Work entries

| Claim | Where | What was found |
| --- | --- | --- |
| Robonari work took place at RoboAI Hub from Jun 2023 | `#work-robonari` rail | `Projects.csv` gives no organisation. The ITK certificate (June to August 2023, signed by Narayan Jangid) covers the first phase; the RoboAI Hub certificate starts 20 November 2023 |
| KineLink at MBM University | `#work-kinelink` rail | `Projects.csv` gives no place |
| Servo arm at RoboAI Hub | `#work-servo` rail | `Projects.csv` gives no organisation; the date falls inside the RoboAI Hub internship |
| Workshop name "AI on Edge" | `#work-servo` evidence caption | Sources name "a faculty workshop on intelligent embedded systems" and "CSE faculty workshop on embedded systems & real-time robotics"; the photograph itself was not checked |
| Camp subjects include computer vision and mathematics; curriculum written from nothing | `#work-camp` | The Navjyoti clipping mentions AI and machine learning with Python and basic knowledge only. `docs/HANDBOOK.md` still cites this clipping for computer vision and maths, which is wrong (see [section 7](#7-verified-facts)) |

### 8.4 Skills and toolchain

| Claim | Where | What was found |
| --- | --- | --- |
| Agentic AI | `#stack`, `#contact`, JSON-LD `knowsAbout` | Not in `Skills.csv`. `Rich_Media.csv` has a misspelt `#AgenitAI` hashtag and a line to people who "build agents or flows" (1 July 2026), and `#AIAgents` (10 June 2026); no project |
| SLMs | `#stack` | Not found |
| VLMs, "Vision language models" | `#stack`, JSON-LD `knowsAbout` | One mention of "Vision Language Models" in general commentary, `Rich_Media.csv` post of 3 March 2026; no project |
| LLaVA | `#stack` | Not found |
| TinyML | `#stack` | Hashtags only (posts of 3 and 24 March 2026) |
| YOLO "v3 to v11" | `#stack` | Only YOLOv3 (`Skills.csv`, `Projects.csv`) and a `#YOLO` hashtag |
| Speech to text | `#stack` | `Certifications.csv` badge "Cloud Speech API: 3 Ways"; no project |
| C, as distinct from C++ and Embedded C | `#stack`, JSON-LD | `Skills.csv` lists CPP, C++ and Embedded C |
| Gentoo, Arch Linux, Debian | `#stack`, `#toolchain` | None occur in `data/`. The site's own terminal prompt says `archbox`, which is site code, not a source |
| Boards: ESP32-CAM, ESP8266, ESP-01, Arduino Uno, Arduino Pro Mini, Raspberry Pi 4, Raspberry Pi 5, Pi Zero, Pi Pico, Pi Pico W | `#stack` | Not named in `data/`; `Skills.csv` has "Arduino" and "Raspberry Pi" without models |
| Sensors: HC-SR04, PIR, IR obstacle, DHT11, IMU, MQ-135, MQ-2, LDR, rain, capacitive touch | `#stack` | None named in `data/`; the RoboAI Hub robotics certificate mentions sensors in general |
| Editors: VS Code, PyCharm, Sublime Text, Atom, GNU nano, Vim; and bash | `#toolchain` | None occur in `data/` |

### 8.5 Credentials and events

| Claim | Where | What was found |
| --- | --- | --- |
| "Twenty-four in total. The ones with a document behind them:" | `#experience` | `Certifications.csv` has 24 rows, but one title appears twice with the same badge id (12898262), and one row shares badge id 12867403 and URL with another. Of the 18 documents on the wall, only 7 match rows in the CSV (three CCNA, Networking Essentials, StraightArc, two LinkedIn Learning); the other 11 are not among the 24 |
| Academor outstanding performance certificate dated 2023 | `#experience` wall, `certs` in `js/island.js` | The document has no date |
| Swavalamban Kaushal Mela 1.0, World Youth Skills Day 2025, RoboAI Hub as AI partner | `#experience`, Out in the field | Not in `data/` text; the photograph itself was not checked |

---

## 9. Changing content

Follow these steps for any change to words on the site.

1. Find the source first. If the fact is not in `data/`, `assets/press/`, `assets/certs/` or a
   public repository, do not add it. Ask the owner for a source.
2. Edit `index.html` using the patterns in [section 3](#3-markup-of-an-entry) and the style in
   [section 5](#5-writing-style).
3. If the change touches text that the 3D scene repeats, edit the matching array as well (see
   [section 4](#4-text-that-lives-outside-indexhtml)). For a certificate, that means both the
   `.wall` figure in `#experience` and the `certs` array in `js/island.js`. For a Robonari press
   image, it means both the evidence strip in `#work-robonari` and the `items` array in
   `js/island.js`. Use the entry shapes in section 4. Copy the thumbnail `width` and `height`
   exactly. The `alt`, title and subtitle must match the page in file, dates and meaning, but
   need not use the same words.
4. For a new image or video, follow [Assets and pipelines](assets-and-pipelines.md) for file
   names and formats. The page expects `name.webp` for the thumbnail and `name-full.webp` for
   the viewer.
5. If the change alters the title, employer, a headline claim or a skill, update the matching
   head tags and the JSON-LD `Person` node ([section 6](#6-seo-and-metadata)). Keep the four
   title strings identical.
6. Set `lastmod` in `sitemap.xml` to the date of the change, in `YYYY-MM-DD` form.
7. Add the fact and its source to [section 7](#7-verified-facts) of this document, or remove the
   matching row from [section 8](#8-open-questions) once a source exists.
8. Do not serve or test the site yourself. Hand the owner the test procedure in
   [Testing and release](testing-and-release.md).

---

## 10. Known limitations

- `KINEMLINK_RELEASE`, linked from `#work-kinelink`, is an empty repository.
- `SAC-SmartArmController`, linked from `#work-servo`, now documents an Android and WiFi
  controller. The entry describes the November 2024 laptop and Bluetooth build.
- `Projects.csv` says the Bheenmal launch was covered by three regional newspapers. The page says
  four and shows four clippings, and all four report the launch. None of the clippings shows a
  date; March 2024 comes from `Projects.csv` only.
- The Robonari audio module video is captioned "57 s". `ffprobe` reports 56.46 s. The other four
  captions match their files when rounded to the nearest second (26.23, 51.40, 9.88 and 46.53 s).
- The portrait caption in `#about` reads "Graduating June 2026". By the date of this check that
  date has passed.
- `assets/og-card.jpg` is a capture of an earlier version of the site. Its corner hint reads
  "Drag the block, or its ring to lift it. The arm carries it back to the pedestal. Scroll to walk
  the bench.", which no longer describes the controls. The image alt text is still accurate.
- The `#stack` note says every board and sensor below stands in the cabinet as a 3D model. All
  ten sensors have a model in `HARDWARE` (`js/island.js`), but only 7 of the 14 boards do:
  Arduino Uno, Arduino Mega 2560, Arduino Nano Every, ESP32 NodeMCU, Raspberry Pi 5, Raspberry
  Pi 4B and Raspberry Pi Zero.
- The `figure.station` captions (for example "SERIAL LINK", "SPRINT DIALS") are never shown.
  `css/styles.css` hides `.station` inside panels in the world (`body:not(.no-world) .panel
  .station`), in the fallback page (`body.no-world .station`) and in print.
- The certificate list and the Robonari press list are written twice, once in `index.html`
  and once in `js/island.js`, and nothing checks that the two agree.
- The Credentials building sign reads "HALL OF FAME". The header link says "Credentials" and the
  place label says "Credentials hall".
- `data/` is not in the repository, so a clone cannot check the facts in this document without
  the owner's copy of the export.
