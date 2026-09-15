# Character

This document covers the hooded hacker the reader walks around as, from the owner's static
sculpt to the clips `js/player.js` plays. It explains how `tools/character/rig.py` turns the
sculpt into a skinned, animated GLB and checks it, and how `tools/character/optimise-character.mjs`
compresses the GLB for the web. It lists the fields in `assets/models/character/hacker.json`
and how the site uses the clips. Read it before you change the rig, a clip, the seat or keyboard
numbers the clips are posed against, or the way `player.js` blends clips.

For walking, the camera and collisions see [World and controls](world-and-controls.md). For
the desk, chair, keyboard and arm see [Workbench](workbench.md). For the other models and the
general GLB pipeline see [Assets and pipelines](assets-and-pipelines.md), and for the owner's
browser tests see [Testing and release](testing-and-release.md). The project rules are in
[HANDBOOK.md](HANDBOOK.md) and `AGENTS.md`.

## Contents

1. [At a glance](#1-at-a-glance)
2. [Source asset](#2-source-asset)
3. [Axes and units](#3-axes-and-units)
4. [The rig pipeline (rig.py)](#4-the-rig-pipeline-rigpy)
5. [Clips](#5-clips)
6. [Measured checks](#6-measured-checks)
7. [hacker.json](#7-hackerjson)
8. [The web optimiser (optimise-character.mjs)](#8-the-web-optimiser-optimise-charactermjs)
9. [Rebuilding the character](#9-rebuilding-the-character)
10. [Checking a change without a browser](#10-checking-a-change-without-a-browser)
11. [How js/player.js uses the character](#11-how-jsplayerjs-uses-the-character)
12. [Known limitations](#12-known-limitations)

## 1. At a glance

| Item | Value |
| --- | --- |
| Web model | `assets/models/character/hacker.glb`, 1,898,732 bytes (1.90 MB) |
| Metadata | `assets/models/character/hacker.json` |
| Height | 1.75 m at scale 1, feet on local y = 0, facing +z |
| Mesh | one skinned mesh, 31,956 triangles, one material |
| Skeleton | 19 bones (see [4.4](#44-skeleton)) |
| Clips | `Idle`, `Walk`, `Run`, `Point`, `Sit`, `SitType`, all played in place |
| Textures | WebP: base colour 2048 × 2048, normal and metal/roughness 1024 × 1024 |
| GLB extensions (required) | `EXT_meshopt_compression`, `EXT_texture_webp`, `KHR_mesh_quantization` |
| Build tools | Blender (headless) for `rig.py`; Node with @gltf-transform 4.5.0, meshoptimizer 1.2.0 and sharp 0.35.4 for the optimiser |
| Git status | `tools/character/` and `assets/models/character/` are new in version 8 and not yet committed |

## 2. Source asset

| Path | What it is |
| --- | --- |
| `data/hacker-character(1).zip` | The owner's download, 88.8 MB. It holds `source/Hacker.glb` and five PNGs under `textures/`. |
| `data/raw-character/source/Hacker.glb` | The sculpt that `rig.py` reads: 60.8 MB, one mesh with 696,864 triangles (Blender counts 696,847 faces after import), one material, three embedded PNG images. It has no skeleton, no skin and no animation. |
| `data/raw-character/textures/` | The five PNGs from the zip. `rig.py` does not read them. The GLB carries its own images. |

`data/` is gitignored (`.gitignore`: `data/`), so the sculpt, the intermediate files and the
build tooling stay local. Only the optimised `hacker.glb` and `hacker.json` belong in the
repository.

The sculpt stands in an A-pose with a wide stance. `rig.py` measures the ankles 0.435 m
apart and the hip joints 0.199 m apart, and each arm hangs about 28 degrees from vertical
(`sculpt_arm_angle_deg` in the measure report).

## 3. Axes and units

- All character numbers are in metres, measured from the character's root: the floor point
  under its centre. In the seated clips the root is the floor point under the seat centre.
- In Blender (inside `rig.py`) Z is up and the character faces −Y, so its left side is +X.
  "Forward" in `rig.py` means −Y. The glTF exporter converts this to Y up, facing +Z.
- Bone suffixes `.L` and `.R` are the character's own left and right.
- In the world, `player.js` places the model's root at the player position, at
  `ground + heightAt(x, z)`. The site passes `GROUND` (−1.4 m, `js/layout.js`) as `ground`. The
  root's rotation about y is `heading`, and heading 0 faces +z. Campus coordinates and the
  heading convention are covered in [World and controls](world-and-controls.md).

## 4. The rig pipeline (rig.py)

`tools/character/rig.py` runs inside Blender with no interface:

```
blender -b --python tools/character/rig.py -- SRC.glb OUT.glb RENDER_DIR [TARGET_TRIS]
```

| Argument | Meaning |
| --- | --- |
| `SRC.glb` | the static sculpt |
| `OUT.glb` | the rigged GLB. `OUT.json` and `OUT-measure.json` are written beside it. |
| `RENDER_DIR` | folder for the contact sheets. Single frames go in `RENDER_DIR/cells/`. |
| `TARGET_TRIS` | decimation target, default `32000` (`TARGET`) |
| `SHEETS` (environment) | optional comma-separated clip names, for example `SHEETS=Walk,Sit`. Only those contact sheets are rendered. |

The script runs the stages below in order. The module docstring at the top of `rig.py` gives
the same outline.

### 4.1 Decimate and normalise

1. Imports `SRC`, applies its transforms and adds a Decimate modifier with ratio
   `TARGET / source triangles`, triangulating. The last run went from 696,847 to 31,956 faces.
2. Scales the mesh so it is `H` = 1.75 m tall, centres it on its bounding box in X and Y, and
   puts its lowest point at Z = 0.

### 4.2 Joint placement from the mesh

Joints come from slices through the mesh (`J` dictionary). Heights are given as a fraction
of `H` or in metres, before the rest-pose correction.

| Joint | How it is found |
| --- | --- |
| Spine, Chest | at 0.62 H and 0.72 H, at the mean depth of the torso slice (`torso_y`) |
| Head | at 0.885 H, a fixed depth behind the front of the face (5th percentile of the face slice + 0.10 m). The hood drapes behind the head, so the slice mean would sit too far back. |
| Neck | at 0.835 H, at a depth halfway between the chest depth and the head depth |
| Top of head | Head depth, at 1.0 H |
| Fingertip | mean of the widest 0.5 % of arm vertices between 0.3 H and 0.75 H |
| Clavicle, shoulder | at ±0.025 H, 0.80 H and at ±0.105 H, 0.815 H, at chest depth |
| Elbow, wrist | 42 % (plus 0.012 H back) and 75.5 % of the way from shoulder to fingertip |
| Hip, knee | a straight line fitted through leg cross-section centres (`band`) from 0.24 m to 0.66 m. Hip at `HIP_Z` = 0.505 H, its x read from the line at `HIP_Z` and clamped to 0.07–0.11 m, its depth read from the line at 0.64 m. Knee at `KNEE_Z` = 0.51 m, x and depth read from the line there. The hip is moved 3.5 cm back (`HIP_BACK`) and the knee 2 cm back (`KNEE_BACK`) because the cargo pockets push the slice centres forward. |
| Ankle | at `ANKLE_Z` = 0.105 m, from a separate 4 cm band centred at 0.18 m (`band(sgn, 0.18, 0.02)`). Its depth is that band's centre; its x is the band's centre extrapolated along the line's x slope down to `ANKLE_Z`. |
| Toe | ankle x, just behind the front of the sole, 0.02 m up |
| Hips (root bone head) | 0.52 H, at hip-joint depth |

The leg joints are mirror-averaged so both legs match.

### 4.3 Rest-pose leg correction

The wide stance reads as a "Y" from the front. `rig.py` fixes it by bending the mesh itself,
not by skinning, so every clip starts from a natural stance:

1. Each leg turns about its hip joint, around the Y axis, until the ankle sits `STANCE_OUT`
   (0.012 m) outside the hip. The last run turned each leg 7.7 degrees.
2. The turn is full below 0.70 m and fades out up to 0.86 m. Near the centre line at the top
   of the thighs (within 6 cm of centre, 0.55–0.70 m up) it fades as well, so the inner thighs do
   not cross.
3. The boot turns back by the same angle about the new ankle (full below 0.14 m, fading out by
   0.22 m), so the sole stays flat.
4. The mesh is dropped so its lowest point is back on Z = 0. The heel, ball (73 % of the way
   from heel to toe tip) and toe-tip positions are then read from the sole.

After the correction the ankles are 0.223 m apart and the hip joints 0.199 m apart.

### 4.4 Skeleton

`BONES` defines 19 bones. Each runs from one joint (head) to the next (tail):

| Bone | Head → tail | Parent | Connected |
| --- | --- | --- | --- |
| `Hips` | hips → spine | none (root) | no |
| `Spine` | spine → chest | `Hips` | yes |
| `Chest` | chest → neck | `Spine` | yes |
| `Neck` | neck → head | `Chest` | yes |
| `Head` | head → top | `Neck` | yes |
| `Shoulder.L/R` | clavicle → shoulder | `Chest` | no |
| `UpperArm.L/R` | shoulder → elbow | `Shoulder` | yes |
| `LowerArm.L/R` | elbow → wrist | `UpperArm` | yes |
| `Hand.L/R` | wrist → fingertip | `LowerArm` | yes |
| `UpLeg.L/R` | hip → knee | `Hips` | no |
| `Leg.L/R` | knee → ankle | `UpLeg` | yes |
| `Foot.L/R` | ankle → toe | `Leg` | yes |

There are no finger or toe bones. The exported GLB lists the joints in this order:
`Hips Spine Chest Neck Head Shoulder.L UpperArm.L LowerArm.L Hand.L Shoulder.R UpperArm.R
LowerArm.R Hand.R UpLeg.L Leg.L Foot.L UpLeg.R Leg.R Foot.R`.

### 4.5 Skin weights and limits

`rig.py` computes the weights itself with NumPy. It does not use Blender's automatic weights.

1. **Distance.** Each vertex's raw weight for a bone is `1 / max(d, 0.008)^4`, where `d` is
   the distance to the bone segment.
2. **Region masks** (`MASK`, heights as z = Z / H). Leg bones take only their own side
   (with 1.2 % H of overlap across the centre line). Other `.L`/`.R` bones take only their side.
   `UpLeg` takes z < 0.58, `Leg` z < 0.36 and `Foot` z < 0.14. `Spine`, `Chest` and the arm
   bones take z > 0.46, `Neck` and `Head` z > 0.78, and `Hips` 0.36 < z < 0.70.
3. **Smoothing.** Eight passes average each vertex with its edge neighbours. They run on
   welded positions, because vertices split at UV seams must share weights.
4. **Limits where distance misleads** (`FW`):
   - Below the armpit (0.16 m below the shoulder joint, blended over ±0.04 m) a vertex goes
     to the forearm and hand, or to `Hips`, `Spine` and the thigh. The nearer surface wins,
     measured as distance minus each bone's radius (`RADIUS`, the median distance of vertices
     clearly nearest that bone). A 5 cm blend (−0.02 to +0.03 m) covers vertices about equally
     near both. Without this, the side of the jacket followed a lifted forearm. The upper arm
     keeps plain distance weights, because a sharp line there tears the armpit.
   - `UpLeg` lets go of vertices over the 0.10 m above the hip joint, so bending the hip does
     not drag the waist.
   - `Leg` lets go of the boot below the ankle (fade from 0.01 m above to 0.04 m below the
     ankle joint), so the sole moves with `Foot` alone and stays planted while the foot is.
5. **Web limits.** Each vertex keeps its four largest influences (`K = 4`). Weights under 0.02
   are dropped, and the rest are rounded to 1/255 and renormalised. The web copy stores 8-bit
   weights, so the rounding is applied at this stage.

The weights go into Blender vertex groups, and an Armature modifier binds the mesh to
`HackerRig`.

### 4.6 Authoring the clips

Clips are built as poses from targets, not keyed angles. The `Pose` class holds absolute
armature-space rotations and bone heads, root first. The helpers are:

| Function | What it does |
| --- | --- |
| `leg(pose, side, ankle, foot_rot, pole)` | two-bone IK: thigh and shin reach the ankle target with the knee toward `pole`. The foot takes an absolute rotation. |
| `reach_cap(pose_fn, feet, k)` | how far the hips may rise before either leg is straighter than fraction `k` of its length. It sets the pelvis height in `Idle` (`k` 0.993), `Walk` (0.998) and `Run` (0.985). |
| `ground_ankle(side, R)` | ankle height that puts the lowest point of the boot, turned by `R`, on the floor |
| `arm(pose, side, flex, abd, twist, elbow, pron, wflex, wdev, shrug)` | arm pose from anatomical angles in degrees, measured from a relaxed hanging arm |
| `reach_arm(pose, side, target, pref, ...)` | damped least-squares solve (up to 60 iterations) for flex, abduction, twist and elbow, so the wrist lands on `target` while staying near `pref`. The elbow is clamped to 0–150 degrees. |
| `torso(pose, pelvis, chest_world, head_world)` | pelvis rotation. `Spine` and `Chest` share the turn to the chest orientation, and `Neck` and `Head` share the turn to the head orientation. |
| `gait_poses(g)` | `Walk` and `Run` from the `GAITS` parameters. Each stance foot rolls on its heel and then on its toe tip, and each swing foot follows a cubic Hermite spline through the `swing` knots. |
| `sit_pose(t, zoff, typing)` | `Sit` and `SitType` |

The seated clips use two solves before baking:

1. **Seat height.** A secant iteration finds the hips offset (`SIT["zoff"]`) that puts the
   lowest pelvis vertex (`seat_contact`) at `SEAT` = 0.46 m, to within 0.5 mm. At every step
   `place_feet` bisects the ankle's forward distance until the inner knee angle is
   `SIT["knee"]` = 98 degrees.
2. **Typing wrist height.** A second secant iteration finds `TYPE["wrist_z"]`, which puts the
   lowest glove point `KEY_CLEAR` = 0.008 m above `KEYS["top"]` = 0.764 m. The `rig.py`
   comments call this the key tops, but it is the top of the keyboard case, not the keycaps
   (see below). The last run found a wrist height of 0.831 m and a lowest glove point of
   0.772 m.

The desk and keyboard numbers in `rig.py` (`SEAT`, `DESK`, `KEYS`) copy the workbench in
`js/bench.js`, measured from the seated root. `DESK`: top 0.75 m, thickness 0.03 m, front edge
0.30 m forward. `KEYS`: top 0.764 m, centre 0.46 m forward, 0.135 m deep, 0.42 m wide.

`KEYS["top"]` matches the case of the keyboard, not the keycaps. In `buildKeyboard` in
`js/bench.js` the keyboard group sits on the desk top (`KEYBOARD.y` = 0; bench-local units are
10 cm, `ROOT_SCALE` = 0.1, and `FLOOR` = −7.5 puts the desk top at 0.75 m). The case (`slab`,
`roundedBox(4.2, 0.14, 1.35, 0.05)` at y 0.07) has its top at 0.14 units, 0.764 m. The keycaps
(`BoxGeometry(0.16, 0.06, 0.16)` at y 0.17) reach 0.20 units, 0.770 m.

### 4.7 Bake and export

1. `bake(name, poses, bones)` converts each pose to per-bone quaternions. It keys frames
   0 to N, and key N repeats frame 0, so the loop closes. Neighbouring quaternions are kept in
   the same hemisphere. The `Hips` location is keyed too, which gives the in-place bob. `Point`
   keys only `POINT_BONES`. Keys are at 60 fps (`FPS`).
2. The clips are measured ([section 6](#6-measured-checks)), and then `OUT.json` and
   `OUT-measure.json` are written.
3. The GLB export uses the Idle action at frame 0, with skins, animations in `ACTIONS` mode,
   WebP images, no tangents or morph targets, forced sampling and
   `export_optimize_animation_keep_anim_armature`. The exporter writes translation, rotation
   and scale channels for all 19 bones in every clip (57 channels each). The optimiser removes
   the channels the site does not need.

### 4.8 Contact sheets

After export, `rig.py` bakes one more action, `PointPreview`, which is Point layered over
Idle. It is not in the GLB. The script then renders a sheet for each clip with EEVEE and an
orthographic camera:

- `RENDER_DIR/sheet-<clip in lower case>.png`, for example `sheet-sittype.png`: six columns at
  evenly spaced frames. The top row is the front view and the bottom row the side view. Each
  cell is 300 × 460 px.
- `RENDER_DIR/cells/<clip in lower case>-<front|side>-<frame, 3 digits>.png`, for example
  `cells/idle-front-000.png`: the single frames.
- The file names are lower case, but `SHEETS` still takes the exact clip names
  (`SHEETS=Walk,SitType`).
- The seated clips show helper boxes: a 0.44 m seat with its top at 0.46 m, the desk top and
  the keyboard block. The standing clips show only the floor.
- The Point sheet shows `PointPreview`.

## 5. Clips

All clips play in place at 60 fps keys. Lengths are `frames / 60`.

| Clip | Frames | Length | What it does |
| --- | --- | --- | --- |
| `Idle` | 240 | 4.0 s | Weight shift and breathing. The pelvis sways 1.3 cm side to side and turns slightly, the chest and head move gently (the head turns up to 7 degrees), and the arms hang with a small swing. The feet stay at the rest ankles, and the hips drop only as far as the legs need. |
| `Walk` | 64 | 1.0667 s | 1.24 m stride, stance 62 % of the cycle, feet 0.085 m either side of centre and turned out 6 degrees. Heel strike at 16 degrees toe-up, a planted foot, then the heel rises about the toe tip up to 42 degrees at toe-off. The pelvis turns 7 degrees, drops 4 degrees and tilts 3 degrees, with an arm swing of 15 degrees. Authored speed 1.1625 m/s; measured ground speed 1.1591 m/s. |
| `Run` | 42 | 0.7 s | A jog, not a sprint. 2.2 m stride with stance 36 % of the cycle, so both feet leave the ground between steps. Feet 0.055 m either side of centre. The chest leans 11 degrees and counter-rotates 11 degrees, with the elbows bent 82 degrees, up to 88 degrees as each arm swings forward. Authored speed 3.1429 m/s; measured ground speed 3.1298 m/s. |
| `Point` | 120 | 2.0 s | Keys only `Chest`, `Neck`, `Head`, `Shoulder.R`, `UpperArm.R`, `LowerArm.R` and `Hand.R`, for layering. The right arm is forward at shoulder height (flex 86 degrees, elbow 9 degrees) with the open hand thumb up, edge on to the spot. The chest turns 7 degrees and the head 8 degrees toward the pointing side, with a small settle. |
| `Sit` | 240 | 4.0 s | Seated on a 0.46 m seat centred over the root. Pelvis tilted back 4 degrees, inner knee angle 98 degrees, feet flat with the ankles 0.346 m forward, chest leaning forward 10 degrees. The hands rest in front of the lap, with the wrists 0.16 m either side, about 0.17 m forward and 0.69–0.70 m up (`wrists_m`). Gentle breathing and head movement. |
| `SitType` | 120 | 2.0 s | Sit's lower body. The chest leans forward 22 degrees. The gloves are palm down over the bench keyboard, with the wrists aimed at 0.12 m either side, 0.37 m forward and 0.831 m up, so the lowest glove point is 0.771–0.779 m, just above the keycap tops at 0.770 m. The forearms stay above the 0.75 m desk top. Key taps only ever lift the hands, between 0 and 8 mm (four and seven cycles per loop), with 8 mm of side drift. |

The per-clip parameters are in `GAITS`, `SIT`, `TYPE`, `idle_poses`, `point_poses` and
`sit_pose`. The sculpt's arms are short (0.45 m from shoulder to wrist), which is why `SitType`
leans the chest 22 degrees (comment on `TYPE`).

## 6. Measured checks

After baking, `rig.py` plays every clip in Blender and measures the evaluated bones and
deformed mesh (`eval_verts`). Walk and Run are sampled on every frame. The other clips have
bones sampled every 4 frames and vertices every 4 frames (seated clips) or every 8 (Idle).
Point's mesh checks use `PointPreview` posed by the script's own skinning function. A failed
check prints `FAIL <reason>`, adds the reason to `fails` and makes the final log line
`MEASURE FAILED [...]` instead of `MEASURE OK []`.

### 6.1 Checks that fail the build

| Clip(s) | Check (report key) | Fails when | Last run |
| --- | --- | --- | --- |
| Idle, Walk, Run | ankles wider than hip joints (`ankles_minus_hips_max_m`) | > 0.06 m | Idle 0.0241, Walk 0.002, Run −0.0735 |
| Idle, Walk, Run | foot below ground (`lowest_foot_bone_m`, `lowest_foot_vertex_m`) | bone < −0.01 m or vertex < −0.003 m | bones ≥ −0.002, vertices 0.0 |
| Walk, Run | planted sole slides (`sole_slip_m_L/R`) | abs > 0.005 m | Walk 0.0007/0.0008, Run 0.0011/0.0012 |
| Walk, Run | swinging foot clearance, ignoring the first 10 % and last 15 % of the swing (`swing_min_clearance_m`) | < 0.01 m | Walk 0.0199, Run 0.0286 |
| Walk | pelvis bob (`pelvis_bob_m`) | > 0.055 m | 0.0495 |
| Walk | frames with both feet more than 4 mm off the floor (`frames_both_feet_off_floor`) | any | none |
| Walk | hand vertices inside the hips and thighs outline (`hand_vertices_in_hips_max`) | > 10 | 0 |
| Run | thigh angle from vertical (`peak_hip_flexion_deg`) or highest hand point (`peak_hand_height_m`) | > 56 degrees or > 1.25 m | 52.6 degrees, 1.234 m |
| Sit, SitType | seat contact (`seat_contact_m`) | outside 0.46 ± 0.03 m | 0.46–0.46 |
| Sit, SitType | lowest foot vertex (`lowest_foot_vertex_m`) | outside −0.01 to 0.03 m | 0.0 |
| Sit, SitType | inner knee angle (`knee_inner_angle_deg`) | outside 75–105 degrees | 98.0 |
| Sit, SitType | vertices inside the desk-top slab in front of its edge (`vertices_in_desk_top_max`) | any | 0 |
| SitType | forearm or glove vertices below the desk top in front of its edge (`forearm_hand_vertices_under_desk_top_max`) | any | 0 |
| SitType | vertices inside the keyboard block (`vertices_in_keyboard_max`), or lowest glove point (`lowest_glove_point_m`) | any, or < 0.768 m (`KEYS["top"]`, the keyboard case top at 0.764 m, + 4 mm; the keycaps reach 0.770 m) | 0; 0.771–0.7793 m |
| Point | right wrist height minus shoulder height (`wrist_minus_shoulder_height_m`) | abs ≥ 0.08 m on any sampled frame (every 4th) | 0.0025–0.0139 m |
| Point | palm normal's vertical component (`palm_normal_up_component`) | > 0.35 (palm down) | 0.124 |
| Point | keyed bones (`keyed_bones`) | anything but the seven `POINT_BONES` | the seven |
| every clip with mesh samples | largest mesh edge stretch against the rest pose (`edge_growth_max_m`) | > `EDGE_FAIL` = 0.08 m | Idle 0.0148, Walk 0.0489, Run 0.0734, Point 0.0702, Sit 0.0655, SitType 0.0754 |

"Last run" is the report from 15 September 2026, `data/tmp/char/hacker-rigged-measure.json`.
The current `hacker.glb` is byte-identical to the optimiser's output from that run's
`hacker-rigged.glb`.

### 6.2 Reported only

The report also records values that do not fail the build: `skin_vs_blender_max_m` (the
script's skinning against Blender's deform on frame 0, at most 2e-05 m), `edges_over_5cm_max`,
`ankles_across_max_m` and `hip_joints_across_m`. For Walk and Run it records
`contact_frames_L/R`, `contact_side_drift_m_L/R`, `contact_fit_residual_m_L/R`,
`sole_lift_in_contact_m_L/R`, `ground_speed_mps` and `authored_speed_mps`. For Run it also
records `pelvis_bob_m` (0.0591), and for Walk `peak_hip_flexion_deg` (35.2) and
`peak_hand_height_m` (1.021); these fail the build only for the other gait. For the seated
clips it records `thigh_lowest_over_seat_front_m`, `hip_joint_height_m`,
`hip_joint_forward_m`, `hips_bone_head_m`, `ankle_forward_m`, `foot_centre_forward_m` and
`thigh_slope_deg`. For Sit it adds `wrists_m`. For SitType it adds `glove_forward_m`,
`wrists_across_forward_up_m` and `typing_wrist_target_m`, and for Point
`wrist_forward_of_shoulder_m`. It also holds `rest` (rest-pose ankle and hip spacing, sculpt
arm angles) and `tris`.

The measured ground speed is the slope of the planted ankle's forward position over the
longest run of consecutive frames in which that foot is flat on the floor, averaged over both
feet.

## 7. hacker.json

`rig.py` writes `OUT.json`. The optimiser checks that every listed clip is in the GLB, then
copies the file beside the web GLB. Re-serialising it turns `4.0` into `4`.

| Field | Value now | Meaning | Source in `rig.py` | Read by `player.js` |
| --- | --- | --- | --- | --- |
| `height` | 1.75 | model height in metres | `H` | no (it uses its own `HEIGHT`) |
| `walkSpeed` | 1.1591 | ground speed in m/s that `Walk` covers at timeScale 1 | measured `ground_speed_mps` of Walk | yes |
| `runSpeed` | 3.1298 | the same for `Run` | measured `ground_speed_mps` of Run | yes |
| `seatHeight` | 0.46 | seat-top height in metres that `Sit` and `SitType` are posed on | `SEAT` | yes |
| `keyboardReach` | 0.46 | how far in front of the seated root the keyboard centre is, in metres | `KEYS["forward"]` (a constant, not measured) | copied into `meta`, used nowhere |
| `clips` | the six names | clip list | `CLIPS` | no |
| `clipSeconds` | per clip | length in seconds, `frames / 60` rounded to 4 places | measure report `seconds` | no |

`player.js` fetches the file and copies each key of `FALLBACK` (`walkSpeed`, `runSpeed`,
`seatHeight`, `keyboardReach`) whose value is a positive finite number. If the fetch fails, it
keeps the `FALLBACK` values, which are the same numbers typed in by hand.

## 8. The web optimiser (optimise-character.mjs)

```
node optimise-character.mjs SRC.glb OUT.glb
```

`OUT.glb` must include a folder part, for example `./hacker.glb` or
`assets/models/character/hacker.glb`. The script makes the output folder by stripping the
last `/name` from the path. A bare file name has no `/`, so it creates a directory named
`OUT.glb` and then fails with `EISDIR` when it writes the file.

Steps, in order:

1. **Animation clean-up.** Every clip keeps the rotation channels plus the `Hips` translation.
   The other translation and scale channels are dropped after checking that every value equals
   the node's rest value within 1e-4. If one does not, the script throws
   `<clip> <bone>.<path> is not constant at the rest value; not dropping it`. `Point` keeps only
   the rotations of the seven `POINT_BONES`, and its other channels are dropped without that
   check. The last run dropped 235 channels. That leaves 20 channels (19 bones) in every clip
   except Point, which has 7 channels on 7 bones.
2. **Transforms.** `dedup`, `weld`, `resample`, `prune`. Then textures: `baseColor` becomes WebP
   at up to 2048 px, quality 84; `normal` and `metallicRoughness` become WebP at up to 1024 px,
   quality 86. Then `reorder` (meshopt) and `quantize` (position 14 bits, normal 10, texcoord
   12, weight 8).
3. **Compression.** `EXT_meshopt_compression`, required, with the `QUANTIZE` method.
4. **Write.** Creates the output folder if needed and writes `OUT.glb`. If `SRC.json` exists,
   it checks that every name in its `clips` is an animation in the GLB and writes `OUT.json`.
   If `SRC.json` is missing, no JSON is written.
5. **Report.** Prints the dropped channel count, one line per clip (seconds, bones, channels),
   the joint count, the texture sizes and formats, and the size change. The last run printed
   `4.99 MB -> 1.90 MB` and `joints: 19 | textures: 1024x1024 image/webp, 1024x1024
   image/webp, 2048x2048 image/webp`. gltf-transform also prints
   `quantize: Skipping TEXCOORD_0; out of [0,1] range.`

### Where its packages come from

The script imports `@gltf-transform/core`, `@gltf-transform/extensions`,
`@gltf-transform/functions`, `meshoptimizer` and `sharp` by bare name. Node looks for these in
`node_modules` folders beside the script and in its parent folders. There are none on the path
from `tools/character/`, so running the script in place fails:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@gltf-transform/core' imported from .../tools/character/optimise-character.mjs
```

Setting `NODE_PATH=data/tools/node_modules` gives the same error. The packages are installed
in `data/tools/node_modules` (gitignored), listed in `data/tools/package.json` and
`data/tools/package-lock.json`. The route that works is to copy the script into a folder with
a `node_modules` link to that installation. `data/tmp/anim/` is set up this way: it holds a
copy of the script and `node_modules -> <repo>/data/tools/node_modules`. This route was
checked on 15 September 2026 against the last rigged GLB, and its output was byte-identical to
the current `hacker.glb` and `hacker.json`.

Do not run `data/tools/optimise-character.mjs`. It sits beside that `node_modules`, so it
runs, but it is an older copy without the animation clean-up (step 1 above). Always copy the
script from `tools/character/`.

## 9. Rebuilding the character

Run every command from the repository root. Blender is only used in background mode. No
browser is involved, so these steps are allowed under `AGENTS.md` rule 8. The last run used
Blender 5.2.0 LTS and Node 26.7.0.

1. Create the working folders:

   ```bash
   mkdir -p data/raw-character data/tmp/char data/tmp/anim
   ```

2. If `data/raw-character/source/Hacker.glb` is missing, unpack the owner's zip:

   ```bash
   unzip -o "data/hacker-character(1).zip" -d data/raw-character
   ```

3. If the seat, desk or keyboard in `js/bench.js` changed, update `SEAT`, `DESK` and `KEYS` in
   `rig.py` now, before rigging. The seat and typing solves and the Sit and SitType checks use
   them.

4. Rig, animate, measure, export and render. Pass absolute paths, as the last run did:

   ```bash
   blender -b --python tools/character/rig.py -- \
     "$PWD/data/raw-character/source/Hacker.glb" \
     "$PWD/data/tmp/char/hacker-rigged.glb" \
     "$PWD/data/tmp/char/sheets" 32000 2>&1 | tee data/tmp/char/rig.log
   ```

   This writes `data/tmp/char/hacker-rigged.glb`, `hacker-rigged.json`,
   `hacker-rigged-measure.json` and `data/tmp/char/sheets/sheet-*.png` with their cells. To
   render only some sheets, put `SHEETS=Walk,Sit` in front of `blender`.

5. Confirm the measure passed:

   ```bash
   grep -E "^(FAIL|MEASURE)" data/tmp/char/rig.log
   ```

   The only output line must be `MEASURE OK []`. `rig.py` exports even when checks fail, so
   do not continue past `MEASURE FAILED`.

6. Look at the contact sheets in `data/tmp/char/sheets/` ([section 10](#10-checking-a-change-without-a-browser)).

7. Prepare the optimiser folder. If `data/tools/node_modules` is missing but
   `data/tools/package.json` exists, reinstall it first with `cd data/tools && npm ci && cd ../..`.
   If `data/tools/package.json` is missing too (a fresh clone has no `data/`), install the
   versions the last run used:

   ```bash
   mkdir -p data/tools && cd data/tools && npm init -y && npm install @gltf-transform/core@4.5.0 @gltf-transform/extensions@4.5.0 @gltf-transform/functions@4.5.0 meshoptimizer@1.2.0 sharp@0.35.4 && cd ../..
   ```

   Then link the packages and copy the script from `tools/character/` (never use the older
   `data/tools/optimise-character.mjs`):

   ```bash
   ln -sfn "$PWD/data/tools/node_modules" data/tmp/anim/node_modules
   cp tools/character/optimise-character.mjs data/tmp/anim/
   ```

8. Optimise into the site's assets:

   ```bash
   node data/tmp/anim/optimise-character.mjs data/tmp/char/hacker-rigged.glb assets/models/character/hacker.glb
   ```

   Check the printed clip lines (six clips, Point with 7 channels) and the size, about 1.9 MB.

9. If `walkSpeed`, `runSpeed` or `seatHeight` changed in `assets/models/character/hacker.json`,
   update `FALLBACK` in `js/player.js` to match.

10. Do not serve or open the site yourself. Give the owner the test commands from
   [Testing and release](testing-and-release.md) and ask them to look at the screenshots.

## 10. Checking a change without a browser

1. **Log summary.** The main numbers from the run:

   ```bash
   grep -E "^(decimated|sculpt ankles|leg [LR] turned|rest ankles|sit solve|typing wrist|clip |MEASURE)" data/tmp/char/rig.log
   ```

2. **Measure report.** The pass/fail state and the edge stretch per clip:

   ```bash
   node -e 'const r=require("./data/tmp/char/hacker-rigged-measure.json"); console.log(r.ok ? "OK" : "FAILED", r.fails); for (const [k,v] of Object.entries(r.clips)) console.log(k.padEnd(8), "edge", v.edge_growth_max_m, "over5cm", v.edges_over_5cm_max)'
   ```

   Compare the numbers in [section 6](#6-measured-checks) with the previous report before
   replacing the asset. Copy the old report aside first if you want a diff.

3. **Contact sheets.** Open `data/tmp/char/sheets/sheet-<clip in lower case>.png` (for
   example `sheet-sittype.png`; single frames are in `cells/`, named as in
   [4.8](#48-contact-sheets)) in an image viewer. Look
   for feet apart wider than the hips from the front, feet sinking or floating, the side of the
   jacket pulled by an arm, gloves in the keyboard or forearms through the desk. Point is shown
   layered over Idle.

4. **Web GLB contents.** Joint names and channels per clip, read from the GLB's JSON chunk with
   plain Node (no packages needed):

   ```bash
   node -e 'const b=require("fs").readFileSync(process.argv[1]); const j=JSON.parse(b.subarray(20,20+b.readUInt32LE(12))); console.log(j.skins[0].joints.map(i=>j.nodes[i].name).join(" ")); for (const a of j.animations) console.log(a.name, a.channels.length, "channels")' assets/models/character/hacker.glb
   ```

   Expected: the 19 joint names, then `Idle 20`, `Point 7`, `Run 20`, `Sit 20`, `SitType 20`,
   `Walk 20`.

## 11. How js/player.js uses the character

`createPlayer()` in `js/player.js` (called from `js/world.js`) does the following.

**Loading.**
- Loads the model with `loadGLTF` from `js/realism.js`, which sets the meshopt decoder.
- Every mesh casts and receives shadows, has `frustumCulled = false` (a skinned mesh keeps its
  rest-pose bounds, which a stride can step outside) and has `envMapIntensity` 0.9.
- One `AnimationMixer` drives the model. Every clip except `Point` becomes an action in
  `actions`.

**Bone names.** Blender names the bones `UpperArm.R` and so on. three.js 0.169.0's GLTFLoader
passes node names through `PropertyBinding.sanitizeNodeName`, which replaces whitespace with
`_` and removes the reserved characters `[ ] . : /`. At runtime the bone is `UpperArmR`, and
track names read `<bone>.quaternion`, for example `UpperArmR.quaternion`. `player.js` handles
both points:
- Track filters take the bone as `t.name.split(".")[0]`, and the arm filter is
  `/^(Shoulder|UpperArm|LowerArm|Hand)_?R$/`.
- The `find` helper looks a bone up as `UpperArmR`, then `UpperArm.R`, then `UpperArm_R`. It
  fills `bones.chest`, `bones.arm` (`UpperArm.R`) and `bones.hand` (`Hand.R`).

**Base clip.** `play(name, fade)` cross-fades to one base action at a time.

| Situation | Clip and rate |
| --- | --- |
| speed < 0.25 m/s | `Idle` |
| speed below (`WALK` + `RUN`) / 2 = 3.05 m/s | `Walk`, timeScale `speed / meta.walkSpeed` clamped to 0.35–2.2, so the planted foot does not skate |
| faster | `Run`, timeScale `speed / meta.runSpeed` clamped to 0.5–2 |
| stepping in to sit (`beginSit`) | `Walk`, at a rate from the step length over 70 % of `SIT_TIME` (1.35 s), clamped to 0.3–1 |
| sitting down | `Sit`, cross-faded in once 40 % of `SIT_TIME` has passed. `world.js` calls `setTyping` with `player.state === "seated" && typingNow()`, so typing is off until the player is seated. |
| seated | `SitType` when typing is on and the clip exists, otherwise `Sit`. `typingNow` in `world.js` is true while the console input has focus (`hud.typing`), for 1.6 s after the last order to the arm (`commandAt`, set by a console line or a tap on the desk), and until 15 s after that order while `bench.busy()` is true (if `bench.busy` is missing, while the mode text is not `AT REST`). |
| standing up (`beginStand`) | `Walk` at timeScale −0.5 (a step back), then `Idle` |

**Seat height.** Seated, the root is placed at `seatFloor()`, which is the floor plus
`(seat.height ?? meta.seatHeight) − meta.seatHeight`. The clips are posed on a 0.46 m seat,
and `js/bench.js` gives the seat `height` from `(SEAT.top − FLOOR) × ROOT_SCALE`, also
0.46 m. The offset is therefore 0 today. See [Workbench](workbench.md) for the chair and the
`seat` and `approach` spots.

**Point layering.** `Point` is split into three actions:

| Action | Tracks | Blend | Weight |
| --- | --- | --- | --- |
| `PointArm` | right `Shoulder`, `UpperArm`, `LowerArm`, `Hand` | normal, over the base clip | `POINT_WEIGHT` (9) × `aim.w`. Against the base at 1, the arm gets nine tenths (comment on `POINT_WEIGHT`). |
| `PointChest` | `Chest` | additive: `AnimationUtils.makeClipAdditive(part, 0, idle)`, the difference from Idle's first frame | `aim.w × aim.free` |
| `PointLook` | `Neck`, `Head` | additive, as above | `aim.w` |

The additive layers keep a seated hunch a hunch. Their weights stay at or below 1, because
three.js extrapolates an additive rotation above that.

`point(target)` works as follows:
1. Standing, the body first turns to face the target (`turnTo`). A point that arrives during
   `approach`, `sitting-down` or `standing-up` is dropped.
2. The weight `aim.w` eases in over `POINT_IN` (0.3 s), holds until `POINT_HOLD` (2.4 s) and
   eases out over `POINT_OUT` (0.45 s). Walking faster than 0.6 m/s, or standing up, skips to
   the ease-out.
3. After `mixer.update`, `aimBones` turns the chest by half the heading error to the target,
   limited to 0.3 rad while walking and 0.55 rad otherwise. It then swings the upper arm so the
   shoulder-to-hand line runs through the target, by at most 1.1 rad when the arm layer exists.
4. `aim.free` eases to 0 while the base clip is `SitType`, so the chest does not turn and the
   left glove stays on the keys.
5. The mixer only writes a bone whose animated value changed. Before each update the chest and
   upper-arm quaternions are restored to their pre-aim values.

## 12. Known limitations

- **A failed measure does not stop the export.** `fail()` only records the reason. `rig.py`
  still writes the JSON files, exports the GLB and renders the sheets, and has no non-zero
  exit. Always read the `MEASURE` line (step 5 of [section 9](#9-rebuilding-the-character)).
- **Keyboard clearance is measured from the case, not the keycaps.** `KEYS["top"]` (0.764 m)
  is the top of the keyboard case in `js/bench.js`; the keycaps reach 0.770 m. `KEY_CLEAR`,
  the `vertices_in_keyboard_max` box and the 0.768 m glove threshold all use the case top, so
  a glove could dip into the keycaps without a failure. In the last run the lowest glove point
  (0.771 m) cleared the keycaps by about 1 mm.
- **Edge stretch is close to its limit.** The largest remaining stretches are 7.54 cm in
  SitType (45 edges over 5 cm), 7.34 cm in Run and 7.02 cm in Point over Idle, against the
  8 cm `EDGE_FAIL`. The rig is linear blend skinning with 19 bones.
- **No finger bones.** Point holds an open hand edge on instead of an extended finger (comment
  in `point_poses`).
- **The Point preview is not the site's blend.** `PointPreview` and Point's edge-stretch check
  replace Chest, Neck and Head over Idle. The site instead adds the difference from Idle's
  first frame, weights the arm 9 to 1, and applies the `aimBones` turn afterwards. The sheet
  shows the pose, not the exact runtime result.
- **Hand-copied numbers.** `SEAT`, `DESK` and `KEYS` in `rig.py` copy `js/bench.js`, and
  `FALLBACK` in `js/player.js` copies `hacker.json`. Nothing checks that they still match.
- **The optimiser cannot run in place.** It depends on the gitignored
  `data/tools/node_modules` and a copy of the script beside a `node_modules` link. An older
  copy without the animation clean-up sits in `data/tools/`; do not use it.
- **The optimiser needs a folder in `OUT`.** A bare output file name (`out.glb`) makes a
  directory of that name and then fails with `EISDIR`. Pass `./out.glb` or a full path.
- **UVs stay unquantised.** `quantize` skips `TEXCOORD_0` because the sculpt's UVs fall outside
  [0, 1], so texture coordinates stay 32-bit floats in the web GLB.
- **Unused metadata.** `height`, `clips`, `clipSeconds` and `keyboardReach` are not used at
  runtime. `player.js` copies `keyboardReach` into `meta`, and nothing reads it there.
- **Point's dropped channels are not checked.** For `Point` the optimiser drops non-arm
  channels without the rest-value check the other clips get.
- **Log noise.** The 15 September 2026 log shows Blender add-on registration tracebacks
  (`No module named 'cattrs'`) and `MeshOptimizer is not available` from the glTF exporter.
  Neither stopped the run, and the exporter's meshopt is not used; the Node optimiser applies
  meshopt instead.
