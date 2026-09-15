# Asset map

Every picture on the site: a short ID, what it actually shows (each file was opened and
checked by eye on 15 September 2026), where the code uses it, and the shape it has to keep.

File names stay exactly as they are, so `index.html` and `js/island.js` never need editing
when a picture is replaced. The IDs are only handles for the swap.

---

## Replacing a picture with a better one

1. Get the best original you have: the camera photo, the certificate PDF, the full scan.
2. Save it in `assets/tmp/` named after its ID or its slug, for example `C09.pdf`,
   `E07.jpg` or `tequity-hackathon-2025.png`. JPG, PNG, WebP, TIFF and PDF (first page) work;
   convert HEIC first. If you would rather not rename anything, drop the files in as they are
   and ask; they will be opened, identified and renamed to their IDs by hand.
3. Dry run, which changes nothing and prints what it would write:
   `python3 tools/assets/place.py`
4. Write the files: `python3 tools/assets/place.py --apply`. For each picture it writes
   - `<slug>-full.jpg`, the whole picture in its own shape, up to about 4 megapixels, never
     enlarged (this is what the gallery viewer shows);
   - `<slug>.jpg`, the thumbnail, in the shape listed below (certificates at 560 px wide,
     everything else at its current width);
   and moves the source into `assets/tmp/done/`. `P01` and `P02` are single files written
   at exactly their listed size.
5. If a picture's shape differs from the one listed by more than 2 %, it is skipped. Crop it
   yourself, or pass `--fit pad` (adds borders in the picture's edge colour, best for
   certificates) or `--fit crop` (centre crop, best for photos). The full image is never
   padded or cropped. The other way out is to change the width and height in the code; the
   lines are in the tables.
6. Look at the new files, then `git status`. `git checkout -- assets/<path>` restores an old one.

`python3 tools/assets/place.py --list` prints every ID, file and required shape.
`assets/tmp/` is gitignored, so downloads there are never committed.

**Why the shape matters.** The 3D frames build the picture plane from the width and height
written in the code, so a thumbnail of a different shape is stretched on the island. On the
page, images are sized by their container, so extra pixels are fine.

**Before anything goes in** (handbook rule 4): no tax invoice or Cognifyz offer letter and no
LinkedIn post screenshots. Photos of schoolchildren from the owner's own classes and
demonstrations are allowed since 15 September 2026. Crop out camera watermarks and anything
private such as chat histories.

---

## 1. Portrait and link card (`assets/`)

| ID | File | What it shows | Where it is used | Shape | Now |
| --- | --- | --- | --- | --- | --- |
| P01 | `shivender.jpg` | Head-and-shoulders portrait, dark suit, white shirt, blue-grey studio background. | About panel portrait, shown in greyscale (`index.html:229`); profile image for search engines (`index.html:50`) | square, written at exactly 720 × 720 | Good |
| P02 | `og-card.jpg` | Link preview card: the headline "Seven days from a field I have not worked in to hardware that runs.", LinkedIn and GitHub buttons, the arm on the bench with its telemetry. | Preview when the site is shared (`index.html:23`, `index.html:32`) | exactly 1200 × 630 | Older design, see section 6 |

## 2. Press clippings (`assets/press/`)

| ID | File | What it shows | Where it is used | Shape | Now |
| --- | --- | --- | --- | --- | --- |
| R01 | `robonari-marudhar-aaina-2024` | Marudhar Aaina (Hindi) report of the humanoid launch at Bheenmal, with a photo of Prem Singh Rao beside the robot. | Work, Robonari evidence (`index.html:401`); Bheenmal stage backdrop (`js/island.js:308`) | 400 × 809, tall | Readable |
| R02 | `robonari-dainik-nirala-2024` | Dainik Nirala Rajasthan News report of the launch, with a photo of the robot. | Work, Robonari (`index.html:407`); stage backdrop (`js/island.js:309`) | 400 × 643 | Readable |
| R03 | `robonari-sach-media-2024` | Sach Media News Network report. Top photo: the robot and the team on stage with trophies. Bottom photo: the student audience. | Work, Robonari (`index.html:413`); stage backdrop (`js/island.js:310`) | square | Readable, see section 6 |
| R04 | `robonari-jagruk-times-2024` | Jagruk Times report with a photo of Prem Singh Rao and the robot. The right edge of the text column is cut off. | Work, Robonari (`index.html:419`); stage backdrop (`js/island.js:311`) | 400 × 733 | Cropped too tight |
| R05 | `mount-abu-navjyoti-2025` | Navjyoti, Mount Abu: five-day AI and ML camp at the Kendriya Vidyalaya, 13 to 18 January, 68 students, trainers Neha and Shivendra, with a group photo. | Work, Mount Abu camp (`index.html:713`) | 4 : 5 (file 400 × 500, HTML 480 × 600) | Readable, see section 6 |

## 3. Event and work photos (`assets/events/`)

| ID | File | What it shows | Where it is used | Shape | Now |
| --- | --- | --- | --- | --- | --- |
| E01 | `robonari-on-stage-bheenmal-2024` | The humanoid on stage at Bheenmal. A video still padded above and below with blurred enlargements of itself; the Hindi caption is cut off. | Work, Robonari (`index.html:395`); stage backdrop (`js/island.js:307`) | 480 × 778, tall | Poor, replace |
| E02 | `attendance-system-poster-2023` | Two team members holding the "Attendance System Using Face Recognition" poster, Govt. Polytechnic College Jodhpur. The poster names Partho Roy, Shivender Singh Thakur, Suryakant Acharya and Vishal Solanki, guided by Sh. M.D Verma. | Work, attendance system (`index.html:492`) | square | Good |
| E03 | `kinelink-gesture-demo-2025` | Screen recording still: webcam with hand and arm tracking, the slider panel (Shoulder V, Shoulder H, Elbow, Gripper, "Stop AI"), and the arm on the desk mirroring the pose. | Work, KineLink (`index.html:554`) | 480 × 257, wide | Video still, soft |
| E04 | `kinelink-interface-2025` | The slider panel with "Start AI" beside the physical arm; a black strip down the right edge. | Work, KineLink (`index.html:560`) | 480 × 262, wide | Video still, soft |
| E05 | `prometeo-2025-iit-jodhpur` | Eight RoboAI Hub members in front of the PROMETEO 2025 screen at IIT Jodhpur that announces RoboAI Hub. | Work, servo arm (`index.html:616`) | 4 : 3 | Good, 2048 × 1536, replaced 15 Sep 2026 |
| E06 | `ai-on-edge-mbm-faculty-workshop` | Group photo, "AI on Edge" faculty workshop on intelligent embedded systems, organised by MBM University Jodhpur, conducted by RoboAI Hub. Title text and a cut-off "www.roboaihu" are burned in. | Work, servo arm (`index.html:623`) | 16 : 9 | Reel still, replace |
| E07 | `tequity-hackathon-2025` | Four people in front of the Tequity backdrop, two holding prize bags. | Credentials, Out in the field (`index.html:832`) | 480 × 318 | Very blurry, replace first |
| E08 | `roboai-hub-team` | About twenty RoboAI Hub members and volunteers at an outdoor stall with small robots and laptops, under the banners "ROBOTICS और AI हमारी JOBS छीन लेंगे?" and "Evolution of Technology". The thumbnail is centre-cropped; the full image is not. | Credentials, Out in the field (`index.html:833`) | 480 × 432 | Good, 1280 × 960, replaced 15 Sep 2026 |
| E09 | `indiasoft-expo-badge-2026` | INDIASOFT and India Electronics Expo visitor badge, 23 to 25 March 2026, New Delhi, Basttl Auto India Private Limited, held in hand. | Credentials, Out in the field (`index.html:834`) | square | Good, camera watermark |
| E10 | `at-work` | Shivender at a laptop, shelves behind with a Sequence board game and a "THEPC KART x H5" bag. | Toolchain, "Away from it" (`index.html:921`) | square | Looks upscaled |
| E11 | `taabar-mela-stall` | The RoboAI Hub stall at Taabar Mela, Jodhpur: a member in a RoboAI Hub T-shirt at a laptop, schoolchildren and visitors around the table. | Work, servo arm, the three showings (`index.html:630`) | 384 × 480 | Small; 384 × 480 is the whole source |
| E12 | `taabar-mela-arm-demo` | A young visitor at the Taabar Mela table gesturing towards the blue arm, with a RoboAI Hub member looking on. | Work, servo arm, the three showings (`index.html:637`) | 384 × 480 | Small; 384 × 480 is the whole source |
| E13 | `servo-arm-acrylic-build` | The assembled blue acrylic arm with micro servos, wired to a breadboard on an office desk. | Work, servo arm, The arm (`index.html:664`) | square | Good |
| E14 | `servo-arm-acrylic-assembly` | The same arm half assembled, held in one hand beside its base plate. | Work, servo arm, The arm (`index.html:671`) | square | Good |
| E15 | `mount-abu-camp-classroom-2025` | The Mount Abu classroom from the back on 17 Jan 2025 (from the file's timestamp): students facing the smart board, a trainer at the front. | Work, Mount Abu camp, In the classroom (`index.html:728`) | 4 : 3 | Good |
| E16 | `mount-abu-camp-smartboard-2025` | A student at the smart board with a trainer, 16 Jan 2025 (file timestamp). | Work, Mount Abu camp, In the classroom (`index.html:735`) | 4 : 3 | Good |
| E17 | `mount-abu-camp-ml-lesson` | A trainer presenting a slide titled "Machine Learning: It's Powerful Tool" in the same classroom. Undated: the WhatsApp file name says 1 Aug 2024, which may only be when it was sent. | Work, Mount Abu camp, In the classroom (`index.html:742`) | square | Good |
| E18 | `swavalamban-kaushal-mela-2025` | The RoboAI Hub team in maroon polos at World Youth Skills Day 2025, in front of the "AI Partner" backdrop. | Credentials, Out in the field (`index.html:835`) | square | Good |

## 4. Real bench photos (`assets/bench/`)

| ID | File | What it shows | Where it is used | Shape | Now |
| --- | --- | --- | --- | --- | --- |
| B01 | `workstation` | One Dell monitor split between a ChatGPT answer about servo control (chat history readable in the sidebar) and a VNC window with IDLE; on the desk a Raspberry Pi, a servo driver board and a micro servo. | Toolchain, "Where the code happens" (`index.html:918`); framed in the toolchain shed (`js/island.js:522`) | 3 : 4, portrait | Soft, glare, see section 6 |
| B02 | `raspberry-pi` | Raspberry Pi 4 on a metal switching power supply, jumper wires on the GPIO header, USB-C power. | Toolchain, "Where it has to run" (`index.html:919`); shed (`js/island.js:522`) | 3 : 4, portrait | Slightly soft |
| B03 | `motor-driver-bench` | The same Pi and power supply wired to a red dual motor driver board and two geared DC motors with yellow gears. | Toolchain, "Where it moves" (`index.html:920`); shed (`js/island.js:522`) | 3 : 4, portrait | Good |

## 5. Certificates (`assets/certs/`)

All eighteen appear twice: the certification wall in the Credentials panel and the Hall of
Fame on the island (two rows of nine, frames scaled to 0.79). Thumbnails are written at 560 px
wide so the Hall of Fame stays sharp up close.

| ID | File | What it shows | `index.html` / `js/island.js` | Shape | Now |
| --- | --- | --- | --- | --- | --- |
| C01 | `nptel-deep-learning-iit-ropar-2025` | NPTEL Elite, Deep Learning, IIT Ropar, Jul to Oct 2025, 77 %, with photo and roll number. | 808 / 449 | 280 × 200 (7 : 5) | Good |
| C02 | `cadd-autofina-robotics-360h-2023` | CADD Centre with Autofina Robotics and R-CAT: Advanced Certificate in Robotics & Automation, 10 Jul to 5 Oct 2023, 360 hours, issued 22 Dec 2023. | 809 / 450 | 280 × 198 (A4 landscape) | Good, replaced 15 Sep 2026 |
| C03 | `roboai-hub-180-day-internship-2024` | RoboAI Hub certificate of completion: AI Internship Program, 180 days, 1 Apr to 30 Sep 2024, project "Robot Interaction system – Voice and Image processing based". | 810 / 451 | 280 × 384, portrait | Sharp, replaced 15 Sep 2026 |
| C04 | `ccna-enterprise-networking-2023` | Cisco Networking Academy, CCNAv7: Enterprise Networking, Security, and Automation, 9 May 2023. | 813 / 454 | 280 × 189 | Good, replaced 15 Sep 2026 |
| C05 | `ccna-switching-routing-2023` | Cisco Networking Academy, CCNAv7: Switching, Routing, and Wireless Essentials, 15 May 2023. | 814 / 455 | 280 × 189 | Good |
| C06 | `straightarc-cyber-security-2024` | StraightArc Technologies with SkyVirt CyberRange: participation, Cyber Security Fundamentals two-day workshop, 12 hours, 21 March 2024. | 817 / 458 | 16 : 9 | Good |
| C07 | `pm-shri-kv-mount-abu-2025` | PM SHRI KV ISA, Mount Abu, Completion of Training: trainer for the vocational programme 13 to 18 Jan 2025 for class 8, signed and stamped 18 Jan 2025. A photo of the paper, turned sideways. | 818 / 459 | 280 × 406, portrait only because the photo is sideways | Sharper photo, replaced 15 Sep 2026; still sideways, see section 6 |
| C08 | `academor-2023` | Academor, Certificate of Outstanding Performance during the internship. No date on the certificate. | 819 / 460 | 280 × 217 | Good |
| C09 | `linkedin-linux-cli-2025` | LinkedIn Learning, Learning Linux Command Line, 11 May 2025, 2 h 57 min. | 822 / 463 | 280 × 217 | Blurry, replace first |
| C10 | `linkedin-ecmascript-2025` | LinkedIn Learning, Learning ECMAScript 6+ (ES6+), 19 Apr 2025, 1 h 27 min. | 823 / 464 | 280 × 217 | Blurry, replace first |
| C11 | `devtown-python-ai-2023` | devTown with MSME and Startup India: participation, seven-day free bootcamp on Python and Artificial Intelligence, October 2023, issued 15 Oct 2023. | 824 / 465 | 280 × 208 | Sharp, replaced 15 Sep 2026 |
| C12 | `roboai-hub-robotics-internship-2025` | RoboAI Hub, Certificate of Internship in Robotics, 20 Nov 2023 to 30 Aug 2025. Rendered from the PDF. | 811 / 452 | 280 × 397, portrait | Sharp |
| C13 | `itk-ai-internship-2023` | ITK (Ingenious Tech Key), certificate of internship in artificial intelligence, June to August 2023, signed by Narayan Jangid, Founder. | 812 / 453 | 280 × 198 | Good |
| C14 | `cisco-intro-to-networks-2023` | Cisco Networking Academy, CCNAv7: Introduction to Networks, 15 May 2023. | 815 / 456 | 280 × 190 | Good |
| C15 | `cisco-networking-essentials-2022` | Cisco Networking Academy, Networking Essentials, 12 Dec 2022. | 816 / 457 | 280 × 190 | Good |
| C16 | `academor-flutura-ml-internship-2023` | Academor with Flutura, internship completion, Machine Learning, 1 Nov to 31 Dec 2023, issued 13 Jan 2024, ID ACM23-4644. | 820 / 461 | 280 × 216 | Good |
| C17 | `academor-kshitij-ml-course-2023` | Academor with Kshitij, course completion, Machine Learning, 1 Nov to 31 Dec 2023, issued 13 Jan 2024, ID ACM23-2653. | 821 / 462 | 280 × 216 | Good |
| C18 | `aws-community-builders-devtown-python-ai` | AWS Community Builders with devTown, certificate of completion, seven-day bootcamp on Python and Artificial Intelligence. No date on the certificate. | 825 / 466 | 280 × 203 | Good |

---

## 6. Found while mapping (owner to decide)

- **Still to replace** (no better file in `media/` yet): E07, C09, C10, E06, E01, then E03,
  E04, E10. C02, C03, C04, C07, C11, E05 and E08 were replaced on 15 September 2026.
- **B01 alt text is wrong.** It says "A two-monitor desk with an editor open"; the photo is one
  monitor showing ChatGPT and a VNC window, with a Pi and servo driver on the desk. The
  ChatGPT history in the sidebar is readable. A new photo, or new alt text, is needed.
- **C07 is photographed sideways.** An upright scan is landscape, so replacing it also needs
  its width and height changed in `index.html:818` and `js/island.js:459`.
- **Schoolchildren.** The owner lifted the rule 4 ban on 15 September 2026, so R03, R05 and
  the classroom and Taabar Mela photos (E11, E12, E15 to E17) are on the site by decision.
- **Watermarks.** E09 has "Shot on OnePlus"; E06 has burned-in title text and "www.roboaihu".
- **P02 shows an older design** (the scrolling bench page), not the island. Making a new one
  means screenshotting the site, which agents may not do (rule 9), so the owner has to.
- **Vague names**, if renaming is wanted later (each needs its paths edited in the code):
  `events/at-work` (event unknown), `bench/workstation`, `events/roboai-hub-team` and
  `events/ai-on-edge-mbm-faculty-workshop` (no year). Not renamed.

---

## 7. Not pictures

These are not replaced through `assets/tmp/`.

| Files | What they are | Used by | How to replace |
| --- | --- | --- | --- |
| `hdri/workshop_1k.hdr` | Poly Haven `aircraft_workshop_01`, 1k, CC0 | Scene lighting, `js/realism.js:24` | From Poly Haven. A 2k file under a "1k" name would mislead, so rename it and the path together. |
| `tex/<set>_diff.webp`, `_nor.webp`, `_rough.webp` | Poly Haven CC0, 1024 × 1024: `forest_ground_04` (island), `rocky_terrain_02` (cliffs, paths), `wood_table_worn` (benches), `metal_plate` (buildings) | `pbr(name)`, `js/realism.js:57` | Same names at 2k need no code change but cost about four times the download. |
| `models/*.glb` (6) | Poly Haven props: `circuit_board`, `classic_laptop`, `desk_lamp_arm_01`, `industrial_microscope`, `metal_toolbox`, `Television_01` | `loadProp(name)`, `js/realism.js:78` | A meshopt-compressed GLB under the same name. |
| `models/boards/`, `sensors/`, `robotics/` (18), `models/catalog.json` | Output of `tools/models/convert.mjs` | Skills cabinet, robotics lab | Re-run the converter (handbook section 11). Never place by hand. |

## 8. Video (`assets/video/`)

Clips open in the gallery viewer from a link with `data-video`. Each is `<slug>.mp4` plus a
`<slug>.jpg` poster, 480 px wide, which is also its thumbnail in the evidence strip.
`place.py` does not handle video. To replace a clip, re-encode it:

```bash
ffmpeg -i in.mp4 -vf "fps=30,scale='if(gt(iw,ih),min(1280,iw),-2)':'if(gt(iw,ih),-2,min(960,ih))'" \
  -c:v libx264 -preset slow -crf 28 -pix_fmt yuv420p -c:a aac -b:a 96k -movflags +faststart \
  assets/video/<slug>.mp4
ffmpeg -ss <seconds> -i assets/video/<slug>.mp4 -frames:v 1 -vf scale=480:-2 assets/video/<slug>.jpg
```

Then set its `width` and `height` in `index.html` to the poster's size. Phone videos often
carry a rotation flag, so go by the poster, not the size the source file reports. Keep every
clip well under GitHub's 100 MB per-file limit.

| ID | File | What it shows | Where it is used | Poster | Clip |
| --- | --- | --- | --- | --- | --- |
| V01 | `labour-law-chatbot-demo` | The "Labor Law Chatbot" web app on localhost answering a question about workplace bullying and late wages, beside the Flask server log. | Research, The fields (`index.html:319`) | 480 × 360 | 26 s, 4.7 MB |
| V02 | `robonari-audio-module` | A laptop terminal, then a small wheeled rig with boards and a microphone on a desk. The owner's title: audio module and AI integration. | Work, Robonari, On the bench (`index.html:432`) | 480 × 640 | 56 s, 6.1 MB |
| V03 | `kinelink-demo-2025` | KineLink: webcam pose and hand tracking driving the arm, then the manual sliders. | Work, KineLink (`index.html:547`) | 480 × 270 | 51 s, 2.9 MB, no sound |
| V04 | `servo-arm-pick-and-place` | The blue arm takes a rolled paper tube from a hand and sets it down. | Work, servo arm, The arm (`index.html:650`) | 480 × 854 | 10 s, 1.2 MB |
| V05 | `servo-arm-hand-tracking` | The blue arm on a desk following a hand tracked by the laptop camera. | Work, servo arm, The arm (`index.html:657`) | 480 × 272 | 47 s, 3.1 MB |

---

## 9. Owner's source folder (`media/`, gitignored)

Every file was opened (videos as eight-frame strips) on 15 September 2026.

**Placed on the site**

| File | Became |
| --- | --- |
| `autofina certificate.jpeg` | C02 |
| `roboaihub certificates/apr1 - sept30 _ 2024 .jpeg` | C03 |
| `ccnav7 enterprice networking certificate.jpeg` | C04 |
| `kendra vidalya mt abu/certificate of kv mt abu.jpeg` | C07 |
| `devtown  python ai .jpeg` | C11 |
| `roboaihub certificates/Prometeo 2025 .jpg` | E05 |
| `ai awareness roboaihub .jpg` | E08 (thumbnail centre-cropped) |

**Not used because the file already on the site is larger**

| File | Same as |
| --- | --- |
| `deeplearning iit  certifi.jpeg` (800 × 573) | C01 |
| `ccnav7 rouyting certificate.jpeg` (490 × 332) | C05 |
| `cybersecurity certificate.jpeg` (480 × 270) | C06 |
| `acedomor certi/1771935643755.jpeg` (802 × 620) | C08 |
| `kendra vidalya mt abu/1771937853333.jpeg` (640 × 800) | R05 |
| `kinelink/1774264104595.jpeg`, `kinelink/1774264205589.jpeg` (1280 wide, the same frames) | E03, E04 |

**New items**

| File | What it is |
| --- | --- |
| `ccna iuntro certificate.jpeg` | Cisco Networking Academy, CCNAv7: Introduction to Networks, 15 May 2023. |
| `network essential certificate.jpeg` | Cisco Networking Academy, Networking Essentials, 12 Dec 2022. |
| `itk certificate .jpeg` | ITK (Ingenious Tech Key), certificate of internship in artificial intelligence, June to August 2023, signed by Narayan Jangid, Founder. |
| `acedomor certi/1771935661048.jpeg` | Academor with Kshitij, course completion, Machine Learning, 1 Nov to 31 Dec 2023, issued 13 Jan 2024. |
| `acedomor certi/1771935682857.jpeg` | Academor with Flutura, internship completion, Machine Learning, 1 Nov to 31 Dec 2023, issued 13 Jan 2024. |
| `python ai cert .jpeg` | AWS Community Builders with devTown, certificate of completion, seven-day bootcamp on Python and Artificial Intelligence. No date. |
| `roboaihub certificates/Shivender.pdf` | RoboAI Hub, Certificate of Internship in Robotics, 20 Nov 2023 to 30 Aug 2025. |
| `roboaihub certificates/Swavalamban Kaushal Mela 1.0.jpg` | RoboAI Hub team in maroon polos at World Youth Skills Day 2025, in front of an "AI Partner" backdrop. |
| `robotiarm image.jpg`, `robotic arm image.jpg` | A blue acrylic four-servo arm on an office desk, wired to a breadboard. |
| `halio chip … project .jpg`, `halio chip … project  .jpg`, `IMG_20250128_230138_913.jpg` | Raspberry Pi 5, Raspberry Pi AI HAT+ (Hailo, 13 TOPS), Arducam 12 MP Camera Module 3, 27 W USB-C supply and active cooler, laid out on a table. |
| `halio chip … project .jpeg` (2448 × 3264) | Blurry close-up of a Raspberry Pi 4 GPIO header. Not usable. |

The certificates became C12 to C18, the blue arm photos E13 and E14, and the World Youth
Skills Day photo E18. The Raspberry Pi 5 and Hailo kit photos wait until the owner describes
that project; the Pi 4 close-up is not used.

**Videos**

| File | Length, size | What it shows |
| --- | --- | --- |
| `kinelink/demo.mp4` | 51 s, 1280 × 720, no sound | KineLink: webcam pose and hand tracking driving the arm, then the manual sliders. |
| `robotic arm custom movement.mp4` | 10 s, 2560 × 1440 | The blue arm takes a rolled paper tube from a hand and sets it down. |
| `robotica arm demo.mp4` | 47 s, 848 × 480 | The blue arm on a desk following a hand tracked by the laptop camera. |
| `robonari audio module and ai integration .mp4` | 57 s, 720 × 960 | A terminal on a laptop, then a small wheeled rig with boards and a microphone on a desk. |
| `labor law chatbot demo.mp4` | 26 s, 720 × 960 | The "Labor Law Chatbot" web app on localhost answering a question about workplace bullying and late wages. |
| `iot on off relay controll .mp4` | 52 s, 720 × 960 | A phone app switching a relay on and off, with a 16 × 2 LCD showing the state. |
| `roboaihub certificates/Custom scratch project reserach and development phase .mp4` | 38 s, 720 × 1280 | A two-hand finger-tracking screen, then someone at a laptop switching LEDs on a board with hand gestures. |

The first five became V03, V04, V05, V02 and V01. The IoT relay and RoboAI Hub gesture clips
wait until the owner describes those projects.

**Classroom and Taabar Mela photos** (allowed since the owner lifted rule 4 on 15 Sep 2026):
`kendra vidalya mt abu/1737110964431.jpeg` became E15, `1737008751278.jpeg` E16 and
`IMG-20240801-WA0003.jpeg` E17; `taabar mela/1774260441255.jpeg` became E11 and
`1774260597658.jpeg` E12. Not used: `1737008749971.jpeg` and `1771937842554.jpeg` (near
duplicates of E16 and E17), `1771937795484.jpeg` (padded with blurred copies, camera
watermark, and the same group photo is in R05), `taabar mela/1774260495885.jpeg` (duplicate
of E12) and `1774260564910.jpeg` (padded with blurred copies).
